import { stripe } from '@/lib/stripe'
import { mapGymFromApi } from '@/lib/gym'
import { updateUserViaApi } from '@/lib/user'

const API_BASE = process.env.ANYGYM_API_BASE_URL || 'https://api.any-gym.com'

export interface PassCheckoutResult {
  ok: boolean
  sessionId?: string
  url?: string
  error?: string
  status?: number
}

function parseApiErrorBody(body: Record<string, unknown>): string {
  const message = body.message ?? body.error
  return typeof message === 'string' ? message : 'Failed to create pass checkout session'
}

export async function ensureFreeTierOnApi(auth0Id: string): Promise<void> {
  const result = await updateUserViaApi(auth0Id, {
    assign_free_tier: true,
    membership_tier: 'free',
    tier: 'free',
  })

  if (!result.ok) {
    console.warn('[pass-checkout] ensureFreeTierOnApi failed:', result.error)
  }
}

export async function createPassCheckoutViaApi(
  auth0Id: string,
  gymId: number,
  origin: string
): Promise<PassCheckoutResult> {
  try {
    const response = await fetch(`${API_BASE}/purchase_pass_checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        auth0_id: auth0Id,
      },
      body: JSON.stringify({
        auth0_id: auth0Id,
        gym_id: gymId,
        membership_tier: 'free',
        assign_free_tier: true,
        success_url: `${origin}/passes?purchase=success`,
        cancel_url: `${origin}/dashboard?purchase=canceled`,
      }),
    })

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    if (!response.ok) {
      return {
        ok: false,
        error: parseApiErrorBody(data),
        status: response.status,
      }
    }

    return {
      ok: true,
      sessionId:
        (data.session_id as string) ||
        (data.sessionId as string) ||
        undefined,
      url:
        (data.checkout_url as string) ||
        (data.checkoutUrl as string) ||
        (data.url as string) ||
        undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[pass-checkout] API checkout failed:', message)
    return { ok: false, error: message, status: 502 }
  }
}

async function getOrCreateStripeCustomer(
  auth0Id: string,
  userEmail?: string | null
): Promise<string> {
  let customerId: string | undefined

  try {
    const userResponse = await fetch(`${API_BASE}/user`, {
      headers: { auth0_id: auth0Id.trim() },
      cache: 'no-store',
    })

    if (userResponse.ok) {
      const userData = (await userResponse.json()) as Record<string, unknown>
      const existingCustomerId = userData.stripe_customer_id
      if (typeof existingCustomerId === 'string' && existingCustomerId) {
        customerId = existingCustomerId
        await stripe.customers.update(existingCustomerId, {
          metadata: {
            userId: auth0Id,
            auth0_id: auth0Id,
          },
        })
      }
    }
  } catch (error) {
    console.warn('[pass-checkout] Could not load user for Stripe customer:', error)
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail || undefined,
      metadata: {
        userId: auth0Id,
        auth0_id: auth0Id,
      },
    })
    customerId = customer.id

    await updateUserViaApi(auth0Id, {
      stripe_customer_id: customerId,
    }).catch((error) => {
      console.warn('[pass-checkout] Failed to persist stripe_customer_id:', error)
    })
  }

  return customerId
}

async function fetchGymForCheckout(
  auth0Id: string,
  gymId: number
): Promise<{ name: string; pricePerPass: number } | null> {
  const response = await fetch(`${API_BASE}/gyms/${gymId}`, {
    headers: { auth0_id: auth0Id.trim() },
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const gymData = (await response.json()) as Record<string, unknown>
  const gym = mapGymFromApi(gymData)

  if (gym.pricePerPass == null || gym.pricePerPass <= 0) {
    return null
  }

  return {
    name: gym.name,
    pricePerPass: gym.pricePerPass,
  }
}

export function isMembershipRequiredError(
  error?: string,
  status?: number
): boolean {
  if (status === 403) {
    return true
  }

  return /active membership required/i.test(error || '')
}

/**
 * Create a one-time Stripe Checkout session for a gym pass when the API
 * checkout endpoint is unavailable or rejects free-tier users.
 */
export async function createPassCheckoutViaStripe({
  auth0Id,
  userEmail,
  gymId,
  origin,
}: {
  auth0Id: string
  userEmail?: string | null
  gymId: number
  origin: string
}): Promise<PassCheckoutResult> {
  try {
    const gym = await fetchGymForCheckout(auth0Id, gymId)
    if (!gym) {
      return {
        ok: false,
        error: 'Pass purchase is not available for this gym',
        status: 400,
      }
    }

    const customerId = await getOrCreateStripeCustomer(auth0Id, userEmail)
    const unitAmount = Math.round(gym.pricePerPass * 100)

    if (unitAmount <= 0) {
      return {
        ok: false,
        error: 'Invalid pass price for this gym',
        status: 400,
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: unitAmount,
            product_data: {
              name: `${gym.name} — 24h Gym Pass`,
              description: 'One-time gym pass valid for 24 hours',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/passes?purchase=success`,
      cancel_url: `${origin}/dashboard?purchase=canceled`,
      metadata: {
        auth0_id: auth0Id,
        userId: auth0Id,
        gym_id: String(gymId),
        purchase_type: 'single_pass',
        pass_amount: String(gym.pricePerPass),
      },
    })

    return {
      ok: true,
      sessionId: checkoutSession.id,
      url: checkoutSession.url || undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[pass-checkout] Stripe fallback failed:', message)
    return { ok: false, error: message, status: 500 }
  }
}
