import { describe, it, expect } from 'vitest'
import {
  ICON_MAP,
  LEGACY_EMOJI_TO_ICON_KEY,
  ROUTINE_ICON_CATALOG,
  DREAM_HORIZON_ICONS,
  DREAM_CATEGORY_ICONS,
  resolveIconKey,
  getIconComponent,
} from '@/lib/icons'
import { Brain, Sun, Sparkles, Droplets, Dumbbell } from 'lucide-react'

describe('Central Icons Registry & Resolver (src/lib/icons.ts)', () => {
  it('1. ICON_MAP geçerli Lucide ikon bileşenlerini barındırmalıdır', () => {
    expect(ICON_MAP['brain']).toBe(Brain)
    expect(ICON_MAP['sun']).toBe(Sun)
    expect(ICON_MAP['sparkles']).toBe(Sparkles)
    expect(ICON_MAP['droplets']).toBe(Droplets)
    expect(ICON_MAP['dumbbell']).toBe(Dumbbell)
    expect(Object.keys(ICON_MAP).length).toBeGreaterThan(40)
  })

  it('2. LEGACY_EMOJI_TO_ICON_KEY yaygın emojileri doğru Lucide anahtarlarına eşlemelidir', () => {
    expect(LEGACY_EMOJI_TO_ICON_KEY['☀️']).toBe('sun')
    expect(LEGACY_EMOJI_TO_ICON_KEY['💧']).toBe('droplets')
    expect(LEGACY_EMOJI_TO_ICON_KEY['📚']).toBe('book-open')
    expect(LEGACY_EMOJI_TO_ICON_KEY['💪']).toBe('dumbbell')
    expect(LEGACY_EMOJI_TO_ICON_KEY['💻']).toBe('code')
    expect(LEGACY_EMOJI_TO_ICON_KEY['⚡']).toBe('zap')
    expect(LEGACY_EMOJI_TO_ICON_KEY['🌊']).toBe('waves')
    expect(LEGACY_EMOJI_TO_ICON_KEY['🌅']).toBe('sunrise')
    expect(LEGACY_EMOJI_TO_ICON_KEY['🌙']).toBe('moon')
    expect(LEGACY_EMOJI_TO_ICON_KEY['🌌']).toBe('stars')
  })

  it('3. resolveIconKey hem yeni anahtarları hem de eski emojileri başarıyla çözmelidir', () => {
    // Doğrudan anahtar
    expect(resolveIconKey('brain')).toBe('brain')
    expect(resolveIconKey('dumbbell')).toBe('dumbbell')

    // Eski emoji
    expect(resolveIconKey('☀️')).toBe('sun')
    expect(resolveIconKey('💪')).toBe('dumbbell')

    // Boş veya tanımsız değer
    expect(resolveIconKey(null)).toBe('sparkles')
    expect(resolveIconKey(undefined)).toBe('sparkles')
    expect(resolveIconKey('')).toBe('sparkles')
    expect(resolveIconKey('  ')).toBe('sparkles')

    // Özel fallback
    expect(resolveIconKey(null, 'target')).toBe('target')
    expect(resolveIconKey('bilinmeyen_ikon_xyz', 'target')).toBe('target')
  })

  it('4. getIconComponent ilgili Lucide bileşenini döndürmelidir', () => {
    expect(getIconComponent('brain')).toBe(Brain)
    expect(getIconComponent('☀️')).toBe(Sun)
    expect(getIconComponent('bilinmeyen_key')).toBeDefined()
  })

  it('5. ROUTINE_ICON_CATALOG kategorileri ve ikonları eksiksiz içermelidir', () => {
    expect(ROUTINE_ICON_CATALOG.length).toBeGreaterThanOrEqual(4)
    ROUTINE_ICON_CATALOG.forEach((cat) => {
      expect(cat.id).toBeDefined()
      expect(cat.label).toBeDefined()
      expect(cat.items.length).toBeGreaterThan(0)
      cat.items.forEach((item) => {
        expect(item.key).toBeDefined()
        expect(item.label).toBeDefined()
        expect(ICON_MAP[item.key]).toBeDefined()
      })
    })
  })

  it('6. DREAM_HORIZON_ICONS ve DREAM_CATEGORY_ICONS geçerli ikonlar eşlemelidir', () => {
    Object.values(DREAM_HORIZON_ICONS).forEach((iconKey) => {
      expect(ICON_MAP[iconKey]).toBeDefined()
    })
    Object.values(DREAM_CATEGORY_ICONS).forEach((iconKey) => {
      expect(ICON_MAP[iconKey]).toBeDefined()
    })
  })
})
