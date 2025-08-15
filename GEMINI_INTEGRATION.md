# Give-Hub: Gemini API Integration Guide

This guide shows how to integrate Google’s Gemini API into Give-Hub for features like content moderation, campaign copy generation, donor Q&A, or intelligent tagging.

Important: As of 2025, Google’s official SDK is the Google GenAI SDK. The older `@google/generative-ai` package is in limited maintenance. Prefer `@google/genai`.

- Official docs: https://ai.google.dev/gemini-api/docs/quickstart
- API keys: https://ai.google.dev/gemini-api/docs/api-key

## 1) Prerequisites

- Node.js v18+ (recommended Node 20+)
- A Gemini API key from Google AI Studio
- Package manager: npm, pnpm, or yarn

## 2) Install the SDK

```bash
# Install the official Google GenAI SDK
# (No code changes needed elsewhere if you import from "@google/genai")
npm install @google/genai
# or
pnpm add @google/genai
# or
yarn add @google/genai
```

## 3) Configure your API key

Add your Gemini API key to your environment. For local dev, create `.env` in the project root:

```bash
# .env
# TODO: REPLACE with your real API key from AI Studio
GEMINI_API_KEY=your_real_key_here
```

Never commit real keys. Use `.env.example` for placeholders.

## 4) Minimal usage example (JavaScript/TypeScript)

```ts
// src/lib/gemini.ts
// TODO: PLACE this file under your server-only code (do not import in client bundles)
import { GoogleGenerativeAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY; // <-- replace via .env
if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

export const genai = new GoogleGenerativeAI({ apiKey });

export async function generateCampaignCopy(prompt: string) {
  // TODO: You may replace the model with "gemini-2.0-pro" for higher quality
  // Be aware of cost/latency trade-offs
  const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
  const res = await model.generateContent({
    // TODO: You can inject a system prompt for tone/brand
    contents: [{ role: "user", parts: [{ text: prompt }]}],
  });
  // The SDK returns a response object with candidates and content text
  const text = res.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}
```

Example call:

```ts
import { generateCampaignCopy } from "./lib/gemini"; // <-- replace path based on your project layout

async function main() {
  const copy = await generateCampaignCopy(
    // TODO: Replace prompt with your campaign context
    "Write a concise, compelling crowdfunding story for providing clean water in rural areas."
  );
  console.log(copy);
}

main().catch(console.error);
```

## 5) Moderation and safe prompting

- Apply pre- and post-filters to keep content aligned with your policies.
- Consider a moderation pass (classify/flag) before publishing content.
- Prefer concise prompts and enforce output length to minimize cost/latency.

Example moderation prompt:

```ts
export async function moderateText(input: string) {
  // TODO: Replace with your policy-specific moderation prompt or a classifier
  const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: `Is the following text safe and non-harmful? Reply YES or NO.\n\n${input}` }]}],
  });
  const answer = res.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  return /^yes/i.test(answer);
}
```

## 6) Server-side usage only

- Do not expose API keys in the browser.
- Create simple server endpoints for AI actions (e.g., Next.js API routes, Express handlers, or server actions).

Example Express handler:

```ts
// server/app.ts (Express) — server-side only
// TODO: Replace import path to gemini util based on your structure
import express from "express";
import { generateCampaignCopy } from "../lib/gemini";

const app = express();
app.use(express.json());

app.post("/api/ai/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });
    const text = await generateCampaignCopy(prompt);
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default app;
```

## 7) Model selection tips

- Text: `gemini-2.0-flash` for speed/cost, `gemini-2.0-pro` for quality.
- Use system prompts to set tone and compliance.
- Add guardrails in your UI for user inputs.

## 8) Costs & quotas

- Review pricing/quotas in your Google account.
- Add rate limiting and caching where appropriate.

## 9) Testing

- Mock the SDK in unit tests to avoid API calls.
- Use `.env.test` with no real key; test code paths and error handling.

## 10) Security

- Keep keys in server-only env vars.
- Log redaction for prompts/responses.
- Validate inputs before sending to the model.

---

If you want, I can scaffold a small server endpoint in this repo that wraps `@google/genai` for campaign copy generation and moderation. 
