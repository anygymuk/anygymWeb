import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Gym } from '@/lib/types'
import GymSearch from '@/components/GymSearch'
import Logo from '@/components/Logo'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

async function getGyms(searchQuery?: string): Promise<Gym[]> {
  try {
    // Fetch all gyms from external API
    const response = await fetch('https://api.any-gym.com/gyms', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch gyms: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Map API response to Gym type
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

    // Apply search filter if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      gyms = gyms.filter((gym) => 
        gym.name.toLowerCase().includes(query) ||
        gym.city.toLowerCase().includes(query) ||
        gym.postcode.toLowerCase().includes(query)
      )
    }

    // Sort by name
    gyms.sort((a, b) => a.name.localeCompare(b.name))

    return gyms
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

