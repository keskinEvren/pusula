import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitize-html'

describe('sanitize-html', () => {
  describe('sanitizeHtml', () => {
    it('<script> etiketlerini temizler', () => {
      const html = '<div>hello <script>alert(1)</script>world</div>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('<script>')
      expect(sanitized).not.toContain('alert(1)')
    })
    
    it('satıriçi olay işleyicilerini (onerror, onclick, onload) temizler', () => {
      const html = '<img src="x" onerror="alert(1)" onclick="alert(2)" onload="alert(3)">'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('onerror')
      expect(sanitized).not.toContain('onclick')
      expect(sanitized).not.toContain('onload')
    })

    it('javascript: URI değerlerini temizler', () => {
      const html = '<a href="javascript:alert(1)">tıkla</a>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('javascript:')
    })

    it('data: URI değerlerini temizler', () => {
      const html = '<img src="data:image/png;base64,123">'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('data:')
    })

    it('<iframe> ve <object> etiketlerini temizler', () => {
      const html = 'test<iframe src="evil"></iframe><object data="evil"></object>son'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('iframe')
      expect(sanitized).not.toContain('object')
    })

    it('güvenli etiketleri korur (h1, p, strong, em, a, ul, li)', () => {
      const html = '<h1>başlık</h1><p>paragraf <strong>kalın</strong> <em>eğik</em> <a href="https://example.com">link</a> <ul><li>liste</li></ul></p>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).toContain('<h1>')
      expect(sanitized).toContain('<strong>')
      expect(sanitized).toContain('<em>')
      expect(sanitized).toContain('href="https://example.com"')
    })

    it('SVG tabanlı XSS saldırılarını temizler (<svg onload=...>)', () => {
      const html = '<svg onload="alert(1)">'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('onload')
      expect(sanitized).not.toContain('<svg')
    })

    it('içe içe geçmiş etiket kaçınmasını engeller (<scr<script>ipt>)', () => {
      const html = '<scr<script>ipt>alert(1)</script>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('script')
      expect(sanitized).not.toContain('alert(1)')
    })

    it('HTML varlık kodlanmış şemaları temizler (jav&#x09;ascript:)', () => {
      const html = '<a href="jav&#x09;ascript:alert(1)">tikla</a>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).not.toContain('alert(1)')
    })

    it('boş string verildiğinde boş string döner', () => {
      expect(sanitizeHtml('')).toBe('')
      expect(sanitizeHtml(null as any)).toBe('')
    })

    it('checkbox inputlarını korur ancak disabled yapar', () => {
      const html = '<input type="checkbox" checked>'
      const sanitized = sanitizeHtml(html)
      expect(sanitized).toContain('type="checkbox"')
      expect(sanitized).toContain('disabled="true"')
    })
  })
})
