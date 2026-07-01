import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { getPostAuthRedirectPath } from '@/lib/user'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getSession()

  if (!session?.user) {
    redirect('/api/auth/login')
  }

  const redirectPath = await getPostAuthRedirectPath(
    session.user.sub,
    session.user.email,
    session.user.name
  )

  redirect(redirectPath)
}
