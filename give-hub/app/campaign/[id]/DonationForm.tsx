'use client';

import { useMemo, useState } from 'react';
import TokenPicker from '@/components/TokenPicker';
import { ensureChain, payFromSepolia, waitForContribution, CHAIN_HEX } from '@/lib/payments/crosschain';
import { ethers } from 'ethers';
import type { Eip1193Provider } from 'ethers';
// If you have a generated ABI file for your contract, import it:
import CrowdfundAbi from '@/abis/CrossChainCrowdfund.json';

type Picked = { chain: string; symbol: string; address: string };

export default function DonationForm({ campaign }: { campaign: { id: string | number, title?: string } }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [selectedToken, setSelectedToken] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  const tokenLabel = useMemo(() => (
    selectedToken ? `${selectedToken.symbol}.${selectedToken.chain}` : ''
  ), [selectedToken]);

  // Normalize and validate amount as a decimal string with a maximum fractional precision
  // matching the token's decimals. Returns a normalized string (e.g., "0.5", "25") or throws.
  function normalizeAndValidateAmount(input: string, maxDecimals: number): string {
    const raw = String(input ?? '').trim();
    if (!raw) throw new Error('Enter an amount');
    // Replace commas with dots, drop spaces
    const s = raw.replace(/,/g, '.');
    // Must be digits optionally with a single dot
    if (!/^\d*(?:\.\d*)?$/.test(s)) throw new Error('Amount must be a number');
    const parts = s.split('.');
    let i = (parts[0] ?? '0');
    const f = (parts[1] ?? '');
    // Remove leading zeros in integer part, but keep one zero if all zeros
    i = i.replace(/^0+(?=\d)/, '');
    if (i === '') i = '0';
    if (f.length > maxDecimals) throw new Error(`Amount has more than ${maxDecimals} decimal places`);
    // Disallow zero or effectively zero amounts
    if (i === '0' && (f === '' || /^0+$/.test(f))) throw new Error('Amount must be greater than 0');
    return f ? `${i}.${f}` : i;
  }

  function isSepolia(chain: string) {
    return (chain || '').toUpperCase().includes('SEPOLIA');
  }
  function isBTC(chain: string) {
    return (chain || '').toUpperCase().includes('BTC');
  }
  function isZeth(symbol: string) {
    return (symbol || '').toUpperCase().includes('ZETH');
  }

  async function donateOnZetaDirect(amountNormalized: string) {
    // Reuse your existing Zeta path (what the modal used to do).
    // If you had a helper like handlePayment({ ... }), call it here.
    // Fallback generic path below (adjust method names/types to your contract if needed).

    const { ethereum } = window as unknown as { ethereum?: Eip1193Provider };
    if (!ethereum) throw new Error('Wallet not found');

    // Ensure Zeta
    await ensureChain(CHAIN_HEX.ZETA);

    const provider = new ethers.BrowserProvider(ethereum as Eip1193Provider);
    await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();

    // Amount → assume 6 decimals for USDC, 18 otherwise if you don't have per-token decimals here
    const decimals = selectedToken?.symbol.toUpperCase().includes('USDC') ? 6 : 18;
    const amt = ethers.parseUnits(amountNormalized, decimals);

    const contract = new ethers.Contract(
      process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT!,
      // ABI must expose whatever donate path you already use.
      // If your app already has a helper, prefer that helper.
      // Using a generic ABI import here:
      CrowdfundAbi,
      signer
    );

    // ---- IMPORTANT ----
    // Replace the call below with your actual function signature if different.
    // e.g., contract.donateZRC20(tokenIn, campaignId, amt, name, note)
    const tx = await contract.donateZRC20(
      selectedToken!.address,
      BigInt(campaign.id),
      amt,
      name,
      note
    );
    const rcpt = await tx.wait(1);
    return rcpt.transactionHash as string;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToken) return;

    setBusy(true);
    setStatus('Preparing…');

    try {
      const chain = selectedToken.chain;
      // Decide decimal precision hint based on token selection and chain
      const decimalsHint = ((): number => {
        const sym = (selectedToken.symbol || '').toUpperCase();
        if (isSepolia(chain)) return isZeth(selectedToken.symbol) ? 18 : (sym.includes('USDC') ? 6 : 18);
        return sym.includes('USDC') ? 6 : 18;
      })();
      // Normalize once and reuse across flows
      let amountNormalized: string;
      try {
        amountNormalized = normalizeAndValidateAmount(amount, decimalsHint);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid amount';
        setStatus(msg);
        return;
      }

      if (isSepolia(chain)) {
        const { ethereum } = window as unknown as { ethereum?: Eip1193Provider };
        const provider = new ethers.BrowserProvider(ethereum as Eip1193Provider);
        await provider.send('eth_requestAccounts', []);
        const donorAddress = await (await provider.getSigner()).getAddress();

        // The `onCall` function on the ZEVM contract expects this payload.
        const message = ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'string', 'string', 'address'],
          [campaign.id, selectedToken.address, name, note, donorAddress]
        ) as `0x${string}`;

        const isNative = isZeth(selectedToken.symbol);
        setStatus(isNative ? 'Paying on Sepolia (ETH)…' : `Approving ${selectedToken.symbol}…`);

        await payFromSepolia({
          receiver: process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT!,
          amount: amountNormalized,
          message,
          gateway: process.env.NEXT_PUBLIC_GATEWAY_SEPOLIA!,
          erc20: isNative ? undefined : process.env.NEXT_PUBLIC_ERC20_SEPOLIA_USDC!,
          setStatus,
        });

        setStatus('Bridging… waiting for credit on Zeta…');

        await waitForContribution({
          contract: process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT!,
          campaignId: Number(campaign.id),
          donor: donorAddress,
          timeoutMs: 180000,
        });

        setStatus('Donation confirmed on Zeta!');
        return;
      }

      if (isBTC(chain)) {
        // Placeholder: BTC testnet needs a deposit address from Zeta helper/SaaS you use.
        // Show "Generate address", then poll ZEVM for Donation event similarly to Sepolia path.
        setStatus('BTC deposit flow not wired: generate a testnet BTC deposit address and poll ZEVM for credit.');
        return;
      }

      // Default: ZETA tokens path (wallet on Zeta, donate directly)
      setStatus('Switching to Zeta…');
      await ensureChain(CHAIN_HEX.ZETA);
      setStatus('Donating on Zeta…');
      const hash = await donateOnZetaDirect(amountNormalized);

      setStatus(`Donation sent: ${hash.slice(0,10)}…`);

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setStatus(`Failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !amount || !selectedToken;
  const submitLabel = useMemo(() => {
    if (busy) return 'Processing…';
    if (!selectedToken) return 'Donate';
    const ch = selectedToken.chain.toUpperCase();
    if (ch.includes('SEPOLIA')) return `Donate ${selectedToken.symbol} on Sepolia`;
    if (ch.includes('ZETA')) return 'Donate on Zeta';
    if (ch.includes('BTC')) return 'Donate on Bitcoin Testnet';
    return 'Donate';
  }, [busy, selectedToken]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-full">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Token</label>
        <TokenPicker value={selectedToken ?? undefined} onChange={setSelectedToken} className="w-full" />
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
      {selectedToken?.chain === 'SEPOLIA' && (
        <div className="text-xs text-white/60 break-words">
          You&apos;ll pay on <b>Ethereum Sepolia</b>. We&apos;ll route it cross-chain and confirm on Zeta automatically.
        </div>
      )}
      {selectedToken?.chain === 'BTC' && (
        <div className="text-xs text-white/60 break-words">
          You&apos;ll send to a <b>Bitcoin testnet</b> address. We&apos;ll credit the donation after confirmation.
        </div>
      )}
      {selectedToken?.chain === 'ZETA' && (
        <div className="text-xs text-white/60 break-words">
          You&apos;ll donate directly on <b>Zeta Athens (7001)</b>.
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
