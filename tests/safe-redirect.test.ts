import { describe, it, expect } from 'vitest'
import { getSafeRedirectPath } from '@/lib/safe-redirect'

describe('safe-redirect', () => {
  describe('getSafeRedirectPath', () => {
    it('kabul edilen yollar - /dashboard', () => {
      expect(getSafeRedirectPath('/dashboard')).toBe('/dashboard')
    })
    it('kabul edilen yollar - query string ile', () => {
      expect(getSafeRedirectPath('/transactions?month=2026-01')).toBe('/transactions?month=2026-01')
    })
    it('reddedilen yollar - protocol relative //evil.example', () => {
      expect(getSafeRedirectPath('//evil.example')).toBe('/')
    })
    it('reddedilen yollar - absolute URL https://evil.example', () => {
      expect(getSafeRedirectPath('https://evil.example')).toBe('/')
    })
    it('reddedilen yollar - backslash \\evil.example', () => {
      expect(getSafeRedirectPath('/\\evil.example')).toBe('/')
    })
    it('reddedilen yollar - javascript: URI', () => {
      expect(getSafeRedirectPath('javascript:alert(1)')).toBe('/')
    })
    it('boş string - fallback /', () => {
      expect(getSafeRedirectPath('')).toBe('/')
    })
    it('null/undefined - fallback /', () => {
      expect(getSafeRedirectPath(null as any)).toBe('/')
      expect(getSafeRedirectPath(undefined as any)).toBe('/')
    })
    it('reddedilen yollar - URL-encoded bypass %2f%2fevil.example', () => {
      expect(getSafeRedirectPath('%2f%2fevil.example')).toBe('/')
    })
    it('reddedilen yollar - @ ile başlayan bypass @evil.example', () => {
      expect(getSafeRedirectPath('@evil.example')).toBe('/')
    })
  })
})
