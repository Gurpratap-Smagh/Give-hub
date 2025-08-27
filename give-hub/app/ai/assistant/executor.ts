// app/ai/assistant/executor.ts
import { llmJSON } from "@/lib/ai/client";
import { EXECUTOR_PROMPT } from "@/lib/ai/prompts";
import type { Plan } from "@/lib/ai/planSchema";

export async function runExecutor(
  input: { plan: Plan; result: unknown },
  opts?: { mode?: string; context?: unknown; history?: Array<{ role: 'user' | 'assistant'; content: string }> }
) {
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
    } else if (plan?.type === "fill_payment") {
      const action = (typeof result === "object" && result && "action" in (result as Record<string, unknown>))
        ? (result as { action?: unknown }).action
        : undefined;
      userText = JSON.stringify({ action: "fill_payment", ...(action as Record<string, unknown> | undefined) }, null, 2);
    } else if (plan?.type === "info" || plan?.type === "chat" || plan?.type === "suggest" || plan?.type === "reject") {
      // For these new action types, pass the text through to be polished by the executor
      userText = plan?.text || "";
    } else {
      userText = plan?.text || "";
    }

    // Build context parts for personalization and grounding
    const ctxParts: string[] = [];
    if (opts?.history && Array.isArray(opts.history) && opts.history.length > 0) {
      const historyText = opts.history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      ctxParts.push(`Conversation History:\n${historyText}\n---`);
    }
    if (opts?.context) {
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
      // Also include raw context JSON as a final catch-all
      try { ctxParts.push(JSON.stringify(opts.context)); } catch { /* ignore */ }
    }
    if (opts?.mode) ctxParts.push(`mode=${opts.mode}`);

    console.log("🎯 EXECUTOR PROMPT INPUT:", { userText, ctxParts });
    const out = await llmJSON(userText, EXECUTOR_PROMPT, ctxParts);
    console.log("🎯 EXECUTOR OUTPUT:", out);
    return typeof out === "string" ? out : JSON.stringify(out);
  } catch (error) {
    console.log("🚨 EXECUTOR ERROR:", error);
    // Fallback if executor fails
    if (plan?.type === "search_campaigns" && Array.isArray(result)) {
      return `I found ${(result as unknown[]).length} campaigns matching your search.`;
    } else if (plan?.type === "open_payment") {
      return "I'm ready to help you make a donation.";
    } else if (plan?.type === "fill_payment") {
      return "I've pre-filled the donation for you. Please review and complete any missing details.";
    } else if (plan && "text" in plan) {
      return plan.text || "I'm having trouble processing your request right now.";
    } else {
      return "I'm having trouble processing your request right now.";
    }
  }
}
