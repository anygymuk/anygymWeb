import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { GymPass, Subscription } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import PassesView from '@/components/PassesView'

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

async function getActivePasses(userId: string): Promise<GymPass[]> {
  try {
    const now = new Date()
    const result = await sql`
      SELECT 
        gp.*,
        json_build_object(
          'id', g.id,
          'name', g.name,
          'address', g.address,
          'city', g.city,
          'postcode', g.postcode,
          'phone', g.phone,
          'gym_chain_id', g.gym_chain_id
        ) as gym
      FROM gym_passes gp
      JOIN gyms g ON gp.gym_id = g.id
      WHERE gp.user_id = ${userId}
        AND gp.status = 'active'
        AND gp.valid_until > ${now.toISOString()}
      ORDER BY gp.created_at DESC
    `
    return result.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      gymId: row.gym_id,
      passCode: row.pass_code,
      status: row.status,
      validUntil: new Date(row.valid_until),
      usedAt: row.used_at ? new Date(row.used_at) : undefined,
      qrCodeUrl: row.qr_code_url,
      subscriptionTier: row.subscription_tier,
      passCost: row.pass_cost ? parseFloat(row.pass_cost) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      gym: row.gym,
    })) as GymPass[]
  } catch (error) {
    console.error('Error fetching active passes:', error)
    return []
  }
}

async function getPassHistory(userId: string) {
  try {
    const result = await sql`
      SELECT 
        gp.*,
        json_build_object(
          'id', g.id,
          'name', g.name,
          'gym_chain_id', g.gym_chain_id
        ) as gym,
        json_build_object(
          'id', gc.id,
          'name', gc.name,
          'logo_url', gc.logo_url
        ) as chain
      FROM gym_passes gp
      JOIN gyms g ON gp.gym_id = g.id
      LEFT JOIN gym_chains gc ON g.gym_chain_id = gc.id
      WHERE gp.user_id = ${userId}
      ORDER BY gp.created_at DESC
      LIMIT 100
    `
    
    // Group passes by gym
    const grouped: Record<number, any> = {}
    
    result.forEach((row: any) => {
      const gymId = row.gym_id
      if (!grouped[gymId]) {
        grouped[gymId] = {
          gym: {
            id: row.gym.id,
            name: row.gym.name,
            gym_chain_id: row.gym.gym_chain_id,
          },
          chain: row.chain,
          passes: [],
        }
      }
      grouped[gymId].passes.push({
        id: row.id,
        createdAt: new Date(row.created_at),
        usedAt: row.used_at ? new Date(row.used_at) : null,
        status: row.status,
        subscriptionTier: row.subscription_tier,
      })
    })
    
    return Object.values(grouped).map((group: any) => ({
      ...group,
      visitCount: group.passes.length,
      lastVisit: group.passes
        .map((p: any) => p.usedAt || p.createdAt)
        .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0],
    }))
  } catch (error) {
    console.error('Error fetching pass history:', error)
    return []
  }
}

export default async function PassesPage() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  const subscription = await getUserSubscription(userId)
  const activePasses = await getActivePasses(userId)
  const passHistory = await getPassHistory(userId)

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
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="px-6 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            My Passes
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View and manage your gym passes.
          </p>
        </div>
        <div className="px-6 pb-6">
          <PassesView
            subscription={subscription}
            activePasses={activePasses}
            passHistory={passHistory}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
