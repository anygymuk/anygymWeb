'use client'

interface ContentNode {
  nodeType: string
  content?: ContentNode[]
  value?: string
  marks?: Array<{ type: string }>
  data?: any
}

interface ArticleContentProps {
  content: {
    nodeType: string
    content?: ContentNode[]
    data?: any
  }
}

export default function ArticleContent({ content }: ArticleContentProps) {
  const renderNode = (node: ContentNode, index: number): React.ReactNode => {
    if (!node) return null

    switch (node.nodeType) {
      case 'text':
        let text = node.value || ''
        let element: React.ReactNode = text
        
        // Apply marks (bold, italic, etc.) by wrapping in appropriate elements
        if (node.marks && node.marks.length > 0) {
          // Apply marks in reverse order (outermost first)
          const marks = [...node.marks].reverse()
          marks.forEach((mark) => {
            if (mark.type === 'bold') {
              element = <strong key={`bold-${index}`}>{element}</strong>
            } else if (mark.type === 'italic') {
              element = <em key={`italic-${index}`}>{element}</em>
            } else if (mark.type === 'underline') {
              element = <u key={`underline-${index}`}>{element}</u>
            }
          })
        }
        return <span key={index}>{element}</span>

      case 'paragraph':
        return (
          <p key={index} className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </p>
        )

      case 'heading-1':
        return (
          <h1 key={index} className="text-4xl font-bold text-gray-900 dark:text-white mb-4 mt-8">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h1>
        )

      case 'heading-2':
        return (
          <h2 key={index} className="text-3xl font-bold text-gray-900 dark:text-white mb-3 mt-6">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h2>
        )

      case 'heading-3':
        return (
          <h3 key={index} className="text-2xl font-semibold text-gray-900 dark:text-white mb-2 mt-4">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h3>
        )

      case 'heading-4':
        return (
          <h4 key={index} className="text-xl font-semibold text-gray-900 dark:text-white mb-2 mt-4">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h4>
        )

      case 'heading-5':
        return (
          <h5 key={index} className="text-lg font-semibold text-gray-900 dark:text-white mb-2 mt-4">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h5>
        )

      case 'heading-6':
        return (
          <h6 key={index} className="text-base font-semibold text-gray-900 dark:text-white mb-2 mt-4">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </h6>
        )

      case 'unordered-list':
        return (
          <ul key={index} className="list-disc list-inside mb-4 space-y-2 text-gray-700 dark:text-gray-300">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </ul>
        )

      case 'ordered-list':
        return (
          <ol key={index} className="list-decimal list-inside mb-4 space-y-2 text-gray-700 dark:text-gray-300">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </ol>
        )

      case 'list-item':
        return (
          <li key={index} className="mb-1">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </li>
        )

      case 'hyperlink':
        const href = node.data?.uri || '#'
        return (
          <a
            key={index}
            href={href}
            className="text-[#FF6B6B] hover:text-[#FF5252] underline"
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </a>
        )

      case 'blockquote':
        return (
          <blockquote key={index} className="border-l-4 border-[#FF6B6B] pl-4 italic my-4 text-gray-600 dark:text-gray-400">
            {node.content?.map((child, childIndex) => renderNode(child, childIndex))}
          </blockquote>
        )

      default:
        // For unknown node types, try to render content if available
        if (node.content) {
          return (
            <div key={index}>
              {node.content.map((child, childIndex) => renderNode(child, childIndex))}
            </div>
          )
        }
        return null
    }
  }

  if (!content || !content.content) {
    return null
  }

  return (
    <div>
      {content.content.map((node, index) => renderNode(node, index))}
    </div>
  )
}
