import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { UserProvider } from '@auth0/nextjs-auth0/client'
import AssetErrorHandler from '@/components/AssetErrorHandler'

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'anygym - Universal Gym Membership',
  description: 'Find and access gyms with flexible passes',
  icons: {
    icon: 'https://res.cloudinary.com/njh101010/image/upload/v1760889858/anygym/anygym.png',
    shortcut: 'https://res.cloudinary.com/njh101010/image/upload/v1760889858/anygym/anygym.png',
    apple: 'https://res.cloudinary.com/njh101010/image/upload/v1760889858/anygym/anygym.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <head>
        {/* Asset error handler - suppresses HMR errors without retrying */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                
                // Suppress console errors for Next.js assets
                const originalConsoleError = console.error;
                const originalConsoleWarn = console.warn;
                const originalConsoleLog = console.log;
                
                // Track if handler is active (for debugging)
                window.__hmrErrorHandlerActive = true;
                
                console.error = function(...args) {
                  const message = args.join(' ');
                  if (
                    typeof message === 'string' &&
                    (message.includes('_next/static/') ||
                     message.includes('ERR_ABORTED') ||
                     message.includes('Failed to load resource') ||
                     message.includes('net::ERR_ABORTED') ||
                     message.includes('500') ||
                     message.includes('404'))
                  ) {
                    return; // Silently ignore HMR errors
                  }
                  originalConsoleError.apply(console, args);
                };
                
                console.warn = function(...args) {
                  const message = args.join(' ');
                  if (
                    typeof message === 'string' &&
                    (message.includes('_next/static/') ||
                     message.includes('preload') ||
                     message.includes('was preloaded') ||
                     message.includes('The resource'))
                  ) {
                    return; // Silently ignore HMR warnings
                  }
                  originalConsoleWarn.apply(console, args);
                };
                
                // Suppress resource load errors - don't retry, just prevent breaking
                window.addEventListener('error', function(event) {
                  const target = event.target;
                  if (!target) return;
                  
                  const href = target.href || target.getAttribute?.('href');
                  const src = target.src || target.getAttribute?.('src');
                  const resource = href || src || '';
                  
                  if (resource && resource.includes('/_next/static/')) {
                    // Prevent error from breaking the app
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    return false;
                  }
                }, true);
                
                // Suppress unhandled promise rejections for Next.js assets
                window.addEventListener('unhandledrejection', function(event) {
                  const reason = event.reason;
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
                    event.preventDefault();
                  }
                });
              })();
            `,
          }}
        />
      </head>
      <body className={poppins.className}>
        <AssetErrorHandler />
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}

