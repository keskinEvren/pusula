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
  ShieldCheck,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarClock,
  ShoppingBag,
  Percent,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/layout/page-header'
import { DashboardRoutineStrip } from '@/components/routines/dashboard-routine-strip'

import {
  calculateNetWorth,
  projectSixMonthCashLoad,
  calculateSpendingBreakdown,
  calculateMonthlyCashFlow,
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

  // 2. Active Subscriptions & 6-Month Combined Projection
  const activeSubs = subscriptions.filter((s) => s.status === 'Aktif' && s.decision !== 'İptal Et')
  const cashForecast = projectSixMonthCashLoad(activeSubs, [], 6)

  // 3. Dynamic Month & Strategic Analysis
  const availableMonths = Array.from(
    new Set(transactions.map((t) => t.date?.slice(0, 7)).filter(Boolean))
  ).sort().reverse()

  const currentMonthPrefix = availableMonths[0] || new Date().toISOString().slice(0, 7)
  const currentMonthTxs = transactions.filter((t) => t.date.startsWith(currentMonthPrefix))
  const cashFlow = calculateMonthlyCashFlow(currentMonthTxs)

  // Son kapanan ay (mevcut aydan bir önceki işlem ayı)
  const lastClosedMonthPrefix = availableMonths.find((m) => m !== currentMonthPrefix) || currentMonthPrefix
  const lastClosedMonthTxs = transactions.filter((t) => t.date.startsWith(lastClosedMonthPrefix))
  const lastClosedBreakdown = calculateSpendingBreakdown(lastClosedMonthTxs)

  const monthNamesTr: Record<string, string> = {
    '01': 'Ocak',
    '02': 'Şubat',
    '03': 'Mart',
    '04': 'Nisan',
    '05': 'Mayıs',
    '06': 'Haziran',
    '07': 'Temmuz',
    '08': 'Ağustos',
    '09': 'Eylül',
    '10': 'Ekim',
    '11': 'Kasım',
    '12': 'Aralık',
  }

  const formatMonthLabel = (prefix: string) => {
    const [year, month] = prefix.split('-')
    return `${monthNamesTr[month] || month} ${year}`
  }

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

      {/* 3 Stratejik Panel: Nakit Akışı, Kart Ödeme Takvimi, Son Kapanan Ay Tüketimi */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Kasa & Nakit Akışı */}
        <Card className="border-border bg-card shadow-sm hover:border-border/80 transition-all flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Kasa Nakit Akışı
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    {formatMonthLabel(currentMonthPrefix)} fiili para hareketi
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {currentMonthTxs.length} Hareket
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
                  Hesaplara Giren Toplam Tutar
                </span>
                <span className="font-semibold text-emerald-400 tabular-nums">
                  +{formatCurrency(cashFlow.totalInflow)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                  Kartlara Ödenen Borç
                </span>
                <span className="font-semibold text-blue-400 tabular-nums">
                  -{formatCurrency(cashFlow.cardPayments)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-rose-400" />
                  Banka Faiz / Masraf
                </span>
                <span className="font-semibold text-rose-400 tabular-nums">
                  -{formatCurrency(cashFlow.financingFees)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2.5 text-xs">
              <span className="font-medium text-muted-foreground">Net Kasa Değişimi</span>
              <span className={`font-semibold tabular-nums ${cashFlow.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {cashFlow.netCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.netCashFlow)}
              </span>
            </div>

            <Link
              href={`/transactions?month=${currentMonthPrefix}`}
              className="text-[11px] text-primary hover:underline flex items-center justify-end gap-1 pt-1"
            >
              <span>{formatMonthLabel(currentMonthPrefix)} hareketleri</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        {/* 2. Kart Ödeme Takvimi */}
        <Card className="border-border bg-card shadow-sm hover:border-border/80 transition-all flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Kart Ödeme Takvimi
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Kredi kartı ekstre ve kalan borçları
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {cards.length} Aktif Kart
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="divide-y divide-border/40 text-xs">
              {cards.map((card) => {
                const isPaid = (card.current_debt || 0) <= 0
                return (
                  <div key={card.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        <span>{card.card_name || `${card.bank} • ${card.last_four}`}</span>
                        {isPaid && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-normal">
                            Ödendi
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {card.due_date ? `Son Ödeme: ${formatDate(card.due_date)}` : 'Son ödeme belirtilmemiş'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold tabular-nums ${isPaid ? 'text-muted-foreground' : 'text-rose-400'}`}>
                        {formatCurrency(card.current_debt || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Ekstre: {formatCurrency(card.statement_debt || 0)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border-t border-border pt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Toplam Kart Borcu</span>
              <span className="font-semibold text-destructive tabular-nums">
                {formatCurrency(totalCardDebt)}
              </span>
            </div>

            <Link
              href="/cards"
              className="text-[11px] text-primary hover:underline flex items-center justify-end gap-1 pt-1"
            >
              <span>Kartları ve ekstreleri yönet</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        {/* 3. Son Kapanan Ay Tüketimi */}
        <Card className="border-border bg-card shadow-sm hover:border-border/80 transition-all flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Son Kapanan Ay Tüketimi
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    {formatMonthLabel(lastClosedMonthPrefix)} yaşam & finansman gideri
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {lastClosedMonthTxs.length} Hareket
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div>
              <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatCurrency(lastClosedBreakdown.totalConsumption)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Tamamlanmış aylık yaşam tüketimi
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Kişisel</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCurrency(lastClosedBreakdown.personal)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">İş & SaaS</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCurrency(lastClosedBreakdown.business)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Faiz & Masraf</span>
                <span className="font-semibold text-rose-400 tabular-nums">
                  {formatCurrency(lastClosedBreakdown.financing)}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Hariç Tutulan (Transfer/Borç)</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(lastClosedBreakdown.excluded)}
              </span>
            </div>

            <Link
              href={`/transactions?month=${lastClosedMonthPrefix}`}
              className="text-[11px] text-primary hover:underline flex items-center justify-end gap-1 pt-1"
            >
              <span>{formatMonthLabel(lastClosedMonthPrefix)} harcamalarını incele</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {/* 6-Month Cash Load Forecast */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">6 Aylık Planlı Nakit Yükü Projeksiyonu</CardTitle>
                <CardDescription className="text-xs">
                  Aktif abonelikler ve sabit giderlerin gelecek 6 aydaki seyri
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
