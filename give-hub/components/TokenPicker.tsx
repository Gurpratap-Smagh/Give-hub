'use client';
import { useEffect, useMemo, useState } from 'react';
import FancySelect, { type FancyItem } from './FancySelect';

type Token = { symbol: string; address: string };
type ByChain = Record<string, Token[]>;

type Picked = { chain: string; symbol: string; address: string; isNative?: boolean };

const CHAIN_LABEL: Record<string, string> = {
  ZETA: 'ZetaChain',
  SEPOLIA: 'Ethereum Sepolia',
  BTC: 'Bitcoin Testnet',
  SOLANA: 'Solana Testnet',
};

const CHAIN_ICON: Record<string, string> = {
  ZETA: '',
  SEPOLIA: '',
  SOLANA: '',
  BTC: '',
};

interface TokenPickerProps {
  value?: Picked;
  onChange: (value: Picked) => void;
  className?: string;
  creatorMode?: boolean; // WZETA-only mode for campaign creators
}

export default function TokenPicker({
  value,
  onChange,
  className = '',
  creatorMode = false
}: TokenPickerProps) {
  const [data, setData] = useState<ByChain>({});
  const [chain, setChain] = useState<string>('');

  // Fetch available tokens
  useEffect(() => {
    fetch('/api/zrc20-options')
      .then(r => r.json())
      .then(({ byChain }: { byChain?: ByChain }) => {
        // Add native ZETA to options if on ZetaChain
        const newData: ByChain = byChain ? { ...byChain } : {};
        
        // Always ensure we have ZETA chain data
        if (!newData.ZETA) {
          newData.ZETA = [];
        }
        
        // Always add native ZETA at the beginning of the list for both donation and creation flows
        // Using 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE as a special identifier for native token
        if (!newData.ZETA.some((t: Token) => t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')) {
          newData.ZETA = [
            { symbol: 'ZETA', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
            ...newData.ZETA
          ];
        }
        
        setData(newData);
      })
      .catch(() => setData({}));
  }, []);

  // For creatorMode, set chain to ZETA and default to WZETA for campaign creation
  useEffect(() => {
    if (creatorMode && data.ZETA) {
      // Only set the chain to ZETA
      setChain('ZETA');
      
      // Only initialize value if none is set yet
      if (!value) {
        // Default to WZETA for creator mode (campaign creation)
        const wzetaToken = data.ZETA.find(t => t.symbol === 'WZETA');
        if (wzetaToken) {
          onChange({ chain: 'ZETA', ...wzetaToken, isNative: false });
        } else {
          // Fallback to native ZETA if WZETA not available
          const zetaToken = data.ZETA.find(t => t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
          if (zetaToken) {
            onChange({ chain: 'ZETA', ...zetaToken, isNative: true });
          }
        }
      }
    }
  }, [creatorMode, data, onChange, value]);

  const chainList = useMemo(() => {
    const availableChains = Object.keys(data).filter(c => data[c].length > 0);
    // Enforce desired order regardless of how envs are declared
    const desiredOrder = ['ZETA', 'SEPOLIA', 'SOLANA', 'BTC'];
    return desiredOrder.filter(c => availableChains.includes(c));
  }, [data]);

  // Choose a sensible default chain (skip in creatorMode)
  useEffect(() => {
    if (chain || creatorMode) return;
    const firstAvailable = chainList[0];
    if (firstAvailable) setChain(firstAvailable);
  }, [chainList, chain, creatorMode]);

  const tokens = useMemo(() => data[chain] ?? [], [data, chain]);
  const hasTokens = tokens.length > 0;

  // Keep internal chain in sync with provided value to avoid overriding preselected tokens
  useEffect(() => {
    if (value?.chain && value.chain !== chain) {
      setChain(value.chain);
    }
  }, [value?.chain, chain]);

  // FancySelect items for chains (simplified, no grouping)
  const chainItems = useMemo<FancyItem[]>(() => {
    return chainList.map(c => ({
      kind: 'option',
      key: c,
      label: CHAIN_LABEL[c] ?? c,
      value: c,
      icon: CHAIN_ICON[c],
    }));
  }, [chainList]);

  // FancySelect items for tokens
  const tokenItems = useMemo<FancyItem[]>(() => {
    if (!hasTokens) return [];
    const items: FancyItem[] = [];
    for (const t of tokens) {
      items.push({ kind: 'option', key: t.symbol, label: t.symbol, value: t.symbol });
    }
    return items;
  }, [hasTokens, tokens]);

  // Auto select first token when chain changes and nothing chosen yet
  useEffect(() => {
    if (creatorMode) return; // Skip in creator mode
    if (!value && chain && hasTokens) onChange({ chain, ...tokens[0] });
  }, [chain, hasTokens, tokens, value, onChange, creatorMode]);

  // Keep value coherent if chain changes
  // Removed effect that attempted to sync parent value on every chain change to avoid render loops.

  // WZETA-only mode for campaign creators - but show both ZETA and WZETA options
  if (creatorMode) {
    // Look for WZETA token in Zeta chain data
    const zetaTokens = data.ZETA || [];
    const wzetaToken = zetaTokens.find(t => t.symbol === 'WZETA');
    
    if (!wzetaToken) {
      return (
        <div className="text-amber-500">
          Error: WZETA token not available. Please check environment variables.
        </div>
      );
    }

    // Show both ZETA and WZETA options for creators
    // Make sure we have at least native ZETA and WZETA
    let creatorTokens = zetaTokens.filter(t => t.symbol === 'ZETA' || t.symbol === 'WZETA');
    
    // Ensure native ZETA is included even if not in the API response
    const hasNativeZeta = creatorTokens.some(t => t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
    if (!hasNativeZeta) {
      creatorTokens = [
        { symbol: 'ZETA', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        ...creatorTokens
      ];
    }
    
    // Make sure native ZETA is first in the list
    const sortedCreatorTokens = [...creatorTokens].sort((a, b) => {
      if (a.symbol === 'ZETA' && a.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') return -1;
      if (b.symbol === 'ZETA' && b.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') return 1;
      return 0;
    });
    
    const creatorTokenItems = sortedCreatorTokens.map(t => ({
      kind: 'option' as const,
      key: t.symbol + (t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' ? '-native' : ''),
      label: `${t.symbol} (${t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' ? 'Native' : 'Wrapped'})`,
      value: t.symbol + (t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' ? '-native' : '')
    }));

    return (
      <div className="flex flex-col space-y-3">
        <div className="flex items-center space-x-2">
          <div className="font-medium">Payment token:</div>
        </div>
        <div className="w-60 sm:w-72">
          <FancySelect
            items={creatorTokenItems}
            value={value?.isNative ? 'ZETA-native' : value?.symbol ?? ''}
            onChange={(sym) => {
              // Handle the special native ZETA case from our key format
              const isNativeZeta = sym === 'ZETA-native';
              const tokenSymbol = isNativeZeta ? 'ZETA' : sym;
              
              const tok = sortedCreatorTokens.find(t => {
                if (isNativeZeta) {
                  return t.symbol === 'ZETA' && t.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
                }
                return t.symbol === tokenSymbol;
              });
              
              if (tok) {
                const isNative = isNativeZeta || (
                  tok.symbol === 'ZETA' && tok.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
                );
                onChange({ chain: 'ZETA', ...tok, isNative });
              }
            }}
            placeholder="Select token"
          />
        </div>
        <p className="text-xs text-gray-500">
          {value?.symbol === 'ZETA' 
            ? 'Native ZETA will be wrapped to WZETA for campaign payouts'
            : 'Wrapped ZETA is used for campaign payouts'}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Chain select grouped as Zeta / Others */}
      <label className="text-sm font-semibold force-header opacity-100">Chain</label>
      <FancySelect
        items={chainItems}
        value={chain}
        onChange={(v) => {
          if (v !== chain) {
            setChain(v);
            if (!creatorMode) {
              const list = data[v] ?? [];
              if (list.length > 0) onChange({ chain: v, ...list[0] });
              else onChange({ chain: v, symbol: '', address: '' });
            }
          }
        }}
        disabled={creatorMode}
        placeholder="Select chain"
        className="w-60 sm:w-72"
      />

      {/* Token select */}
      <label className="text-sm font-semibold force-header opacity-100">Token</label>
      <FancySelect
        items={tokenItems}
        value={value?.symbol ?? ''}
        onChange={(sym) => {
          const tok = tokens.find(t => t.symbol === sym);
          if (tok) {
            const isNative = tok.symbol === 'ZETA' && 
                              tok.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
            onChange({ chain, ...tok, isNative });
          }
        }}
        disabled={!hasTokens || creatorMode}
        placeholder={hasTokens ? 'Select token' : 'No tokens available'}
        className="w-60 sm:w-72"
      />
    </div>
  );
}
