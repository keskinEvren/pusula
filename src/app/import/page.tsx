'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  CreditCard as CardIcon,
  Building2,
  Sparkles,
  History,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Layers,
  Receipt,
  HandCoins,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseStatementFile, parseBankAccountFile } from '@/lib/parser'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateFileHash } from '@/lib/hash'
import {
  checkDuplicateFileHash,
  sortStatementsChronologically,
  commitStatementBatch,
} from '@/lib/import-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { useToast } from '@/lib/toast-context'
import type { ExtractedTransaction, ParseResult, ReconciliationActionType } from '@/lib/parser/types'
import type { Project, MerchantMapping, CreditCard, Debt, Account } from '@/types/database'

export interface QueuedStatementFile {
  id: string
  file: File
  fileHash: string | null
  status: 'queued' | 'parsing' | 'ready' | 'duplicate' | 'error' | 'saving' | 'saved'
  duplicateWarning?: string
  errorMessage?: string
  parseResult?: ParseResult
  transactions: ExtractedTransaction[]
  selectedCardId?: string
  selectedAccountId?: string
  expanded?: boolean
}

export default function ImportPage() {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addMoreInputRef = useRef<HTMLInputElement>(null)

  // Mode: credit_card vs bank_account
  const [activeMode, setActiveMode] = useState<'credit_card' | 'bank_account'>('credit_card')
  const [switchModeTarget, setSwitchModeTarget] = useState<'credit_card' | 'bank_account' | null>(null)
  const [isClearingQueue, setIsClearingQueue] = useState(false)

  const handleSwitchMode = (targetMode: 'credit_card' | 'bank_account') => {
    if (targetMode === activeMode) return
    if (queuedFiles.length > 0) {
      setSwitchModeTarget(targetMode)
    } else {
      setActiveMode(targetMode)
      setError(null)
      setSuccessSummary(null)
    }
  }

  const confirmSwitchMode = () => {
    if (!switchModeTarget) return
    setActiveMode(switchModeTarget)
    setQueuedFiles([])
    setError(null)
    setSuccessSummary(null)
    setSwitchModeTarget(null)
  }

  const confirmClearQueue = () => {
    setQueuedFiles([])
    setIsClearingQueue(false)
  }

  const [isDragging, setIsDragging] = useState(false)
  const [queuedFiles, setQueuedFiles] = useState<QueuedStatementFile[]>([])
  const [saving, setSaving] = useState(false)
  const [commitProgress, setCommitProgress] = useState<{
    current: number
    total: number
    currentFileName: string
  } | null>(null)

  const [importHistoryCount, setImportHistoryCount] = useState<number>(0)

  // Metadata
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [userMappings, setUserMappings] = useState<MerchantMapping[]>([])

  const [error, setError] = useState<string | null>(null)
  const [successSummary, setSuccessSummary] = useState<{
    filesCount: number
    txCount: number
  } | null>(null)

  useEffect(() => {
    loadMetadata()
  }, [])

  async function loadMetadata() {
    const supabase = createClient()
    const [
      { data: prjs },
      { data: crds },
      { data: dbts },
      { data: accs },
      { data: maps },
      { count: impCount },
    ] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('credit_cards').select('*'),
      supabase.from('debts').select('*'),
      supabase.from('accounts').select('*'),
      supabase.from('merchant_mappings').select('*'),
      supabase.from('statement_imports').select('*', { count: 'exact', head: true }),
    ])

    if (prjs) setProjects(prjs)
    if (crds) setCards(crds)
    if (dbts) setDebts(dbts)
    if (impCount !== null) setImportHistoryCount(impCount)
    if (accs) setAccounts(accs)
    if (maps) setUserMappings(maps)
  }

  // =========================================================================
  // QUEUE & FILE INGESTION (SEQUENTIAL PROCESSING)
  // =========================================================================
  const handleIncomingFiles = async (fileList: FileList | File[]) => {
    const validExtensions = /\.(pdf|csv|xlsx|xls|html|htm)$/i
    const incoming = Array.from(fileList).filter((f) => validExtensions.test(f.name))

    if (incoming.length === 0) {
      setError('Lütfen geçerli formatta dosya seçin (.pdf, .html, .csv, .xlsx, .xls).')
      return
    }

    setError(null)
    setSuccessSummary(null)

    const newQueueItems: QueuedStatementFile[] = incoming.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      fileHash: null,
      status: 'queued',
      transactions: [],
      expanded: incoming.length === 1,
    }))

    setQueuedFiles((prev) => [...prev, ...newQueueItems])

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Sequential parsing queue: process one file at a time
    for (const item of newQueueItems) {
      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'parsing' } : f))
      )

      try {
        const hash = await calculateFileHash(item.file)

        let isDuplicate = false
        let duplicateWarning: string | undefined

        if (user) {
          const dupCheck = await checkDuplicateFileHash(supabase, user.id, hash)
          if (dupCheck.isDuplicate && dupCheck.existingBatch) {
            isDuplicate = true
            duplicateWarning = `Bu dosya daha önce yüklenmiş (${dupCheck.existingBatch.file_name} / ${dupCheck.existingBatch.created_at?.slice(0, 10)}).`
          }
        }

        let result: ParseResult
        if (activeMode === 'credit_card') {
          result = await parseStatementFile(item.file, userMappings)
        } else {
          result = await parseBankAccountFile(item.file, debts, cards, userMappings)
        }

        if (!result.success || result.transactions.length === 0) {
          setQueuedFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                    ...f,
                    fileHash: hash,
                    status: 'error',
                    errorMessage: result.error || 'Dosya ayrıştırılamadı veya hareket bulunamadı.',
                  }
                : f
            )
          )
          continue
        }

        // Card / Account auto-match
        let matchedCardId: string | undefined
        let matchedAccountId: string | undefined

        if (activeMode === 'credit_card' && result.detected_bank && cards.length > 0) {
          let matched = result.last_four
            ? cards.find(
                (c) =>
                  c.last_four === result.last_four ||
                  c.card_name?.includes(result.last_four!)
              )
            : undefined

          if (!matched && !result.last_four) {
            matched = cards.find(
              (c) =>
                c.bank.toLowerCase().includes(result.detected_bank?.toLowerCase() || '') ||
                (result.detected_bank?.toLowerCase() || '').includes(c.bank.toLowerCase())
            )
          }

          if (matched) matchedCardId = matched.id
        }

        if (activeMode === 'bank_account') {
          if (result.detected_bank && accounts.length > 0) {
            const matched = accounts.find(
              (a) =>
                a.name.toLowerCase().includes(result.detected_bank?.toLowerCase() || '') ||
                (result.detected_bank?.toLowerCase() || '').includes(a.name.toLowerCase())
            )
            if (matched) matchedAccountId = matched.id
          }
        }

        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  fileHash: hash,
                  status: isDuplicate ? 'duplicate' : 'ready',
                  duplicateWarning,
                  parseResult: result,
                  transactions: result.transactions,
                  selectedCardId: matchedCardId,
                  selectedAccountId: matchedAccountId,
                }
              : f
          )
        )
      } catch (err: any) {
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: err.message || 'Ayrıştırma işlemi sırasında hata oluştu.',
                }
              : f
          )
        )
      }
    }
  }

  // =========================================================================
  // QUEUE EDITING & TOGGLING
  // =========================================================================
  const handleRemoveQueueItem = (fileId: string) => {
    setQueuedFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const handleToggleExpand = (fileId: string) => {
    setQueuedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, expanded: !f.expanded } : f))
    )
  }

  const handleCardChange = (fileId: string, cardId: string) => {
    setQueuedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, selectedCardId: cardId } : f))
    )
  }

  const handleAccountChange = (fileId: string, accountId: string) => {
    setQueuedFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, selectedAccountId: accountId } : f))
    )
  }

  const handleToggleFileSelectAll = (fileId: string, select: boolean) => {
    setQueuedFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f
        return {
          ...f,
          transactions: f.transactions.map((t) => ({ ...t, selected: select })),
        }
      })
    )
  }

  const handleRowFieldChange = (
    fileId: string,
    txId: string,
    field: keyof ExtractedTransaction,
    value: any
  ) => {
    setQueuedFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f
        return {
          ...f,
          transactions: f.transactions.map((t) => (t.id === txId ? { ...t, [field]: value } : t)),
        }
      })
    )
  }

  const handleActionChange = (
    fileId: string,
    txId: string,
    newAction: ReconciliationActionType
  ) => {
    setQueuedFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f
        return {
          ...f,
          transactions: f.transactions.map((t) => {
            if (t.id !== txId) return t
            let newType = t.type
            let newGroup = t.analysis_group

            if (newAction === 'CARD_PAYMENT') {
              newType = 'Kart Ödemesi'
              newGroup = 'Hariç'
            } else if (newAction === 'COLLECT_RECEIVABLE') {
              newType = 'Tahsilat'
              newGroup = 'Hariç'
            } else if (newAction === 'PAY_DEBT') {
              newType = 'Borç Ödemesi'
              newGroup = 'Hariç'
            } else if (newAction === 'DIRECT_EXPENSE') {
              newType = 'Harcama'
              newGroup = 'Kişisel'
            } else if (newAction === 'FREE_INCOME') {
              newType = 'Gelir'
              newGroup = 'Hariç'
            } else if (newAction === 'CASH_ADVANCE') {
              newType = 'Nakit Avans'
              newGroup = 'Hariç'
            } else if (newAction === 'INTERNAL_TRANSFER') {
              newType = 'Transfer'
              newGroup = 'Hariç'
            } else if (newAction === 'INVESTMENT_TRANSFER') {
              newType = 'Transfer'
              newGroup = 'Hariç'
            }

            return {
              ...t,
              action: newAction,
              type: newType,
              analysis_group: newGroup,
            }
          }),
        }
      })
    )
  }

  // =========================================================================
  // BULK COMMIT EXECUTION
  // =========================================================================
  const handleBulkCommit = async () => {
    const committableFiles = queuedFiles.filter(
      (f) =>
        (f.status === 'ready' || f.status === 'duplicate') &&
        f.transactions.some((t) => t.selected !== false)
    )

    if (committableFiles.length === 0) {
      toast.warning('Aktarılacak hazır veya seçili hareketi olan dosya bulunamadı.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccessSummary(null)
    setCommitProgress({
      current: 0,
      total: committableFiles.length,
      currentFileName: committableFiles[0].file.name,
    })

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Oturum açılmamış. Lütfen giriş yapın.')
      setSaving(false)
      return
    }

    // Sort files chronologically: oldest statement first, newest last
    const sortedFiles = sortStatementsChronologically(committableFiles)

    let committedFilesCount = 0
    let committedTxCount = 0

    for (let i = 0; i < sortedFiles.length; i++) {
      const item = sortedFiles[i]
      setCommitProgress({
        current: i + 1,
        total: sortedFiles.length,
        currentFileName: item.file.name,
      })

      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'saving' } : f))
      )

      const res = await commitStatementBatch({
        supabase,
        userId: user.id,
        fileName: item.file.name,
        fileHash: item.fileHash,
        importType: activeMode,
        parseResult: item.parseResult,
        transactions: item.transactions,
        selectedCardId: item.selectedCardId,
        selectedAccountId: item.selectedAccountId,
        cards,
        accounts,
        debts,
      })

      if (res.success) {
        committedFilesCount++
        committedTxCount += res.insertedTransactionsCount || 0
        setQueuedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'saved' } : f))
        )
      } else {
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error', errorMessage: res.error } : f
          )
        )
      }
    }

    setSaving(false)
    setCommitProgress(null)
    await loadMetadata()

    if (committedFilesCount > 0) {
      setSuccessSummary({
        filesCount: committedFilesCount,
        txCount: committedTxCount,
      })
      toast.success(`${committedFilesCount} ekstre dosyası (${committedTxCount} hareket) başarıyla aktarıldı.`)
    }
  }

  // Aggregate metrics
  const readyFiles = queuedFiles.filter((f) => f.status === 'ready' || f.status === 'duplicate')
  const distinctDetectedCards = Array.from(
    new Set(
      queuedFiles
        .filter((f) => f.parseResult?.detected_bank)
        .map((f) => {
          const bank = f.parseResult?.detected_bank || 'Banka'
          const last4 = f.parseResult?.last_four ? `• ${f.parseResult.last_four}` : ''
          return `${bank} ${last4}`.trim()
        })
    )
  )
  const totalSelectedTransactions = queuedFiles.reduce(
    (acc, f) => acc + f.transactions.filter((t) => t.selected !== false).length,
    0
  )
  const totalSelectedAmount = queuedFiles.reduce(
    (acc, f) =>
      acc +
      f.transactions
        .filter((t) => t.selected !== false)
        .reduce((sum, t) => sum + t.amount, 0),
    0
  )

  const isAnyFileParsing = queuedFiles.some((f) => f.status === 'parsing' || f.status === 'queued')

  return (
    <div className="space-y-6">
      {/* Standart PageHeader */}
      <PageHeader
        title="Ekstre Merkezi"
        description="Kredi kartı ve banka hesap dökümlerini yükleyin, akıllı kurallarla uzlaştırın ve sisteme aktarın."
        actions={
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-background text-foreground shadow-sm"
            >
              <UploadCloud className="h-3.5 w-3.5 text-primary" />
              <span>Yeni Ekstre Yükle</span>
            </button>
            <Link
              href="/imports"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Yükleme Geçmişi ({importHistoryCount})</span>
            </Link>
          </div>
        }
      />

      {/* Mode Selector Tabs */}
      <div role="tablist" aria-label="Ekstre yükleme modu" className="flex gap-3 border-b border-border pb-3">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'credit_card'}
          onClick={() => handleSwitchMode('credit_card')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 min-h-[44px] sm:min-h-[40px] text-sm font-semibold transition-all ${
            activeMode === 'credit_card'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CardIcon className="h-4 w-4" />
          <span>💳 Kredi Kartı Ekstresi</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'bank_account'}
          onClick={() => handleSwitchMode('bank_account')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 min-h-[44px] sm:min-h-[40px] text-sm font-semibold transition-all ${
            activeMode === 'bank_account'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>🏦 Vadesiz Banka Hesap Dökümü</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm font-medium flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Notification Card & Next Steps */}
      {successSummary && (
        <Card className="border-success/40 bg-success/10 text-success shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0 text-success" />
                <div>
                  <div className="font-bold text-base text-foreground">
                    Toplu Aktarım Başarıyla Tamamlandı!
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Toplam <strong>{successSummary.filesCount}</strong> ekstre paketi ve{' '}
                    <strong>{successSummary.txCount}</strong> hareket sisteme başarıyla işlendi.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="text-xs font-semibold h-8"
                  onClick={() => {
                    setQueuedFiles([])
                    setSuccessSummary(null)
                  }}
                >
                  Yeni Ekstre Yükle
                </Button>
              </div>
            </div>

            {/* Smart Next Action Deep Links */}
            <div className="pt-3 border-t border-success/20 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground font-semibold text-[11px] mr-1">Sonraki Adımlar:</span>
              <Link href="/transactions">
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 border-success/30 hover:bg-success/20 text-foreground">
                  <Receipt className="h-3 w-3 text-primary" />
                  İşlem Defterinde İncele
                </Button>
              </Link>
              <Link href="/cards">
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 border-success/30 hover:bg-success/20 text-foreground">
                  <CardIcon className="h-3 w-3 text-purple-400" />
                  Kart Borçlarını Gör
                </Button>
              </Link>
              <Link href="/accounts">
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 border-success/30 hover:bg-success/20 text-foreground">
                  <Building2 className="h-3 w-3 text-emerald-400" />
                  Kasa Bakiyelerini Kontrol Et
                </Button>
              </Link>
              <Link href="/debts">
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5 border-success/30 hover:bg-success/20 text-foreground">
                  <HandCoins className="h-3 w-3 text-amber-400" />
                  Borç & Alacak Durumu
                </Button>
              </Link>
              <Link href="/imports">
                <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground">
                  <History className="h-3 w-3" />
                  Yükleme Geçmişi
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty Queue Dropzone */}
      {queuedFiles.length === 0 && (
        <Card
          className={`border-2 border-dashed transition-all ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleIncomingFiles(e.dataTransfer.files)
            }
          }}
        >
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl mb-4 shadow-inner ${
                activeMode === 'credit_card'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-purple-500/10 text-purple-400'
              }`}
            >
              {activeMode === 'credit_card' ? (
                <CardIcon className="h-8 w-8" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>

            <h3 className="text-lg font-bold text-foreground">
              {activeMode === 'credit_card'
                ? 'Kredi Kartı Ekstrelerinizi Sürükleyin (Tek veya Çoklu)'
                : 'Vadesiz Hesap Dökümlerinizi Sürükleyin (Tek veya Çoklu)'}
            </h3>

            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              PDF, HTML, CSV veya Excel formatında birden fazla dosyayı aynı anda seçebilirsiniz.
              Her dosya bağımsız bir geri alınabilir paket olarak sırayla ayrıştırılır.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                className={`text-xs gap-2 ${
                  activeMode === 'credit_card' ? 'bg-primary' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                Dosyaları Seçin (Çoklu Seçim)
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.xlsx,.xls,.html,.htm"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleIncomingFiles(e.target.files)
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue View & Batch Manager */}
      {queuedFiles.length > 0 && (
        <div className="space-y-6">
          {/* Top Bulk Summary Bar */}
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm text-foreground">
                    Yükleme Kuyruğu ({queuedFiles.length} Dosya)
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {readyFiles.length} Hazır
                </Badge>
                {distinctDetectedCards.length > 0 && (
                  <Badge variant="outline" className="text-xs border-purple-500/40 text-purple-400">
                    {distinctDetectedCards.length} Kart: {distinctDetectedCards.join(', ')}
                  </Badge>
                )}
                {queuedFiles.filter((f) => f.status === 'duplicate').length > 0 && (
                  <Badge variant="warning" className="text-xs">
                    {queuedFiles.filter((f) => f.status === 'duplicate').length} Mükerrer Uyarı
                  </Badge>
                )}
                <span>•</span>
                <span className="text-xs text-muted-foreground">
                  Seçili: <strong className="text-foreground">{totalSelectedTransactions}</strong> hareket
                </span>
                <span>•</span>
                <span className="text-xs text-muted-foreground">
                  Hacim: <strong className="text-foreground font-mono">{formatCurrency(totalSelectedAmount)}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addMoreInputRef.current?.click()}
                  disabled={saving}
                  className="text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dosya Ekle
                </Button>
                <input
                  ref={addMoreInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.csv,.xlsx,.xls,.html,.htm"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleIncomingFiles(e.target.files)
                    }
                  }}
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsClearingQueue(true)}
                  disabled={saving}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Temizle
                </Button>

                <Button
                  size="sm"
                  onClick={handleBulkCommit}
                  disabled={saving || readyFiles.length === 0 || isAnyFileParsing}
                  className="text-xs gap-2 shadow-md"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Aktarılıyor...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Tümünü Sisteme Aktar ({readyFiles.length} Dosya)
                    </>
                  )}
                </Button>
              </div>
            </CardContent>

            {/* Commit Progress Bar */}
            {commitProgress && (
              <div className="border-t border-border bg-muted/20 px-5 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Aktarılıyor ({commitProgress.current}/{commitProgress.total}):{' '}
                    <strong className="text-foreground">{commitProgress.currentFileName}</strong>
                  </span>
                  <span className="font-mono text-primary font-bold">
                    {Math.round((commitProgress.current / commitProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 transition-all duration-300"
                    style={{
                      width: `${(commitProgress.current / commitProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Queued Files List */}
          <div className="space-y-4">
            {queuedFiles.map((item) => {
              const fileSelectedCount = item.transactions.filter((t) => t.selected !== false).length
              const fileSelectedSum = item.transactions
                .filter((t) => t.selected !== false)
                .reduce((sum, t) => sum + t.amount, 0)

              return (
                <Card
                  key={item.id}
                  className={`border transition-all ${
                    item.status === 'error'
                      ? 'border-destructive/40 bg-destructive/5'
                      : item.status === 'duplicate'
                      ? 'border-amber-500/30 bg-card'
                      : item.status === 'saved'
                      ? 'border-success/40 bg-card'
                      : 'border-border bg-card'
                  }`}
                >
                  {/* File Header */}
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {item.file.name}
                          </span>

                          {/* Status Badge */}
                          {item.status === 'parsing' && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Ayrıştırılıyor
                            </Badge>
                          )}
                          {item.status === 'ready' && (
                            <Badge variant="success" className="text-xs">
                              Hazır ({item.transactions.length} işlem)
                            </Badge>
                          )}
                          {item.status === 'duplicate' && (
                            <Badge variant="warning" className="text-xs">
                              Mükerrer Dosya
                            </Badge>
                          )}
                          {item.status === 'saving' && (
                            <Badge variant="outline" className="text-xs gap-1 border-primary text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Kaydediliyor...
                            </Badge>
                          )}
                          {item.status === 'saved' && (
                            <Badge variant="success" className="text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Aktarıldı
                            </Badge>
                          )}
                          {item.status === 'error' && (
                            <Badge variant="destructive" className="text-xs">
                              Hata
                            </Badge>
                          )}

                          {item.parseResult?.detected_bank && (
                            <Badge variant="outline" className="text-xs">
                              {item.parseResult.detected_bank} {item.parseResult.last_four ? `• ${item.parseResult.last_four}` : ''}
                            </Badge>
                          )}
                        </div>

                        {/* File Details Line */}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {item.parseResult?.statement_date && (
                            <span>
                              Ekstre Tarihi:{' '}
                              <strong className="text-foreground">
                                {formatDate(item.parseResult.statement_date)}
                              </strong>
                            </span>
                          )}
                          {item.parseResult?.statement_debt !== undefined && (
                            <>
                              <span>•</span>
                              <span>
                                Dönem Borcu:{' '}
                                <strong className="text-foreground font-mono">
                                  {formatCurrency(item.parseResult.statement_debt)}
                                </strong>
                              </span>
                            </>
                          )}
                          {item.transactions.length > 0 && (
                            <>
                              <span>•</span>
                              <span>
                                Seçili:{' '}
                                <strong className="text-foreground">{fileSelectedCount}</strong> /{' '}
                                {item.transactions.length} hareket ({formatCurrency(fileSelectedSum)})
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Target Selector & Accordion Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                      {activeMode === 'credit_card' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Kart:</span>
                          <Select
                            value={item.selectedCardId || ''}
                            onChange={(e) => handleCardChange(item.id, e.target.value)}
                            className="w-44 text-xs"
                            disabled={item.status === 'saved' || saving}
                          >
                            <option value="">(Otomatik Eşleştir)</option>
                            {cards.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.bank} - {c.card_name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Hesap:</span>
                          <Select
                            value={item.selectedAccountId || ''}
                            onChange={(e) => handleAccountChange(item.id, e.target.value)}
                            className="w-44 text-xs"
                            disabled={item.status === 'saved' || saving}
                          >
                            <option value="">
                              {item.parseResult?.detected_bank
                                ? `(Yeni Aç: ${item.parseResult.detected_bank})`
                                : '(Otomatik Eşleştir / Yeni)'}
                            </option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({formatCurrency(a.balance)})
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}

                      {item.transactions.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleExpand(item.id)}
                          className="text-xs gap-1 h-8"
                        >
                          {item.expanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              Gizle
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              İncele ({item.transactions.length})
                            </>
                          )}
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveQueueItem(item.id)}
                        disabled={saving}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="Kuyruktan Çıkar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Warning / Error inline notifications */}
                  {item.duplicateWarning && (
                    <div className="border-t border-amber-500/20 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span>{item.duplicateWarning}</span>
                    </div>
                  )}

                  {item.errorMessage && (
                    <div className="border-t border-destructive/20 bg-destructive/10 px-5 py-2.5 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{item.errorMessage}</span>
                    </div>
                  )}

                  {/* Expanded Transaction Review Table */}
                  {item.expanded && item.transactions.length > 0 && (
                    <div className="border-t border-border">
                      <div className="p-3 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleFileSelectAll(item.id, true)}
                            className="text-xs h-8 min-h-[36px]"
                          >
                            Tümünü Seç
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleFileSelectAll(item.id, false)}
                            className="text-xs h-8 min-h-[36px]"
                          >
                            Seçimi Kaldır
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                          <span>Bu dosyanın hareketlerini satır bazında düzenleyebilirsiniz.</span>
                        </div>
                      </div>

                      {/* Mobile Review Cards (<md) */}
                      <div className="md:hidden divide-y divide-border/50 max-h-96 overflow-y-auto font-sans">
                        {item.transactions.map((tx) => (
                          <div
                            key={tx.id}
                            className={`p-3 space-y-2.5 text-xs ${
                              tx.selected === false ? 'opacity-40 bg-muted/10' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 cursor-pointer min-h-[36px]">
                                <input
                                  type="checkbox"
                                  checked={tx.selected !== false}
                                  onChange={(e) =>
                                    handleRowFieldChange(
                                      item.id,
                                      tx.id,
                                      'selected',
                                      e.target.checked
                                    )
                                  }
                                  className="rounded border-border h-4 w-4"
                                />
                                <span className="text-muted-foreground font-mono">{tx.date}</span>
                              </label>
                              <span
                                className={`font-bold font-mono ${
                                  tx.direction === 'inflow' || tx.analysis_group === 'Gelir'
                                    ? 'text-success'
                                    : tx.analysis_group === 'Hariç'
                                    ? 'text-muted-foreground'
                                    : 'text-foreground'
                                }`}
                              >
                                {tx.direction === 'inflow' ? '+' : '-'} {formatCurrency(tx.amount)}
                              </span>
                            </div>

                            <div className="text-muted-foreground text-[11px] truncate" title={tx.raw_description}>
                              {tx.raw_description}
                            </div>

                            <div className="space-y-1">
                              <Input
                                value={tx.merchant}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    item.id,
                                    tx.id,
                                    'merchant',
                                    e.target.value
                                  )
                                }
                                placeholder="İşlem adı..."
                                className="h-8 text-xs font-medium"
                              />
                            </div>

                            {activeMode === 'bank_account' && (
                              <div className="space-y-1.5">
                                <Select
                                  value={tx.action || 'DIRECT_EXPENSE'}
                                  onChange={(e) =>
                                    handleActionChange(
                                      item.id,
                                      tx.id,
                                      e.target.value as ReconciliationActionType
                                    )
                                  }
                                  className="h-8 text-xs font-semibold"
                                >
                                  <option value="CARD_PAYMENT">💳 Kart Borcu Kapat (Hariç)</option>
                                  <option value="INVESTMENT_TRANSFER">📈 Yatırım Transferi (Hariç)</option>
                                  <option value="CASH_ADVANCE">💸 Karttan Nakit Avans (Borç Artışı)</option>
                                  <option value="COLLECT_RECEIVABLE">💰 Alacak Tahsil Et (Gelir)</option>
                                  <option value="PAY_DEBT">🤝 Şahıs Borcu Kapat (Hariç)</option>
                                  <option value="DIRECT_EXPENSE">🛒 Doğrudan Harcama</option>
                                  <option value="FREE_INCOME">💵 Serbest Gelir</option>
                                  <option value="INTERNAL_TRANSFER">🔄 Transfer</option>
                                </Select>

                                {(tx.action === 'COLLECT_RECEIVABLE' || tx.action === 'PAY_DEBT') && (
                                  <Select
                                    value={tx.target_debt_id || ''}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'target_debt_id',
                                        e.target.value
                                      )
                                    }
                                    className="h-8 text-xs border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-medium"
                                  >
                                    <option value="">🎯 (Borç/Alacak Seçin)</option>
                                    {debts
                                      .filter((d) => (tx.action === 'COLLECT_RECEIVABLE' ? d.type === 'Alacak' : d.type === 'Borç'))
                                      .map((d) => (
                                        <option key={d.id} value={d.id}>
                                          {d.person_or_entity} ({formatCurrency(d.remaining)})
                                        </option>
                                      ))}
                                  </Select>
                                )}

                                {(tx.action === 'CARD_PAYMENT' || tx.action === 'CASH_ADVANCE') && (
                                  <Select
                                    value={tx.target_card_id || ''}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'target_card_id',
                                        e.target.value
                                      )
                                    }
                                    className="h-8 text-xs border-primary/50 bg-primary/10 text-primary font-medium"
                                  >
                                    <option value="">💳 (Kart Seçin)</option>
                                    {cards.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.bank} {c.card_name}
                                      </option>
                                    ))}
                                  </Select>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <Select
                                value={tx.analysis_group}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    item.id,
                                    tx.id,
                                    'analysis_group',
                                    e.target.value
                                  )
                                }
                                className="h-8 text-xs"
                              >
                                <option value="Kişisel">Kişisel</option>
                                <option value="İş">İş</option>
                                <option value="Finansman">Finansman</option>
                                <option value="Hariç">Hariç</option>
                              </Select>

                              <Select
                                value={tx.project_id || ''}
                                onChange={(e) =>
                                  handleRowFieldChange(
                                    item.id,
                                    tx.id,
                                    'project_id',
                                    e.target.value || undefined
                                  )
                                }
                                className="h-8 text-xs font-sans"
                              >
                                <option value="">(Proje Yok)</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Review Table (md+) */}
                      <div className="hidden md:block overflow-x-auto max-h-96">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground sticky top-0">
                            <tr>
                              <th scope="col" className="p-2.5 w-8"></th>
                              <th scope="col" className="p-2.5">Tarih</th>
                              <th scope="col" className="p-2.5">Açıklama</th>
                              <th scope="col" className="p-2.5">İşlem Adı</th>
                              {activeMode === 'bank_account' && (
                                <th scope="col" className="p-2.5">Uzlaştırma Aksiyonu</th>
                              )}
                              <th scope="col" className="p-2.5">Grup</th>
                              <th scope="col" className="p-2.5">Proje</th>
                              <th scope="col" className="p-2.5 text-right">Tutar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40 font-mono">
                            {item.transactions.map((tx) => (
                              <tr
                                key={tx.id}
                                className={`hover:bg-muted/30 transition-colors ${
                                  tx.selected === false ? 'opacity-40 bg-muted/10' : ''
                                }`}
                              >
                                <td className="p-2.5">
                                  <input
                                    type="checkbox"
                                    checked={tx.selected !== false}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'selected',
                                        e.target.checked
                                      )
                                    }
                                    className="rounded border-border"
                                  />
                                </td>
                                <td className="p-2.5 text-muted-foreground whitespace-nowrap font-sans">
                                  {tx.date}
                                </td>
                                <td
                                  className="p-2.5 max-w-xs truncate text-muted-foreground font-sans"
                                  title={tx.raw_description}
                                >
                                  {tx.raw_description}
                                </td>
                                <td className="p-2.5 font-sans">
                                  <Input
                                    value={tx.merchant}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'merchant',
                                        e.target.value
                                      )
                                    }
                                    className="h-7 text-xs font-medium"
                                  />
                                </td>

                                {activeMode === 'bank_account' && (
                                  <td className="p-2.5">
                                    <div className="space-y-1.5 min-w-[190px]">
                                      <Select
                                        value={tx.action || 'DIRECT_EXPENSE'}
                                        onChange={(e) =>
                                          handleActionChange(
                                            item.id,
                                            tx.id,
                                            e.target.value as ReconciliationActionType
                                          )
                                        }
                                        className="h-7 text-xs font-semibold"
                                      >
                                        <option value="CARD_PAYMENT">💳 Kart Borcu Kapat (Hariç)</option>
                                        <option value="INVESTMENT_TRANSFER">📈 Yatırım Transferi (Hariç)</option>
                                        <option value="CASH_ADVANCE">💸 Karttan Nakit Avans (Borç Artışı)</option>
                                        <option value="COLLECT_RECEIVABLE">💰 Alacak Tahsil Et (Gelir)</option>
                                        <option value="PAY_DEBT">🤝 Şahıs Borcu Kapat (Hariç)</option>
                                        <option value="DIRECT_EXPENSE">🛒 Doğrudan Harcama</option>
                                        <option value="FREE_INCOME">💵 Serbest Gelir</option>
                                        <option value="INTERNAL_TRANSFER">🔄 Transfer</option>
                                      </Select>

                                      {(tx.action === 'COLLECT_RECEIVABLE' || tx.action === 'PAY_DEBT') && (
                                        <Select
                                          value={tx.target_debt_id || ''}
                                          onChange={(e) =>
                                            handleRowFieldChange(
                                              item.id,
                                              tx.id,
                                              'target_debt_id',
                                              e.target.value
                                            )
                                          }
                                          className="h-7 text-[11px] border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-medium"
                                        >
                                          <option value="">🎯 (Borç/Alacak Seçin)</option>
                                          {debts
                                            .filter((d) => (tx.action === 'COLLECT_RECEIVABLE' ? d.type === 'Alacak' : d.type === 'Borç'))
                                            .map((d) => (
                                              <option key={d.id} value={d.id}>
                                                {d.person_or_entity} ({formatCurrency(d.remaining)})
                                              </option>
                                            ))}
                                        </Select>
                                      )}

                                      {(tx.action === 'CARD_PAYMENT' || tx.action === 'CASH_ADVANCE') && (
                                        <Select
                                          value={tx.target_card_id || ''}
                                          onChange={(e) =>
                                            handleRowFieldChange(
                                              item.id,
                                              tx.id,
                                              'target_card_id',
                                              e.target.value
                                            )
                                          }
                                          className="h-7 text-[11px] border-primary/50 bg-primary/10 text-primary font-medium"
                                        >
                                          <option value="">💳 (Kart Seçin)</option>
                                          {cards.map((c) => (
                                            <option key={c.id} value={c.id}>
                                              {c.bank} {c.card_name}
                                            </option>
                                          ))}
                                        </Select>
                                      )}
                                    </div>
                                  </td>
                                )}

                                <td className="p-2.5">
                                  <Select
                                    value={tx.analysis_group}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'analysis_group',
                                        e.target.value
                                      )
                                    }
                                    className="h-7 text-xs w-24"
                                  >
                                    <option value="Kişisel">Kişisel</option>
                                    <option value="İş">İş</option>
                                    <option value="Finansman">Finansman</option>
                                    <option value="Hariç">Hariç</option>
                                  </Select>
                                </td>

                                <td className="p-2.5">
                                  <Select
                                    value={tx.project_id || ''}
                                    onChange={(e) =>
                                      handleRowFieldChange(
                                        item.id,
                                        tx.id,
                                        'project_id',
                                        e.target.value || undefined
                                      )
                                    }
                                    className="h-7 text-xs w-32 font-sans"
                                  >
                                    <option value="">(Yok)</option>
                                    {projects.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </Select>
                                </td>

                                <td className="p-2.5 text-right font-bold whitespace-nowrap">
                                  <span
                                    className={
                                      tx.direction === 'inflow' || tx.analysis_group === 'Gelir'
                                        ? 'text-success'
                                        : tx.analysis_group === 'Hariç'
                                        ? 'text-muted-foreground'
                                        : 'text-foreground'
                                    }
                                  >
                                    {tx.direction === 'inflow' ? '+' : '-'} {formatCurrency(tx.amount)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ConfirmDialog for Mode Switch */}
      <ConfirmDialog
        isOpen={Boolean(switchModeTarget)}
        onClose={() => setSwitchModeTarget(null)}
        onConfirm={confirmSwitchMode}
        title="Mod Değiştir"
        description="Mod değiştirdiğinizde kuyruktaki mevcut yüklenmemiş dosyalar temizlenir. Devam etmek istiyor musunuz?"
        confirmLabel="Modu Değiştir"
        cancelLabel="Vazgeç"
        variant="warning"
      />

      {/* ConfirmDialog for Clear Queue */}
      <ConfirmDialog
        isOpen={isClearingQueue}
        onClose={() => setIsClearingQueue(false)}
        onConfirm={confirmClearQueue}
        title="Kuyruğu Temizle"
        description="Kuyruktaki tüm dosyalar kaldırılacak. Emin misiniz?"
        confirmLabel="Kuyruğu Temizle"
        cancelLabel="Vazgeç"
        variant="destructive"
      />
    </div>
  )
}
