// give-hub/lib/donations/formatter.ts
// Centralized formatter for mapping decoded donation events to UI-friendly data.

import type { DonationEvent } from "@/lib/hooks/useDonationEvents";
import { getTokenByAddress } from "@/lib/tokens/catalog";
import { toUSD } from "@/lib/prices/converter";

export type FormattedDonation = {
  id: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;

  name: string;
  note: string;

  tokenAddress: string;
  symbol: string;
  icon?: string;
  decimals: number;

  // Amounts (human-readable strings as emitted by useDonationEvents)
  amount: string; // originalAmount
  convertedAmount: string;

  amountFormatted: string; // e.g. "1.25 WZETA"
  usd?: number; // numeric USD estimate (0 if unknown)
  usdFormatted: string; // e.g. "$2.50" or "-"
};

function formatUsd(amountHuman: string, symbol: string): { usd: number; usdFormatted: string } {
  // Normalize: strip chain suffix like 'USDC.zeta' -> 'USDC'
  const base = (symbol || '').split('.')[0];
  const usd = toUSD(amountHuman, base);
  if (!usd || !Number.isFinite(usd) || usd <= 0) return { usd: 0, usdFormatted: "-" };
  // Show very small amounts as "<1$" for better UX
  if (usd > 0 && usd < 1) {
    return { usd, usdFormatted: "<1$" };
  }
  const usdFormatted = `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return { usd, usdFormatted };
}

export function formatDonationEvent(ev: DonationEvent): FormattedDonation {
  const token = getTokenByAddress(ev.originalToken);
  try {
    // Debug: single concise log
    console.log('[token-debug]', {
      originalToken: ev.originalToken,
      matched: token ?? null,
      symbol: token?.symbol ?? 'UNKNOWN',
    });
  } catch {
    // no-op
  }
  const symbol = token?.symbol || "UNKNOWN";
  const icon = token?.icon;
  const decimals = token?.decimals ?? 18;

  const name = ev.donorName && ev.donorName.trim() ? ev.donorName : "Anonymous";

  const amount = ev.originalAmount; // already human-formatted in hook using token decimals
  const convertedAmount = ev.convertedAmount; // ditto
  const amountFormatted = `${amount} ${symbol}`;

  const { usd, usdFormatted } = formatUsd(amount, symbol);

  return {
    id: ev.id,
    blockNumber: ev.blockNumber,
    logIndex: ev.logIndex,
    txHash: ev.txHash,

    name,
    note: ev.note,

    tokenAddress: ev.originalToken,
    symbol,
    icon,
    decimals,

    amount,
    convertedAmount,
    amountFormatted,
    usd,
    usdFormatted,
  };
}

export function formatDonationEvents(events: DonationEvent[]): FormattedDonation[] {
  return events
    .slice()
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
    .map(formatDonationEvent);
}
