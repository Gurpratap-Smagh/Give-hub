import { NextRequest, NextResponse } from 'next/server';

function computeAllowedOrigins() {
  const list = new Set<string>();
  list.add('http://localhost:3000');
  const prod = process.env.APP_ORIGIN; // e.g. https://your-app.vercel.app
  const prodAlt = process.env.APP_ORIGIN_ALT; // optional second origin
  if (prod) list.add(prod);
  if (prodAlt) list.add(prodAlt);
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (vercelUrl) list.add(vercelUrl);
  return Array.from(list);
}

function corsHeaders(origin?: string): HeadersInit {
  const headers: HeadersInit = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  };
  if (origin) {
    (headers as any)['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function handleCors(req: NextRequest): { headers: HeadersInit; preflight?: NextResponse; error?: NextResponse; origin: string | null } {
  const allowed = computeAllowedOrigins();
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    // Preflight: respond OK for known origins; ignore for unknown
    if (!origin || allowed.includes(origin)) {
      return { headers: corsHeaders(origin ?? undefined), preflight: new NextResponse(null, { status: 204, headers: corsHeaders(origin ?? undefined) }), origin };
    }
    return { headers: {}, error: NextResponse.json({ error: 'FORBIDDEN_ORIGIN' }, { status: 403 }) , origin };
  }

  // Requests with no Origin header are allowed (server-to-server or same-origin SSR)
  if (!origin) return { headers: {}, origin: null };

  if (!allowed.includes(origin)) {
    return { headers: {}, error: NextResponse.json({ error: 'FORBIDDEN_ORIGIN' }, { status: 403 }), origin };
  }

  return { headers: corsHeaders(origin), origin };
}
