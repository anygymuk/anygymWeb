import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { Gym } from '@/lib/types'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const gymId = parseInt(params.id)

    // Fetch gym from external API using specific endpoint
    const response = await fetch(`https://api.any-gym.com/gyms/${gymId}`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Gym not found' },
          { status: 404 }
        )
      }
      throw new Error(`Failed to fetch gym: ${response.statusText}`)
    }
    
    const gymData = await response.json()

    // Map API response to Gym type
    const gym: Gym = {
      id: gymData.id,
      name: gymData.name,
      address: gymData.address || '',
      city: gymData.city || '',
      postcode: gymData.postcode || '',
      phone: gymData.phone || undefined,
      latitude: gymData.latitude ? parseFloat(gymData.latitude) : undefined,
      longitude: gymData.longitude ? parseFloat(gymData.longitude) : undefined,
      gym_chain_id: gymData.gym_chain_id || undefined,
      required_tier: gymData.required_tier || 'standard',
      amenities: gymData.amenities || [],
      opening_hours: gymData.opening_hours || {},
      image_url: gymData.image_url || undefined,
      rating: undefined,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Extract gym_chain from API response
    let gym_chain = null
    
    // Check if API response includes gym_chain object
    if (gymData.gym_chain) {
      gym_chain = gymData.gym_chain
    } else if (gymData.gym_chain_id || gymData.gym_chain_name) {
      // Use basic chain info from API response if available
      gym_chain = {
        id: gymData.gym_chain_id || null,
        name: gymData.gym_chain_name || 'Unknown Chain',
        logo_url: gymData.gym_chain_logo || undefined,
      }
    }

    return NextResponse.json({ gym, gym_chain })
  } catch (error) {
    console.error('Error fetching gym:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

