'use client'

import React, { useState, useMemo } from 'react'
import {
  Search,
  Check,
  ChevronDown,
  X,
  Sparkles,
} from 'lucide-react'
import {
  ICON_MAP,
  ROUTINE_ICON_CATALOG,
  resolveIconKey,
  getIconComponent,
  IconCatalogItem,
} from '@/lib/icons'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// 1. DynamicIcon: Anahtar veya Emojiden Lucide SVG Render Eden Bileşen
// ---------------------------------------------------------------------------

export interface DynamicIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name?: string | null
  className?: string
  size?: number
}

export function DynamicIcon({ name, className = 'h-4 w-4', size, ...props }: DynamicIconProps) {
  const IconComponent = getIconComponent(name, Sparkles)
  return React.createElement(IconComponent, { className, size, ...props })
}

// ---------------------------------------------------------------------------
// 2. IconPicker: Kategorize ve Filtrelenebilir Görsel İkon Seçici
// ---------------------------------------------------------------------------

export interface IconPickerProps {
  value: string
  onChange: (iconKey: string) => void
  className?: string
  buttonClassName?: string
}

export function IconPicker({ value, onChange, className, buttonClassName }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const currentKey = resolveIconKey(value, 'sparkles')

  // Arama ve Kategoriye göre filtrelenmiş ikon listesi
  const filteredItems = useMemo(() => {
    let pool: IconCatalogItem[] = []

    if (activeCategory === 'all') {
      const seen = new Set<string>()
      for (const cat of ROUTINE_ICON_CATALOG) {
        for (const it of cat.items) {
          if (!seen.has(it.key)) {
            seen.add(it.key)
            pool.push(it)
          }
        }
      }
    } else {
      const foundCat = ROUTINE_ICON_CATALOG.find((c) => c.id === activeCategory)
      pool = foundCat ? foundCat.items : []
    }

    if (!searchQuery.trim()) return pool

    const q = searchQuery.toLowerCase().trim()
    return pool.filter(
      (item) => item.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)
    )
  }, [activeCategory, searchQuery])

  function handleSelect(itemKey: string) {
    onChange(itemKey)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-background hover:bg-muted/60 transition-colors text-xs font-medium w-full min-h-[36px] ${
          buttonClassName || ''
        }`}
        title="İkon Seç"
        aria-label="İkon Seçiciyi Aç"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0">
            <DynamicIcon name={currentKey} className="h-4 w-4" />
          </span>
          <span className="truncate text-foreground font-mono text-[11px]">{currentKey}</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false)
          setSearchQuery('')
        }}
        title="İkon Paketi & Seçici"
        size="md"
      >
        <div className="space-y-3.5 pt-1">
          {/* Arama Alanı */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="İkon veya eylem ara (örn: spor, kod, su, kitap)..."
              className="pl-8 h-9 text-xs"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Kategori Hapları */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
                activeCategory === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Tümü
            </button>
            {ROUTINE_ICON_CATALOG.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* İkon Izgarası */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[320px] overflow-y-auto p-1 pr-1.5 border border-border/50 rounded-xl bg-muted/10">
            {filteredItems.map((item) => {
              const isSelected = item.key === currentKey

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl border transition-all text-center group ${
                    isSelected
                      ? 'bg-primary/15 border-primary text-primary shadow-sm ring-1 ring-primary/40'
                      : 'bg-card/70 border-border/60 hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground'
                  }`}
                  title={`${item.label} (${item.key})`}
                >
                  <DynamicIcon
                    name={item.key}
                    className={`h-5 w-5 transition-transform group-hover:scale-110 ${
                      isSelected ? 'text-primary' : 'text-foreground/80'
                    }`}
                  />
                  <span className="text-[10px] font-medium truncate w-full leading-tight">
                    {item.label}
                  </span>
                  {isSelected && (
                    <span className="h-1 w-1 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}

            {filteredItems.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-muted-foreground">
                Aradığınız kriterlere uygun ikon bulunamadı.
              </div>
            )}
          </div>

          {/* Alt Seçim ve Kapat Barı */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Seçili:</span>
              <span className="font-mono text-primary font-semibold">{currentKey}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs h-8"
            >
              Kapat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
