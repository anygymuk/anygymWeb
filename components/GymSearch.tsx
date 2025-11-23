'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gym } from '@/lib/types'
import GymCard from './GymCard'

interface GymSearchProps {
  initialGyms: Gym[]
}

export default function GymSearch({ initialGyms }: GymSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [gyms, setGyms] = useState<Gym[]>(initialGyms)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim())
      }
      router.push(`/gyms?${params.toString()}`)
      
      // Fetch new results
      const response = await fetch(`/api/gyms/search?${params.toString()}`)
      const data = await response.json()
      setGyms(data.gyms || [])
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, city, or state..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {gyms.length > 0 ? (
          gyms.map((gym) => <GymCard key={gym.id} gym={gym} />)
        ) : (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            No gyms found. Try a different search term.
          </div>
        )}
      </div>
    </div>
  )
}

