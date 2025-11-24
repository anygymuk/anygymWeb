'use client'

import { useEffect } from 'react'

/**
 * Component to handle 404 errors for Next.js static assets during HMR
 * This suppresses console errors for assets that fail to load during
 * hot module replacement, which is a known Next.js dev server behavior.
 */
export default function AssetErrorHandler() {
  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== 'development') return

    // Store original console methods
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn

    // Override console.error to filter out known HMR asset errors
    console.error = (...args: any[]) => {
      const message = args.join(' ')
      
      // Filter out Next.js HMR asset errors (404, 500, ERR_ABORTED)
      if (
        typeof message === 'string' &&
        (message.includes('_next/static/') ||
         message.includes('ERR_ABORTED') ||
         message.includes('Failed to load resource') ||
         message.includes('net::ERR_ABORTED') ||
         message.includes('500') ||
         message.includes('404'))
      ) {
        // Silently ignore these known HMR issues
        return
      }
      
      // Log other errors normally
      originalConsoleError.apply(console, args)
    }

    // Override console.warn for network warnings
    console.warn = (...args: any[]) => {
      const message = args.join(' ')
      
      // Filter out Next.js HMR asset warnings
      if (
        typeof message === 'string' &&
        (message.includes('_next/static/') ||
         message.includes('preload') ||
         message.includes('was preloaded') ||
         message.includes('The resource'))
      ) {
        // Silently ignore these known HMR warnings
        return
      }
      
      // Log other warnings normally
      originalConsoleWarn.apply(console, args)
    }

    // Suppress network errors for Next.js static assets
    const handleError = (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null
      
      if (!target) return
      
      const href = target.getAttribute('href')
      const src = target.getAttribute('src')
      const resource = href || src || ''
      
      const isNextAsset = resource.includes('/_next/static/')

      if (isNextAsset) {
        // Suppress these errors - they're expected during HMR
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return false
      }
    }

    // Also intercept fetch errors
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      if (
        reason &&
        typeof reason === 'object' &&
        'message' in reason &&
        typeof reason.message === 'string' &&
        (reason.message.includes('_next/static/') ||
         reason.message.includes('ERR_ABORTED') ||
         reason.message.includes('500') ||
         reason.message.includes('404'))
      ) {
        event.preventDefault()
      }
    }

    // Listen for resource load errors
    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      // Restore original console methods
      console.error = originalConsoleError
      console.warn = originalConsoleWarn
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}

