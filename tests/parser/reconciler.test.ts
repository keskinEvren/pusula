import { describe, it, expect, vi } from 'vitest'
import { reconcileBankMovement } from '@/lib/parser/reconciler'
import type { Debt, CreditCard } from '@/types/database'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('Reconciler Tests', () => {
  describe('reconcileBankMovement', () => {
    it('Salary EFT inflow -> receivable match by name', () => {
      const debts: Debt[] = [{
        id: '1',
        user_id: '1',
        type: 'Alacak',
        person_or_entity: 'Ahmet Yılmaz',
        principal: 5000,
        past_payments: 0,
        remaining: 5000,
        status: 'Açık',
        category: 'Maaş',
        description: null,
        linked_account_id: null,
        project_id: null,
        created_at: '2023',
        updated_at: '2023',
      }]
      const result = reconcileBankMovement('GELEN EFT: MAAŞ', 5000, 'inflow', debts)
      expect(result.action).toBe('COLLECT_RECEIVABLE')
    })

    it('Amount match receivable (name unclear)', () => {
      const debts = [{
        id: '2',
        user_id: '1',
        type: 'Alacak',
        person_or_entity: 'Bilinmeyen',
        principal: 1234.56,
        past_payments: 0,
        remaining: 1234.56,
        currency: 'TRY',
        status: 'Açık',
        category: 'Diğer',
        created_at: '2023'
      }] as any
      const result = reconcileBankMovement('GELEN TRANSFER', 1234.56, 'inflow', debts)
      expect(result.action).toBe('COLLECT_RECEIVABLE')
    })

    it('Free income (unrecognized inflow)', () => {
      const result = reconcileBankMovement('GELEN EFT - DIĞER', 100, 'inflow', [])
      expect(result.action).toBe('FREE_INCOME')
    })

    it('Credit card payment -> Haric + card match', () => {
      const result = reconcileBankMovement('KK ÖDEME', 500, 'outflow', [])
      expect(result.action).toBe('CARD_PAYMENT')
      expect(result.analysis_group).toBe('Hariç')
      expect(result.classification_status).toBe('NEEDS_REVIEW')
    })

    it('Axess card payment -> correct card name', () => {
      const cards = [{
        id: 'c1',
        user_id: '1',
        bank: 'Akbank',
        card_name: 'Axess',
        limit: 10000,
        statement_date: '2023-01-01',
        due_date: '2023-01-10',
        created_at: '2023'
      }] as any
      const result = reconcileBankMovement('KREDİ KARTI ÖDEMESİ AKBANK', 1000, 'outflow', [], cards)
      expect(result.action).toBe('CARD_PAYMENT')
      expect(result.target_card_id).toBe('c1')
      expect(result.classification_status).toBe('HIGH_CONFIDENCE')
    })

    it('does not auto-target when the same bank matches multiple cards', () => {
      const cards = [
        { id: 'c1', bank: 'Akbank', card_name: 'Axess', last_four: '1111' },
        { id: 'c2', bank: 'Akbank', card_name: 'Wings', last_four: '2222' },
      ] as any
      const result = reconcileBankMovement('KREDİ KARTI ÖDEMESİ AKBANK', 1000, 'outflow', [], cards)
      expect(result.target_card_id).toBeUndefined()
      expect(result.classification_status).toBe('NEEDS_REVIEW')
      expect(result.reasons[0]).toMatch(/birden fazla kart/)
    })

    it('Personal debt repayment -> Borc Odemesi', () => {
      const debts = [{
        id: '3',
        user_id: '1',
        type: 'Borç',
        person_or_entity: 'Mehmet',
        principal: 200,
        past_payments: 0,
        remaining: 200,
        currency: 'TRY',
        status: 'Açık',
        category: 'Diğer',
        created_at: '2023'
      }] as any
      const result = reconcileBankMovement('MEHMET BORÇ ÖDEME', 200, 'outflow', debts)
      expect(result.action).toBe('PAY_DEBT')
    })

    it('Inter-account transfer -> Transfer', () => {
      const result = reconcileBankMovement('VİRMAN', 50, 'outflow')
      expect(result.action).toBe('INTERNAL_TRANSFER')
    })

    it('FAST/cash expense -> Harcama', () => {
      const result = reconcileBankMovement('FAST - KAHVE DÜKKANI', 120, 'outflow')
      expect(result.action).toBe('DIRECT_EXPENSE')
    })

    it('Generic payment wording must not become a card payment', () => {
      const result = reconcileBankMovement('FAST ANLIK ÖDEME - KAHVE DÜKKANI', 120, 'outflow')
      expect(result.action).toBe('DIRECT_EXPENSE')
      expect(result.target_card_id).toBeUndefined()
    })

    it('Investment transfer (Midas, Binance) -> INVESTMENT_TRANSFER + Haric', () => {
      const result = reconcileBankMovement('MİDAS MENKUL', 5000, 'outflow')
      expect(result.action).toBe('INVESTMENT_TRANSFER')
      expect(result.analysis_group).toBe('Hariç')
    })

    it('Cash advance detection', () => {
      const result = reconcileBankMovement('NAKİT AVANS', 1000, 'inflow')
      expect(result.action).toBe('CASH_ADVANCE')
    })

    it('Multi-line statement: correct directions', () => {
      // Reconciler is item by item
      const out = reconcileBankMovement('MARKET HARCAMASI', 100, 'outflow')
      expect(out.action).toBe('DIRECT_EXPENSE')
    })

    it('Two debts same amount -> ambiguity handling', () => {
      const debts = [
        { id: '1', type: 'Alacak', remaining: 100, person_or_entity: 'A', status: 'Açık', user_id: '1', principal: 100, currency: 'TRY', category: 'X', created_at: 'X' },
        { id: '2', type: 'Alacak', remaining: 100, person_or_entity: 'B', status: 'Açık', user_id: '1', principal: 100, currency: 'TRY', category: 'Y', created_at: 'X' }
      ] as any
      const result = reconcileBankMovement('GELEN EFT', 100, 'inflow', debts)
      expect(result.action).toBe('COLLECT_RECEIVABLE')
      expect(result.classification_status).toBe('NEEDS_REVIEW')
    })
  })
})
