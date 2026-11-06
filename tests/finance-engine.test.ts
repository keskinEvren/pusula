import { describe, it, expect, vi } from 'vitest'
import {
  round2,
  calculateNetWorth,
  calculateStatementChange,
  calculateCardStatementRemaining,
  calculateSpendingBreakdown,
  projectSixMonthCashLoad,
  calculateDcaAverageCost,
  calculateMonthlyCashFlow,
  calculatePortfolioMetrics,
  calculateSubscriptionEquivalent,
  normalizeSubscriptionPeriod,
  safeParseAmount,
  calculateIncomeMetrics,
  calculateMonthlyBudgetBalance,
  calculateAccountYield,
  calculateAccountsYieldSummary,
} from '@/lib/finance-engine'

vi.mock('@/lib/supabase/client')

describe('finance-engine', () => {
  describe('round2', () => {
    it('IEEE-754 precision sorununu çözer (0.1 + 0.2 -> 0.3)', () => {
      expect(round2(0.1 + 0.2)).toBe(0.3)
    })
  })

  describe('calculateNetWorth', () => {
    it('standart pozitif net varlık hesaplar: hesaplar + yatırımlar - borçlar - kartlar', () => {
      const accounts = [{ balance: 1000 }]
      const debts = [{ type: 'Alacak', remaining: 500, status: 'Aktif' }, { type: 'Borç', remaining: 200, status: 'Aktif' }]
      const cards = [{ current_debt: 300 }]
      const investments = [{ quantity: 10, current_price: 50 }]

      const result = calculateNetWorth(accounts, debts, cards, investments)
      expect(result.netWorth).toBe(1500)
      expect(result.totalCash).toBe(1000)
      expect(result.totalReceivables).toBe(500)
      expect(result.totalInvestments).toBe(500)
      expect(result.totalCardDebt).toBe(300)
      expect(result.totalOtherDebt).toBe(200)
      expect(result.totalDebt).toBe(500)
    })

    it('negatif net varlık durumunu doğru hesaplar', () => {
      const result = calculateNetWorth(
        [{ balance: 100 }],
        [{ type: 'Borç', remaining: 1000, status: 'Aktif' }],
        [{ current_debt: 500 }],
        []
      )
      expect(result.netWorth).toBe(-1400)
    })

    it('kapatılmış borçları hariç tutar', () => {
      const result = calculateNetWorth(
        [{ balance: 100 }],
        [
          { type: 'Borç', remaining: 1000, status: 'Kapatıldı' },
          { type: 'Alacak', remaining: 500, status: 'Kapatıldı' }
        ],
        [],
        []
      )
      expect(result.netWorth).toBe(100)
    })

    it('boş diziler girildiğinde sıfır değerleri döner', () => {
      const result = calculateNetWorth([], [], [], [])
      expect(result.netWorth).toBe(0)
      expect(result.totalCash).toBe(0)
      expect(result.totalReceivables).toBe(0)
      expect(result.totalInvestments).toBe(0)
      expect(result.totalCardDebt).toBe(0)
      expect(result.totalOtherDebt).toBe(0)
      expect(result.totalDebt).toBe(0)
    })
  })

  describe('calculateStatementChange', () => {
    it('artış olduğunda UP trendi döner', () => {
      const result = calculateStatementChange(1500, 1000)
      expect(result.trend).toBe('UP')
      expect(result.changeAmount).toBe(500)
      expect(result.changePct).toBe(50)
    })

    it('azalış olduğunda DOWN trendi döner', () => {
      const result = calculateStatementChange(800, 1000)
      expect(result.trend).toBe('DOWN')
      expect(result.changeAmount).toBe(-200)
      expect(result.changePct).toBe(-20)
    })

    it('değişim olmadığında STABLE trendi döner', () => {
      const result = calculateStatementChange(1000, 1000)
      expect(result.trend).toBe('STABLE')
      expect(result.changeAmount).toBe(0)
      expect(result.changePct).toBe(0)
    })

    it('önceki dönem verisi yoksa veya 0 ise NONE trendi döner', () => {
      const result = calculateStatementChange(1000, 0)
      expect(result.trend).toBe('NONE')
      expect(result.changeAmount).toBeNull()
      expect(result.changePct).toBeNull()
    })
  })

  describe('calculateCardStatementRemaining', () => {
    it('kısmi ara ödeme yapıldığında kalan ekstre ve kalan asgari tutarı doğru hesaplar', () => {
      const res = calculateCardStatementRemaining(1000, 400, 200)
      expect(res.remainingStatementDebt).toBe(600)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(false)
    })

    it('asgari ödeme tutarının altında ara ödeme yapıldığında kalan asgari tutarı azaltır', () => {
      const res = calculateCardStatementRemaining(1000, 100, 300)
      expect(res.remainingStatementDebt).toBe(900)
      expect(res.remainingMinimumPayment).toBe(200)
      expect(res.isFullyPaid).toBe(false)
    })

    it('tam ekstre kapandığında isFullyPaid true döner ve kalan borçlar 0 olur', () => {
      const res = calculateCardStatementRemaining(1500.50, 1500.50, 300)
      expect(res.remainingStatementDebt).toBe(0)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(true)
    })

    it('ekstre tutarından fazla ödeme yapıldığında kalan tutarlar negatife düşmez', () => {
      const res = calculateCardStatementRemaining(1000, 1500, 200)
      expect(res.remainingStatementDebt).toBe(0)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(true)
    })

    it('kuruş hassasiyeti (floating point rounding) ile tam hesaplar', () => {
      const res = calculateCardStatementRemaining(100.1, 100.09, 20.05)
      expect(res.remainingStatementDebt).toBe(0.01)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(false)
    })

    it('sıfır veya tanımsız ekstre borcunda isFullyPaid false ve kalanlar 0 döner', () => {
      const res = calculateCardStatementRemaining(0, 0, 0)
      expect(res.remainingStatementDebt).toBe(0)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(false)

      const resNull = calculateCardStatementRemaining(null, null, null)
      expect(resNull.remainingStatementDebt).toBe(0)
      expect(resNull.remainingMinimumPayment).toBe(0)
      expect(resNull.isFullyPaid).toBe(false)
    })

    it('currentDebt verildiğinde ve ekstre borcundan küçük olduğunda kalan borçları güncel borç ile sınırlar', () => {
      // Örnek: Ekstre 1000 TL, hiç ödenmedi, ancak iade/düzeltme ile kartın güncel borcu 300 TL'ye düştü
      const res = calculateCardStatementRemaining(1000, 0, 200, 300)
      expect(res.remainingStatementDebt).toBe(300)
      expect(res.remainingMinimumPayment).toBe(200)
      expect(res.isFullyPaid).toBe(false)

      // Kalan asgari borç da güncel borcu aşamaz
      const resMinCapped = calculateCardStatementRemaining(1000, 0, 500, 150)
      expect(resMinCapped.remainingStatementDebt).toBe(150)
      expect(resMinCapped.remainingMinimumPayment).toBe(150)
      expect(resMinCapped.isFullyPaid).toBe(false)
    })

    it('currentDebt 0 olduğunda kart borcu sıfırlandığı için isFullyPaid true döner', () => {
      const res = calculateCardStatementRemaining(1000, 400, 200, 0)
      expect(res.remainingStatementDebt).toBe(0)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(true)
    })

    it('currentDebt ekstre borcundan büyük olduğunda (dönem içi harcamalar) ekstre borcunu bozmaz', () => {
      const res = calculateCardStatementRemaining(1000, 400, 200, 2500)
      expect(res.remainingStatementDebt).toBe(600)
      expect(res.remainingMinimumPayment).toBe(0)
      expect(res.isFullyPaid).toBe(false)
    })
  })

  describe('calculateSpendingBreakdown', () => {
    it('Kişisel, İş ve Finansman gruplarını doğru toparlar', () => {
      const transactions = [
        { type: 'Gider', analysis_group: 'Kişisel', amount: 100 },
        { type: 'Gider', analysis_group: 'İş', amount: 200 },
        { type: 'Gider', analysis_group: 'Finansman', amount: 50 }
      ]
      const result = calculateSpendingBreakdown(transactions)
      expect(result.personal).toBe(100)
      expect(result.business).toBe(200)
      expect(result.financing).toBe(50)
      expect(result.totalConsumption).toBe(350)
    })

    it('kart ödemesi ve transferleri hariç tutar (excluded)', () => {
      const transactions = [
        { type: 'Kart Ödemesi', analysis_group: 'Kişisel', amount: 500 },
        { type: 'Transfer', analysis_group: 'İş', amount: 1000 }
      ]
      const result = calculateSpendingBreakdown(transactions)
      expect(result.excluded).toBe(1500)
      expect(result.totalConsumption).toBe(0)
    })

    it('iade işlemlerini gruptan düşer', () => {
      const transactions = [
        { type: 'Gider', analysis_group: 'Kişisel', amount: 300 },
        { type: 'İade', analysis_group: 'Kişisel', amount: 100 },
        { type: 'Gider', analysis_group: 'İş', amount: -50 }
      ]
      const result = calculateSpendingBreakdown(transactions)
      expect(result.personal).toBe(200)
      expect(result.business).toBe(-50)
    })

    it('boş dizi için tüm alanları sıfır döner', () => {
      const result = calculateSpendingBreakdown([])
      expect(result.personal).toBe(0)
      expect(result.business).toBe(0)
      expect(result.financing).toBe(0)
      expect(result.excluded).toBe(0)
      expect(result.totalConsumption).toBe(0)
    })
  })

  describe('normalizeSubscriptionPeriod', () => {
    it('kanonik periyotları değiştirmeden aynen döner', () => {
      expect(normalizeSubscriptionPeriod('Aylık')).toBe('Aylık')
      expect(normalizeSubscriptionPeriod('Haftalık')).toBe('Haftalık')
      expect(normalizeSubscriptionPeriod('3 Aylık')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('6 Aylık')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('Yıllık')).toBe('Yıllık')
      expect(normalizeSubscriptionPeriod('Tek Seferlik')).toBe('Tek Seferlik')
    })

    it('küçük harf, boşluk ve Türkçe karakter varyasyonlarını normalize eder', () => {
      expect(normalizeSubscriptionPeriod('3 aylık')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('3 Aylik')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('3-aylik')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('quarterly')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('uc aylik')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('6 aylık')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('6 Aylik')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('semi-annual')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('tek seferlik')).toBe('Tek Seferlik')
      expect(normalizeSubscriptionPeriod('tek-seferlik')).toBe('Tek Seferlik')
      expect(normalizeSubscriptionPeriod('one-time')).toBe('Tek Seferlik')
      expect(normalizeSubscriptionPeriod('yıllık')).toBe('Yıllık')
      expect(normalizeSubscriptionPeriod('yillik')).toBe('Yıllık')
      expect(normalizeSubscriptionPeriod('yearly')).toBe('Yıllık')
      expect(normalizeSubscriptionPeriod('haftalık')).toBe('Haftalık')
      expect(normalizeSubscriptionPeriod('weekly')).toBe('Haftalık')
    })

    it('büyük harf ve Türkçe karakter varyasyonlarını (TEK SEFERLİK, 3 AYLIK vb.) hatasız normalize eder', () => {
      expect(normalizeSubscriptionPeriod('TEK SEFERLİK')).toBe('Tek Seferlik')
      expect(normalizeSubscriptionPeriod('3 AYLIK')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('ÜÇ AYLIK')).toBe('3 Aylık')
      expect(normalizeSubscriptionPeriod('6 AYLIK')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('ALTI AYLIK')).toBe('6 Aylık')
      expect(normalizeSubscriptionPeriod('YILLIK')).toBe('Yıllık')
      expect(normalizeSubscriptionPeriod('HAFTALIK')).toBe('Haftalık')
      expect(normalizeSubscriptionPeriod('AYLIK')).toBe('Aylık')
    })

    it('boş, tanımsız veya bilinmeyen değerler için varsayılan olarak Aylık döner', () => {
      expect(normalizeSubscriptionPeriod('')).toBe('Aylık')
      expect(normalizeSubscriptionPeriod(null)).toBe('Aylık')
      expect(normalizeSubscriptionPeriod(undefined)).toBe('Aylık')
      expect(normalizeSubscriptionPeriod('Bilinmeyen')).toBe('Aylık')
    })
  })

  describe('safeParseAmount', () => {
    it('sayısal ve metinsel tutarları doğru ayrıştırır', () => {
      expect(safeParseAmount(100)).toBe(100)
      expect(safeParseAmount('150')).toBe(150)
      expect(safeParseAmount(' 250.50 ')).toBe(250.5)
    })

    it('Türkçe virgüllü ve binlik noktalı tutarları doğru ayrıştırır', () => {
      expect(safeParseAmount('150,50')).toBe(150.5)
      expect(safeParseAmount('1.250,50')).toBe(1250.5)
      expect(safeParseAmount('1,250.50')).toBe(1250.5)
    })

    it('para birimi sembolü içeren veya binlik noktalı/virgüllü tutarları doğru ayrıştırır', () => {
      expect(safeParseAmount('₺ 1.250,50')).toBe(1250.5)
      expect(safeParseAmount('150 ₺')).toBe(150)
      expect(safeParseAmount('1.250,50 TL')).toBe(1250.5)
      expect(safeParseAmount('$500.25')).toBe(500.25)
      expect(safeParseAmount('1.000.000')).toBe(1000000)
      expect(safeParseAmount('1,000,000')).toBe(1000000)
      expect(safeParseAmount('1.000.000,50')).toBe(1000000.5)
      expect(safeParseAmount('1,000,000.50')).toBe(1000000.5)
    })

    it('geçersiz, negatif, boş ve uç değerler için güvenli şekilde 0 döner', () => {
      expect(safeParseAmount(0)).toBe(0)
      expect(safeParseAmount(-50)).toBe(0)
      expect(safeParseAmount('-100,50')).toBe(0)
      expect(safeParseAmount('')).toBe(0)
      expect(safeParseAmount(null)).toBe(0)
      expect(safeParseAmount(undefined)).toBe(0)
      expect(safeParseAmount(NaN)).toBe(0)
      expect(safeParseAmount(Infinity)).toBe(0)
      expect(safeParseAmount('abc')).toBe(0)
    })
  })

  describe('calculateSubscriptionEquivalent', () => {
    it('Aylık periyot için girilen tutarı aylık ve yıllık eşdeğer olarak hesaplar', () => {
      const res = calculateSubscriptionEquivalent(150, 'Aylık')
      expect(res.monthly).toBe(150)
      expect(res.yearly).toBe(1800)
    })

    it('3 Aylık periyot için girilen tutarı 3\'e bölerek aylık ve yıllık eşdeğer hesaplar', () => {
      const res = calculateSubscriptionEquivalent(300, '3 Aylık')
      expect(res.monthly).toBe(100)
      expect(res.yearly).toBe(1200)
    })

    it('6 Aylık periyot için girilen tutarı 6\'ya bölerek aylık ve yıllık eşdeğer hesaplar', () => {
      const res = calculateSubscriptionEquivalent(600, '6 Aylık')
      expect(res.monthly).toBe(100)
      expect(res.yearly).toBe(1200)
    })

    it('Yıllık periyot için girilen tutarı 12\'ye bölerek aylık ve girilen tutarı yıllık hesaplar', () => {
      const res = calculateSubscriptionEquivalent(1200, 'Yıllık')
      expect(res.monthly).toBe(100)
      expect(res.yearly).toBe(1200)
    })

    it('Haftalık periyot için (tutar * 52) / 12 formülüyle normalize eder', () => {
      const res = calculateSubscriptionEquivalent(120, 'Haftalık')
      expect(res.monthly).toBe(520)
      expect(res.yearly).toBe(6240)
    })

    it('Tek Seferlik periyot için aylık ve yıllık düzenli yüke 0 katkı verir', () => {
      const res = calculateSubscriptionEquivalent(500, 'Tek Seferlik')
      expect(res.monthly).toBe(0)
      expect(res.yearly).toBe(0)
    })

    it('kuruş hassasiyeti ve yuvarlamaları doğru yapar', () => {
      const res = calculateSubscriptionEquivalent(100, '3 Aylık')
      expect(res.monthly).toBe(33.33)
      expect(res.yearly).toBe(399.96)
    })

    it('boş, tanımsız, negatif veya geçersiz tutarlar için güvenli şekilde sıfır döner', () => {
      expect(calculateSubscriptionEquivalent(0, 'Aylık')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(-50, '3 Aylık')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(null, '3 Aylık')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(undefined, 'Tek Seferlik')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(NaN, 'Aylık')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(Infinity, 'Aylık')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(100, null)).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(100, '')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(100, 'Tekrarlayan')).toEqual({ monthly: 100, yearly: 1200 })
    })

    it('küçük/büyük harf ve Türkçe karakter varyasyonlarını (3 aylık, tek seferlik, yillik vb.) doğru işler', () => {
      expect(calculateSubscriptionEquivalent(300, '3 aylık')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(300, '3 Aylik')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(600, '6 aylık')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(600, '6 Aylik')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(500, 'tek seferlik')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(500, 'Tek seferlik')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(500, 'tek-seferlik')).toEqual({ monthly: 0, yearly: 0 })
      expect(calculateSubscriptionEquivalent(1200, 'yıllık')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(1200, 'Yillik')).toEqual({ monthly: 100, yearly: 1200 })
      expect(calculateSubscriptionEquivalent(120, 'haftalık')).toEqual({ monthly: 520, yearly: 6240 })
      expect(calculateSubscriptionEquivalent(120, 'Haftalik')).toEqual({ monthly: 520, yearly: 6240 })
      expect(calculateSubscriptionEquivalent(150, '  3 Aylık  ')).toEqual({ monthly: 50, yearly: 600 })
    })
  })

  describe('projectSixMonthCashLoad', () => {
    it('sabit abonelikler ve azalan taksitleri hesaplar', () => {
      const subscriptions = [
        { status: 'Aktif', period: 'Aylık', amount: 100 }
      ]
      const installments = [
        { amountPerMonth: 50, remainingMonths: 2 }
      ]
      const result = projectSixMonthCashLoad(subscriptions, installments, 6)
      
      expect(result.length).toBe(6)
      expect(result[0]).toBe(150)
      expect(result[1]).toBe(150)
      expect(result[2]).toBe(100)
      expect(result[5]).toBe(100)
    })

    it('gelecek tarihli bitiş tarihi olan aboneliği süre bitince dahil etmez', () => {
      const now = new Date()
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 15)

      const subscriptions = [
        { status: 'Aktif', period: 'Aylık', amount: 100, end_date: end.toISOString() }
      ]
      const result = projectSixMonthCashLoad(subscriptions, [], 6)
      
      expect(result[0]).toBe(100)
      expect(result[1]).toBe(100)
      expect(result[2]).toBe(0)
    })

    it('yeni periyotları (3 Aylık, 6 Aylık, Tek Seferlik) doğru normalize ederek projeksiyona yansıtır', () => {
      const subscriptions = [
        { status: 'Aktif', period: '3 Aylık', amount: 300 }, // monthly: 100
        { status: 'Aktif', period: '6 Aylık', amount: 600 }, // monthly: 100
        { status: 'Aktif', period: 'Tek Seferlik', amount: 500 }, // monthly: 0
        { status: 'Aktif', period: 'Aylık', amount: 50 }, // monthly: 50
      ]
      const result = projectSixMonthCashLoad(subscriptions, [], 6)
      expect(result.length).toBe(6)
      result.forEach((monthTotal) => {
        expect(monthTotal).toBe(250)
      })
    })

    it('taksitler ve karma periyotlu abonelikleri birlikte doğru hesaplar', () => {
      const subscriptions = [
        { status: 'Aktif', period: '3 Aylık', amount: 150 }, // monthly: 50
        { status: 'Aktif', period: 'Tek Seferlik', amount: 1000 }, // monthly: 0
      ]
      const installments = [
        { amountPerMonth: 100, remainingMonths: 1 }
      ]
      const result = projectSixMonthCashLoad(subscriptions, installments, 6)
      expect(result[0]).toBe(150) // 50 + 100
      expect(result[1]).toBe(50) // 50 + 0
      expect(result[5]).toBe(50)
    })

    it('tüm periyotların (Haftalık, Aylık, 3 Aylık, 6 Aylık, Yıllık, Tek Seferlik) karma kombinasyonunu hatasız projeksiyonlar', () => {
      const subscriptions = [
        { status: 'Aktif', period: 'Haftalık', amount: 120 }, // monthly: 520
        { status: 'Aktif', period: 'Aylık', amount: 100 }, // monthly: 100
        { status: 'Aktif', period: '3 Aylık', amount: 300 }, // monthly: 100
        { status: 'Aktif', period: '6 Aylık', amount: 600 }, // monthly: 100
        { status: 'Aktif', period: 'Yıllık', amount: 1200 }, // monthly: 100
        { status: 'Aktif', period: 'Tek Seferlik', amount: 5000 }, // monthly: 0
      ]
      const result = projectSixMonthCashLoad(subscriptions, [], 6)
      expect(result.length).toBe(6)
      result.forEach((monthTotal) => {
        expect(monthTotal).toBe(920) // 520 + 100 + 100 + 100 + 100 + 0
      })
    })

    it('boş girdi, tanımsız liste veya geçersiz bitiş tarihi için çökmeden güvenli çalışır', () => {
      expect(projectSixMonthCashLoad([], [], 3)).toEqual([0, 0, 0])
      expect(projectSixMonthCashLoad(undefined as any, undefined as any, 2)).toEqual([0, 0])
      const subsWithInvalidDate = [
        { status: 'Aktif', period: 'Aylık', amount: 100, end_date: 'gecersiz-tarih' }
      ]
      expect(projectSixMonthCashLoad(subsWithInvalidDate, [], 2)).toEqual([100, 100])
    })

    it('kararı İptal Et olan abonelikleri projeksiyona dahil etmez', () => {
      const subscriptions = [
        { status: 'Aktif', period: 'Aylık', amount: 100 },
        { status: 'Aktif', decision: 'İptal Et', period: 'Aylık', amount: 200 },
      ]
      const result = projectSixMonthCashLoad(subscriptions, [], 2)
      expect(result).toEqual([100, 100])
    })

    it('geçersiz veya metin formatlı taksit tutarlarında NaN üretmeden güvenle çalışır', () => {
      const installments = [
        { amountPerMonth: 'abc' as any, remainingMonths: 2 },
        { amountPerMonth: '150,50' as any, remainingMonths: 1 }
      ]
      const result = projectSixMonthCashLoad([], installments, 2)
      expect(result).toEqual([150.5, 0])
    })

    it('due_date ve status alanlarını içeren debt_installments kayıtlarını doğru aylara projeksiyonlar', () => {
      const now = new Date()
      const m1 = new Date(now.getFullYear(), now.getMonth() + 1, 15).toISOString().split('T')[0]
      const m2 = new Date(now.getFullYear(), now.getMonth() + 2, 10).toISOString().split('T')[0]

      const installments = [
        { due_date: m1, amount: 250, status: 'Bekliyor' },
        { due_date: m1, amount: 100, status: 'Ödendi' }, // should be ignored
        { due_date: m2, amount: 350, status: 'Gecikmede' }, // unpaid, included
        { due_date: 'invalid-date', amount: 999, status: 'Bekliyor' }, // invalid date, ignored
      ]

      const result = projectSixMonthCashLoad([], installments, 3)
      expect(result[0]).toBe(250)
      expect(result[1]).toBe(350)
      expect(result[2]).toBe(0)
    })
  })

  describe('calculateDcaAverageCost', () => {
    it('ağırlıklı ortalama maliyeti doğru hesaplar', () => {
      const result = calculateDcaAverageCost(10, 100, 5, 130)
      expect(result.newQuantity).toBe(15)
      expect(result.newUnitCost).toBe(110)
      expect(result.totalCost).toBe(1650)
    })

    it('ilk alış işleminde (mevcut miktar 0) doğru hesaplar', () => {
      const result = calculateDcaAverageCost(0, 0, 10, 50)
      expect(result.newQuantity).toBe(10)
      expect(result.newUnitCost).toBe(50)
      expect(result.totalCost).toBe(500)
    })

    it('negatif sayı girişlerine karşı sıfır kabul eder', () => {
      const result = calculateDcaAverageCost(-5, -100, 5, 50)
      expect(result.newQuantity).toBe(5)
      expect(result.newUnitCost).toBe(50)
    })
  })

  describe('calculateMonthlyCashFlow & calculatePortfolioMetrics', () => {
    it('cash flow standart hesaplama yapar', () => {
      const transactions = [
        { type: 'Gelir', amount: 5000, description: 'Maaş' },
        { type: 'Kart Ödemesi', amount: 1000 },
        { type: 'Finansman/Masraf', amount: 100 }
      ]
      const result = calculateMonthlyCashFlow(transactions)
      expect(result.totalInflow).toBe(5000)
      expect(result.cardPayments).toBe(1000)
      expect(result.financingFees).toBe(100)
      expect(result.netCashFlow).toBe(3900)
    })

    it('iç transferleri dinamik hesap adlarına göre filtreler', () => {
      const transactions = [
        { type: 'Gelir', amount: 8000, description: 'Maaş Hakediş' },
        { type: 'Gelir', amount: 2000, description: 'Enpara Vadesiz FAST Transfer' },
        { type: 'Gelir', amount: 3000, merchant: 'Özel Vadeli Kasa', description: 'Hesaplar Arası Aktarım' },
      ]
      const result = calculateMonthlyCashFlow(transactions, {
        accountNames: ['Enpara Vadesiz', 'Özel Vadeli Kasa']
      })
      // Sadece Maaş Hakediş dahil edilmeli (8000 TL), iç transferler filtrelenmeli
      expect(result.totalInflow).toBe(8000)
      expect(result.inflowCount).toBe(1)
    })

    it('portfolio metrics standart hesaplama yapar', () => {
      const investments = [
        { category: 'Hisse', quantity: 10, unit_cost: 100, current_price: 150 },
        { category: 'Kripto', quantity: 2, unit_cost: 500, current_price: 400 }
      ]
      const result = calculatePortfolioMetrics(investments)
      
      expect(result.totalCost).toBe(2000)
      expect(result.totalValue).toBe(2300)
      expect(result.totalProfitLoss).toBe(300)
      expect(result.totalProfitLossPct).toBe(15)
      expect(result.assetCount).toBe(2)
      expect(result.categoryAllocations.length).toBe(2)
    })

    it('boş dizilerde sıfır değerleri döner', () => {
      const cashFlowResult = calculateMonthlyCashFlow([])
      expect(cashFlowResult.totalInflow).toBe(0)
      expect(cashFlowResult.netCashFlow).toBe(0)

      const portfolioResult = calculatePortfolioMetrics([])
      expect(portfolioResult.totalCost).toBe(0)
      expect(portfolioResult.totalValue).toBe(0)
      expect(portfolioResult.categoryAllocations.length).toBe(0)
    })
  })

  describe('calculateIncomeMetrics', () => {
    it('sabit, değişken ve tek seferlik gelirleri aylık ve yıllık kapasiteye doğru normalize eder', () => {
      const incomes = [
        { amount: 50000, period: 'Aylık', income_type: 'Sabit', status: 'Aktif' },
        { amount: 120000, period: 'Yıllık', income_type: 'Sabit', status: 'Aktif' }, // monthly: 10000
        { amount: 15000, period: '3 Aylık', income_type: 'Değişken', status: 'Aktif' }, // monthly: 5000
        { amount: 25000, period: 'Tek Seferlik', income_type: 'Değişken', status: 'Aktif' }, // one-time: 25000, monthly: 0
        { amount: 10000, period: 'Aylık', income_type: 'Sabit', status: 'Pasif' }, // passive: ignored
      ]

      const metrics = calculateIncomeMetrics(incomes)
      expect(metrics.totalMonthlyIncome).toBe(65000) // 50000 + 10000 + 5000
      expect(metrics.fixedMonthlyIncome).toBe(60000) // 50000 + 10000
      expect(metrics.variableMonthlyIncome).toBe(5000)
      expect(metrics.oneTimeIncomeTotal).toBe(25000)
      expect(metrics.activeCount).toBe(4)
      expect(metrics.passiveCount).toBe(1)
    })

    it('boş dizide sıfır metrikleri döner', () => {
      const metrics = calculateIncomeMetrics([])
      expect(metrics.totalMonthlyIncome).toBe(0)
      expect(metrics.activeCount).toBe(0)
      expect(metrics.passiveCount).toBe(0)
    })

    it('dövizli gelirleri verilen kurlarla TL bazına dönüştürür', () => {
      const incomes = [
        { amount: 1000, currency: 'USD', period: 'Aylık', income_type: 'Sabit', status: 'Aktif' },
        { amount: 500, currency: 'EUR', period: 'Aylık', income_type: 'Değişken', status: 'Aktif' },
        { amount: 10000, currency: 'TRY', period: 'Aylık', income_type: 'Sabit', status: 'Aktif' },
      ]
      const rates = { USD: 35.0, EUR: 38.0 }
      const metrics = calculateIncomeMetrics(incomes, rates)
      // USD: 1000 * 35 = 35000 TL
      // EUR: 500 * 38 = 19000 TL
      // TRY: 10000 TL
      // Total monthly: 35000 + 19000 + 10000 = 64000 TL
      expect(metrics.totalMonthlyIncome).toBe(64000)
      expect(metrics.fixedMonthlyIncome).toBe(45000) // 35000 + 10000
      expect(metrics.variableMonthlyIncome).toBe(19000)
    })
  })

  describe('Multi-currency and Exchange Rates', () => {
    it('calculateSubscriptionEquivalent dövizli aboneliği kur ile dönüştürür', () => {
      const eq = calculateSubscriptionEquivalent(20, 'Aylık', 'USD', 35)
      expect(eq.monthly).toBe(700)
      expect(eq.yearly).toBe(8400)
    })

    it('projectSixMonthCashLoad dövizli abonelikleri kur haritasıyla projekte eder', () => {
      const subscriptions = [
        { amount: 10, currency: 'USD', period: 'Aylık', status: 'Aktif' }, // 10 * 35 = 350/ay
      ]
      const projection = projectSixMonthCashLoad(subscriptions, [], 3, { USD: 35 })
      expect(projection).toEqual([350, 350, 350])
    })
  })

  describe('calculateMonthlyBudgetBalance', () => {
    it('gelir, sabit gider ve değişken harcamaya göre serbest bütçe ve marjı hesaplar', () => {
      const balance = calculateMonthlyBudgetBalance(50000, 15000, 10000)
      expect(balance.monthlyIncome).toBe(50000)
      expect(balance.fixedExpenses).toBe(15000)
      expect(balance.disposableBudget).toBe(35000)
      expect(balance.currentVariableLoad).toBe(10000)
      expect(balance.netMargin).toBe(25000)
      expect(balance.fixedRatioPct).toBe(30)
      expect(balance.variableRatioPct).toBe(20)
      expect(balance.totalUsedRatioPct).toBe(50)
    })

    it('harcama geliri aştığında negatif marj ve doğru oran döner', () => {
      const balance = calculateMonthlyBudgetBalance(20000, 15000, 10000)
      expect(balance.disposableBudget).toBe(5000)
      expect(balance.netMargin).toBe(-5000)
      expect(balance.totalUsedRatioPct).toBe(125)
    })

    it('sıfır gelir durumunda sıfıra bölme hatası vermez', () => {
      const balance = calculateMonthlyBudgetBalance(0, 5000, 2000)
      expect(balance.disposableBudget).toBe(-5000)
      expect(balance.netMargin).toBe(-7000)
      expect(balance.fixedRatioPct).toBe(0)
      expect(balance.totalUsedRatioPct).toBe(0)
    })
  })

  describe('calculateAccountYield & calculateAccountsYieldSummary (Damla Motoru)', () => {
    it('VakıfBank ARI hesabı senaryosu: 50.000 TL bakiye, 2.500 TL alt limit, %49 faiz, %10 stopaj', () => {
      const account = {
        balance: 50000,
        reserved_base_amount: 2500,
        interest_rate: 49,
        withholding_tax_rate: 10,
        last_yield_applied_at: '2026-11-05',
        type: 'gunluk_birikim',
      }
      const res = calculateAccountYield(account, '2026-11-06')

      expect(res.activePrincipal).toBe(47500)
      expect(res.reservedBaseAmount).toBe(2500)
      expect(res.interestRate).toBe(49)
      expect(res.withholdingTaxRate).toBe(10)
      expect(res.dailyGrossYield).toBe(63.77)
      expect(res.dailyNetYield).toBe(57.39)
      expect(res.monthlySimpleNetYield).toBe(1721.70)
      expect(res.monthlyCompoundNetYield).toBe(1752.22)
      expect(res.pendingDays).toBe(1)
      expect(res.pendingNetYield).toBe(57.39)
      expect(res.hasYield).toBe(true)
    })

    it('bakiye alt limitin altında kaldığında aktif anapara ve getiriler 0 döner', () => {
      const account = {
        balance: 2000,
        reserved_base_amount: 2500,
        interest_rate: 49,
        withholding_tax_rate: 10,
      }
      const res = calculateAccountYield(account, '2026-11-06')
      expect(res.activePrincipal).toBe(0)
      expect(res.hasYield).toBe(false)
      expect(res.dailyGrossYield).toBe(0)
      expect(res.dailyNetYield).toBe(0)
      expect(res.monthlySimpleNetYield).toBe(0)
      expect(res.monthlyCompoundNetYield).toBe(0)
      expect(res.pendingNetYield).toBe(0)
    })

    it('faiz oranı 0 veya tanımsız ise getiri 0 döner', () => {
      const account = {
        balance: 100000,
        interest_rate: 0,
      }
      const res = calculateAccountYield(account, '2026-11-06')
      expect(res.activePrincipal).toBe(100000)
      expect(res.hasYield).toBe(false)
      expect(res.dailyNetYield).toBe(0)
      expect(res.monthlySimpleNetYield).toBe(0)
    })

    it('son işlemden beri geçen gün sayısına göre biriken net getiri hesaplar', () => {
      const account = {
        balance: 100000,
        reserved_base_amount: 0,
        interest_rate: 50,
        withholding_tax_rate: 10,
        last_yield_applied_at: '2026-11-02',
      }
      // 2026-11-02 to 2026-11-06 = 4 days
      const res = calculateAccountYield(account, '2026-11-06')
      expect(res.pendingDays).toBe(4)
      expect(res.dailyNetYield).toBe(123.29)
      expect(res.pendingNetYield).toBe(493.16)
    })

    it('bugün zaten getiri işlendiyse pendingDays 0 ve pendingNetYield 0 döner', () => {
      const account = {
        balance: 50000,
        interest_rate: 45,
        last_yield_applied_at: '2026-11-06',
      }
      const res = calculateAccountYield(account, '2026-11-06')
      expect(res.pendingDays).toBe(0)
      expect(res.pendingNetYield).toBe(0)
    })

    it('klasik vadeli mevduat ve vade gün sayacı hesaplar', () => {
      const futureAcc = {
        balance: 200000,
        interest_rate: 40,
        withholding_tax_rate: 10,
        maturity_date: '2026-11-24',
        type: 'vadeli',
      }
      const futureRes = calculateAccountYield(futureAcc, '2026-11-06')
      expect(futureRes.daysToMaturity).toBe(18)
      expect(futureRes.isMatured).toBe(false)

      const maturedAcc = {
        balance: 200000,
        maturity_date: '2026-11-01',
      }
      const maturedRes = calculateAccountYield(maturedAcc, '2026-11-06')
      expect(maturedRes.daysToMaturity).toBe(-5)
      expect(maturedRes.isMatured).toBe(true)
    })

    it('calculateAccountsYieldSummary tüm portföy genelinde nakit ve getirileri doğru toplar', () => {
      const accounts = [
        { name: 'Vadesiz', balance: 10000, type: 'vadesiz' },
        { name: 'Kasa', balance: 5000, type: 'kasa' },
        {
          name: 'VakıfBank ARI',
          balance: 50000,
          reserved_base_amount: 2500,
          interest_rate: 49,
          withholding_tax_rate: 10,
          last_yield_applied_at: '2026-11-05',
          type: 'gunluk_birikim',
        },
        {
          name: 'Vadeli Mevduat',
          balance: 100000,
          interest_rate: 50,
          withholding_tax_rate: 10,
          last_yield_applied_at: '2026-11-06',
          maturity_date: '2026-12-01',
          type: 'vadeli',
        },
      ]

      const summary = calculateAccountsYieldSummary(accounts, '2026-11-06')

      expect(summary.totalCash).toBe(165000)
      expect(summary.liquidCash).toBe(65000)
      expect(summary.savingsCash).toBe(150000)
      expect(summary.totalActivePrincipal).toBe(147500)
      expect(summary.totalDailyNetYield).toBe(180.68)
      expect(summary.yieldAccountCount).toBe(2)
      expect(summary.totalPendingNetYield).toBe(57.39)
    })

    it('boş veya geçersiz girdi durumlarını güvenle karşılar', () => {
      const summary = calculateAccountsYieldSummary([])
      expect(summary.totalCash).toBe(0)
      expect(summary.totalDailyNetYield).toBe(0)
      expect(summary.yieldAccountCount).toBe(0)

      const yieldNull = calculateAccountYield(null)
      expect(yieldNull.hasYield).toBe(false)
      expect(yieldNull.dailyNetYield).toBe(0)
    })

    it('bozuk veya geçersiz tarih dizgelerinde güvenli davranır', () => {
      // Geçersiz formatlı last_yield_applied_at -> 1 gün kabul eder
      const invalidYieldDateAcc = {
        balance: 50000,
        interest_rate: 40,
        last_yield_applied_at: 'gecersiz-tarih',
      }
      const res1 = calculateAccountYield(invalidYieldDateAcc, '2026-11-06')
      expect(res1.pendingDays).toBe(1)
      expect(res1.hasYield).toBe(true)

      // Geçersiz formatlı maturity_date -> daysToMaturity null kalır, isMatured false olur
      const invalidMaturityAcc = {
        balance: 50000,
        interest_rate: 40,
        maturity_date: '2026-99-99',
      }
      const res2 = calculateAccountYield(invalidMaturityAcc, '2026-11-06')
      expect(res2.daysToMaturity).toBeNull()
      expect(res2.isMatured).toBe(false)
    })

    it('negatif bakiye veya eksi faiz oranında aktif anapara ve getiri 0 olur', () => {
      const overdraftAcc = {
        balance: -5000,
        interest_rate: 45,
      }
      const res = calculateAccountYield(overdraftAcc, '2026-11-06')
      expect(res.activePrincipal).toBe(0)
      expect(res.hasYield).toBe(false)
      expect(res.dailyNetYield).toBe(0)

      const negativeRateAcc = {
        balance: 50000,
        interest_rate: -10,
      }
      const resNeg = calculateAccountYield(negativeRateAcc, '2026-11-06')
      expect(resNeg.interestRate).toBe(0)
      expect(resNeg.hasYield).toBe(false)
    })

    it('stopaj oranı sınırlarını (0 ve %100) doğru işler', () => {
      // %0 stopaj (vergisiz getiri)
      const zeroTaxAcc = {
        balance: 36500,
        interest_rate: 10,
        withholding_tax_rate: 0,
      }
      const resZero = calculateAccountYield(zeroTaxAcc, '2026-11-06')
      expect(resZero.dailyGrossYield).toBe(10)
      expect(resZero.dailyNetYield).toBe(10)

      // %100 stopaj (net 0)
      const fullTaxAcc = {
        balance: 36500,
        interest_rate: 10,
        withholding_tax_rate: 100,
      }
      const resFull = calculateAccountYield(fullTaxAcc, '2026-11-06')
      expect(resFull.dailyGrossYield).toBe(10)
      expect(resFull.dailyNetYield).toBe(0)
    })
  })
})
