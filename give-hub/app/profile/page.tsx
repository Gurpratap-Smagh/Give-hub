'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import Spinner from '@/components/spinner'
import ProfilePictureUpload from '@/components/profile-picture-upload'
import { notify } from '@/lib/utils/notify'

export default function ProfilePage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [newSignup, setNewSignup] = useState(false)
  const [profileData, setProfileData] = useState({
    name: user?.username || '',
    email: user?.email || '',
    bio: 'Passionate about making a difference through blockchain technology and charitable giving.',
    location: 'San Francisco, CA',
    website: 'https://johndoe.com',
    profilePicture: (user as any)?.profilePicture || '',
    walletAddresses: {
      ethereum: '0x1234...5678',
      solana: 'ABC123...XYZ789',
      bitcoin: 'bc1q...example'
    }
  })

  // Update local state when user loads/changes
  useEffect(() => {
    if (user) {
      setProfileData((prev) => ({
        ...prev,
        name: user.username,
        email: user.email,
        profilePicture: (user as any).profilePicture || '',
      }))
    }
  }, [user])

  // Detect if user has just signed up to customize CTA
  useEffect(() => {
    try {
      const flag = localStorage.getItem('new-signup')
      if (flag === '1') {
        setNewSignup(true)
        localStorage.removeItem('new-signup')
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} />
            <p className="text-gray-600">Loading your profile...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You are not signed in</h1>
          <p className="text-gray-600 mb-6">Please sign in to view your profile.</p>
          <Link href="/auth" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-semibold transition-colors">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.target.name.startsWith('wallet_')) {
      const chain = e.target.name.replace('wallet_', '')
      setProfileData({
        ...profileData,
        walletAddresses: {
          ...profileData.walletAddresses,
          [chain]: e.target.value
        }
      })
    } else {
      setProfileData({
        ...profileData,
        [e.target.name]: e.target.value
      })
    }
  }

  const handleSave = async () => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          profilePicture: profileData.profilePicture,
          bio: profileData.bio,
          location: profileData.location,
          website: profileData.website,
          walletAddresses: profileData.walletAddresses
        }),
      })

      if (response.ok) {
        notify('Profile updated successfully!', 'success')
        setIsEditing(false)
        // Refresh the page data to reflect latest profile and exit edit mode
        router.replace('/profile')
        router.refresh()
      } else {
        notify('Failed to update profile. Please try again.', 'error')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      notify('Error updating profile. Please try again.', 'error')
    }
  }

  const handleCancel = () => {
    // Reset to original data (in real app, would fetch from server)
    setIsEditing(false)
  }

  // Prefill profile using AI placeholder. Later this will call AI to suggest content and update image.
  const handleFixWithAI = () => {
    setIsEditing(true)
    setProfileData((prev) => ({
      ...prev,
      bio:
        "Hi! I'm a passionate supporter of transparent giving and web3 impact. I use GiveHub to connect causes with donors, share progress, and make every contribution count.",
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back / Explore CTA */}
        {newSignup ? (
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
          >
            Explore →
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
          >
            ← Back to Home
          </Link>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-left">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                My Profile
              </h1>
              <p className="text-lg text-gray-600">
                Manage your account information and wallet addresses
              </p>
            </div>
            {/* External edit controls removed; controls live within the Profile Information card */}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-6 text-center">
              <ProfilePictureUpload
                currentUser={user as any}
                currentPicture={profileData.profilePicture}
                onPictureChange={(newPicture) => setProfileData(prev => ({ ...prev, profilePicture: newPicture }))}
                isEditing={isEditing}
                size="lg"
              />
              <h2 className="text-xl font-bold text-gray-900 mb-2">{profileData.name || user.username}</h2>
              <p className="text-gray-600 mb-4">{profileData.email || user.email}</p>
              <div className="space-y-2 text-sm text-gray-500">
                {profileData.location && (
                  <p>📍 {profileData.location}</p>
                )}
                {profileData.website && (
                  <p>🌐 <a href={profileData.website} className="text-blue-600 hover:text-blue-800">{profileData.website}</a></p>
                )}
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Profile Information</h3>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-semibold transition-colors"
                  >
                    Edit Profile
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      className="bg-white text-blue-600 border border-blue-600 hover:bg-blue-50 px-6 py-2 rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 px-6 py-2 rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {/* Lower action: Fix with AI (prefill placeholder) */}
                <div className="flex justify-end -mt-4 mb-2">
                  {isEditing && (
                    <button
                      onClick={handleFixWithAI}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-200 text-gray-800 hover:bg-blue-50 transition-colors"
                      title="Prefill description with AI template"
                    >
                      <span className="text-sm font-semibold">Fix with <span className="text-blue-600">AI</span></span>
                    </button>
                  )}
                </div>
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={profileData.name}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className={`w-full p-3 border-2 rounded-lg focus:outline-none ${
                        isEditing 
                          ? 'border-gray-200 focus:border-blue-500' 
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={profileData.email}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className={`w-full p-3 border-2 rounded-lg focus:outline-none ${
                        isEditing 
                          ? 'border-gray-200 focus:border-blue-500' 
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bio
                  </label>
                  <textarea
                    name="bio"
                    value={profileData.bio}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    rows={3}
                    className={`w-full p-3 border-2 rounded-lg focus:outline-none resize-none ${
                      isEditing 
                        ? 'border-gray-200 focus:border-blue-500' 
                        : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      name="location"
                      value={profileData.location}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className={`w-full p-3 border-2 rounded-lg focus:outline-none ${
                        isEditing 
                          ? 'border-gray-200 focus:border-blue-500' 
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Website
                    </label>
                    <input
                      type="url"
                      name="website"
                      value={profileData.website}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className={`w-full p-3 border-2 rounded-lg focus:outline-none ${
                        isEditing 
                          ? 'border-gray-200 focus:border-blue-500' 
                          : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                {/* Wallet Addresses */}
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Wallet Addresses</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Ethereum Address
                      </label>
                      <input
                        type="text"
                        name="wallet_ethereum"
                        value={profileData.walletAddresses.ethereum}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className={`w-full p-3 border-2 rounded-lg focus:outline-none font-mono text-sm ${
                          isEditing 
                            ? 'border-gray-200 focus:border-blue-500' 
                            : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                        }`}
                        placeholder="0x..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Solana Address
                      </label>
                      <input
                        type="text"
                        name="wallet_solana"
                        value={profileData.walletAddresses.solana}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className={`w-full p-3 border-2 rounded-lg focus:outline-none font-mono text-sm ${
                          isEditing 
                            ? 'border-gray-200 focus:border-blue-500' 
                            : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                        }`}
                        placeholder="Base58 address..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Bitcoin Address
                      </label>
                      <input
                        type="text"
                        name="wallet_bitcoin"
                        value={profileData.walletAddresses.bitcoin}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className={`w-full p-3 border-2 rounded-lg focus:outline-none font-mono text-sm ${
                          isEditing 
                            ? 'border-gray-200 focus:border-blue-500' 
                            : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                        }`}
                        placeholder="bc1q... or 1... or 3..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Placeholder Notice */}
              <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center">
                  <div className="text-green-600 mr-3">🤖</div>
                  <div>
                    <p className="text-sm text-green-800 font-medium">
                      AI-Enhanced Profile
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Profile editing will be enhanced with Gemini AI for content suggestions and validation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
