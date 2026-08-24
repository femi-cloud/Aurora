import { randomUUID } from "node:crypto";
import { askGeminiJSON } from "./gemini.js";
import { runNaturalQuery } from "./sqlAgent.js";
import type { AgentDecision, DecisionStep } from "../../../packages/shared/src/types";

/**
 * Aggregated signal for a single title, produced by the ML service
 * (anomaly detection + drop-off prediction). This is the input to the
 * decision engine — Gemini reasons over this, it doesn't see raw events.
 */
export interface TitleSignal {
  titleId: string;
  region: string;
  totalViews: number;
  avgSecondsWatched: number;
  dropOffRate: number; // 0-1
  anomalyScore?: number; // 0-1, higher = more anomalous. Optional until ml-service is wired in.
  dropOffPrediction?: number; // 0-1, predicted future drop-off risk. Optional until ml-service is wired in.
}

// Shape Gemini must return. Matches AgentDecision minus the fields we set ourselves
// (id, createdAt, status).
const decisionSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["prioritize_dubbing", "recut_scene", "boost_market", "monitor"],
    },
    summary: { type: "string" },
    reasoning: { type: "string" },
  },
  required: ["type", "summary", "reasoning"],
};

interface GeminiDecisionOutput {
  type: AgentDecision["type"];
  summary: string;
  reasoning: string;
}

function buildPrompt(signal: TitleSignal, regionalContext: string): string {
  return `You are a streaming platform production/distribution analyst agent.
Given the following audience signal for a title, decide on ONE action.

Title ID: ${signal.titleId}
Region: ${signal.region}
Total views: ${signal.totalViews}
Average seconds watched: ${signal.avgSecondsWatched}
Drop-off rate: ${signal.dropOffRate}
Anomaly score: ${signal.anomalyScore ?? "not available"}
Predicted future drop-off risk: ${signal.dropOffPrediction ?? "not available"}
Regional/historical context: ${regionalContext}

Choose the most appropriate action type:
- "prioritize_dubbing": localization/dubbing gap is likely hurting retention in this region
- "recut_scene": a specific point in the content is likely causing drop-off
- "boost_market": performance is strong, recommend increasing marketing spend/visibility
- "monitor": signal is inconclusive or not strong enough to act on yet

Respond with a short summary (one sentence) and a reasoning (2-3 sentences)
that explicitly references the anomaly score, the regional context, and the
drop-off prediction above.`;
}

/**
 * Generates an AgentDecision for a given title signal.
 */
export async function generateDecision(
  signal: TitleSignal
): Promise<AgentDecision> {
  const trail: DecisionStep[] = [];

  trail.push({
    id: randomUUID(),
    label: "Anomaly Detected",
    detail: `Anomaly score ${signal.anomalyScore ?? 0} for ${signal.titleId} in ${signal.region} — ${signal.totalViews} views, ${(signal.dropOffRate * 100).toFixed(1)}% drop-off rate.`,
  });

  const contextQuestion = `How does ${signal.titleId}'s viewer count and drop-off rate in ${signal.region} over the last 60 minutes compare to its average over the last 24 hours, and to other regions for the same title?`;
  let regionalContext = "Regional context unavailable.";
  try {
    const context = await runNaturalQuery(contextQuestion);
    regionalContext = context.answer;
  } catch (err) {
    console.error(
      `[decisionEngine] context query failed for ${signal.titleId}/${signal.region}:`,
      err
    );
  }
  trail.push({
    id: randomUUID(),
    label: "Regional Context",
    detail: regionalContext,
  });

  trail.push({
    id: randomUUID(),
    label: "Drop-off Prediction",
    detail:
      signal.dropOffPrediction !== undefined
        ? `ML model predicts a ${(signal.dropOffPrediction * 100).toFixed(1)}% future drop-off risk.`
        : "Drop-off prediction unavailable.",
  });

  const prompt = buildPrompt(signal, regionalContext);
  const output = await askGeminiJSON<GeminiDecisionOutput>(
    prompt,
    decisionSchema
  );

  trail.push({
    id: randomUUID(),
    label: "Decision",
    detail: output.reasoning,
  });

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    titleId: signal.titleId,
    type: output.type,
    summary: output.summary,
    reasoning: output.reasoning,
    reasoningTrail: trail,
    status: "pending",
  };
}