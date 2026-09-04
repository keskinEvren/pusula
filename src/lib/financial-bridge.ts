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
  /**
   * 1. Harcama Kaydet
   * - transactions tablosuna yaz
   * - accountId varsa -> accounts.balance düş
   * - cardId varsa -> credit_cards.current_debt artırma (ekstre zaten içerir, bu durumda artirma) 
   * NOT: Kredi kartı harcaması ekstre üzerinden geldiğinde bakiye zaten güncellidir.
   * Manuel kart harcaması eklenirse current_debt artabilir.
   */
  async recordExpense(params: RecordExpenseParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    if (!params.accountId && !params.cardId) return { success: false, error: 'Hesap veya kart seçilmelidir.' }

    try {
      const supabase = createClient()

      // 1. Transaction defterine yaz
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Harcama',
          description: params.description,
          amount: params.amount,
          analysis_group: params.analysisGroup || 'Kişisel',
          merchant: params.merchant || null,
          account_id: params.accountId || null,
          card_id: params.cardId || null,
          project_id: params.projectId || null,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // 2. Hesap bakiyesi düşür (vadesiz hesaptan harcama)
      if (params.accountId) {
        const { data: acc } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', params.accountId)
          .single()

        if (acc) {
          await supabase
            .from('accounts')
            .update({ balance: Number(acc.balance) - params.amount })
            .eq('id', params.accountId)
        }
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Harcama kaydedilemedi.' }
    }
  }

  /**
   * 2. Gelir Kaydet
   * - transactions tablosuna yaz
   * - accounts.balance artır
   */
  async recordIncome(params: RecordIncomeParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }

    try {
      const supabase = createClient()

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Gelir',
          description: params.description,
          amount: params.amount,
          analysis_group: 'Kişisel',
          merchant: params.merchant || null,
          account_id: params.accountId,
          project_id: params.projectId || null,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // Hesap bakiyesi artır
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.accountId)
        .single()

      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) + params.amount })
          .eq('id', params.accountId)
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Gelir kaydedilemedi.' }
    }
  }

  /**
   * 3. Kart Borcu Öde
   * - transactions tablosuna 'Kart Ödemesi' yaz
   * - accounts.balance düşür (kaynak vadesiz hesap)
   * - credit_cards.current_debt düşür
   */
  async recordCardPayment(params: RecordCardPaymentParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }

    try {
      const supabase = createClient()

      // 1. Transaction defterine yaz
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Kart Ödemesi',
          description: params.description || 'Kart Ödemesi',
          amount: params.amount,
          analysis_group: 'Hariç',
          account_id: params.sourceAccountId,
          card_id: params.cardId,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // 2. Vadesiz hesap bakiyesi düş
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.sourceAccountId)
        .single()

      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) - params.amount })
          .eq('id', params.sourceAccountId)
      }

      // 3. Kart borcu düş
      const { data: card } = await supabase
        .from('credit_cards')
        .select('current_debt')
        .eq('id', params.cardId)
        .single()

      if (card) {
        await supabase
          .from('credit_cards')
          .update({ current_debt: Math.max(0, Number(card.current_debt) - params.amount) })
          .eq('id', params.cardId)
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Kart ödemesi kaydedilemedi.' }
    }
  }

  /**
   * 4. Borç Öde
   * - transactions tablosuna 'Borç Ödemesi' yaz
   * - accounts.balance düşür (kaynak hesap)
   * - debts.remaining düşür, 0 ise status: 'Kapatıldı'
   */
  async recordDebtPayment(params: RecordDebtPaymentParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }

    try {
      const supabase = createClient()

      // Mevcut borcu oku
      const { data: debt } = await supabase
        .from('debts')
        .select('remaining, past_payments, status')
        .eq('id', params.debtId)
        .single()

      if (!debt) return { success: false, error: 'Borç kaydı bulunamadı.' }
      if (debt.status === 'Kapatıldı') return { success: false, error: 'Bu borç zaten kapatılmış.' }

      const newRemaining = Math.max(0, Number(debt.remaining) - params.amount)
      const isClosed = newRemaining <= 0

      // 1. Transaction defterine yaz
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Borç Ödemesi',
          description: params.description || 'Borç Ödemesi',
          amount: params.amount,
          analysis_group: 'Hariç',
          account_id: params.sourceAccountId,
          related_debt_id: params.debtId,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // 2. Borç güncelle
      await supabase
        .from('debts')
        .update({
          past_payments: Number(debt.past_payments) + params.amount,
          remaining: newRemaining,
          status: isClosed ? 'Kapatıldı' : 'Açık',
        })
        .eq('id', params.debtId)

      // 3. Hesap bakiyesi düş
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.sourceAccountId)
        .single()

      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) - params.amount })
          .eq('id', params.sourceAccountId)
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Borç ödemesi kaydedilemedi.' }
    }
  }

  /**
   * 5. Alacak Tahsil Et
   * - transactions tablosuna 'Tahsilat' yaz
   * - accounts.balance artır (hedef hesap)
   * - debts.remaining düşür, 0 ise status: 'Kapatıldı'
   */
  async recordReceivableCollection(params: RecordReceivableCollectionParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }

    try {
      const supabase = createClient()

      // Mevcut alacak oku
      const { data: debt } = await supabase
        .from('debts')
        .select('remaining, past_payments, status')
        .eq('id', params.receivableId)
        .single()

      if (!debt) return { success: false, error: 'Alacak kaydı bulunamadı.' }
      if (debt.status === 'Kapatıldı') return { success: false, error: 'Bu alacak zaten kapatılmış.' }

      const newRemaining = Math.max(0, Number(debt.remaining) - params.amount)
      const isClosed = newRemaining <= 0

      // 1. Transaction defterine yaz
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Tahsilat',
          description: params.description || 'Alacak Tahsilatı',
          amount: params.amount,
          analysis_group: 'Hariç',
          account_id: params.targetAccountId,
          related_debt_id: params.receivableId,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // 2. Alacak güncelle
      await supabase
        .from('debts')
        .update({
          past_payments: Number(debt.past_payments) + params.amount,
          remaining: newRemaining,
          status: isClosed ? 'Kapatıldı' : 'Açık',
        })
        .eq('id', params.receivableId)

      // 3. Hesap bakiyesi artır
      const { data: acc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.targetAccountId)
        .single()

      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) + params.amount })
          .eq('id', params.targetAccountId)
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Tahsilat kaydedilemedi.' }
    }
  }

  /**
   * 6. Hesaplar Arası Transfer
   * - transactions tablosuna 'Transfer' yaz
   * - kaynak accounts.balance düş
   * - hedef accounts.balance art
   */
  async recordTransfer(params: RecordTransferParams): Promise<FinancialEventResult> {
    if (params.amount <= 0) return { success: false, error: 'Tutar sıfırdan büyük olmalıdır.' }
    if (params.sourceAccountId === params.targetAccountId) return { success: false, error: 'Aynı hesaba transfer yapılamaz.' }

    try {
      const supabase = createClient()

      // 1. Transaction defterine yaz
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: params.userId,
          date: params.date,
          type: 'Transfer',
          description: params.description || 'Hesaplar Arası Transfer',
          amount: params.amount,
          analysis_group: 'Hariç',
          source_account_id: params.sourceAccountId,
          target_account_id: params.targetAccountId,
        })
        .select('id')
        .single()

      if (txErr) throw txErr

      // 2. Kaynak hesap düş
      const { data: srcAcc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.sourceAccountId)
        .single()

      if (srcAcc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(srcAcc.balance) - params.amount })
          .eq('id', params.sourceAccountId)
      }

      // 3. Hedef hesap artır
      const { data: tgtAcc } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', params.targetAccountId)
        .single()

      if (tgtAcc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(tgtAcc.balance) + params.amount })
          .eq('id', params.targetAccountId)
      }

      return { success: true, transactionId: tx.id }
    } catch (err: any) {
      return { success: false, error: err.message || 'Transfer kaydedilemedi.' }
    }
  }

  /**
   * 7. İşlem Sil ve Geri Al
   * - Mevcut işlemi oku, tipine göre ilgili bakiyeleri ters yönde güncelle
   * - transactions tablosundan sil
   */
  async deleteTransaction(transactionId: string): Promise<FinancialEventResult> {
    try {
      const supabase = createClient()

      // Önce mevcut işlemi oku
      const { data: tx, error: readErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single()

      if (readErr || !tx) return { success: false, error: 'İşlem bulunamadı.' }

      // Tip bazlı geri alma
      switch (tx.type) {
        case 'Harcama':
          if (tx.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) + tx.amount }).eq('id', tx.account_id)
          }
          break

        case 'Gelir':
          if (tx.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) - tx.amount }).eq('id', tx.account_id)
          }
          break

        case 'Kart Ödemesi':
          if (tx.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) + tx.amount }).eq('id', tx.account_id)
          }
          if (tx.card_id) {
            const { data: card } = await supabase.from('credit_cards').select('current_debt').eq('id', tx.card_id).single()
            if (card) await supabase.from('credit_cards').update({ current_debt: Number(card.current_debt) + tx.amount }).eq('id', tx.card_id)
          }
          break

        case 'Borç Ödemesi':
          if (tx.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) + tx.amount }).eq('id', tx.account_id)
          }
          if (tx.related_debt_id) {
            const { data: debt } = await supabase.from('debts').select('remaining, past_payments').eq('id', tx.related_debt_id).single()
            if (debt) {
              await supabase.from('debts').update({
                past_payments: Math.max(0, Number(debt.past_payments) - tx.amount),
                remaining: Number(debt.remaining) + tx.amount,
                status: 'Açık',
              }).eq('id', tx.related_debt_id)
            }
          }
          break

        case 'Tahsilat':
          if (tx.account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) - tx.amount }).eq('id', tx.account_id)
          }
          if (tx.related_debt_id) {
            const { data: debt } = await supabase.from('debts').select('remaining, past_payments').eq('id', tx.related_debt_id).single()
            if (debt) {
              await supabase.from('debts').update({
                past_payments: Math.max(0, Number(debt.past_payments) - tx.amount),
                remaining: Number(debt.remaining) + tx.amount,
                status: 'Açık',
              }).eq('id', tx.related_debt_id)
            }
          }
          break

        case 'Transfer':
          if (tx.source_account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.source_account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) + tx.amount }).eq('id', tx.source_account_id)
          }
          if (tx.target_account_id) {
            const { data: acc } = await supabase.from('accounts').select('balance').eq('id', tx.target_account_id).single()
            if (acc) await supabase.from('accounts').update({ balance: Number(acc.balance) - tx.amount }).eq('id', tx.target_account_id)
          }
          break
      }

      // İşlemi sil
      const { error: delErr } = await supabase.from('transactions').delete().eq('id', transactionId)
      if (delErr) throw delErr

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'İşlem silinemedi.' }
    }
  }
}

// Singleton export
export const financialBridge = new FinancialBridge()
