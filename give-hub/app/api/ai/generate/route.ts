// Next.js App Router API route for Gemini integration - Secured endpoint
// Path: give-hub/app/api/ai/generate/route.ts
// Usage: POST /api/ai/generate { prompt: string }

import { NextResponse } from "next/server";
import { generateCampaignCopy } from "../../../../lib/gemini";
import { authMiddleware, type AuthedRequest } from '@/lib/auth';

export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const body = await req.json();
    const prompt = body?.prompt as string | undefined;
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const text = await generateCampaignCopy(prompt);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
})
