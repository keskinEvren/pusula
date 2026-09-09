'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ReceiptText,
  UploadCloud,
  CreditCard,
  Building2,
  HandCoins,
  CalendarClock,
  FolderKanban,
  Lightbulb,
  Settings,
  Compass,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Genel',
    items: [
      { name: 'Komuta Merkezi', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Finans & Likidite',
    items: [
      { name: 'Hareketler', href: '/transactions', icon: ReceiptText },
      { name: 'Ekstre Merkezi', href: '/import', icon: UploadCloud },
      { name: 'Banka & Kasalar', href: '/accounts', icon: Building2 },
      { name: 'Kredi Kartları', href: '/cards', icon: CreditCard },
      { name: 'Borç & Alacak', href: '/debts', icon: HandCoins },
      { name: 'Tasarruf & Abonelik', href: '/subscriptions', icon: CalendarClock },
    ],
  },
  {
    title: 'Stüdyo & Projeler',
    items: [
      { name: 'Projeler', href: '/projects', icon: FolderKanban },
      { name: 'Fikir Havuzu', href: '/ideas', icon: Lightbulb },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { name: 'Ayarlar & Kurallar', href: '/settings', icon: Settings },
    ],
  },
]

interface SidebarProps {
  isMobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()

  // Rota değiştiğinde mobilde menüyü otomatik kapat
  useEffect(() => {
    onClose?.()
  }, [pathname])

  // Auth sayfalarında sidebar'ı gösterme
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return null
  }

  const isLinkActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    if (href === '/import') {
      return pathname === '/import' || pathname.startsWith('/import/') || pathname.startsWith('/imports')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <>
      {/* Mobil Backdrop Karartması */}
      {isMobileOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Konteyneri */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 lg:w-64 flex-col border-r border-border bg-card text-card-foreground shadow-lg lg:shadow-none transition-transform duration-200 ease-in-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Logo & Kapat Butonu */}
        <div className="flex h-16 items-center justify-between border-b border-border px-5 lg:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">
                Pusula
              </h1>
              <p className="text-[11px] text-muted-foreground">Finans & Proje Kokpiti</p>
            </div>
          </Link>

          {/* Mobilde Kapat Butonu */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Menüyü Kapat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Gruplandırılmış Nav Bağlantıları */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </div>
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isLinkActive(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary-foreground' : 'text-muted-foreground')} />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="border-t border-border p-3.5">
          <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground border border-border/40">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-[11px]">Pusula v1.1</span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 border border-emerald-500/20">
                PRO
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/80">Solo Kurucu Komuta Merkezi</div>
          </div>
        </div>
      </aside>
    </>
  )
}
