'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Search,
  Plus,
  Star,
  Globe,
  Gamepad2,
  CreditCard,
  Wifi,
  FileBadge,
  KeySquare,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Edit3,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  X,
  Mail,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import { createClient } from '@/lib/supabase/client'
import type { Credential } from '@/types/database'
import {
  type CredentialCategory,
  type DecryptedSecretPayload,
  type CustomSecretField,
  type VaultCanary,
  CATEGORY_CONFIG,
  setupMasterPassword,
  verifyMasterPassword,
  encryptSecretPayload,
  decryptSecretPayload,
  generateStrongPassword,
  generatePin,
  evaluatePasswordStrength,
  loadLocalCanary,
  saveLocalCanary,
  loadLocalCredentials,
  saveLocalCredentials,
  createSampleCredentials,
} from '@/lib/credentials-engine'

// 15 Dakika (900 saniye) Hareketsizlik Otomatik Kilit Süresi
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

export default function CredentialsPage() {
  const { toast } = useToast()

  // ---------------------------------------------------------------------------
  // Kasa Kilit & Oturum Durumu
  // ---------------------------------------------------------------------------
  const [isMounted, setIsMounted] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [canary, setCanary] = useState<VaultCanary | null>(null)
  const [isSetupMode, setIsSetupMode] = useState(false)

  // Kilit Açma / Kurulum Formu State
  const [passwordInput, setPasswordInput] = useState('')
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)

  // Otomatik Kilitlenme Zamanlayıcısı
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ---------------------------------------------------------------------------
  // Veri ve Önbellek State
  // ---------------------------------------------------------------------------
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [decryptedCache, setDecryptedCache] = useState<Record<string, DecryptedSecretPayload>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Maskeleme ve Kopyalama State
  const [revealedMap, setRevealedMap] = useState<Record<string, boolean>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const autoHideTimersRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Filtreler
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<CredentialCategory | 'all'>('all')
  const [selectedEmailFilter, setSelectedEmailFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  // Modallar
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Credential | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false)

  // Parola Değiştirme Formu
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changePasswordError, setChangePasswordError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Dinamik Form State
  const [formCategory, setFormCategory] = useState<CredentialCategory>('login')
  const [formTitle, setFormTitle] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formIsFavorite, setFormIsFavorite] = useState(false)
  const [formPrimarySecret, setFormPrimarySecret] = useState('')
  const [formSecondarySecret, setFormSecondarySecret] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSecretNotes, setFormSecretNotes] = useState('')
  const [formCustomFields, setFormCustomFields] = useState<CustomSecretField[]>([])
  const [showFormSecret, setShowFormSecret] = useState(false)

  // Entegre Parola / PIN Üretici Çekmecesi
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [generatorMode, setGeneratorMode] = useState<'password' | 'pin'>('password')
  const [genLength, setGenLength] = useState(20)
  const [genPinLength, setGenPinLength] = useState(4)
  const [genUppercase, setGenUppercase] = useState(true)
  const [genLowercase, setGenLowercase] = useState(true)
  const [genNumbers, setGenNumbers] = useState(true)
  const [genSymbols, setGenSymbols] = useState(true)
  const [generatedResult, setGeneratedResult] = useState('')

  // ---------------------------------------------------------------------------
  // 1. Yaşam Döngüsü & Başlatma
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setIsMounted(true)
    const localCanary = loadLocalCanary()
    if (localCanary) {
      setCanary(localCanary)
      setIsSetupMode(false)
    } else {
      setIsSetupMode(true)
    }
    setIsLoading(false)
  }, [])

  // Hareketsizlik Zamanlayıcısını Sıfırla
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }
    if (isUnlocked) {
      inactivityTimerRef.current = setTimeout(() => {
        handleLock()
        toast.info('Güvenlik nedeniyle 15 dakika hareketsizlik sonucu kasa otomatik kilitlendi.')
      }, INACTIVITY_TIMEOUT_MS)
    }
  }, [isUnlocked, toast])

  useEffect(() => {
    if (!isUnlocked) return

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart']
    const handler = () => resetInactivityTimer()

    events.forEach((ev) => window.addEventListener(ev, handler, { passive: true }))
    resetInactivityTimer()

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handler))
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [isUnlocked, resetInactivityTimer])

  // ---------------------------------------------------------------------------
  // 2. Kasa Kilitleme & Kilit Açma
  // ---------------------------------------------------------------------------
  const handleLock = () => {
    setMasterKey(null)
    setIsUnlocked(false)
    setDecryptedCache({})
    setRevealedMap({})
    setPasswordInput('')
    setUnlockError('')
    Object.values(autoHideTimersRef.current).forEach((t) => clearTimeout(t))
    autoHideTimersRef.current = {}
  }

  const handleSetupMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setUnlockError('')

    if (!passwordInput || passwordInput.length < 8) {
      setUnlockError('Ana parola en az 8 karakter uzunluğunda olmalıdır.')
      return
    }

    if (passwordInput !== confirmPasswordInput) {
      setUnlockError('Girdiğiniz parolalar birbiriyle eşleşmiyor.')
      return
    }

    setIsSubmittingAuth(true)
    try {
      const { canary: newCanary, key } = await setupMasterPassword(passwordInput)
      saveLocalCanary(newCanary)
      setCanary(newCanary)
      setMasterKey(key)

      // İlk kurulumda örnek verileri üret
      const saltBytes = crypto.getRandomValues(new Uint8Array(16))
      const sampleCreds = await createSampleCredentials(key, saltBytes)
      saveLocalCredentials(sampleCreds)
      setCredentials(sampleCreds)

      // Örnek verilerin şifrelerini anında önbelleğe yükle
      const initialCache: Record<string, DecryptedSecretPayload> = {}
      for (const item of sampleCreds) {
        try {
          const payload = await decryptSecretPayload(item.encrypted_payload, item.encryption_iv, key)
          initialCache[item.id] = payload
        } catch (decErr) {
          console.error('Örnek veri çözme hatası:', decErr)
        }
      }
      setDecryptedCache(initialCache)

      setIsUnlocked(true)
      setIsSetupMode(false)
      setPasswordInput('')
      setConfirmPasswordInput('')
      toast.success('Güvenlik kasası başarıyla oluşturuldu ve kilit açıldı!')
    } catch (err: any) {
      setUnlockError(err.message || 'Kasa başlatılırken bir hata oluştu.')
    } finally {
      setIsSubmittingAuth(false)
    }
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setUnlockError('')

    if (!canary) {
      setUnlockError('Kasa doğrulama verisi bulunamadı.')
      return
    }

    if (!passwordInput) {
      setUnlockError('Lütfen ana parolanızı girin.')
      return
    }

    setIsSubmittingAuth(true)
    try {
      const key = await verifyMasterPassword(passwordInput, canary)
      if (!key) {
        setUnlockError('Hatalı ana parola! Lütfen tekrar deneyin.')
        setIsSubmittingAuth(false)
        return
      }

      setMasterKey(key)
      setIsUnlocked(true)
      setPasswordInput('')

      // Verileri yükle
      await loadCredentialsAndDecrypt(key)
      toast.success('Kasa kilidi açıldı.')
    } catch (err: any) {
      setUnlockError(err.message || 'Kilit açılırken beklenmedik bir hata oluştu.')
    } finally {
      setIsSubmittingAuth(false)
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Verileri Yükleme ve Çözme
  // ---------------------------------------------------------------------------
  const loadCredentialsAndDecrypt = async (key: CryptoKey) => {
    let items: Credential[] = []
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('credentials')
          .select('*')
          .order('is_favorite', { ascending: false })
          .order('created_at', { ascending: false })

        if (!error && data && data.length > 0) {
          items = data as Credential[]
        } else {
          items = loadLocalCredentials()
        }
      } else {
        items = loadLocalCredentials()
      }
    } catch {
      items = loadLocalCredentials()
    }

    setCredentials(items)

    // Tüm kayıtların yükünü bellek içinde çöz
    const cache: Record<string, DecryptedSecretPayload> = {}
    for (const item of items) {
      try {
        const payload = await decryptSecretPayload(item.encrypted_payload, item.encryption_iv, key)
        cache[item.id] = payload
      } catch (err) {
        console.warn(`Kayıt çözülemedi (${item.title}):`, err)
      }
    }
    setDecryptedCache(cache)
  }

  // ---------------------------------------------------------------------------
  // 4. Panoya Kopyalama & Maskeleme
  // ---------------------------------------------------------------------------
  const handleCopy = (text: string, id: string, label: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success(`${label} panoya kopyalandı!`)
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr))
    }, 2000)
  }

  const toggleReveal = (id: string) => {
    setRevealedMap((prev) => {
      const next = !prev[id]
      if (next) {
        if (autoHideTimersRef.current[id]) clearTimeout(autoHideTimersRef.current[id])
        autoHideTimersRef.current[id] = setTimeout(() => {
          setRevealedMap((p) => ({ ...p, [id]: false }))
        }, 15000)
      }
      return { ...prev, [id]: next }
    })
  }

  // ---------------------------------------------------------------------------
  // 5. Favori Değiştirme & Silme
  // ---------------------------------------------------------------------------
  const toggleFavorite = async (item: Credential) => {
    const updated = credentials.map((c) => (c.id === item.id ? { ...c, is_favorite: !c.is_favorite } : c))
    setCredentials(updated)
    saveLocalCredentials(updated)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('credentials').update({ is_favorite: !item.is_favorite }).eq('id', item.id)
      }
    } catch (err) {
      console.warn('Favori güncellenemedi:', err)
    }
  }

  const handleDeleteItem = async (id: string) => {
    const updated = credentials.filter((c) => c.id !== id)
    setCredentials(updated)
    saveLocalCredentials(updated)

    setDecryptedCache((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('credentials').delete().eq('id', id)
      }
    } catch (err) {
      console.warn('Silme hatası:', err)
    }

    setDeleteConfirmId(null)
    toast.success('Kayıt kasadan silindi.')
  }

  // ---------------------------------------------------------------------------
  // 6. Kayıt Ekleme & Düzenleme Formu
  // ---------------------------------------------------------------------------
  const openAddModal = (category?: CredentialCategory) => {
    setEditingItem(null)
    setFormCategory(category || (selectedCategory !== 'all' ? selectedCategory : 'login'))
    setFormTitle('')
    setFormEmail(selectedEmailFilter || '')
    setFormUsername('')
    setFormUrl('')
    setFormIsFavorite(false)
    setFormPrimarySecret('')
    setFormSecondarySecret('')
    setFormNotes('')
    setFormSecretNotes('')
    setFormCustomFields([])
    setShowFormSecret(false)
    setIsGeneratorOpen(false)
    setIsEditModalOpen(true)
  }

  const openEditModal = (item: Credential) => {
    setEditingItem(item)
    setFormCategory(item.category as CredentialCategory)
    setFormTitle(item.title)
    setFormEmail(item.email || '')
    setFormUsername(item.username || '')
    setFormUrl(item.url || '')
    setFormIsFavorite(item.is_favorite)
    setFormNotes(item.notes || '')

    const payload = decryptedCache[item.id]
    if (payload) {
      setFormPrimarySecret(payload.primary_secret || '')
      setFormSecondarySecret(payload.secondary_secret || '')
      setFormSecretNotes(payload.secret_notes || '')
      setFormCustomFields(payload.custom_fields || [])
    } else {
      setFormPrimarySecret('')
      setFormSecondarySecret('')
      setFormSecretNotes('')
      setFormCustomFields([])
    }

    setShowFormSecret(false)
    setIsGeneratorOpen(false)
    setIsEditModalOpen(true)
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!masterKey) return

    if (!formTitle.trim()) {
      toast.error('Lütfen bir başlık girin.')
      return
    }

    if (!formPrimarySecret.trim()) {
      toast.error(`${CATEGORY_CONFIG[formCategory].primaryFieldLabel} alanı zorunludur.`)
      return
    }

    const payload: DecryptedSecretPayload = {
      primary_secret: formPrimarySecret.trim(),
      secondary_secret: formSecondarySecret.trim() || undefined,
      custom_fields: formCustomFields.length > 0 ? formCustomFields : undefined,
      secret_notes: formSecretNotes.trim() || undefined,
    }

    try {
      const encrypted = await encryptSecretPayload(payload, masterKey)
      const now = new Date().toISOString()

      let finalItem: Credential

      if (editingItem) {
        finalItem = {
          ...editingItem,
          title: formTitle.trim(),
          category: formCategory,
          email: formEmail.trim() || null,
          username: formUsername.trim() || null,
          url: formUrl.trim() || null,
          is_favorite: formIsFavorite,
          encrypted_payload: encrypted.ciphertext,
          encryption_iv: encrypted.iv,
          encryption_salt: encrypted.salt,
          notes: formNotes.trim() || null,
          updated_at: now,
        }

        const updated = credentials.map((c) => (c.id === finalItem.id ? finalItem : c))
        setCredentials(updated)
        saveLocalCredentials(updated)
      } else {
        finalItem = {
          id: crypto.randomUUID(),
          user_id: '00000000-0000-0000-0000-000000000000',
          title: formTitle.trim(),
          category: formCategory,
          email: formEmail.trim() || null,
          username: formUsername.trim() || null,
          url: formUrl.trim() || null,
          is_favorite: formIsFavorite,
          encrypted_payload: encrypted.ciphertext,
          encryption_iv: encrypted.iv,
          encryption_salt: encrypted.salt,
          notes: formNotes.trim() || null,
          created_at: now,
          updated_at: now,
        }

        const updated = [finalItem, ...credentials]
        setCredentials(updated)
        saveLocalCredentials(updated)
      }

      // Bellek içi deşifre edilmiş önbelleği güncelle
      setDecryptedCache((prev) => ({
        ...prev,
        [finalItem.id]: payload,
      }))

      // Supabase senkronizasyonu
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          finalItem.user_id = user.id
          await supabase.from('credentials').upsert(finalItem)
        }
      } catch (cloudErr) {
        console.warn('Bulut senkronizasyon uyarısı:', cloudErr)
      }

      setIsEditModalOpen(false)
      toast.success(editingItem ? 'Kayıt güncellendi ve şifrelendi.' : 'Yeni kayıt güvenle şifrelendi ve eklendi.')
    } catch (err: any) {
      toast.error(err.message || 'Kayıt şifrelenirken bir hata oluştu.')
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Özel Alan Ekleme/Çıkarma
  // ---------------------------------------------------------------------------
  const addCustomField = () => {
    setFormCustomFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', value: '', is_secret: false },
    ])
  }

  const updateCustomField = (id: string, patch: Partial<CustomSecretField>) => {
    setFormCustomFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    )
  }

  const removeCustomField = (id: string) => {
    setFormCustomFields((prev) => prev.filter((f) => f.id !== id))
  }

  // ---------------------------------------------------------------------------
  // 8. Parola / PIN Üreteci İşlemleri
  // ---------------------------------------------------------------------------
  const runGenerator = useCallback(() => {
    if (generatorMode === 'password') {
      const pwd = generateStrongPassword({
        length: genLength,
        uppercase: genUppercase,
        lowercase: genLowercase,
        numbers: genNumbers,
        symbols: genSymbols,
      })
      setGeneratedResult(pwd)
    } else {
      const pin = generatePin(genPinLength)
      setGeneratedResult(pin)
    }
  }, [generatorMode, genLength, genUppercase, genLowercase, genNumbers, genSymbols, genPinLength])

  useEffect(() => {
    if (isGeneratorOpen) {
      runGenerator()
    }
  }, [isGeneratorOpen, runGenerator])

  const applyGeneratedSecret = () => {
    if (!generatedResult) return
    setFormPrimarySecret(generatedResult)
    setShowFormSecret(true)
    setIsGeneratorOpen(false)
    toast.success('Üretilen şifre alana yerleştirildi!')
  }

  // ---------------------------------------------------------------------------
  // 9. Ana Parola Değiştirme (Re-encrypt All Records)
  // ---------------------------------------------------------------------------
  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangePasswordError('')

    if (!canary) return
    if (!oldPassword) {
      setChangePasswordError('Lütfen mevcut ana parolanızı girin.')
      return
    }
    if (!newPassword || newPassword.length < 8) {
      setChangePasswordError('Yeni parola en az 8 karakter olmalıdır.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('Yeni parolalar eşleşmiyor.')
      return
    }

    setIsChangingPassword(true)
    try {
      // 1. Eski parolayı doğrula
      const testKey = await verifyMasterPassword(oldPassword, canary)
      if (!testKey) {
        setChangePasswordError('Mevcut parola hatalı.')
        setIsChangingPassword(false)
        return
      }

      // 2. Yeni kanarya ve yeni CryptoKey üret
      const { canary: newCanary, key: newKey } = await setupMasterPassword(newPassword)

      // 3. Mevcut tüm kayıtları yeni anahtarla yeniden şifrele
      const reEncryptedItems: Credential[] = []
      const newSaltBytes = crypto.getRandomValues(new Uint8Array(16))

      for (const item of credentials) {
        const payload = decryptedCache[item.id]
        if (payload) {
          const enc = await encryptSecretPayload(payload, newKey, newSaltBytes)
          reEncryptedItems.push({
            ...item,
            encrypted_payload: enc.ciphertext,
            encryption_iv: enc.iv,
            encryption_salt: enc.salt,
            updated_at: new Date().toISOString(),
          })
        } else {
          reEncryptedItems.push(item)
        }
      }

      // 4. Kaydet
      saveLocalCanary(newCanary)
      saveLocalCredentials(reEncryptedItems)
      setCanary(newCanary)
      setMasterKey(newKey)
      setCredentials(reEncryptedItems)

      // Supabase'e toplu senkronizasyon
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user && reEncryptedItems.length > 0) {
          await supabase.from('credentials').upsert(reEncryptedItems)
        }
      } catch (err) {
        console.warn('Parola güncellemesi bulut senkron hatası:', err)
      }

      setIsChangePasswordModalOpen(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      toast.success('Ana parola başarıyla değiştirildi ve tüm kayıtlar yeni anahtarla şifrelendi!')
    } catch (err: any) {
      setChangePasswordError(err.message || 'Parola değiştirilirken bir hata oluştu.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Filtreleme & Arama Hesaplamaları
  // ---------------------------------------------------------------------------
  const emailCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of credentials) {
      if (c.email && c.email.trim()) {
        const e = c.email.trim().toLowerCase()
        counts[e] = (counts[e] || 0) + 1
      }
    }
    return counts
  }, [credentials])

  const sortedEmails = useMemo(() => {
    return Object.entries(emailCounts).sort((a, b) => b[1] - a[1])
  }, [emailCounts])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: credentials.length }
    for (const c of credentials) {
      counts[c.category] = (counts[c.category] || 0) + 1
    }
    return counts
  }, [credentials])

  const filteredCredentials = useMemo(() => {
    return credentials.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }

      if (selectedEmailFilter) {
        if (!item.email || item.email.trim().toLowerCase() !== selectedEmailFilter.toLowerCase()) {
          return false
        }
      }

      if (favoritesOnly && !item.is_favorite) {
        return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const titleMatch = item.title.toLowerCase().includes(q)
        const usernameMatch = item.username?.toLowerCase().includes(q)
        const emailMatch = item.email?.toLowerCase().includes(q)
        const urlMatch = item.url?.toLowerCase().includes(q)
        const notesMatch = item.notes?.toLowerCase().includes(q)

        return titleMatch || usernameMatch || emailMatch || urlMatch || notesMatch
      }

      return true
    })
  }, [credentials, selectedCategory, selectedEmailFilter, favoritesOnly, searchQuery])

  // ---------------------------------------------------------------------------
  // RENDER: Yükleme Ekranı
  // ---------------------------------------------------------------------------
  if (!isMounted || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Güvenlik Kasası hazırlanıyor...</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // RENDER: Kilit / Kurulum Ekranı (Master Password Gate)
  // ---------------------------------------------------------------------------
  if (!isUnlocked) {
    const passwordStrength = evaluatePasswordStrength(passwordInput)

    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] px-4">
        <div className="w-full max-w-md bg-card border border-border/70 rounded-2xl p-6 sm:p-8 shadow-sm backdrop-blur-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-primary/10 text-primary border border-primary/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <KeyRound className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isSetupMode ? 'Güvenlik Kasasını Başlat' : 'Kimlikler & Şifreler'}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isSetupMode
                ? 'Sıfır-bilgi (Zero-Knowledge) mimariyle korunan kasanız için güçlü bir ana parola belirleyin.'
                : 'Kasanız kilitli. Şifrelenmiş kayıtlarınıza erişmek için ana parolanızı girin.'}
            </p>
          </div>

          {isSetupMode ? (
            <form onSubmit={handleSetupMasterPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Yeni Ana Parola</label>
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="En az 8 karakter..."
                  autoFocus
                  required
                />
                {passwordInput.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center text-[10px] font-medium">
                      <span className="text-muted-foreground">Parola Gücü:</span>
                      <span className="font-semibold text-foreground">{passwordStrength.label}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: `${passwordStrength.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Ana Parolayı Onayla</label>
                <Input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Parolayı tekrar girin..."
                  required
                />
              </div>

              {unlockError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{unlockError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] leading-snug space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  Önemli Güvenlik Bildirimi
                </p>
                <p>
                  Parolanız cihazınızda <strong>AES-GCM-256</strong> şifreleme anahtarı üretmek için kullanılır. Pusula sunucuları şifrenizi asla görmez. Parolanızı unutursanız şifreli kayıtları kurtarmak imkansızdır.
                </p>
              </div>

              <Button
                type="submit"
                variant="default"
                className="w-full py-2.5 font-semibold"
                disabled={isSubmittingAuth}
              >
                {isSubmittingAuth ? 'Kasa Şifreleniyor...' : 'Kasayı Oluştur ve Aç'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-foreground">Ana Kasa Parolası</label>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    AES-GCM 256
                  </span>
                </div>
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Kasa parolanızı girin..."
                  autoFocus
                  required
                />
              </div>

              {unlockError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{unlockError}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="default"
                className="w-full py-2.5 font-semibold"
                disabled={isSubmittingAuth}
              >
                {isSubmittingAuth ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Çözülüyor...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Unlock className="w-4 h-4" />
                    Kasayı Aç
                  </span>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // RENDER: Ana Kasa Ekranı (Kilit Açık)
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Üst Başlık & Kontroller */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" />
              Kimlikler & Şifreler
            </h1>
            <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-[11px] font-medium flex items-center gap-1">
              <Unlock className="w-3 h-3" />
              Kasa Açık (15 dk)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Web hesapları, oyun platformları, kart PIN'leri, Wi-Fi ve resmi belgeleriniz sıfır-bilgi şifrelemeyle güvende.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsChangePasswordModalOpen(true)}
            className="text-xs h-9"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            Parola Değiştir
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLock}
            className="text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/60"
          >
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Kasayı Kilitle
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => openAddModal()}
            className="text-xs h-9 font-semibold"
          >
            <Plus className="w-4 h-4 mr-1" />
            Yeni Kayıt
          </Button>
        </div>
      </div>

      {/* 2. "Hangi E-posta?" Akıllı Filtre Hapları */}
      {sortedEmails.length > 0 && (
        <div className="space-y-2 bg-muted/30 border border-border/60 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-0.5">
            <span className="flex items-center gap-1.5 text-foreground">
              <Mail className="w-3.5 h-3.5 text-primary" />
              Hangi E-posta ile Kayıtlısınız?
            </span>
            {selectedEmailFilter && (
              <button
                onClick={() => setSelectedEmailFilter(null)}
                className="text-[11px] text-primary hover:underline"
              >
                Filtreyi Temizle
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setSelectedEmailFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 ${
                selectedEmailFilter === null
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background hover:bg-muted text-muted-foreground border border-border/70'
              }`}
            >
              Tümü ({credentials.length})
            </button>

            {sortedEmails.map(([email, count]) => (
              <button
                key={email}
                onClick={() => setSelectedEmailFilter(email === selectedEmailFilter ? null : email)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedEmailFilter === email
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-background hover:bg-muted text-foreground border border-border/70'
                }`}
              >
                <span className="truncate max-w-[200px]">{email}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedEmailFilter === email ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Arama Çubuğu & Kategori Sekmeleri */}
      <div className="space-y-3">
        {/* Arama & Favori Butonu */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Başlık, kullanıcı adı, e-posta veya web sitesi ara..."
              className="pl-9 h-10 text-sm bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button
            variant={favoritesOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFavoritesOnly((v) => !v)}
            className="h-10 text-xs shrink-0 font-medium"
          >
            <Star className={`w-3.5 h-3.5 mr-1.5 ${favoritesOnly ? 'fill-current text-amber-300' : 'text-amber-500'}`} />
            Sadece Favoriler
          </Button>
        </div>

        {/* Kategori Butonları */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-foreground text-background shadow-sm'
                : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Tümü ({categoryCounts.all || 0})
          </button>

          {(Object.keys(CATEGORY_CONFIG) as CredentialCategory[]).map((catKey) => {
            const cfg = CATEGORY_CONFIG[catKey]
            const count = categoryCounts[catKey] || 0
            const isSelected = selectedCategory === catKey

            return (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-foreground text-background shadow-sm font-semibold'
                    : 'bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{cfg.shortLabel}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-background/20 text-background' : 'bg-background text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 4. Kayıt Listesi / Kartlar Grid */}
      {filteredCredentials.length === 0 ? (
        <div className="bg-card border border-border/70 rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Kayıt Bulunamadı</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'all' || selectedEmailFilter || favoritesOnly
                ? 'Seçili filtrelere uygun kayıt yok. Filtreleri temizlemeyi deneyin.'
                : 'Bu kasada henüz kayıt bulunmuyor. İlk şifrenizi ekleyin!'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openAddModal(selectedCategory !== 'all' ? selectedCategory : 'login')}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Kayıt Ekle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCredentials.map((item) => {
            const cfg = CATEGORY_CONFIG[item.category as CredentialCategory] || CATEGORY_CONFIG.login
            const payload = decryptedCache[item.id]
            const isRevealed = revealedMap[item.id]
            const primarySecret = payload?.primary_secret || ''
            const secondarySecret = payload?.secondary_secret || ''

            return (
              <div
                key={item.id}
                className="bg-card border border-border/70 hover:border-border rounded-xl p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between space-y-3 relative group"
              >
                {/* Kart Üst Kısım: İkon + Başlık + Favori */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${cfg.badgeClass}`}>
                        {item.category === 'login' && <Globe className="w-4 h-4" />}
                        {item.category === 'gaming' && <Gamepad2 className="w-4 h-4" />}
                        {item.category === 'card_pin' && <CreditCard className="w-4 h-4" />}
                        {item.category === 'wifi' && <Wifi className="w-4 h-4" />}
                        {item.category === 'identity' && <FileBadge className="w-4 h-4" />}
                        {item.category === 'license' && <KeySquare className="w-4 h-4" />}
                        {item.category === 'note' && <Lock className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-foreground truncate">{item.title}</h3>
                        <p className="text-[11px] text-muted-foreground truncate">{cfg.shortLabel}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleFavorite(item)}
                        className="p-1 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-muted transition-colors"
                        title={item.is_favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                      >
                        <Star className={`w-4 h-4 ${item.is_favorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Kimlik Bilgileri: Kullanıcı Adı / E-posta */}
                  <div className="space-y-1 pt-1 text-xs">
                    {item.username && (
                      <div className="flex items-center justify-between text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md">
                        <span className="truncate font-mono text-foreground font-medium">{item.username}</span>
                        <button
                          onClick={() => handleCopy(item.username!, `u-${item.id}`, 'Kullanıcı adı')}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Kullanıcı adını kopyala"
                        >
                          {copiedId === `u-${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}

                    {item.email && (
                      <div className="flex items-center justify-between text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md">
                        <span className="truncate text-[11px]">{item.email}</span>
                        <button
                          onClick={() => handleCopy(item.email!, `e-${item.id}`, 'E-posta')}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="E-postayı kopyala"
                        >
                          {copiedId === `e-${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Gizli Veri Alanı (Şifre / PIN / Lisans) */}
                  <div className="pt-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1">
                      <span>{cfg.primaryFieldLabel}:</span>
                      {isRevealed && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          (15 sn otomatik gizleme)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between bg-card border border-border/80 rounded-lg px-2.5 py-1.5 shadow-inner">
                      <span className="font-mono text-xs font-semibold tracking-wider text-foreground truncate select-all">
                        {isRevealed ? primarySecret || '(Boş)' : '••••••••••••••••'}
                      </span>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => toggleReveal(item.id)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title={isRevealed ? 'Gizle' : 'Göster'}
                        >
                          {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => handleCopy(primarySecret, `p-${item.id}`, cfg.primaryFieldLabel)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Şifreyi kopyala"
                        >
                          {copiedId === `p-${item.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* İkincil Gizli Veri (Varsa) */}
                  {secondarySecret && (
                    <div className="pt-0.5">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>{cfg.secondaryFieldLabel || 'İkincil Kod'}:</span>
                      </div>
                      <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded px-2 py-1 text-xs font-mono">
                        <span className="truncate">{isRevealed ? secondarySecret : '••••••'}</span>
                        <button
                          onClick={() => handleCopy(secondarySecret, `s-${item.id}`, cfg.secondaryFieldLabel || 'Kod')}
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          title="Kopyala"
                        >
                          {copiedId === `s-${item.id}` ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Özel Alanlar (Varsa) */}
                  {payload?.custom_fields && payload.custom_fields.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {payload.custom_fields.map((cf) => (
                        <span
                          key={cf.id}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/50 max-w-full truncate"
                          title={`${cf.label}: ${cf.value}`}
                        >
                          <span className="font-medium text-foreground">{cf.label}:</span>
                          <span className="truncate font-mono">
                            {cf.is_secret && !isRevealed ? '••••' : cf.value}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Gizli Notlar Snippet */}
                  {payload?.secret_notes && (
                    <p className="text-[11px] text-muted-foreground italic line-clamp-2 pt-1 border-t border-border/40">
                      {payload.secret_notes}
                    </p>
                  )}
                </div>

                {/* Kart Alt Çubuk: Hızlı Açılış URL + Düzenle / Sil */}
                <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                  <div>
                    {item.url ? (
                      <a
                        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-[11px] font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Giriş Yap
                      </a>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 font-mono">
                        {new Date(item.created_at).toLocaleDateString('tr-TR')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(item)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Düzenle
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(item.id)}
                      className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 5. Kayıt Ekleme / Düzenleme Modalı */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingItem ? 'Kaydı Düzenle' : 'Yeni Güvenli Kayıt Ekle'}
        description="Verileriniz sıfır-bilgi istemci tarafı AES-GCM-256 ile şifrelenir."
        size="xl"
      >
        <form onSubmit={handleSaveItem} className="space-y-4 pt-1">
          {/* Kategori Seçimi */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Kategori</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.keys(CATEGORY_CONFIG) as CredentialCategory[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat]
                const isSelected = formCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left flex items-center gap-1.5 ${
                      isSelected
                        ? `${cfg.badgeClass} ring-1 ring-primary/40 font-semibold shadow-xs`
                        : 'bg-card hover:bg-muted text-muted-foreground border-border/70'
                    }`}
                  >
                    <span>{cfg.shortLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Oyun Kategorisi Hızlı Önayarları */}
          {formCategory === 'gaming' && (
            <div className="space-y-1 bg-muted/40 p-2 rounded-lg border border-border/60">
              <span className="text-[11px] font-semibold text-muted-foreground">Popüler Oyun Platformları:</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { name: 'Steam', url: 'https://store.steampowered.com' },
                  { name: 'Epic Games', url: 'https://store.epicgames.com' },
                  { name: 'Riot Games', url: 'https://auth.riotgames.com' },
                  { name: 'PlayStation Network', url: 'https://my.playstation.com' },
                  { name: 'Xbox / Microsoft', url: 'https://xbox.com' },
                  { name: 'Battle.net', url: 'https://battle.net' },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setFormTitle(preset.name)
                      setFormUrl(preset.url)
                    }}
                    className="px-2 py-0.5 rounded text-[11px] bg-background hover:bg-muted text-foreground border border-border/70 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Başlık & URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Kayıt Başlığı <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  formCategory === 'wifi'
                    ? 'Ev Wi-Fi 5G'
                    : formCategory === 'card_pin'
                    ? 'Garanti BBVA Bonus'
                    : formCategory === 'identity'
                    ? 'T.C. Kimlik Kartı'
                    : formCategory === 'license'
                    ? 'JetBrains IntelliJ'
                    : 'Google / GitHub vb.'
                }
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                {formCategory === 'wifi' ? 'Modem Paneli Adresi' : 'Web / Giriş Adresi (URL)'}
              </label>
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder={formCategory === 'wifi' ? 'http://192.168.1.1' : 'https://...'}
              />
            </div>
          </div>

          {/* Kullanıcı Adı & E-posta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                {formCategory === 'gaming'
                  ? 'Gamer Tag / Oyuncu Adı'
                  : formCategory === 'wifi'
                  ? 'Ağ Adı (SSID)'
                  : formCategory === 'identity'
                  ? 'Belge Sahibi Adı'
                  : formCategory === 'card_pin'
                  ? 'Kart Açıklaması / Son 4 Hane'
                  : 'Kullanıcı Adı'}
              </label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder={
                  formCategory === 'wifi'
                    ? 'Keskin_5G'
                    : formCategory === 'card_pin'
                    ? 'Son 4 Hane: 4921'
                    : 'Kullanıcı adı'
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Bağlı E-posta Adresi
              </label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="ornek@domain.com"
              />
            </div>
          </div>

          {/* BİRİNCİL ŞİFRE / GİZLİ VERİ + ÜRETİCİ */}
          <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-primary" />
                {CATEGORY_CONFIG[formCategory].primaryFieldLabel} <span className="text-rose-500">*</span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsGeneratorOpen((v) => !v)}
                className="h-7 text-[11px] font-medium text-primary hover:text-primary-foreground hover:bg-primary"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {isGeneratorOpen ? 'Üreteci Kapat' : '🔑 Parola / PIN Üret'}
              </Button>
            </div>

            <div className="relative">
              <Input
                type={showFormSecret ? 'text' : 'password'}
                value={formPrimarySecret}
                onChange={(e) => setFormPrimarySecret(e.target.value)}
                placeholder={CATEGORY_CONFIG[formCategory].primaryPlaceholder}
                className="font-mono text-sm pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowFormSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showFormSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Parola Gücü Göstergesi */}
            {formPrimarySecret && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>Şifre Gücü:</span>
                <span className="font-semibold text-foreground">
                  {evaluatePasswordStrength(formPrimarySecret).label}
                </span>
              </div>
            )}

            {/* AÇILIR ŞİFRE / PIN ÜRETİCİ PANELİ */}
            {isGeneratorOpen && (
              <div className="mt-3 p-3 bg-card border border-border rounded-xl space-y-3 shadow-sm animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Rastgele Güvenli Üreteç</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setGeneratorMode('password')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        generatorMode === 'password' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      Güçlü Şifre
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeneratorMode('pin')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        generatorMode === 'pin' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      PIN (Sayısal)
                    </button>
                  </div>
                </div>

                {/* Üretilen Sonuç Kutusu */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60 border border-border/80">
                  <span className="font-mono text-xs font-bold text-foreground select-all truncate">
                    {generatedResult}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={runGenerator}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Yeniden Üret"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyGeneratedSecret}
                      className="h-6 px-2 text-[11px] bg-primary text-primary-foreground font-semibold"
                    >
                      Kullan
                    </Button>
                  </div>
                </div>

                {/* Kontroller */}
                {generatorMode === 'password' ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span>Uzunluk: {genLength} karakter</span>
                      <input
                        type="range"
                        min="8"
                        max="40"
                        value={genLength}
                        onChange={(e) => setGenLength(Number(e.target.value))}
                        className="w-36 accent-primary"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genUppercase}
                          onChange={(e) => setGenUppercase(e.target.checked)}
                          className="rounded accent-primary"
                        />
                        Büyük Harf (A-Z)
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genLowercase}
                          onChange={(e) => setGenLowercase(e.target.checked)}
                          className="rounded accent-primary"
                        />
                        Küçük Harf (a-z)
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genNumbers}
                          onChange={(e) => setGenNumbers(e.target.checked)}
                          className="rounded accent-primary"
                        />
                        Rakam (0-9)
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genSymbols}
                          onChange={(e) => setGenSymbols(e.target.checked)}
                          className="rounded accent-primary"
                        />
                        Semboller (!@#$)
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs">
                    <span>PIN Hane Sayısı:</span>
                    <div className="flex gap-1.5">
                      {[4, 6, 8].map((digits) => (
                        <button
                          key={digits}
                          type="button"
                          onClick={() => setGenPinLength(digits)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold ${
                            genPinLength === digits ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                          }`}
                        >
                          {digits} Haneli
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* İkincil Gizli Veri (Opsiyonel) */}
          {CATEGORY_CONFIG[formCategory].secondaryFieldLabel && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                {CATEGORY_CONFIG[formCategory].secondaryFieldLabel} (Opsiyonel)
              </label>
              <Input
                type="text"
                value={formSecondarySecret}
                onChange={(e) => setFormSecondarySecret(e.target.value)}
                placeholder={CATEGORY_CONFIG[formCategory].secondaryPlaceholder}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Dinamik Özel Alanlar (Custom Fields) */}
          <div className="space-y-2 pt-1 border-t border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Özel Alanlar (Custom Fields)</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomField}
                className="h-6 px-2 text-[11px]"
              >
                <Plus className="w-3 h-3 mr-1" />
                Alan Ekle
              </Button>
            </div>

            {formCustomFields.map((field) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  value={field.label}
                  onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                  placeholder="Etiket (örn: 2FA Kodu)"
                  className="h-8 text-xs flex-1"
                />
                <Input
                  value={field.value}
                  onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                  placeholder="Değer"
                  className="h-8 text-xs flex-1 font-mono"
                />
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.is_secret}
                    onChange={(e) => updateCustomField(field.id, { is_secret: e.target.checked })}
                    className="rounded accent-primary"
                  />
                  Gizle
                </label>
                <button
                  type="button"
                  onClick={() => removeCustomField(field.id)}
                  className="p-1 text-muted-foreground hover:text-rose-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Gizli Notlar */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Gizli Notlar (AES-GCM Şifreli)</label>
            <textarea
              value={formSecretNotes}
              onChange={(e) => setFormSecretNotes(e.target.value)}
              placeholder="Yalnızca kasayı açtığınızda görülebilen çok satırlı gizli notlar..."
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          {/* Favori Seçeneği */}
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={formIsFavorite}
              onChange={(e) => setFormIsFavorite(e.target.checked)}
              className="rounded accent-primary"
            />
            Bu kaydı favorilere ekle (en üstte göster)
          </label>

          {/* Butonlar */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              className="font-semibold"
            >
              {editingItem ? 'Kaydet & Güncelle' : 'Şifrele & Kasaya Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. Ana Parola Değiştirme Modalı */}
      <Modal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        title="Ana Kasa Parolasını Değiştir"
        description="Mevcut tüm kayıtlarınız yeni parolanızdan türetilen yeni AES-GCM 256 anahtarıyla baştan şifrelenecektir."
        size="md"
      >
        <form onSubmit={handleChangeMasterPassword} className="space-y-4 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Mevcut Ana Parola</label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Mevcut parolanızı girin..."
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Yeni Ana Parola</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="En az 8 karakter..."
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Yeni Parolayı Onayla</label>
            <Input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Yeni parolayı tekrar girin..."
              required
            />
          </div>

          {changePasswordError && (
            <div className="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {changePasswordError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsChangePasswordModalOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isChangingPassword}
              className="font-semibold"
            >
              {isChangingPassword ? 'Yeniden Şifreleniyor...' : 'Parolayı Güncelle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. Silme Onay Modalı */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmId)}
        title="Kaydı Kasadan Sil"
        description="Bu güvenli kaydı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmLabel="Evet, Sil"
        cancelLabel="Vazgeç"
        variant="destructive"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await handleDeleteItem(deleteConfirmId)
          }
        }}
        onClose={() => setDeleteConfirmId(null)}
      />
    </div>
  )
}
