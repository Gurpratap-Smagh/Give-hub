import { NextResponse } from 'next/server'
import { InferenceClient } from "@huggingface/inference";
import { authMiddleware, type AuthedRequest } from '@/lib/auth'

export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const { prompt, title, description } = await req.json().catch(() => ({})) as { prompt?: string; title?: string; description?: string }
    
    // 1. Build the prompt
    let finalPrompt = prompt || 'A compelling campaign image';
    if (title || description) {
      const template = process.env.IMAGEN_PROMPT_TEMPLATE || "A professional campaign poster for '{title}'. {description}. High resolution, 4k.";
      finalPrompt = template
        .replace('{title}', title || 'Untitled')
        .replace('{description}', description || '');
    }

    if (!process.env.HF_TOKEN) {
      return NextResponse.json({ error: 'Server misconfiguration: HF_TOKEN not set' }, { status: 500 })
    }

    // 2. Initialize Hugging Face Inference Client
    const hf = new InferenceClient(process.env.HF_TOKEN);

    console.log('[generate-image] Calling Hugging Face with model: FLUX.1-dev');

    // 3. Generate the image (Returns a Blob)
    const blob = await hf.textToImage({
      model: "stabilityai/stable-diffusion-xl-base-1.0",
      inputs: finalPrompt,
      provider: "nscale", // Nebius is often faster for free-tier users
      parameters: { num_inference_steps: 5 }, // Fast generation
    });

    // 4. Convert Blob to Base64 (Server-side compatible)
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageBase64 = buffer.toString('base64');

    return NextResponse.json({ 
      imageBase64: imageBase64, 
      mime: blob.type || 'image/png', 
      message: 'Image generated successfully with Hugging Face' 
    });

  } catch (error: any) {
    console.error('[generate-image] Error:', error);
    
    // Handle specific Hugging Face errors (like rate limits)
    if (error.message?.includes('429')) {
      return NextResponse.json({ error: 'Hugging Face rate limited. Try again in a minute.' }, { status: 429 });
    }

    return NextResponse.json({ error: error.message || 'Failed to generate image' }, { status: 500 });
  }
})