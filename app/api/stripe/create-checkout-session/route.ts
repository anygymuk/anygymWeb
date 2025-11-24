import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.sub
    const userEmail = session.user.email

    // Get priceId from request body, or fall back to env variable
    const body = await request.json().catch(() => ({}))
    const priceId = body.priceId || process.env.STRIPE_PRICE_ID

    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price ID not configured' },
        { status: 500 }
      )
    }

    // Get or create Stripe customer
    let customerId: string

    // Check app_users table first
    const userResult = await sql`
      SELECT stripe_customer_id FROM app_users 
      WHERE auth0_id = ${userId}
      LIMIT 1
    `

    if (userResult.length > 0 && userResult[0].stripe_customer_id) {
      customerId = userResult[0].stripe_customer_id
    } else {
      // Check subscriptions table as fallback
      const subscriptionResult = await sql`
        SELECT stripe_customer_id FROM subscriptions 
        WHERE user_id = ${userId}
        LIMIT 1
      `

      if (subscriptionResult.length > 0 && subscriptionResult[0].stripe_customer_id) {
        customerId = subscriptionResult[0].stripe_customer_id
      } else {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: userEmail || undefined,
          metadata: {
            userId: userId,
          },
        })
        customerId = customer.id

        // Update app_users with stripe_customer_id
        await sql`
          UPDATE app_users 
          SET stripe_customer_id = ${customerId}
          WHERE auth0_id = ${userId}
        `
      }
    }

    console.log('[create-checkout-session] Creating checkout session for price:', priceId)
    console.log('[create-checkout-session] Customer ID:', customerId)
    
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${request.nextUrl.origin}/subscription?success=true`,
      cancel_url: `${request.nextUrl.origin}/subscription?canceled=true`,
      metadata: {
        userId: userId,
        priceId: priceId,
      },
      allow_promotion_codes: true,
    })

    console.log('[create-checkout-session] Checkout session created:', checkoutSession.id)
    return NextResponse.json({ sessionId: checkoutSession.id })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

