import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY missing in .env");
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

type Provider = "gemini" | "groq";
type Priority = "interactive" | "background";
interface ChainEntry {
  provider: Provider;
  model: string;
}

// Gemini models first (primary + fallbacks), then Groq as a last resort.
// Free-tier quotas are per-model on Gemini and Groq is a separate provider
// entirely, so this chain survives a full Gemini quota exhaustion.
// Check current model names/quotas before setting these — they change over time:
// https://ai.google.dev/gemini-api/docs/rate-limits
// https://console.groq.com/docs/models
const geminiModels = [
  process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  ...(process.env.GEMINI_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
];


const modelChain: ChainEntry[] = [
  ...geminiModels.map((model): ChainEntry => ({ 
    provider: "gemini",
    model })),
];

// Each model/provider pair is throttled independently — otherwise a
// fallback attempt for one model gets stuck behind unrelated queued
// calls for another and effectively never runs.
const MIN_CALL_INTERVAL_MS = 13000;
const lastCallAtByKey = new Map<string, number>();
const queueByKey = new Map<string, Promise<unknown>>();

function keyFor(entry: ChainEntry, priority: Priority): string {
  return `${priority}:${entry.provider}:${entry.model}`;
}

function throttledFor(entry: ChainEntry, priority: Priority): Promise<void> {
  const key = keyFor(entry, priority);
  const previous = queueByKey.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    const lastCallAt = lastCallAtByKey.get(key) ?? 0;
    const wait = Math.max(0, MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAtByKey.set(key, Date.now());
  });
  queueByKey.set(key, run);
  return run;
}

function isQuotaError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429;
}

/**
 * Runs a call across the provider/model fallback chain: tries each entry
 * in modelChain in order, moving on when the current one returns 429
 * (quota exhausted). Throws the last error if the whole chain is exhausted.
 */
async function withFallback<T>(
  callEntry: (entry: ChainEntry) => Promise<T>,
  priority: Priority = "background"
): Promise<T> {
  let lastError: unknown;
  for (const entry of modelChain) {
    await throttledFor(entry, priority);
    try {
      return await callEntry(entry);
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) throw err; // non-quota error: don't burn through the chain for nothing
      console.warn(`[gemini] ${keyFor(entry, priority)} quota exhausted, trying next in chain`);
    }
  }
  throw lastError;
}

/**
 * Simple call: sends a text prompt, returns the text response.
 * Used as a connectivity test before wiring decisionEngine.ts to it.
 */
export async function askGemini(prompt: string, priority: Priority = "background"): Promise<string> {
  return withFallback(async (entry) => {
    const response = await ai.models.generateContent({ model: entry.model, contents: prompt });
    return response.text ?? "";
  }, priority);
}
/**
 * Call the model with a forced JSON output matching a schema.
 * Used by decisionEngine.ts to get reliable AgentDecision objects.
 */
export async function askGeminiJSON<T>(prompt: string, responseSchema: object, priority: Priority = "background"): Promise<T> {
  const text = await withFallback(async (entry) => {
    const response = await ai.models.generateContent({
      model: entry.model,
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema },
    });
    return response.text ?? "{}";
  }, priority);

  return JSON.parse(text) as T;
}