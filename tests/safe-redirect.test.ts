import { describe, expect, it } from 'vitest'
import { getSafeRedirectPath } from '../src/lib/safe-redirect'

describe('getSafeRedirectPath', () => {
  it('aynı origin içindeki yolları kabul eder', () => {
    expect(getSafeRedirectPath('/transactions?month=2026-09')).toBe('/transactions?month=2026-09')
  })

  it('harici veya belirsiz yönlendirmeleri reddeder', () => {
    expect(getSafeRedirectPath('@evil.example')).toBe('/')
    expect(getSafeRedirectPath('//evil.example')).toBe('/')
    expect(getSafeRedirectPath('/\\evil.example')).toBe('/')
    expect(getSafeRedirectPath('https://evil.example')).toBe('/')
  })
})
