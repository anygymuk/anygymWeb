import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { Subscription } from '@/lib/types'
import SubscriptionManager from '@/components/SubscriptionManager'
import { StripeProduct } from '@/app/api/stripe/products/route'
import ProfileTabs from '@/components/ProfileTabs'
import { getOrCreateAppUser } from '@/lib/user'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

async function getUserData(auth0Id: string, fallbackEmail?: string, fallbackName?: string): Promise<string> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const response = await fetch('https://api.any-gym.com/user', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })
    
    if (response.ok) {
      const userData = await response.json()
      // Extract name only
      return userData.full_name || userData.name || fallbackName || fallbackEmail || 'User'
    }
  } catch (error) {
    console.error('[getUserData] Error fetching user data:', error)
  }
  
  // Fallback to Auth0 session data if API fails
  return fallbackName || fallbackEmail || 'User'
}

async function getUserSubscription(auth0Id: string): Promise<Subscription | null> {
  console.log('[getUserSubscription] ===== FUNCTION CALLED =====')
  console.log('[getUserSubscription] auth0Id:', auth0Id)
  
  try {
    const trimmedAuth0Id = auth0Id.trim()
    console.log('[getUserSubscription] Making API request to api.any-gym.com/user/subscription')
    console.log('[getUserSubscription] With header auth0_id:', trimmedAuth0Id)
    
    const response = await fetch('https://api.any-gym.com/user/subscription', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })
    
    console.log('[getUserSubscription] API response status:', response.status, response.statusText)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[getUserSubscription] ❌ 404 - Subscription not found, returning null')
        return null
      }
      const errorText = await response.text()
      console.error('[getUserSubscription] ❌ API Error:', response.status, errorText)
      throw new Error(`Failed to fetch subscription: ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('[getUserSubscription] ✅ API Response received')
    console.log('[getUserSubscription] Response keys:', Object.keys(data))
    
    // Handle nested subscription object in API response
    const subscriptionData = data.subscription || data
    console.log('[getUserSubscription] subscriptionData keys:', Object.keys(subscriptionData))
    console.log('[getUserSubscription] subscriptionData.tier:', subscriptionData.tier, 'type:', typeof subscriptionData.tier)
    
    // Parse next_billing_date
    let nextBillingDate: Date
    if (subscriptionData.next_billing_date) {
      const billingDateStr = subscriptionData.next_billing_date
      if (/^\d{4}-\d{2}-\d{2}$/.test(billingDateStr)) {
        nextBillingDate = new Date(billingDateStr + 'T23:59:59.999Z')
      } else {
        nextBillingDate = new Date(billingDateStr)
      }
    } else {
      nextBillingDate = subscriptionData.current_period_end 
        ? new Date(subscriptionData.current_period_end)
        : new Date()
    }
    
    // Map API response to Subscription type
    const tierValue = subscriptionData.tier
    const tier = (tierValue && typeof tierValue === 'string' && tierValue.trim()) ? tierValue : 'standard'
    console.log('[getUserSubscription] Final tier value:', tier)
    
    // Create subscription object - ensure all Date objects are properly serializable
    const mappedSubscription: Subscription = {
      id: subscriptionData.id || 0,
      userId: subscriptionData.user_id || auth0Id,
      tier: tier,
      monthlyLimit: subscriptionData.monthly_limit != null ? Number(subscriptionData.monthly_limit) : 0,
      visitsUsed: subscriptionData.visits_used != null ? Number(subscriptionData.visits_used) : 0,
      price: subscriptionData.price != null ? parseFloat(subscriptionData.price) : 0,
      startDate: subscriptionData.start_date 
        ? new Date(subscriptionData.start_date)
        : (subscriptionData.current_period_start ? new Date(subscriptionData.current_period_start) : new Date()),
      nextBillingDate: nextBillingDate,
      currentPeriodStart: subscriptionData.current_period_start ? new Date(subscriptionData.current_period_start) : new Date(),
      currentPeriodEnd: subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end) : new Date(),
      status: subscriptionData.status || 'active',
      stripeSubscriptionId: subscriptionData.stripe_subscription_id || undefined,
      stripeCustomerId: subscriptionData.stripe_customer_id || undefined,
      guestPassesLimit: subscriptionData.guest_passes_limit != null ? Number(subscriptionData.guest_passes_limit) : 0,
      guestPassesUsed: subscriptionData.guest_passes_used != null ? Number(subscriptionData.guest_passes_used) : 0,
      createdAt: subscriptionData.created_at 
        ? new Date(subscriptionData.created_at)
        : (subscriptionData.current_period_start ? new Date(subscriptionData.current_period_start) : new Date()),
      updatedAt: subscriptionData.updated_at 
        ? new Date(subscriptionData.updated_at)
        : (subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end) : new Date()),
    }
    
    console.log('[getUserSubscription] ✅ Mapped subscription object created')
    console.log('[getUserSubscription] Tier:', mappedSubscription.tier, '(type:', typeof mappedSubscription.tier, ')')
    console.log('[getUserSubscription] MonthlyLimit:', mappedSubscription.monthlyLimit)
    console.log('[getUserSubscription] VisitsUsed:', mappedSubscription.visitsUsed)
    
    // Verify subscription is not null before returning
    if (!mappedSubscription) {
      console.error('[getUserSubscription] ❌ ERROR: mappedSubscription is null/undefined!')
      return null
    }
    
    return mappedSubscription
  } catch (error) {
    console.error('[getUserSubscription] Error fetching subscription:', error)
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

  const auth0Id = session.user.sub
  
  // Check onboarding status - redirect if not completed
  const { needsOnboarding } = await getOrCreateAppUser(
    auth0Id,
    session.user.email,
    session.user.name
  )
  
  if (needsOnboarding) {
    redirect('/onboarding')
  }
  
  // Fetch user name, subscription, and products from API in parallel
  console.log('[ProfilePage] ===== FETCHING DATA =====')
  console.log('[ProfilePage] auth0Id:', auth0Id)
  
  const [userName, subscription, products] = await Promise.all([
    getUserData(auth0Id, session.user.email, session.user.name),
    getUserSubscription(auth0Id),
    getStripeProducts(),
  ])
  
  console.log('[ProfilePage] ✅ All data fetched')
  console.log('[ProfilePage] userName:', userName)
  console.log('[ProfilePage] subscription:', subscription ? 'EXISTS' : 'NULL')
  console.log('[ProfilePage] products count:', products?.length || 0)

  // Log subscription data being passed to components
  console.log('==========================================')
  console.log('[ProfilePage] SERVER-SIDE SUBSCRIPTION DEBUG')
  console.log('==========================================')
  if (subscription === null) {
    console.log('[ProfilePage] ❌ SUBSCRIPTION IS NULL')
  } else if (subscription === undefined) {
    console.log('[ProfilePage] ❌ SUBSCRIPTION IS UNDEFINED')
  } else {
    console.log('[ProfilePage] ✅ SUBSCRIPTION EXISTS')
    console.log('[ProfilePage] Subscription tier:', subscription.tier)
    console.log('[ProfilePage] Subscription monthlyLimit:', subscription.monthlyLimit)
    console.log('[ProfilePage] Subscription visitsUsed:', subscription.visitsUsed)
    console.log('[ProfilePage] Subscription status:', subscription.status)
  }
  console.log('==========================================')

  // Get user initials for avatar
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

