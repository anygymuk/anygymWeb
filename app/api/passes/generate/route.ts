import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'
import sgMail from '@sendgrid/mail'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Initialize SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

export async function POST(request: NextRequest) {
  console.log('🎫 [generatePass] Pass generation request received')
  
  try {
    const session = await getSession()
    if (!session?.user) {
      console.error('❌ [generatePass] Unauthorized - no session')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const auth0Id = session.user.sub
    const userEmail = session.user.email
    const userName = session.user.name

    console.log('👤 [generatePass] User:', { auth0Id, email: userEmail })

    const body = await request.json().catch(() => ({}))
    const { gymId } = body

    if (!gymId) {
      console.error('❌ [generatePass] Missing gymId')
      return NextResponse.json(
        { success: false, error: 'Gym ID is required' },
        { status: 400 }
      )
    }

    console.log('🏋️ [generatePass] Generating pass for gym:', gymId)

    // Get user from app_users table
    const userResult = await sql`
      SELECT * FROM app_users 
      WHERE auth0_id = ${auth0Id}
      LIMIT 1
    `

    if (userResult.length === 0) {
      console.error('❌ [generatePass] User not found in app_users table')
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      )
    }

    const user = userResult[0]
    console.log('✅ [generatePass] User found:', { 
      email: user.email, 
      full_name: user.full_name,
      auth0_id: user.auth0_id,
      id: user.id 
    })
    
    // Determine which user_id to use for gym_passes
    // Check if app_users has an id column (numeric) or if we should use auth0_id (text)
    const userIdForPass = user.id ? user.id : auth0Id
    console.log('📋 [generatePass] Using user_id for pass:', userIdForPass, typeof userIdForPass)

    // Check if user has active subscription (using auth0_id as user_id)
    let subscriptionResult
    try {
      subscriptionResult = await sql`
        SELECT * FROM subscriptions 
        WHERE user_id = ${auth0Id} 
        AND status = 'active'
        LIMIT 1
      `
    } catch (subQueryError: any) {
      console.error('❌ [generatePass] Error querying subscription:', subQueryError)
      console.error('❌ [generatePass] Subscription query error details:', {
        message: subQueryError.message,
        code: subQueryError.code,
        detail: subQueryError.detail
      })
      return NextResponse.json(
        { success: false, error: 'Error checking subscription status.' },
        { status: 500 }
      )
    }

    console.log('📊 [generatePass] Subscription query returned', subscriptionResult.length, 'rows')

    if (subscriptionResult.length === 0) {
      console.error('❌ [generatePass] No active subscription found')
      return NextResponse.json(
        { success: false, error: 'You need a subscription to get a pass.' },
        { status: 403 }
      )
    }

    const subscription = subscriptionResult[0]
    console.log('✅ [generatePass] Active subscription found:', {
      id: subscription.id,
      tier: subscription.tier,
      visits_used: subscription.visits_used,
      monthly_limit: subscription.monthly_limit
    })

    // Validate subscription has tier
    if (!subscription.tier) {
      console.error('❌ [generatePass] Subscription missing tier information')
      return NextResponse.json(
        { success: false, error: 'Your active subscription is missing tier information. Please contact support.' },
        { status: 400 }
      )
    }

    // Check if user has remaining visits
    if (subscription.visits_used >= subscription.monthly_limit) {
      console.error('❌ [generatePass] Monthly visit limit reached')
      return NextResponse.json(
        { success: false, error: 'You have reached your monthly visit limit.' },
        { status: 403 }
      )
    }

    // Fetch gym details with chain info
    let gymResult
    try {
      gymResult = await sql`
        SELECT g.*, 
               gc.name as chain_name,
               gc.logo_url as chain_logo
        FROM gyms g
        LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
        WHERE g.id = ${parseInt(gymId)} AND g.status = 'active'
        LIMIT 1
      `
    } catch (gymQueryError: any) {
      console.error('❌ [generatePass] Error querying gym:', gymQueryError)
      console.error('❌ [generatePass] Gym query error details:', {
        message: gymQueryError.message,
        code: gymQueryError.code,
        detail: gymQueryError.detail
      })
      return NextResponse.json(
        { success: false, error: 'Error retrieving gym information.' },
        { status: 500 }
      )
    }

    if (gymResult.length === 0) {
      console.error('❌ [generatePass] Gym not found or not available')
      return NextResponse.json(
        { success: false, error: 'Gym not found or not available.' },
        { status: 404 }
      )
    }

    const gym = gymResult[0]
    console.log('✅ [generatePass] Gym found:', { name: gym.name, required_tier: gym.required_tier })

    // Check tier requirement
    const tierLevels: { [key: string]: number } = { standard: 1, premium: 2, elite: 3 }
    if (gym.required_tier && tierLevels[subscription.tier] < tierLevels[gym.required_tier]) {
      console.error('❌ [generatePass] Subscription tier too low for this gym')
      return NextResponse.json(
        { success: false, error: 'Your subscription tier is too low for this gym.' },
        { status: 403 }
      )
    }

    // Get pass pricing for subscription tier
    let passCost: number | null = null
    try {
      const pricingResult = await sql`
        SELECT default_price FROM pass_pricing 
        WHERE subscription_tier = ${subscription.tier}
        LIMIT 1
      `
      if (pricingResult.length > 0 && pricingResult[0].default_price !== null && pricingResult[0].default_price !== undefined) {
        passCost = parseFloat(pricingResult[0].default_price) || 0
        console.log('✅ [generatePass] Pass cost retrieved:', passCost)
      } else {
        console.warn('⚠️ [generatePass] No pricing found for tier, using 0:', subscription.tier)
        passCost = 0
        // Don't fail - just use 0 as default
      }
    } catch (pricingError: any) {
      console.error('❌ [generatePass] Pricing error:', pricingError)
      console.error('❌ [generatePass] Pricing error details:', {
        message: pricingError.message,
        code: pricingError.code,
        detail: pricingError.detail
      })
      // Don't fail - use 0 as default
      passCost = 0
      console.warn('⚠️ [generatePass] Using default pass cost of 0')
    }

    // Generate pass code
    const passCode = `PASS-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`
    console.log('🎫 [generatePass] Generated pass code:', passCode)

    // Generate pass (valid for 2 hours as per original implementation)
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 2)

    // Use transaction-like approach - create pass and update subscription
    // Note: Neon doesn't support explicit transactions in the same way, but we'll do both operations
    let passResult
    try {
      console.log('📝 [generatePass] Inserting pass with values:', {
        user_id: userIdForPass,
        gym_id: parseInt(gymId),
        pass_code: passCode,
        subscription_tier: subscription.tier,
        pass_cost: passCost
      })
      
      passResult = await sql`
        INSERT INTO gym_passes (
          user_id, 
          gym_id, 
          pass_code, 
          status, 
          valid_until,
          subscription_tier,
          pass_cost
        )
        VALUES (
          ${userIdForPass}, 
          ${parseInt(gymId)}, 
          ${passCode}, 
          'active', 
          ${validUntil.toISOString()},
          ${subscription.tier},
          ${passCost}
        )
        RETURNING *
      `
      console.log('✅ [generatePass] Pass inserted successfully')
    } catch (insertError: any) {
      console.error('❌ [generatePass] Error inserting pass:', insertError)
      console.error('❌ [generatePass] Error message:', insertError.message)
      console.error('❌ [generatePass] Error code:', insertError.code)
      console.error('❌ [generatePass] Error detail:', insertError.detail)
      console.error('❌ [generatePass] Error hint:', insertError.hint)
      console.error('❌ [generatePass] Full error:', JSON.stringify(insertError, null, 2))
      return NextResponse.json(
        { 
          success: false, 
          error: `Failed to create pass: ${insertError.message || 'Database error'}`,
          details: insertError.detail || insertError.hint || undefined
        },
        { status: 500 }
      )
    }

    // Update subscription visits_used
    try {
      await sql`
        UPDATE subscriptions 
        SET visits_used = visits_used + 1,
            updated_at = NOW()
        WHERE id = ${subscription.id}
      `
      console.log('✅ [generatePass] Subscription visits_used updated')
    } catch (updateError: any) {
      console.error('❌ [generatePass] Error updating subscription:', updateError)
      // Don't throw - pass was created, just log the error
    }

    const newPass = passResult[0]
    console.log('✅ [generatePass] Pass created successfully:', newPass.id)

    // Generate QR code URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(passCode)}`

    // Send email notification using SendGrid
    console.log('📧 [generatePass] Attempting to send pass creation email...')
    let emailSent = false
    let emailError: string | null = null

    if (process.env.SENDGRID_API_KEY && userEmail) {
      try {
        // Get first name from full_name
        const firstName = user.full_name ? user.full_name.split(' ')[0] : 'there'

        console.log('📧 [generatePass] Preparing email for:', userEmail)
        console.log('👤 [generatePass] Recipient name:', firstName)
        console.log('🏋️ [generatePass] Gym:', gym.name)

        const emailData = {
          to: userEmail,
          from: process.env.SENDGRID_FROM_EMAIL || 'naaman@any-gym.com',
          templateId: process.env.SENDGRID_PASS_TEMPLATE_ID || 'd-af64b6e942394f2e833c29abb7258c4f',
          dynamicTemplateData: {
            Recipient_Name: firstName,
            Gym_Name: gym.name,
            Pass_QR: qrCodeUrl,
            Pass_Code: passCode,
            Gym_Address: gym.address || '',
            Gym_Postcode: gym.postcode || '',
            Gym_City: gym.city || '',
            Gym_Lng: gym.longitude || '',
            Gym_Lat: gym.latitude || '',
          },
        }

        console.log('📮 [generatePass] Sending email with template ID:', emailData.templateId)

        await sgMail.send(emailData)

        emailSent = true
        console.log('✅ [generatePass] Pass creation email sent successfully to', userEmail)
      } catch (error: any) {
        emailError = error.message
        console.error('❌ [generatePass] Failed to send email notification:', error)

        if (error.response) {
          console.error('❌ [generatePass] SendGrid Response:', error.response.body)
          emailError = `SendGrid Error: ${error.response.body.errors?.[0]?.message || error.message}`
        }
      }
    } else {
      console.log('⚠️ [generatePass] Skipping email - SendGrid not configured or no email')
    }

    return NextResponse.json({
      success: true,
      message: 'Pass generated successfully!',
      pass: newPass,
      emailSent: emailSent,
      emailError: emailError,
    })
  } catch (error: any) {
    console.error('❌ [generatePass] Function Error:', error)
    console.error('❌ [generatePass] Stack:', error.stack)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

