'use client'

import { useState } from 'react'

interface TermsModalProps {
  chain?: any | null
  onAccept: () => void
  onCancel: () => void
}

export default function TermsModal({ chain, onAccept, onCancel }: TermsModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [healthAccepted, setHealthAccepted] = useState(false)

  const hasTerms = chain?.terms || (chain?.use_terms_url && chain?.terms_url)
  const hasHealthStatement =
    chain?.health_statement || (chain?.use_health_statement_url && chain?.health_statement_url)

  const canAccept = (!hasTerms || termsAccepted) && (!hasHealthStatement || healthAccepted)

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Terms & Health Statement
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Please review and accept the terms and health statement to generate your pass
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Terms Section */}
          {hasTerms && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Terms & Conditions
                </h3>
                {chain?.use_terms_url && chain?.terms_url ? (
                  <a
                    href={chain.terms_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    View Full Terms →
                  </a>
                ) : null}
              </div>
              {chain?.terms && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {chain.terms}
                  </p>
                </div>
              )}
              {chain?.use_terms_url && chain?.terms_url && !chain?.terms && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Terms and conditions are available at the link above.
                  </p>
                </div>
              )}
              <label className="flex items-start gap-3 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  I accept the terms and conditions
                </span>
              </label>
            </div>
          )}

          {/* Health Statement Section */}
          {hasHealthStatement && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Health Statement
                </h3>
                {chain?.use_health_statement_url && chain?.health_statement_url ? (
                  <a
                    href={chain.health_statement_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    View Full Statement →
                  </a>
                ) : null}
              </div>
              {chain?.health_statement && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {chain.health_statement}
                  </p>
                </div>
              )}
              {chain?.use_health_statement_url &&
                chain?.health_statement_url &&
                !chain?.health_statement && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      Health statement is available at the link above.
                    </p>
                  </div>
                )}
              <label className="flex items-start gap-3 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={healthAccepted}
                  onChange={(e) => setHealthAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  I acknowledge the health statement
                </span>
              </label>
            </div>
          )}

          {!hasTerms && !hasHealthStatement && (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              <p>No terms or health statement available for this gym.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={!canAccept}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Accept & Generate Pass
          </button>
        </div>
      </div>
    </div>
  )
}

