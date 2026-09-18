export interface SupabaseErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function toMutationError(
  error: SupabaseErrorLike | null | undefined,
  fallback = 'İşlem veritabanında tamamlanamadı.'
): Error {
  if (!error) return new Error(fallback)
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' — ')
  const result = new Error(message || fallback)
  result.name = error.code ? `SupabaseError:${error.code}` : 'SupabaseError'
  return result
}

export function throwOnSupabaseError<T extends { error?: SupabaseErrorLike | null }>(
  result: T,
  fallback?: string
): T {
  if (result.error) throw toMutationError(result.error, fallback)
  return result
}

export function requireMutationData<T>(
  result: { data: T; error?: SupabaseErrorLike | null },
  fallback = 'İşlem backend tarafından doğrulanamadı.'
): NonNullable<T> {
  throwOnSupabaseError(result, fallback)
  if (result.data == null) throw new Error(fallback)
  return result.data as NonNullable<T>
}

export function isMissingRelationError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return (
    (/relation\s+["']?[^"']+["']?\s+does not exist/.test(message)) ||
    (message.includes('could not find the table') && message.includes('schema cache'))
  )
}
