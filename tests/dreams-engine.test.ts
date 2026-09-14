import { describe, it, expect, vi } from 'vitest'
import {
  filterDreamsByHorizon,
  filterDreamsByStatus,
  calculateVisionMetrics,
  formatHorizonLabel,
  formatShortHorizonLabel,
  getDefaultVisionWallpaper,
  CURATED_VISION_WALLPAPERS,
  DREAM_CATEGORIES,
} from '@/lib/dreams-engine'
import type { Dream } from '@/types/database'

vi.mock('@/lib/supabase/client')

describe('dreams-engine', () => {
  const mockDreams = [
    {
      id: '1',
      user_id: 'user1',
      title: 'Dream 1',
      horizon: 'horizon_1y',
      status: 'active',
      category: 'Deneyim & Seyahat',
      created_at: '',
      updated_at: '',
    },
    {
      id: '2',
      user_id: 'user1',
      title: 'Dream 2',
      horizon: 'horizon_3_5y',
      status: 'incubating',
      category: 'Maddi Hedef',
      created_at: '',
      updated_at: '',
    },
    {
      id: '3',
      user_id: 'user1',
      title: 'Dream 3',
      horizon: 'horizon_1y',
      status: 'achieved',
      category: 'Kişisel Gelişim & Sağlık',
      created_at: '',
      updated_at: '',
    },
    {
      id: '4',
      user_id: 'user1',
      title: 'Dream 4',
      horizon: 'horizon_lifetime',
      status: 'archived',
      category: 'Diğer',
      created_at: '',
      updated_at: '',
    },
  ] as Dream[]

  describe('filterDreamsByHorizon', () => {
    it('belirli bir ufuk (horizon) değerine göre hayalleri filtrelemelidir', () => {
      const result = filterDreamsByHorizon(mockDreams, 'horizon_1y')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('1')
      expect(result[1].id).toBe('3')
    })

    it('ufuk (horizon) değeri "all" veya boş verildiğinde tüm hayalleri döndürmelidir', () => {
      const resultAll = filterDreamsByHorizon(mockDreams, 'all')
      expect(resultAll).toHaveLength(4)

      const resultEmpty = filterDreamsByHorizon(mockDreams, '')
      expect(resultEmpty).toHaveLength(4)
    })
  })

  describe('filterDreamsByStatus', () => {
    it('active, incubating ve achieved statülerine göre hayalleri filtrelemelidir', () => {
      const activeResult = filterDreamsByStatus(mockDreams, 'active')
      expect(activeResult).toHaveLength(1)
      expect(activeResult[0].id).toBe('1')

      const incubatingResult = filterDreamsByStatus(mockDreams, 'incubating')
      expect(incubatingResult).toHaveLength(1)
      expect(incubatingResult[0].id).toBe('2')

      const achievedResult = filterDreamsByStatus(mockDreams, 'achieved')
      expect(achievedResult).toHaveLength(1)
      expect(achievedResult[0].id).toBe('3')
    })

    it('archived statüsüne göre hayalleri doğru filtrelemelidir', () => {
      const archivedResult = filterDreamsByStatus(mockDreams, 'archived')
      expect(archivedResult).toHaveLength(1)
      expect(archivedResult[0].id).toBe('4')
    })
  })

  describe('calculateVisionMetrics', () => {
    it('tüm değerleri içeren bir dizi için metrikleri doğru hesaplamalıdır', () => {
      const metrics = calculateVisionMetrics(mockDreams)
      expect(metrics.total).toBe(4)
      expect(metrics.activeCount).toBe(1)
      expect(metrics.incubatingCount).toBe(1)
      expect(metrics.achievedCount).toBe(1)

      // horizonCounts includes only active & incubating
      expect(metrics.horizonCounts['horizon_1y']).toBe(1) // Dream 1 is active
      expect(metrics.horizonCounts['horizon_1_3y']).toBe(0)
      expect(metrics.horizonCounts['horizon_3_5y']).toBe(1) // Dream 2 is incubating
      expect(metrics.horizonCounts['horizon_lifetime']).toBe(0) // Dream 4 is archived, not counted

      expect(metrics.categoryCounts['Deneyim & Seyahat']).toBe(1)
      expect(metrics.categoryCounts['Maddi Hedef']).toBe(1)
      expect(metrics.categoryCounts['Kişisel Gelişim & Sağlık']).toBe(1)
      expect(metrics.categoryCounts['Diğer']).toBe(1)
    })

    it('boş bir dizi için sıfır (0) metriklerini döndürmelidir', () => {
      const metrics = calculateVisionMetrics([])
      expect(metrics.total).toBe(0)
      expect(metrics.activeCount).toBe(0)
      expect(metrics.incubatingCount).toBe(0)
      expect(metrics.achievedCount).toBe(0)
      expect(metrics.horizonCounts['horizon_1y']).toBe(0)
      expect(metrics.horizonCounts['horizon_1_3y']).toBe(0)
      expect(metrics.horizonCounts['horizon_3_5y']).toBe(0)
      expect(metrics.horizonCounts['horizon_lifetime']).toBe(0)
      expect(Object.keys(metrics.categoryCounts)).toHaveLength(0)
    })
  })

  describe('formatHorizonLabel', () => {
    it('her bir horizon anahtarı için uygun etiketi döndürmelidir', () => {
      expect(formatHorizonLabel('horizon_1y')).toBe('Kısa Vade (0 - 12 Ay)')
      expect(formatHorizonLabel('horizon_1_3y')).toBe('Orta Vade (1 - 3 Yıl)')
      expect(formatHorizonLabel('horizon_3_5y')).toBe('Uzun Vade (3 - 5 Yıl)')
      expect(formatHorizonLabel('horizon_lifetime')).toBe('Uzun Vade (Ömür Boyu)')
    })

    it('null veya undefined için varsayılan (fallback) etiketi döndürmelidir', () => {
      expect(formatHorizonLabel(null)).toBe('Orta Vade (1 - 3 Yıl)')
      expect(formatHorizonLabel(undefined)).toBe('Orta Vade (1 - 3 Yıl)')
      expect(formatHorizonLabel('unknown')).toBe('Orta Vade (1 - 3 Yıl)')
    })
  })

  describe('formatShortHorizonLabel', () => {
    it('her bir horizon anahtarı için uygun kısa etiketi döndürmelidir', () => {
      expect(formatShortHorizonLabel('horizon_1y')).toBe('0 - 12 Ay')
      expect(formatShortHorizonLabel('horizon_1_3y')).toBe('1 - 3 Yıl')
      expect(formatShortHorizonLabel('horizon_3_5y')).toBe('3 - 5 Yıl')
      expect(formatShortHorizonLabel('horizon_lifetime')).toBe('Ömür Boyu')
      expect(formatShortHorizonLabel(null)).toBe('1 - 3 Yıl')
    })
  })

  describe('getDefaultVisionWallpaper', () => {
    it('kategoriye göre uygun varsayılan duvar kağıdını döndürmelidir', () => {
      expect(getDefaultVisionWallpaper('Deneyim & Seyahat')).toBe(CURATED_VISION_WALLPAPERS[0].url)
      expect(getDefaultVisionWallpaper('Seyahat sever')).toBe(CURATED_VISION_WALLPAPERS[0].url)
      
      expect(getDefaultVisionWallpaper('Maddi Hedef')).toBe(CURATED_VISION_WALLPAPERS[2].url)
      expect(getDefaultVisionWallpaper('Ekipman')).toBe(CURATED_VISION_WALLPAPERS[2].url)
      
      expect(getDefaultVisionWallpaper('Kariyer')).toBe(CURATED_VISION_WALLPAPERS[4].url)
      expect(getDefaultVisionWallpaper('Üretim')).toBe(CURATED_VISION_WALLPAPERS[4].url)

      expect(getDefaultVisionWallpaper('Sağlık')).toBe(CURATED_VISION_WALLPAPERS[5].url)
      expect(getDefaultVisionWallpaper('Kişisel Gelişim')).toBe(CURATED_VISION_WALLPAPERS[5].url)
    })

    it('bilinmeyen kategori için varsayılan (Swiss Alps) duvar kağıdını döndürmelidir', () => {
      expect(getDefaultVisionWallpaper('Bilinmeyen Kategori')).toBe(CURATED_VISION_WALLPAPERS[1].url)
      expect(getDefaultVisionWallpaper(undefined)).toBe(CURATED_VISION_WALLPAPERS[1].url)
    })
  })

  describe('Constants', () => {
    it('CURATED_VISION_WALLPAPERS en az 10 preset (önayar) içermelidir', () => {
      expect(CURATED_VISION_WALLPAPERS.length).toBeGreaterThanOrEqual(10)
    })

    it('DREAM_CATEGORIES en az 5 kategori içermelidir', () => {
      expect(DREAM_CATEGORIES.length).toBeGreaterThanOrEqual(5)
    })
  })
})
