
/**
 * Accepts multiple env shapes and normalizes to:
 * {
 *   byChain: {
 *     ZETA:   [{ symbol, address? }],   // ZEVM tokens; native ZETA is injected on the client
 *     SEPOLIA:[{ symbol, address? }],
 *     ...
 *   }
 * }
 *
 * Supported envs (use either var):
 * - ZRC20_TOKENS or NEXT_PUBLIC_ZRC20_TOKENS
 * - JSON object keyed by chain → array of token objects
 *   e.g. { "ZEVM":[{"symbol":"WZETA","address":"0x..."}], "SEPOLIA":[{"symbol":"USDC","address":"0x..."}] }
 * - JSON object keyed by chain → object map of symbol → address
 *   e.g. { "ZEVM": { "WZETA":"0x..." } }
 * - CSV of pairs: SYMBOL.CHAIN=0x...,SYMBOL2.CHAIN2=0x...
 *   e.g. WZETA.ZEVM=0x...,USDC.SEPOLIA=0x...
 */

type OutToken = { symbol: string; address?: string };


function upper(s: string | undefined): string {
  return (s || "").trim().toUpperCase();
}

function isHexAddr(addr: unknown): addr is string {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function isZero(addr: string): boolean {
  return /^0x0{40}$/i.test(addr);
}

function normChainKey(k: string): string {
  const u = upper(k);
  if (u === "ZEVM" || u === "ZETACHAIN") return "ZETA"; // align with UI
  return u;
}

function push(by: ByChain, chain: string, tok: OutToken) {
  if (!by[chain]) by[chain] = [];
  // de-dupe by symbol (last write wins)
  const i = by[chain].findIndex(t => upper(t.symbol) === upper(tok.symbol));
  if (i >= 0) by[chain][i] = tok; else by[chain].push(tok);
}

function parseJsonObject(obj: any): ByChain {
  const by: ByChain = {};

  // Case A: { CHAIN: [ {symbol,address,...}, ... ] }
  for (const [k, v] of Object.entries(obj)) {
    const chain = normChainKey(k);

    if (Array.isArray(v)) {
      for (const t of v as any[]) {
        const symbol = typeof t?.symbol === "string" ? t.symbol : undefined;
        const address = t?.address;
        if (!symbol) continue;
        if (address && (!isHexAddr(address) || isZero(address))) continue; // skip bad
        push(by, chain, { symbol, address: address || undefined });
      }
      continue;
    }

    // Case B: { CHAIN: { SYMBOL: "0x..", SYMBOL2: "0x.." } }
    if (v && typeof v === "object") {
      for (const [sym, addr] of Object.entries(v)) {
        const symbol = String(sym);
        if (isHexAddr(addr) && !isZero(addr)) {
          push(by, chain, { symbol, address: addr });
        } else {
          // allow native sentinel passthrough if provided explicitly
          if (addr === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
            push(by, chain, { symbol, address: undefined });
          }
        }
      }
      continue;
    }
  }

  return by;
}

function tryParseJson(raw: string): ByChain | null {
  try {
    let s = raw.trim();
    // strip accidental wrapping quotes if present
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      s = s.slice(1, -1);
    }
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === "object") {
      return parseJsonObject(parsed);
    }
  } catch {
    // fall through to CSV
  }
  return null;
}

function parseCsv(raw: string): ByChain {
  const by: ByChain = {};
  const parts = raw.split(',').map(x => x.trim()).filter(Boolean);
  for (const p of parts) {
    const [lhs, rhs] = p.split('=').map(x => x.trim());
    if (!lhs || !rhs) continue;
    const m = lhs.match(/^(?<sym>[A-Za-z0-9_.:-]+)\.(?<chain>[A-Za-z0-9_:-]+)$/);
    if (!m?.groups) continue;
    const sym = m.groups.sym;
    const chain = normChainKey(m.groups.chain);
    if (isHexAddr(rhs) && !isZero(rhs)) {
      push(by, chain, { symbol: sym, address: rhs });
    }
  }
  return by;
}

function parseEnvToByChain(raw: string | undefined): ByChain {
  if (!raw) return {};
  const json = tryParseJson(raw);
  const by = json ?? parseCsv(raw);
  // sort tokens within chains
  for (const c of Object.keys(by)) {
    by[c].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
  return by;
}

// app/api/zrc20-options/route.ts
import { NextResponse } from 'next/server';
import { resolveWZETA } from '@/lib/payments/resolve-wzeta';

type Token = { symbol: string; address?: string };
type ByChain = Record<string, Token[]>;

// Native sentinels (do NOT change these)
const NATIVE = {
  ZETA: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const,
  ETH: undefined as undefined, // native ETH has no ERC-20 address
};

// Small helper to add-if-missing
function pushUnique(arr: Token[], t: Token) {
  const key = `${t.symbol}:${(t.address ?? 'native').toLowerCase()}`;
  const seen = new Set(arr.map(x => `${x.symbol}:${(x.address ?? 'native').toLowerCase()}`));
  if (!seen.has(key)) arr.push(t);
}

export async function GET() {
  const byChain: ByChain = {};

  // -----------------------------
  // ZETA: native + WZETA
  // -----------------------------
  byChain.ZETA = byChain.ZETA ?? [];

  // Native ZETA sentinel (always first)
  if (!byChain.ZETA.some(t => t.symbol === 'ZETA' && t.address === NATIVE.ZETA)) {
    byChain.ZETA.unshift({ symbol: 'ZETA', address: NATIVE.ZETA });
  }

  // WZETA (resolver: JSON URL -> ENV)
  try {
    const wzeta = await resolveWZETA(7001); // Athens ZEVM testnet (change if you target another chainId)
    if (wzeta) pushUnique(byChain.ZETA, { symbol: 'WZETA', address: wzeta });
  } catch (err) {
    // Non-fatal: API still returns native ZETA
    console.error('[zrc20-options] Failed to resolve WZETA:', err);
  }

  // -----------------------------
  // SEPOLIA: native ETH only by default
  // (avoid confusion with ERC-20 ETH)
  // -----------------------------
  byChain.SEPOLIA = byChain.SEPOLIA ?? [];
  if (!byChain.SEPOLIA.some(t => t.symbol?.toUpperCase() === 'ETH' && t.address === NATIVE.ETH)) {
    // Native ETH has no address in our schema
    byChain.SEPOLIA.unshift({ symbol: 'ETH', address: NATIVE.ETH });
  }

  // If you want to *also* expose specific ERC-20s on Sepolia, do it explicitly here.
  // Example (commented out):
  // const SOME_ERC20 = process.env.NEXT_PUBLIC_SOME_SEPOLIA_ERC20?.trim();
  // if (SOME_ERC20 && /^0x[a-fA-F0-9]{40}$/.test(SOME_ERC20)) {
  //   pushUnique(byChain.SEPOLIA, { symbol: 'USDC', address: SOME_ERC20 });
  // }

  // -----------------------------
  // Return
  // -----------------------------
  return NextResponse.json({ byChain }, { status: 200 });
}
