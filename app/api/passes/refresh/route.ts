import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const auth0Id = session.user.sub
    
    // Fetch passes and subscription from external API
    // Add timestamp to URL to bypass any external caching
    const timestamp = Date.now()
    const url = `https://api.any-gym.com/user/passes?_t=${timestamp}`
    
    const response = await fetch(url, {
      headers: {
        'auth0_id': auth0Id.trim(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      cache: 'no-store', // Always get fresh data - bypass Next.js cache
    })

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch passes' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json({
      success: true,
      data: data,
    })
  } catch (error: any) {
    console.error('Error refreshing passes:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

