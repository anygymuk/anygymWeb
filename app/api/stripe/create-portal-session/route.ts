import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { stripe } from '@/lib/stripe'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.sub

    // Get stripe_customer_id from API
    let customerId: string | null = null
    
    try {
      const trimmedAuth0Id = userId.trim()
      const userResponse = await fetch('https://api.any-gym.com/user', {
        headers: {
          'auth0_id': trimmedAuth0Id,
        },
        cache: 'no-store', // Don't cache for portal session
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        customerId = userData.stripe_customer_id || null
      } else if (userResponse.status === 404) {
        console.log('[create-portal-session] User not found in API')
      } else {
        console.error('[create-portal-session] Error fetching user from API:', userResponse.status, userResponse.statusText)
      }
    } catch (apiError: any) {
      console.error('[create-portal-session] Error fetching user from API:', apiError?.message)
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/profile?tab=subscription`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error('Error creating portal session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

