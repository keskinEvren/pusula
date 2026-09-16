import { createClient } from '@/lib/supabase/client'

// --- Result Type ---
export interface FinancialEventResult {
  success: boolean
  error?: string
  transactionId?: string
}

// --- Param Types ---
export interface RecordExpenseParams {
  userId: string
  amount: number
  description: string
  date: string
  accountId?: string
  cardId?: string
  projectId?: string
  merchant?: string
  analysisGroup?: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
}

export interface RecordIncomeParams {
  userId: string
  amount: number
  description: string
  date: string
  accountId: string
  merchant?: string
  projectId?: string
}

export interface RecordCardPaymentParams {
  userId: string
  amount: number
  sourceAccountId: string
  cardId: string
  date: string
  description?: string
}

export interface RecordDebtPaymentParams {
  userId: string
  amount: number
  sourceAccountId: string
  debtId: string
  date: string
  description?: string
}

export interface RecordReceivableCollectionParams {
  userId: string
  amount: number
  targetAccountId: string
  receivableId: string
  date: string
  description?: string
}

export interface RecordTransferParams {
  userId: string
  amount: number
  sourceAccountId: string
  targetAccountId: string
  date: string
  description?: string
}

// --- Bridge Class ---

export class FinancialBridge {
  // A failed/ambiguous RPC must never be retried as separate table mutations.
  private async atomic(name: string, params: Record<string, unknown>): Promise<FinancialEventResult> {
    try {
      const { data, error } = await createClient().rpc(name, params)
      if (error) return { success: false, error: error.message || 'Finans işlemi doğrulanamadı.' }
      if (!data?.success) return { success: false, error: data?.error || 'Finans işlemi doğrulanamadı.' }
      return { success: true, transactionId: data.transaction_id }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Finans servisine ulaşılamadı.' }
    }
  }

  private validAmount(amount: number): boolean { return Number.isFinite(amount) && amount > 0 }

  async recordExpense(params: RecordExpenseParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    if (!params.accountId && !params.cardId) return { success: false, error: 'Hesap veya kart seçilmelidir.' }
    if (params.accountId && params.cardId) return { success: false, error: 'Tek bir hesap veya kart seçilmelidir.' }
    return this.atomic('fn_record_expense_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description,
      p_analysis_group: params.analysisGroup || 'Kişisel', p_merchant: params.merchant || null,
      p_account_id: params.accountId || null, p_card_id: params.cardId || null, p_project_id: params.projectId || null,
    })
  }

  async recordIncome(params: RecordIncomeParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    return this.atomic('fn_record_income_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description,
      p_analysis_group: 'Kişisel', p_merchant: params.merchant || null, p_account_id: params.accountId, p_project_id: params.projectId || null,
    })
  }

  async recordCardPayment(params: RecordCardPaymentParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    return this.atomic('fn_record_payment_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description || 'Kart Ödemesi',
      p_type: 'Kart Ödemesi', p_account_id: params.sourceAccountId, p_target_id: params.cardId,
    })
  }

  async recordDebtPayment(params: RecordDebtPaymentParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    return this.atomic('fn_record_payment_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description || 'Borç Ödemesi',
      p_type: 'Borç Ödemesi', p_account_id: params.sourceAccountId, p_target_id: params.debtId,
    })
  }

  async recordReceivableCollection(params: RecordReceivableCollectionParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    return this.atomic('fn_record_payment_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description || 'Alacak Tahsilatı',
      p_type: 'Tahsilat', p_account_id: params.targetAccountId, p_target_id: params.receivableId,
    })
  }

  async recordTransfer(params: RecordTransferParams): Promise<FinancialEventResult> {
    if (!this.validAmount(params.amount)) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    if (params.sourceAccountId === params.targetAccountId) return { success: false, error: 'Aynı hesaba transfer yapılamaz.' }
    return this.atomic('fn_record_transfer_atomic', {
      p_user_id: params.userId, p_date: params.date, p_amount: params.amount, p_description: params.description || 'Hesaplar Arası Transfer',
      p_source_account_id: params.sourceAccountId, p_target_account_id: params.targetAccountId,
    })
  }

  async deleteTransaction(transactionId: string): Promise<FinancialEventResult> {
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) return { success: false, error: 'Oturum açılmamış.' }
      return this.atomic('fn_delete_transaction_atomic', { p_user_id: user.id, p_tx_id: transactionId })
    } catch { return { success: false, error: 'İşlem silinemedi.' } }
  }

  /**
   * 8. Mevcut Banka Hareketini Borç/Alacağa Eşle (Tahsilat veya Borç Ödemesi Olarak Bağla)
   */
  async linkTransactionToDebt(params: {
    userId: string
    transactionId: string
    debtId: string
  }): Promise<FinancialEventResult> {
    const result = await this.atomic('fn_link_transaction_to_debt_atomic', {
      p_user_id: params.userId, p_transaction_id: params.transactionId, p_debt_id: params.debtId,
    })
    return result.success ? { ...result, transactionId: params.transactionId } : result
  }

  /**
   * 9. Hareketin Borç/Alacak Bağlantısını Çöz (Geri Al)
   */
  async unlinkTransactionFromDebt(params: {
    userId: string
    transactionId: string
  }): Promise<FinancialEventResult> {
    try {
      const supabase = createClient()

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transactionId)
        .eq('user_id', params.userId)
        .single()

      if (txErr || !tx) return { success: false, error: 'Hareket bulunamadı.' }

      const debtId = getLinkedDebtId(tx)
      if (debtId) {
        const { data: debt } = await supabase
          .from('debts')
          .select('*')
          .eq('id', debtId)
          .eq('user_id', params.userId)
          .single()

        if (debt) {
          const restoredPast = Math.max(0, Number(debt.past_payments) - Number(tx.amount))
          const restoredRemaining = Number(debt.remaining) + Number(tx.amount)
          await supabase
            .from('debts')
            .update({
              past_payments: restoredPast,
              remaining: restoredRemaining,
              status: 'Açık',
            })
            .eq('id', debtId)
        }
      }

      // Restore transaction
      const cleanDesc = (tx.description || '').replace(/\s*\[DEBT:[a-f0-9-]+\]/gi, '').trim()
      const restoredType = tx.type === 'Tahsilat' ? 'Gelir' : tx.type === 'Borç Ödemesi' ? 'Harcama' : tx.type

      const updatePayload: any = {
        type: restoredType,
        description: cleanDesc,
        analysis_group: 'Kişisel',
      }

      const res1 = await supabase
        .from('transactions')
        .update({ ...updatePayload, related_debt_id: null })
        .eq('id', tx.id)

      if (res1.error) {
        const res2 = await supabase
          .from('transactions')
          .update(updatePayload)
          .eq('id', tx.id)
        if (res2.error) throw res2.error
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bağlantı çözülemedi.' }
    }
  }

  /**
   * 10. Banka / Kart Hareketini Yatırıma (Portföye) Aktar / Eşle
   * - Hareketi 'Hariç' (Tüketim Dışı Transfer) yapar, bütçeyi bozmaz.
   * - İsteğe bağlı olarak ilgili varlığın adet ve ortalama maliyetini günceller.
   */
  async linkTransactionToInvestment(params: {
    userId: string
    transactionId: string
    investmentId: string
    addedQty?: number
    unitPrice?: number
  }): Promise<FinancialEventResult> {
    try {
      const supabase = createClient()

      // 1. Get Transaction
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transactionId)
        .eq('user_id', params.userId)
        .single()

      if (txErr || !tx) return { success: false, error: 'Hareket bulunamadı.' }

      // 2. Get Investment (if DB available)
      const { data: inv } = await supabase
        .from('investments')
        .select('*')
        .eq('id', params.investmentId)
        .eq('user_id', params.userId)
        .single()

      if (inv && params.addedQty && params.addedQty > 0 && params.unitPrice && params.unitPrice > 0) {
        const currentQty = Number(inv.quantity || 0)
        const currentCost = Number(inv.unit_cost || 0)
        const newQty = currentQty + params.addedQty
        const totalSpent = (currentQty * currentCost) + (params.addedQty * params.unitPrice)
        const newUnitCost = newQty > 0 ? Math.round((totalSpent / newQty) * 100) / 100 : 0

        await supabase
          .from('investments')
          .update({
            quantity: newQty,
            unit_cost: newUnitCost,
            current_price: params.unitPrice,
            last_price_updated_at: new Date().toISOString(),
          })
          .eq('id', inv.id)
      }

      // 3. Update Transaction: mark as Excluded from consumption & tag with [INV:id]
      const invTag = `[INV:${params.investmentId}]`
      const baseDesc = (tx.description || '').replace(/\s*\[INV:[^\]]+\]/gi, '').trim()
      const updatedDesc = `${baseDesc} ${invTag}`.trim()

      const { error: updErr } = await supabase
        .from('transactions')
        .update({
          type: 'Transfer',
          analysis_group: 'Hariç',
          description: updatedDesc,
        })
        .eq('id', tx.id)

      if (updErr) throw updErr

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Yatırıma aktarılamadı.' }
    }
  }

  /**
   * 11. Hareketin Yatırım Bağlantısını Geri Al (Tüketime İade Et)
   */
  async unlinkTransactionFromInvestment(params: {
    userId: string
    transactionId: string
  }): Promise<FinancialEventResult> {
    try {
      const supabase = createClient()

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transactionId)
        .eq('user_id', params.userId)
        .single()

      if (txErr || !tx) return { success: false, error: 'Hareket bulunamadı.' }

      const cleanDesc = (tx.description || '').replace(/\s*\[INV:[^\]]+\]/gi, '').trim()

      const { error: updErr } = await supabase
        .from('transactions')
        .update({
          type: 'Harcama',
          analysis_group: 'Kişisel',
          description: cleanDesc,
        })
        .eq('id', tx.id)

      if (updErr) throw updErr

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Bağlantı geri alınamadı.' }
    }
  }
}

/**
 * Harekete bağlı borç/alacak kimliğini döndürür
 */
export function getLinkedDebtId(tx: { related_debt_id?: string | null; description?: string | null }): string | null {
  if (tx.related_debt_id) return tx.related_debt_id
  const match = tx.description?.match(/\[DEBT:([a-f0-9-]+)\]/i)
  return match ? match[1] : null
}

/**
 * Harekete bağlı yatırım kimliğini döndürür
 */
export function getLinkedInvestmentId(tx: { description?: string | null }): string | null {
  const match = tx.description?.match(/\[INV:([^\]]+)\]/i)
  return match ? match[1] : null
}

// Singleton export
export const financialBridge = new FinancialBridge()


