import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import {
  fulfillPassPurchaseFromStripeSession,
  getStripeCheckoutSession,
  recoverUnfulfilledPassPurchases,
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
    const sessionId =
      typeof body.sessionId === 'string' ? body.sessionId : undefined
    const recoverRecent = body.recoverRecent === true

    if (sessionId) {
      const checkoutSession = await getStripeCheckoutSession(sessionId)
      if (!checkoutSession) {
        return NextResponse.json(
          { error: 'Checkout session not found' },
          { status: 404 }
        )
      }

      const result = await fulfillPassPurchaseFromStripeSession(
        checkoutSession,
        auth0Id
      )

      if (!result.ok) {
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Failed to fulfill pass purchase',
          },
          { status: 502 }
        )
      }

      return NextResponse.json({
        success: true,
        alreadyFulfilled: result.alreadyFulfilled === true,
        endpoint: result.endpoint,
      })
    }

    if (recoverRecent) {
      const results = await recoverUnfulfilledPassPurchases(
        auth0Id,
        session.user.email
      )
      const successful = results.find((result) => result.ok)

      if (successful) {
        return NextResponse.json({
          success: true,
          alreadyFulfilled: successful.alreadyFulfilled === true,
          endpoint: successful.endpoint,
          recovered: true,
        })
      }

      const lastError =
        results.find((result) => result.error)?.error ||
        'No paid pass purchases found to recover'

      return NextResponse.json(
        {
          success: false,
          error: lastError,
          attempted: results.length,
        },
        { status: results.length > 0 ? 502 : 404 }
      )
    }

    return NextResponse.json(
      { error: 'sessionId or recoverRecent is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[fulfill-purchase] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
