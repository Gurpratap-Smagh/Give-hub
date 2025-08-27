"use client";

import { ethers } from "ethers";
import { CrossChainCrowdfundABI } from "./abi/GiveHubCrowdfund";

export type DeploymentInfo = {
  address: string;
  chainId: number;
  wzeta?: string;
  systemContract?: string;
};

type AddEthereumChainParameter = {
  chainId: string; // 0x-prefixed hex
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
};

// Minimal ERC20 ABI for approvals and decimals
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Module-level cache to avoid repeated /api calls and dedupe concurrent requests
let __deploymentCache: DeploymentInfo | null = null;
let __deploymentPending: Promise<DeploymentInfo> | null = null;

// Track wallet connection state to prevent duplicate requests
let __connectionInProgress = false;

export async function fetchDeployment(): Promise<DeploymentInfo> {
  // Serve from cache if available
  if (__deploymentCache) {
    console.log('[web3] Deployment cache hit');
    return __deploymentCache;
  }
  if (__deploymentPending) return __deploymentPending;

  // Try to resolve from public env (avoids hitting API on every call)
  const addrFromEnv =
    process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT ||
    process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS ||
    process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS;
  const chainFromEnv = process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID;
  const wzetaFromEnv = process.env.NEXT_PUBLIC_WZETA_ADDRESS || process.env.NEXT_PUBLIC_WZETA;
  const sysFromEnv = process.env.NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS;

  if (addrFromEnv && chainFromEnv) {
    const dep: DeploymentInfo = {
      address: addrFromEnv,
      chainId: Number(chainFromEnv),
      wzeta: wzetaFromEnv,
      systemContract: sysFromEnv,
    };
    __deploymentCache = dep;
    console.debug("[web3] deployment (env):", dep);
    return dep;
  }

  // Fallback to server API once, then cache
  __deploymentPending = (async () => {
    console.log('[web3] Fetching deployment from API');
    const res = await fetch("/api/web3/deployment", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch deployment info");
    const json = (await res.json()) as DeploymentInfo;
    __deploymentCache = json;
    console.debug("[web3] deployment (api):", json);
    return json;
  })().finally(() => {
    __deploymentPending = null;
  });

  return __deploymentPending;
}

// Lightweight latest block helper for polling clients
export async function getLatestBlockNumber(): Promise<number> {
  const provider = await getReadOnlyProvider();
  return provider.getBlockNumber();
}

export async function getProvider(): Promise<ethers.BrowserProvider> {
  if (typeof window === "undefined") throw new Error("No window");
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No injected wallet. Please install MetaMask or Zeta wallet.");
  return new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
}

// Read-only provider that falls back to public RPC when no injected wallet exists
export async function getReadOnlyProvider(): Promise<ethers.AbstractProvider> {
  // Always use a dedicated HTTP RPC for read-only access to avoid
  // injected wallet middlewares (which may create ephemeral filters).
  const rpcUrl =
    process.env.NEXT_PUBLIC_ZETA_RPC_URL ||
    process.env.NEXT_PUBLIC_ZETA_RPC_HTTP ||
    '';
  if (!rpcUrl) {
    throw new Error(
      'Missing NEXT_PUBLIC_ZETA_RPC_URL (or NEXT_PUBLIC_ZETA_RPC_HTTP) for read-only provider'
    );
  }
  return new ethers.JsonRpcProvider(rpcUrl);
}

// ZetaChain public RPCs can briefly return -32000 "tx not found" right after broadcast.
// Detect that error shape so we can retry instead of failing fast.

// Extract numeric code and the most specific message (including nested error.data.message)
function extractRpcErrorFields(err: unknown): { code?: number; message: string } {
  try {
    const e = (err ?? {}) as unknown as Record<string, unknown> & {
      code?: number;
      message?: string;
      error?: { code?: number; message?: string; data?: { code?: number; message?: string } };
      data?: { code?: number; message?: string };
    };
    const codes = [e.code, e.error?.code, e.data?.code, e.error?.data?.code];
    const code = codes.find((c) => typeof c === 'number') as number | undefined;
    const msgs = [e.message, e.error?.message, e.data?.message, e.error?.data?.message];
    const msg = String(msgs.find((m) => typeof m === 'string') || '').toLowerCase();
    return { code, message: msg };
  } catch {
    return { message: '' };
  }
}

function isTxNotFoundError(err: unknown): boolean {
  const { code, message } = extractRpcErrorFields(err);
  // Zeta RPCs often return -32603 with nested -32000 and message containing "ethereum tx not found"
  const codeMatches = code === -32000 || code === -32603;
  const msgMatches = message.includes('tx not found') || message.includes('ethereum tx not found');
  return Boolean(codeMatches && msgMatches);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll for a receipt with backoff, tolerating transient "tx not found" errors
async function waitForReceiptWithRetries(
  provider: ethers.AbstractProvider,
  txHash: string,
  intervalMs = 1500,
  timeoutMs = 120_000,
): Promise<ethers.TransactionReceipt> {
  const start = Date.now();
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for receipt for ${txHash}`);
    }
    try {
      const r = await provider.getTransactionReceipt(txHash);
      if (r) return r;
    } catch (e) {
      if (!isTxNotFoundError(e)) throw e;
      // else fall through and retry
    }
    await sleep(intervalMs);
  }
}

export async function connectWallet(): Promise<{ signer: ethers.Signer; address: string; chainId: number }>{
  if (__connectionInProgress) {
    throw new Error('Wallet connection already in progress');
  }
  __connectionInProgress = true;
  try {
    const provider = await getProvider();
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();
    return { signer, address, chainId: Number(network.chainId) };
  } finally {
    __connectionInProgress = false;
  }
}

/**
 * Ensure the injected wallet is on the given chain. Attempts wallet_switchEthereumChain,
 * and if the chain is unknown, tries wallet_addEthereumChain using NEXT_PUBLIC_ZETA_* env vars.
 * Returns the resulting chainId.
 */
export async function ensureWalletOnChain(targetChainId: number): Promise<number> {
  const provider = await getProvider();
  const net = await provider.getNetwork();
  const current = Number(net.chainId);
  if (current === targetChainId) return current;
  const hex = "0x" + targetChainId.toString(16);
  console.debug("[web3] switching network to", targetChainId, hex);
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: hex }]);
  } catch (err: unknown) {
    // 4902: Unrecognized chain, try adding
    const e = err as { code?: number; message?: string };
    if (e?.code === 4902 || /Unrecognized chain/i.test(String(e?.message || ""))) {
      const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || "";
      const chainName = process.env.NEXT_PUBLIC_ZETA_CHAIN_NAME || `ZetaChain ${targetChainId}`;
      const symbol = process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || "ZETA";
      const explorer = process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL || "";
      if (!rpcUrl) throw new Error("Missing NEXT_PUBLIC_ZETA_RPC_URL to add network");
      const params: AddEthereumChainParameter = {
        chainId: hex,
        chainName,
        rpcUrls: [rpcUrl],
        nativeCurrency: { name: symbol, symbol, decimals: 18 },
      };
      if (explorer) params.blockExplorerUrls = [explorer];
      console.debug("[web3] adding network:", params);
      await provider.send("wallet_addEthereumChain", [params]);
      await provider.send("wallet_switchEthereumChain", [{ chainId: hex }]);
    } else {
      throw err;
    }
  }
  const after = await provider.getNetwork();
  return Number(after.chainId);
}

export async function getContract(signer?: ethers.Signer) {
  const dep = await fetchDeployment();
  let s = signer;
  if (!s) {
    const c = await connectWallet();
    s = c.signer;
  }
  if (!dep.address || typeof dep.address !== "string" || dep.address.length !== 42) {
    throw new Error("Invalid contract address from deployment info");
  }
  if (/^0x0{40}$/i.test(dep.address)) {
    throw new Error("Contract address is zero address. Set NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS or deployments latest.json correctly.");
  }
  // Best-effort ensure we're on the right chain for this deployment
  try {
    const chainNum = Number(dep.chainId as unknown as number);
    if (Number.isFinite(chainNum)) {
      await ensureWalletOnChain(chainNum);
      // Rebind signer to current network to avoid ethers NETWORK_ERROR on event="changed"
      try {
        const prov = await getProvider();
        // Preserve the same account if possible
        let addr: string | undefined;
        try { addr = await (s as ethers.Signer).getAddress(); } catch {}
        s = addr ? await prov.getSigner(addr) : await prov.getSigner();
      } catch {}
    }
  } catch {
    // non-fatal; we validate code presence below
  }

  // Validate there is contract code at the address on the current network
  const provider = (s?.provider as ethers.BrowserProvider) || (await getProvider());
  const code = await provider.getCode(dep.address);
  if (!code || code === "0x" || code === "0x00") {
    throw new Error(
      `No contract code at ${dep.address} on current network. Check chain switch and address (expected chainId=${dep.chainId}).`
    );
  }

  console.debug("[web3] using contract address:", dep.address);
  return new ethers.Contract(dep.address, CrossChainCrowdfundABI, s!);
}

export async function isCreator(address: string): Promise<boolean> {
  try {
    const contract = await getContract();
    const creator = await contract.creators(address);
    return Boolean(creator?.exists);
  } catch (e) {
    console.error("[web3] isCreator: failed to read creators(address). Is the contract address correct and ABI matching?", e);
    return false;
  }
}

export async function getCreatorInfo(address: string): Promise<{exists: boolean, preferredZRC20: string}> {
  try {
    const contract = await getContract();
    const creator = await contract.creators(address);
    return {
      exists: Boolean(creator?.exists),
      preferredZRC20: creator?.preferredZRC20 || ethers.ZeroAddress,
    };
  } catch (e) {
    console.error("[web3] getCreatorInfo: failed to read creators(address). Is the contract address correct and ABI matching?", e);
    return { exists: false, preferredZRC20: ethers.ZeroAddress };
  }
}

export type CreateCampaignInput = {
  preferredZRC20?: string; // ZRC20 token address for receiving donations
  // Optional callback invoked immediately after the transaction is sent (before mining)
  onSent?: (txHash: string) => void;
};

// Default ZRC20 token addresses - adjust based on deployment
const DEFAULT_ZETA_TOKEN = "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf"; // WZETA

// Check if wallet is connected and on correct network
export async function checkWalletConnection(): Promise<{connected: boolean, address?: string, chainId?: number}> {
  try {
    const provider = await getProvider();
    const accounts = await provider.send("eth_accounts", []);
    if (accounts.length === 0) {
      return { connected: false };
    }
    const network = await provider.getNetwork();
    return {
      connected: true,
      address: accounts[0],
      chainId: Number(network.chainId)
    };
  } catch {
    return { connected: false };
  }
}

export async function createCampaignOnChain(input: CreateCampaignInput = {}): Promise<{ id: bigint; txHash: string }> {
  const dep = await fetchDeployment();
  // Ensure correct network before obtaining signer
  try {
    await ensureWalletOnChain(Number(dep.chainId));
  } catch {}
  const prov = await getProvider();
  const signer = await prov.getSigner();

  // Use provided ZRC20 or deployment's wzeta, otherwise fallback constant
  const preferredZRC20 = input.preferredZRC20 || dep.wzeta || DEFAULT_ZETA_TOKEN;
  if (!preferredZRC20 || !/^0x[a-fA-F0-9]{40}$/.test(preferredZRC20) || /^0x0{40}$/i.test(preferredZRC20)) {
    throw new Error("Invalid preferredZRC20 address; set NEXT_PUBLIC_WZETA_ADDRESS or ensure deployments latest.json provides systemContracts.wzeta");
  }

  console.debug("[web3] createCampaign args:", {
    preferredZRC20,
    chainId: dep.chainId,
    contract: dep.address
  });

  const contract = await getContract(signer);
  const tx = await contract.createCampaign(preferredZRC20);
  console.debug("[web3] createCampaign tx:", tx?.hash);
  try { input.onSent?.(tx.hash); } catch {}
  
  // Await the receipt; if the RPC says "tx not found", fallback to manual polling
  let receipt: ethers.TransactionReceipt | null = null;
  try {
    receipt = await tx.wait(1);
  } catch (e) {
    if (isTxNotFoundError(e)) {
      const prov = ("provider" in signer ? (signer as ethers.Signer & { provider?: ethers.AbstractProvider | null }).provider : null) || null;
      const useProv = prov ?? (await getProvider());
      console.warn('[web3] tx.wait reported tx not found; retrying via manual polling…', { hash: tx.hash, err: e });
      receipt = await waitForReceiptWithRetries(useProv, tx.hash);
    } else {
      throw e as Error;
    }
  }
  if (!receipt) throw new Error("No transaction receipt for createCampaign");
  console.debug("[web3] createCampaign receipt status:", receipt?.status);
  
  // Try to decode CampaignCreated to get ID
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "CampaignCreated") {
        const id = parsed.args?.campaignId as bigint;
        if (id !== undefined) return { id, txHash: tx.hash };
      }
    } catch {}
  }
  
  // If we couldn't parse the created ID, fail fast so UI doesn't persist an invalid onChainId
  try {
    const addr = receipt.to || (await getContract().then(c => c.target as string).catch(() => undefined));
    const count = receipt.logs?.length ?? 0;
    console.error("[web3] CampaignCreated not found in receipt logs", {
      txHash: tx.hash,
      contractAddress: addr,
      logCount: count,
      topicsSample: (receipt.logs || []).slice(0, 3).map(l => ({
        address: l.address,
        topics: l.topics,
      })),
    });
  } catch {}
  throw new Error("Could not parse CampaignCreated event; creation may have failed");
}

// Campaign management functions for CrossChainCrowdfund
export async function pauseCampaignOnChain(campaignId: bigint): Promise<void> {
  const { signer } = await connectWallet();
  const contract = await getContract(signer);
  const tx = await contract.pauseCampaign(campaignId);
  await tx.wait(1);
  console.debug("[web3] paused campaign:", campaignId.toString());
}

export async function resumeCampaignOnChain(campaignId: bigint): Promise<void> {
  const { signer } = await connectWallet();
  const contract = await getContract(signer);
  const tx = await contract.resumeCampaign(campaignId);
  await tx.wait(1);
  console.debug("[web3] resumed campaign:", campaignId.toString());
}

export async function withdrawCampaignFunds(campaignId: bigint): Promise<void> {
  // No-escrow mode: withdrawals are disabled.
  // Fail fast to avoid any wallet/network prompts or contract calls.
  throw new Error(
    `Withdrawals are disabled in no-escrow mode for campaign ${campaignId.toString()}. Donations are forwarded to the creator immediately.`
  );
}

export async function getCampaignBalance(campaignId: bigint): Promise<string> {
  // No-escrow mode: funds are forwarded immediately to the creator.
  // Contract does not maintain campaign balances; return 0 for display.
  try { console.debug("[web3] getCampaignBalance: no-escrow mode, returning 0 for", campaignId.toString()); } catch {}
  return "0";
}

export async function getCampaignInfo(campaignId: bigint): Promise<{creator: string, preferredZRC20: string, active: boolean}> {
  const contract = await getContract();
  const campaign = await contract.campaigns(campaignId);
  return {
    creator: campaign.creator,
    preferredZRC20: campaign.preferredZRC20,
    active: campaign.active
  };
}

// Get all campaigns created by a specific creator
export async function getCampaignsByCreator(
  creatorAddress: string,
  lookbackBlocks = 100000,
): Promise<{ campaignId: bigint; creator: string; preferredZRC20: string }[]> {
  const provider = await getReadOnlyProvider();
  const dep = await fetchDeployment();
  const latest = await provider.getBlockNumber();
  const fromBlock = latest > lookbackBlocks ? latest - lookbackBlocks : 0;
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  
  // Filter by CampaignCreated events for this creator
  const topic0 = ethers.id("CampaignCreated(uint256,address,address)");
  const topicCreator = ethers.zeroPadValue(creatorAddress, 32); // creator is the 2nd indexed arg (topic2)
  
  const logs = await provider.getLogs({ 
    address: dep.address, 
    fromBlock, 
    toBlock: latest, 
    // topic1 corresponds to campaignId (indexed), which we don't filter by here
    topics: [topic0, null, topicCreator] 
  });
  
  const campaigns: { campaignId: bigint; creator: string; preferredZRC20: string }[] = [];
  
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "CampaignCreated") {
        campaigns.push({
          campaignId: parsed.args?.campaignId as bigint,
          creator: parsed.args?.creator as string,
          preferredZRC20: parsed.args?.preferredZRC20 as string
        });
      }
    } catch {
      // ignore parse errors
    }
  }
  
  return campaigns;
}

// Get donation events for a campaign
export async function getCampaignDonations(
  campaignId: bigint,
  lookbackBlocks = 100000,
): Promise<{
  contributionId: bigint;
  donor: string;
  originalToken: string;
  originalAmount: string;
  convertedAmount: string;
  originChain: string;
  donorName?: string;
  note?: string;
  timestamp: string;
}[]> {
  const provider = await getReadOnlyProvider();
  const dep = await fetchDeployment();
  const latest = await provider.getBlockNumber();
  const fromBlock = latest > lookbackBlocks ? latest - lookbackBlocks : 0;
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  
  // Filter by ContributionReceived events for this campaign
  const topic0 = ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)");
  const topic1 = ethers.zeroPadValue(ethers.toBeHex(campaignId), 32); // campaignId is indexed
  
  const logs = await provider.getLogs({ 
    address: dep.address, 
    fromBlock, 
    toBlock: latest, 
    topics: [topic0, topic1] 
  });
  
  const donations: {
    contributionId: bigint;
    donor: string;
    originalToken: string;
    originalAmount: string;
    convertedAmount: string;
    originChain: string;
    donorName?: string;
    note?: string;
    timestamp: string;
  }[] = [];
  
  // Fetch block timestamps for logs to build a proper history
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "ContributionReceived") {
        let iso = new Date().toISOString();
        try {
          const blk = await provider.getBlock(log.blockNumber);
          if (blk?.timestamp != null) {
            const ts = Number(blk.timestamp);
            if (Number.isFinite(ts)) iso = new Date(ts * 1000).toISOString();
          }
        } catch {
          // fallback to now
        }
        const args = parsed.args as unknown as {
          contributionId: bigint;
          donor: string;
          originalToken: string;
          originalAmount: bigint;
          convertedAmount: bigint;
          originChain: string;
          donorName?: string;
          note?: string;
        };
        donations.push({
          contributionId: args.contributionId,
          donor: args.donor,
          originalToken: args.originalToken,
          originalAmount: ethers.formatEther(args.originalAmount),
          convertedAmount: ethers.formatEther(args.convertedAmount),
          originChain: args.originChain,
          donorName: args.donorName,
          note: args.note,
          timestamp: iso,
        });
      }
    } catch {
      // ignore parse errors
    }
  }
  
  return donations;
}

// Get donation events for a campaign between specific blocks (inclusive)
export async function getCampaignDonationsBetween(
  campaignId: bigint,
  fromBlock: number,
  toBlock?: number,
): Promise<{
  contributionId: bigint;
  donor: string;
  originalToken: string;
  originalAmount: string;
  convertedAmount: string;
  originChain: string;
  donorName?: string;
  note?: string;
  timestamp: string;
}[]> {
  // Use read-only provider to avoid wallet dependency
  const provider = await getReadOnlyProvider();
  const dep = await fetchDeployment();
  // Validate and clamp block range to avoid RPC 400 errors
  const chainLatest = await provider.getBlockNumber();
  const end = Math.min(toBlock ?? chainLatest, chainLatest);
  const MAX_RANGE = 5000; // conservative window to limit log scans
  let start = Math.max(0, Math.min(fromBlock, end));
  if (end - start > MAX_RANGE) start = end - MAX_RANGE;
  const iface = new ethers.Interface(CrossChainCrowdfundABI);

  // Filter by ContributionReceived events for this campaign
  const topic0 = ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)");
  const topic1 = ethers.zeroPadValue(ethers.toBeHex(campaignId), 32); // campaignId is indexed

  const logs = await provider.getLogs({
    address: dep.address,
    fromBlock: start,
    toBlock: end,
    topics: [topic0, topic1],
  });

  const donations: {
    contributionId: bigint;
    donor: string;
    originalToken: string;
    originalAmount: string;
    convertedAmount: string;
    originChain: string;
    donorName?: string;
    note?: string;
    timestamp: string;
  }[] = [];

  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "ContributionReceived") {
        let iso = new Date().toISOString();
        try {
          const blk = await provider.getBlock(log.blockNumber);
          if (blk?.timestamp != null) {
            const ts = Number(blk.timestamp);
            if (Number.isFinite(ts)) iso = new Date(ts * 1000).toISOString();
          }
        } catch {
          // fallback to now
        }
        const args = parsed.args as unknown as {
          contributionId: bigint;
          donor: string;
          originalToken: string;
          originalAmount: bigint;
          convertedAmount: bigint;
          originChain: string;
          donorName?: string;
          note?: string;
        };
        donations.push({
          contributionId: args.contributionId,
          donor: args.donor,
          originalToken: args.originalToken,
          originalAmount: ethers.formatEther(args.originalAmount),
          convertedAmount: ethers.formatEther(args.convertedAmount),
          originChain: args.originChain,
          donorName: args.donorName,
          note: args.note,
          timestamp: iso,
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  return donations;
}

// Donation function using native ZETA (simplified for direct donations)
export async function donateToCampaign(
  campaignId: bigint, 
  amountInEther: string,
  donorName?: string,
  memo?: string
): Promise<string> {
  const dep = await fetchDeployment();
  // Ensure correct network before obtaining signer
  try {
    await ensureWalletOnChain(Number(dep.chainId));
  } catch {}
  const prov = await getProvider();
  const signer = await prov.getSigner();
  const contract = await getContract(signer);
  const amount = ethers.parseEther(amountInEther);
  const note = memo || `Donation from ${donorName || 'anonymous'} via GiveHub`;
  console.debug("[web3] donateNative args:", {
    campaignId: campaignId.toString(),
    amount: amountInEther,
    chainId: dep.chainId,
    contract: dep.address
  });

  // No-escrow path: send native ZETA (value) and let contract wrap+forward
  const tx = await contract.donateNative(campaignId, donorName || '', note, { value: amount });
  console.debug("[web3] donation tx:", tx?.hash);
  try {
    await tx.wait(1);
  } catch (e) {
    if (isTxNotFoundError(e)) {
      const prov = ("provider" in signer ? (signer as ethers.Signer & { provider?: ethers.AbstractProvider | null }).provider : null) || null;
      const useProv = prov ?? (await getProvider());
      console.warn('[web3] tx.wait (donation) reported tx not found; retrying via manual polling…', { hash: tx.hash, err: e });
      await waitForReceiptWithRetries(useProv, tx.hash);
    } else {
      throw e as Error;
    }
  }
  return tx.hash;
}

// Donation function using ZRC-20 (local ERC20 on Zeta)
export async function donateZRC20ToCampaign(
  campaignId: bigint,
  tokenAddress: string,
  amount: string,
  tokenDecimals?: number,
  donorName?: string,
  memo?: string,
): Promise<string> {
  const dep = await fetchDeployment();
  // Ensure correct network before obtaining signer
  try {
    await ensureWalletOnChain(Number(dep.chainId));
  } catch {}
  const prov = await getProvider();
  const signer = await prov.getSigner();

  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    throw new Error("Invalid token address for ZRC-20 donation");
  }

  const contract = await getContract(signer);
  const provider = (
    ("provider" in signer ? (signer as ethers.Signer & { provider?: ethers.AbstractProvider | null }).provider : null)
  ) || null;
  const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  // Determine decimals (prefer provided from UI; otherwise read from chain)
  let decimals = typeof tokenDecimals === 'number' && Number.isFinite(tokenDecimals) ? tokenDecimals : 18;
  if (tokenDecimals == null) {
    try {
      const d: bigint | number = await erc20.decimals();
      const n = Number(d);
      if (Number.isFinite(n) && n > 0 && n <= 36) decimals = n;
    } catch {}
  }

  const amountUnits = ethers.parseUnits(amount, decimals);
  const note = memo || `Donation from ${donorName || 'anonymous'} via GiveHub`;

  // Approve contract to transfer tokens
  const contractAddress = (contract as unknown as { target?: string }).target || dep.address;
  let approveTx: ethers.TransactionResponse;
  try {
    approveTx = await erc20.approve(contractAddress, amountUnits);
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (/user rejected|denied|rejected the request/i.test(msg)) {
      throw new Error('User cancelled token approval');
    }
    throw e as Error;
  }

  // Wait for approval (tolerate transient tx-not-found like native path)
  try {
    await approveTx.wait(1);
  } catch (e) {
    if (isTxNotFoundError(e)) {
      const useProv = provider ?? (await getProvider());
      await waitForReceiptWithRetries(useProv, approveTx.hash);
    } else {
      throw e as Error;
    }
  }

  // Donate using token
  const donateTx = await (contract as unknown as {
    donateZRC20: (
      zrc20In: string,
      amount: bigint,
      campaignId: bigint,
      donorName: string,
      note: string,
    ) => Promise<ethers.TransactionResponse>
  }).donateZRC20(tokenAddress, amountUnits, campaignId, donorName || '', note);

  try {
    await donateTx.wait(1);
  } catch (e) {
    if (isTxNotFoundError(e)) {
      const useProv = provider ?? (await getProvider());
      await waitForReceiptWithRetries(useProv, donateTx.hash);
    } else {
      throw e as Error;
    }
  }

  return donateTx.hash;
}
