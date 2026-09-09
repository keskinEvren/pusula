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
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  Search,
  DollarSign,
  Receipt,
  RotateCcw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/lib/toast-context'
import type { Subscription, Project, Transaction } from '@/types/database'

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
  const [projects, setProjects] = useState<Project[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Tab filter: 'ALL' | category name | 'ARCHIVED'
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Add / Edit Modal State
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
    project_id: '',
  })

  // Quick Picker from Transactions Modal State
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: sData }, { data: pData }, { data: tData }] = await Promise.all([
        supabase.from('subscriptions').select('*').order('amount', { ascending: false }),
        supabase.from('projects').select('*').order('name', { ascending: true }),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
      ])
      if (sData) setSubscriptions(sData)
      if (pData) setProjects(pData)
      if (tData) setTransactions(tData)
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
      period: prefill?.period || 'Aylık',
      payment_method: prefill?.payment_method || 'Kredi Kartı',
      project_id: prefill?.project_id || '',
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
      : 'Eğlence & Medya'

    setForm({
      service: sub.service,
      category,
      decision: (sub.decision as StrategicDecision) || 'Devam',
      group_type: sub.group_type || 'Kişisel',
      amount: sub.amount.toString(),
      period: sub.period || 'Aylık',
      payment_method: sub.payment_method || 'Kredi Kartı',
      project_id: sub.project_id || '',
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
        amount: parseFloat(form.amount || '0'),
        currency: 'TRY',
        period: form.period,
        decision: form.decision,
        payment_method: form.payment_method || null,
        project_id: form.project_id || null,
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
  const handleDelete = async (id: string) => {
    if (!confirm('Bu düzenli gideri kalıcı olarak silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('subscriptions').delete().eq('id', id)
      if (error) throw error
      setSubscriptions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Düzenli gider silindi.')
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
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
    return activeSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  }, [activeSubs])

  const totalYearlyLoad = totalMonthlyLoad * 12

  // Essential (Vazgeçilmez - decision === 'Devam')
  const essentialSubs = useMemo(() => {
    return activeSubs.filter((s) => s.decision !== 'Kararsız')
  }, [activeSubs])

  const essentialMonthlyTotal = useMemo(() => {
    return essentialSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  }, [essentialSubs])

  // Potential Savings (Gözden Geçir / Esnek - decision === 'Kararsız')
  const reviewSubs = useMemo(() => {
    return activeSubs.filter((s) => s.decision === 'Kararsız')
  }, [activeSubs])

  const potentialMonthlySavings = useMemo(() => {
    return reviewSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  }, [reviewSubs])

  const potentialYearlySavings = potentialMonthlySavings * 12

  // Realized Savings (İptal Edilenler - cancelledSubs)
  const realizedMonthlySavings = useMemo(() => {
    return cancelledSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  }, [cancelledSubs])

  const realizedYearlySavings = realizedMonthlySavings * 12

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

  // Distinct merchants from recent transactions for Quick Picker
  const candidateTransactions = useMemo(() => {
    const map = new Map<string, Transaction>()
    for (const t of transactions) {
      if (t.type !== 'Harcama' || !t.merchant) continue
      const key = t.merchant.trim().toLowerCase()
      if (!map.has(key)) {
        map.set(key, t)
      }
    }
    const list = Array.from(map.values())
    if (!pickerSearch.trim()) return list.slice(0, 30)
    const q = pickerSearch.toLowerCase()
    return list.filter(
      (t) => (t.merchant || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    )
  }, [transactions, pickerSearch])

  // Select transaction to prefill
  const handleSelectTransactionForSub = (tx: Transaction) => {
    setIsPickerOpen(false)
    const m = (tx.merchant || tx.description || '').toLowerCase()
    let guessedCategory: ExpenseCategory = 'Eğlence & Medya'
    let guessedDecision: StrategicDecision = 'Kararsız' // default to review for savings

    if (m.includes('spor') || m.includes('gym') || m.includes('fit') || m.includes('macfit')) {
      guessedCategory = 'Spor & Yaşam'
    } else if (
      m.includes('turkcell') ||
      m.includes('telekom') ||
      m.includes('vodafone') ||
      m.includes('fatura') ||
      m.includes('internet')
    ) {
      guessedCategory = 'İletişim & Fatura'
      guessedDecision = 'Devam' // Phone is essential
    } else if (
      m.includes('cursor') ||
      m.includes('github') ||
      m.includes('openai') ||
      m.includes('chatgpt') ||
      m.includes('google') ||
      m.includes('aws') ||
      m.includes('canva')
    ) {
      guessedCategory = 'Yazılım & SaaS'
    }

    handleOpenCreateModal({
      service: tx.merchant || tx.description || '',
      amount: tx.amount.toString(),
      category: guessedCategory,
      decision: guessedDecision,
      group_type: tx.analysis_group === 'İş' ? 'İş' : 'Kişisel',
      payment_method: tx.account_or_card || 'Kredi Kartı',
      project_id: tx.project_id || '',
    })
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abonelikler & Sabit Giderler"
        description="Aylık ve yıllık düzenli aboneliklerinizi, sabit giderlerinizi ve tasarruf fırsatlarını takip edin."
        badge={<Badge variant="outline" className="text-xs font-medium">{activeSubs.length} Aktif Gider</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPickerOpen(true)}
              className="gap-1.5 shadow-sm"
            >
              <Receipt className="h-4 w-4" />
              <span>Hareketlerden Seç</span>
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenCreateModal()}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Yeni Gider</span>
            </Button>
          </div>
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
              <span>Yıllık tasarruf potansiyeli: {formatCurrency(potentialYearlySavings)}</span>
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
          </p>
        </div>
      </div>

      {/* KATEGORİ FİLTRE SEKMELERİ & ARAMA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Tümü ({activeSubs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Eğlence & Medya')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Eğlence & Medya'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Eğlence & Medya ({categoryCounts['Eğlence & Medya']})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Spor & Yaşam')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Spor & Yaşam'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Spor & Yaşam ({categoryCounts['Spor & Yaşam']})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('İletişim & Fatura')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'İletişim & Fatura'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            İletişim & Fatura ({categoryCounts['İletişim & Fatura']})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Yazılım & SaaS')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'Yazılım & SaaS'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Yazılım & SaaS ({categoryCounts['Yazılım & SaaS']})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ARCHIVED')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'ARCHIVED'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Archive className="h-3.5 w-3.5 inline mr-1" />
            İptal Edilenler ({cancelledSubs.length})
          </button>
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Abonelik veya harcama ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* GİDER LİSTESİ / TASARRUF KARTLARI */}
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
              <Button size="sm" onClick={() => setIsPickerOpen(true)} variant="outline" className="gap-1.5">
                <Receipt className="h-4 w-4" />
                <span>Hareketlerden Seç</span>
              </Button>
              <Button size="sm" onClick={() => handleOpenCreateModal()} className="gap-1.5">
                <Plus className="h-4 w-4" />
                <span>Manuel Ekle</span>
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedList.map((sub) => {
            const isArchived = sub.status === 'İptal' || sub.decision === 'İptal Et'
            const isReview = sub.decision === 'Kararsız'
            const meta = getCategoryMeta(sub.model)
            const Icon = meta.icon
            const yearlyCost = Number(sub.amount || 0) * 12

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
                            {sub.payment_method || 'Kredi Kartı'} • {sub.period}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-medium shrink-0"
                      >
                        {sub.model}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-1">
                    {/* Tutar ve Yıllık Maliyet Çarpımı */}
                    <div className="flex items-baseline justify-between border-b border-border/50 pb-2.5">
                      <div>
                        <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                          {formatCurrency(sub.amount)}{' '}
                          <span className="text-xs text-muted-foreground font-normal">/ ay</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">Yıllık Yük:</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">
                          {formatCurrency(yearlyCost)}
                        </span>
                      </div>
                    </div>

                    {/* Stratejik Tasarruf Karar Barı */}
                    {!isArchived ? (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-medium text-muted-foreground flex items-center justify-between">
                          <span>Durum / Karar:</span>
                          {isReview && (
                            <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                              İncelemede
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'Devam')}
                            className={`rounded-lg py-1 px-1.5 text-center font-medium border transition-all ${
                              sub.decision === 'Devam'
                                ? 'bg-muted text-foreground border-border font-semibold shadow-sm'
                                : 'border-border/60 text-muted-foreground hover:bg-muted'
                            }`}
                            title="Bu harcama hayat/iş için zorunlu kabul edilir"
                          >
                            Zorunlu
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'Kararsız')}
                            className={`rounded-lg py-1 px-1.5 text-center font-medium border transition-all ${
                              sub.decision === 'Kararsız'
                                ? 'bg-muted text-foreground border-border font-semibold shadow-sm'
                                : 'border-border/60 text-muted-foreground hover:bg-muted'
                            }`}
                            title="Gözden geçirilebilir, tasarruf adayı"
                          >
                            İncele
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDecision(sub, 'İptal Et')}
                            className="rounded-lg py-1 px-1.5 text-center font-medium border border-border/60 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-all"
                            title="Üyeliği/aboneliği iptal et ve tasarruf et"
                          >
                            İptal Et
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/40 border border-border p-2 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground font-medium">
                          İptal Edildi (Yıllık <strong className="text-foreground">{formatCurrency(yearlyCost)}</strong> tasarruf)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickDecision(sub, 'Devam')}
                          className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1"
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
                    <span>
                      {projects.find((p) => p.id === sub.project_id)?.name ? (
                        <span>Proje: <strong className="text-foreground">{projects.find((p) => p.id === sub.project_id)?.name}</strong></span>
                      ) : (
                        <span>Kişisel Yaşam Gideri</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(sub)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title="Düzenle"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(sub.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Kalıcı Olarak Sil"
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

      {/* MODAL 1: Manuel Ekleme / Düzenleme */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSub ? 'Düzenli Gideri Düzenle' : 'Yeni Düzenli Gider / Abonelik Ekle'}
        size="lg"
      >
        <form onSubmit={handleSaveSubscription} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Hizmet / Kurum / Abonelik Adı
            </label>
            <Input
              required
              placeholder="Örn: Macfit Spor Salonu, Netflix, Turkcell Telefon, Cursor Pro"
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kategori Türü</label>
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              >
                <option value="Eğlence & Medya">🎬 Eğlence & Medya (Netflix, Prime vb.)</option>
                <option value="Spor & Yaşam">🏋️ Spor & Yaşam (Spor salonu, kurs)</option>
                <option value="İletişim & Fatura">📱 İletişim & Fatura (Telefon, İnternet)</option>
                <option value="Yazılım & SaaS">💻 Yazılım & SaaS (Cursor, ChatGPT vb.)</option>
                <option value="Diğer">🏠 Diğer Düzenli Gider</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Tasarruf Durumu</label>
              <Select
                value={form.decision}
                onChange={(e) => setForm({ ...form, decision: e.target.value as StrategicDecision })}
              >
                <option value="Devam">🟢 Vazgeçilmez (Zorunlu Gider)</option>
                <option value="Kararsız">🟡 Gözden Geçir (Tasarruf Potansiyeli)</option>
                <option value="İptal Et">🔴 İptal Et (Kurtarılan Tasarruf)</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Aylık Tutar</label>
              <Input
                type="number"
                step="0.01"
                prefix="₺"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Ödeme Periyodu</label>
              <Select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              >
                <option value="Aylık">Aylık</option>
                <option value="Yıllık">Yıllık</option>
                <option value="Haftalık">Haftalık</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Ödeme Yolu / Kart
              </label>
              <Input
                placeholder="Örn: Enpara Kartı, Otomatik Ödeme, Elden"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kapsam</label>
              <Select
                value={form.group_type}
                onChange={(e) => setForm({ ...form, group_type: e.target.value as any })}
              >
                <option value="Kişisel">Kişisel Harcama</option>
                <option value="İş">İş / Şirket Harcaması</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              İlişkili Proje (Opsiyonel)
            </label>
            <Select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">Projesiz / Genel Kişisel</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editingSub ? 'Güncelle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Hareketlerden Hızlı Yakala */}
      <Modal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title="Hareketlerden Abonelik / Düzenli Gider Yakala"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Geçmiş banka ve kredi kartı işlemlerinizdeki tekrarlayan harcamaları (Netflix, Turkcell, spor salonu vb.) tek tıkla radara ekleyin.
          </p>

          <Input
            placeholder="İşyeri ara... (Örn: Turkcell, Netflix, Macfit, Prime)"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="text-xs"
          />

          <div className="max-h-80 overflow-y-auto divide-y divide-border/50 rounded-lg border border-border">
            {candidateTransactions.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Uygun işlem hareketi bulunamadı.
              </div>
            ) : (
              candidateTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-xs text-foreground truncate">
                      {tx.merchant || tx.description}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>Son İşlem: {formatDate(tx.date)}</span>
                      <span>•</span>
                      <span>{tx.account_or_card || 'Kart'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {formatCurrency(tx.amount)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectTransactionForSub(tx)}
                      className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                    >
                      <span>Radara Al</span>
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setIsPickerOpen(false)}>
              Kapat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
