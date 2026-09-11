'use client'

import React, { useMemo } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize-html'

interface MarkdownPreviewProps {
  content: string
  className?: string
  emptyMessage?: string
}

export function MarkdownPreview({
  content,
  className = '',
  emptyMessage = 'Önizlenecek Markdown içeriği yok.',
}: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content || !content.trim()) return ''
    try {
      const rawHtml = marked.parse(content, { gfm: true, breaks: true }) as string
      return sanitizeHtml(rawHtml)
    } catch (err) {
      console.error('Markdown parse error:', err)
      return '<p class="text-destructive text-xs">Markdown işlenirken bir hata oluştu.</p>'
    }
  }, [content])

  if (!html) {
    return (
      <div className={`flex items-center justify-center p-8 text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-lg ${className}`}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div
      className={`markdown-preview overflow-y-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
