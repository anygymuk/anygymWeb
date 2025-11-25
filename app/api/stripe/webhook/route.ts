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

  // Get raw body as text for signature verification
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  // Log for debugging (but don't log the full body in production)
  console.log('📋 Webhook signature present:', !!signature)
  console.log('📋 Webhook secret configured:', !!webhookSecret)
  console.log('📋 Body length:', body.length)
  console.log('📋 Body preview (first 100 chars):', body.substring(0, 100))

  if (!signature) {
    console.error('❌ Missing webhook signature header')
    console.error('📋 Available headers:', Object.fromEntries(request.headers.entries()))
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  if (!webhookSecret) {
    console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable')
    return NextResponse.json(
      { error: 'Configuration error' },
      { status: 500 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    console.log('✅ Webhook verified:', event.type)
    console.log('📋 Event ID:', event.id)
  } catch (err: any) {
    console.error('❌ Invalid signature:', err.message)
    console.error('❌ Error type:', err.type)
    console.error('❌ Signature header value:', signature?.substring(0, 50) + '...')
    console.error('❌ Webhook secret prefix:', webhookSecret?.substring(0, 10) + '...')
    
    // For debugging: log if this might be a secret mismatch
    if (err.message.includes('No signatures found')) {
      console.error('⚠️ This usually means:')
      console.error('  1. Wrong webhook secret (check STRIPE_WEBHOOK_SECRET)')
      console.error('  2. Body was modified before reaching this handler')
      console.error('  3. Using test mode secret for live events (or vice versa)')
    }
    
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
      console.log('🔄 Processing subscription.updated event')
      console.log('📋 Subscription ID:', subscription.id)
      console.log('📋 Subscription status:', subscription.status)
      console.log('📋 Customer ID:', subscription.customer)
      console.log('📋 current_period_end:', subscription.current_period_end)
      console.log('📋 Subscription items count:', subscription.items.data.length)

      // Get customer to find auth0_id
      let auth0Id: string | null = null
      try {
        const customer = await stripe.customers.retrieve(subscription.customer as string)
        if (!customer.deleted) {
          const customerObj = customer as Stripe.Customer
          auth0Id = customerObj.metadata?.auth0_id || customerObj.metadata?.user_id || null
          console.log('📋 Found auth0_id from customer metadata:', auth0Id)
        }
      } catch (customerError: any) {
        console.error('❌ Error retrieving customer:', customerError.message)
      }

      // If we have auth0_id and subscription is active, cancel other active subscriptions for this user
      if (auth0Id && subscription.status === 'active') {
        const trimmedAuth0Id = auth0Id.trim()
        console.log('🔄 Canceling other active subscriptions for user:', trimmedAuth0Id)
        const canceledOthers = await sql`
          UPDATE subscriptions 
          SET status = 'canceled', updated_at = NOW()
          WHERE user_id = ${trimmedAuth0Id} 
          AND status = 'active'
          AND stripe_subscription_id != ${subscription.id}
          RETURNING id
        `
        console.log(`✅ Canceled ${canceledOthers.length} other active subscription(s) for user`)
      }

      // Get subscription details from the first item (price/product)
      let tier = 'standard'
      let monthlyLimit = 8
      let guestPassesLimit = 0
      let price = 0

      if (subscription.items.data.length > 0) {
        const subscriptionItem = subscription.items.data[0]
        const priceId = subscriptionItem.price.id
        
        try {
          // Retrieve price and product to get metadata
          const priceObj = await stripe.prices.retrieve(priceId)
          const product = await stripe.products.retrieve(priceObj.product as string)
          
          // Determine tier from product metadata or name
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
          
          // Get limits from product metadata
          monthlyLimit = parseInt(product.metadata?.['Gym Passes'] || '8', 10)
          guestPassesLimit = parseInt(product.metadata?.['Guest Passes'] || '0', 10)
          
          // Get price amount
          if (priceObj.unit_amount) {
            price = priceObj.unit_amount / 100
          }
          
          console.log('📋 Updated tier:', tier)
          console.log('📋 Updated monthly_limit:', monthlyLimit)
          console.log('📋 Updated guest_passes_limit:', guestPassesLimit)
          console.log('📋 Updated price:', price)
        } catch (productError: any) {
          console.warn('⚠️ Could not retrieve product details:', productError.message)
          // Continue with existing values from database
        }
      }

      // Validate current_period_end before creating date
      let dateString: string | null = null
      if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
        const nextBillingDate = new Date(subscription.current_period_end * 1000)
        
        // Validate the date is valid
        if (!isNaN(nextBillingDate.getTime())) {
          dateString = nextBillingDate.toISOString().split('T')[0]
          console.log('📅 Next billing date:', dateString)
        } else {
          console.error('❌ Invalid date created from current_period_end:', subscription.current_period_end)
        }
      } else {
        console.warn('⚠️ No valid current_period_end in subscription')
      }

      // Handle cancellation - if status is canceled, mark as canceled in DB
      const dbStatus = subscription.status === 'canceled'
        ? 'canceled' 
        : subscription.status

      // Check if subscription exists in database
      const existingSub = await sql`
        SELECT id, user_id FROM subscriptions
        WHERE stripe_subscription_id = ${subscription.id}
        LIMIT 1
      `

      if (existingSub.length > 0) {
        // Update existing subscription
        if (dateString) {
          await sql`
            UPDATE subscriptions
            SET 
              status = ${dbStatus},
              tier = ${tier},
              monthly_limit = ${monthlyLimit},
              guest_passes_limit = ${guestPassesLimit},
              price = ${price},
              next_billing_date = ${dateString},
              updated_at = NOW()
            WHERE stripe_subscription_id = ${subscription.id}
          `
          console.log('✅ Updated subscription in database (with all fields)')
        } else {
          await sql`
            UPDATE subscriptions
            SET 
              status = ${dbStatus},
              tier = ${tier},
              monthly_limit = ${monthlyLimit},
              guest_passes_limit = ${guestPassesLimit},
              price = ${price},
              updated_at = NOW()
            WHERE stripe_subscription_id = ${subscription.id}
          `
          console.log('✅ Updated subscription in database (without date)')
        }
      } else if (auth0Id && subscription.status === 'active') {
        // Subscription doesn't exist in DB but is active - create it
        // This can happen if webhook order is wrong or subscription was created outside normal flow
        console.log('⚠️ Subscription not found in DB, creating new record...')
        const startDate = new Date(subscription.current_period_start * 1000)
        const nextBillingDate = subscription.current_period_end 
          ? new Date(subscription.current_period_end * 1000)
          : new Date()
        
        await sql`
          INSERT INTO subscriptions (
            user_id, tier, monthly_limit, price, start_date, next_billing_date,
            visits_used, status, stripe_subscription_id, stripe_customer_id,
            guest_passes_limit, guest_passes_used, created_at, updated_at
          ) VALUES (
            ${auth0Id.trim()},
            ${tier},
            ${monthlyLimit},
            ${price},
            ${startDate.toISOString().split('T')[0]},
            ${nextBillingDate.toISOString().split('T')[0]},
            0,
            'active',
            ${subscription.id},
            ${subscription.customer as string},
            ${guestPassesLimit},
            0,
            NOW(),
            NOW()
          )
        `
        console.log('✅ Created missing subscription in database')
      }
      
      if (dbStatus === 'canceled') {
        console.log('⚠️ Subscription has been canceled')
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      console.log('🗑️ Processing subscription.deleted event')
      console.log('📋 Subscription ID:', subscription.id)

      await sql`
        UPDATE subscriptions
        SET 
          status = 'canceled',
          updated_at = NOW()
        WHERE stripe_subscription_id = ${subscription.id}
      `
      console.log('✅ Marked subscription as canceled')
      break
    }

    default:
      console.log('ℹ️ Unhandled event type:', event.type)
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

    console.log('🔍 Looking for auth0_id in:')
    console.log('  - customer.metadata.auth0_id:', customerObj.metadata?.auth0_id)
    console.log('  - customer.metadata.user_id:', customerObj.metadata?.user_id)
    console.log('  - session.metadata.userId:', session.metadata?.userId)
    console.log('✅ Found auth0_id:', auth0Id)

    if (!auth0Id) {
      console.error('❌ No auth0_id found in customer metadata')
      console.error('📋 Customer metadata:', JSON.stringify(customerObj.metadata, null, 2))
      console.error('📋 Session metadata:', JSON.stringify(session.metadata, null, 2))
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
    const canceledCount = await sql`
      UPDATE subscriptions 
      SET status = 'canceled', updated_at = NOW()
      WHERE user_id = ${auth0Id.trim()} 
      AND status = 'active'
      RETURNING id
    `
    console.log(`✅ Canceled ${canceledCount.length} existing subscription(s)`)
    if (canceledCount.length > 0) {
      console.log('📋 Canceled subscription IDs:', canceledCount.map((s: any) => s.id).join(', '))
    }

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
      // First verify the subscription doesn't already exist
      const existingCheck = await sql`
        SELECT id FROM subscriptions
        WHERE stripe_subscription_id = ${subscriptionId || ''}
        LIMIT 1
      `
      
      if (existingCheck.length > 0) {
        console.log('⚠️ Subscription already exists in database, updating instead...')
        await sql`
          UPDATE subscriptions
          SET 
            user_id = ${auth0Id.trim()},
            tier = ${tier},
            monthly_limit = ${monthlyLimit},
            price = ${price},
            start_date = ${startDate.toISOString().split('T')[0]},
            next_billing_date = ${nextBillingDate.toISOString().split('T')[0]},
            status = 'active',
            stripe_customer_id = ${session.customer as string},
            guest_passes_limit = ${guestPassesLimit},
            updated_at = NOW()
          WHERE stripe_subscription_id = ${subscriptionId || ''}
        `
        console.log('✅ Updated existing subscription in database')
        
        // Verify the update
        const verifyUpdate = await sql`
          SELECT id, user_id, status, stripe_subscription_id 
          FROM subscriptions 
          WHERE stripe_subscription_id = ${subscriptionId || ''}
          LIMIT 1
        `
        console.log('🔍 Updated subscription verification:', JSON.stringify(verifyUpdate[0], null, 2))
      } else {
        const insertResult = await sql`
          INSERT INTO subscriptions (
            user_id, tier, monthly_limit, price, start_date, next_billing_date,
            visits_used, status, stripe_subscription_id, stripe_customer_id,
            guest_passes_limit, guest_passes_used, created_at, updated_at
          ) VALUES (
            ${auth0Id.trim()},
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
        
        // Verify the subscription was created correctly
        const verifyResult = await sql`
          SELECT id, user_id, status, stripe_subscription_id 
          FROM subscriptions 
          WHERE id = ${insertResult[0]?.id}
          LIMIT 1
        `
        console.log('🔍 Verification query result:', JSON.stringify(verifyResult[0], null, 2))
        
        // Also verify by user_id
        const verifyByUserId = await sql`
          SELECT id, user_id, status, stripe_subscription_id 
          FROM subscriptions 
          WHERE user_id = ${auth0Id.trim()}
          AND status = 'active'
          ORDER BY created_at DESC
        `
        console.log('🔍 Active subscriptions for user:', verifyByUserId.length)
        verifyByUserId.forEach((sub: any, idx: number) => {
          console.log(`  ${idx + 1}. ID: ${sub.id}, status: ${sub.status}, stripe_id: ${sub.stripe_subscription_id}, user_id: ${sub.user_id}`)
        })
      }
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

    // Get user's postcode - try Stripe metadata first, then fall back to database
    let postcode = customerObj.metadata?.postcode || null
    console.log('📍 Postcode from Stripe metadata:', postcode)

    // If no postcode in Stripe metadata, try to get it from app_users table
    if (!postcode) {
      console.log('🔍 Postcode not in Stripe metadata, checking app_users table...')
      try {
        const userResult = await sql`
          SELECT address_postcode 
          FROM app_users 
          WHERE auth0_id = ${auth0Id}
          LIMIT 1
        `
        if (userResult.length > 0 && userResult[0].address_postcode) {
          postcode = userResult[0].address_postcode
          console.log('✅ Found postcode in database:', postcode)
        } else {
          console.log('⚠️ No postcode found in database either')
        }
      } catch (dbError: any) {
        console.error('❌ Error fetching postcode from database:', dbError?.message)
        // Continue without postcode - will use first 3 gyms
      }
    }

    let userCoords: { latitude: number; longitude: number } | null = null

    // If we have a postcode, geocode it
    if (postcode) {
      console.log('🗺️ Geocoding postcode:', postcode)
      try {
        userCoords = await getCoordinatesFromPostcode(postcode)
        if (userCoords) {
          console.log('✅ User coordinates:', userCoords)
        } else {
          console.log('⚠️ Geocoding returned no coordinates')
        }
      } catch (geocodeError: any) {
        console.error('❌ Error geocoding postcode:', geocodeError?.message)
        // Continue without coordinates - will use first 3 gyms
      }
    } else {
      console.log('⚠️ No postcode available - cannot calculate distances')
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
      console.log('📋 Closest gyms:', closestGyms.map((g: any) => `${g.name} (${g.id})`).join(', '))
    } else {
      if (gymsResult.length > 0) {
        closestGyms = gymsResult.slice(0, 3)
        console.log('⚠️ Using first 3 gyms (no user coordinates available)')
        console.log('📋 Selected gyms:', closestGyms.map((g: any) => `${g.name} (${g.id})`).join(', '))
      } else {
        console.error('❌ No gyms found in database!')
      }
    }
    
    console.log('📊 Final closestGyms array length:', closestGyms.length)

    // Send welcome email if SendGrid is configured
    console.log('📧 Preparing to send email...')
    console.log('  - SendGrid API Key configured:', !!process.env.SENDGRID_API_KEY)
    console.log('  - User email:', userEmail)
    console.log('  - Closest gyms count:', closestGyms.length)
    
    if (process.env.SENDGRID_API_KEY && userEmail) {
      if (closestGyms.length > 0) {
        console.log('📧 Sending welcome email with', closestGyms.length, 'gyms')
        try {
          await sendWelcomeEmail(
            request,
            userEmail,
            firstName,
            tier,
            closestGyms
          )
          console.log('✅ Email sending completed')
        } catch (emailError: any) {
          console.error('❌ Error in sendWelcomeEmail:', emailError?.message)
          console.error('❌ Stack:', emailError?.stack)
          // Don't throw - continue processing
        }
      } else {
        console.log('⚠️ Skipping email - no gyms available to include')
      }
    } else {
      if (!process.env.SENDGRID_API_KEY) {
        console.log('⚠️ Skipping email - SENDGRID_API_KEY not configured')
      }
      if (!userEmail) {
        console.log('⚠️ Skipping email - no user email available')
      }
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
  console.log('📧 ========== SEND WELCOME EMAIL START ==========')
  console.log('📧 EMAIL DETAILS:')
  console.log('  To:', userEmail)
  console.log('  First Name:', firstName)
  console.log('  Membership:', tier)
  console.log('  Number of gyms to include:', closestGyms.length)

  if (!closestGyms || closestGyms.length === 0) {
    console.error('❌ No gyms provided to sendWelcomeEmail')
    return
  }

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

  console.log('📧 Building gym data for email...')
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
  
  // Validate email data before sending
  if (!emailData.to) {
    console.error('❌ Email data missing recipient (to)')
    return
  }
  if (!emailData.from) {
    console.error('❌ Email data missing sender (from)')
    return
  }
  if (!emailData.templateId) {
    console.error('❌ Email data missing template ID')
    return
  }

  console.log('📧 Attempting to send email via SendGrid...')
  try {
    const sendResult = await sgMail.send(emailData)
    console.log('✅✅✅ EMAIL SENT SUCCESSFULLY! ✅✅✅')
    console.log('📧 SendGrid status:', sendResult[0]?.statusCode)
    console.log('📧 SendGrid message ID:', sendResult[0]?.headers?.['x-message-id'])
  } catch (emailError: any) {
    console.error('❌❌❌ EMAIL SEND FAILED! ❌❌❌')
    console.error('❌ Error message:', emailError.message)
    console.error('❌ Error code:', emailError.code)
    if (emailError.response) {
      console.error('❌ SendGrid response status:', emailError.response.statusCode)
      console.error('❌ SendGrid error body:', JSON.stringify(emailError.response.body, null, 2))
    }
    if (emailError.stack) {
      console.error('❌ Error stack:', emailError.stack)
    }
    // Don't throw - email failure shouldn't break the webhook
  }
  console.log('📧 ========== SEND WELCOME EMAIL END ==========')
}
