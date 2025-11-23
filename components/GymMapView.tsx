'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Gym } from '@/lib/types'
import GymDetailsPanel from './GymDetailsPanel'

// Dynamically import GymMap to avoid SSR issues with Leaflet
const GymMap = dynamic(() => import('./GymMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center">Loading map...</div>,
})

interface GymMapViewProps {
  initialGyms: Gym[]
  chains?: any[]
  hasSubscription?: boolean
}

export default function GymMapView({ initialGyms, chains, hasSubscription = false }: GymMapViewProps) {
  const [gyms, setGyms] = useState<Gym[]>(initialGyms)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier, setSelectedTier] = useState('All Tiers')
  const [selectedChain, setSelectedChain] = useState('All Chains')
  const [selectedFacility, setSelectedFacility] = useState('All Facilities')
  const [loading, setLoading] = useState(false)
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null)
  const [selectedGymChain, setSelectedGymChain] = useState<any>(null)
  const [loadingGymDetails, setLoadingGymDetails] = useState(false)

  useEffect(() => {
    const fetchFilteredGyms = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.set('search', searchQuery)
        if (selectedTier !== 'All Tiers') params.set('tier', selectedTier)
        if (selectedChain !== 'All Chains') params.set('chain', selectedChain)

        const response = await fetch(`/api/gyms/search?${params.toString()}`)
        const data = await response.json()
        setGyms(data.gyms || [])
      } catch (error) {
        console.error('Error fetching gyms:', error)
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(() => {
      fetchFilteredGyms()
    }, 300) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchQuery, selectedTier, selectedChain, selectedFacility])

  // Handle gym click
  const handleGymClick = async (gym: Gym) => {
    setSelectedGym(gym)
    setLoadingGymDetails(true)
    
    try {
      const response = await fetch(`/api/gyms/${gym.id}`)
      const data = await response.json()
      if (data.gym) {
        setSelectedGym(data.gym)
        setSelectedGymChain(data.chain)
      }
    } catch (error) {
      console.error('Error fetching gym details:', error)
    } finally {
      setLoadingGymDetails(false)
    }
  }

  // Extract unique tiers and facilities from gyms
  const tiers = ['All Tiers', ...Array.from(new Set(gyms.map((g) => g.required_tier).filter(Boolean)))]
  const facilities = ['All Facilities'] // You can extract from amenities if needed

  return (
    <div className="flex flex-col h-full relative">
      <div className="mb-4 flex gap-4 px-6">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, chain, or city..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          {tiers.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          <option value="All Chains">All Chains</option>
          {chains?.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
        <select
          value={selectedFacility}
          onChange={(e) => setSelectedFacility(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        >
          {facilities.map((facility) => (
            <option key={facility} value={facility}>
              {facility}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
            <div className="text-gray-600">Loading...</div>
          </div>
        ) : null}
        <GymMap 
          gyms={gyms} 
          selectedGym={selectedGym}
          onGymClick={handleGymClick}
        />
      </div>
      
      {/* Gym Details Panel */}
      {selectedGym && (
        <GymDetailsPanel
          gym={selectedGym}
          chain={selectedGymChain}
          onClose={() => setSelectedGym(null)}
          hasSubscription={hasSubscription}
        />
      )}
    </div>
  )
}

