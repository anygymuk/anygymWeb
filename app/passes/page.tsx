import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { GymPass, Subscription } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import PassesView from '@/components/PassesView'
import AccountSetupError from '@/components/AccountSetupError'
import { getOrCreateAppUser } from '@/lib/user'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

/**
 * Get the app user ID from the Auth0 ID by looking up the app_users table
 * Creates the user if they don't exist
 */
async function getAppUserId(auth0Id: string, userEmail?: string, userName?: string): Promise<number | null> {
  try {
    console.log('[getAppUserId] Starting lookup for auth0_id:', auth0Id)
    console.log('[getAppUserId] Auth0 ID type:', typeof auth0Id, 'length:', auth0Id?.length)
    console.log('[getAppUserId] Auth0 ID JSON:', JSON.stringify(auth0Id))
    
    // Normalize the auth0_id (trim whitespace)
    const normalizedAuth0Id = auth0Id?.trim()
    
    // First, try exact match
    let result = await sql`
      SELECT id FROM app_users 
      WHERE auth0_id = ${normalizedAuth0Id}
      LIMIT 1
    `
    
    console.log('[getAppUserId] Exact match query result:', result)
    
    // If not found, try case-insensitive match (in case of encoding issues)
    if (result.length === 0) {
      console.log('[getAppUserId] Trying case-insensitive match...')
      result = await sql`
        SELECT id FROM app_users 
        WHERE LOWER(TRIM(auth0_id)) = LOWER(${normalizedAuth0Id})
        LIMIT 1
      `
      console.log('[getAppUserId] Case-insensitive query result:', result)
    }
    
    // If still not found, try to find by email as fallback
    if (result.length === 0 && userEmail) {
      console.log('[getAppUserId] Trying email fallback:', userEmail)
      result = await sql`
        SELECT id FROM app_users 
        WHERE email = ${userEmail}
        LIMIT 1
      `
      console.log('[getAppUserId] Email fallback query result:', result)
      
      // If found by email, update the auth0_id to match
      if (result.length > 0) {
        const appUserId = result[0].id
        console.log('[getAppUserId] Found user by email, updating auth0_id...')
        try {
          await sql`
            UPDATE app_users 
            SET auth0_id = ${normalizedAuth0Id}, updated_at = NOW()
            WHERE id = ${appUserId}
          `
          console.log('[getAppUserId] Updated auth0_id for user:', appUserId)
        } catch (updateError: any) {
          console.error('[getAppUserId] Error updating auth0_id:', updateError?.message)
          // Continue anyway - we have the user ID
        }
        return appUserId
      }
    }
    
    if (result.length > 0) {
      const appUserId = result[0].id
      console.log('[getAppUserId] Found existing app user ID:', appUserId, 'for auth0_id:', normalizedAuth0Id)
      return appUserId
    }
    
    // User doesn't exist, create them
    console.log('[getAppUserId] User not found, creating new user for auth0_id:', normalizedAuth0Id)
    console.log('[getAppUserId] User data:', { email: userEmail, name: userName })
    
    // Before creating, let's check what auth0_ids exist in the database for debugging
    try {
      const allUsers = await sql`
        SELECT id, auth0_id, email FROM app_users
        ORDER BY created_at DESC
        LIMIT 10
      `
      console.log('[getAppUserId] Sample users in database:', JSON.stringify(allUsers, null, 2))
    } catch (debugError: any) {
      console.warn('[getAppUserId] Could not fetch sample users:', debugError?.message)
    }
    
    try {
      // Try to get table structure first to see what columns exist (optional, don't fail if this errors)
      try {
        const tableInfo = await sql`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'app_users'
          ORDER BY ordinal_position
        `
        console.log('[getAppUserId] app_users table structure:', JSON.stringify(tableInfo, null, 2))
      } catch (tableInfoError: any) {
        console.warn('[getAppUserId] Could not fetch table structure:', tableInfoError?.message)
        // Continue anyway - this is just for debugging
      }
      
      const insertResult = await sql`
        INSERT INTO app_users (auth0_id, email, full_name, created_at, updated_at)
        VALUES (${normalizedAuth0Id}, ${userEmail || null}, ${userName || null}, NOW(), NOW())
        RETURNING id
      `
      
      console.log('[getAppUserId] Insert result:', insertResult)
      
      if (insertResult.length > 0) {
        const appUserId = insertResult[0].id
        console.log('[getAppUserId] Created new app user with ID:', appUserId, 'for auth0_id:', normalizedAuth0Id)
        return appUserId
      } else {
        console.error('[getAppUserId] Insert succeeded but no ID returned')
      }
    } catch (insertError: any) {
      console.error('[getAppUserId] Insert error details:', {
        message: insertError?.message,
        code: insertError?.code,
        detail: insertError?.detail,
        hint: insertError?.hint,
        stack: insertError?.stack,
      })
      
      // If insert fails, check if it's because of a unique constraint (user was created concurrently)
      if (insertError?.code === '23505' || insertError?.message?.includes('unique') || insertError?.message?.includes('duplicate')) {
        console.log('[getAppUserId] User was created concurrently, fetching again...')
        // Try to fetch again with both exact and case-insensitive
        result = await sql`
          SELECT id FROM app_users 
          WHERE auth0_id = ${normalizedAuth0Id}
          LIMIT 1
        `
        if (result.length === 0) {
          result = await sql`
            SELECT id FROM app_users 
            WHERE LOWER(TRIM(auth0_id)) = LOWER(${normalizedAuth0Id})
            LIMIT 1
          `
        }
        if (result.length > 0) {
          const appUserId = result[0].id
          console.log('[getAppUserId] Found app user ID after concurrent creation:', appUserId)
          return appUserId
        }
      }
      
      // If it's a column error, try a simpler insert
      if (insertError?.message?.includes('column') || insertError?.code === '42703') {
        console.log('[getAppUserId] Column error detected, trying minimal insert...')
        try {
          const minimalInsert = await sql`
            INSERT INTO app_users (auth0_id)
            VALUES (${auth0Id})
            RETURNING id
          `
          if (minimalInsert.length > 0) {
            console.log('[getAppUserId] Created user with minimal fields:', minimalInsert[0].id)
            return minimalInsert[0].id
          }
        } catch (minimalError: any) {
          console.error('[getAppUserId] Minimal insert also failed:', minimalError?.message)
        }
      }
      
      // Don't throw - return null so we can show a better error message
      console.error('[getAppUserId] Failed to create user after all attempts')
      return null
    }
    
    console.error('[getAppUserId] Failed to create or find user - no error thrown but no result')
    return null
  } catch (error: any) {
    console.error('[getAppUserId] Top-level error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack,
    })
    return null
  }
}

async function getUserSubscription(appUserId: number | null, auth0Id?: string): Promise<Subscription | null> {
  try {
    console.log('[getUserSubscription] Looking up subscription for appUserId:', appUserId, 'auth0Id:', auth0Id)
    
    if (!auth0Id) {
      console.log('[getUserSubscription] No auth0Id provided')
      return null
    }

    // Fetch subscription from external API
    const trimmedAuth0Id = auth0Id.trim()
    console.log('[getUserSubscription] Making request with auth0_id header:', trimmedAuth0Id)
    
    const response = await fetch('https://api.any-gym.com/user/subscription', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })
    
    console.log('[getUserSubscription] Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[getUserSubscription] No subscription found (404)')
        return null
      }
      throw new Error(`Failed to fetch subscription: ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('[getUserSubscription] API response:', JSON.stringify(data, null, 2))
    
    // Handle nested subscription object in API response
    // API returns: { "subscription": { "tier": "...", "visits_used": ... } }
    const subscriptionData = data.subscription || data
    console.log('[getUserSubscription] Extracted subscriptionData:', JSON.stringify(subscriptionData, null, 2))
    console.log('[getUserSubscription] subscriptionData.visits_used:', subscriptionData.visits_used, 'type:', typeof subscriptionData.visits_used)
    
    // Parse next_billing_date - API returns date string like "2025-12-30"
    // If it's just a date string, parse it; if it's a full ISO datetime, use it directly
    let nextBillingDate: Date
    if (subscriptionData.next_billing_date) {
      const billingDateStr = subscriptionData.next_billing_date
      // If it's just a date (YYYY-MM-DD), add time to make it end of day
      if (/^\d{4}-\d{2}-\d{2}$/.test(billingDateStr)) {
        nextBillingDate = new Date(billingDateStr + 'T23:59:59.999Z')
      } else {
        nextBillingDate = new Date(billingDateStr)
      }
    } else {
      // Fallback to current_period_end if next_billing_date is not available
      nextBillingDate = subscriptionData.current_period_end 
        ? new Date(subscriptionData.current_period_end)
        : new Date()
    }
    
    // Map API response to Subscription type
    // Based on actual API response structure - only maps fields that exist
    const subscriptionMapped = {
      id: subscriptionData.id || 0,
      userId: subscriptionData.user_id || auth0Id,
      tier: subscriptionData.tier || 'standard',
      monthlyLimit: subscriptionData.monthly_limit != null ? Number(subscriptionData.monthly_limit) : 0,
      visitsUsed: subscriptionData.visits_used != null ? Number(subscriptionData.visits_used) : 0,
      price: subscriptionData.price != null ? parseFloat(subscriptionData.price) : 0,
      // Use current_period_start as startDate if start_date not available
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
      // Use current_period_start/end for created/updated if not available
      createdAt: subscriptionData.created_at 
        ? new Date(subscriptionData.created_at)
        : (subscriptionData.current_period_start ? new Date(subscriptionData.current_period_start) : new Date()),
      updatedAt: subscriptionData.updated_at 
        ? new Date(subscriptionData.updated_at)
        : (subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end) : new Date()),
    } as Subscription
    
    console.log('[getUserSubscription] Mapped subscription object:', {
      visitsUsed: subscriptionMapped.visitsUsed,
      monthlyLimit: subscriptionMapped.monthlyLimit,
      tier: subscriptionMapped.tier,
      visitsUsedType: typeof subscriptionMapped.visitsUsed,
    })
    
    return subscriptionMapped
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return null
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

async function getActivePasses(appUserId: number | null, auth0Id?: string): Promise<GymPass[]> {
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


async function getAllUserPasses(appUserId: number | null, auth0Id?: string) {
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

async function getPassHistory(appUserId: number | null, auth0Id?: string) {
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
        const rawPass = rawPassMap.get(pass.id)
        const chainId = rawPass?.gym_chain_id || pass.gym?.gym_chain_id
        const chainName = rawPass?.gym_chain_name || pass.gym?.name
        const chainLogo = rawPass?.gym_chain_logo || pass.gym?.logo_url
        
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
  
  // Get the app user ID from app_users table (creates if doesn't exist)
  let appUserId: number | null = null
  
  try {
    appUserId = await getAppUserId(auth0Id, userEmail, userName)
  } catch (error: any) {
    console.error('[PassesPage] Error in getAppUserId:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    // Continue to show error page instead of crashing
  }
  
  // Note: We no longer check the database for passes since all data comes from API
  // The getAppUserId function handles user creation via API if needed
  
  // If no appUserId but we have Auth0 ID, we can still query passes via API
  // Only show error if we have neither
  if (!appUserId && !auth0Id) {
    console.error('[PassesPage] No app user found and no Auth0 ID available')
    console.error('[PassesPage] Check server logs above for detailed error information')
    
    // Show a more helpful error message
    return (
      <DashboardLayout
        userName={session.user.name || session.user.email || 'User'}
        userInitials="U"
        subscription={null}
      >
        <AccountSetupError />
      </DashboardLayout>
    )
  }
  
  // If we have Auth0 ID but no appUserId, log it but continue (API uses auth0Id)
  if (!appUserId && auth0Id) {
    console.warn('[PassesPage] No appUserId found, but using Auth0 ID for API queries:', auth0Id)
  }
  
  console.log('[PassesPage] App User ID:', appUserId)
  console.log('[PassesPage] Auth0 ID:', auth0Id)
  console.log('[PassesPage] ==========================================')
  
  try {
    // Fetch passes first - the /user/passes endpoint also returns subscription data
    // This subscription data has the correct visits_used value
    const { passes: allPassesFromAPI, subscription: subscriptionFromPasses } = await fetchUserPassesFromAPI(auth0Id)
    console.log('[PassesPage] Subscription from /user/passes:', subscriptionFromPasses)
    
    // Try to get subscription from /user/passes response first (has correct visits_used)
    // Fall back to /user/subscription endpoint if not available
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
      console.log('[PassesPage] No subscription in /user/passes response, trying /user/subscription')
      // Fall back to separate subscription endpoint
      subscription = await getUserSubscription(appUserId, auth0Id)
    }
    
    console.log('[PassesPage] Final subscription:', subscription)
    console.log('[PassesPage] Subscription visitsUsed:', subscription?.visitsUsed)
    
    // Get passes - filter from the fetched passes
    const activePasses = await getActivePasses(appUserId || 0, auth0Id)
    console.log('[PassesPage] Active passes:', activePasses.length, activePasses)
    
    const allPasses = await getAllUserPasses(appUserId || 0, auth0Id)
    console.log('[PassesPage] All passes:', allPasses.length, allPasses)
    
    const passHistory = await getPassHistory(appUserId || 0, auth0Id)
    console.log('[PassesPage] Pass history result:', passHistory.length, passHistory)

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
    return (
      <DashboardLayout
        userName={session.user.name || session.user.email || 'User'}
        userInitials="U"
        subscription={null}
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
