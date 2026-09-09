'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  Sparkles,
  Plus,
  Compass,
  Trophy,
  Egg,
  Star,
  Edit2,
  Trash2,
  CheckCircle2,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Heart,
  Quote,
  Target,
  Clock,
  Calendar,
  Layers,
  Image as ImageIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import type { Dream } from '@/types/database'
import {
  DREAM_HORIZONS,
  DREAM_CATEGORIES,
  CURATED_VISION_WALLPAPERS,
  type DreamHorizon,
  type DreamStatus,
  filterDreamsByHorizon,
  filterDreamsByStatus,
  calculateVisionMetrics,
  formatHorizonLabel,
  formatShortHorizonLabel,
  getDefaultVisionWallpaper,
} from '@/lib/dreams-engine'

const INITIAL_SAMPLE_DREAMS: Dream[] = [
  {
    id: 'dream-ironman',
    user_id: 'local',
    title: 'İRONMAN Olmak',
    description: '3.8 km yüzme, 180 km bisiklet ve 42.2 km maraton koşusundan oluşan dayanıklılık triatlonunu aralıksız tamamlamak.',
    identity_persona: 'Demir İradeli Dayanıklılık Sporcusu',
    motivation_why: 'Kendi fiziksel ve zihinsel sınırlarımı aşarak disiplin, irade ve odaklanmanın zirvesini kendi bedenimde kanıtlamak.',
    horizon: 'horizon_1_3y',
    category: 'Kişisel Gelişim & Sağlık',
    status: 'active',
    next_focus_note: '6-12 aylık disiplinli antrenman planı çıkar, triatlon bisikleti ve ekipmanlarını temin et, hedef yarışı takvime ekle.',
    cover_image_url: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1600&q=80',
    target_year: '2027',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'dream-skydiving',
    user_id: 'local',
    title: 'Paraşütle Atlamak',
    description: 'Binlerce metre irtifadan serbest düşüş ve gökyüzünde süzülerek adrenalin ve mutlak özgürlüğü deneyimlemek.',
    identity_persona: 'Korkusuz Macera Tutkunu',
    motivation_why: 'Konfor alanını tamamen yıkarak hayata yüksekten bakmak ve anın içindeki saf cesareti tatmak.',
    horizon: 'horizon_1y',
    category: 'Deneyim & Seyahat',
    status: 'active',
    next_focus_note: 'Efes veya Fethiye tandem paraşüt atlayış takvimini incele ve uygun mevsimde ilk randevuyu planla.',
    cover_image_url: 'https://images.unsplash.com/photo-1521673461164-de300ebcf4d7?auto=format&fit=crop&w=1600&q=80',
    target_year: '2026',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'dream-sailboat',
    user_id: 'local',
    title: 'Güzel Bir Yelkenli Sahibi Olmak',
    description: 'Masmavi koylarda sadece rüzgarın gücüyle seyretmek, denizle baş başa bağımsız ve dingin bir yaşam kurmak.',
    identity_persona: 'Denizci & Özgür Kaptan',
    motivation_why: 'Denizin sağladığı mutlak bağımsızlık, doğayla uyum ve zihne kazandırdığı tarifsiz huzur.',
    horizon: 'horizon_3_5y',
    category: 'Maddi Hedef',
    status: 'active',
    next_focus_note: 'Amatör Denizci Belgesi (ADB) ve yelken eğitimini tamamla, tekne sınıfları ve marina işletim maliyetlerini araştır.',
    cover_image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
    target_year: '2029',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-1',
    user_id: 'local',
    title: "Kyoto'da Taş Bahçeli Evde 1 Ay Çalışmak",
    description: 'Sonbahar yaprakları eşliğinde sabah tapınak yürüyüşleri ve öğleden sonra derin çalışma seansları.',
    identity_persona: 'Özgür Kaşif & Bağımsız Üretici',
    motivation_why: 'Sadece çalışmak için değil, dünyayı deneyimlemek ve zihnimi genişletmek için buradayım.',
    horizon: 'horizon_1_3y',
    category: 'Deneyim & Seyahat',
    status: 'active',
    next_focus_note: 'Japonya uzun dönem konaklama ve vize gereksinimlerini araştır',
    cover_image_url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80',
    target_year: '2027',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    user_id: 'local',
    title: 'Minimalist Stüdyo & Ergonomik Çalışma Alanı',
    description: 'Doğal ceviz masa, Herman Miller Embody koltuk, 4K ekran ve sessiz ortam.',
    identity_persona: 'Bedenine Saygılı Zanaatkar',
    motivation_why: 'Günde 8 saat vakit geçirdiğim alan sağlığıma ve odak kaliteme değer katmalı.',
    horizon: 'horizon_1y',
    category: 'Maddi Hedef',
    status: 'active',
    next_focus_note: 'Oda yerleşimini çiz ve masa ayaklarını seç',
    cover_image_url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1600&q=80',
    target_year: '2026',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-3',
    user_id: 'local',
    title: 'Tam Bağımsızlık & Lokasyon Bağımsız Yaşam',
    description: 'Sadece istediğim insanlarla, istediğim yerden kendi projelerimi üreterek yaşamak.',
    identity_persona: 'Kendi Zamanının Efendisi',
    motivation_why: 'Hayattaki en değerli sermaye geri gelmeyen zamandır; onu başkalarına kiralamak istemiyorum.',
    horizon: 'horizon_lifetime',
    category: 'Kariyer & Üretim',
    status: 'active',
    next_focus_note: 'Pusula ve mikro-SaaS ürünlerini istikrarlı büyüt',
    cover_image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80',
    target_year: 'Ömür Boyu',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-4',
    user_id: 'local',
    title: 'Pilotluk & Planör İlk Uçuş Deneyimi',
    description: 'Gökyüzünde rüzgarı hissederek tek başına kontrolü ele alma hissi.',
    identity_persona: 'Sınırlarını Aşan Havacı',
    motivation_why: 'Korkularımı gökyüzünde bırakmak ve dünyayı kuşbakışı görmek için.',
    horizon: 'horizon_3_5y',
    category: 'Deneyim & Seyahat',
    status: 'incubating',
    next_focus_note: 'İnönü Türkkuşu eğitim takvimine bak',
    cover_image_url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1600&q=80',
    target_year: '2028',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-5',
    user_id: 'local',
    title: 'İlk 10km Koşu Hedefini Tamamla',
    description: 'İstanbul sahilinde kesintisiz 10 kilometre koşusu.',
    identity_persona: 'Dayanıklı & Kararlı Sporcu',
    motivation_why: 'Zihinsel dayanıklılığın ve disiplinin bedenle kanıtı.',
    horizon: 'horizon_1y',
    category: 'Kişisel Gelişim & Sağlık',
    status: 'achieved',
    next_focus_note: null,
    cover_image_url: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1600&q=80',
    target_year: '2026',
    achieved_at: new Date().toISOString(),
    achieved_note: 'Son 2 kilometrede bacaklarım yanıyordu ama o çizgiyi geçtiğim andaki özsaygı hissi paha biçilemezdi!',
    achieved_image_url: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1600&q=80',
    order_index: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

function DreamsContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [dreams, setDreams] = useState<Dream[]>([])
  const [loading, setLoading] = useState(true)
  const [isDbFallback, setIsDbFallback] = useState(false)

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'active' | 'incubating' | 'achieved'>('active')
  const [selectedHorizon, setSelectedHorizon] = useState<string>('all')

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDream, setEditingDream] = useState<Dream | null>(null)

  // Celebration Modal
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(false)
  const [celebratingDream, setCelebratingDream] = useState<Dream | null>(null)
  const [achievedNoteInput, setAchievedNoteInput] = useState('')
  const [achievedImageInput, setAchievedImageInput] = useState('')

  // Zen Mode (Fullscreen Immersion)
  const [isZenModeOpen, setIsZenModeOpen] = useState(false)
  const [zenIndex, setZenIndex] = useState(0)

  // Form State
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIdentityPersona, setFormIdentityPersona] = useState('')
  const [formMotivationWhy, setFormMotivationWhy] = useState('')
  const [formHorizon, setFormHorizon] = useState<DreamHorizon>('horizon_1_3y')
  const [formCategory, setFormCategory] = useState<string>('Yaşam Tarzı & Deneyim')
  const [formStatus, setFormStatus] = useState<DreamStatus>('active')
  const [formNextFocusNote, setFormNextFocusNote] = useState('')
  const [formCoverImageUrl, setFormCoverImageUrl] = useState('')
  const [formTargetYear, setFormTargetYear] = useState('')
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false)

  useEffect(() => {
    loadDreams()
    if (searchParams.get('new') === 'true') {
      handleOpenAddModal()
    }
  }, [])

  async function loadDreams() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('dreams')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) {
      console.warn('Dreams table remote query note:', error.message)
      setIsDbFallback(true)
      const cached = localStorage.getItem('pusula_local_dreams')
      if (cached) {
        try {
          const parsed: Dream[] = JSON.parse(cached)
          const missing = INITIAL_SAMPLE_DREAMS.slice(0, 3).filter(
            (d) =>
              !parsed.some(
                (p) =>
                  p.id === d.id ||
                  (p.title && p.title.toLowerCase() === d.title.toLowerCase())
              )
          )
          const merged = missing.length > 0 ? [...missing, ...parsed] : parsed
          setDreams(merged)
          localStorage.setItem('pusula_local_dreams', JSON.stringify(merged))
        } catch {
          setDreams(INITIAL_SAMPLE_DREAMS)
          localStorage.setItem('pusula_local_dreams', JSON.stringify(INITIAL_SAMPLE_DREAMS))
        }
      } else {
        setDreams(INITIAL_SAMPLE_DREAMS)
        localStorage.setItem('pusula_local_dreams', JSON.stringify(INITIAL_SAMPLE_DREAMS))
      }
    } else if (data && data.length > 0) {
      const missing = INITIAL_SAMPLE_DREAMS.slice(0, 3).filter(
        (d) =>
          !data.some(
            (p) =>
              p.id === d.id ||
              (p.title && p.title.toLowerCase() === d.title.toLowerCase())
          )
      )
      const merged = missing.length > 0 ? [...missing, ...data] : data
      setDreams(merged)
      setIsDbFallback(false)
      localStorage.setItem('pusula_local_dreams', JSON.stringify(merged))
    } else {
      // Empty remote table: seed with sample inspirations if completely empty
      setDreams(INITIAL_SAMPLE_DREAMS)
      localStorage.setItem('pusula_local_dreams', JSON.stringify(INITIAL_SAMPLE_DREAMS))
    }
    setLoading(false)
  }

  const syncLocal = (items: Dream[]) => {
    setDreams(items)
    localStorage.setItem('pusula_local_dreams', JSON.stringify(items))
  }

  // Open Add Modal
  const handleOpenAddModal = (initialStatus: DreamStatus = 'active') => {
    setEditingDream(null)
    setFormTitle('')
    setFormDescription('')
    setFormIdentityPersona('')
    setFormMotivationWhy('')
    setFormHorizon('horizon_1_3y')
    setFormCategory('Yaşam Tarzı & Deneyim')
    setFormStatus(initialStatus)
    setFormNextFocusNote('')
    setFormCoverImageUrl(CURATED_VISION_WALLPAPERS[0].url)
    setFormTargetYear(new Date().getFullYear() + 1 + '')
    setShowWallpaperPicker(false)
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (item: Dream) => {
    setEditingDream(item)
    setFormTitle(item.title)
    setFormDescription(item.description || '')
    setFormIdentityPersona(item.identity_persona || '')
    setFormMotivationWhy(item.motivation_why || '')
    setFormHorizon(item.horizon as DreamHorizon)
    setFormCategory(item.category || 'Yaşam Tarzı & Deneyim')
    setFormStatus(item.status as DreamStatus)
    setFormNextFocusNote(item.next_focus_note || '')
    setFormCoverImageUrl(item.cover_image_url || getDefaultVisionWallpaper(item.category))
    setFormTargetYear(item.target_year || '')
    setShowWallpaperPicker(false)
    setIsModalOpen(true)
  }

  // Save Dream
  const handleSaveDream = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) return

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id || 'local'

    const payload = {
      user_id: userId,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      identity_persona: formIdentityPersona.trim() || null,
      motivation_why: formMotivationWhy.trim() || null,
      horizon: formHorizon,
      category: formCategory,
      status: formStatus,
      next_focus_note: formNextFocusNote.trim() || null,
      cover_image_url: formCoverImageUrl.trim() || getDefaultVisionWallpaper(formCategory),
      target_year: formTargetYear.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (!isDbFallback && user) {
      if (editingDream) {
        await supabase.from('dreams').update(payload).eq('id', editingDream.id)
      } else {
        await supabase.from('dreams').insert({
          ...payload,
          order_index: dreams.length,
          created_at: new Date().toISOString(),
        })
      }
      await loadDreams()
    } else {
      // Local fallback
      let updated: Dream[]
      if (editingDream) {
        updated = dreams.map((d) => (d.id === editingDream.id ? ({ ...d, ...payload } as Dream) : d))
      } else {
        const newItem: Dream = {
          ...payload,
          id: `dream-${Date.now()}`,
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: dreams.length,
          created_at: new Date().toISOString(),
        } as Dream
        updated = [newItem, ...dreams]
      }
      syncLocal(updated)
    }

    toast.success(editingDream ? 'Hedef güncellendi!' : 'Yeni hedef vizyon panona eklendi!')
    setIsModalOpen(false)
  }

  // Delete Dream
  const handleDeleteDream = async (id: string) => {
    if (!confirm('Bu hayal kaydını silmek istediğinize emin misiniz?')) return
    if (!isDbFallback) {
      const supabase = createClient()
      await supabase.from('dreams').delete().eq('id', id)
      await loadDreams()
    } else {
      syncLocal(dreams.filter((d) => d.id !== id))
    }
    toast.success('Hedef silindi.')
  }

  // Open Celebration Modal (Mark as Achieved)
  const handleOpenCelebration = (dream: Dream) => {
    setCelebratingDream(dream)
    setAchievedNoteInput('')
    setAchievedImageInput(dream.cover_image_url || '')
    setIsCelebrationOpen(true)
  }

  // Confirm Celebration
  const handleConfirmCelebration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!celebratingDream) return

    const updates = {
      status: 'achieved' as const,
      achieved_at: new Date().toISOString(),
      achieved_note: achievedNoteInput.trim() || 'Bu anı başardım ve tarihe not düştüm.',
      achieved_image_url: achievedImageInput.trim() || celebratingDream.cover_image_url,
      updated_at: new Date().toISOString(),
    }

    if (!isDbFallback) {
      const supabase = createClient()
      await supabase.from('dreams').update(updates).eq('id', celebratingDream.id)
      await loadDreams()
    } else {
      const updated = dreams.map((d) => (d.id === celebratingDream.id ? { ...d, ...updates } : d))
      syncLocal(updated)
    }

    toast.success('Tebrikler! Kişisel zafer Zafer Müzesi\'ne kaydedildi 🏆')
    setIsCelebrationOpen(false)
    setActiveTab('achieved')
  }

  // Move from Incubating to Active
  const handlePromoteToActive = async (dream: Dream) => {
    const updates = { status: 'active' as const, updated_at: new Date().toISOString() }
    if (!isDbFallback) {
      const supabase = createClient()
      await supabase.from('dreams').update(updates).eq('id', dream.id)
      await loadDreams()
    } else {
      syncLocal(dreams.map((d) => (d.id === dream.id ? { ...d, ...updates } : d)))
    }
    toast.success('Hedef aktif vizyona taşındı!')
  }

  // Move from Active to Incubating
  const handleDemoteToIncubating = async (dream: Dream) => {
    const updates = { status: 'incubating' as const, updated_at: new Date().toISOString() }
    if (!isDbFallback) {
      const supabase = createClient()
      await supabase.from('dreams').update(updates).eq('id', dream.id)
      await loadDreams()
    } else {
      syncLocal(dreams.map((d) => (d.id === dream.id ? { ...d, ...updates } : d)))
    }
  }

  // Metrics
  const metrics = calculateVisionMetrics(dreams)

  // Active Tab Filtered Lists
  const activeDreams = filterDreamsByStatus(dreams, 'active')
  const incubatingDreams = filterDreamsByStatus(dreams, 'incubating')
  const achievedDreams = filterDreamsByStatus(dreams, 'achieved')

  const displayedActiveDreams = filterDreamsByHorizon(activeDreams, selectedHorizon)

  // Open Zen Mode
  const handleOpenZenMode = () => {
    if (activeDreams.length === 0) {
      toast.warning('Vizyon modunu başlatmak için en az 1 aktif hedefiniz olmalıdır.')
      return
    }
    setZenIndex(0)
    setIsZenModeOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Hedefler & Vizyon"
        description="Kişisel hedeflerinizi zaman dilimlerine göre planlayın, takip edin ve tamamlananları arşivleyin."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenZenMode}
              disabled={activeDreams.length === 0}
              className="gap-2 h-9 text-xs font-semibold shadow-sm border-border text-foreground hover:bg-muted"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Odak Görünümü</span>
            </Button>
            <Button
              onClick={() => handleOpenAddModal(activeTab === 'incubating' ? 'incubating' : 'active')}
              size="sm"
              className="gap-2 h-9 text-xs font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span>Yeni Hedef</span>
            </Button>
          </div>
        }
      />

      {/* Unified Segmented Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Aktif Hedefler
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {metrics.activeCount}
          </div>
          <p className="text-[11px] text-muted-foreground">Aktif takipteli hedefler</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Kısa Vade (1 Yıl)
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {metrics.horizonCounts.horizon_1y}
          </div>
          <p className="text-[11px] text-muted-foreground">12 ay içinde planlanan</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Bekleyenler
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {metrics.incubatingCount}
          </div>
          <p className="text-[11px] text-muted-foreground">Değerlendirme aşamasında</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Tamamlananlar
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {metrics.achievedCount}
          </div>
          <p className="text-[11px] text-muted-foreground">Ulaşılan hedefler</p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'active'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            <span>Aktif Hedefler ({activeDreams.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('incubating')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'incubating'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Bekleyenler ({incubatingDreams.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('achieved')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === 'achieved'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Tamamlananlar ({achievedDreams.length})</span>
          </button>
        </div>

        {/* Horizon Filter Pills (Only on Active Tab) */}
        {activeTab === 'active' && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 sm:pt-0">
            <button
              onClick={() => setSelectedHorizon('all')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                selectedHorizon === 'all'
                  ? 'bg-muted text-foreground font-semibold border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tüm Ufuklar
            </button>
            {DREAM_HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => setSelectedHorizon(h.key)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
                  selectedHorizon === h.key
                    ? 'bg-muted text-foreground font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{h.shortLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab 1: Active Vision Cards */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          {displayedActiveDreams.length === 0 ? (
            <Card className="border-border border-dashed p-12 text-center bg-card/40">
              <div className="max-w-md mx-auto space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Compass className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Bu ufukta henüz aktif bir hedef bulunmuyor
                </h3>
                <p className="text-xs text-muted-foreground">
                  Gelecek rotanı çizmek ve hayat vizyonunu somutlaştırmak için yeni bir hedef ekleyebilirsin.
                </p>
                <Button onClick={() => handleOpenAddModal('active')} size="sm" className="gap-1.5 mt-2">
                  <Plus className="h-4 w-4" />
                  <span>İlk Hedefini Ekle</span>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {displayedActiveDreams.map((dream) => (
                <div
                  key={dream.id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm hover:shadow-xl hover:border-primary/40 transition-all duration-300 flex flex-col justify-between"
                >
                  {/* Card Cover Image */}
                  <div className="relative h-48 w-full overflow-hidden bg-muted/60">
                    <img
                      src={dream.cover_image_url || getDefaultVisionWallpaper(dream.category)}
                      alt={dream.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1.5">
                      <Badge
                        variant="outline"
                        className="bg-background/80 backdrop-blur-md text-[10px] font-semibold border-border/80 text-foreground"
                      >
                        {formatHorizonLabel(dream.horizon)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="bg-background/80 backdrop-blur-md text-[10px] border-border/80 text-muted-foreground"
                      >
                        {dream.category}
                      </Badge>
                    </div>

                    {/* Year / Date badge */}
                    {dream.target_year && (
                      <div className="absolute bottom-2.5 right-3 text-[11px] font-medium text-foreground/90 bg-background/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-border/60">
                        {dream.target_year}
                      </div>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      {/* Identity Tag */}
                      {dream.identity_persona && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <span>{dream.identity_persona}</span>
                        </div>
                      )}

                      {/* Title */}
                      <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                        {dream.title}
                      </h3>

                      {/* Description */}
                      {dream.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {dream.description}
                        </p>
                      )}

                      {/* Motivation Why */}
                      {dream.motivation_why && (
                        <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50 text-[11px] text-muted-foreground italic flex gap-1.5">
                          <Quote className="h-3 w-3 shrink-0 text-muted-foreground opacity-60 mt-0.5" />
                          <span className="line-clamp-2">{dream.motivation_why}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Next Focus Note + Actions */}
                    <div className="pt-2 space-y-3 border-t border-border/60">
                      {dream.next_focus_note && (
                        <div className="flex items-center gap-1.5 text-[11px] bg-muted/60 text-foreground px-2.5 py-1.5 rounded-md border border-border">
                          <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium truncate">
                            Sıradaki Odak: {dream.next_focus_note}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenCelebration(dream)}
                          className="h-7 px-2.5 text-[11px] font-medium gap-1 text-foreground border-border hover:bg-muted"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          <span>Tamamla</span>
                        </Button>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDemoteToIncubating(dream)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Bekleyenlere taşı"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(dream)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Düzenle"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDream(dream.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Incubating Dreams (Bekleyen Hedefler) */}
      {activeTab === 'incubating' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Bekleyen Hedefler</span>
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Zamanı henüz netleşmemiş veya ileri bir tarihte değerlendirilecek hedefler.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddModal('incubating')}
              className="text-xs font-medium gap-1 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Yeni Hedef Ekle</span>
            </Button>
          </div>

          {incubatingDreams.length === 0 ? (
            <Card className="border-border border-dashed p-10 text-center bg-card/40">
              <p className="text-xs text-muted-foreground">Bekleyen bir hedef bulunmuyor.</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {incubatingDreams.map((dream) => (
                <Card
                  key={dream.id}
                  className="border-border bg-card hover:border-border/80 transition-colors p-4 space-y-3 flex flex-col justify-between shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {dream.category}
                      </Badge>
                      {dream.target_year && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {dream.target_year}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-sm text-foreground">{dream.title}</h4>
                    {dream.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{dream.description}</p>
                    )}
                    {dream.identity_persona && (
                      <span className="text-[11px] text-muted-foreground block">{dream.identity_persona}</span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePromoteToActive(dream)}
                      className="h-7 px-2.5 text-[11px] font-medium gap-1 text-foreground hover:bg-muted"
                    >
                      <Target className="h-3 w-3 text-primary" />
                      <span>Aktif Hedeflere Al</span>
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditModal(dream)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDream(dream.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Completed Dreams (Tamamlananlar) */}
      {activeTab === 'achieved' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <span>Tamamlanan Hedefler</span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Başarıyla sonuçlanan ve kayda geçirilen kişisel hedefleriniz.
            </p>
          </div>

          {achievedDreams.length === 0 ? (
            <Card className="border-border border-dashed p-12 text-center bg-card/40">
              <Trophy className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">Tamamlanan Hedef Bulunmuyor</p>
              <p className="text-xs text-muted-foreground mt-1">
                Aktif hedeflerinizden birini tamamladığınızda <strong>"Tamamla"</strong> butonuna basarak buraya taşıyabilirsiniz.
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {achievedDreams.map((dream) => (
                <div
                  key={dream.id}
                  className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <div className="relative h-44 w-full bg-muted">
                    <img
                      src={
                        dream.achieved_image_url ||
                        dream.cover_image_url ||
                        getDefaultVisionWallpaper(dream.category)
                      }
                      alt={dream.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                    <div className="absolute top-3 right-3">
                      <Badge variant="outline" className="bg-background/80 backdrop-blur-md text-[10px] font-medium border-border gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span>Tamamlandı</span>
                      </Badge>
                    </div>
                    {dream.achieved_at && (
                      <div className="absolute bottom-2 left-3 text-[10px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded-md backdrop-blur-sm border border-border/60">
                        {new Date(dream.achieved_at).toLocaleDateString('tr-TR')}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <h4 className="font-semibold text-base text-foreground">{dream.title}</h4>
                      {dream.identity_persona && (
                        <span className="text-[11px] text-muted-foreground block font-medium">
                          {dream.identity_persona}
                        </span>
                      )}
                      {dream.achieved_note && (
                        <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5 text-xs text-muted-foreground italic mt-2">
                          "{dream.achieved_note}"
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border/60 flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditModal(dream)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDream(dream.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Dream Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDream ? 'Hedefi Düzenle' : 'Yeni Hedef & Vizyon Ekle'}
        size="xl"
      >
        <form onSubmit={handleSaveDream} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Hedef / Vizyon Başlığı</label>
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Örn: Toskana'da Taş Evde 1 Ay Çalışmak, 10km Koşmak..."
              required
              autoFocus
            />
          </div>

          {/* Horizon & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Yaşam Ufku (Zaman Tüneli)</label>
              <Select
                value={formHorizon}
                onChange={(e) => setFormHorizon(e.target.value as DreamHorizon)}
              >
                {DREAM_HORIZONS.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kategori</label>
              <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                {DREAM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Identity & Target Year */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Kimlik / Persona <span className="text-muted-foreground font-normal">(Bu hayal kime ait?)</span>
              </label>
              <Input
                value={formIdentityPersona}
                onChange={(e) => setFormIdentityPersona(e.target.value)}
                placeholder="Örn: Özgür Kaşif, Bağımsız Üretici, Disiplinli Sporcu..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Hedef Yıl / Dönem</label>
              <Input
                value={formTargetYear}
                onChange={(e) => setFormTargetYear(e.target.value)}
                placeholder="2027, 2028 Yazı"
              />
            </div>
          </div>

          {/* Motivation Why */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Neden İstiyorum? <span className="text-muted-foreground font-normal">(İçsel motivasyonun)</span>
            </label>
            <Textarea
              value={formMotivationWhy}
              onChange={(e) => setFormMotivationWhy(e.target.value)}
              placeholder="Örn: Dünyayı deneyimlemek ve zihnimi bağımsız üretmeye açmak için..."
              rows={2}
              className="text-xs min-h-[60px]"
            />
          </div>

          {/* Next Focus Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Sıradaki Odak Notu <span className="text-muted-foreground font-normal">(Aklındaki basit hatırlatıcı)</span>
            </label>
            <Input
              value={formNextFocusNote}
              onChange={(e) => setFormNextFocusNote(e.target.value)}
              placeholder="Örn: Pasaport randevusu al, inceleme videosu izle..."
            />
          </div>

          {/* Detailed Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Detaylı Açıklama (İsteğe Bağlı)</label>
            <Textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Hayalinle ilgili aklındaki özel detaylar, hisler..."
              rows={2}
              className="text-xs min-h-[60px]"
            />
          </div>

          {/* Cover Image & Presets Picker */}
          <div className="space-y-2 pt-1 border-t border-border/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
                <span>Kapak / İlham Görseli</span>
              </label>
              <button
                type="button"
                onClick={() => setShowWallpaperPicker(!showWallpaperPicker)}
                className="text-[11px] text-primary hover:underline font-semibold"
              >
                {showWallpaperPicker ? 'Gizle' : 'Hazır Şablonlardan Seç'}
              </button>
            </div>

            {/* Quick Presets Grid */}
            {showWallpaperPicker && (
              <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-1.5 bg-muted/30 rounded-lg border border-border/70">
                {CURATED_VISION_WALLPAPERS.map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => {
                      setFormCoverImageUrl(wp.url)
                      setShowWallpaperPicker(false)
                    }}
                    className={`relative rounded-md overflow-hidden h-14 group border transition-all ${
                      formCoverImageUrl === wp.url ? 'border-primary ring-2 ring-primary/40' : 'border-border/50'
                    }`}
                  >
                    <img src={wp.thumbnailUrl} alt={wp.title} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-[9px] text-white font-medium text-center p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {wp.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <Input
              value={formCoverImageUrl}
              onChange={(e) => setFormCoverImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="text-xs font-mono"
            />
          </div>

          {/* Submit / Cancel */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" size="sm" className="font-semibold">
              {editingDream ? 'Güncellemeleri Kaydet' : 'Hedefi Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Celebration Modal (Mark as Achieved) */}
      {celebratingDream && (
        <Modal
          isOpen={isCelebrationOpen}
          onClose={() => setIsCelebrationOpen(false)}
          title={`Hedef Tamamlandı: ${celebratingDream.title}`}
        >
          <form onSubmit={handleConfirmCelebration} className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Hedefi Tamamla</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Bu hedefe ulaştığınız anı ve duygularınızı not alarak arşivinize kaydedin.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Tamamlama Notu:
              </label>
              <textarea
                value={achievedNoteInput}
                onChange={(e) => setAchievedNoteInput(e.target.value)}
                placeholder="Bu hedefi gerçekleştirirken edindiğiniz tecrübeler ve hisleriniz..."
                rows={3}
                required
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Anı / Fotoğraf Görseli (İsteğe Bağlı URL):
              </label>
              <Input
                value={achievedImageInput}
                onChange={(e) => setAchievedImageInput(e.target.value)}
                placeholder="https://..."
                className="text-xs font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCelebrationOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" size="sm" className="font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                Tamamlananlara Ekle
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Zen Mode (Fullscreen Immersive Lightbox) */}
      {isZenModeOpen && activeDreams.length > 0 && (() => {
        const currentDream = activeDreams[zenIndex % activeDreams.length]
        return (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col justify-between p-6 sm:p-12 animate-in fade-in duration-300">
            {/* Zen Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-foreground" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Pusula • Odak Görünümü
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsZenModeOpen(false)}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Zen Central Slide */}
            <div className="max-w-4xl mx-auto w-full grid md:grid-cols-2 gap-8 items-center py-6">
              {/* Image Frame */}
              <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border border-border/80">
                <img
                  src={currentDream.cover_image_url || getDefaultVisionWallpaper(currentDream.category)}
                  alt={currentDream.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/90">
                  <span className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full">
                    {formatHorizonLabel(currentDream.horizon)}
                  </span>
                  {currentDream.target_year && (
                    <span className="font-mono bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full">
                      {currentDream.target_year}
                    </span>
                  )}
                </div>
              </div>

              {/* Text & Inspiration */}
              <div className="space-y-4">
                {currentDream.identity_persona && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{currentDream.identity_persona}</span>
                  </div>
                )}

                <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
                  {currentDream.title}
                </h2>

                {currentDream.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentDream.description}
                  </p>
                )}

                {currentDream.motivation_why && (
                  <blockquote className="rounded-2xl border-l-2 border-primary bg-muted/40 p-4 text-xs sm:text-sm text-foreground/90 italic">
                    "{currentDream.motivation_why}"
                  </blockquote>
                )}

                {currentDream.next_focus_note && (
                  <div className="text-xs text-primary font-medium bg-primary/10 border border-primary/20 px-3 py-2 rounded-xl flex items-center gap-2">
                    <Target className="h-4 w-4 shrink-0" />
                    <span>Sıradaki Odak: {currentDream.next_focus_note}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Zen Navigation Footer */}
            <div className="flex items-center justify-between max-w-4xl mx-auto w-full pt-4 border-t border-border/40 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setZenIndex((prev) => (prev - 1 + activeDreams.length) % activeDreams.length)
                }
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Önceki</span>
              </Button>

              <div className="flex items-center gap-1.5">
                {activeDreams.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setZenIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === zenIndex % activeDreams.length ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/40'
                    }`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setZenIndex((prev) => (prev + 1) % activeDreams.length)}
                className="gap-1.5"
              >
                <span>Sonraki</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function DreamsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Hayaller & vizyon panosu yükleniyor...
        </div>
      }
    >
      <DreamsContent />
    </Suspense>
  )
}
