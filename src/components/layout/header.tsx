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
} from 'lucide-react'

interface HeaderProps {
  onOpenMobileMenu?: () => void
}

const ROUTE_LABELS: Record<string, { category: string; title: string }> = {
  '': { category: 'Genel', title: 'Komuta Merkezi' },
  transactions: { category: 'Finans', title: 'Hareketler' },
  import: { category: 'Finans', title: 'Ekstre Merkezi' },
  imports: { category: 'Finans', title: 'Ekstre Geçmişi' },
  accounts: { category: 'Finans', title: 'Banka & Kasalar' },
  cards: { category: 'Finans', title: 'Kredi Kartları' },
  debts: { category: 'Finans', title: 'Borç & Alacak' },
  subscriptions: { category: 'Finans', title: 'Tasarruf & Abonelik' },
  projects: { category: 'Stüdyo', title: 'Projeler' },
  ideas: { category: 'Stüdyo', title: 'Fikir Havuzu' },
  settings: { category: 'Sistem', title: 'Ayarlar & Kurallar' },
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
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
    router.push('/login')
    router.refresh()
  }

  // Segment analizi ile breadcrumb oluşturma
  const segments = pathname.split('/').filter(Boolean)
  const rootSegment = segments[0] || ''
  const routeMeta = ROUTE_LABELS[rootSegment] || { category: 'Sayfa', title: rootSegment }
  const isDeepRoute = segments.length > 1

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/85 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
      {/* Sol: Hamburger Butonu + Dinamik Breadcrumbs */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileMenu}
          className="lg:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Menüyü Aç"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-xs">
          <Link
            href="/"
            className="font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
          >
            Pusula
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 hidden sm:inline" />
          
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

      {/* Orta: Global Arama Çubuğu (⌘K ipucu) */}
      <div className="hidden md:flex items-center">
        <Link
          href="/transactions"
          className="flex h-9 w-64 lg:w-72 items-center justify-between rounded-lg border border-border/80 bg-muted/40 px-3 text-xs text-muted-foreground transition-all hover:bg-muted/70 hover:border-primary/40 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground/80" />
            <span>İşlem, hesap veya proje ara...</span>
          </div>
          <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Sağ: Hızlı Ekle + Durum + Kullanıcı */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* + Hızlı Ekle Dropdown */}
        <div className="relative" ref={quickAddRef}>
          <Button
            size="sm"
            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
            className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Hızlı Ekle</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>

          {isQuickAddOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
              <Link
                href="/transactions?new=true"
                onClick={() => setIsQuickAddOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                <ReceiptText className="h-3.5 w-3.5 text-primary" />
                <span>Yeni Harcama / Gelir</span>
              </Link>
              <Link
                href="/import"
                onClick={() => setIsQuickAddOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                <UploadCloud className="h-3.5 w-3.5 text-emerald-400" />
                <span>Ekstre Yükle (PDF/HTML)</span>
              </Link>
              <Link
                href="/debts?new=true"
                onClick={() => setIsQuickAddOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                <HandCoins className="h-3.5 w-3.5 text-amber-400" />
                <span>Borç / Alacak Kaydet</span>
              </Link>
              <div className="my-1 border-t border-border/50" />
              <Link
                href="/projects?new=true"
                onClick={() => setIsQuickAddOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                <FolderKanban className="h-3.5 w-3.5 text-cyan-400" />
                <span>Yeni Proje Başlat</span>
              </Link>
              <Link
                href="/ideas?new=true"
                onClick={() => setIsQuickAddOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
                <span>Hızlı Fikir Not Et</span>
              </Link>
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
