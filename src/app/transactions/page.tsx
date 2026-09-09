'use client'

import { useEffect, useState, Suspense } from 'react'
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
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { round2 } from '@/lib/finance-engine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
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

  // Segment Tab: 'all' | 'cards' | 'accounts'
  const [segmentTab, setSegmentTab] = useState<'all' | 'cards' | 'accounts'>('all')

  // Specific entity filter
  const [selectedEntityId, setSelectedEntityId] = useState<string>('ALL')

  // Filters
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [projectFilter, setProjectFilter] = useState<string>('ALL')
  const [monthFilter, setMonthFilter] = useState<string>('ALL')
  const [importFilter, setImportFilter] = useState<string>('ALL')

  // Sync with URL Search Params
  useEffect(() => {
    const month = searchParams.get('month')
    if (month) setMonthFilter(month)
    const group = searchParams.get('group')
    if (group) setGroupFilter(group)
    const projectId = searchParams.get('project_id')
    if (projectId) setProjectFilter(projectId)
    const search = searchParams.get('search')
    if (search) setSearchTerm(search)
    const importId = searchParams.get('import_id')
    if (importId) setImportFilter(importId)
    const isNew = searchParams.get('new')
    if (isNew === 'true') setIsAddModalOpen(true)
  }, [searchParams])

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split('T')[0],
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

  useEffect(() => {
    loadTransactions()
  }, [])

  async function loadTransactions() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: txs }, { data: prjs }, { data: crds }, { data: accs }, { data: dbts }] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('projects').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
      ])

      if (txs) setTransactions(txs)
      if (prjs) setProjects(prjs)
      if (crds) setCards(crds)
      if (accs) setAccounts(accs)
      if (dbts) setDebts(dbts)

      // Load investments for financial bridge
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
      console.error('Error loading transactions:', err)
    } finally {
      setLoading(false)
    }
  }

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

  const handleUnlinkFromDebt = async (tx: Transaction) => {
    if (!confirm('Bu hareketin borç/alacak eşlemesini kaldırmak istiyor musunuz? Tutar borç bakiyesine iade edilecektir.')) {
      return
    }
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
    }
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

  const handleUnlinkFromInvestment = async (tx: Transaction) => {
    if (!confirm('Bu hareketin yatırım bağlantısını kaldırmak ve tekrar standart harcama grubuna almak istiyor musunuz?')) {
      return
    }
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
    }
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
      } else if (newTx.type === 'Kart Ödemesi' && accountId && cardId) {
        res = await financialBridge.recordCardPayment({
          userId: user.id,
          amount: amountNum,
          sourceAccountId: accountId,
          cardId: cardId,
          date: newTx.date,
          description: newTx.description || newTx.merchant,
        })
      } else {
        // Fallback for Transfer or other types
        const { error } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            date: newTx.date,
            account_or_card: newTx.account_or_card,
            type: newTx.type as any,
            description: newTx.description || newTx.merchant,
            merchant: newTx.merchant || newTx.description,
            amount: amountNum,
            analysis_group: newTx.analysis_group as any,
            project_id: newTx.project_id || null,
            account_id: accountId,
            card_id: cardId,
          })
        if (error) res = { success: false, error: error.message }
      }

      if (!res.success) {
        throw new Error(res.error || 'İşlem kaydedilemedi')
      }

      setIsAddModalOpen(false)
      setNewTx({
        date: new Date().toISOString().split('T')[0],
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

  const handleDelete = async (id: string) => {
    if (!confirm('Bu hareketi silmek istediğinize emin misiniz?')) return
    const res = await financialBridge.deleteTransaction(id)
    if (res.success) {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
      toast.success('Hareket silindi.')
    } else {
      toast.error(res.error || 'Silinemedi')
    }
  }

  // Filter pipeline
  const filteredTransactions = transactions.filter((t) => {
    // 1. Segment Tab Filter
    if (segmentTab === 'cards') {
      // Must be credit card spending or linked to a card
      if (!t.card_id && t.type === 'Gelir') return false
      if (t.account_id && t.type !== 'Harcama') return false
    } else if (segmentTab === 'accounts') {
      // Must be bank account cashflow
      if (t.card_id && !t.account_id && t.type === 'Harcama') return false
    }

    // 2. Specific Entity Selector Filter
    if (selectedEntityId !== 'ALL') {
      const matchCard = t.card_id === selectedEntityId || t.account_or_card?.includes(selectedEntityId)
      const matchAccount = t.account_id === selectedEntityId || t.account_or_card?.includes(selectedEntityId)
      if (!matchCard && !matchAccount) return false
    }

    // 3. Month Filter
    if (monthFilter !== 'ALL') {
      if (!t.date.startsWith(monthFilter)) return false
    }

    // 4. Search Filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      const matchDesc = t.description?.toLowerCase().includes(q)
      const matchMerchant = t.merchant?.toLowerCase().includes(q)
      const matchAcc = t.account_or_card?.toLowerCase().includes(q)
      if (!matchDesc && !matchMerchant && !matchAcc) return false
    }

    // 5. Group Filter
    if (groupFilter !== 'ALL' && t.analysis_group !== groupFilter) return false

    // 6. Type Filter
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false

    // 7. Project Filter
    if (projectFilter !== 'ALL' && t.project_id !== projectFilter) return false

    // 8. Import Batch Filter
    if (importFilter !== 'ALL' && t.import_id !== importFilter) return false

    return true
  })

  // Quick stats for filtered list
  const totalVolume = filteredTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  const totalSpent = filteredTransactions
    .filter((t) => t.analysis_group !== 'Hariç' && t.type !== 'Gelir' && t.type !== 'Tahsilat')
    .reduce((sum, t) => sum + (t.type === 'İade' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0)

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
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : undefined
        }
        actions={
          <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 shadow-sm h-9 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            Manuel Hareket Ekle
          </Button>
        }
      />

      {/* Segment Selector Tabs */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => {
            setSegmentTab('all')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            segmentTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>📊 Konsolide Tüm Hareketler</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSegmentTab('cards')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            segmentTab === 'cards'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CardIcon className="h-3.5 w-3.5" />
          <span>💳 Kredi Kartı Harcamaları</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSegmentTab('accounts')
            setSelectedEntityId('ALL')
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            segmentTab === 'accounts'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>🏦 Banka / Nakit Akışı</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="İşyeri veya açıklama ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          {/* Specific Card / Account Selector */}
          <Select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="text-xs font-semibold"
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

          {/* Month Selector */}
          <Select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-xs"
          >
            <option value="ALL">Tüm Dönemler</option>
            <option value="2026-08">Ağustos 2026 (Bu Ay)</option>
            <option value="2026-04">Nisan 2026</option>
            <option value="2026-03">Mart 2026</option>
          </Select>

          {/* Group Filter */}
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="text-xs"
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
          >
            <option value="ALL">Tüm Projeler</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Transactions Table Card */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border py-3 px-4 flex flex-row items-center justify-between bg-muted/20">
          <div className="text-xs font-semibold text-muted-foreground">
            Listelenen: <strong>{filteredTransactions.length}</strong> hareket
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span>
              Tüketim Toplamı: <strong className="text-foreground">{formatCurrency(totalSpent)}</strong>
            </span>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">Tarih</th>
                <th className="p-3">Hesap / Kart</th>
                <th className="p-3">Tür</th>
                <th className="p-3">İşyeri / Açıklama</th>
                <th className="p-3">Grup</th>
                <th className="p-3">Proje</th>
                <th className="p-3 text-right">Tutar</th>
                <th className="p-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground font-sans">
                    Filtrelere uygun hareket bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
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
                            ? 'purple'
                            : 'default'
                        }
                        className="text-[10px]"
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="p-3 font-sans max-w-xs" title={tx.description || tx.merchant || ''}>
                      <span className="font-medium text-foreground">{tx.merchant}</span>
                      {tx.recurrence && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] font-mono">
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
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                ✓ {linkedDebt.type === 'Alacak' ? 'Tahsilat' : 'Ödeme'}: {linkedDebt.person_or_entity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlinkFromDebt(tx)}
                                className="text-[10px] text-muted-foreground hover:text-destructive underline transition-colors cursor-pointer"
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
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                                📈 Portföy: {linkedInv ? linkedInv.name : 'Yatırım'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlinkFromInvestment(tx)}
                                className="text-[10px] text-muted-foreground hover:text-destructive underline transition-colors cursor-pointer"
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
                                className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold hover:underline transition-colors"
                                title="Bu gelen parayı alacak hakedişine bağla"
                              >
                                🎯 Alacağa Bağla
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
                                  className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-semibold hover:underline transition-colors"
                                  title="Bu harcamayı şahsi borca bağla"
                                >
                                  🎯 Borca Bağla
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenInvestmentLinkModal(tx)}
                                className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold hover:underline transition-colors"
                                title="Bu transferi/harcamayı portföydeki bir yatırıma bağla ve tüketim harcamasından muaf tut"
                              >
                                📈 Yatırıma Aktar
                              </button>
                              {tx.type === 'Harcama' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRecurringModal(tx)}
                                  className="inline-flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary font-medium hover:underline transition-colors"
                                  title="Bu harcamayı aylık düzenli gider / abonelik / fatura yap"
                                >
                                  ⚡ Düzenli Gider Yap
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
                            ? 'purple'
                            : tx.analysis_group === 'Finansman'
                            ? 'destructive'
                            : (tx.analysis_group as string) === 'Gelir'
                            ? 'success'
                            : 'outline'
                        }
                        className="text-[10px]"
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
                            ? 'text-purple-400'
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
                        size="sm"
                        onClick={() => handleDelete(tx.id)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Transaction Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Manuel Hareket Ekle"
        size="lg"
      >
        <form onSubmit={handleAddTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tarih</label>
              <Input
                type="date"
                value={newTx.date}
                onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Hesap / Kart</label>
              <Select
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">İşyeri / Başlık</label>
              <Input
                value={newTx.merchant}
                onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value })}
                placeholder="Örn: Cursor, Market..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tutar</label>
              <Input
                type="number"
                step="0.01"
                prefix="₺"
                value={newTx.amount}
                onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tür</label>
              <Select
                value={newTx.type}
                onChange={(e) => setNewTx({ ...newTx, type: e.target.value })}
              >
                <option value="Harcama">Harcama</option>
                <option value="Gelir">Gelir</option>
                <option value="Kart Ödemesi">Kart Ödemesi</option>
                <option value="Transfer">Transfer</option>
                <option value="Finansman/Masraf">Finansman / Masraf</option>
                <option value="İade">İade</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Analiz Grubu</label>
              <Select
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
            <label className="text-xs font-semibold text-foreground">Bağlı Proje (Opsiyonel)</label>
            <Select
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
              <label className="text-xs font-semibold text-foreground">
                {selectedTxForLink.type === 'Gelir' || selectedTxForLink.type === 'Tahsilat'
                  ? 'Eşleştirilecek Açık Alacak'
                  : 'Eşleştirilecek Açık Borç'}
              </label>
              <Select
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
                        <Badge variant="success" className="text-[9px]">
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
            <label className="text-xs font-semibold text-muted-foreground">
              Hizmet / Kurum / Fatura Adı
            </label>
            <Input
              required
              value={recurringForm.service}
              onChange={(e) => setRecurringForm({ ...recurringForm, service: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Kategori Türü</label>
              <Select
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
              <label className="text-xs font-semibold text-muted-foreground">Kapsam Grubu</label>
              <Select
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
              <label className="text-xs font-semibold text-muted-foreground">Aylık Tutar</label>
              <Input
                type="number"
                step="0.01"
                prefix="₺"
                required
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Ödeme Periyodu</label>
              <Select
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
              <label className="text-xs font-semibold text-muted-foreground">
                Ödeme Yolu / Kart / Kasa
              </label>
              <Input
                value={recurringForm.payment_method}
                onChange={(e) => setRecurringForm({ ...recurringForm, payment_method: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Bitiş Tarihi (Taksitler için Opsiyonel)
              </label>
              <Input
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
                <span className="font-bold text-cyan-400 text-base font-mono">
                  {formatCurrency(selectedTxForInvLink.amount)}
                </span>
              </div>
            </div>

            {/* Target Investment */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Hedef Yatırım / Varlık</label>
              {investments.length === 0 ? (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-md">
                  Portföyünüzde henüz tanımlı bir yatırım bulunmuyor. Lütfen önce <strong>Yatırımlar & Portföy</strong> sayfasından varlık ekleyin.
                </p>
              ) : (
                <Select
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
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                  <input
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
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Birim Alış Fiyatı
                          </label>
                          <Input
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
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Alınan Adet / Miktar
                          </label>
                          <Input
                            type="number"
                            step="any"
                            value={invLinkAddedQty}
                            onChange={(e) => setInvLinkAddedQty(e.target.value)}
                            placeholder="Adet miktarı"
                          />
                        </div>
                      </div>

                      {dcaPreview && (
                        <div className="rounded bg-cyan-500/10 border border-cyan-500/20 p-2 text-[11px] flex justify-between items-center font-mono">
                          <span className="text-muted-foreground font-sans">Yeni Durum:</span>
                          <span className="text-cyan-400 font-bold">
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
                className="font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                {invLinking ? 'Aktarılıyor...' : 'Yatırıma Aktar & Bütçeden Muaf Tut'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
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
