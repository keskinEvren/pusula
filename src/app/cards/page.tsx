'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CreditCard,
  Plus,
  TrendingDown,
  TrendingUp,
  Calendar,
  AlertCircle,
  FileText,
  DollarSign,
  Trash2,
  Edit2,
  UploadCloud,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatLocalDateInput, cn } from '@/lib/utils'
import { calculateStatementChange } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/page-header'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/lib/toast-context'
import type { CreditCard as CardType, CardStatement } from '@/types/database'

export default function CardsPage() {
  const { toast } = useToast()
  const [cards, setCards] = useState<CardType[]>([])
  const [statements, setStatements] = useState<CardStatement[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isCardModalOpen, setIsCardModalOpen] = useState(false)
  const [isEditCardModalOpen, setIsEditCardModalOpen] = useState(false)
  const [isStmtModalOpen, setIsStmtModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingCard, setEditingCard] = useState<CardType | null>(null)
  const [deleteTargetCard, setDeleteTargetCard] = useState<CardType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form states
  const [editCardForm, setEditCardForm] = useState({
    bank: '',
    card_name: '',
    last_four: '',
    current_debt: '',
    statement_debt: '',
    minimum_payment: '',
    interest_fees: '',
    statement_date: '',
    due_date: '',
    status_note: '',
  })

  // Form states
  const [cardForm, setCardForm] = useState({
    bank: '',
    card_name: '',
    last_four: '',
    current_debt: '',
    statement_debt: '',
    minimum_payment: '',
    interest_fees: '',
    statement_date: '',
    due_date: '',
    status_note: '',
  })

  const [stmtForm, setStmtForm] = useState({
    card_id: '',
    statement_date: formatLocalDateInput(),
    period_debt: '',
    minimum: '',
    payments: '',
    spending: '',
    cash_advance: '',
    interest_fees: '',
    due_date: '',
  })

  useEffect(() => {
    loadCardsAndStatements()
  }, [])

  async function loadCardsAndStatements() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: cData }, { data: sData }] = await Promise.all([
        supabase.from('credit_cards').select('*').order('created_at', { ascending: false }),
        supabase.from('card_statements').select('*').order('statement_date', { ascending: false }).limit(500),
      ])
      if (cData) setCards(cData)
      if (sData) setStatements(sData)
    } catch (err) {
      console.error('Error loading cards:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('credit_cards')
        .insert({
          user_id: user.id,
          bank: cardForm.bank,
          card_name: cardForm.card_name,
          last_four: cardForm.last_four || null,
          current_debt: parseFloat(cardForm.current_debt || '0'),
          statement_debt: parseFloat(cardForm.statement_debt || '0'),
          minimum_payment: parseFloat(cardForm.minimum_payment || '0'),
          interest_fees: parseFloat(cardForm.interest_fees || '0'),
          statement_date: cardForm.statement_date || null,
          due_date: cardForm.due_date || null,
          status_note: cardForm.status_note || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setCards([data, ...cards])
        setIsCardModalOpen(false)
        toast.success('Kredi kartı başarıyla eklendi!')
        setCardForm({
          bank: '',
          card_name: '',
          last_four: '',
          current_debt: '',
          statement_debt: '',
          minimum_payment: '',
          interest_fees: '',
          statement_date: '',
          due_date: '',
          status_note: '',
        })
      }
    } catch (err: any) {
      toast.error(err.message || 'Kart eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenEditModal = (card: CardType) => {
    setEditingCard(card)
    setEditCardForm({
      bank: card.bank,
      card_name: card.card_name,
      last_four: card.last_four || '',
      current_debt: card.current_debt !== undefined && card.current_debt !== null ? card.current_debt.toString() : '',
      statement_debt: card.statement_debt !== undefined && card.statement_debt !== null ? card.statement_debt.toString() : '',
      minimum_payment: card.minimum_payment !== undefined && card.minimum_payment !== null ? card.minimum_payment.toString() : '',
      interest_fees: card.interest_fees !== undefined && card.interest_fees !== null ? card.interest_fees.toString() : '',
      statement_date: card.statement_date || '',
      due_date: card.due_date || '',
      status_note: card.status_note || '',
    })
    setIsEditCardModalOpen(true)
  }

  const handleEditCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCard) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_cards')
        .update({
          bank: editCardForm.bank,
          card_name: editCardForm.card_name,
          last_four: editCardForm.last_four || null,
          current_debt: parseFloat(editCardForm.current_debt || '0'),
          statement_debt: parseFloat(editCardForm.statement_debt || '0'),
          minimum_payment: parseFloat(editCardForm.minimum_payment || '0'),
          interest_fees: parseFloat(editCardForm.interest_fees || '0'),
          statement_date: editCardForm.statement_date || null,
          due_date: editCardForm.due_date || null,
          status_note: editCardForm.status_note || null,
        })
        .eq('id', editingCard.id)
        .select()
        .single()

      if (error) throw error
      if (data) {
        setCards(cards.map((c) => (c.id === data.id ? data : c)))
        setIsEditCardModalOpen(false)
        setEditingCard(null)
        toast.success('Kart bilgileri güncellendi!')
      }
    } catch (err: any) {
      toast.error(err.message || 'Kart güncellenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddStatement = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const currentPeriodDebt = parseFloat(stmtForm.period_debt || '0')

      // Calculate statement change via Pure Finance Engine
      const prevStmt = statements.find((s) => s.card_id === stmtForm.card_id)
      const prevDebt = prevStmt ? Number(prevStmt.period_debt) : null
      const { changeAmount, changePct } = calculateStatementChange(currentPeriodDebt, prevDebt)

      const { data, error } = await supabase
        .from('card_statements')
        .insert({
          card_id: stmtForm.card_id,
          statement_date: stmtForm.statement_date,
          period_debt: currentPeriodDebt,
          minimum: parseFloat(stmtForm.minimum || '0'),
          payments: parseFloat(stmtForm.payments || '0'),
          spending: parseFloat(stmtForm.spending || '0'),
          cash_advance: parseFloat(stmtForm.cash_advance || '0'),
          interest_fees: parseFloat(stmtForm.interest_fees || '0'),
          due_date: stmtForm.due_date || null,
          prev_debt: prevDebt,
          change_amount: changeAmount,
          change_pct: changePct ? changePct / 100 : null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        // Also update card's current and statement debt
        await supabase
          .from('credit_cards')
          .update({
            statement_debt: currentPeriodDebt,
            current_debt: currentPeriodDebt,
            minimum_payment: parseFloat(stmtForm.minimum || '0'),
            statement_date: stmtForm.statement_date,
            due_date: stmtForm.due_date || null,
          })
          .eq('id', stmtForm.card_id)

        setStatements([data, ...statements])
        setIsStmtModalOpen(false)
        toast.success('Yeni ekstre başarıyla kaydedildi!')
        loadCardsAndStatements()
      }
    } catch (err: any) {
      toast.error(err.message || 'Ekstre kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDeleteCard = async () => {
    if (!deleteTargetCard) return
    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('credit_cards').delete().eq('id', deleteTargetCard.id)
      if (error) throw error
      setCards(cards.filter((c) => c.id !== deleteTargetCard.id))
      toast.success('Kredi kartı ve geçmişi silindi.')
      setDeleteTargetCard(null)
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-16 rounded-xl bg-card/60 border border-border/40" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-card/60 border border-border/40" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-card/60 border border-border/40" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Kredi Kartları & Ekstre Trendi"
        description="Dönemden döneme borç değişimi, asgari ödemeler ve faiz yükleri"
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link href="/import?mode=credit_card" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-auto gap-2">
                <UploadCloud className="h-4 w-4" />
                <span>Ekstre İçe Aktar</span>
              </Button>
            </Link>
            <Button onClick={() => setIsStmtModalOpen(true)} variant="outline" className="w-full sm:w-auto gap-2">
              <Calendar className="h-4 w-4" />
              Ekstre Kaydı Gir
            </Button>
            <Button onClick={() => setIsCardModalOpen(true)} className="w-full sm:w-auto gap-2 shadow-md">
              <Plus className="h-4 w-4" />
              Yeni Kart Ekle
            </Button>
          </div>
        }
      />

      {/* Cards List */}
      <div>
        {cards.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-border/60 bg-card">
            <CreditCard className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Henüz kayıtlı kredi kartı yok</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Kartlarınızı ekleyerek ekstre kesimlerini ve borç trendlerini takip edin.</p>
            <Button onClick={() => setIsCardModalOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Yeni Kart Ekle
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.id} className="border-border bg-card shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base font-bold">{card.bank}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditModal(card)}
                        className="h-9 w-9 text-muted-foreground hover:text-primary rounded-full"
                        title="Kartı ve Güncel Borcu Düzenle"
                        aria-label={`${card.bank} kartını düzenle`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTargetCard(card)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive rounded-full"
                        title="Kartı Sil"
                        aria-label={`${card.bank} kartını sil`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs font-mono">
                    {card.card_name} {card.last_four && `(•• ${card.last_four})`}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">Güncel Borç</div>
                      <div className="text-2xl font-bold font-mono text-foreground mt-0.5">
                        {formatCurrency(card.current_debt)}
                      </div>
                    </div>
                    {card.statement_debt && (
                      <div className="text-right">
                        <div className="text-[11px] text-muted-foreground">Son Ekstre</div>
                        <div className="text-xs font-mono font-medium text-foreground/80 mt-0.5">
                          {formatCurrency(card.statement_debt)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 border-t border-border/50 pt-3 text-xs">
                    {card.minimum_payment && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Asgari Tutar:</span>
                        <span className="font-mono text-foreground">{formatCurrency(card.minimum_payment)}</span>
                      </div>
                    )}
                    {card.statement_date && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Ekstre Kesim:</span>
                        <span className="font-mono text-foreground">{formatDate(card.statement_date)}</span>
                      </div>
                    )}
                    {card.due_date && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Son Ödeme:</span>
                        <span className="font-mono text-foreground font-semibold">{formatDate(card.due_date)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Ekstre Geçmişi Tablosu */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-base font-semibold">Tüm Kredi Kartları Dönem Ekstreleri</CardTitle>
          <CardDescription className="text-xs">
            Dönem borçlarının seyri, harcama ve ödeme toplamları
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobil Görünüm (<md) */}
          <div className="p-4 md:hidden space-y-3">
            {statements.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Henüz ekstre geçmişi kaydı bulunmuyor.
              </div>
            ) : (
              statements.map((stmt) => {
                const card = cards.find((c) => c.id === stmt.card_id)
                const changeAmt = stmt.change_amount
                const changePct = stmt.change_pct !== null && stmt.change_pct !== undefined ? stmt.change_pct * 100 : null
                const isIncreased = changeAmt !== null && changeAmt > 0
                const isDecreased = changeAmt !== null && changeAmt < 0

                return (
                  <div key={stmt.id} className="p-3.5 rounded-xl border border-border/60 bg-muted/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {card ? `${card.bank} - ${card.card_name}` : 'Kredi Kartı'}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatDate(stmt.statement_date)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between border-t border-border/40 pt-2">
                      <span className="text-xs text-muted-foreground">Dönem Borcu:</span>
                      <span className="text-sm font-bold font-mono text-foreground">
                        {formatCurrency(stmt.period_debt)}
                      </span>
                    </div>
                    {changeAmt !== null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Değişim:</span>
                        <div
                          className={`inline-flex items-center gap-1 font-semibold font-mono ${
                            isIncreased
                              ? 'text-destructive'
                              : isDecreased
                              ? 'text-success'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {isIncreased && <TrendingUp className="h-3.5 w-3.5" />}
                          {isDecreased && <TrendingDown className="h-3.5 w-3.5" />}
                          <span>
                            {isIncreased ? '+' : ''}
                            {formatCurrency(changeAmt)}
                            {changePct !== null && ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
                      <div>
                        Ödemeler: <span className="font-mono text-success font-medium">{formatCurrency(stmt.payments)}</span>
                      </div>
                      <div className="text-right">
                        Son Ödeme: <span className="font-mono text-foreground">{formatDate(stmt.due_date)}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Masaüstü Görünüm (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Ekstre Tarihi</th>
                  <th className="p-3">Kart</th>
                  <th className="p-3 text-right">Dönem Borcu</th>
                  <th className="p-3 text-right">Önceki Borç</th>
                  <th className="p-3 text-center">Değişim</th>
                  <th className="p-3 text-right">Ödemeler</th>
                  <th className="p-3 text-right">Dönem İçi Harcama</th>
                  <th className="p-3 text-right">Faiz & Ücretler</th>
                  <th className="p-3">Son Ödeme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {statements.map((stmt) => {
                  const card = cards.find((c) => c.id === stmt.card_id)
                  const changeAmt = stmt.change_amount
                  const changePct = stmt.change_pct !== null && stmt.change_pct !== undefined ? stmt.change_pct * 100 : null
                  const isIncreased = changeAmt !== null && changeAmt > 0
                  const isDecreased = changeAmt !== null && changeAmt < 0

                  return (
                    <tr key={stmt.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-muted-foreground whitespace-nowrap font-sans">
                        {formatDate(stmt.statement_date)}
                      </td>
                      <td className="p-3 font-sans font-semibold text-foreground whitespace-nowrap">
                        {card ? `${card.bank} - ${card.card_name}` : 'Kredi Kartı'}
                      </td>
                      <td className="p-3 text-right font-bold text-foreground whitespace-nowrap">
                        {formatCurrency(stmt.period_debt)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap">
                        {stmt.prev_debt ? formatCurrency(stmt.prev_debt) : '-'}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {changeAmt !== null ? (
                          <div
                            className={`inline-flex items-center gap-1 font-semibold ${
                              isIncreased
                                ? 'text-destructive'
                                : isDecreased
                                ? 'text-success'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {isIncreased && <TrendingUp className="h-3.5 w-3.5" />}
                            {isDecreased && <TrendingDown className="h-3.5 w-3.5" />}
                            <span>
                              {isIncreased ? '+' : ''}
                              {formatCurrency(changeAmt)}
                              {changePct !== null && ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-success whitespace-nowrap">
                        {formatCurrency(stmt.payments)}
                      </td>
                      <td className="p-3 text-right text-foreground whitespace-nowrap">
                        {formatCurrency(stmt.spending)}
                      </td>
                      <td className="p-3 text-right text-destructive whitespace-nowrap">
                        {formatCurrency(stmt.interest_fees)}
                      </td>
                      <td className="p-3 font-sans text-muted-foreground whitespace-nowrap">
                        {formatDate(stmt.due_date)}
                      </td>
                    </tr>
                  )
                })}

                {statements.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-xs text-muted-foreground font-sans">
                      Henüz ekstre geçmişi kaydı bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Card Modal */}
      <Modal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        title="Yeni Kredi Kartı Ekle"
        description="Limitlerini ve ekstre tarihlerini takip edeceğiniz kredi kartınızı ekleyin."
      >
        <form onSubmit={handleAddCard} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="card-bank" className="text-xs font-semibold text-muted-foreground">Banka</label>
              <Input
                id="card-bank"
                required
                placeholder="Örn: Akbank, Enpara, Ziraat"
                value={cardForm.bank}
                onChange={(e) => setCardForm({ ...cardForm, bank: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="card-name" className="text-xs font-semibold text-muted-foreground">Kart Adı / Tipi</label>
              <Input
                id="card-name"
                required
                placeholder="Örn: Axess Platinum, Bankkart"
                value={cardForm.card_name}
                onChange={(e) => setCardForm({ ...cardForm, card_name: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-28 space-y-1 shrink-0">
              <label htmlFor="card-last-four" className="text-xs font-semibold text-muted-foreground">Son 4 Hane</label>
              <Input
                id="card-last-four"
                placeholder="1697"
                maxLength={4}
                value={cardForm.last_four}
                onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value })}
                className="text-xs font-mono text-center tracking-widest"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="card-current-debt" className="text-xs font-semibold text-muted-foreground">Güncel Toplam Borç</label>
              <Input
                id="card-current-debt"
                type="number"
                step="0.01"
                placeholder="0.00"
                prefix="₺"
                value={cardForm.current_debt}
                onChange={(e) => setCardForm({ ...cardForm, current_debt: e.target.value })}
                className="text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="card-statement-date" className="text-xs font-semibold text-muted-foreground">Son Ekstre Kesim Tarihi</label>
              <Input
                id="card-statement-date"
                type="date"
                value={cardForm.statement_date}
                onChange={(e) => setCardForm({ ...cardForm, statement_date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="card-due-date" className="text-xs font-semibold text-muted-foreground">Son Ödeme Tarihi</label>
              <Input
                id="card-due-date"
                type="date"
                value={cardForm.due_date}
                onChange={(e) => setCardForm({ ...cardForm, due_date: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCardModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Kartı Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Statement Modal */}
      <Modal
        isOpen={isStmtModalOpen}
        onClose={() => setIsStmtModalOpen(false)}
        title="Dönem Ekstresi Kaydı Ekle"
        description="Kartınızın son kesilen dönem borcunu ve detaylarını kaydedin."
      >
        <form onSubmit={handleAddStatement} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="stmt-card-id" className="text-xs font-semibold text-muted-foreground">Kredi Kartı</label>
            <Select
              id="stmt-card-id"
              required
              value={stmtForm.card_id}
              onChange={(e) => setStmtForm({ ...stmtForm, card_id: e.target.value })}
              className="text-xs"
            >
              <option value="">(Kart Seçin)</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.bank} - {c.card_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="stmt-statement-date" className="text-xs font-semibold text-muted-foreground">Ekstre Tarihi</label>
              <Input
                id="stmt-statement-date"
                type="date"
                required
                value={stmtForm.statement_date}
                onChange={(e) => setStmtForm({ ...stmtForm, statement_date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="stmt-period-debt" className="text-xs font-semibold text-muted-foreground">Dönem Borcu</label>
              <Input
                id="stmt-period-debt"
                type="number"
                step="0.01"
                required
                prefix="₺"
                placeholder="26969.24"
                value={stmtForm.period_debt}
                onChange={(e) => setStmtForm({ ...stmtForm, period_debt: e.target.value })}
                className="text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="stmt-minimum" className="text-xs font-semibold text-muted-foreground">Asgari Ödeme</label>
              <Input
                id="stmt-minimum"
                type="number"
                step="0.01"
                prefix="₺"
                placeholder="0.00"
                value={stmtForm.minimum}
                onChange={(e) => setStmtForm({ ...stmtForm, minimum: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="stmt-interest-fees" className="text-xs font-semibold text-muted-foreground">Faiz / Masraf Yükü</label>
              <Input
                id="stmt-interest-fees"
                type="number"
                step="0.01"
                prefix="₺"
                placeholder="0.00"
                value={stmtForm.interest_fees}
                onChange={(e) => setStmtForm({ ...stmtForm, interest_fees: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="stmt-due-date" className="text-xs font-semibold text-muted-foreground">Son Ödeme Tarihi</label>
            <Input
              id="stmt-due-date"
              type="date"
              value={stmtForm.due_date}
              onChange={(e) => setStmtForm({ ...stmtForm, due_date: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsStmtModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Ekstre Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Card Modal */}
      <Modal
        isOpen={isEditCardModalOpen}
        onClose={() => {
          setIsEditCardModalOpen(false)
          setEditingCard(null)
        }}
        title="Kredi Kartı ve Borç Bilgilerini Düzenle"
        description="Kartınızın güncel toplam borcunu, son dönem borcunu ve ekstre tarihlerini güncelleyin."
      >
        <form onSubmit={handleEditCard} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="edit-card-bank" className="text-xs font-semibold text-muted-foreground">Banka</label>
              <Input
                id="edit-card-bank"
                required
                value={editCardForm.bank}
                onChange={(e) => setEditCardForm({ ...editCardForm, bank: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-card-name" className="text-xs font-semibold text-muted-foreground">Kart Adı</label>
              <Input
                id="edit-card-name"
                required
                value={editCardForm.card_name}
                onChange={(e) => setEditCardForm({ ...editCardForm, card_name: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-28 space-y-1 shrink-0">
              <label htmlFor="edit-card-last-four" className="text-xs font-semibold text-muted-foreground">Son 4 Hane</label>
              <Input
                id="edit-card-last-four"
                maxLength={4}
                value={editCardForm.last_four}
                onChange={(e) => setEditCardForm({ ...editCardForm, last_four: e.target.value })}
                className="text-xs font-mono text-center tracking-widest"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor="edit-card-current-debt" className="text-xs font-semibold text-primary">Güncel Toplam Borç</label>
              <Input
                id="edit-card-current-debt"
                type="number"
                step="0.01"
                required
                prefix="₺"
                value={editCardForm.current_debt}
                onChange={(e) => setEditCardForm({ ...editCardForm, current_debt: e.target.value })}
                className="text-xs font-mono font-bold border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="edit-card-statement-debt" className="text-xs font-semibold text-muted-foreground">Son Dönem Borcu</label>
              <Input
                id="edit-card-statement-debt"
                type="number"
                step="0.01"
                prefix="₺"
                value={editCardForm.statement_debt}
                onChange={(e) => setEditCardForm({ ...editCardForm, statement_debt: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-card-min-payment" className="text-xs font-semibold text-muted-foreground">Asgari Ödeme</label>
              <Input
                id="edit-card-min-payment"
                type="number"
                step="0.01"
                prefix="₺"
                value={editCardForm.minimum_payment}
                onChange={(e) => setEditCardForm({ ...editCardForm, minimum_payment: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="edit-card-statement-date" className="text-xs font-semibold text-muted-foreground">Ekstre Tarihi</label>
              <Input
                id="edit-card-statement-date"
                type="date"
                value={editCardForm.statement_date}
                onChange={(e) => setEditCardForm({ ...editCardForm, statement_date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-card-due-date" className="text-xs font-semibold text-muted-foreground">Son Ödeme Tarihi</label>
              <Input
                id="edit-card-due-date"
                type="date"
                value={editCardForm.due_date}
                onChange={(e) => setEditCardForm({ ...editCardForm, due_date: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditCardModalOpen(false)
                setEditingCard(null)
              }}
            >
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Card Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetCard)}
        onClose={() => setDeleteTargetCard(null)}
        onConfirm={confirmDeleteCard}
        title="Kredi Kartını Sil"
        description={`"${deleteTargetCard?.bank} - ${deleteTargetCard?.card_name}" kartını silmek istediğinize emin misiniz? Bu işlem karta ait tüm dönem ekstresi kayıtlarını da silecektir.`}
        confirmLabel="Kartı Sil"
        cancelLabel="Vazgeç"
        isLoading={isDeleting}
        variant="destructive"
      />
    </div>
  )
}
