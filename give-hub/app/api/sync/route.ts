import { NextResponse } from 'next/server'
import { syncOnce } from '@/lib/sync/indexer'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'

// This is a sensitive endpoint that can trigger blockchain syncing - require auth
export const GET = authMiddleware(async (req: AuthedRequest) => {
  try {
    const url = new URL(req.url)
    const maxRangeParam = url.searchParams.get('range')
    const range = maxRangeParam ? Math.max(100, Math.min(10000, Number(maxRangeParam) || 2000)) : 2000

    const res = await syncOnce(range)
    return NextResponse.json({ success: true, ...res })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'sync failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
})
