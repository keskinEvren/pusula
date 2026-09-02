export interface ExtractedTransaction {
  id: string
  date: string
  raw_description: string
  merchant: string
  amount: number
  type: string
  analysis_group: string
  recurrence?: string
  project_id?: string
  confidence: 'high' | 'medium' | 'low'
  selected: boolean
}

export interface BankDetectionResult {
  bank: string
  card_name: string
  last_four?: string
  statement_date?: string
  due_date?: string
  statement_debt?: number
  minimum_payment?: number
  prev_debt?: number
  interest_fees?: number
}

export interface ParseResult {
  success: boolean
  file_name: string
  detected_bank?: string
  detected_card?: string
  last_four?: string
  statement_date?: string
  due_date?: string
  statement_debt?: number
  minimum_payment?: number
  prev_debt?: number
  interest_fees?: number
  transactions: ExtractedTransaction[]
  error?: string
}
