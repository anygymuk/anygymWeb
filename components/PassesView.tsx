'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Subscription, GymPass } from '@/lib/types'
import TermsModal from '@/components/TermsModal'

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
  const router = useRouter()
  const [expandedGyms, setExpandedGyms] = useState<Set<number>>(new Set())
  const [showTermsModal, setShowTermsModal] = useState<{ gymId: number; chain: any } | null>(null)
  const [loadingGymId, setLoadingGymId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Debug logging with error handling
  useEffect(() => {
    try {
      console.log('[PassesView] Component rendered with props:')
      console.log('[PassesView] passHistory:', passHistory)
      console.log('[PassesView] passHistory length:', passHistory?.length || 0)
      console.log('[PassesView] passHistory type:', typeof passHistory)
      console.log('[PassesView] passHistory is array:', Array.isArray(passHistory))
      if (passHistory && passHistory.length > 0) {
        console.log('[PassesView] First pass history item:', passHistory[0])
      }
      console.log('[PassesView] activePasses:', activePasses)
      console.log('[PassesView] activePasses length:', activePasses?.length || 0)
    } catch (error) {
      console.error('[PassesView] Error in debug logging:', error)
    }
  }, [passHistory, activePasses])
  
  // Use actual passes created in billing period instead of visitsUsed
  // Ensure passesInBillingPeriod is a valid number
  const passesCreated = (typeof passesInBillingPeriod === 'number' && !isNaN(passesInBillingPeriod)) 
    ? passesInBillingPeriod 
    : 0
  
  // Get monthly limit from subscription - ensure it's a number
  const monthlyLimit = subscription?.monthlyLimit 
    ? (typeof subscription.monthlyLimit === 'number' 
        ? subscription.monthlyLimit 
        : Number(subscription.monthlyLimit) || 0)
    : 0
  
  // Debug logging
  console.log('[PassesView] Progress bar calculation:', {
    passesCreated,
    monthlyLimit,
    subscription: subscription ? {
      id: subscription.id,
      tier: subscription.tier,
      monthlyLimit: subscription.monthlyLimit,
      monthlyLimitType: typeof subscription.monthlyLimit,
    } : null,
  })
  
  // Calculate remaining passes and percentage
  const visitsRemaining = Math.max(0, monthlyLimit - passesCreated)
  const visitsPercentage = monthlyLimit > 0 
    ? Math.min(100, Math.max(0, (passesCreated / monthlyLimit) * 100))
    : 0
  
  console.log('[PassesView] Calculated values:', {
    passesCreated,
    monthlyLimit,
    visitsRemaining,
    visitsPercentage,
    formula: monthlyLimit > 0 ? `(${passesCreated} / ${monthlyLimit}) * 100 = ${visitsPercentage}%` : 'N/A (no limit)',
    passesInBillingPeriodProp: passesInBillingPeriod,
  })
  
  // Ensure percentage is valid for rendering
  const displayPercentage = isNaN(visitsPercentage) || !isFinite(visitsPercentage) ? 0 : visitsPercentage

  const guestPassesUsed = subscription?.guestPassesUsed || 0
  const guestPassesLimit = subscription?.guestPassesLimit || 0
  const guestPassesRemaining = guestPassesLimit - guestPassesUsed
  const guestPassesPercentage =
    guestPassesLimit > 0 ? (guestPassesUsed / guestPassesLimit) * 100 : 0

  const totalGyms = passHistory?.length || 0
  const totalPasses = passHistory?.reduce((sum, item) => sum + item.visitCount, 0) || 0
  
  console.log('[PassesView] Calculated totals - totalGyms:', totalGyms, 'totalPasses:', totalPasses)

  const toggleGym = (gymId: number) => {
    setExpandedGyms((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(gymId)) {
        newSet.delete(gymId)
      } else {
        newSet.add(gymId)
      }
      return newSet
    })
  }

  const handleGenerateNewPass = async (gymId: number, chain?: any) => {
    setError(null)

    try {
      // If chain data is available, check for terms
      if (chain) {
        const hasTerms = 
          (chain.terms && typeof chain.terms === 'string' && chain.terms.trim() !== '') || 
          (chain.use_terms_url && chain.terms_url && typeof chain.terms_url === 'string' && chain.terms_url.trim() !== '')
        const hasHealthStatement =
          (chain.health_statement && typeof chain.health_statement === 'string' && chain.health_statement.trim() !== '') ||
          (chain.use_health_statement_url && chain.health_statement_url && typeof chain.health_statement_url === 'string' && chain.health_statement_url.trim() !== '')

        if (hasTerms || hasHealthStatement) {
          // Show terms modal
          setShowTermsModal({ gymId, chain })
          return
        }
      } else {
        // Fetch chain data to check for terms
        try {
          const response = await fetch(`/api/gyms/${gymId}`)
          if (response.ok) {
            const data = await response.json()
            if (data.chain) {
              const chainData = data.chain
              const hasTerms = 
                (chainData.terms && typeof chainData.terms === 'string' && chainData.terms.trim() !== '') || 
                (chainData.use_terms_url && chainData.terms_url && typeof chainData.terms_url === 'string' && chainData.terms_url.trim() !== '')
              const hasHealthStatement =
                (chainData.health_statement && typeof chainData.health_statement === 'string' && chainData.health_statement.trim() !== '') ||
                (chainData.use_health_statement_url && chainData.health_statement_url && typeof chainData.health_statement_url === 'string' && chainData.health_statement_url.trim() !== '')

              if (hasTerms || hasHealthStatement) {
                // Show terms modal
                setShowTermsModal({ gymId, chain: chainData })
                return
              }
            }
          }
        } catch (fetchError) {
          console.error('Error fetching gym chain data:', fetchError)
          // Continue to generate pass without terms check
        }
      }

      // No terms or couldn't fetch, generate directly
      await generatePass(gymId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoadingGymId(null)
    }
  }

  const generatePass = async (gymId: number) => {
    setShowTermsModal(null)
    setLoadingGymId(gymId)
    setError(null)

    try {
      const response = await fetch('/api/passes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gymId: gymId.toString() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate pass')
      }

      // Redirect to passes page to see the newly generated pass
      router.push('/passes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoadingGymId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Monthly Usage Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="space-y-6">
          {/* Gym Passes Generated in Billing Period */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  {subscription?.tier || 'Premium'} Plan
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {passesCreated}{monthlyLimit > 0 ? `/${monthlyLimit}` : ''}
                </span>
              </div>
            </div>
            {monthlyLimit > 0 ? (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2 relative">
                  <div
                    className="bg-orange-500 h-2.5 rounded-full transition-all"
                    style={{ 
                      width: `${displayPercentage}%`,
                      minWidth: displayPercentage > 0 ? '2px' : '0px' // Ensure visible even for small percentages
                    }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {visitsRemaining} passes remaining this billing period
                </p>
              </>
            ) : subscription ? (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-orange-500 h-2.5 rounded-full transition-all"
                    style={{ width: '0%' }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No monthly limit set for this plan
                </p>
              </>
            ) : (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-orange-500 h-2.5 rounded-full transition-all"
                    style={{ width: '0%' }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Get a subscription to track your pass usage
                </p>
              </>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              {subscription?.nextBillingDate 
                ? `Resets on ${new Date(subscription.nextBillingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                : subscription 
                  ? 'No billing date set.'
                  : 'Get a subscription to generate passes.'}
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
            <div className="space-y-4">
              {activePasses.map((pass) => (
                <div
                  key={pass.id}
                  className="relative p-6 rounded-2xl bg-green-50 dark:bg-green-900/20 shadow-lg border border-green-100 dark:border-green-800"
                >
                  {/* Active Status Badge - Top Right */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-800 rounded-lg">
                    <svg
                      className="w-4 h-4 text-green-600 dark:text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Active
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6 pr-24">
                    {/* Left Side - Pass Information */}
                    <div className="flex-1 space-y-3">
                      {/* Gym Name */}
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                          {pass.gym?.name || 'Unknown Gym'}
                        </h3>
                      </div>

                      {/* Address with Location Icon */}
                      {(pass.gym?.address || pass.gym?.city || pass.gym?.postcode) && (
                        <div className="flex items-start gap-2">
                          <svg
                            className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {[
                              pass.gym?.address,
                              pass.gym?.city,
                              pass.gym?.postcode,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Valid Until with Clock Icon */}
                      <div className="flex items-start gap-2">
                        <svg
                          className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Valid until{' '}
                          {pass.validUntil.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}{' '}
                          {pass.validUntil.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </p>
                      </div>

                      {/* Pass Code - White Box */}
                      {pass.passCode && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mt-4">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Pass Code
                          </p>
                          <p className="text-base font-mono font-bold text-gray-900 dark:text-white break-all">
                            {pass.passCode}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Side - QR Code */}
                    {pass.passCode && (
                      <div className="flex flex-col items-center">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pass.passCode)}`}
                            alt="Pass QR Code"
                            className="w-32 h-32"
                          />
                        </div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                          Scan at gym
                        </p>
                      </div>
                    )}
                  </div>
                </div>
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
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          {passHistory.length > 0 ? (
            <div className="space-y-2">
              {passHistory.map((item) => {
                const isExpanded = expandedGyms.has(item.gym.id)
                return (
                  <div
                    key={item.gym.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    {/* Accordion Header */}
                    <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <button
                        onClick={() => toggleGym(item.gym.id)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        {item.chain?.logo_url ? (
                          <img
                            src={item.chain.logo_url}
                            alt={item.chain.name}
                            className="w-20 h-auto object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                              {item.gym.name.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="text-left">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {item.gym.name}
                          </h3>
                          {item.chain && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {item.chain.name}
                            </p>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {item.visitCount} visit{item.visitCount !== 1 ? 's' : ''}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Last: {item.lastVisit ? new Date(item.lastVisit).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }) : 'N/A'}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleGenerateNewPass(item.gym.id, item.chain)
                          }}
                          disabled={loadingGymId === item.gym.id}
                          className="px-4 py-2 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2 whitespace-nowrap"
                        >
                          {loadingGymId === item.gym.id ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Generating...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Generate New Pass
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => toggleGym(item.gym.id)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                        >
                          <svg
                            className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
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
                      </div>
                    </div>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <div className="p-4 space-y-3">
                          {item.passes.map((pass) => {
                            const passDate = pass.usedAt || pass.createdAt
                            const isUsed = !!pass.usedAt
                            
                            return (
                              <div
                                key={pass.id}
                                className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                          isUsed
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                            : pass.status === 'expired'
                                            ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                        }`}
                                      >
                                        {isUsed ? 'Used' : pass.status}
                                      </span>
                                      {pass.subscriptionTier && (
                                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                                          {pass.subscriptionTier}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {isUsed ? 'Used' : 'Created'}: {new Date(passDate).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              <p>No pass history yet</p>
            </div>
          )}
      </div>

      {/* Terms Modal */}
      {showTermsModal && (
        <TermsModal
          chain={showTermsModal.chain}
          onAccept={() => generatePass(showTermsModal.gymId)}
          onCancel={() => {
            setShowTermsModal(null)
            setLoadingGymId(null)
            setError(null)
          }}
        />
      )}
    </div>
  )
}

