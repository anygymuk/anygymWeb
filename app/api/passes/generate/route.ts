import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.sub
    const { gymId } = await request.json()

    if (!gymId) {
      return NextResponse.json(
        { error: 'Gym ID is required' },
        { status: 400 }
      )
    }

    // Check if user has active subscription
    const subscriptionResult = await sql`
      SELECT * FROM subscriptions 
      WHERE user_id = ${userId} 
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
        ${userId}, 
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

