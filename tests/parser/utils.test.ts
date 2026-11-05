import { describe, it, expect, vi } from 'vitest'
import {
  parseFlexibleAmount,
  parseFlexibleBalance,
  fixWindows1254Text,
  detectBankFromTextOrIban,
} from '@/lib/parser/utils'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Parser Utils Tests', () => {
  describe('parseFlexibleAmount', () => {
    it('parseFlexibleAmount Turkish format 1.234,56 -> 1234.56', () => {
      const result = parseFlexibleAmount('1.234,56')
      expect(result).toBe(1234.56)
    })

    it('parseFlexibleAmount Anglo format 1,234.56 -> 1234.56', () => {
      const result = parseFlexibleAmount('1,234.56')
      expect(result).toBe(1234.56)
    })

    it('parseFlexibleAmount negative sign is stripped (bank statement convention)', () => {
      const result = parseFlexibleAmount('-500,00')
      expect(result).toBe(500)
    })

    it('parseFlexibleAmount 0,00 -> 0', () => {
      const result = parseFlexibleAmount('0,00')
      expect(result).toBe(0)
    })

    it('parseFlexibleAmount null/undefined -> undefined', () => {
      const result1 = parseFlexibleAmount(undefined)
      const result2 = parseFlexibleAmount('')
      const result3 = parseFlexibleAmount('abc')
      expect(result1).toBeUndefined()
      expect(result2).toBeUndefined()
      expect(result3).toBeUndefined()
    })
  })

  describe('parseFlexibleBalance', () => {
    it('parseFlexibleBalance preserves explicit negative sign (-399,46 TL -> -399.46)', () => {
      const result = parseFlexibleBalance('-399,46 TL')
      expect(result).toBe(-399.46)
    })

    it('parseFlexibleBalance handles leading minus without currency (-300,00 -> -300)', () => {
      const result = parseFlexibleBalance('-300,00')
      expect(result).toBe(-300)
    })

    it('parseFlexibleBalance handles trailing minus (399,46- -> -399.46)', () => {
      const result = parseFlexibleBalance('399,46-')
      expect(result).toBe(-399.46)
    })

    it('parseFlexibleBalance handles Turkish debt flag (B) (399,46 (B) -> -399.46)', () => {
      const result = parseFlexibleBalance('399,46 (B)')
      expect(result).toBe(-399.46)
    })

    it('parseFlexibleBalance handles Turkish Borç word (399,46 Borç -> -399.46)', () => {
      const result = parseFlexibleBalance('399,46 Borç')
      expect(result).toBe(-399.46)
    })

    it('parseFlexibleBalance handles accounting parentheses ((500,00) -> -500)', () => {
      const result = parseFlexibleBalance('(500,00)')
      expect(result).toBe(-500)
    })

    it('parseFlexibleBalance handles explicit positive flag (A) (300,00 (A) -> 300)', () => {
      const result = parseFlexibleBalance('300,00 (A)')
      expect(result).toBe(300)
    })

    it('parseFlexibleBalance standard positive amount (1.250,50 TL -> 1250.5)', () => {
      const result = parseFlexibleBalance('1.250,50 TL')
      expect(result).toBe(1250.5)
    })

    it('parseFlexibleBalance 0,00 -> 0', () => {
      const result = parseFlexibleBalance('0,00 TL')
      expect(result).toBe(0)
    })

    it('parseFlexibleBalance null/undefined -> undefined', () => {
      expect(parseFlexibleBalance(undefined)).toBeUndefined()
      expect(parseFlexibleBalance('')).toBeUndefined()
    })
  })

  describe('fixWindows1254Text', () => {
    it('fixWindows1254Text broken chars -> fixed Turkish', () => {
      const result = fixWindows1254Text('ÞþÝýÐð')
      expect(result).toBe('ŞşİıĞğ')
    })

    it('fixWindows1254Text clean text unchanged', () => {
      const result = fixWindows1254Text('Temiz Metin')
      expect(result).toBe('Temiz Metin')
    })

    it('fixWindows1254Text null -> safe fallback', () => {
      const result = fixWindows1254Text(undefined)
      expect(result).toBe('')
    })
  })

  describe('detectBankFromTextOrIban', () => {
    it('detectBankFromTextOrIban Ziraat IBAN -> Ziraat Vadesiz', () => {
      const result = detectBankFromTextOrIban('TR120001012345678901234567')
      expect(result).toBe('Ziraat Vadesiz')
    })

    it('detectBankFromTextOrIban Enpara text -> Enpara Vadesiz', () => {
      const result = detectBankFromTextOrIban('QNB FINANSBANK AS')
      expect(result).toBe('Enpara Vadesiz')
    })

    it('detectBankFromTextOrIban Akbank text -> Akbank Vadesiz', () => {
      const result = detectBankFromTextOrIban('AKBANK T.A.S.')
      expect(result).toBe('Akbank Vadesiz')
    })

    it('detectBankFromTextOrIban Garanti text -> Garanti Vadesiz', () => {
      const result = detectBankFromTextOrIban('GARANTİ BBVA')
      expect(result).toBe('Garanti Vadesiz')
    })

    it('detectBankFromTextOrIban unknown -> undefined fallback', () => {
      const result = detectBankFromTextOrIban('Bilinmeyen Banka')
      expect(result).toBeUndefined()
    })
  })
})
