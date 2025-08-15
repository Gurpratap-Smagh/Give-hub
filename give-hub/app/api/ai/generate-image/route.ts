import { NextResponse } from 'next/server'
import { getGenAI } from '@/lib/gemini'
import { Modality } from '@google/genai'
import type { GenerateContentResponse } from '@google/genai'

// POST /api/ai/generate-image
// Body: { prompt: string }
export async function POST(req: Request) {
  try {
    const { prompt } = await req.json().catch(() => ({})) as { prompt?: string }
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    // Use official SDK (same helper as other AI routes) for consistent schema handling
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: GEMINI_API_KEY not set' }, { status: 500 })
    }

    const genai = getGenAI()
    // Imagen toggle and models
    const useImagen = (process.env.USE_IMAGEN || '').toLowerCase() === 'true'
    const imagenModel = process.env.IMAGEN_MODEL || 'imagen-4.0-generate-preview-06-06'
    // Legacy preview image model (may not be available to all keys/projects)
    const model = 'gemini-2.0-flash-preview-image-generation'
    let sdkRes: GenerateContentResponse | null = null
    let sdkError: string | null = null

    // Attempt Imagen first when enabled
    if (useImagen) {
      try {
        // GoogleGenAI client returned by getGenAI supports models.generateImages
        // Provide a minimal, forward-compatible type to avoid relying on any
        type GenerateImagesFn = (args: {
          model: string
          prompt: string
          config?: { numberOfImages?: number }
        }) => Promise<{ generatedImages?: Array<{ image?: { imageBytes?: string } }> }>
        const maybeGenerateImages: unknown = (genai as unknown as { models?: Record<string, unknown> })?.models?.['generateImages']
        const generateImages = typeof maybeGenerateImages === 'function' ? (maybeGenerateImages as GenerateImagesFn) : null
        const imgRes = generateImages ? await generateImages({
          model: imagenModel,
          prompt,
          config: { numberOfImages: 1 },
        }) : null
        if (imgRes && Array.isArray(imgRes.generatedImages)) {
          for (const gi of imgRes.generatedImages) {
            const bytes = gi?.image?.imageBytes
            if (typeof bytes === 'string' && bytes) {
              return NextResponse.json({ imageBase64: bytes, mime: 'image/png', provider: 'imagen' })
            }
          }
        }
      } catch (err) {
        sdkError = err instanceof Error ? err.message : 'Imagen call failed'
        // Fall through to legacy flow
      }
    }
    try {
      sdkRes = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      })
    } catch (err) {
      sdkError = err instanceof Error ? err.message : 'Unknown error calling Gemini SDK'
    }

    // Robust extraction of inline image (handles different casing)
    let base64 = ''
    try {
      if (sdkRes) {
        const resUnknown: unknown = sdkRes
        // Pull candidates from either top-level or nested response
        const candidatesUnknown = ((): unknown => {
          if (resUnknown && typeof resUnknown === 'object') {
            const r = resUnknown as { candidates?: unknown; response?: { candidates?: unknown } }
            return Array.isArray(r.candidates)
              ? r.candidates
              : (r.response && Array.isArray(r.response.candidates) ? r.response.candidates : [])
          }
          return []
        })()

        const candidates = Array.isArray(candidatesUnknown) ? candidatesUnknown : []
        for (const cUnknown of candidates) {
          const partsUnknown = (() => {
            if (cUnknown && typeof cUnknown === 'object') {
              const cObj = cUnknown as { content?: { parts?: unknown }, parts?: unknown }
              const parts = (cObj.content && Array.isArray(cObj.content.parts)) ? cObj.content.parts
                : (Array.isArray(cObj.parts) ? cObj.parts : [])
              return parts
            }
            return []
          })()
          const parts = Array.isArray(partsUnknown) ? partsUnknown : []
          for (const pUnknown of parts) {
            if (pUnknown && typeof pUnknown === 'object') {
              const p = pUnknown as { inline_data?: { data?: string }, inlineData?: { data?: string }, text?: unknown }
              const d1 = p.inline_data?.data
              const d2 = p.inlineData?.data
              if (typeof d1 === 'string' && d1) { base64 = d1; break }
              if (typeof d2 === 'string' && d2) { base64 = d2; break }
              if (typeof p.text === 'string' && /^data:image\//.test(p.text)) {
                const m = p.text.match(/base64,([^\s]+)/)
                if (m) { base64 = m[1]; break }
              }
            }
          }
          if (base64) break
        }
      }
    } catch {}

    if (!base64) {
      // Fallback to REST (some SDK versions may not expose preview image model fully)
      try {
        const apiKey = process.env.GEMINI_API_KEY as string
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
        const restRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }]}],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
          })
        })
        const rawText = await restRes.text()
        if (!restRes.ok) {
          return NextResponse.json({ error: 'Gemini request failed', status: restRes.status, details: rawText || sdkError }, { status: 502 })
        }
        let restJson: unknown = {}
        try { restJson = rawText ? JSON.parse(rawText) : {} } catch {}
        // Extract from REST JSON
        const extractFromRest = (data: unknown): string => {
          if (!data || typeof data !== 'object') return ''
          const d = data as { candidates?: unknown }
          const cands = Array.isArray(d.candidates) ? d.candidates : [] as unknown[]
          for (const cUnknown of cands) {
            if (!cUnknown || typeof cUnknown !== 'object') continue
            const cObj = cUnknown as { content?: { parts?: unknown } }
            const parts = cObj.content?.parts
            if (Array.isArray(parts)) {
              for (const pUnknown of parts) {
                if (!pUnknown || typeof pUnknown !== 'object') continue
                const p = pUnknown as { inline_data?: { data?: string }, inlineData?: { data?: string }, text?: unknown }
                const d1 = p.inline_data?.data
                const d2 = p.inlineData?.data
                if (typeof d1 === 'string' && d1) return d1
                if (typeof d2 === 'string' && d2) return d2
                if (typeof p.text === 'string' && /^data:image\//.test(p.text)) {
                  const m = p.text.match(/base64,([^\s]+)/)
                  if (m) return m[1]
                }
              }
            }
          }
          return ''
        }
        const b64 = extractFromRest(restJson)
        if (!b64) {
          const pf = sdkRes ? (sdkRes as unknown as { promptFeedback?: unknown })?.promptFeedback : undefined
          return NextResponse.json({ error: 'No inline image returned', promptFeedback: pf, raw: restJson || rawText, sdkError }, { status: 200 })
        }
        return NextResponse.json({ imageBase64: b64, mime: 'image/png' })
      } catch (restErr) {
        const msg = restErr instanceof Error ? restErr.message : 'Unknown REST fallback error'
        return NextResponse.json({ error: 'Gemini request failed', details: msg, sdkError }, { status: 502 })
      }
    }

    return NextResponse.json({ imageBase64: base64, mime: 'image/png' })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
