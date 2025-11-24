import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@auth0/nextjs-auth0'
import { sql } from '@/lib/db'

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

    // Fetch gym with chain information including terms and health statement
    const result = await sql`
      SELECT 
        g.*,
        json_build_object(
          'id', gc.id,
          'name', gc.name,
          'logo_url', gc.logo_url,
          'brand_color', gc.brand_color,
          'website', gc.website,
          'description', gc.description,
          'terms', gc.terms,
          'health_statement', gc.health_statement,
          'terms_url', gc.terms_url,
          'health_statement_url', gc.health_statement_url,
          'use_terms_url', gc.use_terms_url,
          'use_health_statement_url', gc.use_health_statement_url
        ) as chain
      FROM gyms g
      LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
      WHERE g.id = ${gymId}
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Gym not found' },
        { status: 404 }
      )
    }

    const row = result[0]
    const gym = {
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      postcode: row.postcode,
      phone: row.phone,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      gym_chain_id: row.gym_chain_id,
      required_tier: row.required_tier,
      amenities: row.amenities,
      opening_hours: row.opening_hours,
      image_url: row.image_url,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }

    return NextResponse.json({ gym, chain: row.chain })
  } catch (error) {
    console.error('Error fetching gym:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

