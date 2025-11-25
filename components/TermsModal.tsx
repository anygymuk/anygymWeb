'use client'

import ReactMarkdown from 'react-markdown'

interface TermsModalProps {
  chain?: any | null
  onAccept: () => void
  onCancel: () => void
}

export default function TermsModal({ chain, onAccept, onCancel }: TermsModalProps) {
  const hasTerms = chain?.terms || (chain?.use_terms_url && chain?.terms_url)
  const hasHealthStatement =
    chain?.health_statement || (chain?.use_health_statement_url && chain?.health_statement_url)

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
              </div>
              {chain?.use_terms_url && chain?.terms_url ? (
                // Show only URL link when use_terms_url is true
                <div className="mb-3">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <a
                        href={chain.terms_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                      >
                        View Terms and Conditions
                        <svg
                          className="ml-1 w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </p>
                  </div>
                </div>
              ) : chain?.terms ? (
                // Show inline terms text only when use_terms_url is false/not set
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto mb-3">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{children}</h3>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {chain.terms}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Health Statement Section */}
          {hasHealthStatement && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Health Statement
                </h3>
              </div>
              {chain?.use_health_statement_url && chain?.health_statement_url ? (
                // Show only URL link when use_health_statement_url is true
                <div className="mb-3">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <a
                        href={chain.health_statement_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                      >
                        View Health and Safety Statement
                        <svg
                          className="ml-1 w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </p>
                  </div>
                </div>
              ) : chain?.health_statement ? (
                // Show inline health statement text only when use_health_statement_url is false/not set
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto mb-3">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{children}</h3>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {chain.health_statement}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : null}
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
            className="flex-1 px-4 py-2 bg-[#FF6B6B] text-white rounded-lg hover:bg-[#FF5252] transition-colors font-medium"
          >
            Accept & Generate Pass
          </button>
        </div>
      </div>
    </div>
  )
}

