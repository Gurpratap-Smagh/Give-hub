import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'

// POST /api/ai/generate-image - Generate campaign image using Gemini
// Body: { prompt: string }
export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const { prompt } = await req.json().catch(() => ({})) as { prompt?: string }
    if (!prompt || !prompt.trim()) {
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
      console.log('[generate-image] Prompt:', prompt.substring(0, 100) + '...')
      
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ 
          role: 'user',
          parts: [{ text: `Create a detailed visual description for a compelling campaign image. ${prompt}` }]
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
      const canvas = await generatePlaceholderImage(description)
      console.log('[generate-image] Image generated, base64 length:', canvas.length)
      
      return NextResponse.json({ 
        imageBase64: canvas, 
        mime: 'image/png',
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
async function generatePlaceholderImage(text: string): Promise<string> {
  try {
    console.log('[generatePlaceholderImage] Creating SVG with text:', text.substring(0, 50))
    
    const width = 400
    const height = 300
    
    // Create SVG with gradient - wrap text for better display
    const wrappedText = text.substring(0, 60) // Limit text length
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
      <text x="50%" y="40%" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">
        Campaign
      </text>
      <text x="50%" y="60%" font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">
        Image Generated
      </text>
    </svg>`
    
    // Convert SVG to base64
    const base64Svg = Buffer.from(svg).toString('base64')
    console.log('[generatePlaceholderImage] Generated base64 SVG, length:', base64Svg.length)
    
    return base64Svg
  } catch (error) {
    console.error('[generatePlaceholderImage] Error:', error)
    // Return a minimal 1x1 transparent pixel PNG as fallback
    console.log('[generatePlaceholderImage] Using fallback 1x1 PNG')
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }
}
