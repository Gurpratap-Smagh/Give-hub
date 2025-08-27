// app/api/ai/assist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { llmJSON } from "@/lib/ai/client";
import type { Plan } from "@/lib/ai/planSchema";
import { runPlanner } from "@/app/ai/assistant/planner";
import { runExecutor } from "@/app/ai/assistant/executor";
import { searchCampaigns } from "@/app/ai/assistant/search";
import { inferCampaignIdFromHistory } from "@/app/ai/assistant/donation";
import { ensureJsonHint, extractFirstJSONObject } from "@/app/ai/assistant/json";
import { extractChainAndToken } from "@/app/ai/assistant/tokens";

// AI assistant helpers moved to app/ai/assistant/* modules

// -------- route handler --------
export async function POST(req: NextRequest) {
  const { message, prompt, mode = "default", context, history, paymentConfirmed, campaignId } = await req.json();
  const userMessage = (prompt ?? message ?? "").toString();
  
  console.log("🚀 AI ASSIST REQUEST:", { 
    userMessage, 
    mode, 
    paymentConfirmed,
    campaignId,
    context: context ? Object.keys(context) : 'none', 
    historyLength: history?.length || 0 
  });
  
  // Handle payment confirmation responses
  if (paymentConfirmed === true) {
    console.log("💰 PAYMENT CONFIRMED for campaign:", campaignId);
    const thankYouMessage = "Thank you for your generous donation! Your support makes a real difference to this campaign.";
    return NextResponse.json({ 
      text: thankYouMessage, 
      reply: thankYouMessage,
      paymentComplete: true
    });
  }
  
  if (!userMessage.trim()) return NextResponse.json({ reply: "Please type something." });

  // Fast-path for rewrite mode (campaign creation) and profile mode
  if (mode === 'rewrite') {
    try {
      const REWRITE_SYSTEM = `You are a precise rewriting assistant for GiveHub creators.\n\nReturn ONLY a single application/json object with EXACT keys:\n{\n  "title": string,\n  "description": string\n}\n\nRules:\n- Title: concise, clear, compelling.\n- Description: 2–5 sentences, specific and inspiring.\n- Do NOT invent facts.\n- No markdown, no code fences, no extra text.`;
      const ctxParts: string[] = [ensureJsonHint(), 'mode=rewrite'];
      const raw = await llmJSON(userMessage, REWRITE_SYSTEM, ctxParts);
      let outText = typeof raw === 'string' ? raw : JSON.stringify(raw);
      // Robustly extract the first JSON object if any wrappers slipped in
      if (typeof outText === 'string') {
        try {
          // Try direct parse first
          const parsed = JSON.parse(outText) as unknown;
          // If it doesn't look like desired shape, try to improve below
          if (!parsed || typeof parsed !== 'object' || !("title" in (parsed as Record<string,unknown>)) || !("description" in (parsed as Record<string,unknown>))) {
            throw new Error('missing keys');
          }
        } catch {
          const candidate = extractFirstJSONObject(outText);
          if (candidate) {
            try {
              const parsed = JSON.parse(candidate) as Record<string, unknown>;
              if ('title' in parsed && 'description' in parsed) {
                outText = candidate;
              } else {
                throw new Error('candidate missing keys');
              }
            } catch {
              // Fall through to attempt extracting the input JSON from the original prompt as a last resort
              const inputCandidate = extractFirstJSONObject(userMessage);
              if (inputCandidate) {
                try {
                  const inputParsed = JSON.parse(inputCandidate) as Record<string, unknown>;
                  const t = typeof inputParsed.title === 'string' ? inputParsed.title : '';
                  const d = typeof inputParsed.description === 'string' ? inputParsed.description : '';
                  if (t || d) {
                    outText = JSON.stringify({ title: t, description: d });
                  }
                } catch {}
              }
            }
          } else {
            // No candidate; try to salvage from the original prompt input JSON
            const inputCandidate = extractFirstJSONObject(userMessage);
            if (inputCandidate) {
              try {
                const inputParsed = JSON.parse(inputCandidate) as Record<string, unknown>;
                const t = typeof inputParsed.title === 'string' ? inputParsed.title : '';
                const d = typeof inputParsed.description === 'string' ? inputParsed.description : '';
                if (t || d) {
                  outText = JSON.stringify({ title: t, description: d });
                }
              } catch {}
            }
          }
        }
      }
      return NextResponse.json({ text: outText, reply: outText });
    } catch (e) {
      console.error('✏️ rewrite mode failed:', e);
      // Fall through to generic flow only if rewrite fails hard
    }
  }

  // Profile mode - improve user profile fields  
  if (mode === 'profile') {
    try {
      const PROFILE_SYSTEM = `You are a profile improvement assistant for GiveHub users.\n\nReturn ONLY a single JSON object with these exact keys:\n{\n  "bio": string,\n  "location": string,\n  "website": string\n}\n\nRules:\n- Bio: 1-2 concise paragraphs, authentic and friendly\n- Location: city, state/country format\n- Website: valid URL or empty string\n- No markdown, no code fences, no extra text`;
      
      const ctxParts: string[] = [
        ensureJsonHint(), 
        'mode=profile',
        'Current profile data:\n' + JSON.stringify(context?.profile || {})
      ];
      
      const raw = await llmJSON(userMessage, PROFILE_SYSTEM, ctxParts);
      
      // Parse and validate the response
      let parsed: {bio?: string, location?: string, website?: string} = {};
      
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          const extracted = extractFirstJSONObject(raw);
          if (extracted) parsed = JSON.parse(extracted);
        }
      } else if (typeof raw === 'object') {
        parsed = raw;
      }
      
      // Validate and sanitize fields
      const result = {
        bio: typeof parsed.bio === 'string' ? parsed.bio : '',
        location: typeof parsed.location === 'string' ? parsed.location : '',
        website: typeof parsed.website === 'string' && 
                 (parsed.website === '' || parsed.website.startsWith('http')) ? 
                 parsed.website : ''
      };
      
      return NextResponse.json({
        text: JSON.stringify(result),
        reply: JSON.stringify(result),
        profileUpdate: result,
        type: 'profile_update'
      });
      
    } catch (e) {
      console.error('Profile update failed:', e);
      return NextResponse.json({
        text: 'Failed to process profile update',
        reply: 'Failed to process profile update',
        error: 'PROFILE_UPDATE_FAILED'
      }, {status: 400});
    }
  }

  // 1) PLAN (always call planner first)
  const planResult = await runPlanner(userMessage, { mode, context, history });
  if (!planResult.ok) {
    const text = (planResult.text || userMessage || "").toString();
    return NextResponse.json({ text, reply: text });
  }
  let plan: Plan = planResult.plan;

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
  // Also attempt inference for fill_payment intents
  if (plan.type === 'fill_payment' && !plan.campaignId) {
    console.log("🔍 INFERRING CAMPAIGN ID for fill_payment from history...");
    const inferredId = inferCampaignIdFromHistory(userMessage, history, context);
    if (inferredId) {
      console.log("✅ INFERRED CAMPAIGN ID (fill):", inferredId);
      plan = { ...plan, campaignId: inferredId };
    } else {
      console.log("❌ COULD NOT INFER CAMPAIGN ID (fill)");
    }
  }

  // Safety net: require explicit token mention for open_payment; otherwise downgrade to fill_payment
  if (plan.type === 'open_payment') {
    const { tokenExplicit, chain: inferredChain } = extractChainAndToken(userMessage);
    if (!tokenExplicit) {
      console.log("🛡️ Downgrading open_payment to fill_payment: token not explicitly mentioned by user");
      plan = {
        ...plan,
        type: 'fill_payment',
        // Provide chain hint if planner omitted it
        chain: plan.chain || inferredChain || plan.chain,
      } as Plan;
    }
  }

  let result: unknown = null;

  console.log("🔄 EXECUTING PLAN:", plan);

  try {
    if (plan.type === "search_campaigns") {
      console.log("🔍 CALLING SEARCH with query:", plan.query);
      {
        const qrec = plan.query as Record<string, unknown>;
        const creatorUsername = typeof qrec.creatorUsername === 'string'
          ? qrec.creatorUsername
          : (typeof qrec.creator === 'string' ? qrec.creator : undefined);
        result = await searchCampaigns(
          plan.query.q ?? "",
          plan.query.limit || 10,
          { 
            category: plan.query.category, 
            title: plan.query.title,
            creatorUsername: creatorUsername as string | undefined,
            titleOnly: (plan.query as Record<string, unknown> & { titleOnly?: boolean }).titleOnly,
            sortBy: plan.query.sortBy,
            sortOrder: plan.query.sortOrder 
          }
        );
      }
      // Prepare a UI action to open the search page as well
      // Map planner query fields to homepage search params (defaults to title)
      {
        // Determine best UI mapping for search open action
        const hasCreator = (plan.query as Record<string, unknown>).creator || (plan.query as Record<string, unknown>).creatorUsername;
        const creatorText = ((plan.query as Record<string, unknown>).creatorUsername || (plan.query as Record<string, unknown>).creator) as string | undefined;
        const searchText = (plan.query.title
          ?? plan.query.category
          ?? (creatorText && typeof creatorText === 'string' ? creatorText : undefined)
          ?? plan.query.q
          ?? "");
        const param = plan.query.title
          ? "title"
          : (plan.query.category
            ? "category"
            : (hasCreator ? "creator" : "all"));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any) = {
          results: result,
          action: {
            type: "open_search",
            search: searchText,
            param,
          }
        };
      }
      console.log("🔍 SEARCH RESULTS:", result);
    } else if (plan.type === "open_payment") {
      // Enforce donation gating: only allow when mode === 'pay'
      if (mode !== 'pay') {
        console.log("⛔ Donation intent blocked: not in pay mode");
        // Convert to info guidance instead of opening payment
        const guidance = "⚠️ Please turn on $ (pay) mode first by clicking the dollar icon. This gives me permission to help with donations.";
        // DIRECT MESSAGE: Don't use executor for this critical instruction
        // This ensures the exact message gets through without being reworded
        return NextResponse.json({ text: guidance, reply: guidance });
      } else {
        if (!plan.campaignId) {
          console.log("❌ No campaignId provided; asking user to pick one");
          const guidance = "Which campaign would you like to support? Say the title or id, or tap a result.";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          plan = { type: 'info', text: guidance } as any;
          result = { text: guidance };
        } else {
          console.log("💰 PREPARING PAYMENT for campaign:", plan.campaignId);
          // DO NOT call donateToCampaign here (needs browser signer).
          // Return an action so the client can run donateToCampaign(...)
          const confirmMsg = "Please confirm the donation in your wallet when prompted.";
          result = {
            action: {
              type: "open_payment",
              campaignId: plan.campaignId,
              amount: plan.amount,
              chain: plan.chain,
              token: (plan as { token?: string }).token,
              confirm: true,
            },
            text: confirmMsg
          };
          console.log("💰 PAYMENT ACTION:", result);
          
          // DIRECT MESSAGE: Skip executor for payment confirmation instructions
          // Include special paymentPending flag for frontend to detect
          return NextResponse.json({ 
            text: confirmMsg, 
            reply: confirmMsg, 
            action: (result as { action?: unknown }).action,
            paymentPending: true, // Signal frontend that we're waiting for confirmation
          });
        }
      }
    } else if (plan.type === "fill_payment") {
      // Do NOT gate fill_payment by mode. It's safe to prefill without submitting.
      if (!plan.campaignId) {
        console.log("❌ No campaignId provided for fill_payment; asking user to pick one");
        const guidance = "Which campaign would you like to support? Say the title or id, or tap a result.";
        // DIRECT MESSAGE: Don't use executor for this campaign selection guidance
        return NextResponse.json({ text: guidance, reply: guidance });
      } else {
        console.log("🧾 PREPARING PREFILL for campaign:", plan.campaignId);
        const fillMsg = "Please complete any missing details and confirm when ready.";
        result = {
          action: {
            type: "fill_payment",
            campaignId: plan.campaignId,
            amount: plan.amount,
            chain: plan.chain,
            token: (plan as { token?: string }).token,
            confirm: false,
          },
          text: fillMsg
        };
        console.log("🧾 PREFILL ACTION:", result);
        
        // DIRECT MESSAGE: Skip executor for payment form instructions
        // Include special paymentForm flag for frontend to detect
        return NextResponse.json({ 
          text: fillMsg, 
          reply: fillMsg, 
          action: (result as { action?: unknown }).action,
          paymentForm: true, // Signal frontend that we're showing a form
          dollarMode: mode !== "pay", // Signal if user needs to enable pay mode
        });
      }
    } else if (plan.type === "info" || plan.type === "chat" || plan.type === "suggest" || plan.type === "reject") {
      console.log("💬 HANDLING ACTION TYPE:", plan.type, "with text:", plan.text);
      // For these new action types, the result is just the text from the plan
      result = { text: plan.text };
    } else {
      const anyPlan = plan as unknown as { text?: unknown };
      const txt = typeof anyPlan.text === 'string' ? anyPlan.text : '';
      console.log("📝 DEFAULT ACTION with text:", txt);
      result = { text: txt };
    }
  } catch (err: unknown) {
    console.log("🚨 BACKEND ERROR:", err);
    // Enhanced error handling with specific messages
    if (plan.type === "search_campaigns") {
      result = { error: "I'm having trouble accessing our database right now. Please try again in a moment." };
    } else if (plan.type === "open_payment") {
      result = { error: "I'm having trouble setting up the payment. Please try again in a moment." };
    } else if (plan.type === "fill_payment") {
      result = { error: "I'm having trouble preparing the donation form. Please try again in a moment." };
    } else {
      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
      result = { error: message };
    }
  }

  // 2) EXECUTOR (craft nice reply)
  let reply: string;
  try {
    reply = await runExecutor({ plan, result }, { mode, context, history });
  } catch {
    // Final fallback if executor completely fails
    if (plan.type === "search_campaigns" && Array.isArray(result)) {
      reply = `I found ${(result as unknown[]).length} campaigns matching your search, but I'm having trouble displaying them properly.`;
    } else if (plan.type === "open_payment") {
      reply = "I'm ready to help you make a donation, but I'm having trouble with the display.";
    } else if (plan.type === "fill_payment") {
      reply = "I've set up the donation form, but I'm having trouble with the display.";
    } else if (plan && "text" in plan) {
      reply = plan.text || "I'm having trouble processing your request right now.";
    } else {
      reply = "I'm having trouble processing your request right now.";
    }
  }

  // 3) Response payload your UI expects
  if (plan.type === "search_campaigns") {
    // Support both legacy (array) and new payload { results, action }
    let results: unknown = result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action = (result && typeof result === 'object' && 'action' in (result as any)) ? (result as any).action : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (result && typeof result === 'object' && 'results' in (result as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results = (result as any).results;
    }
    return NextResponse.json({ text: reply, reply, results, ...(action ? { action } : {}) });
  }
  if (plan.type === "open_payment") {
    const action = (typeof result === "object" && result && "action" in (result as Record<string, unknown>))
      ? (result as { action?: unknown }).action
      : undefined;
    return NextResponse.json({ text: reply, reply, action });
  }
  if (plan.type === "fill_payment") {
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
