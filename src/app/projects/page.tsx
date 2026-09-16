'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  DollarSign,
  Globe,
  Github,
  Target,
  Layers,
  Search,
  Briefcase,
  Rocket,
  Wrench,
  Building2,
  Archive,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, slugify } from '@/lib/utils'
import { calculateProjectTotalCost, evaluateProjectBudget } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import type { Project, Transaction, Subscription } from '@/types/database'

type ProjectTypeCategory = 'all' | 'saas' | 'workplace' | 'client' | 'internal'

const TYPE_CONFIG: Record<
  NonNullable<Project['project_type']>,
  { label: string; icon: typeof Rocket; badgeVariant: 'outline' | 'default' | 'success' | 'destructive' | 'muted' | 'primary'; color: string }
> = {
  saas: {
    label: 'Kendi Girişimim / SaaS',
    icon: Rocket,
    badgeVariant: 'outline',
    color: 'text-primary border-primary/25 bg-primary/10',
  },
  workplace: {
    label: 'Çalıştığım Firma / İşyerim',
    icon: Building2,
    badgeVariant: 'outline',
    color: 'text-foreground/90 border-border bg-muted/40',
  },
  client: {
    label: 'Müşteri / Kurumsal Web',
    icon: Briefcase,
    badgeVariant: 'outline',
    color: 'text-foreground/90 border-border bg-muted/40',
  },
  internal: {
    label: 'Dahili Araç / Altyapı',
    icon: Wrench,
    badgeVariant: 'muted',
    color: 'text-muted-foreground border-border/60 bg-muted/30',
  },
}

function getProjectType(project: Project): NonNullable<Project['project_type']> {
  if (project.project_type && TYPE_CONFIG[project.project_type]) {
    return project.project_type
  }
  // Auto-detect client projects if not explicitly set
  const lower = (project.slug + ' ' + project.name).toLowerCase()
  if (lower.includes('sarioglu') || lower.includes('sarıoğlu') || lower.includes('emlak')) {
    return 'client'
  }
  return 'saas'
}

function cleanProjectDescription(text: string | null | undefined): string {
  if (!text) return ''
  return text
    // 1. Remove HTML tags completely like <div ...>, <img ... />, <h1>, etc.
    .replace(/<[^>]*>/gi, ' ')
    // 2. Remove markdown images ![alt](url)
    .replace(/!\[.*?\]\(.*?\)/g, ' ')
    // 3. Remove markdown links [text](url) -> keep text
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    // 4. Remove URLs
    .replace(/https?:\/\/\S+/gi, ' ')
    // 5. Remove markdown symbols (#, *, _, `, ~, >, |, -, =)
    .replace(/[#*_`~>|\-+=]/g, ' ')
    // 6. Normalize multiple spaces and newlines
    .replace(/\s+/g, ' ')
    .trim()
}

function ProjectsContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectCosts, setProjectCosts] = useState<Record<string, number>>({})
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [categoryTab, setCategoryTab] = useState<ProjectTypeCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [projectForm, setProjectForm] = useState({
    name: '',
    slug: '',
    description: '',
    project_type: 'saas' as NonNullable<Project['project_type']>,
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
      const [{ data: pData }, { data: costsData }, { data: sData }] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.rpc('fn_all_projects_direct_costs'),
        supabase.from('subscriptions').select('*'),
      ])

      if (pData) setProjects(pData)
      if (costsData) setProjectCosts(costsData as Record<string, number>)
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
          project_type: projectForm.project_type,
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
          project_type: 'saas',
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
    const isTargetWorkbench = newStatus === 'Planlama' || newStatus === 'Geliştirmede'
    const currentlyOnWorkbench = projects.some(
      (p) => p.id === projectId && (p.status === 'Planlama' || p.status === 'Geliştirmede')
    )

    const activeCount = projects.filter(
      (p) => p.status === 'Planlama' || p.status === 'Geliştirmede'
    ).length

    if (isTargetWorkbench && !currentlyOnWorkbench && activeCount >= 2) {
      toast.error(
        'Tezgâh kapasitesi dolu (maksimum 2 proje). Lütfen önce tezgâhtaki bir projeyi Canlıya alın veya Arşivleyin.'
      )
      return
    }

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

  // Active Dev Projects on Workbench (Planlama or Geliştirmede)
  const workbenchProjects = useMemo(() => {
    return projects.filter(
      (p) => p.status === 'Planlama' || p.status === 'Geliştirmede'
    )
  }, [projects])

  const isCapacityFull = workbenchProjects.length >= 2

  // Category counts
  const categoryCounts = useMemo(() => {
    const saas = projects.filter((p) => getProjectType(p) === 'saas').length
    const workplace = projects.filter((p) => getProjectType(p) === 'workplace').length
    const client = projects.filter((p) => getProjectType(p) === 'client').length
    const internal = projects.filter((p) => getProjectType(p) === 'internal').length
    return { all: projects.length, saas, workplace, client, internal }
  }, [projects])

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    return projects.filter((project) => {
      // Category filter
      const pType = getProjectType(project)
      if (categoryTab !== 'all' && pType !== categoryTab) {
        return false
      }

      // Status filter
      if (statusFilter !== 'all' && project.status !== statusFilter) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = project.name.toLowerCase().includes(query)
        const matchSlug = project.slug.toLowerCase().includes(query)
        const matchDesc = (project.description || '').toLowerCase().includes(query)
        if (!matchName && !matchSlug && !matchDesc) return false
      }

      return true
    })
  }, [projects, categoryTab, statusFilter, searchQuery])

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Projeler yükleniyor">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted/60 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-card border border-border p-4" />
          <div className="h-64 rounded-xl bg-card border border-border p-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Top Bar with PageHeader */}
      <PageHeader
        title="Proje Kokpiti & Portföy"
        description="Aktif tezgâhtaki geliştirme odağınız ve iki kademeli ürün/müşteri portföy envanteriniz"
        actions={
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-sm min-h-[36px]">
            <Plus className="h-4 w-4" />
            Yeni Proje Başlat
          </Button>
        }
      />

      {/* ========================================================================= */}
      {/* 🎯 SECTION 1: AKTİF TEZGÂH (ACTIVE WORKBENCH)                              */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Aktif Tezgâh (Çalışma Masası)
            </h2>
            <Badge
              variant={workbenchProjects.length >= 2 ? 'outline' : 'primary'}
              className={`text-[11px] font-mono px-2 py-0.5 ${
                workbenchProjects.length >= 2
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10 font-semibold'
                  : 'bg-primary/20 text-primary'
              }`}
            >
              {workbenchProjects.length}/2 {workbenchProjects.length >= 2 ? 'Kapasite Dolu' : 'Odak'}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {workbenchProjects.length >= 2
              ? 'Kişisel odak prensibi: Aynı anda en fazla 2 proje tezgâhta aktif olabilir.'
              : 'Şu an üzerinde aktif olarak çalıştığınız projeler (Maks. 2 Odak)'}
          </span>
        </div>

        {/* Subtle Capacity Notice if full */}
        {isCapacityFull && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400" />
              <span>
                <strong>Tezgâh Kapasitesi Dolu (2/2):</strong> Yeni bir projeye odaklanmak için mevcut projelerden birini <strong>Canlı</strong> veya <strong>Arşiv</strong> durumuna alın.
              </span>
            </div>
          </div>
        )}

        {workbenchProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workbenchProjects.map((project) => {
              const totalCost = calculateProjectTotalCost(
                project.id,
                [{ project_id: project.id, amount: Number(projectCosts[project.id] || 0) }],
                subscriptions
              )
              const budgetEvaluation = evaluateProjectBudget(
                totalCost,
                project.budget_limit
              )
              const typeConfig = TYPE_CONFIG[getProjectType(project)]
              const TypeIcon = typeConfig.icon
              const cleanDesc = cleanProjectDescription(project.description)

              return (
                <Card
                  key={project.id}
                  className="border-border bg-gradient-to-br from-card via-card to-muted/20 shadow-md hover:border-primary/50 transition-all flex flex-col justify-between h-full"
                >
                  <CardHeader className="p-4 pb-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <Link
                            href={`/projects/${project.slug}`}
                            className="font-bold text-lg text-foreground hover:text-primary transition-colors truncate group flex items-center gap-1.5"
                          >
                            <span>{project.name}</span>
                            <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                          </Link>
                          <span className="text-xs font-mono text-muted-foreground shrink-0">
                            /{project.slug}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge
                            variant={project.status === 'Geliştirmede' ? 'primary' : 'outline'}
                            className="text-[11px] px-2 py-0.5"
                          >
                            {project.status === 'Geliştirmede' ? '🚧 Geliştirmede' : '📐 Planlama'}
                          </Badge>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium ${typeConfig.color}`}
                          >
                            <TypeIcon className="h-3 w-3" />
                            <span>{typeConfig.label.split('/')[0].trim()}</span>
                          </span>
                        </div>
                      </div>

                      {/* Quick Shift Status */}
                      <div className="shrink-0">
                        <Select
                          id={`workbench-status-${project.id}`}
                          aria-label={`${project.name} durumunu değiştir`}
                          value={project.status}
                          onChange={(e) =>
                            handleStatusChange(
                              project.id,
                              e.target.value as Project['status']
                            )
                          }
                          className="h-8 text-xs py-0 px-2 bg-muted/60 border border-border/50 rounded w-36"
                        >
                          <option value="Geliştirmede">🚧 Geliştirmede</option>
                          <option value="Planlama">📐 Planlama</option>
                          <option value="Canlı">✅ Canlıya Al</option>
                          <option value="Arşiv">⏸️ Arşivle</option>
                        </Select>
                      </div>
                    </div>

                    {cleanDesc ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {cleanDesc}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 italic">
                        Şartname veya açıklama girilmedi.
                      </p>
                    )}

                    {/* Links */}
                    {(project.live_url || project.repo_url) && (
                      <div className="flex items-center gap-3 pt-0.5">
                        {project.live_url && (
                          <a
                            href={project.live_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                            title={project.live_url}
                          >
                            <Globe className="h-3.5 w-3.5" />
                            <span>Canlı Site</span>
                          </a>
                        )}
                        {project.repo_url && (
                          <a
                            href={project.repo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            title="GitHub Deposu"
                          >
                            <Github className="h-3.5 w-3.5" />
                            <span>GitHub</span>
                          </a>
                        )}
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 pt-0 space-y-3 border-t border-border/40 mt-auto flex flex-col justify-end">
                    {/* Budget & Cost Progress */}
                    {project.budget_limit || totalCost > 0 ? (
                      <div className="rounded-lg bg-muted/40 p-2.5 text-xs border border-border/40 space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Gerçek Maliyet:</span>
                          <span className="font-mono font-bold text-foreground">
                            {formatCurrency(totalCost)}
                          </span>
                        </div>

                        {project.budget_limit && (
                          <>
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>Bütçe Tavanı:</span>
                              <span className="font-mono">{formatCurrency(project.budget_limit)}</span>
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
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/20 p-2.5 text-xs border border-border/20 flex items-center justify-between text-muted-foreground">
                        <span>Bütçe & Harcama:</span>
                        <span className="font-mono text-xs text-muted-foreground/70">Kayıtlı maliyet yok</span>
                      </div>
                    )}

                    {/* Action Button to Detail */}
                    <div className="flex items-center justify-end pt-1">
                      <Link href={`/projects/${project.slug}`} className="w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto gap-1.5 text-xs min-h-[32px] border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <span>Gözlem & Şartnameyi Aç</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center space-y-2">
            <Sparkles className="h-6 w-6 text-muted-foreground mx-auto" />
            <div className="text-sm font-semibold text-foreground">Tezgâhınız Şu Anda Boş</div>
            <div className="text-xs text-muted-foreground max-w-md mx-auto">
              Aşağıdaki portföy envanterinden bir projeyi <strong>"Geliştirmede"</strong> veya <strong>"Planlama"</strong> durumuna getirerek tezgâha alabilir veya yeni bir proje başlatabilirsiniz.
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 📂 SECTION 2: İKİ KADEMELİ PORTFÖY ENVANTERİ (TWO-TIER INVENTORY TABLE)    */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-border">
        {/* Category Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-1.5 border-b border-border pb-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategoryTab('all')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap min-h-[32px] ${
                categoryTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Tüm Portföy</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${categoryTab === 'all' ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                {categoryCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryTab('saas')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap min-h-[32px] ${
                categoryTab === 'saas'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Rocket className={`h-3.5 w-3.5 ${categoryTab === 'saas' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              <span>Kendi Girişimlerim & SaaS</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${categoryTab === 'saas' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {categoryCounts.saas}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryTab('workplace')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap min-h-[32px] ${
                categoryTab === 'workplace'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Building2 className={`h-3.5 w-3.5 ${categoryTab === 'workplace' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              <span>Çalıştığım Firma / İşyerim</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${categoryTab === 'workplace' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {categoryCounts.workplace}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryTab('client')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap min-h-[32px] ${
                categoryTab === 'client'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Briefcase className={`h-3.5 w-3.5 ${categoryTab === 'client' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              <span>Müşteri & Kurumsal Siteler</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${categoryTab === 'client' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {categoryCounts.client}
              </span>
            </button>
          </div>

          {/* Search & Status Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Proje ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <Select
              id="inventory-status-filter"
              aria-label="Durum Filtresi"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 text-xs w-32"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="Canlı">✅ Canlı</option>
              <option value="Geliştirmede">🚧 Geliştirmede</option>
              <option value="Planlama">📐 Planlama</option>
              <option value="Arşiv">⏸️ Arşiv</option>
            </Select>
          </div>
        </div>

        {/* Inventory Compact Table Card */}
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {/* Mobile Card Rows */}
            <div className="md:hidden divide-y divide-border/50">
              {filteredInventory.map((project) => {
                const totalCost = calculateProjectTotalCost(
                  project.id,
                  [{ project_id: project.id, amount: Number(projectCosts[project.id] || 0) }],
                  subscriptions
                )
                const typeConfig = TYPE_CONFIG[getProjectType(project)]
                const TypeIcon = typeConfig.icon

                return (
                  <div key={project.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/projects/${project.slug}`}
                          className="font-bold text-sm text-foreground hover:text-primary transition-colors line-clamp-1"
                        >
                          {project.name}
                        </Link>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          /{project.slug}
                        </span>
                      </div>
                      <Select
                        id={`mob-status-${project.id}`}
                        aria-label={`${project.name} durumunu değiştir`}
                        value={project.status}
                        onChange={(e) =>
                          handleStatusChange(project.id, e.target.value as Project['status'])
                        }
                        className="h-7 text-[11px] py-0 px-1.5 w-28 shrink-0 bg-muted/40 border border-border/50 rounded"
                      >
                        <option value="Planlama">Planlama</option>
                        <option value="Geliştirmede">Geliştirmede</option>
                        <option value="Canlı">Canlı</option>
                        <option value="Arşiv">Arşiv</option>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3" />
                        <span>{typeConfig.label.split('/')[0].trim()}</span>
                      </span>

                      <div className="flex items-center gap-2">
                        {project.live_url && (
                          <a
                            href={project.live_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1 text-xs"
                          >
                            <Globe className="h-3 w-3" /> Canlı
                          </a>
                        )}
                        <Link href={`/projects/${project.slug}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
                            Detay ↗
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredInventory.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Filtreye uygun proje bulunamadı.
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs" aria-label="Portföy Envanteri">
                <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3">Proje</th>
                    <th scope="col" className="p-3">Tür / Kategori</th>
                    <th scope="col" className="p-3">Durum</th>
                    <th scope="col" className="p-3">Maliyet / Bütçe</th>
                    <th scope="col" className="p-3">Bağlantılar</th>
                    <th scope="col" className="p-3 text-right">Aksiyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredInventory.map((project) => {
                    const totalCost = calculateProjectTotalCost(
                      project.id,
                      [{ project_id: project.id, amount: Number(projectCosts[project.id] || 0) }],
                      subscriptions
                    )
                    const typeConfig = TYPE_CONFIG[getProjectType(project)]
                    const TypeIcon = typeConfig.icon
                    const isWorkbench = project.status === 'Planlama' || project.status === 'Geliştirmede'

                    return (
                      <tr key={project.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Link
                            href={`/projects/${project.slug}`}
                            className="font-bold text-foreground hover:text-primary transition-colors"
                          >
                            {project.name}
                          </Link>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            /{project.slug}
                          </div>
                        </td>

                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border ${typeConfig.color}`}
                          >
                            <TypeIcon className="h-3 w-3" />
                            <span>{typeConfig.label.split('/')[0].trim()}</span>
                          </span>
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Select
                              id={`desk-status-${project.id}`}
                              aria-label={`${project.name} durumunu değiştir`}
                              value={project.status}
                              onChange={(e) =>
                                handleStatusChange(project.id, e.target.value as Project['status'])
                              }
                              className="h-7 text-xs py-0 px-2 bg-muted/40 border border-border/50 rounded w-32 shrink-0"
                            >
                              <option value="Planlama">📐 Planlama</option>
                              <option value="Geliştirmede">🚧 Geliştirmede</option>
                              <option value="Canlı">✅ Canlı</option>
                              <option value="Arşiv">⏸️ Arşiv</option>
                            </Select>
                            {isWorkbench && (
                              <Badge
                                variant="primary"
                                className="text-[10px] px-1.5 py-0 shrink-0 font-medium whitespace-nowrap"
                                title="Aktif tezgâhta yer alıyor"
                              >
                                Tezgâhta
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="p-3 font-mono">
                          {totalCost > 0 && project.budget_limit ? (
                            <div>
                              <span className="font-bold text-foreground">{formatCurrency(totalCost)}</span>
                              <span className="text-muted-foreground text-[11px] block sm:inline"> / {formatCurrency(project.budget_limit)}</span>
                            </div>
                          ) : totalCost > 0 ? (
                            <span className="font-bold text-foreground">{formatCurrency(totalCost)}</span>
                          ) : project.budget_limit && project.budget_limit > 0 ? (
                            <div>
                              <span className="text-muted-foreground text-[11px]">Bütçe: </span>
                              <span className="font-semibold text-foreground">{formatCurrency(project.budget_limit)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2 text-xs">
                            {project.live_url ? (
                              <a
                                href={project.live_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                                title={project.live_url}
                              >
                                <Globe className="h-3.5 w-3.5" />
                                <span>Canlı Site</span>
                              </a>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )}
                            {project.repo_url && (
                              <a
                                href={project.repo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                title="GitHub"
                              >
                                <Github className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="p-3 text-right">
                          <Link href={`/projects/${project.slug}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2.5 border-border hover:border-primary/50"
                            >
                              Gözlemle ↗
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}

                  {filteredInventory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-muted-foreground">
                        Filtreye uygun proje bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Proje Başlat"
        description="Fikirlerinizi, ürün hedeflerinizi veya müşteri işlerinizi portföyünüze ekleyin."
      >
        <form onSubmit={handleAddProject} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="prj-modal-name" className="text-xs font-semibold text-muted-foreground">Proje Adı</label>
            <Input
              id="prj-modal-name"
              required
              placeholder="Örn: Watchpath, Sarıoğlu Grup, KadroPlan"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label htmlFor="prj-modal-slug" className="text-xs font-semibold text-muted-foreground">URL Slug</label>
              <Input
                id="prj-modal-slug"
                required
                placeholder="watchpath"
                prefix="/"
                value={projectForm.slug}
                onChange={(e) => setProjectForm({ ...projectForm, slug: slugify(e.target.value) })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="prj-modal-type" className="text-xs font-semibold text-muted-foreground">Proje Türü</label>
              <Select
                id="prj-modal-type"
                value={projectForm.project_type}
                onChange={(e) =>
                  setProjectForm({
                    ...projectForm,
                    project_type: e.target.value as NonNullable<Project['project_type']>,
                  })
                }
                className="text-xs"
              >
                <option value="saas">🚀 Kendi Girişimim / SaaS</option>
                <option value="workplace">🏢 Çalıştığım Firma / İşyerim</option>
                <option value="client">💼 Müşteri / Kurumsal Web</option>
                <option value="internal">🛠️ Dahili Araç / Altyapı</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="prj-modal-status" className="text-xs font-semibold text-muted-foreground">Başlangıç Durumu</label>
              <Select
                id="prj-modal-status"
                value={projectForm.status}
                onChange={(e) =>
                  setProjectForm({
                    ...projectForm,
                    status: e.target.value as Project['status'],
                  })
                }
                className="text-xs"
              >
                <option value="Planlama">📐 Planlama (Tezgâhta)</option>
                <option value="Geliştirmede">🚧 Geliştirmede (Tezgâhta)</option>
                <option value="Canlı">✅ Canlı / Teslim Edildi</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="prj-modal-budget" className="text-xs font-semibold text-muted-foreground">
                Bütçe Tavanı (Opsiyonel)
              </label>
              <Input
                id="prj-modal-budget"
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
              <label htmlFor="prj-modal-live" className="text-xs font-semibold text-muted-foreground">Canlı Site URL (Opsiyonel)</label>
              <Input
                id="prj-modal-live"
                type="url"
                placeholder="https://..."
                value={projectForm.live_url}
                onChange={(e) => setProjectForm({ ...projectForm, live_url: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="prj-modal-desc" className="text-xs font-semibold text-muted-foreground">Açıklama</label>
            <Textarea
              id="prj-modal-desc"
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
