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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { collectReceivable, payDebt } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import type { Debt, Account } from '@/types/database'

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      const [{ data: dData }, { data: aData }] = await Promise.all([
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
        supabase.from('accounts').select('*'),
      ])
      if (dData) setDebts(dData)
      if (aData) {
        setAccounts(aData)
        if (aData.length > 0) {
          setSelectedAccountId(aData[0].id)
          setDebtForm((prev) => ({ ...prev, linked_account_id: aData[0].id }))
        }
      }
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
      const amountNum = parseFloat(paymentAmount || '0')
      const targetAccount = accounts.find((a) => a.id === selectedAccountId)

      let newAccountBalance = targetAccount ? Number(targetAccount.balance) : 0
      let newRemaining = selectedDebt.remaining
      let isClosed = false

      if (selectedDebt.type === 'Alacak') {
        const res = collectReceivable(
          newAccountBalance,
          selectedDebt.remaining,
          amountNum
        )
        newAccountBalance = res.newAccountBalance
        newRemaining = res.newReceivableRemaining
        isClosed = res.isClosed
      } else {
        const res = payDebt(
          newAccountBalance,
          selectedDebt.remaining,
          amountNum
        )
        newAccountBalance = res.newAccountBalance
        newRemaining = res.newDebtRemaining
        isClosed = res.isClosed
      }

      // 1. Update debt record
      const { error: debtErr } = await supabase
        .from('debts')
        .update({
          past_payments: selectedDebt.past_payments + amountNum,
          remaining: newRemaining,
          status: isClosed ? 'Kapatıldı' : 'Açık',
        })
        .eq('id', selectedDebt.id)

      if (debtErr) throw debtErr

      // 2. Auto-sync linked account balance!
      if (targetAccount) {
        await supabase
          .from('accounts')
          .update({
            balance: newAccountBalance,
          })
          .eq('id', targetAccount.id)
      }

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
                  <th className="p-3">Açıklama</th>
                  <th className="p-3 text-right">Ana Tutar</th>
                  <th className="p-3 text-right">Tahsil Edilen</th>
                  <th className="p-3 text-right">Kalan Bakiye</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {receivables.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors font-sans">
                    <td className="p-3 font-semibold text-foreground">{item.category}</td>
                    <td className="p-3 font-medium text-foreground">{item.person_or_entity}</td>
                    <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                      {item.description || '-'}
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPaymentModal(item)}
                            className="h-7 text-xs gap-1 border-success/40 text-success hover:bg-success/15"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Tahsil Et
                          </Button>
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
                ))}
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
                  <th className="p-3">Açıklama</th>
                  <th className="p-3 text-right">Ana Tutar</th>
                  <th className="p-3 text-right">Ödenen</th>
                  <th className="p-3 text-right">Kalan Borç</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {myDebts.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors font-sans">
                    <td className="p-3 font-semibold text-foreground">{item.category}</td>
                    <td className="p-3 font-medium text-foreground">{item.person_or_entity}</td>
                    <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                      {item.description || '-'}
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPaymentModal(item)}
                            className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/15"
                          >
                            Öde
                          </Button>
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
                ))}
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
    </div>
  )
}
