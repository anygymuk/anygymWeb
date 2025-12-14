'use client'

import Link from 'next/link'
import { Article } from '@/lib/types'

interface ArticleCardProps {
  article: Article
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return ''
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const displayText = article.headline || article.excerpt || ''
  const imageAlt = article.featured_image_alt || article.title

  // Normalize slug - ensure it starts with /explore/
  const getArticleUrl = (slug?: string) => {
    if (!slug) {
      console.warn('[ArticleCard] No slug provided for article:', article.id, article.title)
      return '/explore' // Fallback to explore page
    }
    
    // Handle different slug formats:
    // - "article-gymshark-promo" -> "/explore/article-gymshark-promo"
    // - "/articles/ultimate-arm-workout" -> "/explore/ultimate-arm-workout"
    // - "articles/ultimate-arm-workout" -> "/explore/ultimate-arm-workout"
    // - "/explore/anygym-gymshark-promo" -> "/explore/anygym-gymshark-promo"
    let normalizedSlug = slug.trim()
    
    // Remove leading slash if present
    if (normalizedSlug.startsWith('/')) {
      normalizedSlug = normalizedSlug.slice(1)
    }
    
    // Remove 'articles/' or 'explore/' prefix if present
    if (normalizedSlug.startsWith('articles/')) {
      normalizedSlug = normalizedSlug.replace('articles/', '')
    }
    if (normalizedSlug.startsWith('explore/')) {
      normalizedSlug = normalizedSlug.replace('explore/', '')
    }
    
    // Build URL with /explore/ prefix
    const url = `/explore/${normalizedSlug}`
    console.log('[ArticleCard] Article:', article.title)
    console.log('[ArticleCard] Original slug:', slug)
    console.log('[ArticleCard] Generated URL:', url)
    
    return url
  }

  return (
    <Link 
      href={getArticleUrl(article.slug)}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
    >
      {article.featured_image && (
        <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <img
            src={article.featured_image}
            alt={imageAlt}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide image on error
              e.currentTarget.style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
          {article.title}
        </h3>
        {displayText && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
            {displayText}
          </p>
        )}
        {article.published_date && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(article.published_date)}
          </div>
        )}
      </div>
    </Link>
  )
}
