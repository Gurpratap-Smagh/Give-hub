'use client';
import { useEffect, useMemo, useState } from 'react';
import FancySelect, { type FancyItem } from './FancySelect';

type Token = { symbol: string; address: string };
type ByChain = Record<string, Token[]>;

type Picked = { chain: string; symbol: string; address: string };

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
      .then(({ byChain }) => setData(byChain ?? {}))
      .catch(() => setData({}));
  }, []);

  // Auto-select WZETA in creatorMode as soon as data loads
  useEffect(() => {
    if (creatorMode && data.ZETA) {
      const wzetaToken = data.ZETA.find(t => t.symbol === 'WZETA');
      if (wzetaToken) {
        setChain('ZETA');
        onChange({ chain: 'ZETA', ...wzetaToken });
      }
    }
  }, [creatorMode, data, onChange]);

  const groups = useMemo(() => {
    const availableChains = Object.keys(data).filter(c => data[c].length > 0);
    // Enforce desired order regardless of how envs are declared
    const desiredOrder = ['ZETA', 'SEPOLIA', 'SOLANA', 'BTC'];
    const ordered = desiredOrder.filter(c => availableChains.includes(c));
    const zetaGroup = ordered.filter(c => c === 'ZETA');
    const otherGroup = ordered.filter(c => c !== 'ZETA');
    const result: { label: string; chains: string[] }[] = [];
    if (zetaGroup.length > 0) result.push({ label: 'Zeta', chains: zetaGroup });
    if (otherGroup.length > 0) result.push({ label: 'Others', chains: otherGroup });
    return result;
  }, [data]);

  // Choose a sensible default chain (skip in creatorMode)
  useEffect(() => {
    if (chain || creatorMode) return;
    const firstAvailable = groups[0]?.chains[0];
    if (firstAvailable) setChain(firstAvailable);
  }, [groups, chain, creatorMode]);

  const tokens = useMemo(() => data[chain] ?? [], [data, chain]);
  const hasTokens = tokens.length > 0;

  // Keep internal chain in sync with provided value to avoid overriding preselected tokens
  useEffect(() => {
    if (value?.chain && value.chain !== chain) {
      setChain(value.chain);
    }
  }, [value?.chain, chain]);

  // FancySelect items for chains (grouped headers)
  const chainItems = useMemo<FancyItem[]>(() => {
    const items: FancyItem[] = [];
    for (const group of groups) {
      // No group headers in chain dropdown
      for (const c of group.chains) {
        items.push({
          kind: 'option',
          key: c,
          label: CHAIN_LABEL[c] ?? c,
          value: c,
          icon: CHAIN_ICON[c],
        });
      }
    }
    return items;
  }, [groups]);

  // FancySelect items for tokens
  const tokenItems = useMemo<FancyItem[]>(() => {
    if (!hasTokens) return [];
    const items: FancyItem[] = [];
    for (const t of tokens) {
      items.push({ kind: 'option', key: t.symbol, label: `${t.symbol}.${chain}`, value: t.symbol });
    }
    return items;
  }, [hasTokens, tokens, chain]);

  // Auto select first token when chain changes and nothing chosen yet
  useEffect(() => {
    if (creatorMode) return; // Skip in creator mode
    if (!value && chain && hasTokens) onChange({ chain, ...tokens[0] });
  }, [chain, hasTokens, tokens, value, onChange, creatorMode]);

  // Keep value coherent if chain changes
  // Removed effect that attempted to sync parent value on every chain change to avoid render loops.

  // WZETA-only mode for campaign creators
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

    return (
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-2">
          <div className="font-medium">Payment token:</div>
          <div className="px-2 py-1 rounded bg-blue-100 text-blue-800">
            {wzetaToken.symbol} (Zeta)
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Campaigns can only accept payments in WZETA on Zeta.
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
          if (tok) onChange({ chain, ...tok });
        }}
        disabled={!hasTokens || creatorMode}
        placeholder={hasTokens ? 'Select token' : 'No tokens available'}
        className="w-60 sm:w-72"
      />
    </div>
  );
}
