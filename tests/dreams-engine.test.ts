import { describe, it, expect } from 'vitest'
import {
  filterDreamsByHorizon,
  filterDreamsByStatus,
  calculateVisionMetrics,
  formatHorizonLabel,
  formatShortHorizonLabel,
  getDefaultVisionWallpaper,
  CURATED_VISION_WALLPAPERS,
  DREAM_HORIZONS,
} from '../src/lib/dreams-engine'
import type { Dream } from '../src/types/database'

const mockDreams: Dream[] = [
  {
    id: '1',
    user_id: 'test-user',
    title: 'Kyoto Seyahati & Taş Bahçeler',
    description: 'Sonbaharda 2 hafta',
    identity_persona: 'Kaşif & Gezgin',
    motivation_why: 'Dünyayı deneyimlemek',
    horizon: 'horizon_1_3y',
    category: 'Deneyim & Seyahat',
    status: 'active',
    next_focus_note: 'Uçak bileti fiyatlarını araştır',
    cover_image_url: 'https://example.com/kyoto.jpg',
    target_year: '2027',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    user_id: 'test-user',
    title: 'Minimalist Stüdyo & Ergonomik Setup',
    description: 'Herman Miller + 4K Monitör',
    identity_persona: 'Bağımsız Üretici',
    motivation_why: 'Beden sağlığı ve odak',
    horizon: 'horizon_1y',
    category: 'Maddi Hedef',
    status: 'active',
    next_focus_note: 'Masa ölçülerini al',
    cover_image_url: 'https://example.com/desk.jpg',
    target_year: '2026',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    user_id: 'test-user',
    title: 'Pilotluk Lisansı Deneyimi',
    description: 'Simülatör veya PPL ilk uçuş',
    identity_persona: 'Maceracı',
    motivation_why: 'Gökyüzü tutkusu',
    horizon: 'horizon_3_5y',
    category: 'Deneyim & Seyahat',
    status: 'incubating',
    next_focus_note: null,
    cover_image_url: null,
    target_year: '2029',
    achieved_at: null,
    achieved_note: null,
    achieved_image_url: null,
    order_index: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    user_id: 'test-user',
    title: '10km Maratonunu Tamamla',
    description: 'İstanbul Maratonu 10k',
    identity_persona: 'Disiplinli Sporcu',
    motivation_why: 'Fiziksel dayanıklılık',
    horizon: 'horizon_1y',
    category: 'Kişisel Gelişim & Sağlık',
    status: 'achieved',
    next_focus_note: null,
    cover_image_url: 'https://example.com/marathon.jpg',
    target_year: '2025',
    achieved_at: '2025-11-05T10:00:00Z',
    achieved_note: 'Bitiş çizgisini geçtiğim andaki his paha biçilemezdi!',
    achieved_image_url: 'https://example.com/medal.jpg',
    order_index: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

describe('Dreams & Vision Engine', () => {
  it('filtreleme: ufuklara göre doğru ayırır', () => {
    const horizon1y = filterDreamsByHorizon(mockDreams, 'horizon_1y')
    expect(horizon1y).toHaveLength(2)
    expect(horizon1y.map((d) => d.id)).toEqual(['2', '4'])

    const horizon1_3y = filterDreamsByHorizon(mockDreams, 'horizon_1_3y')
    expect(horizon1_3y).toHaveLength(1)
    expect(horizon1_3y[0].title).toContain('Kyoto')

    const all = filterDreamsByHorizon(mockDreams, 'all')
    expect(all).toHaveLength(4)
  })

  it('duruma göre filtreleme: active, incubating, achieved', () => {
    const active = filterDreamsByStatus(mockDreams, 'active')
    expect(active).toHaveLength(2)

    const incubating = filterDreamsByStatus(mockDreams, 'incubating')
    expect(incubating).toHaveLength(1)
    expect(incubating[0].title).toContain('Pilotluk')

    const achieved = filterDreamsByStatus(mockDreams, 'achieved')
    expect(achieved).toHaveLength(1)
    expect(achieved[0].achieved_note).toBeDefined()
  })

  it('metrik hesaplama: vision overview istatistiklerini tam üretir', () => {
    const metrics = calculateVisionMetrics(mockDreams)
    expect(metrics.total).toBe(4)
    expect(metrics.activeCount).toBe(2)
    expect(metrics.incubatingCount).toBe(1)
    expect(metrics.achievedCount).toBe(1)
    expect(metrics.horizonCounts.horizon_1y).toBe(1) // only active/incubating counted for future horizon distribution
    expect(metrics.horizonCounts.horizon_1_3y).toBe(1)
    expect(metrics.horizonCounts.horizon_3_5y).toBe(1)
    expect(metrics.categoryCounts['Deneyim & Seyahat']).toBe(2)
    expect(metrics.categoryCounts['Maddi Hedef']).toBe(1)
  })

  it('ufuk etiketleri ve simgeleri doğru formatlar', () => {
    expect(formatHorizonLabel('horizon_1y')).toContain('Kısa Vade')
    expect(formatHorizonLabel('horizon_lifetime')).toContain('Ömür Boyu')
    expect(formatShortHorizonLabel('horizon_1_3y')).toBe('1 - 3 Yıl')
    expect(formatHorizonLabel(null)).toContain('Orta Vade')
  })

  it('küratörlü vizyon duvar kağıtları en az 10 adet kaliteli preset içerir', () => {
    expect(CURATED_VISION_WALLPAPERS.length).toBeGreaterThanOrEqual(10)
    for (const wp of CURATED_VISION_WALLPAPERS) {
      expect(wp.url).toContain('https://')
      expect(wp.title.length).toBeGreaterThan(0)
    }
  })

  it('kategoriye göre akıllı varsayılan görsel atar', () => {
    const travelWp = getDefaultVisionWallpaper('Deneyim & Seyahat')
    expect(travelWp).toContain('unsplash')

    const deskWp = getDefaultVisionWallpaper('Maddi Hedef')
    expect(deskWp).toContain('unsplash')
  })
})
