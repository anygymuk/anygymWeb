import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from '@/lib/db'
import { Subscription } from '@/lib/types'
import SubscriptionManager from '@/components/SubscriptionManager'
import Logo from '@/components/Logo'

async function getUserSubscription(userId: string): Promise<Subscription | null> {
  try {
    const result = await sql`
      SELECT * FROM subscriptions 
      WHERE user_id = ${userId} 
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

export default async function SubscriptionPage() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  const subscription = await getUserSubscription(userId)

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
                href="/api/auth/logout"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Subscription Management
        </h1>
        <SubscriptionManager subscription={subscription} />
      </main>
    </div>
  )
}

