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
}

export default function PassesView({
  subscription: initialSubscription,
  activePasses: initialActivePasses,
  passHistory: initialPassHistory,
}: PassesViewProps) {
  const router = useRouter()
  const [expandedGyms, setExpandedGyms] = useState<Set<number>>(new Set())
  const [showTermsModal, setShowTermsModal] = useState<{ gymId: number; chain: any } | null>(null)
  const [loadingGymId, setLoadingGymId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Local state for data that can be updated without page reload
  const [subscription, setSubscription] = useState<Subscription | null>(initialSubscription)
  const [activePasses, setActivePasses] = useState<GymPass[]>(initialActivePasses)
  const [passHistory, setPassHistory] = useState<PassHistoryItem[]>(initialPassHistory)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Debug logging with error handling
  useEffect(() => {
    try {
      console.log('[PassesView] Component rendered with props:')
      console.log('[PassesView] subscription:', subscription)
      console.log('[PassesView] subscription exists?', !!subscription)
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
  }, [subscription, passHistory, activePasses])
  
  // Debug logging
  console.log('[PassesView] Subscription object:', subscription)
  console.log('[PassesView] Subscription keys:', subscription ? Object.keys(subscription) : 'null')
  if (subscription) {
    console.log('[PassesView] Subscription raw values:', {
      visitsUsed: subscription.visitsUsed,
      monthlyLimit: subscription.monthlyLimit,
      price: subscription.price,
      tier: subscription.tier,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextBillingDate: subscription.nextBillingDate,
      guestPassesUsed: subscription.guestPassesUsed,
      guestPassesLimit: subscription.guestPassesLimit,
    })
  }
  
  // Use visits_used from subscription API response
  // Handle both number and string values (Date objects become strings when serialized from server)
  const visitsUsed = subscription?.visitsUsed != null 
    ? (typeof subscription.visitsUsed === 'string' ? parseFloat(subscription.visitsUsed) : Number(subscription.visitsUsed))
    : 0
  
  // Get monthly limit from subscription - ensure it's a number
  const monthlyLimit = subscription?.monthlyLimit != null 
    ? (typeof subscription.monthlyLimit === 'string' ? parseFloat(subscription.monthlyLimit) : Number(subscription.monthlyLimit))
    : 0
  
  // Get price from subscription
  const price = subscription?.price != null 
    ? (typeof subscription.price === 'string' ? parseFloat(subscription.price) : parseFloat(String(subscription.price)))
    : 0
  
  // Get billing period dates from subscription
  // Dates are serialized as strings when passed from server to client, so handle both Date and string
  let currentPeriodStart: Date | null = null
  let currentPeriodEnd: Date | null = null
  let nextBillingDate: Date | null = null
  
  if (subscription?.currentPeriodStart) {
    try {
      currentPeriodStart = subscription.currentPeriodStart instanceof Date 
        ? subscription.currentPeriodStart 
        : new Date(subscription.currentPeriodStart)
      if (isNaN(currentPeriodStart.getTime())) currentPeriodStart = null
    } catch (e) {
      console.error('[PassesView] Error parsing currentPeriodStart:', e)
    }
  }
  
  if (subscription?.currentPeriodEnd) {
    try {
      currentPeriodEnd = subscription.currentPeriodEnd instanceof Date 
        ? subscription.currentPeriodEnd 
        : new Date(subscription.currentPeriodEnd)
      if (isNaN(currentPeriodEnd.getTime())) currentPeriodEnd = null
    } catch (e) {
      console.error('[PassesView] Error parsing currentPeriodEnd:', e)
    }
  }
  
  if (subscription?.nextBillingDate) {
    try {
      nextBillingDate = subscription.nextBillingDate instanceof Date 
        ? subscription.nextBillingDate 
        : new Date(subscription.nextBillingDate)
      if (isNaN(nextBillingDate.getTime())) nextBillingDate = null
    } catch (e) {
      console.error('[PassesView] Error parsing nextBillingDate:', e)
    }
  }
  
  // Get tier from subscription
  const tier = subscription?.tier || 'Premium'
  
  // Get guest passes values
  const guestPassesUsed = subscription?.guestPassesUsed != null 
    ? (typeof subscription.guestPassesUsed === 'string' ? parseFloat(subscription.guestPassesUsed) : Number(subscription.guestPassesUsed))
    : 0
  const guestPassesLimit = subscription?.guestPassesLimit != null 
    ? (typeof subscription.guestPassesLimit === 'string' ? parseFloat(subscription.guestPassesLimit) : Number(subscription.guestPassesLimit))
    : 0
  
  console.log('[PassesView] Extracted values:', {
    visitsUsed,
    monthlyLimit,
    price,
    tier,
    currentPeriodStart: currentPeriodStart?.toISOString() || 'null',
    currentPeriodEnd: currentPeriodEnd?.toISOString() || 'null',
    nextBillingDate: nextBillingDate?.toISOString() || 'null',
    guestPassesUsed,
    guestPassesLimit,
  })
  
  // Calculate remaining passes and percentage
  const visitsRemaining = Math.max(0, monthlyLimit - visitsUsed)
  const visitsPercentage = monthlyLimit > 0 
    ? Math.min(100, Math.max(0, (visitsUsed / monthlyLimit) * 100))
    : 0
  
  // Ensure percentage is valid for rendering
  const displayPercentage = isNaN(visitsPercentage) || !isFinite(visitsPercentage) ? 0 : visitsPercentage

  // Guest passes values already extracted above
  const guestPassesRemaining = guestPassesLimit - guestPassesUsed
  
  // Debug: Log what will be rendered
  console.log('[PassesView] Rendering values:', {
    tierDisplay: tier,
    visitsDisplay: `${visitsUsed}${monthlyLimit > 0 ? `/${monthlyLimit}` : ''}`,
    monthlyLimitIsGreaterThanZero: monthlyLimit > 0,
    subscriptionExists: !!subscription,
    displayPercentage,
    visitsRemaining,
    guestPassesDisplay: `${guestPassesUsed}/${guestPassesLimit}`,
  })
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
      // Always fetch full chain data to check for terms and health statements
      // The chain data from pass history may only have basic info (name, logo) without terms
      try {
        const response = await fetch(`/api/gyms/${gymId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.gym_chain) {
            const chainData = data.gym_chain
            // Check if terms exist - either as URL or as markdown content
            const hasTerms = 
              (chainData.terms_url && typeof chainData.terms_url === 'string' && chainData.terms_url.trim() !== '') ||
              (chainData.terms && typeof chainData.terms === 'string' && chainData.terms.trim() !== '')
            
            // Check if health statement exists - either as URL or as markdown content
            const hasHealthStatement =
              (chainData.health_statement_url && typeof chainData.health_statement_url === 'string' && chainData.health_statement_url.trim() !== '') ||
              (chainData.health_statement && typeof chainData.health_statement === 'string' && chainData.health_statement.trim() !== '')

            if (hasTerms || hasHealthStatement) {
              // Show terms modal with full chain data
              setShowTermsModal({ gymId, chain: chainData })
              return
            }
          }
        }
      } catch (fetchError) {
        console.error('Error fetching gym chain data:', fetchError)
        // Continue to generate pass without terms check if fetch fails
      }

      // No terms found, generate pass directly
      await generatePass(gymId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoadingGymId(null)
    }
  }

  // Function to refresh passes data from API
  const refreshPassesData = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/passes/refresh')
      if (!response.ok) {
        console.error('[PassesView] Failed to refresh passes data')
        return
      }

      const result = await response.json()
      if (!result.success || !result.data) {
        console.error('[PassesView] Invalid refresh response')
        return
      }

      const data = result.data
      console.log('[PassesView] Refreshed data from API:', data)

      // Update subscription
      if (data.subscription) {
        const sub = data.subscription
        let nextBillingDate: Date
        if (sub.next_billing_date) {
          const dateStr = sub.next_billing_date
          nextBillingDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
            ? new Date(dateStr + 'T23:59:59.999Z')
            : new Date(dateStr)
        } else {
          nextBillingDate = sub.current_period_end ? new Date(sub.current_period_end) : new Date()
        }
        
        setSubscription({
          id: sub.id || 0,
          userId: sub.user_id || '',
          tier: sub.tier || 'standard',
          monthlyLimit: Number(sub.monthly_limit || 0),
          visitsUsed: Number(sub.visits_used || 0),
          price: parseFloat(sub.price || 0),
          startDate: sub.start_date ? new Date(sub.start_date) : (sub.current_period_start ? new Date(sub.current_period_start) : new Date()),
          nextBillingDate,
          currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start) : new Date(),
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : new Date(),
          status: sub.status || 'active',
          stripeSubscriptionId: sub.stripe_subscription_id,
          stripeCustomerId: sub.stripe_customer_id,
          guestPassesLimit: Number(sub.guest_passes_limit || 0),
          guestPassesUsed: Number(sub.guest_passes_used || 0),
          createdAt: sub.created_at ? new Date(sub.created_at) : (sub.current_period_start ? new Date(sub.current_period_start) : new Date()),
          updatedAt: sub.updated_at ? new Date(sub.updated_at) : (sub.current_period_end ? new Date(sub.current_period_end) : new Date()),
        })
      }

      // Update active passes
      const activeData = data.active_passes || []
      console.log('[PassesView] Active passes data from API:', activeData)
      console.log('[PassesView] First active pass sample:', activeData[0])
      
      const now = new Date()
      const updatedActive = activeData
        .filter((p: any) => {
          const validUntil = p.valid_until ? new Date(p.valid_until) : null
          return p.status === 'active' && validUntil && validUntil > now
        })
        .map((p: any) => {
          // Map gym data - API has gym_name directly on pass object (not nested)
          // Structure: { gym_id, gym_name, gym_chain_id, gym_chain_name, gym_chain_logo, ... }
          let gymData = p.gym
          
          // If no nested gym object, create one from flat pass data (matches API response structure)
          if (!gymData && p.gym_name) {
            console.log('[PassesView] Creating gym object from flat pass data, gym_name:', p.gym_name)
            gymData = {
              id: p.gym_id,
              name: p.gym_name, // Use gym_name directly from pass object
              address: '',
              city: '',
              postcode: '',
              phone: undefined,
              latitude: undefined,
              longitude: undefined,
              gym_chain_id: p.gym_chain_id,
              required_tier: 'standard',
              amenities: [],
              opening_hours: {},
              image_url: undefined,
              rating: undefined,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          } else if (!gymData) {
            console.warn('[PassesView] No gym data found for pass:', p.id, 'gym_name:', p.gym_name, 'gym object:', p.gym)
          }
          
          return {
            id: p.id,
            userId: p.user_id || '',
            gymId: p.gym_id,
            passCode: p.pass_code || '',
            status: p.status || 'active',
            validUntil: p.valid_until ? new Date(p.valid_until) : new Date(),
            usedAt: p.used_at ? new Date(p.used_at) : undefined,
            qrCodeUrl: p.qrcode_url || p.qr_code_url, // API uses qrcode_url
            subscriptionTier: p.subscription_tier,
            passCost: p.pass_cost ? parseFloat(p.pass_cost) : undefined,
            createdAt: p.created_at ? new Date(p.created_at) : new Date(),
            updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
            gym: gymData,
          } as GymPass
        })
        .sort((a: GymPass, b: GymPass) => b.createdAt.getTime() - a.createdAt.getTime())
      
      setActivePasses(updatedActive)
      
      // Note: router.refresh() will re-fetch server-side data, but due to Next.js caching
      // (revalidate: 60 seconds), it might still show cached data if refreshed within that window.
      // The client-side state updates above provide immediate UI updates.
      // For a manual page refresh, the cache will eventually expire (60 seconds),
      // but the client-side state ensures users see the updated data immediately after generation.
      router.refresh()
    } catch (err) {
      console.error('[PassesView] Error refreshing passes data:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const generatePass = async (gymId: number) => {
    setShowTermsModal(null)
    setLoadingGymId(gymId)
    setError(null)

    try {
      console.log('[PassesView] generatePass called with gymId:', gymId, 'type:', typeof gymId)
      
      const response = await fetch('/api/passes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gymId: gymId }),
      })

      const data = await response.json()
      
      console.log('[PassesView] generatePass response status:', response.status)
      console.log('[PassesView] generatePass response data:', data)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate pass')
      }

      // Refresh data from API instead of redirecting
      await refreshPassesData()
      setLoadingGymId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoadingGymId(null)
    }
  }

  // Force render values to ensure they're displayed
  const tierDisplay = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Premium'
  const visitsDisplay = `${visitsUsed}${monthlyLimit > 0 ? `/${monthlyLimit}` : ''}`
  
  // Additional debug: Log right before render
  console.log('[PassesView] About to render with:', {
    tierDisplay,
    visitsDisplay,
    visitsUsed,
    monthlyLimit,
    displayPercentage,
    subscriptionExists: !!subscription,
    subscriptionTier: subscription?.tier,
    subscriptionVisitsUsed: subscription?.visitsUsed,
    subscriptionMonthlyLimit: subscription?.monthlyLimit,
  })
  
  // Validate that values are actually numbers/strings before rendering
  if (typeof visitsUsed !== 'number' || typeof monthlyLimit !== 'number') {
    console.warn('[PassesView] Invalid value types:', {
      visitsUsedType: typeof visitsUsed,
      monthlyLimitType: typeof monthlyLimit,
      visitsUsedValue: visitsUsed,
      monthlyLimitValue: monthlyLimit,
    })
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
                  {tierDisplay || 'Premium'} Plan
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="visits-display">
                  {visitsDisplay || '0/0'}
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
              {currentPeriodEnd 
                ? `Resets on ${currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                : nextBillingDate
                  ? `Resets on ${nextBillingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                  : subscription 
                    ? 'No billing date set.'
                    : 'Get a subscription to generate passes.'}
            </p>
          </div>

          {/* Guest Passes Used */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="guest-passes-display">
                {guestPassesUsed ?? 0}/{guestPassesLimit ?? 0}
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

