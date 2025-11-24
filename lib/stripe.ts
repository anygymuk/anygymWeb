import Stripe from 'stripe'

// Only initialize if STRIPE_API_KEY or STRIPE_SECRET_KEY is available (avoids build-time errors)
const getStripeInstance = (): Stripe => {
  // Support both STRIPE_API_KEY and STRIPE_SECRET_KEY for compatibility
  const stripeSecretKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY
  
  if (!stripeSecretKey) {
    throw new Error('STRIPE_API_KEY or STRIPE_SECRET_KEY environment variable is not set')
  }
  return new Stripe(stripeSecretKey, {
    apiVersion: '2024-11-20.acacia' as any,
    typescript: true,
  })
}

// Lazy getter function - only creates instance when accessed
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const instance = getStripeInstance()
    const value = (instance as any)[prop]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

