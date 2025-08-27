// app/ai/assistant/planner.ts
import { llmJSON } from "@/lib/ai/client";
import { PLANNER_PROMPT } from "@/lib/ai/prompts";
import type { Plan } from "@/lib/ai/planSchema";
import { ensureJsonHint, parsePlannerOutputOrThrow, stripMarkdownCodeBlocks } from "./json";
import { extractChainAndToken, CHAIN_TO_TOKENS } from "./tokens";

export type PlannerResult =
  | { ok: true; plan: Plan }
  | { ok: false; text: string };

export async function runPlanner(
  userText: string,
  opts?: { mode?: string; context?: unknown; history?: Array<{ role: 'user' | 'assistant'; content: string }> }
): Promise<PlannerResult> {
  const ctxParts: string[] = [];

  // Add conversation history if provided
  if (opts?.history && Array.isArray(opts.history) && opts.history.length > 0) {
    const historyText = opts.history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    ctxParts.push(`Conversation History:\n${historyText}\n---`);
  }

  if (opts?.context) {
    // If context includes an authenticated user, surface it explicitly
    try {
      const c = opts.context as Record<string, unknown>;
      if (c && typeof c === 'object' && 'user' in c) {
        const maybeUser = (c as { user?: unknown }).user;
        if (maybeUser && typeof maybeUser === 'object') {
          const u = maybeUser as { id?: unknown; username?: unknown; role?: unknown; email?: unknown };
          const id = typeof u.id === 'string' ? u.id : '';
          const username = typeof u.username === 'string' ? u.username : '';
          const role = typeof u.role === 'string' ? u.role : '';
          ctxParts.push(`User Context:\n id=${id}\n username=${username}\n role=${role}\n---`);
        }
      }
    } catch { /* ignore */ }
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
    // Add chain and token mapping information to context
    ctxParts.push(`Available chains and tokens: ${JSON.stringify(CHAIN_TO_TOKENS)}`);

    console.log("🤖 PLANNER INPUT:", { userText, mode: opts?.mode, contextParts: ctxParts });
    const raw = await llmJSON(userText, PLANNER_PROMPT, ctxParts);
    console.log("🤖 PLANNER RAW OUTPUT:", raw);
    try {
      const parsedPlan = parsePlannerOutputOrThrow(raw);
      
      // Create a mutable copy of the plan to enhance it
      const parsed = { ...parsedPlan };
      
      // Enhance plan with chain/token information if it's a payment type
      if (parsed.type === "open_payment" || parsed.type === "fill_payment") {
        // Extract chain and token from user text
        const { chain, token, tokenExplicit } = extractChainAndToken(userText);

        if (parsed.type === "open_payment" && parsed.campaignId) {
          const hasChain = parsed.chain || chain;
          const hasExplicitToken = tokenExplicit === true;

          // Require explicit token mention; otherwise, downgrade to fill_payment
          if (!hasChain || !hasExplicitToken) {
            (parsed as Plan).type = "fill_payment";
            console.log("🔄 Switching from open_payment to fill_payment due to missing chain or non-explicit token");
          } else {
            // Fill missing chain from inference if available
            if (!parsed.chain && chain) {
              parsed.chain = chain;
            }
            // If token was explicit, include it
            if (token && typeof (parsed as { token?: string }).token === 'undefined') {
              (parsed as { token?: string }).token = token;
            }
          }
        } else if (parsed.type === "fill_payment") {
          // Fill chain if we inferred it and planner didn't include
          if (!parsed.chain && chain) {
            parsed.chain = chain;
          }
          // Pass along token if present (useful for prefill)
          if (token && typeof (parsed as { token?: string }).token === 'undefined') {
            (parsed as { token?: string }).token = token;
          }
        }
      }
      
      console.log("🤖 PLANNER PARSED (ENHANCED):", parsed);
      return { ok: true, plan: parsed };
    } catch (parseErr) {
      console.log("⚠️ PLANNER PARSE ERROR (first attempt):", parseErr);
      // Retry once to give the model another chance to return JSON
      const raw2 = await llmJSON(userText, PLANNER_PROMPT, ctxParts);
      console.log("🤖 PLANNER RAW OUTPUT (retry):", raw2);
      try {
        const parsed2 = parsePlannerOutputOrThrow(raw2);
        console.log("🤖 PLANNER PARSED (retry):", parsed2);
        return { ok: true, plan: parsed2 };
      } catch (parseErr2) {
        console.log("🚨 PLANNER PARSE ERROR (retry failed):", parseErr2);
        const textOut = stripMarkdownCodeBlocks(typeof raw2 === 'string' ? raw2 : String(raw2 ?? ''));
        return { ok: false, text: textOut };
      }
    }
  } catch (error) {
    console.log("🚨 PLANNER CALL ERROR:", error);
    const fallbackText = typeof userText === 'string' ? userText : '';
    return { ok: false, text: fallbackText };
  }
}
