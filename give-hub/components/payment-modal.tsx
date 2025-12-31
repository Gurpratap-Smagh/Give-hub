"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { Campaign } from "@/lib/db";
import { connectWallet } from "@/lib/web3/client";
import { formatCurrency } from "@/lib/utils/format";
import { showError, showSuccess } from "@/components/notification-manager";
import { useDonationFlow } from "@/lib/hooks/useDonationFlow";
import { DonationToast } from "@/components/donation-toast";
import { evmDepositAndCall, ZetaChainClient } from "@zetachain/toolkit/client";
import * as ethers from "ethers";

// Suppress gateway address errors from ZetaChain toolkit
const originalError = console.error;
console.error = function(...args: any[]) {
  const message = args[0]?.toString?.() || String(args[0]);
  // Silently ignore gateway address and network change errors
  if (message?.includes("Failed to get gateway address") || message?.includes("network changed")) {
    return;
  }
  originalError.apply(console, args);
};

// Payment provider mode
const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "local").toLowerCase();

interface PaymentOption {
  value: string;
  label: string;
  zrc20Address: string;
  chainId: number;
  symbol: string;
  isNative?: boolean; // Whether this is the native token (ETH, BNB, etc.)
}

interface ChainOption {
  id: number;
  name: string;
}

interface PaymentModalProps {
  campaign: Campaign;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (amount: number, chain: string, tokenSymbol?: string) => void;
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
  onCancel,
  autoSubmit,
}: PaymentModalProps) {
  const hasUsername = (u: unknown): u is { username: string } =>
    typeof u === "object" &&
    u !== null &&
    "username" in (u as Record<string, unknown>) &&
    typeof (u as { username?: unknown }).username === "string";

  const [amount, setAmount] = useState<string>("");
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<PaymentOption | null>(null);
  const [donorName, setDonorName] = useState("");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  // When true we are awaiting on-chain confirmation after a gateway detection race
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const { user } = useAuth();

  // Fetch payout options (chains and tokens)
  const [availableChains, setAvailableChains] = useState<ChainOption[]>([]);
  const [payoutOptions, setPayoutOptions] = useState<PaymentOption[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<PaymentOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const onChainCampaignId = campaign.onChain?.campaignId;
  const { showToast, lastDonation, startDonation, hideToast } = useDonationFlow(campaign.id);
  const onZeta = PAYMENT_PROVIDER === "zetachain";
  const missingOnChainMapping = onZeta && !onChainCampaignId;

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Detect current wallet chain
  useEffect(() => {
    const detectChain = async () => {
      if (!window.ethereum) return;
      
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        setCurrentChainId(Number(network.chainId));
        
        const signer = await provider.getSigner();
        setWalletAddress(await signer.getAddress());
      } catch (e) {
        console.error("Failed to detect chain:", e);
      }
    };

    if (isOpen) {
      detectChain();
      
      // Listen for chain changes
      const handleChainChanged = () => {
        detectChain();
      };
      
      window.ethereum?.on?.('chainChanged', handleChainChanged);
      
      return () => {
        window.ethereum?.removeListener?.('chainChanged', handleChainChanged);
      };
    }
  }, [isOpen]);

  // Fetch payout options on mount
  useEffect(() => {
    const fetchPayoutOptions = async () => {
      try {
        setOptionsLoading(true);
        const res = await fetch("/api/campaign/payout-options");
        if (!res.ok) throw new Error("Failed to fetch payout options");
        const data = await res.json();
        setAvailableChains(data.chains || []);
        setPayoutOptions(data.options || []);

        // Auto-select chain based on current wallet chain
        if (currentChainId && data.chains) {
          const matchingChain = data.chains.find((c: ChainOption) => c.id === currentChainId);
          if (matchingChain) {
            setSelectedChainId(currentChainId);
          } else if (data.chains.length > 0) {
            setSelectedChainId(data.chains[0].id);
          }
        } else if (data.chains && data.chains.length > 0) {
          setSelectedChainId(data.chains[0].id);
        }
      } catch (e) {
        console.error("Failed to fetch payout options:", e);
        showError("Could not load blockchain and token options.");
      } finally {
        setOptionsLoading(false);
      }
    };
    fetchPayoutOptions();
  }, [currentChainId]);

  // Filter tokens when chain is selected
  useEffect(() => {
    if (selectedChainId === null) {
      setFilteredTokens([]);
      setSelectedToken(null);
      return;
    }

    // Handle ZetaChain special case: chainId 0 includes tokens with chainId: null
    const tokensForChain = payoutOptions.filter((opt) => {
      if (selectedChainId === 0) {
        // For ZetaChain (id 0), include tokens with chainId === null or chainId === 0
        return opt.chainId === null || opt.chainId === 0;
      }
      return opt.chainId === selectedChainId;
    });
    
    setFilteredTokens(tokensForChain);

    // Auto-select first token for the chain
    if (tokensForChain.length > 0) {
      setSelectedToken(tokensForChain[0]);
    }
  }, [selectedChainId, payoutOptions]);

  // Auto-select ZetaChain when in ZetaChain mode
  useEffect(() => {
    if (onZeta && availableChains.length > 0 && selectedChainId === null) {
      // Find ZetaChain (id: 0) and select it by default
      const zetaChain = availableChains.find(c => c.id === 0);
      if (zetaChain) {
        setSelectedChainId(0);
      }
    }
  }, [onZeta, availableChains, selectedChainId]);

  // Initialize amount when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (typeof initialAmount === "number" && initialAmount > 0) {
      setAmount(String(initialAmount));
    }
    setProcessingStatus("");
  }, [isOpen]);

  // Auto-submit helper
  useEffect(() => {
    if (!isOpen || !autoSubmit || isProcessing) return;
    const amt = parseFloat((amount || "").replace(/,/g, "."));
    if (!amt || !(amt > 0)) return;
    if (!selectedToken) return;
    if (missingOnChainMapping) return;
    const t = setTimeout(() => {
      void handlePayment();
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, autoSubmit, amount, selectedToken, isProcessing, missingOnChainMapping]);

  // When donation completes (showToast becomes true) clear awaiting state and close modal
  useEffect(() => {
    if (showToast && awaitingConfirmation) {
      // Donation confirmed by the background flow
      setAwaitingConfirmation(false);
      setIsProcessing(false);
      setProcessingStatus("");

      const t = setTimeout(() => {
        if (onClose) onClose();
        setAmount("");
        setDonorName("");
        setNote("");
        setProcessingStatus("");
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [showToast, awaitingConfirmation, onClose]);

  const handlePayment = async () => {
    const raw = (amount || "").trim().replace(/,/g, ".");
    const amountValue = parseFloat(raw);

    if (!amountValue || amountValue <= 0) {
      showError("Please enter a valid amount");
      return;
    }

    if (!selectedToken || selectedChainId === null) {
      showError("Please select a blockchain and token");
      return;
    }

    setIsProcessing(true);
    try {
      if (onZeta) {
        const donorDisplayName = (donorName || "").trim() || (user && hasUsername(user) ? user.username : "Anonymous");
        const donorNote = (note || "").trim();

        // Get the contract address from environment
        const contractAddress = process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS;
        if (!contractAddress) {
          throw new Error("Contract address not configured (NEXT_PUBLIC_CROWDFUND_ADDRESS)");
        }

        // Get signer from wallet
        setProcessingStatus("Connecting to wallet...");
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signerAddress = await signer.getAddress();

        // Get actual current chain from wallet
        const network = await provider.getNetwork();
        const walletChainId = Number(network.chainId);

        // Check if user needs to switch chains
        // Skip wallet switch for ZetaChain (id 0) as MetaMask doesn't accept 0x0 as valid chainId
        // ZetaChain toolkit will handle cross-chain routing
        if (walletChainId !== selectedChainId && selectedChainId !== 0) {
          setProcessingStatus(`Requesting chain switch to ${availableChains.find(c => c.id === selectedChainId)?.name}...`);
          
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${selectedChainId.toString(16)}` }],
            });
            
            // Wait a bit for the switch to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              throw new Error(`Chain ${selectedChainId} not added to wallet. Please add it manually.`);
            }
            throw new Error(`Failed to switch chain: ${switchError.message}`);
          }
        }

        const chainName = availableChains.find(c => c.id === selectedChainId)?.name || `Chain ${selectedChainId}`;
        let txHash: string;

        setProcessingStatus(`Processing donation from ${chainName}...`);

        const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE".toLowerCase();
        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
        const tokenAddr = (selectedToken?.zrc20Address || (selectedToken as any)?.address || "").toLowerCase();
        const isNativeZetaDonation =
          selectedChainId === 0 &&
          selectedToken?.symbol === "ZETA" &&
          (
            selectedToken?.isNative === true ||
            tokenAddr === NATIVE_SENTINEL ||
            tokenAddr === ZERO_ADDRESS ||
            tokenAddr === ""
          );

        if (isNativeZetaDonation) {
          // Direct donateNative call – no gateway, no depositAndCall
          setProcessingStatus("Preparing native ZETA donation on ZetaChain...");

          // ZetaChain actual chain IDs
          const zetaChainId =
            process.env.NEXT_PUBLIC_ZETACHAIN_NETWORK === "mainnet" ? 7000 : 7001; // 7000 mainnet, 7001 athens testnet

          // Use a mutable signer reference for the direct call
          let currentSigner = signer;

          // Force switch to ZetaChain if not already there
          if (walletChainId !== zetaChainId) {
            setProcessingStatus("Switching wallet to ZetaChain...");
            try {
              await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${zetaChainId.toString(16)}` }],
              });
              // Refresh provider & signer after switch
              const newProvider = new ethers.BrowserProvider(window.ethereum);
              currentSigner = await newProvider.getSigner();
              await new Promise((r) => setTimeout(r, 1000)); // let wallet settle
            } catch (err: any) {
              throw new Error("Please switch to ZetaChain in your wallet to donate with native ZETA.");
            }
          }

          // Direct contract call with msg.value
          const crowdfundContract = new ethers.Contract(
            contractAddress,
            [
              "function donateNative(uint256 campaignId, string donorName, string note) external payable",
            ],
            currentSigner
          );

          // Debug: log selectedToken and parameters to verify encoding
          console.debug('[donateNative] selectedToken=', selectedToken);
          console.debug('[donateNative] params:', {
            campaignId: BigInt(Number(onChainCampaignId)),
            donorDisplayName,
            donorNote,
            value: raw,
          });

          // Manually encode calldata to avoid reliance on generated method bindings
          const iface = crowdfundContract.interface;
          const calldata = iface.encodeFunctionData('donateNative', [
            BigInt(Number(onChainCampaignId)),
            donorDisplayName,
            donorNote,
          ]);
          console.debug('[donateNative] encoded calldata=', calldata);

          setProcessingStatus("Sending native ZETA donation...");
          const tx = await currentSigner.sendTransaction({
            to: contractAddress,
            data: calldata,
            value: ethers.parseEther(raw),
            gasLimit: 500000,
          });

          setProcessingStatus("Waiting for confirmation...");
          const receipt = await tx.wait();
          txHash = receipt?.hash || tx.hash;

          // Success path – same as cross-chain case
          startDonation(txHash, raw, campaign.id, donorDisplayName, chainName, selectedToken.symbol);
          onPaymentSuccess(amountValue, chainName, selectedToken.symbol);
          showSuccess(`Donation of ${raw} ZETA sent successfully!`);

          onClose();
          setAmount("");
          setDonorName("");
          setNote("");
          setProcessingStatus("");
          return; // exit early – skip the depositAndCall logic below
        }
        // Encode the message for the universal contract
        const messageData = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "string", "string"],
          [BigInt(Number(onChainCampaignId)), donorDisplayName, donorNote]
        );
        const client = new ZetaChainClient({
          network: process.env.NEXT_PUBLIC_ZETACHAIN_NETWORK === "mainnet" ? "mainnet" : "testnet", // adjust based on your env
          signer: signer,
        });

        // Use ZetaChain Toolkit's universal evmDepositAndCall
        // This works from ANY connected chain - the toolkit detects which chain the signer is on
        // We'll retry transient gateway detection errors and recreate provider/signer/client each attempt
        let tx: any = null;
        let lastGatewayError: any = null;
        const maxRetries = 20; // allow up to ~30s of retries for transient network switches

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Recreate provider and signer for each attempt to avoid stale provider state
            const attemptProvider = new ethers.BrowserProvider((window as any).ethereum);
            const attemptSigner = await attemptProvider.getSigner();
            const attemptClient = new ZetaChainClient({
              network: process.env.NEXT_PUBLIC_ZETACHAIN_NETWORK === "mainnet" ? "mainnet" : "testnet",
              signer: attemptSigner,
            });

            // Probe provider network and try a wallet switch if it doesn't match the selected chain
            try {
              const net = await attemptProvider.getNetwork();
              const currentChain = Number(net.chainId);
              // Skip wallet switch for ZetaChain (id 0) - toolkit handles cross-chain routing
              if (selectedChainId !== null && currentChain !== selectedChainId && selectedChainId !== 0) {
                console.debug(`Attempt ${attempt + 1}/${maxRetries} - provider chain ${currentChain} !== selected ${selectedChainId}; requesting wallet switch`);
                try {
                  await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: `0x${selectedChainId.toString(16)}` }],
                  });
                  // allow wallet to settle
                  await new Promise(r => setTimeout(r, 1000));
                } catch (switchErr:any) {
                  console.debug('Wallet switch attempt failed (will continue to retry):', switchErr?.message || switchErr);
                }
              }
            } catch (probeErr:any) {
              console.debug('Provider network probe failed (will retry):', probeErr?.message || probeErr);
            }

            tx = await attemptClient.evmDepositAndCall({
              receiver: contractAddress,
              amount: raw,
              types: ["uint256", "string", "string"],
              values: [BigInt(Number(onChainCampaignId)), donorDisplayName, donorNote],
              revertOptions: {
                callOnRevert: true,
                revertAddress: await attemptSigner.getAddress(),
                abortAddress: await attemptSigner.getAddress(),
                revertMessage: ethers.hexlify(ethers.toUtf8Bytes("Donation failed")),
                onRevertGasLimit: "500000"
              },
              txOptions: {
                gasLimit: 800000
              }
            });

            // success
            break;
          } catch (txError: any) {
            // If it's a gateway detection / network-change error, retry with backoff
            if (txError?.message?.includes("gateway address") || txError?.message?.includes("network changed")) {
              lastGatewayError = txError;
              const backoff = Math.min(800 + attempt * 600, 2500); // cap backoff
              console.debug(`Attempt ${attempt + 1}/${maxRetries} - Gateway detection error (retrying after ${backoff}ms):`, txError?.message);
              await new Promise(resolve => setTimeout(resolve, backoff));
              continue;
            }
            // Non-transient - rethrow
            throw txError;
          }
        }
        
        setProcessingStatus("Confirming transaction...");

        if (tx) {
          const receipt = await tx.wait();
          txHash = receipt?.hash || tx.hash;

          // Start donation flow tracking
          startDonation(txHash, raw, campaign.id, donorDisplayName, chainName, selectedToken.symbol);
          onPaymentSuccess(amountValue, chainName, selectedToken.symbol);

          showSuccess(`Donation of ${raw} ${selectedToken.symbol} sent successfully from ${chainName}!`);

          // Close modal
          onClose();
          setAmount("");
          setDonorName("");
          setNote("");
          setProcessingStatus("");
          return;
        }

        // If we reach here, `tx` is null (gateway detection race happened). Don't throw — proceed with a placeholder
        const placeholderTxHash = `pending:${Date.now()}`;
        console.debug("Proceeding with placeholder tx hash due to gateway detection race:", placeholderTxHash);
        setProcessingStatus("Transaction submission may be delayed; awaiting on-chain confirmation...");

        // Start donation flow with placeholder tx hash so UI shows progress (useDonationFlow will timeout/check later)
        // Do NOT call onPaymentSuccess yet — wait for real confirmation
        startDonation(placeholderTxHash, raw, campaign.id, donorDisplayName, chainName, selectedToken.symbol);

        // Keep modal open and show awaiting confirmation status; disable inputs so user cannot submit again
        setAwaitingConfirmation(true);
        setProcessingStatus("Transaction submitted — awaiting on-chain confirmation. You can close this dialog and check back later or wait here.");
        showSuccess(`Donation submitted — awaiting confirmation from ${chainName}.`);

        // Do NOT close modal automatically; allow background confirmation flow to update state
        return; 
      }

      // Local/mock payment mode
      if (!onZeta) {
        if (!walletAddress) {
          try {
            const { address } = await connectWallet();
            setWalletAddress(address);
          } catch (e) {
            console.warn("Wallet connection failed:", e);
          }
        }

        onPaymentSuccess(amountValue, selectedToken?.symbol || "USD", selectedToken?.symbol || "USD");
        showSuccess(`Mock payment of ${selectedToken?.symbol || "USD"} ${raw} completed!`);
        onClose();
        setAmount("");
        setDonorName("");
        setNote("");
        return;
      }
    } catch (error) {
      console.error("Payment failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Payment failed";
      showError(`Payment failed: ${errorMessage}`);
    } finally {
      // If we're awaiting confirmation after a gateway race, keep the processing state active
      if (!awaitingConfirmation) {
        setIsProcessing(false);
      }
    }
  };

  // Do not render modal content unless explicitly opened
  if (!isOpen) return null;

  const needsChainSwitch = currentChainId !== null && selectedChainId !== null && currentChainId !== selectedChainId;

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

          {/* Wallet status */}
          {onZeta && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {walletAddress ? (
                    <>
                      Connected: <span className="font-mono">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
                    </>
                  ) : (
                    "No wallet connected"
                  )}
                </span>
                {currentChainId && (
                  <span className="text-blue-700 font-medium">
                    {availableChains.find(c => c.id === currentChainId)?.name || `Chain ${currentChainId}`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Chain switch warning */}
          {needsChainSwitch && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ You'll be prompted to switch to {availableChains.find(c => c.id === selectedChainId)?.name} when you donate
              </p>
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

          {/* Blockchain Selector (Zeta mode) */}
          {onZeta && (
            <div onClick={(e) => e.stopPropagation()} className="mb-4">
              <label className="block text-sm font-semibold mb-2">Select Source Blockchain</label>
              {optionsLoading ? (
                <p className="text-gray-600 text-sm">Loading blockchains...</p>
              ) : (
                <select
                  value={selectedChainId ?? ""}
                  onChange={(e) => setSelectedChainId(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                  className="gh-select w-full mb-3"
                >
                  <option value="">-- Select a blockchain --</option>
                  {availableChains.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name} {currentChainId === chain.id ? "(Current)" : ""}
                    </option>
                  ))}
                </select>
              )}

              {/* Token Picker (for the selected chain) */}
              {selectedChainId !== null && (
                <div>
                  <label className="block text-sm font-semibold mb-2">Select Token</label>
                  {filteredTokens.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {filteredTokens.map((token) => (
                        <button
                          key={token.value}
                          onClick={() => setSelectedToken(token)}
                          className={`py-2 px-3 rounded-lg border-2 transition-colors text-sm font-medium ${
                            selectedToken?.value === token.value
                              ? "border-blue-600 bg-blue-50 text-blue-900"
                              : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
                          }`}
                        >
                          {token.symbol}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600 text-sm">No tokens available for this chain</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount ({selectedToken?.symbol || "Token"})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="gh-input"
              disabled={isProcessing}
            />
          </div>

          {/* Status Display */}
          {processingStatus && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">{processingStatus}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={() => void handlePayment()}
            disabled={isProcessing || awaitingConfirmation || !selectedToken || !amount || optionsLoading || missingOnChainMapping}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              isProcessing || awaitingConfirmation || !selectedToken || !amount || optionsLoading || missingOnChainMapping
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
            }`}
          >
            {isProcessing || awaitingConfirmation ? "Processing..." : `Donate ${selectedToken?.symbol || ""}`}
          </button>

          {missingOnChainMapping && (
            <p className="mt-4 text-sm text-red-600">
              ⚠️ Campaign is not mapped on-chain yet. Contact the creator.
            </p>
          )}
        </div>
      </div>
    </>
  );
}