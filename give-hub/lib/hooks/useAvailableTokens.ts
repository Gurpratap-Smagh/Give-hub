import { useState, useEffect } from "react";

export type ByChain = Record<
  string,
  Array<{ symbol: string; address: string; decimals?: number }>
>;
export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

// Load from env (stringified JSON)
function loadFromEnv(): { byChain: ByChain; tokens: Token[] } {
  try {
    const raw = process.env.NEXT_PUBLIC_ZRC20_TOKENS || '';
    if (!raw) return { byChain: {}, tokens: [] };

    // Safe parse: handle wrapped quotes and double-encoded JSON
    const safeParse = (input: string): unknown => {
      let s = input.trim();
      // Strip wrapping single/double quotes if present
      if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        s = s.slice(1, -1).trim();
      }
      if (s.startsWith('{') || s.startsWith('[')) {
        return JSON.parse(s);
      }
      const once = JSON.parse(s);
      if (typeof once === 'string') {
        const inner = once.trim();
        if (inner.startsWith('{') || inner.startsWith('[')) {
          return JSON.parse(inner);
        }
      }
      return once;
    };

    const parsed = safeParse(raw) as Record<string, Array<{ symbol: string; address: string; decimals?: number }>>;

    const tokens: Token[] = [];
    for (const [chain, arr] of Object.entries(parsed || {})) {
      for (const item of arr || []) {
        const symbol = String(item.symbol || '').trim();
        tokens.push({
          address: String(item.address || '').toLowerCase(),
          symbol,
          decimals: Number.isFinite(Number(item.decimals)) ? Number(item.decimals) : (/USDC|USDT/i.test(symbol) ? 6 : 18),
          name: `${symbol} (${chain})`,
        });
      }
    }
    return { byChain: parsed as ByChain, tokens };
  } catch (e) {
    console.error("Failed to parse NEXT_PUBLIC_ZRC20_TOKENS", e, { preview: (process.env.NEXT_PUBLIC_ZRC20_TOKENS || '').slice(0, 80) });
    return { byChain: {}, tokens: [] };
  }
}

export const useAvailableTokens = () => {
  const [byChain, setByChain] = useState<ByChain>({});
  const [tokens, setTokens] = useState<Token[]>([]);

  useEffect(() => {
    const { byChain, tokens } = loadFromEnv();
    setByChain(byChain);
    setTokens(tokens);
  }, []);

  return {
    byChain,
    tokens,
    getTokenByAddress: (address: string): Token | undefined => {
      const normalized = address.toLowerCase();
      return tokens.find((t) => t.address === normalized);
    },
    getNativeToken: (): Token | undefined => {
      const zero = "0x0000000000000000000000000000000000000000";
      return tokens.find((t) => t.address.toLowerCase() === zero);
    },
    refetch: () => {
      const { byChain, tokens } = loadFromEnv();
      setByChain(byChain);
      setTokens(tokens);
    },
  };
};
