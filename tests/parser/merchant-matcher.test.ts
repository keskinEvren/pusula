import { describe, it, expect, vi } from 'vitest'
import { matchMerchant } from '@/lib/parser/merchant-matcher'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Merchant Matcher Tests', () => {
  describe('matchMerchant', () => {
    it('Supermarkets (SOK, BIM, A101, Migros) -> Kisisel', () => {
      const result = matchMerchant('ŞOK MARKET')
      expect(result.analysis_group).toBe('Kişisel')
      expect(result.merchant).toBe('ŞOK')
    })

    it('SaaS tools (Cursor, Supabase, AWS, Vercel) -> Is', () => {
      const result = matchMerchant('GITHUB INC')
      expect(result.analysis_group).toBe('İş')
      expect(result.merchant).toBe('GitHub')
    })

    it('Design/ecommerce (Canva, Yengec.co) -> Is', () => {
      const result = matchMerchant('CANVA PTY LTD')
      expect(result.analysis_group).toBe('İş')
      expect(result.merchant).toBe('Canva')
    })

    it('Bank fees (gecikme faizi, BSMV, KKDF) -> Finansman', () => {
      const result = matchMerchant('GECİKME FAİZİ')
      expect(result.analysis_group).toBe('Finansman')
      expect(result.merchant).toBe('Banka Faiz / Masraf')
    })

    it('Debt payments (Odeme - Enpara) -> Haric', () => {
      const result = matchMerchant('ÖDEME - ENPARA')
      expect(result.analysis_group).toBe('Hariç')
      expect(result.merchant).toBe('Kart Ödemesi (Enpara)')
    })

    it('User custom rules override built-in', () => {
      const userMappings = [{
        id: '1',
        user_id: '1',
        raw_pattern: 'MIGROS',
        merchant_name: 'Özel Migros',
        default_group: 'İş' as any,
        default_project_id: null,
        created_at: '2023-01-01'
      }]
      const result = matchMerchant('MIGROS SANAL MARKET', userMappings)
      expect(result.merchant).toBe('Özel Migros')
      expect(result.analysis_group).toBe('İş')
    })

    it('Payment gateway prefix cleanup (IYZICO/, PARAM/, PAYTR/)', () => {
      const result = matchMerchant('IYZICO/ TRENDYOL')
      expect(result.merchant).toBe('Trendyol')
    })

    it('Subscriptions (Netflix, Spotify) -> Kisisel + Duzenli', () => {
      const result = matchMerchant('NETFLIX.COM')
      expect(result.analysis_group).toBe('Kişisel')
      expect(result.recurrence).toBe('Düzenli')
      expect(result.merchant).toBe('Netflix')
    })

    it('Investment institutions (Midas, Binance) -> Haric + Transfer', () => {
      const result = matchMerchant('MIDAS MENKUL')
      expect(result.analysis_group).toBe('Hariç')
      expect(result.type).toBe('Transfer')
    })

    it('Empty string -> fallback to empty or original', () => {
      const result = matchMerchant('')
      expect(result.merchant).toBe('')
      expect(result.analysis_group).toBe('Kişisel')
    })

    it('Turkish I/i case matching', () => {
      const result = matchMerchant('bİM market')
      expect(result.merchant).toBe('BİM')
    })
  })
})
