// lib/ai/client.ts
// Server-side LLM helper used by app/api/ai/assist/route.ts
// Uses Google Gemini via @google/genai. Falls back gracefully if no API key.

// lib/ai/client.ts
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
    if (wantsJSON(system)) {
      // Provide intelligent fallbacks based on common patterns
      const userLower = userText.toLowerCase();
      
      // Search intents
      if (userLower.includes('find') || userLower.includes('search') || userLower.includes('show') || 
          userLower.includes('campaign') || userLower.includes('community') || userLower.includes('tech')) {
        return JSON.stringify({ 
          type: "search_campaigns", 
          query: { q: userText.slice(0, 50), limit: 10 } 
        });
      }
      
      // Donation intents
      if (userLower.includes('donate') || userLower.includes('give') || userLower.includes('$') || 
          userLower.includes('zeta') || userLower.includes('support')) {
        const amountMatch = userText.match(/(\d+)/);
        return JSON.stringify({ 
          type: "open_payment", 
          amount: amountMatch ? parseInt(amountMatch[1]) : undefined,
          chain: userLower.includes('zeta') ? 'zeta' : undefined
        });
      }
      
      // Greetings
      if (userLower.includes('hello') || userLower.includes('hi') || userLower.includes('hey') || 
          userLower.includes('what can you do')) {
        return JSON.stringify({ 
          type: "info", 
          text: "Hello! I'm the GiveHub assistant. I can help you search for campaigns and make donations. What would you like to do?" 
        });
      }
      
      // Default fallback
      return JSON.stringify({ type: "final", text: userText.slice(0, 400) });
    }
    return userText;
  }

  const body = buildBody(userText, system, contextParts);
  try {
    return await call(body, GEMINI_KEYS[keyIdx] || nextGeminiKey());
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || e);
    // rotate on 429/5xx/timeouts
    if (/\b(429|resource_exhausted|timeout|unavailable|5\d{2})\b/i.test(msg)) {
      const altKey = nextGeminiKey();
      try { return await call(body, altKey); } catch {}
      // Final safe fallback to avoid 500s when no alternate provider is available
      if (wantsJSON(system)) {
        return JSON.stringify({ type: "final", text: userText.slice(0, 400) });
      }
      return userText;
    }
    throw e;
  }
}

function buildBody(userText:string, system:string, ctx:string[]){
  // Gemini-only body
  const extra = ctx && ctx.length ? "\n\nContext:\n" + ctx.join("\n") : "";
  return {
    model: "gemini-1.5-flash",
    contents: [{ role:"user", parts:[{text: userText}] }],
    systemInstruction: { role:"system", parts:[{text: system + extra}] },
    tools: [],
    generationConfig: wantsJSON(system)
      ? { responseMimeType: "application/json", temperature: 0.2 }
      : { temperature: 0.2 }
  };
}

async function call(body: unknown, apiKey:string){
  // Gemini-only call
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+apiKey,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${JSON.stringify(j)}`);
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}
