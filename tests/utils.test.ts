import { describe, it, expect } from 'vitest'
import {
  slugify,
  formatCurrency,
  formatDate,
  formatMonthYear,
  formatLocalDateInput,
  formatLocalMonthInput,
  isUUID,
} from '../src/lib/utils'

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

  describe('local date inputs', () => {
    it('UTC dönüşümü yapmadan yerel takvim gününü korur', () => {
      const localDate = new Date(2026, 8, 14, 0, 30)
      expect(formatLocalDateInput(localDate)).toBe('2026-09-14')
      expect(formatLocalMonthInput(localDate)).toBe('2026-09')
    })
  })

  describe('isUUID', () => {
    it('geçerli UUID formatlarını tanır', () => {
      expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isUUID('a1000000-0000-4000-8000-000000000001')).toBe(true)
      expect(isUUID('A1000000-0000-4000-8000-000000000001')).toBe(true)
    })

    it('sample-*, demo-* ve geçersiz stringleri reddeder', () => {
      expect(isUUID('sample-3')).toBe(false)
      expect(isUUID('sample-1')).toBe(false)
      expect(isUUID('dream-ironman')).toBe(false)
      expect(isUUID('local-12345')).toBe(false)
      expect(isUUID('')).toBe(false)
      expect(isUUID(null)).toBe(false)
      expect(isUUID(undefined)).toBe(false)
    })
  })
})

