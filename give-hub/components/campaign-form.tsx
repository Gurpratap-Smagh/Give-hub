'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from './card'
// Removed unused ChainChips (dynamic chains handled inline)

export function CampaignForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal: '',
    chains: ['Ethereum'] as string[]
  })
  const [isLoading, setIsLoading] = useState(false)
  const [customChain, setCustomChain] = useState('')

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
    // Normalize spacing/case lightly
    const normalized = raw.replace(/\s+/g, ' ').trim()
    setFormData(prev => (
      prev.chains.includes(normalized)
        ? prev
        : { ...prev, chains: [...prev.chains, normalized] }
    ))
    setCustomChain('')
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
            {['Ethereum','Solana','Bitcoin','ZetaChain'].filter(s => !formData.chains.includes(s)).map(s => (
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
