import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { GymPass, Subscription } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import PassesView from '@/components/PassesView'
import AccountSetupError from '@/components/AccountSetupError'
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


// Helper function to fetch all passes from API
// This endpoint also returns subscription data, so we return both passes and subscription
async function fetchUserPassesFromAPI(auth0Id: string): Promise<{ passes: GymPass[], subscription: any }> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    console.log('[fetchUserPassesFromAPI] Making request with auth0_id header:', trimmedAuth0Id)
    
    const response = await fetch('https://api.any-gym.com/user/passes', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })
    
    console.log('[fetchUserPassesFromAPI] Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[fetchUserPassesFromAPI] No passes found (404)')
        return { passes: [], subscription: null }
      }
      throw new Error(`Failed to fetch passes: ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('[fetchUserPassesFromAPI] API response keys:', Object.keys(data))
    console.log('[fetchUserPassesFromAPI] Subscription in response:', data.subscription)
    
    // Extract subscription from response if available
    const subscriptionData = data.subscription || null
    
    // Handle both array and object with passes property
    // API returns: { "subscription": {...}, "active_passes": [...], "pass_history": [...] }
    // Combine active_passes and pass_history into one array
    const passesData = Array.isArray(data) 
      ? data 
      : [
          ...(data.active_passes || []),
          ...(data.pass_history || []),
          ...(data.passes || [])
        ]
    
    console.log('[fetchUserPassesFromAPI] Total passes found:', passesData.length)
    
    // Map API response to GymPass type
    // API structure: passes have gym_name, gym_id, gym_chain_id, gym_chain_name, gym_chain_logo directly on the object
    const mappedPasses = passesData.map((pass: any) => {
      // Map gym data - API has gym_name directly on pass object, not nested
      let gymData = pass.gym
      
      // If no nested gym object, create one from flat pass data
      if (!gymData && pass.gym_name) {
        gymData = {
          id: pass.gym_id,
          name: pass.gym_name, // Use gym_name directly from pass object
          address: '',
          city: '',
          postcode: '',
          phone: undefined,
          latitude: undefined,
          longitude: undefined,
          gym_chain_id: pass.gym_chain_id,
          required_tier: 'standard',
          amenities: [],
          opening_hours: {},
          image_url: undefined,
          rating: undefined,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      } else if (pass.gym) {
        // If nested gym object exists, use it
        gymData = {
          id: pass.gym.id,
          name: pass.gym.name,
          address: pass.gym.address || '',
          city: pass.gym.city || '',
          postcode: pass.gym.postcode || '',
          phone: pass.gym.phone,
          latitude: pass.gym.latitude ? parseFloat(pass.gym.latitude) : undefined,
          longitude: pass.gym.longitude ? parseFloat(pass.gym.longitude) : undefined,
          gym_chain_id: pass.gym.gym_chain_id,
          required_tier: pass.gym.required_tier || 'standard',
          amenities: pass.gym.amenities || [],
          opening_hours: pass.gym.opening_hours || {},
          image_url: pass.gym.image_url,
          rating: pass.gym.rating,
          status: pass.gym.status || 'active',
          createdAt: pass.gym.created_at ? new Date(pass.gym.created_at) : new Date(),
          updatedAt: pass.gym.updated_at ? new Date(pass.gym.updated_at) : new Date(),
        }
      }
      
      return {
        id: pass.id,
        userId: pass.user_id || pass.auth0_id || auth0Id,
        gymId: pass.gym_id,
        passCode: pass.pass_code || pass.passCode || '',
        status: pass.status || 'active',
        validUntil: pass.valid_until ? new Date(pass.valid_until) : pass.validUntil ? new Date(pass.validUntil) : new Date(),
        usedAt: pass.used_at ? new Date(pass.used_at) : pass.usedAt ? new Date(pass.usedAt) : undefined,
        qrCodeUrl: pass.qrcode_url || pass.qr_code_url || pass.qrCodeUrl, // API uses qrcode_url
        subscriptionTier: pass.subscription_tier || pass.subscriptionTier,
        passCost: pass.pass_cost ? parseFloat(pass.pass_cost) : pass.passCost,
        createdAt: pass.created_at ? new Date(pass.created_at) : pass.createdAt ? new Date(pass.createdAt) : new Date(),
        updatedAt: pass.updated_at ? new Date(pass.updated_at) : pass.updatedAt ? new Date(pass.updatedAt) : new Date(),
        gym: gymData,
      } as GymPass
    })
    
    return { passes: mappedPasses, subscription: subscriptionData }
  } catch (error) {
    console.error('[fetchUserPassesFromAPI] Error fetching passes:', error)
    return { passes: [], subscription: null }
  }
}

async function getActivePasses(auth0Id?: string): Promise<GymPass[]> {
  try {
    if (!auth0Id) {
      console.log('[getActivePasses] No auth0Id provided')
      return []
    }

    console.log('[getActivePasses] Fetching active passes for auth0Id:', auth0Id)
    
    // Fetch all passes from API (this also returns subscription data)
    const { passes: allPasses } = await fetchUserPassesFromAPI(auth0Id)
    
    // Filter for active passes (status is 'active' and valid_until is in the future)
    const now = new Date()
    const activePasses = allPasses.filter((pass) => {
      const isValid = pass.status === 'active' && pass.validUntil > now
      return isValid
    })
    
    console.log('[getActivePasses] Total passes:', allPasses.length, 'Active passes:', activePasses.length)
    
    // Sort by created date (most recent first)
    activePasses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    
    return activePasses
  } catch (error) {
    console.error('[getActivePasses] Error fetching active passes:', error)
      return []
  }
}


async function getAllUserPasses(auth0Id?: string) {
  try {
    if (!auth0Id) {
      console.log('[getAllUserPasses] No auth0Id provided')
    return []
    }

    console.log('[getAllUserPasses] Fetching all passes for auth0Id:', auth0Id)
    
    // Fetch all passes from API (this also returns subscription data)
    const { passes: allPasses } = await fetchUserPassesFromAPI(auth0Id)
    
    console.log('[getAllUserPasses] Total passes:', allPasses.length)
    
    // Sort by created date (most recent first)
    allPasses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    
    return allPasses
  } catch (error) {
    console.error('[getAllUserPasses] Error fetching all user passes:', error)
    return []
  }
}

async function getPassHistory(auth0Id?: string) {
  try {
    if (!auth0Id) {
      console.log('[getPassHistory] No auth0Id provided')
      return []
    }
    
    console.log('[getPassHistory] Fetching pass history for auth0Id:', auth0Id)
    
    // Fetch all passes from API (this also returns subscription data)
    // We need to also get raw pass data to access gym_chain_name and gym_chain_logo
    const response = await fetch('https://api.any-gym.com/user/passes', {
      headers: {
        'auth0_id': auth0Id.trim(),
      },
      next: { revalidate: 60 }
    })
    
    if (!response.ok) {
      console.log('[getPassHistory] Failed to fetch passes')
    return []
    }
    
    const rawData = await response.json()
    const rawPassHistory = rawData.pass_history || []
    const rawPassMap = new Map(rawPassHistory.map((p: any) => [p.id, p]))
    
    // Get mapped passes
    const { passes: allPasses } = await fetchUserPassesFromAPI(auth0Id)
    
    // Filter for historical passes (expired or used)
    const now = new Date()
    const historyPasses = allPasses.filter((pass) => {
      const isExpired = pass.validUntil < now
      const isUsed = pass.status === 'used'
      const isExpiredStatus = pass.status === 'expired'
      return isExpired || isUsed || isExpiredStatus
    })
    
    console.log('[getPassHistory] Total passes:', allPasses.length, 'History passes:', historyPasses.length)
    
    // Group passes by gym
    const grouped: Record<number, any> = {}
    
    historyPasses.forEach((pass) => {
      const gymId = pass.gymId
      if (!gymId) {
        return // Skip if no gym_id
      }
      
      if (!grouped[gymId]) {
        // Extract chain info from raw API pass data - API includes gym_chain_name and gym_chain_logo directly on pass
        const rawPass: any = rawPassMap.get(pass.id)
        const chainId = rawPass?.gym_chain_id || pass.gym?.gym_chain_id
        const chainName = rawPass?.gym_chain_name || pass.gym?.name
        const chainLogo = rawPass?.gym_chain_logo // Chain logo only comes from raw API pass data
        
        grouped[gymId] = {
          gym: pass.gym || {
            id: gymId,
            name: rawPass?.gym_name || 'Unknown Gym',
            gym_chain_id: chainId,
          },
          chain: chainId && chainName ? {
            id: chainId,
            name: chainName,
            logo_url: chainLogo,
          } : null,
          passes: [],
        }
      }
      
      const passData = {
        id: pass.id,
        createdAt: pass.createdAt,
        usedAt: pass.usedAt || null,
        status: pass.status,
        subscriptionTier: pass.subscriptionTier,
      }
      
      grouped[gymId].passes.push(passData)
    })
    
    // Convert grouped object to array and calculate visit counts
    const finalResult = Object.values(grouped).map((group: any) => {
      const passes = group.passes || []
      const dates = passes
        .map((p: any) => {
          if (p.usedAt) return p.usedAt
          if (p.createdAt) return p.createdAt
          return null
        })
        .filter((d: any) => d !== null && d !== undefined && d instanceof Date)
      
      let lastVisit: Date | null = null
      if (dates.length > 0) {
        try {
          const sortedDates = dates.sort((a: Date, b: Date) => b.getTime() - a.getTime())
          lastVisit = sortedDates[0]
        } catch (e) {
          lastVisit = new Date()
        }
      }
      
      return {
        ...group,
        visitCount: passes.length,
        lastVisit: lastVisit || new Date(),
      }
    })
    
    console.log('[getPassHistory] Returning', finalResult.length, 'groups')
    
    return finalResult
  } catch (error) {
    console.error('[getPassHistory] Error fetching pass history:', error)
    return []
  }
}

export default async function PassesPage() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const auth0Id = session.user.sub
  const userEmail = session.user.email
  const userName = session.user.name
  
  // Check onboarding status - redirect if not completed
  const { needsOnboarding } = await getOrCreateAppUser(
    auth0Id,
    userEmail,
    userName
  )
  
  if (needsOnboarding) {
    redirect('/onboarding')
  }
  
  console.log('[PassesPage] ==========================================')
  console.log('[PassesPage] Auth0 ID:', auth0Id)
  console.log('[PassesPage] Session user:', {
    sub: session.user.sub,
    name: userName,
    email: userEmail,
  })
  
  // All data fetching now uses the API with auth0Id
  // No database queries needed - getOrCreateAppUser above handles user creation via API
  if (!auth0Id) {
    console.error('[PassesPage] No Auth0 ID available')
    // If no auth0Id, use session data as fallback
    const fallbackUserName = session.user.name || session.user.email || 'User'
    return (
      <DashboardLayout
        userName={fallbackUserName}
        userInitials="U"
        subscription={null}
      >
        <AccountSetupError />
      </DashboardLayout>
    )
  }
  
  console.log('[PassesPage] Auth0 ID:', auth0Id)
  console.log('[PassesPage] ==========================================')
  
  try {
    // Fetch passes first - the /user/passes endpoint also returns subscription data
    // This subscription data has the correct visits_used value
    const { passes: allPassesFromAPI, subscription: subscriptionFromPasses } = await fetchUserPassesFromAPI(auth0Id)
    console.log('[PassesPage] Subscription from /user/passes:', subscriptionFromPasses)
    
    // Try to get subscription from /user/passes response first (has correct visits_used)
    // Fall back to membership from /user endpoint (fetched via getUserData) if not available
    let subscription: Subscription | null = null
    
    if (subscriptionFromPasses) {
      console.log('[PassesPage] Using subscription from /user/passes response')
      // Map the subscription from passes response using the same mapping logic
      const subscriptionData = subscriptionFromPasses
      
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
      
      subscription = {
        id: subscriptionData.id || 0,
        userId: subscriptionData.user_id || auth0Id,
        tier: subscriptionData.tier || 'standard',
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
      } as Subscription
      
      console.log('[PassesPage] Mapped subscription from passes:', {
        visitsUsed: subscription.visitsUsed,
        monthlyLimit: subscription.monthlyLimit,
        tier: subscription.tier,
      })
    } else {
      console.log('[PassesPage] No subscription in /user/passes response, will use membership from /user endpoint')
      // Fall back to membership from /user endpoint (handled in getUserData call below)
    }
    
    console.log('[PassesPage] Final subscription:', subscription)
    console.log('[PassesPage] Subscription visitsUsed:', subscription?.visitsUsed)
    
    // Get passes - filter from the fetched passes
    const activePasses = await getActivePasses(auth0Id)
    console.log('[PassesPage] Active passes:', activePasses.length, activePasses)
    
    const allPasses = await getAllUserPasses(auth0Id)
    console.log('[PassesPage] All passes:', allPasses.length, allPasses)
    
    const passHistory = await getPassHistory(auth0Id)
    console.log('[PassesPage] Pass history result:', passHistory.length, passHistory)
    
    // Get user data from API (name and membership)
    const userData = await getUserData(auth0Id, userEmail, userName)
    // Prefer subscription from /user/passes if available (has correct visits_used), 
    // otherwise use membership from /user endpoint, no need for separate /user/subscription call
    const finalSubscription = subscription || userData.subscription
    const initials = userData.name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    return (
      <DashboardLayout
        userName={userData.name}
        userInitials={initials}
        subscription={finalSubscription}
      >
        <div className="flex-1 flex flex-col h-screen overflow-y-auto">
          <div className="px-6 py-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              My Passes
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              View and manage your gym passes.
            </p>
          </div>
          <div className="px-6 pb-6">
                <PassesView
                  subscription={subscription}
                  activePasses={activePasses}
                  passHistory={passHistory}
                />
          </div>
        </div>
      </DashboardLayout>
    )
  } catch (error) {
    console.error('Error loading passes page:', error)
    const errorUserData = await getUserData(auth0Id, session.user.email, session.user.name)
    return (
      <DashboardLayout
        userName={errorUserData.name}
        userInitials="U"
        subscription={errorUserData.subscription}
      >
        <div className="flex-1 flex flex-col h-screen overflow-y-auto items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Error Loading Passes
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              There was an error loading your passes. Please try again later.
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }
}
