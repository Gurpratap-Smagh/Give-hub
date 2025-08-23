import { NextResponse } from 'next/server'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'

// Minimal, local intent parser to avoid external dependency during build
type AiIntent = { action: 'search' | 'donate' | 'suggest' | 'clarify' | 'info' | 'chat' | 'reject'; params?: Record<string, unknown> };
function parseIntent(prompt: string): AiIntent {
  const p = (prompt || '').toLowerCase();
  if (/\b(donate|contribute|pledge)\b/.test(p)) return { action: 'donate', params: {} };
  if (/\b(search|find|look\s*for|discover)\b/.test(p)) return { action: 'search', params: { q: prompt } };
  if (/\b(suggest|recommend|ideas)\b/.test(p)) return { action: 'suggest', params: {} };
  if (/\b(hello|hi|hey)\b/.test(p)) return { action: 'info', params: { topic: 'greeting' } };
  return { action: 'chat', params: { prompt } };
}

// Secured AI intent parsing endpoint
export const POST = authMiddleware(async (request: AuthedRequest) => {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      )
    }

    const intent = parseIntent(prompt)
    
    return NextResponse.json(intent)
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
