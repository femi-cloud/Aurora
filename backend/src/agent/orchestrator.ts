import { getCurrentSnapshot, getAnomaliesRelative } from "../clickhouse/queries.js";
import { generateDecision, type TitleSignal } from "./decisionEngine.js";
import { broadcastDecision, onClientAction } from "../ws/server.js";
import type { AgentDecision } from "../../../packages/shared/src/types.js";

// Dans ta fourchette 30-60s — 45s par défaut, ajustable sans recompiler.
const CYCLE_INTERVAL_MS = Number(process.env.ORCHESTRATOR_INTERVAL_MS ?? 45000);

// URL du ml-service Python (FastAPI/uvicorn). À ajouter dans .env.example —
// port par défaut d'uvicorn, à corriger si vous le lancez sur un autre port.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

// Sous ce seuil, on ne dérange pas Gemini : sans filtre, chaque couple
// titre/région produirait un "monitor" à chaque cycle.
const ANOMALY_SCORE_THRESHOLD = Number(process.env.ANOMALY_SCORE_THRESHOLD ?? 1.0);

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

// Couples (titleId:region) avec une décision Gemini en cours — évite qu'un
// appel lent soit redéclenché par le cycle suivant.
const inFlight = new Set<string>();

// Décisions générées, gardées en mémoire pour pouvoir matcher un accept/reject
// du frontend et rediffuser le nouveau statut.
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
    console.error("[orchestrator] ml-service /anomalies indisponible:", err);
    return []; // dégrade gracieusement, le cycle continue avec le reste des signaux
  }
}

async function fetchDropoffPrediction(
  titleId: string,
  region: string
): Promise<number | undefined> {
  try {
    // "device" est requis par le modèle mais on n'a pas cette dimension au
    // niveau title+region. On passe "unknown" : le one-hot du modèle ne
    // reconnaît pas cette catégorie et l'ignore, la prédiction se base donc
    // sur title_id/region seuls — moins précis qu'avec le vrai device, mais
    // suffisant pour prioriser.
    const params = new URLSearchParams({ title_id: titleId, region, device: "unknown" });
    const res = await fetch(`${ML_SERVICE_URL}/predict/dropoff?${params}`);
    if (!res.ok) throw new Error(`ml-service /predict/dropoff ${res.status}`);
    const data = (await res.json()) as MlDropoffPrediction;
    return data.drop_off_probability;
  } catch (err) {
    console.error(`[orchestrator] prédiction dropoff indisponible pour ${titleId}/${region}:`, err);
    return undefined;
  }
}

async function buildSignals(): Promise<TitleSignal[]> {
  const [snapshot, relativeAnomalies, ifAnomalies] = await Promise.all([
    getCurrentSnapshot(10),
    getAnomaliesRelative(),
    fetchMlAnomalies(),
  ]);

  const relativeFlagged = new Set(
    (relativeAnomalies as any[]).map((r) => keyFor(r.title_id, r.region))
  );
  const ifFlagged = new Set(ifAnomalies.map((r) => keyFor(r.title_id, r.region)));

  const signals: TitleSignal[] = [];

  for (const row of snapshot as any[]) {
    const { title_id, region, viewer_count, drop_off_count, avg_seconds_watched } = row;
    if (!viewer_count) continue; // pas de vues = rien à évaluer

    const k = keyFor(title_id, region);
    // Score composite : 0.5 par détecteur qui flag ce couple titre/région.
    // 1.0 si les deux sont d'accord, 0 si aucun.
    let anomalyScore = 0;
    if (relativeFlagged.has(k)) anomalyScore += 0.5;
    if (ifFlagged.has(k)) anomalyScore += 0.5;

    signals.push({
      titleId: title_id,
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
    console.error("[orchestrator] échec de construction des signaux, cycle sauté:", err);
    return;
  }

  for (const signal of signals) {
    const k = keyFor(signal.titleId, signal.region);
    if (inFlight.has(k)) continue; // décision déjà en cours pour ce couple

    if ((signal.anomalyScore ?? 0) < ANOMALY_SCORE_THRESHOLD) continue;

    inFlight.add(k);
    (async () => {
      try {
        signal.dropOffPrediction = await fetchDropoffPrediction(signal.titleId, signal.region);
        const decision = await generateDecision(signal);
        decisions.set(decision.id, decision);
        broadcastDecision(decision);
      } catch (err) {
        console.error(`[orchestrator] échec de génération de décision pour ${k}:`, err);
      } finally {
        inFlight.delete(k);
      }
    })();
  }
}

/**
 * Démarre la boucle d'orchestration et branche accept/reject du frontend
 * sur le store de décisions en mémoire. À appeler une fois depuis index.ts,
 * après attachWebSocketServer().
 */
export function startOrchestrator(): void {
  onClientAction(({ decisionId, action }) => {
    const decision = decisions.get(decisionId);
    if (!decision) {
      console.warn(`[orchestrator] action reçue pour une décision inconnue: ${decisionId}`);
      return;
    }
    decision.status = action === "accept" ? "accepted" : "rejected";
    broadcastDecision(decision); // rediffuse le nouveau statut à tous les clients
  });

  console.log(`[orchestrator] démarré — cycle toutes les ${CYCLE_INTERVAL_MS}ms`);
  runCycle(); // premier cycle immédiat, pas d'attente du premier interval
  setInterval(runCycle, CYCLE_INTERVAL_MS);
}