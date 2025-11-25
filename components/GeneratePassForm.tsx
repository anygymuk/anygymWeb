'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TermsModal from '@/components/TermsModal'

interface GeneratePassFormProps {
  gymId: string
  chain?: any
}

export default function GeneratePassForm({ gymId, chain }: GeneratePassFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTermsModal, setShowTermsModal] = useState(false)
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

  const handleGenerateClick = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if chain exists and has terms or health statement
    const chainData = getChainData()
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
        body: JSON.stringify({ gymId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate pass')
      }

      router.push(`/passes/${data.pass.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleGenerateClick}>
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Generate a pass to access this gym. The pass will be valid for 24 hours from the time of generation.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? 'Generating...' : 'Generate Pass'}
        </button>
      </form>

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
    </>
  )
}

