import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'
import Stripe from 'stripe'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.customer) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )

          const userId = session.metadata?.userId || ''
          
          // Get subscription price details to determine tier and pricing
          const priceId = subscription.items.data[0]?.price.id
          // You may need to map Stripe price IDs to your tiers
          // For now, using a default tier - you should adjust this based on your pricing structure
          const tier = 'standard' // TODO: Map from Stripe price metadata or product
          const monthlyLimit = 10 // TODO: Get from your pass_pricing table or Stripe metadata
          const price = subscription.items.data[0]?.price.unit_amount ? 
            (subscription.items.data[0].price.unit_amount / 100) : 0

          const startDate = new Date(subscription.current_period_start * 1000)
          const nextBillingDate = new Date(subscription.current_period_end * 1000)

          // Update app_users with stripe_customer_id if not set
          await sql`
            UPDATE app_users 
            SET stripe_customer_id = ${session.customer as string}
            WHERE auth0_id = ${userId}
          `

          // Check if subscription already exists
          const existingSub = await sql`
            SELECT id FROM subscriptions 
            WHERE stripe_subscription_id = ${subscription.id}
            LIMIT 1
          `

          if (existingSub.length > 0) {
            // Update existing subscription
            await sql`
              UPDATE subscriptions
              SET 
                status = ${subscription.status},
                next_billing_date = ${nextBillingDate.toISOString().split('T')[0]},
                updated_at = NOW()
              WHERE stripe_subscription_id = ${subscription.id}
            `
          } else {
            // Insert new subscription
            await sql`
              INSERT INTO subscriptions (
                user_id,
                tier,
                monthly_limit,
                visits_used,
                price,
                start_date,
                next_billing_date,
                status,
                stripe_subscription_id,
                stripe_customer_id,
                guest_passes_limit,
                guest_passes_used
              )
              VALUES (
                ${userId},
                ${tier},
                ${monthlyLimit},
                0,
                ${price},
                ${startDate.toISOString().split('T')[0]},
                ${nextBillingDate.toISOString().split('T')[0]},
                ${subscription.status},
                ${subscription.id},
                ${session.customer as string},
                0,
                0
              )
            `
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const nextBillingDate = new Date(subscription.current_period_end * 1000)
        
        await sql`
          UPDATE subscriptions
          SET 
            status = ${subscription.status},
            next_billing_date = ${nextBillingDate.toISOString().split('T')[0]},
            updated_at = NOW()
          WHERE stripe_subscription_id = ${subscription.id}
        `
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await sql`
          UPDATE subscriptions
          SET 
            status = 'canceled',
            updated_at = NOW()
          WHERE stripe_subscription_id = ${subscription.id}
        `
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

