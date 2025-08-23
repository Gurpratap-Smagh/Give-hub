import { NextRequest, NextResponse } from 'next/server';
import { handleCors } from '@/lib/cors';

export const dynamic = 'force-dynamic';

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
  return jsonOk({ ok: true }, headers);
}
