import { repairTurkishPdfText } from './turkish-cleaner'

export async function extractTextFromPDF(file: File | ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')

  // Set worker source
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }

  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise

  let fullText = ''

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    const items = textContent.items as Array<{ str: string; transform: number[] }>
    
    // Group text items by roughly the same Y coordinate (line), with X coordinate stored
    const linesMap = new Map<number, Array<{ str: string; x: number }>>()

    for (const item of items) {
      if (!item.str || !item.str.trim()) continue
      // transform[5] is Y coordinate, transform[4] is X coordinate
      const y = Math.round(item.transform[5] / 4) * 4 // snap to ~4px lines
      const x = item.transform[4]

      if (!linesMap.has(y)) {
        linesMap.set(y, [])
      }
      linesMap.get(y)!.push({ str: item.str, x })
    }

    // Sort lines from top (highest Y) to bottom
    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a)

    for (const y of sortedY) {
      // Sort items on the same horizontal line from left to right (X coordinate)
      const lineItems = linesMap.get(y)!.sort((a, b) => a.x - b.x)
      const rawLineText = lineItems.map((i) => i.str).join(' ').trim()
      if (rawLineText) {
        const cleanedLine = repairTurkishPdfText(rawLineText)
        fullText += cleanedLine + '\n'
      }
    }
    fullText += '\n--- PAGE BREAK ---\n'
  }

  return fullText
}
