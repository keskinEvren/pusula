'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { financialBridge } from '@/lib/financial-bridge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
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

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

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
    person_or_entity: 'Hızır Global AŞ',
    description: '',
    principal: '',
    past_payments: '0',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: dData }, { data: aData }, { data: tData }] = await Promise.all([
        supabase.from('debts').select('*').order('created_at', { ascending: true }),
        supabase.from('accounts').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
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
            date: new Date().toISOString().split('T')[0],
            merchant: 'Tahsilat: ' + selectedDebt.person_or_entity,
            description: (selectedDebt.description || selectedDebt.person_or_entity) + ' Tahsilatı',
          })
        } else {
          await financialBridge.recordExpense({
            userId: user.id,
            amount: amt,
            accountId: targetAccountId,
            date: new Date().toISOString().split('T')[0],
            merchant: 'Ödeme: ' + selectedDebt.person_or_entity,
            description: (selectedDebt.description || selectedDebt.person_or_entity) + ' Borç Ödemesi',
            analysisGroup: 'Hariç',
          })
        }
      }

      setIsDeductModalOpen(false)
      setSelectedDebt(null)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Ödeme işlenemedi')
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
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Banka hareketi eşlenemedi')
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
      person_or_entity: 'Hızır Global AŞ',
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
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Satır eklenemedi')
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
    setSubmitting(true)
    try {
      const supabase = createClient()
      const principalNum = parseFloat(rowForm.principal || '0')
      const pastNum = parseFloat(rowForm.past_payments || '0')

      // Preserve any new payments previously deducted
      const existing = debts.find((d) => d.id === rowForm.id)
      const existingNewPayments = existing
        ? Math.max(0, Number(existing.principal) - Number(existing.past_payments) - Number(existing.remaining))
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
        .eq('id', rowForm.id)

      if (error) throw error
      setIsEditModalOpen(false)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Güncellenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete Row
  const handleDelete = async (id: string) => {
    if (!confirm('Bu satırı silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('debts').delete().eq('id', id)
      if (error) throw error
      setDebts(debts.filter((d) => d.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  // Calculations for summary
  const totalReceivables = debts
    .filter((d) => d.type === 'Alacak')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const totalDebts = debts
    .filter((d) => d.type === 'Borç')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const netBalance = totalReceivables - totalDebts

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>📋 Borç & Alacak Takip Tablosu</span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Maaş hakedişleri ve şahsi borçların dönem dönem takibi. Ödeme aldıkça satırdan doğrudan düşün.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleOpenAdd} className="gap-2 shadow-sm text-xs h-9">
            <Plus className="h-4 w-4" />
            Yeni Satır Ekle
          </Button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Kesin Alacaklarım (Kalan)
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {formatCurrency(totalReceivables)}
            </div>
          </div>
          <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-400">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
              Toplam Borcum (Kalan)
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">
              {formatCurrency(totalDebts)}
            </div>
          </div>
          <div className="rounded-full bg-rose-500/20 p-2 text-rose-400">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Net Alacak Fazlası
            </div>
            <div className="text-xl font-bold font-mono text-foreground mt-0.5">
              {formatCurrency(netBalance)}
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {debts.length} Satır
          </Badge>
        </div>
      </div>

      {/* Exact Excel Spreadsheet Table */}
      <Card className="border border-border shadow-md overflow-hidden rounded-xl bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            {/* Dark Teal Header matching Excel screenshot */}
            <thead>
              <tr className="bg-[#1d707c] text-white font-semibold uppercase text-[11px] tracking-wide border-b border-[#165a64]">
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th className="py-3 px-3 w-24">Tür</th>
                <th className="py-3 px-3 w-28">Kategori</th>
                <th className="py-3 px-4 w-40">Kişi / Kurum</th>
                <th className="py-3 px-4">Açıklama</th>
                <th className="py-3 px-3 text-right w-28">Ana Tutar</th>
                <th className="py-3 px-3 text-right w-32">Geçmiş Ödeme/Tahsil</th>
                <th className="py-3 px-3 text-right w-32 bg-[#175b65] text-emerald-200">
                  Yeni Hareketlerden
                </th>
                <th className="py-3 px-3 text-right w-28 text-emerald-200">Kalan</th>
                <th className="py-3 px-3 text-center w-28">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-sans">
              {debts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Tabloda kayıtlı borç veya alacak bulunmuyor.
                  </td>
                </tr>
              ) : (
                debts.map((item, idx) => {
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
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                        {idx + 1}
                      </td>

                      {/* Tür */}
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          {item.type}
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </span>
                      </td>

                      {/* Kategori */}
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {item.category}
                      </td>

                      {/* Kişi / Kurum */}
                      <td className="py-2.5 px-4 font-semibold text-foreground whitespace-nowrap">
                        {item.person_or_entity}
                      </td>

                      {/* Açıklama */}
                      <td className="py-2.5 px-4 text-foreground/90 font-medium">
                        {item.description || '-'}
                      </td>

                      {/* Ana Tutar */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
                        {formatCurrency(principal)}
                      </td>

                      {/* Geçmiş Ödeme / Tahsil */}
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {pastPayments > 0 ? formatCurrency(pastPayments) : '-'}
                      </td>

                      {/* Yeni Hareketlerden (Highlighted soft green background like in Excel) */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-950/20 whitespace-nowrap">
                        {newPayments > 0 ? formatCurrency(newPayments) : '-'}
                      </td>

                      {/* Kalan (Bold green text like in Excel) */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {remaining > 0 ? formatCurrency(remaining) : '-'}
                      </td>

                      {/* İşlem */}
                      <td className="py-2.5 px-3 text-center">
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
                            <Badge variant="secondary" className="text-[10px] h-6 font-mono">
                              Kapandı
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(item)}
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Düzenle"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
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
                  <label className="text-xs font-semibold text-foreground">
                    Düşülecek Tutar (TL)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={deductAmount}
                    onChange={(e) => setDeductAmount(e.target.value)}
                    className="text-base font-bold font-mono text-emerald-500"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    {selectedDebt.type === 'Alacak'
                      ? 'Paranın Yatacağı Banka Hesabı (Opsiyonel)'
                      : 'Paranın Çıkacağı Banka Hesabı (Opsiyonel)'}
                  </label>
                  <Select
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
                    placeholder="Banka hareketlerinde ara (örn: Hızır, 15000)..."
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    className="pl-9 text-xs"
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Tür</label>
              <Select
                value={rowForm.type}
                onChange={(e) =>
                  setRowForm({ ...rowForm, type: e.target.value as 'Borç' | 'Alacak' })
                }
                className="text-xs"
              >
                <option value="Alacak">Alacak</option>
                <option value="Borç">Borç</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Kategori</label>
              <Input
                required
                value={rowForm.category}
                onChange={(e) => setRowForm({ ...rowForm, category: e.target.value })}
                placeholder="Örn: Maaş, Kişisel Borç, Diğer"
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Kişi / Kurum</label>
            <Input
              required
              value={rowForm.person_or_entity}
              onChange={(e) => setRowForm({ ...rowForm, person_or_entity: e.target.value })}
              placeholder="Örn: Hızır Global AŞ, Akbank"
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Açıklama</label>
            <Input
              required
              value={rowForm.description}
              onChange={(e) => setRowForm({ ...rowForm, description: e.target.value })}
              placeholder="Örn: Temmuz Ayı Çalışması (Ağustos Maaşı)"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Ana Tutar (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                value={rowForm.principal}
                onChange={(e) => setRowForm({ ...rowForm, principal: e.target.value })}
                placeholder="63300.00"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Geçmiş Ödeme (TL)</label>
              <Input
                type="number"
                step="0.01"
                value={rowForm.past_payments}
                onChange={(e) => setRowForm({ ...rowForm, past_payments: e.target.value })}
                placeholder="0.00"
                className="text-xs font-mono"
              />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Tür</label>
              <Select
                value={rowForm.type}
                onChange={(e) =>
                  setRowForm({ ...rowForm, type: e.target.value as 'Borç' | 'Alacak' })
                }
                className="text-xs"
              >
                <option value="Alacak">Alacak</option>
                <option value="Borç">Borç</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Kategori</label>
              <Input
                required
                value={rowForm.category}
                onChange={(e) => setRowForm({ ...rowForm, category: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Kişi / Kurum</label>
            <Input
              required
              value={rowForm.person_or_entity}
              onChange={(e) => setRowForm({ ...rowForm, person_or_entity: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Açıklama</label>
            <Input
              required
              value={rowForm.description}
              onChange={(e) => setRowForm({ ...rowForm, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Ana Tutar (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                value={rowForm.principal}
                onChange={(e) => setRowForm({ ...rowForm, principal: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Geçmiş Ödeme (TL)</label>
              <Input
                type="number"
                step="0.01"
                value={rowForm.past_payments}
                onChange={(e) => setRowForm({ ...rowForm, past_payments: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Güncelleniyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
