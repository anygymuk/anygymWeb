import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
    console.log('👤 [generatePass] User:', { auth0Id })

    const body = await request.json().catch(() => ({}))
    console.log('📥 [generatePass] Request body:', body)
    
    const { gymId } = body

    if (!gymId) {
      console.error('❌ [generatePass] Missing gymId in body:', body)
      return NextResponse.json(
        { success: false, error: 'Gym ID is required' },
        { status: 400 }
      )
    }

    // Parse gymId - handle both string and number
    const gymIdInt = typeof gymId === 'string' ? parseInt(gymId, 10) : Number(gymId)
    
    if (isNaN(gymIdInt)) {
      console.error('❌ [generatePass] Invalid gymId:', gymId)
      return NextResponse.json(
        { success: false, error: 'Invalid gym ID format' },
        { status: 400 }
      )
    }
    
    console.log('🏋️ [generatePass] Generating pass for gym:', gymId, 'parsed as:', gymIdInt)

    // Prepare request data
    const requestBody = {
      auth0_id: auth0Id,
      gym_id: gymIdInt,
    }
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      'auth0_id': auth0Id, // Pass auth0_id in header
    }

    console.log('📤 [generatePass] Request to external API:', {
      url: 'https://api.any-gym.com/generate_pass',
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    })

    // Call external API to generate pass
    const response = await fetch('https://api.any-gym.com/generate_pass', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to generate pass' }))
      console.error('❌ [generatePass] External API error:', response.status, errorData)
      return NextResponse.json(
        { success: false, error: errorData.error || 'Failed to generate pass' },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('✅ [generatePass] Pass generated successfully')

    return NextResponse.json({
      success: true,
      message: 'Pass generated successfully!',
      ...data, // Forward the response from external API
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

