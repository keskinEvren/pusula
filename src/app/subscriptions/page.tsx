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
import type { Subscription, Project } from '@/types/database'

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [subForm, setSubForm] = useState({
    service: '',
    group_type: 'İş' as 'Kişisel' | 'İş',
    model: 'Tekrarlayan',
    amount: '',
    period: 'Aylık',
    end_date: '',
    decision: 'Devam' as 'Devam' | 'İptal Et' | 'Kararsız',
    payment_method: 'Bankkart • 0887',
    project_id: '',
  })

  useEffect(() => {
    loadSubsAndProjects()
  }, [])

  async function loadSubsAndProjects() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: sData }, { data: pData }] = await Promise.all([
        supabase.from('subscriptions').select('*').order('amount', { ascending: false }),
        supabase.from('projects').select('*'),
      ])
      if (sData) setSubscriptions(sData)
      if (pData) setProjects(pData)
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
          amount: parseFloat(subForm.amount || '0'),
          currency: 'TRY',
          period: subForm.period,
          end_date: subForm.end_date || null,
          decision: subForm.decision,
          payment_method: subForm.payment_method || null,
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
          model: 'Tekrarlayan',
          amount: '',
          period: 'Aylık',
          end_date: '',
          decision: 'Devam',
          payment_method: 'Bankkart • 0887',
          project_id: '',
        })
      }
    } catch (err: any) {
      alert(err.message || 'Abonelik eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecisionToggle = async (
    id: string,
    decision: 'Devam' | 'İptal Et' | 'Kararsız'
  ) => {
    try {
      const supabase = createClient()
      const newStatus = decision === 'İptal Et' ? 'İptal Edildi' : 'Aktif'
      const { error } = await supabase
        .from('subscriptions')
        .update({ decision, status: newStatus as any })
        .eq('id', id)

      if (error) throw error
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, decision, status: newStatus as any } : s))
      )
    } catch (err: any) {
      alert(err.message || 'Karar güncellenemedi')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu aboneliği silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('subscriptions').delete().eq('id', id)
      if (error) throw error
      setSubscriptions(subscriptions.filter((s) => s.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  // 6-Month Projection via Pure Finance Engine
  const activeSubs = subscriptions.filter((s) => s.status === 'Aktif' && s.decision !== 'İptal Et')
  const monthlyProjection = projectSixMonthCashLoad(activeSubs, [], 6)
  const totalMonthlyBurn = monthlyProjection[0] || 0

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Abonelikler & Planlı Nakit Yükü
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SaaS araçları, yinelenen lisanslar ve 6 aylık nakit çıkış projeksiyonu
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Yeni Abonelik Ekle
        </Button>
      </div>

      {/* 6-Month Projection Cards */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Gelecek 6 Ayın Nakit Yükü Projeksiyonu</CardTitle>
              <CardDescription>
                Aktif aboneliklerin aylık kümülatif nakit çekim projeksiyonu
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Aylık Düzenli Yük</div>
              <div className="text-xl font-bold font-mono text-primary">
                {formatCurrency(totalMonthlyBurn)} / ay
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
            {monthlyProjection.map((amount, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-muted/30 p-3 shadow-inner"
              >
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {idx + 1}. Ay
                </div>
                <div className="mt-1 text-sm font-bold font-mono text-foreground">
                  {formatCurrency(amount)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {activeSubs.length} aktif servis
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Kayıtlı Abonelikler ({subscriptions.length})</CardTitle>
          <CardDescription>
            Hizmetlerinizin kullanım kararını (Devam / İptal Et / Kararsız) buradan yönetebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Hizmet / Servis</th>
                  <th className="p-3">Grup</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">Periyot</th>
                  <th className="p-3">Bağlı Proje</th>
                  <th className="p-3">Ödeme Aracı</th>
                  <th className="p-3 text-right">Tutar</th>
                  <th className="p-3 text-center">Kararım</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {subscriptions.map((sub) => {
                  const project = projects.find((p) => p.id === sub.project_id)
                  return (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors font-sans">
                      <td className="p-3 font-semibold text-foreground whitespace-nowrap">
                        {sub.service}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={sub.group_type === 'İş' ? 'purple' : 'secondary'}
                          className="text-[10px]"
                        >
                          {sub.group_type}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{sub.model}</td>
                      <td className="p-3 text-muted-foreground">{sub.period}</td>
                      <td className="p-3">
                        {project ? (
                          <Badge variant="purple" className="text-[10px] gap-1">
                            <FolderKanban className="h-3 w-3" />
                            {project.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-[11px]">
                        {sub.payment_method || '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
                        {formatCurrency(sub.amount)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex rounded-lg border border-border p-0.5 bg-card">
                          <button
                            type="button"
                            onClick={() => handleDecisionToggle(sub.id, 'Devam')}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                              sub.decision === 'Devam'
                                ? 'bg-success text-success-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Devam
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecisionToggle(sub.id, 'İptal Et')}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                              sub.decision === 'İptal Et'
                                ? 'bg-destructive text-destructive-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            İptal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecisionToggle(sub.id, 'Kararsız')}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                              sub.decision === 'Kararsız'
                                ? 'bg-amber-500 text-black shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Kararsız
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(sub.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}

                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-xs text-muted-foreground">
                      Kayıtlı abonelik bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Subscription Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Abonelik Tanımla"
        description="Tekrarlayan SaaS aracı, bulut altyapısı veya şahsi aboneliğinizi ekleyin."
      >
        <form onSubmit={handleAddSubscription} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Hizmet / Servis Adı</label>
            <Input
              required
              placeholder="Örn: Cursor Pro, OpenAI ChatGPT Plus, Hostinger"
              value={subForm.service}
              onChange={(e) => setSubForm({ ...subForm, service: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Aylık Tutar (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="960.00"
                value={subForm.amount}
                onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Grup</label>
              <Select
                value={subForm.group_type}
                onChange={(e) =>
                  setSubForm({ ...subForm, group_type: e.target.value as 'Kişisel' | 'İş' })
                }
                className="text-xs"
              >
                <option value="İş">İş (Proje & Yazılım)</option>
                <option value="Kişisel">Kişisel</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Periyot</label>
              <Select
                value={subForm.period}
                onChange={(e) => setSubForm({ ...subForm, period: e.target.value })}
                className="text-xs"
              >
                <option value="Aylık">Aylık</option>
                <option value="Yıllık">Yıllık</option>
                <option value="18 Ay">18 Ay</option>
                <option value="Tek Sefer">Tek Sefer</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Kararım</label>
              <Select
                value={subForm.decision}
                onChange={(e) =>
                  setSubForm({
                    ...subForm,
                    decision: e.target.value as 'Devam' | 'İptal Et' | 'Kararsız',
                  })
                }
                className="text-xs"
              >
                <option value="Devam">Devam</option>
                <option value="İptal Et">İptal Et</option>
                <option value="Kararsız">Kararsız</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Bağlı Proje (Opsiyonel)</label>
              <Select
                value={subForm.project_id}
                onChange={(e) => setSubForm({ ...subForm, project_id: e.target.value })}
                className="text-xs"
              >
                <option value="">(Yok - Genel Araç)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Ödeme Kartı</label>
              <Input
                placeholder="Örn: Bankkart • 0887"
                value={subForm.payment_method}
                onChange={(e) => setSubForm({ ...subForm, payment_method: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
