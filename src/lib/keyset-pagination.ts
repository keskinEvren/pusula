/**
 * Keyset (Cursor-Based) Pagination Helper for Supabase / PostgreSQL
 */

export type KeysetCursor =
  | { field: 'date'; date: string; id: string }
  | { field: 'amount'; amount: number; id: string }

export interface PaginationResult<T> {
  items: T[]
  hasMore: boolean
  nextCursor: KeysetCursor | null
}

/**
 * Parses raw items from a pageSize + 1 query, extracts next cursor and slices items.
 * Guarantees that returned items length is <= pageSize.
 */
export function parsePageResults<T extends { id: string; date?: string | null; amount?: number | null }>(
  rawItems: T[],
  pageSize: number,
  sortField: 'date' | 'amount'
): PaginationResult<T> {
  if (rawItems.length > pageSize) {
    const items = rawItems.slice(0, pageSize)
    const lastItem = items[items.length - 1]
    const nextCursor: KeysetCursor =
      sortField === 'date'
        ? { field: 'date', date: lastItem.date || '', id: lastItem.id }
        : { field: 'amount', amount: Number(lastItem.amount || 0), id: lastItem.id }

    return {
      items,
      hasMore: true,
      nextCursor,
    }
  }

  return {
    items: rawItems,
    hasMore: false,
    nextCursor: null,
  }
}

/**
 * Appends incoming page items to existing items, deduplicating by unique ID.
 * Prevents duplicates caused by concurrent mutations crossing cursor boundaries.
 */
export function deduplicateById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((item) => item.id))
  const uniqueIncoming = incoming.filter((item) => !seen.has(item.id))
  return [...existing, ...uniqueIncoming]
}

/**
 * Converts a 'YYYY-MM' string into an indexed, sargable [start, end) date range.
 * date >= start AND date < end
 */
export function getMonthDateRange(
  monthStr: string | null | undefined
): { start: string; end: string } | null {
  if (!monthStr || monthStr === 'ALL' || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return null
  }
  const [yearStr, monthNumStr] = monthStr.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthNumStr, 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null

  const start = `${yearStr}-${monthNumStr.padStart(2, '0')}-01`

  let nextYear = year
  let nextMonth = month + 1
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear += 1
  }
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

/**
 * Builds the PostgREST keyset condition string for .or()
 */
export function buildKeysetFilter(
  cursor: KeysetCursor,
  sortOrder: 'asc' | 'desc'
): string {
  const isAsc = sortOrder === 'asc'

  if (cursor.field === 'date') {
    const op = isAsc ? 'gt' : 'lt'
    return `date.${op}.${cursor.date},and(date.eq.${cursor.date},id.${op}.${cursor.id})`
  } else {
    const op = isAsc ? 'gt' : 'lt'
    return `amount.${op}.${cursor.amount},and(amount.eq.${cursor.amount},id.${op}.${cursor.id})`
  }
}
