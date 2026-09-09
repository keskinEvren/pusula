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
import { DashboardRoutineStrip } from '@/components/routines/dashboard-routine-strip'

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
        title="Genel Bakış"
        description="Finansal durumunuz, yaklaşan ödemeleriniz ve aktif projeleriniz"
        actions={
          <>
            <Link href="/import">
              <Button className="gap-2 shadow-sm h-9 text-xs font-semibold">
                <Receipt className="h-4 w-4" />
                Ekstre İçe Aktar
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm">
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
            <span>Kredi Kartı Borcu</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-destructive tabular-nums">
              {formatCurrency(totalCardDebt)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {cards.length} aktif kart
            </div>
          </div>
        </Link>

        {/* 5. Alacaklar */}
        <Link href="/debts" className="p-4 sm:p-5 flex flex-col justify-between group hover:bg-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-foreground">
            <span>Kesin Alacaklar</span>
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

      {/* Secondary Strategic KPI Row (Active Month Spending vs Next Month Committed Load) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* 1. Aktif Ay Tüketimi */}
        <Card className="border-border bg-card shadow-sm hover:border-border/80 transition-all">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Link
                href={`/transactions?month=${activeMonthPrefix}`}
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                title="İşlem defterinde filtrele"
              >
                <span>Bu Ayki Harcamalar ({activeMonthName})</span>
                <span className="text-[10px] text-muted-foreground">→</span>
              </Link>
              <Link href={`/transactions?month=${activeMonthPrefix}`}>
                <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
                  {activeMonthTxs.length} Hareket
                </Badge>
              </Link>
            </div>
            <CardDescription className="text-xs">
              Bu döneme ait gerçekleşen tüketim ve finansman giderleri
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link
              href={`/transactions?month=${activeMonthPrefix}`}
              className="text-2xl font-semibold tracking-tight text-foreground tabular-nums hover:text-primary transition-colors block"
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
                <span className="font-semibold text-foreground tabular-nums">{formatCurrency(personalSpent)}</span>
              </Link>
              <Link
                href={`/transactions?month=${activeMonthPrefix}&group=İş`}
                className="rounded p-1 -m-1 hover:bg-muted/60 transition-colors block"
                title="İş & SaaS harcamalarını filtrele"
              >
                <span className="text-muted-foreground block text-[10px]">İş & SaaS →</span>
                <span className="font-semibold text-foreground tabular-nums">{formatCurrency(businessSpent)}</span>
              </Link>
              <Link
                href={`/transactions?month=${activeMonthPrefix}&group=Finansman`}
                className="rounded p-1 -m-1 hover:bg-muted/60 transition-colors block"
                title="Faiz ve masrafları filtrele"
              >
                <span className="text-muted-foreground block text-[10px]">Faiz/Masraf →</span>
                <span className="font-semibold text-destructive tabular-nums">{formatCurrency(financeCost)}</span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 2. Gelecek Ay Sabit / Planlı Yük */}
        <Link href="/subscriptions">
          <Card className="border-border bg-card shadow-sm hover:border-border/80 transition-all cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <span>Gelecek Ay Sabit Giderler</span>
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Planlı Çıkış
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Abonelikler, faturalar ve taksitlerin gelecek ayki toplam yükü
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatCurrency(nextMonthCommittedLoad)} <span className="text-xs text-muted-foreground font-normal">/ ay</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground block">Sabit Yükler ({activeSubs.length})</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(monthlyActiveSaaS)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Devam Eden Taksit</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatCurrency(monthlyInstallmentsLoad)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 3. Kurucu Runway (Nakit Dayanma Süresi) */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Nakit Dayanma Süresi (Runway)
              </CardTitle>
              {(() => {
                const numRunway = typeof runwayMonths === 'number' ? runwayMonths : 99
                const isInf = runwayMonths === 'infinite'
                return (
                  <Badge
                    variant={isInf || numRunway > 3 ? 'success' : numRunway > 1 ? 'warning' : 'destructive'}
                    className="text-[10px]"
                  >
                    {isInf ? 'Sonsuz' : numRunway > 3 ? 'Güvenli' : numRunway > 1 ? 'Dikkat' : 'Kritik'}
                  </Badge>
                )
              })()}
            </div>
            <CardDescription className="text-xs">
              Mevcut nakit ile yeni gelir olmadan tahmini sürdürülebilirlik süresi
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {typeof runwayMonths === 'number' ? runwayMonths.toFixed(1) : '∞'}
              </span>
              <span className="text-sm font-medium text-muted-foreground">Ay</span>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-2">
              Aylık Tahmini Çıkış: <strong className="text-foreground tabular-nums font-semibold">{formatCurrency(totalMonthlyCashDrain)}</strong>
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
            <div className="grid grid-cols-6 divide-x divide-border/50 py-1">
              {cashForecast.map((val, idx) => {
                const monthNames = ['1. Ay', '2. Ay', '3. Ay', '4. Ay', '5. Ay', '6. Ay']
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center justify-center px-1 text-center"
                  >
                    <span className="text-[10px] font-medium text-muted-foreground mb-1">
                      {monthNames[idx]}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-foreground truncate w-full">
                      {val > 0 ? formatCurrency(val).replace('₺', '').trim() : '0'}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 mt-0.5">₺</span>
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
                        <div className="text-[10px] text-muted-foreground capitalize mt-0.5">
                          {prj.status} • Bütçe: {formatCurrency(prj.budget_limit || 0)}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono">
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
