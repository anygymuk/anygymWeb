import { redirect } from 'next/navigation'

export default async function GeneratePassPage({
  params,
}: {
  params: { id: string }
}) {
  // Redirect to dashboard - pass generation now happens from the map
  redirect('/dashboard')
}

