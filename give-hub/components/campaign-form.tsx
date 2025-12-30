'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from './card'
import { useCreateCampaign, useUpdateCampaignDestination } from '@/lib/hooks/useCrowdfundContract'
import { useWalletClient, usePublicClient } from 'wagmi'
import { showError, showSuccess } from '@/components/notification-manager'

interface PayoutToken {
  symbol: string
  address: string
  chain: string
}

export function CampaignForm() {
  const router = useRouter()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { create: createOnChain, loading: creatingOnChain } = useCreateCampaign()
  const { update: updateCampaignDest, loading: updatingDest } = useUpdateCampaignDestination()
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal: '',
    payoutAddress: '',
    payoutToken: '' as string,
    chains: ['Ethereum'] as string[]
  })
  const [isLoading, setIsLoading] = useState(false)
  const [customChain, setCustomChain] = useState('')

  // Available payout tokens per chain
  const payoutTokens: Record<string, PayoutToken[]> = {
    'ZETA': [
      { symbol: 'ZETA', address: '0x0000000000000000000000000000000000000000', chain: 'ZETA' },
      { symbol: 'WZETA', address: process.env.NEXT_PUBLIC_WZETA_ADDRESS || '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf', chain: 'ZETA' },
      { symbol: 'zETH', address: '0x05ba149a7bd6dc1f937fa9046a9e05c05f3b18b0', chain: 'ZETA' },
      { symbol: 'sBTC', address: '0x65a45c57636f9BcCeD4fe193A602008578BcA90b', chain: 'ZETA' }
    ],
    'SEPOLIA': [
      { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', chain: 'SEPOLIA' },
      { symbol: 'USDC', address: '0xcC683A782f4B30c138787CB5576a86AF66fdc31d', chain: 'SEPOLIA' },
      { symbol: 'zETH', address: '0x05ba149a7bd6dc1f937fa9046a9e05c05f3b18b0', chain: 'SEPOLIA' }
    ],
    'BTC': [
      { symbol: 'BTC', address: '', chain: 'BTC' }
    ],
    'Ethereum': [
      { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', chain: 'Ethereum' },
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'Ethereum' }
    ],
    'ZetaChain': [
      { symbol: 'ZETA', address: '0x0000000000000000000000000000000000000000', chain: 'ZetaChain' },
      { symbol: 'WZETA', address: process.env.NEXT_PUBLIC_WZETA_ADDRESS || '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf', chain: 'ZetaChain' },
      { symbol: 'zETH', address: '0x05ba149a7bd6dc1f937fa9046a9e05c05f3b18b0', chain: 'ZetaChain' },
      { symbol: 'sBTC', address: '0x65a45c57636f9BcCeD4fe193A602008578BcA90b', chain: 'ZetaChain' }
    ],
    'Solana': [
      { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', chain: 'Solana' }
    ],
    'Bitcoin': [
      { symbol: 'BTC', address: '', chain: 'Bitcoin' }
    ]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.description || !formData.goal || !formData.payoutAddress || !formData.payoutToken) {
      showError('Missing required fields', 'Please fill in all required fields including payout address and token')
      return
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(formData.payoutAddress) && !/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(formData.payoutAddress)) {
      showError('Invalid address', 'Please enter a valid blockchain address')
      return
    }

    setIsLoading(true)
    
    try {
      // Create campaign via API first
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          goal: parseFloat(formData.goal),
          chains: formData.chains,
          payoutAddress: formData.payoutAddress,
          payoutToken: formData.payoutToken,
          category: 'Other',
        }),
      })

      if (!response.ok) {
        throw new Error('Campaign creation failed')
      }

      const result = await response.json()
      showSuccess('Campaign created successfully!')
      
      // Sync to blockchain with atomic transaction sequencing if wallet is connected
      if (walletClient && publicClient) {
        try {
          const token = payoutTokens[formData.chains[0]]?.find(t => t.symbol === formData.payoutToken)
          if (token) {
            // CALL A: createCampaign(preferredZRC20) on ZetaChain
            showSuccess('Broadcasting createCampaign transaction...')
            const createTxHash = await createOnChain(token.address)
            
            if (createTxHash) {
              // LISTENER: Retrieve campaignId from CampaignCreated event logs
              showSuccess('Listening for CampaignCreated event...')
              const receipt = await publicClient.waitForTransactionReceipt({ 
                hash: createTxHash as `0x${string}`,
                timeout: 60_000 
              })
              
              // Extract campaignId from API response (primary source)
              let campaignId: number | null = null
              if (result.blockchainCampaignId) {
                campaignId = result.blockchainCampaignId
              }
              
              // For production: Could also parse CampaignCreated event from receipt logs
              // using publicClient.getLogs() if needed for full on-chain verification
              
              if (campaignId) {
                // CALL B: updateCampaignDestination(campaignId, payoutAddress, payoutGasLimit)
                showSuccess(`Campaign created with ID ${campaignId}. Setting payout address...`)
                const payoutGasLimit = 300_000 // Standard gas limit for cross-chain payout
                await updateCampaignDest(campaignId, formData.payoutAddress, payoutGasLimit)
                showSuccess('Campaign synced to blockchain with payout address!')
              } else {
                showError('Unable to retrieve campaignId from event', 'Campaign created but destination update failed')
              }
            }
          }
        } catch (err) {
          console.warn('On-chain sync failed:', err)
          showError('Blockchain sync failed', err instanceof Error ? err.message : 'Check console for details')
        }
      }

      router.push(`/campaign/${result.id}`)
    } catch (error) {
      showError('Campaign creation failed', error instanceof Error ? error.message : 'Please try again')
      console.error('Campaign creation failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChainToggle = (chain: string) => {
    setFormData(prev => ({
      ...prev,
      chains: prev.chains.includes(chain)
        ? prev.chains.filter(c => c !== chain)
        : [...prev.chains, chain]
    }))
  }

  const addCustomChain = () => {
    const raw = (customChain || '').trim()
    if (!raw) return
    const normalized = raw.replace(/\s+/g, ' ').trim()
    setFormData(prev => (
      prev.chains.includes(normalized)
        ? prev
        : { ...prev, chains: [...prev.chains, normalized] }
    ))
    setCustomChain('')
  }

  const getAvailablePayoutTokens = (): PayoutToken[] => {
    return formData.chains.flatMap(chain => payoutTokens[chain] || [])
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="p-8">
        {/* Title */}
        <div className="mb-6">
          <label htmlFor="title" className="block text-sm font-medium mb-3">
            Campaign Title *
          </label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="What are you raising money for?"
            className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
            required
          />
        </div>

        {/* Goal */}
        <div className="mb-6">
          <label htmlFor="goal" className="block text-sm font-medium mb-3">
            Funding Goal (USD) *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[color:var(--muted)]">
              $
            </span>
            <input
              id="goal"
              type="number"
              value={formData.goal}
              onChange={(e) => setFormData(prev => ({ ...prev, goal: e.target.value }))}
              placeholder="0"
              min="1"
              step="1"
              className="w-full pl-8 pr-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
              required
            />
          </div>
        </div>

        {/* Payout Address */}
        <div className="mb-6">
          <label htmlFor="payoutAddress" className="block text-sm font-medium mb-3">
            Payout Wallet Address *
          </label>
          <input
            id="payoutAddress"
            type="text"
            value={formData.payoutAddress}
            onChange={(e) => setFormData(prev => ({ ...prev, payoutAddress: e.target.value }))}
            placeholder="0x... or bitcoin address"
            className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
            required
          />
          <p className="text-xs text-[color:var(--muted)] mt-2">
            Funds will be sent to this address when campaign ends
          </p>
        </div>

        {/* Blockchain Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">
            Accepted Blockchains *
          </label>
          <p className="text-sm text-[color:var(--muted)] mb-4">
            Choose which blockchains donors can use to contribute to your campaign.
          </p>
          {/* Selected chains with remove */}
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.chains.map((chain) => (
              <span key={chain} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-sm">
                {chain}
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, chains: prev.chains.filter(c => c !== chain) }))} className="hover:text-red-400">
                  ×
                </button>
              </span>
            ))}
          </div>

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mb-3">
            {['ZETA','SEPOLIA','BTC','Ethereum','Solana','Bitcoin','ZetaChain'].filter(s => !formData.chains.includes(s)).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => handleChainToggle(s)}
                className="px-3 py-1 rounded-full text-sm bg-white/5 border border-white/10 text-[color:var(--muted)] hover:bg-white/10 hover:border-white/20 hover:text-white"
              >
                + {s}
              </button>
            ))}
          </div>

          {/* Custom chain input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customChain}
              onChange={(e) => setCustomChain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChain() } }}
              placeholder="Add chain (e.g., ZetaChain)"
              className="flex-1 px-3 py-2 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)]"
            />
            <button type="button" onClick={addCustomChain} className="px-4 py-2 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15">Add</button>
          </div>
          {formData.chains.length === 0 && (
            <p className="text-sm text-red-400 mt-2">Please select at least one blockchain.</p>
          )}
        </div>

        {/* Payout Token */}
        <div className="mb-6">
          <label htmlFor="payoutToken" className="block text-sm font-medium mb-3">
            Preferred Payout Token *
          </label>
          <select
            id="payoutToken"
            value={formData.payoutToken}
            onChange={(e) => setFormData(prev => ({ ...prev, payoutToken: e.target.value }))}
            className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20"
            required
          >
            <option value="">Select a token</option>
            {getAvailablePayoutTokens().map((token) => (
              <option key={`${token.chain}-${token.symbol}`} value={token.symbol}>
                {token.symbol} ({token.chain})
              </option>
            ))}
          </select>
          {getAvailablePayoutTokens().length === 0 && formData.chains.length > 0 && (
            <p className="text-xs text-yellow-400 mt-2">Select chains to see available tokens</p>
          )}
        </div>

        {/* Description */}
        <div className="mb-8">
          <label htmlFor="description" className="block text-sm font-medium mb-3">
            Campaign Description *
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Tell people about your campaign. What are you raising money for? How will the funds be used?"
            rows={8}
            className="w-full px-4 py-3 bg-[color:var(--panel-2)] border border-white/10 rounded-lg focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/20 placeholder-[color:var(--muted)] resize-none"
            required
          />
          <p className="text-sm text-[color:var(--muted)] mt-2">
            Be specific and authentic. Donors want to know exactly how their contribution will make a difference.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-transparent hover:bg-white/5 border border-white/10 rounded-full px-8 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!formData.title || !formData.description || !formData.goal || !formData.payoutAddress || !formData.payoutToken || formData.chains.length === 0 || isLoading}
            className="flex-1 bg-[color:var(--primary)] hover:bg-[color:var(--primary-600)] active:bg-[color:var(--primary-700)] disabled:bg-[color:var(--muted)] disabled:cursor-not-allowed text-black rounded-full px-8 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            {isLoading ? 'Creating Campaign...' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </Card>
  )
}


