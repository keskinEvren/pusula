'use client'

import { useEffect, useState } from 'react'
import {
  HandCoins,
  Plus,
  ArrowUpRight,
  TrendingDown,
  CheckCircle2,
  Trash2,
  Wallet,
  Building2,
  Calendar,
  Link2,
  Search,
  Check,
  RotateCcw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { financialBridge, getLinkedDebtId } from '@/lib/financial-bridge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import type { Debt, Account, Transaction } from '@/types/database'

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Bank Match Modal
  const [isBankMatchModalOpen, setIsBankMatchModalOpen] = useState(false)
  const [debtForBankMatch, setDebtForBankMatch] = useState<Debt | null>(null)
  const [bankSearchTerm, setBankSearchTerm] = useState('')
  const [matchingTxId, setMatchingTxId] = useState<string | null>(null)

  // New Debt Form
  const [debtForm, setDebtForm] = useState({
    type: 'Alacak' as 'Borç' | 'Alacak',
    category: 'Maaş',
    person_or_entity: '',
    description: '',
    principal: '',
    linked_account_id: '',
  })

  useEffect(() => {
    loadDebtsAndAccounts()
  }, [])

  async function loadDebtsAndAccounts() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: dData }, { data: aData }, { data: tData }] = await Promise.all([
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
        supabase.from('accounts').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
      ])
      if (dData) setDebts(dData)
      if (aData) {
        setAccounts(aData)
        if (aData.length > 0) {
          setSelectedAccountId(aData[0].id)
          setDebtForm((prev) => ({ ...prev, linked_account_id: aData[0].id }))
        }
      }
      if (tData) setTransactions(tData)
    } catch (err) {
      console.error('Error loading debts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const principalNum = parseFloat(debtForm.principal || '0')

      const { data, error } = await supabase
        .from('debts')
        .insert({
          user_id: user.id,
          type: debtForm.type,
          category: debtForm.category,
          person_or_entity: debtForm.person_or_entity,
          description: debtForm.description || null,
          principal: principalNum,
          past_payments: 0,
          remaining: principalNum,
          status: 'Açık',
          linked_account_id: debtForm.linked_account_id || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setDebts([data, ...debts])
        setIsModalOpen(false)
        setDebtForm({
          type: 'Alacak',
          category: 'Maaş',
          person_or_entity: '',
          description: '',
          principal: '',
          linked_account_id: accounts[0]?.id || '',
        })
      }
    } catch (err: any) {
      alert(err.message || 'Borç/Alacak eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenPaymentModal = (debt: Debt) => {
    setSelectedDebt(debt)
    setPaymentAmount(debt.remaining.toString())
    setSelectedAccountId(debt.linked_account_id || accounts[0]?.id || '')
    setIsPaymentModalOpen(true)
  }

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDebt) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const amountNum = parseFloat(paymentAmount || '0')

      let res;
      if (selectedDebt.type === 'Alacak') {
        res = await financialBridge.recordReceivableCollection({
          userId: user.id,
          amount: amountNum,
          targetAccountId: selectedAccountId,
          receivableId: selectedDebt.id,
          date: new Date().toISOString().split('T')[0],
          description: `${selectedDebt.person_or_entity} Alacak Tahsilatı`
        })
      } else {
        res = await financialBridge.recordDebtPayment({
          userId: user.id,
          amount: amountNum,
          sourceAccountId: selectedAccountId,
          debtId: selectedDebt.id,
          date: new Date().toISOString().split('T')[0],
          description: `${selectedDebt.person_or_entity} Borç Ödemesi`
        })
      }

      if (!res.success) throw new Error(res.error)

      setIsPaymentModalOpen(false)
      loadDebtsAndAccounts()
    } catch (err: any) {
      alert(err.message || 'Ödeme işlenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('debts').delete().eq('id', id)
      if (error) throw error
      setDebts(debts.filter((d) => d.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  const handleOpenBankMatchModal = (debt: Debt) => {
    setDebtForBankMatch(debt)
    setBankSearchTerm('')
    setIsBankMatchModalOpen(true)
  }

  const handleMatchTransaction = async (txId: string) => {
    if (!debtForBankMatch) return
    setMatchingTxId(txId)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const res = await financialBridge.linkTransactionToDebt({
        userId: user.id,
        transactionId: txId,
        debtId: debtForBankMatch.id,
      })

      if (!res.success) throw new Error(res.error)
      await loadDebtsAndAccounts()
      setIsBankMatchModalOpen(false)
      setDebtForBankMatch(null)
    } catch (err: any) {
      alert(err.message || 'Eşleme başarısız oldu')
    } finally {
      setMatchingTxId(null)
    }
  }

  const handleUnlinkTx = async (txId: string) => {
    if (!confirm('Bu hareketin eşleşmesini kaldırmak istiyor musunuz? Tutar borç bakiyesine iade edilecektir.')) {
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
        transactionId: txId,
      })

      if (!res.success) throw new Error(res.error)
      await loadDebtsAndAccounts()
    } catch (err: any) {
      alert(err.message || 'Bağlantı kaldırılamadı')
    }
  }

  const receivables = debts.filter((d) => d.type === 'Alacak')
  const myDebts = debts.filter((d) => d.type === 'Borç')

  const totalActiveReceivables = receivables
    .filter((d) => d.status === 'Açık')
    .reduce((sum, d) => sum + Number(d.remaining), 0)

  const totalActiveDebts = myDebts
    .filter((d) => d.status === 'Açık')
    .reduce((sum, d) => sum + Number(d.remaining), 0)

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Borç & Kesin Alacak Yönetimi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Maaş hakedişleri, kişi borçları ve tahsilatta nakit hesaba otomatik yansıma
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Yeni Borç / Alacak Ekle
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toplam Kesin Alacak (Bekleyen)
            </CardTitle>
            <div className="rounded-full bg-success/10 p-2 text-success">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-success">
              {formatCurrency(totalActiveReceivables)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tahsil edildiğinde seçtiğiniz banka hesabına otomatik eklenir
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toplam Şahsi Borç (Kalan)
            </CardTitle>
            <div className="rounded-full bg-destructive/10 p-2 text-destructive">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-destructive">
              {formatCurrency(totalActiveDebts)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ödendiğinde seçtiğiniz banka hesabından otomatik düşülür
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Salary & Milestone Breakdown Card (Hızır Global) */}
      {(() => {
        const hizirDebt = debts.find((d) => d.person_or_entity.includes('Hızır Global'))
        if (!hizirDebt) return null
        const hizirTxs = transactions.filter((t) => getLinkedDebtId(t) === hizirDebt.id)

        return (
          <Card className="border-emerald-500/30 bg-emerald-950/10 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-emerald-500/20 bg-emerald-500/5 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base text-emerald-400 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Hızır Global — Maaş & Hakediş Tahsilat Çizelgesi
                  </CardTitle>
                  <CardDescription className="text-emerald-200/70">
                    İşten ayrılış (5 Haziran 2026) sonrası toplam hakediş, gerçekleşen banka ödemeleri ve aylık kalan takvim
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenBankMatchModal(hizirDebt)}
                    className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Banka Hareketinden Eşle
                  </Button>
                </div>
              </div>

              {/* Metrics Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <div className="rounded-lg bg-card/60 p-2.5 border border-border">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Toplam Hak Edilen</div>
                  <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {formatCurrency(hizirDebt.principal)}
                  </div>
                </div>
                <div className="rounded-lg bg-card/60 p-2.5 border border-border">
                  <div className="text-[11px] text-muted-foreground uppercase font-semibold">Tahsil Edilen (Geçmiş Ödemeler)</div>
                  <div className="text-lg font-bold font-mono text-success mt-0.5">
                    {formatCurrency(hizirDebt.past_payments)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    31.08.2026 Akbank (15k + 24k) eşleştirildi ve düşüldü
                  </div>
                </div>
                <div className="rounded-lg bg-card/60 p-2.5 border border-emerald-500/30 bg-emerald-500/10">
                  <div className="text-[11px] text-emerald-300 uppercase font-semibold">Net Kalan Alacak</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                    {formatCurrency(hizirDebt.remaining)}
                  </div>
                  <div className="text-[10px] text-emerald-300/80 mt-0.5">
                    Excel tablosu ile birebir örtüşüyor
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Dönem Kırılımı & Vade Durumu
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {/* 1. Ağustos (Tahsil Edildi) */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-emerald-400">Ağustos 2026</span>
                      <Badge variant="success" className="text-[9px]">✓ Tahsil Edildi</Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-emerald-300 mt-2">
                      ₺39.000,00
                    </div>
                    <p className="text-[11px] text-emerald-200/80 mt-1">
                      Akbank hesabına yatan 2 hareket dökümden düşüldü:
                    </p>
                    <div className="mt-2 space-y-1 font-mono text-[10px] text-emerald-200/90">
                      <div>• 31.08: ₺15.000,00</div>
                      <div>• 31.08: ₺24.000,00</div>
                    </div>
                  </div>
                </div>

                {/* 2. Eylül (Vadesi Geldi / Bekliyor) */}
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-amber-400">Eylül 2026 (Bu Ay)</span>
                      <Badge variant="outline" className="text-[9px] bg-amber-500/20 text-amber-300 border-amber-500/40">
                        ⏳ Bekleniyor
                      </Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-amber-300 mt-2">
                      ₺49.950,00
                    </div>
                    <p className="text-[11px] text-amber-200/80 mt-1">
                      1. Taksit maaş hakediş alacağı. Hesaba geçtiğinde tek tıkla eşleyin.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenBankMatchModal(hizirDebt)}
                    className="mt-3 h-7 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20 w-full"
                  >
                    Eşle / Tahsil Et
                  </Button>
                </div>

                {/* 3. Ekim */}
                <div className="rounded-xl border border-border bg-card/60 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">Ekim 2026</span>
                      <Badge variant="outline" className="text-[9px]">📅 Gelecek</Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-foreground mt-2">
                      ₺49.950,00
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      2. Taksit planlanan hakediş alacağı.
                    </p>
                  </div>
                </div>

                {/* 4. Kasım */}
                <div className="rounded-xl border border-border bg-card/60 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-foreground">Kasım 2026</span>
                      <Badge variant="outline" className="text-[9px]">📅 Gelecek</Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-foreground mt-2">
                      ₺49.950,00
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      3. Taksit nihai kapanış hakediş alacağı.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Receivables Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-success flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4" />
                Kesin Alacaklar (Maaş & Hakedişler)
              </CardTitle>
              <CardDescription>Tahsil edilmeyi bekleyen gelir kalemleriniz</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Kişi / Kurum</th>
                  <th className="p-3">Açıklama & Eşleşen Hareketler</th>
                  <th className="p-3 text-right">Ana Tutar</th>
                  <th className="p-3 text-right">Tahsil Edilen</th>
                  <th className="p-3 text-right">Kalan Bakiye</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {receivables.map((item) => {
                  const linkedTxs = transactions.filter((t) => getLinkedDebtId(t) === item.id)

                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors font-sans">
                      <td className="p-3 font-semibold text-foreground">{item.category}</td>
                      <td className="p-3 font-medium text-foreground">{item.person_or_entity}</td>
                      <td className="p-3 text-muted-foreground text-[11px] max-w-sm">
                        <div>{item.description || '-'}</div>
                        {linkedTxs.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-foreground font-semibold">Eşleşen Hareketler:</span>
                            {linkedTxs.map((lt) => (
                              <span
                                key={lt.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono"
                              >
                                <span>{formatDate(lt.date)}: +{formatCurrency(lt.amount)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkTx(lt.id)}
                                  className="text-[10px] text-muted-foreground hover:text-destructive underline ml-0.5"
                                  title="Eşleştirmeyi İptal Et (Geri Al)"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(item.principal)}
                      </td>
                      <td className="p-3 text-right font-mono text-success">
                        {formatCurrency(item.past_payments)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-foreground">
                        {formatCurrency(item.remaining)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={item.status === 'Açık' ? 'success' : 'secondary'}
                          className="text-[10px]"
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.status === 'Açık' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenBankMatchModal(item)}
                                className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                                title="Banka hareketlerinden seçerek tahsilat eşle"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                Banka Eşle
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPaymentModal(item)}
                                className="h-7 text-xs gap-1 border-success/40 text-success hover:bg-success/15"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Tahsil Et
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {receivables.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                      Kayıtlı alacak bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Debts Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Şahsi & Kurum Borçları
            </CardTitle>
            <CardDescription>Kart harici ödenecek şahıs ve artı para borçları</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Kişi / Kurum</th>
                  <th className="p-3">Açıklama & Eşleşen Hareketler</th>
                  <th className="p-3 text-right">Ana Tutar</th>
                  <th className="p-3 text-right">Ödenen</th>
                  <th className="p-3 text-right">Kalan Borç</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {myDebts.map((item) => {
                  const linkedTxs = transactions.filter((t) => getLinkedDebtId(t) === item.id)

                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors font-sans">
                      <td className="p-3 font-semibold text-foreground">{item.category}</td>
                      <td className="p-3 font-medium text-foreground">{item.person_or_entity}</td>
                      <td className="p-3 text-muted-foreground text-[11px] max-w-sm">
                        <div>{item.description || '-'}</div>
                        {linkedTxs.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-foreground font-semibold">Eşleşen Ödemeler:</span>
                            {linkedTxs.map((lt) => (
                              <span
                                key={lt.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-destructive/10 text-destructive border border-destructive/20 font-mono"
                              >
                                <span>{formatDate(lt.date)}: {formatCurrency(lt.amount)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkTx(lt.id)}
                                  className="text-[10px] text-muted-foreground hover:text-destructive underline ml-0.5"
                                  title="Eşleştirmeyi İptal Et (Geri Al)"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(item.principal)}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(item.past_payments)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-destructive">
                        {formatCurrency(item.remaining)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={item.status === 'Açık' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.status === 'Açık' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenBankMatchModal(item)}
                                className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                                title="Banka harcamalarından seçerek borç ödemesi eşle"
                              >
                                <Building2 className="h-3.5 w-3.5" />
                                Banka Eşle
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPaymentModal(item)}
                                className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/15"
                              >
                                Öde
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {myDebts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                      Kayıtlı borç bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Debt/Receivable Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Yeni Borç / Alacak Kaydı"
        description="Maaş hakedişi, şahıs alacağı veya artı para borcu tanımlayın."
      >
        <form onSubmit={handleAddDebt} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Tür</label>
              <Select
                value={debtForm.type}
                onChange={(e) =>
                  setDebtForm({ ...debtForm, type: e.target.value as 'Borç' | 'Alacak' })
                }
                className="text-xs"
              >
                <option value="Alacak">Alacak (Bana Ödenecek)</option>
                <option value="Borç">Borç (Benim Ödeyeceğim)</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
              <Input
                required
                placeholder="Örn: Maaş, Kişisel Borç, Artı Para"
                value={debtForm.category}
                onChange={(e) => setDebtForm({ ...debtForm, category: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Kişi / Kurum Adı</label>
            <Input
              required
              placeholder="Örn: Hızır Global A.Ş., Ablam, Akbank"
              value={debtForm.person_or_entity}
              onChange={(e) => setDebtForm({ ...debtForm, person_or_entity: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Ana Tutar (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="50000.00"
                value={debtForm.principal}
                onChange={(e) => setDebtForm({ ...debtForm, principal: e.target.value })}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                İlişkili Hesap (Auto-Sync)
              </label>
              <Select
                value={debtForm.linked_account_id}
                onChange={(e) => setDebtForm({ ...debtForm, linked_account_id: e.target.value })}
                className="text-xs"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.balance)})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Açıklama (Opsiyonel)</label>
            <Input
              placeholder="Örn: 2026 Temmuz Hakedişi"
              value={debtForm.description}
              onChange={(e) => setDebtForm({ ...debtForm, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment / Collection Process Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={selectedDebt?.type === 'Alacak' ? 'Alacak Tahsilatı Yap' : 'Borç Ödemesi Yap'}
        description={`Seçilen tutar ${selectedDebt?.person_or_entity} kaydından düşülecek ve banka hesabınızla otomatik senkronize edilecektir.`}
      >
        <form onSubmit={handleProcessPayment} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              İşlem Yapılacak Tutar (TL)
            </label>
            <Input
              type="number"
              step="0.01"
              required
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="text-xs font-mono text-lg font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {selectedDebt?.type === 'Alacak' ? 'Paranın Yatacağı Hesap' : 'Paranın Çıkacağı Hesap'}
            </label>
            <Select
              required
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="text-xs"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Bakiye: {formatCurrency(a.balance)})
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border border-border/50">
            Kalan Borç/Alacak: <strong>{formatCurrency(selectedDebt?.remaining)}</strong> ➔ İşlem sonrası:{' '}
            <strong>
              {formatCurrency(
                Math.max(0, (selectedDebt?.remaining || 0) - parseFloat(paymentAmount || '0'))
              )}
            </strong>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting} variant={selectedDebt?.type === 'Alacak' ? 'default' : 'destructive'}>
              {submitting ? 'İşleniyor...' : 'Onayla ve Hesaba Yansıt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bank Transaction Match Modal */}
      <Modal
        isOpen={isBankMatchModalOpen}
        onClose={() => {
          setIsBankMatchModalOpen(false)
          setDebtForBankMatch(null)
        }}
        title={`Banka Hareketinden ${debtForBankMatch?.type === 'Alacak' ? 'Tahsilat' : 'Borç Ödemesi'} Eşle`}
        description={`Hesap dökümlerinizden bir hareketi seçerek "${debtForBankMatch?.person_or_entity}" kaydına bağlayabilir ve kalan bakiyeden otomatik düşebilirsiniz.`}
      >
        {debtForBankMatch && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 border border-border text-xs space-y-1 font-mono">
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground font-sans">Hedef Kayıt:</span>
                <span className="font-semibold text-foreground font-sans">
                  {debtForBankMatch.person_or_entity} ({debtForBankMatch.category})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Kalan Bakiye:</span>
                <span className="font-bold text-success text-sm">
                  {formatCurrency(debtForBankMatch.remaining)}
                </span>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İşlem veya açıklama ara (örn: Hızır, Maaş, 15000)..."
                value={bankSearchTerm}
                onChange={(e) => setBankSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-border/40">
              {(() => {
                const isReceivable = debtForBankMatch.type === 'Alacak'
                const candidateTxs = transactions.filter((t) => {
                  if (isReceivable) {
                    if (t.type !== 'Gelir' && t.type !== 'Tahsilat') return false
                  } else {
                    if (t.type !== 'Harcama' && t.type !== 'Borç Ödemesi') return false
                  }

                  if (bankSearchTerm) {
                    const q = bankSearchTerm.toLowerCase()
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
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      Aramaya uygun banka hareketi bulunamadı.
                    </div>
                  )
                }

                return candidateTxs.slice(0, 20).map((t) => {
                  const linkedId = getLinkedDebtId(t)
                  const isAlreadyLinkedToThis = linkedId === debtForBankMatch.id

                  return (
                    <div
                      key={t.id}
                      className="pt-2 pb-2 flex items-center justify-between gap-3 hover:bg-muted/20 px-2 rounded-lg transition-colors"
                    >
                      <div className="space-y-0.5 text-xs min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono">{formatDate(t.date)}</span>
                          <span className="font-semibold text-foreground">{t.account_or_card || 'Banka'}</span>
                          {isAlreadyLinkedToThis && (
                            <Badge variant="success" className="text-[9px]">
                              Eşleşmiş
                            </Badge>
                          )}
                        </div>
                        <div className="text-foreground truncate max-w-sm font-medium">
                          {t.merchant || t.description}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`font-bold font-mono text-sm ${
                            isReceivable ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {isReceivable ? '+' : '−'}
                          {formatCurrency(t.amount)}
                        </span>
                        {isAlreadyLinkedToThis ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnlinkTx(t.id)}
                            className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                          >
                            Çöz
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={matchingTxId === t.id}
                            onClick={() => handleMatchTransaction(t.id)}
                            className="h-7 text-xs gap-1"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {matchingTxId === t.id ? 'Eşleniyor...' : 'Eşle'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsBankMatchModalOpen(false)
                  setDebtForBankMatch(null)
                }}
              >
                Kapat
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
