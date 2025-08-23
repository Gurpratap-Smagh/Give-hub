import { useState, useEffect, useCallback } from 'react';
import { useAvailableTokens } from './useAvailableTokens';
import { toUSD, TO_USD } from '../prices/converter';

export interface TokenPrice {
  tokenId: string;
  price: number;
  change24h: number;
  lastUpdated: number;
}

export interface PriceMap {
  [tokenAddress: string]: TokenPrice;
}

// Hook to provide local prices for tokens using fixed conversion rates
export const useLivePrices = (tokenAddresses: string[] = []) => {
  const { tokens, getTokenByAddress } = useAvailableTokens();
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const fetchPrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const newPrices: PriceMap = {};
      const addressesToProcess = tokenAddresses.length > 0 ? tokenAddresses : tokens.map(t => t.address);

      addressesToProcess.forEach(address => {
        const token = getTokenByAddress(address);
        if (token) {
          const symbol = token.symbol.split('.')[0]; // Strip chain suffix for lookup
          const price = TO_USD[symbol] ?? 0;
          
          newPrices[address.toLowerCase()] = {
            tokenId: symbol,
            price,
            change24h: 0, // Static prices have no change
            lastUpdated: Date.now()
          };
        }
      });

      setPrices(newPrices);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error('Error setting token prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to set prices');
    } finally {
      setLoading(false);
    }
  }, [tokenAddresses, tokens, getTokenByAddress]);

  // Update prices when tokens change
  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Helper functions
  const getPriceForToken = (address: string): TokenPrice | null => {
    const normalizedAddress = address.toLowerCase();
    return prices[normalizedAddress] || null;
  };

  const getUsdValue = (address: string, amount: bigint, decimals: number): number => {
    const price = getPriceForToken(address);
    if (!price) return 0;

    const humanAmount = Number(amount) / Math.pow(10, decimals);
    return humanAmount * price.price;
  };

  const formatUsdValue = (address: string, amount: bigint, decimals: number): string => {
    const usdValue = getUsdValue(address, amount, decimals);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(usdValue);
  };

  const formatTokenAmount = (amount: bigint, decimals: number, symbol: string): string => {
    const humanAmount = Number(amount) / Math.pow(10, decimals);
    return `${humanAmount.toLocaleString('en-US', { 
      minimumFractionDigits: 0,
      maximumFractionDigits: 6 
    })} ${symbol}`;
  };

  const isStale = (maxAgeMs: number = 300000): boolean => {
    return false; // Static prices are never stale
  };

  return {
    prices,
    loading,
    error,
    lastUpdate,
    getPriceForToken,
    getUsdValue,
    formatUsdValue,
    formatTokenAmount,
    isStale,
    refetch: fetchPrices
  };
};
