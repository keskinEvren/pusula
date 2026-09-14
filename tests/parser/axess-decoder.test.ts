import { describe, it, expect, vi } from 'vitest'
import { decodeAxess, isAxessPage, exactAxessMap } from '@/lib/parser/axess-decoder'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Axess Decoder Tests', () => {
  describe('decodeAxess', () => {
    it('decodeAxess known glyph byte codes -> standard chars', () => {
      // 0xf0 -> 0, 0x81 -> a
      const raw = String.fromCharCode(0xf0, 0x81, 0x40)
      const result = decodeAxess(raw)
      expect(result).toBe('0a ')
    })

    it('decodeAxess unmapped characters unchanged', () => {
      const result = decodeAxess('B P R')
      expect(result).toBe('B P R')
    })
  })

  describe('isAxessPage', () => {
    it('isAxessPage Axess Type3 items -> true', () => {
      const items = [{ str: 'Á§…', transform: [] }]
      const result = isAxessPage(items)
      expect(result).toBe(true)
    })

    it('isAxessPage normal PDF items -> false', () => {
      const items = [{ str: 'Normal Market', transform: [] }]
      const result = isAxessPage(items)
      expect(result).toBe(false)
    })
  })

  describe('exactAxessMap', () => {
    it('exactAxessMap has >= 50 mappings', () => {
      const keysCount = Object.keys(exactAxessMap).length
      expect(keysCount).toBeGreaterThanOrEqual(50)
    })
  })
})
