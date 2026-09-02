import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

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
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex flex-1 flex-col pl-64">
            <Header />
            <main className="flex-1 p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
