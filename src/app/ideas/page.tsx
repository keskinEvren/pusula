'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Lightbulb,
  Plus,
  ArrowRight,
  ArrowUpRight,
  FolderPlus,
  Trash2,
  Tag,
  CheckCircle2,
  FileText,
  Edit3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { MarkdownEditor } from '@/components/markdown'
import { slugify } from '@/lib/utils'
import { useToast } from '@/lib/toast-context'
import type { Idea } from '@/types/database'

const TABS = [
  { key: 'inbox', label: 'Gelenler' },
  { key: 'maybe', label: 'Değerlendirilecekler' },
  { key: 'decided', label: 'Karar Verildi' },
  { key: 'promoted', label: 'Projeye Dönüşenler' },
  { key: 'killed', label: 'Arşiv' },
]

function IdeasContent() {
  const router = useRouter()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [activeTab, setActiveTab] = useState<string>('inbox')
  const [loading, setLoading] = useState(true)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ideaForm, setIdeaForm] = useState({
    title: '',
    description: '',
    status: 'inbox' as Idea['status'],
    tags: '',
    score: '',
  })

  // Idea Detail & Edit Modal State
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null)
  const [updatingIdea, setUpdatingIdea] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: 'inbox' as Idea['status'],
    tags: '',
    score: '',
  })

  // Promote Modal State
  const [promoteTarget, setPromoteTarget] = useState<Idea | null>(null)
  const [promoteSlug, setPromoteSlug] = useState('')
  const [promoteBudget, setPromoteBudget] = useState('10000')
  const [promoting, setPromoting] = useState(false)

  // Dialog States
  const [ideaToDelete, setIdeaToDelete] = useState<{ id: string; title: string } | null>(null)
  const [capacityWarningTarget, setCapacityWarningTarget] = useState<Idea | null>(null)

  useEffect(() => {
    loadIdeas()
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsModalOpen(true)
    }
  }, [searchParams])

  async function loadIdeas() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data) setIdeas(data)
    } catch (err) {
      console.error('Error loading ideas:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const tagsArray = ideaForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const { data, error } = await supabase
        .from('ideas')
        .insert({
          user_id: user.id,
          title: ideaForm.title,
          description: ideaForm.description,
          status: ideaForm.status,
          tags: tagsArray,
          score: ideaForm.score ? parseFloat(ideaForm.score) : null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setIdeas([data, ...ideas])
        setIsModalOpen(false)
        toast.success('Yeni fikir başarıyla kaydedildi!')
        setIdeaForm({
          title: '',
          description: '',
          status: 'inbox',
          tags: '',
          score: '',
        })
      }
    } catch (err: any) {
      toast.error(err.message || 'Fikir eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenIdeaDetail = (idea: Idea) => {
    setSelectedIdea(idea)
    setEditForm({
      title: idea.title,
      description: idea.description || '',
      status: idea.status,
      tags: (idea.tags || []).join(', '),
      score: idea.score !== null && idea.score !== undefined ? String(idea.score) : '',
    })
  }

  const handleSaveIdeaDetail = async () => {
    if (!selectedIdea) return
    setUpdatingIdea(true)
    try {
      const supabase = createClient()
      const tagsArray = editForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const { data, error } = await supabase
        .from('ideas')
        .update({
          title: editForm.title,
          description: editForm.description,
          status: editForm.status,
          tags: tagsArray,
          score: editForm.score ? parseFloat(editForm.score) : null,
        })
        .eq('id', selectedIdea.id)
        .select()
        .single()

      if (error) throw error
      if (data) {
        setSelectedIdea(data)
        setIdeas((prev) => prev.map((i) => (i.id === data.id ? data : i)))
        toast.success('Fikir ve şartname başarıyla kaydedildi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi')
    } finally {
      setUpdatingIdea(false)
    }
  }

  const handleOpenPromoteModal = async (idea: Idea) => {
    const supabase = createClient()
    const { data: activeProjects } = await supabase
      .from('projects')
      .select('id, status')
      .not('status', 'in', '("Arşiv", "Canlı")')

    if (activeProjects && activeProjects.length >= 2) {
      setCapacityWarningTarget(idea)
      return
    }

    proceedWithPromote(idea)
  }

  const proceedWithPromote = (idea: Idea) => {
    setPromoteTarget(idea)
    setPromoteSlug(slugify(idea.title))
    setPromoteBudget('10000')
  }

  const handleExecutePromote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!promoteTarget) return

    setPromoting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const budgetNum = promoteBudget ? parseFloat(promoteBudget) : null
      const finalSlug = slugify(promoteSlug || promoteTarget.title) || 'proje-' + Date.now()

      const { data, error } = await supabase.rpc('fn_promote_idea_to_project_atomic', {
        p_user_id: user.id,
        p_idea_id: promoteTarget.id,
        p_slug: finalSlug,
        p_budget_limit: budgetNum || null,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Projeye dönüştürme doğrulanamadı.')

      setPromoteTarget(null)
      toast.success('Fikir başarıyla projeye dönüştürüldü!')
      router.push(`/projects/${finalSlug}`)
    } catch (err: any) {
      toast.error(err.message || 'Projeye dönüştürülemedi')
    } finally {
      setPromoting(false)
    }
  }

  const handleStatusChange = async (ideaId: string, status: Idea['status']) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('ideas').update({ status }).eq('id', ideaId)
      if (error) throw error
      setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, status } : i)))
      toast.success('Fikir durumu güncellendi!')
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi')
    }
  }

  const confirmDeleteIdea = async () => {
    if (!ideaToDelete) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('ideas').delete().eq('id', ideaToDelete.id)
      if (error) throw error
      setIdeas((prev) => prev.filter((i) => i.id !== ideaToDelete.id))
      toast.success('Fikir silindi.')
      setIdeaToDelete(null)
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    }
  }

  const filteredIdeas = ideas.filter((i) => i.status === activeTab)

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Fikirler yükleniyor">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-80 bg-muted/60 rounded" />
        </div>
        <div className="flex gap-2 pb-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 w-28 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-card border border-border p-4" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top PageHeader */}
      <PageHeader
        title="Fikirler"
        description="Yeni fikirlerinizi kaydedin, değerlendirin ve hayata geçirmek için projeye dönüştürün."
        actions={
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-sm text-xs min-h-[36px] font-semibold">
            <Plus className="h-4 w-4" />
            Yeni Fikir
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto" role="tablist" aria-label="Fikir durumları">
        {TABS.map((tab) => {
          const count = ideas.filter((i) => i.status === tab.key).length
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap min-h-[36px] ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Ideas Grid */}
      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {filteredIdeas.map((idea) => (
          <Card key={idea.id} className="border-border bg-card shadow-sm flex flex-col justify-between">
            <CardHeader
              className="pb-3 cursor-pointer hover:bg-muted/10 transition-colors rounded-t-xl group"
              onClick={() => handleOpenIdeaDetail(idea)}
            >
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary/70 shrink-0" />
                  <span>{idea.title}</span>
                </CardTitle>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIdeaToDelete({ id: idea.id, title: idea.title })}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`"${idea.title}" fikrini sil`}
                    title="Fikri Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {idea.description ? (
                <CardDescription className="text-xs line-clamp-3 mt-1 text-muted-foreground font-mono">
                  {idea.description}
                </CardDescription>
              ) : (
                <CardDescription className="text-xs text-muted-foreground/60 italic mt-1">
                  Şartname / not girilmedi. Tıklayarak ekleyin.
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {/* Score Badge */}
              {idea.score !== null && idea.score !== undefined && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Potansiyel:</span>
                  <span className={`text-xs font-bold font-mono ${
                    Number(idea.score) >= 7 ? 'text-success' : 
                    Number(idea.score) >= 4 ? 'text-amber-400' : 'text-muted-foreground'
                  }`}>
                    {idea.score}/10
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                    <div 
                      className={`h-full rounded-full ${
                        Number(idea.score) >= 7 ? 'bg-success' : 
                        Number(idea.score) >= 4 ? 'bg-amber-400' : 'bg-muted-foreground'
                      }`}
                      style={{ width: `${(Number(idea.score) / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tags */}
              {idea.tags && idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-[11px]">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-border gap-2">
                <label htmlFor={`idea-status-${idea.id}`} className="sr-only">
                  {idea.title} durumunu değiştir
                </label>
                <Select
                  id={`idea-status-${idea.id}`}
                  aria-label={`${idea.title} durumunu değiştir`}
                  value={idea.status}
                  onChange={(e) =>
                    handleStatusChange(idea.id, e.target.value as Idea['status'])
                  }
                  className="h-7 text-xs w-32"
                >
                  <option value="inbox">Gelenler</option>
                  <option value="maybe">Değerlendirilecek</option>
                  <option value="decided">Karar Verildi</option>
                  <option value="killed">Arşiv</option>
                  <option value="promoted">Projeye Dönüşen</option>
                </Select>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenIdeaDetail(idea)}
                    className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground min-h-[30px]"
                    title="Şartnameyi Aç & Düzenle"
                    aria-label={`"${idea.title}" fikrini incele ve şartnamesini aç`}
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>İncele</span>
                  </Button>

                  {idea.status !== 'promoted' ? (
                    <Button
                      size="sm"
                      onClick={() => handleOpenPromoteModal(idea)}
                      className="h-7 text-xs gap-1.5 shadow-sm px-2.5 min-h-[30px]"
                      aria-label={`"${idea.title}" fikrini projeye dönüştür`}
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      <span>Projeye</span>
                    </Button>
                  ) : (
                    <Link href="/projects">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 px-2 min-h-[30px]"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        <span>Projelerde</span>
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredIdeas.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-xs text-muted-foreground">
            Bu sekmede henüz fikir kaydı bulunmuyor.
          </div>
        )}
      </div>

      {/* Add Idea Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Fikir Not Et"
        description="Aklınıza gelen fikirleri, Markdown şartnamesi veya notlarıyla birlikte hızlıca kaydedin."
        size="2xl"
      >
        <form onSubmit={handleAddIdea} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="idea-add-title" className="text-xs font-semibold text-muted-foreground">Fikir Başlığı</label>
            <Input
              id="idea-add-title"
              required
              placeholder="Örn: AI Destekli Fatura Okuyucu"
              value={ideaForm.title}
              onChange={(e) => setIdeaForm({ ...ideaForm, title: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label htmlFor="idea-add-tags" className="text-xs font-semibold text-muted-foreground">Etiketler (Virgülle ayırın)</label>
              <Input
                id="idea-add-tags"
                placeholder="b2b, saas, mobile"
                value={ideaForm.tags}
                onChange={(e) => setIdeaForm({ ...ideaForm, tags: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="idea-add-score" className="text-xs font-semibold text-muted-foreground">Potansiyel Skoru (0-10)</label>
              <Input
                id="idea-add-score"
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="7.5"
                value={ideaForm.score}
                onChange={(e) => setIdeaForm({ ...ideaForm, score: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="idea-add-status" className="text-xs font-semibold text-muted-foreground">Klasör</label>
              <Select
                id="idea-add-status"
                value={ideaForm.status}
                onChange={(e) =>
                  setIdeaForm({ ...ideaForm, status: e.target.value as Idea['status'] })
                }
                className="text-xs"
              >
                <option value="inbox">Gelenler</option>
                <option value="maybe">Değerlendirilecek</option>
                <option value="decided">Karar Verildi</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Şartname & Notlar (Markdown)
            </label>
            <MarkdownEditor
              value={ideaForm.description}
              onChange={(val) => setIdeaForm({ ...ideaForm, description: val })}
              docName={ideaForm.title || 'fikir-notu'}
              title="Fikir Notları & Dokümantasyon"
              placeholder="Fikir neyi çözer? MVP hedefleri, teknik stack veya - [ ] checklist maddeleri..."
              minHeight="240px"
              defaultMode="write"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Fikri Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Idea Detail & Full Markdown Workspace Modal */}
      <Modal
        isOpen={!!selectedIdea}
        onClose={() => setSelectedIdea(null)}
        title={selectedIdea?.title || 'Fikir İncele'}
        description="Fikir detaylarını, teknik şartnamesini ve Markdown notlarını yönetin."
        size="2xl"
      >
        {selectedIdea && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="idea-edit-title" className="text-xs font-semibold text-muted-foreground">Başlık</label>
              <Input
                id="idea-edit-title"
                required
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="idea-edit-tags" className="text-xs font-semibold text-muted-foreground">Etiketler</label>
                <Input
                  id="idea-edit-tags"
                  value={editForm.tags}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="b2b, saas, ai"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="idea-edit-score" className="text-xs font-semibold text-muted-foreground">Potansiyel Skoru (0-10)</label>
                <Input
                  id="idea-edit-score"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  placeholder="7.5"
                  value={editForm.score}
                  onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="idea-edit-status" className="text-xs font-semibold text-muted-foreground">Durum</label>
                <Select
                  id="idea-edit-status"
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value as Idea['status'] })
                  }
                  className="text-xs"
                >
                  <option value="inbox">Gelenler</option>
                  <option value="maybe">Değerlendirilecek</option>
                  <option value="decided">Karar Verildi</option>
                  <option value="killed">Arşiv</option>
                  <option value="promoted">Projeye Dönüşen</option>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Dokümantasyon & Şartname (Markdown)
              </label>
              <MarkdownEditor
                value={editForm.description}
                onChange={(val) => setEditForm({ ...editForm, description: val })}
                onSave={handleSaveIdeaDetail}
                docName={editForm.title || 'fikir-sartname'}
                title={`${editForm.title || 'Fikir'} - Şartname & Notlar`}
                placeholder="Teknik mimari, kullanıcı senaryoları, API gereksinimleri..."
                minHeight="340px"
                defaultMode="split"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const target = selectedIdea
                  setSelectedIdea(null)
                  setIdeaToDelete({ id: target.id, title: target.title })
                }}
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Fikri Sil
              </Button>

              <div className="flex items-center gap-2">
                {selectedIdea.status !== 'promoted' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const target = selectedIdea
                      setSelectedIdea(null)
                      handleOpenPromoteModal(target)
                    }}
                    className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Projeye Dönüştür
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedIdea(null)}
                  className="h-8 text-xs"
                >
                  Kapat
                </Button>

                <Button
                  type="button"
                  onClick={handleSaveIdeaDetail}
                  disabled={updatingIdea}
                  className="h-8 text-xs font-semibold gap-1.5"
                >
                  {updatingIdea ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Promote to Project Modal */}
      <Modal
        isOpen={!!promoteTarget}
        onClose={() => setPromoteTarget(null)}
        title="Fikri Projeye Dönüştür"
        description="Bu fikir için yeni bir proje alanı açılacak ve geliştirme sürecine başlanacak."
      >
        {promoteTarget && (
          <form onSubmit={handleExecutePromote} className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 border border-border/50 text-xs space-y-1">
              <span className="text-muted-foreground block">Dönüştürülecek Fikir:</span>
              <strong className="text-foreground text-sm font-semibold block">{promoteTarget.title}</strong>
              {promoteTarget.description && (
                <p className="text-muted-foreground text-[11px] line-clamp-2">{promoteTarget.description}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="idea-promote-slug" className="text-xs font-semibold text-muted-foreground">
                URL Slug
              </label>
              <Input
                id="idea-promote-slug"
                required
                placeholder="proje-link-adi"
                prefix="/"
                value={promoteSlug}
                onChange={(e) => setPromoteSlug(slugify(e.target.value))}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Yeni proje linki: /projects/{slugify(promoteSlug || promoteTarget.title || 'slug')}
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="idea-promote-budget" className="text-xs font-semibold text-muted-foreground">
                Proje Bütçe Limiti (Opsiyonel)
              </label>
              <Input
                id="idea-promote-budget"
                type="number"
                placeholder="10000.00"
                prefix="₺"
                value={promoteBudget}
                onChange={(e) => setPromoteBudget(e.target.value)}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Proje geliştirme sürecinde maliyet hedefini takip etmek için opsiyonel bütçe.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setPromoteTarget(null)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={promoting} className="gap-1.5">
                <FolderPlus className="h-4 w-4" />
                {promoting ? 'Proje Başlatılıyor...' : 'Projeyi Başlat'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Idea Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!ideaToDelete}
        onClose={() => setIdeaToDelete(null)}
        onConfirm={confirmDeleteIdea}
        title="Fikri Sil"
        description={`"${ideaToDelete?.title}" fikrini kalıcı olarak silmek istediğinizden emin misiniz?`}
        confirmLabel="Sil"
        variant="destructive"
      />

      {/* Capacity Warning Dialog */}
      <ConfirmDialog
        isOpen={!!capacityWarningTarget}
        onClose={() => setCapacityWarningTarget(null)}
        onConfirm={() => {
          const target = capacityWarningTarget
          setCapacityWarningTarget(null)
          if (target) proceedWithPromote(target)
        }}
        title="Odak Kapasitesi Dolu"
        description="Kişisel odak kuralınız gereği aynı anda en fazla 2 aktif proje önerilir. Yine de bu fikri projeye dönüştürüp geliştirmeye başlamak istiyor musunuz?"
        confirmLabel="Yine de Devam Et"
        cancelLabel="Vazgeç"
        variant="warning"
      />
    </div>
  )
}

export default function IdeasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Fikir havuzu yükleniyor...
        </div>
      }
    >
      <IdeasContent />
    </Suspense>
  )
}
