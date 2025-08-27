// lib/payments/index.ts
'use client';

import { BrowserProvider, Contract, parseEther, parseUnits } from 'ethers';
import { ensureWalletOnChain } from '@/lib/web3/client';

// Crowdfund ABI supports native and ZRC-20 paths (handle naming drift)
const CROWDFUND_ABI = [
  // native payable (wraps to WZETA internally if your contract does that)
  'function donateNative(uint256 campaignId, string donorName, string note) payable',
  'function donateToCampaign(uint256 campaignId, string donorName, string note) payable',

  // ZRC-20 path
  'function donateZRC20ToCampaign(uint256 campaignId, address token, uint256 amount, string donorName, string note)',
  'function donateZRC20(uint256 campaignId, address token, uint256 amount, string donorName, string note)',
] as const;

const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
] as const;

/** Parse a human amount into bigint with token decimals (safe with bigint decimals). */
export function normalizeAmount(input: string | number, decimals: number | bigint): bigint {
  const d = typeof decimals === 'bigint' ? Number(decimals) : decimals;
  const s = String(input).trim().replace(/,/g, '.');
  if (!s || Number.isNaN(Number(s))) throw new Error('Invalid amount');
  return parseUnits(s, d);
}

/** Extract a friendly RPC/wallet error message. */
export function extractRpcError(err: unknown): string {
  const e = err as any;
  const raw =
    e?.shortMessage ||
    e?.info?.error?.message ||
    e?.error?.message ||
    e?.reason ||
    e?.message ||
    String(err);
  return String(raw)
    .replace(/^execution reverted:?/i, '')
    .replace(/\(unknown=\w+\)/g, '')
    .replace(/user rejected(.*)$/i, 'User rejected the request')
    .trim();
}

/** Wrap tx flow with user-visible status updates. */
export async function sendWithStatus<T>(
  action: () => Promise<T>,
  setStatus?: (s: string) => void,
): Promise<T> {
  try {
    setStatus?.('Waiting for wallet…');
    const tx: any = await action();
    if (tx?.hash && typeof tx.wait === 'function') {
      setStatus?.('Transaction sent. Waiting for confirmation…');
      const receipt = await tx.wait();
      setStatus?.('Confirmed ✅');
      return (receipt ?? tx) as T;
    }
    setStatus?.('Done');
    return tx as T;
  } catch (err) {
    const msg = extractRpcError(err);
    setStatus?.(`Error: ${msg}`);
    throw err;
  }
}

function requireEnv() {
  const contract = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT;
  const WZETA = process.env.NEXT_PUBLIC_WZETA_ADDRESS;
  if (!contract) throw new Error('Missing NEXT_PUBLIC_CROSSCHAIN_CONTRACT');
  if (!WZETA) throw new Error('Missing NEXT_PUBLIC_WZETA_ADDRESS');
  return { contract, WZETA };
}

async function getSigner() {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('Wallet not found');
  }
  const provider = new BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return { provider, signer };
}

async function tryOverloads(contract: Contract, calls: Array<() => Promise<any>>) {
  let lastErr: unknown;
  for (const c of calls) {
    try {
      return await c();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * ZEVM direct donation (on Athens): supports native ZETA(WZETA) and any ZRC-20.
 * If tokenAddress === WZETA → native payable path; else approve + donateZRC20*.
 * 
 * IMPORTANT: All campaign payouts are always in WZETA on ZetaChain.
 */
export async function processDonation(params: {
  campaignId: bigint | number;
  amount: string | number;       // human string
  tokenAddress: string;          // WZETA or other ZRC-20 on ZEVM
  donorName?: string;
  note?: string;
  tokenDecimals?: number;        // optional; auto-reads if missing
  preferredToken?: string;       // campaign's preferred token (must be WZETA)
  setStatus?: (s: string) => void;
}) {
  const { contract, WZETA } = requireEnv();
  // Force wallet onto ZetaChain (ZEVM) before any signer/tx usage
  try {
    const targetChainId = Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001);
    if (Number.isFinite(targetChainId)) {
      await ensureWalletOnChain(targetChainId);
    }
  } catch (e) {
    // Surface a clear message while preserving original error for logs
    const msg = (e as Error)?.message || 'Failed to switch wallet to ZetaChain';
    throw new Error(msg);
  }
  const { signer } = await getSigner();

  // Preflight check: Ensure campaign's preferred token is WZETA
  if (params.preferredToken && params.preferredToken.toLowerCase() !== WZETA!.toLowerCase()) {
    throw new Error('Campaign must use WZETA as the preferred token. Cross-chain token swaps are not supported.')
  }

  const campaignId = BigInt(params.campaignId);
  const donorName = params.donorName ?? '';
  const note = params.note ?? '';
  const isWZETA = params.tokenAddress.toLowerCase() === WZETA!.toLowerCase();

  const crowdfund = new Contract(contract!, CROWDFUND_ABI, signer);

  if (isWZETA) {
    // Native ZETA path
    const value = parseEther(String(params.amount));
    return sendWithStatus(
      () =>
        tryOverloads(crowdfund, [
          () => crowdfund.donateNative(campaignId, donorName, note, { value }),
          () => crowdfund.donateToCampaign(campaignId, donorName, note, { value }),
        ]),
      params.setStatus,
    );
  }

  // ZRC-20 path
  const erc20 = new Contract(params.tokenAddress, ERC20_ABI, signer);
  let decimals = params.tokenDecimals ?? 18;
  try {
    decimals = Number(await erc20.decimals());
  } catch {
    // keep fallback
  }
  const amount = normalizeAmount(String(params.amount), decimals);

  // approve(spender=contract)
  await sendWithStatus(() => erc20.approve(contract, amount), params.setStatus);

  // donateZRC20* (handle naming drift)
  return sendWithStatus(
    () =>
      tryOverloads(crowdfund, [
        () => crowdfund.donateZRC20ToCampaign(campaignId, params.tokenAddress, amount, donorName, note),
        () => crowdfund.donateZRC20(campaignId, params.tokenAddress, amount, donorName, note),
      ]),
    params.setStatus,
  );
}
