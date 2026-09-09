import { describe, it, expect } from 'vitest'
import { slugify, formatCurrency, formatDate, formatMonthYear } from '../src/lib/utils'

describe('Utils & Slugify', () => {
  describe('slugify', () => {
    it('boş değerlerde boş string döner', () => {
      expect(slugify('')).toBe('')
      expect(slugify('   ')).toBe('')
    })

    it('Türkçe karakterleri güvenli ASCII eşdeğerlerine dönüştürür', () => {
      expect(slugify('İşletme & Kadro Takip')).toBe('isletme-kadro-takip')
      expect(slugify('Örnek Proje Başlığı Çiftliği')).toBe('ornek-proje-basligi-ciftligi')
      expect(slugify('Şarj İstasyonu Güzergahı')).toBe('sarj-istasyonu-guzergahi')
    })

    it('özel karakterleri temizler ve fazla tireleri birleştirir', () => {
      expect(slugify('Proje v2.0 - Beta (2026)!')).toBe('proje-v20-beta-2026')
      expect(slugify('---Çok---Tireli---Metin---')).toBe('cok-tireli-metin')
    })
  })

  describe('formatCurrency', () => {
    it('geçersiz veya boş değerlerde ₺0,00 döner', () => {
      expect(formatCurrency(null)).toBe('₺0,00')
      expect(formatCurrency(undefined)).toBe('₺0,00')
      expect(formatCurrency(NaN)).toBe('₺0,00')
    })
  })

  describe('formatMonthYear', () => {
    it('YYYY-MM formatını Türkçe ay ve yıla çevirir', () => {
      expect(formatMonthYear('2026-09')).toBe('Eylül 2026')
      expect(formatMonthYear('2026-01')).toBe('Ocak 2026')
    })
  })
})
