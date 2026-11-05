import { describe, it, expect } from 'vitest'
import {
  addMonths,
  generateInstallmentBatch,
  calculateInstallmentSummary,
  sortDebts,
  mergeInstallmentDrafts,
  parseAmount,
  normalizeDate,
  parsePastedSchedule,
  calculateMergedDebtSummary,
  type InstallmentDraft,
} from '@/lib/debt-utils'
import type { Debt } from '@/types/database'

describe('Debt Installments Engine & Pure Helpers', () => {
  describe('Amount & Date Normalization', () => {
    it('parses Turkish currency strings correctly', () => {
      expect(parseAmount('2.181,94 ₺')).toBe(2181.94)
      expect(parseAmount('2158,17')).toBe(2158.17)
      expect(parseAmount('700.45')).toBe(700.45)
      expect(parseAmount('100,00 ₺')).toBe(100)
      expect(parseAmount(500.5)).toBe(500.5)
      expect(parseAmount('')).toBe(0)
      expect(parseAmount(null)).toBe(0)
    })

    it('normalizes Turkish dates and ISO dates to YYYY-MM-DD', () => {
      expect(normalizeDate('05.11.2026')).toBe('2026-11-05')
      expect(normalizeDate('5.12.2026')).toBe('2026-12-05')
      expect(normalizeDate('05/01/2027')).toBe('2027-01-05')
      expect(normalizeDate('2026-11-05')).toBe('2026-11-05')
      expect(normalizeDate('2026-11-05T12:00:00Z')).toBe('2026-11-05')
      expect(normalizeDate('')).toBe('')
    })
  })

  describe('Date Math (addMonths)', () => {
    it('handles normal month increment within same year', () => {
      expect(addMonths('2026-05-15', 1)).toBe('2026-06-15')
      expect(addMonths('2026-05-15', 3)).toBe('2026-08-15')
    })

    it('handles year rollover (Dec 2026 -> Jan 2027)', () => {
      expect(addMonths('2026-11-05', 2)).toBe('2027-01-05')
      expect(addMonths('2026-12-05', 1)).toBe('2027-01-05')
      expect(addMonths('2026-12-05', 14)).toBe('2028-02-05')
    })

    it('clamps month-end days on shorter months (Jan 31 -> Feb 28)', () => {
      expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
      expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
    })

    it('clamps month-end days on leap year (Jan 31 -> Feb 29 in 2028)', () => {
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    })

    it('handles ISO timestamps with appended time safely', () => {
      expect(addMonths('2026-11-05T12:00:00.000Z', 1)).toBe('2026-12-05')
      expect(addMonths('2026-01-31 00:00:00', 1)).toBe('2026-02-28')
    })
  })

  describe('Batch Generation & String-safe Draft Amounts', () => {
    it('handles float count by flooring and string amounts properly', () => {
      const batch = generateInstallmentBatch({
        count: 3.8 as any,
        startDate: '2026-10-15',
        amount: '150.75' as any,
        startingInstallmentNo: 1,
      })
      expect(batch).toHaveLength(3)
      expect(batch[0].amount).toBe(150.75)
      expect(batch[2].installment_no).toBe(3)
      expect(batch[2].due_date).toBe('2026-12-15')
    })

    it('summarizes drafts with string amounts without NaN', () => {
      const drafts: InstallmentDraft[] = [
        { installment_no: 1, due_date: '2026-10-01', amount: '250.50' as any, status: 'Ödendi' },
        { installment_no: 2, due_date: '2026-11-01', amount: '749.50' as any, status: 'Bekliyor' },
      ]
      const summary = calculateInstallmentSummary(drafts, '2026-10-15')
      expect(summary.totalAmount).toBe(1000)
      expect(summary.paidAmount).toBe(250.5)
      expect(summary.remainingAmount).toBe(749.5)
      expect(summary.paidCount).toBe(1)
      expect(summary.remainingCount).toBe(1)
      expect(summary.nextInstallment?.installment_no).toBe(2)
      expect(summary.overdueCount).toBe(0)
    })
  })

  describe('Merge Installments by Date (mergeInstallmentDrafts)', () => {
    it('merges overlapping installments on the same due_date and sums their amounts', () => {
      const existing: InstallmentDraft[] = [
        { installment_no: 1, due_date: '2026-11-05', amount: 1400.0, status: 'Bekliyor', note: 'Alışveriş 1' },
        { installment_no: 2, due_date: '2026-12-05', amount: 1400.0, status: 'Bekliyor', note: 'Alışveriş 1' },
      ]
      const incoming: InstallmentDraft[] = [
        { installment_no: 1, due_date: '2026-11-05', amount: 781.94, status: 'Bekliyor', note: 'Alışveriş 2' },
        { installment_no: 2, due_date: '2026-12-05', amount: 758.17, status: 'Bekliyor', note: 'Alışveriş 2' },
        { installment_no: 3, due_date: '2027-01-05', amount: 2158.17, status: 'Bekliyor', note: 'Alışveriş 2' },
      ]

      const merged = mergeInstallmentDrafts(existing, incoming)

      expect(merged).toHaveLength(3)
      // Month 1
      expect(merged[0].installment_no).toBe(1)
      expect(merged[0].due_date).toBe('2026-11-05')
      expect(merged[0].amount).toBe(2181.94) // 1400 + 781.94
      expect(merged[0].note).toBe('Alışveriş 1 + Alışveriş 2')
      expect(merged[0].status).toBe('Bekliyor')

      // Month 2
      expect(merged[1].installment_no).toBe(2)
      expect(merged[1].due_date).toBe('2026-12-05')
      expect(merged[1].amount).toBe(2158.17) // 1400 + 758.17
      expect(merged[1].note).toBe('Alışveriş 1 + Alışveriş 2')

      // Month 3
      expect(merged[2].installment_no).toBe(3)
      expect(merged[2].due_date).toBe('2027-01-05')
      expect(merged[2].amount).toBe(2158.17)
      expect(merged[2].note).toBe('Alışveriş 2')
    })

    it('merges seamlessly even when one date is Turkish 05.11.2026 and one is 2026-11-05', () => {
      const drafts: InstallmentDraft[] = [
        { installment_no: 1, due_date: '05.11.2026', amount: '1.400,00 ₺', status: 'Bekliyor' },
        { installment_no: 2, due_date: '2026-11-05', amount: '781,94 ₺', status: 'Bekliyor' },
      ]
      const merged = mergeInstallmentDrafts(drafts)
      expect(merged).toHaveLength(1)
      expect(merged[0].due_date).toBe('2026-11-05')
      expect(merged[0].amount).toBe(2181.94)
    })

    it('merges installments on exact same day (e.g. 05.07.2010) into one total while keeping different days (e.g. 11.07.2010) separate', () => {
      const drafts: InstallmentDraft[] = [
        { installment_no: 1, due_date: '05.07.2010', amount: 150.0, status: 'Bekliyor', note: 'Giyim' },
        { installment_no: 2, due_date: '05.07.2010', amount: 250.0, status: 'Bekliyor', note: 'Ayakkabı' },
        { installment_no: 3, due_date: '11.07.2010', amount: 500.0, status: 'Bekliyor', note: 'Mont' },
      ]
      const merged = mergeInstallmentDrafts(drafts)
      expect(merged).toHaveLength(2)
      // First day: 05.07.2010
      expect(merged[0].due_date).toBe('2010-07-05')
      expect(merged[0].amount).toBe(400.0) // 150 + 250
      expect(merged[0].note).toBe('Giyim + Ayakkabı')
      expect(merged[0].installment_no).toBe(1)

      // Second day: 11.07.2010
      expect(merged[1].due_date).toBe('2010-07-11')
      expect(merged[1].amount).toBe(500.0)
      expect(merged[1].note).toBe('Mont')
      expect(merged[1].installment_no).toBe(2)
    })
  })

  describe('Smart Schedule Text Parser (parsePastedSchedule)', () => {
    it('parses pasted text from store websites like Gencallar', () => {
      const sample = `
Taksit Öde
No	Vade Tarihi	Taksit tutarı
	1	05.11.2026	2.181,94 ₺
	2	05.12.2026	2.158,17 ₺
	3	05.01.2027	2.158,17 ₺
	4	05.02.2027	2.158,17 ₺
	5	05.03.2027	700,45 ₺
      `
      const parsed = parsePastedSchedule(sample)
      expect(parsed).toHaveLength(5)
      expect(parsed[0].due_date).toBe('2026-11-05')
      expect(parsed[0].amount).toBe(2181.94)
      expect(parsed[1].due_date).toBe('2026-12-05')
      expect(parsed[1].amount).toBe(2158.17)
      expect(parsed[4].due_date).toBe('2027-03-05')
      expect(parsed[4].amount).toBe(700.45)
    })
  })

  describe('Debt Merging Engine (calculateMergedDebtSummary)', () => {
    it('consolidates multiple debts correctly', () => {
      const debts: Partial<Debt>[] = [
        { principal: 63300, past_payments: 30000, remaining: 33300 },
        { principal: 63300, past_payments: 0, remaining: 63300 },
        { principal: 10550, past_payments: 0, remaining: 10550 },
      ]
      const summary = calculateMergedDebtSummary(debts as Debt[])
      expect(summary.principal).toBe(137150)
      expect(summary.past_payments).toBe(30000)
      expect(summary.remaining).toBe(107150)
      expect(summary.status).toBe('Açık')
    })
  })

  describe('Gencallar 19-Installment Real World Flow', () => {
    it('calculates 19 installments totaling 13158.70 ₺ correctly', () => {
      const batch1 = generateInstallmentBatch({
        count: 1,
        startDate: '2026-11-05',
        amount: 2181.94,
        startingInstallmentNo: 1,
      })
      const batch2 = generateInstallmentBatch({
        count: 3,
        startDate: '2026-12-05',
        amount: 2158.17,
        startingInstallmentNo: 2,
      })
      const batch3 = generateInstallmentBatch({
        count: 5,
        startDate: '2027-03-05',
        amount: 700.45,
        startingInstallmentNo: 5,
      })
      const batch4 = generateInstallmentBatch({
        count: 10,
        startDate: '2027-08-05',
        amount: 100.0,
        startingInstallmentNo: 10,
      })

      const all = [...batch1, ...batch2, ...batch3, ...batch4]
      expect(all).toHaveLength(19)

      const summary = calculateInstallmentSummary(all, '2026-10-29')
      expect(summary.totalCount).toBe(19)
      expect(summary.totalAmount).toBe(13158.7)
      expect(summary.remainingAmount).toBe(13158.7)
      expect(summary.nextInstallment?.due_date).toBe('2026-11-05')
      expect(summary.nextInstallment?.amount).toBe(2181.94)
    })
  })

  describe('Debt Sorting Engine (sortDebts)', () => {
    it('sorts open debts before closed debts and by next due date earliest first', () => {
      const debts: Debt[] = [
        {
          id: '1',
          user_id: 'u1',
          type: 'Borç',
          category: 'Diğer',
          person_or_entity: 'Closed Debt',
          description: null,
          principal: 100,
          past_payments: 100,
          remaining: 0,
          status: 'Kapatıldı',
          linked_account_id: null,
          project_id: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          user_id: 'u1',
          type: 'Borç',
          category: 'Diğer',
          person_or_entity: 'Open Debt (Later due)',
          description: null,
          principal: 500,
          past_payments: 0,
          remaining: 500,
          status: 'Açık',
          linked_account_id: null,
          project_id: null,
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: '3',
          user_id: 'u1',
          type: 'Borç',
          category: 'Diğer',
          person_or_entity: 'Open Debt (Earlier due)',
          description: null,
          principal: 300,
          past_payments: 0,
          remaining: 300,
          status: 'Açık',
          linked_account_id: null,
          project_id: null,
          created_at: '2026-01-03T00:00:00Z',
          updated_at: '2026-01-03T00:00:00Z',
        },
      ]

      const nextDues = {
        '2': '2026-12-05',
        '3': '2026-11-05',
      }

      const sorted = sortDebts(debts, nextDues)
      expect(sorted[0].id).toBe('3') // Earlier due
      expect(sorted[1].id).toBe('2') // Later due
      expect(sorted[2].id).toBe('1') // Closed
    })
  })
})
