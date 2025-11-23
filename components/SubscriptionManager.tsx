'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Subscription } from '@/lib/types'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

interface SubscriptionManagerProps {
  subscription: Subscription | null
}

export default function SubscriptionManager({ subscription }: SubscriptionManagerProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubscribe = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
      })

      const { sessionId } = await response.json()
      const stripe = await stripePromise

      if (stripe) {
        await stripe.redirectToCheckout({ sessionId })
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      setLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
      })

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Error creating portal session:', error)
      setLoading(false)
    }
  }

  if (subscription && subscription.status === 'active') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Current Subscription
          </h2>
          <div className="space-y-2">
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Active
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Tier: {subscription.tier} | Next billing: {subscription.nextBillingDate.toLocaleDateString()}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Visits used: {subscription.visitsUsed} / {subscription.monthlyLimit}
            </p>
          </div>
        </div>
        <button
          onClick={handleManageSubscription}
          disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? 'Loading...' : 'Manage Subscription'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
        Subscribe to AnyGym
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Get unlimited access to gym passes. Generate passes for any gym in our network.
      </p>
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
          What's included:
        </h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
          <li>Unlimited gym pass generation</li>
          <li>Access to all partner gyms</li>
          <li>24-hour pass validity</li>
          <li>Easy pass management</li>
        </ul>
      </div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        {loading ? 'Processing...' : 'Subscribe Now'}
      </button>
    </div>
  )
}

