'use client'

import { useState } from 'react'
import { Subscription } from '@/lib/types'
import { StripeProduct } from '@/app/api/stripe/products/route'
import SubscriptionManager from './SubscriptionManager'

interface ProfileTabsProps {
  userEmail: string
  userName: string
  userInitials: string
  subscription: Subscription | null
  products: StripeProduct[]
  searchParams?: { success?: string; canceled?: string; tab?: string }
}

export default function ProfileTabs({
  userEmail,
  userName,
  userInitials,
  subscription,
  products,
  searchParams,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription'>(
    searchParams?.tab === 'subscription' ? 'subscription' : 'profile'
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 px-4 py-4 text-center font-medium transition-colors ${
              activeTab === 'profile'
                ? 'text-orange-600 dark:text-orange-400 border-b-2 border-orange-600 dark:border-orange-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`flex-1 px-4 py-4 text-center font-medium transition-colors ${
              activeTab === 'subscription'
                ? 'text-orange-600 dark:text-orange-400 border-b-2 border-orange-600 dark:border-orange-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Subscription
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-500 flex items-center justify-center text-white text-2xl font-semibold">
                {userInitials}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {userName}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {userEmail}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <p className="text-gray-900 dark:text-white">{userEmail}</p>
              </div>

              {subscription && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Membership
                  </label>
                  <p className="text-gray-900 dark:text-white capitalize">
                    {subscription.tier} Member
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <a
                  href="/api/auth/logout"
                  className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Logout
                </a>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                anygym Membership
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Manage your current plan or switch to a new one.
              </p>
            </div>

            {searchParams?.success && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-green-800 dark:text-green-200">
                  ✅ Subscription successful! Your plan has been updated.
                </p>
              </div>
            )}
            {searchParams?.canceled && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-yellow-800 dark:text-yellow-200">
                  ⚠️ Checkout was canceled. No changes were made to your subscription.
                </p>
              </div>
            )}

            <SubscriptionManager subscription={subscription} products={products} />
          </div>
        )}
      </div>
    </div>
  )
}

