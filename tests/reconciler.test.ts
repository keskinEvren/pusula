import { describe, it, expect } from 'vitest'
import { reconcileBankMovement, parseBankAccountLines } from '../src/lib/parser'
import type { Debt, CreditCard } from '../src/types/database'

describe('Pusula Akıllı Uzlaştırma & Vadesiz Hesap Motoru (Reconciler Tests)', () => {
  const mockDebts: Debt[] = [
    {
      id: 'debt-rec-1',
      user_id: 'u1',
      type: 'Alacak',
      category: 'Maaş',
      person_or_entity: 'Hızır Global A.Ş.',
      description: 'Maaş Hakedişi',
      principal: 204573.0,
      past_payments: 0,
      remaining: 204573.0,
      status: 'Açık',
      linked_account_id: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'debt-rec-2',
      user_id: 'u1',
      type: 'Alacak',
      category: 'Danışmanlık',
      person_or_entity: 'Ahmet Yılmaz',
      description: 'Freelance Danışmanlık',
      principal: 15000.0,
      past_payments: 0,
      remaining: 15000.0,
      status: 'Açık',
      linked_account_id: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'debt-pay-1',
      user_id: 'u1',
      type: 'Borç',
      category: 'Kişisel Borç',
      person_or_entity: 'Abla Borcu',
      description: 'Elden alınan borç',
      principal: 50000.0,
      past_payments: 0,
      remaining: 50000.0,
      status: 'Açık',
      linked_account_id: null,
      created_at: '',
      updated_at: '',
    },
  ]

  const mockCards: CreditCard[] = [
    {
      id: 'card-enpara',
      user_id: 'u1',
      bank: 'Enpara',
      card_name: 'Kredi Kartı • 2039',
      last_four: '2039',
      current_debt: 26969.24,
      statement_debt: 26969.24,
      minimum_payment: 5000.0,
      interest_fees: 100.0,
      statement_date: '2026-08-19',
      due_date: '2026-08-31',
      status_note: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'card-akbank',
      user_id: 'u1',
      bank: 'Akbank',
      card_name: 'Axess Platinum • 1697',
      last_four: '1697',
      current_debt: 21969.86,
      statement_debt: 21969.86,
      minimum_payment: 4000.0,
      interest_fees: 0,
      statement_date: '2026-08-15',
      due_date: '2026-08-25',
      status_note: null,
      created_at: '',
      updated_at: '',
    },
  ]

  describe('1. Gelen Para (Inflow) Uzlaştırma Kuralları', () => {
    it('1.1. Maaş / Hakediş EFT Girişi: İsim eşleşmesiyle Alacak kaydını bulur ve Tahsilat önerir', () => {
      const res = reconcileBankMovement(
        'GELEN EFT - HIZIR GLOBAL A.S. MAAS ODEMESI',
        50000.0,
        'inflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('COLLECT_RECEIVABLE')
      expect(res.type).toBe('Tahsilat')
      expect(res.analysis_group).toBe('Gelir')
      expect(res.target_debt_id).toBe('debt-rec-1')
      expect(res.confidence).toBe('high')
    })

    it('1.2. Tutar Eşleşmesiyle Alacak Tahsilatı: İsim net olmasa bile tutar birebir eşleştiğinde alacak önerir', () => {
      const res = reconcileBankMovement(
        'GELEN FAST - 11458932 TRANSFER',
        15000.0, // Ahmet Yılmaz alacak bakiyesiyle birebir eşleşiyor
        'inflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('COLLECT_RECEIVABLE')
      expect(res.target_debt_id).toBe('debt-rec-2')
      expect(res.analysis_group).toBe('Gelir')
    })

    it('1.3. Serbest Gelir: Tanımsız gelen para serbest gelir olarak sınıflandırılır', () => {
      const res = reconcileBankMovement(
        'GELEN FAST - MEHMET CAN BEY',
        2500.0,
        'inflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('FREE_INCOME')
      expect(res.type).toBe('Gelir')
      expect(res.analysis_group).toBe('Gelir')
    })
  })

  describe('2. Giden Para (Outflow) Uzlaştırma Kuralları', () => {
    it('2.1. Kredi Kartı Borç Ödemesi: Harcama mükerrerliğini önlemek için Hariç grubuna ve karta atanır', () => {
      const res = reconcileBankMovement(
        'ENPARA.COM KREDİ KARTI BORÇ ÖDEMESİ',
        26969.24,
        'outflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('CARD_PAYMENT')
      expect(res.type).toBe('Kart Ödemesi')
      expect(res.analysis_group).toBe('Hariç')
      expect(res.target_card_id).toBe('card-enpara')
    })

    it('2.2. Akbank Axess Borç Ödemesi: Kart adını eşleştirir', () => {
      const res = reconcileBankMovement(
        'AKBANK AXESS KART BORCU ODEME',
        10000.0,
        'outflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('CARD_PAYMENT')
      expect(res.target_card_id).toBe('card-akbank')
      expect(res.analysis_group).toBe('Hariç')
    })

    it('2.3. Şahıs Borcu Geri Ödeme: Borçlu kişi adını eşleştirip Borç Ödemesi olarak atar', () => {
      const res = reconcileBankMovement(
        'GİDEN FAST - ABLA BORCU ODEME',
        5000.0,
        'outflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('PAY_DEBT')
      expect(res.type).toBe('Borç Ödemesi')
      expect(res.analysis_group).toBe('Hariç')
      expect(res.target_debt_id).toBe('debt-pay-1')
    })

    it('2.4. Hesaplar Arası Virman: Transfer olarak işaretler', () => {
      const res = reconcileBankMovement(
        'HESAPLAR ARASI VİRMAN TRANSFER',
        20000.0,
        'outflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('INTERNAL_TRANSFER')
      expect(res.type).toBe('Transfer')
      expect(res.analysis_group).toBe('Hariç')
    })

    it('2.5. Doğrudan FAST / Nakit Harcama: Kira, noter veya alışverişi Harcama olarak işler', () => {
      const res = reconcileBankMovement(
        'GİDEN FAST - KİRA BEDELİ TEMMUZ',
        18000.0,
        'outflow',
        mockDebts,
        mockCards
      )

      expect(res.action).toBe('DIRECT_EXPENSE')
      expect(res.type).toBe('Harcama')
      expect(res.analysis_group).toBe('Kişisel')
    })
  })

  describe('3. Çoklu Satır Vadesiz Hesap Dökümü Ayrıştırma', () => {
    const rawBankStatementText = `
      GARANTI BBVA VADESIZ TL HESAP OZETI
      Hesap No: 12345678
      Açılış Bakiyesi: 15.000,00 TL
      01.08.2026 GELEN EFT - HIZIR GLOBAL A.S. MAAS + 50.000,00 TL
      02.08.2026 ENPARA.COM KREDI KARTI BORC ODEME - 20.000,00 TL
      03.08.2026 GIDEN FAST - ABLA BORCU ODEME - 5.000,00 TL
      05.08.2026 GIDEN FAST - EV SAHIBI KIRA BEDELI - 15.000,00 TL
    `

    it('3.1. Çoklu Satır Döküm: Girişleri ve çıkışları doğru yönleriyle yakalar ve uzlaştırır', () => {
      const txs = parseBankAccountLines(rawBankStatementText, mockDebts, mockCards)

      expect(txs).toHaveLength(4)

      // 1. Maaş
      expect(txs[0].amount).toBe(50000.0)
      expect(txs[0].direction).toBe('inflow')
      expect(txs[0].action).toBe('COLLECT_RECEIVABLE')
      expect(txs[0].target_debt_id).toBe('debt-rec-1')

      // 2. Kart Ödemesi
      expect(txs[1].amount).toBe(20000.0)
      expect(txs[1].direction).toBe('outflow')
      expect(txs[1].action).toBe('CARD_PAYMENT')
      expect(txs[1].target_card_id).toBe('card-enpara')

      // 3. Abla Borcu
      expect(txs[2].amount).toBe(5000.0)
      expect(txs[2].direction).toBe('outflow')
      expect(txs[2].action).toBe('PAY_DEBT')
      expect(txs[2].target_debt_id).toBe('debt-pay-1')

      // 4. Kira Harcaması
      expect(txs[3].amount).toBe(15000.0)
      expect(txs[3].direction).toBe('outflow')
      expect(txs[3].action).toBe('DIRECT_EXPENSE')
      expect(txs[3].analysis_group).toBe('Kişisel')
    })
  })
})
