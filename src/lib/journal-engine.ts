import { JournalEntry, Routine, RoutineLog, Transaction } from '@/types/database'
import { formatLocalDateInput } from './utils'

export type JournalMood = 'high_energy' | 'calm' | 'low_energy' | 'stormy' | 'reflective'
export type JournalTemplateType = 'freeform' | 'stoic' | 'gratitude_victory' | 'weekly_retro'

export interface MoodMeta {
  key: JournalMood
  label: string
  icon: string
  color: string
}

export const JOURNAL_MOODS: Record<JournalMood, MoodMeta> = {
  high_energy: {
    key: 'high_energy',
    label: 'Yüksek Enerji / Coşkulu',
    icon: '⚡',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  calm: {
    key: 'calm',
    label: 'Sakin & Dengeli',
    icon: '🌊',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  low_energy: {
    key: 'low_energy',
    label: 'Düşük Enerji / Yorgun',
    icon: '🌧️',
    color: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  },
  stormy: {
    key: 'stormy',
    label: 'Fırtınalı / Stresli',
    icon: '🌪️',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  reflective: {
    key: 'reflective',
    label: 'Derin & Düşünceli',
    icon: '🌌',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
}

export interface TemplateMeta {
  key: JournalTemplateType
  title: string
  description: string
  icon: string
  content: string
}

export const JOURNAL_TEMPLATES: Record<JournalTemplateType, TemplateMeta> = {
  freeform: {
    key: 'freeform',
    title: 'Serbest Akış',
    description: 'Zihninden geçen her şeyi filtresiz dök.',
    icon: '✍️',
    content: '',
  },
  stoic: {
    key: 'stoic',
    title: 'Stoik Akşam Muhasebesi',
    description: 'Marcus Aurelius felsefesiyle günü tarafsızca gözden geçir.',
    icon: '🏛️',
    content: `### 🏛️ 1. Kontrol Çemberi
Bugün doğrudan kontrolümde olan neyi iyi yönettim?

### 🌊 2. Metanet ve Tepki
Neyi daha sakin ve olgunlukla karşılayabilirdim? Zihnimi gereksiz yere ne çeldi?

### 🧭 3. Yarının Rotası
Yarın güne hangi erdem, niyet ve odakla başlayacağım?`,
  },
  gratitude_victory: {
    key: 'gratitude_victory',
    title: '3 Şükran & Günün Zaferi',
    description: 'Günün küçük güzelliklerini ve tekil zaferini mühürle.',
    icon: '🙏',
    content: `### 🙏 1. Üç Şükran Detayı
1. 
2. 
3. 

### 🏆 2. Günün Tekil Zaferi
Bugün büyük ya da küçük hangi engeli aştım veya neyi başardım?

### 💡 3. Günün Hatırası
Bugünden geleceğe bir anı kalsaydı bu ne olurdu?`,
  },
  weekly_retro: {
    key: 'weekly_retro',
    title: 'Haftalık Kapanış & Rota Tayini',
    description: 'Haftayı arkana al ve gelecek haftanın Kuzey Yıldızını belirle.',
    icon: '🧭',
    content: `### 📊 1. Haftanın Değerlendirmesi
Bu hafta projelerim, zihnim ve enerjim genel olarak nasıl aktı?

### 💡 2. En Büyük İçgörü / Öğrenilen Ders
Bu haftadan cebime koyduğum en değerli farkındalık nedir?

### 🎯 3. Gelecek Haftanın Kuzey Yıldızı (MIT)
Önümüzdeki hafta tek bir şeyi başaracak olsaydım bu ne olurdu?`,
  },
}

// ---------------------------------------------------------------------------
// Kelime ve Okuma Süresi Hesaplayıcı
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  if (!text) return 0
  // Markdown başlıklarını ve boşlukları ayıkla
  const clean = text.replace(/[#*`_~[\]()-]/g, ' ').trim()
  if (!clean) return 0
  return clean.split(/\s+/).filter(Boolean).length
}

export function calculateReadingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0
  // Ortalama okuma hızı dakikada 200 kelime
  return Math.max(1, Math.ceil(wordCount / 200))
}

// ---------------------------------------------------------------------------
// Arama ve Filtreleme
// ---------------------------------------------------------------------------

export interface FilterJournalOptions {
  mood?: string
  query?: string
  templateType?: string
  pinnedOnly?: boolean
}

export function filterJournalEntries(
  entries: JournalEntry[],
  options: FilterJournalOptions = {}
): JournalEntry[] {
  let result = [...entries]

  // Sabitlenenleri en başa al, sonra tarihe göre yeniden eskiye
  result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.entry_date.localeCompare(a.entry_date)
  })

  if (options.pinnedOnly) {
    result = result.filter((e) => e.pinned)
  }

  if (options.mood && options.mood !== 'all') {
    result = result.filter((e) => e.mood === options.mood)
  }

  if (options.templateType && options.templateType !== 'all') {
    result = result.filter((e) => e.template_type === options.templateType)
  }

  if (options.query && options.query.trim()) {
    const q = options.query.toLowerCase().trim()
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }

  return result
}

// ---------------------------------------------------------------------------
// Seyir Defteri Metrikleri
// ---------------------------------------------------------------------------

export interface JournalMetrics {
  totalEntries: number
  totalWords: number
  avgWordsPerEntry: number
  writingStreak: number
  mostFrequentMood: JournalMood | null
  totalReadingTimeMinutes: number
}

export function calculateJournalMetrics(
  entries: JournalEntry[],
  referenceDateStr: string = formatLocalDateInput()
): JournalMetrics {
  const totalEntries = entries.length
  if (totalEntries === 0) {
    return {
      totalEntries: 0,
      totalWords: 0,
      avgWordsPerEntry: 0,
      writingStreak: 0,
      mostFrequentMood: null,
      totalReadingTimeMinutes: 0,
    }
  }

  const totalWords = entries.reduce((acc, e) => acc + (e.word_count || countWords(e.content)), 0)
  const avgWordsPerEntry = Math.round(totalWords / totalEntries)
  const totalReadingTimeMinutes = calculateReadingTimeMinutes(totalWords)

  // En sık görülen ruh hali
  const moodCounts = new Map<JournalMood, number>()
  for (const entry of entries) {
    moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1)
  }

  let mostFrequentMood: JournalMood | null = null
  let maxCount = 0
  moodCounts.forEach((count, mood) => {
    if (count > maxCount) {
      maxCount = count
      mostFrequentMood = mood
    }
  })

  // Yazma serisi (Writing streak) hesabı
  const uniqueDates = Array.from(new Set(entries.map((e) => e.entry_date))).sort((a, b) =>
    b.localeCompare(a)
  )

  let writingStreak = 0
  const dateSet = new Set(uniqueDates)

  // Referans tarihten geriye doğru say
  let check = new Date(referenceDateStr)
  const todayStr = referenceDateStr

  // Eğer bugün yazıldıysa streak 1'den başlar, yazılmadıysa dünden sayarız
  if (dateSet.has(todayStr)) {
    writingStreak = 1
    check.setDate(check.getDate() - 1)
  } else {
    // Dün yazılmış mı?
    const yesterday = new Date(check)
    yesterday.setDate(yesterday.getDate() - 1)
    const yStr = formatLocalDateInput(yesterday)
    if (dateSet.has(yStr)) {
      check = yesterday
    } else {
      check = new Date(0) // Streak bozulmuş
    }
  }

  if (check.getTime() > 0) {
    while (true) {
      const dStr = formatLocalDateInput(check)
      if (dateSet.has(dStr)) {
        if (dStr !== todayStr) writingStreak++
        check.setDate(check.getDate() - 1)
      } else {
        break
      }
    }
  }

  return {
    totalEntries,
    totalWords,
    avgWordsPerEntry,
    writingStreak,
    mostFrequentMood,
    totalReadingTimeMinutes,
  }
}

// ---------------------------------------------------------------------------
// Günün Akıllı Bağlamı (Smart Day Context Ribbon)
// ---------------------------------------------------------------------------

export interface DayContextSummary {
  dateStr: string
  routinesCompleted: number
  routinesTotal: number
  totalSpent: number
  txCount: number
  summaryText: string
}

export function buildDayContextSummary(
  dateStr: string,
  routines: Routine[] = [],
  routineLogs: RoutineLog[] = [],
  transactions: Transaction[] = []
): DayContextSummary {
  const activeRoutines = routines.filter((r) => r.is_active)
  const dayLogs = routineLogs.filter(
    (l) =>
      l.log_date === dateStr &&
      (l.status === 'completed' || l.status === 'micro_dose' || l.status === 'kintsugi_repaired')
  )
  const completedCount = dayLogs.length
  const totalRoutines = activeRoutines.length

  // Günün harcamaları (Tüketim olanlar, transfer veya yatırıma aktarılan hariçler değil)
  const dayTxs = transactions.filter(
    (t) =>
      t.date === dateStr &&
      (t.type === 'Harcama' || t.amount < 0) &&
      t.type !== 'Gelir' &&
      t.type !== 'Tahsilat' &&
      t.type !== 'Transfer' &&
      t.type !== 'Kart Ödemesi' &&
      t.analysis_group !== 'Hariç'
  )

  const totalSpent = Math.round(
    dayTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  )
  const txCount = dayTxs.length

  const parts: string[] = []
  if (totalRoutines > 0) {
    parts.push(`✨ ${completedCount}/${totalRoutines} Rutin`)
  }
  if (txCount > 0) {
    parts.push(`💳 ${totalSpent.toLocaleString('tr-TR')} ₺ Harcama (${txCount} işlem)`)
  } else {
    parts.push(`💳 Harcama yok (Sıfır Tüketim)`)
  }

  const summaryText = parts.join(' • ')

  return {
    dateStr,
    routinesCompleted: completedCount,
    routinesTotal: totalRoutines,
    totalSpent,
    txCount,
    summaryText,
  }
}

// ---------------------------------------------------------------------------
// Başlangıç İlham Kayıtları (Seed Journal Entries)
// ---------------------------------------------------------------------------

export const INITIAL_SAMPLE_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'sample-entry-1',
    user_id: 'local',
    entry_date: formatLocalDateInput(),
    title: 'Sakin Bir Sabah, Rüzgar Dindi',
    content: `Bugün erken uyandım. Şafak vakti bir bardak su içip gökyüzüne baktığımda zihnimdeki karmaşanın durulduğunu hissettim.

Pusula üzerinde çalışırken fark ettiğim şey şu: Bir ürün sadece özellikleri için değil, kullanıcısına hissettirdiği sükunet için inşa edilir.

Marcus Aurelius'un dediği gibi: "Ruh, düşündüğü şeylerin rengine boyanır." Zihnimi aceleyle değil, derin çalışma ve sabırla beslemek istiyorum. Bugün tek bir hedefe kilitlendim ve onu tamamladım.`,
    mood: 'calm',
    template_type: 'stoic',
    tags: ['Zihin', 'Felsefe', 'Sabah'],
    weather_note: 'Açık, Serin Rüzgar',
    pinned: true,
    word_count: 82,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sample-entry-2',
    user_id: 'local',
    entry_date: formatLocalDateInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    title: 'Fırtınalı Bir Gün ve Kintsugi',
    content: `Dün planladığım hiçbir şey vaktinde gitmedi. Sabah kodu derlerken çıkan beklenmedik hatalar ve gelen bir fatura enerjimi emdi.

Eski ben olsaydım "bugün mahvoldu" diyip tüm rutinleri bırakırdım. Ama Pusula'daki Kintsugi prensibini hatırladım: Kırılan şey atılmaz, altınla onarılır.

Akşam masayı 5 dakika topladım, minimum dozda esnedim ve günü korudum. Kusursuz olmak zorunda değilim; dayanıklı olmak zorundayım.`,
    mood: 'reflective',
    template_type: 'freeform',
    tags: ['Dayanıklılık', 'Kintsugi', 'Öğrenme'],
    weather_note: 'Bulutlu',
    pinned: false,
    word_count: 73,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'sample-entry-3',
    user_id: 'local',
    entry_date: formatLocalDateInput(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)),
    title: '3 Şükran ve Büyük İvme',
    content: `### 🙏 1. Üç Şükran Detayı
1. Çalışma masamın üzerine vuran ikindi güneşi ve sessizlik.
2. Sıcak bir fincan filtre kahve eşliğinde kesintisiz 90 dakika kod yazabilmek.
3. Kendi zamanımın efendisi olma yolunda her gün bir taş daha koyabilmek.

### 🏆 2. Günün Tekil Zaferi
Yatırımlar ve portföy modülünü DCA kademeli alım formülüyle kuruşu kuruşuna tamamladım.

### 💡 3. Günün Hatırası
Üretmenin verdiği doyum, tüketmenin verdiği geçici heyecandan her zaman daha derindir.`,
    mood: 'high_energy',
    template_type: 'gratitude_victory',
    tags: ['Şükran', 'Zafer', 'Üretim'],
    weather_note: 'Güneşli',
    pinned: false,
    word_count: 85,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]
