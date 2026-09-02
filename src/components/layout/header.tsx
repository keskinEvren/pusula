'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, User, ShieldCheck } from 'lucide-react'

export function Header() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)

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

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 px-8 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success border border-success/30">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Canlı & Senkronize</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {userEmail && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border/50">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">{userEmail}</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="gap-2 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
        >
          <LogOut className="h-3.5 w-3.5" />
          Çıkış
        </Button>
      </div>
    </header>
  )
}
