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

function buildStubUser(
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): AppUser {
  return {
    auth0_id: normalizedAuth0Id,
    email: userEmail,
    name: userName,
    onboarding_completed: false,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

async function fetchUserFromApi(
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<AppUser | null> {
  const response = await fetch('https://api.any-gym.com/user', {
    headers: {
      auth0_id: normalizedAuth0Id,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const userData = await response.json()
  return mapApiUserToAppUser(
    userData,
    normalizedAuth0Id,
    userEmail,
    userName
  )
}

/**
 * Create or upsert a user record. The external API does not expose POST /user;
 * use PUT /user/update (upsert) then PUT /user as fallback.
 */
async function upsertUserViaApi(
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<AppUser | null> {
  const createPayload = {
    auth0_id: normalizedAuth0Id,
    email: userEmail || null,
    full_name: userName || null,
    name: userName || null,
    onboarding_completed: false,
  }

  const upsertUrls = [
    'https://api.any-gym.com/user/update',
    'https://api.any-gym.com/user',
  ]

  for (const url of upsertUrls) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          auth0_id: normalizedAuth0Id,
        },
        body: JSON.stringify(createPayload),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        console.warn(
          `[upsertUserViaApi] ${url} returned ${response.status}:`,
          errorBody.error || response.statusText
        )
        continue
      }

      const responseBody = await response.json().catch(() => null)
      if (responseBody?.auth0_id) {
        return mapApiUserToAppUser(
          responseBody,
          normalizedAuth0Id,
          userEmail,
          userName
        )
      }

      const fetched = await fetchUserFromApi(
        normalizedAuth0Id,
        userEmail,
        userName
      )
      if (fetched) {
        return fetched
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[upsertUserViaApi] ${url} failed:`, message)
    }
  }

  return null
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

  try {
    const existing = await fetchUserFromApi(
      normalizedAuth0Id,
      userEmail,
      userName
    )
    if (existing) {
      return {
        user: existing,
        needsOnboarding: !existing.onboarding_completed,
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[getOrCreateAppUser] Error fetching user from API:', message)
  }

  console.log(
    '[getOrCreateAppUser] User not found, upserting via API for auth0_id:',
    normalizedAuth0Id
  )

  try {
    const created = await upsertUserViaApi(
      normalizedAuth0Id,
      userEmail,
      userName
    )

    if (created) {
      console.log(
        '[getOrCreateAppUser] User upserted via API:',
        created.auth0_id,
        'needsOnboarding:',
        !created.onboarding_completed
      )
      return {
        user: created,
        needsOnboarding: !created.onboarding_completed,
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[getOrCreateAppUser] Error upserting user via API:', message)
  }

  // Allow onboarding to proceed; PUT /user during onboarding may create the record
  console.warn(
    '[getOrCreateAppUser] Could not upsert user via API — using local stub for auth0_id:',
    normalizedAuth0Id
  )
  const stubUser = buildStubUser(normalizedAuth0Id, userEmail, userName)
  return {
    user: stubUser,
    needsOnboarding: true,
  }
}

/**
 * PUT user data to the external API, trying /user/update then /user.
 */
export async function updateUserViaApi(
  auth0Id: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const normalizedAuth0Id = auth0Id.trim()
  const urls = [
    'https://api.any-gym.com/user/update',
    'https://api.any-gym.com/user',
  ]

  let lastError = 'Failed to update user'

  for (const url of urls) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        auth0_id: normalizedAuth0Id,
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      return { ok: true, data }
    }

    const errorData = await response.json().catch(() => ({}))
    lastError =
      (errorData as { error?: string }).error ||
      `Failed to update user: ${response.statusText}`

    if (response.status === 404) {
      continue
    }

    return { ok: false, error: lastError }
  }

  return { ok: false, error: lastError }
}
