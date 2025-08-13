'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from './card'
import { ChainChips } from './chain-chips'

export function CampaignForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal: '',
    chains: ['Ethereum'] as ('Ethereum' | 'Solana' | 'Bitcoin')[]
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !formData.description || !formData.goal) {
      return
    }

    setIsLoading(true)
    
    try {
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
          category: 'Other', // Default category for now
        }),
      })

      if (response.ok) {
        const result = await response.json()
        router.push(`/campaign/${result.id}`)
      } else {
        console.error('Campaign creation failed')
      }
    } catch (error) {
      console.error('Campaign creation failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChainToggle = (chain: 'Ethereum' | 'Solana' | 'Bitcoin') => {
    setFormData(prev => ({
      ...prev,
      chains: prev.chains.includes(chain)
        ? prev.chains.filter(c => c !== chain)
        : [...prev.chains, chain]
    }))
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

        {/* Blockchain Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">
            Accepted Blockchains *
          </label>
          <p className="text-sm text-[color:var(--muted)] mb-4">
            Choose which blockchains donors can use to contribute to your campaign.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['Ethereum', 'Solana', 'Bitcoin'] as const).map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => handleChainToggle(chain)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                  formData.chains.includes(chain)
                    ? 'bg-[color:var(--primary)] text-black'
                    : 'bg-white/5 border border-white/10 text-[color:var(--muted)] hover:bg-white/10 hover:border-white/20 hover:text-white'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: chain === 'Ethereum' ? 'var(--eth)' :
                                   chain === 'Solana' ? 'var(--sol)' : 'var(--btc)'
                  }}
                />
                {chain}
              </button>
            ))}
          </div>
          {formData.chains.length === 0 && (
            <p className="text-sm text-red-400 mt-2">Please select at least one blockchain.</p>
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
            disabled={!formData.title || !formData.description || !formData.goal || formData.chains.length === 0 || isLoading}
            className="flex-1 bg-[color:var(--primary)] hover:bg-[color:var(--primary-600)] active:bg-[color:var(--primary-700)] disabled:bg-[color:var(--muted)] disabled:cursor-not-allowed text-black rounded-full px-8 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
          >
            {isLoading ? 'Creating Campaign...' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </Card>
  )
}
