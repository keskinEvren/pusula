'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BookOpen,
  Plus,
  Search,
  Pin,
  Sparkles,
  Flame,
  Calendar,
  Clock,
  Maximize2,
  Minimize2,
  Trash2,
  Save,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Tag,
  PenTool,
  X,
  Filter,
  BarChart2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import { formatLocalDateInput, isUUID } from '@/lib/utils'
import type { JournalEntry, Routine, RoutineLog, Transaction } from '@/types/database'
import {
  JournalMood,
  JournalTemplateType,
  JOURNAL_MOODS,
  JOURNAL_TEMPLATES,
  countWords,
  calculateReadingTimeMinutes,
  filterJournalEntries,
  calculateJournalMetrics,
  buildDayContextSummary,
} from '@/lib/journal-engine'

const STORAGE_KEY_JOURNAL = 'pusula_local_journal_entries'

function JournalPageContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const todayStr = formatLocalDateInput()

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'editor' | 'list'>('editor')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineLogs, setRoutineLogs] = useState<RoutineLog[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Arama & Filtreleme
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<string>('all')

  // Editör Durumu
  const [isEditingNew, setIsEditingNew] = useState(false)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [editorMood, setEditorMood] = useState<JournalMood>('calm')
  const [editorDate, setEditorDate] = useState(todayStr)
  const [editorTemplate, setEditorTemplate] = useState<JournalTemplateType>('freeform')
  const [editorTags, setEditorTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [editorWeather, setEditorWeather] = useState('')
  const [editorPinned, setEditorPinned] = useState(false)

  // Zen / Tam Ekran Modu
  const [isZenMode, setIsZenMode] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // 1. Veri Yükleme (Supabase + LocalStorage Fallback)
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      const supabase = createClient()

      try {
        // Günlük girişlerini çek
        const { data: dbEntries, error } = await supabase
          .from('journal_entries')
          .select('*')
          .order('entry_date', { ascending: false })

        if (!error && dbEntries && dbEntries.length > 0) {
          const validData = dbEntries.filter((e: any) => !e.id?.startsWith?.('sample-'))
          setEntries(validData as JournalEntry[])
          if (validData.length > 0) {
            setSelectedEntryId(validData[0].id)
            populateEditor(validData[0] as JournalEntry)
          } else {
            setSelectedEntryId(null)
            setIsEditingNew(true)
          }
        } else {
          const localStr = localStorage.getItem(STORAGE_KEY_JOURNAL)
          if (localStr) {
            try {
              const parsed = JSON.parse(localStr)
              const cleaned = Array.isArray(parsed) ? parsed.filter((e: any) => !e.id?.startsWith?.('sample-')) : []
              setEntries(cleaned)
              if (cleaned.length > 0) {
                setSelectedEntryId(cleaned[0].id)
                populateEditor(cleaned[0])
              } else {
                setSelectedEntryId(null)
                setIsEditingNew(true)
              }
            } catch {
              setEntries([])
              setSelectedEntryId(null)
              setIsEditingNew(true)
            }
          } else {
            setEntries([])
            setSelectedEntryId(null)
            setIsEditingNew(true)
          }
        }

        // Günün akıllı bağlamı için rutinler ve hareketleri çek
        const { data: rData } = await supabase.from('routines').select('*')
        if (rData) setRoutines(rData as Routine[])
        else {
          const lR = localStorage.getItem('pusula_local_routines')
          if (lR) setRoutines(JSON.parse(lR))
        }

        const { data: rlData } = await supabase.from('routine_logs').select('*').limit(1000)
        if (rlData) setRoutineLogs(rlData as RoutineLog[])
        else {
          const lRl = localStorage.getItem('pusula_local_routine_logs')
          if (lRl) setRoutineLogs(JSON.parse(lRl))
        }

        const { data: txData } = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(1000)
        if (txData) setTransactions(txData as Transaction[])
      } catch (err) {
        console.error('Journal data load error:', err)
        const localStr = localStorage.getItem(STORAGE_KEY_JOURNAL)
        if (localStr) {
          try {
            const parsed = JSON.parse(localStr)
            const cleaned = Array.isArray(parsed) ? parsed.filter((e: any) => !e.id?.startsWith?.('sample-')) : []
            setEntries(cleaned)
            if (cleaned.length > 0) {
              setSelectedEntryId(cleaned[0].id)
              populateEditor(cleaned[0])
            }
          } catch {
            setEntries([])
          }
        } else {
          setEntries([])
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // URL'de ?new=true varsa otomatik yeni günlük başlat
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      handleCreateNewEntry()
    }
  }, [searchParams])

  // ESC tuşuyla Zen modundan çıkış
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isZenMode])

  function saveEntriesToLocal(updated: JournalEntry[]) {
    setEntries(updated)
    localStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(updated))
  }

  function populateEditor(entry: JournalEntry) {
    setIsEditingNew(false)
    setEditorTitle(entry.title)
    setEditorContent(entry.content)
    setEditorMood(entry.mood)
    setEditorDate(entry.entry_date)
    setEditorTemplate(entry.template_type)
    setEditorTags(entry.tags || [])
    setEditorWeather(entry.weather_note || '')
    setEditorPinned(entry.pinned || false)
  }

  function handleSelectEntry(entry: JournalEntry) {
    setSelectedEntryId(entry.id)
    populateEditor(entry)
    setMobileTab('editor')
  }

  function handleCreateNewEntry(templateKey: JournalTemplateType = 'freeform') {
    setIsEditingNew(true)
    setSelectedEntryId(null)
    const tmpl = JOURNAL_TEMPLATES[templateKey]
    setEditorTitle(tmpl.key === 'freeform' ? '' : tmpl.title)
    setEditorContent(tmpl.content)
    setEditorMood('calm')
    setEditorDate(todayStr)
    setEditorTemplate(templateKey)
    setEditorTags([])
    setEditorWeather('')
    setEditorPinned(false)
    setMobileTab('editor')

    setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
  }

  function handleApplyTemplate(templateKey: JournalTemplateType) {
    const tmpl = JOURNAL_TEMPLATES[templateKey]
    setEditorTemplate(templateKey)
    if (!editorTitle || editorTitle === 'Serbest Akış' || editorTitle === 'Stoik Akşam Muhasebesi' || editorTitle === '3 Şükran & Günün Zaferi' || editorTitle === 'Haftalık Kapanış & Rota Tayini') {
      setEditorTitle(tmpl.key === 'freeform' ? '' : tmpl.title)
    }
    setEditorContent(tmpl.content)
  }

  async function handleSaveEntry() {
    if (!editorTitle.trim() && !editorContent.trim()) return

    setSaveStatus('saving')
    const finalTitle = editorTitle.trim() || 'Başlıksız Seyir Notu'
    const wordCount = countWords(editorContent)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || 'local'

    if (isEditingNew || !selectedEntryId) {
      // Yeni Giriş
      const newEntry: JournalEntry = {
        id: crypto.randomUUID(),
        user_id: userId,
        entry_date: editorDate,
        title: finalTitle,
        content: editorContent,
        mood: editorMood,
        template_type: editorTemplate,
        tags: editorTags,
        weather_note: editorWeather || null,
        pinned: editorPinned,
        word_count: wordCount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const updated = [newEntry, ...entries]
      saveEntriesToLocal(updated)
      setSelectedEntryId(newEntry.id)
      setIsEditingNew(false)

      try {
        if (user) {
          const { error: insErr } = await supabase.from('journal_entries').insert([newEntry])
          if (insErr) {
            console.error('Insert journal error:', insErr)
            toast.error('Seyir notu buluta kaydedilemedi: ' + insErr.message)
          }
        }
      } catch (err) {
        console.error('Insert journal error:', err)
      }
    } else {
      // Güncelleme
      const current = entries.find((e) => e.id === selectedEntryId)
      if (!current) return

      const updatedEntry: JournalEntry = {
        ...current,
        entry_date: editorDate,
        title: finalTitle,
        content: editorContent,
        mood: editorMood,
        template_type: editorTemplate,
        tags: editorTags,
        weather_note: editorWeather || null,
        pinned: editorPinned,
        word_count: wordCount,
        updated_at: new Date().toISOString(),
      }

      const updated = entries.map((e) => (e.id === selectedEntryId ? updatedEntry : e))
      saveEntriesToLocal(updated)

      try {
        await supabase
          .from('journal_entries')
          .update(updatedEntry)
          .eq('id', selectedEntryId)
      } catch (err) {
        console.error('Update journal error:', err)
      }
    }

    setSaveStatus('saved')
    toast.success(isEditingNew || !selectedEntryId ? 'Yeni kayıt eklendi.' : 'Kayıt güncellendi.')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  async function confirmDeleteEntry() {
    if (!entryToDelete) return
    const id = entryToDelete
    const updated = entries.filter((e) => e.id !== id)
    saveEntriesToLocal(updated)

    if (selectedEntryId === id) {
      if (updated.length > 0) {
        setSelectedEntryId(updated[0].id)
        populateEditor(updated[0])
      } else {
        handleCreateNewEntry()
      }
    }

    if (isUUID(id)) {
      const supabase = createClient()
      try {
        await supabase.from('journal_entries').delete().eq('id', id)
      } catch {}
    }
    toast.success('Kayıt silindi.')
    setEntryToDelete(null)
  }

  function handleAddTag() {
    if (!tagInput.trim()) return
    const tag = tagInput.trim()
    if (!editorTags.includes(tag)) {
      setEditorTags([...editorTags, tag])
    }
    setTagInput('')
  }

  function handleRemoveTag(tag: string) {
    setEditorTags(editorTags.filter((t) => t !== tag))
  }

  // Hesaplanan Değerler
  const filteredEntries = filterJournalEntries(entries, {
    query: searchQuery,
    mood: selectedMoodFilter,
  })

  const metrics = calculateJournalMetrics(entries, todayStr)
  const dayContext = buildDayContextSummary(editorDate, routines, routineLogs, transactions)
  const currentWordCount = countWords(editorContent)
  const currentReadingTime = calculateReadingTimeMinutes(currentWordCount)
  const moodMeta = JOURNAL_MOODS[editorMood]

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-muted/60 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/30 rounded-xl border border-border/40" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
          <div className="lg:col-span-4 h-96 bg-muted/20 rounded-xl border border-border/40" />
          <div className="lg:col-span-8 h-96 bg-muted/20 rounded-xl border border-border/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık & Eylemler */}
      <PageHeader
        title="Günlük"
        description="Düşüncelerini, kararlarını ve günün muhasebesini kaydet."
        badge={metrics.writingStreak > 0 ? `${metrics.writingStreak} Gün Seri` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsZenMode(true)}
              className="gap-2 text-xs"
              title="Dikkat dağıtıcı her şeyi gizle ve tam ekran odak moduna geç"
            >
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Odak Modu</span>
            </Button>

            <Button size="sm" onClick={() => handleCreateNewEntry()} className="gap-2">
              <Plus className="h-4 w-4" />
              <span>Yeni Sayfa</span>
            </Button>
          </div>
        }
      />

      {/* 2. Kompakt İstatistik Şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Toplam Kayıt</div>
            <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums mt-0.5">{metrics.totalEntries}</div>
          </div>
          <div className="p-2 rounded-lg bg-secondary text-muted-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Toplam Kelime (~{metrics.totalReadingTimeMinutes} dk)</div>
            <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums mt-0.5">{metrics.totalWords.toLocaleString()}</div>
          </div>
          <div className="p-2 rounded-lg bg-secondary text-muted-foreground">
            <PenTool className="h-4 w-4" />
          </div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Yazma Serisi</div>
            <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums mt-0.5">{metrics.writingStreak} Gün</div>
          </div>
          <div className="p-2 rounded-lg bg-secondary text-muted-foreground">
            <Flame className="h-4 w-4" />
          </div>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Baskın Ruh Hali</div>
            <div className="text-sm font-semibold tracking-tight text-foreground mt-1 truncate">
              {metrics.mostFrequentMood ? JOURNAL_MOODS[metrics.mostFrequentMood].label.split(' ')[0] : 'Dengeli'}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-secondary text-muted-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Mobil Sekme Değiştirici */}
      <div className="lg:hidden flex items-center p-1 bg-muted/40 rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mobileTab === 'editor'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Yazı Masası
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mobileTab === 'list'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Arşiv ({filteredEntries.length})
        </button>
      </div>

      {/* 3. Ana Çalışma Alanı: Sol Liste (4 Kolon) + Sağ Daktilo Masası (8 Kolon) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[640px]">
        {/* SOL PANEL: ZAMAN TÜNELİ & ARŞİV (lg:col-span-4) */}
        <div className={`lg:col-span-4 space-y-3 ${mobileTab === 'editor' ? 'hidden lg:block' : 'block'}`}>
          {/* Arama & Ruh Hali Filtreleri */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Yazılarda veya etiketlerde ara..."
                aria-label="Yazılarda veya etiketlerde ara"
                className="pl-8 h-9 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  aria-label="Aramayı temizle"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Ruh Hali Hapları */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMoodFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors shrink-0 text-[11px] font-medium ${
                  selectedMoodFilter === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                Tümü
              </button>
              {Object.values(JOURNAL_MOODS).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedMoodFilter(m.key)}
                  className={`px-2 py-1 rounded-md transition-colors shrink-0 text-[11px] font-medium flex items-center gap-1 ${
                    selectedMoodFilter === m.key
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                  title={m.label}
                  aria-label={m.label}
                >
                  <span>{m.icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Günlük Listesi (Scrollable) */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {filteredEntries.map((entry) => {
              const isSelected = entry.id === selectedEntryId && !isEditingNew
              const m = JOURNAL_MOODS[entry.mood] || JOURNAL_MOODS.calm

              return (
                <div
                  key={entry.id}
                  onClick={() => handleSelectEntry(entry)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-primary/10 border-primary/40 shadow-sm ring-1 ring-primary/20'
                      : 'bg-card/60 border-border/60 hover:bg-card hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm">{m.icon}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {entry.entry_date}
                      </span>
                      {entry.pinned && (
                        <Pin className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {entry.word_count || countWords(entry.content)} kelime
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-foreground truncate">
                    {entry.title}
                  </h4>

                  <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-1 leading-relaxed">
                    {entry.content.replace(/[#*`_~[\]()-]/g, ' ')}
                  </p>

                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted/70 text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredEntries.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-xl">
                {entries.length === 0
                  ? 'Henüz günlük kaydı oluşturulmadı. "Yeni Giriş" butonuna tıklayarak ilk günlüğünüzü yazabilirsiniz.'
                  : 'Aradığınız kriterlere uygun kayıt bulunamadı.'}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ PANEL: DAKTİLO & YAZI MASASI (lg:col-span-8) */}
        <div className={`lg:col-span-8 ${mobileTab === 'list' ? 'hidden lg:block' : 'block'}`}>
          <div className="lg:hidden flex items-center justify-between pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileTab('list')}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Arşive Dön ({filteredEntries.length})</span>
            </Button>
          </div>

          <Card className="border-border/60 bg-card/80 backdrop-blur-sm shadow-md overflow-hidden flex flex-col h-full">
            {/* Üst Bar: Tarih, Ruh Hali Seçimi, Eylemler */}
            <div className="p-4 border-b border-border/50 space-y-3 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Tarih ve Pinned Toggle */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-background/80 border border-border/70 px-2.5 py-1 rounded-lg text-xs font-medium">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <input
                      type="date"
                      value={editorDate}
                      onChange={(e) => setEditorDate(e.target.value)}
                      aria-label="Kayıt Tarihi"
                      className="bg-transparent text-foreground outline-none text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditorPinned(!editorPinned)}
                    className={`p-1.5 rounded-lg border text-xs transition-colors ${
                      editorPinned
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'border-border/60 text-muted-foreground hover:bg-muted'
                    }`}
                    title="Başa Tuttur"
                    aria-label="Başa Tuttur"
                  >
                    <Pin className={`h-3.5 w-3.5 ${editorPinned ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>

                {/* Ruh Hali Barometresi */}
                <div className="flex items-center gap-1 bg-background/60 p-1 rounded-lg border border-border/50">
                  {Object.values(JOURNAL_MOODS).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setEditorMood(m.key)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                        editorMood === m.key
                          ? `${m.color} font-semibold shadow-sm`
                          : 'text-muted-foreground hover:bg-muted/70'
                      }`}
                      title={m.label}
                      aria-label={m.label}
                    >
                      <span>{m.icon}</span>
                      <span className="hidden sm:inline text-[11px]">{m.label.split('/')[0]}</span>
                    </button>
                  ))}
                </div>

                {/* Kaydet ve Sil */}
                <div className="flex items-center gap-2">
                  {selectedEntryId && !isEditingNew && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEntryToDelete(selectedEntryId)}
                      className="h-8 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                      title="Kaydı Sil"
                      aria-label="Kaydı Sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={handleSaveEntry}
                    disabled={saveStatus === 'saving'}
                    className="gap-1.5 h-8 text-xs font-semibold"
                  >
                    {saveStatus === 'saved' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Kaydedildi</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" />
                        <span>Kaydet</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Günün Akıllı Bağlam Şeridi */}
              <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-primary/5 border border-primary/20 text-primary">
                <div className="flex items-center gap-1.5 font-medium">
                  <Compass className="h-3.5 w-3.5 shrink-0" />
                  <span>Günün Bağlamı:</span>
                  <span className="text-foreground/90 font-normal">{dayContext.summaryText}</span>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{currentReadingTime} dk okuma süresi</span>
                </div>
              </div>

              {/* Rehberli Şablon Seçici (Pills) */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <span className="text-muted-foreground shrink-0 pr-1">Şablon:</span>
                {Object.values(JOURNAL_TEMPLATES).map((tmpl) => (
                  <button
                    key={tmpl.key}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl.key)}
                    className={`px-2.5 py-0.5 rounded-full border transition-all shrink-0 flex items-center gap-1 ${
                      editorTemplate === tmpl.key
                        ? 'bg-foreground text-background font-semibold border-foreground'
                        : 'bg-background/40 text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <span>{tmpl.icon}</span>
                    <span>{tmpl.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Daktilo Masası (Editor Body) */}
            <div className="p-4 sm:p-6 flex-1 flex flex-col space-y-4">
              <Input
                value={editorTitle}
                onChange={(e) => setEditorTitle(e.target.value)}
                placeholder="Günün Başlığı..."
                aria-label="Günün Başlığı"
                className="text-lg sm:text-xl font-bold border-none shadow-none focus-visible:ring-0 px-0 bg-transparent placeholder:text-muted-foreground/40"
              />

              <textarea
                ref={textareaRef}
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                placeholder="Rüzgar nasıl esiyor? Zihninden geçenleri, şükranlarını veya günün fırtınalarını buraya dök..."
                aria-label="Günlük İçeriği"
                rows={16}
                className="w-full flex-1 bg-transparent text-foreground/90 font-sans text-sm sm:text-base leading-relaxed resize-none outline-none border-none placeholder:text-muted-foreground/40"
              />

              {/* Alt Bilgi & Etiketler */}
              <div className="pt-3 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                {/* Etiketler */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground/60" />
                  {editorTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-[11px] text-foreground/80"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-rose-400"
                        aria-label={`Etiketi kaldır: ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <div className="inline-flex items-center">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddTag()
                        }
                      }}
                      placeholder="+ etiket"
                      aria-label="Yeni etiket ekle"
                      className="bg-transparent text-[11px] w-16 outline-none text-foreground/80 placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>

                {/* Sayaç */}
                <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-[11px]">
                  <span>{currentWordCount} kelime</span>
                  <span>•</span>
                  <span>{editorContent.length} karakter</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Kayıt Silme Onay Modalı */}
      <ConfirmDialog
        isOpen={!!entryToDelete}
        onClose={() => setEntryToDelete(null)}
        onConfirm={confirmDeleteEntry}
        title="Kaydı Sil"
        description="Bu günlük kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmLabel="Kaydı Sil"
        variant="destructive"
      />

      {/* 4. Zen / Tam Ekran Yazı Modu (Distraction-Free Fullscreen) */}
      {isZenMode && (
        <div className="fixed inset-0 z-50 bg-[#0c0c0e] text-slate-100 flex flex-col p-6 sm:p-12 overflow-y-auto animate-in fade-in duration-300">
          <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-between space-y-6">
            {/* Üst Zen Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Compass className="h-4 w-4 text-primary" />
                <span>Günlük • Odak Modu</span>
                <span>•</span>
                <span>{editorDate}</span>
                <span>•</span>
                <span>{moodMeta.icon} {moodMeta.label.split(' ')[0]}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentWordCount} kelime
                </span>
                <Button
                  size="sm"
                  onClick={handleSaveEntry}
                  className="h-8 text-xs"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Kaydet
                </Button>
                <button
                  type="button"
                  onClick={() => setIsZenMode(false)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Odak Modundan Çık (Esc)"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Daktilo Metin Alanı */}
            <div className="flex-1 flex flex-col space-y-6 py-6">
              <input
                value={editorTitle}
                onChange={(e) => setEditorTitle(e.target.value)}
                placeholder="Başlık..."
                aria-label="Başlık"
                className="text-2xl sm:text-4xl font-bold bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40"
              />

              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                placeholder="Düşüncelerini buraya dök..."
                aria-label="Günlük İçeriği"
                rows={20}
                className="w-full flex-1 bg-transparent text-foreground/90 font-sans text-base sm:text-lg leading-relaxed outline-none border-none placeholder:text-muted-foreground/40 resize-none"
                autoFocus
              />
            </div>

            {/* Alt Bilgi */}
            <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Odak modundan çıkmak için <strong>ESC</strong> tuşuna basın veya sağ üstteki simgeye tıklayın.</span>
              <span>~{currentReadingTime} dakika okuma süresi</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function JournalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground text-sm">
          Günlük yükleniyor...
        </div>
      }
    >
      <JournalPageContent />
    </Suspense>
  )
}
