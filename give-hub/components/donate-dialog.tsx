/**
 * FILE: components/donate-dialog.tsx
 * PURPOSE: Modal dialog for donation form with amount input and blockchain selection
 * WHAT CALLS THIS: Campaign detail page, ContributePanel component
 * WHAT IT RENDERS: Modal overlay with donation form, suggested amounts, memo field
 * ACCESS: Named export, import { DonateDialog } from '@/components/donate-dialog'
 * MIGRATION NOTES:
 * - Currently uses contracts.donate() - ensure this connects to real ZetaChain contracts
 * - Add transaction status tracking and confirmation UI
 * - Implement optimistic UI updates for immediate feedback
 * - Add error handling for failed transactions with retry mechanism
 * TODO:
 * - Add wallet connection check before showing dialog
 * - Implement transaction receipt display with block explorer links
 * - Add donation confirmation step before processing
 * - Consider adding donation history for user
 */

'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { Card } from './card' // ACCESS: Base card component for consistent styling
import { ChainChips } from './chain-chips' // ACCESS: Blockchain selection component
import { formatCurrency } from '@/lib/utils/format' // ACCESS: Currency formatting utilities
import { notify } from '@/lib/utils/notify'
import { makeDonationOnContract } from '@/lib/services/contracts' // ACCESS: Contract interaction functions
import type { Campaign } from '@/lib/utils/types'

/**
 * Props for DonateDialog component
 * @param isOpen - Whether dialog is visible
 * @param onClose - Callback to close dialog
 * @param campaign - Campaign data for donation
 * @param selectedChain - Currently selected blockchain
 */
interface DonateDialogProps {
  isOpen: boolean
  onClose: () => void
  campaign: Campaign
  selectedChain: string
}

/**
 * Donation dialog component - modal form for processing donations
 * @param isOpen - Dialog visibility state
 * @param onClose - Function to close dialog
 * @param campaign - Campaign to donate to
 * @param selectedChain - Selected blockchain for donation
 * @returns JSX element with donation modal or null if closed
 */
export function DonateDialog({ isOpen, onClose, campaign, selectedChain }: DonateDialogProps) {
  // REGION: State management
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { user } = useAuth()
  type UserWithUsername = { username?: string } | null | undefined
  // TODO: Add transaction status tracking
  // const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle')
  // const [txHash, setTxHash] = useState<string | null>(null)

  const handleDonate = async () => {
    // Require a valid amount; name is optional and auto-resolved
    const parsed = parseFloat((amount || '').replace(/,/g, '.'))
    if (isNaN(parsed) || parsed <= 0) {
      notify('Please enter a positive amount to donate.', 'error')
      return
    }

    setIsLoading(true)
    try {
      // Resolve donor display name: prefer user input, fallback to logged-in username, then Anonymous
      const nameToShow = (displayName || '').trim() || (user as UserWithUsername)?.username || 'Anonymous'
      const finalMemo = memo?.trim()
        ? `${memo.trim()} — Donor: ${nameToShow}`
        : `Donor: ${nameToShow}`
      await makeDonationOnContract({
        campaignId: campaign.id,
        amount: parsed,
        chain: selectedChain,
        memo: finalMemo,
      })
      notify(`Successfully donated $${parsed} via ${selectedChain}!`, 'success')
      
      // Reset form and close dialog
      setAmount('')
      setMemo('')
      setDisplayName('')
      onClose()
    } catch (error) {
      console.error('Donation failed:', error)
      const message = error instanceof Error ? error.message : 'Donation failed. Please try again.'
      notify(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const suggestedAmounts = [10, 25, 50, 100]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <Card className="relative w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Make a Donation</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Campaign Info */}
          <div className="mb-6 p-4 bg-[color:var(--panel-2)] rounded-lg">
            <h3 className="font-semibold mb-2">{campaign.title}</h3>
            <div className="text-sm text-[color:var(--muted)]">
              {formatCurrency(campaign.raised)} raised of {formatCurrency(campaign.goal)} goal
            </div>
          </div>

          {/* Chain Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3">Choose blockchain</label>
            <ChainChips
              chains={campaign.chains}
              selectedChain={selectedChain}
              onChainChange={() => {}} // Disabled in modal for simplicity
            />
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label htmlFor="amount" className="block text-sm font-medium mb-3">
              Donation amount (USD)
            </label>
            
            {/* Suggested Amounts */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {suggestedAmounts.map((suggestedAmount) => (
                <button
                  key={suggestedAmount}
                  onClick={() => setAmount(suggestedAmount.toString())}
                  className="p-2 text-sm rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                >
                  ${suggestedAmount}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[color:var(--muted)]">
                $
              </span>
              <input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="any"
                className="w-full pl-8 pr-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
              />
            </div>
          </div>

          {/* Donor Display Name (optional) */}
          <div className="mb-6">
            <label htmlFor="displayName" className="block text-sm font-medium mb-3">
              Display name to show (optional)
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={(user as UserWithUsername)?.username ? `Defaults to ${(user as UserWithUsername)?.username}` : 'Defaults to Anonymous'}
              className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
            />
          </div>

          {/* Memo Input */}
          <div className="mb-6">
            <label htmlFor="memo" className="block text-sm font-medium mb-3">
              Message (optional)
            </label>
            <textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Leave a message of support..."
              rows={3}
              className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)] resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onClose}
              className="bg-transparent hover:bg-white/5 border border-white/10 rounded-full px-4 py-2.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            >
              Cancel
            </button>
            <button
              onClick={handleDonate}
              disabled={isLoading || !amount}
              className="bg-[color:var(--primary)] hover:bg-[color:var(--primary-600)] active:bg-[color:var(--primary-700)] disabled:bg-[color:var(--muted)] disabled:cursor-not-allowed text-black rounded-full px-6 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] min-w-32"
            >
              {isLoading ? 'Processing...' : `Donate $${amount || '0'}`}
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
