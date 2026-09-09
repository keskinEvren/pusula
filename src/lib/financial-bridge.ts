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

  /**
   * 8. Mevcut Banka Hareketini Borç/Alacağa Eşle (Tahsilat veya Borç Ödemesi Olarak Bağla)
   */
  async linkTransactionToDebt(params: {
    userId: string
    transactionId: string
    debtId: string
  }): Promise<FinancialEventResult> {
    try {
      const supabase = createClient()

      // 1. Oku: Transaction
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', params.transactionId)
        .eq('user_id', params.userId)
        .single()

      if (txErr || !tx) return { success: false, error: 'Hareket bulunamadı.' }

      // 2. Oku: Debt
      const { data: debt, error: debtErr } = await supabase
        .from('debts')
        .select('*')
        .eq('id', params.debtId)
        .eq('user_id', params.userId)
        .single()

      if (debtErr || !debt) return { success: false, error: 'Borç/Alacak kaydı bulunamadı.' }

      // Eğer hareket önceden başka bir borca bağlıysa, önce eski borçtan çıkar
      const oldDebtId = getLinkedDebtId(tx)
      if (oldDebtId && oldDebtId !== params.debtId) {
        await this.unlinkTransactionFromDebt({ userId: params.userId, transactionId: params.transactionId })
      }

      // Yeni tip ve etiket
      const isReceivable = debt.type === 'Alacak'
      const newType = isReceivable ? 'Tahsilat' : 'Borç Ödemesi'
      const merchantTag = isReceivable
        ? `Tahsilat: ${debt.person_or_entity}`
        : `Ödeme: ${debt.person_or_entity}`

      // Borç güncelle
      const newPast = Number(debt.past_payments) + Number(tx.amount)
      const newRemaining = Math.max(0, Number(debt.remaining) - Number(tx.amount))
      const newStatus = newRemaining <= 0 ? 'Kapatıldı' : 'Açık'

      const { error: dUpdateErr } = await supabase
        .from('debts')
        .update({
          past_payments: newPast,
          remaining: newRemaining,
          status: newStatus,
        })
        .eq('id', debt.id)

      if (dUpdateErr) throw dUpdateErr

      // Transaction güncelle (güvenli fallback: related_debt_id varsa sütuna, yoksa [DEBT:id] tag'i açıklamaya)
      const cleanDesc = (tx.description || '').replace(/\s*\[DEBT:[a-f0-9-]+\]/gi, '').trim()
      const updatePayload: any = {
        type: newType,
        merchant: merchantTag,
        analysis_group: 'Hariç',
        description: `${cleanDesc} [DEBT:${debt.id}]`,
      }

      const res1 = await supabase
        .from('transactions')
        .update({ ...updatePayload, related_debt_id: debt.id })
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
      return { success: false, error: err.message || 'Hareket borca bağlanamadı.' }
    }
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


