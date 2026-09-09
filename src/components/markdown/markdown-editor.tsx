'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListTodo,
  Code,
  Table,
  Quote,
  Copy,
  Check,
  Download,
  Upload,
  Eye,
  Columns,
  FileText,
  Save,
  PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownPreview } from './markdown-preview'
import {
  exportMarkdownFile,
  readMarkdownFile,
  copyMarkdownToClipboard,
  countMarkdownStats,
} from '@/lib/markdown-utils'
import { useToast } from '@/lib/toast-context'

export type EditorMode = 'split' | 'write' | 'preview'

interface MarkdownEditorProps {
  value: string
  onChange: (val: string) => void
  onSave?: () => void | Promise<void>
  title?: string
  docName?: string
  placeholder?: string
  minHeight?: string
  autoFocus?: boolean
  readOnly?: boolean
  className?: string
  defaultMode?: EditorMode
}

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  title,
  docName = 'dokuman',
  placeholder = 'Markdown notlarınızı buraya yazın veya .md dosyanızı sürükleyip bırakın...',
  minHeight = '360px',
  autoFocus = false,
  readOnly = false,
  className = '',
  defaultMode = 'split',
}: MarkdownEditorProps) {
  const { toast } = useToast()
  const [mode, setMode] = useState<EditorMode>(defaultMode)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const stats = countMarkdownStats(value)

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (onSave && !saving) {
          try {
            setSaving(true)
            await onSave()
          } catch (err: any) {
            toast.error(err.message || 'Kaydedilemedi')
          } finally {
            setSaving(false)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSave, saving, toast])

  // Handle Tab indentation (2 spaces)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const updated = value.substring(0, start) + '  ' + value.substring(end)
      onChange(updated)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2
          textareaRef.current.selectionEnd = start + 2
        }
      })
    }
  }

  // Formatting insertions
  const insertFormatting = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.substring(start, end) || defaultText
    const replacement = `${prefix}${selected}${suffix}`
    const updated = value.substring(0, start) + replacement + value.substring(end)

    onChange(updated)

    requestAnimationFrame(() => {
      textarea.focus()
      const newCursorPos = start + prefix.length + selected.length
      textarea.selectionStart = newCursorPos
      textarea.selectionEnd = newCursorPos
    })
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!value) {
      toast.info('Kopyalanacak içerik bulunmuyor')
      return
    }
    const ok = await copyMarkdownToClipboard(value)
    if (ok) {
      setCopied(true)
      toast.success('Markdown panoya kopyalandı')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Panoya kopyalanamadı')
    }
  }

  // Export to .md file
  const handleExport = () => {
    if (!value) {
      toast.info('İndirilecek içerik bulunmuyor')
      return
    }
    exportMarkdownFile(docName, value)
    toast.success(`${docName}.md dosyası indirildi`)
  }

  // Import from file input
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await readMarkdownFile(file)
      onChange(text)
      toast.success(`${file.name} başarıyla aktarıldı`)
    } catch (err: any) {
      toast.error(err.message || 'Dosya okunamadı')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    try {
      const text = await readMarkdownFile(file)
      onChange(text)
      toast.success(`${file.name} başarıyla aktarıldı`)
    } catch (err: any) {
      toast.error(err.message || 'Dosya okunamadı')
    }
  }

  const handleSaveClick = async () => {
    if (!onSave) return
    try {
      setSaving(true)
      await onSave()
    } catch (err: any) {
      toast.error(err.message || 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden ${className}`}
    >
      {/* Top Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
        {/* Title or Label */}
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {title || 'Markdown Not & Şartname'}
          </span>
        </div>

        {/* Action Buttons & View Modes */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border/80 bg-card p-0.5">
            <button
              type="button"
              onClick={() => setMode('write')}
              title="Sadece Yaz"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                mode === 'write'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PenLine className="h-3 w-3" />
              <span>Yaz</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('split')}
              title="Yan Yana Önizleme"
              className={`hidden sm:flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                mode === 'split'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns className="h-3 w-3" />
              <span>Bölünmüş</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              title="Önizleme"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                mode === 'preview'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>Önizleme</span>
            </button>
          </div>

          <div className="h-4 w-px bg-border/80 mx-0.5" />

          {/* Import File Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
            title=".md veya .txt dosyası yükleyin"
          >
            <Upload className="h-3 w-3" />
            <span className="hidden md:inline">MD Yükle</span>
          </Button>

          {/* Export File Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
            title=".md dosyası olarak kaydedin ve indirin"
          >
            <Download className="h-3 w-3" />
            <span className="hidden md:inline">İndir</span>
          </Button>

          {/* Copy Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
            title="Panoya kopyalayın"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="hidden md:inline">{copied ? 'Kopyalandı' : 'Kopyala'}</span>
          </Button>

          {/* Optional Save Button */}
          {onSave && (
            <Button
              type="button"
              size="sm"
              onClick={handleSaveClick}
              disabled={saving}
              className="h-7 px-2.5 text-[11px] gap-1 shadow-xs ml-1"
            >
              <Save className="h-3 w-3" />
              <span>{saving ? 'Kaydediliyor...' : 'Kaydet'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Formatting Toolbar (Only visible when write or split mode is active and not readOnly) */}
      {!readOnly && mode !== 'preview' && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/50 bg-muted/15 px-3 py-1.5 text-muted-foreground">
          <button
            type="button"
            onClick={() => insertFormatting('# ', '', 'Başlık 1')}
            title="Başlık 1 (# )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('## ', '', 'Başlık 2')}
            title="Başlık 2 (## )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('### ', '', 'Başlık 3')}
            title="Başlık 3 (### )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </button>

          <div className="h-3.5 w-px bg-border/60 mx-1" />

          <button
            type="button"
            onClick={() => insertFormatting('**', '**', 'kalın metin')}
            title="Kalın (**metin**)"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('*', '*', 'eğik metin')}
            title="Eğik (*metin*)"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <div className="h-3.5 w-px bg-border/60 mx-1" />

          <button
            type="button"
            onClick={() => insertFormatting('- ', '', 'Madde')}
            title="Liste (- )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('- [ ] ', '', 'Yapılacak madde')}
            title="Checklist (- [ ] )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <ListTodo className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('> ', '', 'Alıntı')}
            title="Alıntı (> )"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>

          <div className="h-3.5 w-px bg-border/60 mx-1" />

          <button
            type="button"
            onClick={() => insertFormatting('`', '`', 'kod')}
            title="Satır içi Kod (`kod`)"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              insertFormatting(
                '\n| Parametre | Açıklama | Değer |\n| :--- | :--- | :--- |\n| Örnek | Açıklama metni | 100 |\n\n'
              )
            }
            title="Tablo Şablonu"
            className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          >
            <Table className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Editor Body */}
      <div
        className={`relative grid transition-all ${
          mode === 'split' ? 'grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/60' : 'grid-cols-1'
        }`}
        style={{ minHeight }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card/90 backdrop-blur-xs border-2 border-dashed border-primary text-foreground pointer-events-none">
            <Upload className="h-8 w-8 text-primary animate-bounce mb-2" />
            <p className="text-xs font-semibold">Dosyayı buraya bırakın (.md veya .txt)</p>
          </div>
        )}

        {/* Write Pane */}
        {(mode === 'write' || mode === 'split') && (
          <div className="relative flex flex-col h-full bg-card">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              readOnly={readOnly}
              autoFocus={autoFocus}
              className="w-full h-full p-4 bg-transparent text-xs font-mono leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden resize-none"
              style={{ minHeight }}
            />
          </div>
        )}

        {/* Preview Pane */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            className="relative flex flex-col h-full bg-muted/10 p-4 overflow-y-auto"
            style={{ minHeight, maxHeight: mode === 'split' ? '540px' : 'none' }}
          >
            <MarkdownPreview content={value} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground font-mono">
        <div className="flex items-center gap-3">
          <span>{stats.wordCount} kelime</span>
          <span>{stats.charCount} karakter</span>
          <span>~{stats.readingTime} dk okuma</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground/80 font-sans">
          <span>Tab: 2 boşluk</span>
          <span>•</span>
          <span>Cmd/Ctrl+S: Kaydet</span>
          <span>•</span>
          <span>.md dosyasını sürükleyip bırakabilirsiniz</span>
        </div>
      </div>
    </div>
  )
}
