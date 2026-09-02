'use client'

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
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Hareketler', href: '/transactions', icon: ReceiptText },
  { name: '📄 Ekstre Yükle', href: '/import', icon: UploadCloud },
  { name: 'Banka & Kasalar', href: '/accounts', icon: Building2 },
  { name: 'Kredi Kartları', href: '/cards', icon: CreditCard },
  { name: 'Borç & Alacak', href: '/debts', icon: HandCoins },
  { name: 'Abonelikler', href: '/subscriptions', icon: CalendarClock },
  { name: 'Projeler', href: '/projects', icon: FolderKanban },
  { name: 'Fikirler', href: '/ideas', icon: Lightbulb },
  { name: 'Ayarlar', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  // Don't show sidebar on auth pages
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return null
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border bg-card text-card-foreground">
      {/* Brand Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-foreground">
            Pusula
          </h1>
          <p className="text-xs text-muted-foreground">Finans & Proje Kokpiti</p>
        </div>
      </div>

      {/* Nav Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ana Menü
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Pusula v1.0.0</div>
          <div className="mt-0.5 text-[11px]">Kişisel Finans & Proje OS</div>
        </div>
      </div>
    </aside>
  )
}
