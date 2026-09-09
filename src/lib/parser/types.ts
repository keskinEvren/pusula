export type ReconciliationActionType =
  | 'CARD_PAYMENT'        // Kredi Kartı Borcu Kapat
  | 'COLLECT_RECEIVABLE'  // Alacak Tahsil Et
  | 'PAY_DEBT'            // Şahıs / Kurum Borcu Öde
  | 'FAMILY_SUPPORT'      // Aile Desteği / Harçlık (Kişisel Gider veya Gelir)
  | 'SHARED_EXPENSE'      // Ortak Harcama / Masraf Bölüşme (Kişisel)
  | 'DIRECT_EXPENSE'      // Direkt Harcama (Kişisel / İş / Finansman)
  | 'FREE_INCOME'         // Serbest Gelir
  | 'INTERNAL_TRANSFER'   // Hesaplar Arası Transfer (Hariç)
  | 'CASH_ADVANCE'        // Kredi Kartından Nakit Avans Çekimi (Borç Artışı)
  | 'INVESTMENT_TRANSFER' // Yatırım & Varlık Transferi (Hariç - Portföy / Sermaye)

export interface ExtractedTransaction {
  id: string
  date: string
  raw_description: string
  merchant: string
  amount: number
  type: string
  analysis_group: string
  direction?: 'inflow' | 'outflow' // Gelen (+) / Giden (-)
  recurrence?: string
  project_id?: string
  confidence: 'high' | 'medium' | 'low'
  selected: boolean

  // Reconciliation Target References
  action?: ReconciliationActionType
  target_card_id?: string
  target_debt_id?: string
  target_account_id?: string
}

export interface BankDetectionResult {
  bank: string
  card_name: string
  account_type?: 'credit_card' | 'bank_account'
  last_four?: string
  statement_date?: string
  due_date?: string
  statement_debt?: number
  minimum_payment?: number
  prev_debt?: number
  interest_fees?: number
  closing_balance?: number
}

export interface ParseResult {
  success: boolean
  file_name: string
  import_type: 'credit_card' | 'bank_account'
  detected_bank?: string
  detected_card?: string
  last_four?: string
  statement_date?: string
  due_date?: string
  statement_debt?: number
  minimum_payment?: number
  prev_debt?: number
  interest_fees?: number
  closing_balance?: number
  transactions: ExtractedTransaction[]
  error?: string
}
