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
  ShieldAlert,
  CreditCard as CardIcon,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseStatementFile } from '@/lib/parser'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateStatementChange } from '@/lib/finance-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ExtractedTransaction, ParseResult } from '@/lib/parser/types'
import type { Project, MerchantMapping, CreditCard } from '@/types/database'

export default function ImportPage() {
  const router = useRouter()
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [transactions, setTransactions] = useState<ExtractedTransaction[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [userMappings, setUserMappings] = useState<MerchantMapping[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadMetadata()
  }, [])

  async function loadMetadata() {
    const supabase = createClient()
    const [{ data: prjs }, { data: crds }, { data: maps }] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('credit_cards').select('*'),
      supabase.from('merchant_mappings').select('*'),
    ])
    if (prjs) setProjects(prjs)
    if (crds) setCards(crds)
    if (maps) setUserMappings(maps)
  }

  const handleFile = async (uploadedFile: File) => {
    setFile(uploadedFile)
    setParsing(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await parseStatementFile(uploadedFile, userMappings)
      if (result.success && result.transactions.length > 0) {
        setParseResult(result)
        setTransactions(result.transactions)

        // Try auto-selecting card if exists
        if (result.detected_bank && cards.length > 0) {
          const matchedCard = cards.find(
            (c) =>
              c.bank.toLowerCase().includes(result.detected_bank?.toLowerCase() || '') ||
              (result.detected_bank?.toLowerCase() || '').includes(c.bank.toLowerCase())
          )
          if (matchedCard) {
            setSelectedCardId(matchedCard.id)
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

  const handleToggleSelectAll = (select: boolean) => {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected: select })))
  }

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
      const detectedBankName = parseResult?.detected_bank || 'Kredi Kartı'
      const detectedCardTitle = parseResult?.detected_card || 'Kredi Kartı'

      // =========================================================================
      // 1. OTOMATİK KREDİ KARTI ÇÖZÜMLEME VEYA OLUŞTURMA (Zero-Silos Bridge)
      // =========================================================================
      let resolvedCardId = selectedCardId

      const statementDebtValue = parseResult?.statement_debt || totalSelectedAmount
      const minPaymentValue = parseResult?.minimum_payment || Math.round(statementDebtValue * 0.2)
      const interestFeesValue = parseResult?.interest_fees || 0

      if (!resolvedCardId) {
        // Search if user has a card with this bank
        const existingCard = cards.find(
          (c) =>
            c.bank.toLowerCase().includes(detectedBankName.toLowerCase()) ||
            detectedBankName.toLowerCase().includes(c.bank.toLowerCase())
        )

        if (existingCard) {
          resolvedCardId = existingCard.id
          // Update existing card with new statement debt & dates
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
        } else {
          // Auto-create brand new credit card!
          const { data: newCard, error: cardError } = await supabase
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

          if (!cardError && newCard) {
            resolvedCardId = newCard.id
          }
        }
      } else {
        // Update user-selected card
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

      // =========================================================================
      // 2. OTOMATİK EKSTRE GEÇMİŞİ KAYDI (card_statements + Trend Analizi)
      // =========================================================================
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

      // =========================================================================
      // 3. İTHALAT (statement_imports) KAYDI
      // =========================================================================
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

      // =========================================================================
      // 4. İŞLEM HAREKETLERİNİ YAZMA (transactions)
      // =========================================================================
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

      const { error: txError } = await supabase.from('transactions').insert(rowsToInsert)
      if (txError) throw txError

      // =========================================================================
      // 5. OTOMATİK ABONELİK KEŞFİ VE EKLEME (subscriptions)
      // =========================================================================
      // If transactions contain recurring SaaS or tools, check and auto-add to subscriptions
      const { data: existingSubs } = await supabase.from('subscriptions').select('service')
      const existingServiceNames = new Set(existingSubs?.map((s) => s.service.toLowerCase()) || [])

      for (const t of selectedTxs) {
        if (
          (t.recurrence === 'Düzenli' || t.analysis_group === 'İş') &&
          t.type === 'Harcama' &&
          !existingServiceNames.has(t.merchant.toLowerCase())
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
          existingServiceNames.add(t.merchant.toLowerCase())
        }
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Ekstre Ayrıştırma & Yükleme
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enpara, Akbank, Ziraat veya Garanti ekstre PDF veya CSV dosyanızı yükleyin; hareketler, kredi kartı borçları ve abonelikler tek tıkla otomatik güncellensin.
        </p>
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
            {selectedCount} hareket, Kredi Kartı Borçları ve Abonelikler başarıyla Supabase'e aktarıldı! Dashboard'a yönlendiriliyorsunuz...
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-inner">
              <UploadCloud className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground">
              Ekstre dosyanızı buraya sürükleyin
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              PDF, CSV veya Excel (.xlsx) formatındaki banka dökümlerinizi tarayıcınızda güvenle işleyin.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <label
                htmlFor="file-upload"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
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

      {/* Parsing Review Screen */}
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
                    <Badge variant="success" className="text-xs">
                      {parseResult.detected_bank || 'Banka Tespit Edildi'}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <span>Ekstre Tarihi: <strong>{formatDate(parseResult.statement_date)}</strong></span>
                    <span>•</span>
                    <span>Son Ödeme: <strong>{formatDate(parseResult.due_date)}</strong></span>
                    {parseResult.statement_debt && (
                      <>
                        <span>•</span>
                        <span>Dönem Borcu: <strong className="text-foreground">{formatCurrency(parseResult.statement_debt)}</strong></span>
                      </>
                    )}
                  </CardDescription>
                </div>

                {/* Card Linking Selector */}
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
              </div>
            </CardHeader>
            <CardContent className="border-t border-border pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 text-xs">
                <span>
                  Seçili <strong>{selectedCount}</strong> / {transactions.length} hareket
                </span>
                <span>•</span>
                <span>
                  Toplam Tutar: <strong className="text-foreground font-mono">{formatCurrency(selectedSum)}</strong>
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
                  {saving ? 'Tüm Sisteme Aktarılıyor...' : `Onayla ve Tüm Sisteme Aktar`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interactive Review Table */}
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
                İşyerini, analiz grubunu ve bağlı projeyi düzenleyebilirsiniz.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-3 w-8"></th>
                    <th className="p-3">Tarih</th>
                    <th className="p-3">Ham Açıklama</th>
                    <th className="p-3">Normalize İşyeri</th>
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
                      <td className="p-3 text-right font-bold text-foreground whitespace-nowrap">
                        {formatCurrency(tx.amount)}
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
