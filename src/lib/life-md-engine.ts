import type { PusulaVaultData } from '@/lib/vault-engine'
import { formatCurrency } from '@/lib/utils'
import {
  calculateSubscriptionEquivalent,
  calculateIncomeMetrics,
  normalizeSubscriptionPeriod,
} from '@/lib/finance-engine'

export interface LifeMdSectionOptions {
  executiveSummary?: boolean
  dreamsAndGoals?: boolean
  projectsAndIdeas?: boolean
  projectAndIdeaDocs?: boolean
  routinesAndAgenda?: boolean
  journal?: boolean
  financialOverview?: boolean
  transactions?: boolean
}

export interface LifeMdOptions {
  customPreamble?: string
  includeSections?: LifeMdSectionOptions
}

export interface LifeMdStats {
  charCount: number
  wordCount: number
  estimatedTokens: number
  includedRecords: number
  sectionCounts: Record<string, number>
}

export interface LifeMdResult {
  markdown: string
  stats: LifeMdStats
}

// Güvenli hücre temizleyici (Markdown tablo sütun ve satır kırılmalarını engeller)
export function cleanCell(val: unknown): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'number') {
    if (isNaN(val)) return '-'
    return String(val)
  }
  const str = String(val).trim()
  if (!str) return '-'
  // Varsa önceden kaçırılmış pipe'ları tekilleştir, satır sonlarını boşluğa ve pipe'ları kaçışlı pipe'a çevir
  return str
    .replace(/\r?\n+/g, ' ')
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
}

// Çok satırlı içerik temizleyici ve başlık hiyerarşisi koruyucu (Günlük ve açıklamalar için)
// Kod blokları (``` veya ~~~) içindeki satırlar (# yorumları dahil) kesinlikle değiştirilmez
export function cleanMultiLine(val: unknown, minLevel = 4): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  if (!str) return ''

  const lines = str.split(/\r?\n/)
  let inCodeFence = false
  const resultLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeFence = !inCodeFence
      resultLines.push(line)
      continue
    }

    if (inCodeFence) {
      resultLines.push(line)
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const hashes = headingMatch[1].length
      if (hashes < minLevel) {
        const demotedLevel = Math.min(6, minLevel + (hashes - 1))
        resultLines.push(`${'#'.repeat(demotedLevel)} ${headingMatch[2]}`)
      } else {
        resultLines.push(line)
      }
    } else {
      resultLines.push(line)
    }
  }

  return resultLines.join('\n')
}

// Satır içi kısa özet üretici (tablo hücreleri için)
export function summarizeInline(val: unknown, maxLen = 120): string {
  if (val === null || val === undefined) return '-'
  const str = String(val).trim()
  if (!str) return '-'
  // İlk anlamlı satırı bul (boş satırları atla)
  const lines = str.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (lines.length === 0) return '-'
  const firstMeaningful = lines.find((l) => !l.startsWith('#')) || lines[0]
  // Başlık işaretlerini (# vb.) ve blok alıntı işaretlerini temizle
  const cleanLine = firstMeaningful.replace(/^[#>\s*_-]+/, '').trim() || firstMeaningful
  const truncated = cleanLine.length > maxLen ? `${cleanLine.slice(0, maxLen - 3)}...` : cleanLine
  return cleanCell(truncated)
}

// Detaylı dokümantasyon var mı kontrolü (çok satırlı veya 120 karakterden uzun)
export function hasDetailedDoc(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const str = String(val).trim()
  if (!str) return false
  return str.includes('\n') || str.length > 120
}

export interface ActiveCardInstallment {
  cardName: string
  description: string
  installmentStatus: string
  current: number
  total: number
  monthlyAmount: number
  remainingMonths: number
  remainingLoad: number
}

// Taksit bilgilerini açıklama veya periyottan ayrıştır
export function parseInstallmentInfo(
  desc?: string | null,
  recurrence?: string | null
): { current: number; total: number; cleanDesc?: string } | null {
  const text = (desc || '').trim()
  const rec = (recurrence || '').trim()

  const cleanText = (matchedStr?: string) => {
    if (!matchedStr) return text
    return text
      .replace(matchedStr, '')
      .replace(/[\(\[\{]\s*[\)\]\}]/g, '')
      .replace(/^[-–—:,\s/|(\[{]+|[-–—:,\s/|)\]}]+$/g, '')
      .trim() || text
  }

  const validate = (cur: number, tot: number, matchedStr?: string) => {
    if (isNaN(cur) || isNaN(tot)) return null
    if (cur >= 1 && tot >= 2 && tot <= 60 && cur <= tot) {
      return { current: cur, total: tot, cleanDesc: cleanText(matchedStr) }
    }
    return null
  }

  // 1. "İşlemin X/Y Taksidi" / "İşlemin X/Y Taksiti" / "İşlemin X/Y Taksit"
  const m1 = text.match(/(?:[\(\[]\s*)?İşlemin\s+(\d{1,2})\/(\d{1,2})\s*(?:Taksit[iı]?|Taksid[iı]?|Taksit)[\)\]]?/i)
  if (m1) {
    const res = validate(parseInt(m1[1], 10), parseInt(m1[2], 10), m1[0])
    if (res) return res
  }

  // 2. "X. Taksit ... X/Y" veya "X.Taksit (X/Y)"
  const m2 = text.match(/(?:[\(\[]\s*)?(\d{1,2})\.\s*Taksit[^\d]*(\d{1,2})\/(\d{1,2})[\)\]]?/i)
  if (m2) {
    const res = validate(parseInt(m2[2], 10), parseInt(m2[3], 10), m2[0])
    if (res) return res
  }

  // 3. "Taksit:? (X/Y)" veya "Taksit:? X/Y" veya "Tk:? (X/Y)" veya "Tk:? X/Y"
  const m3 = text.match(/(?:[\(\[]\s*)?(?:Taksit|Tk\.?)[\s:]*\(?(\d{1,2})\/(\d{1,2})\)?[\)\]]?/i)
  if (m3) {
    const res = validate(parseInt(m3[1], 10), parseInt(m3[2], 10), m3[0])
    if (res) return res
  }

  // 4. "X/Y Taksit" / "X/Y Taksiti" / "X/Y Taksidi" / "X/Y Tk"
  const m4 = text.match(/[\(\[]?(\d{1,2})\/(\d{1,2})[\)\]]?\s*(?:Taksit[iı]?|Taksid[iı]?|Tk\.?)[\)\]]?/i)
  if (m4) {
    const res = validate(parseInt(m4[1], 10), parseInt(m4[2], 10), m4[0])
    if (res) return res
  }

  // 5. English: "Installment (X/Y)", "Installment X/Y", "Installment X of Y", "X/Y Installment"
  const mEng = text.match(/(?:[\(\[]\s*)?Installment[\s:]*\(?(\d{1,2})(?:\/|\s+of\s+)(\d{1,2})\)?[\)\]]?/i) ||
               text.match(/[\(\[]?(\d{1,2})(?:\/|\s+of\s+)(\d{1,2})[\)\]]?\s*Installment[\)\]]?/i)
  if (mEng) {
    const res = validate(parseInt(mEng[1], 10), parseInt(mEng[2], 10), mEng[0])
    if (res) return res
  }

  // 6. Parenthesized/Bracketed "(X/Y)" or "[X/Y]" in text (e.g. "KOTON (1/3)")
  const m6 = text.match(/[\(\[](\d{1,2})\/(\d{1,2})[\)\]]/)
  if (m6) {
    const res = validate(parseInt(m6[1], 10), parseInt(m6[2], 10), m6[0])
    if (res) return res
  }

  // 7. Check recurrence field if present
  if (rec) {
    const mRec1 = rec.match(/(?:Taksit|Tk\.?)?[\s:]*\(?(\d{1,2})\/(\d{1,2})\)?/i)
    if (mRec1) {
      const res = validate(parseInt(mRec1[1], 10), parseInt(mRec1[2], 10))
      if (res) return res
    }
    const mRec2 = rec.match(/(\d{1,2})\s+of\s+(\d{1,2})/i)
    if (mRec2) {
      const res = validate(parseInt(mRec2[1], 10), parseInt(mRec2[2], 10))
      if (res) return res
    }
  }

  // 8. Trailing bare "X/Y" at the end of description (e.g. "KOTON 1/3")
  const m8 = text.match(/(?:\s|^)(\d{1,2})\/(\d{1,2})$/)
  if (m8) {
    const res = validate(parseInt(m8[1], 10), parseInt(m8[2], 10), m8[0])
    if (res) return res
  }

  return null
}

// İşlemlerden devam eden kredi kartı taksitlerini ayıkla
export function extractActiveCardInstallments(
  transactions: any[],
  resolveCard: (id?: string | null) => string
): ActiveCardInstallment[] {
  const candidateMap = new Map<string, { tx: any; info: { current: number; total: number; cleanDesc?: string } }>()

  for (const t of transactions) {
    // Harcama dışı (ödeme, iade, gelir) işlemleri taksit borcu olarak sayma
    if (t.type === 'İade' || t.type === 'Kart Ödemesi' || t.type === 'Gelir' || t.type === 'Tahsilat') {
      continue
    }

    const numAmount = Math.abs(Number(t.amount) || 0)
    if (numAmount <= 0) continue

    const info = parseInstallmentInfo(t.description, t.recurrence)
    if (!info) continue

    const cardId = t.card_id || t.account_or_card || 'card'
    const cleanDesc = info.cleanDesc && info.cleanDesc !== t.description ? info.cleanDesc : ''
    const desc = cleanDesc || (t.merchant && t.merchant.trim()) || t.description || 'İşlem'
    const groupKey = `${cardId}|${desc.toLowerCase().replace(/\s+/g, ' ')}|${info.total}|${numAmount}`

    const existing = candidateMap.get(groupKey)
    if (!existing) {
      candidateMap.set(groupKey, { tx: t, info })
    } else {
      if (
        info.current > existing.info.current ||
        (info.current === existing.info.current && (t.date || '') > (existing.tx.date || ''))
      ) {
        candidateMap.set(groupKey, { tx: t, info })
      }
    }
  }

  const results: ActiveCardInstallment[] = []

  for (const { tx, info } of candidateMap.values()) {
    if (info.current < info.total) {
      const remainingMonths = info.total - info.current
      const monthlyAmount = Math.abs(Number(tx.amount) || 0)
      const remainingLoad = monthlyAmount * remainingMonths
      const resolved = resolveCard(tx.card_id || tx.account_or_card)
      const cardName = resolved !== '-' ? resolved : (tx.account_or_card || 'Kredi Kartı')
      const cleanDesc = info.cleanDesc && info.cleanDesc !== tx.description ? info.cleanDesc : ''
      const desc = cleanDesc || (tx.merchant && tx.merchant.trim()) || tx.description || 'Taksitli İşlem'

      results.push({
        cardName,
        description: desc,
        installmentStatus: `${info.current}/${info.total}`,
        current: info.current,
        total: info.total,
        monthlyAmount,
        remainingMonths,
        remainingLoad,
      })
    }
  }

  return results.sort((a, b) => b.remainingLoad - a.remainingLoad)
}

const DEFAULT_SECTIONS: Required<LifeMdSectionOptions> = {
  executiveSummary: true,
  dreamsAndGoals: true,
  projectsAndIdeas: true,
  projectAndIdeaDocs: true,
  routinesAndAgenda: true,
  journal: true,
  financialOverview: true,
  transactions: true,
}

const DREAM_HORIZON_MAP: Record<string, string> = {
  horizon_1y: '1 Yıl',
  horizon_1_3y: '1-3 Yıl',
  horizon_3_5y: '3-5 Yıl',
  horizon_lifetime: 'Yaşam Boyu',
}

const DREAM_STATUS_MAP: Record<string, string> = {
  active: 'Aktif',
  incubating: 'Kuluçkada',
  achieved: 'Başarıldı',
  archived: 'Arşiv',
}

const PROJECT_TYPE_MAP: Record<string, string> = {
  saas: 'SaaS',
  workplace: 'İş Yeri',
  client: 'Müşteri',
  internal: 'Dahili',
}

const IDEA_STATUS_MAP: Record<string, string> = {
  inbox: 'Gelen Kutusu',
  maybe: 'Düşüncede / Belki',
  decided: 'Karar Verildi',
  killed: 'Vazgeçildi',
  promoted: 'Projeye Terfi Etti',
}

const ROUTINE_TIME_BLOCK_MAP: Record<string, string> = {
  morning: 'Sabah',
  afternoon: 'Öğle',
  evening: 'Akşam',
  night: 'Gece',
}

const ROUTINE_FREQ_MAP: Record<string, string> = {
  daily: 'Her Gün',
  weekdays: 'Hafta İçi',
  weekends: 'Hafta Sonu',
  custom: 'Özel Günler',
}

const DAY_SHORT_NAMES: Record<number, string> = {
  1: 'Pzt',
  2: 'Sal',
  3: 'Çar',
  4: 'Per',
  5: 'Cum',
  6: 'Cmt',
  7: 'Paz',
}

const ROUTINE_LOG_STATUS_MAP: Record<string, string> = {
  completed: 'Tamamlandı',
  micro_dose: 'Mikro Doz',
  kintsugi_repaired: 'Kintsugi (Telafi)',
  skipped: 'Atlandı',
  frozen: 'Donduruldu',
}

const AGENDA_STATUS_MAP: Record<string, string> = {
  planned: 'Planlandı',
  in_progress: 'Sürüyor',
  completed: 'Tamamlandı',
  missed: 'Kaçırıldı',
  cancelled: 'İptal',
}

const MOOD_MAP: Record<string, string> = {
  high_energy: '⚡ Yüksek Enerji',
  calm: '🌿 Sakin',
  low_energy: '🔋 Düşük Enerji',
  stormy: '🌧️ Fırtınalı',
  reflective: '🤔 Düşünceli',
}

const TEMPLATE_MAP: Record<string, string> = {
  freeform: 'Serbest',
  stoic: 'Stoik',
  gratitude_victory: 'Şükran & Zafer',
  weekly_retro: 'Haftalık Retro',
}

export function generateLifeMarkdown(
  data: PusulaVaultData,
  options?: LifeMdOptions
): LifeMdResult {
  const sections = {
    ...DEFAULT_SECTIONS,
    ...(options?.includeSections || {}),
  }

  // 1. İlişkisel Lookup Haritaları (ID -> İsim Çözümleme)
  const projectMap = new Map((data.projects || []).map((p) => [p.id, p]))
  const accountMap = new Map((data.accounts || []).map((a) => [a.id, a]))
  const cardMap = new Map((data.credit_cards || []).map((c) => [c.id, c]))
  const dreamMap = new Map((data.dreams || []).map((d) => [d.id, d]))
  const debtMap = new Map((data.debts || []).map((d) => [d.id, d]))
  const routineMap = new Map((data.routines || []).map((r) => [r.id, r]))

  const resolveProject = (id?: string | null) => (id ? projectMap.get(id)?.name || '-' : '-')
  const resolveAccount = (id?: string | null) => (id ? accountMap.get(id)?.name || '-' : '-')
  const resolveCard = (id?: string | null) => {
    if (!id) return '-'
    const c = cardMap.get(id)
    if (!c) return '-'
    const bankPrefix = c.bank ? `${c.bank} - ` : ''
    const cardName = c.card_name || 'Kart'
    const alreadyHasLastFour = Boolean(c.last_four && cardName.includes(c.last_four))
    const lastFour = c.last_four && !alreadyHasLastFour ? ` (**** ${c.last_four})` : ''
    return `${bankPrefix}${cardName}${lastFour}`
  }
  const resolveDream = (id?: string | null) => (id ? dreamMap.get(id)?.title || '-' : '-')
  const resolveDebt = (id?: string | null) => {
    if (!id) return '-'
    const d = debtMap.get(id)
    if (!d) return '-'
    return `${d.person_or_entity} (${d.type})`
  }
  const resolveRoutine = (id?: string | null) => (id ? routineMap.get(id)?.title || '-' : '-')

  const lines: string[] = []
  const sectionCounts: Record<string, number> = {}

  // 2. Belge Başlığı & Meta Bilgileri
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16)
  lines.push('# 🧭 PUSULA — Kişisel Yaşam ve Finans Bağlamı (life.md)')
  lines.push('')
  lines.push('> Bu belge Pusula kişisel yönetim sisteminden otomatik olarak üretilmiştir.')
  lines.push('> Kullanıcının hedefleri, projeleri, alışkanlıkları ve finansal durumu hakkında güncel bağlam sağlar.')
  lines.push('> AI asistanının bu verileri referans alarak kişiselleştirilmiş tavsiyeler, analizler ve planlamalar sunması amaçlanmıştır.')
  lines.push('>')
  lines.push(`> 📅 **Oluşturulma Tarihi:** ${nowStr}`)
  lines.push('> 🔒 **Gizlilik Güvencesi:** Hassas kimlik doğrulama bilgileri (şifreler, PIN kodları, gizli anahtarlar) bu belgeden **kesin olarak hariç tutulmuştur**.')
  lines.push('')

  if (options?.customPreamble && options.customPreamble.trim()) {
    lines.push('### 📝 Kişisel AI Yönergesi & Notlar')
    lines.push(options.customPreamble.trim())
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // 3. Bölüm 1: Yönetici Özeti (Genel Durum)
  if (sections.executiveSummary) {
    const totalBankBalance = (data.accounts || []).reduce(
      (sum, a) => sum + (Number(a.balance) || 0),
      0
    )
    const totalInvestmentValue = (data.investments || []).reduce(
      (sum, inv) => sum + (Number(inv.quantity) || 0) * (Number(inv.current_price) || 0),
      0
    )
    const totalCardDebt = (data.credit_cards || []).reduce(
      (sum, c) => sum + (Number(c.current_debt) || 0),
      0
    )
    const openDebts = (data.debts || [])
      .filter((d) => d.type === 'Borç' && d.status === 'Açık')
      .reduce((sum, d) => sum + (Number(d.remaining) || 0), 0)
    const openReceivables = (data.debts || [])
      .filter((d) => d.type === 'Alacak' && d.status === 'Açık')
      .reduce((sum, d) => sum + (Number(d.remaining) || 0), 0)

    const liquidNetWorth = totalBankBalance + totalInvestmentValue - (totalCardDebt + openDebts)
    const netWorth = liquidNetWorth + openReceivables

    // Finansman & Faiz Kaybı (Faiz, KKDF, BSMV vb.)
    const financingTxs = (data.transactions || []).filter(
      (t) => t.type === 'Finansman/Masraf' || (t.type as string) === 'Finansman' || t.analysis_group === 'Finansman'
    )
    const totalFinancingLoss = financingTxs.reduce(
      (sum, t) => sum + Math.abs(Number(t.amount) || 0),
      0
    )

    // Normalleştirilmiş Gelir ve Abonelik Metrikleri
    const incomeMetrics = calculateIncomeMetrics(data.incomes || [])
    const activeMonthlyIncome = incomeMetrics.totalMonthlyIncome

    const activeSubs = (data.subscriptions || []).filter(
      (s) => s.status === 'Aktif' && s.decision !== 'İptal Et'
    )
    let activeMonthlySubs = 0
    let activeOneTimeSubs = 0
    for (const sub of activeSubs) {
      const eq = calculateSubscriptionEquivalent(sub.amount, sub.period, sub.currency)
      activeMonthlySubs += eq.monthly
      if (normalizeSubscriptionPeriod(sub.period) === 'Tek Seferlik') {
        activeOneTimeSubs += Number(sub.amount || 0)
      }
    }
    const subsDetail = activeOneTimeSubs > 0
      ? `${activeSubs.length} aktif abonelik (+ ${formatCurrency(activeOneTimeSubs)} tek seferlik)`
      : `${activeSubs.length} aktif abonelik`

    // Devam Eden Kart Taksitleri Gelecek Ay Yükü
    const activeCardInstallments = extractActiveCardInstallments(data.transactions || [], resolveCard)
    const activeInstallmentsMonthlyLoad = activeCardInstallments.reduce(
      (sum, inst) => sum + inst.monthlyAmount,
      0
    )

    const activeProjectsCount = (data.projects || []).filter(
      (p) => p.status === 'Canlı' || p.status === 'Geliştirmede'
    ).length
    const activeDreamsCount = (data.dreams || []).filter((d) => d.status === 'active').length
    const activeRoutinesCount = (data.routines || []).filter((r) => r.is_active).length

    lines.push('## 1. Yönetici Özeti (Genel Durum)')
    lines.push('')
    lines.push('### 💰 Finansal Genel Görünüm')
    lines.push('| Finansal Kalem | Tutar | Detay |')
    lines.push('| :--- | :--- | :--- |')
    lines.push(`| **Banka & Kasa Nakit** | ${formatCurrency(totalBankBalance)} | ${(data.accounts || []).length} hesap |`)
    lines.push(`| **Yatırım Portföyü Değeri** | ${formatCurrency(totalInvestmentValue)} | ${(data.investments || []).length} varlık |`)
    lines.push(`| **Açık Alacaklar** | ${formatCurrency(openReceivables)} | Tahsil bekleyen alacaklar |`)
    lines.push(`| **Kredi Kartı Toplam Borcu** | ${formatCurrency(totalCardDebt)} | ${(data.credit_cards || []).length} kart |`)
    lines.push(`| **Açık Borçlar (Kişi/Kurum)** | ${formatCurrency(openDebts)} | Ödenmesi gereken borçlar |`)
    lines.push(`| **Anlık Likit Net Durum (Alacaklar Hariç)** | **${formatCurrency(liquidNetWorth)}** | *(Nakit + Yatırım) - (Kart Borcu + Borçlar)* |`)
    lines.push(`| **Toplam Net Varlık (Alacaklar Dahil)** | **${formatCurrency(netWorth)}** | *(Likit Net Durum + Açık Alacaklar)* |`)
    lines.push(`| **Finansman & Faiz Kaybı** | ${formatCurrency(totalFinancingLoss)} | ${financingTxs.length} işlem (Faiz, KKDF, BSMV) |`)
    if (activeInstallmentsMonthlyLoad > 0) {
      lines.push(`| **Devam Eden Kart Taksit Yükü (Gelecek Ay)** | ${formatCurrency(activeInstallmentsMonthlyLoad)} | ${activeCardInstallments.length} aktif taksit |`)
    }
    lines.push(`| **Aylık Aktif Gelirler** | ${formatCurrency(activeMonthlyIncome)} | ${incomeMetrics.activeCount} aktif gelir |`)
    lines.push(`| **Aylık Aktif Abonelikler** | ${formatCurrency(activeMonthlySubs)} | ${subsDetail} |`)
    lines.push('')

    lines.push('### 📊 Yaşam ve Üretkenlik Envanteri')
    lines.push(`- **Aktif Projeler:** ${activeProjectsCount} aktif (Toplam: ${(data.projects || []).length})`)
    lines.push(`- **Vizyon & Hayaller:** ${activeDreamsCount} aktif hedef (Toplam: ${(data.dreams || []).length})`)
    lines.push(`- **Fikir Havuzu:** ${(data.ideas || []).length} kayıtlı fikir`)
    lines.push(`- **Rutinler:** ${activeRoutinesCount} aktif rutin (Toplam: ${(data.routines || []).length})`)
    lines.push(`- **Seyir Defteri (Günlük):** ${(data.journal_entries || []).length} kayıt`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // 4. Bölüm 2: Vizyon, Hedefler & Hayaller (Dreams)
  if (sections.dreamsAndGoals) {
    const dreams = data.dreams || []
    sectionCounts.dreams = dreams.length
    lines.push('## 2. Vizyon, Hedefler & Hayaller (Dreams)')
    lines.push('')
    if (dreams.length === 0) {
      lines.push('*Kayıtlı hedef veya hayal bulunmuyor.*')
    } else {
      lines.push('| Hedef / Hayal | Kategori | Ufuk | Hedef Yıl | Durum | Persona | Motivasyon (Neden?) | Sıradaki Odak / Başarı Notu |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const d of dreams) {
        const horizon = DREAM_HORIZON_MAP[d.horizon] || d.horizon
        const status = DREAM_STATUS_MAP[d.status] || d.status
        const titleWithDesc = d.description && d.description.trim()
          ? `${d.title} — ${d.description.trim()}`
          : d.title

        let nextFocusOrAchieved = '-'
        if (d.status === 'achieved') {
          const dateStr = d.achieved_at ? `[${d.achieved_at.slice(0, 10)}] ` : ''
          nextFocusOrAchieved = d.achieved_note ? `${dateStr}Başarı Notu: ${d.achieved_note}` : `${dateStr}Tamamlandı`
        } else if (d.next_focus_note) {
          nextFocusOrAchieved = d.next_focus_note
        }

        lines.push(
          `| ${cleanCell(titleWithDesc)} | ${cleanCell(d.category)} | ${cleanCell(horizon)} | ${cleanCell(d.target_year)} | ${cleanCell(status)} | ${cleanCell(d.identity_persona)} | ${cleanCell(d.motivation_why)} | ${cleanCell(nextFocusOrAchieved)} |`
        )
      }
    }
    lines.push('')

    // Persona & Kimlik Karnesi (Identity Persona Özeti)
    const personaSet = new Set<string>()
    for (const d of dreams) {
      if (d.identity_persona && d.identity_persona.trim()) {
        personaSet.add(d.identity_persona.trim())
      }
    }
    for (const r of data.routines || []) {
      if (r.identity_persona && r.identity_persona.trim()) {
        personaSet.add(r.identity_persona.trim())
      }
    }

    if (personaSet.size > 0) {
      lines.push('### 🎭 Kimlik Personaları Özeti')
      lines.push('| Persona | Aktif Hedef Sayısı | Aktif Rutin Sayısı | Odak Alanları |')
      lines.push('| :--- | :--- | :--- | :--- |')
      const sortedPersonas = Array.from(personaSet).sort()
      for (const persona of sortedPersonas) {
        const personaDreams = dreams.filter(
          (d) => (d.identity_persona || '').trim() === persona && d.status === 'active'
        )
        const personaRoutines = (data.routines || []).filter(
          (r) => (r.identity_persona || '').trim() === persona && r.is_active
        )
        const categories = Array.from(
          new Set(
            [
              ...dreams
                .filter((d) => (d.identity_persona || '').trim() === persona && d.category)
                .map((d) => d.category!.trim()),
              ...personaRoutines
                .map((r) => (r.dream_id ? dreamMap.get(r.dream_id)?.category?.trim() : null))
                .filter(Boolean) as string[],
            ].filter(Boolean)
          )
        )
        const focusAreas = categories.length > 0 ? categories.join(', ') : '-'
        lines.push(
          `| ${cleanCell(persona)} | ${personaDreams.length} hedef | ${personaRoutines.length} rutin | ${cleanCell(focusAreas)} |`
        )
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // 5. Bölüm 3: Çalışma: Projeler & Fikirler
  if (sections.projectsAndIdeas) {
    const projects = data.projects || []
    const ideas = data.ideas || []
    sectionCounts.projects = projects.length
    sectionCounts.ideas = ideas.length

    lines.push('## 3. Çalışma: Projeler & Fikirler')
    lines.push('')
    lines.push('### 🚀 Projeler')
    if (projects.length === 0) {
      lines.push('*Kayıtlı proje bulunmuyor.*')
    } else {
      lines.push('| Proje | Tür | Durum | URL / Repo | Açıklama |')
      lines.push('| :--- | :--- | :--- | :--- | :--- |')
      for (const p of projects) {
        const pType = PROJECT_TYPE_MAP[p.project_type] || p.project_type

        const links = [
          p.live_url ? `[Canlı](${p.live_url})` : '',
          p.repo_url ? `[Repo](${p.repo_url})` : '',
        ].filter(Boolean).join(' ') || '-'

        lines.push(
          `| ${cleanCell(p.name)} | ${cleanCell(pType)} | ${cleanCell(p.status)} | ${cleanCell(links)} | ${summarizeInline(p.description)} |`
        )
      }

      if (sections.projectAndIdeaDocs) {
        const detailedProjects = projects.filter((p) => hasDetailedDoc(p.description))
        if (detailedProjects.length > 0) {
          lines.push('')
          for (const p of detailedProjects) {
            lines.push(`#### 📁 ${p.name} — Detaylı Dokümantasyon`)
            lines.push('')
            lines.push(cleanMultiLine(p.description, 5))
            lines.push('')
          }
        }
      }
    }
    lines.push('')

    lines.push('### 💡 Fikir Havuzu')
    if (ideas.length === 0) {
      lines.push('*Kayıtlı fikir bulunmuyor.*')
    } else {
      lines.push('| Fikir | Durum | Puan | Etiketler | Terfi Edilen Proje | Açıklama |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const idea of ideas) {
        const status = IDEA_STATUS_MAP[idea.status] || idea.status
        const score = idea.score !== null && idea.score !== undefined ? `${idea.score}/10` : '-'
        const tags = Array.isArray(idea.tags) && idea.tags.length > 0 ? idea.tags.join(', ') : '-'
        const promoted = resolveProject(idea.promoted_project_id)

        lines.push(
          `| ${cleanCell(idea.title)} | ${cleanCell(status)} | ${cleanCell(score)} | ${cleanCell(tags)} | ${cleanCell(promoted)} | ${summarizeInline(idea.description)} |`
        )
      }

      if (sections.projectAndIdeaDocs) {
        const detailedIdeas = ideas.filter((idea) => hasDetailedDoc(idea.description))
        if (detailedIdeas.length > 0) {
          lines.push('')
          for (const idea of detailedIdeas) {
            lines.push(`#### 📁 ${idea.title} — Detaylı Dokümantasyon`)
            lines.push('')
            lines.push(cleanMultiLine(idea.description, 5))
            lines.push('')
          }
        }
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // 6. Bölüm 4: Günlük Yaşam: Rutinler & Ajanda
  if (sections.routinesAndAgenda) {
    const routines = data.routines || []
    const routineLogs = data.routine_logs || []
    const agendaItems = data.agenda_items || []

    sectionCounts.routines = routines.length
    sectionCounts.routine_logs = routineLogs.length
    sectionCounts.agenda_items = agendaItems.length

    lines.push('## 4. Günlük Yaşam: Rutinler & Ajanda')
    lines.push('')
    lines.push('### 🔄 Rutinler & Alışkanlıklar')
    if (routines.length === 0) {
      lines.push('*Kayıtlı rutin bulunmuyor.*')
    } else {
      lines.push('| Rutin | Persona | Zaman Bloğu | Sıklık | Hedef Süre | Min. Efektif Doz | Bağlı Hayal | Durum | Tamamlanma İstatistiği |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const r of routines) {
        const tb = ROUTINE_TIME_BLOCK_MAP[r.time_block] || r.time_block
        let freq = ROUTINE_FREQ_MAP[r.frequency] || r.frequency
        if (r.target_days && r.target_days.length > 0 && r.frequency === 'custom') {
          const daysStr = r.target_days.map((day) => DAY_SHORT_NAMES[day] || day).join(', ')
          freq = `${freq} (${daysStr})`
        }
        const dur = r.target_duration_minutes ? `${r.target_duration_minutes} dk` : '-'
        const dream = resolveDream(r.dream_id)
        const status = r.is_active ? 'Aktif' : 'Pasif'

        // Log istatistikleri
        const logs = routineLogs.filter((l) => l.routine_id === r.id)
        const completed = logs.filter((l) => l.status === 'completed').length
        const micro = logs.filter((l) => l.status === 'micro_dose').length
        const kintsugi = logs.filter((l) => l.status === 'kintsugi_repaired').length
        const statSummary = logs.length > 0
          ? `${completed} tam / ${micro} mikro / ${kintsugi} telafi (Toplam: ${logs.length})`
          : 'Henüz kayıt yok'

        lines.push(
          `| ${cleanCell(r.title)} | ${cleanCell(r.identity_persona)} | ${cleanCell(tb)} | ${cleanCell(freq)} | ${cleanCell(dur)} | ${cleanCell(r.minimum_effective_dose)} | ${cleanCell(dream)} | ${cleanCell(status)} | ${cleanCell(statSummary)} |`
        )
      }
    }
    lines.push('')

    if (routineLogs.length > 0) {
      lines.push('#### 📜 Son Rutin Kayıtları')
      lines.push('| Tarih | Rutin | Durum | Süre | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- |')
      // Tarihe göre sıralı (azalan)
      const sortedLogs = [...routineLogs].sort((a, b) => (b.log_date || '').localeCompare(a.log_date || ''))
      for (const log of sortedLogs) {
        const rTitle = resolveRoutine(log.routine_id)
        const logStatus = ROUTINE_LOG_STATUS_MAP[log.status] || log.status
        const dur = log.duration_minutes ? `${log.duration_minutes} dk` : '-'
        lines.push(
          `| ${cleanCell(log.log_date)} | ${cleanCell(rTitle)} | ${cleanCell(logStatus)} | ${cleanCell(dur)} | ${cleanCell(log.note)} |`
        )
      }
      lines.push('')
    }

    lines.push('### 📅 Ajanda & Görevler')
    if (agendaItems.length === 0) {
      lines.push('*Kayıtlı ajanda görevi bulunmuyor.*')
    } else {
      lines.push('| Plan Tarihi | Saat | Başlık | Proje | Durum | Süre | Notlar |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      const sortedAgenda = [...agendaItems].sort((a, b) => {
        const dateA = `${a.plan_date || ''} ${a.plan_time || ''}`
        const dateB = `${b.plan_date || ''} ${b.plan_time || ''}`
        return dateB.localeCompare(dateA)
      })

      for (const item of sortedAgenda) {
        const proj = resolveProject(item.project_id)
        const status = AGENDA_STATUS_MAP[item.status] || item.status
        const durMin = item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} dk` : '-'

        lines.push(
          `| ${cleanCell(item.plan_date)} | ${cleanCell(item.plan_time)} | ${cleanCell(item.title)} | ${cleanCell(proj)} | ${cleanCell(status)} | ${cleanCell(durMin)} | ${cleanCell(item.notes)} |`
        )
      }
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // 7. Bölüm 5: Seyir Defteri / Günlük (journal_entries)
  if (sections.journal) {
    const journals = data.journal_entries || []
    sectionCounts.journal_entries = journals.length
    lines.push('## 5. Seyir Defteri / Günlük')
    lines.push('')
    if (journals.length === 0) {
      lines.push('*Kayıtlı günlük girişi bulunmuyor.*')
    } else {
      // Tarihe göre azalan
      const sortedJournals = [...journals].sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''))
      for (const j of sortedJournals) {
        const mood = MOOD_MAP[j.mood] || j.mood
        const tmpl = TEMPLATE_MAP[j.template_type] || j.template_type
        const tags = Array.isArray(j.tags) && j.tags.length > 0 ? j.tags.join(', ') : '-'
        const weather = j.weather_note ? cleanCell(j.weather_note) : '-'
        const pinned = j.pinned ? ' ⭐ Sabitli' : ''

        lines.push(`### 📅 ${j.entry_date} — ${j.title || 'İsimsiz Günlük'}${pinned}`)
        lines.push(`- **Ruh Hali:** ${mood} | **Şablon:** ${tmpl} | **Etiketler:** ${tags} | **Ortam/Hava:** ${weather}`)
        lines.push('')
        lines.push(cleanMultiLine(j.content) || '*İçerik boş.*')
        lines.push('')
        lines.push('---')
        lines.push('')
      }
    }
  }

  // 8. Bölüm 6: Finansal Varlıklar, Borçlar, Gelirler ve Abonelikler
  if (sections.financialOverview) {
    const accounts = data.accounts || []
    const investments = data.investments || []
    const cards = data.credit_cards || []
    const statements = data.card_statements || []
    const debts = data.debts || []
    const debtInsts = data.debt_installments || []
    const incomes = data.incomes || []
    const subs = data.subscriptions || []
    const mappings = data.merchant_mappings || []

    sectionCounts.accounts = accounts.length
    sectionCounts.investments = investments.length
    sectionCounts.credit_cards = cards.length
    sectionCounts.card_statements = statements.length
    sectionCounts.debts = debts.length
    sectionCounts.debt_installments = debtInsts.length
    sectionCounts.incomes = incomes.length
    sectionCounts.subscriptions = subs.length
    sectionCounts.merchant_mappings = mappings.length

    lines.push('## 6. Finansal Varlıklar, Borçlar, Gelirler ve Abonelikler')
    lines.push('')

    // 6.1 Banka & Kasa Hesapları
    lines.push('### 🏦 Banka & Kasa Hesapları')
    if (accounts.length === 0) {
      lines.push('*Kayıtlı hesap bulunmuyor.*')
    } else {
      lines.push('| Hesap Adı | Tür | Bakiye | Bakiye Tarihi | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- |')
      for (const acc of accounts) {
        lines.push(
          `| ${cleanCell(acc.name)} | ${cleanCell(acc.type)} | ${cleanCell(formatCurrency(acc.balance))} | ${cleanCell(acc.balance_as_of)} | ${cleanCell(acc.note)} |`
        )
      }
    }
    lines.push('')

    // 6.2 Yatırımlar & Portföy
    lines.push('### 📈 Yatırımlar & Portföy')
    if (investments.length === 0) {
      lines.push('*Kayıtlı yatırım varlığı bulunmuyor.*')
    } else {
      lines.push('| Varlık | Sembol | Kategori | Kurum | Miktar | Birim Maliyet | Güncel Fiyat | Toplam Değer | K/Z (%) | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const inv of investments) {
        const totalVal = (Number(inv.quantity) || 0) * (Number(inv.current_price) || 0)
        let plPct = '-'
        const curPrice = Number(inv.current_price) || 0
        const unitCost = Number(inv.unit_cost) || 0
        if (unitCost > 0 && curPrice > 0) {
          const diff = ((curPrice - unitCost) / unitCost) * 100
          plPct = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
        }

        lines.push(
          `| ${cleanCell(inv.name)} | ${cleanCell(inv.symbol)} | ${cleanCell(inv.category)} | ${cleanCell(inv.institution)} | ${cleanCell(inv.quantity)} | ${cleanCell(formatCurrency(inv.unit_cost, inv.currency))} | ${cleanCell(formatCurrency(inv.current_price, inv.currency))} | ${cleanCell(formatCurrency(totalVal, inv.currency))} | ${cleanCell(plPct)} | ${cleanCell(inv.note)} |`
        )
      }
    }
    lines.push('')

    // 6.3 Kredi Kartları & Ekstreler
    lines.push('### 💳 Kredi Kartları')
    if (cards.length === 0) {
      lines.push('*Kayıtlı kredi kartı bulunmuyor.*')
    } else {
      lines.push('| Banka | Kart Adı | Son 4 Hane | Güncel Borç | Ekstre Borcu | Asgari Ödeme | Faiz/Masraf | Kesim Günü | Son Ödeme Tarihi | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const card of cards) {
        const feesStr = card.interest_fees ? formatCurrency(card.interest_fees) : '-'
        lines.push(
          `| ${cleanCell(card.bank)} | ${cleanCell(card.card_name)} | ${cleanCell(card.last_four ? `**** ${card.last_four}` : '-')} | ${cleanCell(formatCurrency(card.current_debt))} | ${cleanCell(formatCurrency(card.statement_debt))} | ${cleanCell(formatCurrency(card.minimum_payment))} | ${cleanCell(feesStr)} | ${cleanCell(card.statement_date)} | ${cleanCell(card.due_date)} | ${cleanCell(card.status_note)} |`
        )
      }
    }
    lines.push('')

    const activeInstallments = extractActiveCardInstallments(data.transactions || [], resolveCard)
    if (activeInstallments.length > 0) {
      lines.push('#### ⏳ Aktif Kart Taksitleri & Kalan Yük')
      lines.push('| Kart | İşlem / Açıklama | Taksit Durumu | Aylık Taksit | Kalan Ay | Kalan Toplam Yük |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const inst of activeInstallments) {
        lines.push(
          `| ${cleanCell(inst.cardName)} | ${cleanCell(inst.description)} | ${cleanCell(inst.installmentStatus)} | ${cleanCell(formatCurrency(inst.monthlyAmount))} | ${cleanCell(`${inst.remainingMonths} ay`)} | ${cleanCell(formatCurrency(inst.remainingLoad))} |`
        )
      }
      lines.push('')
    }

    if (statements.length > 0) {
      lines.push('#### 📄 Kart Ekstre Geçmişi')
      lines.push('| Kart | Ekstre Tarihi | Dönem Borcu | Asgari Ödeme | Ödemeler | Harcama | Nakit Avans | Faiz/Masraf | Son Ödeme Tarihi | Değişim (%) |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      const sortedStmts = [...statements].sort((a, b) => (b.statement_date || '').localeCompare(a.statement_date || ''))
      for (const s of sortedStmts) {
        const cName = resolveCard(s.card_id)
        const chg = s.change_pct !== null && s.change_pct !== undefined ? `${s.change_pct > 0 ? '+' : ''}${s.change_pct}%` : '-'
        lines.push(
          `| ${cleanCell(cName)} | ${cleanCell(s.statement_date)} | ${cleanCell(formatCurrency(s.period_debt))} | ${cleanCell(formatCurrency(s.minimum))} | ${cleanCell(formatCurrency(s.payments))} | ${cleanCell(formatCurrency(s.spending))} | ${cleanCell(formatCurrency(s.cash_advance))} | ${cleanCell(formatCurrency(s.interest_fees))} | ${cleanCell(s.due_date)} | ${cleanCell(chg)} |`
        )
      }
      lines.push('')
    }

    // 6.4 Borçlar & Alacaklar
    lines.push('### ⚖️ Borçlar & Alacaklar')
    if (debts.length === 0) {
      lines.push('*Kayıtlı borç veya alacak bulunmuyor.*')
    } else {
      lines.push('| Tür | Kişi / Kurum | Kategori | Anapara | Ödenen | Kalan | Durum | Açıklama |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const d of debts) {
        lines.push(
          `| ${cleanCell(d.type)} | ${cleanCell(d.person_or_entity)} | ${cleanCell(d.category)} | ${cleanCell(formatCurrency(d.principal))} | ${cleanCell(formatCurrency(d.past_payments))} | ${cleanCell(formatCurrency(d.remaining))} | ${cleanCell(d.status)} | ${cleanCell(d.description)} |`
        )
      }
    }
    lines.push('')

    if (debtInsts.length > 0) {
      lines.push('#### 📑 Borç Taksit Planı')
      lines.push('| Borç/Alacak | Taksit No | Vade Tarihi | Tutar | Durum | Ödenme Tarihi | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      const sortedInsts = [...debtInsts].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      for (const inst of sortedInsts) {
        const dName = resolveDebt(inst.debt_id)
        lines.push(
          `| ${cleanCell(dName)} | #${cleanCell(inst.installment_no)} | ${cleanCell(inst.due_date)} | ${cleanCell(formatCurrency(inst.amount))} | ${cleanCell(inst.status)} | ${cleanCell(inst.paid_at)} | ${cleanCell(inst.note)} |`
        )
      }
      lines.push('')
    }

    // 6.5 Gelir Kaynakları
    lines.push('### 💵 Gelirler & Kaynaklar')
    if (incomes.length === 0) {
      lines.push('*Kayıtlı gelir kaynağı bulunmuyor.*')
    } else {
      lines.push('| Gelir Başlığı | Kategori | Tür | Tutar | Periyot | Ödeme Günü | Durum | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const inc of incomes) {
        const payday = inc.payday ? `Ayın ${inc.payday}. günü` : '-'
        lines.push(
          `| ${cleanCell(inc.title)} | ${cleanCell(inc.category)} | ${cleanCell(inc.income_type)} | ${cleanCell(formatCurrency(inc.amount, inc.currency))} | ${cleanCell(inc.period)} | ${cleanCell(payday)} | ${cleanCell(inc.status)} | ${cleanCell(inc.note)} |`
        )
      }
    }
    lines.push('')

    // 6.6 Abonelikler
    lines.push('### 🔁 Abonelikler & Düzenli Giderler')
    if (subs.length === 0) {
      lines.push('*Kayıtlı abonelik bulunmuyor.*')
    } else {
      lines.push('| Servis | Grup | Model | Tutar | Periyot | Aylık Eşdeğer | Bitiş / Yenilenme | Stratejik Etiket | Karar | Durum | Ödeme Yöntemi / Kart |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const sub of subs) {
        const cardOrMethod = sub.payment_method || '-'
        const eq = calculateSubscriptionEquivalent(sub.amount, sub.period, sub.currency)
        lines.push(
          `| ${cleanCell(sub.service)} | ${cleanCell(sub.group_type)} | ${cleanCell(sub.model)} | ${cleanCell(formatCurrency(sub.amount, sub.currency))} | ${cleanCell(sub.period)} | ${cleanCell(formatCurrency(eq.monthly, sub.currency))} | ${cleanCell(sub.end_date)} | ${cleanCell(sub.strategic_tag)} | ${cleanCell(sub.decision)} | ${cleanCell(sub.status)} | ${cleanCell(cardOrMethod)} |`
        )
      }
    }
    lines.push('')

    // 6.7 İşyeri Eşleştirme Kuralları
    if (mappings.length > 0) {
      lines.push('### 🏷️ İşyeri Eşleştirme Kuralları')
      lines.push('| Ham Desen | İşyeri Adı | Varsayılan Grup |')
      lines.push('| :--- | :--- | :--- |')
      for (const m of mappings) {
        lines.push(
          `| ${cleanCell(m.raw_pattern)} | ${cleanCell(m.merchant_name)} | ${cleanCell(m.default_group)} |`
        )
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // 9. Bölüm 7: Hesap ve Kart Hareketleri (transactions)
  if (sections.transactions) {
    const txs = data.transactions || []
    sectionCounts.transactions = txs.length
    lines.push('## 7. Hesap ve Kart Hareketleri')
    lines.push('')

    if (txs.length === 0) {
      lines.push('*Kayıtlı hesap veya kart hareketi bulunmuyor.*')
    } else {
      // En yeniden eskiye doğru sırala
      const sortedTxs = [...txs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      // Yıl-Ay bazında grupla
      const groups = new Map<string, typeof sortedTxs>()
      for (const tx of sortedTxs) {
        const monthKey = tx.date ? tx.date.slice(0, 7) : 'Tarihsiz'
        if (!groups.has(monthKey)) {
          groups.set(monthKey, [])
        }
        groups.get(monthKey)!.push(tx)
      }

      for (const [monthKey, monthTxs] of groups.entries()) {
        const monthExpense = monthTxs
          .filter((t) => t.type === 'Harcama' || t.type === 'Finansman/Masraf' || t.type === 'Borç Ödemesi')
          .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)
        const monthIncome = monthTxs
          .filter((t) => t.type === 'Gelir' || t.type === 'Tahsilat' || t.type === 'İade')
          .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)

        lines.push(`### 🗓️ ${monthKey} (Harcama: ${formatCurrency(monthExpense)} | Gelir: ${formatCurrency(monthIncome)})`)
        lines.push('| Tarih | Tür | Açıklama / İşyeri | Tutar | Grup | Hesap / Kart |')
        lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |')

        for (const tx of monthTxs) {
          let desc = tx.description ? String(tx.description).trim() : ''
          if (tx.merchant && tx.merchant.trim()) {
            const m = tx.merchant.trim()
            if (desc && desc.toLowerCase() !== m.toLowerCase()) {
              desc = `${m} (${desc})`
            } else {
              desc = m
            }
          }
          if (!desc) desc = '-'

          let source = '-'
          if (tx.card_id) {
            source = resolveCard(tx.card_id)
          } else if (tx.account_id) {
            source = resolveAccount(tx.account_id)
          } else if (tx.account_or_card) {
            source = tx.account_or_card
          }

          const numAmount = Math.abs(Number(tx.amount) || 0)
          const amountFormatted = (tx.type === 'Harcama' || tx.type === 'Finansman/Masraf' || tx.type === 'Borç Ödemesi')
            ? `-${formatCurrency(numAmount)}`
            : (tx.type === 'Gelir' || tx.type === 'Tahsilat' || tx.type === 'İade')
            ? `+${formatCurrency(numAmount)}`
            : formatCurrency(numAmount)

          const recurrencePart = tx.recurrence ? ` [${tx.recurrence}]` : ''
          const typeWithRecurrence = `${tx.type || '-'}${recurrencePart}`

          lines.push(
            `| ${cleanCell(tx.date)} | ${cleanCell(typeWithRecurrence)} | ${cleanCell(desc)} | ${cleanCell(amountFormatted)} | ${cleanCell(tx.analysis_group)} | ${cleanCell(source)} |`
          )
        }
        lines.push('')
      }
    }
  }

  // 10. İstatistikleri ve Metrikleri Hesapla
  const markdown = lines.join('\n')
  const trimmed = markdown.trim()
  const charCount = markdown.length
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  const estimatedTokens = Math.ceil(charCount / 4)

  // Dahil edilen kayıt sayısı (Kesinlikle credentials hariç)
  const includedRecords = Object.values(sectionCounts).reduce((sum, count) => sum + count, 0)

  return {
    markdown,
    stats: {
      charCount,
      wordCount,
      estimatedTokens,
      includedRecords,
      sectionCounts,
    },
  }
}
