'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  FileText,
  Settings,
  Edit3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, slugify } from '@/lib/utils'
import { calculateProjectTotalCost, evaluateProjectBudget } from '@/lib/finance-engine'
import { financialBridge } from '@/lib/financial-bridge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { MarkdownEditor } from '@/components/markdown'
import { useToast } from '@/lib/toast-context'
import type { Project, ProjectTask, Transaction, Subscription, Account } from '@/types/database'

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const resolvedParams = use(params)
  const slug = resolvedParams.slug

  const [project, setProject] = useState<Project | null>(null)
  const [markdownDoc, setMarkdownDoc] = useState<string>('')
  const [savingDoc, setSavingDoc] = useState(false)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Task Edit Modal State
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null)
  const [editTaskForm, setEditTaskForm] = useState({
    title: '',
    category: 'Görev' as ProjectTask['category'],
    status: 'Yapılacak' as ProjectTask['status'],
  })

  // Project Edit Modal State
  const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState({
    name: '',
    slug: '',
    status: 'Planlama' as Project['status'],
    budget_limit: '',
    repo_url: '',
    live_url: '',
  })

  // Forms
  const [newTask, setNewTask] = useState({
    title: '',
    category: 'Görev' as ProjectTask['category'],
  })

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    description: '',
    accountId: '',
  })

  const handleQuickExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !expenseForm.amount) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      await financialBridge.recordExpense({
        userId: user.id,
        amount: parseFloat(expenseForm.amount),
        merchant: project.name + ' Proje Gideri',
        description: expenseForm.description,
        date: new Date().toISOString().split('T')[0],
        accountId: expenseForm.accountId || undefined,
        projectId: project.id,
        analysisGroup: 'İş'
      })

      setIsExpenseModalOpen(false)
      setExpenseForm({ amount: '', description: '', accountId: '' })
      toast.success('Harcama projeye başarıyla kaydedildi!')
      loadProjectData()
    } catch (err: any) {
      toast.error(err.message || 'Harcama eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

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
        const savedDraft = typeof window !== 'undefined' ? localStorage.getItem(`pusula_project_doc_${slug}`) : null
        setMarkdownDoc(savedDraft !== null ? savedDraft : (pData.description || ''))

        const [{ data: tks }, { data: txs }, { data: subs }, { data: accs }] = await Promise.all([
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
          supabase
            .from('accounts')
            .select('*')
            .order('name', { ascending: true }),
        ])

        if (tks) setTasks(tks)
        if (txs) setTransactions(txs)
        if (subs) setSubscriptions(subs)
        if (accs) setAccounts(accs)
      }
    } catch (err) {
      console.error('Error loading project details:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkdownChange = (val: string) => {
    setMarkdownDoc(val)
    if (typeof window !== 'undefined') {
      localStorage.setItem(`pusula_project_doc_${slug}`, val)
    }
  }

  const handleSaveProjectDoc = async () => {
    if (!project) return
    setSavingDoc(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({ description: markdownDoc })
        .eq('id', project.id)

      if (error) throw error
      setProject({ ...project, description: markdownDoc })
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`pusula_project_doc_${slug}`)
      }
      toast.success('Proje dokümantasyonu kaydedildi!')
    } catch (err: any) {
      toast.error(err.message || 'Doküman kaydedilemedi')
    } finally {
      setSavingDoc(false)
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
      toast.success('Görev durumu güncellendi!')
    } catch (err: any) {
      toast.error(err.message || 'Görev güncellenemedi')
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
        toast.success('Yeni görev eklendi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Görev eklenemedi')
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
      toast.success('Görev silindi.')
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    }
  }

  const handleOpenEditTask = (task: ProjectTask) => {
    setEditingTask(task)
    setEditTaskForm({
      title: task.title,
      category: task.category,
      status: task.status,
    })
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTask) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_tasks')
        .update({
          title: editTaskForm.title,
          category: editTaskForm.category,
          status: editTaskForm.status,
        })
        .eq('id', editingTask.id)
        .select()
        .single()

      if (error) throw error
      if (data) {
        setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)))
        setEditingTask(null)
        toast.success('Görev başarıyla güncellendi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Görev güncellenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenProjectEdit = () => {
    if (!project) return
    setProjectEditForm({
      name: project.name,
      slug: project.slug,
      status: project.status,
      budget_limit: project.budget_limit ? String(project.budget_limit) : '',
      repo_url: project.repo_url || '',
      live_url: project.live_url || '',
    })
    setIsProjectEditModalOpen(true)
  }

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const finalSlug = slugify(projectEditForm.slug || projectEditForm.name)
      if (!finalSlug) throw new Error('Geçerli bir URL slug girilmelidir.')

      const { data, error } = await supabase
        .from('projects')
        .update({
          name: projectEditForm.name,
          slug: finalSlug,
          status: projectEditForm.status,
          budget_limit: projectEditForm.budget_limit ? parseFloat(projectEditForm.budget_limit) : null,
          repo_url: projectEditForm.repo_url || null,
          live_url: projectEditForm.live_url || null,
        })
        .eq('id', project.id)
        .select()
        .single()

      if (error) throw error
      if (data) {
        const prevSlug = project.slug
        setProject(data)
        setIsProjectEditModalOpen(false)
        toast.success('Proje bilgileri güncellendi!')
        if (data.slug !== prevSlug) {
          router.push(`/projects/${data.slug}`)
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Proje güncellenemedi')
    } finally {
      setSubmitting(false)
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
  
  const totalRevenue = transactions.filter(t => t.type === 'Gelir').reduce((s, t) => s + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'Harcama').reduce((s, t) => s + t.amount, 0)
  
  const monthlySubCost = subscriptions
    .filter((s) => s.status === 'Aktif')
    .reduce((sum, s) => sum + s.amount, 0)
    
  const netStatus = totalRevenue - totalExpense
  
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
            <span className="text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50" title={`URL: /projects/${project.slug}`}>
              /{project.slug}
            </span>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl line-clamp-2">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleOpenProjectEdit} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Projeyi Düzenle
          </Button>
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
          <Button onClick={() => setIsExpenseModalOpen(true)} variant="secondary" className="gap-2 shadow-md">
            ⚡ Hızlı Harcama Ekle
          </Button>
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
                Proje P&L (Kâr/Zarar) Özeti
              </CardTitle>
              <CardDescription>
                Bu projenin gelir ve gider durumu ile net pozisyonu
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Net Durum</div>
              <div className={`text-2xl font-bold font-mono ${netStatus >= 0 ? 'text-success' : 'text-destructive'}`}>
                {netStatus > 0 ? '+' : ''}{formatCurrency(netStatus)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4 pt-2 border-t border-border/50 text-xs">
            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Toplam Gelir</div>
              <div className="text-lg font-bold font-mono text-success mt-1">
                {formatCurrency(totalRevenue)}
              </div>
            </div>

            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Toplam Harcama</div>
              <div className="text-lg font-bold font-mono text-destructive mt-1">
                {formatCurrency(totalExpense)}
              </div>
            </div>

            <div className="rounded-lg bg-card/60 p-3 border border-border/50">
              <div className="text-muted-foreground">Aylık Abonelik Yükü</div>
              <div className="text-lg font-bold font-mono text-destructive mt-1">
                {formatCurrency(monthlySubCost)} / ay
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {subscriptions.filter(s => s.status === 'Aktif').length} aktif abonelik
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

      {/* Project Markdown Spec & Documentation Workspace */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Dokümantasyon & Teknik Şartname (Spec)
              </CardTitle>
              <CardDescription>
                Bu projenin mimarisi, gereksinimleri, API notları ve geliştirme şartnamesi
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <MarkdownEditor
            value={markdownDoc}
            onChange={handleMarkdownChange}
            onSave={handleSaveProjectDoc}
            docName={`${slug}-sartname`}
            title={`${project.name} Şartname & Dokümantasyon`}
            placeholder="Proje mimarisi, veritabanı şeması, yapılacaklar listesi veya API gereksinimlerini buraya yazın ya da .md dosyası sürükleyip bırakın..."
            minHeight="380px"
            defaultMode="split"
            className="border-0 rounded-none shadow-none"
          />
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
              className="flex items-center justify-between rounded-lg border border-border/40 bg-card/40 p-3 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => handleToggleTaskStatus(task)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title={task.status === 'Tamamlandı' ? 'Yapılacak olarak işaretle' : 'Tamamlandı olarak işaretle'}
                >
                  {task.status === 'Tamamlandı' ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <div
                  className="cursor-pointer min-w-0"
                  onClick={() => handleOpenEditTask(task)}
                  title="Görevi düzenlemek için tıklayın"
                >
                  <div
                    className={`text-sm font-medium truncate ${
                      task.status === 'Tamamlandı'
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground group-hover:text-primary transition-colors'
                    }`}
                  >
                    {task.title}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {task.category}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {task.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleOpenEditTask(task)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Görevi Düzenle"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteTask(task.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Görevi Sil"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base">Bu Projeye Ait Harcamalar ({transactions.length})</CardTitle>
            <CardDescription>Ekstrelerden veya manuel defterden bu projeye bağlanan giderler</CardDescription>
          </div>
          {transactions.length > 0 && project && (
            <Link href={`/transactions?project_id=${project.id}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
                <Receipt className="h-3 w-3" />
                İşlem Defterinde Aç
              </Button>
            </Link>
          )}
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

      {/* Quick Expense Modal */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="⚡ Hızlı Harcama Ekle"
        description={`${project.name} projesi için hızlıca harcama kaydedin.`}
      >
        <form onSubmit={handleQuickExpense} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Tutar</label>
            <Input
              required
              type="number"
              step="0.01"
              prefix="₺"
              placeholder="1500.00"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              className="text-xs font-mono font-semibold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Açıklama</label>
            <Input
              required
              placeholder="Örn: Sunucu ödemesi"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Kasa / Hesap (Opsiyonel)</label>
            <Select
              value={expenseForm.accountId}
              onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
              className="text-xs"
            >
              <option value="">(Hesap Seçilmedi - Bakiyeden Düşülmez)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Harcama Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        title="Görevi Düzenle"
        description="Görev başlığını, kategorisini veya durumunu güncelleyin."
      >
        {editingTask && (
          <form onSubmit={handleUpdateTask} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Görev Başlığı</label>
              <Input
                required
                placeholder="Örn: Supabase Auth kurulumu"
                value={editTaskForm.title}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                <Select
                  value={editTaskForm.category}
                  onChange={(e) =>
                    setEditTaskForm({ ...editTaskForm, category: e.target.value as ProjectTask['category'] })
                  }
                  className="text-xs"
                >
                  <option value="Görev">Görev</option>
                  <option value="Epics">Epic / Büyük Hedef</option>
                  <option value="Bug">Hata (Bug)</option>
                  <option value="Fikir">Fikir</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Durum</label>
                <Select
                  value={editTaskForm.status}
                  onChange={(e) =>
                    setEditTaskForm({ ...editTaskForm, status: e.target.value as ProjectTask['status'] })
                  }
                  className="text-xs"
                >
                  <option value="Yapılacak">Yapılacak</option>
                  <option value="Sürüyor">Sürüyor</option>
                  <option value="Tamamlandı">Tamamlandı</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setEditingTask(null)}>
                İptal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Güncelleniyor...' : 'Görevi Güncelle'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Project & Slug Modal */}
      <Modal
        isOpen={isProjectEditModalOpen}
        onClose={() => setIsProjectEditModalOpen(false)}
        title="Projeyi Düzenle"
        description="Proje adını, URL slug adresini, durumunu ve bütçe sınırlarını güncelleyin."
        size="lg"
      >
        {project && (
          <form onSubmit={handleUpdateProject} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Proje Adı</label>
              <Input
                required
                placeholder="Örn: PusulaOS, KadroPlan"
                value={projectEditForm.name}
                onChange={(e) => {
                  const newName = e.target.value
                  const oldNameSlug = slugify(projectEditForm.name)
                  const currentSlug = projectEditForm.slug
                  setProjectEditForm((prev) => ({
                    ...prev,
                    name: newName,
                    slug: currentSlug === '' || currentSlug === oldNameSlug ? slugify(newName) : prev.slug,
                  }))
                }}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">URL Slug</label>
                <Input
                  required
                  placeholder="proje-adi"
                  prefix="/"
                  value={projectEditForm.slug}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, slug: slugify(e.target.value) })}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Proje linki: /projects/{slugify(projectEditForm.slug || projectEditForm.name || 'slug')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Proje Durumu</label>
                <Select
                  value={projectEditForm.status}
                  onChange={(e) =>
                    setProjectEditForm({
                      ...projectEditForm,
                      status: e.target.value as Project['status'],
                    })
                  }
                  className="text-xs"
                >
                  <option value="Planlama">📐 Planlama</option>
                  <option value="Geliştirmede">🚧 Geliştirmede</option>
                  <option value="Canlı">🚀 Canlı</option>
                  <option value="Fikir">💡 Fikir</option>
                  <option value="Arşiv">📦 Arşiv</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                Bütçe Tavanı (Opsiyonel)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="20000.00"
                prefix="₺"
                value={projectEditForm.budget_limit}
                onChange={(e) => setProjectEditForm({ ...projectEditForm, budget_limit: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">GitHub Repo URL</label>
                <Input
                  type="url"
                  placeholder="https://github.com/..."
                  value={projectEditForm.repo_url}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, repo_url: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Canlı Site URL</label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={projectEditForm.live_url}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, live_url: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsProjectEditModalOpen(false)}>
                İptal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

