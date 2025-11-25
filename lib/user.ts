import { sql } from './db'

export interface AppUser {
  id?: number // Optional - table uses auth0_id as primary key
  auth0_id: string
  email?: string
  name?: string
  date_of_birth?: string
  address?: string // Legacy field - kept for backward compatibility
  address_line1?: string
  address_line2?: string
  address_city?: string
  address_postcode?: string
  emergency_contact_name?: string
  emergency_contact_number?: string
  onboarding_completed: boolean
  created_at: Date
  updated_at: Date
}

// Interface for SQL query result rows (all fields optional since different queries return different columns)
interface UserRow {
  id?: number
  auth0_id?: string
  email?: string | null
  full_name?: string | null
  date_of_birth?: string | null
  address?: string | null
  address_line1?: string | null
  address_line2?: string | null
  address_city?: string | null
  address_postcode?: string | null
  emergency_contact_name?: string | null
  emergency_contact_number?: string | null
  onboarding_completed?: boolean | null
  created_at?: Date | string
  updated_at?: Date | string
}

/**
 * Get or create app user from Auth0 ID
 * Returns the user and whether they need onboarding
 */
export async function getOrCreateAppUser(
  auth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<{ user: AppUser | null; needsOnboarding: boolean }> {
  const normalizedAuth0Id = auth0Id?.trim()

  // First, check if table exists and create it if it doesn't
  try {
    // Try a simple query to check if table exists
    await sql`
      SELECT 1 FROM app_users LIMIT 1
    `
  } catch (tableError: any) {
    // Table doesn't exist, create it
    if (tableError?.message?.includes('does not exist') || tableError?.message?.includes('relation') || tableError?.code === '42P01') {
      console.log('[getOrCreateAppUser] app_users table does not exist, creating it...')
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS app_users (
            auth0_id TEXT PRIMARY KEY,
            email TEXT,
            full_name TEXT,
            date_of_birth DATE,
            address_line1 TEXT,
            address_line2 TEXT,
            address_city TEXT,
            address_postcode TEXT,
            emergency_contact_name TEXT,
            emergency_contact_number TEXT,
            onboarding_completed BOOLEAN DEFAULT false,
            stripe_customer_id TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `
        console.log('[getOrCreateAppUser] app_users table created successfully')
      } catch (createError: any) {
        console.error('[getOrCreateAppUser] Failed to create app_users table:', createError?.message, createError?.code)
        // If table creation fails, try to continue anyway - might be a permissions issue
        // but we'll let the error bubble up on the actual query
      }
    } else if (tableError?.message?.includes('column')) {
      // Table exists but has wrong structure - log and continue
      console.warn('[getOrCreateAppUser] Table exists but may have wrong structure:', tableError?.message)
    } else {
      // Some other error - log but continue
      console.warn('[getOrCreateAppUser] Error checking table:', tableError?.message)
    }
  }

  // Try to find existing user
  // Use COALESCE to handle cases where columns might not exist yet
  let result: UserRow[] = []
  try {
    result = await sql`
      SELECT 
        auth0_id, 
        email, 
        full_name,
        COALESCE(date_of_birth, NULL) as date_of_birth,
        COALESCE(address_line1, NULL) as address_line1,
        COALESCE(address_line2, NULL) as address_line2,
        COALESCE(address_city, NULL) as address_city,
        COALESCE(address_postcode, NULL) as address_postcode,
        COALESCE(emergency_contact_name, NULL) as emergency_contact_name,
        COALESCE(emergency_contact_number, NULL) as emergency_contact_number,
        COALESCE(onboarding_completed, false) as onboarding_completed,
        created_at,
        updated_at
      FROM app_users 
      WHERE auth0_id = ${normalizedAuth0Id}
      LIMIT 1
    `
  } catch (error: any) {
    // If columns don't exist, try to add them or use a simpler query
    if (error?.message?.includes('column') || error?.code === '42703') {
      console.warn('[getOrCreateAppUser] Some columns may not exist, attempting to add missing columns...')
      
      // Try to add missing columns
      try {
        await sql`
          ALTER TABLE app_users
          ADD COLUMN IF NOT EXISTS date_of_birth DATE,
          ADD COLUMN IF NOT EXISTS address_line1 TEXT,
          ADD COLUMN IF NOT EXISTS address_line2 TEXT,
          ADD COLUMN IF NOT EXISTS address_city TEXT,
          ADD COLUMN IF NOT EXISTS address_postcode TEXT,
          ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
          ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT,
          ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false
        `
        console.log('[getOrCreateAppUser] Added missing onboarding columns')
        
        // Retry the original query
        result = await sql`
          SELECT 
            auth0_id, 
            email, 
            full_name,
            COALESCE(date_of_birth, NULL) as date_of_birth,
            COALESCE(address, NULL) as address,
            COALESCE(emergency_contact_name, NULL) as emergency_contact_name,
            COALESCE(emergency_contact_number, NULL) as emergency_contact_number,
            COALESCE(onboarding_completed, false) as onboarding_completed,
            created_at,
            updated_at
          FROM app_users 
          WHERE auth0_id = ${normalizedAuth0Id}
          LIMIT 1
        `
      } catch (alterError: any) {
        console.warn('[getOrCreateAppUser] Could not add columns, using fallback query:', alterError?.message)
        // If we can't add columns, try a simpler query
        try {
          result = await sql`
            SELECT 
              auth0_id, 
              email, 
              full_name,
              created_at,
              updated_at
            FROM app_users 
            WHERE auth0_id = ${normalizedAuth0Id}
            LIMIT 1
          `
          // If we got here, user exists but columns don't - still require onboarding
          // (user can complete onboarding even if columns don't exist - migration should be run)
          if (result && result.length > 0) {
            const row = result[0]
            if (!row.auth0_id) {
              console.error('[getOrCreateAppUser] User row missing auth0_id in fallback')
              return { user: null, needsOnboarding: true }
            }
            console.warn('[getOrCreateAppUser] Onboarding columns not found - user exists but will need onboarding. Please run migration: migrations/add_onboarding_columns.sql')
            return {
              user: {
                auth0_id: row.auth0_id,
                email: row.email ?? undefined,
                name: row.full_name ?? undefined,
                onboarding_completed: false,
                created_at: row.created_at ? new Date(row.created_at) : new Date(),
                updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
              },
              needsOnboarding: true, // Still require onboarding
            }
          }
        } catch (fallbackError: any) {
          console.error('[getOrCreateAppUser] Fallback query also failed:', fallbackError?.message)
          // If we can't query, we can't check if user exists - continue to creation logic
          result = []
        }
      }
    } else {
      console.error('[getOrCreateAppUser] Error querying user:', error?.message)
      // On error, continue to creation logic below
      result = []
    }
  }

  if (result && result.length > 0) {
    const row = result[0]
    if (!row.auth0_id) {
      console.error('[getOrCreateAppUser] User row missing auth0_id')
      return { user: null, needsOnboarding: true }
    }
    const user: AppUser = {
      auth0_id: row.auth0_id,
      email: row.email ?? undefined,
      name: row.full_name ?? undefined,
      date_of_birth: row.date_of_birth ?? undefined,
      address_line1: row.address_line1 ?? undefined,
      address_line2: row.address_line2 ?? undefined,
      address_city: row.address_city ?? undefined,
      address_postcode: row.address_postcode ?? undefined,
      emergency_contact_name: row.emergency_contact_name ?? undefined,
      emergency_contact_number: row.emergency_contact_number ?? undefined,
      onboarding_completed: row.onboarding_completed === true || false,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
    }
    return {
      user,
      needsOnboarding: !user.onboarding_completed,
    }
  }

  // User doesn't exist, create them
  console.log('[getOrCreateAppUser] User not found, creating new user for auth0_id:', normalizedAuth0Id)
  try {
    // Try to insert with onboarding_completed column, fallback if it doesn't exist
    let insertResult: UserRow[] = []
    try {
      insertResult = await sql`
        INSERT INTO app_users (
          auth0_id, 
          email, 
          full_name, 
          onboarding_completed,
          created_at, 
          updated_at
        )
        VALUES (
          ${normalizedAuth0Id}, 
          ${userEmail || null}, 
          ${userName || null}, 
          false,
          NOW(), 
          NOW()
        )
        RETURNING 
          auth0_id, 
          email, 
          full_name,
          created_at,
          updated_at
      `
      console.log('[getOrCreateAppUser] User created successfully with onboarding_completed column')
    } catch (insertError: any) {
      // If onboarding_completed column doesn't exist, insert without it
      if (insertError?.message?.includes('column') || insertError?.code === '42703') {
        console.warn('[getOrCreateAppUser] onboarding_completed column may not exist, inserting without it')
        try {
          insertResult = await sql`
            INSERT INTO app_users (
              auth0_id, 
              email, 
              full_name, 
              created_at, 
              updated_at
            )
            VALUES (
              ${normalizedAuth0Id}, 
              ${userEmail || null}, 
              ${userName || null}, 
              NOW(), 
              NOW()
            )
            RETURNING 
              auth0_id, 
              email, 
              full_name,
              created_at,
              updated_at
          `
          console.log('[getOrCreateAppUser] User created successfully without onboarding_completed column')
        } catch (fallbackInsertError: any) {
          console.error('[getOrCreateAppUser] Failed to create user even without onboarding_completed:', fallbackInsertError?.message)
          throw fallbackInsertError
        }
      } else {
        console.error('[getOrCreateAppUser] Failed to create user:', insertError?.message)
        throw insertError
      }
    }

    if (insertResult && insertResult.length > 0) {
      const row = insertResult[0]
      if (!row.auth0_id) {
        console.error('[getOrCreateAppUser] Insert result missing auth0_id')
        return { user: null, needsOnboarding: true }
      }
      const user: AppUser = {
        auth0_id: row.auth0_id,
        email: row.email ?? undefined,
        name: row.full_name ?? undefined,
        date_of_birth: row.date_of_birth ?? undefined,
        address_line1: row.address_line1 ?? undefined,
        address_line2: row.address_line2 ?? undefined,
        address_city: row.address_city ?? undefined,
        address_postcode: row.address_postcode ?? undefined,
        emergency_contact_name: row.emergency_contact_name ?? undefined,
        emergency_contact_number: row.emergency_contact_number ?? undefined,
        onboarding_completed: row.onboarding_completed === true || false,
        created_at: row.created_at ? new Date(row.created_at) : new Date(),
        updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      }
      console.log('[getOrCreateAppUser] Successfully created user:', user.auth0_id, 'needsOnboarding: true')
      return {
        user,
        needsOnboarding: true,
      }
    } else {
      console.error('[getOrCreateAppUser] Insert succeeded but no result returned')
    }
  } catch (insertError: any) {
    // If unique constraint violation, user was created concurrently
    if (insertError?.code === '23505' || insertError?.message?.includes('unique')) {
      // Try fetching again with fallback for missing columns
      try {
        result = await sql`
          SELECT 
            id, 
            auth0_id, 
            email, 
            full_name,
            COALESCE(date_of_birth, NULL) as date_of_birth,
            COALESCE(address, NULL) as address,
            COALESCE(emergency_contact_name, NULL) as emergency_contact_name,
            COALESCE(emergency_contact_number, NULL) as emergency_contact_number,
            COALESCE(onboarding_completed, false) as onboarding_completed,
            created_at,
            updated_at
          FROM app_users 
          WHERE auth0_id = ${normalizedAuth0Id}
          LIMIT 1
        `
      } catch (fetchError: any) {
        // If columns don't exist, use simpler query
        if (fetchError?.message?.includes('column') || fetchError?.code === '42703') {
          result = await sql`
            SELECT 
              auth0_id, 
              email, 
              full_name,
              created_at,
              updated_at
            FROM app_users 
            WHERE auth0_id = ${normalizedAuth0Id}
            LIMIT 1
          `
          if (result.length > 0) {
            const row = result[0]
            if (!row.auth0_id) {
              console.error('[getOrCreateAppUser] User row missing auth0_id in unique constraint fallback')
              return { user: null, needsOnboarding: true }
            }
            return {
              user: {
                auth0_id: row.auth0_id,
                email: row.email ?? undefined,
                name: row.full_name ?? undefined,
                onboarding_completed: false,
                created_at: row.created_at ? new Date(row.created_at) : new Date(),
                updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
              },
              needsOnboarding: true,
            }
          }
        } else {
          throw fetchError
        }
      }
      if (result && result.length > 0) {
        const row = result[0]
        if (!row.auth0_id) {
          console.error('[getOrCreateAppUser] User row missing auth0_id in unique constraint handler')
          return { user: null, needsOnboarding: true }
        }
        const user: AppUser = {
          auth0_id: row.auth0_id,
          email: row.email ?? undefined,
          name: row.full_name ?? undefined,
          date_of_birth: row.date_of_birth ?? undefined,
          address_line1: row.address_line1 ?? undefined,
          address_line2: row.address_line2 ?? undefined,
          address_city: row.address_city ?? undefined,
          address_postcode: row.address_postcode ?? undefined,
          emergency_contact_name: row.emergency_contact_name ?? undefined,
          emergency_contact_number: row.emergency_contact_number ?? undefined,
          onboarding_completed: row.onboarding_completed === true || false,
          created_at: row.created_at ? new Date(row.created_at) : new Date(),
          updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
        }
        return {
          user,
          needsOnboarding: !user.onboarding_completed,
        }
      }
    }
    console.error('[getOrCreateAppUser] Error creating user:', insertError?.message, insertError?.stack)
    // Re-throw the error so the caller knows something went wrong
    throw insertError
  }

  // If we get here, user creation failed
  console.error('[getOrCreateAppUser] Failed to create user - no result returned')
  return { user: null, needsOnboarding: true }
}

