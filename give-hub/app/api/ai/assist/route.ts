// app/api/ai/assist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { db } from "@/lib/db"; // DB adapter (mock JSON or Mongo)
import type { Campaign } from "@/lib/db";
import { llmJSON } from "@/lib/ai/client";
import { PLANNER_PROMPT, EXECUTOR_PROMPT } from "@/lib/ai/prompts";
import { PlanSchema } from "@/lib/ai/planSchema";
import type { Plan } from "@/lib/ai/planSchema";

// -------- search helpers --------
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function stripMarkdownCodeBlocks(text: string): string {
  // Remove markdown code blocks like ```json ... ``` or ``` ... ```
  return text.replace(/^```(?:json|javascript|js)?\s*\n?/gm, '').replace(/\n?```$/gm, '').trim();
}

// Ensure we strongly hint the LLM to return JSON only
function ensureJsonHint(): string {
  return "FORMAT: Return ONLY a strict single JSON object that matches the Plan schema. No prose, no markdown fences, no prefix/suffix.";
}

// Find and extract the first balanced JSON object from a string
function extractFirstJSONObject(s: string): string | null {
  const text = s.trim();
  let i = 0;
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      i++;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
    i++;
  }
  return null;
}

// Parse planner output into a Plan, supporting raw strings by extracting the first JSON object
function parsePlannerOutputOrThrow(raw: unknown): Plan {
  const cleanedRaw = typeof raw === 'string' ? stripMarkdownCodeBlocks(raw) : raw;
  let obj: unknown = cleanedRaw;
  if (typeof cleanedRaw === 'string') {
    try {
      obj = JSON.parse(cleanedRaw);
    } catch {
      const candidate = extractFirstJSONObject(cleanedRaw);
      if (!candidate) throw new SyntaxError('No JSON object found in planner output');
      obj = JSON.parse(candidate);
    }
  }
  return PlanSchema.parse(obj);
}

// Heuristic fallback: default to search/info when planner output isn’t JSON
function guessPlanFromUserText(userText: string): Plan {
  const text = (userText || '').toLowerCase().trim();
  const isGreeting = /^(hi|hello|hey|yo|greetings)\b/.test(text);
  if (isGreeting) {
    return { type: 'info', text: "Hi! Tell me what you'd like to find or donate to, and I'll help." } as const;
  }
  return { type: 'search_campaigns', query: { q: userText, limit: 10 } } as const;
}

type CampaignRow = { id: string; title: string; category: string; goal: number; raised: number };

let mongoClientPromise: Promise<MongoClient> | null = null;
async function getMongo(): Promise<MongoClient> {
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(process.env.MONGODB_URI as string, { serverSelectionTimeoutMS: 5000 }).connect();
  }
  return mongoClientPromise;
}

// -------- AI wrappers (Gemini-only) --------
async function runPlanner(userText: string, opts?: { mode?: string; context?: unknown; history?: Array<{role: 'user' | 'assistant', content: string}> }) {
  const ctxParts: string[] = [];
  
  // Add conversation history if provided
  if (opts?.history && Array.isArray(opts.history) && opts.history.length > 0) {
    const historyText = opts.history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    ctxParts.push(`Conversation History:\n${historyText}\n---`);
  }
  
  if (opts?.context) {
    if (Array.isArray(opts.context) && (opts.context as unknown[]).every((x) => typeof x === 'string')) {
      ctxParts.push(...(opts.context as string[]));
    } else {
      try { ctxParts.push(JSON.stringify(opts.context)); } catch { /* ignore */ }
    }
  }
  if (opts?.mode) ctxParts.push(`mode=${opts.mode}`);
  // Always add a strong JSON-only hint to reduce chances of prose output
  ctxParts.push(ensureJsonHint());
  
  try {
    console.log("🤖 PLANNER INPUT:", { userText, mode: opts?.mode, contextParts: ctxParts });
    const raw = await llmJSON(userText, PLANNER_PROMPT, ctxParts);
    console.log("🤖 PLANNER RAW OUTPUT:", raw);
    const parsed = parsePlannerOutputOrThrow(raw);
    console.log("🤖 PLANNER PARSED:", parsed);
    return parsed;
  } catch (error) {
    console.log("🚨 PLANNER ERROR (first attempt):", error);
    // Retry once on failure
    try {
      const raw = await llmJSON(userText, PLANNER_PROMPT, ctxParts);
      console.log("🤖 PLANNER RAW OUTPUT (retry):", raw);
      const parsed = parsePlannerOutputOrThrow(raw);
      console.log("🤖 PLANNER PARSED (retry):", parsed);
      return parsed;
    } catch (retryError) {
      console.log("🚨 PLANNER ERROR (retry failed):", retryError);
      // Fallback to a safe, helpful plan instead of giving up
      const fallback = guessPlanFromUserText(userText);
      console.log("🛟 USING FALLBACK PLAN:", fallback);
      return fallback;
    }
  }
}

async function runExecutor(input: { plan: Plan; result: unknown }) {
  const { plan, result } = input || {};
  let userText = "";
  
  console.log("🎯 EXECUTOR INPUT:", { plan, result });
  
  try {
    if (plan?.type === "search_campaigns") {
      userText = JSON.stringify({ userPrompt: plan?.query?.q, results: result }, null, 2);
    } else if (plan?.type === "open_payment") {
      const action = (typeof result === "object" && result && "action" in (result as Record<string, unknown>))
        ? (result as { action?: unknown }).action
        : undefined;
      userText = JSON.stringify({ action: "open_payment", ...(action as Record<string, unknown> | undefined) }, null, 2);
    } else if (plan?.type === "info" || plan?.type === "chat" || plan?.type === "suggest" || plan?.type === "reject") {
      // For these new action types, pass the text through to be polished by the executor
      userText = plan?.text || "";
    } else {
      userText = plan?.text || "";
    }
    
    console.log("🎯 EXECUTOR PROMPT INPUT:", userText);
    const out = await llmJSON(userText, EXECUTOR_PROMPT, []);
    console.log("🎯 EXECUTOR OUTPUT:", out);
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch (error) {
    console.log("🚨 EXECUTOR ERROR:", error);
    // Fallback if executor fails
    if (plan?.type === "search_campaigns" && Array.isArray(result)) {
      return `I found ${(result as unknown[]).length} campaigns matching your search.`;
    } else if (plan?.type === "open_payment") {
      return "I'm ready to help you make a donation.";
    } else if (plan && "text" in plan) {
      return plan.text || "I'm having trouble processing your request right now.";
    } else {
      return "I'm having trouble processing your request right now.";
    }
  }
}

// Mongo implementation (broad by default, honors titleOnly + category/title filters)
async function mongoSearch(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  const client = await getMongo();
  const dbm = client.db(process.env.MONGODB_DB || "Give-hub");
  const col = dbm.collection("campaigns"); // change if your collection differs

  const rx = new RegExp(escapeRegExp(q), "i");
  const or = extras?.titleOnly
    ? [{ title: rx }, { name: rx }]
    : [{ title: rx }, { name: rx }, { category: rx }, { description: rx }, { tags: rx }, { id: rx }, { slug: rx }];

  const and: any[] = [];
  if (extras?.category) and.push({ category: new RegExp(escapeRegExp(extras.category), "i") });
  if (extras?.title)    and.push({ title:    new RegExp(escapeRegExp(extras.title), "i") });

  const filter = and.length ? { $and: [{ $or: or }, ...and] } : { $or: or };

  const docs = await col.find(filter, {
    projection: { _id: 1, id: 1, slug: 1, title: 1, name: 1, category: 1, goal: 1, target: 1, raised: 1, amountRaised: 1 }
  }).limit(Math.min(Math.max(limit, 1), 10)).toArray();

  return docs.map((d: any) => ({
    id: d.id || d.slug || (d._id?.toString?.() ?? String(d._id)),
    title: d.title || d.name || "(untitled)",
    category: d.category || "uncategorized",
    goal: Number(d.goal ?? d.target ?? 0),
    raised: Number(d.raised ?? d.amountRaised ?? 0),
  }));
}

// Adapter implementation using our lib/db (broad by default, honors titleOnly + category/title filters where possible)
async function prismaSearch(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  const query: Partial<Campaign> & { q?: string } = { q };
  if (extras?.category) query.category = extras.category;
  if (extras?.title) query.title = extras.title;

  const { campaigns } = await db.searchCampaignsAdvanced(query, {
    limit: Math.min(Math.max(limit || 10, 1), 10),
  });

  return campaigns.map((c) => ({
    id: c.id,
    title: c.title || "(untitled)",
    category: (c as Campaign).category || "uncategorized",
    goal: Number((c as Campaign).goal ?? 0),
    raised: Number((c as Campaign).raised ?? 0),
  }));
}

// Router search delegator
async function searchCampaigns(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  if (process.env.USE_MONGODB === "true") return mongoSearch(q, limit, extras);
  // else Prisma
  return prismaSearch(q, limit, extras);
}

// -------- donate-intent helpers (simple, safe heuristics) --------
function extractQuotedTitle(text: string): string | undefined {
  const m = text.match(/"([^"]+)"/);
  return m?.[1]?.trim();
}

function extractAmount(text: string): number | undefined {
  const m = text.match(/(?:\$\s*|usd\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:usd|dollars|\$))?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

type LastResult = { id: string; title: string };
function getLastResults(ctx: unknown): LastResult[] {
  try {
    if (ctx && typeof ctx === 'object' && 'lastResults' in (ctx as Record<string, unknown>)) {
      const lr = (ctx as { lastResults?: unknown }).lastResults;
      if (Array.isArray(lr)) {
        return lr
          .map((x) => (typeof x === 'object' && x && 'id' in x && 'title' in x ? { id: String((x as any).id), title: String((x as any).title) } : null))
          .filter((x): x is LastResult => !!x);
      }
    }
  } catch { /* ignore */ }
  return [];
}

function resolveDonationIntent(userText: string, ctx: unknown): { campaignId?: string; amount?: number } | null {
  const titleHint = extractQuotedTitle(userText);
  if (!titleHint) return null;
  const lr = getLastResults(ctx);
  if (!lr.length) return null;
  const found = lr.find((r) => r.title.toLowerCase().includes(titleHint.toLowerCase()));
  if (!found) return null;
  return { campaignId: found.id, amount: extractAmount(userText) };
}

 function inferCampaignIdFromHistory(userText: string, history?: Array<{role: 'user' | 'assistant', content: string}>, ctx?: unknown): string | undefined {
  // Check for ordinal references like "first one", "second one", etc.
  const ordinalMatch = userText.match(/(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+(?:one|campaign)/i);
  if (ordinalMatch) {
    const lr = getLastResults(ctx);
    if (lr.length > 0) {
      const ordinal = ordinalMatch[1].toLowerCase();
      let index = 0;
      if (ordinal.includes('first') || ordinal === '1st') index = 0;
      else if (ordinal.includes('second') || ordinal === '2nd') index = 1;
      else if (ordinal.includes('third') || ordinal === '3rd') index = 2;
      else {
        const num = parseInt(ordinal.replace(/[^\d]/g, ''));
        if (!isNaN(num)) index = num - 1;
      }
      if (index >= 0 && index < lr.length) {
        return lr[index].id;
      }
    }
  }

  // Check for references like "that campaign", "the education one"
  if (userText.match(/(?:that|the)\s+(?:campaign|one)/i)) {
    const lr = getLastResults(ctx);
    if (lr.length === 1) return lr[0].id; // If only one result, return it
  }

  // Look for category or title hints in recent history
  // If explicit history is not provided, attempt to read from ctx.messages [{ role, text/content }]
  let histArr = history;
  if ((!histArr || histArr.length === 0) && ctx && typeof ctx === 'object' && 'messages' in (ctx as Record<string, unknown>)) {
    try {
      const msgs = (ctx as { messages?: Array<{ role: 'user' | 'assistant'; text?: string; content?: string }> }).messages;
      if (Array.isArray(msgs) && msgs.length > 0) {
        histArr = msgs
          .map(m => ({ role: m.role, content: (m.text ?? m.content ?? '').toString() }))
          .filter(m => !!m.content);
      }
    } catch { /* ignore parse errors */ }
  }
  if (histArr && histArr.length > 0) {
    const recentAssistant = histArr.filter(msg => msg.role === 'assistant').slice(-2);
    for (const msg of recentAssistant) {
      if (msg.content.includes('campaigns') || msg.content.includes('found')) {
        const lr = getLastResults(ctx);
        if (lr.length > 0) return lr[0].id; // Return first result as fallback
      }
    }
  }

  return undefined;
}

// -------- route handler --------
export async function POST(req: NextRequest) {
  const { message, prompt, mode = "default", context, history } = await req.json();
  const userMessage = (prompt ?? message ?? "").toString();
  
  console.log("🚀 AI ASSIST REQUEST:", { 
    userMessage, 
    mode, 
    context: context ? Object.keys(context) : 'none', 
    historyLength: history?.length || 0 
  });
  
  if (!userMessage.trim()) return NextResponse.json({ reply: "Please type something." });

  // Debug: Check if prompts are loaded correctly
  console.log("📋 PLANNER_PROMPT loaded:", PLANNER_PROMPT.substring(0, 100) + "...");
  console.log("📋 EXECUTOR_PROMPT loaded:", EXECUTOR_PROMPT.substring(0, 100) + "...");

  // 1) PLAN
  let plan: Plan;
  try {
    if (mode === 'pay') {
      console.log("💰 PAY MODE DETECTED");
      const direct = resolveDonationIntent(userMessage, context);
      if (direct?.campaignId) {
        console.log("💰 DIRECT DONATION INTENT:", direct);
        plan = { type: 'open_payment', campaignId: direct.campaignId, amount: direct.amount } as Plan;
      } else {
        plan = await runPlanner(userMessage, { mode, context, history });
      }
    } else {
      plan = await runPlanner(userMessage, { mode, context, history });
    }

    // Handle campaignId inference for donation intents
    if (plan.type === 'open_payment' && !plan.campaignId) {
      console.log("🔍 INFERRING CAMPAIGN ID from history...");
      const inferredId = inferCampaignIdFromHistory(userMessage, history, context);
      if (inferredId) {
        console.log("✅ INFERRED CAMPAIGN ID:", inferredId);
        plan = { ...plan, campaignId: inferredId };
      } else {
        console.log("❌ COULD NOT INFER CAMPAIGN ID");
      }
    }
  } catch (error) {
    console.log("🚨 ROUTE PLANNER ERROR:", error);
    return NextResponse.json({ 
      reply: "I'm having trouble processing your request right now. Please try again in a moment.",
      error: "planner_error" 
    });
  }

  let result: unknown = null;

  console.log("🔄 EXECUTING PLAN:", plan);

  try {
    if (plan.type === "search_campaigns") {
      console.log("🔍 CALLING SEARCH with query:", plan.query);
      result = await searchCampaigns(
        plan.query.q ?? "",
        plan.query.limit || 10,
        { 
          category: plan.query.category, 
          title: plan.query.title,
          sortBy: plan.query.sortBy,
          sortOrder: plan.query.sortOrder 
        }
      );
      console.log("🔍 SEARCH RESULTS:", result);
    } else if (plan.type === "open_payment") {
      // Enforce donation gating: only allow when mode === 'pay'
      if (mode !== 'pay') {
        console.log("⛔ Donation intent blocked: not in pay mode");
        // Convert to info guidance instead of opening payment
        const guidance = "To donate, turn on $ (pay) mode and tell me the amount and the campaign.";
        // Mutate plan so executor crafts a friendly reply
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plan = { type: 'info', text: guidance } as any;
        result = { text: guidance };
      } else {
        console.log("💰 PREPARING PAYMENT for campaign:", plan.campaignId);
        // DO NOT call donateToCampaign here (needs browser signer).
        // Return an action so the client can run donateToCampaign(...)
        result = {
          action: {
            type: "open_payment",
            campaignId: plan.campaignId,
            amount: plan.amount,
            chain: plan.chain,
            confirm: true,
          },
        };
        console.log("💰 PAYMENT ACTION:", result);
      }
    } else if (plan.type === "info" || plan.type === "chat" || plan.type === "suggest" || plan.type === "reject") {
      console.log("💬 HANDLING ACTION TYPE:", plan.type, "with text:", plan.text);
      // For these new action types, the result is just the text from the plan
      result = { text: plan.text };
    } else {
      console.log("📝 DEFAULT ACTION with text:", plan.text);
      result = { text: plan.text };
    }
  } catch (err: any) {
    console.log("🚨 BACKEND ERROR:", err);
    // Enhanced error handling with specific messages
    if (plan.type === "search_campaigns") {
      result = { error: "I'm having trouble accessing our database right now. Please try again in a moment." };
    } else if (plan.type === "open_payment") {
      result = { error: "I'm having trouble setting up the payment. Please try again in a moment." };
    } else {
      result = { error: err?.message || String(err) };
    }
  }

  // 2) EXECUTOR (craft nice reply)
  let reply: string;
  try {
    reply = await runExecutor({ plan, result });
  } catch {
    // Final fallback if executor completely fails
    if (plan.type === "search_campaigns" && Array.isArray(result)) {
      reply = `I found ${(result as unknown[]).length} campaigns matching your search, but I'm having trouble displaying them properly.`;
    } else if (plan.type === "open_payment") {
      reply = "I'm ready to help you make a donation, but I'm having trouble with the display.";
    } else if (plan && "text" in plan) {
      reply = plan.text || "I'm having trouble processing your request right now.";
    } else {
      reply = "I'm having trouble processing your request right now.";
    }
  }

  // 3) Response payload your UI expects
  if (plan.type === "search_campaigns") {
    return NextResponse.json({ text: reply, reply, results: result });
  }
  if (plan.type === "open_payment") {
    const action = (typeof result === "object" && result && "action" in (result as Record<string, unknown>))
      ? (result as { action?: unknown }).action
      : undefined;
    return NextResponse.json({ text: reply, reply, action });
  }
  // Handle new action types
  if (plan.type === "info" || plan.type === "chat" || plan.type === "suggest" || plan.type === "reject") {
    return NextResponse.json({ text: reply, reply, type: plan.type });
  }
  return NextResponse.json({ text: reply, reply });
}
