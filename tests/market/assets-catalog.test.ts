import { describe, it, expect } from 'vitest'
import { searchAssetCatalog, ASSET_CATALOG } from '@/lib/market/assets-catalog'

describe('Assets Catalog Tests', () => {
  describe('searchAssetCatalog', () => {
    it('searchAssetCatalog("altın") sonuç döndürmeli', () => {
      const results = searchAssetCatalog('altın')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].name.toLowerCase()).toContain('altın')
    })

    it('searchAssetCatalog("THYAO") sembol ile arama çalışmalı', () => {
      const results = searchAssetCatalog('THYAO')
      expect(results.length).toBeGreaterThan(0)
      expect(results.some(r => r.symbol === 'THYAO')).toBe(true)
    })

    it('searchAssetCatalog kategori filtresi ile çalışmalı', () => {
      const results = searchAssetCatalog('altın', 'Emtia & Altın')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.category === 'Emtia & Altın')).toBe(true)

      const emptyResults = searchAssetCatalog('altın', 'Kripto Para')
      expect(emptyResults.length).toBe(0)
    })

    it('searchAssetCatalog maxResults limitine uymalı', () => {
      const results = searchAssetCatalog('a', 'Tümü', 2)
      expect(results.length).toBe(2)
    })

    it('searchAssetCatalog("") boş sorguda boş dizi döndürmeli', () => {
      const results = searchAssetCatalog('')
      expect(results.length).toBe(0)
    })

    it('ASSET_CATALOG en az 20 varlık içermeli', () => {
      expect(ASSET_CATALOG.length).toBeGreaterThanOrEqual(20)
    })

    it('Her varlığın name, symbol ve category özellikleri olmalı', () => {
      ASSET_CATALOG.forEach(asset => {
        expect(asset.name).toBeDefined()
        expect(asset.symbol).toBeDefined()
        expect(asset.category).toBeDefined()
        expect(typeof asset.name).toBe('string')
        expect(typeof asset.symbol).toBe('string')
        expect(typeof asset.category).toBe('string')
      })
    })
  })
})
