import { NextResponse } from 'next/server'

type Token = { symbol: string; address: string }
type ByChain = Record<string, Token[]>
type JsonToken = { symbol?: string; address?: string }

function parseZrc20(raw: string | undefined): ByChain {
  const byChain: ByChain = {}
  if (!raw) return byChain

  const isZero = (addr: string) => /^0x0{40}$/i.test(addr)

  const tryJson = (s: string): ByChain | null => {
    try {
      let trimmed = s.trim()
      // Strip wrapping quotes if present: ' {...} ' or " {...} "
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        trimmed = trimmed.slice(1, -1).trim()
      }
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: ByChain = {}
        const entries = Object.entries(parsed as Record<string, JsonToken[]>) as Array<[
          string,
          JsonToken[]
        ]>
        for (const [chainKey, arr] of entries) {
          const chain = String(chainKey).toUpperCase()
          for (const item of (arr || [])) {
            const symbol = String(item.symbol || '').trim()
            const address = String(item.address || '').trim()
            if (!symbol || !address || isZero(address)) continue
            if (!out[chain]) out[chain] = []
            if (!out[chain].some(t => t.symbol === symbol)) out[chain].push({ symbol, address })
          }
        }
        return out
      }
      return null
    } catch {
      return null
    }
  }

  // Prefer JSON if provided; otherwise fallback to CSV
  const fromJson = tryJson(raw)
  if (fromJson) {
    for (const c of Object.keys(fromJson)) {
      fromJson[c].sort((a, b) => a.symbol.localeCompare(b.symbol))
    }
    return fromJson
  }

  // CSV format: SYMBOL.CHAIN=0x...
  for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const [k, address] = pair.split('=') as [string, string]
    // skip bad or zero addresses
    if (!k || !address || isZero(address)) continue
    const [symbol, chainRaw] = k.split('.')
    const chain = (chainRaw ?? 'ZETA').toUpperCase()

    if (!byChain[chain]) byChain[chain] = []
    // de-dupe within chain by symbol
    if (!byChain[chain].some(t => t.symbol === symbol)) {
      byChain[chain].push({ symbol, address })
    }
  }

  // stable sort each chain's tokens
  for (const c of Object.keys(byChain)) {
    byChain[c].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }
  return byChain
}

// Public token options endpoint - these addresses are already public on-chain
export async function GET() {
  const raw = process.env.ZRC20_TOKENS || process.env.NEXT_PUBLIC_ZRC20_TOKENS;
  const byChain = parseZrc20(raw);
  return NextResponse.json({ byChain });
}
