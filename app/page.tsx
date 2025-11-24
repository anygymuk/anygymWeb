import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getSession()

  if (session?.user) {
    redirect('/dashboard')
  }

  // Redirect to Auth0 login if not authenticated
  redirect('/api/auth/login')
}

