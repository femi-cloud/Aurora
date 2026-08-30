import { clickhouse } from "./client.js";
import { runSelectQuery } from "./mcpClient.js";

function toClickHouseDateTime(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "");
}

/**
 * Inserts an "opened" row for this title/region pair. Called when the
 * orchestrator detects an anomaly and triggers generateDecision().
 * ClickHouse is append-only — closing later means inserting a new row
 * with status "closed" for the same id (see closeAnomalyEvent).
 */
export async function openAnomalyEvent(id: string, titleId: string, region: string): Promise<void> {
  try {
    const now = toClickHouseDateTime(new Date().toISOString());
    await clickhouse.insert({
      table: "anomaly_events",
      values: [
        {
          id,
          title_id: titleId,
          region,
          decision_id: null,
          status: "opened",
          opened_at: now,
          closed_at: null,
          updated_at: now,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    // Non-fatal: same safety-net logic as persistDecisionSnapshot —
    // the orchestrator's in-flight Set is still the runtime source of truth.
    console.error(`[anomalyEvents] failed to persist "opened" for ${id}:`, err);
  }
}

/**
 * Inserts a "closed" row for this title/region pair, once the associated
 * decision has been accepted/rejected by a human.
 */
export async function closeAnomalyEvent(id: string, titleId: string, region: string, decisionId: string): Promise<void> {
  try {
    const now = toClickHouseDateTime(new Date().toISOString());
    await clickhouse.insert({
      table: "anomaly_events",
      values: [
        {
          id,
          title_id: titleId,
          region,
          decision_id: decisionId,
          status: "closed",
          opened_at: "1970-01-01 00:00:00", // ignored by argMin(opened_at, updated_at) at read time — the real value comes from the "opened" row
          closed_at: now,
          updated_at: now,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    console.error(`[anomalyEvents] failed to persist "closed" for ${id}:`, err);
  }
}

export interface AnomalyLogRow {
  id: string;
  titleId: string;
  region: string;
  decisionId: string | null;
  status: "opened" | "closed";
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

/**
 * Returns the current state of every anomaly (one row per id), using
 * argMax on updated_at since ClickHouse is append-only and each
 * open/close is a new row rather than an UPDATE.
 */
export async function getAnomalyLog(): Promise<AnomalyLogRow[]> {
  const query = `
    SELECT
      id,
      argMax(title_id, updated_at) AS last_title_id,
      argMax(region, updated_at) AS last_region,
      argMax(decision_id, updated_at) AS last_decision_id,
      argMax(status, updated_at) AS last_status,
      argMin(opened_at, updated_at) AS first_opened_at,
      argMax(closed_at, updated_at) AS last_closed_at,
      max(updated_at) AS last_updated_at
    FROM aurora.anomaly_events
    GROUP BY id
    ORDER BY last_updated_at DESC
  `;
  const rows = await runSelectQuery(query);
  return rows.map((row) => ({
    id: row.id,
    titleId: row.last_title_id,
    region: row.last_region,
    decisionId: row.last_decision_id,
    status: row.last_status,
    openedAt: row.first_opened_at,
    closedAt: row.last_closed_at,
    updatedAt: row.last_updated_at,
  }));
}