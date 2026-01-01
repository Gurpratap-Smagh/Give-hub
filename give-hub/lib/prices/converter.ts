// lib/prices/converter.ts
// Demo/fake price table used for quick USD estimates in UI
// Keep in sync with .env token metadata when possible
export const TO_USD: Record<string, number> = {
  // Ethereum tokens
  ETH: 5000,
  zETH: 5000, // alias
  
  // BNB Chain tokens
  BNB: 650,
  
  // Stablecoins
  USDC: 1,
  USDT: 1,
  DAI: 1,
  
  // ZetaChain native
  ZETA: 10,
  WZETA: 10,
  
  // Bitcoin
  BTC: 100000,
  sBTC: 100000,
  
  // Fallback for unknown tokens
  UNKNOWN: 0,
};

export function toUSD(amount: string | number, symbol: string): number {
  const a = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(a)) return 0;
  
  // Normalize symbol: remove chain suffix and convert to uppercase
  const normalized = (symbol || '')
    .split('.')[0] // Remove chain suffix like ".zeta"
    .toUpperCase()
    .trim();
  
  const px = TO_USD[normalized] ?? TO_USD['UNKNOWN'] ?? 0;
  const result = a * px;
  
  return Number.isFinite(result) ? result : 0;
}
