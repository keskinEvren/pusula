import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  FinancialBridge,
  financialBridge,
  getLinkedDebtId,
  getLinkedInvestmentId
} from '@/lib/financial-bridge'

// Kompleks Supabase Mock Kurulumu
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({
  single: mockSingle,
  eq: mockEq
}))
const mockSelect = vi.fn(() => ({
  eq: mockEq,
  single: mockSingle
}))
const mockInsert = vi.fn(() => ({
  select: mockSelect,
  single: mockSingle
}))
const mockUpdate = vi.fn(() => ({
  eq: mockEq
}))
const mockDelete = vi.fn(() => ({
  eq: mockEq
}))

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete
}))

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } })
    }
  }))
}))

describe('Financial Bridge Testleri', () => {
  let bridge: FinancialBridge

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = financialBridge
  })

  describe('Harcama Kaydetme (recordExpense)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordExpense({ userId: 'u1', amount: 0, description: 'Test', date: '2026-01-01' })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/sıfırdan büyük/)
    })

    it('Hesap veya kart seçilmemişse reddetmelidir', async () => {
      const res = await bridge.recordExpense({ userId: 'u1', amount: 100, description: 'Test', date: '2026-01-01' })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/Hesap veya kart/)
    })

    it('RPC başarılı olduğunda transactionId dönmelidir', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, transaction_id: 'tx-123' }, error: null })
      const res = await bridge.recordExpense({ userId: 'u1', amount: 100, description: 'Test', date: '2026-01-01', accountId: 'a1' })
      expect(res.success).toBe(true)
      expect(res.transactionId).toBe('tx-123')
    })

    it('RPC hata verirse client fallback çalışmalıdır', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC failed'))
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-client-1' }, error: null }) // insert tx
      mockSingle.mockResolvedValueOnce({ data: { balance: 500 }, error: null }) // select account
      
      const res = await bridge.recordExpense({ userId: 'u1', amount: 100, description: 'Test', date: '2026-01-01', accountId: 'a1' })
      expect(res.success).toBe(true)
      expect(res.transactionId).toBe('tx-client-1')
      expect(mockFrom).toHaveBeenCalledWith('transactions')
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 400 }) // 500 - 100
    })
  })

  describe('Gelir Kaydetme (recordIncome)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordIncome({ userId: 'u1', amount: -50, description: 'Test', date: '2026-01-01', accountId: 'a1' })
      expect(res.success).toBe(false)
    })

    it('RPC başarılı olduğunda gelir kaydedilmelidir', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, transaction_id: 'tx-inc-1' }, error: null })
      const res = await bridge.recordIncome({ userId: 'u1', amount: 500, description: 'Maaş', date: '2026-01-01', accountId: 'a1' })
      expect(res.success).toBe(true)
      expect(res.transactionId).toBe('tx-inc-1')
    })
  })

  describe('Kart Borcu Ödeme (recordCardPayment)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordCardPayment({ userId: 'u1', amount: 0, sourceAccountId: 'a1', cardId: 'c1', date: '2026-01-01' })
      expect(res.success).toBe(false)
    })

    it('Hesap bakiyesini ve kart borcunu düşürmelidir', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-card-1' }, error: null }) // tx insert
      mockSingle.mockResolvedValueOnce({ data: { balance: 1000 }, error: null }) // account select
      mockSingle.mockResolvedValueOnce({ data: { current_debt: 2000 }, error: null }) // card select

      const res = await bridge.recordCardPayment({ userId: 'u1', amount: 500, sourceAccountId: 'a1', cardId: 'c1', date: '2026-01-01' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 500 }) // account update
      expect(mockUpdate).toHaveBeenCalledWith({ current_debt: 1500 }) // card update
    })
  })

  describe('Borç Ödeme (recordDebtPayment)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordDebtPayment({ userId: 'u1', amount: -10, sourceAccountId: 'a1', debtId: 'd1', date: '2026-01-01' })
      expect(res.success).toBe(false)
    })

    it('Borç miktarını düşürmeli ve bakiyeyi azaltmalıdır', async () => {
      mockSingle.mockResolvedValueOnce({ data: { remaining: 500, past_payments: 0, status: 'Açık' }, error: null }) // debt select
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-debt-1' }, error: null }) // tx insert
      mockSingle.mockResolvedValueOnce({ data: { balance: 1000 }, error: null }) // account select

      const res = await bridge.recordDebtPayment({ userId: 'u1', amount: 200, sourceAccountId: 'a1', debtId: 'd1', date: '2026-01-01' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ remaining: 300, past_payments: 200, status: 'Açık' }))
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 800 })
    })
  })

  describe('Alacak Tahsil Etme (recordReceivableCollection)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordReceivableCollection({ userId: 'u1', amount: 0, targetAccountId: 'a1', receivableId: 'r1', date: '2026-01-01' })
      expect(res.success).toBe(false)
    })

    it('Alacak miktarını düşürmeli ve hedef bakiyeyi artırmalıdır', async () => {
      mockSingle.mockResolvedValueOnce({ data: { remaining: 1000, past_payments: 0, status: 'Açık' }, error: null }) // debt select
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-rec-1' }, error: null }) // tx insert
      mockSingle.mockResolvedValueOnce({ data: { balance: 500 }, error: null }) // account select

      const res = await bridge.recordReceivableCollection({ userId: 'u1', amount: 1000, targetAccountId: 'a1', receivableId: 'r1', date: '2026-01-01' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ remaining: 0, past_payments: 1000, status: 'Kapatıldı' }))
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 1500 })
    })
  })

  describe('Hesaplar Arası Transfer (recordTransfer)', () => {
    it('Tutar 0 veya daha küçükse reddetmelidir', async () => {
      const res = await bridge.recordTransfer({ userId: 'u1', amount: 0, sourceAccountId: 'a1', targetAccountId: 'a2', date: '2026-01-01' })
      expect(res.success).toBe(false)
    })

    it('Aynı hesap seçilmişse reddetmelidir', async () => {
      const res = await bridge.recordTransfer({ userId: 'u1', amount: 100, sourceAccountId: 'a1', targetAccountId: 'a1', date: '2026-01-01' })
      expect(res.success).toBe(false)
    })

    it('Bakiyeleri doğru şekilde güncellemelidir', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC fail')) // Fallback to client
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-trans-1' }, error: null }) // tx insert
      mockSingle.mockResolvedValueOnce({ data: { balance: 1000 }, error: null }) // source select
      mockSingle.mockResolvedValueOnce({ data: { balance: 500 }, error: null }) // target select

      const res = await bridge.recordTransfer({ userId: 'u1', amount: 200, sourceAccountId: 'a1', targetAccountId: 'a2', date: '2026-01-01' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 800 }) // source
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 700 }) // target
    })
  })

  describe('İşlem Silme (deleteTransaction)', () => {
    it('İşlem tipine göre geri alma (reversal) yapmalıdır', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC fail'))
      // read tx
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-1', type: 'Harcama', account_id: 'a1', amount: 300 }, error: null })
      // read account
      mockSingle.mockResolvedValueOnce({ data: { balance: 1000 }, error: null })
      
      const res = await bridge.deleteTransaction('tx-1')
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 1300 }) // Refund expense
      expect(mockDelete).toHaveBeenCalled()
    })
  })

  describe('Helper Fonksiyonlar', () => {
    it('getLinkedDebtId related_debt_id değerini dönmelidir', () => {
      expect(getLinkedDebtId({ related_debt_id: 'd-123' })).toBe('d-123')
    })

    it('getLinkedDebtId açıklamadan [DEBT:uuid] ayıklayabilmelidir', () => {
      expect(getLinkedDebtId({ description: 'Kredi ödemesi [DEBT:c0a80101-0000-0000-0000-000000000456]' })).toBe('c0a80101-0000-0000-0000-000000000456')
    })

    it('getLinkedDebtId yoksa null dönmelidir', () => {
      expect(getLinkedDebtId({ description: 'Sıradan harcama' })).toBeNull()
    })

    it('getLinkedInvestmentId açıklamadan [INV:uuid] ayıklayabilmelidir', () => {
      expect(getLinkedInvestmentId({ description: 'Hisse senedi alımı [INV:inv-123]' })).toBe('inv-123')
    })

    it('getLinkedInvestmentId yoksa null dönmelidir', () => {
      expect(getLinkedInvestmentId({ description: 'Sıradan' })).toBeNull()
    })
  })

  describe('Borç/Yatırım Bağlama ve Çözme', () => {
    it('linkTransactionToDebt aynı borca bağlanıyorsa idempotent çalışmalıdır', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC fail'))
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-1', description: '[DEBT:d-1]', amount: 100 }, error: null }) // read tx
      
      const res = await bridge.linkTransactionToDebt({ userId: 'u1', transactionId: 'tx-1', debtId: 'd-1' })
      expect(res.success).toBe(true)
      // idempotent, doesn't load debt or update
    })

    it('unlinkTransactionFromDebt bağlantıyı kaldırmalıdır', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-1', type: 'Borç Ödemesi', amount: 100, description: 'Ödeme [DEBT:d-1]' }, error: null }) // tx
      mockSingle.mockResolvedValueOnce({ data: { id: 'd-1', remaining: 400, past_payments: 100 }, error: null }) // debt
      
      const res = await bridge.unlinkTransactionFromDebt({ userId: 'u1', transactionId: 'tx-1' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'Harcama' }))
    })

    it('linkTransactionToInvestment [INV:id] eklemeli ve grubu Hariç yapmalıdır', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-1', description: 'Hisse' }, error: null }) // tx
      mockSingle.mockResolvedValueOnce({ data: null, error: null }) // inv (not updating qty in this test)

      const res = await bridge.linkTransactionToInvestment({ userId: 'u1', transactionId: 'tx-1', investmentId: 'inv-1' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'Transfer', analysis_group: 'Hariç', description: 'Hisse [INV:inv-1]' }))
    })

    it('unlinkTransactionFromInvestment etiketi kaldırmalı ve grubu Kişisel yapmalıdır', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'tx-1', description: 'Hisse [INV:inv-1]', type: 'Transfer' }, error: null })
      
      const res = await bridge.unlinkTransactionFromInvestment({ userId: 'u1', transactionId: 'tx-1' })
      expect(res.success).toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ type: 'Harcama', analysis_group: 'Kişisel', description: 'Hisse' }))
    })
  })
})
