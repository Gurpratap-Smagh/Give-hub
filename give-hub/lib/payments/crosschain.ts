'use client';

import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  parseEther,
  parseUnits,
} from 'ethers';

export const CHAIN_HEX = {
  ZETA: '0x1b59',      // 7001 (Zeta Athens)
  SEPOLIA: '0xaa36a7', // 11155111
} as const;

type RevertOptions = [string, boolean, string, `0x${string}`, bigint];

const GATEWAY_ABI = [
  // Native (payable) path
  'function depositAndCall(address receiver, bytes message, (address,bool,address,bytes,uint256) revertOptions) payable returns (bytes32)',
  // ERC-20 path (amount, asset)
  'function depositAndCall(address receiver, uint256 amount, address asset, bytes message, (address,bool,address,bytes,uint256) revertOptions) returns (bytes32)',
] as const;

const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
] as const;

// Narrow EIP-1193 provider typing to avoid `any` usage
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function buildRevertOptions(addr: string): RevertOptions {
  // (revertAddress, callOnRevert, onRevertGasPayer, revertMessage, onRevertGasLimit)
  return [addr, true, addr, '0x', 300000n];
}

/** Wallet network switcher (+ add Zeta Athens if needed). */
export async function ensureChain(chainHex: string) {
  if (typeof window === 'undefined') {
    throw new Error('Wallet not found');
  }
  const w = window as unknown as { ethereum?: EthereumProvider };
  const eth = w.ethereum;
  if (!eth) throw new Error('Wallet not found');
  try {
    await eth.request?.({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainHex }],
    });
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 4902) {
      if (chainHex === CHAIN_HEX.ZETA) {
        const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_HTTP || '';
        const chainName = process.env.NEXT_PUBLIC_ZETA_CHAIN_NAME || 'ZetaChain Athens Testnet';
        const symbol = process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || 'ZETA';
        const explorer = process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL || 'https://athens.explorer.zetachain.com/';
        if (!rpcUrl) throw new Error('Missing NEXT_PUBLIC_ZETA_RPC_URL to add ZetaChain');
        await eth.request?.({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_HEX.ZETA,
            chainName,
            nativeCurrency: { name: symbol, symbol, decimals: 18 },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: [explorer].filter(Boolean),
          }],
        });
      } else if (chainHex === CHAIN_HEX.SEPOLIA) {
        await eth.request?.({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_HEX.SEPOLIA,
            chainName: 'Ethereum Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.drpc.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io/'],
          }],
        });
      }
      await eth.request?.({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
    } else {
      throw e as Error;
    }
  }
  // Post-switch verification
  try {
    const provider = new BrowserProvider(eth);
    const net = await provider.getNetwork();
    const expected = parseInt(chainHex, 16);
    if (Number(net.chainId) !== expected) {
      throw new Error(`Wallet is on chainId ${net.chainId.toString()} but expected ${expected}. Please approve the network switch in your wallet.`);
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Sepolia → ZEVM payment: native (zETH) or ERC-20 (USDC) via Gateway.depositAndCall
 * IMPORTANT: `message` must be abi.encode("donate", abi.encode(campaignId, donorName, note))
 * The ZEVM will pass (zrc20, amount) into your onCall; don't include them in `message`.
 */
export async function payFromSepolia(params: {
  receiver: string;            // ZEVM CrossChainCrowdfund
  gateway: string;             // Sepolia Gateway
  amount: string | number;     // human string
  message: `0x${string}`;
  erc20?: string;              // ERC-20 on Sepolia; omit for native zETH path
  erc20Decimals?: number;      // optional (auto-read if missing)
  setStatus?: (s: string) => void;
}) {
  if (typeof window === 'undefined') {
    throw new Error('Wallet not found');
  }
  const w = window as unknown as { ethereum?: EthereumProvider };
  const eth = w.ethereum;
  if (!eth) throw new Error('Wallet not found');

  params.setStatus?.('Switching to Sepolia…');
  await ensureChain(CHAIN_HEX.SEPOLIA);
  // Verify wallet actually switched to Sepolia
  try {
    const providerCheck = new BrowserProvider(eth);
    const net = await providerCheck.getNetwork();
    const expected = parseInt(CHAIN_HEX.SEPOLIA, 16);
    if (Number(net.chainId) !== expected) {
      throw new Error('Wallet did not switch to Ethereum Sepolia. Please approve the network switch in your wallet.');
    }
  } catch (e) {
    throw e as Error;
  }

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const sender = await signer.getAddress();
  const gateway = new Contract(params.gateway, GATEWAY_ABI, signer);

  const revertOpts = buildRevertOptions(sender);
  const message = params.message;

  // ------------------------------------

  if (!params.erc20) {
    // Native zETH path: payable depositAndCall(receiver, message, revertOptions)
    const value = parseEther(String(params.amount));
    console.log('[payFromSepolia] native zETH amount(ETH)=', params.amount, ' value(wei)=', value.toString());
    params.setStatus?.('Confirming depositAndCall (native)…');
    const tx = await gateway.depositAndCall(params.receiver, message, revertOpts, { value });
    params.setStatus?.('Waiting for Sepolia confirmation…');
    return await tx.wait();
  } else {
    // ERC-20 path (e.g., USDC on Sepolia)
    const erc20 = new Contract(params.erc20, ERC20_ABI, signer);
    let decimals = params.erc20Decimals ?? 6;
    try {
      decimals = Number(await erc20.decimals());
    } catch {
      // keep default if read fails
    }
    const amount = parseUnits(String(params.amount), decimals);

    params.setStatus?.('Approving token spend…');
    await (await erc20.approve(params.gateway, amount)).wait();

    params.setStatus?.('Confirming depositAndCall (ERC-20)…');
    const tx = await gateway.depositAndCall(params.receiver, amount, params.erc20, message, revertOpts);
    params.setStatus?.('Waiting for Sepolia confirmation…');
    return await tx.wait();
  }
}

/**
 * Lightweight poller to detect the ZEVM-side credit after a Sepolia deposit.
 * We don’t rely on a specific event ABI — we poll logs for the crowdfund contract address.
 * `onUpdate` is optional status text callback for your UI.
 */
export async function waitForContribution(opts: {
  contract: string;                // ZEVM CrossChainCrowdfund
  campaignId?: bigint | number;    // optional — if indexed
  donor?: string;                  // optional — if indexed
  fromBlock?: number;              // default: latest - 8192
  timeoutMs?: number;              // default: 60_000
  pollMs?: number;                 // default: 4_000
  onUpdate?: (s: string) => void;  // optional UI updates
}): Promise<{
  log: {
    blockNumber: number;
    transactionHash: string;
    topics: string[];
    data: string;
  };
  decoded?: { campaignId?: bigint; donor?: string; amount?: bigint };
} | null> {
  const rpc = process.env.NEXT_PUBLIC_ZETA_RPC_HTTP;
  if (!rpc) throw new Error('Missing NEXT_PUBLIC_ZETA_RPC_HTTP');
  const provider = new JsonRpcProvider(rpc);

  const latest = await provider.getBlockNumber();
  const fromBlock =
    typeof opts.fromBlock === 'number'
      ? Math.max(0, opts.fromBlock)
      : Math.max(0, latest - 8192);

  const timeoutAt = Date.now() + (opts.timeoutMs ?? 60_000);
  const pollMs = opts.pollMs ?? 4_000;

  let cursor = fromBlock;

  // chunk to avoid RPC "max 500 blocks" issues
  const CHUNK = 400;

  while (Date.now() < timeoutAt) {
    const head = await provider.getBlockNumber();
    const end = Math.min(head, cursor + CHUNK);

    if (end >= cursor) {
      opts.onUpdate?.(`Waiting for ZetaChain confirmation (${(Date.now() - (timeoutAt - (opts.timeoutMs ?? 60_000))) / 1000 | 0}s)…`);
      const logs = await provider.getLogs({
        address: opts.contract,
        fromBlock: cursor,
        toBlock: end,
      });

      if (logs.length) {
        // Best-effort: try to infer campaign/donor/amount from data or topics if present.
        // (Safe even if it fails; we still return the raw log.)
        let decoded: { campaignId?: bigint; donor?: string; amount?: bigint } | undefined;
        try {
          // If your event is e.g. ContributionReceived(uint256,address,uint256,address,string,string)
          // you can decode here with a known ABI. We keep it generic.
        } catch {}
        return {
          log: {
            blockNumber: logs[0].blockNumber!,
            transactionHash: logs[0].transactionHash!,
            topics: logs[0].topics.map(x => x),
            data: logs[0].data,
          },
          decoded,
        };
      }

      cursor = end + 1;
    }

    await new Promise(r => setTimeout(r, pollMs));
  }

  return null; // timed out
}
