'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Eip1193Provider } from 'ethers';
import { useLiveDonations } from '@/components/useLiveDonations';

interface DonationFlowState {
  isProcessing: boolean;
  pendingTxHash: string | null;
  lastDonation: {
    amount: string;
    campaignId: string;
    txHash: string;
    donorName?: string;
    chain?: string;
    tokenSymbol?: string;
  } | null;
  showToast: boolean;
  timedOut: boolean;
}

export function useDonationFlow(campaignId?: string) {
  const [state, setState] = useState<DonationFlowState>({
    isProcessing: false,
    pendingTxHash: null,
    lastDonation: null,
    showToast: false,
    timedOut: false
  });

  // Fallback timeout to save donation after 30s if no chain event arrives
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TIMEOUT_DURATION = 30_000; // 30 seconds - much faster timeout

  const { donations, connectionStatus } = useLiveDonations(campaignId, { enabled: true });

  // Start donation process - show loading indicator
  const startDonation = useCallback((txHash: string, amount: string, campaignId: string, donorName?: string, chain?: string, tokenSymbol?: string) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isProcessing: true,
      pendingTxHash: txHash,
      lastDonation: { amount, campaignId, txHash, donorName, chain, tokenSymbol },
      showToast: false,
      timedOut: false
    }));
    // Show loading notification immediately
    console.log('[useDonationFlow] Starting donation flow for tx:', txHash);

    // After 30s, if no chain event arrives, show timeout message but do not persist;
    // rely on DonationEventService to persist when the on-chain event is indexed.
    timeoutRef.current = setTimeout(async () => {
      setState(prev => ({ ...prev, timedOut: true }));
      console.log('[useDonationFlow] Transaction timeout; waiting for chain event to persist');
      setTimeout(() => {
        setState(prev => ({ ...prev, isProcessing: false, showToast: true }));
      }, 3000);
      timeoutRef.current = null;
    }, TIMEOUT_DURATION);
  }, []);

  // Stop loading and show success toast
  const completeDonation = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isProcessing: false,
      pendingTxHash: null,
      showToast: true,
      timedOut: false
    }));
    // Show success message briefly
    console.log('[useDonationFlow] Donation confirmed successfully');
    setTimeout(() => {
      // Processing handled by state update
    }, 2000);
  }, []);

  // Hide toast
  const hideToast = useCallback(() => {
    setState(prev => ({
      ...prev,
      showToast: false
    }));
  }, []);

  // Save donation and update MongoDB raised amount when wallet confirms transaction
  const handleWalletConfirmation = useCallback(async (txHash: string) => {
    if (!state.lastDonation) return;
    // Let DonationEventService detect the on-chain event and persist via /donations
    console.log('[useDonationFlow] Wallet confirmed transaction; awaiting chain event for persistence:', txHash);
    completeDonation();
  }, [state.lastDonation, completeDonation]);

  // Watch for wallet confirmation (transaction receipt)
  useEffect(() => {
    if (!state.pendingTxHash || state.timedOut) return;
    
    // Check if wallet shows transaction as confirmed
    const checkWalletConfirmation = async () => {
      try {
        const maybeEth = typeof window !== 'undefined' ? (window as unknown as { ethereum?: unknown }).ethereum : undefined;
        if (maybeEth) {
          const { BrowserProvider } = await import('ethers');
          const provider = new BrowserProvider(maybeEth as Eip1193Provider);
          const receipt = await provider.getTransactionReceipt(state.pendingTxHash!);
          
          if (receipt && receipt.status === 1) {
            // Transaction confirmed by wallet
            handleWalletConfirmation(state.pendingTxHash!);
          }
        }
      } catch {
        // Ignore errors, will retry or timeout
      }
    };
    
    // Check immediately and then every 2 seconds
    checkWalletConfirmation();
    const interval = setInterval(checkWalletConfirmation, 2000);
    
    return () => clearInterval(interval);
  }, [state.pendingTxHash, state.timedOut, handleWalletConfirmation]);

  return {
    isProcessing: state.isProcessing,
    showToast: state.showToast,
    lastDonation: state.lastDonation,
    timedOut: state.timedOut,
    connectionStatus,
    startDonation,
    hideToast,
    donations
  };
}
