import { describe, it, expect } from 'vitest'
import { calculateFileHash } from '@/lib/hash'

describe('Hash Modülü Testleri', () => {
  describe('calculateFileHash', () => {
    it('Aynı içerik için aynı deterministic hash değerini üretir', async () => {
      const hash1 = await calculateFileHash('test content')
      const hash2 = await calculateFileHash('test content')
      expect(hash1).toBe(hash2)
    })

    it('Farklı içerik için farklı hash değeri üretir', async () => {
      const hash1 = await calculateFileHash('test content 1')
      const hash2 = await calculateFileHash('test content 2')
      expect(hash1).not.toBe(hash2)
    })

    it('String girdi desteği ile doğru hash hesaplar', async () => {
      const hash = await calculateFileHash('merhaba dünya')
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256 = 64 karakter hex
    })

    it('Blob girdi desteği ile doğru hash hesaplar', async () => {
      const blob = new Blob(['blob content'])
      const hash = await calculateFileHash(blob)
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64)
    })
  })
})
