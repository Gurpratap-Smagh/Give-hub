// give-hub/lib/tokens/catalog.ts
// Centralized token catalog loaded from NEXT_PUBLIC_ZRC20_TOKENS
// Provides simple helpers to resolve token metadata by address.

export type TokenMeta = {
  address: string; // lowercase
  symbol: string;
  decimals: number;
  name: string;
  icon?: string;
};

let __tokens: TokenMeta[] | null = null;
let __byAddr: Record<string, TokenMeta> | null = null;

function parseEnvTokens(): TokenMeta[] {
  try {
    // Prefer client var when on browser; otherwise try both
    const raw = (typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_ZRC20_TOKENS || process.env.ZRC20_TOKENS)
      : (process.env.ZRC20_TOKENS || process.env.NEXT_PUBLIC_ZRC20_TOKENS)) || '';

    if (!raw) return [];

    // Safe JSON parsing: handle quoted or double-encoded JSON strings
    const safeParse = (input: string): unknown => {
      let s = input.trim();
      // Strip wrapping single/double quotes if present
      if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        s = s.slice(1, -1).trim();
      }
      // Case 1: looks like raw JSON
      if (s.startsWith('{') || s.startsWith('[')) {
        return JSON.parse(s);
      }
      // Case 2: quoted JSON -> parse once, then if result is a string containing JSON, parse again
      const once = JSON.parse(s);
      if (typeof once === 'string') {
        const inner = once.trim();
        if (inner.startsWith('{') || inner.startsWith('[')) {
          return JSON.parse(inner);
        }
      }
      return once;
    };

    let parsed: Record<string, unknown[]>;
    try {
      parsed = safeParse(raw) as Record<string, unknown[]>;
    } catch (e) {
      console.error('[tokens] Failed to parse ZRC20_TOKENS JSON:', e, { preview: String(raw).slice(0, 80) });
      return [];
    }

    const list: TokenMeta[] = [];
    for (const [chain, arr] of Object.entries(parsed)) {
      const items = Array.isArray(arr) ? arr : [];
      for (const it of items) {
        const item = it as { address?: unknown; symbol?: unknown; decimals?: unknown; icon?: unknown };
        const address = typeof item.address === 'string' ? item.address.toLowerCase() : '';
        if (!address || address.length !== 42) continue;
        const symbol = typeof item.symbol === 'string' && item.symbol.trim() ? item.symbol.trim() : 'TOKEN';
        const decimalsRaw = typeof item.decimals === 'number' ? item.decimals : Number(item.decimals);
        const decimals = Number.isFinite(Number(decimalsRaw))
          ? Number(decimalsRaw)
          : (/USDC|USDT/i.test(symbol) ? 6 : 18);
        const icon = item.icon as string | undefined;
        list.push({
          address,
          symbol,
          decimals,
          name: `${symbol} (${chain})`,
          icon,
        });
      }
    }
    return list;
  } catch (e) {
    console.error('[tokens] Failed to parse NEXT_PUBLIC_ZRC20_TOKENS:', e);
    return [];
  }
}

function ensureCatalog() {
  if (!__tokens) {
    __tokens = parseEnvTokens();
    __byAddr = Object.create(null);
    for (const t of __tokens) __byAddr![t.address] = t;

    // Fallback: ensure WZETA is present if NEXT_PUBLIC_WZETA_ADDRESS is set
    try {
      const wzAddr = (process.env.NEXT_PUBLIC_WZETA_ADDRESS || '').toLowerCase();
      if (wzAddr && wzAddr.length === 42 && !__byAddr![wzAddr]) {
        const wzeta = {
          address: wzAddr,
          symbol: 'WZETA',
          decimals: 18,
          name: 'WZETA (ZETA)'
        } as TokenMeta;
        __tokens.push(wzeta);
        __byAddr![wzAddr] = wzeta;
      }
    } catch {}
  }
}

export function getAllTokens(): TokenMeta[] {
  ensureCatalog();
  return __tokens!;
}

export function getTokenByAddress(address: string): TokenMeta | undefined {
  ensureCatalog();
  const key = String(address || '').toLowerCase();
  const found = __byAddr![key];
  if (found) return found;
  // Alias ZERO -> WZETA if configured
  if (key === '0x0000000000000000000000000000000000000000') {
    const wz = (process.env.NEXT_PUBLIC_WZETA_ADDRESS || '').toLowerCase();
    if (wz && __byAddr![wz]) return __byAddr![wz];
  }
  return undefined;
}

export function getNativeToken(): TokenMeta | undefined {
  // Convention: zero address entry, if provided in env
  return getTokenByAddress('0x0000000000000000000000000000000000000000');
}
