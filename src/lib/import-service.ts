import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementImport, Transaction, CreditCard, Account, Debt } from '../types/database'
import type { ExtractedTransaction, ParseResult } from './parser/types'
import { attachTransactionIdentities, IMPORT_PARSER_VERSION, type ImportIdentityContext } from './import-identity'
import { calculateFileHash } from './hash'

export type ImportBatchStatus = 'PROCESSING' | 'COMPLETED' | 'ROLLED_BACK' | 'FAILED'

export interface ImportBatchSnapshot {
  previous_card_state?: {
    card_id: string
    current_debt: number
    statement_debt: number
    minimum_payment: number
    interest_fees: number
    statement_date: string | null
    due_date: string | null
  }
  previous_account_state?: {
    account_id: string
    balance: number
  }
  created_account_id?: string
  created_card_id?: string
  created_subscription_ids?: string[]
  created_card_statement_id?: string
  created_transaction_ids?: string[]
  previous_debt_states?: Array<{
    debt_id: string
    remaining: number
    past_payments: number
    status: string
  }>
}

export interface ImportBatchMeta {
  file_hash?: string | null
  status: ImportBatchStatus
  import_type: 'credit_card' | 'bank_account'
  rolled_back_at?: string | null
  snapshot_data?: ImportBatchSnapshot
}

export interface EnrichedImportBatch extends Omit<StatementImport, 'snapshot_data'> {
  batch_status: ImportBatchStatus
  file_hash: string | null
  import_type: 'credit_card' | 'bank_account'
  rolled_back_at: string | null
  snapshot_data: ImportBatchSnapshot
  actual_tx_count: number
}

const VALID_ANALYSIS_GROUPS = ['Kişisel', 'İş', 'Finansman', 'Hariç'] as const
const VALID_TRANSACTION_TYPES = [
  'Harcama',
  'Kart Ödemesi',
  'Gelir',
  'Tahsilat',
  'Finansman/Masraf',
  'İade',
  'Borç Ödemesi',
  'Nakit Avans',
  'Transfer',
] as const

export function sanitizeAnalysisGroup(group: string | undefined): 'Kişisel' | 'İş' | 'Finansman' | 'Hariç' {
  if (group && (VALID_ANALYSIS_GROUPS as readonly string[]).includes(group)) {
    return group as 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
  }
  return 'Hariç'
}

export function sanitizeTransactionType(type: string | undefined, defaultType: string = 'Harcama'): any {
  if (type && (VALID_TRANSACTION_TYPES as readonly string[]).includes(type)) {
    return type
  }
  return defaultType
}

/**
 * Parses batch metadata from SQL columns or raw_text fallback.
 */
export function parseBatchMeta(rawTextOrRow: any, fallbackStatus: ImportBatchStatus = 'COMPLETED'): ImportBatchMeta {
  if (rawTextOrRow && typeof rawTextOrRow === 'object') {
    if ('status' in rawTextOrRow && rawTextOrRow.status) {
      return {
        status: rawTextOrRow.status || fallbackStatus,
        import_type: rawTextOrRow.import_type || 'credit_card',
        file_hash: rawTextOrRow.file_hash || null,
        rolled_back_at: rawTextOrRow.rolled_back_at || null,
        snapshot_data: rawTextOrRow.snapshot_data || {},
      }
    }
  }

  const rawText = typeof rawTextOrRow === 'string' ? rawTextOrRow : rawTextOrRow?.raw_text
  if (!rawText) {
    return {
      status: fallbackStatus,
      import_type: 'credit_card',
      file_hash: null,
      rolled_back_at: null,
      snapshot_data: {},
    }
  }

  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed === 'object' && ('status' in parsed || 'file_hash' in parsed)) {
      return {
        status: parsed.status || fallbackStatus,
        import_type: parsed.import_type || 'credit_card',
        file_hash: parsed.file_hash || null,
        rolled_back_at: parsed.rolled_back_at || null,
        snapshot_data: parsed.snapshot_data || {},
      }
    }
  } catch {
    // rawText is regular text, not JSON metadata
  }

  return {
    status: fallbackStatus,
    import_type: 'credit_card',
    file_hash: null,
    rolled_back_at: null,
    snapshot_data: {},
  }
}

/**
 * Serializes batch metadata into raw_text format for database persistence.
 */
export function serializeBatchMeta(meta: ImportBatchMeta): string {
  return JSON.stringify(meta)
}

/**
 * Checks whether an active (non rolled-back) import with the exact same file hash exists.
 */
export async function checkDuplicateFileHash(
  supabase: SupabaseClient,
  userId: string,
  fileHash: string
): Promise<{ isDuplicate: boolean; existingBatch?: StatementImport }> {
  if (!fileHash) return { isDuplicate: false }

  const { data: existingImports, error } = await supabase
    .from('statement_imports')
    .select('*')
    .eq('user_id', userId)

  if (error || !existingImports) return { isDuplicate: false }

  for (const imp of existingImports) {
    const meta = parseBatchMeta(imp.raw_text)
    if (meta.file_hash === fileHash && meta.status !== 'ROLLED_BACK') {
      return { isDuplicate: true, existingBatch: imp }
    }
  }

  return { isDuplicate: false }
}

export async function annotateDuplicateTransactions(
  supabase: SupabaseClient,
  userId: string,
  transactions: ExtractedTransaction[],
  context: ImportIdentityContext
): Promise<ExtractedTransaction[]> {
  const identified = await attachTransactionIdentities(transactions, context)

  let existingRows: Array<{ source_fingerprint?: string | null; weak_fingerprint?: string | null }> = []
  try {
    const { data, error } = await (supabase.from('transactions') as any)
      .select('source_fingerprint, weak_fingerprint')
      .eq('user_id', userId)
    if (!error && data) existingRows = data
  } catch {
    // A deployment may parse files before the safety migration is installed.
    // Identity is still attached; commit will fail closed if the atomic RPC is absent.
  }

  const strongSeen = new Set(existingRows.map((row) => row.source_fingerprint).filter(Boolean) as string[])
  const weakSeen = new Set(existingRows.map((row) => row.weak_fingerprint).filter(Boolean) as string[])

  return identified.map((transaction) => {
    const exactDuplicate = transaction.fingerprint_strength === 'strong'
      && Boolean(transaction.source_fingerprint)
      && strongSeen.has(transaction.source_fingerprint!)
    const possibleDuplicate = !exactDuplicate
      && Boolean(transaction.weak_fingerprint)
      && weakSeen.has(transaction.weak_fingerprint!)

    if (transaction.source_fingerprint && transaction.fingerprint_strength === 'strong') {
      strongSeen.add(transaction.source_fingerprint)
    }
    if (transaction.weak_fingerprint) weakSeen.add(transaction.weak_fingerprint)

    if (exactDuplicate) {
      return { ...transaction, duplicate_status: 'EXACT_DUPLICATE' as const, selected: false }
    }
    if (possibleDuplicate) {
      return { ...transaction, duplicate_status: 'POSSIBLE_DUPLICATE' as const, selected: false }
    }
    return { ...transaction, duplicate_status: 'NEW' as const }
  })
}

/**
 * Fetches all import batches for the user with enriched status, hash, and actual transaction counts.
 */
export async function fetchImportBatches(
  supabase: SupabaseClient,
  userId: string
): Promise<EnrichedImportBatch[]> {
  const { data: imports, error: impErr } = await supabase
    .from('statement_imports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (impErr || !imports) return []

  // Fetch actual transaction counts grouped by import_id
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('id, import_id')
    .eq('user_id', userId)

  const txCountMap = new Map<string, number>()
  if (!txErr && txs) {
    for (const t of txs) {
      if (t.import_id) {
        txCountMap.set(t.import_id, (txCountMap.get(t.import_id) || 0) + 1)
      }
    }
  }

  return imports.map((imp) => {
    const meta = parseBatchMeta(imp.raw_text)
    const actualCount = txCountMap.get(imp.id) || 0

    return {
      ...imp,
      batch_status: meta.status,
      file_hash: meta.file_hash || null,
      import_type: meta.import_type || 'credit_card',
      rolled_back_at: meta.rolled_back_at || null,
      snapshot_data: meta.snapshot_data || {},
      actual_tx_count: actualCount,
    }
  })
}

/**
 * Fetches transactions belonging to a specific import batch for drill-down inspection.
 */
export async function fetchTransactionsForBatch(
  supabase: SupabaseClient,
  userId: string,
  importId: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('import_id', importId)
    .order('date', { ascending: false })

  if (error || !data) return []
  return data
}

export interface RollbackResult {
  success: boolean
  error?: string
  importId: string
  deletedTransactions: number
  deletedStatements: number
}

/**
 * Atomically rolls back a statement import batch:
 * 1. Verifies ownership and non-rolled-back status.
 * 2. Reverts credit card balances / debts (if credit_card).
 * 3. Reverts account balance (if bank_account).
 * 4. Deletes card_statements created for this batch.
 * 5. Deletes auto-discovered subscriptions created during this batch.
 * 6. Deletes all transactions belonging to this batch.
 * 7. Marks batch status as ROLLED_BACK with rolled_back_at timestamp.
 */
export async function rollbackImportBatch(
  supabase: SupabaseClient,
  importId: string,
  userId: string
): Promise<RollbackResult> {
  try {
    const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('rollback_statement_import', {
      p_import_id: importId,
      p_user_id: userId,
    })

    if (rpcErr || !rpcRes) {
      return {
        success: false,
        error: rpcErr?.message || 'Atomik geri alma servisine ulaşılamadı; güvenlik için istemci tarafı telafi uygulanmadı.',
        importId,
        deletedTransactions: 0,
        deletedStatements: 0,
      }
    }
    if (!rpcRes.success) {
      return { success: false, error: rpcRes.error || 'Ekstre geri alınamadı.', importId, deletedTransactions: 0, deletedStatements: 0 }
    }
    return {
      success: true,
      importId,
      deletedTransactions: rpcRes.deleted_transactions || 0,
      deletedStatements: rpcRes.deleted_statements || 0,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Atomik geri alma servisine ulaşılamadı.',
      importId,
      deletedTransactions: 0,
      deletedStatements: 0,
    }
  }
}

/**
 * Permanently deletes a statement import record from statement_imports.
 */
export async function deleteImportBatchPermanently(
  supabase: SupabaseClient,
  importId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Clean up any remaining transactions first
  const { error: childDeleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('import_id', importId)
    .eq('user_id', userId)

  if (childDeleteError) {
    return { success: false, error: `İçe aktarılan hareketler silinemedi: ${childDeleteError.message}` }
  }

  const { error } = await supabase
    .from('statement_imports')
    .delete()
    .eq('id', importId)
    .eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Sorts statement batches chronologically ascending by statement_date.
 * Undated statements appear first so that newer statements applied later take precedence.
 */
export function sortStatementsChronologically<T extends { parseResult?: { statement_date?: string | null } | null; statement_date?: string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const dateA = a.parseResult?.statement_date || a.statement_date || null
    const dateB = b.parseResult?.statement_date || b.statement_date || null

    if (!dateA && !dateB) return 0
    if (!dateA) return -1
    if (!dateB) return 1

    const timeA = new Date(dateA).getTime()
    const timeB = new Date(dateB).getTime()

    if (isNaN(timeA) || isNaN(timeB)) return 0
    return timeA - timeB
  })
}

export interface CommitStatementBatchParams {
  supabase: SupabaseClient
  userId: string
  fileName: string
  fileHash: string | null
  importType: 'credit_card' | 'bank_account'
  parseResult?: ParseResult | null
  transactions: ExtractedTransaction[]
  selectedCardId?: string
  selectedAccountId?: string
  cards: CreditCard[]
  accounts: Account[]
  debts: Debt[]
}

export interface CommitStatementBatchResult {
  success: boolean
  importId?: string
  error?: string
  insertedTransactionsCount?: number
  createdSubscriptionCount?: number
  skippedDuplicatesCount?: number
  alreadyCommitted?: boolean
}

async function commitStatementBatchAtomic(
  params: CommitStatementBatchParams
): Promise<CommitStatementBatchResult> {
  const selectedTxs = params.transactions.filter((transaction) => transaction.selected !== false)
  if (selectedTxs.length === 0) {
    return { success: false, error: 'Kaydedilecek seçili hareket bulunamadı.' }
  }

  const sourceAccountRef = params.parseResult?.source_account_ref
    || params.parseResult?.last_four
    || params.parseResult?.detected_bank
    || 'unknown-source'
  const identified = await attachTransactionIdentities(selectedTxs, {
    sourceBank: params.parseResult?.detected_bank,
    sourceAccountRef,
  })
  const idempotencySeed = params.fileHash
    || identified.map((transaction) => transaction.source_fingerprint).sort().join('|')
  const idempotencyKey = await calculateFileHash(
    `${params.userId}|${params.importType}|${params.fileName}|${idempotencySeed}`
  )

  const payload = {
    user_id: params.userId,
    idempotency_key: idempotencyKey,
    parser_version: IMPORT_PARSER_VERSION,
    file_name: params.fileName,
    file_hash: params.fileHash,
    import_type: params.importType,
    bank: params.parseResult?.detected_bank || 'Banka Dökümü',
    card_name: params.parseResult?.detected_card || null,
    last_four: params.parseResult?.last_four || null,
    card_id: params.selectedCardId || null,
    account_id: params.selectedAccountId || null,
    source_account_ref: sourceAccountRef,
    statement_date: params.parseResult?.statement_date || null,
    due_date: params.parseResult?.due_date || null,
    statement_debt: params.parseResult?.statement_debt ?? null,
    minimum_payment: params.parseResult?.minimum_payment ?? null,
    interest_fees: params.parseResult?.interest_fees ?? null,
    closing_balance: params.parseResult?.closing_balance ?? null,
    transactions: identified.map((transaction, index) => ({
      row_index: index,
      date: transaction.date,
      direction: transaction.direction || (transaction.type === 'Gelir' ? 'inflow' : 'outflow'),
      type: sanitizeTransactionType(transaction.type, transaction.direction === 'inflow' ? 'Gelir' : 'Harcama'),
      description: transaction.raw_description,
      merchant: transaction.merchant,
      amount: transaction.amount,
      analysis_group: sanitizeAnalysisGroup(transaction.analysis_group),
      recurrence: transaction.recurrence || null,
      project_id: transaction.project_id || null,
      action: transaction.action || null,
      target_card_id: transaction.target_card_id || null,
      target_debt_id: transaction.target_debt_id || null,
      classification_status: transaction.classification_status || 'UNKNOWN',
      confidence: transaction.confidence,
      classification_reasons: transaction.classification_reasons || [],
      external_reference: transaction.external_reference || null,
      balance_after: transaction.balance_after ?? null,
      source_fingerprint: transaction.source_fingerprint,
      weak_fingerprint: transaction.weak_fingerprint,
      fingerprint_strength: transaction.fingerprint_strength,
      duplicate_status: transaction.duplicate_status || 'NEW',
    })),
  }

  try {
    const { data, error } = await (params.supabase.rpc as any)('fn_commit_statement_import_atomic', {
      p_payload: payload,
    })
    if (error || !data) {
      return {
        success: false,
        error: error?.message || 'Atomik import servisi yanıt vermedi. Güvenlik için hiçbir istemci tarafı fallback uygulanmadı.',
      }
    }
    if (!data.success) return { success: false, error: data.error || 'Import tamamlanamadı.' }
    return {
      success: true,
      importId: data.import_id,
      insertedTransactionsCount: data.inserted_transactions || 0,
      skippedDuplicatesCount: data.skipped_duplicates || 0,
      alreadyCommitted: Boolean(data.already_committed),
      createdSubscriptionCount: 0,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Atomik import servisine ulaşılamadı.',
    }
  }
}

/**
 * Commits a single statement batch to Supabase atomically.
 * Captures previous state snapshots for rollback and cleans up on failure.
 */
export async function commitStatementBatch(
  params: CommitStatementBatchParams
): Promise<CommitStatementBatchResult> {
  return commitStatementBatchAtomic(params)
}
