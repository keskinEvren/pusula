import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const currencyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const monthYearFormatter = new Intl.DateTimeFormat('tr-TR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatLocalDateInput(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatLocalMonthInput(date = new Date()): string {
  return formatLocalDateInput(date).slice(0, 7)
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '₺0,00'
  return currencyFormatter.format(amount)
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    return dateFormatter.format(date)
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
    const formatted = monthYearFormatter.format(d)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  } catch {
    return monthStr
  }
}

export function slugify(text: string): string {
  if (!text) return ''
  const turkishMap: Record<string, string> = {
    ç: 'c', Ç: 'c',
    ğ: 'g', Ğ: 'g',
    ı: 'i', I: 'i', İ: 'i',
    ö: 'o', Ö: 'o',
    ş: 's', Ş: 's',
    ü: 'u', Ü: 'u',
  }

  let str = text
  for (const [key, val] of Object.entries(turkishMap)) {
    str = str.replaceAll(key, val)
  }

  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isUUID(str: string | null | undefined): boolean {
  if (!str) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
