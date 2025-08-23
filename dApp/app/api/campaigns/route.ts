import { NextRequest, NextResponse } from 'next/server';
import { handleCors } from '@/lib/cors';
import { rateLimit } from '@/lib/rateLimit';
import { campaignCreateSchema } from '@/lib/validation/campaign';
import { find, insertOne, DataApiError } from '@/lib/dataApi';

export const dynamic = 'force-dynamic';

function ipFrom(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || (req as any).ip || 'unknown';
}

function jsonError(code: string, status: number, message?: string, headers?: HeadersInit) {
  return NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status, headers });
}

function jsonOk(data: any, headers?: HeadersInit) {
  return NextResponse.json(data, { status: 200, headers });
}

export function OPTIONS(req: NextRequest) {
  const { preflight, error } = handleCors(req);
  if (preflight) return preflight;
  return error ?? NextResponse.json({}, { status: 204 });
}

export async function GET(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;
  try {
    const docs = await find('campaigns', { filter: {}, sort: { createdAt: -1 }, limit: 50 });
    return jsonOk({ campaigns: docs }, headers);
  } catch (e: any) {
    const err = e as DataApiError;
    console.error('GET /api/campaigns failed', { code: err.code });
    return jsonError(err.code || 'DB_ERROR', err.status || 502, undefined, headers);
  }
}

export async function PUT(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;
  return jsonError('METHOD_NOT_ALLOWED', 405, 'Use GET or POST', headers);
}

export async function DELETE(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;
  return jsonError('METHOD_NOT_ALLOWED', 405, 'Use GET or POST', headers);
}

export async function PATCH(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;
  return jsonError('METHOD_NOT_ALLOWED', 405, 'Use GET or POST', headers);
}

export async function HEAD(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;
  return new NextResponse(null, { status: 200, headers });
}

export async function POST(req: NextRequest) {
  const { headers, error } = handleCors(req);
  if (error) return error;

  const ip = ipFrom(req);
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return jsonError('RATE_LIMITED', 429, 'Too many requests', { ...headers, 'RateLimit-Remaining': String(rl.remaining), 'RateLimit-Reset': String(rl.reset) });
  }

  // Auth placeholder (JWT/session):
  // const user = await getSessionUser(req);
  // if (!user) return jsonError('UNAUTHORIZED', 401, 'Sign in required', headers);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('BAD_JSON', 400, 'Invalid JSON', headers);
  }

  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join('.') || 'field'}: ${first.message}` : 'Validation error';
    return jsonError('VALIDATION_ERROR', 400, msg, headers);
  }

  const now = new Date().toISOString();
  const doc = { ...parsed.data, createdAt: now } as Record<string, unknown>;

  try {
    const insertedId = await insertOne('campaigns', doc);
    return NextResponse.json({ id: insertedId, campaign: { _id: insertedId, ...doc } }, { status: 201, headers });
  } catch (e: any) {
    const err = e as DataApiError;
    console.error('POST /api/campaigns failed', { code: err.code });
    return jsonError(err.code || 'DB_ERROR', err.status || 502, undefined, headers);
  }
}
