'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/components/Logo'
import { StripeProduct } from '@/app/api/stripe/products/route'
import { loadStripe, Stripe } from '@stripe/stripe-js'

// Lazy load Stripe - only initialize if key is available
const getStripePromise = (): Promise<Stripe | null> => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey || publishableKey.trim() === '') {
    console.error('Stripe publishable key is not configured')
    return Promise.resolve(null)
  }
  return loadStripe(publishableKey)
}

// Icon components
const ZapIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const StarIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
)

const CrownIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2-7.802L7.5 14h9l.5-5.802L13.5 12l-1.5-3-1.5 3L7 8.198z" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [products, setProducts] = useState<StripeProduct[]>([])
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [formData, setFormData] = useState({
    name: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    addressCity: '',
    addressPostcode: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
  })

  // Fetch products when component mounts
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/stripe/products')
        if (response.ok) {
          const data = await response.json()
          setProducts(data.products || [])
        } else {
          console.error('Failed to fetch products')
        }
      } catch (err) {
        console.error('Error fetching products:', err)
      } finally {
        setLoadingProducts(false)
      }
    }
    fetchProducts()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        setError('Please enter your name')
        return false
      }
      if (!formData.dateOfBirth) {
        setError('Please enter your date of birth')
        return false
      }
      // Validate date of birth (must be in the past and reasonable)
      const dob = new Date(formData.dateOfBirth)
      const today = new Date()
      if (dob >= today) {
        setError('Date of birth must be in the past')
        return false
      }
      const age = today.getFullYear() - dob.getFullYear()
      if (age < 13 || age > 120) {
        setError('Please enter a valid date of birth')
        return false
      }
    } else if (currentStep === 2) {
      if (!formData.addressLine1.trim()) {
        setError('Please enter your address line 1')
        return false
      }
      if (!formData.addressCity.trim()) {
        setError('Please enter your city')
        return false
      }
      if (!formData.addressPostcode.trim()) {
        setError('Please enter your postcode')
        return false
      }
    } else if (currentStep === 3) {
      if (!formData.emergencyContactName.trim()) {
        setError('Please enter emergency contact name')
        return false
      }
      if (!formData.emergencyContactNumber.trim()) {
        setError('Please enter emergency contact number')
        return false
      }
      // Basic phone validation
      const phoneRegex = /^[\d\s\-\+\(\)]+$/
      if (!phoneRegex.test(formData.emergencyContactNumber)) {
        setError('Please enter a valid phone number')
        return false
      }
    }
    setError(null)
    return true
  }

  const handleNext = async () => {
    if (!validateStep(step)) {
      return
    }

    // If moving from step 3 to step 4, save onboarding data first
    if (step === 3) {
      await handleSaveOnboarding()
    } else {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    setStep(step - 1)
    setError(null)
  }

  const handleSaveOnboarding = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save onboarding data')
      }

      // Move to subscription selection step
      setStep(4)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handleSelectSubscription = async (priceId: string | undefined) => {
    if (!priceId) {
      setError('Please select a subscription plan')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create checkout session: ${response.status}`)
      }

      const data = await response.json()
      const { sessionId } = data

      if (!sessionId) {
        throw new Error('No session ID returned from server')
      }

      const stripe = await getStripePromise()

      if (stripe) {
        const { error } = await stripe.redirectToCheckout({ sessionId })
        
        if (error) {
          throw new Error(error.message || 'Failed to redirect to checkout')
        }
      } else {
        throw new Error('Stripe is not initialized. Please check your Stripe configuration.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handleSkipSubscription = async () => {
    // Save onboarding and redirect to dashboard
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          skipSubscription: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save onboarding data')
      }

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Star':
        return <StarIcon />
      case 'Crown':
        return <CrownIcon />
      default:
        return <ZapIcon />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
        <Logo />
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Step {step} of 4
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Math.round((step / 4) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-[#FF6B6B] h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <div className={`w-full ${step === 4 ? 'max-w-6xl' : 'max-w-2xl'}`}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {step === 1 && 'Welcome! Let\'s get started'}
              {step === 2 && 'Your Address'}
              {step === 3 && 'Emergency Contact'}
              {step === 4 && 'Choose Your Plan'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {step === 1 && 'We need some basic information to set up your account'}
              {step === 2 && 'Please provide your address'}
              {step === 3 && 'Please provide an emergency contact'}
              {step === 4 && 'Select a subscription plan to get started'}
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Step 1: Name and Date of Birth */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    id="dateOfBirth"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    required
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            )}

            {/* Step 2: Address */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <label htmlFor="addressLine1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Address Line 1 *
                  </label>
                  <input
                    type="text"
                    id="addressLine1"
                    name="addressLine1"
                    value={formData.addressLine1}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Street address, house number"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="addressLine2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    id="addressLine2"
                    name="addressLine2"
                    value={formData.addressLine2}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Apartment, suite, unit, etc. (optional)"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="addressCity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      City *
                    </label>
                    <input
                      type="text"
                      id="addressCity"
                      name="addressCity"
                      value={formData.addressCity}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                      placeholder="City"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="addressPostcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Postcode *
                    </label>
                    <input
                      type="text"
                      id="addressPostcode"
                      name="addressPostcode"
                      value={formData.addressPostcode}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                      placeholder="Postcode"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Emergency Contact */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <label htmlFor="emergencyContactName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Emergency Contact Name *
                  </label>
                  <input
                    type="text"
                    id="emergencyContactName"
                    name="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Enter emergency contact name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="emergencyContactNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Emergency Contact Number *
                  </label>
                  <input
                    type="tel"
                    id="emergencyContactNumber"
                    name="emergencyContactNumber"
                    value={formData.emergencyContactNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="Enter emergency contact number"
                    required
                  />
                </div>
              </div>
            )}

            {/* Step 4: Subscription Selection */}
            {step === 4 && (
              <div className="space-y-8">
                {loadingProducts ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600 dark:text-gray-400">Loading subscription plans...</p>
                  </div>
                ) : !products || products.length === 0 ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                    <p className="text-yellow-800 dark:text-yellow-200">
                      No subscription plans are currently available. Please contact support.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    {products.map((product) => {
                      const IconComponent = getIcon(product.icon)
                      const isSelected = selectedPriceId === product.stripePriceId

                      return (
                        <div
                          key={product.stripeProductId}
                          className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border-2 cursor-pointer transition-all transform hover:scale-105 ${
                            isSelected
                              ? 'border-[#FF6B6B] ring-4 ring-[#FF6B6B] ring-opacity-20 scale-105'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                          onClick={() => setSelectedPriceId(product.stripePriceId || null)}
                        >
                          {product.popular && (
                            <div className="text-center mb-4">
                              <span className="inline-block px-4 py-1.5 text-sm font-semibold rounded-full bg-[#FF6B6B] text-white">
                                Most Popular
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-center mb-6">
                            <div
                              className={`w-16 h-16 rounded-full bg-gradient-to-r ${product.color} flex items-center justify-center text-white shadow-lg`}
                            >
                              {IconComponent}
                            </div>
                          </div>
                          <h3 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
                            {product.name}
                          </h3>
                          <div className="text-center mb-6">
                            <span className="text-4xl font-bold text-gray-900 dark:text-white">
                              £{product.price.toFixed(2)}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400 text-lg">/month</span>
                          </div>
                          <ul className="space-y-4 mb-8 min-h-[120px]">
                            {product.features.map((feature, index) => (
                              <li key={index} className="flex items-start">
                                <span className="text-green-500 mr-3 flex-shrink-0 mt-0.5">
                                  <CheckIcon />
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-8 flex gap-4">
              {step > 1 && step < 4 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              )}

              {step < 3 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Continue'}
                </button>
              )}

              {step === 4 && (
                <div className="flex-1 flex gap-4">
                  <button
                    type="button"
                    onClick={handleSkipSubscription}
                    disabled={loading}
                    className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Skip for Now
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSubscription(selectedPriceId || undefined)}
                    disabled={loading || !selectedPriceId}
                    className="flex-1 px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Continue to Checkout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

