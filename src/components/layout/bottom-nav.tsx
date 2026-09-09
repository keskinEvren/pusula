'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ReceiptText, Plus, Orbit, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onOpenQuickCapture: () => void
  onOpenMenu: () => void
}

export function BottomNav({ onOpenQuickCapture, onOpenMenu }: BottomNavProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b0f19]/92 backdrop-blur-xl border-t border-white/[0.08] pb-safe shadow-[0_-8px_32px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        {/* 1. Genel Bakış */}
        <Link
          href="/"
          className={cn(
            'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all',
            isActive('/')
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutDashboard className={cn('h-4 w-4', isActive('/') && 'scale-110')} />
          <span className="text-[10px] tracking-tight">Genel Bakış</span>
        </Link>

        {/* 2. Hareketler */}
        <Link
          href="/transactions"
          className={cn(
            'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all',
            isActive('/transactions')
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ReceiptText className={cn('h-4 w-4', isActive('/transactions') && 'scale-110')} />
          <span className="text-[10px] tracking-tight">Hareketler</span>
        </Link>

        {/* 3. Vurgulu Hızlı Ekle (Center FAB) */}
        <div className="flex items-center justify-center flex-1 -mt-5">
          <button
            type="button"
            onClick={onOpenQuickCapture}
            className="flex flex-col items-center justify-center h-12 w-12 rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(59,130,246,0.4)] border border-primary-foreground/20 hover:scale-105 active:scale-95 transition-all"
            aria-label="Hızlı Harcama Ekle"
          >
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </button>
        </div>

        {/* 4. Rutinler */}
        <Link
          href="/routines"
          className={cn(
            'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all',
            isActive('/routines')
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Orbit className={cn('h-4 w-4', isActive('/routines') && 'scale-110')} />
          <span className="text-[10px] tracking-tight">Rutinler</span>
        </Link>

        {/* 5. Menü (Drawer Trigger) */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-muted-foreground hover:text-foreground transition-all"
          aria-label="Tüm Menüyü Aç"
        >
          <Menu className="h-4 w-4" />
          <span className="text-[10px] tracking-tight">Menü</span>
        </button>
      </div>
    </div>
  )
}
