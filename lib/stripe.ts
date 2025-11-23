import Stripe from 'stripe'

// Only initialize if STRIPE_SECRET_KEY is available (avoids build-time errors)
const getStripeInstance = (): Stripe => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
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

