'use client'

import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Plus,
  Trash2,
  FolderKanban,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Flame,
  Archive,
  Sparkles,
  ArrowRightLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { projectSixMonthCashLoad } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import type { Subscription, Project, Transaction, CreditCard } from '@/types/database'

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)

  // Tab: 'active' | 'archived'
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [subForm, setSubForm] = useState({
    service: '',
    group_type: 'İş' as 'Kişisel' | 'İş',
    model: 'Vazgeçilmez',
    amount: '',
    period: 'Aylık',
    end_date: '',
    decision: 'Devam' as any,
    payment_method: 'Enpara Kredi Kartı',
    payment_card_id: '',
    project_id: '',
  })

  useEffect(() => {
    loadSubsAndProjects()
  }, [])

  async function loadSubsAndProjects() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: sData }, { data: pData }, { data: tData }, { data: cData }] = await Promise.all([
        supabase.from('subscriptions').select('*').order('amount', { ascending: false }),
        supabase.from('projects').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('credit_cards').select('*'),
      ])
      if (sData) setSubscriptions(sData)
      if (pData) setProjects(pData)
      if (tData) setTransactions(tData)
      if (cData) setCreditCards(cData)
    } catch (err) {
      console.error('Error loading subscriptions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          service: subForm.service,
          group_type: subForm.group_type,
          model: subForm.model,
          strategic_tag: subForm.model,
          amount: parseFloat(subForm.amount || '0'),
          currency: 'TRY',
          period: subForm.period,
          end_date: subForm.end_date || null,
          decision: 'Devam',
          payment_method: subForm.payment_method || null,
          payment_card_id: subForm.payment_card_id || null,
          project_id: subForm.project_id || null,
          status: 'Aktif',
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setSubscriptions([data, ...subscriptions])
        setIsModalOpen(false)
        setSubForm({
          service: '',
          group_type: 'İş',
          model: 'Vazgeçilmez',
          amount: '',
          period: 'Aylık',
          end_date: '',
          decision: 'Devam',
          payment_method: 'Enpara Kredi Kartı',
          payment_card_id: '',
          project_id: '',
        })
      }
    } catch (err: any) {
      alert(err.message || 'Abonelik eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // 4-Tier Strategic Classification Handler
  const handleTagChange = async (
    id: string,
    tag: 'Vazgeçilmez' | 'Esnek' | 'Tek Seferlik' | 'İptal'
  ) => {
    try {
      const supabase = createClient()
      const isArchived = tag === 'Tek Seferlik' || tag === 'İptal'
      const newStatus = isArchived ? 'İptal' : 'Aktif'
      const newDecision = tag === 'İptal' ? 'İptal Et' : tag === 'Tek Seferlik' ? 'İptal Et' : 'Devam'

      const { error } = await supabase
        .from('subscriptions')
        .update({
          decision: newDecision as any,
          status: newStatus as any,
          model: tag,
          strategic_tag: tag,
        })
        .eq('id', id)

      if (error) throw error
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, decision: newDecision as any, status: newStatus as any, model: tag }
            : s
        )
      )
    } catch (err: any) {
      alert(err.message || 'Durum güncellenemedi')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu aracı kalıcı olarak silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('subscriptions').delete().eq('id', id)
      if (error) throw error
      setSubscriptions(subscriptions.filter((s) => s.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  // =========================================================================
  // SON EKSTRE / AKTİF AY VE GEÇMİŞ AY AYRIŞTIRMASI
  // =========================================================================
  const latestTxDate = transactions[0]?.date || new Date().toISOString().split('T')[0]
  const latestMonthPrefix = latestTxDate.slice(0, 7) // e.g. '2026-08'
  const latestMonthName = latestMonthPrefix === '2026-08' ? 'Ağustos 2026' : latestMonthPrefix

  // Active tools: either appeared in latest month statement OR explicitly marked as 'Vazgeçilmez' / 'Esnek'
  const activeSubs = subscriptions.filter((s) => {
    const currentTag = s.strategic_tag || s.model
    if (s.status === 'İptal' || s.decision === 'İptal Et' || currentTag === 'Tek Seferlik' || currentTag === 'İptal') {
      return false
    }

    const explicitlyActive = currentTag === 'Vazgeçilmez' || currentTag === 'Esnek'
    if (explicitlyActive) return true

    // If auto-discovered without explicit user tag: check if it appeared in latest statement month!
    const appearedInLatestMonth = transactions.some((t) => {
      if (!t.date.startsWith(latestMonthPrefix)) return false
      const m = (t.merchant || '').toLowerCase()
      const d = (t.description || '').toLowerCase()
      const srv = s.service.toLowerCase()
      return (m && (m.includes(srv) || srv.includes(m))) || (d && (d.includes(srv) || srv.includes(d)))
    })

    return appearedInLatestMonth
  })

  // Archived / Past Invoices
  const archivedSubs = subscriptions.filter((s) => !activeSubs.some((a) => a.id === s.id))

  // Calculations
  const essentialSubs = activeSubs.filter((s) => (s.strategic_tag || s.model) === 'Vazgeçilmez' || !(s.strategic_tag || s.model))
  const flexibleSubs = activeSubs.filter((s) => (s.strategic_tag || s.model) === 'Esnek')

  const totalEssentialMonthly = essentialSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  const totalFlexibleMonthly = flexibleSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0)
  const trueActiveMonthlyLoad = totalEssentialMonthly + totalFlexibleMonthly

  const monthlyProjection = projectSixMonthCashLoad(activeSubs, [], 6)

  const displayedList = activeTab === 'active' ? activeSubs : archivedSubs

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Abonelikler & Düzenli Araçlar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Son ekstrede ({latestMonthName}) doğrulanan aktif SaaS araçlarınız ve geçmişte kalan faturalarınız.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-4 w-4" />
            Yeni Araç Ekle
          </Button>
        </div>
      </div>

      {/* KPI Cards: True Active Monthly Load vs Flexible Cuts */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* True Active Monthly Load */}
        <Card className="border-border bg-card shadow-sm border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Son Ekstre Doğrulanmış Aktif Yük
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-purple-400">
              {formatCurrency(trueActiveMonthlyLoad)}{' '}
              <span className="text-xs text-muted-foreground font-sans font-normal">/ ay</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeSubs.length} aktif devam eden düzenli araç ({latestMonthName})
            </p>
          </CardContent>
        </Card>

        {/* Essential Core SaaS */}
        <Card className="border-border bg-card shadow-sm border-l-4 border-l-success">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vazgeçilmez / Çekirdek SaaS
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(totalEssentialMonthly)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              İşin ve hayatın olmazsa olmazları ({essentialSubs.length} araç)
            </p>
          </CardContent>
        </Card>

        {/* Past Invoices Count */}
        <Card className="border-border bg-card shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Geçmişte Kalan / Tek Seferlik
            </CardTitle>
            <Archive className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {archivedSubs.length} Fatura
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Eski ekstrelerde kalmış veya tek seferlik ödenmiş kalemler
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 6-Month Projection Visualizer */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            6 Aylık Planlı Sabit Yük Projeksiyonu
          </CardTitle>
          <CardDescription className="text-xs">
            Yalnızca son ekstrede doğrulanmış aktif abonelikler geleceğe yansıtılır
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-2">
            {monthlyProjection.map((val, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center rounded-xl bg-muted/30 p-3 text-center border border-border/40"
              >
                <span className="text-[10px] font-semibold text-muted-foreground mb-1">
                  {idx + 1}. Ay
                </span>
                <span className="text-sm font-bold font-mono text-foreground">
                  {formatCurrency(val)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Active vs Past / Archived Invoices */}
      <div className="space-y-4">
        <div className="flex gap-3 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'active'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>🟢 Güncel & Aktif Araçlar ({activeSubs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeTab === 'archived'
                ? 'bg-muted text-foreground border border-border shadow-sm'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>📦 Geçmişte Kalan & Tek Seferlik Faturalar ({archivedSubs.length})</span>
          </button>
        </div>

        {/* Tools Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedList.length === 0 ? (
            <div className="col-span-3 p-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              {activeTab === 'active'
                ? `Son ekstrede (${latestMonthName}) yeni bir düzenli abonelik tespit edilmedi. Geçmiş faturalar sekmesini kontrol edebilir veya manuel ekleyebilirsiniz.`
                : 'Geçmiş veya tek seferlik fatura bulunmuyor.'}
            </div>
          ) : (
            displayedList.map((sub) => {
              const actualTag = sub.strategic_tag || sub.model
              const currentTag =
                actualTag === 'Vazgeçilmez' || actualTag === 'Esnek' || actualTag === 'Tek Seferlik' || actualTag === 'İptal'
                  ? actualTag
                  : sub.decision === 'İptal Et'
                  ? 'İptal'
                  : 'Vazgeçilmez'

              return (
                <Card
                  key={sub.id}
                  className={`border-border bg-card shadow-sm transition-all hover:border-primary/40 ${
                    activeTab === 'archived' ? 'opacity-75 bg-muted/10' : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold">{sub.service}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {sub.payment_method || 'Kredi Kartı'} • {sub.period}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={sub.group_type === 'İş' ? 'purple' : 'outline'}
                        className="text-[10px]"
                      >
                        {sub.group_type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {formatCurrency(sub.amount)}{' '}
                      <span className="text-xs text-muted-foreground font-sans font-normal">/ ay</span>
                    </div>

                    {/* 4-Tier Strategic Action Tagger */}
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <div className="text-[10px] font-semibold text-muted-foreground">
                        Stratejik Rolü:
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleTagChange(sub.id, 'Vazgeçilmez')}
                          className={`rounded-lg py-1 px-2 font-medium border text-center transition-all ${
                            currentTag === 'Vazgeçilmez'
                              ? 'bg-success/15 border-success text-success font-bold shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          🟢 Vazgeçilmez
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTagChange(sub.id, 'Esnek')}
                          className={`rounded-lg py-1 px-2 font-medium border text-center transition-all ${
                            currentTag === 'Esnek'
                              ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          🟡 Esnek
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTagChange(sub.id, 'Tek Seferlik')}
                          className={`rounded-lg py-1 px-2 font-medium border text-center transition-all ${
                            currentTag === 'Tek Seferlik'
                              ? 'bg-purple-500/15 border-purple-500 text-purple-400 font-bold shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          ⚡ Tek Seferlik
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTagChange(sub.id, 'İptal')}
                          className={`rounded-lg py-1 px-2 font-medium border text-center transition-all ${
                            currentTag === 'İptal'
                              ? 'bg-destructive/15 border-destructive text-destructive font-bold shadow-sm'
                              : 'border-border/60 text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          🔴 İptal
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
                      <span>Proje: {projects.find((p) => p.id === sub.project_id)?.name || 'Genel'}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(sub.id)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* Add Subscription Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Dijital Araç / Abonelik Ekle"
      >
        <form onSubmit={handleAddSubscription} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Servis / Araç Adı</label>
            <Input
              value={subForm.service}
              onChange={(e) => setSubForm({ ...subForm, service: e.target.value })}
              placeholder="Örn: Cursor, ChatGPT, Hostinger..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Aylık Tutar (₺)</label>
              <Input
                type="number"
                step="0.01"
                value={subForm.amount}
                onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Grup</label>
              <Select
                value={subForm.group_type}
                onChange={(e) => setSubForm({ ...subForm, group_type: e.target.value as any })}
              >
                <option value="İş">İş (SaaS & Operasyon)</option>
                <option value="Kişisel">Kişisel</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Stratejik Rol</label>
            <Select
              value={subForm.model}
              onChange={(e) => setSubForm({ ...subForm, model: e.target.value })}
            >
              <option value="Vazgeçilmez">🟢 Vazgeçilmez (Çekirdek SaaS)</option>
              <option value="Esnek">🟡 Esnek (Dönemsel / Bütçeye Bağlı)</option>
              <option value="Tek Seferlik">⚡ Tek Seferlik / Yıllık Fatura</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Ödeme Kartı</label>
            <Select
              value={subForm.payment_card_id || ''}
              onChange={(e) => setSubForm({ ...subForm, payment_card_id: e.target.value })}
            >
              <option value="">(Belirtilmedi)</option>
              {creditCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bank} - {c.card_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Bağlı Proje (Opsiyonel)</label>
            <Select
              value={subForm.project_id}
              onChange={(e) => setSubForm({ ...subForm, project_id: e.target.value })}
            >
              <option value="">(Genel Araç)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
