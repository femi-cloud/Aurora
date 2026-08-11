import { randomUUID } from "node:crypto";
import { askGeminiJSON } from "./gemini.js";
interface AgentDecision {
  id: string;
  createdAt: string;
  titleId: string;
  type: "prioritize_dubbing" | "recut_scene" | "boost_market" | "monitor";
  summary: string;
  reasoning: string;
  status: "pending" | "accepted" | "rejected";
}

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

function buildPrompt(signal: TitleSignal): string {
  return `You are a streaming platform production/distribution analyst agent.
Given the following audience signal for a title, decide on ONE action.

Title ID: ${signal.titleId}
Region: ${signal.region}
Total views: ${signal.totalViews}
Average seconds watched: ${signal.avgSecondsWatched}
Drop-off rate: ${signal.dropOffRate}
Anomaly score: ${signal.anomalyScore ?? "not available"}
Predicted future drop-off risk: ${signal.dropOffPrediction ?? "not available"}

Choose the most appropriate action type:
- "prioritize_dubbing": localization/dubbing gap is likely hurting retention in this region
- "recut_scene": a specific point in the content is likely causing drop-off
- "boost_market": performance is strong, recommend increasing marketing spend/visibility
- "monitor": signal is inconclusive or not strong enough to act on yet

Respond with a short summary (one sentence) and a reasoning (2-3 sentences)
explaining what in the data justifies this action.`;
}

/**
 * Generates an AgentDecision for a given title signal.
 */
export async function generateDecision(
  signal: TitleSignal
): Promise<AgentDecision> {
  const prompt = buildPrompt(signal);
  const output = await askGeminiJSON<GeminiDecisionOutput>(
    prompt,
    decisionSchema
  );

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    titleId: signal.titleId,
    type: output.type,
    summary: output.summary,
    reasoning: output.reasoning,
    status: "pending",
  };
}