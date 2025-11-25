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
    
    // Try both numeric ID and Auth0 ID (subscriptions might use either)
    // Based on the Deno function, subscriptions use auth0_id as user_id
    let result
    if (auth0Id) {
      // First try with Auth0 ID (most likely)
      result = await sql`
        SELECT * FROM subscriptions 
        WHERE user_id = ${auth0Id.trim()}
        AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `
      console.log('[getUserSubscription] Query with auth0Id result:', result.length)
      
      // If not found and we have appUserId, try numeric ID
      if (result.length === 0 && appUserId && appUserId > 0) {
        result = await sql`
          SELECT * FROM subscriptions 
          WHERE user_id::text = ${appUserId}::text
          AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1
        `
        console.log('[getUserSubscription] Query with appUserId result:', result.length)
      }
    } else if (appUserId && appUserId > 0) {
      result = await sql`
        SELECT * FROM subscriptions 
        WHERE user_id::text = ${appUserId}::text
        AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `
      console.log('[getUserSubscription] Query with appUserId only result:', result.length)
    } else {
      console.log('[getUserSubscription] No appUserId or auth0Id provided')
      return null
    }
    
    if (result.length === 0) {
      console.log('[getUserSubscription] No subscription found')
      return null
    }
    
    const row = result[0]
    
    // Ensure monthly_limit is a number
    const monthlyLimit = row.monthly_limit != null 
      ? Number(row.monthly_limit) 
      : 0
    
    console.log('[getUserSubscription] Raw subscription data:', {
      id: row.id,
      tier: row.tier,
      monthly_limit_raw: row.monthly_limit,
      monthly_limit_type: typeof row.monthly_limit,
      monthly_limit_parsed: monthlyLimit,
    })
    
    return {
      id: row.id,
      userId: row.user_id,
      tier: row.tier,
      monthlyLimit: monthlyLimit,
      visitsUsed: row.visits_used ? Number(row.visits_used) : 0,
      price: parseFloat(row.price),
      startDate: new Date(row.start_date),
      nextBillingDate: new Date(row.next_billing_date),
      status: row.status,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      guestPassesLimit: row.guest_passes_limit ? Number(row.guest_passes_limit) : 0,
      guestPassesUsed: row.guest_passes_used ? Number(row.guest_passes_used) : 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as Subscription
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
}

async function updateExpiredPasses(appUserId: number | null, auth0Id?: string): Promise<void> {
  try {
    const now = new Date()
    console.log('[updateExpiredPasses] Updating expired passes for appUserId:', appUserId, 'auth0Id:', auth0Id)
    
    // Update passes that have expired (valid_until < now) and are still marked as 'active'
    if (appUserId && appUserId > 0) {
      const updateResult = await sql`
        UPDATE gym_passes
        SET status = 'expired', updated_at = NOW()
        WHERE (user_id::text = ${appUserId}::text OR user_id = ${auth0Id || ''})
          AND status = 'active'
          AND valid_until < ${now.toISOString()}
        RETURNING id
      `
      console.log('[updateExpiredPasses] Updated expired passes:', updateResult.length || 0)
    } else {
      const updateResult = await sql`
        UPDATE gym_passes
        SET status = 'expired', updated_at = NOW()
        WHERE user_id = ${auth0Id || ''}
          AND status = 'active'
          AND valid_until < ${now.toISOString()}
        RETURNING id
      `
      console.log('[updateExpiredPasses] Updated expired passes:', updateResult.length || 0)
    }
  } catch (error) {
    console.error('[updateExpiredPasses] Error updating expired passes:', error)
    // Don't throw - allow the function to continue even if update fails
  }
}

async function getActivePasses(appUserId: number | null, auth0Id?: string): Promise<GymPass[]> {
  try {
    console.log('[getActivePasses] Fetching active passes for appUserId:', appUserId)
    console.log('[getActivePasses] appUserId type:', typeof appUserId)
    console.log('[getActivePasses] auth0Id:', auth0Id)
    
    // Update expired passes before fetching active ones
    await updateExpiredPasses(appUserId, auth0Id)
    
    // First, check if any passes exist for this user at all
    // Use direct string comparison - don't cast if user_id is already text
    let allPassesCheck
    if (appUserId && appUserId > 0) {
      allPassesCheck = await sql`
        SELECT COUNT(*) as count FROM gym_passes 
        WHERE user_id::text = ${appUserId}::text OR user_id = ${auth0Id || ''}
      `
    } else {
      allPassesCheck = await sql`
        SELECT COUNT(*) as count FROM gym_passes 
        WHERE user_id = ${auth0Id || ''}
      `
    }
    console.log('[getActivePasses] Total passes for user:', allPassesCheck[0]?.count)
    
    const now = new Date()
    console.log('[getActivePasses] Current time:', now.toISOString())
    
    // Query with both numeric ID and Auth0 ID string
    // Use direct comparison without casting if possible
    let result
    if (appUserId && appUserId > 0) {
      result = await sql`
        SELECT 
          gp.*,
          json_build_object(
            'id', g.id,
            'name', g.name,
            'address', g.address,
            'city', g.city,
            'postcode', g.postcode,
            'phone', g.phone,
            'gym_chain_id', g.gym_chain_id
          ) as gym
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        WHERE (gp.user_id::text = ${appUserId}::text OR gp.user_id = ${auth0Id || ''})
          AND gp.status = 'active'
          AND gp.valid_until > ${now.toISOString()}
        ORDER BY gp.created_at DESC
      `
    } else {
      result = await sql`
        SELECT 
          gp.*,
          json_build_object(
            'id', g.id,
            'name', g.name,
            'address', g.address,
            'city', g.city,
            'postcode', g.postcode,
            'phone', g.phone,
            'gym_chain_id', g.gym_chain_id
          ) as gym
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        WHERE gp.user_id = ${auth0Id || ''}
          AND gp.status = 'active'
          AND gp.valid_until > ${now.toISOString()}
        ORDER BY gp.created_at DESC
      `
    }
    
    console.log('[getActivePasses] Query result length:', result?.length || 0)
    if (result && result.length > 0) {
      console.log('[getActivePasses] First result:', JSON.stringify(result[0], null, 2))
    }
    
    if (!result || result.length === 0) {
      console.log('[getActivePasses] No active passes found')
      return []
    }
    
    return result.map((row: any) => {
      // Parse JSON object if it's a string
      let gym = row.gym
      if (typeof gym === 'string') {
        try {
          gym = JSON.parse(gym)
        } catch (e) {
          gym = null
        }
      }
      
      // Handle null/undefined gym
      if (!gym && row.gym_id) {
        gym = {
          id: row.gym_id,
          name: 'Unknown Gym',
        }
      }
      
      return {
        id: row.id,
        userId: row.user_id,
        gymId: row.gym_id,
        passCode: row.pass_code || '',
        status: row.status || 'unknown',
        validUntil: row.valid_until ? new Date(row.valid_until) : new Date(),
        usedAt: row.used_at ? new Date(row.used_at) : undefined,
        qrCodeUrl: row.qr_code_url,
        subscriptionTier: row.subscription_tier,
        passCost: row.pass_cost ? parseFloat(String(row.pass_cost)) : undefined,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
        gym: gym,
      }
    }) as GymPass[]
  } catch (error) {
    console.error('Error fetching active passes:', error)
    return []
  }
}

async function getPassesInBillingPeriod(
  appUserId: number | null,
  startDate: Date,
  nextBillingDate: Date,
  auth0Id?: string
): Promise<number> {
  try {
    console.log('[getPassesInBillingPeriod] Query params:', {
      appUserId,
      auth0Id,
      startDate: startDate.toISOString(),
      nextBillingDate: nextBillingDate.toISOString(),
    })
    
    let result
    if (appUserId && appUserId > 0) {
      result = await sql`
        SELECT COUNT(*) as count
        FROM gym_passes
        WHERE (user_id::text = ${appUserId}::text OR user_id = ${auth0Id || ''})
          AND created_at >= ${startDate.toISOString()}
          AND created_at < ${nextBillingDate.toISOString()}
      `
    } else {
      result = await sql`
        SELECT COUNT(*) as count
        FROM gym_passes
        WHERE user_id = ${auth0Id || ''}
          AND created_at >= ${startDate.toISOString()}
          AND created_at < ${nextBillingDate.toISOString()}
      `
    }
    
    console.log('[getPassesInBillingPeriod] Query result:', result)
    
    if (!result || result.length === 0) {
      console.log('[getPassesInBillingPeriod] No result, returning 0')
      return 0
    }
    
    const row = result[0]
    if (!row) {
      console.log('[getPassesInBillingPeriod] No row in result, returning 0')
      return 0
    }
    
    // Neon returns count as a string or number, handle both
    const countValue = row.count
    if (countValue === null || countValue === undefined) {
      console.log('[getPassesInBillingPeriod] Count is null/undefined, returning 0')
      return 0
    }
    
    // Convert to number
    const passCount = Number(countValue)
    const finalCount = isNaN(passCount) ? 0 : passCount
    console.log('[getPassesInBillingPeriod] Count:', finalCount, 'raw count:', countValue, 'type:', typeof countValue)
    
    // Only do additional debugging in development and if count is 0
    if (process.env.NODE_ENV === 'development' && finalCount === 0 && auth0Id) {
      try {
        const totalPassesResult = await sql`
          SELECT COUNT(*) as total_count FROM gym_passes WHERE user_id = ${auth0Id.trim()}
        `
        console.log('[getPassesInBillingPeriod] Total passes for user:', totalPassesResult[0]?.total_count)
        
        // Check passes with created_at dates for debugging
        const allPassesWithDates = await sql`
          SELECT id, created_at, user_id FROM gym_passes WHERE user_id = ${auth0Id.trim()} ORDER BY created_at DESC LIMIT 5
        `
        console.log('[getPassesInBillingPeriod] Sample passes with dates:', JSON.stringify(allPassesWithDates, null, 2))
      } catch (debugError) {
        console.warn('[getPassesInBillingPeriod] Debug query failed (non-fatal):', debugError)
      }
    }
    
    return finalCount
  } catch (error) {
    console.error('Error counting passes in billing period:', error)
    return 0
  }
}

async function getAllUserPasses(appUserId: number | null, auth0Id?: string) {
  try {
    console.log('[getAllUserPasses] Fetching all passes for appUserId:', appUserId)
    console.log('[getAllUserPasses] appUserId type:', typeof appUserId)
    console.log('[getAllUserPasses] auth0Id:', auth0Id)
    
    // First, check raw passes without joins to see if they exist
    let rawPassesCheck
    if (appUserId && appUserId > 0) {
      rawPassesCheck = await sql`
        SELECT id, user_id, gym_id, status, created_at FROM gym_passes 
        WHERE user_id::text = ${appUserId}::text OR user_id = ${auth0Id || ''}
        LIMIT 5
      `
    } else {
      rawPassesCheck = await sql`
        SELECT id, user_id, gym_id, status, created_at FROM gym_passes 
        WHERE user_id = ${auth0Id || ''}
        LIMIT 5
      `
    }
    console.log('[getAllUserPasses] Raw passes check:', JSON.stringify(rawPassesCheck, null, 2))
    
    let result
    if (appUserId && appUserId > 0) {
      result = await sql`
        SELECT 
          gp.*,
          g.id as gym_id_col,
          g.name as gym_name,
          g.gym_chain_id as gym_chain_id_col,
          gc.id as chain_id,
          gc.name as chain_name,
          gc.logo_url as chain_logo_url
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
        WHERE (gp.user_id::text = ${appUserId}::text OR gp.user_id = ${auth0Id || ''})
        ORDER BY gp.created_at DESC
        LIMIT 100
      `
    } else {
      result = await sql`
        SELECT 
          gp.*,
          g.id as gym_id_col,
          g.name as gym_name,
          g.gym_chain_id as gym_chain_id_col,
          gc.id as chain_id,
          gc.name as chain_name,
          gc.logo_url as chain_logo_url
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
        WHERE gp.user_id = ${auth0Id || ''}
        ORDER BY gp.created_at DESC
        LIMIT 100
      `
    }
    
    console.log('[getAllUserPasses] Query result length:', result?.length || 0)
    if (result && result.length > 0) {
      console.log('[getAllUserPasses] First result:', JSON.stringify(result[0], null, 2))
    }
    
    if (!result || result.length === 0) {
      console.log('[getAllUserPasses] No passes found')
      return []
    }
    
    return result.map((row: any) => {
      const gym = row.gym_id_col ? {
        id: row.gym_id_col,
        name: row.gym_name || 'Unknown Gym',
        gym_chain_id: row.gym_chain_id_col,
      } : null
      
      const chain = row.chain_id ? {
        id: row.chain_id,
        name: row.chain_name,
        logo_url: row.chain_logo_url,
      } : null
      
      return {
        id: row.id,
        userId: row.user_id,
        gymId: row.gym_id,
        passCode: row.pass_code || '',
        status: row.status || 'unknown',
        validUntil: row.valid_until ? new Date(row.valid_until) : new Date(),
        usedAt: row.used_at ? new Date(row.used_at) : undefined,
        qrCodeUrl: row.qr_code_url,
        subscriptionTier: row.subscription_tier,
        passCost: row.pass_cost ? parseFloat(String(row.pass_cost)) : undefined,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
        gym: gym || undefined,
      } as GymPass
    })
  } catch (error) {
    console.error('Error fetching all user passes:', error)
    return []
  }
}

async function getPassHistory(appUserId: number | null, auth0Id?: string) {
  try {
    console.log('[getPassHistory] Fetching pass history for appUserId:', appUserId)
    console.log('[getPassHistory] appUserId type:', typeof appUserId)
    console.log('[getPassHistory] auth0Id:', auth0Id)
    
    // Update expired passes before fetching history
    await updateExpiredPasses(appUserId, auth0Id)
    
    const now = new Date()
    let result
    if (appUserId && appUserId > 0) {
      result = await sql`
        SELECT 
          gp.*,
          g.id as gym_id_col,
          g.name as gym_name,
          g.gym_chain_id as gym_chain_id_col,
          gc.id as chain_id,
          gc.name as chain_name,
          gc.logo_url as chain_logo_url
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
        WHERE (gp.user_id::text = ${appUserId}::text OR gp.user_id = ${auth0Id || ''})
          AND (gp.valid_until < ${now.toISOString()} OR gp.status = 'expired' OR gp.status = 'used')
        ORDER BY gp.created_at DESC
        LIMIT 100
      `
    } else {
      result = await sql`
        SELECT 
          gp.*,
          g.id as gym_id_col,
          g.name as gym_name,
          g.gym_chain_id as gym_chain_id_col,
          gc.id as chain_id,
          gc.name as chain_name,
          gc.logo_url as chain_logo_url
        FROM gym_passes gp
        JOIN gyms g ON gp.gym_id = g.id
        LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
        WHERE gp.user_id = ${auth0Id || ''}
          AND (gp.valid_until < ${now.toISOString()} OR gp.status = 'expired' OR gp.status = 'used')
        ORDER BY gp.created_at DESC
        LIMIT 100
      `
    }
    
    console.log('[getPassHistory] Query result length:', result?.length || 0)
    if (result && result.length > 0) {
      console.log('[getPassHistory] First result:', JSON.stringify(result[0], null, 2))
    }
    
    if (!result || result.length === 0) {
      console.log('[getPassHistory] No results found, returning empty array')
      return []
    }
    
    // Group passes by gym
    const grouped: Record<number, any> = {}
    
    console.log('[getPassHistory] Processing', result.length, 'rows')
    
    result.forEach((row: any, index: number) => {
      console.log(`[getPassHistory] Processing row ${index}:`, {
        id: row.id,
        gym_id: row.gym_id,
        gym_id_col: row.gym_id_col,
        gym_name: row.gym_name,
        status: row.status,
        created_at: row.created_at,
        used_at: row.used_at,
      })
      
      const gymId = row.gym_id
      if (!gymId) {
        console.log(`[getPassHistory] Skipping row ${index} - no gym_id`)
        return // Skip if no gym_id
      }
      
      if (!grouped[gymId]) {
        grouped[gymId] = {
          gym: {
            id: row.gym_id_col || gymId,
            name: row.gym_name || 'Unknown Gym',
            gym_chain_id: row.gym_chain_id_col,
          },
          chain: row.chain_id ? {
            id: row.chain_id,
            name: row.chain_name,
            logo_url: row.chain_logo_url,
          } : null,
          passes: [],
        }
        console.log(`[getPassHistory] Created new group for gym ${gymId}:`, grouped[gymId].gym)
      }
      
      const createdAt = row.created_at ? new Date(row.created_at) : new Date()
      const usedAt = row.used_at ? new Date(row.used_at) : null
      
      const passData = {
        id: row.id,
        createdAt: createdAt,
        usedAt: usedAt,
        status: row.status || 'unknown',
        subscriptionTier: row.subscription_tier,
      }
      
      grouped[gymId].passes.push(passData)
      console.log(`[getPassHistory] Added pass to gym ${gymId}:`, passData)
    })
    
    console.log('[getPassHistory] Grouped data:', JSON.stringify(grouped, null, 2))
    console.log('[getPassHistory] Number of groups:', Object.keys(grouped).length)
    
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
    
    console.log('[getPassHistory] Final result:', JSON.stringify(finalResult, null, 2))
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
    // Check what users exist in app_users table for debugging (only in development, optional)
    if (process.env.NODE_ENV === 'development') {
      try {
        const allUsers = await sql`
          SELECT id, auth0_id, email, full_name FROM app_users 
          ORDER BY created_at DESC 
          LIMIT 10
        `
        console.log('[PassesPage] Sample users in app_users table:', JSON.stringify(allUsers, null, 2))
      } catch (error) {
        console.warn('[PassesPage] Could not check app_users table (non-fatal):', error)
      }
    }
    
    appUserId = await getAppUserId(auth0Id, userEmail, userName)
    
    // If still not found, try to find user_id from passes table directly
    // This handles the case where passes were created with Auth0 ID as user_id
    if (!appUserId) {
      console.log('[PassesPage] User not found by auth0_id, trying to find via passes table...')
      try {
        // First, check if passes exist with Auth0 ID as user_id
        const passesWithAuth0Id = await sql`
          SELECT DISTINCT user_id, COUNT(*) as pass_count
          FROM gym_passes 
          WHERE user_id::text = ${auth0Id.trim()}
          GROUP BY user_id
          LIMIT 1
        `
        console.log('[PassesPage] Passes with Auth0 ID as user_id:', JSON.stringify(passesWithAuth0Id, null, 2))
        
        if (passesWithAuth0Id.length > 0) {
          // Passes exist with Auth0 ID - we need to create the user or find them
          console.log('[PassesPage] Found passes with Auth0 ID, creating user in app_users...')
          
          // Try to create the user
          try {
            const insertResult = await sql`
              INSERT INTO app_users (auth0_id, email, full_name, created_at, updated_at)
              VALUES (${auth0Id.trim()}, ${userEmail || null}, ${userName || null}, NOW(), NOW())
              RETURNING id
            `
            
            if (insertResult.length > 0) {
              appUserId = insertResult[0].id
              console.log('[PassesPage] Created user in app_users with ID:', appUserId)
              
              // Now try to update the passes to use the numeric user_id instead of Auth0 ID
              // This will only work if user_id column can accept integers
              try {
                // First check the column type
                const columnInfo = await sql`
                  SELECT data_type 
                  FROM information_schema.columns 
                  WHERE table_name = 'gym_passes' AND column_name = 'user_id'
                `
                console.log('[PassesPage] gym_passes.user_id column type:', JSON.stringify(columnInfo, null, 2))
                
                // Try to update - if user_id is integer, cast appUserId to integer
                // If it's text, keep it as text
                if (columnInfo.length > 0 && columnInfo[0].data_type === 'integer') {
                  const updateResult = await sql`
                    UPDATE gym_passes 
                    SET user_id = ${appUserId}
                    WHERE user_id::text = ${auth0Id.trim()}
                  `
                  console.log('[PassesPage] Updated passes to use integer user_id')
                } else {
                  // Column is text/varchar, update as text
                  const updateResult = await sql`
                    UPDATE gym_passes 
                    SET user_id = ${appUserId}::text
                    WHERE user_id::text = ${auth0Id.trim()}
                  `
                  console.log('[PassesPage] Updated passes to use text user_id')
                }
              } catch (updateError: any) {
                console.error('[PassesPage] Error updating passes user_id:', updateError?.message)
                // Continue anyway - passes will still work with Auth0 ID in queries
              }
            }
          } catch (insertError: any) {
            // If unique constraint violation, user was created concurrently
            if (insertError?.code === '23505' || insertError?.message?.includes('unique')) {
              console.log('[PassesPage] User was created concurrently, fetching...')
              const userResult = await sql`
                SELECT id FROM app_users 
                WHERE auth0_id = ${auth0Id.trim()}
                LIMIT 1
              `
              if (userResult.length > 0) {
                appUserId = userResult[0].id
                console.log('[PassesPage] Found user after concurrent creation:', appUserId)
              }
            } else {
              console.error('[PassesPage] Error creating user:', insertError?.message)
            }
          }
        } else if (userEmail) {
          // Try to find user by email in app_users
          console.log('[PassesPage] Trying to find user by email...')
          const emailResult = await sql`
            SELECT id FROM app_users 
            WHERE email = ${userEmail}
            LIMIT 1
          `
          
          if (emailResult.length > 0) {
            appUserId = emailResult[0].id
            console.log('[PassesPage] Found user by email, updating auth0_id...')
            
            // Update auth0_id
            try {
              await sql`
                UPDATE app_users 
                SET auth0_id = ${auth0Id.trim()}, updated_at = NOW()
                WHERE id = ${appUserId}
              `
              console.log('[PassesPage] Updated auth0_id for user found by email')
            } catch (updateError: any) {
              console.error('[PassesPage] Error updating auth0_id:', updateError?.message)
            }
          }
        }
      } catch (passError: any) {
        console.error('[PassesPage] Error finding user via passes:', passError?.message)
      }
    }
  } catch (error: any) {
    console.error('[PassesPage] Error in getAppUserId:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    })
    // Continue to show error page instead of crashing
  }
  
  // If no appUserId found, check if passes exist with Auth0 ID directly
  // If they do, we can still display passes even without app_users entry
  if (!appUserId) {
    console.log('[PassesPage] No appUserId found, checking if passes exist with Auth0 ID...')
    
    // Check if passes exist with this Auth0 ID
    try {
      const passesCheck = await sql`
        SELECT COUNT(*) as count FROM gym_passes 
        WHERE user_id::text = ${auth0Id.trim()}
      `
      const passCount = passesCheck[0]?.count ? Number(passesCheck[0].count) : 0
      console.log('[PassesPage] Passes found with Auth0 ID:', passCount)
      
      if (passCount > 0) {
        // Passes exist, create user entry now
        console.log('[PassesPage] Passes exist, creating user entry...')
        try {
          const createUserResult = await sql`
            INSERT INTO app_users (auth0_id, email, full_name, created_at, updated_at)
            VALUES (${auth0Id.trim()}, ${userEmail || null}, ${userName || null}, NOW(), NOW())
            RETURNING id
          `
          
          if (createUserResult.length > 0) {
            appUserId = createUserResult[0].id
            console.log('[PassesPage] Created user with ID:', appUserId)
          }
        } catch (createError: any) {
          // If unique constraint, fetch existing user
          if (createError?.code === '23505' || createError?.message?.includes('unique')) {
            const existingUser = await sql`
              SELECT id FROM app_users WHERE auth0_id = ${auth0Id.trim()} LIMIT 1
            `
            if (existingUser.length > 0) {
              appUserId = existingUser[0].id
              console.log('[PassesPage] Found existing user:', appUserId)
            }
          } else {
            console.error('[PassesPage] Error creating user:', createError?.message)
          }
        }
      }
    } catch (checkError: any) {
      console.error('[PassesPage] Error checking passes:', checkError?.message)
    }
  }
  
  // If no appUserId but we have Auth0 ID, we can still query passes
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
  
  // If we have Auth0 ID but no appUserId, log it but continue
  if (!appUserId && auth0Id) {
    console.warn('[PassesPage] No appUserId found, but using Auth0 ID for pass queries:', auth0Id)
  }
  
  console.log('[PassesPage] App User ID:', appUserId)
  console.log('[PassesPage] App User ID type:', typeof appUserId)
  console.log('[PassesPage] Auth0 ID:', auth0Id)
  console.log('[PassesPage] ==========================================')
  
  // Verify the user_id exists in app_users (if we have one) - only in development
  if (appUserId && process.env.NODE_ENV === 'development') {
    try {
      const userVerify = await sql`
        SELECT id, auth0_id, email FROM app_users WHERE id = ${appUserId}
      `
      console.log('[PassesPage] Verified user in app_users:', JSON.stringify(userVerify, null, 2))
    } catch (verifyError: any) {
      console.warn('[PassesPage] Error verifying user (non-fatal):', verifyError?.message)
    }
  }
  
  // Check what user_ids exist in gym_passes for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    try {
      const passUserIds = await sql`
        SELECT DISTINCT user_id, COUNT(*) as pass_count 
        FROM gym_passes 
        GROUP BY user_id 
        ORDER BY pass_count DESC 
        LIMIT 10
      `
      console.log('[PassesPage] Sample user_ids in gym_passes:', JSON.stringify(passUserIds, null, 2))
      
      // Check if passes exist with Auth0 ID
      if (auth0Id) {
        const passesByAuth0Id = await sql`
          SELECT id, user_id, gym_id, status, created_at 
          FROM gym_passes 
          WHERE user_id::text = ${auth0Id.trim()}
          LIMIT 5
        `
        console.log('[PassesPage] Passes with auth0_id as user_id:', JSON.stringify(passesByAuth0Id, null, 2))
      }
      
      // Check if passes exist with numeric user_id (if we have one)
      if (appUserId) {
        const passesForThisUser = await sql`
          SELECT id, user_id, gym_id, status, created_at 
          FROM gym_passes 
          WHERE user_id::text = ${appUserId}::text
          LIMIT 5
        `
        console.log('[PassesPage] Passes with numeric user_id:', JSON.stringify(passesForThisUser, null, 2))
      }
    } catch (verifyError: any) {
      console.warn('[PassesPage] Error checking passes (non-fatal):', verifyError?.message)
    }
  }
  
  try {
    // Get subscription - try with both appUserId and auth0Id
    const subscription = await getUserSubscription(appUserId, auth0Id)
    console.log('[PassesPage] Subscription:', subscription)
    if (subscription) {
      console.log('[PassesPage] Subscription details:', {
        id: subscription.id,
        tier: subscription.tier,
        monthlyLimit: subscription.monthlyLimit,
        monthlyLimitType: typeof subscription.monthlyLimit,
        startDate: subscription.startDate,
        nextBillingDate: subscription.nextBillingDate,
        status: subscription.status,
      })
    }
    
    // Get passes - use Auth0 ID if appUserId is null
    const activePasses = await getActivePasses(appUserId || 0, auth0Id)
    console.log('[PassesPage] Active passes:', activePasses.length, activePasses)
    
    const allPasses = await getAllUserPasses(appUserId || 0, auth0Id)
    console.log('[PassesPage] All passes:', allPasses.length, allPasses)
    
    const passHistory = await getPassHistory(appUserId || 0, auth0Id)
    console.log('[PassesPage] Pass history result:', passHistory.length, passHistory)
    
    // Get count of passes created in current billing period
    let passesInBillingPeriod = 0
    if (subscription && subscription.startDate && subscription.nextBillingDate) {
      try {
        // Ensure dates are valid Date objects
        const startDate = subscription.startDate instanceof Date 
          ? subscription.startDate 
          : new Date(subscription.startDate)
        const nextBillingDate = subscription.nextBillingDate instanceof Date 
          ? subscription.nextBillingDate 
          : new Date(subscription.nextBillingDate)
        
        if (!isNaN(startDate.getTime()) && !isNaN(nextBillingDate.getTime())) {
          passesInBillingPeriod = await getPassesInBillingPeriod(
            appUserId || null,
            startDate,
            nextBillingDate,
            auth0Id
          )
          console.log('[PassesPage] Passes in billing period:', passesInBillingPeriod, 'from', startDate.toISOString(), 'to', nextBillingDate.toISOString())
        }
      } catch (error) {
        console.error('Error getting passes in billing period:', error)
        passesInBillingPeriod = 0
      }
    } else {
      // If no subscription, count all passes created (for display purposes)
      try {
        if (auth0Id) {
          const allPassesCount = await sql`
            SELECT COUNT(*) as count FROM gym_passes 
            WHERE user_id = ${auth0Id.trim()}
          `
          passesInBillingPeriod = allPassesCount[0]?.count ? Number(allPassesCount[0].count) : 0
          console.log('[PassesPage] No subscription, counting all passes:', passesInBillingPeriod)
        }
      } catch (error) {
        console.error('Error counting all passes:', error)
      }
    }

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
                  passesInBillingPeriod={passesInBillingPeriod}
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
