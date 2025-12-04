'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Subscription } from '@/lib/types'
import { loadStripe, Stripe } from '@stripe/stripe-js'
import { StripeProduct } from '@/app/api/stripe/products/route'

// Lazy load Stripe - only initialize if key is available
const getStripePromise = (): Promise<Stripe | null> => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey || publishableKey.trim() === '') {
    // Don't log environment variable names - could trigger secrets scanner
    console.error('Stripe publishable key is not configured')
    return Promise.resolve(null)
  }
  return loadStripe(publishableKey)
}

interface SubscriptionManagerProps {
  subscription: Subscription | null
  products: StripeProduct[]
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

export default function SubscriptionManager({ subscription, products }: SubscriptionManagerProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  // Debug logging - force all logs to appear
  useEffect(() => {
    // Force console output even if subscription is null
    console.log('==========================================')
    console.log('[SubscriptionManager] DEBUG START')
    console.log('==========================================')
    
    // Log subscription with explicit null check
    if (subscription === null) {
      console.log('[SubscriptionManager] ❌ SUBSCRIPTION IS NULL')
    } else if (subscription === undefined) {
      console.log('[SubscriptionManager] ❌ SUBSCRIPTION IS UNDEFINED')
    } else {
      console.log('[SubscriptionManager] ✅ SUBSCRIPTION EXISTS')
      console.log('[SubscriptionManager] Subscription prop:', subscription)
      console.log('[SubscriptionManager] Subscription type:', typeof subscription)
      console.log('[SubscriptionManager] Subscription tier:', subscription?.tier)
      console.log('[SubscriptionManager] Subscription monthlyLimit:', subscription?.monthlyLimit)
      console.log('[SubscriptionManager] Subscription visitsUsed:', subscription?.visitsUsed)
    }
    
    console.log('[SubscriptionManager] Products count:', products?.length || 0)
    console.log('==========================================')
    console.log('[SubscriptionManager] DEBUG END')
    console.log('==========================================')
  }, [subscription, products])

  const handleSwitchPlan = async (priceId: string | undefined) => {
    if (!priceId) {
      console.error('[SubscriptionManager] No price ID provided')
      alert('Unable to switch plan: No price ID available. Please try again or contact support.')
      return
    }

    console.log('[SubscriptionManager] Initiating checkout for price:', priceId)
    setLoading(priceId)
    
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

      console.log('[SubscriptionManager] Checkout session created:', sessionId)
      const stripe = await getStripePromise()

      if (stripe) {
        console.log('[SubscriptionManager] Redirecting to Stripe checkout...')
        const { error } = await stripe.redirectToCheckout({ sessionId })
        
        if (error) {
          throw new Error(error.message || 'Failed to redirect to checkout')
        }
      } else {
        throw new Error('Stripe is not initialized. Please check your Stripe configuration.')
      }
    } catch (error: any) {
      console.error('[SubscriptionManager] Error switching plan:', error)
      alert(`Error: ${error.message || 'Failed to initiate checkout. Please try again.'}`)
      setLoading(null)
    }
  }

  const handleCancelMembership = async () => {
    if (!confirm('Are you sure you want to cancel your membership?')) {
      return
    }

    setLoading('cancel')
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to create portal session')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Error canceling membership:', error)
      setLoading(null)
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

  const getTierDisplayName = (tier: string) => {
    if (!tier) {
      console.warn('[SubscriptionManager] getTierDisplayName called with empty tier')
      return 'Standard'
    }
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()
  }

  // Safe serialization helper (handles Date objects that become strings in Next.js)
  const safeStringify = (obj: any): string => {
    try {
      if (obj === null) return 'null'
      if (obj === undefined) return 'undefined'
      return JSON.stringify(obj, (key, value) => {
        // Date objects are already strings when passed from server
        if (value instanceof Date) {
          return value.toISOString()
        }
        return value
      }, 2)
    } catch (error) {
      return `[Error serializing: ${error}]`
    }
  }

  const currentTier = subscription?.tier?.toLowerCase() || null
  const nextBillingDate = subscription?.nextBillingDate
    ? new Date(subscription.nextBillingDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <div className="space-y-8">
      {/* Current Plan Section */}
      {subscription && subscription.status === 'active' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Your Current Plan
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                You have an active <span className="font-semibold">{getTierDisplayName(subscription.tier)}</span> membership.
                {nextBillingDate && (
                  <span> Your next billing date is on {nextBillingDate}.</span>
                )}
              </p>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {getTierDisplayName(subscription.tier)}
            </span>
          </div>
          <button
            onClick={handleCancelMembership}
            disabled={loading === 'cancel'}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading === 'cancel' ? 'Loading...' : 'Cancel Membership'}
          </button>
        </div>
      )}

      {/* Switch Plan Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Switch Your Plan
        </h2>
        {!products || products.length === 0 ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <p className="text-yellow-800 dark:text-yellow-200">
              No subscription plans are currently available. Please check your Stripe configuration or contact support.
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-2">
              Make sure you have active products with monthly recurring prices in your Stripe dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {products.map((product) => {
            const isCurrentPlan = currentTier === product.tier.toLowerCase()
            const IconComponent = getIcon(product.icon)

            return (
              <div
                key={product.stripeProductId}
                className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-2 ${
                  isCurrentPlan
                    ? 'border-green-500 dark:border-green-600'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-center mb-4">
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-r ${product.color} flex items-center justify-center text-white`}
                  >
                    {IconComponent}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
                  {product.name}
                </h3>
                <div className="text-center mb-4">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    £{product.price.toFixed(2)}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-green-500 mr-2 flex-shrink-0 mt-0.5">
                        <CheckIcon />
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                {isCurrentPlan ? (
                  <button
                    disabled
                    className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg cursor-not-allowed font-medium"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleSwitchPlan(product.stripePriceId)}
                    disabled={loading === product.stripePriceId || !product.stripePriceId}
                    className={`w-full px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      product.tier === 'premium'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : product.tier === 'elite'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {loading === product.stripePriceId
                      ? 'Loading...'
                      : `Switch to this Plan`}
                  </button>
                )}
              </div>
            )
          })}
          </div>
        )}
      </div>
    </div>
  )
}
