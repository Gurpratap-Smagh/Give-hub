// lib/prices/converter.ts
export const TO_USD: Record<string, number> = {
  zETH: 3200,
  USDC: 1,
  WZETA: 0.2,
  sBTC: 60000,
};

export function toUSD(amount: string | number, symbol: string): number {
  const a = typeof amount === 'string' ? Number(amount) : amount;
  const px = TO_USD[symbol] ?? 0;
  return a * px;
}
