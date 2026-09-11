import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../src/lib/sanitize-html'

describe('HTML Sanitizer (XSS Prevention)', () => {
  it('strips <script> tags and their contents', () => {
    const malicious = '<p>Normal text</p><script>alert("hacked")</script>'
    const clean = sanitizeHtml(malicious)
    expect(clean).not.toContain('<script>')
    expect(clean).not.toContain('alert("hacked")')
    expect(clean).toContain('<p>Normal text</p>')
  })

  it('strips inline event handlers (onerror, onclick, etc.)', () => {
    const malicious = '<img src="valid.png" onerror="alert(1)" onload="evil()">'
    const clean = sanitizeHtml(malicious)
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('onload')
    expect(clean).toContain('src="valid.png"')
  })

  it('strips javascript: and data: URIs from links', () => {
    const malicious = '<a href="javascript:alert(1)">Click me</a>'
    const clean = sanitizeHtml(malicious)
    expect(clean).not.toContain('javascript:')
    expect(clean).toContain('Click me')
  })

  it('preserves legitimate safe markdown tags and attributes', () => {
    const safe = '<h1>Title</h1><p>Text with <strong>bold</strong> and <em>italic</em>.</p><a href="https://example.com" target="_blank">Link</a>'
    const clean = sanitizeHtml(safe)
    expect(clean).toContain('<h1>Title</h1>')
    expect(clean).toContain('<strong>bold</strong>')
    expect(clean).toContain('https://example.com')
  })

  it('strips <iframe> and <object> embeds', () => {
    const malicious = '<iframe src="https://evil.com"></iframe><object data="evil.swf"></object>'
    const clean = sanitizeHtml(malicious)
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<object')
  })
})
