import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  BookOpen,
  PenTool,
  Code2,
  Terminal,
  Target,
  Compass,
  Lightbulb,
  GraduationCap,
  Sparkles,
  Glasses,
  FileText,
  Microscope,
  Dumbbell,
  Activity,
  HeartPulse,
  Footprints,
  Bike,
  Flame,
  Droplets,
  Apple,
  Timer,
  ShieldCheck,
  Pill,
  Scale,
  Sun,
  Sunrise,
  Moon,
  Wind,
  Waves,
  Leaf,
  Coffee,
  BedDouble,
  Smile,
  Music,
  Headphones,
  Camera,
  Utensils,
  Rocket,
  Briefcase,
  Wallet,
  TrendingUp,
  CheckCircle2,
  CalendarCheck,
  ListChecks,
  Award,
  Clock,
  Zap,
  Landmark,
  CreditCard,
  Globe,
  Stars,
  CloudRain,
  Feather,
  Flag,
  Mountain,
  Crown,
  Gem,
  Plane,
  KeyRound,
  BarChart3,
  Calendar,
  Bell,
  AlertTriangle,
  Building2,
  Circle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// 1. İkon Eşleme Tablosu (Registry)
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<string, LucideIcon> = {
  // Zihin & Odak
  brain: Brain,
  'book-open': BookOpen,
  'pen-tool': PenTool,
  code: Code2,
  terminal: Terminal,
  target: Target,
  compass: Compass,
  lightbulb: Lightbulb,
  'graduation-cap': GraduationCap,
  sparkles: Sparkles,
  glasses: Glasses,
  'file-text': FileText,
  microscope: Microscope,

  // Sağlık & Spor
  dumbbell: Dumbbell,
  activity: Activity,
  'heart-pulse': HeartPulse,
  footprints: Footprints,
  bike: Bike,
  flame: Flame,
  droplets: Droplets,
  apple: Apple,
  timer: Timer,
  'shield-check': ShieldCheck,
  pill: Pill,
  scale: Scale,

  // Farkındalık & Günlük Yaşam
  sun: Sun,
  sunrise: Sunrise,
  moon: Moon,
  wind: Wind,
  waves: Waves,
  leaf: Leaf,
  coffee: Coffee,
  bed: BedDouble,
  smile: Smile,
  music: Music,
  headphones: Headphones,
  camera: Camera,
  utensils: Utensils,

  // Üretkenlik & Finans
  rocket: Rocket,
  briefcase: Briefcase,
  wallet: Wallet,
  'trending-up': TrendingUp,
  'check-circle': CheckCircle2,
  'calendar-check': CalendarCheck,
  'list-checks': ListChecks,
  award: Award,
  clock: Clock,
  zap: Zap,
  landmark: Landmark,
  'credit-card': CreditCard,
  globe: Globe,

  // Özel Modül ve Göstergeler
  stars: Stars,
  'cloud-rain': CloudRain,
  feather: Feather,
  flag: Flag,
  mountain: Mountain,
  crown: Crown,
  gem: Gem,
  plane: Plane,
  'key-round': KeyRound,
  'bar-chart': BarChart3,
  calendar: Calendar,
  bell: Bell,
  'alert-triangle': AlertTriangle,
  building: Building2,
}

// ---------------------------------------------------------------------------
// 2. Eski Emojileri Lucide İkon Anahtarlarına Dönüştürme Tablosu
// ---------------------------------------------------------------------------

export const LEGACY_EMOJI_TO_ICON_KEY: Record<string, string> = {
  '☀️': 'sun',
  '🌅': 'sunrise',
  '🌙': 'moon',
  '🌌': 'stars',
  '💧': 'droplets',
  '📚': 'book-open',
  '💪': 'dumbbell',
  '🧘': 'wind',
  '🏃': 'footprints',
  '💻': 'code',
  '✍️': 'pen-tool',
  '✨': 'sparkles',
  '🔥': 'flame',
  '🍎': 'apple',
  '☕': 'coffee',
  '🌱': 'leaf',
  '🚀': 'rocket',
  '💡': 'lightbulb',
  '⚡': 'zap',
  '🌊': 'waves',
  '🌧️': 'cloud-rain',
  '🌪️': 'wind',
  '🏛️': 'landmark',
  '🙏': 'award',
  '🧭': 'compass',
  '🏆': 'award',
  '🎯': 'target',
  '💰': 'wallet',
  '💳': 'credit-card',
  '🏦': 'landmark',
  '📈': 'trending-up',
  '🔒': 'shield-check',
  '🔑': 'key-round',
  '📊': 'bar-chart',
  '📅': 'calendar',
  '⏰': 'clock',
  '🔔': 'bell',
  '⚠️': 'alert-triangle',
  '✅': 'check-circle',
  '👑': 'crown',
  '💎': 'gem',
  '✈️': 'plane',
  '🎵': 'music',
  '🎧': 'headphones',
  '📷': 'camera',
  '🍴': 'utensils',
}

// ---------------------------------------------------------------------------
// 3. İkon Çözümleyici Yardımcı Fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Girdi olarak gelen ikon anahtarı, eski emoji veya tanımsız değeri
 * geçerli bir Lucide ikon anahtarına dönüştürür.
 */
export function resolveIconKey(input?: string | null, fallbackKey = 'sparkles'): string {
  if (!input || !input.trim()) return fallbackKey

  const trimmed = input.trim()

  // 1. Doğrudan eşleşen ikon anahtarı
  if (ICON_MAP[trimmed]) return trimmed

  // 2. Eski emoji eşlemesi
  if (LEGACY_EMOJI_TO_ICON_KEY[trimmed]) return LEGACY_EMOJI_TO_ICON_KEY[trimmed]

  // 3. Küçük harfe duyarsız kontrol
  const lower = trimmed.toLowerCase()
  if (ICON_MAP[lower]) return lower
  if (LEGACY_EMOJI_TO_ICON_KEY[lower]) return LEGACY_EMOJI_TO_ICON_KEY[lower]

  return fallbackKey
}

/**
 * Anahtar veya emoji değerine karşılık gelen LucideIcon bileşenini döndürür.
 */
export function getIconComponent(keyOrEmoji?: string | null, fallbackComponent = Circle): LucideIcon {
  const resolved = resolveIconKey(keyOrEmoji, '')
  if (resolved && ICON_MAP[resolved]) {
    return ICON_MAP[resolved]
  }
  return fallbackComponent
}

// ---------------------------------------------------------------------------
// 4. Rutinler İçin Kategorize Edilmiş İkon Kataloğu
// ---------------------------------------------------------------------------

export interface IconCatalogItem {
  key: string
  label: string
}

export interface IconCatalogCategory {
  id: string
  label: string
  items: IconCatalogItem[]
}

export const ROUTINE_ICON_CATALOG: IconCatalogCategory[] = [
  {
    id: 'mind',
    label: 'Zihin & Odak',
    items: [
      { key: 'brain', label: 'Zihin' },
      { key: 'book-open', label: 'Okuma' },
      { key: 'pen-tool', label: 'Yazı' },
      { key: 'code', label: 'Yazılım' },
      { key: 'terminal', label: 'Terminal' },
      { key: 'target', label: 'Odak' },
      { key: 'compass', label: 'Pusula' },
      { key: 'lightbulb', label: 'Fikir' },
      { key: 'graduation-cap', label: 'Öğrenme' },
      { key: 'sparkles', label: 'İlham' },
      { key: 'glasses', label: 'Konsantrasyon' },
      { key: 'file-text', label: 'Not' },
    ],
  },
  {
    id: 'health',
    label: 'Sağlık & Spor',
    items: [
      { key: 'dumbbell', label: 'Ağırlık' },
      { key: 'activity', label: 'Kardiyo' },
      { key: 'heart-pulse', label: 'Kalp & Nabız' },
      { key: 'footprints', label: 'Yürüyüş' },
      { key: 'bike', label: 'Bisiklet' },
      { key: 'flame', label: 'Kalori' },
      { key: 'droplets', label: 'Su & Hidrasyon' },
      { key: 'apple', label: 'Beslenme' },
      { key: 'timer', label: 'Zamanlama' },
      { key: 'shield-check', label: 'Bağışıklık' },
      { key: 'pill', label: 'Takviye' },
      { key: 'scale', label: 'Denge' },
    ],
  },
  {
    id: 'lifestyle',
    label: 'Farkındalık & Yaşam',
    items: [
      { key: 'sun', label: 'Gündüz' },
      { key: 'sunrise', label: 'Sabah' },
      { key: 'moon', label: 'Gece' },
      { key: 'wind', label: 'Nefes' },
      { key: 'waves', label: 'Meditasyon' },
      { key: 'leaf', label: 'Doğa' },
      { key: 'coffee', label: 'Kahve' },
      { key: 'bed', label: 'Uyku' },
      { key: 'smile', label: 'Pozitiflik' },
      { key: 'music', label: 'Müzik' },
      { key: 'headphones', label: 'Podcast' },
      { key: 'utensils', label: 'Öğün' },
    ],
  },
  {
    id: 'productivity',
    label: 'Üretkenlik & Finans',
    items: [
      { key: 'rocket', label: 'Lansman' },
      { key: 'briefcase', label: 'İş' },
      { key: 'wallet', label: 'Bütçe' },
      { key: 'trending-up', label: 'Büyüme' },
      { key: 'check-circle', label: 'Tamamlama' },
      { key: 'calendar-check', label: 'Plan' },
      { key: 'list-checks', label: 'Görevler' },
      { key: 'award', label: 'Zafer' },
      { key: 'clock', label: 'Zaman' },
      { key: 'zap', label: 'Hız' },
    ],
  },
]

// ---------------------------------------------------------------------------
// 5. Hedef Ufuk ve Kategori İkon Eşlemeleri
// ---------------------------------------------------------------------------

export const DREAM_HORIZON_ICONS: Record<string, string> = {
  horizon_1y: 'flag',
  horizon_1_3y: 'compass',
  horizon_3_5y: 'mountain',
  horizon_lifetime: 'crown',
}

export const DREAM_CATEGORY_ICONS: Record<string, string> = {
  'Deneyim & Seyahat': 'globe',
  'Maddi Hedef': 'gem',
  'Kariyer & Üretim': 'rocket',
  'Kişisel Gelişim & Sağlık': 'heart-pulse',
  Diğer: 'sparkles',
}
