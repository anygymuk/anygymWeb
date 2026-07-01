import { MembershipContext, MembershipMode, Subscription } from '@/lib/types'

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
