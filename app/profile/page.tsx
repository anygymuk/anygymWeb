import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { sql } from '@/lib/db'
import { Subscription } from '@/lib/types'
import SubscriptionManager from '@/components/SubscriptionManager'
import { StripeProduct } from '@/app/api/stripe/products/route'
import ProfileTabs from '@/components/ProfileTabs'
import { getOrCreateAppUser } from '@/lib/user'

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
    const { stripe } = await import('@/lib/stripe')
    
    const stripeKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      console.error('[getStripeProducts] Stripe API key is not configured')
      return []
    }
    
    console.log('[getStripeProducts] Fetching products from Stripe...')
    
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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: { success?: string; canceled?: string; tab?: string }
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  
  // Check onboarding status - redirect if not completed
  const { needsOnboarding } = await getOrCreateAppUser(
    userId,
    session.user.email,
    session.user.name
  )
  
  if (needsOnboarding) {
    redirect('/onboarding')
  }
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
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        <div className="px-4 sm:px-6 py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Profile
          </h1>
          
          <ProfileTabs
            userEmail={session.user.email || ''}
            userName={userName}
            userInitials={initials}
            subscription={subscription}
            products={products}
            searchParams={searchParams}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}

