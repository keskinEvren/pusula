/**
 * Markdown Dosya ve Metin Yardımcıları
 */

export function exportMarkdownFile(filename: string, content: string) {
  if (typeof window === 'undefined') return
  const safeName = filename.trim() || 'dokuman'
  const finalName = safeName.endsWith('.md') ? safeName : `${safeName}.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = finalName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export async function readMarkdownFile(file: File): Promise<string> {
  const isAllowed = file.name.match(/\.(md|markdown|txt)$/i)
  if (!isAllowed) {
    throw new Error('Yalnızca .md, .markdown veya .txt uzantılı metin dosyaları yüklenebilir.')
  }
  return await file.text()
}

export async function copyMarkdownToClipboard(content: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch (err) {
    console.error('Panoya kopyalama hatası:', err)
    return false
  }
}

export function countMarkdownStats(content: string) {
  const trimmed = (content || '').trim()
  const charCount = trimmed.length
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  const readingTime = Math.max(1, Math.ceil(words / 200))
  return { charCount, wordCount: words, readingTime }
}
