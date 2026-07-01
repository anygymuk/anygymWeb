import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { getOrCreateAppUser, updateUserViaApi } from '@/lib/user'

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
      skipSubscription,
      assignFreeTier,
    } = await request.json()

    // Validate required fields
    if (!name || !dateOfBirth || !addressLine1 || !addressCity || !addressPostcode || !emergencyContactName || !emergencyContactNumber) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      )
    }

    // Ensure user exists locally (upsert via API if needed)
    await getOrCreateAppUser(auth0Id, session.user.email, session.user.name)

    // Update user with onboarding data via API
    const updatePayload: Record<string, unknown> = {
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
    }

    if (assignFreeTier === true || skipSubscription === true) {
      updatePayload.assign_free_tier = true
    }

    const updateResult = await updateUserViaApi(auth0Id, updatePayload)

    if (!updateResult.ok) {
      throw new Error(updateResult.error || 'Failed to update user')
    }

    return NextResponse.json({
      success: true,
      assignFreeTier: assignFreeTier === true || skipSubscription === true,
    })
  } catch (error: any) {
    console.error('[Onboarding API] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save onboarding data' },
      { status: 500 }
    )
  }
}

