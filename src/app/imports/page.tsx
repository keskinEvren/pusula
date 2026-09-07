'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  GitCommit,
  RotateCcw,
  Trash2,
  FileText,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowLeft,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  fetchImportBatches,
  fetchTransactionsForBatch,
  rollbackImportBatch,
  deleteImportBatchPermanently,
  type EnrichedImportBatch,
} from '@/lib/import-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import type { Transaction } from '@/types/database'

export default function ImportsPage() {
  const [batches, setBatches] = useState<EnrichedImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ROLLED_BACK'>('ALL')

  // Drill-down transaction modal
  const [inspectBatch, setInspectBatch] = useState<EnrichedImportBatch | null>(null)
  const [batchTransactions, setBatchTransactions] = useState<Transaction[]>([])
  const [loadingTx, setLoadingTx] = useState(false)

  // Rollback confirmation modal
  const [rollbackTarget, setRollbackTarget] = useState<EnrichedImportBatch | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  // Permanent delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<EnrichedImportBatch | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Notification state
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadBatches()
  }, [])

  async function loadBatches() {
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const list = await fetchImportBatches(supabase, user.id)
      setBatches(list)
    } catch (err) {
      console.error('Error loading import batches:', err)
    } finally {
      setLoading(false)
    }
  }

  // Open transaction inspection modal
  async function handleInspect(batch: EnrichedImportBatch) {
    setInspectBatch(batch)
    setLoadingTx(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const txs = await fetchTransactionsForBatch(supabase, user.id, batch.id)
      setBatchTransactions(txs)
    } catch (err) {
      console.error('Error loading batch transactions:', err)
    } finally {
      setLoadingTx(false)
    }
  }

  // Perform Rollback
  async function confirmRollback() {
    if (!rollbackTarget) return
    setRollingBack(true)
    setNotice(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Oturum açılmamış.')
      }

      const res = await rollbackImportBatch(supabase, rollbackTarget.id, user.id)

      if (res.success) {
        setNotice({
          type: 'success',
          message: `"${rollbackTarget.file_name}" ekstresi başarıyla geri alındı. ${res.deletedTransactions} hareket ve bağlı ekstre özetleri temizlendi.`,
        })
        setRollbackTarget(null)
        await loadBatches()
      } else {
        setNotice({
          type: 'error',
          message: res.error || 'Geri alma işlemi sırasında bir hata oluştu.',
        })
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Geri alma işlemi başarısız oldu.',
      })
    } finally {
      setRollingBack(false)
    }
  }

  // Perform Permanent Delete
  async function confirmDeletePermanently() {
    if (!deleteTarget) return
    setDeleting(true)
    setNotice(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Oturum açılmamış.')

      const res = await deleteImportBatchPermanently(supabase, deleteTarget.id, user.id)
      if (res.success) {
        setNotice({
          type: 'success',
          message: `"${deleteTarget.file_name}" kaydı geçmişten tamamen kaldırıldı.`,
        })
        setDeleteTarget(null)
        await loadBatches()
      } else {
        setNotice({
          type: 'error',
          message: res.error || 'Silme işlemi başarısız oldu.',
        })
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        message: err.message || 'Silme işlemi başarısız oldu.',
      })
    } finally {
      setDeleting(false)
    }
  }

  // Filtered batches
  const filteredBatches = batches.filter((b) => {
    if (statusFilter !== 'ALL' && b.batch_status !== statusFilter) {
      return false
    }

    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (b.file_name || '').toLowerCase().includes(q) ||
      (b.bank || '').toLowerCase().includes(q) ||
      (b.statement_date || '').includes(q)
    )
  })

  // Calculations for summary stats
  const activeBatches = batches.filter((b) => b.batch_status === 'COMPLETED')
  const rolledBackBatches = batches.filter((b) => b.batch_status === 'ROLLED_BACK')
  const totalActiveAmount = activeBatches.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  const totalActiveTransactions = activeBatches.reduce((sum, b) => sum + Number(b.actual_tx_count || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/import" className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Ekstre Yükleme Merkezine Dön
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <GitCommit className="h-7 w-7 text-primary" />
            Ekstre Kayıtları & Geri Alma
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sisteme yüklenen ekstre paketlerini Git commit mantığıyla inceleyin, mükerrer veya hatalı paketleri tek tıkla geri alın.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/import">
            <Button className="shadow-md">
              <FileText className="h-4 w-4 mr-2" />
              Yeni Ekstre Yükle
            </Button>
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm font-medium ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border bg-card shadow-sm border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Toplam İthalat Paketi
            </CardTitle>
            <Layers className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{batches.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeBatches.length} aktif, {rolledBackBatches.length} geri alınmış
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aktif İşlem Sayısı
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {totalActiveTransactions} Hareket
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Veritabanında yaşayan aktif kayıtlar
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aktif Ekstre Hacmi
            </CardTitle>
            <CreditCard className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-purple-400">
              {formatCurrency(totalActiveAmount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sisteme yansıyan toplam ekstre tutarı
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Geri Alınan Paketler
            </CardTitle>
            <RotateCcw className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {rolledBackBatches.length} Paket
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Rollback ile başarıyla temizlenen paketler
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card p-3 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Dosya, banka veya tarih ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted'
            }`}
          >
            Tümü ({batches.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'COMPLETED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted'
            }`}
          >
            Aktifler ({activeBatches.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ROLLED_BACK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === 'ROLLED_BACK'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted'
            }`}
          >
            Geri Alınanlar ({rolledBackBatches.length})
          </button>
        </div>
      </div>

      {/* Batches List */}
      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Ekstre paketleri yükleniyor...
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Herhangi bir ekstre kaydı bulunamadı.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBatches.map((batch) => {
            const isRolledBack = batch.batch_status === 'ROLLED_BACK'

            return (
              <Card
                key={batch.id}
                className={`border transition-all ${
                  isRolledBack
                    ? 'border-border/60 bg-muted/10 opacity-70'
                    : 'border-border bg-card hover:border-primary/40 shadow-sm'
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Commit Information */}
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`p-2.5 rounded-xl mt-0.5 ${
                          isRolledBack
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-primary/10 text-primary border border-primary/20'
                        }`}
                      >
                        {batch.import_type === 'bank_account' ? (
                          <Building2 className="h-5 w-5" />
                        ) : (
                          <CreditCard className="h-5 w-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">
                            {batch.file_name}
                          </span>

                          {/* Status Badge */}
                          {batch.batch_status === 'COMPLETED' && (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                              Aktif / Kayıtlı
                            </Badge>
                          )}
                          {batch.batch_status === 'ROLLED_BACK' && (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">
                              Geri Alındı (Rollback)
                            </Badge>
                          )}
                          {batch.batch_status === 'FAILED' && (
                            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-xs">
                              Başarısız
                            </Badge>
                          )}

                          {/* Bank Badge */}
                          <Badge variant="secondary" className="text-xs">
                            {batch.bank || 'Banka'}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Yükleme Tarihi: <strong className="text-foreground">{formatDate(batch.created_at)}</strong>
                          </span>
                          {batch.statement_date && (
                            <span>
                              Ekstre Dönemi: <strong className="text-foreground">{batch.statement_date}</strong>
                            </span>
                          )}
                          {batch.file_hash && (
                            <span className="font-mono text-3xs text-muted-foreground/80">
                              Hash: {batch.file_hash.slice(0, 10)}...
                            </span>
                          )}
                          {isRolledBack && batch.rolled_back_at && (
                            <span className="text-amber-400">
                              Geri Alınma: {formatDate(batch.rolled_back_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quantities & Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-5 border-t lg:border-t-0 pt-3 lg:pt-0 border-border">
                      <div className="text-left lg:text-right">
                        <div className="text-base font-bold font-mono text-foreground">
                          {formatCurrency(Number(batch.total_amount || 0))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {isRolledBack ? (
                            <span className="line-through text-muted-foreground/60">
                              {batch.total_transactions} işlem
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-medium">
                              {batch.actual_tx_count} aktif hareket
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Inspect Transactions Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleInspect(batch)}
                          className="text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          İncele
                        </Button>

                        {/* Rollback Action Button */}
                        {!isRolledBack ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setRollbackTarget(batch)}
                            className="text-xs shadow-sm"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Geri Al
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(batch)}
                            className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Bu kaydı listeden tamamen sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Drill-Down Inspect Modal */}
      {inspectBatch && (
        <Modal
          isOpen={true}
          onClose={() => {
            setInspectBatch(null)
            setBatchTransactions([])
          }}
          title={`Ekstre Detayı: ${inspectBatch.file_name}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/20 border border-border rounded-xl text-xs">
              <div>
                <span className="text-muted-foreground block">Banka:</span>
                <strong className="text-foreground">{inspectBatch.bank || '-'}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Ekstre Tarihi:</span>
                <strong className="text-foreground">{inspectBatch.statement_date || '-'}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Toplam Tutar:</span>
                <strong className="text-foreground font-mono">{formatCurrency(Number(inspectBatch.total_amount || 0))}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">Durum:</span>
                <strong className={inspectBatch.batch_status === 'COMPLETED' ? 'text-emerald-400' : 'text-amber-400'}>
                  {inspectBatch.batch_status === 'COMPLETED' ? 'Aktif' : 'Geri Alındı'}
                </strong>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">
                  Bağlı Hareketler ({batchTransactions.length})
                </span>
                {inspectBatch.batch_status === 'ROLLED_BACK' && (
                  <span className="text-amber-400">
                    (Bu ekstre geri alındığı için hareketler silinmiştir)
                  </span>
                )}
              </div>

              {loadingTx ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Hareketler yükleniyor...
                </div>
              ) : batchTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                  {inspectBatch.batch_status === 'ROLLED_BACK'
                    ? 'Bu ekstre geri alındığı için veritabanında aktif hareketi bulunmuyor.'
                    : 'Kayıtlı hareket bulunamadı.'}
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                  {batchTransactions.map((tx) => (
                    <div key={tx.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-foreground">{tx.description}</div>
                        <div className="text-muted-foreground text-3xs flex items-center gap-2">
                          <span>{tx.date}</span>
                          {tx.merchant && <span>• {tx.merchant}</span>}
                          {tx.recurrence && <span className="text-primary font-medium">• {tx.recurrence}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-foreground">
                          {formatCurrency(Number(tx.amount || 0))}
                        </span>
                        <div className="text-3xs text-muted-foreground">
                          {tx.analysis_group}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInspectBatch(null)
                  setBatchTransactions([])
                }}
              >
                Kapat
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rollback Confirmation Modal */}
      {rollbackTarget && (
        <Modal
          isOpen={true}
          onClose={() => setRollbackTarget(null)}
          title="Ekstreyi Geri Al (Atomic Rollback)"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Bu işlem geri alınamaz bir veri temizliği yapacaktır.
                </p>
                <p className="text-xs text-destructive/90">
                  <strong>"{rollbackTarget.file_name}"</strong> ekstresi ile sisteme girmiş{' '}
                  <strong>{rollbackTarget.actual_tx_count} adet işlem satırı</strong>, bu ekstreye bağlı dönem borcu özeti ve otomatik keşfedilen abonelikler veritabanından tamamen silinecektir.
                </p>
                <p className="text-xs text-destructive/80 mt-2">
                  ✓ Sistemde önceden var olan bağımsız finansal verilerinize kesinlikle dokunulmaz.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setRollbackTarget(null)}
                disabled={rollingBack}
              >
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRollback}
                disabled={rollingBack}
              >
                {rollingBack ? 'Geri Alınıyor...' : 'Evet, Ekstreyi Geri Al'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title="Kaydı Listeden Tamamen Kaldır"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>"{deleteTarget.file_name}"</strong> ekstresinin geçmiş kaydını listeden tamamen silmek üzeresiniz. Bu işlem sadece geçmiş günlüğünü temizler (verileri zaten daha önce geri alınmıştı).
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Vazgeç
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeletePermanently}
                disabled={deleting}
              >
                {deleting ? 'Siliniyor...' : 'Listeden Kaldır'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
