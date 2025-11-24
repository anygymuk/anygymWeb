'use client'

import { Subscription, GymPass } from '@/lib/types'
import Link from 'next/link'

interface PassHistoryItem {
  gym: {
    id: number
    name: string
    gym_chain_id?: number
  }
  chain?: {
    id: number
    name: string
    logo_url?: string
  }
  passes: Array<{
    id: number
    createdAt: Date
    usedAt: Date | null
    status: string
    subscriptionTier?: string
  }>
  visitCount: number
  lastVisit: Date
}

interface PassesViewProps {
  subscription: Subscription | null
  activePasses: GymPass[]
  passHistory: PassHistoryItem[]
  passesInBillingPeriod: number
}

export default function PassesView({
  subscription,
  activePasses,
  passHistory,
  passesInBillingPeriod,
}: PassesViewProps) {
  // Use actual passes created in billing period instead of visitsUsed
  const passesCreated = passesInBillingPeriod
  const monthlyLimit = subscription?.monthlyLimit || 0
  const visitsRemaining = monthlyLimit - passesCreated
  const visitsPercentage = monthlyLimit > 0 ? (passesCreated / monthlyLimit) * 100 : 0

  const guestPassesUsed = subscription?.guestPassesUsed || 0
  const guestPassesLimit = subscription?.guestPassesLimit || 0
  const guestPassesRemaining = guestPassesLimit - guestPassesUsed
  const guestPassesPercentage =
    guestPassesLimit > 0 ? (guestPassesUsed / guestPassesLimit) * 100 : 0

  const totalGyms = passHistory.length
  const totalPasses = passHistory.reduce((sum, item) => sum + item.visitCount, 0)

  return (
    <div className="space-y-6">
      {/* Monthly Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="space-y-6">
          {/* Gym Visits Used */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  {subscription?.tier || 'Premium'} Plan
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {passesCreated}/{monthlyLimit}
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
              <div
                className="bg-orange-500 h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(visitsPercentage, 100)}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {visitsRemaining} passes remaining this billing period
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Resets on {subscription?.nextBillingDate ? new Date(subscription.nextBillingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'next billing date'}.
            </p>
          </div>

          {/* Guest Passes Used */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {guestPassesUsed}/{guestPassesLimit}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
              <div
                className="bg-orange-500 h-2.5 rounded-full transition-all"
                style={{ width: `${Math.min(guestPassesPercentage, 100)}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {guestPassesRemaining} guest passes remaining
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Resets monthly.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Passes Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Active Passes
            </h2>
          </div>
          {activePasses.length > 0 ? (
            <div className="space-y-3">
              {activePasses.map((pass) => (
                <Link
                  key={pass.id}
                  href={`/passes/${pass.id}`}
                  className="block p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {pass.gym?.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Valid until:{' '}
                        {pass.validUntil.toLocaleDateString()}{' '}
                        {pass.validUntil.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-medium rounded-full">
                      Active
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                  />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">No active passes</p>
            </div>
          )}
        </div>

        {/* Pass History Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Pass History
            </h2>
            {totalGyms > 0 && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {totalGyms} gym{totalGyms !== 1 ? 's' : ''} • {totalPasses} pass
                {totalPasses !== 1 ? 'es' : ''}
              </span>
            )}
          </div>
          {passHistory.length > 0 ? (
            <div className="space-y-4">
              {passHistory.map((item) => (
                <div
                  key={item.gym.id}
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {item.chain?.logo_url ? (
                      <img
                        src={item.chain.logo_url}
                        alt={item.chain.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          {item.gym.name.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {item.gym.name}
                      </h3>
                      {item.chain && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {item.chain.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.visitCount} visit{item.visitCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Last: {item.lastVisit.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    {item.passes[0]?.subscriptionTier && (
                      <button className="px-3 py-1.5 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs font-medium rounded-full flex items-center gap-1">
                        {item.passes[0].subscriptionTier}
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              <p>No pass history yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

