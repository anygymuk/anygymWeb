import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { getOrCreateAppUser } from '@/lib/user'

export const dynamic = 'force-dynamic'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const { needsOnboarding, user } = await getOrCreateAppUser(
    session.user.sub,
    session.user.email,
    session.user.name
  )

  if (!user) {
    throw new Error('Failed to load user account')
  }

  if (!needsOnboarding) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
