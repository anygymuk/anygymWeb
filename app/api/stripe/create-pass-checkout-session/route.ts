import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'

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

    const response = await fetch(
      'https://api.any-gym.com/purchase_pass_checkout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          auth0_id: auth0Id,
        },
        body: JSON.stringify({
          auth0_id: auth0Id,
          gym_id: gymIdInt,
          success_url: `${origin}/passes?purchase=success`,
          cancel_url: `${origin}/dashboard?purchase=canceled`,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Failed to create pass checkout session' }))
      return NextResponse.json(
        { error: errorData.error || 'Failed to create pass checkout session' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      sessionId: data.session_id || data.sessionId || undefined,
      url: data.checkout_url || data.checkoutUrl || data.url || undefined,
    })
  } catch (error) {
    console.error('[create-pass-checkout-session] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
