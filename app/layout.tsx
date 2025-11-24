import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'
import { UserProvider } from '@auth0/nextjs-auth0/client'

const poppins = Poppins({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
})

export const metadata: Metadata = {
  title: 'AnyGym - Gym Pass Access',
  description: 'Find and access gyms with flexible passes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className={poppins.className}>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  )
}

