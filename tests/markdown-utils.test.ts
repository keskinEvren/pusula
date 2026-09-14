import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  countMarkdownStats,
  readMarkdownFile,
  copyMarkdownToClipboard,
  exportMarkdownFile,
} from '@/lib/markdown-utils'

describe('markdown-utils', () => {
  describe('countMarkdownStats', () => {
    it('boş metin istatistiklerini hesaplar', () => {
      const stats = countMarkdownStats('')
      expect(stats.charCount).toBe(0)
      expect(stats.wordCount).toBe(0)
      expect(stats.readingTime).toBe(1)
    })

    it('normal metin istatistiklerini hesaplar', () => {
      const stats = countMarkdownStats('Bu bir test başlığı ve içeriğidir.')
      expect(stats.wordCount).toBe(6)
      expect(stats.readingTime).toBe(1)
    })

    it('uzun metin okuma süresini doğru hesaplar', () => {
      const text = Array(450).fill('kelime').join(' ')
      const stats = countMarkdownStats(text)
      expect(stats.wordCount).toBe(450)
      expect(stats.readingTime).toBe(3) // 450 / 200 = 2.25 -> 3
    })
  })

  describe('readMarkdownFile', () => {
    it('.md uzantılı dosyaları kabul eder', async () => {
      const file = new File(['içerik'], 'test.md', { type: 'text/markdown' })
      const content = await readMarkdownFile(file)
      expect(content).toBe('içerik')
    })

    it('.markdown uzantılı dosyaları kabul eder', async () => {
      const file = new File(['içerik'], 'test.markdown', { type: 'text/markdown' })
      const content = await readMarkdownFile(file)
      expect(content).toBe('içerik')
    })

    it('.txt uzantılı dosyaları kabul eder', async () => {
      const file = new File(['içerik'], 'test.txt', { type: 'text/plain' })
      const content = await readMarkdownFile(file)
      expect(content).toBe('içerik')
    })

    it('.pdf uzantılı dosyaları reddeder', async () => {
      const file = new File(['içerik'], 'test.pdf', { type: 'application/pdf' })
      await expect(readMarkdownFile(file)).rejects.toThrow()
    })

    it('.exe uzantılı dosyaları reddeder', async () => {
      const file = new File(['içerik'], 'test.exe', { type: 'application/x-msdownload' })
      await expect(readMarkdownFile(file)).rejects.toThrow()
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

    it('başarılı kopyalama işlemi', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, { clipboard: { writeText } })

      const result = await copyMarkdownToClipboard('metin')
      expect(result).toBe(true)
      expect(writeText).toHaveBeenCalledWith('metin')
    })

    it('API hatasında false döner', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
      Object.assign(navigator, { clipboard: { writeText } })

      const result = await copyMarkdownToClipboard('metin')
      expect(result).toBe(false)
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

    it('indirme işlemini tetikler', () => {
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

      exportMarkdownFile('test.md', 'içerik')

      expect((global as any).document.createElement).toHaveBeenCalledWith('a')
      expect(mockAnchor.href).toBe('blob:test-url')
      expect(mockAnchor.download).toBe('test.md')
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
    })

    it('SSR ortamında güvenle çalışır (hata vermez)', () => {
      delete (global as any).window
      expect(() => exportMarkdownFile('test.md', 'içerik')).not.toThrow()
    })
  })
})
