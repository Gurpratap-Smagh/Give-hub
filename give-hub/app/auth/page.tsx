'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'

export default function AuthPage() {
  const searchParams = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const { signin, signup } = useAuth()

  // Sync mode from URL (?mode=signin|signup)
  useEffect(() => {
    const mode = searchParams.get('mode')
    if (mode === 'signup') setIsSignUp(true)
    else if (mode === 'signin') setIsSignUp(false)
  }, [searchParams])
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user' as 'user' | 'creator'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    try {
      if (isSignUp) {
        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match')
          setIsLoading(false)
          return
        }
        // Sign up via auth context (sets user + cookie)
        const result = await signup(
          formData.username,
          formData.email,
          formData.password,
          formData.role
        )

        if (result.success) {
          setSuccess('Account created successfully! Redirecting...')
          try { localStorage.setItem('new-signup', '1') } catch {}
          setTimeout(() => {
            router.push('/profile')
          }, 2000)
        } else {
          // Stay on Sign Up when signup fails (e.g., existing username/email)
          setIsSignUp(true)
          setError(result.error || 'Failed to create account')
        }
      } else {
        // Sign in via auth context (sets user + cookie)
        const result = await signin(
          formData.email || formData.username,
          formData.password
        )

        if (result.success) {
          setSuccess('Signed in successfully! Redirecting...')
          router.push('/')
        } else {
          setError(result.error || 'Failed to sign in')
        }
      }
    } catch (error) {
      console.error('Auth error:', error)
      // Stay on Sign Up on errors
      setIsSignUp(true)
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content Section */}
      <div className="flex items-center justify-center py-16 px-6">
        <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8 w-full max-w-md">
          {/* Header Section */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-gray-600">
              {isSignUp 
                ? 'Join GiveHub to start making a difference' 
                : 'Sign in to your GiveHub account'
              }
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {isSignUp && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="Choose a username"
                  required
                  minLength={3}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {isSignUp ? 'Email Address' : 'Email or Username'}
              </label>
              <input
                type={isSignUp ? "email" : "text"}
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder={isSignUp ? "Enter your email" : "Enter email or username"}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Enter your password"
                required
                minLength={8}
              />
            </div>

            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    placeholder="Confirm your password"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Type
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    required
                  >
                    <option value="user">Donor - Support campaigns</option>
                    <option value="creator">Creator - Create campaigns</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.role === 'creator' 
                      ? 'Creators can create and manage fundraising campaigns'
                      : 'Donors can support campaigns and track their contributions'
                    }
                  </p>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 rounded-full font-bold text-lg transition-all hover:scale-105 shadow-lg disabled:hover:scale-100"
            >
              {isLoading 
                ? (isSignUp ? 'Creating Account...' : 'Signing In...') 
                : (isSignUp ? 'Create Account' : 'Sign In')
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => {
                  const next = !isSignUp
                  setIsSignUp(next)
                  setError('')
                  setSuccess('')
                  setFormData({
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    role: 'user'
                  })
                  // Reflect mode in URL for deep linking
                  const targetMode = next ? 'signup' : 'signin'
                  router.replace(`/auth?mode=${targetMode}`)
                }}
                className="text-blue-600 hover:text-blue-800 font-semibold"
                disabled={isLoading}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>

          {/* Implementation Status */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="text-blue-600 mr-3">🔐</div>
              <div>
                <p className="text-sm text-blue-800 font-medium">
                  JWT Authentication Active
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Mock data storage - MongoDB integration ready for deployment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
