'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { BottomNav } from '@/components/layout/bottom-nav'
import { QuickCaptureSheet } from '@/components/modals/quick-capture-sheet'
import { ToastProvider } from '@/lib/toast-context'
import { TimerProvider } from '@/lib/timer-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false)

  const isAuthPage = pathname === '/login' || pathname === '/signup'

  if (isAuthPage) {
    return (
      <ToastProvider>
        <div className="min-h-screen w-full bg-background text-foreground">
          {children}
        </div>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <TimerProvider>
        <div className="flex min-h-screen bg-background text-foreground">
          <Sidebar
            isMobileOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          />
          <div className="flex flex-1 flex-col lg:pl-64 w-full min-w-0 transition-all">
            <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
            <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
              {children}
            </main>
          </div>

          {/* Mobile Bottom Navigation Bar (< lg) */}
          <BottomNav
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onOpenMenu={() => setIsMobileMenuOpen(true)}
          />

          {/* 3-Second Quick Capture Bottom Sheet */}
          <QuickCaptureSheet
            isOpen={isQuickCaptureOpen}
            onClose={() => setIsQuickCaptureOpen(false)}
          />
        </div>
      </TimerProvider>
    </ToastProvider>
  )
}
