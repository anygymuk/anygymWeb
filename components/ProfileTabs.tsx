'use client'

import { useState, useEffect } from 'react'
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

interface ProfileData {
  fullName: string
  dateOfBirth: string
  addressLine1: string
  addressLine2: string
  addressCity: string
  addressPostcode: string
  emergencyContactName: string
  emergencyContactNumber: string
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
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    addressCity: '',
    addressPostcode: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
  })

  useEffect(() => {
    fetchProfileData()
  }, [])

  const fetchProfileData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/profile')
      if (!response.ok) {
        throw new Error('Failed to fetch profile data')
      }
      const data = await response.json()
      setProfileData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    fetchProfileData() // Reset to original values
    setError(null)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Tabs */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-[#FF6B6B] text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'subscription'
                ? 'bg-[#FF6B6B] text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
            <div className="flex items-center justify-between">
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
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">Loading profile...</p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-800 dark:text-green-200 text-sm">
                      Profile updated successfully!
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.fullName || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={profileData.dateOfBirth}
                        onChange={(e) => setProfileData({ ...profileData, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.dateOfBirth
                          ? new Date(profileData.dateOfBirth).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Address Line 1 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Address Line 1 <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.addressLine1}
                        onChange={(e) => setProfileData({ ...profileData, addressLine1: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.addressLine1 || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Address Line 2 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Address Line 2
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.addressLine2}
                        onChange={(e) => setProfileData({ ...profileData, addressLine2: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.addressLine2 || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* City */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      City <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.addressCity}
                        onChange={(e) => setProfileData({ ...profileData, addressCity: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.addressCity || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Postcode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Postcode <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.addressPostcode}
                        onChange={(e) => setProfileData({ ...profileData, addressPostcode: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.addressPostcode || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Emergency Contact Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Emergency Contact Name <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={profileData.emergencyContactName}
                        onChange={(e) => setProfileData({ ...profileData, emergencyContactName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.emergencyContactName || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Emergency Contact Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Emergency Contact Number <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={profileData.emergencyContactNumber}
                        onChange={(e) => setProfileData({ ...profileData, emergencyContactNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#FF6B6B] focus:border-transparent"
                        required
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-white">
                        {profileData.emergencyContactNumber || 'Not set'}
                      </p>
                    )}
                  </div>

                  {/* Email (read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <p className="text-gray-900 dark:text-white">{userEmail}</p>
                  </div>

                  {/* Membership (read-only) */}
                  {subscription && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Membership
                      </label>
                      <p className="text-gray-900 dark:text-white">
                        {subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1).toLowerCase()} Member
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {isEditing && (
                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Logout Button */}
                  {!isEditing && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <a
                        href="/api/auth/logout"
                        className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                      >
                        Logout
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
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

