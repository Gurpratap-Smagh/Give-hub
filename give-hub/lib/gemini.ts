// Server-only Gemini helper for Give-Hub (Next.js App Router)
// Place under give-hub/lib/ and import only from server code (API routes / server actions)

import { GoogleGenAI } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

// Optional base system prompt from env for consistent brand/tone/guardrails
const BASE_SYSTEM_PROMPT = process.env.GEMINI_SYSTEM_PROMPT || ""; // set in .env
const BASE_EDIT_SYSTEM_PROMPT = process.env.GEMINI_EDIT_SYSTEM_PROMPT || "";

// --- Rotating API keys manager --------------------------------------------
// Sources of keys (priority order):
// 1) GEMINI_API_KEY
// 2) GEMINI_KEYS (comma-separated list)
// 3) Any envs matching GEMINI_<number>_API_KEY (e.g., GEMINI_2_API_KEY)
function collectGeminiKeys(): string[] {
  const keys: string[] = [];
  const primary = (process.env.GEMINI_API_KEY || "").trim();
  if (primary) keys.push(primary);

  const list = (process.env.GEMINI_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const k of list) if (!keys.includes(k)) keys.push(k);

  // Scan for GEMINI_<number>_API_KEY (case-insensitive)
  const env = process.env as Record<string, string | undefined>;
  const numbered = Object.entries(env)
    .filter(([name, val]) => /^(GEMINI_\d+_API_KEY)$/i.test(name) && (val || "").trim())
    .sort(([a], [b]) => {
      // Sort by the embedded number if present
      const na = parseInt(a.match(/GEMINI_(\d+)_API_KEY/i)?.[1] || "0", 10);
      const nb = parseInt(b.match(/GEMINI_(\d+)_API_KEY/i)?.[1] || "0", 10);
      return na - nb;
    })
    .map(([, val]) => (val || "").trim());
  for (const k of numbered) if (!keys.includes(k)) keys.push(k);

  return keys;
}

const ROTATION_KEYS = collectGeminiKeys();
let rotationIndex = 0; // module-level state (per Lambda/Node instance)
const ROTATION_CYCLES = Math.max(
  1,
  Number.isFinite(Number(process.env.GEMINI_ROTATION_CYCLES))
    ? Number(process.env.GEMINI_ROTATION_CYCLES)
    : 1
);

if (ROTATION_KEYS.length === 0) {
  console.warn("[Gemini] No API keys found. Set GEMINI_API_KEY or GEMINI_KEYS.");
}

function getCurrentKey(): string | undefined {
  if (ROTATION_KEYS.length === 0) return undefined;
  return ROTATION_KEYS[rotationIndex % ROTATION_KEYS.length];
}

function advanceKey() {
  if (ROTATION_KEYS.length === 0) return;
  rotationIndex = (rotationIndex + 1) % ROTATION_KEYS.length;
}

export function getGenAI() {
  const key = getCurrentKey();
  if (!key) throw new Error("Missing GEMINI_API_KEY(s)");
  return new GoogleGenAI({ apiKey: key });
}

function looksLikeQuotaError(err: unknown): boolean {
  // Broad detection across SDK/http shapes (no explicit `any`)
  const lower = (v: unknown): string =>
    typeof v === "string" ? v.toLowerCase() : typeof v === "number" ? String(v) : "";

  let msg = "";
  let status: number | string | undefined;

  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") msg = e.message.toLowerCase();
    else if (typeof e.message === "number") msg = String(e.message).toLowerCase();

    if (typeof e.status === "number" || typeof e.status === "string") status = e.status;
    else if (typeof e.response === "object" && e.response !== null) {
      const r = e.response as Record<string, unknown>;
      if (typeof r.status === "number" || typeof r.status === "string") status = r.status;
    }
    if (!status && (typeof e.code === "number" || typeof e.code === "string")) status = e.code;
  }

  const statusNum = typeof status === "string" ? Number(status) : status;
  if (statusNum === 429) return true;
  if (statusNum === 403 && /quota|exceed|limit/.test(msg)) return true;
  if (/quota|exceed|rate|billing|insufficient/.test(msg)) return true;

  let details = "";
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    try {
      details = lower(JSON.stringify({ error: e.error, errors: e.errors, data: e.data }));
    } catch {
      details = "";
    }
  }
  if (/quota|exceed|rate|billing|insufficient/.test(details)) return true;
  return false;
}

async function withGeminiRotation<T>(call: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const perCycle = Math.max(1, ROTATION_KEYS.length || 1);
  const attempts = perCycle * ROTATION_CYCLES;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const client = getGenAI();
    try {
      return await call(client);
    } catch (err) {
      lastErr = err;
      if (looksLikeQuotaError(err) && attempts > 1) {
        console.warn(`[Gemini] Key quota/limit hit. Rotating to next key (attempt ${i + 1}/${attempts}).`);
        advanceKey();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function generateCampaignCopy(prompt: string) {
  return withGeminiRotation(async (genai) => {
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
  });
}

// Convenience: allow callers to override/augment the system prompt for a single request
export async function generateWithSystem(userPrompt: string, systemPrompt?: string) {
  return withGeminiRotation(async (genai) => {
    const mergedSystem = (systemPrompt || BASE_SYSTEM_PROMPT || "").trim();
    const res: GenerateContentResponse = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: (mergedSystem
        ? [{ role: "user", parts: [{ text: mergedSystem + "\n\n" + userPrompt }]}]
        : [{ role: "user", parts: [{ text: userPrompt }]}]
      ),
    });
    return res.text ?? "";
  });
}

// Edit existing content with optional system prompt from env
export async function generateEditedText(input: string, instruction: string, systemPrompt?: string) {
  return withGeminiRotation(async (genai) => {
    const mergedSystem = (systemPrompt || BASE_EDIT_SYSTEM_PROMPT || BASE_SYSTEM_PROMPT || "").trim();
    const prompt = `${mergedSystem ? mergedSystem + "\n\n" : ""}` +
      `You are an expert editor. Follow the user's instruction precisely.\n` +
      `Return only the edited text, no explanations.\n\n` +
      `INSTRUCTION:\n${instruction}\n\nCONTENT:\n${input}`;
    const res: GenerateContentResponse = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }]}],
    });
    return res.text ?? "";
  });
}
