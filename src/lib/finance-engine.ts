/**
 * 🧭 PUSULA — Saf Finans Motoru (Pure Financial Engine)
 * IEEE-754 Kuruş Hassasiyeti ve Sıfır İzolasyonlu Hesaplama Kuralları
 */

export interface NetWorthBreakdown {
  totalCash: number
  totalReceivables: number
  totalInvestments: number
  totalCardDebt: number
  totalOtherDebt: number
  totalDebt: number
  netWorth: number
}

export interface PortfolioMetricsResult {
  totalValue: number
  totalCost: number
  totalProfitLoss: number
  totalProfitLossPct: number
  assetCount: number
  categoryAllocations: Array<{
    category: string
    value: number
    pct: number
  }>
}

export interface SpendingBreakdown {
  personal: number
  business: number
  financing: number
  excluded: number
  totalConsumption: number
}

export interface StatementChangeResult {
  changeAmount: number | null
  changePct: number | null
  trend: 'UP' | 'DOWN' | 'STABLE' | 'NONE'
}

export interface BudgetEvaluationResult {
  ratio: number | null
  status: 'GREEN' | 'YELLOW' | 'RED' | 'NO_BUDGET'
  isWarning: boolean
  isExceeded: boolean
}

export interface FounderRunwayResult {
  monthlyBurn: number
  projectMonthlyLoad: number
  totalMonthlyCashDrain: number
  runwayMonths: number | 'infinite'
}

export interface InstallmentScheduleItem {
  amountPerMonth: number
  remainingMonths: number
}

/**
 * Rounds any number safely to 2 decimal places to avoid IEEE-754 precision issues
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * 1. Net Varlık Hesabı
 * Net Varlık = (Hazır Para + Kesin Alacaklar + Yatırımlar/Portföy) - (Kredi Kartı Borçları + Diğer Borçlar)
 */
export function calculateNetWorth(
  accounts: Array<{ balance: number | null | undefined }>,
  debts: Array<{ type: string; remaining: number | null | undefined; status?: string | null }>,
  cards: Array<{ current_debt: number | null | undefined }>,
  investments?: Array<{ quantity: number | null | undefined; current_price: number | null | undefined }>
): NetWorthBreakdown {
  const totalCash = round2(
    accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0)
  )

  const activeDebts = debts.filter((d) => d.status !== 'Kapatıldı')

  const totalReceivables = round2(
    activeDebts
      .filter((d) => d.type === 'Alacak')
      .reduce((sum, d) => sum + Number(d.remaining || 0), 0)
  )

  const totalInvestments = round2(
    (investments || []).reduce(
      (sum, inv) => sum + Number(inv.quantity || 0) * Number(inv.current_price || 0),
      0
    )
  )

  const totalCardDebt = round2(
    cards.reduce((sum, c) => sum + Number(c.current_debt || 0), 0)
  )

  const totalOtherDebt = round2(
    activeDebts
      .filter((d) => d.type === 'Borç')
      .reduce((sum, d) => sum + Number(d.remaining || 0), 0)
  )

  const totalDebt = round2(totalCardDebt + totalOtherDebt)
  const netWorth = round2(totalCash + totalReceivables + totalInvestments - totalDebt)

  return {
    totalCash,
    totalReceivables,
    totalInvestments,
    totalCardDebt,
    totalOtherDebt,
    totalDebt,
    netWorth,
  }
}

/**
 * Portföy Analitiği & Varlık Dağılımı
 */
export function calculatePortfolioMetrics(
  investments: Array<{
    category: string
    quantity: number | null | undefined
    unit_cost: number | null | undefined
    current_price: number | null | undefined
  }>
): PortfolioMetricsResult {
  let totalValue = 0
  let totalCost = 0
  const catMap: Record<string, number> = {}

  for (const inv of investments) {
    const qty = Number(inv.quantity || 0)
    const cost = Number(inv.unit_cost || 0)
    const price = Number(inv.current_price || 0)

    const val = round2(qty * price)
    const initial = round2(qty * cost)

    totalValue = round2(totalValue + val)
    totalCost = round2(totalCost + initial)

    const cat = inv.category || 'Diğer'
    catMap[cat] = round2((catMap[cat] || 0) + val)
  }

  const totalProfitLoss = round2(totalValue - totalCost)
  const totalProfitLossPct = totalCost > 0 ? round2((totalProfitLoss / totalCost) * 100) : 0

  const categoryAllocations = Object.entries(catMap)
    .map(([category, value]) => ({
      category,
      value,
      pct: totalValue > 0 ? round2((value / totalValue) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    totalValue,
    totalCost,
    totalProfitLoss,
    totalProfitLossPct,
    assetCount: investments.length,
    categoryAllocations,
  }
}

/**
 * 2. Kredi Kartı Dönem Değişimi & Trend Analizi
 * Değişim = Güncel Dönem Borcu - Önceki Dönem Borcu
 */
export function calculateStatementChange(
  currentPeriodDebt: number,
  prevPeriodDebt: number | null | undefined
): StatementChangeResult {
  if (prevPeriodDebt === null || prevPeriodDebt === undefined || prevPeriodDebt === 0) {
    return { changeAmount: null, changePct: null, trend: 'NONE' }
  }

  const changeAmount = round2(currentPeriodDebt - prevPeriodDebt)
  const changePct = round2((changeAmount / prevPeriodDebt) * 100)

  let trend: StatementChangeResult['trend'] = 'STABLE'
  if (changeAmount > 0) trend = 'UP'
  else if (changeAmount < 0) trend = 'DOWN'

  return {
    changeAmount,
    changePct,
    trend,
  }
}

/**
 * 3. Harcama Dağılımı (Kişisel / İş / Finansman / Hariç)
 */
export function calculateSpendingBreakdown(
  transactions: Array<{ type: string; analysis_group: string; amount: number | null | undefined }>
): SpendingBreakdown {
  let personal = 0
  let business = 0
  let financing = 0
  let excluded = 0

  for (const t of transactions) {
    const amount = Number(t.amount || 0)
    if (t.type === 'Kart Ödemesi' || t.type === 'Transfer' || t.type === 'Gelir' || t.type === 'Tahsilat' || t.analysis_group === 'Hariç' || t.analysis_group === 'Gelir') {
      excluded += amount
      continue
    }

    const isRefund = t.type === 'İade' || amount < 0
    const absAmount = Math.abs(amount)
    const factor = isRefund ? -1 : 1

    if (t.analysis_group === 'Kişisel') {
      personal += factor * absAmount
    } else if (t.analysis_group === 'İş') {
      business += factor * absAmount
    } else if (t.analysis_group === 'Finansman' || t.type === 'Finansman/Masraf') {
      financing += factor * absAmount
    } else {
      personal += factor * absAmount
    }
  }

  const totalConsumption = round2(Math.max(0, personal) + Math.max(0, business) + Math.max(0, financing))

  return {
    personal: round2(personal),
    business: round2(business),
    financing: round2(financing),
    excluded: round2(excluded),
    totalConsumption,
  }
}

/**
 * 4. Proje Gerçek Maliyeti (The Bridge)
 * Projeye ait tüm tekil harcamalar ve aktif SaaS aboneliklerinin canlı toplamı
 */
export function calculateProjectTotalCost(
  projectId: string,
  transactions: Array<{ project_id?: string | null; amount: number | null | undefined }>,
  subscriptions: Array<{ project_id?: string | null; amount: number | null | undefined; status?: string | null }>
): number {
  const directCost = transactions
    .filter((t) => t.project_id === projectId)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)

  const subCost = subscriptions
    .filter((s) => s.project_id === projectId && s.status !== 'İptal')
    .reduce((sum, s) => sum + Number(s.amount || 0), 0)

  return round2(directCost + subCost)
}

/**
 * 5. Proje Bütçe Tavanı Değerlendirmesi
 * %85 ve üstü: Sarı Uyarı | %100 ve üstü: Kırmızı Aşım
 */
export function evaluateProjectBudget(
  totalCost: number,
  budgetLimit: number | null | undefined
): BudgetEvaluationResult {
  if (!budgetLimit || budgetLimit <= 0) {
    return { ratio: null, status: 'NO_BUDGET', isWarning: false, isExceeded: false }
  }

  const ratio = round2(totalCost / budgetLimit)
  const isExceeded = totalCost >= budgetLimit
  const isWarning = totalCost >= budgetLimit * 0.85 && !isExceeded

  let status: BudgetEvaluationResult['status'] = 'GREEN'
  if (isExceeded) status = 'RED'
  else if (isWarning) status = 'YELLOW'

  return {
    ratio,
    status,
    isWarning,
    isExceeded,
  }
}

/**
 * 6. 6 Aylık Planlı Nakit Yükü & Taksit Projeksiyonu
 * Gelecek 6 ayın her ayı için: (Aktif Abonelikler) + (Devam Eden Taksit Tutarları)
 */
export function projectSixMonthCashLoad(
  subscriptions: Array<{
    status?: string | null
    period?: string | null
    amount: number | null | undefined
    end_date?: string | null
  }>,
  installments: InstallmentScheduleItem[] = [],
  monthCount = 6
): number[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  const projection: number[] = []

  for (let month = 1; month <= monthCount; month++) {
    // Target date for this projection month
    const targetDate = new Date(currentYear, currentMonth + month, 1)

    // Sum active subscriptions for this month
    const monthSubs = subscriptions
      .filter((s) => {
        if (s.status === 'İptal') return false
        if (s.period && s.period !== 'Aylık' && s.period !== 'Tekrarlayan') return false
        if (s.end_date) {
          const endDate = new Date(s.end_date)
          if (targetDate > endDate) return false
        }
        return true
      })
      .reduce((sum, s) => sum + Number(s.amount || 0), 0)

    // Sum installments that are active in this month (remainingMonths >= month)
    const monthInstallments = installments
      .filter((inst) => inst.remainingMonths >= month)
      .reduce((sum, inst) => sum + Number(inst.amountPerMonth || 0), 0)

    projection.push(round2(monthSubs + monthInstallments))
  }

  return projection
}

/**
 * 7. Kurucu Runway Formülü
 * Likit Nakit / (Kişisel Aylık Tüketim + Proje Aylık Yakma Hızı)
 */
export function calculateFounderRunway(
  availableCash: number,
  monthlyPersonalBurn: number,
  projectMonthlyCosts = 0
): FounderRunwayResult {
  const totalMonthlyCashDrain = round2(monthlyPersonalBurn + projectMonthlyCosts)

  if (totalMonthlyCashDrain <= 0) {
    return {
      monthlyBurn: round2(monthlyPersonalBurn),
      projectMonthlyLoad: round2(projectMonthlyCosts),
      totalMonthlyCashDrain: 0,
      runwayMonths: 'infinite',
    }
  }

  const runwayMonths = round2(availableCash / totalMonthlyCashDrain)

  return {
    monthlyBurn: round2(monthlyPersonalBurn),
    projectMonthlyLoad: round2(projectMonthlyCosts),
    totalMonthlyCashDrain,
    runwayMonths,
  }
}

/**
 * 8. Alacak Tahsilat Senkronizasyonu
 * Alacak tahsil edildiğinde: Hesap bakiyesi artar, kalan alacak düşer
 */
export function collectReceivable(
  currentAccountBalance: number,
  currentRemaining: number,
  collectedAmount: number
): { newAccountBalance: number; newReceivableRemaining: number; isClosed: boolean } {
  const newAccountBalance = round2(currentAccountBalance + collectedAmount)
  const newReceivableRemaining = round2(Math.max(0, currentRemaining - collectedAmount))
  const isClosed = newReceivableRemaining <= 0

  return {
    newAccountBalance,
    newReceivableRemaining,
    isClosed,
  }
}

/**
 * 9. Borç Geri Ödeme Senkronizasyonu
 * Borç ödendiğinde: Hesap bakiyesi düşer, kalan borç düşer
 */
export function payDebt(
  currentAccountBalance: number,
  currentRemaining: number,
  paidAmount: number
): { newAccountBalance: number; newDebtRemaining: number; isClosed: boolean } {
  const newAccountBalance = round2(currentAccountBalance - paidAmount)
  const newDebtRemaining = round2(Math.max(0, currentRemaining - paidAmount))
  const isClosed = newDebtRemaining <= 0

  return {
    newAccountBalance,
    newDebtRemaining,
    isClosed,
  }
}

/**
 * 10. Kademeli Alım & Ağırlıklı Ortalama Maliyet (DCA - Dollar Cost Averaging)
 * Yeni Adet = Eski Adet + Alınan Adet
 * Yeni Birim Maliyet = ((Eski Adet * Eski Maliyet) + (Alınan Adet * Alış Fiyatı)) / Yeni Adet
 */
export function calculateDcaAverageCost(
  currentQty: number,
  currentUnitCost: number,
  addedQty: number,
  purchasePrice: number
): { newQuantity: number; newUnitCost: number; totalCost: number } {
  const cQty = Math.max(0, currentQty || 0)
  const cCost = Math.max(0, currentUnitCost || 0)
  const aQty = Math.max(0, addedQty || 0)
  const aPrice = Math.max(0, purchasePrice || 0)

  const newQuantity = round2(cQty + aQty)
  const totalCost = round2(cQty * cCost + aQty * aPrice)
  const newUnitCost = newQuantity > 0 ? round2(totalCost / newQuantity) : 0

  return {
    newQuantity,
    newUnitCost,
    totalCost,
  }
}

/**
 * 11. Kasa & Nakit Akışı Analizi (Maaş / Gelir, Kart Ödemesi, Faizler)
 * Gerçek nakit girişlerini, kredi kartlarına aktarılan tutarları ve net kasa değişimini hesaplar.
 */
export interface MonthlyCashFlowResult {
  totalInflow: number
  cardPayments: number
  financingFees: number
  netCashFlow: number
  inflowCount: number
  cardPaymentCount: number
}

export function calculateMonthlyCashFlow(
  transactions: Array<{
    amount: number | null | undefined
    type?: string | null
    analysis_group?: string | null
    description?: string | null
    merchant?: string | null
  }>
): MonthlyCashFlowResult {
  let totalInflow = 0
  let cardPayments = 0
  let financingFees = 0
  let inflowCount = 0
  let cardPaymentCount = 0

  for (const t of transactions) {
    const amount = Number(t.amount || 0)
    const desc = (t.description || '').toLowerCase()
    const merch = (t.merchant || '').toLowerCase()
    const type = t.type || ''
    const group = t.analysis_group || ''

    // İç transferleri filtrele (kendi hesapları arasındaki FAST/Havale)
    // Maaş veya harici gelirleri al
    const isInternalTransfer =
      desc.includes('fast anlık ödeme') ||
      desc.includes('transfer') ||
      desc.includes('gönd:') ||
      merch.includes('vakıf katılım')

    if (type === 'Gelir' || type === 'Tahsilat' || group === 'Gelir' || group === 'Tahsilat') {
      if (!isInternalTransfer || desc.includes('maaş') || desc.includes('tahsilat') || desc.includes('hızır')) {
        totalInflow = round2(totalInflow + amount)
        inflowCount++
      }
    } else if (
      type === 'Kart Ödemesi' ||
      merch.includes('kart ödemesi') ||
      desc.includes('kk tahsilat') ||
      desc.includes('kredi kartı ödemesi')
    ) {
      cardPayments = round2(cardPayments + amount)
      cardPaymentCount++
    } else if (type === 'Finansman/Masraf' || group === 'Finansman') {
      financingFees = round2(financingFees + amount)
    }
  }

  const rawNet = round2(totalInflow - cardPayments - financingFees)
  const netCashFlow = Object.is(rawNet, -0) ? 0 : rawNet

  return {
    totalInflow,
    cardPayments,
    financingFees,
    netCashFlow,
    inflowCount,
    cardPaymentCount,
  }
}


