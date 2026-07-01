import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { saveOnboardingViaApi } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth0Id = session.user.sub
    const body = await request.json()
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
    } = body

    if (
      !name ||
      !dateOfBirth ||
      !addressLine1 ||
      !addressCity ||
      !addressPostcode ||
      !emergencyContactName ||
      !emergencyContactNumber
    ) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      )
    }

    const saveResult = await saveOnboardingViaApi(auth0Id, {
      email: session.user.email,
      name,
      dateOfBirth,
      addressLine1,
      addressLine2,
      addressCity,
      addressPostcode,
      emergencyContactName,
      emergencyContactNumber,
      assignFreeTier: assignFreeTier === true || skipSubscription === true,
    })

    if (!saveResult.ok) {
      console.error('[Onboarding API] Save failed:', saveResult.error)
      return NextResponse.json(
        { error: saveResult.error || 'Failed to save onboarding data' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      assignFreeTier: assignFreeTier === true || skipSubscription === true,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save onboarding data'
    console.error('[Onboarding API] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
