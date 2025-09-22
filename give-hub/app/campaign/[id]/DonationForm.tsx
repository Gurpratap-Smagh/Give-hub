'use client';

import { useMemo, useState } from 'react';
import TokenPicker from '@/components/TokenPicker';
import { makePayment } from '@/lib/payments/zetachain-gateway';
import { CHAIN_NAMES } from '@/components/payment-modal';

type Picked = { chain: string; symbol: string; address?: string; isNative?: boolean };
 
export default function DonationForm({ campaign }: { campaign: { onchainId: string | number, title?: string } }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [selectedToken, setSelectedToken] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  const tokenLabel = useMemo(() => (
    selectedToken ? `${selectedToken.symbol}.${selectedToken.chain}` : ''
  ), [selectedToken]);

  // Validate and normalize amount input
  function validateAmount(input: string): string {
    const raw = String(input ?? '').trim();
    if (!raw) throw new Error('Please enter an amount');
    
    const normalized = raw.replace(/,/g, '.');
    if (!/^\d*\.?\d*$/.test(normalized)) throw new Error('Amount must be a valid number');
    
    const num = parseFloat(normalized);
    if (isNaN(num) || num <= 0) throw new Error('Amount must be greater than 0');
    
    return normalized;
  }

  function getChainFromToken(token: Picked | null): 'sepolia' | 'zeta' {
    if (!token) return 'zeta';
    const chain = (token.chain || '').toUpperCase();
    if (chain.includes('SEPOLIA')) return 'sepolia';
    return 'zeta';
  }
  function chainIdFromToken(token: { chain?: string } | null): number {
    const k = (token?.chain || '').toUpperCase();
    if (k === 'SEPOLIA') return 11155111;
    return 7001; // default ZetaChain Athens
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToken) {
      setStatus('Please select a token');
      return;
    }

    setBusy(true);
    setStatus('Validating input...');

    try {
      // Validate amount
      let normalizedAmount: string;
      try {
        normalizedAmount = validateAmount(amount);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid amount';
        setStatus(msg);
        return;
      }

      const preferredChain = getChainFromToken(selectedToken);
      const donorName = name.trim() || 'Anonymous';
      const donorNote = note.trim();

      setStatus(`Initiating payment on ${preferredChain === 'sepolia' ? 'Ethereum Sepolia' : 'ZetaChain'}...`);
      const sourceChainId = chainIdFromToken(selectedToken);


      const txHash = await makePayment({
        campaignId: Number(campaign.onchainId),
        donorName,
        note: donorNote,
        amount: normalizedAmount,
        sourceChainId, // 7001 or 11155111
        mode: detectMode(selectedToken),
        tokenAddress: selectedToken.address || undefined,
        onStatusUpdate: (s: string) => setStatus(s),
        preferredChain: CHAIN_NAMES[sourceChainId],
      });

      

      setStatus(`Donation successful! Transaction: ${txHash.slice(0, 10)}...`);
      
      // Clear form
      setAmount('');
      setName('');
      setNote('');
      
    } catch (err: unknown) {
      console.error('Payment error:', err);
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setStatus(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !amount || !selectedToken;
  function detectMode(t: Picked): 'zeta_native' | 'zeta_zrc20' | 'crosschain_sepolia' {
    const chain = (t.chain || '').toUpperCase();
    if (chain === 'ZETA') return t.isNative ? 'zeta_native' : 'zeta_zrc20';
    if (chain === 'SEPOLIA') return 'crosschain_sepolia';
    throw new Error(`Unsupported chain: ${t.chain}`);
  }
    const submitLabel = useMemo(() => {
    if (busy) return 'Processing…';
    if (!selectedToken) return 'Donate';
    const mode = detectMode(selectedToken);
    if (mode === 'crosschain_sepolia') return `Donate ${selectedToken.symbol} via Sepolia → ZetaChain`;
    return `Donate ${selectedToken.symbol} on ZetaChain`;
    }, [busy, selectedToken]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-full">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Token</label>
        <TokenPicker
          value={selectedToken ?? undefined}
          onChange={(token: Picked) => setSelectedToken(token)}
          className="w-full"
          // Donation form must ignore the Sepolia ETH ERC-20 from env, but keep native ETH and all other tokens
          excludeSepoliaEthContract
        />
        {selectedToken && (
          <div className="text-xs text-white/60 break-words">
            Selected: <span className="font-mono">{tokenLabel}</span> @ <span className="font-mono">{selectedToken.address}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          Donation amount {selectedToken?.symbol ? `(${selectedToken.symbol})` : ''}
        </label>
        <input
          inputMode="decimal"
          placeholder="e.g., 25"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Your name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white"
        />
      </div>

      {/* UX hints */}
      {selectedToken && (
        <div className="text-xs text-white/60 break-words">
          {getChainFromToken(selectedToken) === 'sepolia' ? (
            <>You&apos;ll pay on <b>Ethereum Sepolia</b>. We&apos;ll route it cross-chain and confirm on ZetaChain automatically.</>
          ) : (
            <>You&apos;ll donate directly on <b>ZetaChain Athens (7001)</b>.</>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>

      {!!status && (
        <div className="text-xs text-white/60 break-words">{status}</div>
      )}
    </form>
  );
}
