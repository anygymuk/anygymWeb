import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getOrCreateAppUser } from '@/lib/user'
import {
  fetchUserDataWithSubscription,
  FREE_TIER_COOKIE,
} from '@/lib/membership'

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

  const { needsOnboarding } = await getOrCreateAppUser(
    session.user.sub,
    session.user.email,
    session.user.name
  )

  if (!needsOnboarding) {
    const freeTierHint =
      cookies().get(FREE_TIER_COOKIE)?.value === 'free'
    const { subscription } = await fetchUserDataWithSubscription(
      session.user.sub,
      session.user.email,
      session.user.name,
      { freeTierHint }
    )

    if (subscription) {
      redirect('/dashboard')
    }
  }

  return <>{children}</>
}
