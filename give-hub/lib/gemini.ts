// Server-only Gemini helper for Give-Hub (Next.js App Router)
// Place under give-hub/lib/ and import only from server code (API routes / server actions)

import { GoogleGenAI } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY; // TODO: set in project root .env
if (!apiKey) {
  // Avoid throwing at import time in Next.js; validate in handlers as needed
  console.warn("[Gemini] Missing GEMINI_API_KEY in environment");
}

// Optional base system prompt from env for consistent brand/tone/guardrails
const BASE_SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT || ""; // set in .env
const BASE_EDIT_SYSTEM_PROMPT = process.env.GEMINI_EDIT_SYSTEM_PROMPT || "";

export function getGenAI() {
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

export async function generateCampaignCopy(prompt: string) {
  const genai = getGenAI();
  // CHANGE_ME: model choice — use "gemini-2.5-flash" for speed, "gemini-2.0/2.5-pro" for higher quality
  const res: GenerateContentResponse = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    // CHANGE_ME: inject a system prompt (prepend) to set brand/tone/constraints
    contents: (BASE_SYSTEM_PROMPT
      ? [{ role: "user", parts: [{ text: BASE_SYSTEM_PROMPT + "\n\n" + prompt }]}]
      : [{ role: "user", parts: [{ text: prompt }]}]
    ),
  });
  // CHANGE_ME: extraction — if you need JSON, use structured prompting and parse here
  const text = res.text ?? ""; // SDK exposes `.text` shortcut
  return text;
}

// Convenience: allow callers to override/augment the system prompt for a single request
export async function generateWithSystem(userPrompt: string, systemPrompt?: string) {
  const genai = getGenAI();
  const mergedSystem = (systemPrompt || BASE_SYSTEM_PROMPT || "").trim();
  const res = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: (mergedSystem
      ? [{ role: "user", parts: [{ text: mergedSystem + "\n\n" + userPrompt }]}]
      : [{ role: "user", parts: [{ text: userPrompt }]}]
    ),
  });
  return res.text ?? "";
}

// Edit existing content with optional system prompt from env
export async function generateEditedText(input: string, instruction: string, systemPrompt?: string) {
  const genai = getGenAI();
  const mergedSystem = (systemPrompt || BASE_EDIT_SYSTEM_PROMPT || BASE_SYSTEM_PROMPT || "").trim();
  const prompt = `${mergedSystem ? mergedSystem + "\n\n" : ""}` +
    `You are an expert editor. Follow the user's instruction precisely.\n` +
    `Return only the edited text, no explanations.\n\n` +
    `INSTRUCTION:\n${instruction}\n\nCONTENT:\n${input}`;
  const res = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }]}],
  });
  return (res as any).text ?? "";
}
