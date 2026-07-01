import { getSession } from '@auth0/nextjs-auth0'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Article } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import ArticleCard from '@/components/ArticleCard'
import { getOrCreateAppUser } from '@/lib/user'
import { fetchUserDataWithSubscription, FREE_TIER_COOKIE } from '@/lib/membership'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

async function getArticles(auth0Id: string): Promise<Article[]> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const response = await fetch('https://api.any-gym.com/content/articles', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch articles: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // API returns { results: [...], pagination: {...} }
    const articles = data.results || []
    
    // Map API response to Article type
    return articles.map((article: any) => ({
      id: article.id,
      title: article.title || 'Untitled',
      headline: article.headline,
      excerpt: article.excerpt,
      slug: article.slug,
      published_date: article.published_date,
      featured_image: article.featured_image,
      featured_image_alt: article.featured_image_alt,
    })) as Article[]
  } catch (error) {
    console.error('Error fetching articles:', error)
    return []
  }
}

export default async function ExplorePage() {
  try {
    const session = await getSession()

    if (!session?.user) {
      redirect('/api/auth/login')
    }

    const auth0Id = session.user.sub
    
    // Check onboarding status - redirect if not completed
    const { needsOnboarding, user } = await getOrCreateAppUser(
      auth0Id,
      session.user.email,
      session.user.name
    )
    
    if (!user) {
      console.error('[Explore] Failed to get or create user')
      throw new Error('Failed to create user account')
    }
    
    if (needsOnboarding) {
      redirect('/onboarding')
    }
    
    // Fetch data in parallel with error handling
    const freeTierHint =
      cookies().get(FREE_TIER_COOKIE)?.value === 'free'
    const [userData, articles] = await Promise.allSettled([
      fetchUserDataWithSubscription(
        auth0Id,
        session.user.email,
        session.user.name,
        { freeTierHint }
      ),
      getArticles(auth0Id),
    ])

    const userDataResult = userData.status === 'fulfilled' ? userData.value : { name: session.user.name || session.user.email || 'User', subscription: null }
    const subscriptionResult = userDataResult.subscription
    const articlesResult = articles.status === 'fulfilled' ? articles.value : []
    const userNameResult = userDataResult.name

    if (userData.status === 'rejected') {
      console.error('Error fetching user data:', userData.reason)
    }
    if (articles.status === 'rejected') {
      console.error('Error fetching articles:', articles.reason)
    }

    // Get user initials for avatar
    const userNameDisplay = userNameResult
    const initials = userNameDisplay
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    return (
      <DashboardLayout
        userName={userNameDisplay}
        userInitials={initials}
        subscription={subscriptionResult}
      >
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-auto">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Explore Articles
            </h1>
          </div>
          <div className="flex-1 p-4 sm:p-6 overflow-auto">
            {articlesResult.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {articlesResult.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-lg">
                    No articles available at the moment.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    )
  } catch (error: any) {
    // Don't catch NEXT_REDIRECT errors - they need to propagate for Next.js redirects
    if (error?.message === 'NEXT_REDIRECT' || error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    
    console.error('Error loading explore page:', error)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Error Loading Explore Page
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }
}
