import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { Subscription, Gym } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import GymMapView from '@/components/GymMapView'

async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE user_id = ${userId} 
      AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `
    if (result.length === 0) return null
    
    const row = result[0]
    return {
      id: row.id,
      userId: row.user_id,
      tier: row.tier,
      monthlyLimit: row.monthly_limit,
      visitsUsed: row.visits_used,
      price: parseFloat(row.price),
      startDate: new Date(row.start_date),
      nextBillingDate: new Date(row.next_billing_date),
      status: row.status,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      guestPassesLimit: row.guest_passes_limit,
      guestPassesUsed: row.guest_passes_used,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    } as Subscription
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
}

async function getAllGyms(): Promise<Gym[]> {
  try {
    const result = await sql`
      SELECT * FROM gyms 
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND status IS DISTINCT FROM 'inactive'
      ORDER BY name
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
  } catch (error) {
    console.error('Error fetching gyms:', error)
    return []
  }
}

async function getGymChains() {
  try {
    const result = await sql`
      SELECT * FROM gym_chains 
      ORDER BY name
    `
    return result
  } catch (error) {
    console.error('Error fetching chains:', error)
    return []
  }
}

export default async function Dashboard() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  const subscription = await getUserSubscription(userId)
  const gyms = await getAllGyms()
  const chains = await getGymChains()

  // Get user initials for avatar
  const userName = session.user.name || session.user.email || 'User'
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <DashboardLayout
      userName={userName}
      userInitials={initials}
      subscription={subscription}
    >
      <div className="flex-1 flex flex-col h-screen">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Find Your Gym
          </h1>
        </div>
        <div className="flex-1">
          <GymMapView 
            initialGyms={gyms} 
            chains={chains}
            hasSubscription={!!subscription}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
