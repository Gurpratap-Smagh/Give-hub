// app/api/ai/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { llmJSON } from "@/lib/ai/client";
import { PLANNER_PROMPT } from "@/lib/ai/prompts";
import { PlanSchema } from "@/lib/ai/planSchema";

function ensureJsonHint(): string {
  return "FORMAT: Return ONLY a strict single JSON object that matches the Plan schema. No prose, no markdown fences, no prefix/suffix.";
}

function stripMarkdownCodeBlocks(text: string): string {
  return text.replace(/^```(?:json|javascript|js)?\s*\n?/gm, "").replace(/\n?```$/gm, "").trim();
}

function extractFirstJSONObject(s: string): string | null {
  const text = (s || "").trim();
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
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') { inString = true; i++; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1); }
    i++;
  }
  return null;
}

function parsePlannerOutput(raw: unknown) {
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

export async function POST(req: NextRequest) {
  const { message, prompt, mode = "default", context, history } = await req.json();
  const userMessage = (prompt ?? message ?? "").toString();
  if (!userMessage.trim()) return NextResponse.json({ ok: false, error: "Missing message" }, { status: 400 });

  const ctxParts: string[] = [];
  if (history && Array.isArray(history) && history.length > 0) {
    const historyText = history.map((m: { role: 'user'|'assistant'; content: string }) => `${m.role}: ${m.content}`).join('\n');
    ctxParts.push(`Conversation History:\n${historyText}\n---`);
  }
  if (context) {
    if (Array.isArray(context) && (context as unknown[]).every((x) => typeof x === 'string')) {
      ctxParts.push(...(context as string[]));
    } else {
      try { ctxParts.push(JSON.stringify(context)); } catch { /* ignore */ }
    }
  }
  if (mode) ctxParts.push(`mode=${mode}`);
  ctxParts.push(ensureJsonHint());

  try {
    const raw = await llmJSON(userMessage, PLANNER_PROMPT, ctxParts);
    const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw);
    try {
      const plan = parsePlannerOutput(raw);
      return NextResponse.json({ ok: true, raw: rawText, plan });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, raw: rawText, error: msg }, { status: 422 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ usage: "POST { message: string, mode?: 'default'|'pay', context?: any, history?: {role,content}[] }" });
}
