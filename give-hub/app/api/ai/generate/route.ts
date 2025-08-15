// Next.js App Router API route for Gemini integration
// Path: give-hub/app/api/ai/generate/route.ts
// Usage: POST /api/ai/generate { prompt: string }

import { NextRequest, NextResponse } from "next/server";
import { generateCampaignCopy } from "../../../../lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt as string | undefined;
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const text = await generateCampaignCopy(prompt);
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[AI] generate error", e);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
