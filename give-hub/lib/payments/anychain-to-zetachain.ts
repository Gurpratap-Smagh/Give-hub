// anychain-to-zetachain.ts
// A single, self-contained helper for sending donations from ANY EVM chain
// to your ZEVM CrossChainCrowdfund via ZetaChain Gateway.
// - Handles native (ETH/MATIC/...) and ERC-20 paths
// - Encodes the message EXACTLY as your onCall expects: (string action, bytes data)
//     Native:  action = 'donate_native', data = abi.encode(uint256 campaignId, string donorName, string note)
//     ERC-20:  action = 'donate_token',  data = abi.encode(address zrc20, uint256 amount, uint256 campaignId, string donorName, string note)
// - No over-encoding, no log polling, no smart error system. Wallet decides.

'use client';

import {
  BrowserProvider,
  Contract,
  parseEther,
  parseUnits,
  ethers,
} from 'ethers';

/* --------------------------------- Types --------------------------------- */

export type ChainHex = `0x${string}`; // e.g. '0xaa36a7' for Sepolia, '0x1b59' for Zeta Athens (7001)

// Zeta Gateway revert options tuple (address,bool,address,bytes,uint256)
export type RevertOptions = [string, boolean, string, `0x${string}`, bigint];

export type AddChainParams = {
  chainId: ChainHex;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

export type AnychainPayParams = {
  // Wallet + chain
  sourceChain: AddChainParams; // which L1/L2 the user is paying FROM (Sepolia, Base, etc.)

  // Gateway & ZEVM receiver
  gateway: string; // Gateway on the source chain
  receiver: string; // ZEVM CrossChainCrowdfund address

  // Donation intent
  campaignId: bigint | number;
  donorName: string;
  note: string;

  // Amount
  amount: string | number; // human-readable (e.g. '0.02' or '5')
  erc20?: {
    address: string; // ERC20 on the source chain
    decimals?: number; // optional; we will auto-read if missing
  };

  // UI hooks (optional)
  setStatus?: (s: string) => void;
};

/* -------------------------------- Constants ------------------------------- */

const GATEWAY_ABI = [
  // Native (payable) path
  'function depositAndCall(address receiver, bytes message, (address,bool,address,bytes,uint256) revertOptions) payable returns (bytes32)',
  // ERC-20 path (amount, asset)
  'function depositAndCall(address receiver, uint256 amount, address asset, bytes message, (address,bool,address,bytes,uint256) revertOptions) returns (bytes32)',
] as const;

const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

/* ------------------------------ ABI Utilities ----------------------------- */

/**
 * Build the exact bytes payload your ZEVM receiver expects:
 * abi.encode( string action, bytes data ) where:
 *  - Native:  action='donate_native', data=abi.encode(uint256 campaignId, string donorName, string note)
 *  - ERC-20:  action='donate_token',  data=abi.encode(address zrc20, uint256 amount, uint256 campaignId, string donorName, string note)
 */
export function builddonateMessage(
  campaignId: bigint | number,
  donorName: string,
  note: string,
): `0x${string}` {
  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'string', 'string'],
    [campaignId, donorName, note],
  );
  const msg = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'bytes'],
    ['donate_native', inner],
  );
  return msg as `0x${string}`;
}

export function buildDonateTokenMessage(
  zrc20: string,
  amount: bigint,
  campaignId: bigint | number,
  donorName: string,
  note: string,
): `0x${string}` {
  const inner = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'uint256', 'string', 'string'],
    [zrc20, amount, campaignId, donorName, note],
  );
  const msg = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'bytes'],
    ['donate_token', inner],
  );
  return msg as `0x${string}`;
}

/** Build revert options tuple. Both payee + gas payer default to sender. */
export function buildRevertOptions(sender: string): RevertOptions {
  // (revertAddress, callOnRevert, onRevertGasPayer, revertMessage, onRevertGasLimit)
  return [sender, true, sender, '0x', 300000n];
}

/* ------------------------------ Chain Switching --------------------------- */

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export async function ensureWalletOnChain(chain: AddChainParams) {
  if (typeof window === 'undefined') throw new Error('Wallet not found');
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth) throw new Error('Wallet not found');

  // Try to switch; if not configured, add then switch
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
  } catch (e: any) {
    if (e?.code === 4902) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [chain] });
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
    } else {
      throw e;
    }
  }
}

/* ------------------------------- Core Sends ------------------------------- */

/** Native path: deposit base coin (ETH, etc.) and call ZEVM receiver */
export async function depositNativeToZEVM(params: AnychainPayParams) {
  const { sourceChain, gateway, receiver, amount, campaignId, donorName, note, setStatus } = params;

  await ensureWalletOnChain(sourceChain);
  const provider = new BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const sender = await signer.getAddress();

  const gw = new Contract(gateway, GATEWAY_ABI, signer);
  const message = builddonateMessage(campaignId, donorName, note);
  const revertOpts = buildRevertOptions(sender);
  const value = parseEther(String(amount));

  setStatus?.('Confirm in wallet: deposit native → ZEVM');
  const tx = await gw.depositAndCall(receiver, message, revertOpts, { value });
  setStatus?.('Waiting for source-chain confirmation…');
  return await tx.wait();
}

/** ERC-20 path: approve Gateway then deposit token and call ZEVM receiver */
export async function depositErc20ToZEVM(params: AnychainPayParams) {
  const { sourceChain, gateway, receiver, amount, campaignId, donorName, note, erc20, setStatus } = params;
  if (!erc20?.address) throw new Error('Missing erc20.address');

  await ensureWalletOnChain(sourceChain);
  const provider = new BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const sender = await signer.getAddress();

  const token = new Contract(erc20.address, ERC20_ABI, signer);
  let decimals = erc20.decimals ?? 18;
  try {
    decimals = Number(await token.decimals());
  } catch {
    // keep provided/18 if read fails
  }
  const amt = parseUnits(String(amount), decimals);

  // Approve only if needed
  try {
    const current = await token.allowance(sender, gateway);
    if (current < amt) {
      setStatus?.('Approve token spend in wallet…');
      const ax = await token.approve(gateway, amt);
      await ax.wait();
    }
  } catch (e) {
    // Let wallet/provider surface the real error
    throw e;
  }

  const gw = new Contract(gateway, GATEWAY_ABI, signer);
  const message = buildDonateTokenMessage(erc20.address, amt, campaignId, donorName, note);
  const revertOpts = buildRevertOptions(sender);

  setStatus?.('Confirm depositAndCall (ERC-20) in wallet…');
  const tx = await gw.depositAndCall(receiver, amt, erc20.address, message, revertOpts);
  setStatus?.('Waiting for source-chain confirmation…');
  return await tx.wait();
}

/** Smart wrapper: if erc20 provided → ERC-20 path; else native path */
export async function payFromAnyChain(params: AnychainPayParams) {
  if (params.erc20?.address) return depositErc20ToZEVM(params);
  return depositNativeToZEVM(params);
}

/* ------------------------------ Usage Example ----------------------------- */
/**
Example wiring (Sepolia → ZEVM Athens testnet):

import Cross from '@/lib/payments/anychain-to-zetachain';

await payFromAnyChain({
  sourceChain: {
    chainId: '0xaa36a7',
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.drpc.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io/'],
  },
  gateway: '<SEPOLIA_GATEWAY_ADDRESS>',
  receiver: '<ZEVM_CROWDFUND_ADDRESS>',
  campaignId: 3,
  donorName: 'Gurpratap',
  note: '',
  amount: '0.02',     // native path
  // erc20: { address: '<USDC_SEPOLIA>', decimals: 6 }, // uncomment for ERC-20 path
  setStatus: (s) => console.log(s),
});
*/
