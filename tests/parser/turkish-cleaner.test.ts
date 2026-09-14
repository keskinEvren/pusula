import { describe, it, expect, vi } from 'vitest'
import { repairTurkishPdfText } from '@/lib/parser/turkish-cleaner'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Turkish Cleaner Tests', () => {
  describe('repairTurkishPdfText', () => {
    it('Broken SOK text -> ŞOK', () => {
      const result = repairTurkishPdfText('OK 12037')
      expect(result).toBe('ŞOK 12037 ŞİŞLİ ALİBEY')
      const generalResult = repairTurkishPdfText('OK 54321')
      expect(generalResult).toBe('ŞOK 54321')
    })

    it('Broken BIM text -> BİM', () => {
      const result = repairTurkishPdfText('B M V123')
      expect(result).toBe('BİM V123')
    })

    it('Broken Azimoglu -> Azimoğlu', () => {
      const result = repairTurkishPdfText('AZ MO LU K FTE')
      expect(result).toBe('AZİMOĞLU ÇİĞKÖFTE')
    })

    it('Clean text unchanged', () => {
      const result = repairTurkishPdfText('Migros Market')
      expect(result).toBe('Migros Market')
    })

    it('Empty string -> empty string', () => {
      const result = repairTurkishPdfText('')
      expect(result).toBe('')
    })
  })
})
