'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Wallet,
  CreditCard,
  TrendingDown,
  FolderKanban,
  AlertTriangle,
  CalendarClock,
  Plus,
  ArrowRight,
  Receipt,
  CheckCircle2,
  Clock,
  Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  calculateNetWorth,
  calculateSpendingBreakdown,
  calculateFounderRunway,
  projectSixMonthCashLoad,
} from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CreditCard as CardType, Project, Subscription, Transaction, Debt, Account } from '@/types/database'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CardType[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])

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
        ] = await Promise.all([
          supabase.from('accounts').select('*'),
          supabase.from('credit_cards').select('*'),
          supabase.from('debts').select('*').eq('status', 'Açık'),
          supabase.from('transactions').select('*').order('date', { ascending: false }),
          supabase.from('subscriptions').select('*').eq('status', 'Aktif'),
          supabase.from('projects').select('*'),
        ])

        if (accs) setAccounts(accs)
        if (crds) setCards(crds)
        if (dbts) setDebts(dbts)
        if (txs) setTransactions(txs)
        if (subs) setSubscriptions(subs)
        if (prjs) setProjects(prjs)
      } catch (err) {
        console.error('Error loading dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  // Calculations via Pure Financial Engine
  const { totalCash, totalReceivables, totalCardDebt, totalOtherDebt, totalDebt, netWorth } =
    calculateNetWorth(accounts, debts, cards)

  const { personal: personalSpent, business: businessSpent, financing: financeCost, totalConsumption } =
    calculateSpendingBreakdown(transactions)

  // Extract ongoing installments from transactions (e.g. Masterpass 9/12 -> 3 months remaining)
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

  // Subscriptions & Installments 6-month projection
  const cashForecast = projectSixMonthCashLoad(subscriptions, activeInstallments, 6)
  const monthlySubscriptionLoad = cashForecast[0] || 0

  // Founder Runway
  const monthlyPersonalBurn = personalSpent > 0 ? personalSpent : 20000 // Fallback sensible burn estimate if empty
  const projectMonthlyBurn = businessSpent + monthlySubscriptionLoad
  const { runwayMonths, totalMonthlyCashDrain } = calculateFounderRunway(
    totalCash,
    monthlyPersonalBurn,
    projectMonthlyBurn
  )

  // Capacity rule (Active planning + dev >= 2)
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
    <div className="space-y-8">
      {/* Top Welcome & Runway Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Komuta Merkezi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kişisel finansınız ve aktif projelerinizin anlık durumu
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/import">
            <Button className="gap-2 shadow-md">
              <Receipt className="h-4 w-4" />
              📄 Ekstre Yükle
            </Button>
          </Link>
          <Link href="/transactions">
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Hareket Ekle
            </Button>
          </Link>
        </div>
      </div>

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

      {/* Runway Bar Widget */}
      <div className="rounded-xl border border-border bg-gradient-to-r from-card to-card/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Kurucu Hayatta Kalma Süresi (Runway)
              </div>
              <div className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>
                  {runwayMonths === 'infinite' ? 'Sonsuz' : `${runwayMonths} Ay`}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  (Mevcut <strong>{formatCurrency(totalCash)}</strong> hazır para ile)
                </span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Aylık Tahmini Çıkış: <strong className="text-foreground">{formatCurrency(totalMonthlyCashDrain)}</strong> / ay
          </div>
        </div>
      </div>

      {/* 4 Core Financial Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Varlık */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Net Varlık
            </CardTitle>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(netWorth)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              (Hazır Para + Alacaklar) − Toplam Borç
            </p>
          </CardContent>
        </Card>

        {/* Hazır Para (Nakit) */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hazır Para (Nakit)
            </CardTitle>
            <div className="rounded-full bg-success/10 p-2 text-success">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-success">
              {formatCurrency(totalCash)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.length} adet vadesiz & nakit hesap
            </p>
          </CardContent>
        </Card>

        {/* Toplam Borç */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toplam Borç
            </CardTitle>
            <div className="rounded-full bg-destructive/10 p-2 text-destructive">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-destructive">
              {formatCurrency(totalDebt)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Kart: {formatCurrency(totalCardDebt)} • Diğer: {formatCurrency(totalOtherDebt)}
            </p>
          </CardContent>
        </Card>

        {/* Kesin Alacak */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kesin Alacak
            </CardTitle>
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">
              {formatCurrency(totalReceivables)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Maaş & hakediş bekleyen alacaklar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Cards Summary Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Kredi Kartları Özeti</h2>
          <Link href="/cards" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            Tüm Kartları Gör <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.id} className="border-border bg-card shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-foreground">{card.bank}</div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {card.last_four ? `•• ${card.last_four}` : card.card_name}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground">Güncel Borç</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {formatCurrency(card.current_debt)}
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <span>Asgari: <strong className="text-foreground">{formatCurrency(card.minimum_payment)}</strong></span>
                  <span>Son Ödeme: <strong className="text-foreground">{formatDate(card.due_date)}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
          {cards.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              Henüz kredi kartı eklenmedi.{' '}
              <Link href="/cards" className="text-primary hover:underline">
                Kart ekleyin
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Two Columns: Spending Breakdown & Upcoming Subscriptions */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Harcama Dağılımı */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dönem Tüketim Dağılımı</CardTitle>
            <CardDescription>
              İşlemlerin Kişisel, İş ve Finansman gruplarına göre kırılımı
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kişisel Harcamalar</span>
                <span className="font-semibold font-mono">{formatCurrency(personalSpent)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${totalConsumption > 0 ? (personalSpent / totalConsumption) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">İş & Proje Giderleri</span>
                <span className="font-semibold font-mono text-purple-400">{formatCurrency(businessSpent)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-purple-500"
                  style={{
                    width: `${totalConsumption > 0 ? (businessSpent / totalConsumption) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Finansman & Faiz Masrafları</span>
                <span className="font-semibold font-mono text-destructive">{formatCurrency(financeCost)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-destructive"
                  style={{
                    width: `${totalConsumption > 0 ? (financeCost / totalConsumption) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border flex justify-between font-bold text-sm">
              <span>Toplam Net Tüketim</span>
              <span className="font-mono text-foreground">{formatCurrency(totalConsumption)}</span>
            </div>
          </CardContent>
        </Card>

        {/* 6 Aylık Planlı Nakit Yükü */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">6 Aylık Planlı Nakit Yükü</CardTitle>
              <CardDescription>Abonelikler ve taksitlerin aylık dağılımı</CardDescription>
            </div>
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-6 gap-2 text-center">
              {cashForecast.map((amount, idx) => (
                <div key={idx} className="rounded-lg bg-muted/40 p-2 border border-border/50">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {idx + 1}. Ay
                  </div>
                  <div className="mt-1 text-xs font-bold font-mono text-foreground">
                    {formatCurrency(amount)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aktif Abonelikler ({subscriptions.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{sub.service}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {sub.group_type} • {sub.decision}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-foreground">
                      {formatCurrency(sub.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions List */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Son Hareketler</CardTitle>
            <CardDescription>Genel işlem defterine kaydedilen son işlemler</CardDescription>
          </div>
          <Link href="/transactions">
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary">
              Tümünü Gör <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {transactions.slice(0, 8).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card/40 p-3 text-sm hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatDate(tx.date)}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">
                      {tx.merchant || tx.description}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{tx.account_or_card || 'Kredi Kartı'}</span>
                      {tx.recurrence && (
                        <Badge variant="outline" className="text-[10px]">
                          {tx.recurrence}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      tx.analysis_group === 'İş'
                        ? 'purple'
                        : tx.analysis_group === 'Finansman'
                        ? 'destructive'
                        : tx.analysis_group === 'Hariç'
                        ? 'outline'
                        : 'secondary'
                    }
                    className="text-[10px]"
                  >
                    {tx.analysis_group}
                  </Badge>
                  <div
                    className={`font-mono font-semibold ${
                      tx.analysis_group === 'Hariç'
                        ? 'text-muted-foreground'
                        : tx.analysis_group === 'Finansman'
                        ? 'text-destructive'
                        : 'text-foreground'
                    }`}
                  >
                    {formatCurrency(tx.amount)}
                  </div>
                </div>
              </div>
            ))}

            {transactions.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Henüz hareket kaydı bulunmuyor.{' '}
                <Link href="/import" className="text-primary hover:underline">
                  Ekstre yükleyin
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
