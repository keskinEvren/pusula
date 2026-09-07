import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementImport, Transaction, CreditCard, Account, Debt } from '../types/database'
import type { ExtractedTransaction, ParseResult } from './parser/types'
import { calculateStatementChange } from './finance-engine'

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
  created_subscription_ids?: string[]
  created_card_statement_id?: string
  created_transaction_ids?: string[]
}

export interface ImportBatchMeta {
  file_hash?: string | null
  status: ImportBatchStatus
  import_type: 'credit_card' | 'bank_account'
  rolled_back_at?: string | null
  snapshot_data?: ImportBatchSnapshot
}

export interface EnrichedImportBatch extends StatementImport {
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
 * Parses batch metadata from raw_text column or fallback values.
 */
export function parseBatchMeta(rawText: string | null, fallbackStatus: ImportBatchStatus = 'COMPLETED'): ImportBatchMeta {
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
  // 1. Fetch import batch
  const { data: imp, error: impError } = await supabase
    .from('statement_imports')
    .select('*')
    .eq('id', importId)
    .eq('user_id', userId)
    .single()

  if (impError || !imp) {
    return {
      success: false,
      error: 'Ekstre kaydı bulunamadı veya yetkisiz erişim.',
      importId,
      deletedTransactions: 0,
      deletedStatements: 0,
    }
  }

  const meta = parseBatchMeta(imp.raw_text)
  if (meta.status === 'ROLLED_BACK') {
    return {
      success: false,
      error: 'Bu ekstre daha önce geri alınmış.',
      importId,
      deletedTransactions: 0,
      deletedStatements: 0,
    }
  }

  const snapshot = meta.snapshot_data || {}
  let deletedStatements = 0

  // 2. Revert Credit Card state if snapshot exists
  if (imp.card_id) {
    if (snapshot.previous_card_state) {
      const prev = snapshot.previous_card_state
      await supabase
        .from('credit_cards')
        .update({
          current_debt: prev.current_debt,
          statement_debt: prev.statement_debt,
          minimum_payment: prev.minimum_payment,
          interest_fees: prev.interest_fees,
          statement_date: prev.statement_date,
          due_date: prev.due_date,
        })
        .eq('id', imp.card_id)
        .eq('user_id', userId)
    }

    // Delete associated card_statements
    const { count } = await supabase
      .from('card_statements')
      .delete({ count: 'exact' })
      .match({ card_id: imp.card_id, statement_date: imp.statement_date })

    deletedStatements = count || 0
  }

  // 3. Revert Bank Account balance if snapshot exists
  if (snapshot.previous_account_state) {
    const prevAcc = snapshot.previous_account_state
    await supabase
      .from('accounts')
      .update({ balance: prevAcc.balance })
      .eq('id', prevAcc.account_id)
      .eq('user_id', userId)
  }

  // 4. Delete auto-discovered subscriptions created during this import
  if (snapshot.created_subscription_ids && snapshot.created_subscription_ids.length > 0) {
    await supabase
      .from('subscriptions')
      .delete()
      .in('id', snapshot.created_subscription_ids)
      .eq('user_id', userId)
  }

  // 5. Delete all transactions belonging to this import
  const { count: deletedTxs, error: delErr } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('import_id', importId)
    .eq('user_id', userId)

  if (delErr) {
    return {
      success: false,
      error: 'Hareketler silinirken hata oluştu: ' + delErr.message,
      importId,
      deletedTransactions: 0,
      deletedStatements,
    }
  }

  // 6. Update statement_imports status to ROLLED_BACK
  const updatedMeta: ImportBatchMeta = {
    ...meta,
    status: 'ROLLED_BACK',
    rolled_back_at: new Date().toISOString(),
  }

  await supabase
    .from('statement_imports')
    .update({
      raw_text: serializeBatchMeta(updatedMeta),
    })
    .eq('id', importId)
    .eq('user_id', userId)

  return {
    success: true,
    importId,
    deletedTransactions: deletedTxs || 0,
    deletedStatements,
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
  await supabase.from('transactions').delete().eq('import_id', importId).eq('user_id', userId)

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
}

/**
 * Commits a single statement batch to Supabase atomically.
 * Captures previous state snapshots for rollback and cleans up on failure.
 */
export async function commitStatementBatch(
  params: CommitStatementBatchParams
): Promise<CommitStatementBatchResult> {
  const {
    supabase,
    userId,
    fileName,
    fileHash,
    importType,
    parseResult,
    transactions,
    selectedCardId,
    selectedAccountId,
    cards,
    accounts,
    debts,
  } = params

  const selectedTxs = transactions.filter((t) => t.selected !== false)
  if (selectedTxs.length === 0) {
    return { success: false, error: 'Kaydedilecek seçili hareket bulunamadı.' }
  }

  let createdImportId: string | null = null
  const snapshotData: ImportBatchSnapshot = {}

  try {
    const totalSelectedAmount = selectedTxs.reduce((sum, t) => sum + t.amount, 0)
    const detectedBankName = parseResult?.detected_bank || 'Banka Dökümü'
    const detectedCardTitle = parseResult?.detected_card || 'Kredi Kartı'

    // Always fetch latest cards from database to prevent stale in-memory data
    let dbLatestCards: CreditCard[] | null = null
    try {
      const query = supabase.from('credit_cards').select('*')
      if (typeof query?.eq === 'function') {
        const { data } = await query.eq('user_id', userId)
        dbLatestCards = data
      }
    } catch {
      // Graceful fallback to passed cards array
    }

    const activeCards: CreditCard[] =
      dbLatestCards && dbLatestCards.length > 0 ? dbLatestCards : cards

    // =======================================================================
    // MOD A: KREDİ KARTI EKSTRESİ
    // =======================================================================
    if (importType === 'credit_card') {
      let resolvedCardId = selectedCardId
      const statementDebtValue = parseResult?.statement_debt ?? totalSelectedAmount
      const minPaymentValue = parseResult?.minimum_payment ?? Math.round(statementDebtValue * 0.2)
      const interestFeesValue = parseResult?.interest_fees ?? 0

      // Match target card (prioritize last_four if available)
      let targetCard = activeCards.find(
        (c) =>
          (resolvedCardId && c.id === resolvedCardId) ||
          (!resolvedCardId &&
            parseResult?.last_four &&
            (c.last_four === parseResult.last_four || c.card_name?.includes(parseResult.last_four)))
      )

      if (!targetCard && !resolvedCardId && !parseResult?.last_four) {
        targetCard = activeCards.find(
          (c) =>
            c.bank.toLowerCase().includes(detectedBankName.toLowerCase()) ||
            detectedBankName.toLowerCase().includes(c.bank.toLowerCase())
        )
      }

      // Capture previous card state for atomic rollback
      if (targetCard) {
        snapshotData.previous_card_state = {
          card_id: targetCard.id,
          current_debt: Number(targetCard.current_debt || 0),
          statement_debt: Number(targetCard.statement_debt || 0),
          minimum_payment: Number(targetCard.minimum_payment || 0),
          interest_fees: Number(targetCard.interest_fees || 0),
          statement_date: targetCard.statement_date || null,
          due_date: targetCard.due_date || null,
        }
      }

      if (!resolvedCardId) {
        // Query DB directly in case a previous batch created or has this card
        if (parseResult?.last_four) {
          const { data: dbCards } = await supabase
            .from('credit_cards')
            .select('*')
            .eq('user_id', userId)
            .eq('last_four', parseResult.last_four)

          const found = dbCards?.[0]
          if (found) {
            targetCard = found
            resolvedCardId = found.id
          }
        }

        // Only fallback to bank name if the statement did NOT have a specific card number
        if (!resolvedCardId && !targetCard && !parseResult?.last_four) {
          const { data: dbCards } = await supabase
            .from('credit_cards')
            .select('*')
            .eq('user_id', userId)
            .ilike('bank', `%${detectedBankName}%`)

          const found = dbCards?.[0]
          if (found) {
            targetCard = found
            resolvedCardId = found.id
          }
        }

        if (targetCard) {
          resolvedCardId = targetCard.id
          const isNewerStatement =
            !targetCard.statement_date ||
            (parseResult?.statement_date &&
              new Date(parseResult.statement_date) >= new Date(targetCard.statement_date))

          if (isNewerStatement) {
            targetCard.current_debt = statementDebtValue
            targetCard.statement_debt = statementDebtValue
            targetCard.minimum_payment = minPaymentValue
            targetCard.interest_fees = interestFeesValue
            targetCard.statement_date = parseResult?.statement_date || null
            targetCard.due_date = parseResult?.due_date || null

            const updatePayload: any = {
              current_debt: statementDebtValue,
              statement_debt: statementDebtValue,
              minimum_payment: minPaymentValue,
              interest_fees: interestFeesValue,
              statement_date: parseResult?.statement_date || null,
              due_date: parseResult?.due_date || null,
            }

            if (targetCard.bank === 'Diğer Banka' && detectedBankName !== 'Diğer Banka') {
              updatePayload.bank = detectedBankName
              updatePayload.card_name = detectedCardTitle
              targetCard.bank = detectedBankName
              targetCard.card_name = detectedCardTitle
            }

            await supabase
              .from('credit_cards')
              .update(updatePayload)
              .eq('id', targetCard.id)
          }
        } else {
          const { data: newCard, error: newCardErr } = await supabase
            .from('credit_cards')
            .insert({
              user_id: userId,
              bank: detectedBankName,
              card_name: detectedCardTitle,
              last_four: parseResult?.last_four || null,
              current_debt: statementDebtValue,
              statement_debt: statementDebtValue,
              minimum_payment: minPaymentValue,
              interest_fees: interestFeesValue,
              statement_date: parseResult?.statement_date || null,
              due_date: parseResult?.due_date || null,
            })
            .select()
            .single()

          if (newCardErr) throw newCardErr
          if (newCard) {
            resolvedCardId = newCard.id
            cards.push(newCard)
            activeCards.push(newCard)
          }
        }
      } else {
        const matchedCard = activeCards.find((c) => c.id === resolvedCardId)
        const isNewerStatement =
          !matchedCard?.statement_date ||
          (parseResult?.statement_date &&
            new Date(parseResult.statement_date) >= new Date(matchedCard.statement_date))

        if (isNewerStatement && matchedCard) {
          matchedCard.current_debt = statementDebtValue
          matchedCard.statement_debt = statementDebtValue
          matchedCard.minimum_payment = minPaymentValue
          matchedCard.interest_fees = interestFeesValue
          matchedCard.statement_date = parseResult?.statement_date || null
          matchedCard.due_date = parseResult?.due_date || null

          const updatePayload: any = {
            current_debt: statementDebtValue,
            statement_debt: statementDebtValue,
            minimum_payment: minPaymentValue,
            interest_fees: interestFeesValue,
            statement_date: parseResult?.statement_date || null,
            due_date: parseResult?.due_date || null,
          }

          if (matchedCard.bank === 'Diğer Banka' && detectedBankName !== 'Diğer Banka') {
            updatePayload.bank = detectedBankName
            updatePayload.card_name = detectedCardTitle
            matchedCard.bank = detectedBankName
            matchedCard.card_name = detectedCardTitle
          }

          await supabase
            .from('credit_cards')
            .update(updatePayload)
            .eq('id', resolvedCardId)
        }
      }

      // Create Statement Import record
      const batchMeta: ImportBatchMeta = {
        file_hash: fileHash,
        status: 'COMPLETED',
        import_type: 'credit_card',
        snapshot_data: snapshotData,
      }

      const { data: importRecord, error: importError } = await supabase
        .from('statement_imports')
        .insert({
          user_id: userId,
          file_name: fileName || 'ekstre.pdf',
          bank: detectedBankName,
          card_id: resolvedCardId || null,
          statement_date: parseResult?.statement_date || null,
          due_date: parseResult?.due_date || null,
          total_transactions: selectedTxs.length,
          total_amount: totalSelectedAmount,
          raw_text: serializeBatchMeta(batchMeta),
        })
        .select()
        .single()

      if (importError) throw importError
      createdImportId = importRecord.id

      // Card Statement History (card_statements)
      if (resolvedCardId && parseResult?.statement_date) {
        const prevDebt = parseResult?.prev_debt || null
        const { changeAmount, changePct } = calculateStatementChange(statementDebtValue, prevDebt)
        await supabase.from('card_statements').insert({
          card_id: resolvedCardId,
          statement_date: parseResult.statement_date,
          period_debt: statementDebtValue,
          minimum: minPaymentValue,
          spending: totalSelectedAmount,
          interest_fees: interestFeesValue,
          due_date: parseResult.due_date || null,
          prev_debt: prevDebt,
          change_amount: changeAmount,
          change_pct: changePct ? changePct / 100 : null,
        })
      }

      // Insert Transactions with import_id link
      const rowsToInsert = selectedTxs.map((t) => ({
        user_id: userId,
        date: t.date,
        account_or_card: detectedCardTitle,
        type: sanitizeTransactionType(t.type, 'Harcama'),
        description: t.raw_description,
        amount: t.amount,
        analysis_group: sanitizeAnalysisGroup(t.analysis_group),
        merchant: t.merchant,
        recurrence: t.recurrence || null,
        statement_date: parseResult?.statement_date || null,
        card_id: resolvedCardId || null,
        project_id: t.project_id || null,
        import_id: importRecord.id,
      }))

      const { error: txInsertErr } = await supabase.from('transactions').insert(rowsToInsert)
      if (txInsertErr) throw txInsertErr

      // Automatic Subscription Discovery
      const { data: existingSubs } = await supabase.from('subscriptions').select('service')
      const existingSet = new Set(existingSubs?.map((s) => s.service.toLowerCase()) || [])
      const createdSubIds: string[] = []

      for (const t of selectedTxs) {
        if (
          (t.recurrence === 'Düzenli' || t.analysis_group === 'İş') &&
          t.type === 'Harcama' &&
          !existingSet.has(t.merchant.toLowerCase())
        ) {
          const { data: newSub } = await supabase
            .from('subscriptions')
            .insert({
              user_id: userId,
              service: t.merchant,
              group_type: t.analysis_group === 'İş' ? 'İş' : 'Kişisel',
              model: 'Tekrarlayan',
              amount: t.amount,
              currency: 'TRY',
              period: 'Aylık',
              status: 'Aktif',
              decision: 'Devam',
              project_id: t.project_id || null,
              payment_method: detectedCardTitle,
            })
            .select()
            .single()

          if (newSub) createdSubIds.push(newSub.id)
          existingSet.add(t.merchant.toLowerCase())
        }
      }

      if (createdSubIds.length > 0) {
        snapshotData.created_subscription_ids = createdSubIds
        batchMeta.snapshot_data = snapshotData
        await supabase
          .from('statement_imports')
          .update({ raw_text: serializeBatchMeta(batchMeta) })
          .eq('id', importRecord.id)
      }

      return {
        success: true,
        importId: importRecord.id,
        insertedTransactionsCount: selectedTxs.length,
        createdSubscriptionCount: createdSubIds.length,
      }
    }

    // =======================================================================
    // MOD B: VADESİZ HESAP DÖKÜMÜ & UZLAŞTIRMA
    // =======================================================================
    let currentAccountId = selectedAccountId

    if (!currentAccountId) {
      const { data: newAcc, error: newAccErr } = await supabase
        .from('accounts')
        .insert({
          user_id: userId,
          name: detectedBankName || 'Vadesiz Hesap',
          type: 'vadesiz',
          balance: 0,
        })
        .select()
        .single()

      if (newAccErr) throw newAccErr
      if (newAcc) currentAccountId = newAcc.id
    }

    const targetAccount = accounts.find((a) => a.id === currentAccountId)
    let runningAccountBalance = targetAccount ? Number(targetAccount.balance) : 0

    if (targetAccount) {
      snapshotData.previous_account_state = {
        account_id: targetAccount.id,
        balance: runningAccountBalance,
      }
    }

    const batchMeta: ImportBatchMeta = {
      file_hash: fileHash,
      status: 'COMPLETED',
      import_type: 'bank_account',
      snapshot_data: snapshotData,
    }

    const { data: importRecord, error: importError } = await supabase
      .from('statement_imports')
      .insert({
        user_id: userId,
        file_name: fileName || 'hesap_dokumu.pdf',
        bank: detectedBankName,
        total_transactions: selectedTxs.length,
        total_amount: totalSelectedAmount,
        raw_text: serializeBatchMeta(batchMeta),
      })
      .select()
      .single()

    if (importError) throw importError
    createdImportId = importRecord.id

    // Fetch fresh cards from DB for accurate settlement
    let dbCardsForSettlement: CreditCard[] | null = null
    try {
      const query = supabase.from('credit_cards').select('*')
      if (typeof query?.eq === 'function') {
        const { data } = await query.eq('user_id', userId)
        dbCardsForSettlement = data
      }
    } catch {
      // Graceful fallback
    }

    const settlementCards: CreditCard[] =
      dbCardsForSettlement && dbCardsForSettlement.length > 0 ? dbCardsForSettlement : activeCards

    // Row-by-row reconciliation
    for (const t of selectedTxs) {
      if (t.direction === 'inflow') {
        runningAccountBalance += t.amount
      } else {
        runningAccountBalance -= t.amount
      }

      // Receivable collection
      if (t.action === 'COLLECT_RECEIVABLE' && t.target_debt_id) {
        const targetDebt = debts.find((d) => d.id === t.target_debt_id)
        if (targetDebt) {
          const newRem = Math.max(0, targetDebt.remaining - t.amount)
          await supabase
            .from('debts')
            .update({
              past_payments: targetDebt.past_payments + t.amount,
              remaining: newRem,
              status: newRem <= 0 ? 'Kapatıldı' : 'Açık',
            })
            .eq('id', targetDebt.id)
        }
      }

      // Card debt settlement
      if (t.action === 'CARD_PAYMENT') {
        let cardId = t.target_card_id
        let targetCard = cardId ? settlementCards.find((c) => c.id === cardId) : undefined

        if (!targetCard) {
          const upper = (t.raw_description || '').toUpperCase()
          targetCard = settlementCards.find(
            (c) =>
              (c.last_four && upper.includes(c.last_four)) ||
              upper.includes(c.bank.toUpperCase()) ||
              upper.includes(c.card_name.toUpperCase())
          )
        }

        if (targetCard) {
          const isPostStatement =
            !targetCard.statement_date ||
            new Date(t.date) >= new Date(targetCard.statement_date)

          if (isPostStatement) {
            const newDebt = Math.max(0, targetCard.current_debt - t.amount)
            targetCard.current_debt = newDebt
            const newMin = Math.max(0, (targetCard.minimum_payment || 0) - t.amount)
            targetCard.minimum_payment = newMin
            await supabase
              .from('credit_cards')
              .update({
                current_debt: newDebt,
                minimum_payment: newMin,
              })
              .eq('id', targetCard.id)
          }
        }
      }

      // Cash advance drawn from credit card into checking account
      if (t.action === 'CASH_ADVANCE') {
        let cardId = t.target_card_id
        let targetCard = cardId ? settlementCards.find((c) => c.id === cardId) : undefined

        if (!targetCard) {
          const upper = (t.raw_description || '').toUpperCase()
          targetCard = settlementCards.find(
            (c) =>
              (c.last_four && upper.includes(c.last_four)) ||
              upper.includes(c.bank.toUpperCase()) ||
              upper.includes(c.card_name.toUpperCase())
          )
        }

        if (targetCard) {
          const isPostStatement =
            !targetCard.statement_date ||
            new Date(t.date) > new Date(targetCard.statement_date)

          if (isPostStatement) {
            const newDebt = targetCard.current_debt + t.amount
            targetCard.current_debt = newDebt
            await supabase
              .from('credit_cards')
              .update({ current_debt: newDebt })
              .eq('id', targetCard.id)
          }
        }
      }

      // Personal debt repayment
      if (t.action === 'PAY_DEBT' && t.target_debt_id) {
        const targetDebt = debts.find((d) => d.id === t.target_debt_id)
        if (targetDebt) {
          const newRem = Math.max(0, targetDebt.remaining - t.amount)
          await supabase
            .from('debts')
            .update({
              past_payments: targetDebt.past_payments + t.amount,
              remaining: newRem,
              status: newRem <= 0 ? 'Kapatıldı' : 'Açık',
            })
            .eq('id', targetDebt.id)
        }
      }
    }

    // Update account balance
    const finalBalance =
      parseResult?.closing_balance !== undefined
        ? parseResult.closing_balance
        : runningAccountBalance

    if (currentAccountId) {
      await supabase
        .from('accounts')
        .update({ balance: finalBalance })
        .eq('id', currentAccountId)
    }

    // Insert transactions
    const accountName = targetAccount ? targetAccount.name : detectedBankName
    const rowsToInsert = selectedTxs.map((t) => ({
      user_id: userId,
      date: t.date,
      account_or_card: accountName,
      type: sanitizeTransactionType(t.type, t.direction === 'inflow' ? 'Gelir' : 'Harcama'),
      description: t.raw_description,
      amount: t.amount,
      analysis_group: sanitizeAnalysisGroup(t.analysis_group),
      merchant: t.merchant,
      account_id: currentAccountId || null,
      project_id: t.project_id || null,
      import_id: importRecord.id,
    }))

    const { error: txInsertErr } = await supabase.from('transactions').insert(rowsToInsert)
    if (txInsertErr) throw txInsertErr

    return {
      success: true,
      importId: importRecord.id,
      insertedTransactionsCount: selectedTxs.length,
    }
  } catch (err: any) {
    if (createdImportId) {
      try {
        await rollbackImportBatch(supabase, createdImportId, userId)
      } catch (cleanupErr) {
        console.error('Error rolling back failed import batch:', cleanupErr)
      }
    }
    return { success: false, error: err.message || 'Veritabanına kaydedilirken hata oluştu.' }
  }
}
