import { describe, it, expect, vi } from 'vitest'
import { calculateFileHash } from '../src/lib/hash'
import {
  parseBatchMeta,
  serializeBatchMeta,
  checkDuplicateFileHash,
  rollbackImportBatch,
  sortStatementsChronologically,
  commitStatementBatch,
  type ImportBatchMeta,
  type ImportBatchSnapshot,
} from '../src/lib/import-service'

describe('Pusula — Ekstre Import History & Atomic Rollback Tests', () => {
  describe('1. File Hash Calculation (Deterministic SHA-256)', () => {
    it('generates exact deterministic hash for identical content', async () => {
      const content = 'Ziraat Bankasi Hesap Ozeti 20.08.2026'
      const hash1 = await calculateFileHash(content)
      const hash2 = await calculateFileHash(content)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('generates completely different hashes for slightly modified content', async () => {
      const contentA = 'Ziraat Bankasi Hesap Ozeti 20.08.2026'
      const contentB = 'Ziraat Bankasi Hesap Ozeti 21.08.2026'

      const hashA = await calculateFileHash(contentA)
      const hashB = await calculateFileHash(contentB)

      expect(hashA).not.toBe(hashB)
    })
  })

  describe('2. Metadata Serialization and Parsing', () => {
    it('correctly serializes and parses full batch metadata with snapshot', () => {
      const originalMeta: ImportBatchMeta = {
        file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'COMPLETED',
        import_type: 'credit_card',
        rolled_back_at: null,
        snapshot_data: {
          previous_card_state: {
            card_id: 'card-123',
            current_debt: 15400.5,
            statement_debt: 15400.5,
            minimum_payment: 3080.1,
            interest_fees: 0,
            statement_date: '2026-07-20',
            due_date: '2026-07-30',
          },
          created_subscription_ids: ['sub-1', 'sub-2'],
        },
      }

      const serialized = serializeBatchMeta(originalMeta)
      const parsed = parseBatchMeta(serialized)

      expect(parsed.status).toBe('COMPLETED')
      expect(parsed.file_hash).toBe(originalMeta.file_hash)
      expect(parsed.import_type).toBe('credit_card')
      expect(parsed.snapshot_data?.previous_card_state?.current_debt).toBe(15400.5)
      expect(parsed.snapshot_data?.created_subscription_ids).toEqual(['sub-1', 'sub-2'])
    })

    it('falls back gracefully when raw_text is null or not JSON', () => {
      const parsedNull = parseBatchMeta(null)
      expect(parsedNull.status).toBe('COMPLETED')
      expect(parsedNull.file_hash).toBeNull()

      const parsedInvalid = parseBatchMeta('Just a legacy plain text comment')
      expect(parsedInvalid.status).toBe('COMPLETED')
      expect(parsedInvalid.file_hash).toBeNull()
    })
  })

  describe('3. Duplicate Import Detection via Hash', () => {
    it('flags duplicate when an active batch matches the exact file hash', async () => {
      const targetHash = 'hash-abc-123'
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'batch-1',
                  file_name: 'Ziraat_Agustos.pdf',
                  raw_text: JSON.stringify({
                    file_hash: targetHash,
                    status: 'COMPLETED',
                  }),
                },
              ],
              error: null,
            }),
          }),
        }),
      } as any

      const result = await checkDuplicateFileHash(mockSupabase, 'user-1', targetHash)
      expect(result.isDuplicate).toBe(true)
      expect(result.existingBatch?.id).toBe('batch-1')
    })

    it('does NOT flag duplicate if the matching batch was already ROLLED_BACK', async () => {
      const targetHash = 'hash-abc-123'
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'batch-1',
                  file_name: 'Ziraat_Agustos.pdf',
                  raw_text: JSON.stringify({
                    file_hash: targetHash,
                    status: 'ROLLED_BACK',
                  }),
                },
              ],
              error: null,
            }),
          }),
        }),
      } as any

      const result = await checkDuplicateFileHash(mockSupabase, 'user-1', targetHash)
      expect(result.isDuplicate).toBe(false)
    })
  })

  describe('4. Atomic Rollback Execution', () => {
    it('reverts card debt, deletes batch transactions, and marks status as ROLLED_BACK', async () => {
      const batchId = 'batch-to-rollback'
      const userId = 'user-owner'

      const existingImport = {
        id: batchId,
        user_id: userId,
        file_name: 'Ziraat_Ekstre.pdf',
        card_id: 'card-1',
        statement_date: '2026-08-20',
        raw_text: JSON.stringify({
          status: 'COMPLETED',
          file_hash: 'hash-xyz',
          snapshot_data: {
            previous_card_state: {
              card_id: 'card-1',
              current_debt: 5000,
              statement_debt: 5000,
              minimum_payment: 1000,
              interest_fees: 0,
              statement_date: '2026-07-20',
              due_date: '2026-07-30',
            },
            created_subscription_ids: ['sub-new-1'],
          },
        }),
      }

      const updatedTables: Record<string, any[]> = {
        credit_cards: [],
        card_statements: [],
        subscriptions: [],
        transactions: [],
        statement_imports: [],
      }

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'statement_imports') {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => ({
                    single: async () => ({ data: existingImport, error: null }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => {
                    updatedTables.statement_imports.push(payload)
                    return { error: null }
                  },
                }),
              }),
            }
          }

          if (table === 'credit_cards') {
            return {
              update: (payload: any) => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => {
                    updatedTables.credit_cards.push(payload)
                    return { error: null }
                  },
                }),
              }),
            }
          }

          if (table === 'card_statements') {
            return {
              delete: () => ({
                match: (conditions: any) => {
                  updatedTables.card_statements.push(conditions)
                  return { count: 1, error: null }
                },
              }),
            }
          }

          if (table === 'subscriptions') {
            return {
              delete: () => ({
                in: (col: string, ids: string[]) => ({
                  eq: (userCol: string, uId: string) => {
                    updatedTables.subscriptions.push(ids)
                    return { error: null }
                  },
                }),
              }),
            }
          }

          if (table === 'transactions') {
            return {
              delete: () => ({
                eq: (col1: string, importIdVal: string) => ({
                  eq: (col2: string, userIdVal: string) => {
                    updatedTables.transactions.push({ importIdVal, userIdVal })
                    return { count: 62, error: null }
                  },
                }),
              }),
            }
          }

          return {}
        },
      } as any

      const result = await rollbackImportBatch(mockSupabase, batchId, userId)

      expect(result.success).toBe(true)
      expect(result.deletedTransactions).toBe(62)
      expect(result.deletedStatements).toBe(1)

      // Reverted credit card to previous snapshot
      expect(updatedTables.credit_cards[0]?.current_debt).toBe(5000)
      expect(updatedTables.credit_cards[0]?.statement_date).toBe('2026-07-20')

      // Deleted auto-discovered subscription
      expect(updatedTables.subscriptions[0]).toEqual(['sub-new-1'])

      // Deleted transactions matching batch id
      expect(updatedTables.transactions[0]).toEqual({
        importIdVal: batchId,
        userIdVal: userId,
      })

      // Batch status updated to ROLLED_BACK
      const savedMeta = JSON.parse(updatedTables.statement_imports[0]?.raw_text)
      expect(savedMeta.status).toBe('ROLLED_BACK')
      expect(savedMeta.rolled_back_at).toBeDefined()
    })

    it('rejects duplicate rollback when batch is already ROLLED_BACK', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'batch-already-rolled',
                    user_id: 'user-1',
                    raw_text: JSON.stringify({ status: 'ROLLED_BACK' }),
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any

      const result = await rollbackImportBatch(mockSupabase, 'batch-already-rolled', 'user-1')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Bu ekstre daha önce geri alınmış')
    })

    it('rejects unauthorized rollback when user is not the owner', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'Row not found' },
                }),
              }),
            }),
          }),
        }),
      } as any

      const result = await rollbackImportBatch(mockSupabase, 'batch-1', 'intruder-user')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Ekstre kaydı bulunamadı veya yetkisiz erişim')
    })
  })

  describe('5. Bulk Statement Chronological Sorting', () => {
    it('sorts multiple statements ascending by statement_date so newest executes last', () => {
      const statements = [
        { id: 'stmt-aug', parseResult: { statement_date: '2026-08-20' } },
        { id: 'stmt-jun', parseResult: { statement_date: '2026-06-15' } },
        { id: 'stmt-jul', parseResult: { statement_date: '2026-07-18' } },
      ]

      const sorted = sortStatementsChronologically(statements)
      expect(sorted.map((s) => s.id)).toEqual(['stmt-jun', 'stmt-jul', 'stmt-aug'])
    })

    it('places undated statements before dated ones so dated ones take precedence', () => {
      const statements = [
        { id: 'stmt-dated', parseResult: { statement_date: '2026-08-20' } },
        { id: 'stmt-undated', parseResult: { statement_date: null } },
      ]

      const sorted = sortStatementsChronologically(statements)
      expect(sorted[0].id).toBe('stmt-undated')
      expect(sorted[1].id).toBe('stmt-dated')
    })
  })

  describe('6. Reusable commitStatementBatch Execution', () => {
    it('commits a statement batch and captures card snapshot', async () => {
      const insertedRows: Record<string, any[]> = {
        statement_imports: [],
        transactions: [],
        card_statements: [],
        subscriptions: [],
      }

      const mockSupabase = {
        from: (tableName: string) => ({
          select: (cols?: string) => ({
            single: async () => ({
              data: { id: 'new-batch-id', file_name: 'test.pdf' },
              error: null,
            }),
            data: [],
          }),
          insert: (data: any) => ({
            select: () => ({
              single: async () => {
                const row = { id: 'created-' + tableName + '-id', ...(Array.isArray(data) ? data[0] : data) }
                if (!insertedRows[tableName]) insertedRows[tableName] = []
                insertedRows[tableName].push(row)
                return { data: row, error: null }
              },
            }),
            then: (resolve: any) => {
              if (!insertedRows[tableName]) insertedRows[tableName] = []
              if (Array.isArray(data)) {
                insertedRows[tableName].push(...data)
              } else {
                insertedRows[tableName].push(data)
              }
              return resolve({ data, error: null })
            },
          }),
          update: (data: any) => ({
            eq: () => ({
              then: (resolve: any) => resolve({ data, error: null }),
            }),
          }),
        }),
      } as any

      const result = await commitStatementBatch({
        supabase: mockSupabase,
        userId: 'user-test-1',
        fileName: 'Enpara_Agustos_2026.pdf',
        fileHash: 'sha256-enpara-hash',
        importType: 'credit_card',
        parseResult: {
          success: true,
          file_name: 'Enpara_Agustos_2026.pdf',
          import_type: 'credit_card',
          detected_bank: 'Enpara',
          detected_card: 'Enpara Kredi Kartı',
          statement_date: '2026-08-25',
          statement_debt: 12500,
          minimum_payment: 2500,
          transactions: [],
        },
        transactions: [
          {
            id: 'tx-1',
            date: '2026-08-10',
            raw_description: 'Amazon AWS Cloud',
            merchant: 'AWS',
            amount: 1500,
            type: 'Harcama',
            analysis_group: 'İş',
            confidence: 'high',
            selected: true,
          },
        ],
        cards: [
          {
            id: 'card-enpara-1',
            user_id: 'user-test-1',
            bank: 'Enpara',
            card_name: 'Enpara Kredi Kartı',
            current_debt: 8000,
            statement_debt: 8000,
            statement_date: '2026-07-25',
          } as any,
        ],
        accounts: [],
        debts: [],
      })

      expect(result.success).toBe(true)
      expect(result.insertedTransactionsCount).toBe(1)
      expect(insertedRows.transactions.length).toBe(1)
      expect(insertedRows.transactions[0].merchant).toBe('AWS')
      expect(insertedRows.statement_imports.length).toBe(1)
      expect(insertedRows.statement_imports[0].raw_text).toContain('sha256-enpara-hash')
    })
  })
})

