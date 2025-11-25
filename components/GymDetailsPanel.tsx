'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gym } from '@/lib/types'
import TermsModal from './TermsModal'

interface GymDetailsPanelProps {
  gym: Gym
  chain?: any
  onClose: () => void
  hasSubscription: boolean
}

export default function GymDetailsPanel({
  gym,
  chain,
  onClose,
  hasSubscription,
}: GymDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'amenities' | 'hours'>('amenities')
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Helper to parse chain data
  const getChainData = () => {
    if (!chain) return null
    if (typeof chain === 'string') {
      try {
        return JSON.parse(chain)
      } catch (e) {
        console.error('Error parsing chain JSON:', e)
        return null
      }
    }
    return chain
  }

  const handleGeneratePassClick = () => {
    const chainData = getChainData()
    
    // Check if chain has terms or health statement
    if (!chainData) {
      // No chain data, generate directly
      handleGeneratePass()
      return
    }
    
    const hasTerms = 
      (chainData.terms && typeof chainData.terms === 'string' && chainData.terms.trim() !== '') || 
      (chainData.use_terms_url && chainData.terms_url && typeof chainData.terms_url === 'string' && chainData.terms_url.trim() !== '')
    const hasHealthStatement =
      (chainData.health_statement && typeof chainData.health_statement === 'string' && chainData.health_statement.trim() !== '') ||
      (chainData.use_health_statement_url && chainData.health_statement_url && typeof chainData.health_statement_url === 'string' && chainData.health_statement_url.trim() !== '')

    if (hasTerms || hasHealthStatement) {
      setShowTermsModal(true)
    } else {
      // No terms/health statement, generate directly
      handleGeneratePass()
    }
  }

  const handleGeneratePass = async () => {
    setShowTermsModal(false)
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/passes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gymId: gym.id.toString() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate pass')
      }

      // Redirect to passes page to see the newly generated pass
      router.push('/passes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  // Parse amenities - handle both array and object formats
  const amenities = Array.isArray(gym.amenities)
    ? gym.amenities
    : gym.amenities
    ? Object.keys(gym.amenities).filter((key) => gym.amenities[key])
    : []

  // Common amenities with SVG icons
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
    if (lower.includes('personal training') || lower.includes('pt')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    }
    if (lower.includes('group class') || lower.includes('class')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    }
    if (lower.includes('steam')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      )
    }
    if (lower.includes('cardio') || lower.includes('heart')) {
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )
    }
    if (lower.includes('weight') || lower.includes('dumbbell')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    }
    if (lower.includes('air') || lower.includes('ac') || lower.includes('conditioning')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    }
    
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }

  // Parse opening hours
  const openingHours = gym.opening_hours || {}

  return (
    <div className="fixed inset-0 md:inset-auto md:bottom-0 md:right-0 w-full md:w-[500px] bg-white dark:bg-gray-800 shadow-2xl md:rounded-tl-lg h-screen md:h-auto md:max-h-[85vh] overflow-y-auto z-50">
      {/* Close button */}
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
        {/* Header */}
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

        {/* Description */}
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

        {/* Subscription CTA */}
        <div className="mb-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          {hasSubscription ? (
            <button
              onClick={handleGeneratePassClick}
              disabled={loading}
              className="block w-full px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors text-center font-semibold mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Generating...' : 'Generate Pass'}
            </button>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <Link
                  href="/subscription"
                  className="flex-1 px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors text-center font-semibold"
                >
                  Get a Subscription
                </Link>
                <button
                  className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Share"
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
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Get a subscription to access gyms.{' '}
                <Link
                  href="/subscription"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  View plans
                </Link>
              </p>
            </>
          )}
        </div>

        {/* Tabs */}
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

        {/* Tab Content */}
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

      {/* Terms Modal */}
      {showTermsModal && (() => {
        const chainData = getChainData()
        return chainData ? (
          <TermsModal
            chain={chainData}
            onAccept={handleGeneratePass}
            onCancel={() => setShowTermsModal(false)}
          />
        ) : null
      })()}
    </div>
  )
}

