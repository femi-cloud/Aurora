import { clickhouse } from "./client.js";
import { runSelectQuery, toSafeInt, toSafeString } from "./mcpClient.js";
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
    console.log("[decisions] persisting:", JSON.stringify({ id: decision.id, region: decision.region }));
    await clickhouse.insert({
      table: "agent_decisions",
      values: [
        {
          id: decision.id,
          created_at: toClickHouseDateTime(decision.createdAt),
          updated_at: toClickHouseDateTime(decision.updatedAt ?? new Date().toISOString()),
          title_id: decision.titleId,
          region: decision.region,
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
    console.error(`[decisions] failed to persist snapshot for ${decision.id}:`, err);
  }
}

/**
 * Loads the latest snapshot per decision id — used once at backend
 * startup to reseed the in-memory Map after a restart.
 */
function mapRow(row: any): AgentDecision {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    titleId: row.title_id,
    region: row.region,
    type: row.type,
    summary: row.summary,
    reasoning: row.reasoning,
    reasoningTrail: JSON.parse(row.reasoning_trail || "[]"),
    status: row.status,
  };
}

export async function loadLatestDecisions(): Promise<AgentDecision[]> {
  try {
    const query = `
      SELECT id, created_at, title_id, region, type, summary, reasoning, reasoning_trail, status
      FROM aurora.agent_decisions
      ORDER BY updated_at DESC
      LIMIT 1 BY id
    `;
    const rows = await runSelectQuery(query);
    return rows.map(mapRow);
  } catch (err) {
    console.error("[decisions] failed to load decisions from ClickHouse:", err);
    return [];
  }
}

export interface DecisionHistoryFilters {
  status?: AgentDecision["status"];
  titleId?: string;
  type?: AgentDecision["type"];
  limit: number;
  offset: number;
}

export interface DecisionHistoryResult {
  decisions: AgentDecision[];
  total: number;
}

/**
 * Paginated, filterable read of decision history — one row per decision
 * (its latest status), most recent first. Used by the "Decision History"
 * dashboard view, distinct from loadLatestDecisions (full dump, boot-only).
 */
export async function getDecisionHistory(
  filters: DecisionHistoryFilters
): Promise<DecisionHistoryResult> {
  const { status, titleId, type, limit, offset } = filters;

  const whereClauses: string[] = [];
  if (status) whereClauses.push(`status = '${toSafeString(status)}'`);
  if (titleId) whereClauses.push(`title_id = '${toSafeString(titleId)}'`);
  if (type) whereClauses.push(`type = '${toSafeString(type)}'`);
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const lim = toSafeInt(limit);
  const off = toSafeInt(offset);

  const latestPerId = `
    SELECT id, created_at, updated_at, title_id, region, type, summary, reasoning, reasoning_trail, status
    FROM aurora.agent_decisions
    ORDER BY updated_at DESC
    LIMIT 1 BY id
  `;

  try {
    const [rows, countRows] = await Promise.all([
      runSelectQuery(`
        SELECT * FROM (${latestPerId})
        ${whereSql}
        ORDER BY updated_at DESC
        LIMIT ${lim} OFFSET ${off}
      `),
      runSelectQuery(`SELECT count() AS total FROM (${latestPerId}) ${whereSql}`),
    ]);

    return {
      decisions: rows.map(mapRow),
      total: Number(countRows[0]?.total ?? 0),
    };
  } catch (err) {
    console.error("[decisions] failed to load decision history from ClickHouse:", err);
    return { decisions: [], total: 0 };
  }
}