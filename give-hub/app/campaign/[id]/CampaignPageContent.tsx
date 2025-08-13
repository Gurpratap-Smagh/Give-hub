'use client'

import { useState, useRef, useEffect } from 'react'
import type { Campaign, Donation, Creator } from '@/_dev/mock-db/database'
import Spinner from '@/components/spinner'
import Link from 'next/link'
import Image from 'next/image'
import { CampaignCard } from '@/components/campaign-card'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useAuth } from '@/lib/auth/auth-context'
import { notify } from '@/lib/utils/notify'
import CampaignEditForm from '@/components/campaign-edit-form'
import PaymentModal from '@/components/payment-modal'

/**
 * FILE: app/campaign/[id]/CampaignPageContent.tsx
 * PURPOSE: Client component for campaign detail page UI and interactions.
 */

// The initialCampaign prop now includes the creator object
type CampaignWithCreator = Campaign & { creator?: Creator | null };


export default function CampaignPageContent({ initialCampaign, initialDonations }: { initialCampaign: CampaignWithCreator, initialDonations: Donation[] }) {
  const { user } = useAuth()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [donations, setDonations] = useState(initialDonations)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editPreview, setEditPreview] = useState<CampaignWithCreator>(campaign)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const formRef = useRef<HTMLFormElement & { requestSubmit: () => void }>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditPreview(campaign)
  }, [campaign])

  const isOwner = user?.id === campaign.creatorId

  const handlePaymentSuccess = async (amount: number, chain: string) => {
    // Refresh campaign data to show updated progress
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.campaign) {
          setCampaign(prev => ({ ...prev, raised: data.campaign.raised }))
        }
        if (data.success && data.donations) {
          setDonations(data.donations)
        }
      }
      
      notify(`Successfully donated $${amount} via ${chain}!`, 'success')
    } catch (error) {
      console.error('Error refreshing campaign data:', error)
      // Still show success message even if refresh fails
      notify(`Successfully donated $${amount} via ${chain}!`, 'success')
    }
  }

  const handleFormChange = (partial: Partial<Campaign>) => {
    setEditPreview(prev => ({ ...prev!, ...partial }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Please select an image file', 'error')
    if (file.size > 5 * 1024 * 1024) return notify('Image size must be less than 5MB', 'error')

    const reader = new FileReader()
    reader.onload = () => handleFormChange({ image: reader.result as string })
    reader.onerror = () => notify('Error processing image.', 'error')
    reader.readAsDataURL(file)
  }

  const handleEditSave = async (updatedData: Partial<Campaign>) => {
    // Persist to mock DB via API route: PUT /api/campaigns/[id]/edit
    setIsSaving(true)
    try {
      const finalData: Partial<Campaign> = { ...updatedData, image: editPreview.image }
      const res = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || 'Failed to save changes.'
        throw new Error(msg)
      }

      // API returns the updated campaign object directly
      setCampaign(prev => ({ ...(data as Campaign), creator: prev.creator }))
      setIsEditing(false)
      notify('Campaign updated successfully!', 'success')
    } catch (error) {
      console.error(error)
      notify(error instanceof Error ? error.message : 'An unknown error occurred.', 'error')
    } finally {
      setIsSaving(false)
    }
  }



  const progressPercentage = Math.min(100, Math.round((campaign.raised / campaign.goal) * 100))

  if (isEditing) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Edit Campaign</h1>
          <div className="flex items-center space-x-2">
             <button
                onClick={() => notify('AI Edit is not yet implemented.', 'info')}
                className="px-4 py-2 rounded-full border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition"
              >
                Edit with AI
              </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={() => formRef.current?.requestSubmit()}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400"
              disabled={isSaving}
            >
              {isSaving ? <Spinner /> : 'Finish'}
            </button>
          </div>
        </div>

        {/* Mobile: image with edit overlay */}
        <div className="md:hidden mb-6">
          <div className="w-full h-56 relative rounded-lg overflow-hidden shadow-lg">
            <Image
              src={editPreview.image || '/placeholder.png'}
              alt={editPreview.title}
              layout="fill"
              objectFit="cover"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-black/60 text-white text-sm font-medium hover:bg-black/70 focus:outline-none"
              aria-label="Change campaign image"
              title="Change image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-.879.88 3.712 3.712.88-.879a2.625 2.625 0 000-3.713z" />
                <path d="M2.25 21.75h3.943c.464 0 .909-.184 1.237-.513l11.5-11.5-3.712-3.712-11.5 11.5c-.329.328-.513.773-.513 1.237v3.988z" />
              </svg>
              Edit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Edit Form */}
          <div>
            <CampaignEditForm
              ref={formRef}
              campaign={campaign}
              onSave={handleEditSave}
              onChange={handleFormChange}
              hasDonations={donations.length > 0}
            />
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>

          {/* Right Column: Live Preview */}
          <div className="hidden md:block">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Live Preview</h2>
            <div className="sticky top-24">
                <div className="w-full h-56 relative mb-4 rounded-lg overflow-hidden shadow-lg">
                    <Image
                        src={editPreview.image || '/placeholder.png'}
                        alt={editPreview.title}
                        layout="fill"
                        objectFit="cover"
                    />
                    {/* Edit image icon overlay */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute top-3 right-3 inline-flex items-center justify-center p-2 rounded-full bg-black/50 text-white hover:bg-black/60 focus:outline-none"
                      aria-label="Change campaign image"
                      title="Change image"
                    >
                      {/* Pencil icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-.879.88 3.712 3.712.88-.879a2.625 2.625 0 000-3.713z" />
                        <path d="M2.25 21.75h3.943c.464 0 .909-.184 1.237-.513l11.5-11.5-3.712-3.712-11.5 11.5c-.329.328-.513.773-.513 1.237v3.988z" />
                      </svg>
                    </button>
                </div>
                <CampaignCard campaign={editPreview as Campaign} variant="minimal" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{campaign.title}</h1>
            <div className="flex items-center mt-2 text-gray-600">
              <p>Created by <Link href={`/profile/${campaign.creatorId}`} className="font-semibold text-blue-600 hover:underline">{campaign.creator?.username || 'Anonymous'}</Link></p>
            </div>
          </div>
          {isOwner && (
            <button onClick={() => setIsEditing(true)} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition">
              Edit Campaign
            </button>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left/Main Column */}
          <div className="lg:col-span-2">
            <div className="w-full h-96 relative mb-6 rounded-lg overflow-hidden shadow-xl">
              <Image src={campaign.image || '/placeholder.png'} alt={campaign.title} layout="fill" objectFit="cover" priority />
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-bold mb-4">Story</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{campaign.description}</p>
            </div>
          </div>

          {/* Right/Sidebar Column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-bold mb-4">Donate</h3>
                {/* Supported Chains Display */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">Supported payment methods:</p>
                  <div className="flex gap-2">
                    {campaign.chains.map(chain => (
                      <span key={chain} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                        {chain}
                      </span>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setShowPaymentModal(true)} 
                  className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white py-4 rounded-full font-bold text-lg transition-all hover:scale-105 shadow-lg mb-6"
                >
                  Donate Now
                </button>

                {/* Campaign Stats */}
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <div className="flex justify-between items-center"><span className="text-gray-600">Total Raised</span><span className="font-bold text-gray-900">{formatCurrency(campaign.raised)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Goal</span><span className="font-bold text-gray-900">{formatCurrency(campaign.goal)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Progress</span><span className="font-bold text-green-600">{progressPercentage}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Donors</span><span className="font-bold text-gray-900">{donations.length}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Donations */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Recent Donations</h2>
          <div className="bg-white p-6 rounded-lg shadow">
            {donations.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {donations.slice(0, 10).map((donation, index) => (
                  <li key={index} className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{donation.name || 'Anonymous'} donated <span className="text-green-600">{formatCurrency(donation.amount)}</span> via {donation.chain}</p>
                      <p className="text-sm text-gray-500">{formatDate(donation.timestamp)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Be the first to donate!</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Payment Modal */}
      <PaymentModal
        campaign={campaign}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
