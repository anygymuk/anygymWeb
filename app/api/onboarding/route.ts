import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
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

    // Update user with onboarding data via API
    const response = await fetch('https://api.any-gym.com/user', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'auth0_id': auth0Id,
      },
      body: JSON.stringify({
        full_name: name,
        name: name,
        date_of_birth: dateOfBirth,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        address_city: addressCity,
        address_postcode: addressPostcode,
        emergency_contact_name: emergencyContactName,
        emergency_contact_number: emergencyContactNumber,
        onboarding_completed: true,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to update user' }))
      throw new Error(errorData.error || `Failed to update user: ${response.statusText}`)
    }

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

