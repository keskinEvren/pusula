'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FolderKanban,
  CalendarClock,
  Github,
  Globe,
  AlertTriangle,
  FileText,
  Settings,
  ExternalLink,
  Rocket,
  Briefcase,
  Building2,
  Clock,
  CalendarCheck,
  Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, slugify } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { MarkdownEditor } from '@/components/markdown'
import { useToast } from '@/lib/toast-context'
import { formatMinutesHours } from '@/lib/timer-context'
import type { Project, AgendaItem } from '@/types/database'

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
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)

  const [submitting, setSubmitting] = useState(false)

  // Project Edit Modal State
  const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState({
    name: '',
    slug: '',
    project_type: 'saas' as NonNullable<Project['project_type']>,
    status: 'Planlama' as Project['status'],
    budget_limit: '',
    repo_url: '',
    live_url: '',
  })

  // Delete State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)

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

        const { data: agendaData } = await supabase
          .from('agenda_items')
          .select('*')
          .eq('project_id', pData.id)
          .order('plan_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

        if (agendaData && agendaData.length > 0) {
          setAgendaItems(agendaData)
        } else {
          try {
            const cached = localStorage.getItem('pusula_local_agenda_items')
            if (cached) {
              const allItems: any[] = JSON.parse(cached)
              const matched = allItems
                .filter((i: any) => i.project_id === pData.id)
                .sort((a: any, b: any) => {
                  if (a.plan_date && b.plan_date) {
                    return b.plan_date.localeCompare(a.plan_date)
                  }
                  if (a.plan_date) return -1
                  if (b.plan_date) return 1
                  return (b.created_at || '').localeCompare(a.created_at || '')
                })
              setAgendaItems(matched)
            }
          } catch {}
        }
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

  const handleOpenProjectEdit = () => {
    if (!project) return
    const pType = (project.project_type ||
      ((project.slug + ' ' + project.name).toLowerCase().includes('sarioglu') ? 'client' : 'saas')) as NonNullable<Project['project_type']>

    setProjectEditForm({
      name: project.name,
      slug: project.slug,
      project_type: pType,
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
          project_type: projectEditForm.project_type,
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

  const handleDeleteProject = async () => {
    if (!project) return
    setDeletingProject(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('projects').delete().eq('id', project.id)
      if (error) throw error

      if (typeof window !== 'undefined') {
        localStorage.removeItem(`pusula_project_doc_${slug}`)
      }

      toast.success(`"${project.name}" projesi başarıyla silindi.`)
      setIsDeleteConfirmOpen(false)
      setIsProjectEditModalOpen(false)
      router.push('/projects')
    } catch (err: any) {
      toast.error(err?.message || 'Proje silinirken bir hata oluştu.')
    } finally {
      setDeletingProject(false)
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



  // Timeline calculation
  const diffDays = Math.max(1, Math.ceil(Math.abs(Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24)))
  const timelineStr = diffDays < 30 ? `${diffDays} gündür aktif` : `${Math.floor(diffDays / 30)} ay ${diffDays % 30 > 0 ? `${diffDays % 30} gün` : ''}`

  // Tracked focus time from Agenda
  const totalTrackedSeconds = agendaItems.reduce((acc, item) => acc + (item.duration_seconds || 0), 0)

  return (
    <div className="space-y-8">
      {/* Project Header */}
      <PageHeader
        title={project.name}
        backHref="/projects"
        backLabel="Projeler Panosuna Dön"
        badge={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={
                project.status === 'Canlı'
                  ? 'success'
                  : project.status === 'Geliştirmede'
                  ? 'primary'
                  : 'outline'
              }
              className="text-xs"
            >
              {project.status}
            </Badge>
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium ${
                project.project_type === 'saas'
                  ? 'text-primary border-primary/25 bg-primary/10'
                  : project.project_type === 'internal'
                  ? 'text-muted-foreground border-border/60 bg-muted/30'
                  : 'text-foreground/90 border-border bg-muted/40'
              }`}
            >
              {project.project_type === 'workplace' ? (
                <>
                  <Building2 className="h-3 w-3" />
                  <span>Çalıştığım Firma / İşyeri</span>
                </>
              ) : (project.project_type === 'client' || project.slug.includes('sarioglu')) ? (
                <>
                  <Briefcase className="h-3 w-3" />
                  <span>Müşteri İşi</span>
                </>
              ) : project.project_type === 'internal' ? (
                <span>Dahili Araç</span>
              ) : (
                <>
                  <Rocket className="h-3 w-3" />
                  <span>Kendi Ürünüm (SaaS)</span>
                </>
              )}
            </span>
            <span
              className="text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50"
              title={`URL: /projects/${project.slug}`}
            >
              /{project.slug}
            </span>
            <span
              className="text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50 flex items-center gap-1"
              title={`Başlangıç: ${formatDate(project.created_at)}`}
            >
              <CalendarClock className="h-3 w-3 text-primary" />
              {formatDate(project.created_at)} ({timelineStr})
            </span>
          </div>
        }
        description="Proje genel bakışı, çalışma eforu ve teknik şartname dokümantasyonu"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleOpenProjectEdit}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs min-h-[36px]"
            >
              <Settings className="h-3.5 w-3.5" />
              Projeyi Düzenle
            </Button>
            <Button
              onClick={() => setIsDeleteConfirmOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs min-h-[36px] text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              title="Projeyi Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Projeyi Sil</span>
            </Button>
            {project.repo_url && (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub deposunu yeni sekmede aç"
              >
                <Button variant="outline" size="sm" className="gap-2 text-xs min-h-[36px]">
                  <Github className="h-4 w-4" /> GitHub
                </Button>
              </a>
            )}
            {project.live_url && (
              <a
                href={project.live_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Canlı siteyi yeni sekmede aç"
              >
                <Button variant="outline" size="sm" className="gap-2 text-xs min-h-[36px]">
                  <Globe className="h-4 w-4" /> Canlı Site
                </Button>
              </a>
            )}
          </div>
        }
      />

      {/* Project Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Aktif Çalışma Süresi
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatMinutesHours(totalTrackedSeconds)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {agendaItems.filter((i) => i.status === 'completed').length} tamamlanan odak seansı
          </p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Hedef Bütçe Sınırı
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {project.budget_limit && project.budget_limit > 0
              ? formatCurrency(project.budget_limit)
              : 'Belirtilmedi'}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {project.budget_limit ? 'Tavan bütçe beyanı' : 'Serbest bütçe'}
          </p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Zaman Çizelgesi
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {timelineStr}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Başlangıç: {formatDate(project.created_at)}
          </p>
        </div>
      </div>

      {/* Work Effort & Focus Sessions Card */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span>Çalışma Eforu & Odak Seansları ({agendaItems.length})</span>
            </CardTitle>
            <CardDescription>
              Ajanda üzerinden bu projeye bağlanan canlı çalışma süreleri ve seans kayıtları
            </CardDescription>
          </div>
          <Link href="/agenda">
            <Button size="sm" variant="outline" className="min-h-[32px] text-xs gap-1.5 border-primary/25 text-primary hover:bg-primary/10">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span>Ajandada Aç</span>
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <div className="text-xs text-muted-foreground">Toplam Harcanan Süre</div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {formatMinutesHours(totalTrackedSeconds)}
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <div className="text-xs text-muted-foreground">Tamamlanan Seans</div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {agendaItems.filter((i) => i.status === 'completed').length} adet
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 border border-border/40">
              <div className="text-xs text-muted-foreground">Son Odak Tarihi</div>
              <div className="text-sm font-semibold text-foreground mt-1.5">
                {(() => {
                  const lastDated = agendaItems.find((i) => Boolean(i.plan_date))
                  if (lastDated && lastDated.plan_date) {
                    return formatDate(lastDated.plan_date)
                  }
                  if (agendaItems.length > 0) {
                    return 'Tarihsiz (Havuz)'
                  }
                  return 'Kayıt Yok'
                })()}
              </div>
            </div>
          </div>

          {/* Recent sessions list */}
          {agendaItems.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-semibold text-foreground">Son Seanslar</div>
              <div className="divide-y divide-border/40 rounded-lg border border-border/40 overflow-hidden bg-card/40">
                {agendaItems.slice(0, 5).map((session) => (
                  <div key={session.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          session.status === 'completed' ? 'bg-emerald-500' : 'bg-primary'
                        }`}
                      />
                      <span className="font-medium text-foreground truncate max-w-[240px] sm:max-w-md">
                        {session.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-muted-foreground">
                      <span>{session.plan_date ? formatDate(session.plan_date) : 'Tarihsiz'}</span>
                      {session.duration_seconds > 0 && (
                        <Badge variant="primary" className="text-[10px] px-1.5 py-0 font-mono">
                          {formatMinutesHours(session.duration_seconds)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground/70 italic border border-dashed border-border/50 rounded-lg">
              Bu proje için henüz Ajanda üzerinden çalışma seansı kaydedilmedi.
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
            defaultMode="preview"
            className="border-0 rounded-none shadow-none"
          />
        </CardContent>
      </Card>



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
              <label htmlFor="proj-edit-name" className="text-xs font-semibold text-muted-foreground">Proje Adı</label>
              <Input
                id="proj-edit-name"
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="proj-edit-slug" className="text-xs font-semibold text-muted-foreground">URL Slug</label>
                <Input
                  id="proj-edit-slug"
                  required
                  placeholder="proje-adi"
                  prefix="/"
                  value={projectEditForm.slug}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, slug: slugify(e.target.value) })}
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Link: /projects/{slugify(projectEditForm.slug || projectEditForm.name || 'slug')}
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="proj-edit-type" className="text-xs font-semibold text-muted-foreground">Proje Türü</label>
                <Select
                  id="proj-edit-type"
                  value={projectEditForm.project_type}
                  onChange={(e) =>
                    setProjectEditForm({
                      ...projectEditForm,
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
                <label htmlFor="proj-edit-status" className="text-xs font-semibold text-muted-foreground">Proje Durumu</label>
                <Select
                  id="proj-edit-status"
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
                  <option value="Arşiv">📦 Arşiv</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="proj-edit-budget" className="text-xs font-semibold text-muted-foreground">
                Bütçe Tavanı (Opsiyonel)
              </label>
              <Input
                id="proj-edit-budget"
                type="number"
                step="0.01"
                placeholder="20000.00"
                prefix="₺"
                value={projectEditForm.budget_limit}
                onChange={(e) => setProjectEditForm({ ...projectEditForm, budget_limit: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="proj-edit-repo" className="text-xs font-semibold text-muted-foreground">GitHub Repo URL</label>
                <Input
                  id="proj-edit-repo"
                  type="url"
                  placeholder="https://github.com/..."
                  value={projectEditForm.repo_url}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, repo_url: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="proj-edit-live" className="text-xs font-semibold text-muted-foreground">Canlı Site URL</label>
                <Input
                  id="proj-edit-live"
                  type="url"
                  placeholder="https://..."
                  value={projectEditForm.live_url}
                  onChange={(e) => setProjectEditForm({ ...projectEditForm, live_url: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="gap-1.5 text-xs min-h-[36px]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Projeyi Sil</span>
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setIsProjectEditModalOpen(false)}>
                  İptal
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Project Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteProject}
        title="Projeyi Sil"
        description={
          <span>
            <strong>&quot;{project.name}&quot;</strong> projesini kalıcı olarak silmek istediğinizden emin misiniz?
            <br /><br />
            Projeye ait geçmiş harcamalar, abonelikler ve ajanda kayıtları korunur, yalnızca proje bağlantıları kaldırılır.
          </span>
        }
        confirmLabel="Projeyi Sil"
        variant="destructive"
        isLoading={deletingProject}
      />
    </div>
  )
}
