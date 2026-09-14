'use client'

import React, { useState, useEffect } from 'react'
import { X, Coffee, ShoppingBag, Utensils, Car, Pill, Laptop, Check, CreditCard as CardIcon, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { HeroCurrencyInput } from '@/components/ui/hero-currency-input'
import { createClient } from '@/lib/supabase/client'
import { financialBridge } from '@/lib/financial-bridge'
import { useToast } from '@/lib/toast-context'
import { cn, formatLocalDateInput } from '@/lib/utils'
import type { Account, CreditCard } from '@/types/database'

interface QuickCaptureSheetProps {
  isOpen: boolean
  onClose: () => void
}

const QUICK_CHIPS = [
  { label: 'Kafe', icon: Coffee, merchant: 'Kahve & Kafe', group: 'Kişisel' as const, defaultAmt: 140 },
  { label: 'Market', icon: ShoppingBag, merchant: 'Market Alışverişi', group: 'Kişisel' as const, defaultAmt: 350 },
  { label: 'Yemek', icon: Utensils, merchant: 'Dışarıda Yemek', group: 'Kişisel' as const, defaultAmt: 280 },
  { label: 'Ulaşım', icon: Car, merchant: 'Taksi & Ulaşım', group: 'Kişisel' as const, defaultAmt: 180 },
  { label: 'Eczane', icon: Pill, merchant: 'Eczane & Sağlık', group: 'Kişisel' as const, defaultAmt: 150 },
  { label: 'İş', icon: Laptop, merchant: 'İş / Yazılım Aracı', group: 'İş' as const, defaultAmt: 250 },
]

export function QuickCaptureSheet({ isOpen, onClose }: QuickCaptureSheetProps) {
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [analysisGroup, setAnalysisGroup] = useState<'Kişisel' | 'İş' | 'Finansman'>('Kişisel')
  const [sourceType, setSourceType] = useState<'account' | 'card'>('card')
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Load accounts and cards
  useEffect(() => {
    if (!isOpen) return

    async function loadSources() {
      setLoading(true)
      try {
        const supabase = createClient()
        const [accRes, cardRes] = await Promise.all([
          supabase.from('accounts').select('*'),
          supabase.from('credit_cards').select('*'),
        ])

        const loadedAccs: Account[] = accRes.data || []
        const loadedCards: CreditCard[] = cardRes.data || []

        // Fallbacks from local storage if supabase empty
        const finalAccs = loadedAccs.length > 0 ? loadedAccs : JSON.parse(localStorage.getItem('pusula_local_accounts') || '[]')
        const finalCards = loadedCards.length > 0 ? loadedCards : JSON.parse(localStorage.getItem('pusula_local_cards') || '[]')

        setAccounts(finalAccs)
        setCards(finalCards)

        // Set sensible default source
        if (finalCards.length > 0) {
          setSourceType('card')
          setSelectedSourceId(finalCards[0].id)
        } else if (finalAccs.length > 0) {
          setSourceType('account')
          setSelectedSourceId(finalAccs[0].id)
        }
      } catch (err) {
        console.error('Error loading sources for quick capture:', err)
      } finally {
        setLoading(false)
      }
    }

    loadSources()
  }, [isOpen])

  if (!isOpen) return null

  const handleChipSelect = (chip: typeof QUICK_CHIPS[0]) => {
    setDescription(chip.merchant)
    setAnalysisGroup(chip.group)
    if (!amount || amount === '0') {
      setAmount(chip.defaultAmt.toString())
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = parseFloat(amount.replace(',', '.'))
    if (!numAmount || numAmount <= 0) {
      toast.error('Lütfen geçerli bir harcama tutarı girin.')
      return
    }

    if (!selectedSourceId) {
      toast.error('Lütfen bir ödeme kaynağı (hesap veya kart) seçin.')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id || 'local'
      const today = formatLocalDateInput()

      const res = await financialBridge.recordExpense({
        userId,
        amount: numAmount,
        description: description.trim() || 'Hızlı Harcama',
        date: today,
        merchant: description.trim() || undefined,
        analysisGroup,
        accountId: sourceType === 'account' ? selectedSourceId : undefined,
        cardId: sourceType === 'card' ? selectedSourceId : undefined,
      })

      if (!res.success) {
        throw new Error(res.error || 'Harcama kaydedilemedi.')
      }

      toast.success(`${numAmount.toLocaleString('tr-TR')} ₺ harcama kaydedildi.`)
      
      // Reset and close
      setAmount('')
      setDescription('')
      onClose()

      // Notify other views
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pusula:transaction-created'))
      }
    } catch (err: any) {
      toast.error(err.message || 'Kayıt sırasında hata oluştu.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-capture-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/80 bg-card p-5 sm:p-6 pb-safe shadow-[0_-12px_48px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
      >
        {/* Mobile Drag Handle Bar */}
        <div className="w-12 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h2 id="quick-capture-title" className="text-base font-bold text-foreground flex items-center gap-2">
              <span>⚡ Hızlı Harcama</span>
            </h2>
            <p className="text-xs text-muted-foreground">3 saniyede nakit veya kart harcaması kaydet</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Quick Category Chips */}
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Hızlı Şablonlar
            </span>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_CHIPS.map((chip) => {
                const Icon = chip.icon
                const isSelected = description === chip.merchant
                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChipSelect(chip)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left min-h-[36px]',
                      isSelected
                        ? 'bg-primary/20 border-primary text-primary-foreground shadow-sm ring-1 ring-primary/40'
                        : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{chip.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Large Hero Amount Input */}
          <HeroCurrencyInput
            label="Tutar"
            type="expense"
            value={amount}
            onChange={(val) => setAmount(val)}
            autoFocus
            presets={[100, 200, 500, 1000]}
          />

          {/* Description / Merchant */}
          <div>
            <label htmlFor="quick-capture-desc" className="text-xs font-medium text-muted-foreground block mb-1">
              Açıklama / İşyeri
            </label>
            <Input
              id="quick-capture-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Örn: Kahve Dünyası, Migros vb."
              className="w-full h-9"
            />
          </div>

          {/* Payment Source Selection (Account or Card) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="quick-capture-source" className="text-xs font-medium text-muted-foreground">Ödeme Kaynağı</label>
              <div role="radiogroup" aria-label="Ödeme Kaynağı Türü" className="flex rounded-lg bg-muted/40 p-0.5 border border-border/60">
                <button
                  type="button"
                  role="radio"
                  aria-checked={sourceType === 'card'}
                  onClick={() => {
                    setSourceType('card')
                    if (cards.length > 0) setSelectedSourceId(cards[0].id)
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5',
                    sourceType === 'card' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <CardIcon className="h-3 w-3" />
                  Kredi Kartı
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={sourceType === 'account'}
                  onClick={() => {
                    setSourceType('account')
                    if (accounts.length > 0) setSelectedSourceId(accounts[0].id)
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5',
                    sourceType === 'account' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Building2 className="h-3 w-3" />
                  Banka / Kasa
                </button>
              </div>
            </div>

            <Select
              id="quick-capture-source"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="w-full h-9 text-xs"
            >
              {sourceType === 'card' ? (
                cards.length > 0 ? (
                  cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.bank} — {c.card_name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Kayıtlı kart bulunamadı</option>
                )
              ) : (
                accounts.length > 0 ? (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.balance?.toLocaleString('tr-TR')} ₺)
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Kayıtlı hesap bulunamadı</option>
                )
              )}
            </Select>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={submitting || !amount}
              className="w-full h-11 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              {submitting ? 'Kaydediliyor...' : 'Harcamayı Kaydet'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
