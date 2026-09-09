import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FinancialBridge } from '../src/lib/financial-bridge'

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('FinancialBridge Unit Tests', () => {
  let bridge: FinancialBridge

  beforeEach(() => {
    bridge = new FinancialBridge()
    vi.clearAllMocks()
  })

  describe('Validation & Edge Cases', () => {
    it('recordExpense should reject amount <= 0', async () => {
      const res = await bridge.recordExpense({
        userId: 'u1',
        amount: 0,
        description: 'Test',
        date: '2026-09-01',
        accountId: 'acc1',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordExpense should reject when neither accountId nor cardId is provided', async () => {
      const res = await bridge.recordExpense({
        userId: 'u1',
        amount: 100,
        description: 'Test',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('seçilmelidir')
    })

    it('recordIncome should reject amount <= 0', async () => {
      const res = await bridge.recordIncome({
        userId: 'u1',
        amount: -50,
        description: 'Salary',
        date: '2026-09-01',
        accountId: 'acc1',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordCardPayment should reject amount <= 0', async () => {
      const res = await bridge.recordCardPayment({
        userId: 'u1',
        amount: 0,
        sourceAccountId: 'acc1',
        cardId: 'card1',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordDebtPayment should reject amount <= 0', async () => {
      const res = await bridge.recordDebtPayment({
        userId: 'u1',
        amount: -10,
        sourceAccountId: 'acc1',
        debtId: 'debt1',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordReceivableCollection should reject amount <= 0', async () => {
      const res = await bridge.recordReceivableCollection({
        userId: 'u1',
        amount: 0,
        targetAccountId: 'acc1',
        receivableId: 'rec1',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordTransfer should reject amount <= 0', async () => {
      const res = await bridge.recordTransfer({
        userId: 'u1',
        amount: -100,
        sourceAccountId: 'acc1',
        targetAccountId: 'acc2',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('sıfırdan büyük')
    })

    it('recordTransfer should reject transfer to same account', async () => {
      const res = await bridge.recordTransfer({
        userId: 'u1',
        amount: 500,
        sourceAccountId: 'acc1',
        targetAccountId: 'acc1',
        date: '2026-09-01',
      })
      expect(res.success).toBe(false)
      expect(res.error).toContain('Aynı hesaba transfer yapılamaz')
    })
  })

  describe('getLinkedDebtId helper', () => {
    it('should return related_debt_id when present', async () => {
      const { getLinkedDebtId } = await import('../src/lib/financial-bridge')
      const id = getLinkedDebtId({ related_debt_id: 'debt-uuid-123', description: 'Some text' })
      expect(id).toBe('debt-uuid-123')
    })

    it('should extract debt id from description tag [DEBT:<uuid>] when related_debt_id is null', async () => {
      const { getLinkedDebtId } = await import('../src/lib/financial-bridge')
      const id = getLinkedDebtId({
        related_debt_id: null,
        description: 'Hızır Global Kurye [DEBT:d6a3b5ae-fcec-4347-867b-f085eb780098]',
      })
      expect(id).toBe('d6a3b5ae-fcec-4347-867b-f085eb780098')
    })

    it('should return null when no debt id is present', async () => {
      const { getLinkedDebtId } = await import('../src/lib/financial-bridge')
      const id = getLinkedDebtId({
        related_debt_id: null,
        description: 'Market Harcaması',
      })
      expect(id).toBeNull()
    })
  })

  describe('getLinkedInvestmentId helper', () => {
    it('should extract investment id from description tag [INV:<uuid>]', async () => {
      const { getLinkedInvestmentId } = await import('../src/lib/financial-bridge')
      const id = getLinkedInvestmentId({
        description: 'Midas Menkul Değerler Para Girişi [INV:inv-9988-aabb]',
      })
      expect(id).toBe('inv-9988-aabb')
    })

    it('should return null when no [INV:...] tag is present', async () => {
      const { getLinkedInvestmentId } = await import('../src/lib/financial-bridge')
      const id = getLinkedInvestmentId({
        description: 'Migros Market Alışverişi',
      })
      expect(id).toBeNull()
    })
  })
})

