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
import { round2 } from '@/lib/finance-engine'
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
import { financialBridge, getLinkedDebtId, getLinkedInvestmentId } from '@/lib/financial-bridge'
import type { Transaction, Project, CreditCard, Account, Debt, Investment } from '@/types/database'

function TransactionsContent() {
  const { toast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
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
  const [projectFilter, setProjectFilter] = useState<string>('ALL')
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
    projectFilter !== 'ALL' ||
    importFilter !== 'ALL'

  const handleClearFilters = () => {
    setSearchTerm('')
    setSelectedEntityId('ALL')
    setMonthFilter('ALL')
    setGroupFilter('ALL')
    setTypeFilter('ALL')
    setProjectFilter('ALL')
    setImportFilter('ALL')
  }

  // Sync with URL Search Params (F15: handle param removal as reset)
  useEffect(() => {
    const month = searchParams.get('month')
    setMonthFilter(month || 'ALL')
    const group = searchParams.get('group')
    setGroupFilter(group || 'ALL')
    const projectId = searchParams.get('project_id')
    setProjectFilter(projectId || 'ALL')
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
    project_id: '',
  })

  // Link to Debt Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [selectedTxForLink, setSelectedTxForLink] = useState<Transaction | null>(null)
  const [targetDebtId, setTargetDebtId] = useState<string>('')
  const [linking, setLinking] = useState(false)

  // Link to Investment Modal State
  const [isInvLinkModalOpen, setIsInvLinkModalOpen] = useState(false)
  const [selectedTxForInvLink, setSelectedTxForInvLink] = useState<Transaction | null>(null)
  const [targetInvestmentId, setTargetInvestmentId] = useState<string>('')
  const [invLinkWithDca, setInvLinkWithDca] = useState(false)
  const [invLinkUnitPrice, setInvLinkUnitPrice] = useState('')
  const [invLinkAddedQty, setInvLinkAddedQty] = useState('')
  const [invLinking, setInvLinking] = useState(false)

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
    project_id: '',
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
      project_id: tx.project_id || '',
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
        amount: parseFloat(recurringForm.amount || '0'),
        currency: 'TRY',
        period: recurringForm.period,
        end_date: recurringForm.end_date || null,
        decision: 'Devam',
        payment_method: recurringForm.payment_method || null,
        project_id: recurringForm.project_id || null,
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

  // Load metadata (cards, accounts, debts, projects, investments) once on mount
  useEffect(() => {
    async function loadMetadata() {
      try {
        const supabase = createClient()
        const [{ data: prjs }, { data: crds }, { data: accs }, { data: dbts }] = await Promise.all([
          supabase.from('projects').select('*'),
          supabase.from('credit_cards').select('*'),
          supabase.from('accounts').select('*'),
          supabase.from('debts').select('*').order('created_at', { ascending: false }),
        ])

        if (prjs) setProjects(prjs)
        if (crds) setCards(crds)
        if (accs) setAccounts(accs)
        if (dbts) setDebts(dbts)

        const { data: invs, error: invErr } = await supabase.from('investments').select('*')
        if (invs && !invErr) {
          setInvestments(invs)
        } else {
          const cached = localStorage.getItem('pusula_local_investments')
          if (cached) {
            try {
              setInvestments(JSON.parse(cached))
            } catch {
              setInvestments([])
            }
          }
        }
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
        p_project_id: projectFilter !== 'ALL' ? projectFilter : null,
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
      projectFilter,
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
        p_project_id: projectFilter !== 'ALL' ? projectFilter : null,
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
    projectFilter,
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

  const handleOpenLinkModal = (tx: Transaction) => {
    const isIncome = tx.type === 'Gelir' || tx.type === 'Tahsilat'
    const suitableDebts = debts.filter((d) => (isIncome ? d.type === 'Alacak' : d.type === 'Borç') && d.status === 'Açık')
    setSelectedTxForLink(tx)
    setTargetDebtId(suitableDebts[0]?.id || '')
    setIsLinkModalOpen(true)
  }

  const handleConfirmLink = async () => {
    if (!selectedTxForLink || !targetDebtId) return
    setLinking(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const res = await financialBridge.linkTransactionToDebt({
        userId: user.id,
        transactionId: selectedTxForLink.id,
        debtId: targetDebtId,
      })

      if (!res.success) throw new Error(res.error)

      setIsLinkModalOpen(false)
      setSelectedTxForLink(null)
      await loadTransactions()
      toast.success('Hareket başarıyla borç/alacak ile eşlendi.')
    } catch (err: any) {
      toast.error(err.message || 'Eşleme başarısız oldu')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlinkFromDebt = (tx: Transaction) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Borç / Alacak Eşleşmesini Kaldır',
      description: 'Bu hareketin borç/alacak eşlemesini kaldırmak istiyor musunuz? Tutar borç bakiyesine iade edilecektir.',
      confirmLabel: 'Eşleşmeyi Kaldır',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        try {
          const supabase = createClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user) throw new Error('Oturum açılmamış')

          const res = await financialBridge.unlinkTransactionFromDebt({
            userId: user.id,
            transactionId: tx.id,
          })

          if (!res.success) throw new Error(res.error)
          await loadTransactions()
          toast.success('Borç/alacak eşlemesi kaldırıldı.')
        } catch (err: any) {
          toast.error(err.message || 'Bağlantı kaldırılamadı')
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

  const handleOpenInvestmentLinkModal = (tx: Transaction) => {
    setSelectedTxForInvLink(tx)
    const initialInv = investments[0]
    setTargetInvestmentId(initialInv?.id || '')
    setInvLinkWithDca(false)
    if (initialInv) {
      const price = initialInv.current_price > 0 ? initialInv.current_price : initialInv.unit_cost
      setInvLinkUnitPrice(price > 0 ? price.toString() : '')
      const calculatedQty = price > 0 ? round2(tx.amount / price) : 0
      setInvLinkAddedQty(calculatedQty > 0 ? calculatedQty.toString() : '')
    } else {
      setInvLinkUnitPrice('')
      setInvLinkAddedQty('')
    }
    setIsInvLinkModalOpen(true)
  }

  const handleTargetInvChange = (id: string) => {
    setTargetInvestmentId(id)
    const inv = investments.find((i) => i.id === id)
    if (inv && selectedTxForInvLink) {
      const price = inv.current_price > 0 ? inv.current_price : inv.unit_cost
      setInvLinkUnitPrice(price > 0 ? price.toString() : '')
      const calculatedQty = price > 0 ? round2(selectedTxForInvLink.amount / price) : 0
      setInvLinkAddedQty(calculatedQty > 0 ? calculatedQty.toString() : '')
    }
  }

  const handleConfirmInvestmentLink = async () => {
    if (!selectedTxForInvLink || !targetInvestmentId) return
    setInvLinking(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const userId = user?.id || 'local'

      const addedQtyNum = invLinkWithDca ? parseFloat(invLinkAddedQty.replace(',', '.')) : undefined
      const unitPriceNum = invLinkWithDca ? parseFloat(invLinkUnitPrice.replace(',', '.')) : undefined

      const res = await financialBridge.linkTransactionToInvestment({
        userId,
        transactionId: selectedTxForInvLink.id,
        investmentId: targetInvestmentId,
        addedQty: addedQtyNum && addedQtyNum > 0 ? addedQtyNum : undefined,
        unitPrice: unitPriceNum && unitPriceNum > 0 ? unitPriceNum : undefined,
      })

      if (!res.success) throw new Error(res.error)

      // Update local storage cache if fallback is in use
      if (invLinkWithDca && addedQtyNum && addedQtyNum > 0 && unitPriceNum && unitPriceNum > 0) {
        const cached = localStorage.getItem('pusula_local_investments')
        if (cached) {
          try {
            const list: Investment[] = JSON.parse(cached)
            const updated = list.map((inv) => {
              if (inv.id === targetInvestmentId) {
                const currentQty = Number(inv.quantity || 0)
                const currentCost = Number(inv.unit_cost || 0)
                const newQty = currentQty + addedQtyNum
                const totalSpent = currentQty * currentCost + addedQtyNum * unitPriceNum
                const newUnitCost = newQty > 0 ? Math.round((totalSpent / newQty) * 100) / 100 : 0
                return {
                  ...inv,
                  quantity: newQty,
                  unit_cost: newUnitCost,
                  current_price: unitPriceNum,
                  last_price_updated_at: new Date().toISOString(),
                }
              }
              return inv
            })
            localStorage.setItem('pusula_local_investments', JSON.stringify(updated))
            setInvestments(updated)
          } catch {}
        }
      }

      setIsInvLinkModalOpen(false)
      setSelectedTxForInvLink(null)
      await loadTransactions()
      toast.success('Hareket başarıyla yatırıma aktarıldı.')
    } catch (err: any) {
      toast.error(err.message || 'Yatırıma bağlama başarısız oldu')
    } finally {
      setInvLinking(false)
    }
  }

  const handleUnlinkFromInvestment = (tx: Transaction) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Yatırım Bağlantısını Kaldır',
      description: 'Bu hareketin yatırım bağlantısını kaldırmak ve tekrar standart harcama grubuna almak istiyor musunuz?',
      confirmLabel: 'Bağlantıyı Kaldır',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isLoading: true }))
        try {
          const supabase = createClient()
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const userId = user?.id || 'local'

          const res = await financialBridge.unlinkTransactionFromInvestment({
            userId,
            transactionId: tx.id,
          })

          if (!res.success) throw new Error(res.error)
          await loadTransactions()
          toast.success('Yatırım bağlantısı kaldırıldı.')
        } catch (err: any) {
          toast.error(err.message || 'Bağlantı kaldırılamadı')
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
        }
      },
    })
  }

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
      
      const account = accounts.find((a) => a.name === newTx.account_or_card)
      const card = cards.find((c) => `${c.bank} • ${c.last_four || 'Kart'}` === newTx.account_or_card)
      
      const accountId = account?.id || null
      const cardId = card?.id || null

      let res: { success: boolean; error?: string } = { success: true }

      if (newTx.type === 'Harcama') {
        res = await financialBridge.recordExpense({
          userId: user.id,
          amount: amountNum,
          accountId: accountId || undefined,
          cardId: cardId || undefined,
          date: newTx.date,
          merchant: newTx.merchant || newTx.description || '',
          description: newTx.description || newTx.merchant,
          analysisGroup: newTx.analysis_group as any,
          projectId: newTx.project_id || undefined,
        })
      } else if (newTx.type === 'Gelir') {
        if (!accountId) {
          throw new Error('Gelir için bir banka hesabı seçilmelidir.')
        }
        res = await financialBridge.recordIncome({
          userId: user.id,
          amount: amountNum,
          accountId: accountId,
          date: newTx.date,
          merchant: newTx.merchant || newTx.description || '',
          description: newTx.description || newTx.merchant,
          projectId: newTx.project_id || undefined,
        })
      } else if (newTx.type === 'Kart Ödemesi') {
        if (!accountId || !targetCardId) throw new Error('Kaynak hesap ve ödenecek kart seçilmelidir.')
        res = await financialBridge.recordCardPayment({
          userId: user.id,
          amount: amountNum,
          sourceAccountId: accountId,
          cardId: targetCardId,
          date: newTx.date,
          description: newTx.description || newTx.merchant,
        })
      } else if (newTx.type === 'Transfer') {
        if (!accountId || !targetAccountId) throw new Error('Kaynak ve hedef hesap seçilmelidir.')
        res = await financialBridge.recordTransfer({
          userId: user.id,
          amount: amountNum,
          sourceAccountId: accountId,
          targetAccountId,
          date: newTx.date,
          description: newTx.description || newTx.merchant,
        })
      } else {
        throw new Error('Geçersiz işlem türü.')
      }

      if (!res.success) {
        throw new Error(res.error || 'İşlem kaydedilemedi')
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
        project_id: '',
      })
      loadTransactions()
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
        const res = await financialBridge.deleteTransaction(id)
        if (res.success) {
          setTransactions((prev) => prev.filter((t) => t.id !== id))
          toast.success('Hareket silindi.')
        } else {
          toast.error(res.error || 'Silinemedi')
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false, isLoading: false }))
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

          {/* Project Filter */}
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="text-xs"
            aria-label="Proje Filtresi"
          >
            <option value="ALL">Tüm Projeler</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
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

                  {/* Inline quick links */}
                  {(tx.type === 'Harcama' || tx.type === 'Transfer') && (
                    <div className="flex items-center gap-3 pt-0.5 text-[11px]">
                      {tx.account_id && tx.type === 'Harcama' && (
                        <button
                          type="button"
                          onClick={() => handleOpenLinkModal(tx)}
                          className="text-amber-400 hover:underline font-medium min-h-[32px] inline-flex items-center"
                        >
                          Borca Bağla
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenInvestmentLinkModal(tx)}
                        className="text-primary hover:underline font-medium min-h-[32px] inline-flex items-center"
                      >
                        Yatırıma Aktar
                      </button>
                    </div>
                  )}
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
                <th scope="col" className="p-3">Proje</th>
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
                  <td colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
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

                      {/* Debt & Investment Link Status & Quick Actions */}
                      {(() => {
                        const debtId = getLinkedDebtId(tx)
                        const linkedDebt = debts.find((d) => d.id === debtId)
                        if (linkedDebt) {
                          return (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                ✓ {linkedDebt.type === 'Alacak' ? 'Tahsilat' : 'Ödeme'}: {linkedDebt.person_or_entity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlinkFromDebt(tx)}
                                className="text-[11px] text-muted-foreground hover:text-destructive underline transition-colors cursor-pointer"
                                title="Eşleştirmeyi kaldır ve tutarı borç/alacak bakiyesine iade et"
                              >
                                Çöz
                              </button>
                            </div>
                          )
                        }

                        const investmentId = getLinkedInvestmentId(tx)
                        const linkedInv = investments.find((i) => i.id === investmentId)
                        if (linkedInv || investmentId) {
                          return (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary border border-primary/25 font-mono">
                                📈 Portföy: {linkedInv ? linkedInv.name : 'Yatırım'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlinkFromInvestment(tx)}
                                className="text-[11px] text-muted-foreground hover:text-destructive underline transition-colors cursor-pointer"
                                title="Yatırım bağlantısını kaldır ve hareketi normal harcamaya geri al"
                              >
                                Çöz
                              </button>
                            </div>
                          )
                        }

                        if (tx.type === 'Gelir') {
                          return (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(tx)}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold hover:underline transition-colors"
                                title="Bu gelen parayı alacak hakedişine bağla"
                              >
                                Alacağa Bağla →
                              </button>
                            </div>
                          )
                        }

                        if (tx.type === 'Harcama' || tx.type === 'Transfer') {
                          return (
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {tx.account_id && tx.type === 'Harcama' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinkModal(tx)}
                                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold hover:underline transition-colors"
                                  title="Bu harcamayı şahsi borca bağla"
                                >
                                  Borca Bağla →
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenInvestmentLinkModal(tx)}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold hover:underline transition-colors"
                                title="Bu transferi/harcamayı portföydeki bir yatırıma bağla ve tüketim harcamasından muaf tut"
                              >
                                Yatırıma Aktar →
                              </button>
                              {tx.type === 'Harcama' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRecurringModal(tx)}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium hover:underline transition-colors"
                                  title="Bu harcamayı aylık düzenli gider / abonelik / fatura yap"
                                >
                                  Abonelik Yap →
                                </button>
                              )}
                            </div>
                          )
                        }

                        return null
                      })()}
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
                    <td className="p-3 font-sans text-muted-foreground">
                      {projects.find((p) => p.id === tx.project_id)?.name || '—'}
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
        size="lg"
      >
        <form onSubmit={handleAddTransaction} className="space-y-4">
          <div className="space-y-1.5">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="add-tx-date" className="text-xs font-semibold text-foreground">Tarih</label>
              <Input
                id="add-tx-date"
                type="date"
                value={newTx.date}
                onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <label htmlFor="add-tx-target-card" className="text-xs font-semibold text-foreground">Ödenecek Kart</label>
              <Select id="add-tx-target-card" value={targetCardId} onChange={(e) => setTargetCardId(e.target.value)} required aria-label="Ödenecek Kart">
                <option value="">Kart seçin</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>{card.bank} - {card.card_name}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="add-tx-merchant" className="text-xs font-semibold text-foreground">İşyeri / Başlık</label>
              <Input
                id="add-tx-merchant"
                value={newTx.merchant}
                onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value })}
                placeholder="Örn: Cursor, Market..."
                required
              />
            </div>
            <div className="space-y-1.5">
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
          </div>

          <div className="space-y-1.5">
            <label htmlFor="add-tx-project" className="text-xs font-semibold text-foreground">Bağlı Proje (Opsiyonel)</label>
            <Select
              id="add-tx-project"
              value={newTx.project_id}
              onChange={(e) => setNewTx({ ...newTx, project_id: e.target.value })}
            >
              <option value="">(Proje Yok)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link Transaction to Debt Modal */}
      <Modal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title={
          selectedTxForLink?.type === 'Gelir' || selectedTxForLink?.type === 'Tahsilat'
            ? '🎯 Hareketi Alacağa Tahsilat Olarak Eşle'
            : '🎯 Hareketi Borca Ödeme Olarak Eşle'
        }
        description="Seçilen banka hareketi doğrudan ilgili borç/alacaktan düşülecek ve kalan bakiye otomatik güncellenecektir."
        size="lg"
      >
        {selectedTxForLink && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tarih:</span>
                <span className="text-foreground font-semibold">{formatDate(selectedTxForLink.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hesap / Kart:</span>
                <span className="text-foreground">{selectedTxForLink.account_or_card || 'Banka Hesabı'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Açıklama / İşyeri:</span>
                <span className="text-foreground truncate max-w-[240px]">
                  {selectedTxForLink.merchant || selectedTxForLink.description}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border/60">
                <span className="font-semibold text-muted-foreground">İşlem Tutarı:</span>
                <span className="font-bold text-success text-base font-mono">
                  +{formatCurrency(selectedTxForLink.amount)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="link-debt-target" className="text-xs font-semibold text-foreground">
                {selectedTxForLink.type === 'Gelir' || selectedTxForLink.type === 'Tahsilat'
                  ? 'Eşleştirilecek Açık Alacak'
                  : 'Eşleştirilecek Açık Borç'}
              </label>
              <Select
                id="link-debt-target"
                value={targetDebtId}
                onChange={(e) => setTargetDebtId(e.target.value)}
                className="text-xs"
              >
                {debts
                  .filter(
                    (d) =>
                      (selectedTxForLink.type === 'Gelir' || selectedTxForLink.type === 'Tahsilat'
                        ? d.type === 'Alacak'
                        : d.type === 'Borç') && d.status === 'Açık'
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.person_or_entity} ({d.category}) — Kalan: {formatCurrency(d.remaining)}
                    </option>
                  ))}
              </Select>
            </div>

            {targetDebtId &&
              (() => {
                const target = debts.find((d) => d.id === targetDebtId)
                if (!target) return null
                const postRemaining = Math.max(
                  0,
                  Number(target.remaining) - Number(selectedTxForLink.amount)
                )
                return (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs space-y-1">
                    <div className="text-muted-foreground font-sans">İşlem Sonrası Alacak Bakiyesi:</div>
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="line-through text-muted-foreground">
                        {formatCurrency(target.remaining)}
                      </span>
                      <span>➔</span>
                      <strong className="text-emerald-400 font-bold">
                        {formatCurrency(postRemaining)}
                      </strong>
                      {postRemaining === 0 && (
                        <Badge variant="success" className="text-[11px]">
                          Tamamen Kapanacak
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })()}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLinkModalOpen(false)}
              >
                İptal
              </Button>
              <Button
                type="button"
                disabled={linking || !targetDebtId}
                onClick={handleConfirmLink}
              >
                {linking ? 'Eşleniyor...' : 'Eşle ve Bakiyeden Düş'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Convert to Recurring Modal */}
      <Modal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        title="Düzenli Gider / Abonelik / Fatura Olarak Ekle"
        size="lg"
      >
        <form onSubmit={handleSaveRecurring} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="rec-service" className="text-xs font-semibold text-muted-foreground">
              Hizmet / Kurum / Fatura Adı
            </label>
            <Input
              id="rec-service"
              required
              value={recurringForm.service}
              onChange={(e) => setRecurringForm({ ...recurringForm, service: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="rec-category" className="text-xs font-semibold text-muted-foreground">Kategori Türü</label>
              <Select
                id="rec-category"
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value as any })}
              >
                <option value="Abonelik">💳 SaaS / Abonelik</option>
                <option value="Fatura">⚡ Fatura (GSM, Elektrik, vb.)</option>
                <option value="Taksit">📆 Dış Hesap Taksiti / Kredi</option>
                <option value="Düzenli Gider">🏠 Düzenli Gider (Kira, Aidat)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rec-group" className="text-xs font-semibold text-muted-foreground">Kapsam Grubu</label>
              <Select
                id="rec-group"
                value={recurringForm.group_type}
                onChange={(e) => setRecurringForm({ ...recurringForm, group_type: e.target.value as any })}
              >
                <option value="Kişisel">Kişisel</option>
                <option value="İş">İş (Girişim / Şirket)</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="rec-amount" className="text-xs font-semibold text-muted-foreground">Aylık Tutar</label>
              <Input
                id="rec-amount"
                type="number"
                step="0.01"
                prefix="₺"
                required
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rec-period" className="text-xs font-semibold text-muted-foreground">Ödeme Periyodu</label>
              <Select
                id="rec-period"
                value={recurringForm.period}
                onChange={(e) => setRecurringForm({ ...recurringForm, period: e.target.value })}
              >
                <option value="Aylık">Aylık</option>
                <option value="Yıllık">Yıllık</option>
                <option value="Haftalık">Haftalık</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="rec-payment-method" className="text-xs font-semibold text-muted-foreground">
                Ödeme Yolu / Kart / Kasa
              </label>
              <Input
                id="rec-payment-method"
                value={recurringForm.payment_method}
                onChange={(e) => setRecurringForm({ ...recurringForm, payment_method: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rec-end-date" className="text-xs font-semibold text-muted-foreground">
                Bitiş Tarihi (Taksitler için Opsiyonel)
              </label>
              <Input
                id="rec-end-date"
                type="date"
                value={recurringForm.end_date}
                onChange={(e) => setRecurringForm({ ...recurringForm, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsRecurringModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={recurringSaving}>
              {recurringSaving ? 'Kaydediliyor...' : 'Sabit Yüke Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link Transaction to Investment Modal (Financial Bridge) */}
      <Modal
        isOpen={isInvLinkModalOpen}
        onClose={() => setIsInvLinkModalOpen(false)}
        title="📈 Hareketi Yatırıma Aktar & Portföye Eşle"
        description="Bu işlem hareketi tüketim harcamaları havuzundan çıkarıp 'Hariç' grubuna alır; bütçenizi bozmadan portföy sermaye aktarımı olarak bağlar."
        size="lg"
      >
        {selectedTxForInvLink && (
          <div className="space-y-4">
            {/* Tx Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Tarih:</span>
                <span className="text-foreground font-semibold">{formatDate(selectedTxForInvLink.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Hesap:</span>
                <span className="text-foreground">{selectedTxForInvLink.account_or_card || 'Banka Hesabı'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Açıklama / İşyeri:</span>
                <span className="text-foreground truncate max-w-[240px]">
                  {selectedTxForInvLink.merchant || selectedTxForInvLink.description}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border/60">
                <span className="font-semibold text-muted-foreground font-sans">Aktarılan Tutar:</span>
                <span className="font-bold text-primary text-base font-mono">
                  {formatCurrency(selectedTxForInvLink.amount)}
                </span>
              </div>
            </div>

            {/* Target Investment */}
            <div className="space-y-1.5">
              <label htmlFor="link-inv-target" className="text-xs font-semibold text-foreground">Hedef Yatırım / Varlık</label>
              {investments.length === 0 ? (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-md">
                  Portföyünüzde henüz tanımlı bir yatırım bulunmuyor. Lütfen önce <strong>Yatırımlar & Portföy</strong> sayfasından varlık ekleyin.
                </p>
              ) : (
                <Select
                  id="link-inv-target"
                  value={targetInvestmentId}
                  onChange={(e) => handleTargetInvChange(e.target.value)}
                  className="text-xs"
                >
                  {investments.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.symbol || inv.category}) • Mevcut: {inv.quantity} adet @ {formatCurrency(inv.unit_cost)}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* DCA Option Checkbox */}
            {investments.length > 0 && (
              <div className="space-y-3 pt-1 border-t border-border/50">
                <label htmlFor="inv-link-dca" className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                  <input
                    id="inv-link-dca"
                    type="checkbox"
                    checked={invLinkWithDca}
                    onChange={(e) => setInvLinkWithDca(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Varlığın adet ve maliyetini bu tutarla güncelle (Kademeli Alım)</span>
                </label>

                {invLinkWithDca && (() => {
                  const targetInv = investments.find((i) => i.id === targetInvestmentId)
                  const unitPrice = parseFloat(invLinkUnitPrice.replace(',', '.')) || 0
                  const addedQty = parseFloat(invLinkAddedQty.replace(',', '.')) || 0
                  const dcaPreview =
                    targetInv && unitPrice > 0 && addedQty > 0
                      ? {
                          newQty: round2(targetInv.quantity + addedQty),
                          newCost: round2(
                            (targetInv.quantity * targetInv.unit_cost + addedQty * unitPrice) /
                              (targetInv.quantity + addedQty)
                          ),
                        }
                      : null

                  return (
                    <div className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/70 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="link-inv-unit-price" className="text-[11px] font-semibold text-muted-foreground">
                            Birim Alış Fiyatı
                          </label>
                          <Input
                            id="link-inv-unit-price"
                            type="number"
                            step="any"
                            prefix="₺"
                            value={invLinkUnitPrice}
                            onChange={(e) => {
                              const p = e.target.value
                              setInvLinkUnitPrice(p)
                              const pNum = parseFloat(p.replace(',', '.'))
                              if (pNum > 0 && selectedTxForInvLink) {
                                setInvLinkAddedQty(round2(selectedTxForInvLink.amount / pNum).toString())
                              }
                            }}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="link-inv-added-qty" className="text-[11px] font-semibold text-muted-foreground">
                            Alınan Adet / Miktar
                          </label>
                          <Input
                            id="link-inv-added-qty"
                            type="number"
                            step="any"
                            value={invLinkAddedQty}
                            onChange={(e) => setInvLinkAddedQty(e.target.value)}
                            placeholder="Adet miktarı"
                          />
                        </div>
                      </div>

                      {dcaPreview && (
                        <div className="rounded bg-primary/10 border border-primary/25 p-2 text-[11px] flex justify-between items-center font-mono">
                          <span className="text-muted-foreground font-sans">Yeni Durum:</span>
                          <span className="text-primary font-bold">
                            {dcaPreview.newQty.toLocaleString('tr-TR')} Adet @ {formatCurrency(dcaPreview.newCost)} Ortalama
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsInvLinkModalOpen(false)}>
                İptal
              </Button>
              <Button
                type="button"
                disabled={invLinking || !targetInvestmentId || investments.length === 0}
                onClick={handleConfirmInvestmentLink}
                className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {invLinking ? 'Aktarılıyor...' : 'Yatırıma Aktar & Bütçeden Muaf Tut'}
              </Button>
            </div>
          </div>
        )}
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
