import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub

    // Fetch user data from external API
    const response = await fetch('https://api.any-gym.com/user', {
      headers: {
        'auth0_id': auth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      throw new Error(`Failed to fetch user: ${response.statusText}`)
    }

    const userData = await response.json()
    
    // Map API response to expected format
    return NextResponse.json({
      fullName: userData.full_name || userData.name || '',
      dateOfBirth: userData.date_of_birth || '',
      addressLine1: userData.address_line1 || '',
      addressLine2: userData.address_line2 || '',
      addressCity: userData.address_city || '',
      addressPostcode: userData.address_postcode || '',
      emergencyContactName: userData.emergency_contact_name || '',
      emergencyContactNumber: userData.emergency_contact_number || '',
      passNotificationConsent: userData.pass_notification_consent === true || 
                                userData.pass_notification_consent === 'true' || 
                                userData.pass_notification_consent === 1,
      marketingConsent: userData.marketing_consent === true || 
                        userData.marketing_consent === 'true' || 
                        userData.marketing_consent === 1,
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
      passNotificationConsent,
      marketingConsent,
    } = await request.json()

    // Validate required fields
    if (!fullName || !dateOfBirth || !addressLine1 || !addressCity || !addressPostcode || !emergencyContactName || !emergencyContactNumber) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      )
    }

    // Build update body with only fields that have values (non-empty)
    const updateBody: Record<string, string | boolean> = {}
    
    if (fullName) {
      updateBody.full_name = fullName
      updateBody.name = fullName
    }
    if (dateOfBirth) {
      updateBody.date_of_birth = dateOfBirth
    }
    if (addressLine1) {
      updateBody.address_line1 = addressLine1
    }
    if (addressLine2) {
      updateBody.address_line2 = addressLine2
    }
    if (addressCity) {
      updateBody.address_city = addressCity
    }
    if (addressPostcode) {
      updateBody.address_postcode = addressPostcode
    }
    if (emergencyContactName) {
      updateBody.emergency_contact_name = emergencyContactName
    }
    if (emergencyContactNumber) {
      updateBody.emergency_contact_number = emergencyContactNumber
    }
    // Handle boolean consent fields
    if (typeof passNotificationConsent === 'boolean') {
      updateBody.pass_notification_consent = passNotificationConsent
    }
    if (typeof marketingConsent === 'boolean') {
      updateBody.marketing_consent = marketingConsent
    }

    // Update user data via external API
    const response = await fetch('https://api.any-gym.com/user/update', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'auth0_id': auth0Id.trim(),
      },
      body: JSON.stringify(updateBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to update user' }))
      throw new Error(errorData.error || `Failed to update user: ${response.statusText}`)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Profile API] Error updating profile:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}

