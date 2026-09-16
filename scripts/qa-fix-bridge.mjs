import { readFileSync, writeFileSync } from 'node:fs'
const file = 'src/lib/financial-bridge.ts'
let src = readFileSync(file, 'utf8')
const begin = src.indexOf('  /**', src.indexOf('export class FinancialBridge'))
const end = src.indexOf('  /**\n   * 8.', begin) < 0 ? src.indexOf('  /**\r\n   * 8.', begin) : src.indexOf('  /**\n   * 8.', begin)
if (end < 0) throw new Error('Method boundary not found')
const replacement = `  // A failed/ambiguous RPC must never be retried as separate table mutations.
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

`
src = src.slice(0, begin) + replacement + src.slice(end)
const linkStart = src.indexOf('    try {', src.indexOf('  async linkTransactionToDebt('))
const linkEnd = src.indexOf('  async unlinkTransactionFromDebt', linkStart)
const blockEnd = src.lastIndexOf('  /**', linkEnd)
if (linkStart < 0 || blockEnd < linkStart) throw new Error('Link boundary not found')
src = src.slice(0, linkStart) + `    const result = await this.atomic('fn_link_transaction_to_debt_atomic', {
      p_user_id: params.userId, p_transaction_id: params.transactionId, p_debt_id: params.debtId,
    })
    return result.success ? { ...result, transactionId: params.transactionId } : result
  }

` + src.slice(blockEnd)
writeFileSync(file, src)
