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
  calculatePortfolioMetrics
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

    it('iptal edilmiş abonelikleri hariç tutar', () => {
      const subscriptions = [
        { project_id: 'p1', amount: 20, status: 'İptal' }
      ]
      const result = calculateProjectTotalCost('p1', [], subscriptions)
      expect(result).toBe(0)
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
