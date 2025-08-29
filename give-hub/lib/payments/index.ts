// lib/payments/index.ts
'use client';

import { BrowserProvider, Contract, parseEther, parseUnits, ContractTransactionResponse } from 'ethers';
import { ensureWalletOnChain } from '@/lib/web3/client';
import { handleBlockchainError } from '@/lib/utils/blockchain-errors';

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

const WZETA_ABI = [
  'function deposit() payable',
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
      setStatus?.('Confirmed ');
      return (receipt ?? tx) as T;
    }
    setStatus?.('Done');
    return tx as T;
  } catch (err) {
    handleBlockchainError(err, { setStatus });
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
 * ZEVM direct donation (on Athens): supports native ZETA, WZETA, and any ZRC-20.
 * If tokenAddress === ZETA_NATIVE_IDENTIFIER → deposit to WZETA then donate
 * If tokenAddress === WZETA → native payable path
 * Otherwise → approve + donateZRC20*
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
  
  // Validate amount is a valid number > 0
  const amountNum = Number(params.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new Error('Please enter a valid donation amount greater than 0');
  }
  
  // Force wallet onto ZetaChain (ZEVM) before any signer/tx usage
  try {
    const targetChainId = Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001);
    if (Number.isFinite(targetChainId)) {
      await ensureWalletOnChain(targetChainId);
    }
  } catch (e) {
    handleBlockchainError(e, { 
      setStatus: params.setStatus,
      onError: () => {
        throw new Error('Failed to switch your wallet to ZetaChain. Please try again.');
      }
    });
    return; 
  }
  
  let signer;
  try {
    const result = await getSigner();
    signer = result.signer;
  } catch (e) {
    handleBlockchainError(e, { setStatus: params.setStatus });
    return;
  }

  // Preflight check: Ensure campaign's preferred token is WZETA
  if (params.preferredToken && params.preferredToken.toLowerCase() !== WZETA!.toLowerCase()) {
    const error = new Error('Campaign must use WZETA as the preferred token. Cross-chain token swaps are not supported.');
    handleBlockchainError(error, { setStatus: params.setStatus });
    throw error;
  }

  const campaignId = BigInt(params.campaignId);
  const donorName = params.donorName ?? '';
  const note = params.note ?? '';
  const NATIVE_ZETA_IDENTIFIER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();
  const isNativeZETA = params.isNative || params.tokenAddress.toLowerCase() === NATIVE_ZETA_IDENTIFIER;
  const isWZETA = params.tokenAddress.toLowerCase() === WZETA!.toLowerCase();

  const crowdfund = new Contract(contract!, CROWDFUND_ABI, signer);

  // Handle native ZETA by wrapping to WZETA first
  if (isNativeZETA) {
    const value = parseEther(String(params.amount));
    params.setStatus?.('Wrapping ZETA to WZETA...');
    
    try {
      // First deposit ZETA into WZETA contract
      const wzetaContract = new Contract(WZETA!, WZETA_ABI, signer);
      const depositTx: ContractTransactionResponse = await wzetaContract.deposit({ value });
      params.setStatus?.('Waiting for ZETA wrapping to complete...');
      await depositTx.wait();
      
      // Then approve WZETA to the crowdfund contract
      params.setStatus?.('Approving WZETA for donation...');
      const approveTx = await wzetaContract.approve(contract!, value);
      await approveTx.wait();
      
      // Then donate the wrapped ZETA (now WZETA) using ZRC-20 path
      params.setStatus?.('Donating with wrapped ZETA...');
      return sendWithStatus(
        () =>
          tryOverloads(crowdfund, [
            () => crowdfund.donateZRC20ToCampaign(campaignId, WZETA!, value, donorName, note),
            () => crowdfund.donateZRC20(campaignId, WZETA!, value, donorName, note),
          ]),
        params.setStatus,
      );
    } catch (error) {
      handleBlockchainError(error, { setStatus: params.setStatus });
      throw error;
    }
  } else if (isWZETA) {
    // WZETA token path - use native payable method
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
  } catch (e) {
    console.warn('Failed to read token decimals, using fallback:', e);
  }
  
  const amount = normalizeAmount(String(params.amount), decimals);

  // approve(spender=contract)
  try {
    await sendWithStatus(() => erc20.approve(contract, amount), params.setStatus);
  } catch (e) {
    return;
  }

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
