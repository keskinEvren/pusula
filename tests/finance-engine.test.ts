import { describe, it, expect } from 'vitest'
import {
  calculateNetWorth,
  calculateStatementChange,
  calculateSpendingBreakdown,
  calculateProjectTotalCost,
  evaluateProjectBudget,
  projectSixMonthCashLoad,
  calculateFounderRunway,
  collectReceivable,
  payDebt,
  round2,
} from '../src/lib/finance-engine'

describe('Pusula Saf Finans Motoru (Gateway 2 Test Süiti)', () => {
  describe('1. Net Varlık Modülü (Net Worth)', () => {
    it('1.1. Standart Pozitif Durum: Excel Ana Panel formülleriyle kuruşu kuruşuna eşleşir', () => {
      const accounts = [
        { balance: 188850.0 }, // Garanti Vadesiz
        { balance: 15723.0 },  // Enpara Vadesiz
      ]
      const debts = [
        { type: 'Alacak', remaining: 204573.0, status: 'Açık' }, // Maaş alacağı
        { type: 'Borç', remaining: 50000.0, status: 'Açık' },   // Abla borcu
        { type: 'Borç', remaining: 74.91, status: 'Açık' },     // Artı para
      ]
      const cards = [
        { current_debt: 21969.86 }, // Akbank Axess
        { current_debt: 26969.24 }, // Enpara
        { current_debt: 35888.65 }, // Ziraat 0887
        { current_debt: 7566.67 },  // Ziraat 6745
      ]

      const res = calculateNetWorth(accounts, debts, cards)

      expect(res.totalCash).toBe(204573.0)
      expect(res.totalReceivables).toBe(204573.0)
      expect(res.totalOtherDebt).toBe(50074.91)
      expect(res.totalCardDebt).toBe(92394.42)
      expect(res.totalDebt).toBe(142469.33)
      // Net Varlık = 204.573 + 204.573 - 142.469,33 = 266.676,67 TL
      expect(res.netWorth).toBe(266676.67)
    })

    it('1.2. IEEE-754 Kuruş Yuvarlama Koruması: Ondalık toplama hatalarını (0.30000000000000004) engeller', () => {
      const accounts = [{ balance: 0.1 }]
      const debts = [{ type: 'Alacak', remaining: 0.2, status: 'Açık' }]
      const cards = [{ current_debt: 0 }]

      const res = calculateNetWorth(accounts, debts, cards)
      expect(res.netWorth).toBe(0.3) // Never 0.30000000000000004
    })

    it('1.3. Negatif Net Varlık: Borçlar varlıktan fazla olduğunda eksi bakiye doğru döner', () => {
      const accounts = [{ balance: 5000.0 }]
      const debts = [{ type: 'Borç', remaining: 15000.0, status: 'Açık' }]
      const cards = [{ current_debt: 20000.0 }]

      const res = calculateNetWorth(accounts, debts, cards)
      expect(res.netWorth).toBe(-30000.0) // 5000 - 35000
    })

    it('1.4. Kapatılan Borçlar: Statüsü Kapatıldı olan kayıtları toplama dahil etmez', () => {
      const accounts = [{ balance: 10000.0 }]
      const debts = [
        { type: 'Borç', remaining: 5000.0, status: 'Açık' },
        { type: 'Borç', remaining: 99000.0, status: 'Kapatıldı' },
      ]
      const cards = [{ current_debt: 0 }]

      const res = calculateNetWorth(accounts, debts, cards)
      expect(res.totalOtherDebt).toBe(5000.0)
      expect(res.netWorth).toBe(5000.0)
    })
  })

  describe('2. Kredi Kartı Dönem Değişimi (Credit Card Statement Change)', () => {
    it('2.1. Borç Artışı: Yeni borç eskisinden büyükse UP trendi ve pozitif yüzde döner', () => {
      // Ziraat: 35.888,65 vs Önceki: 19.707,22 -> +16.181,43 (+82.11%)
      const res = calculateStatementChange(35888.65, 19707.22)
      expect(res.changeAmount).toBe(16181.43)
      expect(res.changePct).toBe(82.11)
      expect(res.trend).toBe('UP')
    })

    it('2.2. Borç Azalışı: Yeni borç eskisinden küçükse DOWN trendi ve negatif yüzde döner', () => {
      // Enpara: 26.969,24 vs Önceki: 32.254,28 -> -5.285,04 (-16.39%)
      const res = calculateStatementChange(26969.24, 32254.28)
      expect(res.changeAmount).toBe(-5285.04)
      expect(res.changePct).toBe(-16.39)
      expect(res.trend).toBe('DOWN')
    })

    it('2.3. Sabit Borç: Yeni ve eski borç eşitse STABLE trendi ve %0 döner', () => {
      const res = calculateStatementChange(5000.0, 5000.0)
      expect(res.changeAmount).toBe(0.0)
      expect(res.changePct).toBe(0.0)
      expect(res.trend).toBe('STABLE')
    })

    it('2.4. İlk Dönem (Önceki Borç Yok): null değer döner, trend NONE olur', () => {
      const res = calculateStatementChange(4542.49, null)
      expect(res.changeAmount).toBeNull()
      expect(res.changePct).toBeNull()
      expect(res.trend).toBe('NONE')
    })
  })

  describe('3. Harcama Dağılımı (Spending Breakdown)', () => {
    it('3.1. Gruplama: Kişisel, İş ve Finansman harcamalarını doğru ayırır', () => {
      const txs = [
        { type: 'Harcama', analysis_group: 'Kişisel', amount: 23491.72 },
        { type: 'Harcama', analysis_group: 'İş', amount: 984.76 },
        { type: 'Finansman/Masraf', analysis_group: 'Finansman', amount: 4326.37 },
      ]

      const res = calculateSpendingBreakdown(txs)
      expect(res.personal).toBe(23491.72)
      expect(res.business).toBe(984.76)
      expect(res.financing).toBe(4326.37)
      expect(res.totalConsumption).toBe(28802.85)
    })

    it('3.2. Hariç Tutulanlar: Kart Ödemesi ve Transferler tüketime dahil edilmez', () => {
      const txs = [
        { type: 'Harcama', analysis_group: 'Kişisel', amount: 1000.0 },
        { type: 'Kart Ödemesi', analysis_group: 'Hariç', amount: 28000.0 },
        { type: 'Transfer', analysis_group: 'Hariç', amount: 5000.0 },
      ]

      const res = calculateSpendingBreakdown(txs)
      expect(res.excluded).toBe(33000.0)
      expect(res.totalConsumption).toBe(1000.0)
    })
  })

  describe('4. Proje Maliyet Köprüsü & Bütçe Tavanı (The Bridge)', () => {
    it('4.1. Gerçek Maliyet: Projeye bağlı doğrudan harcamalar ile abonelikleri toplar', () => {
      const projectId = 'prj-pusula'
      const txs = [
        { project_id: 'prj-pusula', amount: 58.59 },  // Hostinger
        { project_id: 'prj-pusula', amount: 350.0 },  // Domain
        { project_id: 'prj-other', amount: 999.0 },   // Başka proje
      ]
      const subs = [
        { project_id: 'prj-pusula', amount: 960.0, status: 'Aktif' }, // Cursor
        { project_id: 'prj-pusula', amount: 500.0, status: 'İptal' }, // İptal edilen
      ]

      const totalCost = calculateProjectTotalCost(projectId, txs, subs)
      expect(totalCost).toBe(1368.59) // 58.59 + 350 + 960 (iptal edilen hariç)
    })

    it('4.2. Güvenli Bölge (GREEN): Harcama bütçenin %85 altında ise yeşil durum verir', () => {
      const res = evaluateProjectBudget(5000.0, 10000.0)
      expect(res.status).toBe('GREEN')
      expect(res.isWarning).toBe(false)
      expect(res.isExceeded).toBe(false)
      expect(res.ratio).toBe(0.5)
    })

    it('4.3. Yaklaşan Bütçe Uyarısı (YELLOW): Harcama bütçenin %85 ile %100 arasında ise sarı uyarı verir', () => {
      const res = evaluateProjectBudget(8500.0, 10000.0)
      expect(res.status).toBe('YELLOW')
      expect(res.isWarning).toBe(true)
      expect(res.isExceeded).toBe(false)
      expect(res.ratio).toBe(0.85)
    })

    it('4.4. Bütçe Aşımı (RED): Harcama bütçeyi aştığında kırmızı alarm verir', () => {
      const res = evaluateProjectBudget(10500.0, 10000.0)
      expect(res.status).toBe('RED')
      expect(res.isWarning).toBe(false)
      expect(res.isExceeded).toBe(true)
      expect(res.ratio).toBe(1.05)
    })

    it('4.5. Tanımsız Bütçe (NO_BUDGET): Bütçe limiti girilmediğinde NO_BUDGET döner', () => {
      const res = evaluateProjectBudget(3500.0, null)
      expect(res.status).toBe('NO_BUDGET')
      expect(res.ratio).toBeNull()
    })
  })

  describe('5. 6 Aylık Nakit Yükü & Taksit Projeksiyonu (Cash Load Forecast)', () => {
    it('5.1. Sabit Abonelik Yükü: Sadece abonelik olduğunda 6 ay sabit yük dağıtır', () => {
      const subs = [
        { status: 'Aktif', period: 'Aylık', amount: 960.0 }, // Cursor
        { status: 'Aktif', period: 'Aylık', amount: 1090.0 }, // OpenAI
        { status: 'İptal', period: 'Aylık', amount: 500.0 }, // İptal
      ]

      const res = projectSixMonthCashLoad(subs, [], 6)
      expect(res).toHaveLength(6)
      expect(res.every((v) => v === 2050.0)).toBe(true)
    })

    it('5.2. Taksit Dağılımı: Devam eden taksitleri kalan ay sayısına göre geleceğe dağıtır', () => {
      const subs = [{ status: 'Aktif', period: 'Aylık', amount: 1000.0 }]
      const installments = [
        { amountPerMonth: 1879.0, remainingMonths: 2 }, // 2 ay kalan taksit (RIHTIM VE VERASET)
        { amountPerMonth: 500.0, remainingMonths: 4 },  // 4 ay kalan taksit
      ]

      const res = projectSixMonthCashLoad(subs, installments, 6)
      // Ay 1: 1000 + 1879 + 500 = 3379
      // Ay 2: 1000 + 1879 + 500 = 3379
      // Ay 3: 1000 + 500 = 1500
      // Ay 4: 1000 + 500 = 1500
      // Ay 5: 1000
      // Ay 6: 1000
      expect(res[0]).toBe(3379.0)
      expect(res[1]).toBe(3379.0)
      expect(res[2]).toBe(1500.0)
      expect(res[3]).toBe(1500.0)
      expect(res[4]).toBe(1000.0)
      expect(res[5]).toBe(1000.0)
    })
  })

  describe('6. Kurucu Runway Formülü (Founder Runway)', () => {
    it('6.1. Standart Runway: Likit nakit / Toplam aylık nakit çıkışı', () => {
      const res = calculateFounderRunway(100000.0, 20000.0, 5000.0)
      expect(res.totalMonthlyCashDrain).toBe(25000.0)
      expect(res.runwayMonths).toBe(4.0) // 100k / 25k = 4 ay
    })

    it('6.2. Sıfır Gider Durumu: Gider 0 ise infinite döner', () => {
      const res = calculateFounderRunway(50000.0, 0, 0)
      expect(res.runwayMonths).toBe('infinite')
    })
  })

  describe('7. Borç / Alacak Tahsilat Senkronizasyonu (Auto-Sync)', () => {
    it('7.1. Tam Alacak Tahsilatı: Hesap bakiyesi artar, kalan 0 olur ve kapatılır', () => {
      const res = collectReceivable(10000.0, 5000.0, 5000.0)
      expect(res.newAccountBalance).toBe(15000.0)
      expect(res.newReceivableRemaining).toBe(0.0)
      expect(res.isClosed).toBe(true)
    })

    it('7.2. Kısmi Alacak Tahsilatı: Hesap bakiyesi artar, kalan azalır ama açık kalır', () => {
      const res = collectReceivable(10000.0, 5000.0, 2000.0)
      expect(res.newAccountBalance).toBe(12000.0)
      expect(res.newReceivableRemaining).toBe(3000.0)
      expect(res.isClosed).toBe(false)
    })

    it('7.3. Borç Geri Ödemesi: Hesap bakiyesi düşer, kalan borç 0 olur ve kapatılır', () => {
      const res = payDebt(15000.0, 5000.0, 5000.0)
      expect(res.newAccountBalance).toBe(10000.0)
      expect(res.newDebtRemaining).toBe(0.0)
      expect(res.isClosed).toBe(true)
    })
  })
})
