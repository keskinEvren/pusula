'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateStatementChange } from '@/lib/finance-engine'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import type { CreditCard as CardType, CardStatement } from '@/types/database'

export default function CardsPage() {
  const [cards, setCards] = useState<CardType[]>([])
  const [statements, setStatements] = useState<CardStatement[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isCardModalOpen, setIsCardModalOpen] = useState(false)
  const [isStmtModalOpen, setIsStmtModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
    statement_date: new Date().toISOString().split('T')[0],
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
        supabase.from('card_statements').select('*').order('statement_date', { ascending: false }),
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
      alert(err.message || 'Kart eklenemedi')
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
        loadCardsAndStatements()
      }
    } catch (err: any) {
      alert(err.message || 'Ekstre kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteCard = async (id: string) => {
    if (!confirm('Bu kartı ve tüm ekstre geçmişini silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('credit_cards').delete().eq('id', id)
      if (error) throw error
      setCards(cards.filter((c) => c.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Kredi Kartları & Ekstre Trendi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dönemden döneme borç değişimi, asgari ödemeler ve faiz yükleri
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsStmtModalOpen(true)} variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Ekstre Kaydı Gir
          </Button>
          <Button onClick={() => setIsCardModalOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-4 w-4" />
            Yeni Kart Ekle
          </Button>
        </div>
      </div>

      {/* Cards List */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.id} className="border-border bg-card shadow-sm flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-bold">{card.bank}</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteCard(card.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CardDescription className="text-xs font-mono">
                {card.card_name} {card.last_four && `(•• ${card.last_four})`}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground">Güncel Toplam Borç</div>
                <div className="text-2xl font-bold font-mono text-foreground">
                  {formatCurrency(card.current_debt)}
                </div>
              </div>

              <div className="space-y-1.5 pt-3 border-t border-border text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Son Dönem Borcu:</span>
                  <span className="font-mono font-semibold">{formatCurrency(card.statement_debt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asgari Ödeme:</span>
                  <span className="font-mono font-semibold text-amber-400">{formatCurrency(card.minimum_payment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faiz/Masraf Yükü:</span>
                  <span className="font-mono text-destructive">{formatCurrency(card.interest_fees)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">Son Ödeme Tarihi:</span>
                  <span className="font-semibold text-foreground">{formatDate(card.due_date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Statement History Table with Trend Delta */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Ekstre Geçmişi & Değişim Trendi</CardTitle>
          <CardDescription>
            Her dönemin borç değişimi ve trendi (▲ Kırmızı: Borç Artışı / ▼ Yeşil: Borç Azalışı)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Ekstre Tarihi</th>
                  <th className="p-3">Banka / Kart</th>
                  <th className="p-3 text-right">Dönem Borcu</th>
                  <th className="p-3 text-right">Önceki Borç</th>
                  <th className="p-3 text-center">Dönem Değişimi</th>
                  <th className="p-3 text-right">Ödemeler</th>
                  <th className="p-3 text-right">Harcama</th>
                  <th className="p-3 text-right">Faiz/BSMV</th>
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
              <label className="text-xs font-semibold text-muted-foreground">Banka</label>
              <Input
                required
                placeholder="Örn: Akbank, Enpara, Ziraat"
                value={cardForm.bank}
                onChange={(e) => setCardForm({ ...cardForm, bank: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Kart Adı / Tipi</label>
              <Input
                required
                placeholder="Örn: Axess Platinum, Bankkart"
                value={cardForm.card_name}
                onChange={(e) => setCardForm({ ...cardForm, card_name: e.target.value })}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Son 4 Hane</label>
              <Input
                placeholder="Örn: 1697"
                maxLength={4}
                value={cardForm.last_four}
                onChange={(e) => setCardForm({ ...cardForm, last_four: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Güncel Toplam Borç (TL)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cardForm.current_debt}
                onChange={(e) => setCardForm({ ...cardForm, current_debt: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Son Ekstre Kesim Tarihi</label>
              <Input
                type="date"
                value={cardForm.statement_date}
                onChange={(e) => setCardForm({ ...cardForm, statement_date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Son Ödeme Tarihi</label>
              <Input
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
            <label className="text-xs font-semibold text-muted-foreground">Kredi Kartı</label>
            <Select
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
              <label className="text-xs font-semibold text-muted-foreground">Ekstre Tarihi</label>
              <Input
                type="date"
                required
                value={stmtForm.statement_date}
                onChange={(e) => setStmtForm({ ...stmtForm, statement_date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Dönem Borcu (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="26969.24"
                value={stmtForm.period_debt}
                onChange={(e) => setStmtForm({ ...stmtForm, period_debt: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Asgari Ödeme (TL)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={stmtForm.minimum}
                onChange={(e) => setStmtForm({ ...stmtForm, minimum: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Faiz/Masraf Yükü (TL)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={stmtForm.interest_fees}
                onChange={(e) => setStmtForm({ ...stmtForm, interest_fees: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Son Ödeme Tarihi</label>
            <Input
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
    </div>
  )
}
