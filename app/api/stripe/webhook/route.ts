import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sql } from '@/lib/db'
import Stripe from 'stripe'
import sgMail from '@sendgrid/mail'
import { haversineDistance, getCoordinatesFromPostcode } from '@/lib/geocoding'

// Disable body parsing for webhook - Stripe needs raw body for signature verification
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

export async function POST(request: NextRequest) {
  console.log('🔔 Stripe webhook received')

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !webhookSecret) {
    console.error('❌ Missing webhook signature or secret')
    return NextResponse.json(
      { error: 'Configuration error' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    console.log('✅ Webhook verified:', event.type)
  } catch (err: any) {
    console.error('❌ Invalid signature:', err.message)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  // Respond immediately to Stripe
  const response = NextResponse.json({ received: true })

  // Process asynchronously
  if (event.type === 'checkout.session.completed') {
    processCheckoutSession(event, request).catch((error) => {
      console.error('❌ Processing failed:', error.message)
    })
  } else {
    // Handle other event types synchronously
    try {
      await handleOtherEvents(event)
    } catch (error: any) {
      console.error('❌ Error processing webhook:', error)
    }
  }

  return response
}

async function handleOtherEvents(event: Stripe.Event) {
  switch (event.type) {
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
}

async function processCheckoutSession(
  event: Stripe.Event,
  request: NextRequest
) {
  console.log('🚀 PROCESSING CHECKOUT SESSION')

  const session = event.data.object as Stripe.Checkout.Session
  const tier = session.metadata?.tier

  console.log('📋 Customer ID:', session.customer)
  console.log('📋 Tier:', tier)

  if (!session.customer || !tier) {
    console.error('❌ Missing customer or tier')
    return
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.warn('⚠️ SENDGRID_API_KEY not set - skipping email')
  }

  try {
    // Get customer from Stripe (includes metadata with postcode)
    console.log('🔍 Fetching Stripe customer...')
    const customer = await stripe.customers.retrieve(session.customer as string)
    console.log('✅ Customer retrieved')

    if (customer.deleted) {
      console.error('❌ Customer has been deleted')
      return
    }

    const customerObj = customer as Stripe.Customer
    console.log('📋 Customer email:', customerObj.email)
    console.log('📋 Customer name:', customerObj.name)
    console.log('📋 Customer metadata:', JSON.stringify(customerObj.metadata, null, 2))

    const userEmail = customerObj.email
    const userName = customerObj.name || customerObj.email?.split('@')[0] || 'there'
    const firstName = userName.split(' ')[0]

    // Get auth0_id from customer metadata
    const auth0Id = customerObj.metadata?.auth0_id || customerObj.metadata?.user_id || session.metadata?.userId

    if (!auth0Id) {
      console.error('❌ No auth0_id found in customer metadata')
      return
    }

    // Store Stripe customer ID in app_users
    await sql`
      UPDATE app_users 
      SET stripe_customer_id = ${session.customer as string}
      WHERE auth0_id = ${auth0Id}
    `
    console.log('✅ Stored Stripe customer ID in app_users')

    // Cancel any existing active subscriptions
    await sql`
      UPDATE subscriptions 
      SET status = 'cancelled' 
      WHERE user_id = ${auth0Id} 
      AND status = 'active'
    `
    console.log('✅ Cancelled existing subscriptions')

    // Get subscription details from metadata
    const monthlyLimit = parseInt(session.metadata?.monthly_limit || '8', 10)
    const guestPassesLimit = parseInt(session.metadata?.guest_passes_limit || '0', 10)
    const price = session.amount_total ? session.amount_total / 100 : 0

    // Get subscription object to get dates
    const subscriptionId = session.subscription as string
    let subscription: Stripe.Subscription | null = null
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId)
    }

    const startDate = subscription
      ? new Date(subscription.current_period_start * 1000)
      : new Date()
    const nextBillingDate = subscription
      ? new Date(subscription.current_period_end * 1000)
      : new Date()

    // Log subscription data before insertion
    console.log('📝 Subscription data to insert:')
    console.log('  - user_id (auth0_id):', auth0Id)
    console.log('  - tier:', tier)
    console.log('  - monthly_limit:', monthlyLimit)
    console.log('  - guest_passes_limit:', guestPassesLimit)
    console.log('  - price:', price)
    console.log('  - start_date:', startDate.toISOString().split('T')[0])
    console.log('  - next_billing_date:', nextBillingDate.toISOString().split('T')[0])
    console.log('  - stripe_subscription_id:', subscriptionId || null)
    console.log('  - stripe_customer_id:', session.customer as string)

    // Create new subscription in database
    try {
      const insertResult = await sql`
        INSERT INTO subscriptions (
          user_id, tier, monthly_limit, price, start_date, next_billing_date,
          visits_used, status, stripe_subscription_id, stripe_customer_id,
          guest_passes_limit, guest_passes_used, created_at, updated_at
        ) VALUES (
          ${auth0Id},
          ${tier},
          ${monthlyLimit},
          ${price},
          ${startDate.toISOString().split('T')[0]},
          ${nextBillingDate.toISOString().split('T')[0]},
          0,
          'active',
          ${subscriptionId || null},
          ${session.customer as string},
          ${guestPassesLimit},
          0,
          NOW(),
          NOW()
        )
        RETURNING id
      `
      console.log('✅ Created subscription in database with ID:', insertResult[0]?.id)
    } catch (insertError: any) {
      console.error('❌ Failed to create subscription in database:')
      console.error('  Error message:', insertError?.message)
      console.error('  Error code:', insertError?.code)
      console.error('  Error detail:', insertError?.detail)
      console.error('  Error hint:', insertError?.hint)
      console.error('  Full error:', JSON.stringify(insertError, null, 2))
      // Re-throw to ensure the error is logged but don't break the webhook
      throw insertError
    }

    // Get user's postcode from Stripe customer metadata
    let postcode = customerObj.metadata?.postcode || null
    let userCoords: { latitude: number; longitude: number } | null = null

    console.log('📍 Postcode from Stripe metadata:', postcode)

    // If we have a postcode, geocode it
    if (postcode) {
      console.log('🗺️ Geocoding postcode:', postcode)
      userCoords = await getCoordinatesFromPostcode(postcode)
      console.log('📍 User coordinates:', userCoords)
    } else {
      console.log('⚠️ No postcode in Stripe metadata - cannot calculate distances')
    }

    // Fetch gyms
    console.log('🏋️ Fetching gyms from database...')
    const gymsResult = await sql`
      SELECT g.*, 
             gc.name as chain_name,
             gc.logo_url as chain_logo
      FROM gyms g
      LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
      WHERE g.status = 'active'
        AND g.latitude IS NOT NULL
        AND g.longitude IS NOT NULL
    `
    console.log('🏋️ Total gyms found:', gymsResult.length)

    let closestGyms: any[] = []

    if (userCoords && gymsResult.length > 0) {
      console.log('📏 Calculating distances from user location:', userCoords)
      const gymsWithDistance = gymsResult.map((gym: any) => {
        const distance = haversineDistance(
          userCoords!.latitude,
          userCoords!.longitude,
          parseFloat(gym.latitude),
          parseFloat(gym.longitude)
        )
        return {
          ...gym,
          distance: distance,
        }
      })

      // Sort by distance
      gymsWithDistance.sort((a: any, b: any) => a.distance - b.distance)

      // Log top 10 for debugging
      console.log('📏 Top 10 closest gyms:')
      gymsWithDistance.slice(0, 10).forEach((gym: any, idx: number) => {
        console.log(
          `  ${idx + 1}. ID: ${gym.id}, ${gym.name} (${gym.chain_name}) - ${gym.distance.toFixed(2)} km`
        )
      })

      closestGyms = gymsWithDistance.slice(0, 3)
      console.log('✅ Selected top 3 gyms for email')
    } else {
      closestGyms = gymsResult.slice(0, 3)
      console.log('⚠️ Using first 3 gyms (no user coordinates available)')
    }

    // Send welcome email if SendGrid is configured
    if (process.env.SENDGRID_API_KEY && userEmail) {
      await sendWelcomeEmail(
        request,
        userEmail,
        firstName,
        tier,
        closestGyms
      )
    } else {
      console.log('⚠️ Skipping email - SendGrid not configured or no email')
    }

    console.log('🏁 PROCESSING COMPLETE')
  } catch (error: any) {
    console.error('❌ Processing error:', error.message)
    console.error('❌ Stack:', error.stack)
    throw error
  }
}

async function sendWelcomeEmail(
  request: NextRequest,
  userEmail: string,
  firstName: string,
  tier: string,
  closestGyms: any[]
) {
  console.log('📧 EMAIL DETAILS:')
  console.log('  To:', userEmail)
  console.log('  First Name:', firstName)
  console.log('  Membership:', tier)

  const membershipName = tier.charAt(0).toUpperCase() + tier.slice(1)

  const emailData: any = {
    to: userEmail,
    from: process.env.SENDGRID_FROM_EMAIL || 'naaman@any-gym.com',
    templateId: process.env.SENDGRID_TEMPLATE_ID || 'd-d31148c503f543dda5ef29beb5bcd30b',
    dynamicTemplateData: {
      Recipient_Name: firstName,
      Membership_Name: membershipName,
    },
  }

  // Add gym data
  for (let i = 0; i < 3; i++) {
    const gymIndex = i + 1
    const gym = closestGyms[i]

    if (gym) {
      let gymImage = gym.chain_logo || 'https://via.placeholder.com/200x150?text=Gym'
      gymImage = gymImage.replace('.svg', '.png')

      const appHost = request.headers.get('host') || 'any-gym.com'
      const protocol = appHost.includes('localhost') ? 'http' : 'https'
      const gymUrl = `${protocol}://${appHost}/gym-details?id=${gym.id}`

      emailData.dynamicTemplateData[`Gym_${gymIndex}_Name`] = gym.name
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Address`] = gym.address || ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Postcode`] = gym.postcode || ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_City`] = gym.city || ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Url`] = gymUrl
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Image`] = gymImage

      console.log(
        `  Gym ${gymIndex}: ID ${gym.id} - ${gym.name} (${gym.chain_name})${gym.distance ? ` - ${gym.distance.toFixed(2)} km` : ''}`
      )
      console.log(`    Address: ${gym.address}`)
      console.log(`    Postcode: ${gym.postcode}`)
      console.log(`    City: ${gym.city}`)
      console.log(`    URL: ${gymUrl}`)
      console.log(`    Image: ${gymImage}`)
    } else {
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Name`] = ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Address`] = ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Postcode`] = ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_City`] = ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Url`] = ''
      emailData.dynamicTemplateData[`Gym_${gymIndex}_Image`] = ''
    }
  }

  // Send email
  console.log('📧 FULL EMAIL DATA TO SENDGRID:')
  console.log(JSON.stringify(emailData, null, 2))

  try {
    const sendResult = await sgMail.send(emailData)
    console.log('✅✅✅ EMAIL SENT SUCCESSFULLY! ✅✅✅')
    console.log('📧 SendGrid status:', sendResult[0]?.statusCode)
    console.log('📧 SendGrid message ID:', sendResult[0]?.headers?.['x-message-id'])
  } catch (emailError: any) {
    console.error('❌❌❌ EMAIL SEND FAILED! ❌❌❌')
    console.error('❌ Error:', emailError.message)
    if (emailError.response) {
      console.error('❌ SendGrid error:', JSON.stringify(emailError.response.body, null, 2))
    }
    // Don't throw - email failure shouldn't break the webhook
  }
}
