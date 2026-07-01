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

const API_BASE = process.env.ANYGYM_API_BASE_URL || 'https://api.any-gym.com'

async function parseApiError(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}))
  const record = errorData as { error?: string; message?: string }
  return (
    record.message ||
    record.error ||
    `Request failed: ${response.statusText}`
  )
}

async function fetchUserFromApi(
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<AppUser | null> {
  const response = await fetch(`${API_BASE}/user`, {
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
 * Create a user record via POST /user. The API must expose this route;
 * PUT /user/update and PUT /user only update existing users.
 */
export async function createUserViaApi(
  normalizedAuth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<{ ok: boolean; user?: AppUser; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        auth0_id: normalizedAuth0Id,
      },
      body: JSON.stringify({
        auth0_id: normalizedAuth0Id,
        email: userEmail || null,
        full_name: userName || null,
        name: userName || null,
        onboarding_completed: false,
      }),
    })

    if (response.ok) {
      const userData = await response.json().catch(() => null)
      if (userData?.auth0_id) {
        return {
          ok: true,
          user: mapApiUserToAppUser(
            userData,
            normalizedAuth0Id,
            userEmail,
            userName
          ),
        }
      }

      const fetched = await fetchUserFromApi(
        normalizedAuth0Id,
        userEmail,
        userName
      )
      if (fetched) {
        return { ok: true, user: fetched }
      }

      return { ok: true, user: buildStubUser(normalizedAuth0Id, userEmail, userName) }
    }

    const errorMessage = await parseApiError(response)

    if (response.status === 404) {
      return {
        ok: false,
        error:
          'User creation is not available on the API (POST /user missing). The API must implement user creation before onboarding can complete.',
      }
    }

    if (response.status === 409 || response.status === 400) {
      const existing = await fetchUserFromApi(
        normalizedAuth0Id,
        userEmail,
        userName
      )
      if (existing) {
        return { ok: true, user: existing }
      }
    }

    return { ok: false, error: errorMessage }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * Ensure the user exists in the API (GET, then POST /user if missing).
 */
export async function ensureUserExistsViaApi(
  auth0Id: string,
  userEmail?: string,
  userName?: string
): Promise<{ ok: boolean; user?: AppUser; error?: string }> {
  const normalizedAuth0Id = auth0Id.trim()

  const existing = await fetchUserFromApi(
    normalizedAuth0Id,
    userEmail,
    userName
  )
  if (existing) {
    return { ok: true, user: existing }
  }

  console.log(
    '[ensureUserExistsViaApi] Creating user via POST /user:',
    normalizedAuth0Id
  )

  return createUserViaApi(normalizedAuth0Id, userEmail, userName)
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
    '[getOrCreateAppUser] User not found, creating via API for auth0_id:',
    normalizedAuth0Id
  )

  const createResult = await ensureUserExistsViaApi(
    normalizedAuth0Id,
    userEmail,
    userName
  )

  if (createResult.ok && createResult.user) {
    console.log(
      '[getOrCreateAppUser] User ready:',
      createResult.user.auth0_id,
      'needsOnboarding:',
      !createResult.user.onboarding_completed
    )
    return {
      user: createResult.user,
      needsOnboarding: !createResult.user.onboarding_completed,
    }
  }

  console.warn(
    '[getOrCreateAppUser] Could not create user via API:',
    createResult.error
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
): Promise<{ ok: boolean; error?: string; status?: number; data?: unknown }> {
  const normalizedAuth0Id = auth0Id.trim()
  const urls = [`${API_BASE}/user/update`, `${API_BASE}/user`]

  let lastError = 'Failed to update user'
  let lastStatus = 500

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          auth0_id: normalizedAuth0Id,
        },
        body: JSON.stringify({
          auth0_id: normalizedAuth0Id,
          ...payload,
        }),
      })

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        return { ok: true, data }
      }

      const errorData = await response.json().catch(() => ({}))
      lastError =
        (errorData as { error?: string; message?: string }).message ||
        (errorData as { error?: string; message?: string }).error ||
        `Failed to update user: ${response.statusText}`
      lastStatus = response.status

      console.warn(
        `[updateUserViaApi] ${url} returned ${response.status}:`,
        lastError
      )

      // Try the next endpoint for client/server errors that may be route-specific
      if ([400, 404, 405, 422].includes(response.status)) {
        continue
      }

      return { ok: false, error: lastError, status: lastStatus }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[updateUserViaApi] ${url} failed:`, message)
      lastError = message
    }
  }

  return { ok: false, error: lastError, status: lastStatus }
}

/**
 * Save onboarding profile fields, then mark onboarding complete in a separate call
 * so /user/update (partial update) is not rejected for unsupported fields.
 */
export async function saveOnboardingViaApi(
  auth0Id: string,
  profile: {
    email?: string
    name: string
    dateOfBirth: string
    addressLine1: string
    addressLine2?: string
    addressCity: string
    addressPostcode: string
    emergencyContactName: string
    emergencyContactNumber: string
    assignFreeTier?: boolean
  }
): Promise<{ ok: boolean; error?: string }> {
  const ensureResult = await ensureUserExistsViaApi(
    auth0Id,
    profile.email,
    profile.name
  )

  if (!ensureResult.ok) {
    return {
      ok: false,
      error:
        ensureResult.error ||
        'Could not create your account. Please try again or contact support.',
    }
  }

  const profilePayload: Record<string, unknown> = {
    email: profile.email || null,
    full_name: profile.name,
    name: profile.name,
    date_of_birth: profile.dateOfBirth,
    address_line1: profile.addressLine1,
    address_line2: profile.addressLine2 || null,
    address_city: profile.addressCity,
    address_postcode: profile.addressPostcode,
    emergency_contact_name: profile.emergencyContactName,
    emergency_contact_number: profile.emergencyContactNumber,
  }

  const profileResult = await updateUserViaApi(auth0Id, profilePayload)
  if (!profileResult.ok) {
    return { ok: false, error: profileResult.error || 'Failed to save profile' }
  }

  const completionPayload: Record<string, unknown> = {
    onboarding_completed: true,
  }

  if (profile.assignFreeTier) {
    completionPayload.assign_free_tier = true
  }

  const completionResult = await updateUserViaApi(auth0Id, completionPayload)
  if (!completionResult.ok) {
    // Profile saved — still allow step 4 if only the completion flag failed
    console.warn(
      '[saveOnboardingViaApi] Profile saved but onboarding_completed update failed:',
      completionResult.error
    )
  }

  return { ok: true }
}
