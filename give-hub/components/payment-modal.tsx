"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { Campaign } from "@/lib/db";
import { processDonation } from "@/lib/payments"; // ZEVM direct path
import { connectWallet } from "@/lib/web3/client";
import { useAvailableTokens, type Token } from "@/lib/hooks/useAvailableTokens";
import TokenPicker from "@/components/TokenPicker";
import { formatCurrency } from "@/lib/utils/format";
import { notify } from "@/lib/utils/notify"; // Add the notify import

// Cross-chain helpers (Sepolia → ZEVM)
import { ethers } from "ethers";
import {
  payFromSepolia,
  waitForContribution,
  ensureChain,
  CHAIN_HEX,
} from "@/lib/payments/crosschain";
import { extractRawErrorString } from "@/lib/utils/blockchain-errors";

const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "local").toLowerCase();

interface PaymentModalProps {
  campaign: Campaign;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (amount: number, chain: string) => void;
  initialAmount?: number;
  initialChain?: string;
  initialToken?: string;
  onPaymentError?: (error: Error) => void;
  onCancel?: () => void;
  autoSubmit?: boolean;
  onStatusUpdate?: (status: string) => void;
}

// Encode the payload your ZEVM contract expects in onCall(...)
function buildMessage(params: {
  campaignId: number;
  name?: string;
  note?: string;
}) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const inner = coder.encode(
    ["uint256", "string", "string"],
    [params.campaignId, params.name ?? "", params.note ?? ""]
  );
  return coder.encode(["string", "bytes"], ["donate", inner]) as `0x${string}`;
}

// Validate environment variables - throw readable errors if missing
function validateEnv() {
  // IMPORTANT: Use direct references so Next.js inlines these at build-time in client bundles
  const entries: Array<[string, string | undefined]> = [
    ['NEXT_PUBLIC_CROSSCHAIN_CONTRACT', process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT],
    ['NEXT_PUBLIC_GATEWAY_SEPOLIA', process.env.NEXT_PUBLIC_GATEWAY_SEPOLIA],
    ['NEXT_PUBLIC_ERC20_SEPOLIA_USDC', process.env.NEXT_PUBLIC_ERC20_SEPOLIA_USDC],
    ['NEXT_PUBLIC_ZRC20_ZETH_SEPOLIA', process.env.NEXT_PUBLIC_ZRC20_ZETH_SEPOLIA],
    ['NEXT_PUBLIC_WZETA_ADDRESS', process.env.NEXT_PUBLIC_WZETA_ADDRESS],
    ['NEXT_PUBLIC_ZETA_RPC_HTTP', process.env.NEXT_PUBLIC_ZETA_RPC_HTTP],
  ];

  const missing = entries.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export default function PaymentModal({
  campaign,
  isOpen,
  onClose,
  onPaymentSuccess,
  initialAmount,
  initialChain,
  onPaymentError,
  onCancel,
  initialToken,
  autoSubmit,
  onStatusUpdate,
}: PaymentModalProps) {
  const hasUsername = (u: unknown): u is { username: string } =>
    typeof u === "object" &&
    u !== null &&
    "username" in (u as Record<string, unknown>) &&
    typeof (u as { username?: unknown }).username === "string";

  const effectiveChains =
    Array.isArray(campaign.chains) && campaign.chains.length > 0
      ? campaign.chains
      : PAYMENT_PROVIDER === "zetachain"
      ? ["ZetaChain"]
      : ["Local"];

  // **** AMOUNT: we keep exactly what the user typed (string). ****
  const [amount, setAmount] = useState<string>("");

  const [selectedChain, setSelectedChain] = useState<string>(initialChain || effectiveChains[0]);
  const [donorName, setDonorName] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();

  // On-chain mapping
  const onChainCampaignId = campaign.onChain?.campaignId;
  const onZeta = PAYMENT_PROVIDER === "zetachain";
  const missingOnChainMapping = onZeta && !onChainCampaignId;

  // Tokens (for Zeta + cross-chain)
  const { byChain, getNativeToken, getTokenByAddress } = useAvailableTokens();
  const [picked, setPicked] = useState<
    { chain: string; symbol: string; address: string; isNative?: boolean } | undefined
  >(undefined);
  // Enforce wallet network to match UI-selected chain
  const [networkSwitching, setNetworkSwitching] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const selectedToken: Token | undefined = picked?.address
    ? getTokenByAddress(picked.address)
    : undefined;
  const nativeToken = getNativeToken();

  // Safe display symbol for UI (avoid reading .symbol on undefined)
  const fallbackNativeSymbol = process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || "ZETA";
  const displaySymbol = onZeta ? (selectedToken?.symbol ?? nativeToken?.symbol ?? fallbackNativeSymbol) : "$";

  // Wallet (local/demo)
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (typeof initialAmount === "number" && initialAmount > 0) {
      setAmount(String(initialAmount));
    }
    setSelectedChain(initialChain || effectiveChains[0]);
    setPaymentError(null);
    
    // Validate environment variables when modal opens (only in zetachain mode)
    if (PAYMENT_PROVIDER === "zetachain") {
      try {
        validateEnv();
      } catch (error) {
        // Show error to user with toast instead of console.error
        const errorMsg = error instanceof Error ? error.message : "Missing required environment variables";
        setWalletError(errorMsg);
        notify(errorMsg, 'error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Preselect token from initialToken and initialChain when available
  useEffect(() => {
    if (!isOpen) return;
    const sym = (initialToken || '').trim();
    const ch = (initialChain || '').trim();
    if (!sym || !ch) return;
    const key = ch.toUpperCase();
    const list = (byChain && (byChain as Record<string, Array<{ symbol: string; address: string }>>)[key]) || [];
    const match = list.find(t => (t.symbol || '').toLowerCase() === sym.toLowerCase());
    if (match) {
      setPicked({ chain: key, symbol: match.symbol, address: match.address });
    }
  }, [isOpen, initialToken, initialChain, byChain]);

  // If only initialChain is provided, preselect the chain in TokenPicker without choosing a token
  useEffect(() => {
    if (!isOpen) return;
    if (picked?.chain) return; // don't override if already set
    const ch = (initialChain || '').trim();
    if (!ch) return;
    const key = ch.toUpperCase();
    setPicked({ chain: key, symbol: '', address: '' });
  }, [isOpen, initialChain, picked?.chain]);

  // Auto-submit for AI flows
  useEffect(() => {
    if (!isOpen || !autoSubmit || isProcessing) return;
    const amt = parseFloat((amount || "").replace(/,/g, "."));
    if (!amt || !(amt > 0)) return;
    if (!selectedChain) return;
    // In zetachain mode, require a picked token before auto-submitting
    if (onZeta && !picked?.address) return;
    if (onZeta && missingOnChainMapping) return;
    const t = setTimeout(() => {
      void handlePayment();
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoSubmit, amount, selectedChain, picked?.address, isProcessing, missingOnChainMapping]);

  // Force wallet to selected chain as soon as the user picks a chain
  useEffect(() => {
    if (!isOpen || !onZeta) return;
    const target = (picked?.chain || '').toUpperCase();
    if (!target) return;
    const toHex = target.includes('SEPOLIA') ? CHAIN_HEX.SEPOLIA : CHAIN_HEX.ZETA;
    let mounted = true;
    (async () => {
      setNetworkSwitching(true);
      setNetworkError(null);
      try {
        await ensureChain(toHex);
        // Verify wallet actually switched
        if (typeof window !== 'undefined') {
          const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
          if (eth) {
            const provider = new ethers.BrowserProvider(eth);
            const net = await provider.getNetwork();
            const expected = parseInt(toHex, 16);
            if (mounted && Number(net.chainId) !== expected) {
              const errorMsg = `Wallet is on chainId ${net.chainId.toString()} but expected ${expected}. Please approve the network switch in your wallet.`;
              setNetworkError(errorMsg);
              notify(errorMsg, 'error');
            }
          }
        }
      } catch (e) {
        if (!mounted) return;
        const msg = extractRawErrorString(e);
        setNetworkError(msg || 'Failed to switch network');
        notify(msg || 'Failed to switch network', 'error');
      } finally {
        if (mounted) setNetworkSwitching(false);
      }
    })();
    return () => { mounted = false; };
  }, [isOpen, onZeta, picked?.chain]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onCancel) onCancel();
        onClose();
      }
    };
    const onMouse = (e: MouseEvent) => {
      const el = modalRef.current;
      if (!el) return;
      const target = e.target as Node;
      
      // Check if click is on a dropdown or select element
      const clickedElement = e.target as Element;
      const isDropdownClick = clickedElement.closest('select') || 
                             clickedElement.closest('[role="listbox"]') || 
                             clickedElement.closest('[role="option"]') ||
                             clickedElement.closest('.token-picker') ||
                             clickedElement.classList?.contains('gh-input') ||
                             clickedElement.classList?.contains('gh-textarea');
      
      if (!el.contains(target) && !isDropdownClick) {
        if (onCancel) onCancel();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouse, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouse, true);
    };
  }, [isOpen, onCancel, onClose]);

  if (!isOpen) return null;

  // Helper: connected address
  const getConnectedAddress = async (): Promise<string> => {
    // Get ethereum provider from window
    if (typeof window === 'undefined') {
      throw new Error('No wallet detected');
    }
    const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!eth) throw new Error('No wallet detected');
    const provider = new ethers.BrowserProvider(eth);
    const signer = await provider.getSigner();
    return await signer.getAddress();
  };

  const handlePayment = async () => {
    const raw = (amount || "").trim().replace(/,/g, ".");
    if (!raw || Number.isNaN(Number(raw)) || Number(raw) <= 0) {
      notify("Please enter a valid donation amount", "error");
      return;
    }

    setIsProcessing(true);
    try {
      // Validate environment variables if we're in zetachain mode
      if (PAYMENT_PROVIDER === "zetachain") {
        validateEnv();
      }
      // LOCAL mock path
      if (!onZeta) {
        if (!walletAddress) {
          try {
            const { address } = await connectWallet();
            setWalletAddress(address);
          } catch {}
        }

        // Simulate a successful local donation without on-chain call
        onPaymentSuccess(parseFloat(raw), selectedChain);
        onClose();
        setAmount(""); setDonorName(""); setNote("");
        return;
      }

      // --- ZETA / CROSS-CHAIN MODE ---
      if (!onChainCampaignId) {
        throw new Error("This campaign isn’t mapped on-chain yet. Ask the creator to sync it.");
      }

      // Determine route from TokenPicker selection
      const pickedChain = (picked?.chain || "").toUpperCase();
      const isSepolia = pickedChain.includes("SEPOLIA");
      const isZeta = pickedChain.includes("ZETA");
      const chainLabel = isSepolia ? "Ethereum Sepolia" : isZeta ? "ZetaChain" : "ZetaChain";
      
      // Validate token selection
      if (!picked?.address) {
        notify("Please select a token to use for donation", "error");
        throw new Error("Please select a token to use for donation");
      }

      // Donor address for message + receipt filter
      const donor = await getConnectedAddress();

      if (isSepolia) {
        // Switch wallet to Sepolia
        await ensureChain(CHAIN_HEX.SEPOLIA);
        // Assert wallet is on Sepolia
        if (typeof window !== 'undefined') {
          const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
          if (eth) {
            const provider = new ethers.BrowserProvider(eth);
            const net = await provider.getNetwork();
            const expected = parseInt(CHAIN_HEX.SEPOLIA, 16);
            if (Number(net.chainId) !== expected) {
              const errorMsg = 'Wallet did not switch to Ethereum Sepolia. Please approve the network switch in your wallet.';
              notify(errorMsg, 'error');
              throw new Error(errorMsg);
            }
          }
        }

        const gateway  = process.env.NEXT_PUBLIC_GATEWAY_SEPOLIA!;
        const receiver = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT!;

        // If token is zETH.SEPOLIA → native path (NO erc20). Otherwise use ERC-20 (e.g., USDC) on Sepolia.
        const isZeth = (picked?.symbol || "").toUpperCase().startsWith("ZETH") ||
                       picked?.address.toLowerCase() === process.env.NEXT_PUBLIC_ZRC20_ZETH_SEPOLIA?.toLowerCase();
        const erc20  = isZeth ? undefined : process.env.NEXT_PUBLIC_ERC20_SEPOLIA_USDC!;
        const tokenDecimals = selectedToken?.decimals ?? 18; // Use token's actual decimals or default to 18 for ETH

        // Build ZEVM payload (token here is the ZRC-20 on Athens to CREDIT)

          const message = buildMessage({
            campaignId: Number(onChainCampaignId),
            name: (donorName || "").trim() || (user && hasUsername(user) ? user.username : "Anonymous"),
            note: (note || "").trim(),
          });
          

        // *** PASS THE USER’S RAW INPUT STRING ***
        await payFromSepolia({
          gateway,
          receiver,
          amount: raw,            // <- THIS is exactly what the user typed
          message,
          erc20,                  // undefined => native zETH path; else Sepolia ERC-20 address
          erc20Decimals: erc20 ? tokenDecimals : undefined,
          setStatus: (s) => {
            if (!s) return;
            if (onStatusUpdate) try { onStatusUpdate(s); } catch {}
            if (typeof window !== "undefined") {
              const el = document.createElement("div");
              el.className =
                "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-black/80 text-white text-xs";
              el.textContent = s;
              document.body.appendChild(el);
              setTimeout(() => document.body.removeChild(el), 1600);
            }
          },
        });

        // Wait for confirmation on ZEVM before redirecting
        // Create a consistent status update function
        const updateStatus = (status: string) => {
          if (!status) return;
          // Show toast for status updates instead of console logging
          notify(status, 'info');
          if (onStatusUpdate) try { onStatusUpdate(status); } catch {}
          if (typeof window !== "undefined") {
            const el = document.createElement("div");
            el.className = 
              "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-black/80 text-white text-xs";
            el.textContent = status;
            document.body.appendChild(el);
            setTimeout(() => document.body.removeChild(el), 2500);
          }
        };
        
        // Use the status update function for waitForContribution
        const result = await waitForContribution({
          contract: process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT!,
          campaignId: Number(onChainCampaignId),
          donor,
          timeoutMs: 180000,
          onUpdate: updateStatus,
        });

        if (result) {
          // We got ZetaChain confirmation, show amount and token info if available
          const tokenSymbol = isZeth ? "zETH" : "USDC";
          const amountBN = result?.decoded?.amount;
          const displayAmount = amountBN !== undefined
            ? `${ethers.formatUnits(amountBN, tokenDecimals)} ${tokenSymbol}`
            : raw;
            
          updateStatus(`Donation confirmed: ${displayAmount} credited on ZetaChain!`);
          
          // Only redirect after ZetaChain confirmation
          onPaymentSuccess(parseFloat(raw), chainLabel);
          onClose();
          setAmount(""); setDonorName(""); setNote("");
        } else {
          // ZetaChain confirmation timed out; DO NOT mark as success yet
          // Keep the modal open and surface a non-terminal message
          updateStatus("Transaction sent on Sepolia; awaiting ZetaChain credit… We'll keep checking.");
          setPaymentError(
            "Your deposit was sent, but ZetaChain confirmation timed out. We will only confirm once it is credited on ZetaChain. You can wait and try again, or check the explorer."
          );
        }
        return;
      }

      // ZEVM direct (WZETA or any ZRC-20): pass raw string too
      await ensureChain(CHAIN_HEX.ZETA);
      // Assert wallet is on ZetaChain
      if (typeof window !== 'undefined') {
        const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
        if (eth) {
          const provider = new ethers.BrowserProvider(eth);
          const net = await provider.getNetwork();
          const expected = parseInt(CHAIN_HEX.ZETA, 16);
          if (Number(net.chainId) !== expected) {
            const errorMsg = 'Wallet did not switch to ZetaChain. Please approve the network switch in your wallet.';
            notify(errorMsg, 'error');
            throw new Error(errorMsg);
          }
        }
      }

      // Use the exact token picked in the UI to avoid any fallback/mismatch
      const tokenAddr = picked?.address;
      if (!tokenAddr) {
        const errorMsg = 'Please select a token to use for donation';
        notify(errorMsg, 'error');
        throw new Error(errorMsg);
      }
      
      // Prepare common params
      const donorDisplayName = (donorName || "").trim() || (user && hasUsername(user) ? user.username : "Anonymous");
      const donorNote = (note || "").trim();
      
      // Handle ZETA->WZETA deposit if native ZETA is selected
      if (picked?.isNative && picked.symbol === 'ZETA') {
        // Import the WZETA deposit function
        const { depositZETAToWZETA } = await import('@/lib/web3/admin');
        const amountWei = ethers.parseEther(raw);
        
        try {
          notify('Converting ZETA to WZETA...', 'info');
          await depositZETAToWZETA(amountWei);
          notify('ZETA converted to WZETA successfully', 'success');
          
          // Now proceed with WZETA donation - use WZETA address instead
          const wzetaAddress = process.env.NEXT_PUBLIC_WZETA_ADDRESS;
          if (!wzetaAddress) {
            throw new Error('WZETA address not configured');
          }
          
          await processDonation({
            campaignId: Number(onChainCampaignId),
            amount: raw,
            tokenAddress: wzetaAddress, // Use WZETA address after conversion
            donorName: donorDisplayName,
            note: donorNote,
            isNative: false, // Now it's WZETA, not native
          });
        } catch (depositError) {
          notify('Failed to convert ZETA to WZETA. Please try again.', 'error');
          throw depositError;
        }
      } else {
        // Standard token donation flow (handles WZETA and other ZRC tokens)
        await processDonation({
          campaignId: Number(onChainCampaignId),
          amount: raw, // <- exact string, user's raw input
          tokenAddress: tokenAddr,
          donorName: donorDisplayName,
          note: donorNote,
          isNative: picked?.isNative,
        });
      }


      onPaymentSuccess(parseFloat(raw), chainLabel);
      notify(`Thank you for donating ${raw} ${displaySymbol}!`, 'success');
      onClose();
      setAmount(""); setDonorName(""); setNote("");
      return;
    } catch (error) {
      const msg = extractRawErrorString(error);
      if (/user (rejected|denied|canceled|cancelled)/i.test(msg)) {
        notify("Transaction was cancelled", "info");
        if (onCancel) onCancel();
      } else {
        if (onPaymentError) onPaymentError(error as Error);
        setPaymentError(msg || "Payment failed. Please try again.");
        notify(msg || "Payment failed. Please try again.", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const chainBadge =
    PAYMENT_PROVIDER === "zetachain"
      ? (((picked?.chain || 'ZETA').toUpperCase().includes('SEPOLIA')) ? 'Ethereum Sepolia' : 'ZetaChain')
      : selectedChain || "Local";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl" ref={modalRef}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Support This Campaign</h2>
          <button
            onClick={() => {
              if (onCancel) onCancel();
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>

        {paymentError && (
          <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            {paymentError}
          </div>
        )}
        {networkError && (
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            Network issue: {networkError}
          </div>
        )}
        </div>

        {/* Wallet status (Local mode only) */}
        {PAYMENT_PROVIDER === "local" && (
          <div className="mb-4 text-xs text-gray-600">
            {walletConnecting ? (
              <span>Connecting wallet…</span>
            ) : walletAddress ? (
              <span>
                Wallet connected:{" "}
                <span className="font-mono">
                  {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
              </span>
            ) : walletError ? (
              <div className="flex items-center justify-between">
                <span>Wallet not connected: {walletError}</span>
                <button
                  className="ml-2 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  onClick={async () => {
                    setWalletConnecting(true);
                    setWalletError(null);
                    try {
                      const { address } = await connectWallet();
                      setWalletAddress(address);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Failed to connect wallet";
                      setWalletError(msg);
                    } finally {
                      setWalletConnecting(false);
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <span>Wallet not connected.</span>
            )}
          </div>
        )}

        {/* Campaign Info */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">{campaign.title}</h3>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Raised: {formatCurrency(campaign.raised, 'USD', true)}</span>
            <span>Goal: {formatCurrency(campaign.goal, 'USD', true)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-visible">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  campaign.goal > 0 ? (campaign.raised / campaign.goal) * 100 : 0,
                  100
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name (optional, shown publicly)
          </label>
          <input
            type="text"
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            placeholder={
              (user && hasUsername(user) ? user.username : undefined) || "Enter your name"
            }
            className="gh-input"
          />
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add a note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Say something about your donation (optional)"
            rows={3}
            className="gh-textarea"
          />
        </div>

        {/* Token Picker (Zeta / Cross-chain mode) */}
        {onZeta && (
          <div onClick={(e) => e.stopPropagation()}>
            {/* Token selection */}
            <label className="block text-sm font-semibold mb-2">Select token</label>
            <TokenPicker
              value={picked}
              onChange={setPicked}
              className="w-full"
            />
            <br />
          </div>
        )}

        {/* Amount (TEXT input to avoid browser number quirks) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Donation Amount ({displaySymbol})
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              // Allow only numbers and a single decimal point with up to 18 decimal places
              const value = e.target.value;
              // Regex to match numbers with at most one decimal point and up to 18 decimal places
              const regex = /^\d*\.?\d{0,18}$/;
              if (value === '' || regex.test(value)) {
                setAmount(value);
              }
            }}
            placeholder={onZeta ? "0.0001" : "10"}
            className="gh-input"
          />
          {/* You can keep/remove suggested chips; they only update the field the user controls */}
          <div className="flex gap-2 mt-2">
            {[10, 25, 50, 100].map((amt) => (
              <button
                key={amt}
                onClick={() => setAmount(String(amt))}
                className="px-3 py-1 text-sm border border-transparent ring-1 ring-blue-300 dark:ring-blue-400 text-blue-600 rounded-full hover:bg-blue-50 transition-colors select-surface"
                type="button"
              >
                {onZeta ? `${amt} ${displaySymbol}` : `$${amt}`}
              </button>
            ))}
          </div>
        </div>

        {/* Pay */}
        <button
          onClick={handlePayment}
          disabled={
            !amount ||
            isProcessing ||
            networkSwitching ||
            parseFloat((amount || "").replace(/,/g, ".")) <= 0 ||
            (PAYMENT_PROVIDER === "zetachain" && (!!missingOnChainMapping || !picked?.address))
          }
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          ) : PAYMENT_PROVIDER === "zetachain" ? (
            networkSwitching ? 'Switching network…' : `Donate ${amount || "0"} ${displaySymbol} via ${chainBadge}`
          ) : (
            `Donate $${amount || "0"} via ${chainBadge}`
          )}
        </button>

        {/* Notices */}
        {PAYMENT_PROVIDER !== "zetachain" && (
          <p className="text-xs text-gray-500 mt-3 text-center">
            This is a mock/local payment for demo. Switch to on-chain by setting
            NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain.
          </p>
        )}
        {PAYMENT_PROVIDER === "zetachain" && missingOnChainMapping && (
          <p className="text-xs text-red-600 mt-3 text-center">
            This campaign is not yet synced with the blockchain. The creator needs to add the
            on-chain campaign ID.
          </p>
        )}
      </div>
    </div>
  );
}
