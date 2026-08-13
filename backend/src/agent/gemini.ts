import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY missing in .env");
}

const primaryModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS ?? "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const modelChain = [primaryModel, ...fallbackModels];

const ai = new GoogleGenAI({ apiKey });

const MIN_CALL_INTERVAL_MS = 13000;
const lastCallAtByModel = new Map<string, number>();
// One queue PER model, not a single global one — otherwise a fallback
// attempt for model B gets stuck behind unrelated calls still queued
// against model A, and effectively never runs.
const queueByModel = new Map<string, Promise<unknown>>();

function throttledFor(model: string): Promise<void> {
  const previous = queueByModel.get(model) ?? Promise.resolve();
  const run = previous.then(async () => {
    const lastCallAt = lastCallAtByModel.get(model) ?? 0;
    const wait = Math.max(0, MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAtByModel.set(model, Date.now());
  });
  queueByModel.set(model, run);
  return run;
}

function is429(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429;
}

/**
 * Runs a Gemini call across the model fallback chain: tries the primary
 * model first, and on a 429 (quota exhausted) moves to the next model in
 * modelChain. Throws the last error if every model in the chain is exhausted.
 */
async function withFallback<T>(callModel: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const model of modelChain) {
    await throttledFor(model);
    try {
      return await callModel(model);
    } catch (err) {
      lastError = err;
      if (!is429(err)) throw err; // non-quota error: don't burn through the chain for nothing
      console.warn(`[gemini] ${model} quota exhausted, trying next model in chain`);
    }
  }
  throw lastError;
}

/**
 * Simple call: sends a text prompt, returns the text response.
 * Used as a connectivity test before wiring decisionEngine.ts to it.
 */
export async function askGemini(prompt: string): Promise<string> {
  const response = await withFallback((model) =>
    ai.models.generateContent({ model, contents: prompt })
  );

  return response.text ?? "";
}

/**
 * Call Gemini with a forced JSON output matching a schema.
 * Used by decisionEngine.ts to get reliable AgentDecision objects.
 */
export async function askGeminiJSON<T>(
  prompt: string,
  responseSchema: object
): Promise<T> {
  const response = await withFallback((model) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    })
  );

  const text = response.text ?? "{}";
  return JSON.parse(text) as T;
}