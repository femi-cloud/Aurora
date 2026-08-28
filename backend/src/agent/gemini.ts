import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import "dotenv/config";

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY missing in .env");
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

type Provider = "gemini" | "groq";
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

const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

const modelChain: ChainEntry[] = [
  ...geminiModels.map((model): ChainEntry => ({ provider: "gemini", model })),
  // Only added to the chain if a key is configured — lets the app run
  // Gemini-only if Groq isn't set up yet.
  ...(groq ? [{ provider: "groq" as const, model: groqModel }] : []),
];

// Each model/provider pair is throttled independently — otherwise a
// fallback attempt for one model gets stuck behind unrelated queued
// calls for another and effectively never runs.
const MIN_CALL_INTERVAL_MS = 13000;
const lastCallAtByKey = new Map<string, number>();
const queueByKey = new Map<string, Promise<unknown>>();

function keyFor(entry: ChainEntry): string {
  return `${entry.provider}:${entry.model}`;
}

function throttledFor(entry: ChainEntry): Promise<void> {
  const key = keyFor(entry);
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
async function withFallback<T>(callEntry: (entry: ChainEntry) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const entry of modelChain) {
    await throttledFor(entry);
    try {
      return await callEntry(entry);
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) throw err; // non-quota error: don't burn through the chain for nothing
      console.warn(`[gemini] ${keyFor(entry)} quota exhausted, trying next in chain`);
    }
  }
  throw lastError;
}

/**
 * Simple call: sends a text prompt, returns the text response.
 * Used as a connectivity test before wiring decisionEngine.ts to it.
 */
export async function askGemini(prompt: string): Promise<string> {
  return withFallback(async (entry) => {
    if (entry.provider === "gemini") {
      const response = await ai.models.generateContent({ model: entry.model, contents: prompt });
      return response.text ?? "";
    }
    const completion = await groq!.chat.completions.create({
      model: entry.model,
      messages: [{ role: "user", content: prompt }],
    });
    return completion.choices[0]?.message?.content ?? "";
  });
}

/**
 * Call the model with a forced JSON output matching a schema.
 * Used by decisionEngine.ts to get reliable AgentDecision objects.
 */
export async function askGeminiJSON<T>(prompt: string, responseSchema: object): Promise<T> {
  const text = await withFallback(async (entry) => {
    if (entry.provider === "gemini") {
      const response = await ai.models.generateContent({
        model: entry.model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema },
      });
      return response.text ?? "{}";
    }

    // Groq's JSON mode (OpenAI-compatible) has no responseSchema param —
    // it just needs response_format: json_object plus the word "json"
    // somewhere in the prompt, and the schema described in plain text.
    // NOTE: not yet tested end-to-end — verify this actually returns valid
    // JSON before relying on it live, the exact wording requirement can be
    // finicky on OpenAI-compatible APIs.
    const groqPrompt = `${prompt}\n\nRespond ONLY with a JSON object matching this schema:\n${JSON.stringify(responseSchema)}`;
    const completion = await groq!.chat.completions.create({
      model: entry.model,
      messages: [{ role: "user", content: groqPrompt }],
      response_format: { type: "json_object" },
    });
    return completion.choices[0]?.message?.content ?? "{}";
  });

  return JSON.parse(text) as T;
}