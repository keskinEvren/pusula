'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  FolderKanban,
  Receipt,
  CalendarClock,
  Github,
  Globe,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateProjectTotalCost, evaluateProjectBudget } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import type { Project, ProjectTask, Transaction, Subscription } from '@/types/database'

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const resolvedParams = use(params)
  const slug = resolvedParams.slug

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Görev' as ProjectTask['category'],
  })

  useEffect(() => {
    loadProjectData()
  }, [slug])

  async function loadProjectData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: pData } = await supabase
        .from('projects')
        .select('*')
        .eq('slug', slug)
        .single()

      if (pData) {
        setProject(pData)
        const [{ data: tks }, { data: txs }, { data: subs }] = await Promise.all([
          supabase
            .from('project_tasks')
            .select('*')
            .eq('project_id', pData.id)
            .order('sort_order', { ascending: true }),
          supabase
            .from('transactions')
            .select('*')
            .eq('project_id', pData.id)
            .order('date', { ascending: false }),
          supabase
            .from('subscriptions')
            .select('*')
            .eq('project_id', pData.id),
        ])

        if (tks) setTasks(tks)
        if (txs) setTransactions(txs)
        if (subs) setSubscriptions(subs)
      }
    } catch (err) {
      console.error('Error loading project details:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleTaskStatus = async (task: ProjectTask) => {
    const nextStatus = task.status === 'Tamamlandı' ? 'Yapılacak' : 'Tamamlandı'
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('project_tasks')
        .update({ status: nextStatus })
        .eq('id', task.id)

      if (error) throw error
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
      )
    } catch (err: any) {
      alert(err.message || 'Görev güncellenemedi')
    }
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          project_id: project.id,
          user_id: user.id,
          title: newTask.title,
          category: newTask.category,
          status: 'Yapılacak',
          sort_order: tasks.length + 1,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setTasks([...tasks, data])
        setIsTaskModalOpen(false)
        setNewTask({ title: '', category: 'Görev' })
      }
    } catch (err: any) {
      alert(err.message || 'Görev eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('project_tasks').delete().eq('id', id)
      if (error) throw error
      setTasks(tasks.filter((t) => t.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-xs text-muted-foreground animate-pulse">
        Proje detayları yükleniyor...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Link href="/projects" className="text-xs text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Projelere Dön
        </Link>
        <Card className="border-border p-8 text-center text-muted-foreground">
          Proje bulunamadı.
        </Card>
      </div>
    )
  }

  // Cost & Bridge Calculation via Pure Finance Engine
  const directCost = transactions.reduce((sum, t) => sum + t.amount, 0)
  const monthlySubCost = subscriptions
    .filter((s) => s.status !== 'İptal')
    .reduce((sum, s) => sum + s.amount, 0)
  const totalCost = calculateProjectTotalCost(project.id, transactions, subscriptions)
  const budgetEvaluation = evaluateProjectBudget(totalCost, project.budget_limit)

  const completedTasksCount = tasks.filter((t) => t.status === 'Tamamlandı').length
  const progressPct = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Back Link */}
      <div>
        <Link
          href="/projects"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Projeler Panosuna Dön
        </Link>
      </div>

      {/* Project Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            <Badge variant="purple" className="text-xs">
              {project.status}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {project.repo_url && (
            <a href={project.repo_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Github className="h-4 w-4" /> GitHub
              </Button>
            </a>
          )}
          {project.live_url && (
            <a href={project.live_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Globe className="h-4 w-4" /> Canlı Site
              </Button>
            </a>
          )}
          <Button onClick={() => setIsTaskModalOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-4 w-4" />
            Görev Ekle
          </Button>
        </div>
      </div>

      {/* Real Cost & Budget Bridge Card */}
      <Card className="border-border bg-gradient-to-r from-card to-purple-950/20 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-purple-400" />
                Proje Gerçek Maliyet Köprüsü (Bridge)
              </CardTitle>
              <CardDescription>
                Bu projeye cebinizden kuruşu kuruşuna harcanan tüm giderlerin dökümü
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Toplam Gerçek Harcama</div>
              <div className="text-2xl font-bold font-mono text-purple-400">
                {formatCurrency(totalCost)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-border/50 text-xs">
            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Tekil Doğrudan Harcamalar</div>
              <div className="text-lg font-bold font-mono text-foreground mt-1">
                {formatCurrency(directCost)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {transactions.length} adet işlem kaydı
              </div>
            </div>

            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Aylık SaaS Yakma Hızı (Burn)</div>
              <div className="text-lg font-bold font-mono text-foreground mt-1">
                {formatCurrency(monthlySubCost)} / ay
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {subscriptions.length} adet bağlı abonelik
              </div>
            </div>

            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Bütçe Tavanı Durumu</div>
              <div className="text-lg font-bold font-mono text-foreground mt-1">
                {project.budget_limit ? formatCurrency(project.budget_limit) : 'Limitsiz'}
              </div>
              <div className="text-[10px] mt-0.5">
                {budgetEvaluation.status === 'RED' ? (
                  <span className="text-destructive font-semibold">Bütçe Aşıldı!</span>
                ) : budgetEvaluation.status === 'YELLOW' ? (
                  <span className="text-amber-400 font-semibold">Bütçeye Yaklaşıldı (%85+)</span>
                ) : (
                  <span className="text-success">Bütçe Dahilinde</span>
                )}
              </div>
            </div>
          </div>

          {/* Budget Progress Bar */}
          {project.budget_limit && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Bütçe Kullanımı: {budgetEvaluation.ratio ? `${(budgetEvaluation.ratio * 100).toFixed(1)}%` : '0%'}</span>
                <span>{formatCurrency(totalCost)} / {formatCurrency(project.budget_limit)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    budgetEvaluation.status === 'RED'
                      ? 'bg-destructive'
                      : budgetEvaluation.status === 'YELLOW'
                      ? 'bg-amber-400'
                      : 'bg-primary'
                  }`}
                  style={{
                    width: `${Math.min(100, (budgetEvaluation.ratio || 0) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tasks & Epics Checklist */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Görevler & Epics ({completedTasksCount}/{tasks.length})</CardTitle>
            <CardDescription>Geliştirme hedefleri ve yapılacaklar listesi</CardDescription>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-foreground">
              %{progressPct} Tamamlandı
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-card/40 p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleTaskStatus(task)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {task.status === 'Tamamlandı' ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      task.status === 'Tamamlandı'
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {task.title}
                  </div>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {task.category}
                  </Badge>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteTask(task.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Henüz görev eklenmedi. Yeni görev ekleyerek başlayın.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tied Transactions List */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Bu Projeye Ait Harcamalar ({transactions.length})</CardTitle>
          <CardDescription>Ekstrelerden veya manuel defterden bu projeye bağlanan giderler</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Tarih</th>
                  <th className="p-3">İşyeri / Açıklama</th>
                  <th className="p-3">Grup</th>
                  <th className="p-3">Hesap / Kart</th>
                  <th className="p-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors font-sans">
                    <td className="p-3 text-muted-foreground font-mono">{formatDate(tx.date)}</td>
                    <td className="p-3 font-semibold text-foreground">{tx.merchant || tx.description}</td>
                    <td className="p-3">
                      <Badge variant="purple" className="text-[10px]">
                        {tx.analysis_group}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{tx.account_or_card || '-'}</td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-xs text-muted-foreground font-sans">
                      Bu projeye henüz harcama bağlanmadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Task Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Yeni Görev / Epic Ekle"
        description={`${project.name} projesi için yapılacak iş ekleyin.`}
      >
        <form onSubmit={handleAddTask} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Görev Başlığı</label>
            <Input
              required
              placeholder="Örn: Supabase Auth kurulumu, Landing page yayını"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
            <Select
              value={newTask.category}
              onChange={(e) =>
                setNewTask({ ...newTask, category: e.target.value as ProjectTask['category'] })
              }
              className="text-xs"
            >
              <option value="Görev">Görev</option>
              <option value="Epics">Epic / Büyük Hedef</option>
              <option value="Bug">Hata (Bug)</option>
              <option value="Fikir">Fikir</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsTaskModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Görevi Ekle'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
