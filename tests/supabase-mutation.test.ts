import { describe, expect, it } from 'vitest'
import { isMissingRelationError, requireMutationData, throwOnSupabaseError } from '@/lib/supabase/mutation'

describe('Supabase mutation guards', () => {
  it.each(['400', '401', '403', '409', '500'])('throws for returned backend %s errors', (status) => {
    expect(() => throwOnSupabaseError({ error: { code: status, message: `HTTP ${status}` } })).toThrow(`HTTP ${status}`)
  })

  it('requires a returned row as backend confirmation', () => {
    expect(() => requireMutationData({ data: null, error: null })).toThrow('backend tarafından doğrulanamadı')
    expect(requireMutationData({ data: { id: 'ok' }, error: null })).toEqual({ id: 'ok' })
  })

  it('only classifies actual missing-relation responses as schema fallback', () => {
    expect(isMissingRelationError({ code: '42P01', message: 'relation does not exist' })).toBe(true)
    expect(isMissingRelationError({ code: 'PGRST205', message: 'Could not find the table in schema cache' })).toBe(true)
    expect(isMissingRelationError({ code: '500', message: 'Internal server error' })).toBe(false)
    expect(isMissingRelationError({ code: '42501', message: 'RLS policy denied' })).toBe(false)
  })
})
