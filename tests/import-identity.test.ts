import { describe, expect, it } from 'vitest'
import { buildTransactionIdentity, canApplyFinancialEffect } from '@/lib/import-identity'
import type { ExtractedTransaction } from '@/lib/parser/types'

const base: ExtractedTransaction = {
  id: 'row-1',
  date: '2026-09-17',
  raw_description: '  Market   alışverişi ',
  merchant: 'Market',
  amount: 125.5,
  type: 'Harcama',
  analysis_group: 'Kişisel',
  direction: 'outflow',
  confidence: 'high',
  selected: true,
}

describe('transaction import identity', () => {
  it('normalizes equivalent descriptions deterministically', async () => {
    const first = await buildTransactionIdentity(base, { sourceBank: 'Banka', sourceAccountRef: 'TR01' })
    const second = await buildTransactionIdentity(
      { ...base, raw_description: 'MARKET ALIŞVERİŞİ' },
      { sourceBank: 'banka', sourceAccountRef: 'tr01' }
    )
    expect(first.weakFingerprint).toBe(second.weakFingerprint)
    expect(first.strength).toBe('weak')
  })

  it('uses reference or balance as strong evidence', async () => {
    const first = await buildTransactionIdentity(
      { ...base, external_reference: 'REF-1' },
      { sourceBank: 'Banka', sourceAccountRef: 'TR01' }
    )
    const second = await buildTransactionIdentity(
      { ...base, external_reference: 'REF-2' },
      { sourceBank: 'Banka', sourceAccountRef: 'TR01' }
    )
    expect(first.strength).toBe('strong')
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint)
    expect(first.weakFingerprint).toBe(second.weakFingerprint)
  })

  it('requires a confirmed target before high-risk financial effects', () => {
    expect(canApplyFinancialEffect({ ...base, action: 'CARD_PAYMENT', classification_status: 'NEEDS_REVIEW' })).toBe(false)
    expect(canApplyFinancialEffect({
      ...base,
      action: 'CARD_PAYMENT',
      classification_status: 'CONFIRMED',
      target_card_id: 'card-1',
    })).toBe(true)
  })
})
