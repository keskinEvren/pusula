import type { ExtractedTransaction, FingerprintStrength } from './parser/types'
import { calculateFileHash } from './hash'

export const IMPORT_FINGERPRINT_VERSION = 'v1'
export const IMPORT_PARSER_VERSION = '2026-09-risk-aware-v1'

export interface ImportIdentityContext {
  sourceBank?: string | null
  sourceAccountRef?: string | null
}

export interface TransactionIdentity {
  sourceFingerprint: string
  weakFingerprint: string
  strength: FingerprintStrength
}

function canonicalText(value: string | null | undefined): string {
  return (value || '')
    .toLocaleUpperCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ÇĞİÖŞÜ]/g, (letter) => ({ Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' })[letter] || letter)
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalAmount(amount: number): string {
  return Number(amount).toFixed(2)
}

export async function buildTransactionIdentity(
  transaction: ExtractedTransaction,
  context: ImportIdentityContext
): Promise<TransactionIdentity> {
  const sourceBank = canonicalText(context.sourceBank)
  const sourceAccountRef = canonicalText(context.sourceAccountRef)
  const description = canonicalText(transaction.raw_description)
  const direction = transaction.direction || (transaction.type === 'Gelir' ? 'inflow' : 'outflow')
  const amount = canonicalAmount(transaction.amount)
  const externalReference = canonicalText(transaction.external_reference)
  const hasBalance = Number.isFinite(transaction.balance_after)
  const balanceAfter = hasBalance ? canonicalAmount(transaction.balance_after as number) : ''

  const weakCanonical = [
    IMPORT_FINGERPRINT_VERSION,
    sourceBank,
    sourceAccountRef,
    transaction.date,
    direction,
    amount,
    description,
  ].join('|')

  const strongEvidence = externalReference || balanceAfter
  const strongCanonical = [weakCanonical, externalReference, balanceAfter].join('|')

  return {
    sourceFingerprint: await calculateFileHash(strongCanonical),
    weakFingerprint: await calculateFileHash(weakCanonical),
    strength: strongEvidence ? 'strong' : 'weak',
  }
}

export async function attachTransactionIdentities(
  transactions: ExtractedTransaction[],
  context: ImportIdentityContext
): Promise<ExtractedTransaction[]> {
  return Promise.all(
    transactions.map(async (transaction) => {
      const identity = await buildTransactionIdentity(transaction, context)
      return {
        ...transaction,
        source_fingerprint: identity.sourceFingerprint,
        weak_fingerprint: identity.weakFingerprint,
        fingerprint_strength: identity.strength,
        duplicate_status: transaction.duplicate_status || 'NEW',
      }
    })
  )
}

export function isHighRiskAction(action: ExtractedTransaction['action']): boolean {
  return action === 'CARD_PAYMENT' ||
    action === 'CASH_ADVANCE' ||
    action === 'PAY_DEBT' ||
    action === 'COLLECT_RECEIVABLE'
}

export function canApplyFinancialEffect(transaction: ExtractedTransaction): boolean {
  if (!isHighRiskAction(transaction.action)) return true
  if (transaction.classification_status !== 'CONFIRMED' && transaction.classification_status !== 'HIGH_CONFIDENCE') {
    return false
  }
  if (transaction.action === 'CARD_PAYMENT' || transaction.action === 'CASH_ADVANCE') {
    return Boolean(transaction.target_card_id)
  }
  return Boolean(transaction.target_debt_id)
}
