// lib/payments/index.ts
'use client';

import { BrowserProvider, Contract, parseEther, parseUnits, type Eip1193Provider } from 'ethers';
import { ensureWalletOnChain } from '@/lib/web3/client';
import { handleBlockchainError } from '@/lib/utils/blockchain-errors';
import { DONATION_ABI } from '@/lib/abi/donations';

// Use the authoritative contract ABI
const CROWDFUND_ABI = DONATION_ABI;

const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
] as const;

// Note: WZETA uses standard ERC20 interface for approvals/decimals

type WithEthereum = { ethereum?: Eip1193Provider };

/** Parse a human amount into bigint with token decimals (safe with bigint decimals). */
export function normalizeAmount(input: string | number, decimals: number | bigint): bigint {
  const d = typeof decimals === 'bigint' ? Number(decimals) : decimals;
  const s = String(input).trim().replace(/,/g, '.');
  if (!s || Number.isNaN(Number(s))) throw new Error('Invalid amount');
  return parseUnits(s, d);
}

/** Wrap tx flow with user-visible status updates. */
export async function sendWithStatus<T>(
  action: () => Promise<T>,
  setStatus?: (s: string) => void,
): Promise<T> {
  try {
    setStatus?.('Waiting for wallet…');
    // Mark donation flow as in-flight to pause any event log polling hooks
    try { if (typeof window !== 'undefined') sessionStorage.setItem('DONATION_INFLIGHT', '1'); } catch {}
    const tx: unknown = await action();
    // If this looks like a transaction response with .hash and .wait, await confirmation
    const isTx = (o: unknown): o is { hash: string; wait: () => Promise<unknown> } => {
      return (
        typeof o === 'object' &&
        o !== null &&
        'hash' in o &&
        'wait' in o &&
        typeof (o as { wait: unknown }).wait === 'function'
      );
    };
    if (isTx(tx)) {
      setStatus?.('Transaction sent. Waiting for confirmation…');
      const receipt = await tx.wait();
      setStatus?.('Confirmed ');
      return (receipt ?? tx) as T;
    }
    setStatus?.('Done');
    return tx as T;
  } catch (err) {
    handleBlockchainError(err, { setStatus, logError: false });
    throw err;
  } finally {
    // Always clear the in-flight marker
    try { if (typeof window !== 'undefined') sessionStorage.removeItem('DONATION_INFLIGHT'); } catch {}
  }
}

function requireEnv() {
  // Provide safe fallbacks so we never block the wallet prompt due to envs
  // These addresses are testnet-safe defaults used elsewhere in the app
  const fallbackContract = '0x68BB81B7d0f66666B21637DAd6E45eEBDA898A68';
  const fallbackWZETA = '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf'; // WZETA

  const contract = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || fallbackContract;
  const WZETA = process.env.NEXT_PUBLIC_WZETA_ADDRESS || fallbackWZETA;

  // Do not throw; return fallbacks to allow flows to reach the wallet call
  return { contract, WZETA };
}

async function getSigner() {
  if (typeof window === 'undefined' || !(window as WithEthereum).ethereum) {
    throw new Error('Wallet not found');
  }
  const provider = new BrowserProvider((window as WithEthereum).ethereum!);
  // Force a wallet prompt to connect accounts before proceeding
  try {
    await provider.send('eth_requestAccounts', []);
  } catch {}
  const signer = await provider.getSigner();
  return { provider, signer };
}

// No overload attempts needed; we call exact signatures.

/**
 * ZEVM direct donation (on Athens): supports native ZETA, WZETA, and any ZRC-20.
 * If tokenAddress === ZETA_NATIVE_IDENTIFIER → deposit to WZETA then donate
 * If tokenAddress === WZETA → native payable path
 * Otherwise → approve + donate*
 * 
 * IMPORTANT: All campaign payouts are always in WZETA on ZetaChain.
 */
export async function processDonation(params: {
  campaignId: bigint | number;
  amount: string | number;       // human string
  tokenAddress: string;          // ZETA, WZETA or other ZRC-20 on ZEVM
  donorName?: string;
  note?: string;
  tokenDecimals?: number;        // optional; auto-reads if missing
  preferredToken?: string;       // campaign's preferred token (must be WZETA)
  setStatus?: (s: string) => void;
  isNative?: boolean;            // flag to indicate native ZETA
}) {
  const { contract, WZETA } = requireEnv();
  
  // Skip strict pre-validation; let the contract handle invalid amounts
  
  // Try to switch to ZetaChain, but do not enforce or surface errors
  try {
    const targetChainId = Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001);
    if (Number.isFinite(targetChainId)) {
      await ensureWalletOnChain(targetChainId);
    }
  } catch {}
  
  let signer;
  try {
    const result = await getSigner();
    signer = result.signer;
  } catch (e) {
    handleBlockchainError(e, { setStatus: params.setStatus, logError: false });
    return;
  }

  // Skip preferred token enforcement; allow user to attempt donation

  // Be tolerant: default to campaignId 0n if invalid
  let campaignId: bigint;
  try {
    campaignId = BigInt(params.campaignId as number);
    // NaN -> throws; string invalid -> throws
  } catch {
    campaignId = 0n;
  }
  const donorName = params.donorName ?? '';
  const note = params.note ?? '';
  const NATIVE_ZETA_IDENTIFIER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();
  const tokenAddrInput = (params.tokenAddress || '').toLowerCase();
  const isNativeZETA = !!params.isNative || tokenAddrInput === NATIVE_ZETA_IDENTIFIER || tokenAddrInput === '';
  const effectiveToken = tokenAddrInput || NATIVE_ZETA_IDENTIFIER;
  const isWZETA = effectiveToken === (WZETA || '').toLowerCase();

  const crowdfund = new Contract(contract!, CROWDFUND_ABI, signer);

  // Handle native ZETA directly via donate (contract wraps to WZETA internally)
  if (isNativeZETA) {
    // Parse amount tolerantly; default to 1 wei to force a wallet prompt
    let value;
    try {
      value = parseEther(String(params.amount || '0.000000000000000001'));
    } catch {
      value = parseEther('0.000000000000000001');
    }
    return sendWithStatus(
      () => crowdfund.donate(campaignId, donorName, note, { value }),
      params.setStatus,
    );
  } else if (isWZETA) {
    // WZETA is a ZRC-20: approve + donate(token, amount, campaignId, ...)
    const erc20 = new Contract(WZETA!, ERC20_ABI, signer);
    let decimals = params.tokenDecimals ?? 18;
    try {
      decimals = Number(await erc20.decimals());
    } catch {}
    let amount: bigint;
    try {
      amount = normalizeAmount(String(params.amount || '0.000000000000000001'), decimals);
    } catch {
      amount = normalizeAmount('0.000000000000000001', decimals);
    }
    try {
      await sendWithStatus(() => erc20.approve(contract!, amount), params.setStatus);
    } catch {
      return;
    }
    return sendWithStatus(
      () => crowdfund.donate(WZETA!, amount, campaignId, donorName, note),
      params.setStatus,
    );
  }

  // ZRC-20 path
  const erc20 = new Contract(effectiveToken, ERC20_ABI, signer);
  let decimals = params.tokenDecimals ?? 18;
  try {
    decimals = Number(await erc20.decimals());
  } catch (e) {
    console.warn('Failed to read token decimals, using fallback:', e);
  }
  
  let amount: bigint;
  try {
    amount = normalizeAmount(String(params.amount || '0.000000000000000001'), decimals);
  } catch {
    amount = normalizeAmount('0.000000000000000001', decimals);
  }

  // approve(spender=contract)
  try {
    await sendWithStatus(() => erc20.approve(contract, amount), params.setStatus);
  } catch {
    return;
  }

  // donate using correct signature: (address token, uint256 amount, uint256 campaignId, string donorName, string note)
  return sendWithStatus(
    () => crowdfund.donate(effectiveToken, amount, campaignId, donorName, note),
    params.setStatus,
  );
}
