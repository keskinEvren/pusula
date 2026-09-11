'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  Download,
  Upload,
  Lock,
  Unlock,
  Key,
  Database,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  FolderArchive,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  X,
  FileCode,
  Layers,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import {
  PusulaVaultData,
  VaultPayload,
  EMPTY_VAULT_DATA,
  VAULT_TABLE_LABELS,
  createVaultPayload,
  validateVaultPayload,
  encryptVaultData,
  decryptVaultData,
  calculateMergeDiff,
  executeMerge,
  triggerDownload,
} from '@/lib/vault-engine'

// Helper to fetch all rows using pagination to avoid the 1000-row PostgREST ceiling
async function fetchAllRows(supabase: any, tableName: string): Promise<any[]> {
  const PAGE_SIZE = 1000
  let allRows: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      console.warn(`Could not fetch table ${tableName}:`, error.message)
      return []
    }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows
}

async function upsertInChunks(supabase: any, table: string, rows: any[], chunkSize = 200) {
  if (!rows || rows.length === 0) return
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk)
    if (error) throw new Error(`[${table}] yüklenirken hata: ${error.message}`)
  }
}

function VaultPageContent() {
  const { toast } = useToast()
  const [vaultData, setVaultData] = useState<PusulaVaultData>(EMPTY_VAULT_DATA)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'export' | 'restore' | 'diagnostics'>('export')

  // Dışa Aktarma Formu
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null)

  // Geri Yükleme Formu
  const [dragActive, setDragActive] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedRawBytes, setUploadedRawBytes] = useState<Uint8Array | null>(null)
  const [isEncryptedFile, setIsEncryptedFile] = useState(false)
  const [restorePassword, setRestorePassword] = useState('')
  const [validationResult, setValidationResult] = useState<any>(null)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge')
  const [isRestoring, setIsRestoring] = useState(false)
  const [isConfirmRestoreOpen, setIsConfirmRestoreOpen] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null)
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null)
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 1. Tüm Tabloları Yükleme (Supabase + LocalStorage Fallback, 1000 satır tavan korumalı)
  useEffect(() => {
    async function fetchAllVaultData() {
      setIsLoading(true)
      const supabase = createClient()
      const data: PusulaVaultData = { ...EMPTY_VAULT_DATA }

      try {
        const [
          accs,
          cards,
          statements,
          txs,
          debts,
          subs,
          maps,
          invs,
          projs,
          tasks,
          ideas,
          dreams,
          routines,
          rLogs,
          journals,
          imports,
        ] = await Promise.all([
          fetchAllRows(supabase, 'accounts'),
          fetchAllRows(supabase, 'credit_cards'),
          fetchAllRows(supabase, 'card_statements'),
          fetchAllRows(supabase, 'transactions'),
          fetchAllRows(supabase, 'debts'),
          fetchAllRows(supabase, 'subscriptions'),
          fetchAllRows(supabase, 'merchant_mappings'),
          fetchAllRows(supabase, 'investments'),
          fetchAllRows(supabase, 'projects'),
          fetchAllRows(supabase, 'project_tasks'),
          fetchAllRows(supabase, 'ideas'),
          fetchAllRows(supabase, 'dreams'),
          fetchAllRows(supabase, 'routines'),
          fetchAllRows(supabase, 'routine_logs'),
          fetchAllRows(supabase, 'journal_entries'),
          fetchAllRows(supabase, 'statement_imports'),
        ])

        if (accs) data.accounts = accs
        if (cards) data.credit_cards = cards
        if (statements) data.card_statements = statements
        if (txs) data.transactions = txs
        if (debts) data.debts = debts
        if (subs) data.subscriptions = subs
        if (maps) data.merchant_mappings = maps
        if (invs) data.investments = invs
        if (projs) data.projects = projs
        if (tasks) data.project_tasks = tasks
        if (ideas) data.ideas = ideas
        if (imports) data.statement_imports = imports

        // LocalStorage fallback'leri birleştir
        if (dreams && dreams.length > 0) data.dreams = dreams
        else {
          const lD = localStorage.getItem('pusula_local_dreams')
          if (lD) try { data.dreams = JSON.parse(lD) } catch {}
        }

        if (routines && routines.length > 0) data.routines = routines
        else {
          const lR = localStorage.getItem('pusula_local_routines')
          if (lR) try { data.routines = JSON.parse(lR) } catch {}
        }

        if (rLogs && rLogs.length > 0) data.routine_logs = rLogs
        else {
          const lRl = localStorage.getItem('pusula_local_routine_logs')
          if (lRl) try { data.routine_logs = JSON.parse(lRl) } catch {}
        }

        if (journals && journals.length > 0) data.journal_entries = journals
        else {
          const lJ = localStorage.getItem('pusula_local_journal_entries')
          if (lJ) try { data.journal_entries = JSON.parse(lJ) } catch {}
        }

        setVaultData(data)
      } catch (err) {
        console.error('Vault data fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllVaultData()
  }, [])

  // -------------------------------------------------------------------------
  // DIŞA AKTARMA (EXPORT)
  // -------------------------------------------------------------------------
  async function handleExportVault() {
    if (isEncrypted) {
      if (!exportPassword || exportPassword.length < 6) {
        toast.warning('Şifreli yedek için en az 6 karakterli bir parola belirlemelisiniz.')
        return
      }
      if (exportPassword !== exportPasswordConfirm) {
        toast.warning('Girdiğiniz parolalar birbiriyle eşleşmiyor.')
        return
      }
    }

    setIsExporting(true)
    setExportSuccessMsg(null)

    try {
      const payload = createVaultPayload(vaultData)
      const jsonString = JSON.stringify(payload, null, 2)
      const dateStr = new Date().toISOString().split('T')[0]

      if (isEncrypted) {
        // PBKDF2 + AES-GCM ile şifrele
        const encryptedBytes = await encryptVaultData(jsonString, exportPassword)
        triggerDownload(
          encryptedBytes.buffer as ArrayBuffer,
          `pusula-vault-encrypted-${dateStr}.vault`,
          'application/octet-stream'
        )
        const msg = 'Kişisel Kasa yedeğiniz parola ile şifrelenerek (.vault) başarıyla indirildi.'
        setExportSuccessMsg(msg)
        toast.success(msg)
      } else {
        triggerDownload(
          jsonString,
          `pusula-vault-backup-${dateStr}.json`,
          'application/json'
        )
        const msg = 'Kişisel Kasa yedeğiniz (.json) başarıyla bilgisayarınıza indirildi.'
        setExportSuccessMsg(msg)
        toast.success(msg)
      }
    } catch (err: any) {
      toast.error(`Dışa aktarma hatası: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  // -------------------------------------------------------------------------
  // GERİ YÜKLEME (RESTORE) DOSYA İŞLEME
  // -------------------------------------------------------------------------
  async function handleFileProcess(file: File) {
    setUploadedFile(file)
    setRestoreErrorMsg(null)
    setRestoreSuccessMsg(null)
    setValidationResult(null)

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    setUploadedRawBytes(bytes)

    // Dosyanın şifreli .vault formatında olup olmadığını kontrol et
    const dec = new TextDecoder()
    const headerSlice = dec.decode(bytes.slice(0, 16)).trim()

    if (headerSlice === 'PUSULA_VAULT_V1' || file.name.endsWith('.vault')) {
      setIsEncryptedFile(true)
      // Parola girilmesi beklenir
    } else {
      setIsEncryptedFile(false)
      try {
        const text = dec.decode(bytes)
        const res = validateVaultPayload(text)
        setValidationResult(res)
        if (!res.isValid) {
          setRestoreErrorMsg(res.error || 'Dosya geçerli bir Pusula yedeği değil.')
        }
      } catch (err: any) {
        setRestoreErrorMsg('Dosya JSON formatında okunamadı.')
      }
    }
  }

  async function handleDecryptAndValidate() {
    if (!uploadedRawBytes || !restorePassword) return
    setRestoreErrorMsg(null)

    try {
      const decryptedJson = await decryptVaultData(uploadedRawBytes, restorePassword)
      const res = validateVaultPayload(decryptedJson)
      setValidationResult(res)
      if (!res.isValid) {
        setRestoreErrorMsg(res.error || 'Şifre çözüldü ancak veri formatı doğrulanamadı.')
      }
    } catch (err: any) {
      setRestoreErrorMsg(err.message || 'Hatalı parola veya bozuk dosya.')
    }
  }

  function handleExecuteRestore() {
    if (!validationResult?.isValid || !validationResult.payload) return
    setIsConfirmRestoreOpen(true)
  }

  async function confirmAndExecuteRestore() {
    if (!validationResult?.isValid || !validationResult.payload) return
    setIsConfirmRestoreOpen(false)
    setIsRestoring(true)
    setRestoreProgress('Veriler hazırlanıyor...')

    try {
      const incomingData: PusulaVaultData = validationResult.payload.data
      let finalData: PusulaVaultData

      if (restoreMode === 'replace') {
        finalData = incomingData
      } else {
        finalData = executeMerge(vaultData, incomingData)
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // LocalStorage'daki tabloları anında senkronize et
      setRestoreProgress('Yerel önbellek senkronize ediliyor...')
      localStorage.setItem('pusula_local_dreams', JSON.stringify(finalData.dreams || []))
      localStorage.setItem('pusula_local_routines', JSON.stringify(finalData.routines || []))
      localStorage.setItem('pusula_local_routine_logs', JSON.stringify(finalData.routine_logs || []))
      localStorage.setItem('pusula_local_journal_entries', JSON.stringify(finalData.journal_entries || []))

      // Supabase tablolarına opsiyonel upsert
      if (user) {
        if (restoreMode === 'replace') {
          setRestoreProgress('Mevcut bulut verileri temizleniyor (replace modu)...')
          // Ters FK bağımlılık sırasıyla temizleme
          // Seviye 3 (Yapraklar):
          const delTxs = await supabase.from('transactions').delete().eq('user_id', user.id)
          if (delTxs.error) throw new Error(`transactions silinirken hata: ${delTxs.error.message}`)

          const delRLogs = await supabase.from('routine_logs').delete().eq('user_id', user.id)
          if (delRLogs.error) throw new Error(`routine_logs silinirken hata: ${delRLogs.error.message}`)

          const delStmts = await supabase.from('card_statements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          if (delStmts.error) console.warn('card_statements cleanup warning:', delStmts.error.message)

          // Seviye 2:
          const delImports = await supabase.from('statement_imports').delete().eq('user_id', user.id)
          if (delImports.error) throw new Error(`statement_imports silinirken hata: ${delImports.error.message}`)

          const delTasks = await supabase.from('project_tasks').delete().eq('user_id', user.id)
          if (delTasks.error) throw new Error(`project_tasks silinirken hata: ${delTasks.error.message}`)

          const delIdeas = await supabase.from('ideas').delete().eq('user_id', user.id)
          if (delIdeas.error) throw new Error(`ideas silinirken hata: ${delIdeas.error.message}`)

          const delSubs = await supabase.from('subscriptions').delete().eq('user_id', user.id)
          if (delSubs.error) throw new Error(`subscriptions silinirken hata: ${delSubs.error.message}`)

          const delDebts = await supabase.from('debts').delete().eq('user_id', user.id)
          if (delDebts.error) throw new Error(`debts silinirken hata: ${delDebts.error.message}`)

          const delRoutines = await supabase.from('routines').delete().eq('user_id', user.id)
          if (delRoutines.error) throw new Error(`routines silinirken hata: ${delRoutines.error.message}`)

          // Seviye 1 (Kökler):
          const delJournals = await supabase.from('journal_entries').delete().eq('user_id', user.id)
          if (delJournals.error) throw new Error(`journal_entries silinirken hata: ${delJournals.error.message}`)

          const delMaps = await supabase.from('merchant_mappings').delete().eq('user_id', user.id)
          if (delMaps.error) throw new Error(`merchant_mappings silinirken hata: ${delMaps.error.message}`)

          const delInvs = await supabase.from('investments').delete().eq('user_id', user.id)
          if (delInvs.error) throw new Error(`investments silinirken hata: ${delInvs.error.message}`)

          const delDreams = await supabase.from('dreams').delete().eq('user_id', user.id)
          if (delDreams.error) throw new Error(`dreams silinirken hata: ${delDreams.error.message}`)

          const delProjs = await supabase.from('projects').delete().eq('user_id', user.id)
          if (delProjs.error) throw new Error(`projects silinirken hata: ${delProjs.error.message}`)

          const delCards = await supabase.from('credit_cards').delete().eq('user_id', user.id)
          if (delCards.error) throw new Error(`credit_cards silinirken hata: ${delCards.error.message}`)

          const delAccs = await supabase.from('accounts').delete().eq('user_id', user.id)
          if (delAccs.error) throw new Error(`accounts silinirken hata: ${delAccs.error.message}`)
        }

        // Düzgün FK sırasıyla yükleme (Level 1 -> Level 2 -> Level 3):
        setRestoreProgress('Temel kayıtlar geri yükleniyor (Seviye 1)...')
        await upsertInChunks(supabase, 'accounts', finalData.accounts)
        await upsertInChunks(supabase, 'credit_cards', finalData.credit_cards)
        await upsertInChunks(supabase, 'projects', finalData.projects)
        await upsertInChunks(supabase, 'dreams', finalData.dreams)
        await upsertInChunks(supabase, 'investments', finalData.investments)
        await upsertInChunks(supabase, 'merchant_mappings', finalData.merchant_mappings)
        await upsertInChunks(supabase, 'journal_entries', finalData.journal_entries)
        await upsertInChunks(supabase, 'routines', finalData.routines)

        setRestoreProgress('Bağlantılı kayıtlar geri yükleniyor (Seviye 2)...')
        await upsertInChunks(supabase, 'statement_imports', finalData.statement_imports)
        await upsertInChunks(supabase, 'debts', finalData.debts)
        await upsertInChunks(supabase, 'subscriptions', finalData.subscriptions)
        await upsertInChunks(supabase, 'project_tasks', finalData.project_tasks)
        await upsertInChunks(supabase, 'ideas', finalData.ideas)

        setRestoreProgress('İşlem ve hareket kayıtları geri yükleniyor (Seviye 3)...')
        await upsertInChunks(supabase, 'card_statements', finalData.card_statements)
        await upsertInChunks(supabase, 'routine_logs', finalData.routine_logs)
        await upsertInChunks(supabase, 'transactions', finalData.transactions)
      }

      setVaultData(finalData)
      const successText = `Başarılı! ${validationResult.payload.manifest.total_records} kayıt başarıyla geri yüklendi ve kasanız güncellendi.`
      setRestoreSuccessMsg(successText)
      toast.success(successText)
      setUploadedFile(null)
      setValidationResult(null)
    } catch (err: any) {
      const errText = `Geri yükleme sırasında hata oluştu: ${err.message}`
      setRestoreErrorMsg(errText)
      toast.error(errText)
    } finally {
      setIsRestoring(false)
      setRestoreProgress(null)
    }
  }

  // Metrikler
  const currentManifest = createVaultPayload(vaultData).manifest
  const mergeDiff = validationResult?.payload?.data
    ? calculateMergeDiff(vaultData, validationResult.payload.data)
    : []

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-muted/60 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/30 rounded-xl border border-border/40" />
          ))}
        </div>
        <div className="h-96 bg-muted/20 rounded-xl border border-border/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık ve Rozet */}
      <PageHeader
        title="Veri ve Yedekleme"
        description="Tüm finansal hareketlerinizi, projelerinizi ve sistem kayıtlarınızı tek dosyada yedekleyin veya geri yükleyin."
        badge={
          <span className="flex items-center gap-1.5 text-xs text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>İstemci Tarafı Şifreleme</span>
          </span>
        }
      />

      {/* 2. Unified Segmented Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Toplam Kayıt
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {currentManifest.total_records.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">Tüm tablolardaki kayıtlar</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Kapsanan Modüller
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {Object.keys(VAULT_TABLE_LABELS).length} Modül
          </div>
          <p className="text-[11px] text-muted-foreground">İlişkili veritabanı tabloları</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Tahmini Boyut
          </p>
          <div className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            ~{currentManifest.estimated_size_kb} KB
          </div>
          <p className="text-[11px] text-muted-foreground">Sıkıştırılmamış JSON hacmi</p>
        </div>

        <div className="p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Güvenlik Standardı
          </p>
          <div className="text-lg font-semibold tracking-tight text-foreground">
            AES-GCM-256
          </div>
          <p className="text-[11px] text-muted-foreground">PBKDF2 anahtar türetimi</p>
        </div>
      </div>

      {/* 3. Sekme Navigasyonu */}
      <div role="tablist" aria-label="Kasa İşlemleri" className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'export'}
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'export'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Download className="h-3.5 w-3.5" />
          <span>Yedekle & Dışa Aktar</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'restore'}
          onClick={() => setActiveTab('restore')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'restore'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Yedekten Geri Yükle</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'diagnostics'}
          onClick={() => setActiveTab('diagnostics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'diagnostics'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <FolderArchive className="h-3.5 w-3.5" />
          <span>Veri Envanteri</span>
        </button>
      </div>

      {/* 4. SEKME İÇERİKLERİ */}

      {/* SEKME 1: YEDEKLE & DIŞA AKTAR */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  <span>Tam Sistem Yedeği Al</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Pusula'daki banka hesaplarından hayallerine, bütçelerinden seyir defterine kadar tüm yaşam verilerini tek bir pakette indir.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Şifreleme Seçeneği */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isEncrypted ? (
                        <Lock className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Unlock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-xs font-semibold">
                          {isEncrypted ? 'Şifreli Kasa Yedeği (.vault)' : 'Açık JSON Yedeği (.json)'}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {isEncrypted
                            ? 'Web Crypto PBKDF2 + AES-GCM (256-bit) ile parola şifreli paket üretilir.'
                            : 'İnsan tarafından doğrudan okunabilir standart JSON formatı.'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEncrypted}
                      aria-label="Şifreli Kasa Yedeğini Aç/Kapat"
                      onClick={() => setIsEncrypted(!isEncrypted)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out p-0.5 ${
                        isEncrypted ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                          isEncrypted ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {isEncrypted && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50 animate-in fade-in">
                      <div>
                        <label htmlFor="vault-export-pwd" className="text-[11px] font-semibold block mb-1">Kasa Parolası</label>
                        <Input
                          id="vault-export-pwd"
                          type="password"
                          value={exportPassword}
                          onChange={(e) => setExportPassword(e.target.value)}
                          placeholder="En az 6 karakter..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor="vault-export-pwd-confirm" className="text-[11px] font-semibold block mb-1">Parolayı Onayla</label>
                        <Input
                          id="vault-export-pwd-confirm"
                          type="password"
                          value={exportPasswordConfirm}
                          onChange={(e) => setExportPasswordConfirm(e.target.value)}
                          placeholder="Parolayı tekrar gir..."
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {exportSuccessMsg && (
                  <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{exportSuccessMsg}</span>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    onClick={handleExportVault}
                    disabled={isExporting}
                    className="w-full gap-2 font-semibold"
                  >
                    <Download className="h-4 w-4" />
                    <span>
                      {isExporting
                        ? 'Kasa Paketleniyor...'
                        : isEncrypted
                        ? 'Şifreli Kasa Yedeğini İndir (.vault)'
                        : 'Tam Sistem Yedeğini İndir (.json)'}
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paketlenecek Tablolar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {Object.entries(VAULT_TABLE_LABELS).map(([key, info]) => {
                  const count = currentManifest.counts[key as keyof PusulaVaultData] || 0
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{info.label}</span>
                      </div>
                      <Badge variant="outline" className="text-[11px] tabular-nums">
                        {count} kayıt
                      </Badge>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SEKME 2: GERİ YÜKLEME SİHİRBAZI */}
      {activeTab === 'restore' && (
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                <span>Yedekten Geri Yükle</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Daha önce aldığınız `.json` veya şifreli `.vault` dosyasını yükleyerek tüm Pusula ekosistemini geri getirin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drag & Drop Dosya Alanı */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileProcess(e.dataTransfer.files[0])
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragActive
                    ? 'border-primary bg-primary/10'
                    : uploadedFile
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-border/80 hover:border-border hover:bg-muted/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.vault"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileProcess(e.target.files[0])
                    }
                  }}
                  className="hidden"
                />

                {uploadedFile ? (
                  <div className="space-y-1">
                    <FileCheck className="h-10 w-10 text-emerald-400 mx-auto" />
                    <div className="text-sm font-semibold text-foreground">{uploadedFile.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(uploadedFile.size / 1024).toFixed(1)} KB • Değiştirmek için tıklayın
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <FolderArchive className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                    <div className="text-sm font-semibold">
                      Yedek dosyasını buraya sürükleyin veya seçin
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Desteklenen formatlar: .json (Açık Yedek) veya .vault (Şifreli Kasa)
                    </div>
                  </div>
                )}
              </div>

              {/* Şifreli Dosya İse Parola Çözücü */}
              {isEncryptedFile && !validationResult?.isValid && (
                <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <Lock className="h-4 w-4" />
                    <span>Bu dosya AES-GCM ile şifrelenmiştir. Parolayı girin:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="vault-restore-pwd"
                      type="password"
                      aria-label="Kasa parolanız"
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      placeholder="Kasa parolanız..."
                      className="h-9 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDecryptAndValidate()
                      }}
                    />
                    <Button size="sm" onClick={handleDecryptAndValidate}>
                      Şifreyi Çöz
                    </Button>
                  </div>
                </div>
              )}

              {/* Hata Mesajı */}
              {restoreErrorMsg && (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{restoreErrorMsg}</span>
                </div>
              )}

              {/* Başarı Mesajı */}
              {restoreSuccessMsg && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{restoreSuccessMsg}</span>
                </div>
              )}

              {/* Doğrulama Başarılı İse Önizleme & Geri Yükleme Seçenekleri */}
              {validationResult?.isValid && (
                <div className="space-y-4 pt-2 border-t border-border/60 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Yedek İçerik Özeti
                      </h4>
                      <p className="text-xs text-foreground mt-0.5">
                        Yedekleme Tarihi:{' '}
                        <strong>
                          {new Date(validationResult.payload.manifest.exported_at).toLocaleString('tr-TR')}
                        </strong>{' '}
                        • Toplam {validationResult.payload.manifest.total_records} kayıt bulundu.
                      </p>
                    </div>
                  </div>

                  {/* Tablo Dökümü */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {mergeDiff.map((diff) => (
                      <div
                        key={diff.tableKey}
                        className="p-2 rounded-lg bg-muted/30 border border-border/50 flex items-center justify-between"
                      >
                        <span className="truncate">
                          {diff.icon} {diff.tableName}
                        </span>
                        <Badge variant="outline" className="text-[11px] font-mono">
                          +{diff.newItemsCount} yeni
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Strateji Seçimi */}
                  <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                    <label className="text-xs font-semibold block text-foreground">
                      Geri Yükleme Stratejisi
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label
                        htmlFor="vault-restore-mode-merge"
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          restoreMode === 'merge'
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="radio"
                          id="vault-restore-mode-merge"
                          name="restoreMode"
                          checked={restoreMode === 'merge'}
                          onChange={() => setRestoreMode('merge')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-semibold">Akıllı Birleştir (Tavsiye)</div>
                          <div className="text-[11px] text-muted-foreground">
                            Mevcut verilerinizi silmez; yedekteki eksik kayıtları ekler.
                          </div>
                        </div>
                      </label>

                      <label
                        htmlFor="vault-restore-mode-replace"
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          restoreMode === 'replace'
                            ? 'border-destructive bg-destructive/5 text-foreground'
                            : 'border-border/60 text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="radio"
                          id="vault-restore-mode-replace"
                          name="restoreMode"
                          checked={restoreMode === 'replace'}
                          onChange={() => setRestoreMode('replace')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-xs font-semibold text-rose-400">Temiz Kurulum (Üzerine Yaz)</div>
                          <div className="text-[11px] text-muted-foreground">
                            Cihaz değişiminde birebir kopyalama için uygundur.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <Button
                    onClick={handleExecuteRestore}
                    disabled={isRestoring}
                    className="w-full gap-2 font-semibold"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRestoring ? 'animate-spin' : ''}`} />
                    <span>{isRestoring ? restoreProgress : 'Geri Yüklemeyi Başlat'}</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SEKME 3: KASA ENVANTERİ & DEPOLAMA TEŞHİSİ */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span>Pusula Veritabanı & Tablo Dökümü</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Tüm modüllere dağılmış 15 tablonun güncel durumunu ve yerel kayıt hacmini inceleyin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/40">
                {Object.entries(VAULT_TABLE_LABELS).map(([key, meta]) => {
                  const count = currentManifest.counts[key as keyof PusulaVaultData] || 0
                  return (
                    <div key={key} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-foreground">{meta.label}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">public.{key}</div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          {meta.category}
                        </span>
                        <Badge variant="outline" className="tabular-nums text-xs">
                          {count} kayıt
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Geri Yükleme Onay Modalı */}
      <ConfirmDialog
        isOpen={isConfirmRestoreOpen}
        onClose={() => setIsConfirmRestoreOpen(false)}
        onConfirm={confirmAndExecuteRestore}
        title={restoreMode === 'replace' ? 'Temiz Kurulumu Onayla' : 'Veri Birleştirmeyi Onayla'}
        description={
          restoreMode === 'replace'
            ? 'DİKKAT: Temiz kurulum mevcut yerel ve bulut verilerinizin üzerine yazacaktır. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?'
            : 'Yedekteki veriler mevcut verilerinizle akıllıca birleştirilecektir. Devam etmek istiyor musunuz?'
        }
        confirmLabel={restoreMode === 'replace' ? 'Üzerine Yaz ve Geri Yükle' : 'Birleştir ve Geri Yükle'}
        variant={restoreMode === 'replace' ? 'destructive' : 'default'}
        isLoading={isRestoring}
      />
    </div>
  )
}

export default function VaultPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground text-sm">
          Veri ve yedekleme yükleniyor...
        </div>
      }
    >
      <VaultPageContent />
    </Suspense>
  )
}
