import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY manquante dans .env");
}

const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

const ai = new GoogleGenAI({ apiKey });

/**
 * Simple call: sends a text prompt, returns the text response.
 * Used as a connectivity test before wiring decisionEngine.ts to it.
 */
export async function askGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

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
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text ?? "{}";
  return JSON.parse(text) as T;
}