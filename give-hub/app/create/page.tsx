/**
 * FILE: app/create/page.tsx
 * PURPOSE: Campaign creation form - validates input and creates new campaigns
 * WHAT CALLS THIS: Next.js App Router for /create route, linked from Nav component
 * WHAT IT RENDERS: Multi-step campaign creation form with validation
 * ACCESS: Default export, automatically routed by Next.js
 * MIGRATION NOTES:
 * - Replace handleSubmit alert with POST /api/campaigns (MongoDB)
 * - Add zod validation schema for form data before submission
 * - Integrate with AI for content optimization and fraud detection
 * - Add image upload for campaign media
 * TODO:
 * - Add form validation with react-hook-form + zod
 * - Implement draft saving (localStorage or MongoDB)
 * - Add rich text editor for description
 * - Integrate Gemini AI for content suggestions and validation
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
// TODO: import { createCampaign } from '@/lib/api' // Future API integration
// TODO: import { validateCampaign } from '@/lib/validation' // Zod schema validation
// TODO: import { optimizeContent } from '@/lib/ai' // AI content enhancement

/**
 * Campaign creation page component
 * @returns JSX element with campaign creation form
 */
export default function CreatePage() {
  // REGION: State management
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal: '',
    chains: [] as string[],
    category: ''
  })
  const [otherCategory, setOtherCategory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { user } = useAuth()

  // REGION: Event handlers
  /**
   * Handle form input changes
   * @param e - Input change event
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  /**
   * Toggle blockchain selection
   * @param chain - Blockchain name to toggle
   */
  const handleChainToggle = (chain: string) => {
    setFormData({
      ...formData,
      chains: formData.chains.includes(chain)
        ? formData.chains.filter(c => c !== chain)
        : [...formData.chains, chain]
    })
  }

  /**
   * Handle form submission - currently placeholder
   * MIGRATION: Replace with API call and validation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category) {
      alert('Please select a category')
      return
    }
    if (formData.category === 'other' && !otherCategory.trim()) {
      alert('Please specify your category')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          goal: Number(formData.goal),
          chains: formData.chains as ('Ethereum' | 'Solana' | 'Bitcoin')[],
          category: formData.category === 'other' ? otherCategory.trim() : formData.category,
          creatorId: user?.id
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create campaign')
      }
      // Redirect to the new campaign page; campaign page shows its own loading
      router.push(`/campaign/${data.campaign.id}`)
    } catch (error) {
      console.error('Campaign creation failed:', error)
      alert('Failed to create campaign. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content Section */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
        >
          ← Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Start a <span className="text-gradient">Campaign</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Create a campaign to raise funds for your cause. Choose which blockchains 
            to accept donations from and start making a difference.
          </p>
        </div>
        
        {/* Campaign Form */}
        <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Campaign Title */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                placeholder="Enter a compelling title for your campaign"
                required
              />
            </div>
            {/* Edit with AI button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => alert('AI integration yet to happen')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-gray-200 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm transition-all"
                title="Edit with AI"
              >
                <span className="text-xl">✨</span>
                Edit with AI
                <span className="text-xs bg-black text-white rounded-full px-2 py-0.5 ml-1">beta</span>
              </button>
            </div>

            {/* Campaign Description */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={6}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg resize-none"
                placeholder="Describe your campaign, its goals, and how the funds will be used. Be detailed and transparent to build trust with potential donors."
                required
              />
            </div>

            {/* Funding Goal */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Funding Goal (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-gray-500 text-lg font-medium">$</span>
                <input
                  type="number"
                  name="goal"
                  value={formData.goal}
                  onChange={handleInputChange}
                  className="w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                  placeholder="50000"
                  min="1"
                  required
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                required
              >
                <option value="">Select a category</option>
                <option value="humanitarian">Humanitarian Aid</option>
                <option value="education">Education</option>
                <option value="healthcare">Healthcare</option>
                <option value="environment">Environment</option>
                <option value="animals">Animal Welfare</option>
                <option value="community">Community Development</option>
                <option value="emergency">Emergency Relief</option>
                <option value="other">Other</option>
              </select>
              {formData.category === 'other' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={otherCategory}
                    onChange={(e) => setOtherCategory(e.target.value)}
                    placeholder="Enter your custom category"
                    className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">This will be shown on your card.</p>
                </div>
              )}
            </div>

            {/* Blockchain Selection */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Supported Blockchains *
              </label>
              <p className="text-gray-600 mb-4">
                Choose which blockchains you want to accept donations from:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['Ethereum', 'Solana', 'Bitcoin'].map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => handleChainToggle(chain)}
                    className={`p-4 rounded-lg border-2 transition-all font-semibold ${
                      formData.chains.includes(chain)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">
                        {chain === 'Ethereum' ? '⟠' : chain === 'Solana' ? '◎' : '₿'}
                      </div>
                      <div>{chain}</div>
                    </div>
                  </button>
                ))}
              </div>
              {formData.chains.length === 0 && (
                <p className="text-red-500 text-sm mt-2">Please select at least one blockchain</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={formData.chains.length === 0 || isSubmitting}
                className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 text-white py-4 rounded-full font-bold text-xl transition-all hover:scale-105 shadow-lg disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating…' : 'Create Campaign'}
              </button>
            </div>
          </form>

          {/* Placeholder Notice */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="text-blue-600 mr-3">ℹ️</div>
              <div>
                <p className="text-sm text-blue-800 font-medium">
                  Enhanced with AI
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Campaign creation will be enhanced with Gemini AI for content optimization and validation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
