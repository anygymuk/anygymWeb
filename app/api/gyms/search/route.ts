import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'

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

    let result
    
    // Base query with filters
    if (searchQuery && tier && tier !== 'All Tiers' && chainId && chainId !== 'All Chains') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND (name ILIKE ${'%' + searchQuery + '%'} OR city ILIKE ${'%' + searchQuery + '%'} OR postcode ILIKE ${'%' + searchQuery + '%'})
          AND required_tier = ${tier}
          AND gym_chain_id = ${parseInt(chainId)}
        ORDER BY name
      `
    } else if (searchQuery && tier && tier !== 'All Tiers') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND (name ILIKE ${'%' + searchQuery + '%'} OR city ILIKE ${'%' + searchQuery + '%'} OR postcode ILIKE ${'%' + searchQuery + '%'})
          AND required_tier = ${tier}
        ORDER BY name
      `
    } else if (searchQuery && chainId && chainId !== 'All Chains') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND (name ILIKE ${'%' + searchQuery + '%'} OR city ILIKE ${'%' + searchQuery + '%'} OR postcode ILIKE ${'%' + searchQuery + '%'})
          AND gym_chain_id = ${parseInt(chainId)}
        ORDER BY name
      `
    } else if (tier && tier !== 'All Tiers' && chainId && chainId !== 'All Chains') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND required_tier = ${tier}
          AND gym_chain_id = ${parseInt(chainId)}
        ORDER BY name
      `
    } else if (searchQuery) {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND (name ILIKE ${'%' + searchQuery + '%'} OR city ILIKE ${'%' + searchQuery + '%'} OR postcode ILIKE ${'%' + searchQuery + '%'})
        ORDER BY name
      `
    } else if (tier && tier !== 'All Tiers') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND required_tier = ${tier}
        ORDER BY name
      `
    } else if (chainId && chainId !== 'All Chains') {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
          AND gym_chain_id = ${parseInt(chainId)}
        ORDER BY name
      `
    } else {
      result = await sql`
        SELECT * FROM gyms 
        WHERE latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND status IS DISTINCT FROM 'inactive'
        ORDER BY name
      `
    }

    return NextResponse.json({ gyms: result })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

