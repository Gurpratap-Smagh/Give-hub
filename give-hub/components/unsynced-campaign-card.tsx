/**
 * Special campaign card for unsynced campaigns that shows a sync button
 * instead of allowing navigation to the donation page
 */

'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import type { Campaign } from '@/lib/db'
import { getContract } from '@/lib/web3/client'
import { notify } from '@/lib/utils/notify'
import ErrorModal from '@/components/error-modal'

const CARD_PLACEHOLDER_2x1 = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e5e7eb" />
        <stop offset="1" stop-color="#d1d5db" />
      </linearGradient>
    </defs>
    <rect width="800" height="400" fill="url(#g)"/>
    <g fill="#9ca3af">
      <circle cx="400" cy="190" r="36"/>
      <rect x="340" y="238" width="120" height="14" rx="7"/>
    </g>
  </svg>
`)

interface UnsyncedCampaignCardProps {
  campaign: Campaign
  onSynced?: (campaignId: string, onChainData: { chainId: number; contract: string; campaignId: string }) => void
}

export function UnsyncedCampaignCard({ campaign, onSynced }: UnsyncedCampaignCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(campaign.image || CARD_PLACEHOLDER_2x1)
  const [syncing, setSyncing] = useState(false)
  const [errorOpen, setErrorOpen] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [errorDetails, setErrorDetails] = useState<unknown>(null)
  
  // Calculate funding progress percentage
  const progressPercentage = Math.round((campaign.raised / campaign.goal) * 100)
  
  // Format category
  const rawCategory = campaign.category
    ? campaign.category.startsWith('other:')
      ? campaign.category.slice('other:'.length).replaceAll('_', ' ')
      : campaign.category
    : undefined
  const displayCategory = rawCategory
    ? rawCategory.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    : undefined
  
  useEffect(() => {
    setImgSrc(campaign.image || CARD_PLACEHOLDER_2x1)
  }, [campaign.image])
  
  // Preflight image load
  useEffect(() => {
    if (!campaign.image) return
    let active = true
    const test = new window.Image()
    try { test.crossOrigin = 'anonymous' } catch {}
    test.onload = () => { /* ok, keep original */ }
    test.onerror = () => {
      if (active) setImgSrc(CARD_PLACEHOLDER_2x1)
    }
    test.src = campaign.image
    return () => { active = false }
  }, [campaign.image])
  
  const handleSync = async () => {
    // Prevent multiple syncing attempts
    if (syncing) return;
    
    try {
      // Set syncing state immediately to prevent duplicate attempts
      setSyncing(true)
      
      // Get the contract and create campaign
      let contract;
      try {
        contract = await getContract()
      } catch (err: Error | unknown) {
        // Type guard for Error objects
        const error = err instanceof Error ? err : new Error(String(err))
        // Handle wallet connection errors specifically
        if (error.message?.includes('wallet connection')) {
          throw new Error('Wallet connection failed. Please make sure your wallet is connected and try again.')
        } else {
          throw err;
        }
      }
      
      // Use WZETA as default preferred token - this should be configurable in the future
      const wzetaAddress = process.env.NEXT_PUBLIC_WZETA_ADDRESS
      if (!wzetaAddress) {
        throw new Error('WZETA address not configured')
      }
      
      console.log(`Creating campaign on-chain for: ${campaign.title}`)
      const tx = await contract.createCampaign(wzetaAddress)
      
      // Notify user transaction is pending
      notify('Transaction submitted, waiting for confirmation...', 'info')
      const receipt = await tx.wait()
      
      // Find the CampaignCreated event to get the on-chain campaign ID
      // Using any here because the contract event log structure is complex and not fully typed
      // We're handling potential failures in the try/catch block
      const campaignCreatedEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log)
          return parsed?.name === 'CampaignCreated'
        } catch {
          return false
        }
      })
      
      if (!campaignCreatedEvent) {
        throw new Error('Campaign creation event not found in transaction receipt')
      }
      
      const parsedEvent = contract.interface.parseLog(campaignCreatedEvent)
      const onChainCampaignId = parsedEvent?.args?.[0]?.toString()
      
      if (!onChainCampaignId) {
        throw new Error('Failed to get on-chain campaign ID from event')
      }
      
      // Update the campaign with on-chain data
      const onChainData = {
        chainId: Number(await contract.runner?.provider?.getNetwork().then(n => n.chainId)) || 7001,
        contract: await contract.getAddress(),
        campaignId: onChainCampaignId
      }
      
      
      // Call onSynced BEFORE the API call to update UI immediately
      // This prevents lag in UI update while waiting for API
      // Make sure the callback gets called with proper data
      if (onSynced) {
        try {
          onSynced(campaign.id, onChainData);
        } catch (callbackErr) {
          console.error('Error in onSynced callback:', callbackErr);
          // Continue with API update even if callback failed
        }
      }
      
      // Update the campaign via API
      const updateRes = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onChain: onChainData })
      })
      
      const updateJson = await updateRes.json()
      if (!updateRes.ok || !updateJson?.success) {
        // Even if API fails, we already updated the UI and contract sync succeeded
        // Just log the backend sync failure but don't throw error
        console.error('API update failed but UI was updated and contract sync succeeded')
        notify('Campaign synced to contract successfully! (Backend update pending)', 'success')
      } else {
        notify('Campaign synced successfully!', 'success')
      }
      
    } catch (error: Error | unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('Failed to sync campaign:', error)
      notify(errorMsg || 'Failed to sync campaign', 'error')
      // Also show a modal to make the error prominent, with testnet funds hint
      const hint = `Creators must have ZetaChain Athens testnet funds (ZETA for gas and WZETA as preferred token).\n\nDetails: ${errorMsg}`
      setErrorText(hint)
      setErrorDetails(error)
      setErrorOpen(true)
    } finally {
      setSyncing(false)
    }
  }
  
  return (
    <div className="relative bg-white rounded-xl border border-amber-200 p-3 shadow-md flex flex-col">
      {/* Red dot indicator */}
      <div className="absolute top-[5px] left-[5px] z-10">
        <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm" title="Campaign not synced with contract"></div>
      </div>
      
      {/* Category chip */}
      {displayCategory && (
        <div className="absolute top-[10px] right-[10px] z-10">
          <span className="px-2.5 py-1 text-[10px] leading-none font-semibold rounded-full bg-amber-100 text-amber-600 border border-amber-200 shadow-sm">
            {displayCategory}
          </span>
        </div>
      )}
      
      {/* Image */}
      <div className="w-40 h-20 relative rounded-lg overflow-hidden mb-1">
        <Image
          key={imgSrc}
          src={imgSrc}
          alt={campaign.title}
          fill
          unoptimized
          loading="eager"
          priority
          sizes="(max-width: 640px) 160px, (max-width: 1024px) 160px, 160px"
          className="object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgSrc(CARD_PLACEHOLDER_2x1)}
          onLoad={(e) => {
            const img = e.currentTarget
            if (!img.naturalWidth || !img.naturalHeight) {
              setImgSrc(CARD_PLACEHOLDER_2x1)
            }
          }}
        />
      </div>
      
      {/* Campaign Title */}
      <h3 className="text-xl font-bold text-gray-900 mb-2 truncate">
        {campaign.title}
      </h3>
      
      {/* Progress Section */}
      <div className="mt-auto">
        <div className="flex justify-between items-center mb-2">
          <span className="text-lg font-semibold text-gray-900">
            {formatCurrency(campaign.raised, 'USD', false)}
          </span>
          <span className="text-sm text-gray-500 font-medium">
            {progressPercentage}% funded
          </span>
        </div>
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner mb-3">
          <div
            className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Goal: {formatCurrency(campaign.goal, 'USD', false)}
        </p>
        
        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {syncing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
              </svg>
              Sync to Contract
            </>
          )}
        </button>
      </div>
      <ErrorModal
        isOpen={errorOpen}
        title="Wallet issue or missing testnet funds"
        message={errorText}
        details={errorDetails}
        onClose={() => { setErrorOpen(false); setErrorDetails(null) }}
      />
    </div>
  )
}
