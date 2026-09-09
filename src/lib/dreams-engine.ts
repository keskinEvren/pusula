import type { Dream } from '@/types/database'

export type DreamHorizon = 'horizon_1y' | 'horizon_1_3y' | 'horizon_3_5y' | 'horizon_lifetime'
export type DreamStatus = 'active' | 'incubating' | 'achieved' | 'archived'

export interface VisionWallpaper {
  id: string
  title: string
  category: string
  url: string
  thumbnailUrl: string
}

export const DREAM_HORIZONS: { key: DreamHorizon; label: string; shortLabel: string; icon: string }[] = [
  { key: 'horizon_1y', label: 'Kısa Vade (0 - 12 Ay)', shortLabel: '0 - 12 Ay', icon: '' },
  { key: 'horizon_1_3y', label: 'Orta Vade (1 - 3 Yıl)', shortLabel: '1 - 3 Yıl', icon: '' },
  { key: 'horizon_3_5y', label: 'Uzun Vade (3 - 5 Yıl)', shortLabel: '3 - 5 Yıl', icon: '' },
  { key: 'horizon_lifetime', label: 'Uzun Vade (Ömür Boyu)', shortLabel: 'Ömür Boyu', icon: '' },
]

export const DREAM_CATEGORIES = [
  'Deneyim & Seyahat',
  'Maddi Hedef',
  'Kariyer & Üretim',
  'Kişisel Gelişim & Sağlık',
  'Diğer',
] as const

/**
 * Curated high-aesthetic wallpapers for 1-click cover selection
 */
export const CURATED_VISION_WALLPAPERS: VisionWallpaper[] = [
  {
    id: 'kyoto-forest',
    title: 'Kyoto Bambu Yolu',
    category: 'Deneyim & Seyahat',
    url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'swiss-alps',
    title: 'İsviçre Alpleri',
    category: 'Deneyim & Seyahat',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'minimal-workspace',
    title: 'Minimalist Çalışma Alanı',
    category: 'Maddi Hedef',
    url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'tuscany-villa',
    title: 'Toskana Taş Evi',
    category: 'Yaşam Tarzı',
    url: 'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'coffee-code',
    title: 'Bağımsız Üretim & Kahve',
    category: 'Kariyer & Üretim',
    url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'marathon-run',
    title: 'Maraton & Zirve',
    category: 'Kişisel Gelişim & Sağlık',
    url: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'cozy-library',
    title: 'Sakin Kütüphane & Kitaplar',
    category: 'Kişisel Gelişim & Sağlık',
    url: 'https://images.unsplash.com/photo-1507842229450-799a50275a5c?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507842229450-799a50275a5c?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'vintage-porsche',
    title: 'Klasik Spor Otomobil',
    category: 'Maddi Hedef',
    url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'ocean-sunset',
    title: 'Gün Batımı & Yelkenli',
    category: 'Deneyim & Seyahat',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'northern-lights',
    title: 'Kuzey Işıkları (Aurora)',
    category: 'Deneyim & Seyahat',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'modern-glass-house',
    title: 'Doğada Müstakil Ev',
    category: 'Maddi Hedef',
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'meditation-zen',
    title: 'Sabah Meditasyonu & Huzur',
    category: 'Kişisel Gelişim & Sağlık',
    url: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1600&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=400&q=80',
  },
]

/**
 * Returns formatted horizon label with icon
 */
export function formatHorizonLabel(horizon?: string | null): string {
  const found = DREAM_HORIZONS.find((h) => h.key === horizon)
  return found ? found.label : 'Orta Vade (1 - 3 Yıl)'
}

/**
 * Returns short horizon label
 */
export function formatShortHorizonLabel(horizon?: string | null): string {
  const found = DREAM_HORIZONS.find((h) => h.key === horizon)
  return found ? found.shortLabel : '1 - 3 Yıl'
}

/**
 * Filters dreams by a given horizon or 'all'
 */
export function filterDreamsByHorizon(dreams: Dream[], horizon: string): Dream[] {
  if (!horizon || horizon === 'all') return dreams
  return dreams.filter((d) => d.horizon === horizon)
}

/**
 * Filters dreams by status: 'active', 'incubating', 'achieved', 'archived'
 */
export function filterDreamsByStatus(dreams: Dream[], status: DreamStatus): Dream[] {
  return dreams.filter((d) => d.status === status)
}

export interface VisionMetrics {
  total: number
  activeCount: number
  incubatingCount: number
  achievedCount: number
  horizonCounts: Record<DreamHorizon, number>
  categoryCounts: Record<string, number>
}

/**
 * Computes high-level overview metrics for the vision board
 */
export function calculateVisionMetrics(dreams: Dream[]): VisionMetrics {
  const metrics: VisionMetrics = {
    total: dreams.length,
    activeCount: 0,
    incubatingCount: 0,
    achievedCount: 0,
    horizonCounts: {
      horizon_1y: 0,
      horizon_1_3y: 0,
      horizon_3_5y: 0,
      horizon_lifetime: 0,
    },
    categoryCounts: {},
  }

  for (const d of dreams) {
    if (d.status === 'active') metrics.activeCount++
    else if (d.status === 'incubating') metrics.incubatingCount++
    else if (d.status === 'achieved') metrics.achievedCount++

    // Only count active & incubating for horizon distributions
    if (d.status === 'active' || d.status === 'incubating') {
      if (d.horizon in metrics.horizonCounts) {
        metrics.horizonCounts[d.horizon]++
      }
    }

    const cat = d.category || 'Diğer'
    metrics.categoryCounts[cat] = (metrics.categoryCounts[cat] || 0) + 1
  }

  return metrics
}

/**
 * Returns a default fallback wallpaper if none is provided
 */
export function getDefaultVisionWallpaper(category?: string): string {
  if (category?.includes('Seyahat') || category?.includes('Deneyim')) {
    return CURATED_VISION_WALLPAPERS[0].url // Kyoto
  }
  if (category?.includes('Maddi') || category?.includes('Ekipman')) {
    return CURATED_VISION_WALLPAPERS[2].url // Workspace
  }
  if (category?.includes('Kariyer') || category?.includes('Üretim')) {
    return CURATED_VISION_WALLPAPERS[4].url // Coffee & code
  }
  if (category?.includes('Sağlık') || category?.includes('Gelişim')) {
    return CURATED_VISION_WALLPAPERS[5].url // Marathon
  }
  return CURATED_VISION_WALLPAPERS[1].url // Swiss Alps
}
