'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  Trash2,
  Edit2,
  Building2,
  Search,
  Check,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatLocalDateInput, cn } from '@/lib/utils'
import { financialBridge } from '@/lib/financial-bridge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { HeroCurrencyInput } from '@/components/ui/hero-currency-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import type { Debt, Account, Transaction } from '@/types/database'

function sortDebtsChronological(items: Debt[]): Debt[] {
  const getWeight = (d: Debt) => {
    if (d.type === 'Borç') return 0
    const desc = (d.description || '').toLowerCase()
    if (desc.includes('şubat')) return 10
    if (desc.includes('mart')) return 20
    if (desc.includes('nisan')) return 30
    if (desc.includes('mayıs')) return 40
    if (desc.includes('haziran')) return 50
    if (desc.includes('temmuz')) return 60
    if (desc.includes('ağustos')) return 70
    if (desc.includes('eylül')) return 80
    if (desc.includes('harcama') || desc.includes('kart')) return 90
    return 100
  }
  return [...items].sort((a, b) => getWeight(a) - getWeight(b))
}

function DebtsContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Deletion confirmation
  const [deleteTargetDebt, setDeleteTargetDebt] = useState<Debt | null>(null)
  const [isDeletingDebt, setIsDeletingDebt] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Alacak' | 'Borç'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Açık' | 'Kapatıldı'>('ALL')

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)

  // Payment deduction form
  const [deductMethod, setDeductMethod] = useState<'manual' | 'bank'>('manual')
  const [deductAmount, setDeductAmount] = useState('')
  const [targetAccountId, setTargetAccountId] = useState('')
  const [bankSearch, setBankSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Add / Edit Row Form
  const [rowForm, setRowForm] = useState({
    id: '',
    type: 'Alacak' as 'Borç' | 'Alacak',
    category: 'Maaş',
    person_or_entity: '',
    description: '',
    principal: '',
    past_payments: '0',
  })

  // Sorting
  const [debtSortField, setDebtSortField] = useState<'default' | 'person' | 'principal' | 'remaining'>('default')
  const [debtSortOrder, setDebtSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleDebtSort = (field: 'person' | 'principal' | 'remaining') => {
    if (debtSortField === field) {
      setDebtSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setDebtSortField(field)
      setDebtSortOrder(field === 'person' ? 'asc' : 'desc')
    }
  }

  // Active filters check & clear
  const hasActiveDebtFilters =
    typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery.trim() !== '' || debtSortField !== 'default'

  const handleClearDebtFilters = () => {
    setTypeFilter('ALL')
    setStatusFilter('ALL')
    setSearchQuery('')
    setDebtSortField('default')
    setDebtSortOrder('asc')
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      handleOpenAdd()
    }
  }, [searchParams])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: dData }, { data: aData }, { data: tData }] = await Promise.all([
        supabase.from('debts').select('*').order('created_at', { ascending: true }),
        supabase.from('accounts').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }).limit(500),
      ])

      if (dData) setDebts(sortDebtsChronological(dData))
      if (aData) {
        setAccounts(aData)
        if (aData.length > 0 && !targetAccountId) {
          setTargetAccountId(aData[0].id)
        }
      }
      if (tData) setTransactions(tData)
    } catch (err) {
      console.error('Veri yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }

  // Open Deduct Modal
  const handleOpenDeduct = (debt: Debt) => {
    setSelectedDebt(debt)
    setDeductAmount(debt.remaining > 0 ? debt.remaining.toString() : '')
    setDeductMethod('manual')
    setBankSearch('')
    setIsDeductModalOpen(true)
  }

  // Process payment deduction
  const handleProcessDeduction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDebt) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const amt = parseFloat(deductAmount || '0')
      if (amt <= 0) throw new Error('Geçerli bir tutar giriniz.')

      const newRemaining = Math.max(0, Math.round((Number(selectedDebt.remaining) - amt) * 100) / 100)
      const newStatus = newRemaining <= 0 ? 'Kapatıldı' : 'Açık'

      // Update debt in DB
      const { error: dErr } = await supabase
        .from('debts')
        .update({
          remaining: newRemaining,
          status: newStatus,
        })
        .eq('id', selectedDebt.id)

      if (dErr) throw dErr

      // If account selected, record transaction via financialBridge
      if (targetAccountId) {
        if (selectedDebt.type === 'Alacak') {
          await financialBridge.recordIncome({
            userId: user.id,
            amount: amt,
            accountId: targetAccountId,
            date: formatLocalDateInput(),
            merchant: 'Tahsilat: ' + selectedDebt.person_or_entity,
            description: (selectedDebt.description || selectedDebt.person_or_entity) + ' Tahsilatı',
          })
        } else {
          await financialBridge.recordExpense({
            userId: user.id,
            amount: amt,
            accountId: targetAccountId,
            date: formatLocalDateInput(),
            merchant: 'Ödeme: ' + selectedDebt.person_or_entity,
            description: (selectedDebt.description || selectedDebt.person_or_entity) + ' Borç Ödemesi',
            analysisGroup: 'Hariç',
          })
        }
      }

      setIsDeductModalOpen(false)
      setSelectedDebt(null)
      toast.success('Ödeme başarıyla işlendi ve düşüldü!')
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Ödeme işlenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // Deduct directly by linking a bank transaction
  const handleDeductFromBankTx = async (tx: Transaction) => {
    if (!selectedDebt) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const res = await financialBridge.linkTransactionToDebt({
        userId: user.id,
        transactionId: tx.id,
        debtId: selectedDebt.id,
      })

      if (!res.success) throw new Error(res.error)

      setIsDeductModalOpen(false)
      setSelectedDebt(null)
      toast.success('Banka hareketi borca bağlandı!')
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Banka hareketi eşlenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // Open Add Modal
  const handleOpenAdd = () => {
    setRowForm({
      id: '',
      type: 'Alacak',
      category: 'Maaş',
      person_or_entity: '',
      description: '',
      principal: '',
      past_payments: '0',
    })
    setIsAddModalOpen(true)
  }

  // Save new row
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const principalNum = parseFloat(rowForm.principal || '0')
      const pastNum = parseFloat(rowForm.past_payments || '0')
      const remainingNum = Math.max(0, principalNum - pastNum)

      const { error } = await supabase.from('debts').insert({
        user_id: user.id,
        type: rowForm.type,
        category: rowForm.category,
        person_or_entity: rowForm.person_or_entity,
        description: rowForm.description || null,
        principal: principalNum,
        past_payments: pastNum,
        remaining: remainingNum,
        status: remainingNum <= 0 ? 'Kapatıldı' : 'Açık',
      })

      if (error) throw error
      setIsAddModalOpen(false)
      toast.success('Yeni borç / alacak satırı eklendi!')
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Satır eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // Open Edit Modal
  const handleOpenEdit = (debt: Debt) => {
    setRowForm({
      id: debt.id,
      type: debt.type as any,
      category: debt.category,
      person_or_entity: debt.person_or_entity,
      description: debt.description || '',
      principal: debt.principal.toString(),
      past_payments: debt.past_payments.toString(),
    })
    setIsEditModalOpen(true)
  }

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDebt) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const principalNum = parseFloat(rowForm.principal || '0')
      const pastNum = parseFloat(rowForm.past_payments || '0')
      const existingNewPayments = selectedDebt
        ? Math.max(0, Number(selectedDebt.principal) - Number(selectedDebt.past_payments) - Number(selectedDebt.remaining))
        : 0

      const remainingNum = Math.max(0, principalNum - pastNum - existingNewPayments)

      const { error } = await supabase
        .from('debts')
        .update({
          type: rowForm.type,
          category: rowForm.category,
          person_or_entity: rowForm.person_or_entity,
          description: rowForm.description || null,
          principal: principalNum,
          past_payments: pastNum,
          remaining: remainingNum,
          status: remainingNum <= 0 ? 'Kapatıldı' : 'Açık',
        })
        .eq('id', selectedDebt.id)

      if (error) throw error
      setIsEditModalOpen(false)
      toast.success('Kayıt güncellendi!')
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteDebt = async () => {
    if (!deleteTargetDebt) return
    setIsDeletingDebt(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('debts').delete().eq('id', deleteTargetDebt.id)
      if (error) throw error
      toast.success('Satır silindi.')
      setDeleteTargetDebt(null)
      await loadData()
    } catch (err: any) {
      toast.error('Silinemedi: ' + (err.message || 'Hata'))
    } finally {
      setIsDeletingDebt(false)
    }
  }

  // Summary Metrics
  const totalReceivables = debts
    .filter((d) => d.type === 'Alacak' && d.status !== 'Kapatıldı')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const totalDebts = debts
    .filter((d) => d.type === 'Borç' && d.status !== 'Kapatıldı')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const netBalance = totalReceivables - totalDebts

  // Filtered & Sorted List
  const filteredDebts = useMemo(() => {
    const list = debts.filter((d) => {
      if (typeFilter !== 'ALL' && d.type !== typeFilter) return false
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchP = d.person_or_entity.toLowerCase().includes(q)
        const matchD = (d.description || '').toLowerCase().includes(q)
        const matchC = d.category.toLowerCase().includes(q)
        if (!matchP && !matchD && !matchC) return false
      }
      return true
    })

    if (debtSortField === 'default') {
      return sortDebtsChronological(list)
    }

    return [...list].sort((a, b) => {
      if (debtSortField === 'person') {
        const cmp = (a.person_or_entity || '').localeCompare(b.person_or_entity || '', 'tr-TR')
        return debtSortOrder === 'asc' ? cmp : -cmp
      }
      if (debtSortField === 'principal') {
        const aVal = Number(a.principal || 0)
        const bVal = Number(b.principal || 0)
        return debtSortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (debtSortField === 'remaining') {
        const aVal = Number(a.remaining || 0)
        const bVal = Number(b.remaining || 0)
        return debtSortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [debts, typeFilter, statusFilter, searchQuery, debtSortField, debtSortOrder])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-24 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-12 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-80 rounded-xl bg-card/60 border border-border/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top PageHeader & Actions */}
      <PageHeader
        title="Borç & Alacak"
        description="Maaş hakedişleri ve şahsi borçların dönem takibi"
        actions={
          <Button onClick={handleOpenAdd} className="gap-2 shadow-sm text-xs h-9 font-semibold">
            <Plus className="h-4 w-4" />
            Yeni Satır Ekle
          </Button>
        }
      />

      {/* Summary Segmented Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Kesin Alacaklar (Kalan)</div>
            <div className="text-xl font-semibold tracking-tight text-emerald-400 tabular-nums mt-0.5">
              {formatCurrency(totalReceivables)}
            </div>
          </div>
          <Badge variant="success" className="text-[11px] font-mono">
            Alacak
          </Badge>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Toplam Borç (Kalan)</div>
            <div className="text-xl font-semibold tracking-tight text-rose-400 tabular-nums mt-0.5">
              {formatCurrency(totalDebts)}
            </div>
          </div>
          <Badge variant="destructive" className="text-[11px] font-mono">
            Borç
          </Badge>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Net Bakiye</div>
            <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums mt-0.5">
              {formatCurrency(netBalance)}
            </div>
          </div>
          <Badge variant="outline" className="text-[11px] font-mono">
            {debts.length} Satır
          </Badge>
        </div>
      </div>

      {/* Quick Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border">
        {/* Type Segment Tabs */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              typeFilter === 'ALL' ? 'bg-background text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tümü ({debts.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('Alacak')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              typeFilter === 'Alacak' ? 'bg-emerald-500/15 text-emerald-400 font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Alacaklar ({debts.filter((d) => d.type === 'Alacak').length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('Borç')}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              typeFilter === 'Borç' ? 'bg-rose-500/15 text-rose-400 font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Borçlar ({debts.filter((d) => d.type === 'Borç').length})
          </button>
        </div>

        {/* Search Input & Status Select */}
        <div className="flex items-center gap-2 flex-1 sm:justify-end">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Kişi veya açıklamada ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs w-full bg-background"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-8 text-xs w-28 bg-background"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="Açık">Açıklar</option>
            <option value="Kapatıldı">Kapatılanlar</option>
          </Select>

          {hasActiveDebtFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearDebtFilters}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1.5"
              title="Filtreleri Temizle"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Temizle</span>
            </Button>
          )}
        </div>
      </div>

      {/* Spreadsheet Table */}
      <Card className="border border-border shadow-md overflow-hidden rounded-xl bg-card">
        {/* Mobile View (<md) */}
        <div className="md:hidden divide-y divide-border/60 font-sans">
          {filteredDebts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs font-sans">
              Filtreye uygun kayıt bulunamadı.
            </div>
          ) : (
            filteredDebts.map((item) => {
              const principal = Number(item.principal || 0)
              const pastPayments = Number(item.past_payments || 0)
              const remaining = Number(item.remaining || 0)
              const newPayments = Math.max(
                0,
                Math.round((principal - pastPayments - remaining) * 100) / 100
              )
              const isClosed = remaining <= 0

              return (
                <div
                  key={item.id}
                  className={cn(
                    'p-4 space-y-3 transition-colors',
                    isClosed ? 'opacity-60 bg-muted/20' : 'hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={item.type === 'Alacak' ? 'success' : 'destructive'}
                          className="text-[11px] px-1.5 py-0"
                        >
                          {item.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.category}</span>
                      </div>
                      <h2 className="font-semibold text-sm text-foreground mt-1">
                        {item.person_or_entity}
                      </h2>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-muted-foreground uppercase font-medium">Kalan</div>
                      <div className="text-base font-bold font-mono text-emerald-400">
                        {remaining > 0 ? formatCurrency(remaining) : 'Kapandı'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-muted/30 p-2.5 rounded-lg border border-border/40">
                    <div>
                      <div className="text-[11px] text-muted-foreground font-sans">Ana Tutar</div>
                      <div className="text-foreground font-medium">{formatCurrency(principal)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground font-sans">Ödenen / Düşülen</div>
                      <div className="text-foreground/80 font-medium">
                        {pastPayments + newPayments > 0 ? formatCurrency(pastPayments + newPayments) : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {!isClosed && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDeduct(item)}
                        className="h-9 px-3 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Düş
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(item)}
                      className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full"
                      aria-label={`${item.person_or_entity} kaydını düzenle`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTargetDebt(item)}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-full"
                      aria-label={`${item.person_or_entity} kaydını sil`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Desktop Wide Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/75 text-muted-foreground font-semibold uppercase text-[11px] tracking-wider border-b border-border">
                <th scope="col" className="py-3 px-3 w-10 text-center">No</th>
                <th scope="col" className="py-3 px-3 w-24">Tür</th>
                <th scope="col" className="py-3 px-3 w-28">Kategori</th>
                <th
                  scope="col"
                  className="py-3 px-4 w-40"
                  aria-sort={debtSortField === 'person' ? (debtSortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleDebtSort('person')}
                    className="flex items-center gap-1.5 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  >
                    <span>Kişi / Kurum</span>
                    {debtSortField === 'person' ? (
                      debtSortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th scope="col" className="py-3 px-4">Açıklama</th>
                <th
                  scope="col"
                  className="py-3 px-3 text-right w-28"
                  aria-sort={debtSortField === 'principal' ? (debtSortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleDebtSort('principal')}
                    className="flex items-center justify-end gap-1.5 ml-auto font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  >
                    <span>Ana Tutar</span>
                    {debtSortField === 'principal' ? (
                      debtSortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th scope="col" className="py-3 px-3 text-right w-32">Geçmiş Ödeme</th>
                <th scope="col" className="py-3 px-3 text-right w-32 text-emerald-400 bg-emerald-500/5">
                  Yeni Hareketlerden
                </th>
                <th
                  scope="col"
                  className="py-3 px-3 text-right w-28 text-emerald-400 font-bold"
                  aria-sort={debtSortField === 'remaining' ? (debtSortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleDebtSort('remaining')}
                    className="flex items-center justify-end gap-1.5 ml-auto font-semibold uppercase hover:text-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  >
                    <span>Kalan</span>
                    {debtSortField === 'remaining' ? (
                      debtSortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th scope="col" className="py-3 px-3 text-center w-28 sticky right-0 bg-card/95 backdrop-blur-sm shadow-[-4px_0_8px_rgba(0,0,0,0.2)] border-l border-border z-20">
                  <span className="sr-only">İşlemler</span>
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-sans">
              {filteredDebts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Filtreye uygun kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredDebts.map((item, idx) => {
                  const principal = Number(item.principal || 0)
                  const pastPayments = Number(item.past_payments || 0)
                  const remaining = Number(item.remaining || 0)
                  const newPayments = Math.max(
                    0,
                    Math.round((principal - pastPayments - remaining) * 100) / 100
                  )
                  const isClosed = remaining <= 0

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/40 transition-colors ${
                        isClosed ? 'opacity-60 bg-muted/20' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-muted-foreground/60">
                        {idx + 1}
                      </td>

                      {/* Tür */}
                      <td className="py-2.5 px-3">
                        <span className="text-xs text-muted-foreground font-medium">
                          {item.type}
                        </span>
                      </td>

                      {/* Kategori */}
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">
                        {item.category}
                      </td>

                      {/* Kişi / Kurum */}
                      <td className="py-2.5 px-4 text-xs font-semibold text-foreground whitespace-nowrap">
                        {item.person_or_entity}
                      </td>

                      {/* Açıklama */}
                      <td className="py-2.5 px-4 text-xs text-muted-foreground/80 truncate max-w-[200px]">
                        {item.description || '-'}
                      </td>

                      {/* Ana Tutar */}
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatCurrency(principal)}
                      </td>

                      {/* Geçmiş Ödeme / Tahsil */}
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-muted-foreground/60 whitespace-nowrap">
                        {pastPayments > 0 ? formatCurrency(pastPayments) : '-'}
                      </td>

                      {/* Yeni Hareketlerden */}
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-emerald-400 bg-emerald-500/5 whitespace-nowrap">
                        {newPayments > 0 ? formatCurrency(newPayments) : '-'}
                      </td>

                      {/* Kalan */}
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">
                        {remaining > 0 ? formatCurrency(remaining) : '-'}
                      </td>

                      {/* İşlem (Sticky Right) */}
                      <td className="py-2.5 px-3 text-center sticky right-0 bg-card/95 backdrop-blur-sm shadow-[-4px_0_8px_rgba(0,0,0,0.2)] border-l border-border z-10">
                        <div className="flex items-center justify-center gap-1">
                          {!isClosed ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDeduct(item)}
                              className="h-7 px-2 text-[11px] gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
                              title="Ödeme al / bakiyeden düş"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Düş
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] h-6 font-mono">
                              Kapandı
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(item)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-md"
                            title="Düzenle"
                            aria-label={`${item.person_or_entity} kaydını düzenle`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTargetDebt(item)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-md"
                            title="Sil"
                            aria-label={`${item.person_or_entity} kaydını sil`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Deduct Payment Modal */}
      <Modal
        isOpen={isDeductModalOpen}
        onClose={() => {
          setIsDeductModalOpen(false)
          setSelectedDebt(null)
        }}
        title={selectedDebt?.type === 'Alacak' ? '💰 Tahsilat Al & Bakiyeden Düş' : '💸 Borç Ödemesi Düş'}
        description={`${selectedDebt?.person_or_entity} — ${selectedDebt?.description || selectedDebt?.category} satırından düşülecektir.`}
      >
        {selectedDebt && (
          <div className="space-y-4">
            {/* Debt info box */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Satır:</span>
                <span className="font-semibold text-foreground font-sans truncate max-w-[260px]">
                  {selectedDebt.person_or_entity} — {selectedDebt.description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Ana Tutar:</span>
                <span>{formatCurrency(selectedDebt.principal)}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-border">
                <span className="text-muted-foreground font-sans font-semibold">Mevcut Kalan:</span>
                <span className="font-bold text-emerald-500 font-mono text-base">
                  {formatCurrency(selectedDebt.remaining)}
                </span>
              </div>
            </div>

            {/* Method switcher */}
            <div className="flex rounded-lg bg-muted p-1 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setDeductMethod('manual')}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                  deductMethod === 'manual'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                💵 Tutar Girerek Düş
              </button>
              <button
                type="button"
                onClick={() => setDeductMethod('bank')}
                className={`flex-1 py-1.5 rounded-md font-semibold transition-all ${
                  deductMethod === 'bank'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🏦 Banka Hareketinden Seç
              </button>
            </div>

            {deductMethod === 'manual' ? (
              <form onSubmit={handleProcessDeduction} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="deduct-amount" className="text-xs font-semibold text-foreground">
                    Düşülecek Tutar
                  </label>
                  <Input
                    id="deduct-amount"
                    type="number"
                    step="0.01"
                    required
                    prefix="₺"
                    value={deductAmount}
                    onChange={(e) => setDeductAmount(e.target.value)}
                    className="text-base font-bold font-mono text-emerald-500"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="deduct-account" className="text-xs font-semibold text-foreground">
                    {selectedDebt.type === 'Alacak'
                      ? 'Paranın Yatacağı Banka Hesabı (Opsiyonel)'
                      : 'Paranın Çıkacağı Banka Hesabı (Opsiyonel)'}
                  </label>
                  <Select
                    id="deduct-account"
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="text-xs"
                  >
                    <option value="">(Hesap Bakiyesi Güncelleme, Sadece Tablodan Düş)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.balance)})
                      </option>
                    ))}
                  </Select>
                </div>

                {deductAmount && parseFloat(deductAmount) > 0 && (
                  <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs font-mono">
                    <span className="text-muted-foreground font-sans">İşlem Sonrası Kalan: </span>
                    <strong className="text-emerald-500 font-bold">
                      {formatCurrency(
                        Math.max(0, Number(selectedDebt.remaining) - parseFloat(deductAmount))
                      )}
                    </strong>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDeductModalOpen(false)}
                  >
                    İptal
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'İşleniyor...' : 'Ödemeyi Düş'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Bank Transaction Picker */
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="deduct-bank-search"
                    placeholder="Banka hareketlerinde ara (örn: Ahmet, 15000)..."
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    className="pl-9 text-xs"
                    aria-label="Banka hareketlerinde ara"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1.5 divide-y divide-border/40 pr-1">
                  {(() => {
                    const isReceivable = selectedDebt.type === 'Alacak'
                    const candidateTxs = transactions.filter((t) => {
                      if (isReceivable) {
                        if (t.type !== 'Gelir' && t.type !== 'Tahsilat') return false
                      } else {
                        if (t.type !== 'Harcama' && t.type !== 'Borç Ödemesi') return false
                      }
                      if (bankSearch) {
                        const q = bankSearch.toLowerCase()
                        const matchM = t.merchant?.toLowerCase().includes(q)
                        const matchD = t.description?.toLowerCase().includes(q)
                        const matchA = t.amount.toString().includes(q)
                        const matchAcc = t.account_or_card?.toLowerCase().includes(q)
                        if (!matchM && !matchD && !matchA && !matchAcc) return false
                      }
                      return true
                    })

                    if (candidateTxs.length === 0) {
                      return (
                        <div className="p-6 text-center text-xs text-muted-foreground font-sans">
                          Uygun banka hareketi bulunamadı.
                        </div>
                      )
                    }

                    return candidateTxs.slice(0, 15).map((t) => (
                      <div
                        key={t.id}
                        className="pt-2 pb-2 flex items-center justify-between gap-2 hover:bg-muted/30 px-2 rounded-lg"
                      >
                        <div className="min-w-0 text-xs font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">{formatDate(t.date)}</span>
                            <span className="font-semibold text-foreground">{t.account_or_card}</span>
                          </div>
                          <div className="text-foreground/90 truncate max-w-xs text-[11px]">
                            {t.merchant || t.description}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-bold font-mono text-emerald-500 text-xs">
                            +{formatCurrency(t.amount)}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleDeductFromBankTx(t)}
                            disabled={submitting}
                            className="h-7 text-xs gap-1"
                          >
                            <Check className="h-3 w-3" />
                            Bu Hareketi Düş
                          </Button>
                        </div>
                      </div>
                    ))
                  })()}
                </div>

                <div className="flex justify-end pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDeductModalOpen(false)}
                  >
                    Kapat
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Row Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Yeni Borç / Alacak Satırı Ekle"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Tür</label>
            <SegmentedControl<'Alacak' | 'Borç'>
              value={rowForm.type}
              onChange={(val) => setRowForm({ ...rowForm, type: val })}
              options={[
                { value: 'Alacak', label: 'Alacak (Gelecek Para)', activeClassName: 'text-emerald-400' },
                { value: 'Borç', label: 'Borç (Ödenecek Para)', activeClassName: 'text-rose-400' },
              ]}
            />
          </div>

          <HeroCurrencyInput
            id="add-debt-principal"
            label="Ana Tutar"
            type={rowForm.type === 'Alacak' ? 'income' : 'expense'}
            value={rowForm.principal}
            onChange={(val) => setRowForm({ ...rowForm, principal: val })}
            placeholder="0.00"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="add-debt-person" className="text-xs font-semibold text-foreground">Kişi / Kurum</label>
              <Input
                id="add-debt-person"
                required
                value={rowForm.person_or_entity}
                onChange={(e) => setRowForm({ ...rowForm, person_or_entity: e.target.value })}
                placeholder="Örn: Ahmet Yılmaz, Akbank"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="add-debt-category" className="text-xs font-semibold text-foreground">Kategori</label>
              <Input
                id="add-debt-category"
                required
                value={rowForm.category}
                onChange={(e) => setRowForm({ ...rowForm, category: e.target.value })}
                placeholder="Örn: Maaş, Kişisel Borç, Diğer"
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="add-debt-description" className="text-xs font-semibold text-foreground">Açıklama</label>
            <Input
              id="add-debt-description"
              required
              value={rowForm.description}
              onChange={(e) => setRowForm({ ...rowForm, description: e.target.value })}
              placeholder="Örn: Temmuz Ayı Çalışması (Ağustos Maaşı)"
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="add-debt-past-payments" className="text-xs font-semibold text-foreground">Geçmiş Ödeme / Mahsup</label>
            <Input
              id="add-debt-past-payments"
              type="number"
              step="0.01"
              prefix="₺"
              value={rowForm.past_payments}
              onChange={(e) => setRowForm({ ...rowForm, past_payments: e.target.value })}
              placeholder="0.00"
              className="text-xs font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Satırı Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Row Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Satırı Düzenle"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Tür</label>
            <SegmentedControl<'Alacak' | 'Borç'>
              value={rowForm.type}
              onChange={(val) => setRowForm({ ...rowForm, type: val })}
              options={[
                { value: 'Alacak', label: 'Alacak (Gelecek Para)', activeClassName: 'text-emerald-400' },
                { value: 'Borç', label: 'Borç (Ödenecek Para)', activeClassName: 'text-rose-400' },
              ]}
            />
          </div>

          <HeroCurrencyInput
            id="edit-debt-principal"
            label="Ana Tutar"
            type={rowForm.type === 'Alacak' ? 'income' : 'expense'}
            value={rowForm.principal}
            onChange={(val) => setRowForm({ ...rowForm, principal: val })}
            placeholder="0.00"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="edit-debt-person" className="text-xs font-semibold text-foreground">Kişi / Kurum</label>
              <Input
                id="edit-debt-person"
                required
                value={rowForm.person_or_entity}
                onChange={(e) => setRowForm({ ...rowForm, person_or_entity: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-debt-category" className="text-xs font-semibold text-foreground">Kategori</label>
              <Input
                id="edit-debt-category"
                required
                value={rowForm.category}
                onChange={(e) => setRowForm({ ...rowForm, category: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-debt-description" className="text-xs font-semibold text-foreground">Açıklama</label>
            <Input
              id="edit-debt-description"
              required
              value={rowForm.description}
              onChange={(e) => setRowForm({ ...rowForm, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-debt-past-payments" className="text-xs font-semibold text-foreground">Geçmiş Ödeme / Mahsup</label>
            <Input
              id="edit-debt-past-payments"
              type="number"
              step="0.01"
              prefix="₺"
              value={rowForm.past_payments}
              onChange={(e) => setRowForm({ ...rowForm, past_payments: e.target.value })}
              className="text-xs font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Debt Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetDebt)}
        onClose={() => setDeleteTargetDebt(null)}
        onConfirm={confirmDeleteDebt}
        title="Kaydı Sil"
        description={`"${deleteTargetDebt?.person_or_entity} — ${deleteTargetDebt?.description || deleteTargetDebt?.category}" satırını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Kaydı Sil"
        cancelLabel="Vazgeç"
        isLoading={isDeletingDebt}
        variant="destructive"
      />
    </div>
  )
}

export default function DebtsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Borç & Alacak yükleniyor...
        </div>
      }
    >
      <DebtsContent />
    </Suspense>
  )
}
