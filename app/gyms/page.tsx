import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from '@/lib/db'
import { Gym } from '@/lib/types'
import GymSearch from '@/components/GymSearch'
import Logo from '@/components/Logo'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

async function getGyms(searchQuery?: string): Promise<Gym[]> {
  try {
    if (searchQuery) {
      const result = await sql`
        SELECT * FROM gyms 
        WHERE name ILIKE ${'%' + searchQuery + '%'}
           OR city ILIKE ${'%' + searchQuery + '%'}
           OR postcode ILIKE ${'%' + searchQuery + '%'}
        ORDER BY name
        LIMIT 50
      `
      return result.map((row: any) => ({
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
      })) as Gym[]
    } else {
      const result = await sql`
        SELECT * FROM gyms 
        ORDER BY name
        LIMIT 50
      `
      return result.map((row: any) => ({
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
      })) as Gym[]
    }
  } catch (error) {
    console.error('Error fetching gyms:', error)
    return []
  }
}

export default async function GymsPage({
  searchParams,
}: {
  searchParams: { search?: string }
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const gyms = await getGyms(searchParams.search)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Logo />
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/passes"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                My Passes
              </Link>
              <Link
                href="/api/auth/logout"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
            Find Gyms
          </h1>
          
          <GymSearch initialGyms={gyms} />
        </div>
      </main>
    </div>
  )
}

