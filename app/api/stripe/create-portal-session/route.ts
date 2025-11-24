import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'

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

    // Check subscriptions table first
    let customerId: string | null = null
    
    const subscriptionResult = await sql`
      SELECT stripe_customer_id FROM subscriptions 
      WHERE user_id = ${userId}
      LIMIT 1
    `

    if (subscriptionResult.length > 0 && subscriptionResult[0].stripe_customer_id) {
      customerId = subscriptionResult[0].stripe_customer_id
    } else {
      // Fallback to app_users table
      const userResult = await sql`
        SELECT stripe_customer_id FROM app_users 
        WHERE auth0_id = ${userId}
        LIMIT 1
      `
      
      if (userResult.length > 0 && userResult[0].stripe_customer_id) {
        customerId = userResult[0].stripe_customer_id
      }
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      )
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/subscription`,
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

