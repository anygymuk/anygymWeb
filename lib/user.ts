// Database import removed - now using API for user data

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

function mapApiUserToAppUser(
  userData: Record<string, unknown>,
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): AppUser {
  return {
    auth0_id: (userData.auth0_id as string) || normalizedAuth0Id,
    email: (userData.email as string) ?? userEmail ?? undefined,
    name:
      (userData.full_name as string) ??
      (userData.name as string) ??
      userName ??
      undefined,
    date_of_birth: (userData.date_of_birth as string) ?? undefined,
    address_line1: (userData.address_line1 as string) ?? undefined,
    address_line2: (userData.address_line2 as string) ?? undefined,
    address_city: (userData.address_city as string) ?? undefined,
    address_postcode: (userData.address_postcode as string) ?? undefined,
    emergency_contact_name:
      (userData.emergency_contact_name as string) ?? undefined,
    emergency_contact_number:
      (userData.emergency_contact_number as string) ?? undefined,
    onboarding_completed: userData.onboarding_completed === true,
    created_at: userData.created_at
      ? new Date(userData.created_at as string)
      : new Date(),
    updated_at: userData.updated_at
      ? new Date(userData.updated_at as string)
      : new Date(),
  }
}

/**
 * Resolve where to send a user immediately after Auth0 login/signup.
 */
export async function getPostAuthRedirectPath(
  auth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<'/onboarding' | '/dashboard'> {
  const { needsOnboarding } = await getOrCreateAppUser(
    auth0Id,
    userEmail,
    userName
  )
  return needsOnboarding ? '/onboarding' : '/dashboard'
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

  // Try to find existing user from API
  try {
    const response = await fetch('https://api.any-gym.com/user', {
      headers: {
        'auth0_id': normalizedAuth0Id,
      },
      cache: 'no-store',
    })

    if (response.ok) {
      const userData = await response.json()
      const user = mapApiUserToAppUser(
        userData,
        normalizedAuth0Id,
        userEmail,
        userName
      )
      
      return {
        user,
        needsOnboarding: !user.onboarding_completed,
      }
    } else if (response.status === 404) {
      // User doesn't exist in API, will create below
      console.log('[getOrCreateAppUser] User not found in API, will create')
    } else {
      console.error('[getOrCreateAppUser] API error:', response.status, response.statusText)
      // On error, continue to creation logic below
    }
  } catch (error: any) {
    console.error('[getOrCreateAppUser] Error fetching user from API:', error?.message)
    // On error, continue to creation logic below
  }

  // User doesn't exist, create them via API
  console.log('[getOrCreateAppUser] User not found, creating new user for auth0_id:', normalizedAuth0Id)
  try {
    const response = await fetch('https://api.any-gym.com/user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'auth0_id': normalizedAuth0Id,
      },
      body: JSON.stringify({
        auth0_id: normalizedAuth0Id,
        email: userEmail || null,
        full_name: userName || null,
        name: userName || null,
        onboarding_completed: false,
      }),
    })

    if (!response.ok) {
      // If user already exists (409 or similar), try fetching again
      if (response.status === 409 || response.status === 400) {
        console.log('[getOrCreateAppUser] User may already exist, fetching from API...')
        const fetchResponse = await fetch('https://api.any-gym.com/user', {
          headers: {
            'auth0_id': normalizedAuth0Id,
          },
          cache: 'no-store',
        })
        
        if (fetchResponse.ok) {
          const userData = await fetchResponse.json()
          const user = mapApiUserToAppUser(
            userData,
            normalizedAuth0Id,
            userEmail,
            userName
          )
          return {
            user,
            needsOnboarding: !user.onboarding_completed,
          }
        }
      }
      
      const errorData = await response.json().catch(() => ({ error: 'Failed to create user' }))
      throw new Error(errorData.error || `Failed to create user: ${response.statusText}`)
    }

    const userData = await response.json()
    const user = mapApiUserToAppUser(
      userData,
      normalizedAuth0Id,
      userEmail,
      userName
    )
    
    console.log('[getOrCreateAppUser] Successfully created user via API:', user.auth0_id, 'needsOnboarding: true')
    return {
      user,
      needsOnboarding: true,
    }
  } catch (error: any) {
    console.error('[getOrCreateAppUser] Error creating user via API:', error?.message, error?.stack)
    // Re-throw the error so the caller knows something went wrong
    throw error
  }

  // If we get here, user creation failed
  console.error('[getOrCreateAppUser] Failed to create user - no result returned')
  return { user: null, needsOnboarding: true }
}

