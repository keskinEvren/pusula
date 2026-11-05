import type { Debt, DebtInstallment } from '@/types/database'
import { formatLocalDateInput } from '@/lib/utils'

export interface InstallmentDraft {
  id?: string
  tempId?: string
  debt_id?: string
  user_id?: string
  installment_no: number
  due_date: string // YYYY-MM-DD
  amount: number | string
  status: 'Bekliyor' | 'Ödendi'
  paid_at?: string | null
  note?: string | null
}

export interface GenerateInstallmentBatchParams {
  count: number
  startDate: string // YYYY-MM-DD or DD.MM.YYYY
  amount: number | string
  startingInstallmentNo?: number
  note?: string | null
}

export interface InstallmentSummary {
  totalCount: number
  paidCount: number
  remainingCount: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  nextInstallment: DebtInstallment | InstallmentDraft | null
  overdueCount: number
  progressPercent: number
}

/**
 * Normalizes numbers and currency strings (including Turkish format like '2.181,94 ₺' or '2158,17') into a standard float number.
 */
export function parseAmount(val: number | string | null | undefined): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100
  }
  if (!val) return 0
  const clean = String(val).replace(/[^\d.,-]/g, '').trim()
  if (!clean) return 0

  // Turkish format: both dot and comma (e.g. 2.181,94) => dot is thousands, comma is decimal
  if (clean.includes(',') && clean.includes('.')) {
    const standardized = clean.replace(/\./g, '').replace(',', '.')
    const parsed = parseFloat(standardized)
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100
  }
  // If only comma present (e.g. 2158,17) => comma is decimal separator
  if (clean.includes(',')) {
    const standardized = clean.replace(',', '.')
    const parsed = parseFloat(standardized)
    return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100
  }
  // Standard float notation (e.g. 2158.17)
  const parsed = parseFloat(clean)
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100
}

/**
 * Normalizes date inputs to standard YYYY-MM-DD.
 * Supports:
 * - 'YYYY-MM-DD'
 * - 'DD.MM.YYYY' (Turkish standard)
 * - 'DD/MM/YYYY'
 * - ISO string '2026-11-05T00:00:00.000Z'
 */
export function normalizeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const trimmed = dateStr.trim()
  if (!trimmed) return ''

  // ISO timestamp (contains T or space before time)
  if (trimmed.includes('T')) {
    return trimmed.slice(0, 10)
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
    const parts = trimmed.split('-')
    const yyyy = parts[0]
    const mm = parts[1].padStart(2, '0')
    const dd = parts[2].slice(0, 2).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // DD.MM.YYYY
  const dotParts = trimmed.split('.')
  if (dotParts.length === 3 && dotParts[2].length >= 4) {
    const dd = dotParts[0].padStart(2, '0')
    const mm = dotParts[1].padStart(2, '0')
    const yyyy = dotParts[2].slice(0, 4)
    return `${yyyy}-${mm}-${dd}`
  }

  // DD/MM/YYYY
  const slashParts = trimmed.split('/')
  if (slashParts.length === 3 && slashParts[2].length >= 4) {
    const dd = slashParts[0].padStart(2, '0')
    const mm = slashParts[1].padStart(2, '0')
    const yyyy = slashParts[2].slice(0, 4)
    return `${yyyy}-${mm}-${dd}`
  }

  return trimmed.slice(0, 10)
}

/**
 * Adds integer months to a date string, clamping to the last valid day of the target month
 * (e.g. 2026-01-31 + 1 month => 2026-02-28; 2026-11-05 + 2 months => 2027-01-05).
 */
export function addMonths(dateStr: string, monthsToAdd: number): string {
  const normalized = normalizeDate(dateStr)
  if (!normalized || !normalized.includes('-')) return dateStr
  const parts = normalized.split('-')
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr

  const totalMonths = year * 12 + (month - 1) + monthsToAdd
  const newYear = Math.floor(totalMonths / 12)
  const newMonthIndex = ((totalMonths % 12) + 12) % 12
  const newMonth = newMonthIndex + 1

  // Day 0 of next month is the last day of this month in UTC
  const maxDaysInMonth = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate()
  const newDay = Math.min(day, maxDaysInMonth)

  const yyyy = String(newYear).padStart(4, '0')
  const mm = String(newMonth).padStart(2, '0')
  const dd = String(newDay).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Generates an array of installments starting at `startDate`, incrementing by 1 month for each installment.
 */
export function generateInstallmentBatch(params: GenerateInstallmentBatchParams): InstallmentDraft[] {
  const { count, startDate, amount, startingInstallmentNo = 1, note } = params
  const intCount = Math.floor(Number(count) || 0)
  if (intCount <= 0) return []

  const cleanStartDate = normalizeDate(startDate) || formatLocalDateInput()
  const cleanAmount = parseAmount(amount)
  const installments: InstallmentDraft[] = []

  for (let i = 0; i < intCount; i++) {
    installments.push({
      installment_no: startingInstallmentNo + i,
      due_date: addMonths(cleanStartDate, i),
      amount: cleanAmount,
      status: 'Bekliyor',
      paid_at: null,
      note: note || null,
    })
  }

  return installments
}

/**
 * Merges installment drafts that share the exact same calendar due_date (YYYY-MM-DD).
 * - Normalizes all incoming dates (supports DD.MM.YYYY, DD/MM/YYYY, ISO).
 * - Amounts are summed with 2-decimal precision via parseAmount.
 * - If both are 'Ödendi', status is 'Ödendi'; otherwise 'Bekliyor'.
 * - Notes are concatenated without duplicates.
 * - Resulting list is sorted chronologically by due_date.
 * - installment_no is renumbered sequentially 1..N.
 */
export function mergeInstallmentDrafts(
  existingDrafts: InstallmentDraft[],
  incomingDrafts: InstallmentDraft[] = []
): InstallmentDraft[] {
  const combined = [...existingDrafts, ...incomingDrafts]
  if (combined.length === 0) return []

  const dateMap = new Map<string, InstallmentDraft>()

  for (const item of combined) {
    const dateKey = normalizeDate(item.due_date)
    if (!dateKey) continue

    const itemAmount = parseAmount(item.amount)
    const current = dateMap.get(dateKey)

    if (!current) {
      dateMap.set(dateKey, {
        ...item,
        due_date: dateKey,
        amount: itemAmount,
        status: item.status || 'Bekliyor',
        note: item.note ? item.note.trim() : null,
      })
    } else {
      const currentAmt = parseAmount(current.amount)
      const mergedAmount = Math.round((currentAmt + itemAmount) * 100) / 100
      const mergedStatus =
        current.status === 'Ödendi' && item.status === 'Ödendi' ? 'Ödendi' : 'Bekliyor'
      const mergedPaidAt =
        mergedStatus === 'Ödendi' ? current.paid_at || item.paid_at || null : null

      const notes = [current.note, item.note].filter(Boolean) as string[]
      const mergedNote =
        notes.length > 0 ? Array.from(new Set(notes.map((n) => n.trim()))).join(' + ') : null

      dateMap.set(dateKey, {
        ...current,
        due_date: dateKey,
        // Preserve DB id if existing has one, otherwise keep whichever is valid
        id: current.id || item.id,
        amount: mergedAmount,
        status: mergedStatus,
        paid_at: mergedPaidAt,
        note: mergedNote,
      })
    }
  }

  // Sort chronologically by due_date
  const sorted = Array.from(dateMap.values()).sort((a, b) =>
    a.due_date.localeCompare(b.due_date)
  )

  // Renumber sequentially 1..N
  return sorted.map((inst, idx) => ({
    ...inst,
    installment_no: idx + 1,
  }))
}

/**
 * Calculates a summary of installments for a debt: totals, paid, remaining, next due, and overdue counts.
 */
export function calculateInstallmentSummary(
  installments: (DebtInstallment | InstallmentDraft)[],
  referenceDateStr?: string
): InstallmentSummary {
  const totalCount = installments.length
  let paidCount = 0
  let totalAmount = 0
  let paidAmount = 0

  const today = referenceDateStr || formatLocalDateInput()
  let overdueCount = 0

  // Sort installments chronologically by installment_no / due_date to find the next pending installment
  const sorted = [...installments].sort((a, b) => {
    if (a.installment_no !== b.installment_no) {
      return a.installment_no - b.installment_no
    }
    return a.due_date.localeCompare(b.due_date)
  })

  let nextInstallment: DebtInstallment | InstallmentDraft | null = null

  for (const item of sorted) {
    const amt = parseAmount(item.amount)
    totalAmount += amt

    if (item.status === 'Ödendi') {
      paidCount++
      paidAmount += amt
    } else {
      if (!nextInstallment) {
        nextInstallment = item
      }
      if (normalizeDate(item.due_date) < today) {
        overdueCount++
      }
    }
  }

  totalAmount = Math.round(totalAmount * 100) / 100
  paidAmount = Math.round(paidAmount * 100) / 100
  const remainingAmount = Math.round(Math.max(0, totalAmount - paidAmount) * 100) / 100
  const remainingCount = totalCount - paidCount
  const progressPercent = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0

  return {
    totalCount,
    paidCount,
    remainingCount,
    totalAmount,
    paidAmount,
    remainingAmount,
    nextInstallment,
    overdueCount,
    progressPercent,
  }
}

/**
 * Parses pasted text copied from store websites (like Gencallar) into structured installment drafts.
 * Extracts lines containing a date and an amount.
 */
export function parsePastedSchedule(text: string): InstallmentDraft[] {
  if (!text || !text.trim()) return []

  const lines = text.split(/\r?\n/)
  const results: InstallmentDraft[] = []

  // Regex patterns to detect dates: DD.MM.YYYY, DD/MM/YYYY, or YYYY-MM-DD
  const dateRegex = /(\b\d{1,2}[./]\d{1,2}[./]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b)/
  // Regex to extract currency amounts (e.g. 2.181,94 or 700.45 or 100,00)
  const amountRegex = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:\.\d{1,2})|\d+,\d{1,2})/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const dateMatch = trimmed.match(dateRegex)
    if (!dateMatch) continue

    const matchedDate = normalizeDate(dateMatch[1])
    if (!matchedDate) continue

    // Find the text after the date or search whole line for amount
    const restOfLine = trimmed.slice(trimmed.indexOf(dateMatch[1]) + dateMatch[1].length)
    const amountMatch = restOfLine.match(amountRegex) || trimmed.match(amountRegex)

    if (amountMatch) {
      const amt = parseAmount(amountMatch[1])
      if (amt > 0) {
        results.push({
          installment_no: results.length + 1,
          due_date: matchedDate,
          amount: amt,
          status: 'Bekliyor',
          note: null,
        })
      }
    }
  }

  // Automatically merge any duplicates in the pasted content
  return mergeInstallmentDrafts(results)
}

/**
 * Calculates consolidated totals for multiple debts (e.g. when merging multiple records of Hızır Global AŞ).
 */
export function calculateMergedDebtSummary(debts: Debt[]) {
  if (debts.length === 0) {
    return { principal: 0, past_payments: 0, remaining: 0, status: 'Kapatıldı' as const }
  }
  const principal = debts.reduce((sum, d) => sum + (Number(d.principal) || 0), 0)
  const past = debts.reduce((sum, d) => sum + (Number(d.past_payments) || 0), 0)
  const roundedPrincipal = Math.round(principal * 100) / 100
  const roundedPast = Math.round(past * 100) / 100
  const remaining = Math.round(Math.max(0, roundedPrincipal - roundedPast) * 100) / 100
  return {
    principal: roundedPrincipal,
    past_payments: roundedPast,
    remaining,
    status: remaining <= 0 ? ('Kapatıldı' as const) : ('Açık' as const),
  }
}

/**
 * Sorts debts in a clean, modern way:
 * 1. Open items ('Açık') come first, closed ('Kapatıldı') items come last.
 * 2. If a map of next due dates is supplied, open items with an upcoming due date are ordered earliest first.
 * 3. Falls back to created_at or ID order.
 */
export function sortDebts(
  items: Debt[],
  nextDueDates?: Record<string, string | null>
): Debt[] {
  return [...items].sort((a, b) => {
    // 1. Status: Açık before Kapatıldı
    if (a.status !== b.status) {
      return a.status === 'Açık' ? -1 : 1
    }

    // 2. Next due date if available
    if (nextDueDates) {
      const dueA = nextDueDates[a.id]
      const dueB = nextDueDates[b.id]
      if (dueA && dueB && dueA !== dueB) {
        return dueA.localeCompare(dueB)
      }
      if (dueA && !dueB) return -1
      if (!dueA && dueB) return 1
    }

    // 3. Fallback: created_at descending (newest first)
    if (a.created_at && b.created_at) {
      return b.created_at.localeCompare(a.created_at)
    }

    return 0
  })
}
