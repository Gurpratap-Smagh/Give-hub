"use client"

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import type { Campaign } from '@/lib/db'
import { processDonation } from '@/lib/payments'
import { connectWallet, ensureWalletOnChain } from '@/lib/web3/client'

const PAYMENT_PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'local').toLowerCase()

interface PaymentModalProps {
  campaign: Campaign
  isOpen: boolean
  onClose: () => void
  onPaymentSuccess: (amount: number, chain: string) => void
  initialAmount?: number
  initialChain?: string
  onPaymentError?: (error: Error) => void
  onCancel?: () => void
  autoSubmit?: boolean
}

export default function PaymentModal({ campaign, isOpen, onClose, onPaymentSuccess, initialAmount, initialChain, onPaymentError, onCancel, autoSubmit }: PaymentModalProps) {
  const hasUsername = (u: unknown): u is { username: string } =>
    typeof u === 'object' && u !== null && 'username' in (u as Record<string, unknown>) && typeof (u as { username?: unknown }).username === 'string'

  // Use campaign chains if provided, otherwise default based on provider
  const effectiveChains = (Array.isArray(campaign.chains) && campaign.chains.length > 0)
    ? campaign.chains
    : (PAYMENT_PROVIDER === 'zetachain' ? ['ZetaChain'] : ['Local'])

  const [amount, setAmount] = useState('')
  const [selectedChain, setSelectedChain] = useState<string>(initialChain || effectiveChains[0])
  const [donorName, setDonorName] = useState('')
  const [note, setNote] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const { user } = useAuth()
  const onChainCampaignId = campaign.onChain?.campaignId
  const onZeta = PAYMENT_PROVIDER === 'zetachain'
  const missingOnChainMapping = onZeta && !onChainCampaignId

  // Wallet connection state (used for local provider to pre-connect wallet for AI-driven flows)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletConnecting, setWalletConnecting] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (typeof initialAmount === 'number' && initialAmount > 0) {
        setAmount(String(initialAmount))
      }
      if (initialChain) {
        setSelectedChain(initialChain)
      } else {
        setSelectedChain(effectiveChains[0])
      }
      // Best-effort wallet connection for Dollar (local) mode so AI can execute on-chain interactions if needed
      if (PAYMENT_PROVIDER === 'local') {
        let mounted = true
        const doConnect = async () => {
          setWalletConnecting(true)
          setWalletError(null)
          try {
            const { address } = await connectWallet()
            // attempt to switch to target chain if configured (non-blocking)
            const target = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
            try { await ensureWalletOnChain(target) } catch {}
            if (!mounted) return
            setWalletAddress(address)
          } catch (e) {
            if (!mounted) return
            const msg = e instanceof Error ? e.message : 'Failed to connect wallet'
            setWalletError(msg)
          } finally {
            if (mounted) setWalletConnecting(false)
          }
        }
        // fire and forget
        doConnect()
        return () => { mounted = false }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Auto-submit flow: when AI confirmed and modal opens with valid initial inputs
  useEffect(() => {
    if (!isOpen || !autoSubmit || isProcessing) return
    const amt = parseFloat((amount || '').replace(/,/g, '.'))
    if (!amt || !(amt > 0)) return
    if (!selectedChain) return
    if (onZeta && missingOnChainMapping) return
    // Defer to ensure any initial state (like wallet pre-connect) settles
    const t = setTimeout(() => { void handlePayment() }, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoSubmit, amount, selectedChain, isProcessing, missingOnChainMapping])

  if (!isOpen) return null

  const handlePayment = async () => {
    if (!amount || !selectedChain) return

    setIsProcessing(true)
    
    try {
      // If in local mode and wallet isn't connected yet, try once more before proceeding
      if (!onZeta && PAYMENT_PROVIDER === 'local' && !walletAddress) {
        try {
          const { address } = await connectWallet()
          setWalletAddress(address)
        } catch {}
      }
      if (onZeta) {
        if (!onChainCampaignId) {
          throw new Error('This campaign is not mapped on-chain yet. Please ask the creator to sync the on-chain ID.')
        }
      }
      const result = await processDonation({
        campaignId: onZeta ? (onChainCampaignId as string) : campaign.id,
        amount: parseFloat((amount || '').replace(/,/g, '.')),
        chain: selectedChain,
        donorName: (donorName || '').trim() || (user && hasUsername(user) ? user.username : 'Anonymous'),
        note: (note || '').trim(),
        offchainCampaignId: campaign.id,
      })

      if (!result.ok) throw new Error(result.error || 'Payment failed')

      // Show swap feedback if available
      if (result.swapMessage) {
        const isSwapSuccess = result.paymentStatus === 'preferred'
        const message = isSwapSuccess 
          ? `✅ ${result.swapMessage}` 
          : `⚠️ ${result.swapMessage}`
        
        // Show a brief toast notification
        if (typeof window !== 'undefined') {
          const toast = document.createElement('div')
          toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm max-w-sm ${
            isSwapSuccess ? 'bg-green-600' : 'bg-yellow-600'
          }`
          toast.textContent = message
          document.body.appendChild(toast)
          setTimeout(() => document.body.removeChild(toast), 4000)
        }
      }

      onPaymentSuccess(parseFloat((amount || '').replace(/,/g, '.')), selectedChain)
      onClose()
      // Reset form
      setAmount('')
      setDonorName('')
      setNote('')
    } catch (error) {
      console.error('Payment error:', error)
      const anyErr = error as { code?: number; message?: string }
      const msg = (anyErr?.message || '').toLowerCase()
      const userCancelled = anyErr?.code === 4001 || /user cancelled|user canceled|rejected|denied/.test(msg)
      if (userCancelled) {
        // Graceful handling: no noisy alert, just invoke onCancel if provided
        if (onCancel) onCancel()
      } else {
        if (onPaymentError) onPaymentError(error as Error)
        alert('Payment failed. Please try again.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const suggestedAmounts = [10, 25, 50, 100]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Support This Campaign</h2>
          <button
            onClick={() => { if (onCancel) onCancel(); onClose(); }}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Wallet status (Dollar mode) */}
        {PAYMENT_PROVIDER === 'local' && (
          <div className="mb-4 text-xs text-gray-600">
            {walletConnecting ? (
              <span>Connecting wallet…</span>
            ) : walletAddress ? (
              <span>Wallet connected: <span className="font-mono">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span></span>
            ) : walletError ? (
              <div className="flex items-center justify-between">
                <span>Wallet not connected: {walletError}</span>
                <button
                  className="ml-2 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  onClick={async () => {
                    setWalletConnecting(true)
                    setWalletError(null)
                    try {
                      const { address } = await connectWallet()
                      setWalletAddress(address)
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Failed to connect wallet'
                      setWalletError(msg)
                    } finally {
                      setWalletConnecting(false)
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
            <span>Raised: ${campaign.raised.toLocaleString()}</span>
            <span>Goal: ${campaign.goal.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-visible">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((campaign.goal > 0 ? (campaign.raised / campaign.goal) * 100 : 0), 100)}%` }}
            />
          </div>
        </div>

        {/* Donor Name (optional) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name (optional, shown publicly)
          </label>
          <input
            type="text"
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            placeholder={(user && hasUsername(user) ? user.username : undefined) || "Enter your name"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Note (optional) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add a note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Say something about your donation (optional)"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Donation Amount ({PAYMENT_PROVIDER === 'zetachain' ? 'ZETA' : '$'})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          
          {/* Suggested Amounts */}
          {suggestedAmounts.length > 0 && (
            <div className="flex gap-2 mt-2">
              {suggestedAmounts.map(amt => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt.toString())}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-full hover:border-blue-500 hover:text-blue-600 transition-colors"
                >
                  {PAYMENT_PROVIDER === 'zetachain' ? `${amt} ZETA` : `$${amt}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment Method (optional) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method
          </label>
          <div className="grid grid-cols-3 gap-2">
            {effectiveChains.map(chain => (
              <button
                key={chain}
                onClick={() => setSelectedChain(chain)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  selectedChain === chain
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Button */}
        <button
          onClick={handlePayment}
          disabled={!amount || isProcessing || parseFloat((amount || '').replace(/,/g, '.')) <= 0 || missingOnChainMapping}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          ) : (
            (PAYMENT_PROVIDER === 'zetachain'
              ? `Donate ${amount || '0'} ZETA via ${selectedChain}`
              : `Donate $${amount || '0'} via ${selectedChain}`)
          )}
        </button>

        {/* Payment Notice */}
        {PAYMENT_PROVIDER !== 'zetachain' && (
          <p className="text-xs text-gray-500 mt-3 text-center">
            This is a mock/local payment for demo. Switch to on-chain by setting NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain.
          </p>
        )}
        {PAYMENT_PROVIDER === 'zetachain' && missingOnChainMapping && (
          <p className="text-xs text-red-600 mt-3 text-center">
            This campaign is not yet synced with the blockchain. The creator needs to add the on-chain campaign ID.
          </p>
        )}
      </div>
    </div>
  )
}
