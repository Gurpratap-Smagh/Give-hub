"use client"

import { useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import type { Campaign } from '@/_dev/mock-db/database'

interface PaymentModalProps {
  campaign: Campaign
  isOpen: boolean
  onClose: () => void
  onPaymentSuccess: (amount: number, chain: string) => void
}

export default function PaymentModal({ campaign, isOpen, onClose, onPaymentSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [selectedChain, setSelectedChain] = useState<string>(campaign.chains[0] || 'Ethereum')
  const [donorName, setDonorName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const { user } = useAuth()

  if (!isOpen) return null

  const handlePayment = async () => {
    if (!amount || !selectedChain) return

    setIsProcessing(true)
    
    try {
      // Mock payment processing
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          amount: parseFloat((amount || '').replace(/,/g, '.')),
          chain: selectedChain,
          donorName: (donorName || '').trim() || user?.username || 'Anonymous',
        }),
      })

      if (response.ok) {
        await response.json() // Process response but don't store unused result
        onPaymentSuccess(parseFloat((amount || '').replace(/,/g, '.')), selectedChain)
        onClose()
        // Reset form
        setAmount('')
        setDonorName('')
      } else {
        throw new Error('Payment failed')
      }
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment failed. Please try again.')
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
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
              style={{ width: `${(campaign.raised / campaign.goal) * 100}%` }}
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
            placeholder={user?.username || "Enter your name"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Donation Amount ($)
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
                  ${amt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chain Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method
          </label>
          <div className="grid grid-cols-3 gap-2">
            {campaign.chains.map(chain => (
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
          disabled={!amount || isProcessing || parseFloat((amount || '').replace(/,/g, '.')) <= 0}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          ) : (
            `Donate $${amount || '0'} via ${selectedChain}`
          )}
        </button>

        {/* Mock Payment Notice */}
        <p className="text-xs text-gray-500 mt-3 text-center">
          This is a mock payment system for demonstration purposes. No real transactions will be processed.
        </p>
      </div>
    </div>
  )
}
