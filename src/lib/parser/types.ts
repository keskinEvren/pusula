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
  statement_date?: string
  due_date?: string
}

export interface ParseResult {
  success: boolean
  file_name: string
  detected_bank?: string
  detected_card?: string
  statement_date?: string
  due_date?: string
  transactions: ExtractedTransaction[]
  error?: string
}
