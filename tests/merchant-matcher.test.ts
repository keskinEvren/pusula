import { describe, it, expect } from 'vitest'
import { matchMerchant } from '../src/lib/parser/merchant-matcher'
import type { MerchantMapping } from '../src/types/database'

describe('Pusula İşyeri Normalizasyon & Kural Motoru (Gateway 3 Matcher Testleri)', () => {
  it('1. Süpermarketler: ŞOK, BİM, A101, File, Migros Kişisel grubuna atanır', () => {
    expect(matchMerchant('SOK 12037').merchant).toBe('ŞOK')
    expect(matchMerchant('SOK 12037').analysis_group).toBe('Kişisel')

    expect(matchMerchant('BIM 5701 SULTAN MURAT').merchant).toBe('BİM')
    expect(matchMerchant('FILE NAZENIN/USKUDAR').merchant).toBe('File Market')
    expect(matchMerchant('A101 AYLA USKUD').merchant).toBe('A101')
    expect(matchMerchant('MIGROS TICARET').merchant).toBe('Migros')
  })

  it('2. Kurucu SaaS Araçları: Cursor, Hostinger, AWS, Vercel, Supabase, Claude İş grubuna atanır', () => {
    const cursor = matchMerchant('CURSOR')
    expect(cursor.merchant).toBe('Cursor Pro')
    expect(cursor.analysis_group).toBe('İş')
    expect(cursor.recurrence).toBe('Düzenli')

    const hostinger = matchMerchant('HOSTINGER')
    expect(hostinger.merchant).toBe('Hostinger')
    expect(hostinger.analysis_group).toBe('İş')

    const aws = matchMerchant('AMAZON WEB SERVICES')
    expect(aws.merchant).toBe('AWS Cloud')
    expect(aws.analysis_group).toBe('İş')

    const supabase = matchMerchant('SUPABASE INC')
    expect(supabase.merchant).toBe('Supabase')
    expect(supabase.analysis_group).toBe('İş')

    const claude = matchMerchant('ANTHROPIC CLAUDE')
    expect(claude.merchant).toBe('Anthropic Claude')
    expect(claude.analysis_group).toBe('İş')
  })

  it('3. Tasarım & E-Ticaret Araçları: Canva ve Yengeç.co İş grubuna atanır', () => {
    expect(matchMerchant('CANVA* I04831').merchant).toBe('Canva')
    expect(matchMerchant('CANVA* I04831').analysis_group).toBe('İş')

    expect(matchMerchant('IYZICO/yengec.co').merchant).toBe('Yengeç.co Entegrasyon')
    expect(matchMerchant('IYZICO/yengec.co').analysis_group).toBe('İş')
  })

  it('4. Banka Masrafı & Faiz: Gecikme faizi, Akdi faiz, BSMV, KKDF Finansman grubuna atanır', () => {
    const interest = matchMerchant('GECIKME FAIZI VE BSMV')
    expect(interest.merchant).toBe('Banka Faiz / Masraf')
    expect(interest.analysis_group).toBe('Finansman')
    expect(interest.type).toBe('Finansman/Masraf')
  })

  it('5. Borç Ödemeleri: Ödeme - Enpara satırları Hariç grubuna atanır', () => {
    const payment = matchMerchant('ÖDEME - ENPARA.COM CEP ŞUBESİ')
    expect(payment.merchant).toBe('Kart Ödemesi (Enpara)')
    expect(payment.analysis_group).toBe('Hariç')
    expect(payment.type).toBe('Kart Ödemesi')
  })

  it('6. Kullanıcı Özel Kuralları: Önceliklidir, yerleşik kuralları ezer', () => {
    const userMappings: MerchantMapping[] = [
      {
        id: '1',
        user_id: 'u1',
        raw_pattern: 'AMAZON.COM.TR',
        merchant_name: 'Amazon İş Alışverişi',
        default_group: 'İş',
        default_project_id: 'prj-1',
        created_at: new Date().toISOString(),
      },
    ]

    const res = matchMerchant('IYZICO/AMAZON.COM.TR', userMappings)
    expect(res.merchant).toBe('Amazon İş Alışverişi')
    expect(res.analysis_group).toBe('İş')
    expect(res.project_id).toBe('prj-1')
  })

  it('7. Ödeme Geçidi Temizliği: IYZICO, PARAM, PAYTR ve ÖDEAL önekleri temizlenir', () => {
    expect(matchMerchant('IYZICO/istanbulkart.ist').merchant).toBe('İstanbulkart')
    expect(matchMerchant('PARAM/GETIR').merchant).toBe('Getir')
    expect(matchMerchant('ÖDEAL//ALMIRA PASTA').merchant).toBe('Almira Pasta')
  })

  it('8. Eğlence & Abonelikler: Netflix, Spotify, YouTube Premium Düzenli Kişisel atanır', () => {
    const spotify = matchMerchant('SPOTIFY P1234')
    expect(spotify.merchant).toBe('Spotify')
    expect(spotify.analysis_group).toBe('Kişisel')
    expect(spotify.recurrence).toBe('Düzenli')

    const netflix = matchMerchant('NETFLIX.COM')
    expect(netflix.merchant).toBe('Netflix')
    expect(netflix.analysis_group).toBe('Kişisel')
  })
})
