'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  FolderKanban,
  Plus,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Sliders,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, slugify } from '@/lib/utils'
import { calculateProjectTotalCost, evaluateProjectBudget } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/lib/toast-context'
import type { Project, Transaction, Subscription } from '@/types/database'

const COLUMNS: Array<{ status: Project['status']; title: string; color: string }> = [
  { status: 'Fikir', title: '💡 Fikir', color: 'border-yellow-500/30' },
  { status: 'Planlama', title: '📐 Planlama', color: 'border-blue-500/30' },
  { status: 'Geliştirmede', title: '🚧 Geliştirmede', color: 'border-purple-500/30' },
  { status: 'Canlı', title: '✅ Canlı', color: 'border-success/30' },
  { status: 'Arşiv', title: '⏸️ Arşiv', color: 'border-muted' },
]

function ProjectsContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projectForm, setProjectForm] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'Planlama' as Project['status'],
    budget_limit: '',
    repo_url: '',
    live_url: '',
  })

  useEffect(() => {
    loadProjectsAndCosts()
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsModalOpen(true)
    }
  }, [searchParams])

  async function loadProjectsAndCosts() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: pData }, { data: tData }, { data: sData }] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*'),
        supabase.from('subscriptions').select('*'),
      ])

      if (pData) setProjects(pData)
      if (tData) setTransactions(tData)
      if (sData) setSubscriptions(sData)
    } catch (err) {
      console.error('Error loading projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const finalSlug = slugify(projectForm.slug || projectForm.name)
      if (!finalSlug) throw new Error('Geçerli bir proje adı ve URL slug girilmelidir.')

      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: projectForm.name,
          slug: finalSlug,
          description: projectForm.description || null,
          status: projectForm.status,
          budget_limit: projectForm.budget_limit ? parseFloat(projectForm.budget_limit) : null,
          repo_url: projectForm.repo_url || null,
          live_url: projectForm.live_url || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setProjects([data, ...projects])
        setIsModalOpen(false)
        toast.success('Yeni proje başarıyla açıldı!')
        setProjectForm({
          name: '',
          slug: '',
          description: '',
          status: 'Planlama',
          budget_limit: '',
          repo_url: '',
          live_url: '',
        })
      }
    } catch (err: any) {
      toast.error(err.message || 'Proje eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (projectId: string, newStatus: Project['status']) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('projects')
        .update({ status: newStatus })
        .eq('id', projectId)

      if (error) throw error
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
      )
      toast.success('Proje durumu güncellendi!')
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  // Capacity Gate Rule
  const activeDevProjects = projects.filter(
    (p) => p.status === 'Planlama' || p.status === 'Geliştirmede'
  )
  const isCapacityFull = activeDevProjects.length >= 2

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Proje Portföyü (Kanban)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Geliştirme süreçleri, bütçe tavanı ve gerçek harcanan maliyet köprüsü
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Yeni Proje Aç
        </Button>
      </div>

      {/* Capacity Gate Banner */}
      {isCapacityFull && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 shadow-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">
              Odak Kapasitesi Kapısı Aktif ({activeDevProjects.length}/2 Proje Geliştirmede)
            </div>
            <div className="mt-0.5 text-xs text-amber-200/80">
              Kişisel odak kuralınız gereği aynı anda en fazla 2 projede aktif geliştirme/planlama yapılabilir.
              Yeni bir projeye başlamadan önce mevcut projelerinizden birini Canlıya alın veya Arşive kaldırın.
            </div>
          </div>
        </div>
      )}

      {/* Kanban Columns */}
      <div className="grid gap-6 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const colProjects = projects.filter((p) => p.status === col.status)

          return (
            <div key={col.status} className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                  {col.title}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {colProjects.length}
                </Badge>
              </div>

              <div className="space-y-3 min-h-[400px] rounded-xl bg-card/40 p-2 border border-border/40">
                {colProjects.map((project) => {
                  const totalCost = calculateProjectTotalCost(
                    project.id,
                    transactions,
                    subscriptions
                  )
                  const budgetEvaluation = evaluateProjectBudget(
                    totalCost,
                    project.budget_limit
                  )

                  return (
                    <Card
                      key={project.id}
                      className="border-border bg-card shadow-sm hover:border-primary/50 transition-all group"
                    >
                      <CardHeader className="p-3 pb-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/projects/${project.slug}`}
                            className="font-bold text-sm text-foreground hover:text-primary transition-colors line-clamp-1"
                          >
                            {project.name}
                          </Link>
                          <Link href={`/projects/${project.slug}`}>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Link>
                        </div>
                        {project.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </CardHeader>

                      <CardContent className="p-3 pt-0 space-y-3">
                        {/* Cost & Budget Bridge */}
                        <div className="rounded-lg bg-muted/40 p-2 text-xs border border-border/40">
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                            <span>Gerçek Maliyet:</span>
                            <span className="font-mono font-bold text-foreground">
                              {formatCurrency(totalCost)}
                            </span>
                          </div>

                          {project.budget_limit && (
                            <div className="mt-1 space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-muted-foreground">Bütçe:</span>
                                <span className="font-mono text-muted-foreground">
                                  {formatCurrency(project.budget_limit)}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full ${
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
                        </div>

                        {/* Quick Status Shift */}
                        <div className="flex justify-between items-center pt-1 border-t border-border/40">
                          <Select
                            value={project.status}
                            onChange={(e) =>
                              handleStatusChange(
                                project.id,
                                e.target.value as Project['status']
                              )
                            }
                            className="h-6 text-[10px] py-0 px-1 bg-transparent border-none"
                          >
                            <option value="Fikir">💡 Fikir</option>
                            <option value="Planlama">📐 Planlama</option>
                            <option value="Geliştirmede">🚧 Geliştirmede</option>
                            <option value="Canlı">✅ Canlı</option>
                            <option value="Arşiv">⏸️ Arşiv</option>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}

                {colProjects.length === 0 && (
                  <div className="h-32 flex items-center justify-center text-[11px] text-muted-foreground/60">
                    Proje yok
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Proje Başlat"
        description="Fikirlerinizi ve geliştirme hedeflerinizi portföyünüze ekleyin."
      >
        <form onSubmit={handleAddProject} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Proje Adı</label>
            <Input
              required
              placeholder="Örn: Watchpath, PusulaOS, KadroPlan"
              value={projectForm.name}
              onChange={(e) => {
                const newName = e.target.value
                const oldSlug = slugify(projectForm.name)
                const currentSlug = projectForm.slug
                setProjectForm((prev) => ({
                  ...prev,
                  name: newName,
                  slug: currentSlug === '' || currentSlug === oldSlug ? slugify(newName) : prev.slug,
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
                placeholder="watchpath"
                prefix="/"
                value={projectForm.slug}
                onChange={(e) => setProjectForm({ ...projectForm, slug: slugify(e.target.value) })}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Link: /projects/{slugify(projectForm.slug || projectForm.name || 'slug')}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Başlangıç Durumu</label>
              <Select
                value={projectForm.status}
                onChange={(e) =>
                  setProjectForm({
                    ...projectForm,
                    status: e.target.value as Project['status'],
                  })
                }
                className="text-xs"
              >
                <option value="Planlama">📐 Planlama</option>
                <option value="Geliştirmede">🚧 Geliştirmede</option>
                <option value="Fikir">💡 Fikir</option>
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
              value={projectForm.budget_limit}
              onChange={(e) => setProjectForm({ ...projectForm, budget_limit: e.target.value })}
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Açıklama</label>
            <Textarea
              placeholder="Projenin temel amacı, hedef kitlesi ve değeri..."
              value={projectForm.description}
              onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
              className="text-xs min-h-[70px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Açılıyor...' : 'Projeyi Aç'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Projeler yükleniyor...
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  )
}
