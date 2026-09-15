'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Compass, Lock, Mail, ArrowRight, Eye, EyeOff, ChartNoAxesColumnIncreasing, Folder, CalendarDays, Target, ShieldCheck, Github, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightTheme, setLightTheme] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message || 'Giriş yapılamadı. Bilgilerinizi kontrol edin.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page} data-theme={lightTheme ? 'light' : 'dark'}>
      <div className={styles.background} aria-hidden="true">
        <Image src="/images/login-background.webp" alt="" fill priority unoptimized sizes="100vw" />
      </div>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><Compass aria-hidden="true" /></span>
          <div><p>Pusula</p><span>Kişisel Yönetim Sistemi</span></div>
        </div>
        <Button type="button" variant="ghost" size="icon" className={styles.themeToggle}
          onClick={() => setLightTheme(!lightTheme)}
          aria-label={lightTheme ? 'Koyu temaya geç' : 'Açık temaya geç'} aria-pressed={lightTheme}>
          {lightTheme ? <Moon size={22} /> : <Sun size={22} />}
        </Button>
      </header>

      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title">Her şeyin yönü<br /><span>tek yerde.</span></h1>
          <p className={styles.description}>Finansını, projelerini, hedeflerini ve rutinlerini<br className={styles.desktopBreak} /> tek merkezden yönet.</p>
          <ul className={styles.features}>
            {[
              { icon: ChartNoAxesColumnIncreasing, label: 'Finans' },
              { icon: Folder, label: 'Projeler' },
              { icon: CalendarDays, label: 'Rutinler' },
              { icon: Target, label: 'Hedefler' },
            ].map(({ icon: Icon, label }) => <li key={label}><Icon aria-hidden="true" /><span>{label}</span></li>)}
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="login-title">
          <div className={styles.panelHeading}>
            <h2 id="login-title">Tekrar hoş geldin</h2>
            <p>Kaldığın yerden devam etmek için hesabına giriş yap.</p>
          </div>
          {error && <div role="alert" className={styles.error}>{error}</div>}
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-email">E-posta adresi</label>
              <div className={styles.inputWrap}>
                <Mail aria-hidden="true" className={styles.fieldIcon} />
                <Input id="login-email" type="email" required autoComplete="email" placeholder="ornek@sirket.com"
                  className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="login-password">Şifre</label>
              <div className={styles.inputWrap}>
                <Lock aria-hidden="true" className={styles.fieldIcon} />
                <Input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                  placeholder="••••••••" className={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.visibility}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button type="button" disabled className={styles.forgot} aria-describedby="unavailable-auth">Şifremi unuttum?</button>
            </div>
            <Button type="submit" disabled={loading} className={styles.submit}>
              <span>{loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}</span><ArrowRight size={21} aria-hidden="true" />
            </Button>
          </form>
          <div className={styles.divider}><span>veya</span></div>
          <Button type="button" variant="outline" disabled className={styles.github} aria-describedby="unavailable-auth">
            <Github size={21} aria-hidden="true" />GitHub ile Devam Et
          </Button>
          <p id="unavailable-auth" className={styles.availability}>GitHub girişi ve şifre sıfırlama henüz kullanılamıyor.</p>
          <p className={styles.signup}>Hesabın yok mu? <Link href="/signup">Kayıt Ol</Link></p>
          <p className={styles.security}><ShieldCheck size={19} aria-hidden="true" /><span>Verilerin şifreli ve güvenli şekilde saklanır.</span></p>
        </section>
      </div>
      <blockquote className={styles.quote}>“Daha planlı,<br />daha güçlü bir sen.”</blockquote>
    </main>
  )
}
