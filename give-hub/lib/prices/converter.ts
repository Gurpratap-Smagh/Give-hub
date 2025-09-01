// lib/prices/converter.ts
// Demo/fake price table used for quick USD estimates in UI
// Keep in sync with .env token metadata when possible
export const TO_USD: Record<string, number> = {
  ETH: 5000,
  zETH: 5000, // alias
  USDC: 1,
  ZETA: 10,
  WZETA: 10,
  sBTC: 60000,
};

export function toUSD(amount: string | number, symbol: string): number {
  const a = typeof amount === 'string' ? Number(amount) : amount;
  const px = TO_USD[symbol] ?? 0;
  return a * px;
}
