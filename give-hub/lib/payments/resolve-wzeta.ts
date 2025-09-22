// lib/payments/resolve-wzeta.ts
// Resolves the WZETA address for a given chain.
// Priority: optional JSON URL → environment variable fallback.

const isAddr = (x: unknown): x is string =>
  typeof x === "string" && /^0x[a-fA-F0-9]{40}$/.test(x);

type AddrJson = Record<string, any>;

function pickFromJson(json: AddrJson, chainId: number): string | undefined {
  const root =
    chainId === 7001
      ? json.testnet || json.athens || json.zevm_testnet || json
      : json.mainnet || json.zevm || json.zetachain || json;

  const candidates = [
    root?.contracts?.wzeta?.address,
    root?.contracts?.WZETA?.address,
    root?.wzeta,
    root?.WZETA,
    root?.tokens?.wzeta,
    root?.tokens?.WZETA,
  ].filter(Boolean);

  for (const c of candidates) if (isAddr(c)) return c;
  return undefined;
}

export async function resolveWZETA(chainId: number): Promise<string | undefined> {
  // 1) Try optional public JSON endpoint
  try {
    const url = process.env.NEXT_PUBLIC_ZETA_ADDRESSES_URL;
    if (url) {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as AddrJson;
        const a = pickFromJson(json, chainId);
        if (isAddr(a)) return a;
      }
    }
  } catch {
    // ignore errors and continue
  }

  // 2) Environment fallback
  const envMap: Record<number, string | undefined> = {
    7001: process.env.NEXT_PUBLIC_WZETA_ATHENS,  // ZEVM testnet (Athens)
    977: process.env.NEXT_PUBLIC_WZETA_MAINNET,  // mainnet (adjust chainId if needed)
  };

  const envAddr = envMap[chainId];
  return isAddr(envAddr) ? envAddr : undefined;
}
