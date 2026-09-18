import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeAnalysisGroup,
  sanitizeTransactionType,
  parseBatchMeta,
  serializeBatchMeta,
  checkDuplicateFileHash,
  fetchImportBatches,
  rollbackImportBatch,
  deleteImportBatchPermanently,
  sortStatementsChronologically,
  commitStatementBatch
} from '@/lib/import-service'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockSingle: any = vi.fn()
const mockEq: any = vi.fn(() => ({
  single: mockSingle,
  eq: mockEq,
  order: mockOrder,
}))
const mockOrder: any = vi.fn(() => ({
  eq: mockEq,
}))
const mockSelect: any = vi.fn(() => ({
  eq: mockEq,
  single: mockSingle,
  order: mockOrder,
}))
const mockInsert: any = vi.fn(() => ({
  select: mockSelect,
  single: mockSingle,
}))
const mockUpdate: any = vi.fn(() => ({
  eq: mockEq,
}))
const mockDelete: any = vi.fn(() => ({
  eq: mockEq,
  match: mockMatch,
  in: mockIn,
}))
const mockMatch: any = vi.fn()
const mockIn: any = vi.fn(() => ({
  eq: mockEq,
}))

const mockFrom: any = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}))

const mockRpc = vi.fn()

const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc,
} as unknown as SupabaseClient

describe('Import Service Testleri', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Sanitization (Temizleme)', () => {
    it('sanitizeAnalysisGroup geçerli grubu kabul etmelidir', () => {
      expect(sanitizeAnalysisGroup('Finansman')).toBe('Finansman')
    })

    it('sanitizeAnalysisGroup geçersiz grup için Hariç dönmelidir (fallback)', () => {
      expect(sanitizeAnalysisGroup('Gecersiz')).toBe('Hariç')
    })

    it('sanitizeTransactionType geçerli tipi kabul etmelidir', () => {
      expect(sanitizeTransactionType('Transfer')).toBe('Transfer')
    })

    it('sanitizeTransactionType geçersiz tip için varsayılan değeri dönmelidir', () => {
      expect(sanitizeTransactionType('Bilinmeyen', 'Harcama')).toBe('Harcama')
    })
  })

  describe('Batch Metadata (Toplu İşlem Metadatası)', () => {
    it('parseBatchMeta ve serializeBatchMeta round-trip çalışmalıdır', () => {
      const meta = {
        status: 'COMPLETED' as const,
        import_type: 'credit_card' as const,
        file_hash: 'abc123hash',
        snapshot_data: {},
      }
      const rawText = serializeBatchMeta(meta)
      const parsed = parseBatchMeta(rawText)
      
      expect(parsed.status).toBe('COMPLETED')
      expect(parsed.file_hash).toBe('abc123hash')
      expect(parsed.import_type).toBe('credit_card')
    })

    it('parseBatchMeta null raw_text için fallback değerler dönmelidir', () => {
      const parsed = parseBatchMeta(null, 'FAILED')
      expect(parsed.status).toBe('FAILED')
      expect(parsed.file_hash).toBeNull()
    })
  })

  describe('Duplicate Hash Kontrolü', () => {
    it('Aktif ve aynı hash mevcutsa duplicate dönmelidir', async () => {
      // Mock db response
      mockEq.mockResolvedValueOnce({ data: [{ raw_text: JSON.stringify({ file_hash: 'hash123', status: 'COMPLETED' }) }], error: null })
      
      const res = await checkDuplicateFileHash(mockSupabase, 'user1', 'hash123')
      expect(res.isDuplicate).toBe(true)
      expect(res.existingBatch).toBeDefined()
    })

    it('Aynı hash mevcut ama ROLLED_BACK durumunda ise duplicate dönmemelidir', async () => {
      mockEq.mockResolvedValueOnce({ data: [{ raw_text: JSON.stringify({ file_hash: 'hash123', status: 'ROLLED_BACK' }) }], error: null })
      
      const res = await checkDuplicateFileHash(mockSupabase, 'user1', 'hash123')
      expect(res.isDuplicate).toBe(false)
    })
  })

  describe('Geri Alma İşlemleri (Rollback)', () => {
    it('Atomik servis yoksa istemci tarafı geri almaya düşmemelidir', async () => {
      mockRpc.mockRejectedValueOnce(new Error('no rpc'))
      
      const res = await rollbackImportBatch(mockSupabase, 'import1', 'user1')
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/no rpc/)
      expect(mockFrom).not.toHaveBeenCalled()
    })

    it('RPC tarafından bildirilen yetkisiz/bulunamayan kaydı reddetmelidir', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: false, error: 'Ekstre bulunamadı.' }, error: null })
      
      const res = await rollbackImportBatch(mockSupabase, 'import1', 'user1')
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/bulunamadı/)
    })

    it('Ekstreyi geri alırken kart bakiyesini (snapshot kullanarak) onarmalı ve işlemleri silmelidir', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, deleted_transactions: 10, deleted_statements: 1 }, error: null })
      
      const res = await rollbackImportBatch(mockSupabase, 'import1', 'user1')
      expect(res.success).toBe(true)
      expect(res.deletedTransactions).toBe(10)
      expect(res.deletedStatements).toBe(1)
    })
  })

  describe('Sıralama (Sorting)', () => {
    it('sortStatementsChronologically tarih sırasına göre sıralamalıdır', () => {
      const arr = [
        { statement_date: '2026-02-01' },
        { statement_date: '2026-01-01' },
      ]
      const sorted = sortStatementsChronologically(arr)
      expect(sorted[0].statement_date).toBe('2026-01-01')
      expect(sorted[1].statement_date).toBe('2026-02-01')
    })

    it('Tarihsiz ekstreleri başa almalıdır', () => {
      const arr = [
        { statement_date: '2026-01-01' },
        { statement_date: null },
      ]
      const sorted = sortStatementsChronologically(arr)
      expect(sorted[0].statement_date).toBeNull()
      expect(sorted[1].statement_date).toBe('2026-01-01')
    })
  })

  describe('Toplu İşlem Kaydı (Commit)', () => {
    it('Seçili işlem yoksa hata dönmelidir', async () => {
      const res = await commitStatementBatch({
        supabase: mockSupabase,
        userId: 'u1',
        fileName: 'test.pdf',
        fileHash: null,
        importType: 'credit_card',
        transactions: [], // boş
        cards: [],
        accounts: [],
        debts: [],
      })
      
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/seçili hareket bulunamadı/)
    })

    it('Ekstreyi tek atomik RPC ile kaydedebilmelidir', async () => {
      const mockCard = { id: 'c1', current_debt: 100, bank: 'Test Bank' }
      mockRpc.mockResolvedValueOnce({
        data: { success: true, import_id: 'imp-1', inserted_transactions: 1, skipped_duplicates: 0 },
        error: null,
      })
      
      const res = await commitStatementBatch({
        supabase: mockSupabase,
        userId: 'u1',
        fileName: 'test.pdf',
        fileHash: 'hash1',
        importType: 'credit_card',
        transactions: [
          { id: '1', date: '2026-01-01', raw_description: 'Test', merchant: 'Test', amount: 50, type: 'Harcama', analysis_group: 'Kişisel', confidence: 'high', selected: true }
        ],
        selectedCardId: 'c1',
        cards: [mockCard as any],
        accounts: [],
        debts: [],
      })
      
      expect(res.success).toBe(true)
      expect(res.importId).toBe('imp-1')
      expect(mockRpc).toHaveBeenCalledTimes(1)
      expect(mockRpc).toHaveBeenCalledWith('fn_commit_statement_import_atomic', expect.objectContaining({
        p_payload: expect.objectContaining({ card_id: 'c1', import_type: 'credit_card' }),
      }))
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('Batches Listeleme ve Silme', () => {
    it('fetchImportBatches zenginleştirilmiş (enriched) liste dönmelidir', async () => {
      const mockImportsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'imp-1', raw_text: JSON.stringify({ status: 'COMPLETED' }) }],
          error: null
        })
      }
      const mockTxsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'tx1', import_id: 'imp-1' }, { id: 'tx2', import_id: 'imp-1' }],
          error: null
        })
      }
      mockFrom.mockImplementation((table: string) => {
        if (table === 'statement_imports') return mockImportsQuery as any
        if (table === 'transactions') return mockTxsQuery as any
        return {} as any
      })

      const batches = await fetchImportBatches(mockSupabase, 'u1')
      expect(batches.length).toBe(1)
      expect(batches[0].batch_status).toBe('COMPLETED')
      expect(batches[0].actual_tx_count).toBe(2)
    })

    it('deleteImportBatchPermanently kayıtları kaldırmalıdır', async () => {
      const mockDeleteQuery: any = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        error: null,
      }
      mockDeleteQuery.eq.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockFrom.mockReturnValue(mockDeleteQuery)

      const res = await deleteImportBatchPermanently(mockSupabase, 'imp-1', 'u1')
      expect(res.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('transactions')
      expect(mockFrom).toHaveBeenCalledWith('statement_imports')
    })

    it('child transaction delete başarısızsa parent import kaydını silmemelidir', async () => {
      const transactionQuery: any = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      transactionQuery.eq
        .mockReturnValueOnce(transactionQuery)
        .mockResolvedValueOnce({ error: { message: 'child delete denied' } })
      const importQuery = { delete: vi.fn() }
      mockFrom.mockImplementation((table: string) => table === 'transactions' ? transactionQuery : importQuery as any)

      const res = await deleteImportBatchPermanently(mockSupabase, 'imp-1', 'u1')

      expect(res).toEqual({ success: false, error: 'İçe aktarılan hareketler silinemedi: child delete denied' })
      expect(mockFrom).not.toHaveBeenCalledWith('statement_imports')
      expect(importQuery.delete).not.toHaveBeenCalled()
    })
  })
})
