import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'
import { mapGymFromApi } from '@/lib/gym'
import { updateUserViaApi } from '@/lib/user'

const API_BASE = process.env.ANYGYM_API_BASE_URL || 'https://api.any-gym.com'

export const PASS_PURCHASE_SUCCESS_URL =
  '/passes?purchase=success&session_id={CHECKOUT_SESSION_ID}'

function buildPassPurchaseSuccessUrl(origin: string): string {
  return `${origin}${PASS_PURCHASE_SUCCESS_URL}`
}

function buildPassPurchaseCancelUrl(origin: string): string {
  return `${origin}/dashboard?purchase=canceled`
}

export interface FulfillPassPurchaseResult {
  ok: boolean
  error?: string
  endpoint?: string
  alreadyFulfilled?: boolean
  data?: unknown
}

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
        success_url: buildPassPurchaseSuccessUrl(origin),
        cancel_url: buildPassPurchaseCancelUrl(origin),
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
      success_url: buildPassPurchaseSuccessUrl(origin),
      cancel_url: buildPassPurchaseCancelUrl(origin),
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

function buildFulfillmentPayload(session: {
  id: string
  metadata?: Stripe.Metadata | null
  payment_intent?: string | Stripe.PaymentIntent | null
  amount_total?: number | null
  currency?: string | null
}) {
  const auth0Id =
    session.metadata?.auth0_id || session.metadata?.userId || undefined
  const gymId = session.metadata?.gym_id

  return {
    auth0Id,
    gymId: gymId ? Number(gymId) : undefined,
    payload: {
      auth0_id: auth0Id,
      gym_id: gymId ? Number(gymId) : undefined,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id,
      amount: session.amount_total ? session.amount_total / 100 : undefined,
      currency: session.currency || 'gbp',
      purchase_type: 'single_pass',
    },
  }
}

const FULFILLMENT_ENDPOINTS = [
  'complete_pass_purchase',
  'fulfill_pass_purchase',
  'pass_purchase/complete',
  'purchase_pass_checkout/fulfill',
] as const

function isAlreadyFulfilledResponse(
  status: number,
  body: Record<string, unknown>
): boolean {
  if (status === 409) {
    return true
  }

  const message = String(body.message ?? body.error ?? '').toLowerCase()
  return (
    message.includes('already') &&
    (message.includes('fulfilled') ||
      message.includes('completed') ||
      message.includes('exists'))
  )
}

export async function fulfillPassPurchaseFromStripeSession(
  session: {
    id: string
    payment_status?: string | null
    metadata?: Stripe.Metadata | null
    payment_intent?: string | Stripe.PaymentIntent | null
    amount_total?: number | null
    currency?: string | null
  },
  expectedAuth0Id?: string
): Promise<FulfillPassPurchaseResult> {
  if (session.payment_status !== 'paid') {
    return {
      ok: false,
      error: 'Checkout session is not paid yet',
    }
  }

  if (session.metadata?.purchase_type !== 'single_pass') {
    return {
      ok: false,
      error: 'Checkout session is not a pass purchase',
    }
  }

  const { auth0Id, gymId, payload } = buildFulfillmentPayload(session)

  if (!auth0Id || !gymId || Number.isNaN(gymId)) {
    return {
      ok: false,
      error: 'Checkout session is missing auth0_id or gym_id metadata',
    }
  }

  if (expectedAuth0Id && auth0Id !== expectedAuth0Id) {
    return {
      ok: false,
      error: 'Checkout session does not belong to the current user',
    }
  }

  let lastError = 'Pass purchase fulfillment is not available on the API yet'

  for (const endpoint of FULFILLMENT_ENDPOINTS) {
    try {
      const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          auth0_id: auth0Id,
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >

      if (response.ok) {
        return {
          ok: true,
          endpoint,
          data,
        }
      }

      if (isAlreadyFulfilledResponse(response.status, data)) {
        return {
          ok: true,
          endpoint,
          alreadyFulfilled: true,
          data,
        }
      }

      lastError = parseApiErrorBody(data)

      if (response.status !== 404) {
        console.error(
          `[pass-checkout] Fulfillment failed via ${endpoint}:`,
          response.status,
          lastError
        )
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[pass-checkout] Fulfillment error via ${endpoint}:`, lastError)
    }
  }

  try {
    const generateResponse = await fetch(`${API_BASE}/generate_pass`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        auth0_id: auth0Id,
      },
      body: JSON.stringify({
        auth0_id: auth0Id,
        gym_id: gymId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: payload.stripe_payment_intent_id,
        amount: payload.amount,
        currency: payload.currency,
        purchase_type: 'single_pass',
        paid: true,
      }),
    })

    const generateData = (await generateResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    if (generateResponse.ok) {
      return {
        ok: true,
        endpoint: 'generate_pass',
        data: generateData,
      }
    }

    lastError = parseApiErrorBody(generateData)
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }

  return {
    ok: false,
    error: lastError,
  }
}

export async function getStripeCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session | null> {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId)
  } catch (error) {
    console.error('[pass-checkout] Failed to retrieve checkout session:', error)
    return null
  }
}

async function getStripeCustomerIdForUser(
  auth0Id: string,
  userEmail?: string | null
): Promise<string | null> {
  try {
    const userResponse = await fetch(`${API_BASE}/user`, {
      headers: { auth0_id: auth0Id.trim() },
      cache: 'no-store',
    })

    if (userResponse.ok) {
      const userData = (await userResponse.json()) as Record<string, unknown>
      if (
        typeof userData.stripe_customer_id === 'string' &&
        userData.stripe_customer_id
      ) {
        return userData.stripe_customer_id
      }
    }
  } catch (error) {
    console.warn('[pass-checkout] Could not read stripe_customer_id from API:', error)
  }

  try {
    const customers = await stripe.customers.search({
      query: `metadata['auth0_id']:'${auth0Id}'`,
      limit: 1,
    })
    if (customers.data[0]?.id) {
      return customers.data[0].id
    }
  } catch (error) {
    console.warn('[pass-checkout] Stripe customer search failed:', error)
  }

  if (userEmail) {
    try {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      })
      if (customers.data[0]?.id) {
        return customers.data[0].id
      }
    } catch (error) {
      console.warn('[pass-checkout] Stripe customer list failed:', error)
    }
  }

  return null
}

export async function recoverUnfulfilledPassPurchases(
  auth0Id: string,
  userEmail?: string | null,
  sessionId?: string
): Promise<FulfillPassPurchaseResult[]> {
  const results: FulfillPassPurchaseResult[] = []

  if (sessionId) {
    const session = await getStripeCheckoutSession(sessionId)
    if (session) {
      results.push(
        await fulfillPassPurchaseFromStripeSession(session, auth0Id)
      )
    }
    return results
  }

  const customerId = await getStripeCustomerIdForUser(auth0Id, userEmail)
  if (!customerId) {
    return results
  }

  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    limit: 20,
  })

  const paidPassSessions = sessions.data.filter(
    (checkoutSession) =>
      checkoutSession.payment_status === 'paid' &&
      checkoutSession.metadata?.purchase_type === 'single_pass' &&
      (checkoutSession.metadata.auth0_id === auth0Id ||
        checkoutSession.metadata.userId === auth0Id)
  )

  for (const checkoutSession of paidPassSessions) {
    const result = await fulfillPassPurchaseFromStripeSession(
      checkoutSession,
      auth0Id
    )
    results.push(result)
    if (result.ok) {
      break
    }
  }

  return results
}
