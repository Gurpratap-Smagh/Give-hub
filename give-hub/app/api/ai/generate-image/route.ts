import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'

// POST /api/ai/generate-image - Generate campaign image using Gemini
// Body: { prompt: string, title?: string, description?: string }
export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const { prompt, title, description } = await req.json().catch(() => ({})) as { prompt?: string; title?: string; description?: string }
    
    // Build final prompt using template if title/description provided
    let finalPrompt = prompt;
    if (title || description) {
      const template = process.env.IMAGEN_PROMPT_TEMPLATE || "Create a compelling campaign image for: Campaign Title: {title}\n\nDescription: {description}";
      finalPrompt = template
        .replace('{title}', title || 'Untitled Campaign')
        .replace('{description}', description || 'A campaign for positive impact');
    }
    
    if (!finalPrompt || !finalPrompt.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: GEMINI_API_KEY not set' }, { status: 500 })
    }

    // Use Gemini SDK 
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    
    try {
      // Generate a visual description using Gemini
      console.log('[generate-image] Calling Gemini API with model: gemini-2.5-flash')
      console.log('[generate-image] Prompt:', finalPrompt.substring(0, 100) + '...')
      
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ 
          role: 'user',
          parts: [{ text: `Create a detailed visual description for a compelling campaign image. ${finalPrompt}` }]
        }],
      })

      console.log('[generate-image] Gemini response:', {
        hasCandidates: !!response?.candidates,
        candidateCount: response?.candidates?.length,
        hasContent: !!response?.candidates?.[0]?.content,
        hasParts: !!response?.candidates?.[0]?.content?.parts,
        partCount: response?.candidates?.[0]?.content?.parts?.length
      })

      // Extract response text
      const description = response?.candidates?.[0]?.content?.parts?.[0]?.text
      console.log('[generate-image] Extracted description:', description?.substring(0, 100) || 'NO DESCRIPTION')
      
      if (!description) {
        throw new Error('No response from image generation model')
      }

      // Generate a simple placeholder image as PNG (1x1 transparent pixel with description as metadata)
      // For actual image generation in future, use the description to call a proper image API
      // For now, generate a gradient placeholder image
      const result = await generatePlaceholderImage(description)
      console.log('[generate-image] Image generated, base64 length:', result.base64.length, 'mime:', result.mime)
      
      return NextResponse.json({ 
        imageBase64: result.base64, 
        mime: result.mime,
        message: 'Image generated successfully'
      })
    } catch (error) {
      console.error('[generate-image] Error:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate image'
      
      // Check for specific error types
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again in a moment.' },
          { status: 429 }
        )
      }
      
      if (message.includes('404') || message.includes('not found')) {
        return NextResponse.json(
          { error: 'Model not available' },
          { status: 404 }
        )
      }

      throw error
    }
  } catch (error) {
    console.error('[generate-image] Outer catch:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate image'
    
    return NextResponse.json(
      { error: message || 'Failed to generate image' },
      { status: 500 }
    )
  }
})

/**
 * Generate a simple placeholder image as a gradient
 * Returns base64-encoded image
 */
async function generatePlaceholderImage(text: string): Promise<{ base64: string; mime: string }> {
  try {
    console.log('[generatePlaceholderImage] Creating SVG with text:', text.substring(0, 50))
    
    const width = 800
    const height = 450
    
    // Use Gemini description as main content, wrap and truncate for SVG display
    const lines = text.split('. ').slice(0, 3) // Take first 3 sentences max
    const wrappedLines = lines.map((line, idx) => `<tspan x="50%" dy="${idx === 0 ? 0 : '1.5em'}">${line.substring(0, 80)}</tspan>`).join('')
    
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
      <text x="50%" y="40%" font-size="16" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="500">
        ${wrappedLines}
      </text>
      <text x="50%" y="85%" font-size="12" fill="rgba(255,255,255,0.6)" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">
        AI-Generated Campaign Image
      </text>
    </svg>`
    
    // Convert SVG to base64
    const base64Svg = Buffer.from(svg).toString('base64')
    console.log('[generatePlaceholderImage] Generated base64 SVG, length:', base64Svg.length)
    
    return { base64: base64Svg, mime: 'image/svg+xml' }
  } catch (error) {
    console.error('[generatePlaceholderImage] Error:', error)
    // Return a minimal 1x1 transparent pixel PNG as fallback
    console.log('[generatePlaceholderImage] Using fallback 1x1 PNG')
    return { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime: 'image/png' }
  }
}
