'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({
    name: 'John Doe',
    email: 'john.doe@example.com',
    bio: 'Passionate about making a difference through blockchain technology and charitable giving.',
    location: 'San Francisco, CA',
    website: 'https://johndoe.com',
    walletAddresses: {
      ethereum: '0x1234...5678',
      solana: 'ABC123...XYZ789',
      bitcoin: 'bc1q...example'
    }
  })

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

  const handleSave = () => {
    // Placeholder for profile update logic
    alert('Profile updates will be saved to MongoDB in the next phase!')
    setIsEditing(false)
  }

  const handleCancel = () => {
    // Reset to original data (in real app, would fetch from server)
    setIsEditing(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
        >
          ← Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            My Profile
          </h1>
          <p className="text-lg text-gray-600">
            Manage your account information and wallet addresses
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-6 text-center">
              <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-green-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                {profileData.name.split(' ').map(n => n[0]).join('')}
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{profileData.name}</h2>
              <p className="text-gray-600 mb-4">{profileData.email}</p>
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
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-semibold transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-full font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-6">
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
