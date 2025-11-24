'use client'

export default function AccountSetupError() {
  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Account Setup Issue
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          We couldn&apos;t set up your account. This might be a temporary issue.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
          Please check the server console for detailed error messages.
        </p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

