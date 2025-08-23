// Next.js App Router API route for AI edit - Secured endpoint
// Path: give-hub/app/api/ai/edit/route.ts
// Usage: POST /api/ai/edit { input: string, instruction: string }

import { NextResponse } from "next/server";
import { generateEditedText } from "../../../../lib/gemini";
import { authMiddleware, type AuthedRequest } from '@/lib/auth';

export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const body = await req.json();
    const input = body?.input as string | undefined;
    const instruction = body?.instruction as string | undefined;
    if (!input || !instruction) {
      return NextResponse.json({ error: "Missing input or instruction" }, { status: 400 });
    }

    const text = await generateEditedText(input, instruction);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "AI edit failed" }, { status: 500 });
  }
})
