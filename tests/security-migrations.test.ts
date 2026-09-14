import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/013_lock_down_financial_rpcs.sql', import.meta.url),
  'utf8'
)

describe('financial RPC authorization migration', () => {
  it('privileged RPC execution is revoked from public and anon', () => {
    const privilegedFunctions = [
      'rollback_statement_import',
      'fn_record_expense_atomic',
      'fn_record_income_atomic',
      'fn_record_transfer_atomic',
      'fn_delete_transaction_atomic',
      'fn_link_transaction_to_debt_atomic',
    ]

    for (const functionName of privilegedFunctions) {
      expect(migration).toContain(`revoke all on function public.${functionName}`)
    }
  })
})
