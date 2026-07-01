import { MembershipContext, MembershipMode, Subscription } from '@/lib/types'

export const FREE_TIER_COOKIE = 'anygym_membership_tier'

const API_BASE = process.env.ANYGYM_API_BASE_URL || 'https://api.any-gym.com'

export function buildFreeTierSubscription(auth0Id: string): Subscription {
  const now = new Date()
  return {
    id: 0,
    userId: auth0Id,
    tier: 'free',
    monthlyLimit: 0,
    visitsUsed: 0,
    price: 0,
    status: 'active',
    guestPassesLimit: 0,
    guestPassesUsed: 0,
    startDate: now,
    nextBillingDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: now,
    createdAt: now,
    updatedAt: now,
  }
}

function readTierFromUser(userData: Record<string, unknown>): string | null {
  const candidates = [
    userData.membership_tier,
    userData.membershipTier,
    userData.tier,
    userData.plan,
    userData.membership_plan,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase()
    }
  }

  return null
}

function hasFreeTierUserFlag(userData: Record<string, unknown>): boolean {
  return (
    userData.assign_free_tier === true ||
    userData.free_tier === true ||
    userData.is_free_tier === true
  )
}

/**
 * Resolve subscription from GET /user payload, including free-tier fallbacks
 * when the API stores tier on the user record or only honors assign_free_tier.
 */
export function resolveSubscriptionFromUserApi(
  userData: Record<string, unknown>,
  auth0Id: string,
  options?: { freeTierHint?: boolean }
): Subscription | null {
  const membership = userData.membership
  if (membership && typeof membership === 'object') {
    return mapMembershipFromApi(membership as Record<string, unknown>, auth0Id)
  }

  const userTier = readTierFromUser(userData)
  if (userTier === 'free' || hasFreeTierUserFlag(userData)) {
    return buildFreeTierSubscription(auth0Id)
  }

  if (options?.freeTierHint) {
    return buildFreeTierSubscription(auth0Id)
  }

  return null
}

export function applyFreeTierHint(
  subscription: Subscription | null,
  auth0Id: string,
  freeTierHint?: boolean
): Subscription | null {
  if (subscription) {
    return subscription
  }

  if (freeTierHint) {
    return buildFreeTierSubscription(auth0Id)
  }

  return null
}

export async function fetchUserDataWithSubscription(
  auth0Id: string,
  fallbackEmail?: string,
  fallbackName?: string,
  options?: { freeTierHint?: boolean }
): Promise<{ name: string; subscription: Subscription | null }> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const response = await fetch(`${API_BASE}/user`, {
      headers: {
        auth0_id: trimmedAuth0Id,
      },
      cache: 'no-store',
    })

    if (response.ok) {
      const userData = (await response.json()) as Record<string, unknown>
      const userName =
        (userData.full_name as string) ||
        (userData.name as string) ||
        fallbackName ||
        fallbackEmail ||
        'User'

      const subscription = resolveSubscriptionFromUserApi(
        userData,
        auth0Id,
        options
      )

      return { name: userName, subscription }
    }
  } catch (error) {
    console.error('[fetchUserDataWithSubscription] Error fetching user data:', error)
  }

  return {
    name: fallbackName || fallbackEmail || 'User',
    subscription: applyFreeTierHint(null, auth0Id, options?.freeTierHint),
  }
}

export function getMembershipMode(subscription: Subscription | null): MembershipMode {
  if (!subscription || subscription.status !== 'active') {
    return 'none'
  }
  if (subscription.tier?.toLowerCase() === 'free') {
    return 'free'
  }
  return 'paid'
}

export function buildMembershipContext(
  subscription: Subscription | null
): MembershipContext {
  const mode = getMembershipMode(subscription)
  return {
    mode,
    tier: subscription?.tier ?? null,
    subscription,
    hasMembership: mode !== 'none',
    isFreeTier: mode === 'free',
    isPaidTier: mode === 'paid',
  }
}

export function formatPrice(amount: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function mapMembershipFromApi(
  membershipData: Record<string, unknown>,
  auth0Id: string
): Subscription {
  let nextBillingDate: Date
  const rawBillingDate = membershipData.next_billing_date as string | undefined
  if (rawBillingDate) {
    nextBillingDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBillingDate)
      ? new Date(rawBillingDate + 'T23:59:59.999Z')
      : new Date(rawBillingDate)
  } else {
    nextBillingDate = membershipData.current_period_end
      ? new Date(membershipData.current_period_end as string)
      : new Date()
  }

  const tierValue = membershipData.tier
  const tier =
    tierValue && typeof tierValue === 'string' && tierValue.trim()
      ? tierValue
      : 'standard'

  return {
    id: (membershipData.id as number) || 0,
    userId: (membershipData.user_id as string) || auth0Id,
    tier,
    monthlyLimit:
      membershipData.monthly_limit != null
        ? Number(membershipData.monthly_limit)
        : 0,
    visitsUsed:
      membershipData.visits_used != null
        ? Number(membershipData.visits_used)
        : 0,
    price:
      membershipData.price != null
        ? parseFloat(String(membershipData.price))
        : 0,
    startDate: membershipData.start_date
      ? new Date(membershipData.start_date as string)
      : membershipData.current_period_start
        ? new Date(membershipData.current_period_start as string)
        : new Date(),
    nextBillingDate,
    currentPeriodStart: membershipData.current_period_start
      ? new Date(membershipData.current_period_start as string)
      : new Date(),
    currentPeriodEnd: membershipData.current_period_end
      ? new Date(membershipData.current_period_end as string)
      : new Date(),
    status: (membershipData.status as string) || 'active',
    stripeSubscriptionId:
      (membershipData.stripe_subscription_id as string) || undefined,
    stripeCustomerId:
      (membershipData.stripe_customer_id as string) || undefined,
    guestPassesLimit:
      membershipData.guest_passes_limit != null
        ? Number(membershipData.guest_passes_limit)
        : 0,
    guestPassesUsed:
      membershipData.guest_passes_used != null
        ? Number(membershipData.guest_passes_used)
        : 0,
    createdAt: membershipData.created_at
      ? new Date(membershipData.created_at as string)
      : membershipData.current_period_start
        ? new Date(membershipData.current_period_start as string)
        : new Date(),
    updatedAt: membershipData.updated_at
      ? new Date(membershipData.updated_at as string)
      : membershipData.current_period_end
        ? new Date(membershipData.current_period_end as string)
        : new Date(),
  }
}
