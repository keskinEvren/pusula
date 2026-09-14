'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Menu,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
  User,
  LogOut,
  ReceiptText,
  UploadCloud,
  HandCoins,
  FolderKanban,
  Lightbulb,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Orbit,
  BookOpen,
  CalendarCheck,
  Play,
  Pause,
  Check,
} from 'lucide-react'
import { useTimer } from '@/lib/timer-context'

interface HeaderProps {
  onOpenMobileMenu?: () => void
}

const ROUTE_LABELS: Record<string, { category: string; title: string }> = {
  '': { category: 'Genel', title: 'Genel Bakış' },
  agenda: { category: 'Çalışma', title: 'Ajanda' },
  journal: { category: 'Kişisel', title: 'Günlük' },
  dreams: { category: 'Kişisel', title: 'Hedefler' },
  routines: { category: 'Kişisel', title: 'Rutinler' },
  transactions: { category: 'Finans', title: 'Hareketler' },
  import: { category: 'Finans', title: 'Ekstre İçe Aktar' },
  imports: { category: 'Finans', title: 'Ekstre Geçmişi' },
  accounts: { category: 'Finans', title: 'Hesaplar' },
  cards: { category: 'Finans', title: 'Kredi Kartları' },
  debts: { category: 'Finans', title: 'Borç & Alacak' },
  subscriptions: { category: 'Finans', title: 'Abonelikler' },
  investments: { category: 'Finans', title: 'Yatırımlar' },
  projects: { category: 'Çalışma', title: 'Projeler' },
  ideas: { category: 'Çalışma', title: 'Fikirler' },
  settings: { category: 'Sistem', title: 'Ayarlar' },
  vault: { category: 'Sistem', title: 'Veri & Yedekleme' },
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    activeTimer,
    isRunning,
    elapsedSeconds,
    remainingSeconds,
    timerMode,
    pauseTimer,
    resumeTimer,
    completeTimer,
    formatTime,
  } = useTimer()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const quickAddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || null)
      }
    }
    getUser()
  }, [])

  // Dışarı tıklandığında hızlı ekle menüsünü kapat
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickAddRef.current && !quickAddRef.current.contains(event.target as Node)) {
        setIsQuickAddOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // F14: Clear cached user data in localStorage on sign out
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('pusula_') || key.startsWith('pusula:'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
    router.push('/login')
    router.refresh()
  }

  // Segment analizi ile breadcrumb oluşturma
  const segments = pathname.split('/').filter(Boolean)
  const primarySegment = segments[0] || ''
  const routeMeta = ROUTE_LABELS[primarySegment] || {
    category: 'Pusula',
    title: primarySegment.charAt(0).toUpperCase() + primarySegment.slice(1),
  }
  const isDeepRoute = segments.length > 1

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 px-4 sm:px-6 backdrop-blur-md">
      {/* Sol: Hamburger + Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileMenu}
          className="lg:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Menüyü Aç"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Dinamik Yol Haritası (Breadcrumb) */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground/80 hidden md:inline">
            {routeMeta.category}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 hidden md:inline" />

          <span className="font-semibold text-foreground">
            {routeMeta.title}
          </span>

          {isDeepRoute && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="font-mono text-[11px] text-primary truncate max-w-[120px] sm:max-w-[200px]">
                {segments.slice(1).join('/')}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Orta: Hareketlerde Ara Bağlantısı */}
      <div className="hidden md:flex items-center">
        <Link
          href="/transactions"
          className="flex h-9 w-64 lg:w-72 items-center justify-between rounded-lg border border-border/80 bg-muted/40 px-3 text-xs text-muted-foreground transition-all hover:bg-muted/70 hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground/80" />
            <span>Hareketlerde ara...</span>
          </div>
          <span className="text-[11px] text-muted-foreground/60 font-medium">
            Filtrele
          </span>
        </Link>
      </div>

      {/* Sağ: Canlı Sayaç + Hızlı Ekle + Durum + Kullanıcı */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Canlı Sayaç Widget'ı (Aktifse görünür) */}
        {activeTimer && (
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/25 rounded-lg px-2.5 py-1 text-xs text-foreground shadow-xs">
            <Link
              href="/agenda"
              className="flex items-center gap-1.5 font-medium hover:text-primary transition-colors"
              title="Ajandaya Git"
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  isRunning ? 'bg-primary animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="font-semibold text-[11px] truncate max-w-[80px] sm:max-w-[130px]">
                {activeTimer.projectName ? activeTimer.projectName : activeTimer.itemTitle}
              </span>
              <span className="font-mono font-bold text-xs text-primary">
                {timerMode === 'pomodoro'
                  ? formatTime(remainingSeconds)
                  : formatTime(elapsedSeconds)}
              </span>
            </Link>

            <div className="flex items-center gap-0.5 pl-1.5 border-l border-primary/25">
              {isRunning ? (
                <button
                  type="button"
                  onClick={pauseTimer}
                  className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors"
                  title="Duraklat"
                >
                  <Pause className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resumeTimer}
                  className="p-1 rounded hover:bg-primary/20 text-emerald-400 hover:text-emerald-300 transition-colors"
                  title="Devam Et"
                >
                  <Play className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => completeTimer()}
                className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-emerald-400 transition-colors"
                title="Tamamla"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* + Hızlı Ekle Dropdown */}
        <div className="relative" ref={quickAddRef}>
          <Button
            size="sm"
            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
            aria-expanded={isQuickAddOpen}
            aria-haspopup="true"
            className="h-9 gap-1.5 px-3 text-xs font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Hızlı Ekle</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>

          {isQuickAddOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 space-y-2">
              {/* Finans */}
              <div className="space-y-0.5">
                <div className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Finans
                </div>
                <Link
                  href="/transactions?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <ReceiptText className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Harcama / Gelir</span>
                </Link>
                <Link
                  href="/import"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Ekstre İçe Aktar</span>
                </Link>
                <Link
                  href="/debts?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <HandCoins className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Borç / Alacak</span>
                </Link>
                <Link
                  href="/investments?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Yatırım</span>
                </Link>
              </div>

              {/* Çalışma */}
              <div className="pt-1.5 border-t border-border/50 space-y-0.5">
                <div className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Çalışma
                </div>
                <Link
                  href="/agenda?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Ajanda Maddesi</span>
                </Link>
                <Link
                  href="/projects?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Proje</span>
                </Link>
                <Link
                  href="/ideas?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Fikir</span>
                </Link>
              </div>

              {/* Kişisel */}
              <div className="pt-1.5 border-t border-border/50 space-y-0.5">
                <div className="px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Kişisel
                </div>
                <Link
                  href="/dreams?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Hedef</span>
                </Link>
                <Link
                  href="/routines?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <Orbit className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Rutin</span>
                </Link>
                <Link
                  href="/journal?new=true"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted text-foreground/90 transition-colors group"
                >
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>Yeni Günlük Notu</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Canlı Rozet (Masaüstünde) */}
        <div className="hidden xl:flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success border border-success/30">
          <ShieldCheck className="h-3 w-3" />
          <span>Canlı</span>
        </div>

        {/* Kullanıcı Email Rozeti */}
        {userEmail && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-md border border-border/40 max-w-[140px] truncate font-mono text-[11px]">
            <User className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">{userEmail.split('@')[0]}</span>
          </div>
        )}

        {/* Çıkış Butonu */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
          title="Oturumu Kapat"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline ml-1.5">Çıkış</span>
        </Button>
      </div>
    </header>
  )
}
