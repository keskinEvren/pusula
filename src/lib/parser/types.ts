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

export type ClassificationStatus =
  | 'CONFIRMED'
  | 'HIGH_CONFIDENCE'
  | 'NEEDS_REVIEW'
  | 'UNKNOWN'
  | 'CONFLICTING_RULES'

export type DuplicateStatus =
  | 'NEW'
  | 'EXACT_DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | 'USER_CONFIRMED_NEW'

export type FingerprintStrength = 'strong' | 'weak'

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

  // Source identity & import safety
  external_reference?: string
  balance_after?: number
  source_fingerprint?: string
  weak_fingerprint?: string
  fingerprint_strength?: FingerprintStrength
  duplicate_status?: DuplicateStatus

  // Explainable, risk-aware classification
  classification_status?: ClassificationStatus
  classification_reasons?: string[]

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
  source_account_ref?: string
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
  source_account_ref?: string
  transactions: ExtractedTransaction[]
  error?: string
}
