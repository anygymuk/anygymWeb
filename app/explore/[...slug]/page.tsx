import { getSession } from '@auth0/nextjs-auth0'
import { redirect, notFound } from 'next/navigation'
import { Subscription } from '@/lib/types'
import DashboardLayout from '@/components/DashboardLayout'
import { getOrCreateAppUser } from '@/lib/user'
import ArticleContent from '@/components/ArticleContent'

// Mark page as dynamic - uses cookies for authentication
export const dynamic = 'force-dynamic'

interface UserData {
  name: string
  subscription: Subscription | null
}

async function getUserData(auth0Id: string, fallbackEmail?: string, fallbackName?: string): Promise<UserData> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const response = await fetch('https://api.any-gym.com/user', {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 60 } // Cache for 1 minute
    })
    
    if (response.ok) {
      const userData = await response.json()
      
      // Extract name
      const userName = userData.full_name || userData.name || fallbackName || fallbackEmail || 'User'
      
      // Extract membership from user response
      let subscription: Subscription | null = null
      if (userData.membership) {
        const membershipData = userData.membership
        
        // Parse next_billing_date
        let nextBillingDate: Date
        if (membershipData.next_billing_date) {
          const billingDateStr = membershipData.next_billing_date
          if (/^\d{4}-\d{2}-\d{2}$/.test(billingDateStr)) {
            nextBillingDate = new Date(billingDateStr + 'T23:59:59.999Z')
          } else {
            nextBillingDate = new Date(billingDateStr)
          }
        } else {
          nextBillingDate = membershipData.current_period_end 
            ? new Date(membershipData.current_period_end)
            : new Date()
        }
        
        // Map membership to Subscription type
        const tierValue = membershipData.tier
        const tier = (tierValue && typeof tierValue === 'string' && tierValue.trim()) ? tierValue : 'standard'
        
        subscription = {
          id: membershipData.id || 0,
          userId: membershipData.user_id || auth0Id,
          tier: tier,
          monthlyLimit: membershipData.monthly_limit != null ? Number(membershipData.monthly_limit) : 0,
          visitsUsed: membershipData.visits_used != null ? Number(membershipData.visits_used) : 0,
          price: membershipData.price != null ? parseFloat(membershipData.price) : 0,
          startDate: membershipData.start_date 
            ? new Date(membershipData.start_date)
            : (membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date()),
          nextBillingDate: nextBillingDate,
          currentPeriodStart: membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date(),
          currentPeriodEnd: membershipData.current_period_end ? new Date(membershipData.current_period_end) : new Date(),
          status: membershipData.status || 'active',
          stripeSubscriptionId: membershipData.stripe_subscription_id || undefined,
          stripeCustomerId: membershipData.stripe_customer_id || undefined,
          guestPassesLimit: membershipData.guest_passes_limit != null ? Number(membershipData.guest_passes_limit) : 0,
          guestPassesUsed: membershipData.guest_passes_used != null ? Number(membershipData.guest_passes_used) : 0,
          createdAt: membershipData.created_at 
            ? new Date(membershipData.created_at)
            : (membershipData.current_period_start ? new Date(membershipData.current_period_start) : new Date()),
          updatedAt: membershipData.updated_at 
            ? new Date(membershipData.updated_at)
            : (membershipData.current_period_end ? new Date(membershipData.current_period_end) : new Date()),
        } as Subscription
      }
      
      return { name: userName, subscription }
    }
  } catch (error) {
    console.error('[getUserData] Error fetching user data:', error)
  }
  
  // Fallback to Auth0 session data if API fails
  return {
    name: fallbackName || fallbackEmail || 'User',
    subscription: null,
  }
}

interface ArticleDetail {
  id: string
  entryTitle?: string
  title: string
  slug: string
  category?: string
  headline?: any
  heroImage?: {
    fields?: {
      image?: Array<{
        secure_url?: string
        url?: string
      }>
      altText?: string
    }
  }
  body?: any
}

async function getArticleByIdOrSlug(identifier: string, auth0Id: string, isId: boolean = false): Promise<ArticleDetail | null> {
  try {
    const trimmedAuth0Id = auth0Id.trim()
    const apiUrl = `https://api.any-gym.com/content/articles/${identifier}`
    console.log('[getArticle] Fetching article from:', apiUrl)
    console.log('[getArticle] Using identifier:', identifier, isId ? '(as ID)' : '(as slug)')
    console.log('[getArticle] Auth0 ID:', trimmedAuth0Id)
    
    const response = await fetch(apiUrl, {
      headers: {
        'auth0_id': trimmedAuth0Id,
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    console.log('[getArticle] Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      console.error('[getArticle] API Error:', response.status, errorText)
      
      if (response.status === 404) {
        console.log('[getArticle] Article not found (404)')
        return null
      }
      throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('[getArticle] Article fetched successfully')
    return data as ArticleDetail
  } catch (error: any) {
    console.error('[getArticle] Error fetching article:', error)
    console.error('[getArticle] Error message:', error?.message)
    console.error('[getArticle] Error stack:', error?.stack)
    return null
  }
}

async function getArticle(slug: string, auth0Id: string): Promise<ArticleDetail | null> {
  // Normalize slug - remove leading /explore/, /articles/, or / if present
  let normalizedSlug = slug.trim()
  
  if (normalizedSlug.startsWith('/explore/')) {
    normalizedSlug = normalizedSlug.replace('/explore/', '')
  } else if (normalizedSlug.startsWith('/articles/')) {
    normalizedSlug = normalizedSlug.replace('/articles/', '')
  } else if (normalizedSlug.startsWith('/')) {
    normalizedSlug = normalizedSlug.slice(1)
  }
  
  // Remove explore/ or articles/ prefix if still present
  if (normalizedSlug.startsWith('explore/')) {
    normalizedSlug = normalizedSlug.replace('explore/', '')
  }
  if (normalizedSlug.startsWith('articles/')) {
    normalizedSlug = normalizedSlug.replace('articles/', '')
  }
  
  // First try using the slug
  console.log('[getArticle] Attempting to fetch article by slug:', normalizedSlug)
  let article = await getArticleByIdOrSlug(normalizedSlug, auth0Id, false)
  
  // If that fails, try to get the article ID from the articles list
  if (!article) {
    console.log('[getArticle] Slug lookup failed, trying to find article ID from articles list...')
    try {
      const trimmedAuth0Id = auth0Id.trim()
      const articlesResponse = await fetch('https://api.any-gym.com/content/articles', {
        headers: {
          'auth0_id': trimmedAuth0Id,
        },
        next: { revalidate: 3600 }
      })
      
      if (articlesResponse.ok) {
        const articlesData = await articlesResponse.json()
        const articles = articlesData.results || []
        const matchingArticle = articles.find((a: any) => {
          const articleSlug = a.slug?.trim() || ''
          // Try various slug formats
          return articleSlug === normalizedSlug || 
                 articleSlug === `/${normalizedSlug}` ||
                 articleSlug === `/articles/${normalizedSlug}` ||
                 articleSlug === `/explore/${normalizedSlug}` ||
                 articleSlug.endsWith(`/${normalizedSlug}`) ||
                 articleSlug.endsWith(normalizedSlug)
        })
        
        if (matchingArticle?.id) {
          console.log('[getArticle] Found article ID:', matchingArticle.id, 'for slug:', normalizedSlug)
          article = await getArticleByIdOrSlug(matchingArticle.id, auth0Id, true)
        } else {
          console.log('[getArticle] No matching article found in list for slug:', normalizedSlug)
        }
      }
    } catch (error) {
      console.error('[getArticle] Error fetching articles list:', error)
    }
  }
  
  return article
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string[] }
}) {
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
      console.error('[Article] Failed to get or create user')
      throw new Error('Failed to create user account')
    }
    
    if (needsOnboarding) {
      redirect('/onboarding')
    }
    
    // Combine slug parts
    const slug = params.slug ? params.slug.join('/') : ''
    
    if (!slug) {
      notFound()
    }
    
    // Fetch data in parallel
    const [userData, article] = await Promise.allSettled([
      getUserData(auth0Id, session.user.email, session.user.name),
      getArticle(slug, auth0Id),
    ])

    const userDataResult = userData.status === 'fulfilled' ? userData.value : { name: session.user.name || session.user.email || 'User', subscription: null }
    const subscriptionResult = userDataResult.subscription
    const articleResult = article.status === 'fulfilled' ? article.value : null
    const userNameResult = userDataResult.name

    if (userData.status === 'rejected') {
      console.error('[ArticlePage] Error fetching user data:', userData.reason)
    }
    if (article.status === 'rejected') {
      console.error('[ArticlePage] Error fetching article:', article.reason)
      console.error('[ArticlePage] Article rejection details:', JSON.stringify(article.reason, null, 2))
    }

    if (!articleResult) {
      console.error('[ArticlePage] Article result is null - article not found')
      console.error('[ArticlePage] Slug used:', slug)
      notFound()
    }
    
    console.log('[ArticlePage] Article loaded successfully:', articleResult.id, articleResult.title)

    // Get user initials for avatar
    const userNameDisplay = userNameResult
    const initials = userNameDisplay
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    // Extract hero image URL
    const heroImageUrl = articleResult.heroImage?.fields?.image?.[0]?.secure_url || 
                        articleResult.heroImage?.fields?.image?.[0]?.url || 
                        null
    const heroImageAlt = articleResult.heroImage?.fields?.altText || articleResult.title

    return (
      <DashboardLayout
        userName={userNameDisplay}
        userInitials={initials}
        subscription={subscriptionResult}
      >
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-auto">
          <article className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
            {articleResult.category && (
              <div className="mb-4">
                <span className="inline-block px-3 py-1 text-sm font-semibold text-[#FF6B6B] bg-[#FF6B6B]/10 rounded-full">
                  {articleResult.category}
                </span>
              </div>
            )}
            
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              {articleResult.title}
            </h1>

            {articleResult.headline && (
              <div className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                <ArticleContent content={articleResult.headline} />
              </div>
            )}

            {heroImageUrl && (
              <div className="mb-8 rounded-lg overflow-hidden">
                <img
                  src={heroImageUrl}
                  alt={heroImageAlt}
                  className="w-full h-auto object-cover"
                />
              </div>
            )}

            {articleResult.body && (
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <ArticleContent content={articleResult.body} />
              </div>
            )}
          </article>
        </div>
      </DashboardLayout>
    )
  } catch (error: any) {
    // Don't catch NEXT_REDIRECT errors - they need to propagate for Next.js redirects
    if (error?.message === 'NEXT_REDIRECT' || error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    
    console.error('Error loading article page:', error)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Error Loading Article
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }
}
