'use client';

import { useCallback, useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { ZetaChainClient } from '@zetachain/toolkit/client';
import { parseEther } from 'viem';

// Hardcode or use env var for contract address (deployed by you)
const CROWDFUND_ADDRESS = (process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS ||
  '0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429') as `0x${string}`;

// Import ABI - extract abi array from Hardhat artifact
import CROWDFUND_ARTIFACT from '@/abis/CrossChainCrowdfund.json' with { type: 'json' };
import type { Abi } from 'viem';
const CROWDFUND_ABI = CROWDFUND_ARTIFACT.abi as Abi;

interface CampaignData {
  id: number;
  creator: string;
  preferredZRC20: string;
  status: number;
  target: bigint;
  totalNative: bigint;
  totalDeposited: bigint;
}

/**
 * Hook to create a campaign
 */
export function useCreateCampaign() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (preferredZRC20: string): Promise<string | null> => {
      if (!walletClient) {
        setError('No wallet connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const hash = await walletClient.writeContract({
          address: CROWDFUND_ADDRESS,
          abi: CROWDFUND_ABI,
          functionName: 'createCampaign',
          args: [preferredZRC20 as `0x${string}`],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return receipt?.transactionHash || hash;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create campaign';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient]
  );

  return { create, loading, error };
}

/**
 * Hook to update campaign destination
 */
export function useUpdateCampaignDestination() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (campaignId: number, payoutAddress: string, payoutGasLimit: number): Promise<string | null> => {
      if (!walletClient) {
        setError('No wallet connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const hash = await walletClient.writeContract({
          address: CROWDFUND_ADDRESS,
          abi: CROWDFUND_ABI,
          functionName: 'updateCampaignDestination',
          args: [BigInt(campaignId), payoutAddress as `0x${string}`, BigInt(payoutGasLimit)],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return receipt?.transactionHash || hash;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update campaign destination';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient]
  );

  return { update, loading, error };
}

/**
 * Hook for native chain donations (on ZetaChain)
 */
export function useNativeDonate() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const donate = useCallback(
    async (campaignId: number, donorName: string, note: string, amount: string): Promise<string | null> => {
      if (!walletClient) {
        setError('No wallet connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const hash = await walletClient.writeContract({
          address: CROWDFUND_ADDRESS,
          abi: CROWDFUND_ABI,
          functionName: 'donateNative',
          args: [BigInt(campaignId), donorName, note],
          value: parseEther(amount),
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        return receipt?.transactionHash || hash;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to donate';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, publicClient]
  );

  return { donate, loading, error };
}

/**
 * Hook for cross-chain donations via ZetaChain Gateway
 */
export function useCrossChainDonate() {
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const donate = useCallback(
    async (
      campaignId: number,
      donorName: string,
      note: string,
      amount: string // in native tokens (e.g., 0.01 ETH)
    ): Promise<{ hash: string } | null> => {
      if (!walletClient) {
        setError('No wallet connected');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // Initialize ZetaChain client with wagmi wallet
        const client = new ZetaChainClient({
          signer: walletClient as any,
          network: 'testnet', // or 'mainnet' depending on your deployment
        });

        // Call evmDepositAndCall through the client instance
        const result = await client.evmDepositAndCall({
          amount: parseEther(amount).toString(),
          erc20: undefined, // native token (ETH)
          receiver: CROWDFUND_ADDRESS,
          types: ['uint256', 'string', 'string'],
          values: [campaignId.toString(), donorName, note],
          revertOptions: {
            callOnRevert: true,
            revertAddress: CROWDFUND_ADDRESS,
            revertMessage: 'Donation failed',
          },
          txOptions: {
            gasLimit: '500000',
          },
        });

        return {
          hash: result.hash || '',
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to donate across chains';
        setError(errorMsg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [walletClient]
  );

  return { donate, loading, error };
}

/**
 * Hook to fetch campaign data
 */
export function useCampaignData(campaignId: number) {
  const publicClient = usePublicClient();
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicClient) {
      setError('Public client not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const campaign = await publicClient.readContract({
        address: CROWDFUND_ADDRESS,
        abi: CROWDFUND_ABI,
        functionName: 'campaigns',
        args: [BigInt(campaignId)],
      });

      const c = campaign as any;
      setData({
        id: campaignId,
        creator: c.creator,
        preferredZRC20: c.preferredZRC20,
        status: c.status,
        target: BigInt(c.target),
        totalNative: BigInt(c.totalNative),
        totalDeposited: BigInt(c.totalDeposited),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch campaign';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [publicClient, campaignId]);

  return { data, loading, error, fetch };
}

/**
 * Hook to fetch all synced campaigns
 */
export function useGetAllSyncedCampaigns(startId: number, limit: number) {
  const publicClient = usePublicClient();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicClient) {
      setError('Public client not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await publicClient.readContract({
        address: CROWDFUND_ADDRESS,
        abi: CROWDFUND_ABI,
        functionName: 'getAllSyncedCampaigns',
        args: [BigInt(startId), BigInt(limit)],
      });

      const campaignsList = (result as any[]).map((campaign: any, index: number) => ({
        id: startId + index,
        creator: campaign.creator,
        preferredZRC20: campaign.preferredZRC20,
        status: campaign.status,
        target: BigInt(campaign.target),
        totalNative: BigInt(campaign.totalNative),
        totalDeposited: BigInt(campaign.totalDeposited),
      }));

      setCampaigns(campaignsList);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch campaigns';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [publicClient, startId, limit]);

  return { campaigns, loading, error, fetch };
}

/**
 * Hook to get ZRC20 token information
 */
export function useGetZRC20Token(tokenAddress: string) {
  const publicClient = usePublicClient();
  const [token, setToken] = useState<{ symbol: string; decimals: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicClient) {
      setError('Public client not available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const erc20ABI = [
        {
          inputs: [],
          name: 'symbol',
          outputs: [{ type: 'string' }],
          stateMutability: 'view',
          type: 'function',
        },
        {
          inputs: [],
          name: 'decimals',
          outputs: [{ type: 'uint8' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const;

      const symbol = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20ABI,
        functionName: 'symbol',
      });

      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20ABI,
        functionName: 'decimals',
      });

      setToken({ symbol: symbol as string, decimals: Number(decimals) });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch token info';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [publicClient, tokenAddress]);

  return { token, loading, error, fetch };
}

export { CROWDFUND_ABI, CROWDFUND_ADDRESS };
