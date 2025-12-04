import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { Gym } from '@/lib/types'

// Mark route as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('search') || ''
    const tier = searchParams.get('tier')
    const chainId = searchParams.get('chain')

    // Build query parameters for external API
    const apiParams = new URLSearchParams()
    if (searchQuery) apiParams.set('search', searchQuery)
    if (tier && tier !== 'All Tiers') apiParams.set('tier', tier)
    if (chainId && chainId !== 'All Chains') apiParams.set('chain', chainId)

    // Fetch gyms from external API with query parameters
    const apiUrl = `https://api.any-gym.com/gyms${apiParams.toString() ? `?${apiParams.toString()}` : ''}`
    const response = await fetch(apiUrl, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch gyms: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Map API response to Gym type and filter
    let gyms: Gym[] = data
      .filter((gym: any) => gym.latitude != null && gym.longitude != null)
      .map((gym: any) => ({
        id: gym.id,
        name: gym.name,
        address: gym.address || '',
        city: gym.city || '',
        postcode: gym.postcode || '',
        phone: gym.phone || undefined,
        latitude: gym.latitude ? parseFloat(gym.latitude) : undefined,
        longitude: gym.longitude ? parseFloat(gym.longitude) : undefined,
        gym_chain_id: gym.gym_chain_id || undefined,
        required_tier: gym.required_tier || 'standard',
        amenities: gym.amenities || [],
        opening_hours: gym.opening_hours || {},
        image_url: gym.image_url || undefined,
        rating: undefined,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as Gym[]

    // Apply filters client-side
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      gyms = gyms.filter((gym) => 
        gym.name.toLowerCase().includes(query) ||
        gym.city.toLowerCase().includes(query) ||
        gym.postcode.toLowerCase().includes(query)
      )
    }

    if (tier && tier !== 'All Tiers') {
      gyms = gyms.filter((gym) => gym.required_tier === tier)
    }

    if (chainId && chainId !== 'All Chains') {
      const chainIdNum = parseInt(chainId)
      gyms = gyms.filter((gym) => gym.gym_chain_id === chainIdNum)
    }

    // Sort by name
    gyms.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ gyms })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

