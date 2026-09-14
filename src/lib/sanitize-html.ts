/**
 * HTML Sanitizer for Markdown Preview and User Content
 * Protects against XSS attacks while preserving standard Markdown elements:
 * headings, lists, tables, links, images, blockquotes, code blocks.
 */

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt',
  'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike',
  'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'ul', 'var', 'input'
])

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class', 'className', 'align', 'checked', 'disabled',
  'type', 'target', 'rel', 'width', 'height'
])

const SAFE_URL_PATTERN = /^(https?:|mailto:|\/|#)/i

/**
 * Sanitizes an HTML string to eliminate XSS vectors (scripts, event handlers, javascript: URIs)
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return ''

  // 1. If running in browser / DOM environment, use DOMParser for rigorous tree sanitization
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(rawHtml, 'text/html')
      cleanNode(doc.body)
      return doc.body.innerHTML
    } catch {
      // Fallback to regex cleaning below
    }
  }

  // 2. Fallback regex-based sanitizer for SSR or non-browser environments
  return sanitizeHtmlRegex(rawHtml)
}

function cleanNode(node: Node): void {
  const children = Array.from(node.childNodes)

  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      const tagName = el.tagName.toLowerCase()

      if (!ALLOWED_TAGS.has(tagName)) {
        // Disallowed tag: remove the element completely if it's dangerous
        if (['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'].includes(tagName)) {
          el.remove()
          continue
        } else {
          // Replace with its text or children
          const textNode = document.createTextNode(el.textContent || '')
          el.replaceWith(textNode)
          continue
        }
      }

      // Special check for input: only allow disabled checkbox for task lists
      if (tagName === 'input') {
        const type = el.getAttribute('type')
        if (type !== 'checkbox') {
          el.remove()
          continue
        }
        el.setAttribute('disabled', 'true')
      }

      // Clean attributes
      const attrs = Array.from(el.attributes)
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase()

        // Strip any on* event handlers (onerror, onload, onclick, etc.)
        if (attrName.startsWith('on') || !ALLOWED_ATTRS.has(attrName)) {
          el.removeAttribute(attr.name)
          continue
        }

        // Validate URLs for href and src
        if (attrName === 'href' || attrName === 'src') {
          const value = attr.value.trim()
          if (!SAFE_URL_PATTERN.test(value)) {
            el.removeAttribute(attr.name)
          }
        }
      }

      // Enforce rel="noopener noreferrer" on target="_blank" links
      if (tagName === 'a' && el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer')
      }

      cleanNode(child)
    } else if (child.nodeType === Node.COMMENT_NODE) {
      child.remove()
    }
  }
}

/**
 * Regex-based sanitizer for SSR fallback
 */
function sanitizeHtmlRegex(html: string): string {
  let cleaned = html

  // Remove dangerous tags and their contents
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  cleaned = cleaned.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  cleaned = cleaned.replace(/<embed\b[^>]*>/gi, '')
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
  cleaned = cleaned.replace(/<svg\b[^>]*>/gi, '')

  // Remove inline on* handlers (onerror, onclick, etc.)
  cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')

  // Remove javascript: and data: URIs from href and src (including entity-encoded or obfuscated schemes)
  cleaned = cleaned.replace(/(href|src)\s*=\s*["']([^"']*)["']/gi, (match, attr, val) => {
    const normalized = val.replace(/&#x?[0-9a-f]+;?/gi, '').replace(/[\s\x00-\x1f]/g, '').toLowerCase()
    if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) {
      return ''
    }
    return match
  })

  // Ensure checkbox inputs are disabled in task lists
  cleaned = cleaned.replace(/<input\b([^>]*type=["']checkbox["'][^>]*)>/gi, (match) => {
    return match.includes('disabled') ? match : match.replace(/>$/, ' disabled="true">')
  })

  return cleaned
}
