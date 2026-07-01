'use client'

import { loadStripe } from '@stripe/stripe-js'

const getStripePromise = () => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey?.trim()) {
    return Promise.resolve(null)
  }
  return loadStripe(publishableKey)
}

export async function redirectToPassCheckout(gymId: number): Promise<void> {
  const response = await fetch('/api/stripe/create-pass-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gymId }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to start pass purchase')
  }

  if (data.url) {
    window.location.href = data.url
    return
  }

  if (data.sessionId) {
    const stripe = await getStripePromise()
    if (!stripe) {
      throw new Error('Stripe is not configured')
    }
    const { error } = await stripe.redirectToCheckout({
      sessionId: data.sessionId,
    })
    if (error) {
      throw new Error(error.message || 'Failed to redirect to checkout')
    }
    return
  }

  throw new Error('No checkout session returned from server')
}
