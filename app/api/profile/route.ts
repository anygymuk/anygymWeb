import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub

    const result = await sql`
      SELECT 
        full_name,
        date_of_birth,
        address_line1,
        address_line2,
        address_city,
        address_postcode,
        emergency_contact_name,
        emergency_contact_number
      FROM app_users
      WHERE auth0_id = ${auth0Id}
      LIMIT 1
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = result[0]
    return NextResponse.json({
      fullName: user.full_name || '',
      dateOfBirth: user.date_of_birth || '',
      addressLine1: user.address_line1 || '',
      addressLine2: user.address_line2 || '',
      addressCity: user.address_city || '',
      addressPostcode: user.address_postcode || '',
      emergencyContactName: user.emergency_contact_name || '',
      emergencyContactNumber: user.emergency_contact_number || '',
    })
  } catch (error: any) {
    console.error('[Profile API] Error fetching profile:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub
    const {
      fullName,
      dateOfBirth,
      addressLine1,
      addressLine2,
      addressCity,
      addressPostcode,
      emergencyContactName,
      emergencyContactNumber,
    } = await request.json()

    // Validate required fields
    if (!fullName || !dateOfBirth || !addressLine1 || !addressCity || !addressPostcode || !emergencyContactName || !emergencyContactNumber) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      )
    }

    await sql`
      UPDATE app_users
      SET 
        full_name = ${fullName},
        date_of_birth = ${dateOfBirth},
        address_line1 = ${addressLine1},
        address_line2 = ${addressLine2 || null},
        address_city = ${addressCity},
        address_postcode = ${addressPostcode},
        emergency_contact_name = ${emergencyContactName},
        emergency_contact_number = ${emergencyContactNumber},
        updated_at = NOW()
      WHERE auth0_id = ${auth0Id}
    `

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Profile API] Error updating profile:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}

