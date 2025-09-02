'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveDonations } from '@/components/useLiveDonations';
import { showError } from '@/components/notification-manager';

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

    // After 30s, save donation anyway and show timeout message
    timeoutRef.current = setTimeout(async () => {
      setState(prev => ({ ...prev, timedOut: true }));
      console.log('[useDonationFlow] Transaction timeout, saving donation anyway');
      
      // Save donation to MongoDB even if blockchain confirmation is pending
      if (state.lastDonation) {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/donations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: parseFloat(amount),
              chain: chain || 'zeta',
              donorName: donorName || 'Anonymous',
              tokenSymbol: state.lastDonation?.tokenSymbol || 'ZETA',
              txId: txHash,
              timestamp: new Date().toISOString(),
              status: 'pending_confirmation'
            })
          });
          
          if (res.ok) {
            const result = await res.json();
            console.log('[useDonationFlow] MongoDB updated after timeout:', result);
            setTimeout(() => {
              setState(prev => ({ ...prev, isProcessing: false, showToast: true }));
            }, 3000);
          } else {
            const errorData = await res.text();
            console.error('[useDonationFlow] Timeout API error:', errorData);
            throw new Error(`Failed to save donation: ${res.status}`);
          }
        } catch (err) {
          console.error('[useDonationFlow] Failed to save donation after timeout:', err);
          setTimeout(() => {
            setState(prev => ({ ...prev, isProcessing: false }));
          }, 5000);
        }
      }
      timeoutRef.current = null;
    }, TIMEOUT_DURATION);
  }, [state.lastDonation]);

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
    
    try {
      console.log('[useDonationFlow] Wallet confirmed transaction, saving to MongoDB:', txHash);
      
      // Save donation immediately after wallet confirmation - this will update campaign.raised
      const response = await fetch(`/api/campaigns/${state.lastDonation.campaignId}/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(state.lastDonation.amount),
          chain: state.lastDonation.chain || 'zeta',
          donorName: state.lastDonation.donorName || 'Anonymous',
          tokenSymbol: state.lastDonation.tokenSymbol || 'ZETA',
          txId: txHash,
          timestamp: new Date().toISOString(),
          status: 'confirmed'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[useDonationFlow] MongoDB updated successfully:', result);
        completeDonation();
      } else {
        const errorData = await response.text();
        console.error('[useDonationFlow] API error:', errorData);
        throw new Error(`Failed to save donation: ${response.status}`);
      }
    } catch (error) {
      console.error('[useDonationFlow] Error saving donation:', error);
      showError('Save Failed', 'Please contact support with your transaction hash.');
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [state.lastDonation, completeDonation]);

  // Watch for wallet confirmation (transaction receipt)
  useEffect(() => {
    if (!state.pendingTxHash || state.timedOut) return;
    
    // Check if wallet shows transaction as confirmed
    const checkWalletConfirmation = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          const provider = new (await import('ethers')).BrowserProvider((window as any).ethereum);
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
