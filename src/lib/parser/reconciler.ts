import type { ExtractedTransaction, ReconciliationActionType } from './types'
import { matchMerchant } from './merchant-matcher'
import type { Debt, CreditCard, Project, MerchantMapping } from '@/types/database'

export interface ReconciliationSuggestion {
  action: ReconciliationActionType
  type: string
  analysis_group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç' | 'Gelir'
  merchant: string
  target_card_id?: string
  target_debt_id?: string
  project_id?: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Akıllı Nakit Akışı Uzlaştırma Motoru (Smart Reconciliation Engine)
 * Vadesiz hesap hareketlerini analiz ederek alacak tahsilatı, kart ödemesi veya borç kapatma önerir.
 */
export function reconcileBankMovement(
  rawDescription: string,
  amount: number,
  direction: 'inflow' | 'outflow',
  openDebts: Debt[] = [],
  creditCards: CreditCard[] = [],
  userMappings: MerchantMapping[] = []
): ReconciliationSuggestion {
  const upper = rawDescription.toUpperCase().trim()

  // =========================================================================
  // 1. GELEN PARA (INFLOW) UZLAŞTIRMASI
  // =========================================================================
  if (direction === 'inflow') {
    const activeReceivables = openDebts.filter(
      (d) => d.type === 'Alacak' && d.status !== 'Kapatıldı'
    )

    // 1.1. Açık Alacak Kayıtları ile İsim Eşleştirmesi (Örn: Hızır Global, Maaş vb.)
    for (const rec of activeReceivables) {
      const entityUpper = rec.person_or_entity.toUpperCase()
      const categoryUpper = rec.category.toUpperCase()

      if (
        (entityUpper && upper.includes(entityUpper)) ||
        (categoryUpper && upper.includes(categoryUpper)) ||
        (upper.includes('MAAS') || upper.includes('MAAŞ') || upper.includes('HAKEDİŞ') || upper.includes('HAKEDIS'))
      ) {
        return {
          action: 'COLLECT_RECEIVABLE',
          type: 'Tahsilat',
          analysis_group: 'Gelir',
          merchant: `Tahsilat: ${rec.person_or_entity}`,
          target_debt_id: rec.id,
          confidence: 'high',
        }
      }

      // Tutar Birebir Eşleşmesi (Örn: 204.573 TL)
      if (Math.abs(Number(rec.remaining) - amount) < 1.0) {
        return {
          action: 'COLLECT_RECEIVABLE',
          type: 'Tahsilat',
          analysis_group: 'Gelir',
          merchant: `Tahsilat: ${rec.person_or_entity}`,
          target_debt_id: rec.id,
          confidence: 'high',
        }
      }
    }

    // 1.2. Serbest / Genel Gelir
    return {
      action: 'FREE_INCOME',
      type: 'Gelir',
      analysis_group: 'Gelir',
      merchant: rawDescription.replace(/^(?:GELEN\s+EFT|GELEN\s+HAVALE|GELEN\s+FAST)\s*[-:]?\s*/i, '').trim() || 'Gelen Transfer',
      confidence: 'medium',
    }
  }

  // =========================================================================
  // 2. GİDEN PARA (OUTFLOW) UZLAŞTIRMASI
  // =========================================================================

  // 2.1. Kredi Kartı Borç Ödemesi Tespiti (Örn: Enpara Kredi Kartı Borç Ödeme, Axess Ödeme)
  if (
    upper.includes('KREDİ KARTI') ||
    upper.includes('KREDI KARTI') ||
    upper.includes('KART BORC') ||
    upper.includes('KART ODEME') ||
    upper.includes('KART ÖDEME') ||
    upper.includes('ÖDEME - ENPARA') ||
    upper.includes('ODEME - ENPARA')
  ) {
    // Eşleşen kartı bul
    let matchedCard = creditCards.find(
      (c) =>
        upper.includes(c.bank.toUpperCase()) ||
        (c.last_four && upper.includes(c.last_four)) ||
        upper.includes(c.card_name.toUpperCase())
    )

    if (!matchedCard && creditCards.length > 0) {
      matchedCard = creditCards[0] // İlk kartı varsayılan öner
    }

    return {
      action: 'CARD_PAYMENT',
      type: 'Kart Ödemesi',
      analysis_group: 'Hariç', // Mükerrer harcama yazılmasını önler!
      merchant: matchedCard ? `Kart Ödemesi (${matchedCard.bank})` : 'Kredi Kartı Ödemesi',
      target_card_id: matchedCard?.id,
      confidence: 'high',
    }
  }

  // 2.2. Açık Şahıs Borcu Geri Ödeme Tespiti (Örn: Abla Borcu, Mehmet Borç)
  const activeDebts = openDebts.filter(
    (d) => d.type === 'Borç' && d.status !== 'Kapatıldı'
  )

  for (const debt of activeDebts) {
    const personUpper = debt.person_or_entity.toUpperCase()
    if (personUpper && upper.includes(personUpper)) {
      return {
        action: 'PAY_DEBT',
        type: 'Borç Ödemesi',
        analysis_group: 'Hariç',
        merchant: `Borç Ödemesi: ${debt.person_or_entity}`,
        target_debt_id: debt.id,
        confidence: 'high',
      }
    }
  }

  // 2.3. Hesaplar Arası Virman / Transfer
  if (upper.includes('VİRMAN') || upper.includes('VIRMAN') || upper.includes('HESAPLAR ARASI')) {
    return {
      action: 'INTERNAL_TRANSFER',
      type: 'Transfer',
      analysis_group: 'Hariç',
      merchant: 'Hesaplar Arası Transfer',
      confidence: 'high',
    }
  }

  // 2.4. Doğrudan FAST / EFT ile Harcama (Kira, Noter, Alışveriş vb.)
  const { merchant, analysis_group, type: mappedType, project_id } = matchMerchant(rawDescription, userMappings)

  return {
    action: 'DIRECT_EXPENSE',
    type: mappedType || 'Harcama',
    analysis_group: (analysis_group === 'Hariç' ? 'Kişisel' : analysis_group) as any,
    merchant,
    project_id,
    confidence: 'medium',
  }
}
