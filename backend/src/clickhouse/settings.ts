import { clickhouse } from "./client.js";
import { runSelectQuery, toSafeString } from "./mcpClient.js";

const SETTINGS_ID = "default";

function toClickHouseDateTime(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "");
}

export interface AgentSettings {
  anomalyScoreThreshold: number;
  deviationThreshold: number;
  baselineWindowMinutes: number;
  recentWindowMinutes: number;
  minViewers: number;
}

// Used only if the table is empty (first run, before any settings were saved).
// Mirrors the defaults currently hardcoded in orchestrator.ts / queries.ts.
export const DEFAULT_SETTINGS: AgentSettings = {
  anomalyScoreThreshold: 0.5,
  deviationThreshold: 0.25,
  baselineWindowMinutes: 30,
  recentWindowMinutes: 3,
  minViewers: 2,
};

function mapRow(row: any): AgentSettings {
  return {
    anomalyScoreThreshold: Number(row.anomaly_score_threshold),
    deviationThreshold: Number(row.deviation_threshold),
    baselineWindowMinutes: Number(row.baseline_window_minutes),
    recentWindowMinutes: Number(row.recent_window_minutes),
    minViewers: Number(row.min_viewers),
  };
}

/**
 * Inserts a new settings snapshot. ClickHouse is append-only here too —
 * "updating" settings means inserting a new row; reads take the most
 * recent one (see loadSettings). Same pattern as persistDecisionSnapshot.
 */
export async function persistSettings(settings: AgentSettings): Promise<void> {
  try {
    await clickhouse.insert({
      table: "agent_settings",
      values: [
        {
          id: SETTINGS_ID,
          anomaly_score_threshold: settings.anomalyScoreThreshold,
          deviation_threshold: settings.deviationThreshold,
          baseline_window_minutes: settings.baselineWindowMinutes,
          recent_window_minutes: settings.recentWindowMinutes,
          min_viewers: settings.minViewers,
          updated_at: toClickHouseDateTime(new Date().toISOString()),
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    // Non-fatal: persistence is a safety net, not the runtime source of
    // truth (the orchestrator's in-memory settings variable still is).
    console.error("[settings] failed to persist snapshot:", err);
  }
}

/**
 * Loads the most recent settings row from ClickHouse — used once at
 * backend startup to seed the in-memory settings after a restart.
 * Falls back to DEFAULT_SETTINGS if the table is empty or unreachable.
 */
export async function loadSettings(): Promise<AgentSettings> {
  try {
    const query = `
      SELECT id, anomaly_score_threshold, deviation_threshold,
             baseline_window_minutes, recent_window_minutes, min_viewers
      FROM aurora.agent_settings
      WHERE id = '${toSafeString(SETTINGS_ID)}'
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const rows = await runSelectQuery(query);
    if (rows.length === 0) {
      console.log("[settings] no settings row found, using defaults");
      return DEFAULT_SETTINGS;
    }
    return mapRow(rows[0]);
  } catch (err) {
    console.error("[settings] failed to load from ClickHouse, using defaults:", err);
    return DEFAULT_SETTINGS;
  }
}