'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
  Trash2,
  ArrowRight,
  CreditCard as CardIcon,
  Building2,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  HandCoins,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseStatementFile, parseBankAccountFile } from '@/lib/parser'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateStatementChange } from '@/lib/finance-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ExtractedTransaction, ParseResult, ReconciliationActionType } from '@/lib/parser/types'
import type { Project, MerchantMapping, CreditCard, Debt, Account } from '@/types/database'

export default function ImportPage() {
  const router = useRouter()

  // Mode: credit_card vs bank_account
  const [activeMode, setActiveMode] = useState<'credit_card' | 'bank_account'>('credit_card')

  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [transactions, setTransactions] = useState<ExtractedTransaction[]>([])

  // Metadata
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [userMappings, setUserMappings] = useState<MerchantMapping[]>([])

  // Selections
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadMetadata()
  }, [])

  async function loadMetadata() {
    const supabase = createClient()
    const [{ data: prjs }, { data: crds }, { data: dbts }, { data: accs }, { data: maps }] =
      await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('debts').select('*'),
        supabase.from('accounts').select('*'),
        supabase.from('merchant_mappings').select('*'),
      ])

    if (prjs) setProjects(prjs)
    if (crds) setCards(crds)
    if (dbts) setDebts(dbts)
    if (accs) {
      setAccounts(accs)
      if (accs.length > 0) setSelectedAccountId(accs[0].id)
    }
    if (maps) setUserMappings(maps)
  }

  const handleFile = async (uploadedFile: File) => {
    setFile(uploadedFile)
    setParsing(true)
    setError(null)
    setSuccess(false)

    try {
      let result: ParseResult
      if (activeMode === 'credit_card') {
        result = await parseStatementFile(uploadedFile, userMappings)
      } else {
        result = await parseBankAccountFile(uploadedFile, debts, cards, userMappings)
      }

      if (result.success && result.transactions.length > 0) {
        setParseResult(result)
        setTransactions(result.transactions)

        // Try auto-selecting card for credit card mode
        if (result.detected_bank && cards.length > 0 && activeMode === 'credit_card') {
          const matchedCard = cards.find(
            (c) =>
              c.bank.toLowerCase().includes(result.detected_bank?.toLowerCase() || '') ||
              (result.detected_bank?.toLowerCase() || '').includes(c.bank.toLowerCase())
          )
          if (matchedCard) {
            setSelectedCardId(matchedCard.id)
          }
        }

        // Try auto-selecting account for bank account mode
        if (result.detected_bank && accounts.length > 0 && activeMode === 'bank_account') {
          const matchedAcc = accounts.find(
            (a) =>
              a.name.toLowerCase().includes(result.detected_bank?.toLowerCase() || '') ||
              (result.detected_bank?.toLowerCase() || '').includes(a.name.toLowerCase())
          )
          if (matchedAcc) {
            setSelectedAccountId(matchedAcc.id)
          }
        }
      } else {
        setError(result.error || 'Dosya ayrıştırılamadı. Lütfen içeriği kontrol edin.')
      }
    } catch (err: any) {
      setError(err.message || 'Dosya okunurken bir hata oluştu.')
    } finally {
      setParsing(false)
    }
  }

  const handleRowChange = (
    id: string,
    field: keyof ExtractedTransaction,
    value: any
  ) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    )
  }

  const handleActionChange = (id: string, newAction: ReconciliationActionType) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        let newType = t.type
        let newGroup = t.analysis_group

        if (newAction === 'CARD_PAYMENT') {
          newType = 'Kart Ödemesi'
          newGroup = 'Hariç'
        } else if (newAction === 'COLLECT_RECEIVABLE') {
          newType = 'Tahsilat'
          newGroup = 'Gelir'
        } else if (newAction === 'PAY_DEBT') {
          newType = 'Borç Ödemesi'
          newGroup = 'Hariç'
        } else if (newAction === 'DIRECT_EXPENSE') {
          newType = 'Harcama'
          newGroup = 'Kişisel'
        } else if (newAction === 'FREE_INCOME') {
          newType = 'Gelir'
          newGroup = 'Gelir'
        } else if (newAction === 'INTERNAL_TRANSFER') {
          newType = 'Transfer'
          newGroup = 'Hariç'
        }

        return {
          ...t,
          action: newAction,
          type: newType,
          analysis_group: newGroup,
        }
      })
    )
  }

  const handleToggleSelectAll = (select: boolean) => {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: select })))
  }

  // =========================================================================
  // TOPLU SUPABASE AKTARIMI & SİSTEM GENELİ MAHSUPLAŞMA
  // =========================================================================
  const handleSaveToSupabase = async () => {
    const selectedTxs = transactions.filter((t) => t.selected)
    if (selectedTxs.length === 0) {
      alert('Lütfen kaydedilecek en az bir hareket seçin.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Oturum açılmamış. Lütfen giriş yapın.')

      const totalSelectedAmount = selectedTxs.reduce((sum, t) => sum + t.amount, 0)
      const detectedBankName = parseResult?.detected_bank || 'Banka Dökümü'
      const detectedCardTitle = parseResult?.detected_card || 'Kredi Kartı'

      // =======================================================================
      // MOD A: KREDİ KARTI EKSTRESİ AKIŞI
      // =======================================================================
      if (activeMode === 'credit_card') {
        let resolvedCardId = selectedCardId
        const statementDebtValue = parseResult?.statement_debt || totalSelectedAmount
        const minPaymentValue = parseResult?.minimum_payment || Math.round(statementDebtValue * 0.2)
        const interestFeesValue = parseResult?.interest_fees || 0

        if (!resolvedCardId) {
          const existingCard = cards.find(
            (c) =>
              c.bank.toLowerCase().includes(detectedBankName.toLowerCase()) ||
              detectedBankName.toLowerCase().includes(c.bank.toLowerCase())
          )

          if (existingCard) {
            resolvedCardId = existingCard.id
            const isNewerStatement =
              !existingCard.statement_date ||
              (parseResult?.statement_date &&
                new Date(parseResult.statement_date) >= new Date(existingCard.statement_date))

            if (isNewerStatement) {
              await supabase
                .from('credit_cards')
                .update({
                  current_debt: statementDebtValue,
                  statement_debt: statementDebtValue,
                  minimum_payment: minPaymentValue,
                  interest_fees: interestFeesValue,
                  statement_date: parseResult?.statement_date || null,
                  due_date: parseResult?.due_date || null,
                })
                .eq('id', existingCard.id)
            }
          } else {
            const { data: newCard } = await supabase
              .from('credit_cards')
              .insert({
                user_id: user.id,
                bank: detectedBankName,
                card_name: detectedCardTitle,
                last_four: parseResult?.last_four || null,
                current_debt: statementDebtValue,
                statement_debt: statementDebtValue,
                minimum_payment: minPaymentValue,
                interest_fees: interestFeesValue,
                statement_date: parseResult?.statement_date || null,
                due_date: parseResult?.due_date || null,
              })
              .select()
              .single()

            if (newCard) resolvedCardId = newCard.id
          }
        } else {
          const matchedCard = cards.find((c) => c.id === resolvedCardId)
          const isNewerStatement =
            !matchedCard?.statement_date ||
            (parseResult?.statement_date &&
              new Date(parseResult.statement_date) >= new Date(matchedCard.statement_date))

          if (isNewerStatement) {
            await supabase
              .from('credit_cards')
              .update({
                current_debt: statementDebtValue,
                statement_debt: statementDebtValue,
                minimum_payment: minPaymentValue,
                interest_fees: interestFeesValue,
                statement_date: parseResult?.statement_date || null,
                due_date: parseResult?.due_date || null,
              })
              .eq('id', resolvedCardId)
          }
        }

        // Ekstre Geçmişi (card_statements)
        if (resolvedCardId && parseResult?.statement_date) {
          const prevDebt = parseResult?.prev_debt || null
          const { changeAmount, changePct } = calculateStatementChange(statementDebtValue, prevDebt)
          await supabase.from('card_statements').insert({
            card_id: resolvedCardId,
            statement_date: parseResult.statement_date,
            period_debt: statementDebtValue,
            minimum: minPaymentValue,
            spending: totalSelectedAmount,
            interest_fees: interestFeesValue,
            due_date: parseResult.due_date || null,
            prev_debt: prevDebt,
            change_amount: changeAmount,
            change_pct: changePct ? changePct / 100 : null,
          })
        }

        // İthalat Kaydı
        const { data: importRecord, error: importError } = await supabase
          .from('statement_imports')
          .insert({
            user_id: user.id,
            file_name: file?.name || 'ekstre.pdf',
            bank: detectedBankName,
            card_id: resolvedCardId || null,
            statement_date: parseResult?.statement_date || null,
            due_date: parseResult?.due_date || null,
            total_transactions: selectedTxs.length,
            total_amount: totalSelectedAmount,
          })
          .select()
          .single()

        if (importError) throw importError

        // Hareketleri Ekle
        const rowsToInsert = selectedTxs.map((t) => ({
          user_id: user.id,
          date: t.date,
          account_or_card: detectedCardTitle,
          type: t.type as any,
          description: t.raw_description,
          amount: t.amount,
          analysis_group: t.analysis_group as any,
          merchant: t.merchant,
          recurrence: t.recurrence || null,
          statement_date: parseResult?.statement_date || null,
          card_id: resolvedCardId || null,
          project_id: t.project_id || null,
          import_id: importRecord.id,
        }))

        await supabase.from('transactions').insert(rowsToInsert)

        // Otomatik Abonelik Keşfi
        const { data: existingSubs } = await supabase.from('subscriptions').select('service')
        const existingSet = new Set(existingSubs?.map((s) => s.service.toLowerCase()) || [])

        for (const t of selectedTxs) {
          if (
            (t.recurrence === 'Düzenli' || t.analysis_group === 'İş') &&
            t.type === 'Harcama' &&
            !existingSet.has(t.merchant.toLowerCase())
          ) {
            await supabase.from('subscriptions').insert({
              user_id: user.id,
              service: t.merchant,
              group_type: t.analysis_group === 'İş' ? 'İş' : 'Kişisel',
              model: 'Tekrarlayan',
              amount: t.amount,
              currency: 'TRY',
              period: 'Aylık',
              status: 'Aktif',
              decision: 'Devam',
              project_id: t.project_id || null,
              payment_method: detectedCardTitle,
            })
            existingSet.add(t.merchant.toLowerCase())
          }
        }
      }

      // =======================================================================
      // MOD B: VADESİZ HESAP DÖKÜMÜ & UZLAŞTIRMA AKIŞI
      // =======================================================================
      if (activeMode === 'bank_account') {
        let currentAccountId = selectedAccountId

        // If no account selected or exists, create default account
        if (!currentAccountId) {
          const { data: newAcc } = await supabase
            .from('accounts')
            .insert({
              user_id: user.id,
              name: detectedBankName || 'Garanti Vadesiz',
              type: 'vadesiz',
              balance: 0,
            })
            .select()
            .single()

          if (newAcc) currentAccountId = newAcc.id
        }

        const targetAccount = accounts.find((a) => a.id === currentAccountId)
        let runningAccountBalance = targetAccount ? Number(targetAccount.balance) : 0

        // İthalat Kaydı
        const { data: importRecord } = await supabase
          .from('statement_imports')
          .insert({
            user_id: user.id,
            file_name: file?.name || 'hesap_dokumu.pdf',
            bank: detectedBankName,
            total_transactions: selectedTxs.length,
            total_amount: totalSelectedAmount,
          })
          .select()
          .single()

        // Satır Satır Uzlaştırma & Mahsuplaşma İşleme
        for (const t of selectedTxs) {
          if (t.direction === 'inflow') {
            runningAccountBalance += t.amount
          } else {
            runningAccountBalance -= t.amount
          }

          // 1. Alacak Tahsilatı Aksiyonu
          if (t.action === 'COLLECT_RECEIVABLE' && t.target_debt_id) {
            const targetDebt = debts.find((d) => d.id === t.target_debt_id)
            if (targetDebt) {
              const newRem = Math.max(0, targetDebt.remaining - t.amount)
              await supabase
                .from('debts')
                .update({
                  past_payments: targetDebt.past_payments + t.amount,
                  remaining: newRem,
                  status: newRem <= 0 ? 'Kapatıldı' : 'Açık',
                })
                .eq('id', targetDebt.id)
            }
          }

          // 2. Kredi Kartı Borcu Kapatma Aksiyonu (Sadece ekstre tarihinden SONRA ise borç düşülür!)
          if (t.action === 'CARD_PAYMENT' && t.target_card_id) {
            const targetCard = cards.find((c) => c.id === t.target_card_id)
            if (targetCard) {
              const isPostStatement =
                !targetCard.statement_date ||
                new Date(t.date) > new Date(targetCard.statement_date)

              if (isPostStatement) {
                const newDebt = Math.max(0, targetCard.current_debt - t.amount)
                await supabase
                  .from('credit_cards')
                  .update({
                    current_debt: newDebt,
                  })
                  .eq('id', targetCard.id)
              }
            }
          }

          // 3. Şahıs Borcu Geri Ödeme Aksiyonu
          if (t.action === 'PAY_DEBT' && t.target_debt_id) {
            const targetDebt = debts.find((d) => d.id === t.target_debt_id)
            if (targetDebt) {
              const newRem = Math.max(0, targetDebt.remaining - t.amount)
              await supabase
                .from('debts')
                .update({
                  past_payments: targetDebt.past_payments + t.amount,
                  remaining: newRem,
                  status: newRem <= 0 ? 'Kapatıldı' : 'Açık',
                })
                .eq('id', targetDebt.id)
            }
          }
        }

        // Vadesiz Hesap Bakiyesini Güncelle (Resmi Kapanış Bakiyesi varsa onu esas al)
        const finalBalance =
          parseResult?.closing_balance !== undefined
            ? parseResult.closing_balance
            : runningAccountBalance

        if (currentAccountId) {
          await supabase
            .from('accounts')
            .update({ balance: finalBalance })
            .eq('id', currentAccountId)
        }

        // Hareketleri Transaction Defterine Kaydet
        const accountName = targetAccount ? targetAccount.name : detectedBankName
        const rowsToInsert = selectedTxs.map((t) => ({
          user_id: user.id,
          date: t.date,
          account_or_card: accountName,
          type: t.type as any,
          description: t.raw_description,
          amount: t.amount,
          analysis_group: t.analysis_group as any,
          merchant: t.merchant,
          account_id: currentAccountId || null,
          project_id: t.project_id || null,
          import_id: importRecord?.id || null,
        }))

        await supabase.from('transactions').insert(rowsToInsert)
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/')
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Veritabanına kaydedilirken hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = transactions.filter((t) => t.selected).length
  const selectedSum = transactions
    .filter((t) => t.selected)
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          İkili Ekstre & Uzlaştırma Merkezi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kredi kartı ekstreleri ile vadesiz banka dökümlerini sıfır mükerrerlikle tek ekranda işleyin.
        </p>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => {
            setActiveMode('credit_card')
            setParseResult(null)
            setTransactions([])
          }}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
            activeMode === 'credit_card'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CardIcon className="h-4 w-4" />
          <span>💳 Kredi Kartı Ekstresi</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode('bank_account')
            setParseResult(null)
            setTransactions([])
          }}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
            activeMode === 'bank_account'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>🏦 Vadesiz Banka Hesap Dökümü</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm font-medium flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-success text-sm font-medium flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span>
            {selectedCount} hareket ve bağlı finansal mahsuplaşmalar başarıyla işlendi! Dashboard'a yönlendiriliyorsunuz...
          </span>
        </div>
      )}

      {/* Upload Box */}
      {!parseResult && (
        <Card
          className={`border-2 border-dashed transition-all ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files?.[0]) {
              handleFile(e.dataTransfer.files[0])
            }
          }}
        >
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl mb-4 shadow-inner ${
                activeMode === 'credit_card'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-purple-500/10 text-purple-400'
              }`}
            >
              {activeMode === 'credit_card' ? (
                <CardIcon className="h-8 w-8" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>
            <h3 className="text-lg font-bold text-foreground">
              {activeMode === 'credit_card'
                ? 'Kredi Kartı Ekstrenizi Sürükleyin (PDF/CSV)'
                : 'Vadesiz Hesap Özetinizi Sürükleyin (PDF/CSV/XLSX)'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              {activeMode === 'credit_card'
                ? 'Harcamalar, taksitler, dönem borcu ve SaaS abonelikleri otomatik ayrıştırılır.'
                : 'Maaş tahsilatları, kredi kartı borç ödemeleri ve FAST transferleri nakit bakiyenizle otomatik uzlaştırılır.'}
            </p>

            <div className="mt-6 flex items-center gap-3">
              <label
                htmlFor="file-upload"
                className={`inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors shadow h-9 px-4 py-2 cursor-pointer ${
                  activeMode === 'credit_card'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {parsing ? 'Ayrıştırılıyor...' : 'Dosya Seçin'}
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.csv,.xlsx,.xls"
                className="sr-only"
                disabled={parsing}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFile(e.target.files[0])
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsing & Smart Reconciliation Review Screen */}
      {parseResult && (
        <div className="space-y-6">
          {/* Metadata & Actions Card */}
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{parseResult.file_name}</CardTitle>
                    <Badge
                      variant={activeMode === 'credit_card' ? 'success' : 'purple'}
                      className="text-xs"
                    >
                      {parseResult.detected_bank || (activeMode === 'credit_card' ? 'Kredi Kartı' : 'Vadesiz Hesap')}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {parseResult.statement_date && (
                      <span>Tarih: <strong>{formatDate(parseResult.statement_date)}</strong></span>
                    )}
                    {parseResult.statement_debt && (
                      <>
                        <span>•</span>
                        <span>Dönem Borcu: <strong className="text-foreground">{formatCurrency(parseResult.statement_debt)}</strong></span>
                      </>
                    )}
                  </CardDescription>
                </div>

                {/* Target Linker Selector */}
                {activeMode === 'credit_card' ? (
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CardIcon className="h-4 w-4" />
                      Kredi Kartı:
                    </div>
                    <Select
                      value={selectedCardId}
                      onChange={(e) => setSelectedCardId(e.target.value)}
                      className="w-52 text-xs"
                    >
                      <option value="">(Otomatik Oluştur / Eşleştir)</option>
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.bank} - {c.card_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Building2 className="h-4 w-4" />
                      Yansıtılacak Hesap:
                    </div>
                    <Select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-52 text-xs font-semibold"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatCurrency(a.balance)})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="border-t border-border pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 text-xs">
                <span>
                  Seçili <strong>{selectedCount}</strong> / {transactions.length} hareket
                </span>
                <span>•</span>
                <span>
                  Toplam İşlem Hacmi: <strong className="text-foreground font-mono">{formatCurrency(selectedSum)}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setParseResult(null)
                    setTransactions([])
                  }}
                  className="text-xs"
                >
                  Farklı Dosya Yükle
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveToSupabase}
                  disabled={saving || selectedCount === 0}
                  className="gap-2 text-xs shadow-md"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? 'Mahsuplaşılıyor...' : `Onayla ve Tüm Sisteme Yansıt`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Smart Review Table */}
          <Card className="border-border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleSelectAll(true)}
                  className="text-xs h-7"
                >
                  Tümünü Seç
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleSelectAll(false)}
                  className="text-xs h-7"
                >
                  Seçimi Kaldır
                </Button>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                {activeMode === 'credit_card'
                  ? 'Grup ve proje atamalarını satır bazında kontrol edebilirsiniz.'
                  : 'Gelen/giden transferlerin akıllı mahsuplaşma aksiyonunu buradan değiştirebilirsiniz.'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-3 w-8"></th>
                    <th className="p-3">Tarih</th>
                    <th className="p-3">Ham Açıklama</th>
                    <th className="p-3">Temiz İsim</th>
                    {activeMode === 'bank_account' && <th className="p-3">Akıllı Eşleşme (Aksiyon)</th>}
                    <th className="p-3">Grup</th>
                    <th className="p-3">Proje</th>
                    <th className="p-3 text-right">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        !tx.selected ? 'opacity-40 bg-muted/10' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={tx.selected}
                          onChange={(e) =>
                            handleRowChange(tx.id, 'selected', e.target.checked)
                          }
                          className="rounded border-border"
                        />
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="p-3 max-w-xs truncate text-muted-foreground font-sans" title={tx.raw_description}>
                        {tx.raw_description}
                      </td>
                      <td className="p-3 font-sans">
                        <Input
                          value={tx.merchant}
                          onChange={(e) =>
                            handleRowChange(tx.id, 'merchant', e.target.value)
                          }
                          className="h-7 text-xs font-medium"
                        />
                      </td>

                      {/* Bank Account Mode: Smart Action Selector */}
                      {activeMode === 'bank_account' && (
                        <td className="p-3">
                          <Select
                            value={tx.action || 'DIRECT_EXPENSE'}
                            onChange={(e) =>
                              handleActionChange(
                                tx.id,
                                e.target.value as ReconciliationActionType
                              )
                            }
                            className="h-7 text-xs font-semibold"
                          >
                            <option value="CARD_PAYMENT">💳 Kart Borcu Kapat (Hariç)</option>
                            <option value="COLLECT_RECEIVABLE">💰 Alacak Tahsil Et (Gelir)</option>
                            <option value="PAY_DEBT">🤝 Şahıs Borcu Kapat (Hariç)</option>
                            <option value="DIRECT_EXPENSE">🛒 Doğrudan Harcama</option>
                            <option value="FREE_INCOME">💵 Serbest Gelir</option>
                            <option value="INTERNAL_TRANSFER">🔄 Hesaplar Arası Transfer</option>
                          </Select>
                        </td>
                      )}

                      <td className="p-3">
                        <Select
                          value={tx.analysis_group}
                          onChange={(e) =>
                            handleRowChange(tx.id, 'analysis_group', e.target.value)
                          }
                          className="h-7 text-xs w-28"
                        >
                          <option value="Kişisel">Kişisel</option>
                          <option value="İş">İş</option>
                          <option value="Finansman">Finansman</option>
                          <option value="Hariç">Hariç</option>
                          <option value="Gelir">Gelir</option>
                        </Select>
                      </td>

                      <td className="p-3">
                        <Select
                          value={tx.project_id || ''}
                          onChange={(e) =>
                            handleRowChange(tx.id, 'project_id', e.target.value || undefined)
                          }
                          className="h-7 text-xs w-36 font-sans"
                        >
                          <option value="">(Yok)</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </td>

                      <td className="p-3 text-right font-bold whitespace-nowrap">
                        <span
                          className={
                            tx.direction === 'inflow' || tx.analysis_group === 'Gelir'
                              ? 'text-success'
                              : tx.analysis_group === 'Hariç'
                              ? 'text-muted-foreground'
                              : 'text-foreground'
                          }
                        >
                          {tx.direction === 'inflow' ? '+' : '-'} {formatCurrency(tx.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
