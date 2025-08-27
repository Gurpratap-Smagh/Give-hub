// app/ai/assistant/json.ts
import { PlanSchema } from "@/lib/ai/planSchema";
import type { Plan } from "@/lib/ai/planSchema";

// Remove markdown code blocks like ```json ... ``` or ``` ... ```
export function stripMarkdownCodeBlocks(text: string): string {
  return text.replace(/^```(?:json|javascript|js)?\s*\n?/gm, '').replace(/\n?```$/gm, '').trim();
}

// Ensure we strongly hint the LLM to return JSON only
export function ensureJsonHint(): string {
  return "FORMAT: Return ONLY a strict single JSON object that matches the Plan schema. No prose, no markdown fences, no prefix/suffix.";
}

// Find and extract the first balanced JSON object from a string
export function extractFirstJSONObject(s: string): string | null {
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
export function parsePlannerOutputOrThrow(raw: unknown): Plan {
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
