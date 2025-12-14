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
    let customerId: string | undefined

    // Try to get stripe_customer_id from API
    try {
      const trimmedAuth0Id = userId.trim()
      const userResponse = await fetch('https://api.any-gym.com/user', {
        headers: {
          'auth0_id': trimmedAuth0Id,
        },
        cache: 'no-store', // Don't cache for checkout session
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        
        // Check if user has stripe_customer_id in API response
        const existingCustomerId = userData.stripe_customer_id
        if (existingCustomerId) {
          customerId = existingCustomerId
          
          // Update customer metadata to ensure auth0_id is set
          try {
            await stripe.customers.update(existingCustomerId, {
              metadata: {
                userId: userId,
                auth0_id: userId,
              },
            })
          } catch (updateError) {
            console.warn('[create-checkout-session] Failed to update customer metadata:', updateError)
          }
        }
      }
    } catch (apiError: any) {
      console.warn('[create-checkout-session] Error fetching user from API:', apiError?.message)
      // Continue to create new customer below
    }

    // If no customer ID found, create new Stripe customer
    if (!customerId) {
      console.log('[create-checkout-session] No existing customer found, creating new Stripe customer')
      const customer = await stripe.customers.create({
        email: userEmail || undefined,
        metadata: {
          userId: userId,
          auth0_id: userId, // Also include as auth0_id for webhook compatibility
        },
      })
      customerId = customer.id

      // Update user in API with stripe_customer_id
      try {
        const trimmedAuth0Id = userId.trim()
        await fetch('https://api.any-gym.com/user/update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'auth0_id': trimmedAuth0Id,
          },
          body: JSON.stringify({
            stripe_customer_id: customerId,
          }),
        })
        console.log('[create-checkout-session] Updated user with stripe_customer_id via API')
      } catch (updateError: any) {
        console.warn('[create-checkout-session] Failed to update user with stripe_customer_id:', updateError?.message)
        // Continue even if API update fails - webhook will handle it
      }
    }

    console.log('[create-checkout-session] Creating checkout session for price:', priceId)
    console.log('[create-checkout-session] Customer ID:', customerId)
    
    // Cancel any existing active subscriptions in Stripe before creating a new one
    // Note: The webhook will handle updating subscription status in the API
    try {
      const existingSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 10,
      })
      
      if (existingSubscriptions.data.length > 0) {
        console.log(`[create-checkout-session] Found ${existingSubscriptions.data.length} active subscription(s), cancelling...`)
        for (const sub of existingSubscriptions.data) {
          try {
            // Cancel in Stripe - webhook will handle API updates
            await stripe.subscriptions.cancel(sub.id)
            console.log(`[create-checkout-session] Cancelled subscription in Stripe: ${sub.id}`)
            console.log(`[create-checkout-session] Webhook will handle subscription status update in API`)
          } catch (cancelError: any) {
            console.error(`[create-checkout-session] Error cancelling subscription ${sub.id}:`, cancelError.message)
            // Continue with other subscriptions even if one fails
          }
        }
      }
    } catch (listError: any) {
      console.warn('[create-checkout-session] Error listing existing subscriptions:', listError.message)
      // Continue with checkout session creation even if we can't cancel existing subscriptions
    }
    
    // Get product and price details to extract metadata
    const price = await stripe.prices.retrieve(priceId)
    const product = await stripe.products.retrieve(price.product as string)
    
    // Determine tier from product metadata or name
    let tier = 'standard'
    if (product.metadata?.tierGyms) {
      tier = product.metadata.tierGyms
    } else {
      const name = product.name.toLowerCase()
      if (name.includes('premium')) {
        tier = 'premium'
      } else if (name.includes('elite')) {
        tier = 'elite'
      }
    }
    
    // Get monthly limit and guest passes from product metadata
    const monthlyLimit = parseInt(product.metadata?.['Gym Passes'] || '8', 10)
    const guestPassesLimit = parseInt(product.metadata?.['Guest Passes'] || '0', 10)
    
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
      success_url: `${request.nextUrl.origin}/dashboard?onboarding=complete`,
      cancel_url: `${request.nextUrl.origin}/onboarding?step=4&canceled=true`,
      metadata: {
        userId: userId,
        priceId: priceId,
        tier: tier,
        monthly_limit: monthlyLimit.toString(),
        guest_passes_limit: guestPassesLimit.toString(),
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

