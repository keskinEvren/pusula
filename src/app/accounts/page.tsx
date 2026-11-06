'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Building2,
  Plus,
  Wallet,
  TrendingUp,
  Edit,
  Trash2,
  UploadCloud,
  Droplets,
  Calendar,
  Percent,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatLocalDateInput } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import {
  calculateAccountYield,
  calculateAccountsYieldSummary,
  round2,
} from '@/lib/finance-engine'
import { financialBridge } from '@/lib/financial-bridge'
import type { Account } from '@/types/database'

type AccountType = 'vadesiz' | 'gunluk_birikim' | 'vadeli' | 'doviz' | 'kasa' | 'diger'

function formatAccountType(type: string): string {
  switch (type) {
    case 'vadesiz':
      return 'Vadesiz Hesap'
    case 'gunluk_birikim':
      return 'Günlük Birikim (Damla)'
    case 'vadeli':
      return 'Vadeli Mevduat'
    case 'doviz':
      return 'Döviz / Altın'
    case 'kasa':
      return 'Nakit Kasa'
    default:
      return type ? `${type} hesabı` : 'Hesap'
  }
}

export default function AccountsPage() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('vadesiz')
  const [balance, setBalance] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [withholdingTaxRate, setWithholdingTaxRate] = useState('10')
  const [reservedBaseAmount, setReservedBaseAmount] = useState('')
  const [maturityDate, setMaturityDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [applyingYieldId, setApplyingYieldId] = useState<string | null>(null)

  const [deleteTargetAccount, setDeleteTargetAccount] = useState<Account | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadData()

    const handleTxCreated = () => {
      loadData()
    }
    window.addEventListener('pusula:transaction-created', handleTxCreated)
    return () => {
      window.removeEventListener('pusula:transaction-created', handleTxCreated)
    }
  }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const { data: accs, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true })

    if (accountError) toast.error('Hesap verileri yüklenemedi. Lütfen tekrar deneyin.')

    if (accs) setAccounts(accs)
    setLoading(false)
  }

  const handleOpenAddModal = () => {
    setEditingAccount(null)
    setName('')
    setType('vadesiz')
    setBalance('')
    setInterestRate('')
    setWithholdingTaxRate('10')
    setReservedBaseAmount('')
    setMaturityDate('')
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (acc: Account) => {
    setEditingAccount(acc)
    setName(acc.name)
    setType(acc.type as AccountType)
    setBalance(acc.balance.toString())
    setInterestRate(acc.interest_rate != null ? acc.interest_rate.toString() : '')
    setWithholdingTaxRate(acc.withholding_tax_rate != null ? acc.withholding_tax_rate.toString() : '10')
    setReservedBaseAmount(acc.reserved_base_amount != null ? acc.reserved_base_amount.toString() : '')
    setMaturityDate(acc.maturity_date || '')
    setIsModalOpen(true)
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Oturum bilgisi bulunamadı.')
        return
      }

      const numericBalance = parseFloat(balance.replace(',', '.')) || 0
      const isYieldType = type === 'gunluk_birikim' || type === 'vadeli'
      const parsedInterest = isYieldType && interestRate ? parseFloat(interestRate.replace(',', '.')) : null
      const parsedTax = isYieldType && withholdingTaxRate ? parseFloat(withholdingTaxRate.replace(',', '.')) : null
      const parsedReserved = type === 'gunluk_birikim' && reservedBaseAmount ? parseFloat(reservedBaseAmount.replace(',', '.')) : null

      const numericInterest = parsedInterest != null && !isNaN(parsedInterest) ? Math.min(999.99, Math.max(0, parsedInterest)) : null
      const numericTax = isYieldType ? (parsedTax != null && !isNaN(parsedTax) ? Math.min(100, Math.max(0, parsedTax)) : 10) : null
      const numericReserved = parsedReserved != null && !isNaN(parsedReserved) ? Math.max(0, parsedReserved) : null
      const cleanMaturity = type === 'vadeli' && maturityDate ? maturityDate : null

      const accountPayload = {
        name,
        type,
        balance: numericBalance,
        interest_rate: numericInterest,
        withholding_tax_rate: numericTax,
        reserved_base_amount: numericReserved,
        maturity_date: cleanMaturity,
      }

      if (editingAccount) {
        const { error } = await supabase
          .from('accounts')
          .update(accountPayload)
          .eq('id', editingAccount.id)

        if (error) throw error
        toast.success('Hesap başarıyla güncellendi.')
      } else {
        const { error } = await supabase.from('accounts').insert({
          user_id: user.id,
          ...accountPayload,
        })

        if (error) throw error
        toast.success('Hesap başarıyla eklendi.')
      }

      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Hesap kaydedilirken bir hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyYield = async (acc: Account) => {
    const yieldInfo = calculateAccountYield(acc)
    if (!yieldInfo.hasYield || yieldInfo.pendingNetYield <= 0) return

    setApplyingYieldId(acc.id)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Oturum bilgisi bulunamadı.')
        return
      }

      const todayStr = formatLocalDateInput(new Date())
      const periodLabel = yieldInfo.pendingDays > 1 ? `${yieldInfo.pendingDays} Günlük` : 'Günlük'

      // Atomik gelir kaydı ile hem hareket tablosuna işlenir hem bakiye güncellenir
      const res = await financialBridge.recordIncome({
        userId: user.id,
        date: todayStr,
        amount: yieldInfo.pendingNetYield,
        description: `${acc.name} — ${periodLabel} Birikim Getirisi (Damla)`,
        accountId: acc.id,
        merchant: 'Mevduat / Faiz Getirisi',
      })

      if (!res.success) {
        throw new Error(res.error || 'Getiri kaydedilemedi.')
      }

      // Son getiri işleme tarihini güncelle
      const { error: updateAccError } = await supabase
        .from('accounts')
        .update({
          last_yield_applied_at: todayStr,
        })
        .eq('id', acc.id)

      if (updateAccError) throw updateAccError

      window.dispatchEvent(new Event('pusula:transaction-created'))
      toast.success(`💧 ${formatCurrency(yieldInfo.pendingNetYield)} getiri ${acc.name} hesabına işlendi!`)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Getiri işlenirken bir hata oluştu.')
    } finally {
      setApplyingYieldId(null)
    }
  }

  const confirmDeleteAccount = async () => {
    if (!deleteTargetAccount) return
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('accounts').delete().eq('id', deleteTargetAccount.id)
      if (error) throw error
      toast.success('Hesap silindi.')
      setDeleteTargetAccount(null)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Hesap silinirken bir hata oluştu.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Finans motoru üzerinden toplu getiri ve likidite özeti
  const summary = useMemo(() => {
    return calculateAccountsYieldSummary(accounts)
  }, [accounts])

  // Canlı modal önizlemesi
  const modalYieldPreview = useMemo(() => {
    const isYieldType = type === 'gunluk_birikim' || type === 'vadeli'
    if (!isYieldType) return null

    const numBal = parseFloat(balance.replace(',', '.')) || 0
    const numInt = parseFloat(interestRate.replace(',', '.')) || 0
    const numTax = withholdingTaxRate ? parseFloat(withholdingTaxRate.replace(',', '.')) : 10
    const numRes = type === 'gunluk_birikim' ? (parseFloat(reservedBaseAmount.replace(',', '.')) || 0) : 0

    return calculateAccountYield({
      balance: numBal,
      reserved_base_amount: numRes,
      interest_rate: numInt,
      withholding_tax_rate: numTax,
      maturity_date: maturityDate || null,
      type,
    })
  }, [type, balance, interestRate, withholdingTaxRate, reservedBaseAmount, maturityDate])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 rounded-xl bg-card/60 border border-border/40" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-card/60 border border-border/40" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-card/60 border border-border/40" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Banka Hesapları & Kasalar"
        description="Vadesiz banka hesaplarınızı, getirili günlük birikimlerinizi (VakıfBank ARI vb.), vadeli mevduatlarınızı ve kasalarınızı yönetin."
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link href="/import?mode=bank_account" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto gap-2">
                <UploadCloud className="h-4 w-4" />
                <span>Hesap Özeti İçe Aktar</span>
              </Button>
            </Link>
            <Button onClick={handleOpenAddModal} className="w-full sm:w-auto gap-2 shadow-md">
              <Plus className="h-4 w-4" />
              Hesap / Kasa Ekle
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Toplam Nakit & Mevduat */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Nakit & Mevduat
            </CardTitle>
            <Wallet className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(summary.totalCash)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.length} aktif hesap ve kasa üzerinden
            </p>
          </CardContent>
        </Card>

        {/* Vadesiz & Likit */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vadesiz & Anlık Likit
            </CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(summary.liquidCash)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Vadesiz, kasa ve günlük birikim (anında harcanabilir)
            </p>
          </CardContent>
        </Card>

        {/* Birikim & Vadeli Mevduat */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Birikim & Vadeli Mevduat
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(summary.savingsCash)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.yieldAccountCount > 0 ? (
                <>Faizde: <strong className="font-mono text-foreground">{formatCurrency(summary.totalActivePrincipal)}</strong> anapara</>
              ) : (
                'Aktif getirili hesap tanımlanmamış'
              )}
            </p>
          </CardContent>
        </Card>

        {/* 💧 Günlük Damla Motoru */}
        <Card className="border-border bg-gradient-to-br from-card via-card to-blue-500/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <Droplets className="h-4 w-4 text-blue-500 animate-pulse" />
              <CardTitle className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Günlük Damla Akışı
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10">
              Net Getiri
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
              +{formatCurrency(summary.totalDailyNetYield)}
              <span className="text-xs font-normal text-muted-foreground ml-1">/ gün</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Aylık tahmini <strong className="font-mono text-foreground">+{formatCurrency(summary.totalMonthlyNetYield)}</strong> net
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Grid */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Hesaplarınız</h2>
        {accounts.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-border/60 bg-card">
            <Building2 className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Henüz hesap veya kasa bulunmuyor</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Vadesiz banka hesaplarınızı, getirili günlük birikimlerinizi ve nakit kasalarınızı ekleyerek başlayın.
            </p>
            <Button onClick={handleOpenAddModal} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Hesap / Kasa Ekle
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acc) => {
              const yieldInfo = calculateAccountYield(acc)
              const isSavings = acc.type === 'gunluk_birikim' || acc.type === 'vadeli'

              return (
                <Card
                  key={acc.id}
                  className={`border-border bg-card shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between ${
                    yieldInfo.hasYield ? 'border-blue-500/20 shadow-blue-500/5' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                            acc.type === 'gunluk_birikim'
                              ? 'bg-blue-500/10 text-blue-500'
                              : acc.type === 'vadeli'
                              ? 'bg-amber-500/10 text-amber-500'
                              : acc.type === 'kasa'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {acc.type === 'gunluk_birikim' ? (
                            <Droplets className="h-5 w-5" />
                          ) : acc.type === 'vadeli' ? (
                            <TrendingUp className="h-5 w-5" />
                          ) : acc.type === 'kasa' ? (
                            <Wallet className="h-5 w-5" />
                          ) : (
                            <Building2 className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold leading-tight">{acc.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {formatAccountType(acc.type)}
                          </CardDescription>
                        </div>
                      </div>

                      {/* Header Badge: Yield indicator or status */}
                      {yieldInfo.hasYield ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 shrink-0 font-mono gap-1"
                        >
                          <Droplets className="h-3 w-3" />
                          +{formatCurrency(yieldInfo.dailyNetYield)}/gün
                        </Badge>
                      ) : (
                        <Badge
                          variant={acc.balance > 0 ? 'success' : acc.balance < 0 ? 'destructive' : 'outline'}
                          className="text-xs shrink-0"
                        >
                          {acc.balance > 0 ? 'Aktif' : acc.balance < 0 ? 'KMH' : '0,00 TL'}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Bakiye */}
                      <div className="text-2xl font-bold font-mono text-foreground">
                        {formatCurrency(acc.balance)}
                      </div>

                      {/* Getiri & Birikim Motoru Detayı */}
                      {yieldInfo.hasYield && (
                        <div className="mt-3 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>
                              Brüt Faiz: <strong className="text-foreground font-mono">%{yieldInfo.interestRate}</strong>
                              <span className="text-[10px] ml-1">(Stopaj: %{yieldInfo.withholdingTaxRate})</span>
                            </span>
                            <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                              Aylık ~+{formatCurrency(yieldInfo.monthlySimpleNetYield)}
                            </span>
                          </div>

                          {/* Vadesiz Alt Limit / Faizde Çalışan Anapara */}
                          {acc.reserved_base_amount && Number(acc.reserved_base_amount) > 0 && (
                            <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>
                                Faizde: <strong className="text-foreground font-mono">{formatCurrency(yieldInfo.activePrincipal)}</strong>
                              </span>
                              <span>
                                Alt Limit: <strong className="font-mono">{formatCurrency(acc.reserved_base_amount)}</strong>
                              </span>
                            </div>
                          )}

                          {/* Vade Sayacı (Vadeli hesaplar için) */}
                          {yieldInfo.daysToMaturity !== null && (
                            <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Vade Sonu:</span>
                              {yieldInfo.isMatured ? (
                                <Badge variant="destructive" className="text-[10px] py-0 h-4">
                                  Vadesi Doldu ({acc.maturity_date})
                                </Badge>
                              ) : (
                                <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold">
                                  {yieldInfo.daysToMaturity} gün kaldı ({acc.maturity_date})
                                </span>
                              )}
                            </div>
                          )}

                          {/* Hızlı Damla Ekleme Butonu */}
                          {yieldInfo.pendingDays > 0 && yieldInfo.pendingNetYield > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApplyYield(acc)}
                              disabled={Boolean(applyingYieldId)}
                              className="w-full mt-1.5 h-8 text-xs font-semibold gap-1.5 border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15"
                            >
                              <Droplets className="h-3.5 w-3.5 text-blue-500" />
                              {applyingYieldId === acc.id
                                ? 'İşleniyor...'
                                : `${yieldInfo.pendingDays > 1 ? `${yieldInfo.pendingDays} Günlük` : 'Günlük'} Damlayı Ekle (+${formatCurrency(yieldInfo.pendingNetYield)})`}
                            </Button>
                          ) : (
                            <div className="mt-1 pt-1 text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Bugünkü damla bakiyeye işlendi
                            </div>
                          )}
                        </div>
                      )}

                      {/* Faiz Tanımlı ama Bakiye Alt Limit Altında Kalan Durum */}
                      {isSavings && !yieldInfo.hasYield && acc.interest_rate && acc.reserved_base_amount && (
                        <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                          Bakiye alt limitin ({formatCurrency(acc.reserved_base_amount)}) altında kaldığı için faiz işletilmiyor.
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(acc)}
                        className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        Düzenle
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTargetAccount(acc)}
                        className="h-9 px-3 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Sil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal for Add / Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccount ? 'Hesabı Düzenle' : 'Yeni Hesap / Kasa Ekle'}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="account-name-input" className="text-xs font-semibold text-foreground cursor-pointer">
              Hesap / Banka Adı
            </label>
            <Input
              id="account-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: VakıfBank ARI Hesabı, Garanti Vadesiz TL, Fiziki Kasa..."
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="account-type-select" className="text-xs font-semibold text-foreground cursor-pointer">
                Hesap Türü
              </label>
              <Select
                id="account-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                <option value="vadesiz">Vadesiz TL</option>
                <option value="gunluk_birikim">💧 Günlük Birikim / Kırık Vadeli (ARI vb.)</option>
                <option value="vadeli">📈 Vadeli Mevduat</option>
                <option value="doviz">Döviz / Altın</option>
                <option value="kasa">Fiziki Nakit Kasa</option>
                <option value="diger">Diğer</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="account-balance-input" className="text-xs font-semibold text-foreground cursor-pointer">
                Mevcut Bakiye (₺)
              </label>
              <Input
                id="account-balance-input"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {/* Birikim & Faiz Motoru Ayarları */}
          {(type === 'gunluk_birikim' || type === 'vadeli') && (
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3 mt-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-bold text-foreground">
                  Birikim & Faiz Motoru Parametreleri
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="account-interest-input" className="text-xs font-semibold text-foreground cursor-pointer">
                    Yıllık Brüt Faiz Oranı (%)
                  </label>
                  <Input
                    id="account-interest-input"
                    type="number"
                    step="0.01"
                    min="0"
                    max="999.99"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="Örn: 49.00"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="account-tax-input" className="text-xs font-semibold text-foreground cursor-pointer">
                    Stopaj Kesintisi (%)
                  </label>
                  <Input
                    id="account-tax-input"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={withholdingTaxRate}
                    onChange={(e) => setWithholdingTaxRate(e.target.value)}
                    placeholder="10.00"
                  />
                </div>
              </div>

              {type === 'gunluk_birikim' && (
                <div className="space-y-1">
                  <label htmlFor="account-reserved-input" className="text-xs font-semibold text-foreground cursor-pointer">
                    Faiz Dışı Vadesiz Alt Limit (₺)
                  </label>
                  <Input
                    id="account-reserved-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={reservedBaseAmount}
                    onChange={(e) => setReservedBaseAmount(e.target.value)}
                    placeholder="Örn: 2500.00 (VakıfBank ARI)"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Bu tutarın üzerindeki bakiye gecelik faizde değerlendirilir. Altında kalan tutar vadesiz kalır.
                  </p>
                </div>
              )}

              {type === 'vadeli' && (
                <div className="space-y-1">
                  <label htmlFor="account-maturity-input" className="text-xs font-semibold text-foreground cursor-pointer">
                    Vade Dönüş Tarihi
                  </label>
                  <Input
                    id="account-maturity-input"
                    type="date"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                  />
                </div>
              )}

              {/* Canlı Damla Önizlemesi */}
              {modalYieldPreview && modalYieldPreview.hasYield ? (
                <div className="mt-2 p-2.5 rounded-lg bg-card border border-blue-500/20 space-y-1 text-xs">
                  <div className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Droplets className="h-3.5 w-3.5" /> Canlı Damla Hesaplaması
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Faizde Çalışan Anapara</span>
                      <strong className="text-foreground">{formatCurrency(modalYieldPreview.activePrincipal)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Günlük Net Damla</span>
                      <strong className="text-blue-600 dark:text-blue-400">+{formatCurrency(modalYieldPreview.dailyNetYield)} / gün</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">30 Günlük Basit Net</span>
                      <strong className="text-foreground">+{formatCurrency(modalYieldPreview.monthlySimpleNetYield)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">30 Günlük Bileşik Net</span>
                      <strong className="text-emerald-600 dark:text-emerald-400">+{formatCurrency(modalYieldPreview.monthlyCompoundNetYield)}</strong>
                    </div>
                  </div>
                </div>
              ) : modalYieldPreview && parseFloat(interestRate.replace(',', '.')) > 0 && modalYieldPreview.activePrincipal <= 0 ? (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                  Bakiye ({formatCurrency(parseFloat(balance.replace(',', '.')) || 0)}), faiz dışı alt limitin ({formatCurrency(modalYieldPreview.reservedBaseAmount)}) altında veya eşit olduğu için faizde çalışan aktif anapara 0 ₺&apos;dir.
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ortak Onay Dialog'u */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetAccount)}
        onClose={() => setDeleteTargetAccount(null)}
        onConfirm={confirmDeleteAccount}
        title="Hesabı Sil"
        description={
          <>
            <strong>{deleteTargetAccount?.name}</strong> hesabını ve ilişkili bakiye kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
          </>
        }
        confirmLabel="Hesabı Sil"
        isLoading={isDeleting}
      />
    </div>
  )
}
