'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  Film,
  Dumbbell,
  Smartphone,
  Laptop,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Archive,
  TrendingDown,
  ShieldCheck,
  Search,
  DollarSign,
  RotateCcw,
  LayoutGrid,
  TableProperties,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  calculateSubscriptionEquivalent,
  normalizeSubscriptionPeriod,
  safeParseAmount,
  round2,
} from '@/lib/finance-engine'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Sheet } from '@/components/ui/sheet'
import { ViewToggle } from '@/components/ui/view-toggle'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import type { Subscription } from '@/types/database'

export type ExpenseCategory =
  | 'Eğlence & Medya'
  | 'Spor & Yaşam'
  | 'İletişim & Fatura'
  | 'Yazılım & SaaS'
  | 'Diğer'

export type StrategicDecision = 'Devam' | 'Kararsız' | 'İptal Et'

export default function SubscriptionsPage() {
  const { toast } = useToast()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  // Deletion confirmation
  const [deleteTargetSub, setDeleteTargetSub] = useState<Subscription | null>(null)
  const [isDeletingSub, setIsDeletingSub] = useState(false)

  // Tab filter: 'ALL' | category name | 'ARCHIVED'
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // View mode: 'table' | 'grid'
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pusula_sub_view')
      if (saved === 'grid' || saved === 'table') {
        setViewMode(saved)
      }
    } catch {}
  }, [])

  // Add / Edit Modal / Sheet State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Subscription | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    service: '',
    category: 'Eğlence & Medya' as ExpenseCategory,
    decision: 'Devam' as StrategicDecision,
    group_type: 'Kişisel' as 'Kişisel' | 'İş',
    amount: '',
    period: 'Aylık',
    payment_method: 'Kredi Kartı',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: sData, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('amount', { ascending: false })

      if (error) throw error
      if (sData) setSubscriptions(sData)
    } catch (err) {
      console.error('Error loading subscriptions data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Open Create Modal
  const handleOpenCreateModal = (prefill?: Partial<typeof form>) => {
    setEditingSub(null)
    setForm({
      service: prefill?.service || '',
      category: prefill?.category || 'Eğlence & Medya',
      decision: prefill?.decision || 'Devam',
      group_type: prefill?.group_type || 'Kişisel',
      amount: prefill?.amount || '',
      period: normalizeSubscriptionPeriod(prefill?.period || 'Aylık'),
      payment_method: prefill?.payment_method || 'Kredi Kartı',
    })
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (sub: Subscription) => {
    setEditingSub(sub)
    const category: ExpenseCategory = [
      'Eğlence & Medya',
      'Spor & Yaşam',
      'İletişim & Fatura',
      'Yazılım & SaaS',
      'Diğer',
    ].includes(sub.model)
      ? (sub.model as ExpenseCategory)
      : 'Diğer'

    setForm({
      service: sub.service,
      category,
      decision: (sub.decision as StrategicDecision) || 'Devam',
      group_type: sub.group_type || 'Kişisel',
      amount: sub.amount != null ? sub.amount.toString() : '',
      period: normalizeSubscriptionPeriod(sub.period),
      payment_method: sub.payment_method || 'Kredi Kartı',
    })
    setIsModalOpen(true)
  }

  // Save (Create or Update)
  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const isArchived = form.decision === 'İptal Et'
      const status = isArchived ? 'İptal' : 'Aktif'

      const payload = {
        service: form.service.trim(),
        group_type: form.group_type,
        model: form.category,
        amount: Math.max(0, safeParseAmount(form.amount)),
        currency: 'TRY',
        period: normalizeSubscriptionPeriod(form.period),
        decision: form.decision,
        payment_method: form.payment_method || null,
        project_id: null,
        status: status as any,
      }

      if (editingSub) {
        const { data, error } = await supabase
          .from('subscriptions')
          .update(payload)
          .eq('id', editingSub.id)
          .select()
          .single()

        if (error) throw error
        if (data) {
          setSubscriptions((prev) => prev.map((s) => (s.id === editingSub.id ? data : s)))
          setIsModalOpen(false)
        }
      } else {
        const { data, error } = await supabase
          .from('subscriptions')
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setSubscriptions([data, ...subscriptions])
          setIsModalOpen(false)
        }
      }
      toast.success(editingSub ? 'Düzenli gider güncellendi.' : 'Yeni düzenli gider eklendi.')
    } catch (err: any) {
      toast.error(err.message || 'Kayıt başarısız oldu')
    } finally {
      setSubmitting(false)
    }
  }

  // Quick Decision Change: 'Devam' (Vazgeçilmez) | 'Kararsız' (Gözden Geçir) | 'İptal Et'
  const handleQuickDecision = async (sub: Subscription, decision: StrategicDecision) => {
    const newStatus = decision === 'İptal Et' ? 'İptal' : 'Aktif'

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('subscriptions')
        .update({
          decision: decision as any,
          status: newStatus as any,
        })
        .eq('id', sub.id)

      if (error) throw error
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === sub.id ? { ...s, decision: decision as any, status: newStatus as any } : s
        )
      )
      toast.success(`Karar güncellendi: ${decision}`)
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  // Delete
  const confirmDeleteSub = async () => {
    if (!deleteTargetSub) return
    setIsDeletingSub(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('subscriptions').delete().eq('id', deleteTargetSub.id)
      if (error) throw error
      setSubscriptions((prev) => prev.filter((s) => s.id !== deleteTargetSub.id))
      toast.success('Düzenli gider silindi.')
      setDeleteTargetSub(null)
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    } finally {
      setIsDeletingSub(false)
    }
  }

  // =========================================================================
  // SAVINGS RADAR CALCULATIONS
  // =========================================================================
  const activeSubs = useMemo(() => {
    return subscriptions.filter((s) => s.status !== 'İptal' && s.decision !== 'İptal Et')
  }, [subscriptions])

  const cancelledSubs = useMemo(() => {
    return subscriptions.filter((s) => s.status === 'İptal' || s.decision === 'İptal Et')
  }, [subscriptions])

  // Total active monthly load & yearly load
  const totalMonthlyLoad = useMemo(() => {
    return round2(
      activeSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [activeSubs])

  const totalYearlyLoad = useMemo(() => {
    return round2(
      activeSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.yearly
      }, 0)
    )
  }, [activeSubs])

  // Essential (Vazgeçilmez - decision === 'Devam')
  const essentialSubs = useMemo(() => {
    return activeSubs.filter((s) => s.decision !== 'Kararsız')
  }, [activeSubs])

  const essentialMonthlyTotal = useMemo(() => {
    return round2(
      essentialSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [essentialSubs])

  // Potential Savings (Gözden Geçir / Esnek - decision === 'Kararsız')
  const reviewSubs = useMemo(() => {
    return activeSubs.filter((s) => s.decision === 'Kararsız')
  }, [activeSubs])

  const potentialMonthlySavings = useMemo(() => {
    return round2(
      reviewSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [reviewSubs])

  const potentialYearlySavings = useMemo(() => {
    return round2(
      reviewSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.yearly
      }, 0)
    )
  }, [reviewSubs])

  const potentialOneTimeSavings = useMemo(() => {
    return round2(
      reviewSubs
        .filter((s) => normalizeSubscriptionPeriod(s.period) === 'Tek Seferlik')
        .reduce((sum, s) => sum + safeParseAmount(s.amount), 0)
    )
  }, [reviewSubs])

  // Realized Savings (İptal Edilenler - cancelledSubs)
  const realizedMonthlySavings = useMemo(() => {
    return round2(
      cancelledSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.monthly
      }, 0)
    )
  }, [cancelledSubs])

  const realizedYearlySavings = useMemo(() => {
    return round2(
      cancelledSubs.reduce((sum, s) => {
        const eq = calculateSubscriptionEquivalent(s.amount, s.period)
        return sum + eq.yearly
      }, 0)
    )
  }, [cancelledSubs])

  const realizedOneTimeSavings = useMemo(() => {
    return round2(
      cancelledSubs
        .filter((s) => normalizeSubscriptionPeriod(s.period) === 'Tek Seferlik')
        .reduce((sum, s) => sum + safeParseAmount(s.amount), 0)
    )
  }, [cancelledSubs])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Eğlence & Medya': 0,
      'Spor & Yaşam': 0,
      'İletişim & Fatura': 0,
      'Yazılım & SaaS': 0,
      Diğer: 0,
    }
    for (const s of activeSubs) {
      if (counts[s.model] !== undefined) {
        counts[s.model]++
      } else {
        counts['Diğer']++
      }
    }
    return counts
  }, [activeSubs])

  // Filtered List
  const displayedList = useMemo(() => {
    let list = activeTab === 'ARCHIVED' ? cancelledSubs : activeSubs
    if (activeTab !== 'ALL' && activeTab !== 'ARCHIVED') {
      list = list.filter((s) => s.model === activeTab)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) => s.service.toLowerCase().includes(q) || (s.payment_method || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [activeTab, activeSubs, cancelledSubs, searchQuery])



  // Category Icon & Meta Helper
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'Eğlence & Medya':
        return { icon: Film, color: 'text-muted-foreground', badge: 'border-border text-muted-foreground' }
      case 'Spor & Yaşam':
        return { icon: Dumbbell, color: 'text-muted-foreground', badge: 'border-border text-muted-foreground' }
      case 'İletişim & Fatura':
        return { icon: Smartphone, color: 'text-muted-foreground', badge: 'border-border text-muted-foreground' }
      case 'Yazılım & SaaS':
        return { icon: Laptop, color: 'text-muted-foreground', badge: 'border-border text-muted-foreground' }
      default:
        return { icon: Sparkles, color: 'text-muted-foreground', badge: 'border-border text-muted-foreground' }
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-xl border border-border bg-card/60 p-6" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card/60" />
        </div>
        <div className="h-96 animate-pulse rounded-xl border border-border bg-card/60" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abonelikler & Sabit Giderler"
        description="Aylık ve yıllık düzenli abonelik ve sabit gider takibi"
        badge={<Badge variant="outline" className="text-xs font-medium">{activeSubs.length} Aktif Gider</Badge>}
        actions={
          <Button
            size="sm"
            onClick={() => handleOpenCreateModal()}
            className="gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Yeni Gider</span>
          </Button>
        }
      />

      {/* Unified Segmented Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* 1. Toplam Düzenli Çıkış */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Aylık Düzenli Yük
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(totalMonthlyLoad)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Yıllık: <strong className="text-foreground font-medium">{formatCurrency(totalYearlyLoad)}</strong>
          </p>
        </div>

        {/* 2. Vazgeçilmez / Zorunlu */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Zorunlu Giderler
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(essentialMonthlyTotal)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {essentialSubs.length} adet onaylanmış gider
          </p>
        </div>

        {/* 3. Potansiyel Tasarruf (Gözden Geçir / Esnek) */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            İncelemedeki Giderler
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(potentialMonthlySavings)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ ay</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {reviewSubs.length > 0 ? (
              <span>
                Yıllık tasarruf potansiyeli: {formatCurrency(potentialYearlySavings)}
                {potentialOneTimeSavings > 0 && ` (+ ${formatCurrency(potentialOneTimeSavings)} tek seferlik)`}
              </span>
            ) : (
              <span>İncelenecek gider yok</span>
            )}
          </p>
        </div>

        {/* 4. Kurtarılan / Gerçekleşen Tasarruf */}
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            İptal Edilenler (Tasarruf)
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatCurrency(realizedYearlySavings)}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ yıl</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {cancelledSubs.length} adet iptal edilen üyelik
            {realizedOneTimeSavings > 0 && ` (+ ${formatCurrency(realizedOneTimeSavings)} tek seferlik)`}
          </p>
        </div>
      </div>

      {/* KATEGORİ FİLTRE SEKMELERİ & ARAMA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div role="tablist" aria-label="Abonelik filtreleri" className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
            Tümü ({activeSubs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'Eğlence & Medya'}
            onClick={() => setActiveTab('Eğlence & Medya')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Eğlence & Medya'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Eğlence & Medya ({categoryCounts['Eğlence & Medya']})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'Spor & Yaşam'}
            onClick={() => setActiveTab('Spor & Yaşam')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Spor & Yaşam'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Spor & Yaşam ({categoryCounts['Spor & Yaşam']})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'İletişim & Fatura'}
            onClick={() => setActiveTab('İletişim & Fatura')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'İletişim & Fatura'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            İletişim & Fatura ({categoryCounts['İletişim & Fatura']})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'Yazılım & SaaS'}
            onClick={() => setActiveTab('Yazılım & SaaS')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Yazılım & SaaS'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Yazılım & SaaS ({categoryCounts['Yazılım & SaaS']})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ARCHIVED'}
            onClick={() => setActiveTab('ARCHIVED')}
            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold transition-all shrink-0 flex items-center ${
              activeTab === 'ARCHIVED'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Archive className="h-3.5 w-3.5 inline mr-1" />
            İptal Edilenler ({cancelledSubs.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <ViewToggle
            value={viewMode}
            onChange={(val) => {
              setViewMode(val)
              try {
                localStorage.setItem('pusula_sub_view', val)
              } catch {}
            }}
            options={[
              { value: 'table', label: 'Tablo', icon: TableProperties },
              { value: 'grid', label: 'Kartlar', icon: LayoutGrid },
            ]}
          />
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Abonelik ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* GİDER LİSTESİ / TABLO VEYA TASARRUF KARTLARI */}
      {displayedList.length === 0 ? (
        <Card className="border-dashed border-border bg-card/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {activeTab === 'ARCHIVED'
              ? 'İptal edilmiş bir gider kaydı bulunmuyor.'
              : 'Henüz bu kategoride kayıtlı bir düzenli gideriniz yok.'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            {activeTab === 'ARCHIVED'
              ? 'Tasarruf amacıyla iptal ettiğiniz abonelik veya üyelikler burada listelenir.'
              : 'Spor salonu, telefon, Netflix, Amazon veya yazılım üyeliklerinizi ekleyerek tasarruf denetimine başlayın.'}
          </p>
          {activeTab !== 'ARCHIVED' && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => handleOpenCreateModal()} className="gap-1.5">
                <Plus className="h-4 w-4" />
                <span>Yeni Gider Ekle</span>
              </Button>
            </div>
          )}
        </Card>
      ) : viewMode === 'table' ? (
        /* TABLO GÖRÜNÜMÜ (TABLE VIEW) */
        <Card className="border border-border/80 shadow-sm overflow-hidden bg-card rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-muted/30 text-muted-foreground font-semibold">
                  <th className="p-3 pl-4">Hizmet / Firma</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Tutar & Periyot</th>
                  <th className="p-3">Aylık Eşdeğer</th>
                  <th className="p-3">Yıllık Yük</th>
                  <th className="p-3">Ödeme Kaynağı</th>
                  <th className="p-3">Stratejik Karar</th>
                  <th className="p-3 pr-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-sans">
                {displayedList.map((sub) => {
                  const isArchived = sub.status === 'İptal' || sub.decision === 'İptal Et'
                  const meta = getCategoryMeta(sub.model)
                  const Icon = meta.icon
                  const normPeriod = normalizeSubscriptionPeriod(sub.period)
                  const isOneTime = normPeriod === 'Tek Seferlik'
                  const eq = calculateSubscriptionEquivalent(sub.amount, normPeriod)

                  return (
                    <tr
                      key={sub.id}
                      className={cn(
                        'transition-colors hover:bg-muted/20 group',
                        isArchived && 'opacity-60 bg-muted/10'
                      )}
                    >
                      {/* Hizmet */}
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          <div className="p-1.5 rounded-lg bg-muted text-foreground shrink-0">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground text-xs truncate max-w-[160px]" title={sub.service}>
                              {sub.service}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {sub.group_type || 'Kişisel'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Kategori */}
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                          {sub.model}
                        </Badge>
                      </td>

                      {/* Tutar & Periyot */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-mono font-medium text-foreground">
                          {formatCurrency(sub.amount)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {normPeriod}
                        </div>
                      </td>

                      {/* Aylık Eşdeğer */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-foreground text-xs">
                          {isOneTime ? '—' : `${formatCurrency(eq.monthly)}/ay`}
                        </span>
                      </td>

                      {/* Yıllık Yük */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono text-muted-foreground text-[11px]">
                          {isOneTime ? '—' : formatCurrency(eq.yearly)}
                        </span>
                      </td>

                      {/* Ödeme Kaynağı */}
                      <td className="p-3 whitespace-nowrap text-muted-foreground text-[11px]">
                        {sub.payment_method || 'Kredi Kartı'}
                      </td>

                      {/* Stratejik Karar (Hücre İçi Tıklanabilir Seçim) */}
                      <td className="p-3 whitespace-nowrap">
                        {!isArchived ? (
                          <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5 gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(sub, 'Devam')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                                sub.decision === 'Devam'
                                  ? 'bg-emerald-500/25 text-emerald-300 font-semibold shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                              title="Zorunlu Gider"
                            >
                              Zorunlu
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(sub, 'Kararsız')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                                sub.decision === 'Kararsız'
                                  ? 'bg-amber-500/25 text-amber-300 font-semibold shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                              title="Gözden Geçir / Tasarruf"
                            >
                              İncele
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(sub, 'İptal Et')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                                sub.decision === 'İptal Et'
                                  ? 'bg-rose-500/25 text-rose-300 font-semibold shadow-xs'
                                  : 'text-muted-foreground hover:text-rose-400'
                              )}
                              title="İptal Et"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                            <span>İptal Edildi</span>
                            <button
                              type="button"
                              onClick={() => handleQuickDecision(sub, 'Devam')}
                              className="text-primary hover:underline font-semibold"
                            >
                              (Geri Al)
                            </button>
                          </span>
                        )}
                      </td>

                      {/* İşlemler */}
                      <td className="p-3 pr-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(sub)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Düzenle (Yan Çekmece)"
                            aria-label="Düzenle"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTargetSub(sub)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Sil"
                            aria-label="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* KART GÖRÜNÜMÜ (GRID VIEW) */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedList.map((sub) => {
            const isArchived = sub.status === 'İptal' || sub.decision === 'İptal Et'
            const isReview = sub.decision === 'Kararsız'
            const meta = getCategoryMeta(sub.model)
            const Icon = meta.icon
            const normPeriod = normalizeSubscriptionPeriod(sub.period)
            const isOneTime = normPeriod === 'Tek Seferlik'
            const eq = calculateSubscriptionEquivalent(sub.amount, normPeriod)

            return (
              <Card
                key={sub.id}
                className={`border-border bg-card shadow-sm transition-all hover:border-border/80 flex flex-col justify-between ${
                  isArchived
                    ? 'opacity-60 bg-muted/10'
                    : isReview
                    ? 'border-border bg-card'
                    : ''
                }`}
              >
                <div>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-2 rounded-xl bg-muted text-foreground`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-semibold truncate" title={sub.service}>
                            {sub.service}
                          </CardTitle>
                          <CardDescription className="text-xs truncate">
                            {sub.payment_method || 'Kredi Kartı'} • {normPeriod}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={isOneTime ? 'secondary' : 'outline'}
                          className="text-[11px] font-medium shrink-0"
                        >
                          {normPeriod}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[11px] font-medium shrink-0"
                        >
                          {sub.model}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-1">
                    {/* Tutar ve Yıllık Maliyet Çarpımı */}
                    <div className="flex items-baseline justify-between border-b border-border/50 pb-2.5">
                      <div>
                        {isOneTime ? (
                          <div>
                            <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                              {formatCurrency(sub.amount)}{' '}
                              <span className="text-xs text-muted-foreground font-normal">tek seferlik</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Tek seferlik net ödeme
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                              {formatCurrency(eq.monthly)}{' '}
                              <span className="text-xs text-muted-foreground font-normal">/ ay</span>
                            </div>
                            {normPeriod !== 'Aylık' && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Gider: {formatCurrency(sub.amount)} / {normPeriod}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-muted-foreground block">Yıllık Yük:</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {isOneTime ? '— (Tek Seferlik)' : formatCurrency(eq.yearly)}
                        </span>
                      </div>
                    </div>

                    {/* Stratejik Tasarruf Karar Barı */}
                    {!isArchived ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                          <span>Durum / Karar:</span>
                          {isReview && (
                            <Badge variant="warning" className="text-[11px] py-0 px-1.5">
                              İncelemede
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'Devam')}
                            className={cn(
                              'rounded-lg py-1 px-1.5 text-center font-medium border transition-all min-h-[44px] sm:min-h-[36px] flex items-center justify-center',
                              sub.decision === 'Devam'
                                ? 'bg-muted text-foreground border-border font-semibold shadow-sm'
                                : 'border-border/60 text-muted-foreground hover:bg-muted'
                            )}
                            title="Bu harcama hayat/iş için zorunlu kabul edilir"
                          >
                            Zorunlu
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'Kararsız')}
                            className={cn(
                              'rounded-lg py-1 px-1.5 text-center font-medium border transition-all min-h-[44px] sm:min-h-[36px] flex items-center justify-center',
                              sub.decision === 'Kararsız'
                                ? 'bg-muted text-foreground border-border font-semibold shadow-sm'
                                : 'border-border/60 text-muted-foreground hover:bg-muted'
                            )}
                            title="Gözden geçirilebilir, tasarruf adayı"
                          >
                            İncele
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'İptal Et')}
                            className="rounded-lg py-1 px-1.5 text-center font-medium border border-border/60 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-all min-h-[44px] sm:min-h-[36px] flex items-center justify-center"
                            title="Üyeliği/aboneliği iptal et ve tasarruf et"
                          >
                            İptal Et
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/40 border border-border p-2 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">
                          {isOneTime ? (
                            <>İptal Edildi (<strong className="text-foreground">{formatCurrency(sub.amount)}</strong> tek seferlik tasarruf)</>
                          ) : (
                            <>İptal Edildi (Yıllık <strong className="text-foreground">{formatCurrency(eq.yearly)}</strong> tasarruf)</>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickDecision(sub, 'Devam')}
                          className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1 min-h-[36px] px-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Geri Al</span>
                        </button>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Alt Aksiyon Çubuğu */}
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <span>{sub.group_type || 'Kişisel Yaşam Gideri'}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(sub)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title="Düzenle"
                        aria-label="Düzenle"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTargetSub(sub)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="Kalıcı Olarak Sil"
                        aria-label="Kalıcı Olarak Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* YAN ÇEKMECE (SLIDE-OVER SHEET): Manuel Ekleme / Düzenleme */}
      <Sheet
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSub ? 'Düzenli Gideri Düzenle' : 'Yeni Düzenli Gider / Abonelik Ekle'}
        description="Abonelik veya tekrarlayan giderinizi yapılandırın. Sağ panel sayesinde arkadaki tablo bağlamını kaybetmeden çalışabilirsiniz."
        size="lg"
      >
        <form onSubmit={handleSaveSubscription} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="sub-service" className="text-xs font-semibold text-muted-foreground">
              Hizmet / Kurum / Abonelik Adı
            </label>
            <Input
              id="sub-service"
              required
              placeholder="Örn: Macfit Spor Salonu, Netflix, Turkcell Telefon, Cursor Pro"
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="sub-category" className="text-xs font-semibold text-muted-foreground">Kategori Türü</label>
              <Select
                id="sub-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              >
                <option value="Eğlence & Medya">🎬 Eğlence & Medya</option>
                <option value="Spor & Yaşam">🏋️ Spor & Yaşam</option>
                <option value="İletişim & Fatura">📱 İletişim & Fatura</option>
                <option value="Yazılım & SaaS">💻 Yazılım & SaaS</option>
                <option value="Diğer">🏠 Diğer Düzenli Gider</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sub-decision" className="text-xs font-semibold text-muted-foreground">Tasarruf Durumu</label>
              <Select
                id="sub-decision"
                value={form.decision}
                onChange={(e) => setForm({ ...form, decision: e.target.value as StrategicDecision })}
              >
                <option value="Devam">🟢 Vazgeçilmez (Zorunlu Gider)</option>
                <option value="Kararsız">🟡 Gözden Geçir (Tasarruf Potansiyeli)</option>
                <option value="İptal Et">🔴 İptal Et (Kurtarılan Tasarruf)</option>
              </Select>
            </div>
          </div>

          {(() => {
            const normFormPeriod = normalizeSubscriptionPeriod(form.period)
            const parsedAmt = safeParseAmount(form.amount)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="sub-amount" className="text-xs font-semibold text-muted-foreground">
                    {normFormPeriod === 'Tek Seferlik'
                      ? 'Tek Seferlik Tutar'
                      : normFormPeriod === '3 Aylık' || normFormPeriod === '6 Aylık' || normFormPeriod === 'Yıllık'
                      ? `${normFormPeriod} Toplam Tutar`
                      : normFormPeriod === 'Haftalık'
                      ? 'Haftalık Tutar'
                      : 'Aylık Tutar'}
                  </label>
                  <Input
                    id="sub-amount"
                    type="number"
                    step="0.01"
                    prefix="₺"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                  {parsedAmt > 0 && normFormPeriod !== 'Aylık' && normFormPeriod !== 'Tek Seferlik' && (
                    <p className="text-[11px] text-muted-foreground">
                      Aylık eşdeğer: ~{formatCurrency(calculateSubscriptionEquivalent(parsedAmt, normFormPeriod).monthly)} / ay
                    </p>
                  )}
                  {parsedAmt > 0 && normFormPeriod === 'Tek Seferlik' && (
                    <p className="text-[11px] text-muted-foreground">
                      Tek seferlik gider; aylık tekrarlayan yüke katılmaz.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="sub-period" className="text-xs font-semibold text-muted-foreground">Ödeme Periyodu</label>
                  <Select
                    id="sub-period"
                    value={normFormPeriod}
                    onChange={(e) => setForm({ ...form, period: e.target.value })}
                  >
                    <option value="Aylık">Aylık</option>
                    <option value="Haftalık">Haftalık</option>
                    <option value="3 Aylık">3 Aylık</option>
                    <option value="6 Aylık">6 Aylık</option>
                    <option value="Yıllık">Yıllık</option>
                    <option value="Tek Seferlik">Tek Seferlik</option>
                  </Select>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="sub-payment-method" className="text-xs font-semibold text-muted-foreground">
                Ödeme Yolu / Kart
              </label>
              <Input
                id="sub-payment-method"
                placeholder="Örn: Enpara Kartı, Otomatik Ödeme, Elden"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sub-group-type" className="text-xs font-semibold text-muted-foreground">Kapsam</label>
              <Select
                id="sub-group-type"
                value={form.group_type}
                onChange={(e) => setForm({ ...form, group_type: e.target.value as any })}
              >
                <option value="Kişisel">Kişisel Harcama</option>
                <option value="İş">İş / Şirket Harcaması</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editingSub ? 'Değişiklikleri Kaydet' : 'Gideri Ekle'}
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        isOpen={Boolean(deleteTargetSub)}
        onClose={() => setDeleteTargetSub(null)}
        onConfirm={confirmDeleteSub}
        title="Düzenli Gideri Sil"
        description={
          deleteTargetSub ? (
            <span>
              <strong>{deleteTargetSub.service}</strong> kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </span>
          ) : undefined
        }
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        variant="destructive"
        isLoading={isDeletingSub}
      />
    </div>
  )
}
