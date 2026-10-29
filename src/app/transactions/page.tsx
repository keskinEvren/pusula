'use client'

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  Search,
  Filter,
  Trash2,
  ReceiptText,
  Calendar,
  FolderKanban,
  Download,
  CreditCard as CardIcon,
  Building2,
  Layers,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
  Loader2,
} from 'lucide-react'
import {
  parsePageResults,
  deduplicateById,
  type KeysetCursor,
} from '@/lib/keyset-pagination'
import { createClient } from '@/lib/supabase/client'
import {
  formatCurrency,
  formatDate,
  formatMonthYear,
  formatLocalDateInput,
  formatLocalMonthInput,
  cn,
} from '@/lib/utils'
import {
  round2,
  calculateSubscriptionEquivalent,
  normalizeSubscriptionPeriod,
  safeParseAmount,
} from '@/lib/finance-engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { HeroCurrencyInput } from '@/components/ui/hero-currency-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import type { Transaction, CreditCard, Account } from '@/types/database'

function TransactionsContent() {
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Keyset Pagination & Server-Side States
  const [cursor, setCursor] = useState<KeysetCursor | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stats, setStats] = useState<{
    total_count: number
    total_volume: number
    total_spent: number
  }>({
    total_count: 0,
    total_volume: 0,
    total_spent: 0,
  })
  const [statsLoading, setStatsLoading] = useState(false)

  // Mobile filters collapsible panel
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    description: string
    confirmLabel?: string
    variant?: 'destructive' | 'warning' | 'default'
    onConfirm: () => Promise<void>
    isLoading?: boolean
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {},
    isLoading: false,
  })

  // Segment Tab: 'all' | 'cards' | 'accounts'
  const [segmentTab, setSegmentTab] = useState<'all' | 'cards' | 'accounts'>('all')

  // Specific entity filter
  const [selectedEntityId, setSelectedEntityId] = useState<string>('ALL')

  // Filters
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const [groupFilter, setGroupFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [monthFilter, setMonthFilter] = useState<string>('ALL')
  const [importFilter, setImportFilter] = useState<string>('ALL')

  // Sorting state
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Dynamic available months extracted from calendar + loaded transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    const now = new Date()
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    transactions.forEach((t) => {
      if (t.date && t.date.length >= 7) {
        months.add(t.date.slice(0, 7))
      }
    })
    if (monthFilter && monthFilter !== 'ALL') {
      months.add(monthFilter)
    }
    return Array.from(months).sort().reverse()
  }, [transactions, monthFilter])

  const currentMonth = formatLocalMonthInput()

  // Check if any filter is active
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedEntityId !== 'ALL' ||
    monthFilter !== 'ALL' ||
    groupFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    importFilter !== 'ALL'

  const handleClearFilters = () => {
    setSearchTerm('')
    setSelectedEntityId('ALL')
    setMonthFilter('ALL')
    setGroupFilter('ALL')
    setTypeFilter('ALL')
    setImportFilter('ALL')
  }

  // Sync with URL Search Params (F15: handle param removal as reset)
  useEffect(() => {
    const month = searchParams.get('month')
    setMonthFilter(month || 'ALL')
    const group = searchParams.get('group')
    setGroupFilter(group || 'ALL')
    const search = searchParams.get('search')
    setSearchTerm(search || '')
    const importId = searchParams.get('import_id')
    setImportFilter(importId || 'ALL')
    const isNew = searchParams.get('new')
    if (isNew === 'true') setIsAddModalOpen(true)
  }, [searchParams])

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [targetAccountId, setTargetAccountId] = useState('')
  const [targetCardId, setTargetCardId] = useState('')
  const [newTx, setNewTx] = useState({
    date: formatLocalDateInput(),
    account_or_card: 'Enpara Vadesiz',
    type: 'Harcama',
    description: '',
    merchant: '',
    amount: '',
    analysis_group: 'Kişisel',
  })

  // Convert to Recurring (Subscription/Bill/Installment) Modal State
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false)
  const [recurringSaving, setRecurringSaving] = useState(false)
  const [recurringForm, setRecurringForm] = useState({
    service: '',
    category: 'Abonelik' as 'Abonelik' | 'Fatura' | 'Taksit' | 'Düzenli Gider',
    group_type: 'Kişisel' as 'Kişisel' | 'İş',
    amount: '',
    period: 'Aylık',
    end_date: '',
    payment_method: '',
  })

  const handleOpenRecurringModal = (tx: Transaction) => {
    const m = (tx.merchant || tx.description || '').toLowerCase()
    let guessedCategory: 'Abonelik' | 'Fatura' | 'Taksit' | 'Düzenli Gider' = 'Abonelik'
    if (
      m.includes('telekom') ||
      m.includes('turkcell') ||
      m.includes('vodafone') ||
      m.includes('enerji') ||
      m.includes('elektrik') ||
      m.includes('su ') ||
      m.includes('gaz') ||
      m.includes('fatura')
    ) {
      guessedCategory = 'Fatura'
    } else if (m.includes('kredi') || m.includes('taksit') || m.includes('finans')) {
      guessedCategory = 'Taksit'
    }

    setRecurringForm({
      service: tx.merchant || tx.description || '',
      category: guessedCategory,
      group_type: tx.analysis_group === 'İş' ? 'İş' : 'Kişisel',
      amount: tx.amount.toString(),
      period: 'Aylık',
      end_date: '',
      payment_method: tx.account_or_card || 'Kredi Kartı',
    })
    setIsRecurringModalOpen(true)
  }

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecurringSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { error } = await supabase.from('subscriptions').insert({
        user_id: user.id,
        service: recurringForm.service.trim(),
        group_type: recurringForm.group_type,
        model: recurringForm.category,
        amount: Math.max(0, safeParseAmount(recurringForm.amount)),
        currency: 'TRY',
        period: normalizeSubscriptionPeriod(recurringForm.period),
        end_date: recurringForm.end_date || null,
        decision: 'Devam',
        payment_method: recurringForm.payment_method || null,
        status: 'Aktif',
      })

      if (error) throw error
      setIsRecurringModalOpen(false)
      toast.success(`"${recurringForm.service}" başarıyla Sabit Yükler & Düzenli Giderler listenize eklendi!`)
    } catch (err: any) {
      toast.error(err.message || 'Sabit yüke eklenemedi')
    } finally {
      setRecurringSaving(false)
    }
  }

  // Load metadata (cards, accounts) once on mount
  useEffect(() => {
    async function loadMetadata() {
      try {
        const supabase = createClient()
        const [{ data: crds }, { data: accs }] = await Promise.all([
          supabase.from('credit_cards').select('*'),
          supabase.from('accounts').select('*'),
        ])

        if (crds) setCards(crds)
        if (accs) setAccounts(accs)
      } catch (err) {
        console.error('Error loading metadata:', err)
      }
    }
    loadMetadata()
  }, [])

  const fetchTransactionsBatch = useCallback(
    async (opts: { isInitial: boolean; activeCursor: KeysetCursor | null }) => {
      const supabase = createClient()

      const activeCursor = !opts.isInitial ? opts.activeCursor : null
      const cursorDate = activeCursor && activeCursor.field === 'date' ? activeCursor.date : null
      const cursorAmount = activeCursor && activeCursor.field === 'amount' ? activeCursor.amount : null
      const cursorId = activeCursor ? activeCursor.id : null

      const { data, error } = await supabase.rpc('fn_transactions_page', {
        p_search: debouncedSearchTerm.trim() || null,
        p_group: groupFilter !== 'ALL' ? groupFilter : null,
        p_type: typeFilter !== 'ALL' ? typeFilter : null,
        p_project_id: null,
        p_month: monthFilter !== 'ALL' ? monthFilter : null,
        p_import_id: importFilter !== 'ALL' ? importFilter : null,
        p_segment_tab: segmentTab,
        p_entity_id: selectedEntityId,
        p_sort_field: sortField,
        p_sort_order: sortOrder,
        p_cursor_date: cursorDate,
        p_cursor_amount: cursorAmount,
        p_cursor_id: cursorId,
        p_limit: 51,
      })

      if (error) {
        console.error('Transactions query error:', error)
        return { items: [] as Transaction[], hasMore: false, nextCursor: null }
      }

      return parsePageResults<Transaction>((data as unknown as Transaction[]) || [], 50, sortField)
    },
    [
      segmentTab,
      selectedEntityId,
      monthFilter,
      debouncedSearchTerm,
      groupFilter,
      typeFilter,
      importFilter,
      sortField,
      sortOrder,
    ]
  )

  const fetchTransactionsStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('fn_transactions_stats', {
        p_search: debouncedSearchTerm.trim() || null,
        p_group: groupFilter !== 'ALL' ? groupFilter : null,
        p_type: typeFilter !== 'ALL' ? typeFilter : null,
        p_project_id: null,
        p_month: monthFilter !== 'ALL' ? monthFilter : null,
        p_import_id: importFilter !== 'ALL' ? importFilter : null,
        p_segment_tab: segmentTab,
        p_entity_id: selectedEntityId,
      })
      if (!error && data) {
        setStats({
          total_count: Number(data.total_count || 0),
          total_volume: Number(data.total_volume || 0),
          total_spent: Number(data.total_spent || 0),
        })
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [
    debouncedSearchTerm,
    groupFilter,
    typeFilter,
    monthFilter,
    importFilter,
    segmentTab,
    selectedEntityId,
  ])

  // Reset and reload initial page when any filter or sorting changes
  const resetAndReload = useCallback(async () => {
    setLoading(true)
    setCursor(null)
    setHasMore(true)
    try {
      const [parsed] = await Promise.all([
        fetchTransactionsBatch({ isInitial: true, activeCursor: null }),
        fetchTransactionsStats(),
      ])
      setTransactions(parsed.items)
      setCursor(parsed.nextCursor)
      setHasMore(parsed.hasMore)
    } finally {
      setLoading(false)
    }
  }, [fetchTransactionsBatch, fetchTransactionsStats])

  useEffect(() => {
    resetAndReload()
  }, [resetAndReload])

  const loadMoreTransactions = async () => {
    if (!hasMore || loadingMore || !cursor) return
    setLoadingMore(true)
    try {
      const parsed = await fetchTransactionsBatch({ isInitial: false, activeCursor: cursor })
      setTransactions((prev) => deduplicateById(prev, parsed.items))
      setCursor(parsed.nextCursor)
      setHasMore(parsed.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  // Alias loadTransactions for backward compatibility
  const loadTransactions = resetAndReload

  // Same-tab & cross-tab mutation event listeners
  useEffect(() => {
    const handleTxMutated = () => {
      resetAndReload()
    }
    window.addEventListener('pusula:transaction-created', handleTxMutated)
    window.addEventListener('pusula:transaction-mutated', handleTxMutated)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetAndReload()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pusula:transaction-created', handleTxMutated)
      window.removeEventListener('pusula:transaction-mutated', handleTxMutated)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [resetAndReload])

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Oturum açılmamış')

      const amountNum = parseFloat(newTx.amount || '0')
      if (amountNum <= 0) {
        throw new Error('Tutar sıfırdan büyük olmalıdır.')
      }

      const account = accounts.find((a) => a.name === newTx.account_or_card)
      const card = cards.find((c) => `${c.bank} • ${c.last_four || 'Kart'}` === newTx.account_or_card)

      const accountId = account?.id || null
      const cardId = card?.id || null

      let txDescription = newTx.description || newTx.merchant || 'Harcama'
      let txMerchant = newTx.merchant || newTx.description || null
      let txGroup = newTx.analysis_group
      let txAccountId = accountId
      let txCardId = cardId
      let txAccountOrCard = newTx.account_or_card

      if (newTx.type === 'Gelir') {
        if (!accountId) {
          throw new Error('Gelir için bir banka hesabı seçilmelidir.')
        }
        txGroup = 'Gelir'
      } else if (newTx.type === 'Kart Ödemesi') {
        if (!accountId || !targetCardId) throw new Error('Kaynak hesap ve ödenecek kart seçilmelidir.')
        txGroup = 'Hariç'
        txCardId = targetCardId
        const targetCard = cards.find((c) => c.id === targetCardId)
        txDescription = txDescription || 'Kart Ödemesi'
        txMerchant = targetCard ? `${targetCard.bank} • ${targetCard.last_four || 'Kart'}` : 'Kart Ödemesi'
      } else if (newTx.type === 'Transfer') {
        if (!accountId || !targetAccountId) throw new Error('Kaynak ve hedef hesap seçilmelidir.')
        txGroup = 'Hariç'
        const targetAcc = accounts.find((a) => a.id === targetAccountId)
        txDescription = txDescription || 'Hesaplar Arası Transfer'
        txMerchant = targetAcc ? targetAcc.name : 'Transfer'
      }

      const { error: insertError } = await supabase.from('transactions').insert({
        user_id: user.id,
        date: newTx.date,
        amount: amountNum,
        type: newTx.type as any,
        description: txDescription,
        merchant: txMerchant,
        analysis_group: txGroup as any,
        account_id: txAccountId,
        card_id: txCardId,
        account_or_card: txAccountOrCard,
      })

      if (insertError) {
        throw insertError
      }

      setIsAddModalOpen(false)
      setTargetAccountId('')
      setTargetCardId('')
      setNewTx({
        date: formatLocalDateInput(),
        account_or_card: 'Enpara Vadesiz',
        type: 'Harcama',
        description: '',
        merchant: '',
        amount: '',
        analysis_group: 'Kişisel',
      })
      resetAndReload()
      toast.success('Yeni hareket başarıyla eklendi.')
    } catch (err: any) {
      toast.error(err.message || 'Hareket eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hareketi Sil',
      description: 'Bu hareketi işlem defterinden silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      confirmLabel: 'Hareketi Sil',
      variant: 'destructive',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        try {
          const supabase = createClient()
          const { error } = await supabase.from('transactions').delete().eq('id', id)
          if (error) throw error
          setTransactions((prev) => prev.filter((t) => t.id !== id))
          setStats((prev) => ({
            ...prev,
            total_count: Math.max(0, prev.total_count - 1),
          }))
          toast.success('Hareket silindi.')
        } catch (err: any) {
          toast.error(err?.message || 'Silinemedi')
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

  // Server-filtered & keyset-paginated transactions list
  const sortedTransactions = transactions
  const totalVolume = stats.total_volume
  const totalSpent = stats.total_spent

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-10 w-80 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-28 rounded-xl bg-card/60 border border-border/40" />
        <div className="h-96 rounded-xl bg-card/60 border border-border/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Standart PageHeader */}
      <PageHeader
        title="Genel İşlem Defteri"
        description={`Kredi kartı harcamaları ve banka nakit hareketlerinin konsolide dökümü (${transactions.length} toplam hareket).`}
        badge={
          importFilter !== 'ALL' ? (
            <div className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/30">
              <span>Paket Filtresi Aktif</span>
              <button
                type="button"
                onClick={() => setImportFilter('ALL')}
                className="hover:text-destructive"
                title="Filtreyi Kaldır"
                aria-label="Paket filtresini kaldır"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : undefined
        }
        actions={
          <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 shadow-sm h-10 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            Manuel Hareket Ekle
          </Button>
        }
      />

      {/* Segment Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3" role="tablist" aria-label="Hareket Görünümü">
        <button
          type="button"
          role="tab"
          aria-selected={segmentTab === 'all'}
          onClick={() => {
            setSegmentTab('all')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 min-h-[36px] text-xs font-semibold transition-all ${
            segmentTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Tüm Hareketler</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={segmentTab === 'cards'}
          onClick={() => {
            setSegmentTab('cards')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 min-h-[36px] text-xs font-semibold transition-all ${
            segmentTab === 'cards'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CardIcon className="h-3.5 w-3.5" />
          <span>Kredi Kartı Harcamaları</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={segmentTab === 'accounts'}
          onClick={() => {
            setSegmentTab('accounts')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2 min-h-[36px] text-xs font-semibold transition-all ${
            segmentTab === 'accounts'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Banka / Nakit Akışı</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-border bg-card p-4 shadow-sm">
        {/* Mobile Search & Filter toggle button */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="İşyeri veya açıklama ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs"
              aria-label="İşyeri veya açıklama ara"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            className="gap-1.5 shrink-0 h-10 px-3"
            aria-expanded={isMobileFiltersOpen}
            aria-label="Filtre panelini aç veya kapat"
          >
            <Filter className="h-4 w-4" />
            <span className="text-xs">Filtreler</span>
            {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
          </Button>
        </div>

        {/* Desktop Filter Grid / Mobile Collapsible Panel */}
        <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-5', !isMobileFiltersOpen && 'hidden md:grid', isMobileFiltersOpen && 'mt-3 md:mt-0')}>
          {/* Search Box (Desktop) */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="İşyeri veya açıklama ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs"
              aria-label="İşyeri veya açıklama ara"
            />
          </div>

          {/* Specific Card / Account Selector */}
          <Select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="text-xs font-semibold"
            aria-label="Hesap veya Kart Filtresi"
          >
            <option value="ALL">Tüm Kartlar & Hesaplar</option>
            <optgroup label="💳 Kredi Kartları">
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bank} - {c.card_name}
                </option>
              ))}
            </optgroup>
            <optgroup label="🏦 Banka & Kasalar">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          </Select>

          {/* Month Selector - Dynamic */}
          <Select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-xs"
            aria-label="Dönem Filtresi"
          >
            <option value="ALL">Tüm Dönemler</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthYear(m)}{m === currentMonth ? ' (Bu Ay)' : ''}
              </option>
            ))}
          </Select>

          {/* Group Filter */}
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="text-xs"
            aria-label="Grup Filtresi"
          >
            <option value="ALL">Tüm Gruplar</option>
            <option value="Kişisel">Kişisel</option>
            <option value="İş">İş (SaaS & Operasyon)</option>
            <option value="Finansman">Finansman / Faiz</option>
            <option value="Hariç">Hariç (Transfer & Ödeme)</option>
            <option value="Gelir">Gelir (Maaş / Destek)</option>
          </Select>
        </div>

        {/* Clear Filters Toolbar Banner */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>Filtreler aktif ({stats.total_count} hareket bulundu)</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <RotateCcw className="h-3 w-3" />
              Filtreleri Temizle
            </Button>
          </div>
        )}
      </Card>

      {/* Transactions Table Card */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border py-3 px-4 flex flex-row items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span>Listelenen: <strong className="text-foreground">{sortedTransactions.length}</strong> / {stats.total_count} hareket</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-[11px] text-primary hover:underline font-normal"
              >
                (Filtreleri Temizle)
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5">
              Tüketim Toplamı: <strong className="text-foreground">{formatCurrency(totalSpent)}</strong>
              {statsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </span>
          </div>
        </CardHeader>

        {/* Mobile Compact Card View (< md) */}
        <div className="md:hidden divide-y divide-border/40 font-sans">
          {sortedTransactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              Filtrelere uygun hareket bulunamadı.
            </div>
          ) : (
            sortedTransactions.map((tx) => (
              <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground truncate block max-w-[200px]">
                      {tx.merchant || tx.description}
                    </span>
                    <Badge
                      variant={
                        tx.analysis_group === 'İş'
                          ? 'primary'
                          : tx.analysis_group === 'Finansman'
                          ? 'destructive'
                          : (tx.analysis_group as string) === 'Gelir'
                          ? 'success'
                          : 'outline'
                      }
                      className="text-[11px] px-1.5 py-0"
                    >
                      {tx.analysis_group}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDate(tx.date)}</span>
                    <span>•</span>
                    <span className="truncate">
                      {cards.find((c) => c.id === tx.card_id)?.card_name ||
                        accounts.find((a) => a.id === tx.account_id)?.name ||
                        'Nakit'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right font-mono font-bold text-xs">
                    <span
                      className={
                        tx.type === 'Gelir' || tx.type === 'Tahsilat'
                          ? 'text-success'
                          : tx.type === 'İade'
                          ? 'text-primary font-semibold'
                          : tx.analysis_group === 'Hariç'
                          ? 'text-muted-foreground'
                          : 'text-foreground'
                      }
                    >
                      {tx.type === 'Gelir' || tx.type === 'Tahsilat' ? '+' : '−'}{' '}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tx.id)}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-full"
                    aria-label="Hareketi sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Wide Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
              <tr>
                <th
                  scope="col"
                  className="p-3"
                  aria-sort={sortField === 'date' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-1.5 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  >
                    <span>Tarih</span>
                    {sortField === 'date' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th scope="col" className="p-3">Hesap / Kart</th>
                <th scope="col" className="p-3">Tür</th>
                <th scope="col" className="p-3">İşyeri / Açıklama</th>
                <th scope="col" className="p-3">Grup</th>
                <th
                  scope="col"
                  className="p-3 text-right"
                  aria-sort={sortField === 'amount' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleSort('amount')}
                    className="flex items-center justify-end gap-1.5 ml-auto font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-0.5"
                  >
                    <span>Tutar</span>
                    {sortField === 'amount' ? (
                      sortOrder === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>
                <th scope="col" className="p-3 text-center w-12"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground font-sans">
                    Filtrelere uygun hareket bulunamadı.
                  </td>
                </tr>
              ) : (
                sortedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="p-3 font-semibold text-foreground font-sans whitespace-nowrap">
                      {tx.account_or_card || 'Kredi Kartı'}
                    </td>
                    <td className="p-3 font-sans">
                      <Badge
                        variant={
                          tx.type === 'Gelir' || tx.type === 'Tahsilat'
                            ? 'success'
                            : tx.type === 'Kart Ödemesi' || tx.type === 'Transfer'
                            ? 'outline'
                            : tx.type === 'İade'
                            ? 'primary'
                            : 'default'
                        }
                        className="text-[11px]"
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="p-3 font-sans max-w-xs" title={tx.description || tx.merchant || ''}>
                      <span className="font-medium text-foreground">{tx.merchant}</span>
                      {tx.recurrence && (
                        <Badge variant="outline" className="ml-1.5 text-[11px] font-mono">
                          {tx.recurrence}
                        </Badge>
                      )}
                      {tx.description && tx.description !== tx.merchant && (
                        <div className="text-muted-foreground text-[11px] truncate">
                          {tx.description
                            .replace(/\s*\[DEBT:[^\]]+\]/gi, '')
                            .replace(/\s*\[INV:[^\]]+\]/gi, '')
                            .trim()}
                        </div>
                      )}

                      {tx.type === 'Harcama' && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenRecurringModal(tx)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium hover:underline transition-colors"
                            title="Bu harcamayı aylık düzenli gider / abonelik / fatura yap"
                          >
                            Abonelik Yap →
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-sans">
                      <Badge
                        variant={
                          tx.analysis_group === 'İş'
                            ? 'primary'
                            : tx.analysis_group === 'Finansman'
                            ? 'destructive'
                            : (tx.analysis_group as string) === 'Gelir'
                            ? 'success'
                            : 'outline'
                        }
                        className="text-[11px]"
                      >
                        {tx.analysis_group}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-bold whitespace-nowrap">
                      <span
                        className={
                          tx.type === 'Gelir' || tx.type === 'Tahsilat'
                            ? 'text-success'
                            : tx.type === 'İade'
                            ? 'text-primary font-semibold'
                            : tx.analysis_group === 'Hariç'
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                        }
                      >
                        {tx.type === 'Gelir' || tx.type === 'Tahsilat' ? '+' : tx.type === 'İade' ? '−' : '−'}{' '}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(tx.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-md"
                        aria-label="Hareketi sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Keyset Pagination & Load More Footer */}
        <div className="border-t border-border p-4 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            <span>
              Toplam <strong className="text-foreground">{stats.total_count}</strong> hareketten{' '}
              <strong className="text-foreground">{sortedTransactions.length}</strong> tanesi listeleniyor
            </span>
          </div>
          {hasMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadMoreTransactions}
              disabled={loadingMore}
              className="w-full sm:w-auto min-w-[150px] text-xs font-semibold gap-2 border-primary/30 text-primary hover:bg-primary/10"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Yükleniyor...
                </>
              ) : (
                <>Daha Fazla Yükle ({Math.min(50, Math.max(0, stats.total_count - sortedTransactions.length))})</>
              )}
            </Button>
          )}
        </div>
      </Card>

      {/* Add Transaction Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Yeni Hareket Ekle"
        size="md"
      >
        <form onSubmit={handleAddTransaction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">İşlem Türü</label>
            <SegmentedControl
              value={newTx.type}
              onChange={(val) => setNewTx({ ...newTx, type: val })}
              options={[
                { value: 'Harcama', label: 'Harcama', activeClassName: 'text-rose-400' },
                { value: 'Gelir', label: 'Gelir', activeClassName: 'text-emerald-400' },
                { value: 'Transfer', label: 'Transfer', activeClassName: 'text-primary' },
                { value: 'Kart Ödemesi', label: 'Kart Ödemesi' },
              ]}
            />
          </div>

          <HeroCurrencyInput
            id="add-tx-amount"
            label="İşlem Tutarı"
            type={newTx.type === 'Gelir' ? 'income' : newTx.type === 'Harcama' ? 'expense' : 'neutral'}
            value={newTx.amount}
            onChange={(val) => setNewTx({ ...newTx, amount: val })}
            placeholder="0.00"
          />

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="add-tx-date" className="text-xs font-semibold text-foreground">Tarih</label>
              <Input
                id="add-tx-date"
                type="date"
                value={newTx.date}
                onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="add-tx-account" className="text-xs font-semibold text-foreground">Hesap / Kart</label>
              <Select
                id="add-tx-account"
                value={newTx.account_or_card}
                onChange={(e) => setNewTx({ ...newTx, account_or_card: e.target.value })}
              >
                <optgroup label="Banka Hesapları">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Kredi Kartları">
                  {cards.map((c) => (
                    <option key={c.id} value={`${c.bank} • ${c.last_four || 'Kart'}`}>
                      {c.bank} - {c.card_name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
          </div>

          {newTx.type === 'Transfer' && (
            <div className="space-y-1">
              <label htmlFor="add-tx-target-account" className="text-xs font-semibold text-foreground">Hedef Hesap</label>
              <Select id="add-tx-target-account" value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)} required aria-label="Hedef Hesap">
                <option value="">Hedef hesap seçin</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </Select>
            </div>
          )}

          {newTx.type === 'Kart Ödemesi' && (
            <div className="space-y-1">
              <label htmlFor="add-tx-target-card" className="text-xs font-semibold text-foreground">Ödenecek Kart</label>
              <Select id="add-tx-target-card" value={targetCardId} onChange={(e) => setTargetCardId(e.target.value)} required aria-label="Ödenecek Kart">
                <option value="">Kart seçin</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>{card.bank} - {card.card_name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="add-tx-merchant" className="text-xs font-semibold text-foreground">İşyeri / Başlık</label>
            <Input
              id="add-tx-merchant"
              value={newTx.merchant}
              onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value })}
              placeholder="Örn: Cursor, Market..."
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="add-tx-group" className="text-xs font-semibold text-foreground">Analiz Grubu</label>
            <Select
              id="add-tx-group"
              value={newTx.analysis_group}
              onChange={(e) => setNewTx({ ...newTx, analysis_group: e.target.value })}
            >
              <option value="Kişisel">Kişisel</option>
              <option value="İş">İş (SaaS & Gider)</option>
              <option value="Finansman">Finansman</option>
              <option value="Hariç">Hariç</option>
              <option value="Gelir">Gelir</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Convert to Recurring Modal */}
      <Modal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        title="Düzenli Gider / Abonelik / Fatura Olarak Ekle"
        size="md"
      >
        <form onSubmit={handleSaveRecurring} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="rec-service" className="text-xs font-semibold text-muted-foreground">
              Hizmet / Kurum / Fatura Adı
            </label>
            <Input
              id="rec-service"
              required
              value={recurringForm.service}
              onChange={(e) => setRecurringForm({ ...recurringForm, service: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="rec-category" className="text-xs font-semibold text-muted-foreground">Kategori Türü</label>
              <Select
                id="rec-category"
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value as any })}
                className="text-xs"
              >
                <option value="Abonelik">💳 SaaS / Abonelik</option>
                <option value="Fatura">⚡ Fatura (GSM, Elektrik, vb.)</option>
                <option value="Taksit">📆 Dış Hesap Taksiti / Kredi</option>
                <option value="Düzenli Gider">🏠 Düzenli Gider (Kira, Aidat)</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="rec-group" className="text-xs font-semibold text-muted-foreground">Kapsam Grubu</label>
              <Select
                id="rec-group"
                value={recurringForm.group_type}
                onChange={(e) => setRecurringForm({ ...recurringForm, group_type: e.target.value as any })}
                className="text-xs"
              >
                <option value="Kişisel">Kişisel</option>
                <option value="İş">İş (Girişim / Şirket)</option>
              </Select>
            </div>
          </div>

          {(() => {
            const normRecPeriod = normalizeSubscriptionPeriod(recurringForm.period)
            const parsedAmt = safeParseAmount(recurringForm.amount)
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label htmlFor="rec-amount" className="text-xs font-semibold text-muted-foreground">
                    {normRecPeriod === 'Tek Seferlik'
                      ? 'Tek Seferlik Tutar'
                      : normRecPeriod === '3 Aylık' || normRecPeriod === '6 Aylık' || normRecPeriod === 'Yıllık'
                      ? `${normRecPeriod} Toplam Tutar`
                      : normRecPeriod === 'Haftalık'
                      ? 'Haftalık Tutar'
                      : 'Aylık Tutar'}
                  </label>
                  <Input
                    id="rec-amount"
                    type="number"
                    step="0.01"
                    prefix="₺"
                    required
                    value={recurringForm.amount}
                    onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                    className="text-xs font-mono font-semibold"
                  />
                  {parsedAmt > 0 && normRecPeriod !== 'Aylık' && normRecPeriod !== 'Tek Seferlik' && (
                    <p className="text-[10px] text-muted-foreground">
                      Aylık eşdeğer: ~{formatCurrency(calculateSubscriptionEquivalent(parsedAmt, normRecPeriod).monthly)} / ay
                    </p>
                  )}
                  {parsedAmt > 0 && normRecPeriod === 'Tek Seferlik' && (
                    <p className="text-[10px] text-muted-foreground">
                      Tek seferlik gider; aylık tekrarlayan yüke katılmaz.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="rec-period" className="text-xs font-semibold text-muted-foreground">Ödeme Periyodu</label>
                  <Select
                    id="rec-period"
                    value={normRecPeriod}
                    onChange={(e) => setRecurringForm({ ...recurringForm, period: e.target.value })}
                    className="text-xs"
                  >
                    <option value="Aylık">Aylık</option>
                    <option value="Haftalık">Haftalık</option>
                    <option value="3 Aylık">3 Aylık</option>
                    <option value="6 Aylık">6 Aylık</option>
                    <option value="Yıllık">Yıllık</option>
                    <option value="Tek Seferlik">Tek Seferlik</option>
                  </Select>
                </div>
              </div>
            )
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="rec-payment-method" className="text-xs font-semibold text-muted-foreground">
                Ödeme Yolu / Kart / Kasa
              </label>
              <Input
                id="rec-payment-method"
                value={recurringForm.payment_method}
                onChange={(e) => setRecurringForm({ ...recurringForm, payment_method: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="rec-end-date" className="text-xs font-semibold text-muted-foreground">
                Bitiş Tarihi (Opsiyonel)
              </label>
              <Input
                id="rec-end-date"
                type="date"
                value={recurringForm.end_date}
                onChange={(e) => setRecurringForm({ ...recurringForm, end_date: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsRecurringModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={recurringSaving}>
              {recurringSaving ? 'Kaydediliyor...' : 'Sabit Yüke Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        isLoading={confirmDialog.isLoading}
      />
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          İşlem defteri yükleniyor...
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  )
}
