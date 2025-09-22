'use client';
import { useEffect, useMemo, useState } from 'react';
import FancySelect, { type FancyItem } from './FancySelect';

type Token = { symbol: string; address?: string };
type ByChain = Record<string, Token[]>;
type Picked = { chain: string; symbol: string; address?: string; isNative?: boolean };

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

// little helpers (inline so we don't import anything)
const NATIVE_ZETA = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const isAddr = (x?: string) => typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x.trim());

interface TokenPickerProps {
  value?: Picked;
  onChange: (value: Picked) => void;
  className?: string;
  creatorMode?: boolean; // WZETA-centric flow for creators
  excludeSepoliaEthContract?: boolean; // keep native ETH only on Sepolia
}

export default function TokenPicker({
  value,
  onChange,
  className = '',
  creatorMode = false,
  excludeSepoliaEthContract = false
}: TokenPickerProps) {
  const [data, setData] = useState<ByChain>({});
  const [chain, setChain] = useState<string>('');

  // Fetch available tokens + resolve/inject WZETA inline (API -> URL -> ENV)
  useEffect(() => {
    (async () => {
      // 1) Start with whatever your API returns (ok if empty)
      let byChain: ByChain = {};
      // Replace this section in your useEffect:
      try {
        // For testnet (Athens)
        const apiUrl = 'https://zetachain-athens.blockpi.network/lcd/v1/public/zeta-chain/fungible/foreign_coins';
        // For mainnet, use: https://zetachain.blockpi.network/lcd/v1/public/zeta-chain/fungible/foreign_coins
        
        const r = await fetch(apiUrl, { 
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (r.ok) {
          const response = await r.json();
          const foreignCoins = response.foreignCoins || [];
          
          byChain = { ZETA: [] };
          
          foreignCoins.forEach((coin: any) => {
            if (coin.zrc20_contract_address && coin.coin_type !== 'Gas') {
              // Filter out gas tokens, only include ERC20 tokens
              const symbol = coin.symbol || coin.name || 'Unknown';
              
              byChain.ZETA.push({
                symbol: symbol,
                address: coin.zrc20_contract_address
              });
            }
          });
          
          console.log('Fetched ZRC-20 tokens:', byChain.ZETA);
        } else {
          console.warn('Failed to fetch from ZetaChain API:', r.status);
          byChain = {};
        }
      } catch (error) {
        console.error('Failed to fetch ZRC-20 tokens:', error);
        byChain = {};
      }

      // 2) Ensure ZETA chain + add native ZETA sentinel first
      if (!byChain.ZETA) byChain.ZETA = [];
      if (!byChain.ZETA.some(t => t.symbol === 'ZETA' && t.address === NATIVE_ZETA)) {
        byChain.ZETA.unshift({ symbol: 'ZETA', address: NATIVE_ZETA });
      }

      // 3) Normalize blanks (only native keeps its "weird" sentinel)
      for (const k of Object.keys(byChain)) {
        byChain[k] = (byChain[k] || []).map((t) => {
          const isNativeZeta = (t.symbol === 'ZETA' && t.address === NATIVE_ZETA);
          const addr = (t.address ?? '').trim();
          return {
            symbol: t.symbol,
            address: isNativeZeta ? NATIVE_ZETA : (addr === '' ? undefined : addr),
          };
        });
      }

      // 4) Resolve WZETA *inline* (no imports):
      //    Try public JSON (NEXT_PUBLIC_ZETA_ADDRESSES_URL) -> ENV (NEXT_PUBLIC_WZETA_ATHENS)
      let wzeta: string | undefined = undefined;

      // 4a) JSON URL (optional)
      const url = process.env.NEXT_PUBLIC_ZETA_ADDRESSES_URL;
      if (url) {
        try {
          const r2 = await fetch(url, { cache: 'no-store' });
          if (r2.ok) {
            const j = await r2.json();
            // try a few common shapes that people publish
            const root =
              j?.testnet ?? j?.athens ?? j?.zevm_testnet ?? j?.mainnet ?? j?.zevm ?? j?.zetachain ?? j ?? {};
            const candidates = [
              root?.contracts?.wzeta?.address,
              root?.contracts?.WZETA?.address,
              root?.wzeta,
              root?.WZETA,
              root?.tokens?.wzeta,
              root?.tokens?.WZETA,
            ].filter(Boolean);
            for (const c of candidates) {
              if (isAddr(c)) { wzeta = (c as string).trim(); break; }
            }
          }
        } catch { /* ignore */ }
      }

      // 4b) ENV fallback
      if (!wzeta && isAddr(process.env.NEXT_PUBLIC_WZETA_ATHENS)) {
        wzeta = process.env.NEXT_PUBLIC_WZETA_ATHENS!.trim();
      }

      // 5) Inject WZETA if we have a valid address (and not already present)
      if (wzeta) {
        const hasW = byChain.ZETA.some(t =>
          t.symbol?.toUpperCase() === 'WZETA' && (t.address?.toLowerCase() === wzeta!.toLowerCase())
        );
        if (!hasW) byChain.ZETA.push({ symbol: 'WZETA', address: wzeta });
      }

      // 6) Sepolia native ETH only (optional)
      if (!byChain.SEPOLIA) byChain.SEPOLIA = [];
      if (!byChain.SEPOLIA.some(t => t.symbol?.toUpperCase() === 'ETH' && !t.address)) {
        byChain.SEPOLIA.unshift({ symbol: 'ETH' }); // native ETH has undefined address in this schema
      }
      if (excludeSepoliaEthContract) {
        byChain.SEPOLIA = byChain.SEPOLIA.filter(t => {
          const isEth = (t.symbol ?? '').toUpperCase() === 'ETH';
          const hasAddress = !!t.address && t.address.trim() !== '';
          return !(isEth && hasAddress); // keep native ETH only
        });
      }

      wzeta ="0x5F0b1A82749cB4e2278ec87F8bF6B618dC71A8bF";
      const hasW = byChain.ZETA.some(
        t => (t.symbol ?? '').toUpperCase() === 'WZETA' && (t.address ?? '').toLowerCase() === wzeta!.toLowerCase()
      );
      if (!hasW) byChain.ZETA.push({ symbol: 'WZETA', address: wzeta });
      setData(byChain);
      
    })();
  }, [excludeSepoliaEthContract]);

  // Creator mode → force ZETA chain & default to WZETA if available (else native ZETA)
  useEffect(() => {
    if (creatorMode && data.ZETA) {
      setChain('ZETA');
      if (!value) {
        const wz = data.ZETA.find(t => t.symbol === 'WZETA' && isAddr(t.address));
        if (wz) {
          onChange({ chain: 'ZETA', ...wz, isNative: false });
        } else {
          const zNat = data.ZETA.find(t => t.symbol === 'ZETA' && t.address === NATIVE_ZETA);
          if (zNat) onChange({ chain: 'ZETA', ...zNat, isNative: true });
        }
      }
    }
  }, [creatorMode, data, onChange, value]);

  const chainList = useMemo(() => {
    const availableChains = Object.keys(data).filter(c => data[c].length > 0);
    const desiredOrder = ['ZETA', 'SEPOLIA'];
    return desiredOrder.filter(c => availableChains.includes(c));
  }, [data]);

  // Choose sensible default (skip in creatorMode)
  useEffect(() => {
    if (chain || creatorMode) return;
    const first = chainList[0];
    if (first) setChain(first);
  }, [chainList, chain, creatorMode]);

  const tokens = useMemo(() => {
    if (chain === 'SEPOLIA') {
      const erc20s = (data['SEPOLIA'] || []).filter(t => (t.symbol ?? '').toUpperCase() !== 'ZETH');
      return [{ symbol: 'ETH' }, ...erc20s];
    }
    return data[chain] ?? [];
  }, [data, chain]);

  const hasTokens = tokens.length > 0;

  // keep internal chain synced if parent passes a preselected chain
  useEffect(() => {
    if (value?.chain && value.chain !== chain) setChain(value.chain);
  }, [value?.chain, chain]);

  // Chain select items
  const chainItems = useMemo<FancyItem[]>(() =>
    chainList.map(c => ({
      kind: 'option',
      key: c,
      label: CHAIN_LABEL[c] ?? c,
      value: c,
      icon: CHAIN_ICON[c],
    })), [chainList]);

  // Token select items
  const tokenItems = useMemo<FancyItem[]>(() => {
    if (!hasTokens) return [];
    const items: FancyItem[] = [];
    for (const t of tokens) {
      const isSepoliaNative = chain === 'SEPOLIA' && t.symbol === 'ETH' && t.address === undefined;
      const isZetaNative = chain === 'ZETA' && t.symbol === 'ZETA' && t.address === NATIVE_ZETA;
      const addrKey = (isSepoliaNative || isZetaNative)
        ? 'native'
        : (t.address ? t.address.toLowerCase() : '');
      if (!isSepoliaNative && !isZetaNative && addrKey === '') continue; // skip malformed non-native entries
      items.push({
        kind: 'option',
        key: `${t.symbol}:${addrKey}`,
        label: isSepoliaNative ? 'ETH (native)' : (isZetaNative ? 'ZETA (native)' : t.symbol),
        value: `${t.symbol}:${addrKey}`,
      });
    }
    return items;
  }, [hasTokens, tokens, chain]);

  // Auto-select first token on chain change (skip in creator mode)
  useEffect(() => {
    if (creatorMode) return;
    if (!value && chain && hasTokens) {
      const first = tokens[0];
      const isSepoliaNative = chain === 'SEPOLIA' && first.symbol === 'ETH' && first.address === undefined;
      const isZetaNative = first.symbol === 'ZETA' && first.address === NATIVE_ZETA;
      const isNative = isSepoliaNative || isZetaNative;
      onChange({
        chain,
        symbol: first.symbol,
        address: isNative ? undefined : first.address,
        isNative,
      });
    }
  }, [chain, hasTokens, tokens, value, onChange, creatorMode]);

  // CreatorMode simplified UI (optional – you can keep it unified if you prefer)
  if (creatorMode) {
    const zetaTokens = data.ZETA || [];
    // Ensure native ZETA always present
    const ensuredCreatorTokens = [
      { symbol: 'ZETA', address: NATIVE_ZETA },
      ...zetaTokens.filter(t => !(t.symbol === 'ZETA' && t.address === NATIVE_ZETA)),
    ].filter(t => t.symbol === 'ZETA' || t.symbol === 'WZETA');

    const creatorTokenItems = ensuredCreatorTokens.map(t => ({
      kind: 'option' as const,
      key: t.symbol + (t.symbol === 'ZETA' && t.address === NATIVE_ZETA ? '-native' : ''),
      label: `${t.symbol} (${t.symbol === 'ZETA' && t.address === NATIVE_ZETA ? 'Native' : 'Wrapped'})`,
      value: t.symbol + (t.symbol === 'ZETA' && t.address === NATIVE_ZETA ? '-native' : '')
    }));

    return (
      <div className="flex flex-col space-y-3">
        <div className="font-medium">Payment token:</div>
        <div className="w-60 sm:w-72">
          <FancySelect
            items={creatorTokenItems}
            value={value?.isNative ? 'ZETA-native' : value?.symbol ?? ''}
            onChange={(sym) => {
              const isNativeZeta = sym === 'ZETA-native';
              const tokenSymbol = isNativeZeta ? 'ZETA' : sym;
              const tok = ensuredCreatorTokens.find(t => {
                if (isNativeZeta) return t.symbol === 'ZETA' && t.address === NATIVE_ZETA;
                return t.symbol === tokenSymbol;
              });
              if (tok) {
                const isNative = isNativeZeta || (tok.symbol === 'ZETA' && tok.address === NATIVE_ZETA);
                onChange({ chain: 'ZETA', symbol: tok.symbol, address: isNative ? undefined : tok.address, isNative });
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

  // Normal mode
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="text-sm font-semibold">Chain</label>
      <FancySelect
        items={chainItems}
        value={chain}
        onChange={(v) => {
          if (v !== chain) {
            setChain(v);
            if (!creatorMode) {
              const newTokens = v === 'SEPOLIA'
                ? ([{ symbol: 'ETH' }, ...((data[v] ?? []).filter(t => (t.symbol ?? '').toUpperCase() !== 'ZETH'))])
                : (data[v] ?? []);
              if (newTokens.length > 0) {
                const first = newTokens[0] as { symbol: string; address?: string };
                const isSepoliaNative = v === 'SEPOLIA' && first.symbol === 'ETH' && first.address === undefined;
                const isZetaNative = first.symbol === 'ZETA' && first.address === NATIVE_ZETA;
                const isNative = isSepoliaNative || isZetaNative;
                onChange({ chain: v, symbol: first.symbol, address: isNative ? undefined : first.address, isNative });
              } else {
                onChange({ chain: v, symbol: '', address: '' });
              }
            }
          }
        }}
        disabled={creatorMode}
        placeholder="Select chain"
        className="w-60 sm:w-72"
      />

      <label className="text-sm font-semibold">Token</label>
      <FancySelect
        items={tokenItems}
        value={value ? `${value.symbol}:${(value.address ? value.address.toLowerCase() : 'native')}` : ''}
        onChange={(id) => {
          const [sym, addrKey] = id.split(':');
          const token = tokens.find((t) => {
            if (addrKey === 'native') {
              if (chain === 'SEPOLIA') return t.symbol === 'ETH' && t.address === undefined;
              if (chain === 'ZETA') return t.symbol === 'ZETA' && t.address === NATIVE_ZETA;
            }
            return t.symbol === sym && (t.address?.toLowerCase() === addrKey);
          });
          if (!token) return;
          const isSepoliaNative = chain === 'SEPOLIA' && sym === 'ETH' && addrKey === 'native';
          const isZetaNative = chain === 'ZETA' && sym === 'ZETA' && (addrKey === 'native' || token.address === NATIVE_ZETA);
          const isNative = isSepoliaNative || isZetaNative;
          onChange({
            chain,
            symbol: sym,
            address: isNative ? undefined : token.address,
            isNative,
          });
        }}
        disabled={!hasTokens || creatorMode}
        placeholder={hasTokens ? 'Select token' : 'No tokens available'}
        className="w-60 sm:w-72"
      />
    </div>
  );
}
