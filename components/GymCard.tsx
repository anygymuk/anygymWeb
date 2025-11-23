'use client'

import { Gym } from '@/lib/types'
import Link from 'next/link'

interface GymCardProps {
  gym: Gym
}

export default function GymCard({ gym }: GymCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {gym.name}
      </h3>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-4">
        <p>{gym.address}</p>
        <p>
          {gym.city} {gym.postcode}
        </p>
        {gym.phone && <p>Phone: {gym.phone}</p>}
      </div>
      {gym.amenities && Array.isArray(gym.amenities) && gym.amenities.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {gym.amenities.slice(0, 3).map((amenity: any, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded"
              >
                {typeof amenity === 'string' ? amenity : amenity.name || amenity}
              </span>
            ))}
          </div>
        </div>
      )}
      <Link
        href="/dashboard"
        className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        View on Map
      </Link>
    </div>
  )
}

