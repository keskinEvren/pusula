'use client'

import { useEffect, useState } from 'react'
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
  CalendarClock,
  ShieldCheck,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/page-header'

import {
  calculateNetWorth,
  calculateSpendingBreakdown,
  projectSixMonthCashLoad,
  calculateFounderRunway,
  round2,
} from '@/lib/finance-engine'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Account, CreditCard as CardType, Debt, Transaction, Subscription, Project, Investment } from '@/types/database'

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CardType[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)

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
        ] = await Promise.all([
          supabase.from('accounts').select('*'),
          supabase.from('credit_cards').select('*'),
          supabase.from('debts').select('*').eq('status', 'Açık'),
          supabase.from('transactions').select('*').order('date', { ascending: false }),
          supabase.from('subscriptions').select('*').eq('status', 'Aktif'),
          supabase.from('projects').select('*'),
          supabase.from('investments').select('*'),
        ])

        if (accs) setAccounts(accs)
        if (crds) setCards(crds)
        if (dbts) setDebts(dbts)
        if (txs) setTransactions(txs)
        if (subs) setSubscriptions(subs)
        if (prjs) setProjects(prjs)

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
      } catch (err) {
        console.error('Error loading dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  // 1. Calculations via Pure Financial Engine
  const { totalCash, totalReceivables, totalInvestments, totalCardDebt, totalOtherDebt, totalDebt, netWorth } =
    calculateNetWorth(accounts, debts, cards, investments)

  // 2. Active Month Determination & Spending Isolation
  const latestTxDate = transactions[0]?.date || new Date().toISOString().split('T')[0]
  const activeMonthPrefix = latestTxDate.slice(0, 7) // e.g. '2026-08'
  const activeMonthName = activeMonthPrefix === '2026-08' ? 'Ağustos 2026' : activeMonthPrefix

  const activeMonthTxs = transactions.filter((t) => t.date.startsWith(activeMonthPrefix))

  const { personal: personalSpent, business: businessSpent, financing: financeCost, totalConsumption } =
    calculateSpendingBreakdown(activeMonthTxs)

  // 3. Ongoing Installments Extraction (e.g. Masterpass 9/12 -> 3 months remaining)
  const activeInstallments = transactions
    .filter((t) => t.recurrence && /Taksit\s*\(\d+\/\d+\)/i.test(t.recurrence))
    .map((t) => {
      const m = t.recurrence!.match(/(\d+)\/(\d+)/)
      if (!m) return null
      const current = parseInt(m[1], 10)
      const total = parseInt(m[2], 10)
      const remaining = Math.max(0, total - current)
      return remaining > 0 ? { amountPerMonth: t.amount, remainingMonths: remaining } : null
    })
    .filter((inst): inst is { amountPerMonth: number; remainingMonths: number } => inst !== null)

  // 4. Active Subscriptions & Next Month Committed Load
  const activeSubs = subscriptions.filter((s) => s.status === 'Aktif' && s.decision !== 'İptal Et')
  const monthlyActiveSaaS = activeSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  const monthlyInstallmentsLoad = activeInstallments.reduce((sum, i) => sum + Number(i.amountPerMonth || 0), 0)
  const nextMonthCommittedLoad = round2(monthlyActiveSaaS + monthlyInstallmentsLoad)

  // 5. 6-Month Combined Projection
  const cashForecast = projectSixMonthCashLoad(activeSubs, activeInstallments, 6)

  // 6. Realistic Founder Runway (Survival Buffer)
  const monthlyBurn = totalConsumption > 0 ? totalConsumption : 15000
  const { runwayMonths, totalMonthlyCashDrain } = calculateFounderRunway(
    totalCash,
    monthlyBurn,
    nextMonthCommittedLoad
  )

  // 7. Capacity rule (Active planning + dev >= 2)
  const activeDevProjects = projects.filter(
    (p) => p.status === 'Planlama' || p.status === 'Geliştirmede'
  )
  const isCapacityFull = activeDevProjects.length >= 2

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-sm font-medium text-muted-foreground animate-pulse">
          Pusula verileri yükleniyor...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <PageHeader
        title="Komuta Merkezi"
        description="Kişisel finansınız, kasalarınız ve aktif projelerinizin anlık durumu"
        actions={
          <>
            <Link href="/import">
              <Button className="gap-2 shadow-sm h-9 text-xs font-semibold">
                <Receipt className="h-4 w-4" />
                Ekstre Yükle
              </Button>
            </Link>
            <Link href="/transactions?new=true">
              <Button variant="outline" className="gap-2 h-9 text-xs">
                <Plus className="h-4 w-4" />
                Hareket Ekle
              </Button>
            </Link>
          </>
        }
      />

      {/* Focus Gate Capacity Warning */}
      {isCapacityFull && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 shadow-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">
              Odak Kapasitesi Uyarısı ({activeDevProjects.length}/2 Proje Aktif)
            </div>
            <div className="mt-0.5 text-xs text-amber-200/80">
              Şu anda aynı anda <strong>{activeDevProjects.map((p) => p.name).join(', ')}</strong> projelerini geliştiriyorsunuz. 
              Odak bölünmesini önlemek için yeni bir projeye başlamadan önce mevcutlardan birini canlıya alın veya askıya alın.
            </div>
          </div>
          <Link href="/projects">
            <Button size="sm" variant="outline" className="text-xs border-amber-500/40 hover:bg-amber-500/20 text-amber-200">
              Projeleri Yönet
            </Button>
          </Link>
        </div>
      )}

      {/* Primary KPI Row (Net Worth & Balances) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Net Worth */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Varlık
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${
                netWorth >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {formatCurrency(netWorth)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              (Nakit + Alacak + Portföy) − Borç
            </p>
          </CardContent>
        </Card>

        {/* Ready Cash */}
        <Link href="/accounts">
          <Card className="border-border bg-card shadow-sm hover:border-primary/50 transition-all cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Hazır Para & Likit Kasa
              </CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {formatCurrency(totalCash)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>{accounts.length} hesap ve kasa</span>
                <span className="text-primary text-[11px] font-semibold">Kasaları Gör →</span>
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Investments & Portfolio */}
        <Link href="/investments">
          <Card className="border-border bg-card shadow-sm hover:border-purple-500/50 transition-all cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Portföy & Yatırımlar
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {formatCurrency(totalInvestments)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>{investments.length} varlık kalemi</span>
                <span className="text-purple-400 text-[11px] font-semibold">Portföyü Gör →</span>
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Credit Card Debts */}
        <Link href="/cards">
          <Card className="border-border bg-card shadow-sm hover:border-destructive/50 transition-all cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Kredi Kartı Borçları
              </CardTitle>
              <CreditCard className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-destructive">
                {formatCurrency(totalCardDebt)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>{cards.length} aktif kart</span>
                <span className="text-destructive text-[11px] font-semibold">Kartları Gör →</span>
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Receivables & Other Debts */}
        <Link href="/debts">
          <Card className="border-border bg-card shadow-sm hover:border-success/50 transition-all cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Kesin Alacaklar
              </CardTitle>
              <HandCoins className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-success">
                {formatCurrency(totalReceivables)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>Bekleyen tahsilatlar</span>
                <span className="text-success text-[11px] font-semibold">Borç/Alacak →</span>
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Secondary Strategic KPI Row (Active Month Spending vs Next Month Committed Load) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 1. Aktif Ay Tüketimi */}
        <Card className="border-border bg-card shadow-sm hover:border-primary/40 transition-all">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Link
                href={`/transactions?month=${activeMonthPrefix}`}
                className="text-sm font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                title="İşlem defterinde filtrele"
              >
                <span>🛒 Aktif Ay Tüketimi ({activeMonthName})</span>
                <span className="text-[10px] text-primary">→</span>
              </Link>
              <Link href={`/transactions?month=${activeMonthPrefix}`}>
                <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
                  {activeMonthTxs.length} Hareket
                </Badge>
              </Link>
            </div>
            <CardDescription className="text-xs">
              Bu döneme ait gerçek kişisel ve finansman harcamaları
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link
              href={`/transactions?month=${activeMonthPrefix}`}
              className="text-2xl font-bold font-mono text-foreground hover:text-primary transition-colors block"
            >
              {formatCurrency(totalConsumption)}
            </Link>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2 text-[11px]">
              <Link
                href={`/transactions?month=${activeMonthPrefix}&group=Kişisel`}
                className="rounded p-1 -m-1 hover:bg-muted/60 transition-colors block"
                title="Kişisel harcamaları filtrele"
              >
                <span className="text-muted-foreground block text-[10px]">Kişisel →</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(personalSpent)}</span>
              </Link>
              <Link
                href={`/transactions?month=${activeMonthPrefix}&group=İş`}
                className="rounded p-1 -m-1 hover:bg-muted/60 transition-colors block"
                title="İş & SaaS harcamalarını filtrele"
              >
                <span className="text-muted-foreground block text-[10px]">İş & SaaS →</span>
                <span className="font-mono font-semibold text-purple-400">{formatCurrency(businessSpent)}</span>
              </Link>
              <Link
                href={`/transactions?month=${activeMonthPrefix}&group=Finansman`}
                className="rounded p-1 -m-1 hover:bg-muted/60 transition-colors block"
                title="Faiz ve masrafları filtrele"
              >
                <span className="text-muted-foreground block text-[10px]">Faiz/Masraf →</span>
                <span className="font-mono font-semibold text-destructive">{formatCurrency(financeCost)}</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 2. Gelecek Ay Sabit / Planlı Yük */}
        <Link href="/subscriptions">
          <Card className="border-border bg-card shadow-sm hover:border-purple-500/50 transition-all cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4 text-purple-400" />
                  📅 Gelecek Ay Sabit Yükü
                </CardTitle>
                <Badge variant="purple" className="text-[10px]">
                  Planlı Çıkış
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Abonelikler, faturalar ve taksitlerin gelecek ayki toplam yükü
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="text-2xl font-bold font-mono text-purple-400">
                {formatCurrency(nextMonthCommittedLoad)} <span className="text-xs text-muted-foreground font-sans">/ ay</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground block">Sabit Yükler ({activeSubs.length})</span>
                  <span className="font-mono font-semibold text-foreground">{formatCurrency(monthlyActiveSaaS)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Devam Eden Taksit</span>
                  <span className="font-mono font-semibold text-foreground">{formatCurrency(monthlyInstallmentsLoad)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3. Kurucu Runway (Hayatta Kalma Tamponu) */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-primary" />
                ⏳ Kurucu Runway
              </CardTitle>
              {(() => {
                const numRunway = typeof runwayMonths === 'number' ? runwayMonths : 99
                const isInf = runwayMonths === 'infinite'
                return (
                  <Badge
                    variant={isInf || numRunway > 3 ? 'success' : numRunway > 1 ? 'outline' : 'destructive'}
                    className="text-[10px]"
                  >
                    {isInf ? 'Sonsuz' : numRunway > 3 ? 'Güvenli' : numRunway > 1 ? 'Dikkat' : 'Kritik'}
                  </Badge>
                )
              })()}
            </div>
            <CardDescription className="text-xs">
              Mevcut nakit ile yeni gelir olmadan hayatta kalma süresi
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-foreground">
                {typeof runwayMonths === 'number' ? runwayMonths.toFixed(1) : '∞'}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">Ay</span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-2">
              Aylık Tahmini Çıkış: <strong className="text-foreground font-mono">{formatCurrency(totalMonthlyCashDrain)}</strong>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 6-Month Cash Projection & Projects Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 6-Month Cash Load Forecast */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">6 Aylık Planlı Nakit Yükü Projeksiyonu</CardTitle>
                <CardDescription className="text-xs">
                  Aktif abonelikler ve taksitlerin gelecek 6 aydaki seyri
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
            <div className="grid grid-cols-6 gap-2">
              {cashForecast.map((val, idx) => {
                const monthNames = ['1. Ay', '2. Ay', '3. Ay', '4. Ay', '5. Ay', '6. Ay']
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center justify-end rounded-xl bg-muted/30 p-2.5 text-center border border-border/40"
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground mb-1">
                      {monthNames[idx]}
                    </span>
                    <span className="text-xs font-bold font-mono text-foreground truncate w-full">
                      {val > 0 ? formatCurrency(val).replace('₺', '') : '0'}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">₺</span>
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
                <CardTitle className="text-base">Aktif Projeler & Bütçe Köprüsü</CardTitle>
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
              <div className="space-y-3">
                {projects.slice(0, 3).map((prj) => (
                  <Link key={prj.id} href={`/projects/${prj.slug}`}>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 hover:bg-muted/40 border border-border/40 transition-colors cursor-pointer mb-2">
                      <div>
                        <div className="text-xs font-bold text-foreground">{prj.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{prj.status} • Bütçe: {formatCurrency(prj.budget_limit || 0)}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
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
