import { describe, it, expect, vi } from 'vitest'
import {
  round2,
  calculateNetWorth,
  calculateStatementChange,
  calculateSpendingBreakdown,
  calculateProjectTotalCost,
  evaluateProjectBudget,
  projectSixMonthCashLoad,
  calculateFounderRunway,
  collectReceivable,
  payDebt,
  calculateDcaAverageCost,
  calculateMonthlyCashFlow,
  calculatePortfolioMetrics,
  calculateSubscriptionEquivalent,
  normalizeSubscriptionPeriod,
  safeParseAmount
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

  describe('calculateProjectTotalCost', () => {
    it('direkt harcamalar ve aktif abonelikleri toplar', () => {
      const transactions = [
        { project_id: 'p1', amount: 100 },
        { project_id: 'p2', amount: 50 }
      ]
      const subscriptions = [
        { project_id: 'p1', amount: 20, status: 'Aktif' }
      ]
      const result = calculateProjectTotalCost('p1', transactions, subscriptions)
      expect(result).toBe(120)
    })

    it('iptal edilmiş veya kararı İptal Et olan abonelikleri hariç tutar', () => {
      const subscriptions = [
        { project_id: 'p1', amount: 20, status: 'İptal' },
        { project_id: 'p1', amount: 30, status: 'Aktif', decision: 'İptal Et' }
      ]
      const result = calculateProjectTotalCost('p1', [], subscriptions)
      expect(result).toBe(0)
    })

    it('boş/tanımsız diziler, null ve geçersiz metin girdileri için güvenli çalışır', () => {
      expect(calculateProjectTotalCost('p1', undefined as any, undefined as any)).toBe(0)
      expect(calculateProjectTotalCost('p1', [null as any], [null as any])).toBe(0)
      expect(calculateProjectTotalCost('p1', [{ project_id: 'p1', amount: 'abc' as any }], [{ project_id: 'p1', amount: 'def' as any }])).toBe(0)
      expect(calculateProjectTotalCost('p1', [{ project_id: 'p1', amount: '150,50' as any }], [{ project_id: 'p1', amount: '50' as any }])).toBe(200.5)
    })
  })

  describe('evaluateProjectBudget', () => {
    it('limite ulaşılmadıysa GREEN döner', () => {
      const result = evaluateProjectBudget(50, 100)
      expect(result.status).toBe('GREEN')
    })

    it('limitin %85 ine ulaşıldıysa YELLOW döner', () => {
      const result = evaluateProjectBudget(85, 100)
      expect(result.status).toBe('YELLOW')
      expect(result.isWarning).toBe(true)
    })

    it('limit aşıldıysa RED döner', () => {
      const result = evaluateProjectBudget(101, 100)
      expect(result.status).toBe('RED')
      expect(result.isExceeded).toBe(true)
    })

    it('limit yoksa veya sıfırsa NO_BUDGET döner', () => {
      const result = evaluateProjectBudget(50, 0)
      expect(result.status).toBe('NO_BUDGET')
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
  })

  describe('calculateFounderRunway', () => {
    it('standart giderle aylık hesaplama yapar', () => {
      const result = calculateFounderRunway(10000, 2000, 500)
      expect(result.runwayMonths).toBe(4)
    })

    it('gider yoksa infinite döner', () => {
      const result = calculateFounderRunway(10000, 0, 0)
      expect(result.runwayMonths).toBe('infinite')
    })

    it('negatif nakit veya sıfır nakit durumunu işler', () => {
      const result = calculateFounderRunway(-2500, 2000, 500)
      expect(result.runwayMonths).toBe(-1)
    })
  })

  describe('collectReceivable & payDebt', () => {
    it('alacak tam tahsil edildiğinde kapatıldı flagi döner', () => {
      const result = collectReceivable(1000, 500, 500)
      expect(result.newAccountBalance).toBe(1500)
      expect(result.newReceivableRemaining).toBe(0)
      expect(result.isClosed).toBe(true)
    })

    it('alacak kısmi tahsil edildiğinde kapanmaz', () => {
      const result = collectReceivable(1000, 500, 200)
      expect(result.newAccountBalance).toBe(1200)
      expect(result.newReceivableRemaining).toBe(300)
      expect(result.isClosed).toBe(false)
    })

    it('borç tam ödendiğinde kapatıldı flagi döner', () => {
      const result = payDebt(1000, 500, 500)
      expect(result.newAccountBalance).toBe(500)
      expect(result.newDebtRemaining).toBe(0)
      expect(result.isClosed).toBe(true)
    })

    it('borç kısmi ödendiğinde kapanmaz', () => {
      const result = payDebt(1000, 500, 200)
      expect(result.newAccountBalance).toBe(800)
      expect(result.newDebtRemaining).toBe(300)
      expect(result.isClosed).toBe(false)
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
})
