'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Compass, Lock, Mail, User, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) {
        setError(error.message || 'Kayıt oluşturulamadı.')
      } else {
        setSuccess(true)
        setNeedsConfirmation(!data.session)
        if (data.session) {
          router.push('/')
          router.refresh()
        }
      }
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#090d16] overflow-hidden">
      {/* Ambient Radial Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#121622]/85 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_24px_64px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        {/* Brand Header */}
        <div className="text-center space-y-2 pb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 border border-white/20">
            <Compass className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground pt-1">Pusula'ya Katılın</h1>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Finans ve nakit akışı komuta merkezinizi oluşturun
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl bg-destructive/15 border border-destructive/30 p-3 text-xs text-destructive font-medium">
            {error}
          </div>
        )}

        {success && (
          <div role="status" aria-live="polite" className="mb-5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-400 font-medium">
            {needsConfirmation
              ? 'Kayıt isteğiniz alındı. Hesabınızı doğrulamak için e-postanızı kontrol edin; ardından giriş yapabilirsiniz.'
              : 'Hesabınız başarıyla oluşturuldu. Yönlendiriliyorsunuz...'}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="signup-fullname" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Ad Soyad
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-fullname"
                type="text"
                required
                placeholder="Evren Keskin"
                className="pl-10 h-10 rounded-xl bg-white/[0.03] border-white/[0.08] text-xs focus:border-primary/50 focus:bg-white/[0.05]"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="signup-email" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              E-posta Adresi
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-email"
                type="email"
                required
                placeholder="kurucu@sirket.com"
                className="pl-10 h-10 rounded-xl bg-white/[0.03] border-white/[0.08] text-xs focus:border-primary/50 focus:bg-white/[0.05]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="signup-password" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Şifre
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="pl-10 pr-10 h-10 rounded-xl bg-white/[0.03] border-white/[0.08] text-xs focus:border-primary/50 focus:bg-white/[0.05]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors"
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading || success}
              className="w-full h-11 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Hesap Oluşturuluyor...' : 'Kayıt Ol'}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>
          </div>
        </form>

        <div className="mt-6 pt-5 border-t border-white/[0.06] text-center text-xs text-muted-foreground">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline ml-1">
            Giriş Yapın
          </Link>
        </div>
      </div>
    </div>
  )
}
