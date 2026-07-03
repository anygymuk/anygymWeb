import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import Stripe from 'stripe'
import sgMail from '@sendgrid/mail'
import { haversineDistance, getCoordinatesFromPostcode } from '@/lib/geocoding'
import { fulfillPassPurchaseFromStripeSession } from '@/lib/pass-checkout-server'

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
      console.log('ℹ️ Subscription management is handled by the API')
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      console.log('🗑️ Processing subscription.deleted event')
      console.log('📋 Subscription ID:', subscription.id)
      console.log('ℹ️ Subscription management is handled by the API')
      break
    }

    default:
      console.log('ℹ️ Unhandled event type:', event.type)
  }
}

async function fulfillPassPurchaseOnApi(
  session: Stripe.Checkout.Session
): Promise<void> {
  const result = await fulfillPassPurchaseFromStripeSession(session)

  if (!result.ok) {
    console.error('[webhook] Pass purchase fulfillment failed:', result.error)
    return
  }

  console.log(
    '[webhook] Pass purchase fulfilled via',
    result.endpoint,
    result.alreadyFulfilled ? '(already fulfilled)' : ''
  )
}

async function processCheckoutSession(
  event: Stripe.Event,
  request: NextRequest
) {
  console.log('🚀 PROCESSING CHECKOUT SESSION')

  const session = event.data.object as Stripe.Checkout.Session

  if (session.metadata?.purchase_type === 'single_pass') {
    await fulfillPassPurchaseOnApi(session)
    return
  }

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

    // Subscription and user management is handled by the API
    console.log('ℹ️ Subscription and user management is handled by the API')

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

    // Subscription creation is handled by the API
    console.log('ℹ️ Subscription creation is handled by the API')

    // Get user's postcode from Stripe metadata only
    let postcode = customerObj.metadata?.postcode || null
    console.log('📍 Postcode from Stripe metadata:', postcode)
    if (!postcode) {
      console.log('⚠️ No postcode in Stripe metadata - will use first 3 gyms')
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

    // Fetch gyms from API
    console.log('🏋️ Fetching gyms from API...')
    let gymsResult: any[] = []
    
    if (!auth0Id) {
      console.error('❌ Cannot fetch gyms - no auth0_id available')
    } else {
      try {
        const trimmedAuth0Id = auth0Id.trim()
        const response = await fetch('https://api.any-gym.com/gyms', {
          headers: {
            'auth0_id': trimmedAuth0Id,
          },
          cache: 'no-store', // Don't cache for webhook
        })
        
        if (!response.ok) {
          throw new Error(`Failed to fetch gyms: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        // Map API response to include chain_name and chain_logo
        // Filter for active gyms with coordinates
        gymsResult = (Array.isArray(data) ? data : [])
          .filter((gym: any) => 
            gym.latitude != null && 
            gym.longitude != null &&
            (gym.status === 'active' || gym.status === undefined) // Include active or undefined status
          )
          .map((gym: any) => {
            // Extract chain_name and chain_logo from nested object or direct properties
            const chain_name = gym.gym_chain?.name || gym.gym_chain_name || null
            const chain_logo = gym.gym_chain?.logo_url || gym.gym_chain_logo || null
            
            return {
              id: gym.id,
              name: gym.name,
              address: gym.address || '',
              city: gym.city || '',
              postcode: gym.postcode || '',
              phone: gym.phone || undefined,
              latitude: gym.latitude != null ? gym.latitude : null,
              longitude: gym.longitude != null ? gym.longitude : null,
              gym_chain_id: gym.gym_chain_id || undefined,
              required_tier: gym.required_tier || 'standard',
              amenities: gym.amenities || [],
              opening_hours: gym.opening_hours || {},
              image_url: gym.image_url || undefined,
              status: gym.status || 'active',
              chain_name: chain_name,
              chain_logo: chain_logo,
            }
          })
        
        console.log('🏋️ Total gyms found:', gymsResult.length)
      } catch (error: any) {
        console.error('❌ Error fetching gyms from API:', error?.message)
        console.error('❌ Error stack:', error?.stack)
        // Continue with empty array - email will be skipped if no gyms
        gymsResult = []
      }
    }

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
        console.error('❌ No gyms found from API!')
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
