'use client'

import { useEffect, useState, useMemo, Suspense, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Plus,
  CheckCircle2,
  Trash2,
  Edit2,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Calendar,
  CalendarClock,
  Layers,
  Undo2,
  Check,
  Store,
  Building2,
  ClipboardPaste,
  ArrowUpRight,
  ArrowDownLeft,
  LayoutGrid,
  Table as TableIcon,
  Wallet,
  ShoppingBag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatLocalDateInput, cn } from '@/lib/utils'
import {
  addMonths,
  generateInstallmentBatch,
  calculateInstallmentSummary,
  sortDebts,
  mergeInstallmentDrafts,
  parseAmount,
  normalizeDate,
  parsePastedSchedule,
  type InstallmentDraft,
} from '@/lib/debt-utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { HeroCurrencyInput } from '@/components/ui/hero-currency-input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/textarea'
import { ViewToggle } from '@/components/ui/view-toggle'
import { useToast } from '@/lib/toast-context'
import type { Debt, DebtInstallment } from '@/types/database'

function DebtsContent() {
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [debts, setDebts] = useState<Debt[]>([])
  const [installments, setInstallments] = useState<DebtInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [togglingInstallmentId, setTogglingInstallmentId] = useState<string | null>(null)

  // View mode: Cards vs Table
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Accordion state: set of expanded debt IDs (in cards and table)
  const [expandedDebtIds, setExpandedDebtIds] = useState<Set<string>>(new Set())

  // Deletion confirmation
  const [deleteTargetDebt, setDeleteTargetDebt] = useState<Debt | null>(null)
  const [isDeletingDebt, setIsDeletingDebt] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Alacak' | 'Borç'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Açık' | 'Kapatıldı'>('ALL')

  // Sorting
  const [debtSortField, setDebtSortField] = useState<'default' | 'person' | 'principal' | 'remaining'>('default')
  const [debtSortOrder, setDebtSortOrder] = useState<'asc' | 'desc'>('asc')

  // Deduct Payment Modal (for flat debts)
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [deductAmount, setDeductAmount] = useState('')

  // Dedicated "Yeni Alışveriş / Taksit Ekle" Modal state
  const [isAddShoppingModalOpen, setIsAddShoppingModalOpen] = useState(false)
  const [targetDebtForShopping, setTargetDebtForShopping] = useState<Debt | null>(null)
  const [shoppingForm, setShoppingForm] = useState({
    note: '',
    count: '3',
    startDate: formatLocalDateInput(),
    amount: '',
  })

  // Full Add / Edit Modal Form State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [planType, setPlanType] = useState<'flat' | 'scheduled'>('flat')
  const [formData, setFormData] = useState({
    id: '',
    type: 'Borç' as 'Borç' | 'Alacak',
    category: 'Mağaza & Alışveriş',
    person_or_entity: '',
    description: '',
    principal: '',
    past_payments: '0',
  })

  // Scheduled installment drafts inside modal
  const [draftInstallments, setDraftInstallments] = useState<InstallmentDraft[]>([])
  const [initialInstallmentIds, setInitialInstallmentIds] = useState<string[]>([])

  // Quick Batch Generation inputs inside modal
  const [batchCount, setBatchCount] = useState('3')
  const [batchStartDate, setBatchStartDate] = useState(formatLocalDateInput())
  const [batchAmount, setBatchAmount] = useState('')
  const [batchNote, setBatchNote] = useState('')

  // Smart Paste (Metinden Yapıştır) State
  const [isPasteBoxOpen, setIsPasteBoxOpen] = useState(false)
  const [pastedScheduleText, setPastedScheduleText] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      handleOpenAdd()
    }
  }, [searchParams])

  async function loadData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: dData, error: dErr }, { data: iData, error: iErr }] = await Promise.all([
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
        supabase.from('debt_installments').select('*').order('installment_no', { ascending: true }),
      ])

      if (dErr) throw dErr
      if (iErr) throw iErr

      if (dData) setDebts(dData)
      if (iData) setInstallments(iData)
    } catch (err: any) {
      console.error('Veri yüklenemedi:', err)
      toast.error('Veriler yüklenirken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // Group installments by debt_id AND strictly merge any same-day installments automatically
  const installmentsByDebtId = useMemo(() => {
    const map: Record<string, DebtInstallment[]> = {}
    for (const inst of installments) {
      if (!map[inst.debt_id]) map[inst.debt_id] = []
      map[inst.debt_id].push(inst)
    }
    // AUTOMATICALLY MERGE any installments that share the exact same calendar due_date (gün gün)!
    for (const debtId of Object.keys(map)) {
      map[debtId] = mergeInstallmentDrafts(map[debtId]) as unknown as DebtInstallment[]
    }
    return map
  }, [installments])

  // Summaries per debt
  const summariesByDebtId = useMemo(() => {
    const map: Record<string, ReturnType<typeof calculateInstallmentSummary>> = {}
    for (const debt of debts) {
      const list = installmentsByDebtId[debt.id]
      if (list && list.length > 0) {
        map[debt.id] = calculateInstallmentSummary(list)
      }
    }
    return map
  }, [debts, installmentsByDebtId])

  // Next due dates per debt
  const nextDueDates = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const debt of debts) {
      const s = summariesByDebtId[debt.id]
      map[debt.id] = s?.nextInstallment?.due_date || null
    }
    return map
  }, [debts, summariesByDebtId])

  // Summary Metrics
  const totalReceivables = debts
    .filter((d) => d.type === 'Alacak' && d.status !== 'Kapatıldı')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const totalDebts = debts
    .filter((d) => d.type === 'Borç' && d.status !== 'Kapatıldı')
    .reduce((sum, d) => sum + Number(d.remaining || 0), 0)

  const netBalance = totalReceivables - totalDebts

  const activeScheduledDebts = debts.filter(
    (d) => d.status !== 'Kapatıldı' && (installmentsByDebtId[d.id]?.length || 0) > 0
  )

  // Sorting Handler
  const handleDebtSort = (field: 'person' | 'principal' | 'remaining') => {
    if (debtSortField === field) {
      setDebtSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setDebtSortField(field)
      setDebtSortOrder(field === 'person' ? 'asc' : 'desc')
    }
  }

  // Active filters check & clear
  const hasActiveDebtFilters =
    typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery.trim() !== '' || debtSortField !== 'default'

  const handleClearDebtFilters = () => {
    setTypeFilter('ALL')
    setStatusFilter('ALL')
    setSearchQuery('')
    setDebtSortField('default')
    setDebtSortOrder('asc')
  }

  // Filtered & Sorted List
  const filteredDebts = useMemo(() => {
    const list = debts.filter((d) => {
      if (typeFilter !== 'ALL' && d.type !== typeFilter) return false
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLocaleLowerCase('tr-TR')
        const matchP = d.person_or_entity.toLocaleLowerCase('tr-TR').includes(q)
        const matchD = (d.description || '').toLocaleLowerCase('tr-TR').includes(q)
        const matchC = d.category.toLocaleLowerCase('tr-TR').includes(q)
        if (!matchP && !matchD && !matchC) return false
      }
      return true
    })

    if (debtSortField === 'default') {
      return sortDebts(list, nextDueDates)
    }

    return [...list].sort((a, b) => {
      if (debtSortField === 'person') {
        const cmp = (a.person_or_entity || '').localeCompare(b.person_or_entity || '', 'tr-TR')
        return debtSortOrder === 'asc' ? cmp : -cmp
      }
      if (debtSortField === 'principal') {
        const aVal = Number(a.principal || 0)
        const bVal = Number(b.principal || 0)
        return debtSortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      if (debtSortField === 'remaining') {
        const aVal = Number(a.remaining || 0)
        const bVal = Number(b.remaining || 0)
        return debtSortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [debts, typeFilter, statusFilter, searchQuery, debtSortField, debtSortOrder, nextDueDates])

  // Accordion toggle
  const toggleAccordion = (debtId: string) => {
    setExpandedDebtIds((prev) => {
      const next = new Set(prev)
      if (next.has(debtId)) next.delete(debtId)
      else next.add(debtId)
      return next
    })
  }

  // Single-click toggle for installment status
  const handleToggleInstallmentStatus = async (inst: DebtInstallment) => {
    if (togglingInstallmentId) return
    setTogglingInstallmentId(inst.id)
    const nextStatus = inst.status === 'Ödendi' ? 'Bekliyor' : 'Ödendi'
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('debt_installments')
        .update({
          status: nextStatus,
          paid_at: nextStatus === 'Ödendi' ? new Date().toISOString() : null,
        })
        .eq('id', inst.id)

      if (error) throw error

      toast.success(
        nextStatus === 'Ödendi'
          ? `${inst.installment_no}. taksit ödendi olarak işaretlendi.`
          : `${inst.installment_no}. taksit ödemesi geri alındı.`
      )
      await loadData()
    } catch (err: any) {
      toast.error('İşlem başarısız: ' + (err.message || 'Hata'))
    } finally {
      setTogglingInstallmentId(null)
    }
  }

  // Open Deduct Modal (for flat debts)
  const handleOpenDeduct = (debt: Debt) => {
    setSelectedDebt(debt)
    setDeductAmount(debt.remaining > 0 ? debt.remaining.toString() : '')
    setIsDeductModalOpen(true)
  }

  // Process flat payment deduction (strictly operates on debt record)
  const handleProcessDeduction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDebt) return
    setSubmitting(true)

    try {
      const amt = parseAmount(deductAmount)
      if (isNaN(amt) || amt <= 0) throw new Error('Geçerli bir tutar giriniz.')

      const currentPast = Number(selectedDebt.past_payments || 0)
      const currentRemaining = Number(selectedDebt.remaining || 0)

      if (amt > currentRemaining) {
        throw new Error(
          `Düşülecek tutar kalan bakiyeden (${formatCurrency(currentRemaining)}) fazla olamaz.`
        )
      }

      const newPast = Math.round((currentPast + amt) * 100) / 100
      const newRemaining = Math.round(Math.max(0, currentRemaining - amt) * 100) / 100
      const newStatus = newRemaining <= 0 ? 'Kapatıldı' : 'Açık'

      const supabase = createClient()
      const { error } = await supabase
        .from('debts')
        .update({
          past_payments: newPast,
          remaining: newRemaining,
          status: newStatus,
        })
        .eq('id', selectedDebt.id)

      if (error) throw error

      setIsDeductModalOpen(false)
      setSelectedDebt(null)
      toast.success(
        selectedDebt.type === 'Alacak'
          ? `${formatCurrency(amt)} tutarında tahsilat başarıyla kaydedildi!`
          : `${formatCurrency(amt)} tutarında ödeme başarıyla borçtan düşüldü!`
      )
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Ödeme işlenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormMode('add')
    setPlanType('flat')
    const initialType = typeFilter === 'Alacak' ? 'Alacak' : 'Borç'
    setFormData({
      id: '',
      type: initialType,
      category: initialType === 'Alacak' ? 'Maaş & Hakediş' : 'Mağaza & Alışveriş',
      person_or_entity: '',
      description: '',
      principal: '',
      past_payments: '0',
    })
    setDraftInstallments([])
    setInitialInstallmentIds([])
    setBatchCount('3')
    setBatchStartDate(formatLocalDateInput())
    setBatchAmount('')
    setBatchNote('')
    setIsPasteBoxOpen(false)
    setPastedScheduleText('')
    setIsFormModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (debt: Debt) => {
    setFormMode('edit')
    const existing = installmentsByDebtId[debt.id] || []
    const isScheduled = existing.length > 0

    setPlanType(isScheduled ? 'scheduled' : 'flat')
    setFormData({
      id: debt.id,
      type: debt.type,
      category: debt.category,
      person_or_entity: debt.person_or_entity,
      description: debt.description || '',
      principal: debt.principal.toString(),
      past_payments: debt.past_payments.toString(),
    })

    const drafts: InstallmentDraft[] = existing.map((i) => ({
      id: i.id,
      debt_id: i.debt_id,
      user_id: i.user_id,
      installment_no: i.installment_no,
      due_date: i.due_date,
      amount: Number(i.amount),
      status: i.status,
      paid_at: i.paid_at,
      note: i.note,
    }))

    setDraftInstallments(mergeInstallmentDrafts(drafts))
    setInitialInstallmentIds(existing.map((i) => i.id))

    // Set batch start date to 1 month after last installment or today
    if (drafts.length > 0) {
      const lastDue = drafts[drafts.length - 1].due_date
      setBatchStartDate(addMonths(lastDue, 1))
    } else {
      setBatchStartDate(formatLocalDateInput())
    }
    setBatchCount('1')
    setBatchAmount('')
    setBatchNote('')
    setIsPasteBoxOpen(false)
    setPastedScheduleText('')

    setIsFormModalOpen(true)
  }

  // Open the dedicated "Yeni Alışveriş / Taksit Ekle" Modal
  const handleOpenAddShopping = (debt: Debt) => {
    setTargetDebtForShopping(debt)
    const existing = installmentsByDebtId[debt.id] || []
    const nextDue = summariesByDebtId[debt.id]?.nextInstallment?.due_date
    setShoppingForm({
      note: '',
      count: '3',
      startDate: nextDue || (existing.length > 0 ? existing[0].due_date : formatLocalDateInput()),
      amount: '',
    })
    setIsAddShoppingModalOpen(true)
  }

  // Save the Dedicated Shopping Installments into the debt plan with Automatic Exact-Day Merging
  const handleSaveShoppingInstallments = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetDebtForShopping) return

    const count = parseInt(shoppingForm.count, 10)
    const amount = parseAmount(shoppingForm.amount)
    if (isNaN(count) || count <= 0) {
      toast.error('Lütfen geçerli bir taksit sayısı girin.')
      return
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Lütfen geçerli bir taksit tutarı girin.')
      return
    }
    if (!shoppingForm.startDate) {
      toast.error('Lütfen ilk taksit vadesini seçin.')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const existingInstallments = installmentsByDebtId[targetDebtForShopping.id] || []
      const existingDrafts: InstallmentDraft[] = existingInstallments.map((i) => ({
        id: i.id,
        debt_id: i.debt_id,
        user_id: i.user_id,
        installment_no: i.installment_no,
        due_date: i.due_date,
        amount: Number(i.amount),
        status: i.status,
        paid_at: i.paid_at,
        note: i.note,
      }))

      const newBatch = generateInstallmentBatch({
        count,
        startDate: shoppingForm.startDate,
        amount,
        startingInstallmentNo: existingDrafts.length + 1,
        note: shoppingForm.note ? shoppingForm.note.trim() : null,
      })

      // Strictly merge new batch with existing installments by exact calendar due_date (gün gün)
      const merged = mergeInstallmentDrafts(existingDrafts, newBatch)
      const collisions = existingDrafts.length + newBatch.length - merged.length

      // Delete existing installments and re-insert the merged schedule atomically
      await supabase.from('debt_installments').delete().eq('debt_id', targetDebtForShopping.id)

      const insertPayload = merged.map((inst, idx) => ({
        debt_id: targetDebtForShopping.id,
        user_id: user.id,
        installment_no: idx + 1,
        due_date: normalizeDate(inst.due_date),
        amount: parseAmount(inst.amount),
        status: inst.status,
        note: inst.note || null,
        paid_at: inst.status === 'Ödendi' ? (inst.paid_at || new Date().toISOString()) : null,
      }))

      const { error: iErr } = await supabase.from('debt_installments').insert(insertPayload)
      if (iErr) throw iErr

      // Auto-expand this card to show the updated plan
      setExpandedDebtIds((prev) => new Set(prev).add(targetDebtForShopping.id))
      setIsAddShoppingModalOpen(false)
      setTargetDebtForShopping(null)

      if (collisions > 0) {
        toast.success(
          `${count} taksit eklendi (Aynı tarihteki ${collisions} taksit tutarı otomatik birleştirildi).`
        )
      } else {
        toast.success(`${count} adet taksit ödeme planına eklendi!`)
      }
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'Alışveriş taksiti eklenemedi.')
    } finally {
      setSubmitting(false)
    }
  }

  // Quick Batch Add to drafts inside full modal (strictly merges same dates automatically)
  const handleAddBatch = () => {
    const count = parseInt(batchCount, 10)
    const amount = parseAmount(batchAmount)
    if (isNaN(count) || count <= 0) {
      toast.error('Lütfen geçerli bir taksit sayısı girin.')
      return
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error('Lütfen geçerli bir taksit tutarı girin.')
      return
    }
    if (!batchStartDate) {
      toast.error('Lütfen başlangıç vadesi seçin.')
      return
    }

    const startingNo = draftInstallments.length + 1
    const newBatch = generateInstallmentBatch({
      count,
      startDate: batchStartDate,
      amount,
      startingInstallmentNo: startingNo,
      note: batchNote || undefined,
    }).map((inst) => ({
      ...inst,
      tempId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    }))

    // Merge incoming batch with existing drafts by exact due_date automatically
    const merged = mergeInstallmentDrafts(draftInstallments, newBatch)
    const collisions = draftInstallments.length + newBatch.length - merged.length
    setDraftInstallments(merged)

    // Automatically advance next default batch start date by count months
    setBatchStartDate(addMonths(batchStartDate, count))
    setBatchAmount('')
    setBatchNote('')

    if (collisions > 0) {
      toast.success(`${count} adet taksit eklendi (Aynı tarihteki ${collisions} taksit otomatik birleştirildi).`)
    } else {
      toast.success(`${count} adet taksit plana eklendi.`)
    }
  }

  // Smart Paste Handler (Metinden Yapıştır)
  const handleApplyPastedSchedule = () => {
    if (!pastedScheduleText.trim()) {
      toast.error('Lütfen kopyaladığınız ödeme tablosunu yapıştırın.')
      return
    }

    const parsed = parsePastedSchedule(pastedScheduleText)
    if (parsed.length === 0) {
      toast.error('Metinden taksit tarihi ve tutarı tespit edilemedi. Lütfen geçerli bir tablo yapıştırın.')
      return
    }

    const merged = mergeInstallmentDrafts(draftInstallments, parsed)
    const collisions = draftInstallments.length + parsed.length - merged.length
    setDraftInstallments(merged)
    setPastedScheduleText('')
    setIsPasteBoxOpen(false)

    if (collisions > 0) {
      toast.success(`${parsed.length} taksit başarıyla aktarıldı (Aynı tarihteki ${collisions} taksit otomatik birleştirildi).`)
    } else {
      toast.success(`${parsed.length} taksit plana başarıyla aktarıldı!`)
    }
  }

  // Remove single draft installment
  const handleRemoveDraftInstallment = (index: number) => {
    const filtered = draftInstallments.filter((_, i) => i !== index)
    const renumbered = filtered.map((inst, i) => ({
      ...inst,
      installment_no: i + 1,
    }))
    setDraftInstallments(renumbered)
  }

  // Add empty single row to drafts
  const handleAddSingleDraftInstallment = () => {
    const nextNo = draftInstallments.length + 1
    const lastDate = draftInstallments.length > 0
      ? draftInstallments[draftInstallments.length - 1].due_date
      : formatLocalDateInput()
    const nextDate = addMonths(lastDate, 1)

    setDraftInstallments([
      ...draftInstallments,
      {
        tempId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        installment_no: nextNo,
        due_date: nextDate,
        amount: '',
        status: 'Bekliyor',
        note: null,
      },
    ])
  }

  // Update specific draft installment field (AUTOMATICALLY merges if date matches another row)
  const handleUpdateDraftInstallment = (
    index: number,
    field: keyof InstallmentDraft,
    val: any
  ) => {
    setDraftInstallments((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: val }

      // If user sets a due_date that matches another row, automatically and silently merge immediately!
      if (field === 'due_date' && val) {
        const normVal = normalizeDate(val)
        const hasCollision = copy.some(
          (item, i) => i !== index && normalizeDate(item.due_date) === normVal
        )
        if (hasCollision) {
          return mergeInstallmentDrafts(copy)
        }
      }
      return copy
    })
  }

  // On blur of due_date input: ensure automatic date-merging and chronological order
  const handleDueDateBlur = () => {
    setDraftInstallments((prev) => mergeInstallmentDrafts(prev))
  }

  // Live draft summary
  const draftSummary = useMemo(() => {
    return calculateInstallmentSummary(draftInstallments)
  }, [draftInstallments])

  // Save Add / Edit
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      if (planType === 'scheduled') {
        const validatedDrafts = mergeInstallmentDrafts(draftInstallments)
        if (validatedDrafts.length === 0) {
          throw new Error('Ödeme planlı kayıt için en az bir taksit eklemelisiniz.')
        }
        for (let i = 0; i < validatedDrafts.length; i++) {
          const item = validatedDrafts[i]
          const amt = parseAmount(item.amount)
          if (!item.due_date || !item.due_date.trim()) {
            throw new Error(`${i + 1}. taksitin vade tarihi boş olamaz.`)
          }
          if (isNaN(amt) || amt <= 0) {
            throw new Error(`${i + 1}. taksitin tutarı 0'dan büyük olmalıdır.`)
          }
        }
      } else {
        const principalNum = parseAmount(formData.principal)
        if (isNaN(principalNum) || principalNum <= 0) {
          throw new Error('Lütfen sıfırdan büyük bir toplam tutar giriniz.')
        }
        const pastNum = parseAmount(formData.past_payments)
        if (isNaN(pastNum) || pastNum < 0) {
          throw new Error('Ödenen tutar negatif olamaz.')
        }
        if (pastNum > principalNum) {
          throw new Error('Ödenen tutar toplam tutardan büyük olamaz.')
        }
      }

      if (formMode === 'add') {
        if (planType === 'flat') {
          const principalNum = parseAmount(formData.principal)
          const pastNum = parseAmount(formData.past_payments)
          const remainingNum = Math.round(Math.max(0, principalNum - pastNum) * 100) / 100

          const { error } = await supabase.from('debts').insert({
            user_id: user.id,
            type: formData.type,
            category: formData.category,
            person_or_entity: formData.person_or_entity,
            description: formData.description || null,
            principal: principalNum,
            past_payments: pastNum,
            remaining: remainingNum,
            status: remainingNum <= 0 ? 'Kapatıldı' : 'Açık',
          })

          if (error) throw error
          toast.success(
            formData.type === 'Alacak' ? 'Yeni alacak kaydı eklendi!' : 'Yeni borç kaydı eklendi!'
          )
        } else {
          // Scheduled plan: merge same dates automatically, create parent debt, then insert installments
          const finalizedDrafts = mergeInstallmentDrafts(draftInstallments)
          const finalizedSummary = calculateInstallmentSummary(finalizedDrafts)

          const { data: newDebt, error: dErr } = await supabase
            .from('debts')
            .insert({
              user_id: user.id,
              type: formData.type,
              category: formData.category,
              person_or_entity: formData.person_or_entity,
              description: formData.description || null,
              principal: finalizedSummary.totalAmount,
              past_payments: finalizedSummary.paidAmount,
              remaining: finalizedSummary.remainingAmount,
              status: finalizedSummary.remainingAmount <= 0 ? 'Kapatıldı' : 'Açık',
            })
            .select('id')
            .single()

          if (dErr || !newDebt) throw dErr || new Error('Kayıt oluşturulamadı')

          // Insert installments
          const insertPayload = finalizedDrafts.map((inst, idx) => ({
            debt_id: newDebt.id,
            user_id: user.id,
            installment_no: idx + 1,
            due_date: normalizeDate(inst.due_date),
            amount: parseAmount(inst.amount),
            status: inst.status,
            paid_at: inst.status === 'Ödendi' ? (inst.paid_at || new Date().toISOString()) : null,
            note: inst.note || null,
          }))

          const { error: iErr } = await supabase.from('debt_installments').insert(insertPayload)
          if (iErr) {
            await supabase.from('debts').delete().eq('id', newDebt.id)
            throw iErr
          }

          // Auto-expand the new scheduled debt
          setExpandedDebtIds((prev) => new Set(prev).add(newDebt.id))
          toast.success(
            formData.type === 'Alacak'
              ? 'Yeni tahsilat planı ve taksitler başarıyla oluşturuldu!'
              : 'Yeni ödeme planı ve taksitler başarıyla oluşturuldu!'
          )
        }
      } else {
        // Edit mode
        const debtId = formData.id
        if (!debtId) throw new Error('Kayıt ID bulunamadı')

        if (planType === 'flat') {
          // If previously had installments, remove them
          if (initialInstallmentIds.length > 0) {
            await supabase.from('debt_installments').delete().eq('debt_id', debtId)
          }

          const principalNum = parseAmount(formData.principal)
          const pastNum = parseAmount(formData.past_payments)
          const remainingNum = Math.round(Math.max(0, principalNum - pastNum) * 100) / 100

          const { error } = await supabase
            .from('debts')
            .update({
              type: formData.type,
              category: formData.category,
              person_or_entity: formData.person_or_entity,
              description: formData.description || null,
              principal: principalNum,
              past_payments: pastNum,
              remaining: remainingNum,
              status: remainingNum <= 0 ? 'Kapatıldı' : 'Açık',
            })
            .eq('id', debtId)

          if (error) throw error
          toast.success('Kayıt güncellendi!')
        } else {
          // Scheduled plan in edit mode: automatically merge any duplicate dates
          const finalizedDrafts = mergeInstallmentDrafts(draftInstallments)

          // Reconcile installments: insert new, update existing, delete removed
          const currentIds = finalizedDrafts.map((i) => i.id).filter(Boolean) as string[]
          const toDeleteIds = initialInstallmentIds.filter((id) => !currentIds.includes(id))

          if (toDeleteIds.length > 0) {
            const { error: delErr } = await supabase
              .from('debt_installments')
              .delete()
              .in('id', toDeleteIds)
            if (delErr) throw delErr
          }

          // Update parent debt metadata
          await supabase
            .from('debts')
            .update({
              type: formData.type,
              category: formData.category,
              person_or_entity: formData.person_or_entity,
              description: formData.description || null,
            })
            .eq('id', debtId)

          // Save / update each installment
          const newInstallmentsToInsert: any[] = []
          for (let i = 0; i < finalizedDrafts.length; i++) {
            const item = finalizedDrafts[i]
            const installmentPayload = {
              installment_no: i + 1,
              due_date: normalizeDate(item.due_date),
              amount: parseAmount(item.amount),
              status: item.status,
              note: item.note || null,
              paid_at: item.status === 'Ödendi' ? (item.paid_at || new Date().toISOString()) : null,
            }

            if (item.id) {
              const { error: uErr } = await supabase
                .from('debt_installments')
                .update(installmentPayload)
                .eq('id', item.id)
              if (uErr) throw uErr
            } else {
              newInstallmentsToInsert.push({
                ...installmentPayload,
                debt_id: debtId,
                user_id: user.id,
              })
            }
          }

          if (newInstallmentsToInsert.length > 0) {
            const { error: iErr } = await supabase
              .from('debt_installments')
              .insert(newInstallmentsToInsert)
            if (iErr) throw iErr
          }

          toast.success('Ödeme planı ve taksitler güncellendi!')
        }
      }

      setIsFormModalOpen(false)
      await loadData()
    } catch (err: any) {
      toast.error(err.message || 'İşlem gerçekleştirilemedi.')
    } finally {
      setSubmitting(false)
    }
  }

  // Confirm delete debt
  const confirmDeleteDebt = async () => {
    if (!deleteTargetDebt) return
    setIsDeletingDebt(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('debts').delete().eq('id', deleteTargetDebt.id)
      if (error) throw error
      toast.success('Kayıt silindi.')
      setDeleteTargetDebt(null)
      await loadData()
    } catch (err: any) {
      toast.error('Silinemedi: ' + (err.message || 'Hata'))
    } finally {
      setIsDeletingDebt(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-2xl bg-card/60 border border-border/40" />
        <div className="h-32 rounded-2xl bg-card/60 border border-border/40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl bg-card/60 border border-border/40" />
          <div className="h-64 rounded-2xl bg-card/60 border border-border/40" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top PageHeader & Actions */}
      <PageHeader
        title={
          typeFilter === 'Borç'
            ? 'Borçlarım & Mağaza Hesapları'
            : typeFilter === 'Alacak'
              ? 'Alacaklarım & Hakediş Tahsilatları'
              : 'Borç & Alacak Yönetimi'
        }
        description={
          typeFilter === 'Borç'
            ? 'Gencallar vb. mağaza taksitleri, senetli alışverişler ve vadeli borç yükümlülükleri'
            : typeFilter === 'Alacak'
              ? 'Maaş, prim, danışmanlık ve vadeli tahsilat takvimleri'
              : 'Taksit kırılımlı mağaza hesapları, senetli borçlar ve hakediş tahsilatları'
        }
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle
              value={viewMode}
              onChange={(val) => setViewMode(val as 'grid' | 'table')}
              options={[
                { value: 'grid', label: 'Kartlar', icon: LayoutGrid },
                { value: 'table', label: 'Tablo', icon: TableIcon },
              ]}
            />
            <Button
              onClick={handleOpenAdd}
              className={cn(
                'gap-2 shadow-sm text-xs h-9 font-semibold text-white',
                typeFilter === 'Alacak'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : typeFilter === 'Borç'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-primary hover:bg-primary/90'
              )}
            >
              <Plus className="h-4 w-4" />
              {typeFilter === 'Alacak'
                ? 'Yeni Alacak / Hakediş'
                : typeFilter === 'Borç'
                  ? 'Yeni Borç / Mağaza Hesabı'
                  : 'Yeni Kayıt Ekle'}
            </Button>
          </div>
        }
      />

      {/* Hero Financial Metrics Bar (Dynamic Theme by Selected Tab) */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-2xl border bg-card shadow-sm transition-all',
          typeFilter === 'Borç'
            ? 'border-rose-500/30 bg-rose-500/[0.02]'
            : typeFilter === 'Alacak'
              ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
              : 'border-border'
        )}
      >
        <div className="p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              Toplam Alacak (Kalan)
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-400 tabular-nums mt-1 font-mono">
              {formatCurrency(totalReceivables)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {debts.filter((d) => d.type === 'Alacak' && d.status === 'Açık').length} açık tahsilat
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-400" />
              Toplam Borç (Kalan)
            </div>
            <div className="text-2xl font-bold tracking-tight text-rose-400 tabular-nums mt-1 font-mono">
              {formatCurrency(totalDebts)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {debts.filter((d) => d.type === 'Borç' && d.status === 'Açık').length} açık borç / taksit
            </div>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              Net Finansal Denge
            </div>
            <div
              className={cn(
                'text-2xl font-bold tracking-tight tabular-nums mt-1 font-mono',
                netBalance > 0
                  ? 'text-emerald-400'
                  : netBalance < 0
                    ? 'text-rose-400'
                    : 'text-foreground'
              )}
            >
              {formatCurrency(netBalance)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {activeScheduledDebts.length} aktif taksit planı bağlı
            </div>
          </div>
          <div className="p-3 rounded-xl bg-muted text-foreground">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border shadow-xs">
        {/* Type Segment Tabs */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-medium transition-all select-none',
              typeFilter === 'ALL'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Tümü ({debts.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('Borç')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 select-none',
              typeFilter === 'Borç'
                ? 'bg-rose-500/20 text-rose-400 font-bold shadow-sm border border-rose-500/30'
                : 'text-muted-foreground hover:text-rose-400'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Borçlarım ({debts.filter((d) => d.type === 'Borç').length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('Alacak')}
            className={cn(
              'px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 select-none',
              typeFilter === 'Alacak'
                ? 'bg-emerald-500/20 text-emerald-400 font-bold shadow-sm border border-emerald-500/30'
                : 'text-muted-foreground hover:text-emerald-400'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Alacaklarım ({debts.filter((d) => d.type === 'Alacak').length})
          </button>
        </div>

        {/* Search Input & Status Select */}
        <div className="flex items-center gap-2 flex-1 sm:justify-end">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Kurum, mağaza, kişi veya açıklama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 text-xs w-full bg-background rounded-lg"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 text-xs w-28 bg-background rounded-lg"
          >
            <option value="ALL">Tümü</option>
            <option value="Açık">Açıklar</option>
            <option value="Kapatıldı">Kapandı</option>
          </Select>

          {hasActiveDebtFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearDebtFilters}
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1.5"
              title="Filtreleri Temizle"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sıfırla</span>
            </Button>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: MODERN ACCOUNT CARDS (GRID) */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          {filteredDebts.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground text-xs border-dashed">
              Filtreye uygun borç veya alacak kaydı bulunamadı.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDebts.map((item) => {
                const principal = Number(item.principal || 0)
                const pastPayments = Number(item.past_payments || 0)
                const remaining = Number(item.remaining || 0)
                const isClosed = remaining <= 0
                const itemInstallments = installmentsByDebtId[item.id] || []
                const isScheduled = itemInstallments.length > 0
                const summary = summariesByDebtId[item.id]
                const isExpanded = expandedDebtIds.has(item.id)
                const progressPct =
                  principal > 0 ? Math.min(100, Math.round((pastPayments / principal) * 100)) : 0

                const isDebt = item.type === 'Borç'

                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'border rounded-2xl transition-all shadow-sm flex flex-col justify-between overflow-hidden',
                      isDebt
                        ? 'border-rose-500/20 hover:border-rose-500/40 bg-gradient-to-b from-card to-rose-500/[0.02]'
                        : 'border-emerald-500/20 hover:border-emerald-500/40 bg-gradient-to-b from-card to-emerald-500/[0.02]',
                      isClosed ? 'opacity-65 grayscale-[30%]' : ''
                    )}
                  >
                    <div>
                      {/* Card Header */}
                      <CardHeader className="p-4 pb-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'p-2 rounded-xl text-white shrink-0',
                                isDebt ? 'bg-rose-500/90' : 'bg-emerald-500/90'
                              )}
                            >
                              {isDebt ? (
                                <Store className="h-4 w-4" />
                              ) : (
                                <Building2 className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <CardTitle className="text-base font-bold text-foreground tracking-tight leading-snug">
                                {item.person_or_entity}
                              </CardTitle>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge
                                  variant={isDebt ? 'destructive' : 'success'}
                                  className="text-[10px] px-1.5 py-0 font-medium"
                                >
                                  {item.type}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">
                                  {item.category}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Plan Badge */}
                          {isScheduled && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-mono px-2 py-0.5 gap-1 shrink-0 border border-border/80"
                            >
                              <Layers className="h-3 w-3 text-primary" />
                              {summary?.paidCount}/{summary?.totalCount} Taksit
                            </Badge>
                          )}
                        </div>

                        {item.description && (
                          <CardDescription className="text-xs text-muted-foreground/90 line-clamp-1 pt-0.5">
                            {item.description}
                          </CardDescription>
                        )}
                      </CardHeader>

                      {/* Card Content & Financials */}
                      <CardContent className="p-4 pt-1 space-y-3">
                        {/* Big Remaining Balance */}
                        <div className="flex items-baseline justify-between border-t border-border/40 pt-2.5">
                          <div>
                            <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                              {isDebt ? 'Kalan Borç' : 'Kalan Alacak'}
                            </div>
                            <div
                              className={cn(
                                'text-2xl font-bold font-mono tracking-tight mt-0.5',
                                remaining > 0
                                  ? isDebt
                                    ? 'text-rose-400'
                                    : 'text-emerald-400'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {remaining > 0 ? formatCurrency(remaining) : 'Tamamı Kapandı'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-muted-foreground">Toplam Hesap</div>
                            <div className="text-xs font-mono font-medium text-foreground/80 mt-0.5">
                              {formatCurrency(principal)}
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                            <span>
                              {isDebt ? 'Ödenen: ' : 'Tahsil: '}
                              <strong>{formatCurrency(pastPayments)}</strong>
                            </span>
                            <span>%{progressPct}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full transition-all duration-500 rounded-full',
                                isDebt ? 'bg-rose-500' : 'bg-emerald-500'
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Next Installment Alert Banner (if scheduled and active) */}
                        {isScheduled && summary?.nextInstallment && (
                          <div className="p-2.5 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between text-xs font-mono">
                            <div className="space-y-0.5">
                              <div className="text-[10px] text-muted-foreground font-sans flex items-center gap-1">
                                <CalendarClock className="h-3 w-3 text-primary" />
                                <span>{isDebt ? 'Sıradaki Taksit' : 'Sıradaki Tahsilat'}</span>
                              </div>
                              <div className="font-semibold text-foreground">
                                {formatDate(summary.nextInstallment.due_date)} •{' '}
                                <span className={isDebt ? 'text-rose-400' : 'text-emerald-400'}>
                                  {formatCurrency(Number(summary.nextInstallment.amount))}
                                </span>
                              </div>
                            </div>

                            {/* Quick 1-click Pay Next Installment */}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={togglingInstallmentId === summary.nextInstallment.id}
                              onClick={() =>
                                handleToggleInstallmentStatus(summary.nextInstallment as DebtInstallment)
                              }
                              className={cn(
                                'h-7 px-2 text-[11px] font-semibold gap-1 shrink-0',
                                isDebt
                                  ? 'border-rose-500/40 text-rose-500 hover:bg-rose-500/15'
                                  : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/15'
                              )}
                            >
                              <Check className="h-3 w-3" />
                              {isDebt ? 'Öde' : 'Tahsil Et'}
                            </Button>
                          </div>
                        )}

                        {/* Collapsible Installments Schedule */}
                        {isScheduled && (
                          <div className="border-t border-border/50 pt-2">
                            <button
                              type="button"
                              onClick={() => toggleAccordion(item.id)}
                              className="w-full flex items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                            >
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-primary" />
                                <span>
                                  {isDebt ? 'Ödeme Planı' : 'Tahsilat Takvimi'} ({itemInstallments.length} Gün / Taksit)
                                </span>
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                {itemInstallments.map((inst) => {
                                  const isPaid = inst.status === 'Ödendi'
                                  return (
                                    <div
                                      key={inst.id}
                                      className={cn(
                                        'p-2 rounded-lg border text-xs flex items-center justify-between transition-colors',
                                        isPaid
                                          ? 'bg-emerald-500/5 border-emerald-500/20 opacity-80'
                                          : 'bg-muted/20 border-border/50'
                                      )}
                                    >
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 font-mono">
                                          <span className="text-muted-foreground font-semibold">
                                            #{inst.installment_no}
                                          </span>
                                          <span className="font-semibold text-foreground">
                                            {formatDate(inst.due_date)}
                                          </span>
                                        </div>
                                        {inst.note && (
                                          <div className="text-[11px] text-muted-foreground">
                                            {inst.note}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-mono">
                                        <span className="font-bold text-foreground">
                                          {formatCurrency(inst.amount)}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={togglingInstallmentId === inst.id}
                                          onClick={() => handleToggleInstallmentStatus(inst)}
                                          className={cn(
                                            'h-6 px-2 text-[10px] font-sans font-medium transition-colors',
                                            isPaid
                                              ? 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                              : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                                          )}
                                        >
                                          {isPaid ? (
                                            <>
                                              <Undo2 className="h-3 w-3 mr-1" />
                                              Geri Al
                                            </>
                                          ) : (
                                            item.type === 'Alacak' ? 'Tahsil Et' : 'Ödendi'
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="p-4 pt-2 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isScheduled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAddShopping(item)}
                            className="h-8 text-xs gap-1.5 font-semibold bg-background hover:bg-primary/10 hover:text-primary transition-colors border-primary/30"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                            <span>Yeni Alışveriş Ekle</span>
                          </Button>
                        ) : (
                          !isClosed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenDeduct(item)}
                              className={cn(
                                'h-8 text-xs gap-1 font-medium bg-background',
                                isDebt
                                  ? 'text-rose-400 hover:bg-rose-500/10'
                                  : 'text-emerald-400 hover:bg-emerald-500/10'
                              )}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>{isDebt ? 'Ödeme Düş' : 'Tahsilat Al'}</span>
                            </Button>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(item)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full"
                          title="Tüm Planı Düzenle"
                          aria-label={`${item.person_or_entity} kaydını düzenle`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTargetDebt(item)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-full"
                          title="Kaydı Sil"
                          aria-label={`${item.person_or_entity} kaydını sil`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: DETAILED DATA TABLE */}
      {viewMode === 'table' && (
        <Card className="border border-border shadow-md overflow-hidden rounded-2xl bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/75 text-muted-foreground font-semibold uppercase text-[11px] tracking-wider border-b border-border">
                  <th scope="col" className="py-3 px-3 w-10 text-center">
                    No
                  </th>
                  <th scope="col" className="py-3 px-3 w-20">
                    Tür
                  </th>
                  <th scope="col" className="py-3 px-3 w-28">
                    Kategori
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 w-44"
                    aria-sort={
                      debtSortField === 'person'
                        ? debtSortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleDebtSort('person')}
                      className="flex items-center gap-1.5 font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none"
                    >
                      <span>Kişi / Kurum</span>
                      {debtSortField === 'person' ? (
                        debtSortOrder === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="py-3 px-3 w-52">
                    Plan / Sıradaki Vade
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Açıklama
                  </th>
                  <th scope="col" className="py-3 px-3 text-right w-28">
                    <button
                      type="button"
                      onClick={() => handleDebtSort('principal')}
                      className="flex items-center justify-end gap-1.5 ml-auto font-semibold uppercase hover:text-foreground transition-colors focus-visible:outline-none"
                    >
                      <span>Toplam</span>
                      {debtSortField === 'principal' ? (
                        debtSortOrder === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                      )}
                    </button>
                  </th>
                  <th scope="col" className="py-3 px-3 text-right w-28">
                    {typeFilter === 'Alacak'
                      ? 'Tahsil Edilen'
                      : typeFilter === 'Borç'
                        ? 'Ödenen'
                        : 'Ödenen / Tahsil'}
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      'py-3 px-3 text-right w-28 font-bold',
                      typeFilter === 'Alacak'
                        ? 'text-emerald-400'
                        : typeFilter === 'Borç'
                          ? 'text-rose-400'
                          : 'text-foreground'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleDebtSort('remaining')}
                      className="flex items-center justify-end gap-1.5 ml-auto font-semibold uppercase hover:opacity-80 transition-opacity focus-visible:outline-none"
                    >
                      <span>Kalan</span>
                      {debtSortField === 'remaining' ? (
                        debtSortOrder === 'asc' ? (
                          <ArrowUp
                            className={cn(
                              'h-3.5 w-3.5',
                              typeFilter === 'Borç' ? 'text-rose-400' : 'text-emerald-400'
                            )}
                          />
                        ) : (
                          <ArrowDown
                            className={cn(
                              'h-3.5 w-3.5',
                              typeFilter === 'Borç' ? 'text-rose-400' : 'text-emerald-400'
                            )}
                          />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30 hover:opacity-100" />
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-3 text-center w-28 sticky right-0 bg-card/95 backdrop-blur-sm border-l border-border z-20"
                  >
                    İşlem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-sans">
                {filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      Filtreye uygun kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredDebts.map((item, idx) => {
                    const principal = Number(item.principal || 0)
                    const pastPayments = Number(item.past_payments || 0)
                    const remaining = Number(item.remaining || 0)
                    const isClosed = remaining <= 0
                    const itemInstallments = installmentsByDebtId[item.id] || []
                    const isScheduled = itemInstallments.length > 0
                    const summary = summariesByDebtId[item.id]
                    const isExpanded = expandedDebtIds.has(item.id)

                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={cn(
                            'group transition-colors',
                            isClosed ? 'opacity-70 bg-muted/20' : 'hover:bg-muted/40',
                            isExpanded ? 'bg-muted/30 border-b-0' : ''
                          )}
                        >
                          <td className="py-2.5 px-3 text-center font-mono text-[11px] text-muted-foreground/60">
                            {isScheduled ? (
                              <button
                                type="button"
                                onClick={() => toggleAccordion(item.id)}
                                className="p-1 hover:text-foreground rounded transition-colors text-primary focus-visible:outline-none"
                                title={isExpanded ? 'Taksitleri Gizle' : 'Taksitleri Göster'}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <Badge
                              variant={item.type === 'Alacak' ? 'success' : 'destructive'}
                              className="text-[10px] px-1.5 py-0 font-medium"
                            >
                              {item.type}
                            </Badge>
                          </td>

                          <td className="py-2.5 px-3 text-xs text-muted-foreground">
                            {item.category}
                          </td>

                          <td className="py-2.5 px-4 text-xs font-semibold text-foreground whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{item.person_or_entity}</span>
                              {isScheduled && (
                                <button
                                  type="button"
                                  onClick={() => toggleAccordion(item.id)}
                                  className="text-[10px] text-primary/80 hover:text-primary transition-colors font-mono"
                                >
                                  ({itemInstallments.length} Gün)
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            {isScheduled && summary ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 font-mono"
                                  >
                                    {summary.paidCount} / {summary.totalCount}{' '}
                                    {item.type === 'Alacak' ? 'Tahsil Edildi' : 'Ödendi'} (%
                                    {summary.progressPercent})
                                  </Badge>
                                </div>
                                {summary.nextInstallment && (
                                  <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-primary/70 shrink-0" />
                                    <span>
                                      {item.type === 'Alacak' ? 'Sıradaki: ' : 'Sıradaki: '}
                                      {formatDate(summary.nextInstallment.due_date)}
                                    </span>
                                    <span className="font-semibold text-foreground">
                                      • {formatCurrency(Number(summary.nextInstallment.amount))}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground/60 text-[11px] font-mono">
                                Tek Kalem
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-xs text-muted-foreground/80 truncate max-w-[180px]">
                            {item.description || '-'}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                            {formatCurrency(principal)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-muted-foreground/80 whitespace-nowrap">
                            {pastPayments > 0 ? formatCurrency(pastPayments) : '-'}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">
                            {remaining > 0 ? (
                              <span
                                className={
                                  item.type === 'Alacak' ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                {formatCurrency(remaining)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-center sticky right-0 bg-card/95 backdrop-blur-sm border-l border-border z-10">
                            <div className="flex items-center justify-center gap-1">
                              {isScheduled ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenAddShopping(item)}
                                  className="h-7 px-2 text-[11px] gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10"
                                >
                                  <ShoppingBag className="h-3 w-3" />
                                  Alışveriş Ekle
                                </Button>
                              ) : (
                                !isClosed && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenDeduct(item)}
                                    className={cn(
                                      'h-7 px-2 text-[11px] gap-1',
                                      item.type === 'Alacak'
                                        ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                                        : 'border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15'
                                    )}
                                  >
                                    {item.type === 'Alacak' ? 'Tahsil Et' : 'Öde'}
                                  </Button>
                                )
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEdit(item)}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-full"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTargetDebt(item)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-full"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Installments in Table (Downward Listed Nested Table) */}
                        {isScheduled && isExpanded && (
                          <tr className="bg-muted/15 border-b border-border/80">
                            <td colSpan={10} className="p-3 pl-12 pr-4">
                              <div className="rounded-xl border border-border/70 bg-background/95 overflow-hidden shadow-xs">
                                {/* Sub-table Header Bar */}
                                <div className="p-2.5 px-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-primary" />
                                    <span className="text-xs font-semibold text-foreground">
                                      {item.type === 'Alacak'
                                        ? 'Tahsilat Takvimi Detayı'
                                        : 'Ödeme Planı Detayı'}
                                    </span>
                                    <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                                      {itemInstallments.length} Taksit / Vade
                                    </Badge>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenAddShopping(item)}
                                    className="h-7 text-[11px] gap-1.5 font-semibold text-primary border-primary/30 hover:bg-primary/10"
                                  >
                                    <ShoppingBag className="h-3.5 w-3.5" />
                                    Yeni Alışveriş Ekle
                                  </Button>
                                </div>

                                {/* Sub-table Rows (Listed Downwards) */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/30 text-muted-foreground font-semibold uppercase text-[10px] tracking-wider border-b border-border/40">
                                        <th scope="col" className="py-2 px-4 w-12 text-center">#</th>
                                        <th scope="col" className="py-2 px-4 w-44">Vade Tarihi</th>
                                        <th scope="col" className="py-2 px-4">Açıklama / Not</th>
                                        <th scope="col" className="py-2 px-4 w-32">Durum</th>
                                        <th scope="col" className="py-2 px-4 w-36 text-right">Taksit Tutarı</th>
                                        <th scope="col" className="py-2 px-4 w-28 text-center">İşlem</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40 font-mono">
                                      {itemInstallments.map((inst) => {
                                        const isPaid = inst.status === 'Ödendi'
                                        return (
                                          <tr
                                            key={inst.id}
                                            className={cn(
                                              'hover:bg-muted/20 transition-colors',
                                              isPaid ? 'bg-emerald-500/[0.03]' : ''
                                            )}
                                          >
                                            <td className="py-2 px-4 text-center text-muted-foreground font-semibold">
                                              #{inst.installment_no}
                                            </td>
                                            <td className="py-2 px-4 font-semibold text-foreground">
                                              {formatDate(inst.due_date)}
                                            </td>
                                            <td className="py-2 px-4 font-sans text-muted-foreground text-[11px]">
                                              {inst.note || '-'}
                                            </td>
                                            <td className="py-2 px-4 font-sans">
                                              <Badge
                                                variant={isPaid ? 'success' : 'outline'}
                                                className="text-[10px] px-1.5 py-0 font-medium"
                                              >
                                                {isPaid ? (item.type === 'Alacak' ? 'Tahsil Edildi' : 'Ödendi') : 'Bekliyor'}
                                              </Badge>
                                            </td>
                                            <td className="py-2 px-4 text-right font-bold text-foreground text-xs tabular-nums">
                                              {formatCurrency(inst.amount)}
                                            </td>
                                            <td className="py-2 px-4 text-center">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={togglingInstallmentId === inst.id}
                                                onClick={() => handleToggleInstallmentStatus(inst)}
                                                className={cn(
                                                  'h-7 px-2.5 text-[11px] font-sans font-medium transition-colors',
                                                  isPaid
                                                    ? 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                                                    : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
                                                )}
                                              >
                                                {isPaid ? (
                                                  <>
                                                    <Undo2 className="h-3 w-3 mr-1" />
                                                    Geri Al
                                                  </>
                                                ) : (
                                                  item.type === 'Alacak' ? 'Tahsil Et' : 'Ödendi'
                                                )}
                                              </Button>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* DEDICATED "YENİ ALIŞVERİŞ / TAKSİT EKLE" MODAL */}
      <Modal
        isOpen={isAddShoppingModalOpen}
        onClose={() => {
          setIsAddShoppingModalOpen(false)
          setTargetDebtForShopping(null)
        }}
        title={`🛍️ ${targetDebtForShopping?.person_or_entity} — Yeni Alışveriş Ekle`}
        description="Mevcut plana yeni taksitler ekleyin. Aynı gün vadesi olan taksit tutarları tek satırda otomatik toplanır."
        size="md"
      >
        {targetDebtForShopping && (
          <form onSubmit={handleSaveShoppingInstallments} className="space-y-4">
            <div className="p-3 rounded-xl border border-border bg-muted/30 flex items-center justify-between text-xs font-mono">
              <div>
                <div className="font-sans font-semibold text-foreground text-sm">
                  {targetDebtForShopping.person_or_entity}
                </div>
                <div className="text-[11px] text-muted-foreground font-sans">
                  Mevcut Plan: {installmentsByDebtId[targetDebtForShopping.id]?.length || 0} Gün • Toplam: {formatCurrency(targetDebtForShopping.principal)}
                </div>
              </div>
              <Badge variant="secondary" className="font-mono text-xs font-bold text-foreground">
                Kalan: {formatCurrency(targetDebtForShopping.remaining)}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Alışveriş Açıklaması / Not (Opsiyonel)
                </label>
                <Input
                  type="text"
                  value={shoppingForm.note}
                  onChange={(e) => setShoppingForm({ ...shoppingForm, note: e.target.value })}
                  placeholder="Örn: Kışlık Mont, Ayakkabı, Pantolon vb."
                  className="text-xs"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Taksit Sayısı</label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={shoppingForm.count}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, count: e.target.value })}
                    placeholder="Örn: 3"
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">İlk Vade Tarihi</label>
                  <Input
                    type="date"
                    required
                    value={shoppingForm.startDate}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, startDate: e.target.value })}
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Aylık Taksit Tutarı (₺)</label>
                  <Input
                    type="text"
                    required
                    value={shoppingForm.amount}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, amount: e.target.value })}
                    placeholder="Örn: 500,00"
                    className="text-xs font-mono font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddShoppingModalOpen(false)}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Plana Ekleniyor...' : 'Taksitleri Plana Ekle'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* DEDUCT FLAT PAYMENT MODAL */}
      <Modal
        isOpen={isDeductModalOpen}
        onClose={() => {
          setIsDeductModalOpen(false)
          setSelectedDebt(null)
        }}
        title={selectedDebt?.type === 'Alacak' ? '💰 Tahsilat Al' : '💸 Borç Ödemesi Düş'}
        description={
          selectedDebt?.type === 'Alacak'
            ? `${selectedDebt.person_or_entity} alacağından tahsil edilen tutarı girin.`
            : `${selectedDebt?.person_or_entity} borcundan ödenen tutarı girin.`
        }
      >
        {selectedDebt && (
          <form onSubmit={handleProcessDeduction} className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Kayıt:</span>
                <span className="font-semibold text-foreground font-sans truncate max-w-[260px]">
                  {selectedDebt.person_or_entity} — {selectedDebt.category}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-sans">Toplam Tutar:</span>
                <span>{formatCurrency(selectedDebt.principal)}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-border">
                <span className="text-muted-foreground font-sans font-semibold">Mevcut Kalan:</span>
                <span className="font-bold text-emerald-500 font-mono text-base">
                  {formatCurrency(selectedDebt.remaining)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="deduct-amount" className="text-xs font-semibold text-foreground">
                {selectedDebt.type === 'Alacak' ? 'Tahsil Edilen Tutar' : 'Düşülecek Tutar'}
              </label>
              <Input
                id="deduct-amount"
                type="text"
                required
                value={deductAmount}
                onChange={(e) => setDeductAmount(e.target.value)}
                className="text-base font-bold font-mono text-emerald-500"
                placeholder="0.00"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeductModalOpen(false)}
              >
                İptal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? 'İşleniyor...'
                  : selectedDebt.type === 'Alacak'
                    ? 'Tahsilatı Kaydet'
                    : 'Ödemeyi Düş'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* UNIFIED FULL ADD / EDIT MODAL */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={
          formMode === 'add'
            ? formData.type === 'Alacak'
              ? 'Yeni Alacak / Hakediş Kaydı'
              : 'Yeni Borç / Mağaza Hesabı'
            : formData.type === 'Alacak'
              ? 'Alacak Kaydını Düzenle'
              : 'Borç / Mağaza Hesabını Düzenle'
        }
        description={
          formData.type === 'Alacak'
            ? 'Tek kalem veya taksitli tahsilat takvimi oluşturun.'
            : 'Tek kalem veya taksit kırılımlı mağaza/senet ödeme planı oluşturun.'
        }
        size={planType === 'scheduled' ? '2xl' : 'md'}
      >
        <form onSubmit={handleSaveForm} className="space-y-4">
          {/* Plan Type Switcher */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Kayıt Türü & Yapısı</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlanType('flat')
                  if (draftInstallments.length > 0 && (!formData.principal || formData.principal === '0')) {
                    setFormData((prev) => ({
                      ...prev,
                      principal: draftSummary.totalAmount > 0 ? draftSummary.totalAmount.toString() : prev.principal,
                      past_payments: draftSummary.paidAmount > 0 ? draftSummary.paidAmount.toString() : prev.past_payments,
                    }))
                  }
                }}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition-all',
                  planType === 'flat'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                )}
              >
                <div className="text-xs font-semibold">Tek Kalem (Taksitsiz)</div>
                <div className="text-[11px] opacity-75 mt-0.5">Sabit tekil borç veya alacak</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlanType('scheduled')
                  if (draftInstallments.length === 0 && Number(formData.principal) > 0 && !batchAmount) {
                    setBatchAmount(formData.principal)
                  }
                }}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition-all',
                  planType === 'scheduled'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                )}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  {formData.type === 'Alacak' ? 'Tahsilat Takvimli (Taksitli)' : 'Ödeme Planlı (Taksit Kırılımlı)'}
                </div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  {formData.type === 'Alacak'
                    ? 'Hakediş, danışmanlık veya vadeli tahsilat'
                    : 'Gencallar, mağaza hesabı veya senetli vadeler'}
                </div>
              </button>
            </div>
          </div>

          {/* Direction Segmented Control */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">İşlem Yönü</label>
            <SegmentedControl<'Alacak' | 'Borç'>
              value={formData.type}
              onChange={(val) => {
                const isDefaultCat =
                  formData.category === 'Mağaza & Alışveriş' ||
                  formData.category === 'Maaş & Hakediş' ||
                  !formData.category
                setFormData({
                  ...formData,
                  type: val,
                  category: isDefaultCat
                    ? val === 'Alacak'
                      ? 'Maaş & Hakediş'
                      : 'Mağaza & Alışveriş'
                    : formData.category,
                })
              }}
              options={[
                { value: 'Borç', label: 'Borç (Ödenecek)', activeClassName: 'text-rose-400 font-bold' },
                { value: 'Alacak', label: 'Alacak (Tahsil Edilecek)', activeClassName: 'text-emerald-400 font-bold' },
              ]}
            />
          </div>

          {/* Person & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="form-person" className="text-xs font-semibold text-foreground">
                Kişi / Kurum / Mağaza
              </label>
              <Input
                id="form-person"
                required
                value={formData.person_or_entity}
                onChange={(e) => setFormData({ ...formData, person_or_entity: e.target.value })}
                placeholder={
                  formData.type === 'Alacak'
                    ? 'Örn: Şirket Adı, Müşteri, Hızır Global'
                    : 'Örn: Gencallar, Akbank, Mağaza'
                }
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="form-category" className="text-xs font-semibold text-foreground">
                Kategori
              </label>
              <Input
                id="form-category"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder={
                  formData.type === 'Alacak'
                    ? 'Örn: Maaş & Prim, Freelance'
                    : 'Örn: Mağaza & Alışveriş, Banka, Senet'
                }
                className="text-xs"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="form-description" className="text-xs font-semibold text-foreground">
              Açıklama (Opsiyonel)
            </label>
            <Input
              id="form-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={
                formData.type === 'Alacak'
                  ? 'Örn: Q4 Hakedişi veya Danışmanlık Bedeli'
                  : 'Örn: Gencallar Kışlık Alışveriş, Senetli Mont vb.'
              }
              className="text-xs"
            />
          </div>

          {/* FLAT FORM MODE */}
          {planType === 'flat' && (
            <div className="space-y-3 pt-1 border-t border-border">
              <HeroCurrencyInput
                id="form-principal"
                label="Toplam Tutar"
                type={formData.type === 'Alacak' ? 'income' : 'expense'}
                value={formData.principal}
                onChange={(val) => setFormData({ ...formData, principal: val })}
                placeholder="0.00"
              />

              <div className="space-y-1">
                <label htmlFor="form-past-payments" className="text-xs font-semibold text-foreground">
                  {formData.type === 'Alacak'
                    ? 'Daha Önce Tahsil Edilen Tutar'
                    : 'Daha Önce Ödenen Tutar'}
                </label>
                <Input
                  id="form-past-payments"
                  type="text"
                  value={formData.past_payments}
                  onChange={(e) => setFormData({ ...formData, past_payments: e.target.value })}
                  placeholder="0.00"
                  className="text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* SCHEDULED PLAN EDITOR (INSTALLMENT ENGINE) */}
          {planType === 'scheduled' && (
            <div className="space-y-4 pt-2 border-t border-border">
              {/* Quick Batch Adder Strip */}
              <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <span>Hızlı Taksit Serisi Ekle</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPasteBoxOpen(!isPasteBoxOpen)}
                    className="h-7 text-[11px] gap-1 text-primary hover:text-primary font-medium"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    <span>{isPasteBoxOpen ? 'Yapıştır Kutusunu Kapat' : 'Metinden / Webden Yapıştır'}</span>
                  </Button>
                </div>

                {/* Smart Paste Container */}
                {isPasteBoxOpen && (
                  <div className="p-3 rounded-lg border border-border bg-card space-y-2 text-xs">
                    <div className="text-[11px] text-muted-foreground">
                      Mağaza sayfasından kopyaladığınız taksit tablosunu (vade ve tutar içeren metin) buraya yapıştırın:
                    </div>
                    <Textarea
                      rows={3}
                      value={pastedScheduleText}
                      onChange={(e) => setPastedScheduleText(e.target.value)}
                      placeholder={'1 05.11.2026 2.181,94 ₺\n2 05.12.2026 2.158,17 ₺\n...'}
                      className="text-xs font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setIsPasteBoxOpen(false)}
                        className="h-7 text-xs"
                      >
                        Vazgeç
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyPastedSchedule}
                        className="h-7 text-xs font-semibold"
                      >
                        Taksitleri Çıkar ve Plana Ekle
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Taksit Sayısı</label>
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      value={batchCount}
                      onChange={(e) => setBatchCount(e.target.value)}
                      placeholder="Adet"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">İlk Vade Tarihi</label>
                    <Input
                      type="date"
                      value={batchStartDate}
                      onChange={(e) => setBatchStartDate(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Taksit Tutarı (₺)</label>
                    <Input
                      type="text"
                      value={batchAmount}
                      onChange={(e) => setBatchAmount(e.target.value)}
                      placeholder="2158.17 veya 2.158,17"
                      className="h-8 text-xs font-mono font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Not (Opsiyonel)</label>
                    <Input
                      type="text"
                      value={batchNote}
                      onChange={(e) => setBatchNote(e.target.value)}
                      placeholder="Örn: Mont, Ayakkabı"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddBatch}
                    className="h-8 text-xs gap-1.5 font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Plana Ekle
                  </Button>
                </div>
              </div>

              {/* Editable Installment Table (strictly merged by day) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-foreground">
                    Taksit Listesi ({draftInstallments.length} Gün / Vade)
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSingleDraftInstallment}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Tekil Satır Ekle
                  </Button>
                </div>

                {draftInstallments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                    Henüz taksit eklenmedi. Yukarıdaki hızlı seriyi kullanarak (örn: 3x 2158.17 ₺) veya metinden yapıştırarak planı oluşturun.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/75 text-muted-foreground text-[10px] uppercase font-semibold sticky top-0 border-b border-border z-10">
                        <tr>
                          <th className="py-2 px-2.5 w-10 text-center">#</th>
                          <th className="py-2 px-2 w-32">Vade Tarihi</th>
                          <th className="py-2 px-2 w-28">Tutar (₺)</th>
                          <th className="py-2 px-2 w-28">Durum</th>
                          <th className="py-2 px-2">Not / Alışveriş</th>
                          <th className="py-2 px-2 w-10 text-center">Sil</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {draftInstallments.map((inst, idx) => (
                          <tr key={inst.id || inst.tempId || idx} className="hover:bg-muted/20">
                            <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-muted-foreground">
                              {inst.installment_no}
                            </td>
                            <td className="py-1.5 px-2">
                              <Input
                                type="date"
                                value={normalizeDate(inst.due_date)}
                                onChange={(e) =>
                                  handleUpdateDraftInstallment(idx, 'due_date', e.target.value)
                                }
                                onBlur={handleDueDateBlur}
                                className="h-7 text-xs font-mono px-2"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <Input
                                type="text"
                                value={inst.amount}
                                onChange={(e) =>
                                  handleUpdateDraftInstallment(idx, 'amount', e.target.value)
                                }
                                className="h-7 text-xs font-mono font-semibold px-2"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <Select
                                value={inst.status}
                                onChange={(e) =>
                                  handleUpdateDraftInstallment(idx, 'status', e.target.value as any)
                                }
                                className="h-7 text-xs px-2"
                              >
                                <option value="Bekliyor">Bekliyor</option>
                                <option value="Ödendi">
                                  {formData.type === 'Alacak' ? 'Tahsil Edildi' : 'Ödendi'}
                                </option>
                              </Select>
                            </td>
                            <td className="py-1.5 px-2">
                              <Input
                                type="text"
                                value={inst.note || ''}
                                onChange={(e) =>
                                  handleUpdateDraftInstallment(idx, 'note', e.target.value)
                                }
                                placeholder="Not..."
                                className="h-7 text-xs px-2"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveDraftInstallment(idx)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-full"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Plan Live Totals Summary Card */}
                {draftInstallments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-muted/40 border border-border text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-sans uppercase">
                        Toplam Hesap
                      </div>
                      <div className="text-foreground font-bold mt-0.5 text-sm">
                        {formatCurrency(draftSummary.totalAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-sans uppercase">
                        {formData.type === 'Alacak' ? 'Tahsil Edilen' : 'Ödenen'}
                      </div>
                      <div className="text-emerald-400 font-bold mt-0.5 text-sm">
                        {formatCurrency(draftSummary.paidAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-sans uppercase">
                        Kalan Bakiye
                      </div>
                      <div
                        className={cn(
                          'font-bold mt-0.5 text-sm',
                          formData.type === 'Alacak' ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {formatCurrency(draftSummary.remainingAmount)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFormModalOpen(false)}
            >
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Kaydediliyor...'
                : formMode === 'add'
                  ? 'Kaydı Oluştur'
                  : 'Değişiklikleri Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetDebt)}
        onClose={() => setDeleteTargetDebt(null)}
        onConfirm={confirmDeleteDebt}
        title="Kaydı Sil"
        description={`"${deleteTargetDebt?.person_or_entity}" kaydını ve bağlı tüm taksit planını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Kaydı Sil"
        cancelLabel="Vazgeç"
        isLoading={isDeletingDebt}
        variant="destructive"
      />
    </div>
  )
}

export default function DebtsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Borç & Alacak yükleniyor...
        </div>
      }
    >
      <DebtsContent />
    </Suspense>
  )
}
