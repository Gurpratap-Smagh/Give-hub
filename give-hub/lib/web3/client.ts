"use client";

import { ethers } from "ethers";
import { CrossChainCrowdfundABI } from "./abi/GiveHubCrowdfund";

export type DeploymentInfo = {
  address: string;
  chainId: number;
  wzeta?: string;
};

type AddEthereumChainParameter = {
  chainId: string; // 0x-prefixed hex
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  blockExplorerUrls?: string[];
};

export async function fetchDeployment(): Promise<DeploymentInfo> {
  const res = await fetch("/api/web3/deployment", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deployment info");
  const json = await res.json();
  console.debug("[web3] deployment:", json);
  return json;
}

export async function getProvider(): Promise<ethers.BrowserProvider> {
  if (typeof window === "undefined") throw new Error("No window");
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No injected wallet. Please install MetaMask or Zeta wallet.");
  return new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
}

export async function connectWallet(): Promise<{ signer: ethers.Signer; address: string; chainId: number }>{
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  return { signer, address, chainId: Number(network.chainId) };
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

export async function createCampaignOnChain(input: CreateCampaignInput = {}): Promise<bigint> {
  const { signer } = await connectWallet();
  const dep = await fetchDeployment();
  // Best-effort ensure correct network based on deployment info
  try {
    await ensureWalletOnChain(Number(dep.chainId));
  } catch {}

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
  
  const receipt = await tx.wait();
  if (!receipt) throw new Error("No transaction receipt for createCampaign");
  console.debug("[web3] createCampaign receipt status:", receipt?.status);
  
  // Try to decode CampaignCreated to get ID
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "CampaignCreated") {
        const id = parsed.args?.campaignId as bigint;
        if (id !== undefined) return id;
      }
    } catch {}
  }
  
  // If we couldn't parse the created ID, fail fast so UI doesn't persist an invalid onChainId
  throw new Error("Could not parse CampaignCreated event; creation may have failed");
}

// Campaign management functions for CrossChainCrowdfund
export async function pauseCampaignOnChain(campaignId: bigint): Promise<void> {
  const { signer } = await connectWallet();
  const contract = await getContract(signer);
  const tx = await contract.pauseCampaign(campaignId);
  await tx.wait();
  console.debug("[web3] paused campaign:", campaignId.toString());
}

export async function resumeCampaignOnChain(campaignId: bigint): Promise<void> {
  const { signer } = await connectWallet();
  const contract = await getContract(signer);
  const tx = await contract.resumeCampaign(campaignId);
  await tx.wait();
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
  const contract = await getContract();
  const balance = await contract.getCampaignBalance(campaignId);
  return ethers.formatEther(balance);
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
  const provider = await getProvider();
  const dep = await fetchDeployment();
  const latest = await provider.getBlockNumber();
  const fromBlock = latest > lookbackBlocks ? latest - lookbackBlocks : 0;
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  
  // Filter by CampaignCreated events for this creator
  const topic0 = ethers.id("CampaignCreated(uint256,address,address)");
  const topic1 = ethers.zeroPadValue(creatorAddress, 32); // creator is indexed
  
  const logs = await provider.getLogs({ 
    address: dep.address, 
    fromBlock, 
    toBlock: latest, 
    topics: [topic0, topic1] 
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
  timestamp: string;
}[]> {
  const provider = await getProvider();
  const dep = await fetchDeployment();
  const latest = await provider.getBlockNumber();
  const fromBlock = latest > lookbackBlocks ? latest - lookbackBlocks : 0;
  const iface = new ethers.Interface(CrossChainCrowdfundABI);
  
  // Filter by ContributionReceived events for this campaign
  const topic0 = ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string)");
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
        donations.push({
          contributionId: parsed.args?.contributionId as bigint,
          donor: parsed.args?.donor as string,
          originalToken: parsed.args?.originalToken as string,
          originalAmount: ethers.formatEther(parsed.args?.originalAmount as bigint),
          convertedAmount: ethers.formatEther(parsed.args?.convertedAmount as bigint),
          originChain: parsed.args?.originChain as string,
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
  const { signer } = await connectWallet();
  const dep = await fetchDeployment();

  // Ensure wallet is on the deployment chain
  try {
    await ensureWalletOnChain(Number(dep.chainId));
  } catch {}

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
  const tx = await contract.donateNative(campaignId, note, { value: amount });
  console.debug("[web3] donation tx:", tx?.hash);
  await tx.wait();
  return tx.hash;
}
