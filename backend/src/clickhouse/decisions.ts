import { clickhouse } from "./client.js";
import type { AgentDecision } from "../../../packages/shared/src/types.js";

function toClickHouseDateTime(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "");
}

/**
 * Inserts one snapshot row for this decision's current state. Called on
 * creation and on every status change — ClickHouse is append-only, so
 * "updating" a decision means inserting a new row, and reads take the
 * most recent row per id (see loadLatestDecisions).
 */
export async function persistDecisionSnapshot(decision: AgentDecision): Promise<void> {
  try {
    await clickhouse.insert({
      table: "agent_decisions",
      values: [
        {
          id: decision.id,
          created_at: toClickHouseDateTime(decision.createdAt),
          updated_at: toClickHouseDateTime(new Date().toISOString()),
          title_id: decision.titleId,
          type: decision.type,
          summary: decision.summary,
          reasoning: decision.reasoning,
          reasoning_trail: JSON.stringify(decision.reasoningTrail ?? []),
          status: decision.status,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    // Non-fatal: persistence is a safety net, not the runtime source of
    // truth (the orchestrator's in-memory Map still is).
    console.error(`[decisions] failed to persist snapshot for ${decision.id}:`, err);
  }
}

/**
 * Loads the latest snapshot per decision id — used once at backend
 * startup to reseed the in-memory Map after a restart.
 */
export async function loadLatestDecisions(): Promise<AgentDecision[]> {
  try {
    const resultSet = await clickhouse.query({
      query: `
        SELECT id, created_at, title_id, type, summary, reasoning, reasoning_trail, status
        FROM aurora.agent_decisions
        ORDER BY updated_at DESC
        LIMIT 1 BY id
      `,
      format: "JSONEachRow",
    });
    const rows = (await resultSet.json()) as any[];
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      titleId: row.title_id,
      type: row.type,
      summary: row.summary,
      reasoning: row.reasoning,
      reasoningTrail: JSON.parse(row.reasoning_trail || "[]"),
      status: row.status,
    }));
  } catch (err) {
    console.error("[decisions] failed to load decisions from ClickHouse:", err);
    return []; // degrades gracefully — the Map just starts empty, same as today
  }
}