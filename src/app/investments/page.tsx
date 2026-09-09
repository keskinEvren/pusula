'use client'

import { useState, useEffect, useTransition, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
  Wallet,
  PieChart,
  Coins,
  DollarSign,
  Building2,
  Trash2,
  Edit2,
  Search,
  ExternalLink,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { calculatePortfolioMetrics, calculateDcaAverageCost, round2 } from '@/lib/finance-engine'
import { searchAssetCatalog, type CatalogAsset } from '@/lib/market/assets-catalog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import type { Investment } from '@/types/database'

function getPriceFreshness(lastUpdated?: string | null): {
  label: string
  colorClass: string
  dotClass: string
} {
  if (!lastUpdated) {
    return { label: 'Bilinmiyor', colorClass: 'text-muted-foreground', dotClass: 'bg-muted-foreground' }
  }
  const diffMs = Date.now() - new Date(lastUpdated).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 15) {
    return { label: 'Canlı', colorClass: 'text-emerald-400 font-medium', dotClass: 'bg-emerald-400 animate-pulse' }
  }
  if (diffHours < 24) {
    const timeStr = new Date(lastUpdated).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    return { label: `Bugün ${timeStr}`, colorClass: 'text-emerald-400', dotClass: 'bg-emerald-400' }
  }
  if (diffDays === 1) {
    return { label: 'Dün', colorClass: 'text-amber-400', dotClass: 'bg-amber-400' }
  }
  return {
    label: `${diffDays}g önce`,
    colorClass: 'text-rose-400',
    dotClass: 'bg-rose-400',
  }
}

const CATEGORIES = [
  'Tümü',
  'Hisse Senedi (BIST)',
  'Emtia & Altın',
  'Yatırım Fonu (TEFAS)',
  'Döviz',
  'Kripto Para',
  'BES / Emeklilik',
  'Diğer',
] as const

const COMMON_PRESETS = [
  { name: 'Gram Altın', symbol: 'GRAM_ALTIN', category: 'Emtia & Altın' },
  { name: 'Çeyrek Altın', symbol: 'CEYREK_ALTIN', category: 'Emtia & Altın' },
  { name: 'Türk Hava Yolları', symbol: 'THYAO', category: 'Hisse Senedi (BIST)' },
  { name: 'Aselsan', symbol: 'ASELS', category: 'Hisse Senedi (BIST)' },
  { name: 'Ereğli Demir Çelik', symbol: 'EREGL', category: 'Hisse Senedi (BIST)' },
  { name: 'Tüpraş', symbol: 'TUPRS', category: 'Hisse Senedi (BIST)' },
  { name: 'Amerikan Doları', symbol: 'USD', category: 'Döviz' },
  { name: 'Euro', symbol: 'EUR', category: 'Döviz' },
  { name: 'Bitcoin', symbol: 'BTC', category: 'Kripto Para' },
  { name: 'Ethereum', symbol: 'ETH', category: 'Kripto Para' },
]

function InvestmentsContent() {
  const searchParams = useSearchParams()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [searchQuery, setSearchQuery] = useState('')
  const [isDbFallback, setIsDbFallback] = useState(false)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Investment | null>(null)
  const [formName, setFormName] = useState('')
  const [formSymbol, setFormSymbol] = useState('')
  const [formCategory, setFormCategory] = useState<string>('Hisse Senedi (BIST)')
  const [formInstitution, setFormInstitution] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formUnitCost, setFormUnitCost] = useState('')
  const [formCurrentPrice, setFormCurrentPrice] = useState('')
  const [formNote, setFormNote] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [priceNotice, setPriceNotice] = useState<string | null>(null)

  // Quick Inline Price Update Modal
  const [quickUpdateItem, setQuickUpdateItem] = useState<Investment | null>(null)
  const [quickNewPrice, setQuickNewPrice] = useState('')

  // Autocomplete Suggestions State
  const [catalogSuggestions, setCatalogSuggestions] = useState<CatalogAsset[]>([])
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false)

  // DCA (Kademeli Alım) Modal State
  const [dcaItem, setDcaItem] = useState<Investment | null>(null)
  const [dcaAddedQty, setDcaAddedQty] = useState('')
  const [dcaUnitPrice, setDcaUnitPrice] = useState('')
  const [dcaSubmitting, setDcaSubmitting] = useState(false)

  useEffect(() => {
    loadInvestments()
    if (searchParams.get('new') === 'true') {
      handleOpenAddModal()
    }
  }, [])

  async function loadInvestments() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Investments table query note:', error.message)
      // Fallback to localStorage if table migration not yet run in remote Supabase
      setIsDbFallback(true)
      const cached = localStorage.getItem('pusula_local_investments')
      if (cached) {
        try {
          setInvestments(JSON.parse(cached))
        } catch {
          setInvestments([])
        }
      } else {
        // Provide starter mock data for instant preview if empty
        const initialSample: Investment[] = [
          {
            id: 'demo-1',
            user_id: 'local',
            name: 'Gram Altın',
            symbol: 'GRAM_ALTIN',
            category: 'Emtia & Altın',
            institution: 'Fiziki Kasa',
            quantity: 25,
            unit_cost: 2950,
            current_price: 3450,
            currency: 'TRY',
            last_price_updated_at: new Date().toISOString(),
            note: 'Uzun vadeli tasarruf',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'demo-2',
            user_id: 'local',
            name: 'Türk Hava Yolları',
            symbol: 'THYAO',
            category: 'Hisse Senedi (BIST)',
            institution: 'Midas',
            quantity: 150,
            unit_cost: 265,
            current_price: 304.5,
            currency: 'TRY',
            last_price_updated_at: new Date().toISOString(),
            note: 'BIST temettü & büyüme',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
        setInvestments(initialSample)
        localStorage.setItem('pusula_local_investments', JSON.stringify(initialSample))
      }
    } else if (data) {
      setInvestments(data)
      setIsDbFallback(false)
      localStorage.setItem('pusula_local_investments', JSON.stringify(data))
    }
    setLoading(false)
  }

  // Save to local cache helper
  const syncLocal = (items: Investment[]) => {
    setInvestments(items)
    localStorage.setItem('pusula_local_investments', JSON.stringify(items))
  }

  // Bulk Refresh All Live Prices
  const handleRefreshAllPrices = async () => {
    if (investments.length === 0) return
    setRefreshing(true)

    try {
      const itemsToFetch = investments.map((inv) => ({
        id: inv.id,
        symbol: inv.symbol || inv.name,
        name: inv.name,
        category: inv.category,
      }))

      const res = await fetch('/api/market-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToFetch }),
      })

      const data = await res.json()
      if (data.success && data.results) {
        const updatedList = investments.map((inv) => {
          const match = data.results[inv.id] || data.results[inv.symbol || '']
          if (match && match.price > 0) {
            return {
              ...inv,
              current_price: match.price,
              last_price_updated_at: new Date().toISOString(),
            }
          }
          return inv
        })

        // Save to DB or local storage
        if (!isDbFallback) {
          const supabase = createClient()
          for (const item of updatedList) {
            await supabase
              .from('investments')
              .update({
                current_price: item.current_price,
                last_price_updated_at: item.last_price_updated_at,
              })
              .eq('id', item.id)
          }
        }
        syncLocal(updatedList)
      }
    } catch (err) {
      console.error('Error refreshing prices:', err)
    } finally {
      setRefreshing(false)
    }
  }

  // Fetch single live price inside modal
  const handleFetchLivePrice = async () => {
    const query = formSymbol || formName
    if (!query) return

    setFetchingPrice(true)
    setPriceNotice(null)

    try {
      const res = await fetch(
        `/api/market-prices?symbol=${encodeURIComponent(query)}&category=${encodeURIComponent(
          formCategory
        )}`
      )
      const data = await res.json()
      if (data.success && data.price > 0) {
        setFormCurrentPrice(data.price.toString())
        setPriceNotice(`Piyasadan canlı fiyat çekildi: ₺${data.price}`)
      } else {
        setPriceNotice('Canlı fiyat bulunamadı, lütfen elle giriniz.')
      }
    } catch (err) {
      setPriceNotice('Fiyat servisine erişilemedi.')
    } finally {
      setFetchingPrice(false)
    }
  }

  const handleOpenAddModal = () => {
    setEditingItem(null)
    setFormName('')
    setFormSymbol('')
    setFormCategory('Hisse Senedi (BIST)')
    setFormInstitution('')
    setFormQuantity('')
    setFormUnitCost('')
    setFormCurrentPrice('')
    setFormNote('')
    setPriceNotice(null)
    setCatalogSuggestions([])
    setShowCatalogDropdown(false)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (item: Investment) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormSymbol(item.symbol || '')
    setFormCategory(item.category)
    setFormInstitution(item.institution || '')
    setFormQuantity(item.quantity.toString())
    setFormUnitCost(item.unit_cost.toString())
    setFormCurrentPrice(item.current_price.toString())
    setFormNote(item.note || '')
    setPriceNotice(null)
    setCatalogSuggestions([])
    setShowCatalogDropdown(false)
    setIsModalOpen(true)
  }

  const handleNameChange = (val: string) => {
    setFormName(val)
    if (val.trim().length >= 1) {
      const results = searchAssetCatalog(val, formCategory)
      setCatalogSuggestions(results)
      setShowCatalogDropdown(results.length > 0)
    } else {
      setCatalogSuggestions([])
      setShowCatalogDropdown(false)
    }
  }

  const handleSymbolChange = (val: string) => {
    const sym = val.toUpperCase()
    setFormSymbol(sym)
    if (sym.trim().length >= 1) {
      const results = searchAssetCatalog(sym, formCategory)
      setCatalogSuggestions(results)
      setShowCatalogDropdown(results.length > 0)
    } else {
      setCatalogSuggestions([])
      setShowCatalogDropdown(false)
    }
  }

  const handleSelectCatalogItem = (item: CatalogAsset) => {
    setFormName(item.name)
    setFormSymbol(item.symbol)
    setFormCategory(item.category)
    if (item.defaultInstitution && !formInstitution) {
      setFormInstitution(item.defaultInstitution)
    }
    setShowCatalogDropdown(false)
    setCatalogSuggestions([])

    // Automatically trigger live price fetch
    fetch(
      `/api/market-prices?symbol=${encodeURIComponent(item.symbol)}&category=${encodeURIComponent(
        item.category
      )}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.price) {
          setFormCurrentPrice(d.price.toString())
          setPriceNotice(`Canlı piyasa fiyatı aktarıldı: ₺${d.price}`)
        }
      })
      .catch(() => {})
  }

  const handleOpenDcaModal = (item: Investment) => {
    setDcaItem(item)
    setDcaAddedQty('')
    setDcaUnitPrice(item.current_price > 0 ? item.current_price.toString() : item.unit_cost.toString())
  }

  const handleSaveDca = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dcaItem) return
    const addedQty = parseFloat(dcaAddedQty.replace(',', '.'))
    const purchasePrice = parseFloat(dcaUnitPrice.replace(',', '.'))

    if (isNaN(addedQty) || addedQty <= 0 || isNaN(purchasePrice) || purchasePrice <= 0) {
      alert('Lütfen geçerli bir miktar ve alış fiyatı giriniz.')
      return
    }

    setDcaSubmitting(true)
    try {
      const dcaResult = calculateDcaAverageCost(
        dcaItem.quantity,
        dcaItem.unit_cost,
        addedQty,
        purchasePrice
      )

      if (!isDbFallback) {
        const supabase = createClient()
        const { error } = await supabase
          .from('investments')
          .update({
            quantity: dcaResult.newQuantity,
            unit_cost: dcaResult.newUnitCost,
            current_price: purchasePrice,
            last_price_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', dcaItem.id)

        if (error) throw error
        await loadInvestments()
      } else {
        const updated = investments.map((inv) =>
          inv.id === dcaItem.id
            ? {
                ...inv,
                quantity: dcaResult.newQuantity,
                unit_cost: dcaResult.newUnitCost,
                current_price: purchasePrice,
                last_price_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : inv
        )
        syncLocal(updated)
      }

      setDcaItem(null)
    } catch (err: any) {
      alert(err.message || 'Kademeli alım kaydedilemedi.')
    } finally {
      setDcaSubmitting(false)
    }
  }

  const handlePresetSelect = (preset: typeof COMMON_PRESETS[0]) => {
    setFormName(preset.name)
    setFormSymbol(preset.symbol)
    setFormCategory(preset.category)
    // Auto-fetch price
    fetch(
      `/api/market-prices?symbol=${encodeURIComponent(preset.symbol)}&category=${encodeURIComponent(
        preset.category
      )}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.price) {
          setFormCurrentPrice(d.price.toString())
          setPriceNotice(`Canlı piyasa fiyatı aktarıldı: ₺${d.price}`)
        }
      })
      .catch(() => {})
  }

  const handleSaveInvestment = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const qty = parseFloat(formQuantity.replace(',', '.')) || 0
    const cost = parseFloat(formUnitCost.replace(',', '.')) || 0
    const price = parseFloat(formCurrentPrice.replace(',', '.')) || cost

    const payload = {
      user_id: user?.id || 'local',
      name: formName,
      symbol: formSymbol.toUpperCase() || null,
      category: formCategory,
      institution: formInstitution || null,
      quantity: qty,
      unit_cost: cost,
      current_price: price,
      currency: 'TRY',
      note: formNote || null,
      last_price_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (!isDbFallback && user) {
      if (editingItem) {
        await supabase.from('investments').update(payload).eq('id', editingItem.id)
      } else {
        await supabase.from('investments').insert(payload)
      }
      loadInvestments()
    } else {
      // Local storage fallback
      let updated: Investment[]
      if (editingItem) {
        updated = investments.map((inv) =>
          inv.id === editingItem.id ? ({ ...inv, ...payload } as Investment) : inv
        )
      } else {
        const newItem: Investment = {
          ...payload,
          id: `inv-${Date.now()}`,
          created_at: new Date().toISOString(),
        } as Investment
        updated = [newItem, ...investments]
      }
      syncLocal(updated)
    }

    setIsModalOpen(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu yatırım kaydını silmek istediğinize emin misiniz?')) return
    if (!isDbFallback) {
      const supabase = createClient()
      await supabase.from('investments').delete().eq('id', id)
      loadInvestments()
    } else {
      syncLocal(investments.filter((i) => i.id !== id))
    }
  }

  const handleSaveQuickPrice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickUpdateItem) return

    const newPrice = parseFloat(quickNewPrice.replace(',', '.'))
    if (isNaN(newPrice) || newPrice <= 0) return

    if (!isDbFallback) {
      const supabase = createClient()
      await supabase
        .from('investments')
        .update({
          current_price: newPrice,
          last_price_updated_at: new Date().toISOString(),
        })
        .eq('id', quickUpdateItem.id)
      loadInvestments()
    } else {
      const updated = investments.map((inv) =>
        inv.id === quickUpdateItem.id
          ? {
              ...inv,
              current_price: newPrice,
              last_price_updated_at: new Date().toISOString(),
            }
          : inv
      )
      syncLocal(updated)
    }

    setQuickUpdateItem(null)
  }

  // Filter & Search
  const filteredInvestments = investments.filter((inv) => {
    const matchesCategory =
      selectedCategory === 'Tümü' || inv.category === selectedCategory
    const matchesSearch =
      searchQuery === '' ||
      inv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.institution?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Calculate Metrics
  const metrics = calculatePortfolioMetrics(investments)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Yatırımlar & Portföy"
        description="BIST hisseleri, altın, fon ve kripto varlıklarınızı canlı piyasa fiyatlarıyla takip edin; net servetinizi büyütün."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAllPrices}
              disabled={refreshing || investments.length === 0}
              className="gap-2 h-9 text-xs font-semibold shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
              <span>{refreshing ? 'Güncelleniyor...' : '⚡ Canlı Fiyatları Güncelle'}</span>
            </Button>
            <Button onClick={handleOpenAddModal} size="sm" className="gap-2 h-9 text-xs font-semibold shadow-sm">
              <Plus className="h-4 w-4" />
              <span>+ Varlık Ekle</span>
            </Button>
          </div>
        }
      />

      {/* Hero KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Portfolio Value */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Toplam Portföy Değeri
            </CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(metrics.totalValue)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.assetCount} farklı yatırım kalemi üzerinden
            </p>
          </CardContent>
        </Card>

        {/* Total Invested Capital */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Yatırılan Toplam Maliyet
            </CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-muted-foreground">
              {formatCurrency(metrics.totalCost)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ortalama alış maliyeti toplamı
            </p>
          </CardContent>
        </Card>

        {/* Net Profit / Loss */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Net Kâr / Zarar & Getiri
            </CardTitle>
            {metrics.totalProfitLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${
                metrics.totalProfitLoss >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {metrics.totalProfitLoss >= 0 ? '+' : ''}
              {formatCurrency(metrics.totalProfitLoss)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              <Badge
                variant={metrics.totalProfitLoss >= 0 ? 'success' : 'destructive'}
                className="text-[10px] font-mono px-1.5 py-0"
              >
                {metrics.totalProfitLossPct >= 0 ? '+' : ''}
                %{metrics.totalProfitLossPct.toFixed(2)}
              </Badge>
              <span className="text-muted-foreground text-[11px]">toplam getiri</span>
            </div>
          </CardContent>
        </Card>

        {/* Allocation Bar */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Varlık Dağılımı
            </CardTitle>
            <PieChart className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/50 mt-1">
              {metrics.categoryAllocations.map((alloc, idx) => {
                const colors = [
                  'bg-amber-400',
                  'bg-blue-500',
                  'bg-emerald-500',
                  'bg-purple-500',
                  'bg-cyan-400',
                  'bg-rose-400',
                ]
                return (
                  <div
                    key={alloc.category}
                    style={{ width: `${alloc.pct}%` }}
                    className={`${colors[idx % colors.length]} transition-all`}
                    title={`${alloc.category}: %${alloc.pct.toFixed(1)}`}
                  />
                )
              })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {metrics.categoryAllocations.slice(0, 3).map((a, i) => (
                <span key={a.category} className="flex items-center gap-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ['bg-amber-400', 'bg-blue-500', 'bg-emerald-500'][i]
                    }`}
                  />
                  <span>{a.category.split(' ')[0]}: %{a.pct.toFixed(0)}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Scrollable Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Varlık veya kurum ara..."
            className="pl-8 h-8 text-xs bg-muted/30"
          />
        </div>
      </div>

      {/* Asset Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase font-semibold text-[11px]">
              <tr>
                <th className="p-3.5">Varlık / Enstrüman</th>
                <th className="p-3.5">Kategori & Kurum</th>
                <th className="p-3.5 text-right">Miktar / Adet</th>
                <th className="p-3.5 text-right">Alış Fiyatı</th>
                <th className="p-3.5 text-right">Güncel Fiyat</th>
                <th className="p-3.5 text-right">Toplam Değer</th>
                <th className="p-3.5 text-right">Kâr / Zarar</th>
                <th className="p-3.5 text-center">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {filteredInvestments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground font-sans">
                    <p className="text-sm font-semibold text-foreground">Henüz yatırım kaydı bulunmuyor.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sağ üstteki <strong>"+ Varlık Ekle"</strong> butonunu kullanarak portföyünüzü oluşturun.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvestments.map((inv) => {
                  const val = round2(inv.quantity * inv.current_price)
                  const cost = round2(inv.quantity * inv.unit_cost)
                  const pnl = round2(val - cost)
                  const pnlPct = cost > 0 ? round2((pnl / cost) * 100) : 0

                  return (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      {/* Name & Symbol */}
                      <td className="p-3.5 font-sans">
                        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                          <span>{inv.name}</span>
                          {inv.symbol && (
                            <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">
                              {inv.symbol}
                            </Badge>
                          )}
                        </div>
                        {inv.note && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[180px] mt-0.5">
                            {inv.note}
                          </div>
                        )}
                      </td>

                      {/* Category & Institution */}
                      <td className="p-3.5 font-sans">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {inv.category}
                          </Badge>
                          {inv.institution && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                              • {inv.institution}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="p-3.5 text-right font-semibold text-foreground">
                        {inv.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                      </td>

                      {/* Unit Cost */}
                      <td className="p-3.5 text-right text-muted-foreground">
                        {formatCurrency(inv.unit_cost)}
                      </td>

                      {/* Current Price & Freshness Badge */}
                      <td className="p-3.5 text-right font-bold text-foreground">
                        <button
                          onClick={() => {
                            setQuickUpdateItem(inv)
                            setQuickNewPrice(inv.current_price.toString())
                          }}
                          className="hover:underline hover:text-primary transition-colors cursor-pointer"
                          title="Fiyatı hızlıca güncellemek için tıklayın"
                        >
                          {formatCurrency(inv.current_price)}
                        </button>
                        {(() => {
                          const freshness = getPriceFreshness(inv.last_price_updated_at)
                          return (
                            <div
                              className="flex items-center justify-end gap-1 text-[10px] mt-0.5"
                              title={`Son güncelleme: ${
                                inv.last_price_updated_at
                                  ? new Date(inv.last_price_updated_at).toLocaleString('tr-TR')
                                  : 'Bilinmiyor'
                              }`}
                            >
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${freshness.dotClass}`} />
                              <span className={freshness.colorClass}>{freshness.label}</span>
                            </div>
                          )
                        })()}
                      </td>

                      {/* Total Value */}
                      <td className="p-3.5 text-right font-bold text-foreground">
                        {formatCurrency(val)}
                      </td>

                      {/* PnL */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div
                          className={`font-bold ${
                            pnl >= 0 ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {formatCurrency(pnl)}
                        </div>
                        <div
                          className={`text-[10px] ${
                            pnl >= 0 ? 'text-success/80' : 'text-destructive/80'
                          }`}
                        >
                          {pnlPct >= 0 ? '+' : ''}
                          %{pnlPct.toFixed(2)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center font-sans">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDcaModal(inv)}
                            className="h-7 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                            title="Kademeli alım ekle (Ağırlıklı ortalama maliyeti otomatik hesaplar)"
                          >
                            <Layers className="h-3 w-3" />
                            <span>+ Kademe</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setQuickUpdateItem(inv)
                              setQuickNewPrice(inv.current_price.toString())
                            }}
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title="Fiyat Güncelle"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(inv)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Düzenle"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(inv.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add / Edit Investment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Yatırımı Düzenle' : 'Yeni Yatırım / Varlık Ekle'}
      >
        <form onSubmit={handleSaveInvestment} className="space-y-4">
          {/* Quick Presets (Only for New Item) */}
          {!editingItem && (
            <div className="space-y-1.5 pb-2 border-b border-border/50">
              <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span>Hızlı Seçim (Hazır Şablonlar)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PRESETS.map((p) => (
                  <button
                    key={p.symbol}
                    type="button"
                    onClick={() => handlePresetSelect(p)}
                    className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-foreground hover:bg-primary/10 hover:border-primary transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name & Symbol with Autocomplete */}
          <div className="relative">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Varlık / Şirket Adı</label>
                  <span className="text-[10px] text-muted-foreground">Akıllı Arama Aktif</span>
                </div>
                <Input
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Örn: Türk Hava Yolları, Gram Altın, Koç..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Sembol / Kod</label>
                <Input
                  value={formSymbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  placeholder="THYAO, BTC"
                />
              </div>
            </div>

            {/* Catalog Autocomplete Suggestions Dropdown */}
            {showCatalogDropdown && catalogSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                <div className="p-1.5 text-[10px] uppercase font-semibold text-muted-foreground bg-muted/40 border-b border-border/40 flex items-center justify-between">
                  <span>Önerilen Varlıklar (Katalog)</span>
                  <span>{catalogSuggestions.length} eşleşme</span>
                </div>
                <div className="divide-y divide-border/30">
                  {catalogSuggestions.map((item) => (
                    <button
                      key={`${item.category}-${item.symbol}`}
                      type="button"
                      onClick={() => handleSelectCatalogItem(item)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/70 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] group-hover:border-primary group-hover:text-primary">
                          {item.symbol}
                        </Badge>
                        <span className="font-semibold text-foreground">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{item.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Category & Institution */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kategori</label>
              <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                {CATEGORIES.filter((c) => c !== 'Tümü').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kurum / Cüzdan / Banka</label>
              <Input
                value={formInstitution}
                onChange={(e) => setFormInstitution(e.target.value)}
                placeholder="Örn: Midas, Garanti, Fiziki..."
              />
            </div>
          </div>

          {/* Quantity, Cost, Current Price */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Miktar / Adet</label>
              <Input
                type="number"
                step="any"
                value={formQuantity}
                onChange={(e) => setFormQuantity(e.target.value)}
                placeholder="Örn: 100"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Alış Maliyeti (₺)</label>
              <Input
                type="number"
                step="any"
                value={formUnitCost}
                onChange={(e) => setFormUnitCost(e.target.value)}
                placeholder="Birim alış"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Güncel Fiyat (₺)</label>
                <button
                  type="button"
                  onClick={handleFetchLivePrice}
                  disabled={fetchingPrice || (!formSymbol && !formName)}
                  className="text-[10px] text-primary font-semibold hover:underline"
                >
                  {fetchingPrice ? 'Çekiliyor...' : '⚡ Canlı Çek'}
                </button>
              </div>
              <Input
                type="number"
                step="any"
                value={formCurrentPrice}
                onChange={(e) => setFormCurrentPrice(e.target.value)}
                placeholder="Birim piyasa"
                required
              />
            </div>
          </div>

          {priceNotice && (
            <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 p-2 rounded-md">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>{priceNotice}</span>
            </div>
          )}

          {/* Real-time preview */}
          {formQuantity && formUnitCost && formCurrentPrice && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Toplam Yatırılan Maliyet:</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatCurrency(
                    (parseFloat(formQuantity.replace(',', '.')) || 0) *
                      (parseFloat(formUnitCost.replace(',', '.')) || 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Güncel Toplam Değer:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(
                    (parseFloat(formQuantity.replace(',', '.')) || 0) *
                      (parseFloat(formCurrentPrice.replace(',', '.')) || 0)
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Not (İsteğe Bağlı)</label>
            <Input
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Hedef fiyat veya alım notu..."
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" size="sm" className="font-semibold">
              {editingItem ? 'Güncellemeleri Kaydet' : 'Varlığı Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick Single Price Update Modal */}
      {quickUpdateItem && (
        <Modal
          isOpen={!!quickUpdateItem}
          onClose={() => setQuickUpdateItem(null)}
          title={`Hızlı Fiyat Güncelle: ${quickUpdateItem.name}`}
        >
          <form onSubmit={handleSaveQuickPrice} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              <strong>{quickUpdateItem.name}</strong> için güncel birim piyasa fiyatını giriniz:
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Yeni Birim Fiyat (₺)</label>
              <Input
                type="number"
                step="any"
                value={quickNewPrice}
                onChange={(e) => setQuickNewPrice(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickUpdateItem(null)}>
                Vazgeç
              </Button>
              <Button type="submit" size="sm" className="font-semibold">
                Fiyatı Güncelle
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* DCA (Kademeli Alım) Modal */}
      {dcaItem && (
        <Modal
          isOpen={!!dcaItem}
          onClose={() => setDcaItem(null)}
          title={`Kademeli Alım (Ağırlıklı Maliyet Sihirbazı): ${dcaItem.name}`}
        >
          {(() => {
            const addedQtyNum = parseFloat(dcaAddedQty.replace(',', '.')) || 0
            const unitPriceNum = parseFloat(dcaUnitPrice.replace(',', '.')) || 0
            const hasValidInputs = addedQtyNum > 0 && unitPriceNum > 0
            const dcaRes = hasValidInputs
              ? calculateDcaAverageCost(dcaItem.quantity, dcaItem.unit_cost, addedQtyNum, unitPriceNum)
              : null

            const costDiff = dcaRes ? round2(dcaRes.newUnitCost - dcaItem.unit_cost) : 0

            return (
              <form onSubmit={handleSaveDca} className="space-y-4">
                {/* Mevcut Durum Kartı */}
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                    <span>Mevcut Portföy Pozisyonu</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-sans">Mevcut Adet</span>
                      <span className="font-semibold text-foreground">
                        {dcaItem.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-sans">Birim Maliyet</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(dcaItem.unit_cost)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-sans">Toplam Maliyet</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(round2(dcaItem.quantity * dcaItem.unit_cost))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Yeni Alım Bilgileri */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Alınan Yeni Miktar / Adet</label>
                    <Input
                      type="number"
                      step="any"
                      value={dcaAddedQty}
                      onChange={(e) => setDcaAddedQty(e.target.value)}
                      placeholder="Örn: 50"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Alış Fiyatı (₺)</label>
                      {dcaItem.current_price > 0 && (
                        <button
                          type="button"
                          onClick={() => setDcaUnitPrice(dcaItem.current_price.toString())}
                          className="text-[10px] text-primary font-semibold hover:underline"
                        >
                          ⚡ Canlı Fiyat ({formatCurrency(dcaItem.current_price)})
                        </button>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="any"
                      value={dcaUnitPrice}
                      onChange={(e) => setDcaUnitPrice(e.target.value)}
                      placeholder="Birim alış fiyatı"
                      required
                    />
                  </div>
                </div>

                {/* Canlı DCA Hesaplama Sonuç Kartı */}
                {dcaRes && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs space-y-2">
                    <div className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Yeni Ağırlıklı Ortalama Maliyet Sonucu</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-background/70 p-2.5 rounded border border-border/50">
                        <span className="text-muted-foreground block text-[11px]">Yeni Toplam Adet</span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {dcaRes.newQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-[10px] text-emerald-400 block font-mono">
                          (+{addedQtyNum.toLocaleString('tr-TR')} adet eklendi)
                        </span>
                      </div>
                      <div className="bg-background/70 p-2.5 rounded border border-border/50">
                        <span className="text-muted-foreground block text-[11px]">Yeni Ortalama Maliyet</span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {formatCurrency(dcaRes.newUnitCost)}
                        </span>
                        <span
                          className={`text-[10px] block font-mono ${
                            costDiff <= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {costDiff > 0
                            ? `+${formatCurrency(costDiff)} maliyet yükseldi`
                            : costDiff < 0
                            ? `${formatCurrency(costDiff)} maliyet düştü`
                            : 'Maliyet değişmedi'}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                      <span className="font-sans">Eklenen Yeni Sermaye:</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(round2(addedQtyNum * unitPriceNum))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono">
                      <span className="font-sans">Yeni Toplam Maliyet Havuzu:</span>
                      <span className="font-bold text-foreground">
                        {formatCurrency(dcaRes.totalCost)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDcaItem(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={dcaSubmitting || !hasValidInputs}
                    className="font-semibold gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{dcaSubmitting ? 'Kaydediliyor...' : 'Kademeyi Kaydet & Portföyü Güncelle'}</span>
                  </Button>
                </div>
              </form>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}

export default function InvestmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Yatırım ve portföy verileri yükleniyor...
        </div>
      }
    >
      <InvestmentsContent />
    </Suspense>
  )
}

