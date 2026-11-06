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

export interface CardStatementRemainingResult {
  remainingStatementDebt: number
  remainingMinimumPayment: number
  isFullyPaid: boolean
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
  amountPerMonth?: number | string
  remainingMonths?: number
  due_date?: string | null
  amount?: number | string | null
  status?: string | null
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
 * Kredi Kartı Ekstresinden Kalan Borç ve Asgari Tutar Analizi
 * Kuruş hassasiyeti (round2) ve negatif değer korumalı saf hesaplama.
 */
export function calculateCardStatementRemaining(
  statementDebt: number | null | undefined,
  payments: number | null | undefined,
  minimumPayment?: number | null | undefined,
  currentDebt?: number | null | undefined
): CardStatementRemainingResult {
  const stmtDebt = Math.max(0, Number(statementDebt || 0))
  const paid = Math.max(0, Number(payments || 0))
  const minPay = Math.max(0, Number(minimumPayment || 0))

  let remainingStatementDebt = Math.max(0, round2(stmtDebt - paid))
  let remainingMinimumPayment = Math.max(0, round2(minPay - paid))

  if (currentDebt !== undefined && currentDebt !== null) {
    const curDebt = Math.max(0, Number(currentDebt))
    remainingStatementDebt = Math.min(curDebt, remainingStatementDebt)
    remainingMinimumPayment = Math.min(remainingStatementDebt, remainingMinimumPayment)
  }

  const isFullyPaid = stmtDebt > 0
    ? (remainingStatementDebt === 0 || (currentDebt !== undefined && currentDebt !== null && Number(currentDebt) <= 0))
    : false

  return {
    remainingStatementDebt,
    remainingMinimumPayment,
    isFullyPaid,
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
  subscriptions: Array<{
    project_id?: string | null
    amount: number | null | undefined
    status?: string | null
    decision?: string | null
    currency?: string | null
  }>,
  rates?: Record<string, number>
): number {
  const directCost = (transactions || [])
    .filter((t) => t && t.project_id === projectId)
    .reduce((sum, t) => sum + safeParseAmount(t.amount), 0)

  const subCost = (subscriptions || [])
    .filter((s) => s && s.project_id === projectId && s.status !== 'İptal' && (s as any).decision !== 'İptal Et')
    .reduce((sum, s) => {
      const amt = safeParseAmount(s.amount)
      const cur = (s.currency || 'TRY').toUpperCase()
      const rate = (rates && rates[cur]) ? rates[cur] : 1
      return sum + round2(amt * rate)
    }, 0)

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

export type SubscriptionPeriod =
  | 'Aylık'
  | 'Haftalık'
  | '3 Aylık'
  | '6 Aylık'
  | 'Yıllık'
  | 'Tek Seferlik'

export interface SubscriptionEquivalent {
  monthly: number
  yearly: number
}


/**
 * Kullanıcı girdisi veya veritabanındaki periyot metnini standart kanonik formata dönüştürür.
 * Büyük/küçük harf, Türkçe karakter varyasyonları (ı/i, ü/u, ç/c), tire ve takma adları destekler.
 */
export function normalizeSubscriptionPeriod(period?: string | null): SubscriptionPeriod {
  if (!period) return 'Aylık'
  const p = period
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/ı/g, 'i')
    .replace(/ü/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')

  if (p === 'haftalik' || p === 'weekly' || p === 'hafta') {
    return 'Haftalık'
  }
  if (
    p === '3 aylik' ||
    p === '3-aylik' ||
    p === '3aylik' ||
    p === 'quarterly' ||
    p === 'uc aylik' ||
    p === '3 ay'
  ) {
    return '3 Aylık'
  }
  if (
    p === '6 aylik' ||
    p === '6-aylik' ||
    p === '6aylik' ||
    p === 'semi-annual' ||
    p === 'semiannual' ||
    p === 'biannual' ||
    p === 'alti aylik' ||
    p === '6 ay'
  ) {
    return '6 Aylık'
  }
  if (p === 'yillik' || p === 'annual' || p === 'yearly' || p === 'yil' || p === 'sene') {
    return 'Yıllık'
  }
  if (
    p === 'tek seferlik' ||
    p === 'tek-seferlik' ||
    p === 'tekseferlik' ||
    p === 'tek' ||
    p === 'one-time' ||
    p === 'onetime' ||
    p === 'once'
  ) {
    return 'Tek Seferlik'
  }
  return 'Aylık'
}

/**
 * Kullanıcı form girdisini (Türkçe virgül veya nokta ayracı, binlik ayraçlar, para birimi sembolleri, boşluklar vb.) güvenle sayıya dönüştürür.
 */
export function safeParseAmount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isFinite(val) ? Math.max(0, val) : 0
  let clean = String(val).trim()
  if (!clean) return 0
  clean = clean.replace(/[^\d.,-]/g, '')
  if (!clean) return 0
  if (clean.startsWith('-')) return 0

  const lastDot = clean.lastIndexOf('.')
  const lastComma = clean.lastIndexOf(',')

  let normalized = clean
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 (Türkçe biçim)
      normalized = clean.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 (Anglo-Sakson biçim)
      normalized = clean.replace(/,/g, '')
    }
  } else if (clean.split('.').length > 2) {
    // 1.000.000 (Birden fazla nokta -> binlik ayraç)
    normalized = clean.replace(/\./g, '')
  } else if (clean.split(',').length > 2) {
    // 1,000,000 (Birden fazla virgül -> binlik ayraç)
    normalized = clean.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // Tek virgül: 150,50
    normalized = clean.replace(',', '.')
  }

  const parsed = parseFloat(normalized)
  return isNaN(parsed) || !isFinite(parsed) ? 0 : Math.max(0, round2(parsed))
}

/**
 * Abonelik / Sabit Gider Normalizasyonu
 * Farklı periyotlardaki giderleri aylık eşdeğer ve yıllık yüke dönüştürür.
 * - 3 Aylık: Girilen tutar / 3 = Aylık eşdeğer (Yıllık = Aylık * 12)
 * - 6 Aylık: Girilen tutar / 6 = Aylık eşdeğer (Yıllık = Aylık * 12)
 * - Yıllık: Girilen tutar / 12 = Aylık eşdeğer (Yıllık = Girilen tutar)
 * - Aylık: Girilen tutar = Aylık eşdeğer (Yıllık = Aylık * 12)
 * - Haftalık: (Girilen tutar * 52) / 12 = Aylık eşdeğer (Yıllık = Aylık * 12)
 * - Tek Seferlik: Düzenli tekrarlayan yüke katılmaz (0 TL)
 */
export function calculateSubscriptionEquivalent(
  amount: number | null | undefined,
  period?: string | null,
  currency?: string | null,
  rate = 1
): SubscriptionEquivalent {
  const rawAmt = Number(amount || 0)
  if (!rawAmt || isNaN(rawAmt) || !isFinite(rawAmt) || rawAmt <= 0) {
    return { monthly: 0, yearly: 0 }
  }

  const effectiveRate = currency && currency.toUpperCase() !== 'TRY' && rate > 0 ? rate : 1
  const amt = round2(rawAmt * effectiveRate)

  const norm = normalizeSubscriptionPeriod(period)

  switch (norm) {
    case 'Haftalık': {
      const monthly = round2((amt * 52) / 12)
      const yearly = round2(monthly * 12)
      return { monthly, yearly }
    }
    case '3 Aylık': {
      const monthly = round2(amt / 3)
      const yearly = round2(monthly * 12)
      return { monthly, yearly }
    }
    case '6 Aylık': {
      const monthly = round2(amt / 6)
      const yearly = round2(monthly * 12)
      return { monthly, yearly }
    }
    case 'Yıllık': {
      const monthly = round2(amt / 12)
      const yearly = round2(amt)
      return { monthly, yearly }
    }
    case 'Tek Seferlik': {
      return { monthly: 0, yearly: 0 }
    }
    case 'Aylık':
    default: {
      const monthly = round2(amt)
      const yearly = round2(amt * 12)
      return { monthly, yearly }
    }
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
    currency?: string | null
    end_date?: string | null
    decision?: string | null
  }> = [],
  installments: InstallmentScheduleItem[] = [],
  monthCount = 6,
  rates?: Record<string, number>
): number[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  const projection: number[] = []

  for (let month = 1; month <= monthCount; month++) {
    // Target date for this projection month
    const targetDate = new Date(currentYear, currentMonth + month, 1)

    // Sum active subscriptions for this month
    const monthSubs = (subscriptions || [])
      .filter((s) => {
        if (!s) return false
        if (s.status === 'İptal' || (s as any).decision === 'İptal Et') return false
        if (s.end_date) {
          const endDate = new Date(s.end_date)
          if (!isNaN(endDate.getTime()) && targetDate > endDate) return false
        }
        return true
      })
      .reduce((sum, s) => {
        const cur = (s.currency || 'TRY').toUpperCase()
        const rate = rates && rates[cur] ? rates[cur] : 1
        const eq = calculateSubscriptionEquivalent(s.amount, s.period, cur, rate)
        return sum + eq.monthly
      }, 0)

    // Sum installments that are active in this month
    const monthInstallments = (installments || [])
      .filter((inst) => {
        if (!inst) return false
        if (inst.status === 'Ödendi') return false

        // Raw debt_installment with due_date
        if (inst.due_date) {
          const d = new Date(inst.due_date)
          if (isNaN(d.getTime())) return false
          return (
            d.getFullYear() === targetDate.getFullYear() &&
            d.getMonth() === targetDate.getMonth()
          )
        }

        // Legacy format with remainingMonths
        if (typeof inst.remainingMonths === 'number') {
          return inst.remainingMonths >= month
        }

        return false
      })
      .reduce((sum, inst) => {
        const amt = inst.amount !== undefined ? inst.amount : inst.amountPerMonth
        return sum + safeParseAmount(amt)
      }, 0)

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
  }>,
  options?: {
    accountNames?: string[]
  }
): MonthlyCashFlowResult {
  let totalInflow = 0
  let cardPayments = 0
  let financingFees = 0
  let inflowCount = 0
  let cardPaymentCount = 0

  const accountNames = (options?.accountNames || []).map((n) => n.toLowerCase().trim()).filter((n) => n.length > 2)

  for (const t of transactions) {
    const amount = Number(t.amount || 0)
    const desc = (t.description || '').toLowerCase()
    const merch = (t.merchant || '').toLowerCase()
    const type = t.type || ''
    const group = t.analysis_group || ''

    // Kendi hesapları ve kartları arasındaki iç transferleri filtrele (mükerrerliği önle)
    const isInternalAccountMatch = accountNames.some((name) => desc.includes(name) || merch.includes(name))

    const isInternalTransfer =
      desc.includes('fast anlık ödeme') ||
      desc.includes('transfer') ||
      desc.includes('virman') ||
      desc.includes('hesaplar arası') ||
      desc.includes('kendi hesabıma') ||
      desc.includes('gönd:') ||
      isInternalAccountMatch ||
      type === 'Transfer' ||
      group === 'Transfer'

    if (type === 'Gelir' || type === 'Tahsilat' || group === 'Gelir' || group === 'Tahsilat') {
      if (!isInternalTransfer || desc.includes('maaş') || desc.includes('ücret') || desc.includes('hakediş')) {
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

/**
 * 12. Beyan Odaklı Aylık Gelir Analitiği (Income Engine)
 * Farklı periyotlardaki (Aylık, Yıllık, 3 Aylık, 6 Aylık, Tek Seferlik) gelir kalemlerini
 * aylık net eşdeğer ve yıllık toplam kapasiteye dönüştürür.
 */
export interface IncomeMetricsResult {
  totalMonthlyIncome: number
  totalYearlyIncome: number
  fixedMonthlyIncome: number
  fixedYearlyIncome: number
  variableMonthlyIncome: number
  variableYearlyIncome: number
  oneTimeIncomeTotal: number
  activeCount: number
  passiveCount: number
  fixedCount: number
  variableCount: number
}

export function calculateIncomeMetrics(
  incomes: Array<{
    amount: number | null | undefined
    period?: string | null
    income_type?: 'Sabit' | 'Değişken' | string | null
    status?: 'Aktif' | 'Pasif' | string | null
    currency?: string | null
  }> = [],
  rates?: Record<string, number>
): IncomeMetricsResult {
  let totalMonthlyIncome = 0
  let totalYearlyIncome = 0
  let fixedMonthlyIncome = 0
  let fixedYearlyIncome = 0
  let variableMonthlyIncome = 0
  let variableYearlyIncome = 0
  let oneTimeIncomeTotal = 0
  let activeCount = 0
  let passiveCount = 0
  let fixedCount = 0
  let variableCount = 0

  for (const item of incomes || []) {
    if (!item) continue
    if (item.status === 'Pasif') {
      passiveCount++
      continue
    }

    activeCount++
    const isVariable = item.income_type === 'Değişken'
    if (isVariable) variableCount++
    else fixedCount++

    const cur = (item.currency || 'TRY').toUpperCase()
    const rate = rates && rates[cur] ? rates[cur] : 1
    const normPeriod = normalizeSubscriptionPeriod(item.period)
    if (normPeriod === 'Tek Seferlik') {
      oneTimeIncomeTotal = round2(oneTimeIncomeTotal + round2(safeParseAmount(item.amount) * rate))
      continue
    }

    const eq = calculateSubscriptionEquivalent(item.amount, normPeriod, cur, rate)
    totalMonthlyIncome = round2(totalMonthlyIncome + eq.monthly)
    totalYearlyIncome = round2(totalYearlyIncome + eq.yearly)

    if (isVariable) {
      variableMonthlyIncome = round2(variableMonthlyIncome + eq.monthly)
      variableYearlyIncome = round2(variableYearlyIncome + eq.yearly)
    } else {
      fixedMonthlyIncome = round2(fixedMonthlyIncome + eq.monthly)
      fixedYearlyIncome = round2(fixedYearlyIncome + eq.yearly)
    }
  }

  return {
    totalMonthlyIncome,
    totalYearlyIncome,
    fixedMonthlyIncome,
    fixedYearlyIncome,
    variableMonthlyIncome,
    variableYearlyIncome,
    oneTimeIncomeTotal,
    activeCount,
    passiveCount,
    fixedCount,
    variableCount,
  }
}

/**
 * 13. Aylık Gelir & Gider Dengesi (Serbest Bütçe & Net Marj Hesabı)
 * - Serbest Bütçe = Aylık Net Gelir − Aylık Sabit Giderler (Abonelikler)
 * - Kalan Net Marj = Serbest Bütçe − Güncel Değişken Harcama / Kart Yükü
 */
export interface MonthlyBudgetBalanceResult {
  monthlyIncome: number
  fixedExpenses: number
  disposableBudget: number
  currentVariableLoad: number
  netMargin: number
  fixedRatioPct: number
  variableRatioPct: number
  totalUsedRatioPct: number
}

export function calculateMonthlyBudgetBalance(
  monthlyIncome: number,
  fixedMonthlyExpenses: number,
  currentVariableLoad = 0
): MonthlyBudgetBalanceResult {
  const inc = round2(Math.max(0, monthlyIncome || 0))
  const fixed = round2(Math.max(0, fixedMonthlyExpenses || 0))
  const variable = round2(Math.max(0, currentVariableLoad || 0))

  const disposableBudget = round2(inc - fixed)
  const netMargin = round2(disposableBudget - variable)

  const fixedRatioPct = inc > 0 ? round2((fixed / inc) * 100) : 0
  const variableRatioPct = inc > 0 ? round2((variable / inc) * 100) : 0
  const totalUsedRatioPct = inc > 0 ? round2(((fixed + variable) / inc) * 100) : 0

  return {
    monthlyIncome: inc,
    fixedExpenses: fixed,
    disposableBudget,
    currentVariableLoad: variable,
    netMargin,
    fixedRatioPct,
    variableRatioPct,
    totalUsedRatioPct,
  }
}

/**
 * 14. Getirili & Günlük Birikim Hesabı ("Damla Motoru")
 */
export interface AccountYieldInput {
  balance?: number | string | null
  interest_rate?: number | string | null
  withholding_tax_rate?: number | string | null
  reserved_base_amount?: number | string | null
  maturity_date?: string | null
  last_yield_applied_at?: string | null
  type?: string | null
}

export interface AccountYieldResult {
  activePrincipal: number
  reservedBaseAmount: number
  interestRate: number
  withholdingTaxRate: number
  dailyGrossYield: number
  dailyNetYield: number
  monthlySimpleNetYield: number
  monthlyCompoundNetYield: number
  yearlySimpleNetYield: number
  pendingDays: number
  pendingNetYield: number
  daysToMaturity: number | null
  isMatured: boolean
  hasYield: boolean
}

export interface AccountsYieldSummaryResult {
  totalCash: number
  liquidCash: number
  savingsCash: number
  totalActivePrincipal: number
  totalDailyNetYield: number
  totalMonthlyNetYield: number
  totalYearlyNetYield: number
  totalPendingNetYield: number
  yieldAccountCount: number
}

function parseYMDParts(dateStr: string): [number, number, number] | null {
  if (!dateStr || typeof dateStr !== 'string') return null
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const y = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const d = parseInt(match[3], 10)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return [y, m - 1, d]
}

function calculateDayDifference(fromDateStr: string, toDateStr: string): number {
  const fromParts = parseYMDParts(fromDateStr)
  const toParts = parseYMDParts(toDateStr)
  if (!fromParts || !toParts) return 0
  const fromUtc = Date.UTC(fromParts[0], fromParts[1], fromParts[2])
  const toUtc = Date.UTC(toParts[0], toParts[1], toParts[2])
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24))
}

function formatDateToYMD(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calculateAccountYield(
  account?: AccountYieldInput | null,
  referenceDate?: string | Date
): AccountYieldResult {
  if (!account) {
    return {
      activePrincipal: 0,
      reservedBaseAmount: 0,
      interestRate: 0,
      withholdingTaxRate: 10,
      dailyGrossYield: 0,
      dailyNetYield: 0,
      monthlySimpleNetYield: 0,
      monthlyCompoundNetYield: 0,
      yearlySimpleNetYield: 0,
      pendingDays: 0,
      pendingNetYield: 0,
      daysToMaturity: null,
      isMatured: false,
      hasYield: false,
    }
  }

  const refStr = referenceDate instanceof Date
    ? formatDateToYMD(referenceDate)
    : (typeof referenceDate === 'string' && referenceDate.trim()
        ? referenceDate.trim().slice(0, 10)
        : formatDateToYMD(new Date()))

  const rawBalance = safeParseAmount(account.balance)
  const balance = round2(Math.max(0, rawBalance))
  const reservedBaseAmount = round2(Math.max(0, safeParseAmount(account.reserved_base_amount)))
  const activePrincipal = Math.max(0, round2(balance - reservedBaseAmount))

  const interestRate = Math.max(0, safeParseAmount(account.interest_rate))
  const withholdingTaxRate = account.withholding_tax_rate !== undefined && account.withholding_tax_rate !== null
    ? Math.max(0, Math.min(100, safeParseAmount(account.withholding_tax_rate)))
    : 10

  const hasYield = activePrincipal > 0 && interestRate > 0

  const dailyGrossYield = hasYield ? round2((activePrincipal * (interestRate / 100)) / 365) : 0
  const dailyNetYield = hasYield ? round2(dailyGrossYield * (1 - withholdingTaxRate / 100)) : 0
  const monthlySimpleNetYield = hasYield ? round2(dailyNetYield * 30) : 0

  // 30-day compound net yield for daily compounding interest
  const dailyNetRate = hasYield ? ((interestRate / 100) / 365) * (1 - withholdingTaxRate / 100) : 0
  const monthlyCompoundNetYield = hasYield ? round2(activePrincipal * (Math.pow(1 + dailyNetRate, 30) - 1)) : 0
  const yearlySimpleNetYield = hasYield ? round2(dailyNetYield * 365) : 0

  // Pending days & pending net yield calculation
  let pendingDays = 0
  if (hasYield) {
    if (account.last_yield_applied_at && typeof account.last_yield_applied_at === 'string' && account.last_yield_applied_at.trim()) {
      const parts = parseYMDParts(account.last_yield_applied_at)
      if (parts) {
        const diff = calculateDayDifference(account.last_yield_applied_at.trim().slice(0, 10), refStr)
        pendingDays = Math.max(0, diff)
      } else {
        // Geçersiz veya bozuk tarih formatında en az 1 günlük getiri kabul edilir
        pendingDays = 1
      }
    } else {
      pendingDays = 1
    }
  }
  const pendingNetYield = hasYield && pendingDays > 0 ? round2(dailyNetYield * pendingDays) : 0

  // Maturity calculation
  let daysToMaturity: number | null = null
  let isMatured = false
  if (account.maturity_date && typeof account.maturity_date === 'string' && account.maturity_date.trim()) {
    const parts = parseYMDParts(account.maturity_date)
    if (parts) {
      const diff = calculateDayDifference(refStr, account.maturity_date.trim().slice(0, 10))
      daysToMaturity = diff
      isMatured = diff <= 0
    }
  }

  return {
    activePrincipal,
    reservedBaseAmount,
    interestRate,
    withholdingTaxRate,
    dailyGrossYield,
    dailyNetYield,
    monthlySimpleNetYield,
    monthlyCompoundNetYield,
    yearlySimpleNetYield,
    pendingDays,
    pendingNetYield,
    daysToMaturity,
    isMatured,
    hasYield,
  }
}

export function calculateAccountsYieldSummary(
  accounts: AccountYieldInput[] = [],
  referenceDate?: string | Date
): AccountsYieldSummaryResult {
  let totalCash = 0
  let liquidCash = 0
  let savingsCash = 0
  let totalActivePrincipal = 0
  let totalDailyNetYield = 0
  let totalMonthlyNetYield = 0
  let totalYearlyNetYield = 0
  let totalPendingNetYield = 0
  let yieldAccountCount = 0

  for (const acc of accounts || []) {
    if (!acc) continue
    const balance = round2(safeParseAmount(acc.balance))
    totalCash = round2(totalCash + balance)

    const type = (acc.type || '').toLowerCase()
    if (type === 'vadesiz' || type === 'kasa' || type === 'gunluk_birikim' || type === 'nakit') {
      liquidCash = round2(liquidCash + balance)
    }

    const yieldRes = calculateAccountYield(acc, referenceDate)

    if (yieldRes.hasYield || type === 'gunluk_birikim' || type === 'vadeli') {
      savingsCash = round2(savingsCash + balance)
    }

    if (yieldRes.hasYield) {
      yieldAccountCount++
      totalActivePrincipal = round2(totalActivePrincipal + yieldRes.activePrincipal)
      totalDailyNetYield = round2(totalDailyNetYield + yieldRes.dailyNetYield)
      totalMonthlyNetYield = round2(totalMonthlyNetYield + yieldRes.monthlySimpleNetYield)
      totalYearlyNetYield = round2(totalYearlyNetYield + yieldRes.yearlySimpleNetYield)
      totalPendingNetYield = round2(totalPendingNetYield + yieldRes.pendingNetYield)
    }
  }

  return {
    totalCash,
    liquidCash,
    savingsCash,
    totalActivePrincipal,
    totalDailyNetYield,
    totalMonthlyNetYield,
    totalYearlyNetYield,
    totalPendingNetYield,
    yieldAccountCount,
  }
}



