import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectBankAndMetadata, parseStatementLines } from '@/lib/parser/index'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  formatLocalDateInput: () => '2023-01-01'
}))

describe('Statement Parser Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2023, 0, 1))
  })

  describe('detectBankAndMetadata', () => {
    it('Enpara metadata: bank, card, dates, debt amount', () => {
      const text = `QNB FINANSBANK AS
      Kart No: 1234
      Hesap Kesim Tarihi: 10/10/2023
      Son Ödeme Tarihi: 20/10/2023
      Ekstre borcu: 5.432,10 TL`
      const result = detectBankAndMetadata(text)
      expect(result.bank).toBe('Enpara')
      expect(result.last_four).toBe('1234')
      expect(result.statement_date).toBe('2023-10-10')
      expect(result.due_date).toBe('2023-10-20')
      expect(result.statement_debt).toBe(5432.1)
    })

    it('Akbank Axess metadata: card number and dates', () => {
      const text = `AKBANK T.A.S. AXESS
      Kart Numarası: **** **** **** 5678
      Ekstre tarihi: 15.01.2023
      Son Ödeme: 25.01.2023`
      const result = detectBankAndMetadata(text)
      expect(result.bank).toBe('Akbank')
      expect(result.last_four).toBe('5678')
      expect(result.statement_date).toBe('2023-01-15')
      expect(result.due_date).toBe('2023-01-25')
    })

    it('Ziraat Bankkart metadata: last 4 and period debt', () => {
      const text = `ZIRAAT BANKASI BANKKART
      5349-****-****-9012
      Toplam dönem borcu: 1.000,50`
      const result = detectBankAndMetadata(text)
      expect(result.bank).toBe('Ziraat Bankası')
      expect(result.last_four).toBe('9012')
      expect(result.statement_debt).toBe(1000.5)
    })

    it('Garanti Bonus metadata: masked card detection', () => {
      const text = `GARANTİ BBVA
      4234 **** **** 3456
      Ekstre borcu: 200,00`
      const result = detectBankAndMetadata(text)
      expect(result.bank).toBe('Garanti BBVA')
      expect(result.last_four).toBe('3456')
    })
  })

  describe('parseStatementLines', () => {
    it('Enpara transaction lines: header isolation, installment capture', () => {
      const text = `Ekstre tarihi\n15/05/2023 KOTON 1/3 150,00`
      const result = parseStatementLines(text)
      expect(result.length).toBe(1)
      expect(result[0].amount).toBe(150)
      expect(result[0].recurrence).toBe('Taksit (1/3)')
    })

    it('Turkish glyph repair: broken SOK, BIM restore', () => {
      const text = `10.10.2023 B M V123 50,00`
      const result = parseStatementLines(text)
      expect(result[0].merchant).toBe('BİM')
    })

    it('Interest and fees: BSMV, KKDF -> Finansman', () => {
      const text = `12.12.2023 BSMV 10,00`
      const result = parseStatementLines(text)
      expect(result[0].analysis_group).toBe('Finansman')
    })

    it('Ziraat multi-column: TL amount not caught by 0.00 USD', () => {
      const text = `15.11.2023 YURTDISI HARCAMA 500,00 10,00 0,00`
      const result = parseStatementLines(text)
      expect(result[0].amount).toBe(500)
    })

    it('Ziraat + signed payment line capture', () => {
      const text = `01.01.2023 ODEME TEŞEKKÜRLER +500,00`
      const result = parseStatementLines(text)
      expect(result[0].type).toBe('Kart Ödemesi')
    })

    it('Soft hyphen cleanup and DEVIR filter', () => {
      const text = `02.02.2023 Devreden bakiye 100,00\n03.03.2023 MARKET 20,00`
      const result = parseStatementLines(text)
      expect(result.length).toBe(1)
      expect(result[0].amount).toBe(20)
    })

    it('ISO date format preserved', () => {
      const text = `15/06/2023 MARKET 100,00`
      const result = parseStatementLines(text)
      expect(result[0].date).toBe('2023-06-15')
    })
  })
})
