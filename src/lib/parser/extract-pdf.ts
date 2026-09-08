import { repairTurkishPdfText } from './turkish-cleaner'
import { isAxessPage, decodeAxess } from './axess-decoder'

export async function extractTextFromPDF(file: File | ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')

  // Set worker source
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  const arrayBuffer =
    typeof (file as any).arrayBuffer === 'function'
      ? await (file as any).arrayBuffer()
      : file
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise

  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    const items = textContent.items as Array<{ str: string; transform: number[]; width?: number }>

    if (isAxessPage(items)) {
      // Axess Type3 PDF:
      // 1. Filter out micro-kerning spaces (width < 1.0)
      // 2. Proximity line clustering (tolerance <= 3.0pt to bridge vertical jitter between desc & amount)
      // 3. Concatenate letters directly without artificial spaces and decode Type3 bytes
      const lineMap = new Map<number, Array<{ str: string; transform: number[] }>>()

      for (const it of items) {
        if (!it.str) continue
        if (it.str === ' ' && it.width !== undefined && it.width < 1.0) continue
        const y = it.transform[5]
        let matchedY = y
        for (const existingY of lineMap.keys()) {
          if (Math.abs(existingY - y) <= 3.0) {
            matchedY = existingY
            break
          }
        }
        if (!lineMap.has(matchedY)) lineMap.set(matchedY, [])
        lineMap.get(matchedY)!.push(it)
      }

      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)
      for (const y of sortedY) {
        const lineItems = lineMap.get(y)!.sort((a, b) => a.transform[4] - b.transform[4])
        let raw = ''
        for (const it of lineItems) raw += it.str
        const decoded = decodeAxess(raw).trim()
        if (decoded) {
          fullText += repairTurkishPdfText(decoded) + '\n'
        }
      }
    } else {
      // Standard PDFs (Enpara, Ziraat, Garanti, etc.)
      const linesMap = new Map<number, Array<{ str: string; x: number }>>()

      for (const item of items) {
        if (!item.str || !item.str.trim()) continue
        const y = Math.round(item.transform[5] / 4) * 4
        const x = item.transform[4]

        if (!linesMap.has(y)) {
          linesMap.set(y, [])
        }
        linesMap.get(y)!.push({ str: item.str, x })
      }

      const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a)

      for (const y of sortedY) {
        const lineItems = linesMap.get(y)!.sort((a, b) => a.x - b.x)
        const rawLineText = lineItems.map((i) => i.str).join(' ').trim()
        if (rawLineText) {
          const cleanedLine = repairTurkishPdfText(rawLineText)
          fullText += cleanedLine + '\n'
        }
      }
    }

    fullText += '\n--- PAGE BREAK ---\n'
  }

  if (pdf.numPages > 0 && fullText.trim().length === 0) {
    throw new Error(
      'Bu PDF metin katmanı içermeyen taranmış/resim dosyasıdır. Ziraat Bankası internet bankacılığından indirilen orijinal .html veya .xlsx dosyasını doğrudan yükleyebilirsiniz.'
    )
  }

  return fullText
}
