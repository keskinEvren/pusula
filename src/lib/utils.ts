import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '₺0,00'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return dateString
  }
}

export function formatMonthYear(monthStr: string | null | undefined): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr || '-'
  try {
    const [year, month] = monthStr.split('-').map(Number)
    if (!year || !month) return monthStr
    const d = new Date(Date.UTC(year, month - 1, 1))
    const formatted = new Intl.DateTimeFormat('tr-TR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  } catch {
    return monthStr
  }
}

