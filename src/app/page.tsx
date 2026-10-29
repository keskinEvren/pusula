'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Wallet,
  CreditCard,
  Building2,
  HandCoins,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Plus,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/page-header'
import { DashboardRoutineStrip } from '@/components/routines/dashboard-routine-strip'
import { useToast } from '@/lib/toast-context'
import {
  type VaultResetRequest,
  getPendingResetRequest,
  cancelVaultReset,
  formatRemainingTime,
} from '@/lib/credentials-engine'

import {
  calculateNetWorth,
  projectSixMonthCashLoad,
  calculateIncomeMetrics,
  calculateSubscriptionEquivalent,
  calculateSpendingBreakdown,
  calculateMonthlyBudgetBalance,
  round2,
} from '@/lib/finance-engine'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type {
  Account,
  CreditCard as CardType,
  Debt,
  DebtInstallment,
  Transaction,
  Subscription,
  Project,
  Investment,
  Income,
} from '@/types/database'

export default function DashboardPage() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CardType[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [debtInstallments, setDebtInstallments] = useState<DebtInstallment[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)

  // Kasa Acil Durum Sıfırlama Karantinası State
  const [vaultResetRequest, setVaultResetRequest] = useState<VaultResetRequest | null>(null)
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState('')

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const supabase = createClient()
        const [
          { data: accs },
          { data: crds },
          { data: dbts },
          { data: txs },
          { data: subs },
          { data: prjs },
          invsRes,
          incsRes,
          instsRes,
        ] = await Promise.all([
          supabase.from('accounts').select('*'),
          supabase.from('credit_cards').select('*'),
          supabase.from('debts').select('*').eq('status', 'Açık'),
          supabase.from('transactions').select('*').order('date', { ascending: false }).limit(1000),
          supabase.from('subscriptions').select('*').eq('status', 'Aktif'),
          supabase.from('projects').select('*'),
          supabase.from('investments').select('*'),
          supabase.from('incomes').select('*'),
          supabase.from('debt_installments').select('*').eq('status', 'Bekliyor'),
        ])

        if (accs) setAccounts(accs)
        if (crds) setCards(crds)
        if (dbts) setDebts(dbts)
        if (txs) setTransactions(txs)
        if (subs) setSubscriptions(subs)
        if (prjs) setProjects(prjs)
        if (instsRes?.data) setDebtInstallments(instsRes.data)

        let finalInvs: Investment[] = []
        if (invsRes?.data) {
          finalInvs = invsRes.data
        } else {
          try {
            const cached = localStorage.getItem('pusula_local_investments')
            if (cached) finalInvs = JSON.parse(cached)
          } catch {}
        }
        setInvestments(finalInvs)

        let finalIncomes: Income[] = []
        if (incsRes?.data) {
          finalIncomes = incsRes.data
          try {
            localStorage.setItem('pusula_local_incomes', JSON.stringify(incsRes.data))
          } catch {}
        } else {
          try {
            const cachedIncomes = localStorage.getItem('pusula_local_incomes')
            if (cachedIncomes) finalIncomes = JSON.parse(cachedIncomes)
          } catch {}
        }
        setIncomes(finalIncomes)
      } catch (err) {
        console.error('Error loading dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()

    const handleRefresh = () => {
      loadDashboardData()
    }
    window.addEventListener('pusula:transaction-created', handleRefresh)
    window.addEventListener('pusula:incomes-changed', handleRefresh)
    return () => {
      window.removeEventListener('pusula:transaction-created', handleRefresh)
      window.removeEventListener('pusula:incomes-changed', handleRefresh)
    }
  }, [])

  // Kasa Acil Durum Sıfırlama Karantinası Sayacı
  useEffect(() => {
    const checkReset = () => {
      const pending = getPendingResetRequest()
      setVaultResetRequest(pending)
      if (pending) {
        setRemainingTimeDisplay(formatRemainingTime(pending.target_wiping_at).formatted)
      }
    }
    checkReset()
    const interval = setInterval(checkReset, 1000)
    window.addEventListener('pusula:vault-reset-changed', checkReset)
    return () => {
      clearInterval(interval)
      window.removeEventListener('pusula:vault-reset-changed', checkReset)
    }
  }, [])

  const handleCancelVaultReset = () => {
    cancelVaultReset()
    setVaultResetRequest(null)
    toast.success('Kasa sıfırlama karantinası iptal edildi! Kayıtlarınız güvende.')
  }

  // 1. Calculations via Pure Financial Engine
  const { totalCash, totalReceivables, totalInvestments, totalCardDebt, totalOtherDebt, totalDebt, netWorth } =
    useMemo(() => calculateNetWorth(accounts, debts, cards, investments), [accounts, debts, cards, investments])

  // 2. Active Subscriptions & 6-Month Combined Projection (Read-Only)
  const activeSubs = useMemo(
    () => subscriptions.filter((s) => s.status === 'Aktif' && s.decision !== 'İptal Et'),
    [subscriptions]
  )

  // Strictly filter installments to debt obligations ('Borç'), excluding receivable inflows ('Alacak')
  const pendingDebtInstallments = useMemo(() => {
    const debtMap = new Map(debts.map((d) => [d.id, d.type]))
    return debtInstallments.filter((inst) => debtMap.get(inst.debt_id) === 'Borç')
  }, [debtInstallments, debts])

  const cashForecast = useMemo(
    () => projectSixMonthCashLoad(activeSubs, pendingDebtInstallments, 6),
    [activeSubs, pendingDebtInstallments]
  )

  // 3. Monthly Income & Budget Balance (Clean Separation & Double-Counting Guard)
  const incomeMetrics = useMemo(() => calculateIncomeMetrics(incomes), [incomes])

  // Declared recurring subscriptions load
  const fixedMonthlyExpenses = useMemo(() => {
    return round2(
      activeSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [activeSubs])

  // Current month's pending debt installments load
  const currentMonthDebtLoad = useMemo(() => {
    const now = new Date()
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return round2(
      pendingDebtInstallments
        .filter((inst) => (inst.due_date || '').startsWith(currentYM))
        .reduce((sum, inst) => sum + Number(inst.amount || 0), 0)
    )
  }, [pendingDebtInstallments])

  // Total fixed monthly commitments (Subscriptions + Scheduled Debt Installments)
  const totalFixedCommitments = useMemo(
    () => round2(fixedMonthlyExpenses + currentMonthDebtLoad),
    [fixedMonthlyExpenses, currentMonthDebtLoad]
  )

  // Transactions belonging to current month, excluding already declared subscriptions and debt payments to prevent double-counting
  const currentMonthConsumption = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const activeSubNames = new Set(activeSubs.map((s) => s.service.trim().toLowerCase()))

    const monthTxs = transactions.filter((t) => {
      if (!(t.date || '').startsWith(ym)) return false
      // Exclude debt payments (already tracked under debts / debt_installments)
      if (t.type === 'Borç Ödemesi') return false
      // Exclude explicit recurring charges
      if (t.recurrence) return false
      // Exclude transactions matching active subscription services
      const merch = (t.merchant || '').trim().toLowerCase()
      const desc = (t.description || '').trim().toLowerCase()
      if (activeSubNames.has(merch) || activeSubNames.has(desc)) return false
      return true
    })

    return calculateSpendingBreakdown(monthTxs).totalConsumption
  }, [transactions, activeSubs])

  // If card debt is used as fallback, deduct card-billed subscriptions so they aren't double-counted
  const cardSubsEquivalent = useMemo(() => {
    return round2(
      activeSubs
        .filter((s) => s.payment_method?.toLowerCase().includes('kart') || s.payment_card_id)
        .reduce((sum, s) => sum + calculateSubscriptionEquivalent(s.amount, s.period).monthly, 0)
    )
  }, [activeSubs])

  const adjustedCardDebt = useMemo(
    () => round2(Math.max(0, totalCardDebt - cardSubsEquivalent)),
    [totalCardDebt, cardSubsEquivalent]
  )

  // Güncel harcama / kart yükü: Bu ay harcama kaydı varsa onu, yoksa net değişken kart borcunu baz alır
  const currentVariableLoad = useMemo(
    () => (currentMonthConsumption > 0 ? currentMonthConsumption : adjustedCardDebt),
    [currentMonthConsumption, adjustedCardDebt]
  )
  const currentVariableLoadLabel =
    currentMonthConsumption > 0 ? 'Bu Ayki Harcama Yükü' : 'Güncel Kart Dönem Yükü'

  const budgetBalance = useMemo(
    () =>
      calculateMonthlyBudgetBalance(
        incomeMetrics.totalMonthlyIncome,
        totalFixedCommitments,
        currentVariableLoad
      ),
    [incomeMetrics.totalMonthlyIncome, totalFixedCommitments, currentVariableLoad]
  )

  // 7. Capacity rule (Active planning + dev >= 2)
  const activeDevProjects = projects.filter(
    (p) => p.status === 'Planlama' || p.status === 'Geliştirmede'
  )
  const isCapacityFull = activeDevProjects.length >= 2

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-24 rounded-xl bg-card/60 border border-border/40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-card/60 border border-border/40" />
          ))}
        </div>
        <div className="h-44 rounded-xl bg-card/60 border border-border/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48 rounded-xl bg-card/60 border border-border/40" />
          <div className="h-48 rounded-xl bg-card/60 border border-border/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <PageHeader
        title="Genel Bakış"
        description="Finansal durumunuz, yaklaşan ödemeleriniz ve aktif projeleriniz"
        actions={
          <>
            <Link href="/import" className="flex-1 sm:flex-initial">
              <Button className="w-full sm:w-auto gap-2 shadow-sm h-9 text-xs font-semibold">
                <Receipt className="h-4 w-4" />
                Ekstre İçe Aktar
              </Button>
            </Link>
            <Link href="/transactions?new=true" className="flex-1 sm:flex-initial">
              <Button variant="outline" className="w-full sm:w-auto gap-2 h-9 text-xs">
                <Plus className="h-4 w-4" />
                Hareket Ekle
              </Button>
            </Link>
          </>
        }
      />

      {/* Acil Durum Kasa Sıfırlama Karantinası Uyarısı */}
      {vaultResetRequest && vaultResetRequest.is_active && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg shrink-0 mt-0.5">
              <ShieldAlert className="h-5 w-5 animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <div className="font-semibold text-sm text-foreground flex items-center gap-2 flex-wrap">
                <span className="text-rose-600 dark:text-rose-400 font-bold">⚠️ Kimlikler & Şifreler Kasası Karantinada</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold">
                  {remainingTimeDisplay}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                Ana parola unutulduğu için 24 saatlik acil durum sıfırlama karantinası başlatıldı. Bu sürenin sonunda eski çözülemeyen şifreli veriler kalıcı olarak silinecektir.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelVaultReset}
              className="text-xs border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex-1 sm:flex-initial font-semibold"
            >
              Talebi İptal Et
            </Button>
            <Link href="/credentials" className="flex-1 sm:flex-initial">
              <Button size="sm" variant="destructive" className="text-xs flex-1 sm:flex-initial font-semibold">
                Kasaya Git
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 3-Saniyelik Günlük Rutin Şeridi */}
      <DashboardRoutineStrip />

      {/* Focus Gate Capacity Warning */}
      {isCapacityFull && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 shadow-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">
              Aktif Proje Sınırı ({activeDevProjects.length}/2 Proje)
            </div>
            <div className="mt-0.5 text-xs text-amber-200/80">
              Şu anda aynı anda <strong>{activeDevProjects.map((p) => p.name).join(', ')}</strong> projelerini geliştiriyorsunuz. 
              Odak kuralınız gereği yeni bir projeye başlamadan önce mevcut projelerden birini tamamlayın veya arşivleyin.
            </div>
          </div>
          <Link href="/projects">
            <Button size="sm" variant="outline" className="text-xs border-amber-500/40 hover:bg-amber-500/20 text-amber-200">
              Projeleri Gör
            </Button>
          </Link>
        </div>
      )}

      {/* Linear Tarzı Konsolide KPI Şeridi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm">
        {/* 1. Net Varlık */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Net Varlık</span>
            <span className={`h-2 w-2 rounded-full ${netWorth >= 0 ? 'bg-success' : 'bg-destructive'}`} />
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-semibold tracking-tight tabular-nums ${netWorth >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              {formatCurrency(netWorth)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              (Nakit + Alacak + Portföy) − Borç
            </div>
          </div>
        </div>

        {/* 2. Hazır Nakit */}
        <Link href="/accounts" className="p-4 sm:p-5 flex flex-col justify-between group hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span>Hazır Nakit</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatCurrency(totalCash)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {accounts.length} banka ve kasa
            </div>
          </div>
        </Link>

        {/* 3. Portföy */}
        <Link href="/investments" className="p-4 sm:p-5 flex flex-col justify-between group hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span>Yatırımlar & Portföy</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatCurrency(totalInvestments)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {investments.length} varlık kalemi
            </div>
          </div>
        </Link>

        {/* 4. Kredi Kartı Borçları */}
        <Link href="/cards" className="p-4 sm:p-5 flex flex-col justify-between group hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span>Kredi Kartı Borçları</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-destructive tabular-nums">
              {formatCurrency(totalCardDebt)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {cards.length} kart borcu
            </div>
          </div>
        </Link>

        {/* 5. Alacaklar */}
        <Link href="/debts" className="p-4 sm:p-5 flex flex-col justify-between group hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span>Bekleyen Alacaklar</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-success tabular-nums">
              {formatCurrency(totalReceivables)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Bekleyen tahsilatlar
            </div>
          </div>
        </Link>
      </div>

      {/* Aylık Gelir & Gider Dengesi Kartı */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                <Banknote className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Aylık Gelir & Gider Dengesi</CardTitle>
                <CardDescription className="text-xs">
                  Beyan edilen aylık gelir kapasiteniz, sabit abonelik yükünüz ve güncel harcama marjınız
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {incomeMetrics.activeCount === 0 ? (
                <Link href="/incomes?new=true">
                  <Button size="sm" className="h-8 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Aylık Gelir Tanımla
                  </Button>
                </Link>
              ) : (
                <Link href="/incomes">
                  <Button variant="ghost" size="sm" className="h-8 text-xs">
                    Gelirleri Yönet ({incomeMetrics.activeCount}) →
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          {incomeMetrics.activeCount === 0 ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-dashed border-border bg-muted/15 p-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-foreground">
                  Henüz aylık gelir kalemi tanımlamadınız
                </div>
                <p className="text-xs text-muted-foreground">
                  Maaş, freelance veya proje gelirlerinizi beyan ederek sabit giderleriniz düşüldükten sonra kalan serbest bütçenizi ve net marjınızı takip edin.
                </p>
              </div>
              <Link href="/incomes?new=true" className="shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Gelir Ekle
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-0 sm:divide-x divide-border/60">
                {/* 1. Aylık Net Gelir */}
                <div className="sm:pr-4">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    1. Aylık Net Gelir
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-success tabular-nums">
                    {formatCurrency(budgetBalance.monthlyIncome)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Sabit: {formatCurrency(incomeMetrics.fixedMonthlyIncome)}
                    {incomeMetrics.variableMonthlyIncome > 0 &&
                      ` • Değişken: ${formatCurrency(incomeMetrics.variableMonthlyIncome)}`}
                  </div>
                </div>

                {/* 2. Sabit Giderler & Borç Taksitleri */}
                <div className="sm:px-4">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    2. Sabit Yük & Borç Taksitleri
                  </div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-foreground tabular-nums">
                    − {formatCurrency(budgetBalance.fixedExpenses)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Abonelik: {formatCurrency(fixedMonthlyExpenses)}
                    {currentMonthDebtLoad > 0 && ` • Taksit: ${formatCurrency(currentMonthDebtLoad)}`}
                  </div>
                </div>

                {/* 3. Serbest Bütçe (Gelir - Sabit Giderler) */}
                <div className="sm:px-4">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    3. Serbest Bütçe (Kalan Kapasite)
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-xl font-semibold tracking-tight tabular-nums',
                      budgetBalance.disposableBudget >= 0 ? 'text-foreground' : 'text-destructive'
                    )}
                  >
                    {formatCurrency(budgetBalance.disposableBudget)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Sabit yük sonrası kullanılabilir bütçe
                  </div>
                </div>

                {/* 4. Güncel Harcama / Kart Yükü Sonrası Net Marj */}
                <div className="sm:pl-4">
                  <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                    <span>4. Kalan Net Marj</span>
                    <Badge
                      variant={
                        budgetBalance.netMargin >= 0
                          ? budgetBalance.totalUsedRatioPct >= 85
                            ? 'secondary'
                            : 'success'
                          : 'destructive'
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      %{budgetBalance.totalUsedRatioPct} Kullanım
                    </Badge>
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-xl font-semibold tracking-tight tabular-nums',
                      budgetBalance.netMargin >= 0 ? 'text-emerald-400' : 'text-destructive'
                    )}
                  >
                    {formatCurrency(budgetBalance.netMargin)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {currentVariableLoadLabel}: − {formatCurrency(budgetBalance.currentVariableLoad)}
                  </div>
                </div>
              </div>

              {/* Görsel Bütçe Dağılım Çubuğu */}
              {budgetBalance.monthlyIncome > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(100, budgetBalance.fixedRatioPct)}%`,
                      }}
                      title={`Sabit Giderler: %${budgetBalance.fixedRatioPct}`}
                    />
                    <div
                      className={cn(
                        'h-full transition-all',
                        budgetBalance.netMargin < 0 ? 'bg-destructive' : 'bg-amber-400'
                      )}
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100 - Math.min(100, budgetBalance.fixedRatioPct), budgetBalance.variableRatioPct)
                        )}%`,
                      }}
                      title={`${currentVariableLoadLabel}: %${budgetBalance.variableRatioPct}`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        Sabit Giderler (%{budgetBalance.fixedRatioPct})
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            budgetBalance.netMargin < 0 ? 'bg-destructive' : 'bg-amber-400'
                          )}
                        />
                        {currentVariableLoadLabel} (%{budgetBalance.variableRatioPct})
                      </span>
                    </div>
                    <span>
                      Yıllık Gelir Kapasitesi:{' '}
                      <strong className="text-foreground">
                        {formatCurrency(incomeMetrics.totalYearlyIncome)}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 6-Month Cash Load Forecast */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">6 Aylık Planlı Nakit Yükü Projeksiyonu</CardTitle>
                <CardDescription className="text-xs">
                  Aktif abonelikler ve bekleyen borç taksitlerinin gelecek 6 aydaki seyri
                </CardDescription>
              </div>
              <Link href="/subscriptions">
                <Button variant="ghost" size="sm" className="text-xs">
                  Yönet →
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-0 sm:divide-x divide-border/50 py-1">
              {cashForecast.map((val, idx) => {
                const monthNames = ['1. Ay', '2. Ay', '3. Ay', '4. Ay', '5. Ay', '6. Ay']
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center justify-center p-2 sm:px-1 text-center bg-muted/20 sm:bg-transparent rounded-lg sm:rounded-none"
                  >
                    <span className="text-[11px] font-medium text-muted-foreground mb-1">
                      {monthNames[idx]}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-foreground truncate w-full">
                      {val > 0 ? formatCurrency(val).replace('₺', '').trim() : '0'} ₺
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Active Projects Quick Summary */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Aktif Projeler</CardTitle>
                <CardDescription className="text-xs">
                  Geliştirilmekte olan projeler ve bütçe sınırları
                </CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm" className="text-xs">
                  Tüm Projeler →
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground font-sans">
                Henüz aktif bir proje yok. Yeni bir fikir ekleyin veya proje başlatın.
              </div>
            ) : (
              <div className="divide-y divide-border/50 -my-2">
                {projects.slice(0, 3).map((prj) => (
                  <Link key={prj.id} href={`/projects/${prj.slug}`} className="block">
                    <div className="flex items-center justify-between py-2.5 px-1 hover:bg-muted/20 transition-colors cursor-pointer rounded-lg">
                      <div>
                        <div className="text-xs font-semibold text-foreground">{prj.name}</div>
                        <div className="text-[11px] text-muted-foreground capitalize mt-0.5">
                          {prj.status} • Bütçe: {formatCurrency(prj.budget_limit || 0)}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-mono">
                        {prj.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
