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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import type { Idea } from '@/types/database'

const TABS = [
  { key: 'inbox', label: '📥 Gelen Kutusu (Inbox)' },
  { key: 'maybe', label: '🤔 Belki (Maybe)' },
  { key: 'killed', label: '💀 İptal Edilenler (Killed)' },
  { key: 'promoted', label: '🚀 Projeye Dönüşenler' },
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
  })

  // Promote Modal State
  const [promoteTarget, setPromoteTarget] = useState<Idea | null>(null)
  const [promoteBudget, setPromoteBudget] = useState('10000')
  const [promoting, setPromoting] = useState(false)

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
        })
      }
    } catch (err: any) {
      toast.error(err.message || 'Fikir eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenPromoteModal = async (idea: Idea) => {
    const supabase = createClient()
    const { data: activeProjects } = await supabase
      .from('projects')
      .select('id, status')
      .not('status', 'in', '("Arşiv", "Canlı")')
    
    if (activeProjects && activeProjects.length >= 2) {
      if (!confirm("Odak kapasiteniz dolu! (Maksimum 2 aktif proje önerilir). Yine de devam etmek istiyor musunuz?")) return
    }

    setPromoteTarget(idea)
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

      const slug = promoteTarget.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      // 1. Create Project
      const { data: newProject, error: prjError } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: promoteTarget.title,
          slug,
          description: promoteTarget.description,
          status: 'Planlama',
          budget_limit: budgetNum || null,
        })
        .select()
        .single()

      if (prjError) throw prjError

      // 2. Mark Idea as Promoted
      await supabase
        .from('ideas')
        .update({
          status: 'promoted',
          promoted_project_id: newProject.id,
        })
        .eq('id', promoteTarget.id)

      setPromoteTarget(null)
      toast.success('Fikir başarıyla projeye dönüştürüldü!')
      router.push(`/projects/${slug}`)
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

  const handleDelete = async (id: string) => {
    if (!confirm('Bu fikri silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('ideas').delete().eq('id', id)
      if (error) throw error
      setIdeas(ideas.filter((i) => i.id !== id))
      toast.success('Fikir silindi.')
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    }
  }

  const filteredIdeas = ideas.filter((i) => i.status === activeTab)

  return (
    <div className="space-y-6">
      {/* Top PageHeader */}
      <PageHeader
        title="Fikir Kuluçkası (Ideas)"
        description="Aklınıza gelen fikirleri not edin, değerlendirin ve olgunlaşınca tek tıkla projeye dönüştürün."
        actions={
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-sm text-xs h-9 font-semibold">
            <Plus className="h-4 w-4" />
            Yeni Fikir Not Et
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
        {TABS.map((tab) => {
          const count = ideas.filter((i) => i.status === tab.key).length
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredIdeas.map((idea) => (
          <Card key={idea.id} className="border-border bg-card shadow-sm flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base font-bold text-foreground line-clamp-1">
                  {idea.title}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(idea.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {idea.description && (
                <CardDescription className="text-xs line-clamp-3">
                  {idea.description}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {/* Tags */}
              {idea.tags && idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-[10px]">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Select
                  value={idea.status}
                  onChange={(e) =>
                    handleStatusChange(idea.id, e.target.value as Idea['status'])
                  }
                  className="h-7 text-xs w-32"
                >
                  <option value="inbox">📥 Inbox</option>
                  <option value="maybe">🤔 Maybe</option>
                  <option value="killed">💀 Killed</option>
                  <option value="promoted">🚀 Promoted</option>
                </Select>

                {idea.status !== 'promoted' ? (
                  <Button
                    size="sm"
                    onClick={() => handleOpenPromoteModal(idea)}
                    className="h-7 text-xs gap-1.5 shadow-sm"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Projeye Dönüştür
                  </Button>
                ) : (
                  <Link href="/projects">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      Projelerde Gör
                    </Button>
                  </Link>
                )}
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
        description="Aklınıza gelen fikirleri hızlıca not alın."
      >
        <form onSubmit={handleAddIdea} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Fikir Başlığı</label>
            <Input
              required
              placeholder="Örn: AI Destekli Fatura Okuyucu"
              value={ideaForm.title}
              onChange={(e) => setIdeaForm({ ...ideaForm, title: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Açıklama & Notlar</label>
            <Textarea
              placeholder="Bu fikir neyi çözer, kimin için faydalı? İlk düşünceler..."
              value={ideaForm.description}
              onChange={(e) => setIdeaForm({ ...ideaForm, description: e.target.value })}
              className="text-xs min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Etiketler (Virgülle ayırın)</label>
              <Input
                placeholder="b2b, saas, mobile"
                value={ideaForm.tags}
                onChange={(e) => setIdeaForm({ ...ideaForm, tags: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Klasör</label>
              <Select
                value={ideaForm.status}
                onChange={(e) =>
                  setIdeaForm({ ...ideaForm, status: e.target.value as Idea['status'] })
                }
                className="text-xs"
              >
                <option value="inbox">📥 Inbox</option>
                <option value="maybe">🤔 Maybe</option>
              </Select>
            </div>
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
              <label className="text-xs font-semibold text-muted-foreground">
                Proje Bütçe Limiti (Opsiyonel)
              </label>
              <Input
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
