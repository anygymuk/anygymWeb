import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sql } from '@/lib/db'
import { GymPass } from '@/lib/types'
import Logo from '@/components/Logo'

async function getPass(id: string, userId: string): Promise<GymPass | null> {
  try {
    const result = await sql`
      SELECT 
        gp.*,
        json_build_object(
          'id', g.id,
          'name', g.name,
          'address', g.address,
          'city', g.city,
          'postcode', g.postcode,
          'phone', g.phone
        ) as gym
      FROM gym_passes gp
      JOIN gyms g ON gp.gym_id = g.id
      WHERE gp.id = ${parseInt(id)} AND gp.user_id = ${userId}
    `
    
    if (result.length === 0) return null

    const row = result[0]
    return {
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
    } as GymPass
  } catch (error) {
    console.error('Error fetching pass:', error)
    return null
  }
}

export default async function PassDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const userId = session.user.sub
  const pass = await getPass(params.id, userId)

  if (!pass) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Pass not found
          </h1>
          <Link href="/passes" className="text-blue-600 hover:text-blue-800">
            Back to passes
          </Link>
        </div>
      </div>
    )
  }

  const isExpired = new Date(pass.validUntil) < new Date()
  const isValid = pass.status === 'active' && !isExpired

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
                href="/passes"
                className="text-gray-700 dark:text-gray-300 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Back to Passes
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className={`text-center mb-8 p-6 rounded-lg ${isValid ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700'}`}>
            <div className={`text-4xl font-bold mb-2 ${isValid ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
              {isValid ? '✓' : '✗'}
            </div>
            <h2 className={`text-2xl font-bold ${isValid ? 'text-green-800 dark:text-green-200' : 'text-gray-600 dark:text-gray-400'}`}>
              {isValid ? 'Valid Pass' : isExpired ? 'Expired Pass' : 'Inactive Pass'}
            </h2>
          </div>

          {pass.gym && (
            <div className="space-y-4 mb-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Gym
                </h3>
                <p className="text-gray-700 dark:text-gray-300">{pass.gym.name}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Address
                </h3>
                <p className="text-gray-700 dark:text-gray-300">
                  {pass.gym.address}
                  <br />
                  {pass.gym.city} {pass.gym.postcode}
                </p>
              </div>
              {pass.gym.phone && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Phone
                  </h3>
                  <p className="text-gray-700 dark:text-gray-300">{pass.gym.phone}</p>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Pass Code:</span>
              <span className="text-gray-900 dark:text-white font-mono text-sm">{pass.passCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Created:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(pass.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Valid Until:</span>
              <span className="text-gray-900 dark:text-white">
                {new Date(pass.validUntil).toLocaleString()}
              </span>
            </div>
            {pass.subscriptionTier && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Tier:</span>
                <span className="text-gray-900 dark:text-white capitalize">{pass.subscriptionTier}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className="text-gray-900 dark:text-white capitalize">{pass.status}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

