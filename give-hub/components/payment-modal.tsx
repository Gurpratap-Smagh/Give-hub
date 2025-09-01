"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { Campaign } from "@/lib/db";
import { connectWallet } from "@/lib/web3/client";
import { useAvailableTokens, type Token } from "@/lib/hooks/useAvailableTokens";
import TokenPicker from "@/components/TokenPicker";
import { formatCurrency } from "@/lib/utils/format";
import { showError, showSuccess, showInfo } from "@/components/notification-manager";
import { makePayment } from "@/lib/payments/zetachain-gateway";
import { useDonationFlow } from "@/lib/hooks/useDonationFlow";
import { DonationToast } from "@/components/donation-toast";

// Payment provider mode
const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "local").toLowerCase();

interface PaymentModalProps {
  campaign: Campaign;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (amount: number, chain: string) => void;
  initialAmount?: number;
  initialChain?: string;
  initialToken?: string;
  onCancel?: () => void;
  autoSubmit?: boolean;
  onStatusUpdate?: (status: string) => void;
}

export default function PaymentModal({
  campaign,
  isOpen,
  onClose,
  onPaymentSuccess,
  initialAmount,
  initialChain,
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

  const [amount, setAmount] = useState<string>("");

  const [selectedChain, setSelectedChain] = useState<string>(initialChain || effectiveChains[0]);
  const [donorName, setDonorName] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const { user } = useAuth();

  const onChainCampaignId = campaign.onChain?.campaignId;
  const { showToast, lastDonation, startDonation, hideToast } = useDonationFlow(campaign.id);
  const onZeta = PAYMENT_PROVIDER === "zetachain";
  const missingOnChainMapping = onZeta && !onChainCampaignId;

  const { byChain, getNativeToken, getTokenByAddress } = useAvailableTokens();
  const [picked, setPicked] = useState<
    { chain: string; symbol: string; address: string; isNative?: boolean } | undefined
  >(undefined);
  const selectedToken: Token | undefined = picked?.isNative
    ? undefined
    : picked?.address ? getTokenByAddress(picked.address) : undefined;
  const nativeToken = getNativeToken();

  const fallbackNativeSymbol = process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || "ZETA";
  // Decide the unit label based on the selected token/chain
  const displaySymbol = !onZeta
    ? "$"
    : (picked?.isNative
        ? (((picked?.chain || '').toUpperCase().includes('SEPOLIA'))
            ? 'ETH'
            : (nativeToken?.symbol ?? fallbackNativeSymbol)
          )
        : (selectedToken?.symbol ?? nativeToken?.symbol ?? fallbackNativeSymbol)
      );

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  // Keep for UI label
  const [networkSwitching] = useState(false);

  // Initialize amount/chain when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (typeof initialAmount === "number" && initialAmount > 0) {
      setAmount(String(initialAmount));
    }
    setSelectedChain(initialChain || effectiveChains[0]);
    setProcessingStatus(""); // Reset processing status when modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !byChain) return;
    const sym = (initialToken || '').trim();
    const ch = (initialChain || '').trim();
    if (!sym || !ch) return;
    const key = ch.toUpperCase();
    const list = byChain[key] || [];
    const match = list.find(t => t.symbol.toLowerCase() === sym.toLowerCase());
    if (match) {
      const isSepolia = key === 'SEPOLIA';
      const isEth = match.symbol.toUpperCase() === 'ETH';
      setPicked({ 
        chain: key, 
        symbol: match.symbol, 
        address: isSepolia && isEth ? '' : match.address,
        isNative: isSepolia && isEth ? true : undefined,
      });
    }
  }, [isOpen, initialToken, initialChain, byChain]);

  useEffect(() => {
    if (!isOpen || !byChain) return;
    if (picked?.chain) return;
    const ch = (initialChain || '').trim();
    if (!ch) return;
    const key = ch.toUpperCase();
    const list = byChain[key] || [];
    if (list.length > 0) {
      if (key === 'SEPOLIA') {
        // Force native ETH on Sepolia to avoid ZRC20 addresses
        setPicked({ chain: key, symbol: 'ETH', address: '', isNative: true });
      } else {
        setPicked({ chain: key, ...list[0] });
      }
    } else {
      setPicked({ chain: key, symbol: '', address: '' });
    }
  }, [isOpen, initialChain, picked?.chain, byChain]);

  // Auto-submit helper for AI flows
  useEffect(() => {
    if (!isOpen || !autoSubmit || isProcessing) return;
    const amt = parseFloat((amount || "").replace(/,/g, "."));
    if (!amt || !(amt > 0)) return;
    if (!selectedChain) return;
    if (onZeta && !picked?.isNative && !picked?.address) return;
    if (onZeta && missingOnChainMapping) return;
    const t = setTimeout(() => {
      void handlePayment();
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoSubmit, amount, selectedChain, picked?.address, isProcessing, missingOnChainMapping]);

  const handlePayment = async () => {
    const raw = (amount || "").trim().replace(/,/g, ".");
    const amountValue = parseFloat(raw);

    if (!amountValue || amountValue <= 0) {
      showError("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    try {
      if (onZeta) {
        const pickedChainUpper = (picked?.chain || '').toUpperCase();
        const isZetaChainPicked = pickedChainUpper.includes('ZETA');
        
        const donorDisplayName = (donorName || "").trim() || (user && hasUsername(user) ? user.username : "Anonymous");
        const donorNote = (note || "").trim();

        // Debug token data
        console.log('Payment token data:', {
          picked,
          isNative: picked?.isNative,
          address: picked?.address,
          chain: picked?.chain
        });

        const txHash = await makePayment({
          campaignId: Number(onChainCampaignId),
          donorName: donorDisplayName,
          note: donorNote,
          amount: raw,
          preferredChain: isZetaChainPicked ? 'zeta' : 'sepolia',
          tokenAddress: picked?.isNative ? undefined : (picked?.address && picked.address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' ? picked.address.trim() : undefined),
          onStatusUpdate: (status: string) => {
            if (!status) return;
            setProcessingStatus(status);
            showInfo(status);
            if (onStatusUpdate) {
              try { 
                onStatusUpdate(status); 
              } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('Status update callback failed:', e);
                }
              }
            }
          },
        });

        // Start donation flow tracking with additional params
        const chainName = isZetaChainPicked ? 'ZetaChain' : 'Ethereum Sepolia';
        startDonation(txHash, raw, campaign.id, donorDisplayName, chainName);
        onPaymentSuccess(amountValue, chainName);
        
        // Close modal immediately but let donation flow handle success notification
        onClose();
        setAmount("");
        setDonorName("");
        setNote("");
        setProcessingStatus("");
        return;
      }

      // Local/mock payment mode
      if (!onZeta) {
        if (!walletAddress) {
          try {
            const { address } = await connectWallet();
            setWalletAddress(address);
          } catch (e) {
            console.warn('Wallet connection failed:', e);
          }
        }

        onPaymentSuccess(amountValue, selectedChain);
        showSuccess(`Mock payment of $${raw} completed!`);
        onClose();
        setAmount("");
        setDonorName("");
        setNote("");
        return;
      }
    } catch (error) {
      console.error('Payment failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      showError(`Payment failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Do not render modal content unless explicitly opened
  if (!isOpen) return null;

  const chainBadge =
    PAYMENT_PROVIDER === "zetachain"
      ? (((picked?.chain || 'ZETA').toUpperCase().includes('SEPOLIA')) ? 'Ethereum Sepolia' : 'ZetaChain')
      : selectedChain || "Local";

  return (
    <>
      {/* Donation Success Toast */}
      {showToast && lastDonation && (
        <DonationToast
          isVisible={showToast}
          amount={lastDonation.amount}
          onHide={hideToast}
        />
      )}

      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        onClick={() => {
          if (onCancel) onCancel();
          onClose();
        }}
      >
        <div
          className="bg-white/90 backdrop-blur-md border border-blue-600 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl mx-auto"
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
        >
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
            <span>Raised: {formatCurrency(campaign.raised, 'USD', false)}</span>
            <span>Goal: {formatCurrency(campaign.goal, 'USD', false)}</span>
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
              // Hide Sepolia ERC-20 ETH but keep native ETH visible for donations
              excludeSepoliaEthContract
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
          disabled={isProcessing}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {processingStatus || "Processing..."}
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
    </>
  );
}
