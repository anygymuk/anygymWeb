import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
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

    const auth0Id = session.user.sub
    const userEmail = session.user.email
    const userName = session.user.name
    const { gymId } = await request.json()

    if (!gymId) {
      return NextResponse.json(
        { error: 'Gym ID is required' },
        { status: 400 }
      )
    }

    // Get or create the app user ID from app_users table
    let userResult = await sql`
      SELECT id FROM app_users 
      WHERE auth0_id = ${auth0Id}
      LIMIT 1
    `

    let appUserId: number

    if (userResult.length === 0) {
      // User doesn't exist, create them
      try {
        const insertResult = await sql`
          INSERT INTO app_users (auth0_id, email, name, created_at, updated_at)
          VALUES (${auth0Id}, ${userEmail || null}, ${userName || null}, NOW(), NOW())
          RETURNING id
        `
        if (insertResult.length > 0) {
          appUserId = insertResult[0].id
        } else {
          // If insert failed but user might have been created concurrently, try fetching again
          userResult = await sql`
            SELECT id FROM app_users 
            WHERE auth0_id = ${auth0Id}
            LIMIT 1
          `
          if (userResult.length === 0) {
            return NextResponse.json(
              { error: 'Failed to create user account' },
              { status: 500 }
            )
          }
          appUserId = userResult[0].id
        }
      } catch (insertError: any) {
        // If unique constraint violation, user was created concurrently
        if (insertError?.code === '23505' || insertError?.message?.includes('unique')) {
          userResult = await sql`
            SELECT id FROM app_users 
            WHERE auth0_id = ${auth0Id}
            LIMIT 1
          `
          if (userResult.length === 0) {
            return NextResponse.json(
              { error: 'User account error' },
              { status: 500 }
            )
          }
          appUserId = userResult[0].id
        } else {
          console.error('Error creating user:', insertError)
          return NextResponse.json(
            { error: 'Failed to create user account' },
            { status: 500 }
          )
        }
      }
    } else {
      appUserId = userResult[0].id
    }

    // Check if user has active subscription
    const subscriptionResult = await sql`
      SELECT * FROM subscriptions 
      WHERE user_id = ${appUserId} 
      AND status = 'active'
      LIMIT 1
    `

    if (subscriptionResult.length === 0) {
      return NextResponse.json(
        { error: 'Active subscription required' },
        { status: 403 }
      )
    }

    const subscription = subscriptionResult[0]

    // Check if user has remaining visits
    if (subscription.visits_used >= subscription.monthly_limit) {
      return NextResponse.json(
        { error: 'Monthly visit limit reached' },
        { status: 403 }
      )
    }

    // Check if gym exists
    const gymResult = await sql`
      SELECT * FROM gyms WHERE id = ${parseInt(gymId)}
    `

    if (gymResult.length === 0) {
      return NextResponse.json(
        { error: 'Gym not found' },
        { status: 404 }
      )
    }

    const gym = gymResult[0]

    // Generate pass code (simple UUID-like string)
    const passCode = `PASS-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    // Generate pass (valid for 24 hours)
    const validUntil = new Date()
    validUntil.setHours(validUntil.getHours() + 24)

    // Get pass pricing for subscription tier
    const pricingResult = await sql`
      SELECT default_price FROM pass_pricing 
      WHERE subscription_tier = ${subscription.tier}
      LIMIT 1
    `
    const passCost = pricingResult.length > 0 ? pricingResult[0].default_price : null

    // Create the pass
    const passResult = await sql`
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
        ${appUserId}, 
        ${parseInt(gymId)}, 
        ${passCode}, 
        'active', 
        ${validUntil.toISOString()},
        ${subscription.tier},
        ${passCost}
      )
      RETURNING *
    `

    // Update subscription visits_used
    await sql`
      UPDATE subscriptions 
      SET visits_used = visits_used + 1,
          updated_at = NOW()
      WHERE id = ${subscription.id}
    `

    const pass = passResult[0]

    return NextResponse.json({ pass })
  } catch (error) {
    console.error('Error generating pass:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

