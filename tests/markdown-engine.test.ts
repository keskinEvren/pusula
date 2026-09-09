import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  countMarkdownStats,
  readMarkdownFile,
  copyMarkdownToClipboard,
  exportMarkdownFile,
} from '../src/lib/markdown-utils'

describe('Markdown Engine & Utilities', () => {
  describe('countMarkdownStats', () => {
    it('boş veya tanımsız içerik için sıfır istatistik üretir', () => {
      expect(countMarkdownStats('')).toEqual({
        charCount: 0,
        wordCount: 0,
        readingTime: 1,
      })
      expect(countMarkdownStats('   ')).toEqual({
        charCount: 0,
        wordCount: 0,
        readingTime: 1,
      })
    })

    it('kelime, karakter ve okuma süresini doğru hesaplar', () => {
      const sampleText = '# Proje Şartnamesi\n\nBu bir test dokümanıdır. Üçüncü cümle buradadır.'
      const stats = countMarkdownStats(sampleText)

      expect(stats.charCount).toBe(sampleText.length)
      expect(stats.wordCount).toBe(10)
      expect(stats.readingTime).toBe(1)
    })

    it('uzun metinlerde tahmini okuma süresini orantılı artırır', () => {
      const words = Array.from({ length: 450 }, (_, i) => `kelime${i}`).join(' ')
      const stats = countMarkdownStats(words)

      expect(stats.wordCount).toBe(450)
      expect(stats.readingTime).toBe(3) // 450 / 200 = 2.25 -> ceil = 3
    })
  })

  describe('readMarkdownFile', () => {
    it('.md ve .txt dosyalarını metin olarak okur', async () => {
      const mockFile = {
        name: 'spec.md',
        text: vi.fn().mockResolvedValue('# Hello World'),
      } as unknown as File

      const result = await readMarkdownFile(mockFile)
      expect(result).toBe('# Hello World')
    })

    it('.markdown uzantısını kabul eder', async () => {
      const mockFile = {
        name: 'readme.markdown',
        text: vi.fn().mockResolvedValue('Content'),
      } as unknown as File

      const result = await readMarkdownFile(mockFile)
      expect(result).toBe('Content')
    })

    it('desteklenmeyen uzantılarda hata fırlatır', async () => {
      const mockFile = {
        name: 'report.pdf',
        text: vi.fn(),
      } as unknown as File

      await expect(readMarkdownFile(mockFile)).rejects.toThrow(
        'Yalnızca .md, .markdown veya .txt uzantılı metin dosyaları yüklenebilir.'
      )
    })
  })

  describe('copyMarkdownToClipboard', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      ;(global as any).window = {}
    })

    afterEach(() => {
      delete (global as any).window
    })

    it('clipboard API mevcut olduğunda panoya yazar', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, { clipboard: { writeText } })

      const success = await copyMarkdownToClipboard('# Markdown text')
      expect(success).toBe(true)
      expect(writeText).toHaveBeenCalledWith('# Markdown text')
    })

    it('clipboard yazma hatasında false döner', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
      Object.assign(navigator, { clipboard: { writeText } })

      const success = await copyMarkdownToClipboard('# Markdown text')
      expect(success).toBe(false)
    })
  })

  describe('exportMarkdownFile', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      ;(global as any).window = {}
    })

    afterEach(() => {
      delete (global as any).window
      delete (global as any).document
      delete (global as any).URL
    })

    it('dosya adının sonuna .md ekleyerek indirme tetikler', () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:test-url')
      const revokeObjectURL = vi.fn()
      ;(global as any).URL = {
        createObjectURL,
        revokeObjectURL,
      }

      const clickSpy = vi.fn()
      const mockAnchor = {
        href: '',
        download: '',
        click: clickSpy,
      }

      ;(global as any).document = {
        createElement: vi.fn().mockReturnValue(mockAnchor),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      }

      exportMarkdownFile('yeni-proje', '# Başlık')

      expect(mockAnchor.download).toBe('yeni-proje.md')
      expect(mockAnchor.href).toBe('blob:test-url')
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
    })

    it('SSR ortamında (window yokken) güvenle çalışır ve hata fırlatmaz', () => {
      delete (global as any).window
      expect(() => exportMarkdownFile('test', 'content')).not.toThrow()
    })
  })
})
