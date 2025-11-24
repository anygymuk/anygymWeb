import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { Subscription } from '@/lib/types'
import SubscriptionManager from '@/components/SubscriptionManager'
import DashboardLayout from '@/components/DashboardLayout'
import { StripeProduct } from '@/app/api/stripe/products/route'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE user_id = ${userId} 
      ORDER BY created_at DESC
      LIMIT 1
    `
    if (result.length === 0) return null
    
    const row = result[0]
    return {
      id: row.id,
      userId: row.user_id,
      tier: row.tier,
      monthlyLimit: row.monthly_limit,
      visitsUsed: row.visits_used,
      price: parseFloat(row.price),
      startDate: new Date(row.start_date),
      nextBillingDate: new Date(row.next_billing_date),
      status: row.status,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      guestPassesLimit: row.guest_passes_limit,
      guestPassesUsed: row.guest_passes_used,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as Subscription
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
}

async function getStripeProducts(): Promise<StripeProduct[]> {
  try {
    // Use internal API call - we need to make this work server-side
    // For server-side, we'll call the Stripe API directly
    const { stripe } = await import('@/lib/stripe')
    
    // Check if Stripe is properly configured
    const stripeKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      // Don't log environment variable names - could trigger secrets scanner
      console.error('[getStripeProducts] Stripe API key is not configured')
      return []
    }
    
    console.log('[getStripeProducts] Fetching products from Stripe...')
    // Don't log Stripe key even partially - could trigger secrets scanner
    
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    })

    console.log('[getStripeProducts] Found', products.data.length, 'active products')

    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
        })
        console.log(`[getStripeProducts] Product "${product.name}" has ${prices.data.length} prices`)
        return {
          ...product,
          prices: prices.data,
        }
      })
    )

    // Map products to our format (same logic as API route)
    const mappedProducts: StripeProduct[] = productsWithPrices.map((product) => {
      let tier = 'standard'
      let monthlyLimit = 8
      let icon = 'Zap'
      let color = 'from-blue-500 to-blue-600'
      let popular = false
      let guestPassesLimit = 0

      if (product.metadata?.tierGyms) {
        tier = product.metadata.tierGyms
      } else {
        const name = product.name.toLowerCase()
        if (name.includes('premium')) {
          tier = 'premium'
        } else if (name.includes('elite')) {
          tier = 'elite'
        }
      }

      switch (tier) {
        case 'premium':
          monthlyLimit = parseInt(product.metadata?.['Gym Passes'] || '20', 10)
          guestPassesLimit = parseInt(product.metadata?.['Guest Passes'] || '2', 10)
          icon = 'Star'
          color = 'from-green-500 to-green-600'
          popular = true
          break
        case 'elite':
          monthlyLimit = parseInt(product.metadata?.['Gym Passes'] || '30', 10)
          guestPassesLimit = parseInt(product.metadata?.['Guest Passes'] || '6', 10)
          icon = 'Crown'
          color = 'from-orange-500 to-orange-600'
          break
        default:
          monthlyLimit = parseInt(product.metadata?.['Gym Passes'] || '8', 10)
          guestPassesLimit = 0
          icon = 'Zap'
          color = 'from-blue-500 to-blue-600'
      }

      const recurringPrice = product.prices.find((p) => p.recurring?.interval === 'month')
      const price = recurringPrice ? (recurringPrice.unit_amount || 0) / 100 : 0
      
      // Log if product doesn't have a monthly price
      if (!recurringPrice) {
        console.warn(`[getStripeProducts] Product "${product.name}" (${product.id}) has no monthly recurring price`)
      }

      const features: string[] = []
      if (product.metadata?.Description) {
        features.push(product.metadata.Description)
      } else if (product.metadata?.description) {
        features.push(product.metadata.description)
      }
      if (product.metadata?.['Gym Passes']) {
        features.push(`${product.metadata['Gym Passes']} Gym Passes`)
      }
      if (tier === 'standard') {
        if (product.metadata?.app) {
          features.push(product.metadata.app)
        } else {
          features.push('App Access')
        }
      } else {
        if (product.metadata?.['Guest Passes']) {
          const guestPasses = parseInt(product.metadata['Guest Passes'], 10)
          if (guestPasses > 0) {
            features.push(`${guestPasses} Guest Passes`)
          }
        }
      }

      return {
        tier,
        name: product.name,
        price,
        monthlyLimit,
        guestPassesLimit,
        icon,
        color,
        popular,
        stripeProductId: product.id,
        stripePriceId: recurringPrice?.id,
        features,
        metadata: product.metadata || {},
      }
    })

    mappedProducts.sort((a, b) => a.price - b.price)
    console.log('[getStripeProducts] Mapped', mappedProducts.length, 'products:', mappedProducts.map(p => ({ name: p.name, tier: p.tier, price: p.price })))
    return mappedProducts
  } catch (error: any) {
    console.error('[getStripeProducts] Error fetching Stripe products:', error)
    console.error('[getStripeProducts] Error details:', {
      message: error?.message,
      stack: error?.stack,
      type: error?.constructor?.name,
    })
    return []
  }
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: { success?: string; canceled?: string }
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  const [subscription, products] = await Promise.all([
    getUserSubscription(userId),
    getStripeProducts(),
  ])

  // Get user initials for avatar
  const userName = session.user.name || session.user.email || 'User'
  const initials = userName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <DashboardLayout
      userName={userName}
      userInitials={initials}
      subscription={subscription}
    >
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="px-6 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            anygym Membership
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your current plan or switch to a new one.
          </p>
        </div>
        <div className="px-6 pb-6">
          {searchParams?.success && (
            <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-800 dark:text-green-200">
                ✅ Subscription successful! Your plan has been updated.
              </p>
            </div>
          )}
          {searchParams?.canceled && (
            <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-200">
                ⚠️ Checkout was canceled. No changes were made to your subscription.
              </p>
            </div>
          )}
          <SubscriptionManager subscription={subscription} products={products} />
        </div>
      </div>
    </DashboardLayout>
  )
}

