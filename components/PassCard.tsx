'use client'

import { GymPass } from '@/lib/types'
import Link from 'next/link'

interface PassCardProps {
  pass: GymPass
}

export default function PassCard({ pass }: PassCardProps) {
  const isExpired = new Date(pass.validUntil) < new Date()
  const statusColor =
    pass.status === 'active' && !isExpired
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      {pass.gym && (
        <>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {pass.gym.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {pass.gym.address}, {pass.gym.city} {pass.gym.postcode}
          </p>
        </>
      )}
      <div className="flex items-center justify-between mb-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
          {isExpired ? 'Expired' : pass.status}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Valid until: {new Date(pass.validUntil).toLocaleDateString()}
        </span>
      </div>
      <Link
        href={`/passes/${pass.id}`}
        className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        View Pass
      </Link>
    </div>
  )
}

