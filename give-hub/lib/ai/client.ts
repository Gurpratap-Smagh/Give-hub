// lib/ai/client.ts
// Server-side LLM helper using @google/genai SDK
// Uses Google Gemini via official SDK. Falls back gracefully if no API key.

import { GoogleGenAI } from "@google/genai";

// Support either a comma-separated GEMINI_KEYS or a single GEMINI_API_KEY
const GEMINI_KEYS_LIST = (process.env.GEMINI_KEYS || "").split(",").map(s=>s.trim()).filter(Boolean);
const GEMINI_API_KEY_SINGLE = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_KEYS = [...GEMINI_KEYS_LIST, ...(GEMINI_API_KEY_SINGLE ? [GEMINI_API_KEY_SINGLE] : [])];
let keyIdx = 0;

function nextGeminiKey() {
  if (!GEMINI_KEYS.length) throw new Error("No GEMINI_KEYS configured");
  keyIdx = (keyIdx + 1) % GEMINI_KEYS.length;
  return GEMINI_KEYS[keyIdx];
}

// Default timeout (ms) for LLM requests; can be overridden via env
const LLM_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 15000);

function wantsJSON(system: string): boolean {
  const s = system || "";
  return /application\/json/i.test(s)
    || /return\s+only\s+(a\s+)?json\s+object/i.test(s)
    || /json_object/i.test(s);
}

export async function llmJSON(userText: string, system: string, contextParts: string[]) {
  // Graceful no-API fallback for local dev
  if (!GEMINI_KEYS.length) {
    console.warn("🚨 NO GEMINI_API_KEY configured! Create .env.local file with GEMINI_API_KEY. See .env.example");
    // Do not fabricate JSON or replies; return raw user text so caller can decide.
    return userText;
  }

  const extra = contextParts && contextParts.length ? "\n\nContext:\n" + contextParts.join("\n") : "";
  const fullSystem = system + extra;
  
  try {
    return await call(userText, fullSystem, GEMINI_KEYS[keyIdx] || nextGeminiKey());
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || e);
    // rotate on 429/5xx/timeouts
    if (/\b(429|resource_exhausted|timeout|unavailable|5\d{2})\b/i.test(msg)) {
      const altKey = nextGeminiKey();
      try { return await call(userText, fullSystem, altKey); } catch {}
      // Final fallback: do not fabricate JSON or replies; return raw user text
      return userText;
    }
    throw e;
  }
}

async function call(userText: string, systemInstruction: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort('timeout'), LLM_TIMEOUT_MS);
  
  try {
    const genAI = new GoogleGenAI({ apiKey });
    
    // Build request with system instruction as part of contents
    const contents = [
      {
        role: "user" as const,
        parts: [{ text: systemInstruction + "\n\n" + userText }],
      }
    ];
    
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
    });

    // Extract text from response
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return text;
  } catch (e) {
    // Normalize aborts to a 'timeout' error so caller can rotate keys/fallback
    const name = (e as { name?: string })?.name || '';
    const msg = String((e as { message?: string })?.message || e || '');
    if (name === 'AbortError' || /aborted|timeout/i.test(msg)) {
      throw new Error('timeout');
    }
    throw e as Error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

