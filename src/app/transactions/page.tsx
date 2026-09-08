'use client'

import { useEffect, useState } from 'react'
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
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { financialBridge, getLinkedDebtId } from '@/lib/financial-bridge'
import type { Transaction, Project, CreditCard, Account, Debt } from '@/types/database'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)

  // Segment Tab: 'all' | 'cards' | 'accounts'
  const [segmentTab, setSegmentTab] = useState<'all' | 'cards' | 'accounts'>('all')

  // Specific entity filter
  const [selectedEntityId, setSelectedEntityId] = useState<string>('ALL')

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [projectFilter, setProjectFilter] = useState<string>('ALL')
  const [monthFilter, setMonthFilter] = useState<string>('ALL')

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
    } catch (err: any) {
      alert(err.message || 'Eşleme başarısız oldu')
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
    } catch (err: any) {
      alert(err.message || 'Bağlantı kaldırılamadı')
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
    } catch (err: any) {
      alert(err.message || 'Hareket eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu hareketi silmek istediğinize emin misiniz?')) return
    const res = await financialBridge.deleteTransaction(id)
    if (res.success) {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
    } else {
      alert(res.error || 'Silinemedi')
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

    return true
  })

  // Quick stats for filtered list
  const totalVolume = filteredTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0)
  const totalSpent = filteredTransactions
    .filter((t) => t.analysis_group !== 'Hariç' && t.type !== 'Gelir' && t.type !== 'Tahsilat')
    .reduce((sum, t) => sum + (t.type === 'İade' ? -Number(t.amount || 0) : Number(t.amount || 0)), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Genel İşlem Defteri
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kredi kartı harcamaları ve banka nakit hareketlerinin konsolide dökümü ({transactions.length} hareket).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-4 w-4" />
            Manuel Hareket Ekle
          </Button>
        </div>
      </div>

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
                          {tx.description.replace(/\s*\[DEBT:[a-f0-9-]+\]/gi, '').trim()}
                        </div>
                      )}

                      {/* Debt Link Status & Quick Actions */}
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
                                className="text-[10px] text-muted-foreground hover:text-destructive underline transition-colors"
                                title="Eşleştirmeyi kaldır ve tutarı alacak bakiyesine iade et"
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

                        if (tx.type === 'Harcama' && tx.account_id) {
                          return (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(tx)}
                                className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-semibold hover:underline transition-colors"
                                title="Bu harcamayı şahsi borca bağla"
                              >
                                🎯 Borca Bağla
                              </button>
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
              <label className="text-xs font-semibold text-foreground">Tutar (₺)</label>
              <Input
                type="number"
                step="0.01"
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
    </div>
  )
}
