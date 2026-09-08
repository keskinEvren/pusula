/**
 * SHA-256 Content Hashing Utility
 * Uses Web Crypto API (supported natively in all modern browsers and Node 18+).
 */
export async function calculateFileHash(file: File | Blob | ArrayBuffer | string): Promise<string> {
  let buffer: ArrayBuffer

  if (typeof file === 'string') {
    buffer = new TextEncoder().encode(file).buffer
  } else if (file instanceof ArrayBuffer) {
    buffer = file
  } else if (typeof file === 'object' && file !== null && 'arrayBuffer' in file && typeof (file as any).arrayBuffer === 'function') {
    buffer = await (file as Blob).arrayBuffer()
  } else {
    throw new Error('Desteklenmeyen dosya veya veri formatı.')
  }

  const subtleCrypto = typeof crypto !== 'undefined' ? crypto.subtle : (globalThis as any).crypto?.subtle

  if (subtleCrypto) {
    const hashBuffer = await subtleCrypto.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  throw new Error('Kriptografik hash fonksiyonu (crypto.subtle) bu ortamda bulunamadı.')
}
