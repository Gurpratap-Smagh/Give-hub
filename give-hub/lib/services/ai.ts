/**
 * AI Service (Client-safe wrappers calling Next.js API routes)
 *
 * Endpoints:
 * - POST /api/ai/generate { prompt }
 * - POST /api/ai/edit { input, instruction }
 */

// Generate a campaign description using Gemini via our API route
export async function generateCampaignDescription(prompt: string): Promise<string> {
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`AI generate failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

// Generic edit helper: apply an instruction to input text
export async function editWithAI(input: string, instruction: string): Promise<string> {
  const res = await fetch("/api/ai/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, instruction }),
  });
  if (!res.ok) throw new Error(`AI edit failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

// Placeholder: recommendations (keep mock until a real recsys is implemented)
export async function getPersonalizedRecommendations(_userId: string): Promise<string[]> {
  return ["1", "3", "5"]; // TODO: replace with real personalization
}
