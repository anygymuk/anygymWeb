'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gym, MembershipContext } from '@/lib/types'
import { formatPrice } from '@/lib/membership'
import { redirectToPassCheckout } from '@/lib/pass-checkout'
import TermsModal from './TermsModal'

interface GymDetailsPanelProps {
  gym: Gym
  chain?: any
  onClose: () => void
  membershipContext: MembershipContext
}

export default function GymDetailsPanel({
  gym,
  chain,
  onClose,
  membershipContext,
}: GymDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'amenities' | 'hours'>('amenities')
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chainData, setChainData] = useState<any>(chain)
  const router = useRouter()

  const { isFreeTier, isPaidTier, hasMembership } = membershipContext
  const passPrice = gym.pricePerPass
  const canPurchasePass =
    isFreeTier && passPrice != null && passPrice > 0
  const purchaseUnavailable =
    isFreeTier && (passPrice == null || passPrice <= 0)

  useEffect(() => {
    if (chain) {
      setChainData(chain)
    }
  }, [chain])

  const getChainData = () => {
    const dataToUse = chainData || chain
    if (!dataToUse) return null
    if (typeof dataToUse === 'string') {
      try {
        return JSON.parse(dataToUse)
      } catch (e) {
        console.error('Error parsing chain JSON:', e)
        return null
      }
    }
    return dataToUse
  }

  const chainHasTermsOrHealth = (currentChainData: any) => {
    const hasTerms =
      (currentChainData.terms_url &&
        typeof currentChainData.terms_url === 'string' &&
        currentChainData.terms_url.trim() !== '') ||
      (currentChainData.terms &&
        typeof currentChainData.terms === 'string' &&
        currentChainData.terms.trim() !== '')

    const hasHealthStatement =
      (currentChainData.health_statement_url &&
        typeof currentChainData.health_statement_url === 'string' &&
        currentChainData.health_statement_url.trim() !== '') ||
      (currentChainData.health_statement &&
        typeof currentChainData.health_statement === 'string' &&
        currentChainData.health_statement.trim() !== '')

    return hasTerms || hasHealthStatement
  }

  const handlePassActionClick = async () => {
    setLoading(true)
    setError(null)

    let currentChainData = getChainData()

    if (!currentChainData && gym.id) {
      try {
        const response = await fetch(`/api/gyms/${gym.id}`)

        if (!response.ok) {
          if (response.status === 404) {
            setError('Gym not found. Please try again.')
            setLoading(false)
            return
          }
          if (isPaidTier) {
            await handleGeneratePass()
            return
          }
          if (isFreeTier && canPurchasePass) {
            await handlePurchasePass()
            return
          }
          setLoading(false)
          return
        }

        const data = await response.json()
        if (data.gym) {
          currentChainData = data.gym_chain
          setChainData(data.gym_chain)
        }
      } catch {
        setLoading(false)
        setError('Failed to load gym details. Please try again.')
        return
      }
    }

    setLoading(false)

    if (!currentChainData) {
      if (isPaidTier) {
        await handleGeneratePass()
      } else if (canPurchasePass) {
        await handlePurchasePass()
      }
      return
    }

    if (chainHasTermsOrHealth(currentChainData)) {
      setShowTermsModal(true)
    } else if (isPaidTier) {
      await handleGeneratePass()
    } else if (canPurchasePass) {
      await handlePurchasePass()
    }
  }

  const handleGeneratePass = async () => {
    setShowTermsModal(false)
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/passes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymId: gym.id.toString() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate pass')
      }

      router.push('/passes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handlePurchasePass = async () => {
    setShowTermsModal(false)
    setLoading(true)
    setError(null)

    try {
      await redirectToPassCheckout(gym.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const handleTermsAccept = () => {
    if (isPaidTier) {
      handleGeneratePass()
    } else {
      handlePurchasePass()
    }
  }

  // Parse amenities - handle both array and object formats
  const amenities = Array.isArray(gym.amenities)
    ? gym.amenities
    : gym.amenities
    ? Object.keys(gym.amenities).filter((key) => gym.amenities[key])
    : []

  const getAmenityIcon = (amenity: string) => {
    const lower = amenity.toLowerCase()

    if (lower.includes('wifi') || lower.includes('wi-fi')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      )
    }
    if (lower.includes('parking')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
        </svg>
      )
    }
    if (lower.includes('shower')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )
    }
    if (lower.includes('locker')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    }

    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }

  const openingHours = gym.opening_hours || {}

  const termsActionLabel = isFreeTier
    ? 'Accept & Purchase Pass'
    : 'Accept & Generate Pass'

  return (
    <div className="fixed inset-0 md:inset-auto md:bottom-0 md:right-0 w-full md:w-[500px] bg-white dark:bg-gray-800 shadow-2xl md:rounded-tl-lg h-screen md:h-auto md:max-h-[85vh] overflow-y-auto z-50">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        aria-label="Close"
      >
        <svg
          className="w-5 h-5 text-gray-600 dark:text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="p-4 sm:p-6">
        <div className="mb-4">
          <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 mb-2">
            {gym.required_tier}
          </span>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {gym.name}
          </h2>
          {chain && (
            <>
              <div className="flex items-center gap-2 mb-4">
                {chain.logo_url && (
                  <img
                    src={chain.logo_url}
                    alt={chain.name}
                    className="h-12 w-auto"
                  />
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {chain.name}
              </p>
            </>
          )}
          <p className="text-gray-600 dark:text-gray-400">
            {gym.address}, {gym.city} {gym.postcode}
          </p>
        </div>

        {chain?.description && (
          <div className="mb-6">
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              {showFullDescription
                ? chain.description
                : chain.description.substring(0, 150)}
              {chain.description.length > 150 && (
                <>
                  {!showFullDescription && '...'}
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="ml-1 text-orange-600 hover:text-orange-700 font-medium"
                  >
                    {showFullDescription ? 'View less' : 'View more'}
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        <div className="mb-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {isPaidTier && (
            <button
              onClick={handlePassActionClick}
              disabled={loading}
              className="block w-full px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors text-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Generate Pass'}
            </button>
          )}

          {canPurchasePass && (
            <>
              <div className="mb-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Pass price
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(passPrice!)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  One-time payment for a 24-hour gym pass
                </p>
              </div>
              <button
                onClick={handlePassActionClick}
                disabled={loading}
                className="block w-full px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors text-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : `Purchase Pass — ${formatPrice(passPrice!)}`}
              </button>
            </>
          )}

          {purchaseUnavailable && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 text-center mb-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pass purchase is not available at this gym yet.
              </p>
            </div>
          )}

          {!hasMembership && (
            <>
              <div className="flex gap-2 mb-2">
                <Link
                  href="/subscription"
                  className="flex-1 px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors text-center font-semibold"
                >
                  Get a Subscription
                </Link>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Subscribe for monthly passes, or{' '}
                <Link
                  href="/onboarding?step=4"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  continue with free pay-per-pass
                </Link>
                .
              </p>
            </>
          )}
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('amenities')}
              className={`pb-3 px-1 font-medium text-sm transition-colors ${
                activeTab === 'amenities'
                  ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Amenities
            </button>
            <button
              onClick={() => setActiveTab('hours')}
              className={`pb-3 px-1 font-medium text-sm transition-colors ${
                activeTab === 'hours'
                  ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Opening Hours
            </button>
          </div>
        </div>

        {activeTab === 'amenities' && (
          <div className="grid grid-cols-2 gap-3">
            {amenities.length > 0 ? (
              amenities.map((amenity: any, index: number) => {
                const amenityName =
                  typeof amenity === 'string' ? amenity : amenity.name || amenity
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">
                      {getAmenityIcon(amenityName)}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {amenityName}
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="col-span-2 text-gray-500 dark:text-gray-400 text-sm">
                No amenities listed
              </p>
            )}
          </div>
        )}

        {activeTab === 'hours' && (
          <div className="space-y-2">
            {Object.keys(openingHours).length > 0 ? (
              Object.entries(openingHours).map(([day, hours]: [string, any]) => (
                <div
                  key={day}
                  className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700"
                >
                  <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {day}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {typeof hours === 'string'
                      ? hours
                      : hours.open && hours.close
                      ? `${hours.open} - ${hours.close}`
                      : 'Closed'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Opening hours not available
              </p>
            )}
          </div>
        )}
      </div>

      {showTermsModal && (() => {
        const currentChainData = getChainData()
        return currentChainData ? (
          <TermsModal
            chain={currentChainData}
            onAccept={handleTermsAccept}
            onCancel={() => setShowTermsModal(false)}
            actionLabel={termsActionLabel}
            priceDisplay={
              isFreeTier && passPrice ? formatPrice(passPrice) : undefined
            }
            subtitle={
              isFreeTier
                ? 'Please review and accept the terms and health statement to purchase your pass'
                : undefined
            }
          />
        ) : null
      })()}
    </div>
  )
}
