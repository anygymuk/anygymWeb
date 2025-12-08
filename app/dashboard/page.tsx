import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { Subscription, Gym } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import GymMapView from '@/components/GymMapView'
import { getOrCreateAppUser } from '@/lib/user'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'


interface UserData {
  name: string
  subscription: Subscription | null
}

async function getUserData(auth0Id: string, fallbackEmail?: string, fallbackName?: string): Promise<UserData> {
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
      
      // Extract name
      const userName = userData.full_name || userData.name || fallbackName || fallbackEmail || 'User'
      
      // Extract membership from user response
      let subscription: Subscription | null = null
      if (userData.membership) {
        const membershipData = userData.membership
        
        // Parse next_billing_date
        let nextBillingDate: Date
        if (membershipData.next_billing_date) {
          const billingDateStr = membershipData.next_billing_date
          if (/^\d{4}-\d{2}-\d{2}$/.test(billingDateStr)) {
            nextBillingDate = new Date(billingDateStr + 'T23:59:59.999Z')
          } else {
            nextBillingDate = new Date(billingDateStr)
          }
        } else {
          nextBillingDate = membershipData.current_period_end 
            ? new Date(membershipData.current_period_end)
            : new Date()
        }
        
        // Map membership to Subscription type
        // Only default to 'standard' if tier is explicitly null/undefined/empty, not if it's a valid string
        const tierValue = membershipData.tier
        const tier = (tierValue && typeof tierValue === 'string' && tierValue.trim()) ? tierValue : 'standard'
        
        subscription = {
          id: membershipData.id || 0,
          userId: membershipData.user_id || auth0Id,
          tier: tier,
          monthlyLimit: membershipData.monthly_limit != null ? Number(membershipData.monthly_limit) : 0,
          visitsUsed: membershipData.visits_used != null ? Number(membershipData.visits_used) : 0,
          price: membershipData.price != null ? parseFloat(membershipData.price) : 0,
          startDate: membershipData.start_date 
            ? new Date(membershipData.start_date)
            : (membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date()),
          nextBillingDate: nextBillingDate,
          currentPeriodStart: membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date(),
          currentPeriodEnd: membershipData.current_period_end ? new Date(membershipData.current_period_end) : new Date(),
          status: membershipData.status || 'active',
          stripeSubscriptionId: membershipData.stripe_subscription_id || undefined,
          stripeCustomerId: membershipData.stripe_customer_id || undefined,
          guestPassesLimit: membershipData.guest_passes_limit != null ? Number(membershipData.guest_passes_limit) : 0,
          guestPassesUsed: membershipData.guest_passes_used != null ? Number(membershipData.guest_passes_used) : 0,
          createdAt: membershipData.created_at 
            ? new Date(membershipData.created_at)
            : (membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date()),
          updatedAt: membershipData.updated_at 
            ? new Date(membershipData.updated_at)
            : (membershipData.current_period_end ? new Date(membershipData.current_period_end) : new Date()),
        } as Subscription
      }
      
      return { name: userName, subscription }
    }
  } catch (error) {
    console.error('[getUserData] Error fetching user data:', error)
  }
  
  // Fallback to Auth0 session data if API fails
  return {
    name: fallbackName || fallbackEmail || 'User',
    subscription: null,
  }
}

async function getAllGyms(): Promise<Gym[]> {
  try {
    const response = await fetch('https://api.any-gym.com/gyms', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch gyms: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Map API response to Gym type
    return data
      .filter((gym: any) => gym.latitude != null && gym.longitude != null)
      .map((gym: any) => ({
        id: gym.id,
        name: gym.name,
        address: gym.address || '',
        city: gym.city || '',
        postcode: gym.postcode || '',
        phone: gym.phone || undefined,
        latitude: gym.latitude ? parseFloat(gym.latitude) : undefined,
        longitude: gym.longitude ? parseFloat(gym.longitude) : undefined,
        gym_chain_id: gym.gym_chain_id || undefined,
        required_tier: gym.required_tier || 'standard',
        amenities: gym.amenities || [],
        opening_hours: gym.opening_hours || {},
        image_url: gym.image_url || undefined,
        rating: undefined, // Not provided by API
        status: 'active', // Default to active
        createdAt: new Date(), // Default to current date
        updatedAt: new Date(), // Default to current date
      })) as Gym[]
  } catch (error) {
    console.error('Error fetching gyms:', error)
    return []
  }
}

async function getGymChains(auth0Id: string) {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const response = await fetch('https://api.any-gym.com/chains', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 3600 } // Cache for 1 hour (chains don't change often)
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chains: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Ensure the response is an array and map to expected format
    // API should return array of chains with id and name properties
    const chains = Array.isArray(data) ? data : (data.chains || [])
    
    // Sort by name to match previous behavior
    return chains.sort((a: any, b: any) => {
      const nameA = a.name || ''
      const nameB = b.name || ''
      return nameA.localeCompare(nameB)
    })
  } catch (error) {
    console.error('Error fetching chains:', error)
    return []
  }
}

export default async function Dashboard() {
  try {
    const session = await getSession()

    if (!session?.user) {
      redirect('/api/auth/login')
    }

    const auth0Id = session.user.sub
    
    // Check onboarding status - redirect if not completed
    // This also creates the user if they don't exist
    const { needsOnboarding, user } = await getOrCreateAppUser(
      auth0Id,
      session.user.email,
      session.user.name
    )
    
    if (!user) {
      console.error('[Dashboard] Failed to get or create user')
      throw new Error('Failed to create user account')
    }
    
    console.log('[Dashboard] User check complete - needsOnboarding:', needsOnboarding, 'auth0_id:', user.auth0_id)
    
    if (needsOnboarding) {
      console.log('[Dashboard] Redirecting to onboarding')
      redirect('/onboarding')
    }
    
    // Fetch data in parallel with error handling
    // getUserData fetches both name and membership from /user endpoint
    const [userData, gyms, chains] = await Promise.allSettled([
      getUserData(auth0Id, session.user.email, session.user.name),
      getAllGyms(),
      getGymChains(auth0Id),
    ])

    const userDataResult = userData.status === 'fulfilled' ? userData.value : { name: session.user.name || session.user.email || 'User', subscription: null }
    const subscriptionResult = userDataResult.subscription
    const gymsResult = gyms.status === 'fulfilled' ? gyms.value : []
    const chainsResult = chains.status === 'fulfilled' ? chains.value : []
    const userNameResult = userDataResult.name

    if (userData.status === 'rejected') {
      console.error('Error fetching user data:', userData.reason)
    }
    if (gyms.status === 'rejected') {
      console.error('Error fetching gyms:', gyms.reason)
    }
    if (chains.status === 'rejected') {
      console.error('Error fetching chains:', chains.reason)
    }

    // Get user initials for avatar
    const userNameDisplay = userNameResult
    const initials = userNameDisplay
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    return (
      <DashboardLayout
        userName={userNameDisplay}
        userInitials={initials}
        subscription={subscriptionResult}
      >
        <div className="flex-1 flex flex-col h-full min-h-0">
          <div className="px-4 sm:px-6 py-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Find Your Gym
            </h1>
          </div>
          <div className="flex-1 min-h-0">
            <GymMapView 
              initialGyms={gymsResult} 
              chains={chainsResult}
              hasSubscription={!!subscriptionResult}
            />
          </div>
        </div>
      </DashboardLayout>
    )
  } catch (error: any) {
    // Don't catch NEXT_REDIRECT errors - they need to propagate for Next.js redirects
    if (error?.message === 'NEXT_REDIRECT' || error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    
    console.error('Error loading dashboard:', error)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Error Loading Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }
}
