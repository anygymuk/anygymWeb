import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'
import { getOrCreateAppUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub
    const { 
      name, 
      dateOfBirth, 
      addressLine1, 
      addressLine2, 
      addressCity, 
      addressPostcode, 
      emergencyContactName, 
      emergencyContactNumber, 
      skipSubscription 
    } = await request.json()

    // Validate required fields
    if (!name || !dateOfBirth || !addressLine1 || !addressCity || !addressPostcode || !emergencyContactName || !emergencyContactNumber) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      )
    }

    // Get or create user
    const { user } = await getOrCreateAppUser(
      auth0Id,
      session.user.email,
      session.user.name
    )

    if (!user) {
      return NextResponse.json(
        { error: 'Failed to get or create user' },
        { status: 500 }
      )
    }

    // Update user with onboarding data
    await sql`
      UPDATE app_users
      SET 
        full_name = ${name},
        date_of_birth = ${dateOfBirth},
        address_line1 = ${addressLine1},
        address_line2 = ${addressLine2 || null},
        address_city = ${addressCity},
        address_postcode = ${addressPostcode},
        emergency_contact_name = ${emergencyContactName},
        emergency_contact_number = ${emergencyContactNumber},
        onboarding_completed = true,
        updated_at = NOW()
      WHERE auth0_id = ${user.auth0_id}
    `

    return NextResponse.json({
      success: true,
      skipSubscription: skipSubscription === true,
    })
  } catch (error: any) {
    console.error('[Onboarding API] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save onboarding data' },
      { status: 500 }
    )
  }
}

