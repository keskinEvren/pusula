import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  formatLocalDateInput,
  formatLocalMonthInput,
  formatCurrency,
  formatDate,
  formatMonthYear,
  slugify,
  isUUID
} from '@/lib/utils'

describe('Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0)) // 15 Sept 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('cn', () => {
    it('boş argümanlarda boş string döndürür', () => {
      expect(cn()).toBe('')
    })

    it('çakışan Tailwind sınıflarını düzgün birleştirir (p-2 p-4 -> p-4)', () => {
      expect(cn('p-2', 'p-4')).toBe('p-4')
    })

    it('falsy değerleri (null, undefined, false) yoksayar', () => {
      expect(cn('p-2', null, undefined, false, 'text-red-500')).toBe('p-2 text-red-500')
    })
  })

  describe('formatLocalDateInput', () => {
    it('argüman verilmediğinde bugünün tarihini YYYY-MM-DD formatında döndürür', () => {
      expect(formatLocalDateInput()).toBe('2026-09-15')
    })

    it('verilen tarihi YYYY-MM-DD formatında döndürür (2026-01-01)', () => {
      expect(formatLocalDateInput(new Date(2026, 0, 1))).toBe('2026-01-01')
    })
  })

  describe('formatLocalMonthInput', () => {
    it('argüman verilmediğinde bugünün ayını YYYY-MM formatında döndürür', () => {
      expect(formatLocalMonthInput()).toBe('2026-09')
    })
  })

  describe('formatCurrency', () => {
    it('sayıyı TL para birimi formatına dönüştürür (1234.56)', () => {
      // Boşluk karakteri (non-breaking space) içerebilir, replace ile temizliyoruz
      const formatted = formatCurrency(1234.56).replace(/\s/g, '')
      expect(formatted).toContain('1.234,56')
      expect(formatted).toContain('₺')
    })

    it('sıfır değerini doğru formatlar', () => {
      const formatted = formatCurrency(0).replace(/\s/g, '')
      expect(formatted).toContain('0,00')
      expect(formatted).toContain('₺')
    })

    it('negatif değerleri doğru formatlar', () => {
      const formatted = formatCurrency(-500).replace(/\s/g, '')
      expect(formatted).toContain('-')
      expect(formatted).toContain('500,00')
      expect(formatted).toContain('₺')
    })

    it('null, NaN veya undefined verildiğinde varsayılan ₺0,00 döndürür', () => {
      expect(formatCurrency(null).replace(/\s/g, '')).toBe('₺0,00')
      expect(formatCurrency(NaN).replace(/\s/g, '')).toBe('₺0,00')
      expect(formatCurrency(undefined).replace(/\s/g, '')).toBe('₺0,00')
    })
  })

  describe('formatDate', () => {
    it('tarih stringini Türkçe tarih formatına dönüştürür', () => {
      // 15 Oca 2026 veya benzeri
      expect(formatDate('2026-01-15')).toMatch(/15 Oca 2026/i)
    })

    it('undefined verildiğinde varsayılan olarak "-" döndürür', () => {
      expect(formatDate(undefined)).toBe('-')
    })
  })

  describe('formatMonthYear', () => {
    it('YYYY-MM formatındaki stringi Türkçe Ay Yıl formatına dönüştürür', () => {
      expect(formatMonthYear('2026-03')).toBe('Mart 2026')
    })

    it('geçersiz veya hatalı string verildiğinde hata fırlatmaz, orjinal değeri döndürür', () => {
      expect(formatMonthYear('invalid')).toBe('invalid')
    })
  })

  describe('slugify', () => {
    it('Türkçe ve özel karakterleri temizleyip slug formatına dönüştürür', () => {
      expect(slugify('Türkçe Özel Karakter Testi')).toBe('turkce-ozel-karakter-testi')
    })

    it('boş string verildiğinde boş string döndürür', () => {
      expect(slugify('')).toBe('')
    })

    it('baştaki, sondaki ve tekrarlayan tireleri temizler (---test---)', () => {
      expect(slugify('---test---')).toBe('test')
    })
  })

  describe('isUUID', () => {
    it('geçerli bir UUID için true döndürür', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      expect(isUUID(validUUID)).toBe(true)
    })

    it('geçersiz formatlı bir string için false döndürür (sample-dream-1)', () => {
      expect(isUUID('sample-dream-1')).toBe(false)
    })

    it('geçersiz formatlı başka bir string için false döndürür (demo-routine-x)', () => {
      expect(isUUID('demo-routine-x')).toBe(false)
    })

    it('boş string için false döndürür', () => {
      expect(isUUID('')).toBe(false)
    })

    it('undefined için false döndürür', () => {
      expect(isUUID(undefined as any)).toBe(false)
    })
  })
})
