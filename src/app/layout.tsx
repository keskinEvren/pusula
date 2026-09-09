import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/app-shell'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Pusula — Finans & Proje Kokpiti',
  description: 'Kişisel finans ve proje yönetiminin tek bir ekranda buluştuğu solo kurucu komuta merkezi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
