'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Banknote,
  Plus,
  Trash2,
  Edit2,
  Briefcase,
  Laptop,
  Rocket,
  Building2,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Archive,
  Search,
  Calendar,
  FolderKanban,
  RotateCcw,
  ShieldCheck,
  Wallet,
  Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isMissingRelationError } from '@/lib/supabase/mutation'
import { formatCurrency, cn } from '@/lib/utils'
import {
  calculateSubscriptionEquivalent,
  normalizeSubscriptionPeriod,
  calculateIncomeMetrics,
  safeParseAmount,
  round2,
} from '@/lib/finance-engine'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import type { Income, Project, Subscription } from '@/types/database'

export type IncomeCategory =
  | 'Maaş & Ücret'
  | 'Freelance & Danışmanlık'
  | 'SaaS & Proje'
  | 'Kira & Yatırım'
  | 'Diğer'

export type IncomeTypeOption = 'Sabit' | 'Değişken'

const INCOME_CATEGORIES: IncomeCategory[] = [
  'Maaş & Ücret',
  'Freelance & Danışmanlık',
  'SaaS & Proje',
  'Kira & Yatırım',
  'Diğer',
]

export const LOCAL_INCOMES_STORAGE_KEY = 'pusula_local_incomes'

function IncomesContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [incomes, setIncomes] = useState<Income[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isDbFallback, setIsDbFallback] = useState(false)

  // Silme Onayı
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Sekme ve Arama Filtresi
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Ekleme / Düzenleme Modalı
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState<Income | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    category: 'Maaş & Ücret' as IncomeCategory,
    income_type: 'Sabit' as IncomeTypeOption,
    amount: '',
    period: 'Aylık',
    payday: '',
    project_id: '',
    note: '',
    status: 'Aktif' as 'Aktif' | 'Pasif',
  })

  useEffect(() => {
    loadData()
    if (searchParams.get('new') === 'true') {
      handleOpenCreateModal()
    }
  }, [])

  const syncLocal = (items: Income[]) => {
    setIncomes(items)
    try {
      localStorage.setItem(LOCAL_INCOMES_STORAGE_KEY, JSON.stringify(items))
      window.dispatchEvent(new CustomEvent('pusula:incomes-changed'))
    } catch {}
  }

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [incRes, subRes, prjRes] = await Promise.all([
        supabase.from('incomes').select('*').order('amount', { ascending: false }),
        supabase.from('subscriptions').select('*').eq('status', 'Aktif'),
        supabase.from('projects').select('*').order('name', { ascending: true }),
      ])

      if (subRes.data) setSubscriptions(subRes.data)
      if (prjRes.data) setProjects(prjRes.data)

      if (incRes.error && isMissingRelationError(incRes.error)) {
        setIsDbFallback(true)
        try {
          const cached = localStorage.getItem(LOCAL_INCOMES_STORAGE_KEY)
          if (cached) {
            const parsed = JSON.parse(cached)
            setIncomes(Array.isArray(parsed) ? parsed : [])
          } else {
            setIncomes([])
          }
        } catch {
          setIncomes([])
        }
      } else if (incRes.error) {
        // Fallback to localStorage if any unexpected schema mismatch happens
        try {
          const cached = localStorage.getItem(LOCAL_INCOMES_STORAGE_KEY)
          if (cached) {
            setIncomes(JSON.parse(cached))
            setIsDbFallback(true)
          }
        } catch {}
      } else if (incRes.data) {
        setIsDbFallback(false)
        setIncomes(incRes.data)
        try {
          localStorage.setItem(LOCAL_INCOMES_STORAGE_KEY, JSON.stringify(incRes.data))
        } catch {}
      }
    } catch (err) {
      console.error('Error loading incomes data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenCreateModal = (prefill?: Partial<typeof form>) => {
    setEditingIncome(null)
    setForm({
      title: prefill?.title || '',
      category: prefill?.category || 'Maaş & Ücret',
      income_type: prefill?.income_type || 'Sabit',
      amount: prefill?.amount || '',
      period: normalizeSubscriptionPeriod(prefill?.period || 'Aylık'),
      payday: prefill?.payday || '',
      project_id: prefill?.project_id || '',
      note: prefill?.note || '',
      status: prefill?.status || 'Aktif',
    })
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (inc: Income) => {
    setEditingIncome(inc)
    const category: IncomeCategory = INCOME_CATEGORIES.includes(inc.category as IncomeCategory)
      ? (inc.category as IncomeCategory)
      : 'Diğer'

    setForm({
      title: inc.title,
      category,
      income_type: inc.income_type === 'Değişken' ? 'Değişken' : 'Sabit',
      amount: inc.amount != null ? inc.amount.toString() : '',
      period: normalizeSubscriptionPeriod(inc.period),
      payday: inc.payday != null ? inc.payday.toString() : '',
      project_id: inc.project_id || '',
      note: inc.note || '',
      status: inc.status === 'Pasif' ? 'Pasif' : 'Aktif',
    })
    setIsModalOpen(true)
  }

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const parsedPayday = form.payday ? parseInt(form.payday, 10) : null
      const validPayday =
        parsedPayday && !isNaN(parsedPayday) && parsedPayday >= 1 && parsedPayday <= 31
          ? parsedPayday
          : null

      const nowIso = new Date().toISOString()
      const payload = {
        title: form.title.trim(),
        category: form.category,
        income_type: form.income_type,
        amount: Math.max(0, safeParseAmount(form.amount)),
        currency: 'TRY',
        period: normalizeSubscriptionPeriod(form.period),
        payday: validPayday,
        status: form.status,
        project_id: form.project_id || null,
        note: form.note.trim() || null,
      }

      if (isDbFallback) {
        if (editingIncome) {
          const updated: Income = {
            ...editingIncome,
            ...payload,
            updated_at: nowIso,
          }
          syncLocal(incomes.map((item) => (item.id === editingIncome.id ? updated : item)))
        } else {
          const newItem: Income = {
            id: crypto.randomUUID(),
            user_id: user?.id || 'local-user',
            ...payload,
            created_at: nowIso,
            updated_at: nowIso,
          }
          syncLocal([newItem, ...incomes])
        }
        setIsModalOpen(false)
        toast.success(editingIncome ? 'Gelir kalemi güncellendi.' : 'Yeni gelir kalemi eklendi.')
        return
      }

      if (!user) throw new Error('Oturum açılmamış')

      if (editingIncome) {
        const { data, error } = await supabase
          .from('incomes')
          .update({ ...payload, updated_at: nowIso })
          .eq('id', editingIncome.id)
          .select()
          .single()

        if (error && isMissingRelationError(error)) {
          setIsDbFallback(true)
          const updated: Income = { ...editingIncome, ...payload, updated_at: nowIso }
          syncLocal(incomes.map((item) => (item.id === editingIncome.id ? updated : item)))
        } else if (error) {
          throw error
        } else if (data) {
          syncLocal(incomes.map((item) => (item.id === editingIncome.id ? data : item)))
        }
      } else {
        const { data, error } = await supabase
          .from('incomes')
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single()

        if (error && isMissingRelationError(error)) {
          setIsDbFallback(true)
          const newItem: Income = {
            id: crypto.randomUUID(),
            user_id: user.id,
            ...payload,
            created_at: nowIso,
            updated_at: nowIso,
          }
          syncLocal([newItem, ...incomes])
        } else if (error) {
          throw error
        } else if (data) {
          syncLocal([data, ...incomes])
        }
      }

      setIsModalOpen(false)
      toast.success(editingIncome ? 'Gelir kalemi güncellendi.' : 'Yeni gelir kalemi eklendi.')
    } catch (err: any) {
      toast.error(err.message || 'Gelir kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuickTypeOrStatusChange = async (
    inc: Income,
    updates: Partial<Pick<Income, 'income_type' | 'status'>>
  ) => {
    const nowIso = new Date().toISOString()
    const nextItem: Income = { ...inc, ...updates, updated_at: nowIso }

    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const { error } = await supabase
          .from('incomes')
          .update({ ...updates, updated_at: nowIso })
          .eq('id', inc.id)
        if (error && !isMissingRelationError(error)) throw error
      }
      syncLocal(incomes.map((i) => (i.id === inc.id ? nextItem : i)))
      toast.success('Gelir durumu güncellendi.')
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  const confirmDeleteIncome = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      if (!isDbFallback) {
        const supabase = createClient()
        const { error } = await supabase.from('incomes').delete().eq('id', deleteTarget.id)
        if (error && !isMissingRelationError(error)) throw error
      }
      syncLocal(incomes.filter((i) => i.id !== deleteTarget.id))
      toast.success('Gelir kalemi silindi.')
      setDeleteTarget(null)
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    } finally {
      setIsDeleting(false)
    }
  }

  // =========================================================================
  // GELİR & SERBEST BÜTÇE HESAPLAMALARI
  // =========================================================================
  const metrics = useMemo(() => calculateIncomeMetrics(incomes), [incomes])

  const activeIncomes = useMemo(
    () => incomes.filter((i) => i.status !== 'Pasif'),
    [incomes]
  )
  const passiveIncomes = useMemo(
    () => incomes.filter((i) => i.status === 'Pasif'),
    [incomes]
  )

  const totalFixedMonthlyExpenses = useMemo(() => {
    const activeSubs = subscriptions.filter((s) => s.status === 'Aktif' && s.decision !== 'İptal Et')
    return round2(
      activeSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [subscriptions])

  const disposableMonthlyIncome = useMemo(
    () => round2(metrics.totalMonthlyIncome - totalFixedMonthlyExpenses),
    [metrics.totalMonthlyIncome, totalFixedMonthlyExpenses]
  )

  const fixedExpenseRatioPct = useMemo(() => {
    if (metrics.totalMonthlyIncome <= 0) return 0
    return round2((totalFixedMonthlyExpenses / metrics.totalMonthlyIncome) * 100)
  }, [metrics.totalMonthlyIncome, totalFixedMonthlyExpenses])

  // Kategori sayaçları
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Maaş & Ücret': 0,
      'Freelance & Danışmanlık': 0,
      'SaaS & Proje': 0,
      'Kira & Yatırım': 0,
      Diğer: 0,
    }
    for (const inc of activeIncomes) {
      if (counts[inc.category] !== undefined) {
        counts[inc.category]++
      } else {
        counts['Diğer']++
      }
    }
    return counts
  }, [activeIncomes])

  // Filtrelenmiş liste
  const displayedList = useMemo(() => {
    let list = activeTab === 'PASSIVE' ? passiveIncomes : activeIncomes
    if (activeTab !== 'ALL' && activeTab !== 'PASSIVE') {
      list = list.filter((i) => i.category === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.note || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [activeTab, activeIncomes, passiveIncomes, searchQuery])

  // Modal içi canlı önizleme
  const modalPreviewEq = useMemo(() => {
    const amt = safeParseAmount(form.amount)
    const normPeriod = normalizeSubscriptionPeriod(form.period)
    return {
      normPeriod,
      isOneTime: normPeriod === 'Tek Seferlik',
      ...calculateSubscriptionEquivalent(amt, normPeriod),
      rawAmount: amt,
    }
  }, [form.amount, form.period])

  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'Maaş & Ücret':
        return { icon: Briefcase }
      case 'Freelance & Danışmanlık':
        return { icon: Laptop }
      case 'SaaS & Proje':
        return { icon: Rocket }
      case 'Kira & Yatırım':
        return { icon: Building2 }
      default:
        return { icon: Banknote }
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-xl border border-border bg-card/60 p-6" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card/60" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gelirler & Aylık Kapasite"
        description="Hareketlerden bağımsız olarak maaş, proje, kira ve ek gelir kalemlerinizi tanımlayın."
        badge={
          <Badge variant="outline" className="text-xs font-medium border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            {activeIncomes.length} Aktif Gelir Kalemi
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/subscriptions">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs shadow-sm">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span>Sabit Giderler →</span>
              </Button>
            </Link>
            <Button size="sm" onClick={() => handleOpenCreateModal()} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" />
              <span>Yeni Gelir Ekle</span>
            </Button>
          </div>
        }
      />

      {/* Bilgilendirme Şeridi: Beyan Odaklı Referans Mantığı */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>
            Buradaki gelir kalemleri <strong>beyan odaklı referans bütçenizdir</strong>; banka bakiyelerinizi veya hesap hareketlerinizi otomatik değiştirmez.
          </span>
        </div>
        {isDbFallback && (
          <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/30 text-amber-400 bg-amber-500/10">
            Yerel Senkronizasyon Aktif
          </Badge>
        )}
      </div>

      {/* 4 Sütunlu Konsolide Gelir & Bütçe Şeridi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* 1. Toplam Aylık Gelir */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Aylık Net Gelir
          </p>
          <div className="text-2xl font-semibold tracking-tight text-success tabular-nums">
            {formatCurrency(metrics.totalMonthlyIncome)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Yıllık Karşılık:{' '}
            <strong className="text-foreground font-medium">
              {formatCurrency(metrics.totalYearlyIncome)}
            </strong>
          </p>
        </div>

        {/* 2. Sabit / Garanti Gelir */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Sabit / Garanti Gelir
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(metrics.fixedMonthlyIncome)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {metrics.fixedCount} adet düzenli/kesin gelir kalemi
          </p>
        </div>

        {/* 3. Değişken / Tahmini Gelir */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Değişken / Ek Gelir
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(metrics.variableMonthlyIncome)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {metrics.variableCount} değişken kalem
            {metrics.oneTimeIncomeTotal > 0 &&
              ` (+ ${formatCurrency(metrics.oneTimeIncomeTotal)} tek seferlik)`}
          </p>
        </div>

        {/* 4. Serbest Bütçe (Aylık Gelir − Sabit Giderler) */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Serbest Bütçe (Gelir − Sabit Yük)
          </p>
          <div
            className={cn(
              'text-2xl font-semibold tracking-tight tabular-nums',
              disposableMonthlyIncome >= 0 ? 'text-foreground' : 'text-destructive'
            )}
          >
            {formatCurrency(disposableMonthlyIncome)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sabit gider yükü: <strong className="text-foreground">{formatCurrency(totalFixedMonthlyExpenses)}</strong>{' '}
            {metrics.totalMonthlyIncome > 0 && `(%${fixedExpenseRatioPct})`}
          </p>
        </div>
      </div>

      {/* Kategori Sekmeleri & Arama */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Gelir kategorileri"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ALL'}
            onClick={() => setActiveTab('ALL')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Tümü ({activeIncomes.length})
          </button>
          {INCOME_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeTab === cat}
              onClick={() => setActiveTab(cat)}
              className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
                activeTab === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat} ({categoryCounts[cat] || 0})
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PASSIVE'}
            onClick={() => setActiveTab('PASSIVE')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 flex items-center ${
              activeTab === 'PASSIVE'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Archive className="h-3.5 w-3.5 inline mr-1" />
            Pasif ({passiveIncomes.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Gelir kalemi ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Gelir Kartları Listesi */}
      {displayedList.length === 0 ? (
        <Card className="border-dashed border-border bg-card/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-3">
            <Banknote className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {activeTab === 'PASSIVE'
              ? 'Pasife alınmış bir gelir kalemi bulunmuyor.'
              : 'Henüz tanımlanmış bir gelir kaleminiz yok.'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            {activeTab === 'PASSIVE'
              ? 'Durdurulan veya sona eren gelir kaynaklarınız burada arşivlenir.'
              : 'Maaşınızı, düzenli freelance/danışmanlık anlaşmalarınızı veya kira/proje gelirlerinizi ekleyerek aylık bütçe kapasitenizi netleştirin.'}
          </p>
          {activeTab !== 'PASSIVE' && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => handleOpenCreateModal()} className="gap-1.5">
                <Plus className="h-4 w-4" />
                <span>İlk Gelir Kalemini Ekle</span>
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedList.map((inc) => {
            const isPassive = inc.status === 'Pasif'
            const isVariable = inc.income_type === 'Değişken'
            const meta = getCategoryMeta(inc.category)
            const Icon = meta.icon
            const normPeriod = normalizeSubscriptionPeriod(inc.period)
            const isOneTime = normPeriod === 'Tek Seferlik'
            const eq = calculateSubscriptionEquivalent(inc.amount, normPeriod)
            const linkedProject = projects.find((p) => p.id === inc.project_id)

            return (
              <Card
                key={inc.id}
                className={cn(
                  'border-border bg-card shadow-sm transition-all hover:border-border/80 flex flex-col justify-between',
                  isPassive && 'opacity-60 bg-muted/10'
                )}
              >
                <div>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-semibold truncate" title={inc.title}>
                            {inc.title}
                          </CardTitle>
                          <CardDescription className="text-xs truncate flex items-center gap-1.5 mt-0.5">
                            <span>{inc.category}</span>
                            {inc.payday && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-foreground/80 font-medium">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  Ayın {inc.payday}&apos;i
                                </span>
                              </>
                            )}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={isVariable ? 'secondary' : 'success'}
                          className="text-[11px] font-medium shrink-0"
                        >
                          {isVariable ? 'Değişken' : 'Sabit'}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-medium shrink-0">
                          {normPeriod}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-1">
                    {/* Tutar ve Yıllık Karşılık */}
                    <div className="flex items-baseline justify-between border-b border-border/50 pb-2.5">
                      <div>
                        {isOneTime ? (
                          <div>
                            <div className="text-2xl font-semibold tracking-tight text-success tabular-nums">
                              {formatCurrency(inc.amount)}{' '}
                              <span className="text-xs text-muted-foreground font-normal">
                                tek seferlik
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Tek seferlik ek gelir
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="text-2xl font-semibold tracking-tight text-success tabular-nums">
                              {formatCurrency(eq.monthly)}{' '}
                              <span className="text-xs text-muted-foreground font-normal">/ ay</span>
                            </div>
                            {normPeriod !== 'Aylık' && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Beyan: {formatCurrency(inc.amount)} / {normPeriod}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-muted-foreground block">Yıllık Toplam:</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {isOneTime ? '— (Tek Seferlik)' : formatCurrency(eq.yearly)}
                        </span>
                      </div>
                    </div>

                    {/* Proje veya Not Bilgisi */}
                    {(linkedProject || inc.note) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {linkedProject && (
                          <Badge
                            variant="outline"
                            className="text-[11px] gap-1 border-primary/25 text-primary bg-primary/10"
                          >
                            <FolderKanban className="h-3 w-3" />
                            {linkedProject.name}
                          </Badge>
                        )}
                        {inc.note && (
                          <span className="text-[11px] text-muted-foreground line-clamp-1">
                            {inc.note}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Hızlı Tip & Durum Değiştirme Barı */}
                    {!isPassive ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                          Gelir Tipi & Durum:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickTypeOrStatusChange(inc, { income_type: 'Sabit' })
                            }
                            className={cn(
                              'flex items-center justify-center gap-1 rounded-lg px-2 py-2 min-h-[36px] text-xs font-semibold transition-all border',
                              !isVariable
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Sabit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleQuickTypeOrStatusChange(inc, { income_type: 'Değişken' })
                            }
                            className={cn(
                              'flex items-center justify-center gap-1 rounded-lg px-2 py-2 min-h-[36px] text-xs font-semibold transition-all border',
                              isVariable
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span>Değişken</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleQuickTypeOrStatusChange(inc, { status: 'Pasif' })
                            }
                            className="flex items-center justify-center gap-1 rounded-lg px-2 py-2 min-h-[36px] text-xs font-semibold transition-all border border-border/60 bg-muted/20 text-muted-foreground hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
                          >
                            <Archive className="h-3.5 w-3.5" />
                            <span>Pasife Al</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2 border border-border/50">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Archive className="h-3.5 w-3.5" />
                          Pasif (Aylık hesaba katılmaz)
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleQuickTypeOrStatusChange(inc, { status: 'Aktif' })
                          }
                          className="h-8 text-xs gap-1 text-primary"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Aktifleştir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Kart Alt Aksiyonları */}
                <div className="px-5 py-2.5 border-t border-border/40 bg-muted/10 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[160px]">
                    {inc.income_type === 'Sabit' ? 'Garanti / Düzenli' : 'Tahmini / Değişken'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(inc)}
                      className="p-2 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label={`${inc.title} gelirini düzenle`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(inc)}
                      className="p-2 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`${inc.title} gelirini sil`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Yeni Ekle / Düzenle Modalı */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIncome ? 'Gelir Kalemini Düzenle' : 'Yeni Gelir Kalemi Tanımla'}
      >
        <form onSubmit={handleSaveIncome} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Gelir Adı / Kaynağı
            </label>
            <Input
              required
              placeholder="Örn: Maaş, Kira Geliri, X Şirketi Danışmanlık..."
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Net Tutar (₺)
              </label>
              <Input
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Periyot / Sıklık
              </label>
              <Select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              >
                <option value="Aylık">Aylık</option>
                <option value="3 Aylık">3 Aylık</option>
                <option value="6 Aylık">6 Aylık</option>
                <option value="Yıllık">Yıllık</option>
                <option value="Haftalık">Haftalık</option>
                <option value="Tek Seferlik">Tek Seferlik (Ek Gelir)</option>
              </Select>
            </div>
          </div>

          {/* Canlı Aylık & Yıllık Eşdeğer Önizlemesi */}
          {modalPreviewEq.rawAmount > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground block">Aylık Net Eşdeğer:</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {modalPreviewEq.isOneTime
                    ? `${formatCurrency(modalPreviewEq.rawAmount)} (Tek Seferlik)`
                    : `${formatCurrency(modalPreviewEq.monthly)} / ay`}
                </span>
              </div>
              {!modalPreviewEq.isOneTime && (
                <div className="text-right">
                  <span className="text-muted-foreground block">Yıllık Karşılık:</span>
                  <span className="text-sm font-bold font-mono text-foreground">
                    {formatCurrency(modalPreviewEq.yearly)} / yıl
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Kategori
              </label>
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as IncomeCategory })}
              >
                {INCOME_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Gelir Tipi
              </label>
              <Select
                value={form.income_type}
                onChange={(e) =>
                  setForm({ ...form, income_type: e.target.value as IncomeTypeOption })
                }
              >
                <option value="Sabit">Sabit / Garanti Gelir</option>
                <option value="Değişken">Değişken / Tahmini Gelir</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Ödeme Günü (Opsiyonel)
              </label>
              <Select
                value={form.payday}
                onChange={(e) => setForm({ ...form, payday: e.target.value })}
              >
                <option value="">Belirtilmedi</option>
                {Array.from({ length: 31 }, (_, idx) => idx + 1).map((day) => (
                  <option key={day} value={day.toString()}>
                    Ayın {day}&apos;i
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                İlişkili Proje (Opsiyonel)
              </label>
              <Select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">Yok (Kişisel / Genel)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Kısa Not (Opsiyonel)
            </label>
            <Input
              placeholder="Örn: Yıllık sözleşme, her ayın 15'inde yatar..."
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editingIncome ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Silme Onay Dialog'u */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteIncome}
        title="Gelir Kalemini Sil"
        description={
          <>
            <strong>{deleteTarget?.title}</strong> gelir kalemini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
          </>
        }
        confirmLabel="Geliri Sil"
        isLoading={isDeleting}
      />
    </div>
  )
}

export default function IncomesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-pulse">
          <div className="h-20 rounded-xl bg-card/60 border border-border/40" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card/60 border border-border/40" />
            ))}
          </div>
        </div>
      }
    >
      <IncomesContent />
    </Suspense>
  )
}
