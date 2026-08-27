import { getCurrentSnapshot, getAnomaliesRelative } from "../clickhouse/queries.js";
import { generateDecision, type TitleSignal } from "./decisionEngine.js";
import { broadcastDecision, onClientAction } from "../ws/server.js";
import { persistDecisionSnapshot, loadLatestDecisions } from "../clickhouse/decisions.js";
import type { AgentDecision } from "../../../packages/shared/src/types.js";
import { loadSettings, persistSettings, type AgentSettings } from "../clickhouse/settings.js";

// Within the 30-60s range — 45s default, adjustable without recompiling.
const CYCLE_INTERVAL_MS = Number(process.env.ORCHESTRATOR_INTERVAL_MS ?? 45000);

// Python ml-service URL (FastAPI/uvicorn). Add to .env.example —
// uvicorn's default port, adjust if you run it on a different one.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

let currentSettings: AgentSettings = {
  anomalyScoreThreshold: 1.0,
  deviationThreshold: 0.25,
  baselineWindowMinutes: 30,
  recentWindowMinutes: 3,
  minViewers: 2,
};

interface MlAnomalyRow {
  minute: string;
  title_id: string;
  region: string;
  viewers: number;
  dropoffs: number;
  avg_watched: number;
}

interface MlDropoffPrediction {
  title_id: string;
  region: string;
  device: string;
  drop_off_probability: number;
}

// (titleId:region) pairs with a Gemini decision currently in flight — prevents
// a slow call from being re-triggered by the next cycle.
const inFlight = new Set<string>();

// Generated decisions, kept in memory so we can match an accept/reject
// from the frontend and rebroadcast the updated status.
const decisions = new Map<string, AgentDecision>();

function keyFor(titleId: string, region: string): string {
  return `${titleId}:${region}`;
}

async function fetchMlAnomalies(): Promise<MlAnomalyRow[]> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/anomalies?window_minutes=10`);
    if (!res.ok) throw new Error(`ml-service /anomalies ${res.status}`);
    return (await res.json()) as MlAnomalyRow[];
  } catch (err) {
    console.error("[orchestrator] ml-service /anomalies unavailable:", err);
    return []; // degrades gracefully, the cycle continues with the remaining signals
  }
}

async function fetchDropoffPrediction(
  titleId: string,
  region: string
): Promise<number | undefined> {
  try {
    // "device" is required by the model but we don't have that dimension at
    // the title+region level. We pass "unknown": the model's one-hot doesn't
    // recognize this category and ignores it, so the prediction is based on
    // title_id/region alone — less precise than with the real device, but
    // good enough to prioritize.
    const params = new URLSearchParams({ title_id: titleId, region, device: "unknown" });
    const res = await fetch(`${ML_SERVICE_URL}/predict/dropoff?${params}`);
    if (!res.ok) throw new Error(`ml-service /predict/dropoff ${res.status}`);
    const data = (await res.json()) as MlDropoffPrediction;
    return data.drop_off_probability;
  } catch (err) {
    console.error(`[orchestrator] dropoff prediction unavailable for ${titleId}/${region}:`, err);
    return undefined;
  }
}

async function buildSignals(): Promise<TitleSignal[]> {
  const [snapshot, relativeAnomalies, ifAnomalies] = await Promise.all([
    getCurrentSnapshot(10),
    getAnomaliesRelative(
      currentSettings.deviationThreshold,
      currentSettings.baselineWindowMinutes,
      currentSettings.recentWindowMinutes,
      currentSettings.minViewers
    ),
    fetchMlAnomalies(),
  ]);

  const relativeFlagged = new Set(
    (relativeAnomalies as any[]).map((r) => keyFor(r.title_id, r.region))
  );
  const ifFlagged = new Set(ifAnomalies.map((r) => keyFor(r.title_id, r.region)));

  const signals: TitleSignal[] = [];

  for (const row of snapshot as any[]) {
    const { title_id, title_name, region, viewer_count, drop_off_count, avg_seconds_watched } = row;
    if (!viewer_count) continue;

    const k = keyFor(title_id, region);
    let anomalyScore = 0;
    if (relativeFlagged.has(k)) anomalyScore += 0.5;
    if (ifFlagged.has(k)) anomalyScore += 0.5;

    signals.push({
      titleId: title_id,
      titleName: title_name,
      region,
      totalViews: viewer_count,
      avgSecondsWatched: avg_seconds_watched,
      dropOffRate: drop_off_count / viewer_count,
      anomalyScore,
    });
  }

  return signals;
}

async function runCycle(): Promise<void> {
  let signals: TitleSignal[];
  try {
    signals = await buildSignals();
  } catch (err) {
    console.error("[orchestrator] failed to build signals, skipping cycle:", err);
    return;
  }
  const eligible = signals.filter((s) => (s.anomalyScore ?? 0) >= currentSettings.anomalyScoreThreshold);
  console.log(`[orchestrator] cycle: ${signals.length} signals, ${eligible.length} above threshold ${currentSettings.anomalyScoreThreshold}`);

  for (const signal of signals) {
    const k = keyFor(signal.titleId, signal.region);
    if (inFlight.has(k)) continue; // decision already in progress for this pair

    if ((signal.anomalyScore ?? 0) < currentSettings.anomalyScoreThreshold) continue;

    inFlight.add(k);
    console.log(`[orchestrator] anomaly score ${signal.anomalyScore} for ${k} — generating decision...`);
    (async () => {
      try {
        signal.dropOffPrediction = await fetchDropoffPrediction(signal.titleId, signal.region);
        const decision = await generateDecision(signal);
        decisions.set(decision.id, decision);
        broadcastDecision(decision);
        persistDecisionSnapshot(decision); // fire-and-forget, non-blocking
        console.log(`[orchestrator] decision ${decision.id} created for ${k}: ${decision.type}`);
      } catch (err) {
        console.error(`[orchestrator] failed to generate decision for ${k}:`, err);
      } finally {
        inFlight.delete(k);
      }
    })();
  }
}

/**
 * Starts the orchestration loop and wires the frontend's accept/reject
 * to the in-memory decision store. Call once from index.ts, after
 * attachWebSocketServer().
 */
export async function startOrchestrator(): Promise<void> {
  currentSettings = await loadSettings();
  console.log("[orchestrator] settings loaded:", currentSettings);

  onClientAction(({ decisionId, action }) => {
    const decision = decisions.get(decisionId);
    if (!decision) {
      console.warn(`[orchestrator] action received for unknown decision: ${decisionId}`);
      return;
    }
    decision.status = action === "accept" ? "accepted" : "rejected";
    decision.updatedAt = new Date().toISOString();
    broadcastDecision(decision); // rebroadcasts the new status to all clients
    persistDecisionSnapshot(decision); // fire-and-forget, non-blocking
  });

  loadLatestDecisions().then((rows) => {
    for (const d of rows) decisions.set(d.id, d);
    console.log(`[orchestrator] reseeded ${rows.length} decision(s) from ClickHouse`);
  });

  console.log(`[orchestrator] started — cycle every ${CYCLE_INTERVAL_MS}ms`);
  runCycle(); // immediate first cycle, no waiting for the first interval
  setInterval(runCycle, CYCLE_INTERVAL_MS);
}

/**
 * Returns all decisions currently held in memory, most recent first.
 * Used to seed the frontend's decision history on page load/refresh,
 * before the WebSocket starts delivering new ones.
 */
export function getDecisions(): AgentDecision[] {
  return Array.from(decisions.values()).reverse();
}

/**
 * Returns the settings currently in effect (in-memory, authoritative
 * for the running orchestrator).
 */
export function getSettings(): AgentSettings {
  return currentSettings;
}

/**
 * Updates the in-memory settings immediately (next cycle uses them) and
 * persists the change to ClickHouse (fire-and-forget, non-blocking) so
 * it survives a restart. Called from the Settings route handler.
 */
export function updateSettings(next: AgentSettings): void {
  currentSettings = next;
  persistSettings(next);
}