import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import {
  createPassCheckoutViaApi,
  createPassCheckoutViaStripe,
  ensureFreeTierOnApi,
  isMembershipRequiredError,
} from '@/lib/pass-checkout-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub
    const body = await request.json().catch(() => ({}))
    const { gymId } = body

    if (!gymId) {
      return NextResponse.json({ error: 'Gym ID is required' }, { status: 400 })
    }

    const gymIdInt =
      typeof gymId === 'string' ? parseInt(gymId, 10) : Number(gymId)

    if (isNaN(gymIdInt)) {
      return NextResponse.json({ error: 'Invalid gym ID format' }, { status: 400 })
    }

    const origin = request.nextUrl.origin

    await ensureFreeTierOnApi(auth0Id)

    const apiResult = await createPassCheckoutViaApi(auth0Id, gymIdInt, origin)
    if (apiResult.ok) {
      return NextResponse.json({
        sessionId: apiResult.sessionId,
        url: apiResult.url,
      })
    }

    const shouldFallback =
      isMembershipRequiredError(apiResult.error, apiResult.status) ||
      apiResult.status === 404 ||
      apiResult.status === 501

    if (shouldFallback) {
      console.warn(
        '[create-pass-checkout-session] API checkout unavailable, using Stripe fallback:',
        apiResult.error
      )

      const stripeResult = await createPassCheckoutViaStripe({
        auth0Id,
        userEmail: session.user.email,
        gymId: gymIdInt,
        origin,
      })

      if (stripeResult.ok) {
        return NextResponse.json({
          sessionId: stripeResult.sessionId,
          url: stripeResult.url,
        })
      }

      return NextResponse.json(
        { error: stripeResult.error || 'Failed to create pass checkout session' },
        { status: stripeResult.status || 500 }
      )
    }

    return NextResponse.json(
      { error: apiResult.error || 'Failed to create pass checkout session' },
      { status: apiResult.status || 502 }
    )
  } catch (error) {
    console.error('[create-pass-checkout-session] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
