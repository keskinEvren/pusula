import type { ClassificationStatus, ExtractedTransaction, ReconciliationActionType } from './types'
import { matchMerchant } from './merchant-matcher'
import type { Debt, CreditCard, Project, MerchantMapping } from '@/types/database'

export interface ReconciliationSuggestion {
  action: ReconciliationActionType
  type: string
  analysis_group: 'Kişisel' | 'İş' | 'Finansman' | 'Hariç'
  merchant: string
  target_card_id?: string
  target_debt_id?: string
  project_id?: string
  confidence: 'high' | 'medium' | 'low'
  classification_status: ClassificationStatus
  reasons: string[]
}

function findUniqueCardMatch(description: string, creditCards: CreditCard[]): {
  card?: CreditCard
  ambiguous: boolean
} {
  const matchLevels = [
    creditCards.filter((card) => card.last_four && description.includes(card.last_four)),
    creditCards.filter((card) => card.card_name && description.includes(card.card_name.toUpperCase())),
    creditCards.filter((card) => card.bank && description.includes(card.bank.toUpperCase())),
  ]
  const strongestMatches = matchLevels.find((matches) => matches.length > 0) || []
  return {
    card: strongestMatches.length === 1 ? strongestMatches[0] : undefined,
    ambiguous: strongestMatches.length > 1,
  }
}

/**
 * Akıllı Nakit Akışı Uzlaştırma Motoru (Smart Reconciliation Engine)
 * Vadesiz hesap hareketlerini analiz ederek alacak tahsilatı, aile transferi, kart ödemesi veya borç kapatma önerir.
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
  const hasKkToken = /(?:^|\s|[-/])KK(?:$|\s|[-/])/.test(upper)

  // =========================================================================
  // 1. GELEN PARA (INFLOW) UZLAŞTIRMASI
  // =========================================================================
  if (direction === 'inflow') {
    // 1.1. Aile Desteği / Harçlık / Anne-Baba Transferi
    if (
      upper.includes('HALİM KESKİN') ||
      upper.includes('HALIM KESKIN') ||
      upper.includes('ANNE') ||
      upper.includes('BABA') ||
      upper.includes('HARÇLIK') ||
      upper.includes('HARCLIK') ||
      upper.includes('HEDİYE') ||
      upper.includes('HEDIYE')
    ) {
      return {
        action: 'FAMILY_SUPPORT',
        type: 'Gelir',
        analysis_group: 'Hariç',
        merchant: 'Aile Desteği / Transfer',
        confidence: 'high',
        classification_status: 'HIGH_CONFIDENCE',
        reasons: ['Gelen hareket aile desteği anahtar kelimeleriyle eşleşti.'],
      }
    }

    // 1.2. Kredi Kartından Nakit Avans Çekimi (Hesaba Aktarım)
    if (
      upper.includes('NAKİT AVANS') ||
      upper.includes('NAKIT AVANS') ||
          (hasKkToken && upper.includes('AVANS'))
    ) {
      const cardMatch = findUniqueCardMatch(upper, creditCards)
      const matchedCard = cardMatch.card

      return {
        action: 'CASH_ADVANCE',
        type: 'Nakit Avans',
        analysis_group: 'Hariç',
        merchant: matchedCard ? `Nakit Avans (${matchedCard.bank})` : 'Kredi Kartı Nakit Avans',
        target_card_id: matchedCard?.id,
        confidence: matchedCard ? 'high' : 'low',
        classification_status: matchedCard ? 'HIGH_CONFIDENCE' : 'NEEDS_REVIEW',
        reasons: matchedCard
          ? ['Nakit avans ifadesi ve benzersiz kart kimliği eşleşti.']
          : [cardMatch.ambiguous
              ? 'Nakit avans ifadesi birden fazla kartla eşleşti; hedef kart seçilmelidir.'
              : 'Nakit avans ifadesi bulundu ancak hedef kart doğrulanamadı.'],
      }
    }

    const activeReceivables = openDebts.filter(
      (d) => d.type === 'Alacak' && d.status !== 'Kapatıldı'
    )

    // 1.2. Açık Alacak Kayıtları ile İsim Eşleştirmesi (Örn: Hızır Global, Maaş vb.)
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
          analysis_group: 'Hariç',
          merchant: `Tahsilat: ${rec.person_or_entity}`,
          target_debt_id: rec.id,
          confidence: 'high',
          classification_status: 'NEEDS_REVIEW',
          reasons: ['Alacak adı/kategorisi eşleşti; finansal etki kullanıcı onayı gerektirir.'],
        }
      }

      // Tutar Birebir Eşleşmesi (Örn: 204.573 TL)
      if (Math.abs(Number(rec.remaining) - amount) < 1.0) {
        return {
          action: 'COLLECT_RECEIVABLE',
          type: 'Tahsilat',
          analysis_group: 'Hariç',
          merchant: `Tahsilat: ${rec.person_or_entity}`,
          target_debt_id: rec.id,
          confidence: 'high',
          classification_status: 'NEEDS_REVIEW',
          reasons: ['Yalnızca tutar eşleşti; birden fazla gerçek işlem olabileceği için onay gerekir.'],
        }
      }
    }

    // 1.3. Serbest / Genel Gelir
    return {
      action: 'FREE_INCOME',
      type: 'Gelir',
      analysis_group: 'Hariç',
      merchant: rawDescription.replace(/^(?:GELEN\s+EFT|GELEN\s+HAVALE|GELEN\s+FAST)\s*[-:,]?\s*/i, '').trim() || 'Gelen Transfer',
      confidence: 'medium',
      classification_status: 'HIGH_CONFIDENCE',
      reasons: ['Gelen hareket için yüksek riskli bir entity eşleşmesi bulunmadı.'],
    }
  }

  // =========================================================================
  // 2. GİDEN PARA (OUTFLOW) UZLAŞTIRMASI
  // =========================================================================

  // 2.1. Kredi Kartı Borç Ödemesi Tespiti
  if (
    upper.includes('KREDİ KARTI') ||
    upper.includes('KREDI KARTI') ||
    upper.includes('KK TAHSİLAT') ||
    upper.includes('KK TAHSILAT') ||
    (hasKkToken && (upper.includes('ÖDEME') || upper.includes('ODEME') || upper.includes('TAHSİLAT') || upper.includes('TAHSILAT'))) ||
    upper.includes('KK BORÇ') ||
    upper.includes('KK BORC') ||
    upper.includes('KART BORC') ||
    upper.includes('KART ODEME') ||
    upper.includes('KART ÖDEME') ||
    upper.includes('ÖDEME - ENPARA') ||
    upper.includes('ODEME - ENPARA') ||
    upper.includes('TALİMATLI KREDİ KARTI') ||
    upper.includes('TALIMATLI KREDI KARTI')
  ) {
    const cardMatch = findUniqueCardMatch(upper, creditCards)
    const matchedCard = cardMatch.card

    return {
      action: 'CARD_PAYMENT',
      type: 'Kart Ödemesi',
      analysis_group: 'Hariç',
      merchant: matchedCard ? `Kart Ödemesi (${matchedCard.bank})` : 'Kredi Kartı Ödemesi',
      target_card_id: matchedCard?.id,
      confidence: matchedCard ? 'high' : 'low',
      classification_status: matchedCard ? 'HIGH_CONFIDENCE' : 'NEEDS_REVIEW',
      reasons: matchedCard
        ? ['Kart ödeme ifadesi ve benzersiz kart kimliği eşleşti.']
        : [cardMatch.ambiguous
            ? 'Kart ödeme ifadesi birden fazla kartla eşleşti; hedef kart seçilmelidir.'
            : 'Kart ödeme ifadesi bulundu ancak hedef kart doğrulanamadı.'],
    }
  }

  // 2.2. Aileye Gönderilen Para / Harçlık (Borç Değil, Kişisel Gider)
  if (
    upper.includes('ANNE') ||
    upper.includes('BABA') ||
    upper.includes('HARÇLIK') ||
    upper.includes('HARCLIK') ||
    upper.includes('AİLE') ||
    upper.includes('AILE')
  ) {
    return {
      action: 'FAMILY_SUPPORT',
      type: 'Harcama',
      analysis_group: 'Kişisel',
      merchant: 'Aile Desteği / Harçlık',
      confidence: 'high',
      classification_status: 'HIGH_CONFIDENCE',
      reasons: ['Aile desteği anahtar kelimeleri eşleşti; başka finansal entity etkilenmez.'],
    }
  }

  // 2.3. Açık Şahıs Borcu Geri Ödeme Tespiti
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
        classification_status: 'NEEDS_REVIEW',
        reasons: ['Borç sahibi adı eşleşti; borç bakiyesi değişikliği onay gerektirir.'],
      }
    }
  }

  // 2.4. Hesaplar Arası Virman / Transfer
  if (
    upper.includes('VİRMAN') ||
    upper.includes('VIRMAN') ||
    upper.includes('HESAPLAR ARASI') ||
    upper.includes('KENDİ HESABIM')
  ) {
    return {
      action: 'INTERNAL_TRANSFER',
      type: 'Transfer',
      analysis_group: 'Hariç',
      merchant: 'Hesaplar Arası Transfer',
      confidence: 'high',
      classification_status: 'NEEDS_REVIEW',
      reasons: ['İç transfer ifadesi bulundu; hedef hesap doğrulanmalıdır.'],
    }
  }

  // 2.5. Yatırım & Varlık Transferi Tespiti (Borsa, Aracı Kurum, Kripto, Altın/Fon)
  if (
    upper.includes('YATIRIM') ||
    upper.includes('MIDAS') ||
    upper.includes('MİDAS') ||
    upper.includes('BINANCE') ||
    upper.includes('BİNANCE') ||
    upper.includes('BTCTURK') ||
    upper.includes('PARIBU') ||
    upper.includes('PARİBU') ||
    upper.includes('ALTIN ALIŞ') ||
    upper.includes('ALTIN ALIS') ||
    upper.includes('KIYMETLİ MADEN') ||
    upper.includes('KIYMETLI MADEN') ||
    upper.includes('FON ALIŞ') ||
    upper.includes('FON ALIS') ||
    upper.includes('TEFAS') ||
    upper.includes('BORSA') ||
    upper.includes('HİSSE') ||
    upper.includes('HISSE') ||
    upper.includes('DÖVİZ ALIŞ') ||
    upper.includes('DOVIZ ALIS')
  ) {
    const matched = matchMerchant(rawDescription, userMappings)
    return {
      action: 'INVESTMENT_TRANSFER',
      type: 'Transfer',
      analysis_group: 'Hariç',
      merchant: matched.merchant || 'Yatırım / Varlık Transferi',
      project_id: matched.project_id,
      confidence: 'high',
      classification_status: 'HIGH_CONFIDENCE',
      reasons: ['Yatırım kuruluşu veya varlık transferi ifadesi eşleşti.'],
    }
  }

  // 2.6. Doğrudan FAST / EFT ile Harcama veya Eşleşen Diğer Transferler
  const { merchant, analysis_group, type: mappedType, project_id } = matchMerchant(rawDescription, userMappings)

  if (analysis_group === 'Hariç') {
    return {
      action: mappedType === 'Transfer' ? 'INTERNAL_TRANSFER' : 'CARD_PAYMENT',
      type: mappedType || 'Transfer',
      analysis_group: 'Hariç',
      merchant,
      project_id,
      confidence: 'high',
      classification_status: mappedType === 'Transfer' ? 'HIGH_CONFIDENCE' : 'NEEDS_REVIEW',
      reasons: mappedType === 'Transfer'
        ? ['Kullanıcı veya merchant kuralı işlemi tüketim dışı transfer olarak eşledi.']
        : ['Yüksek riskli ödeme sınıflandırması için yapılandırılmış hedef kanıtı eksik.'],
    }
  }

  return {
    action: 'DIRECT_EXPENSE',
    type: mappedType || 'Harcama',
    analysis_group,
    merchant,
    project_id,
    confidence: 'medium',
    classification_status: 'HIGH_CONFIDENCE',
    reasons: ['Yüksek riskli bir finansal eşleşme bulunmadı; normal gider olarak önerildi.'],
  }
}
