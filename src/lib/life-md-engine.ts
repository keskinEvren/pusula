import type { PusulaVaultData } from '@/lib/vault-engine'
import { formatCurrency } from '@/lib/utils'

export interface LifeMdSectionOptions {
  executiveSummary?: boolean
  dreamsAndGoals?: boolean
  projectsAndIdeas?: boolean
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
export function cleanMultiLine(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  if (!str) return ''
  // Günlük içeriğinde # veya ## veya ### başlıkları varsa life.md'nin hiyerarşisini bozmaması için seviyelerini düşür
  return str.replace(/^(#{1,3})\s+(.*)$/gm, '#### $2')
}

const DEFAULT_SECTIONS: Required<LifeMdSectionOptions> = {
  executiveSummary: true,
  dreamsAndGoals: true,
  projectsAndIdeas: true,
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
  const investmentMap = new Map((data.investments || []).map((i) => [i.id, i]))

  const resolveProject = (id?: string | null) => (id ? projectMap.get(id)?.name || '-' : '-')
  const resolveAccount = (id?: string | null) => (id ? accountMap.get(id)?.name || '-' : '-')
  const resolveCard = (id?: string | null) => {
    if (!id) return '-'
    const c = cardMap.get(id)
    if (!c) return '-'
    const bankPrefix = c.bank ? `${c.bank} - ` : ''
    const lastFour = c.last_four ? ` (**** ${c.last_four})` : ''
    return `${bankPrefix}${c.card_name}${lastFour}`
  }
  const resolveDream = (id?: string | null) => (id ? dreamMap.get(id)?.title || '-' : '-')
  const resolveDebt = (id?: string | null) => {
    if (!id) return '-'
    const d = debtMap.get(id)
    if (!d) return '-'
    return `${d.person_or_entity} (${d.type})`
  }
  const resolveRoutine = (id?: string | null) => (id ? routineMap.get(id)?.title || '-' : '-')
  const resolveInvestment = (id?: string | null) => {
    if (!id) return '-'
    const inv = investmentMap.get(id)
    if (!inv) return '-'
    return `${inv.name} (${inv.symbol})`
  }

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

    const netWorth = totalBankBalance + totalInvestmentValue + openReceivables - (totalCardDebt + openDebts)

    const activeMonthlyIncome = (data.incomes || [])
      .filter((i) => i.status === 'Aktif')
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

    const activeMonthlySubs = (data.subscriptions || [])
      .filter((s) => s.status === 'Aktif')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

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
    lines.push(`| **Net Finansal Varlık** | **${formatCurrency(netWorth)}** | *(Nakit + Yatırım + Alacaklar) - (Kart + Borçlar)* |`)
    lines.push(`| **Aylık Aktif Gelirler** | ${formatCurrency(activeMonthlyIncome)} | ${(data.incomes || []).filter((i) => i.status === 'Aktif').length} aktif gelir |`)
    lines.push(`| **Aylık Aktif Abonelikler** | ${formatCurrency(activeMonthlySubs)} | ${(data.subscriptions || []).filter((s) => s.status === 'Aktif').length} aktif abonelik |`)
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
      lines.push('| Proje | Tür | Durum | Bütçe Limiti | Harcama | Gelir / Ay | Abonelik / Ay | Borç / Alacak | URL / Repo | Açıklama |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const p of projects) {
        const pType = PROJECT_TYPE_MAP[p.project_type] || p.project_type
        const budget = p.budget_limit ? formatCurrency(p.budget_limit) : '-'

        // Projeye bağlı ilişkisel finansal toplamlar
        const spent = (data.transactions || [])
          .filter((t) => t.project_id === p.id && (t.type === 'Harcama' || t.type === 'Finansman/Masraf'))
          .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0)

        const incomeMonthly = (data.incomes || [])
          .filter((i) => i.project_id === p.id && i.status === 'Aktif')
          .reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

        const subsMonthly = (data.subscriptions || [])
          .filter((s) => s.project_id === p.id && s.status === 'Aktif')
          .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

        const projectDebts = (data.debts || [])
          .filter((d) => d.project_id === p.id && d.status === 'Açık' && d.type === 'Borç')
          .reduce((sum, d) => sum + (Number(d.remaining) || 0), 0)

        const projectReceivables = (data.debts || [])
          .filter((d) => d.project_id === p.id && d.status === 'Açık' && d.type === 'Alacak')
          .reduce((sum, d) => sum + (Number(d.remaining) || 0), 0)

        let debtReceivableStr = '-'
        if (projectDebts > 0 && projectReceivables > 0) {
          debtReceivableStr = `Borç: ${formatCurrency(projectDebts)} | Alacak: ${formatCurrency(projectReceivables)}`
        } else if (projectDebts > 0) {
          debtReceivableStr = `Borç: ${formatCurrency(projectDebts)}`
        } else if (projectReceivables > 0) {
          debtReceivableStr = `Alacak: ${formatCurrency(projectReceivables)}`
        }

        const links = [
          p.live_url ? `[Canlı](${p.live_url})` : '',
          p.repo_url ? `[Repo](${p.repo_url})` : '',
        ].filter(Boolean).join(' ') || '-'

        lines.push(
          `| ${cleanCell(p.name)} | ${cleanCell(pType)} | ${cleanCell(p.status)} | ${cleanCell(budget)} | ${cleanCell(formatCurrency(spent))} | ${cleanCell(formatCurrency(incomeMonthly))} | ${cleanCell(formatCurrency(subsMonthly))} | ${cleanCell(debtReceivableStr)} | ${cleanCell(links)} | ${cleanCell(p.description)} |`
        )
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
          `| ${cleanCell(idea.title)} | ${cleanCell(status)} | ${cleanCell(score)} | ${cleanCell(tags)} | ${cleanCell(promoted)} | ${cleanCell(idea.description)} |`
        )
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
      lines.push('| Tür | Kişi / Kurum | Kategori | Anapara | Ödenen | Kalan | Durum | Proje | Bağlı Hesap | Açıklama |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const d of debts) {
        const proj = resolveProject(d.project_id)
        const acc = resolveAccount(d.linked_account_id)
        lines.push(
          `| ${cleanCell(d.type)} | ${cleanCell(d.person_or_entity)} | ${cleanCell(d.category)} | ${cleanCell(formatCurrency(d.principal))} | ${cleanCell(formatCurrency(d.past_payments))} | ${cleanCell(formatCurrency(d.remaining))} | ${cleanCell(d.status)} | ${cleanCell(proj)} | ${cleanCell(acc)} | ${cleanCell(d.description)} |`
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
      lines.push('| Gelir Başlığı | Kategori | Tür | Tutar | Periyot | Ödeme Günü | Durum | Proje | Not |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const inc of incomes) {
        const proj = resolveProject(inc.project_id)
        const payday = inc.payday ? `Ayın ${inc.payday}. günü` : '-'
        lines.push(
          `| ${cleanCell(inc.title)} | ${cleanCell(inc.category)} | ${cleanCell(inc.income_type)} | ${cleanCell(formatCurrency(inc.amount, inc.currency))} | ${cleanCell(inc.period)} | ${cleanCell(payday)} | ${cleanCell(inc.status)} | ${cleanCell(proj)} | ${cleanCell(inc.note)} |`
        )
      }
    }
    lines.push('')

    // 6.6 Abonelikler
    lines.push('### 🔁 Abonelikler & Düzenli Giderler')
    if (subs.length === 0) {
      lines.push('*Kayıtlı abonelik bulunmuyor.*')
    } else {
      lines.push('| Servis | Grup | Model | Tutar | Periyot | Bitiş / Yenilenme | Stratejik Etiket | Karar | Durum | Ödeme Yöntemi / Kart | Proje |')
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
      for (const sub of subs) {
        const proj = resolveProject(sub.project_id)
        const cardOrMethod = sub.payment_card_id ? resolveCard(sub.payment_card_id) : (sub.payment_method || '-')
        lines.push(
          `| ${cleanCell(sub.service)} | ${cleanCell(sub.group_type)} | ${cleanCell(sub.model)} | ${cleanCell(formatCurrency(sub.amount, sub.currency))} | ${cleanCell(sub.period)} | ${cleanCell(sub.end_date)} | ${cleanCell(sub.strategic_tag)} | ${cleanCell(sub.decision)} | ${cleanCell(sub.status)} | ${cleanCell(cardOrMethod)} | ${cleanCell(proj)} |`
        )
      }
    }
    lines.push('')

    // 6.7 İşyeri Eşleştirme Kuralları
    if (mappings.length > 0) {
      lines.push('### 🏷️ İşyeri Eşleştirme Kuralları')
      lines.push('| Ham Desen | İşyeri Adı | Varsayılan Grup | Varsayılan Proje |')
      lines.push('| :--- | :--- | :--- | :--- |')
      for (const m of mappings) {
        const defProj = resolveProject(m.default_project_id)
        lines.push(
          `| ${cleanCell(m.raw_pattern)} | ${cleanCell(m.merchant_name)} | ${cleanCell(m.default_group)} | ${cleanCell(defProj)} |`
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
        lines.push('| Tarih | Tür | Açıklama / İşyeri | Tutar | Grup | Hesap / Kart | Proje | İlişkili Bağlantı |')
        lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')

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
          if (tx.source_account_id) {
            const src = resolveAccount(tx.source_account_id)
            const tgt = tx.target_account_id ? resolveAccount(tx.target_account_id) : ''
            source = tgt && tgt !== '-' ? `${src} → ${tgt}` : src
          } else if (tx.card_id) {
            source = resolveCard(tx.card_id)
          } else if (tx.account_id) {
            source = resolveAccount(tx.account_id)
          } else if (tx.account_or_card) {
            source = tx.account_or_card
          }

          const proj = resolveProject(tx.project_id)

          const relatedParts: string[] = []
          if (tx.related_debt_id) {
            relatedParts.push(`Borç/Alacak: ${resolveDebt(tx.related_debt_id)}`)
          }
          if (tx.related_investment_id) {
            let invDetails = resolveInvestment(tx.related_investment_id)
            if (tx.investment_quantity_delta !== null && tx.investment_quantity_delta !== undefined) {
              const sign = tx.investment_quantity_delta > 0 ? '+' : ''
              invDetails += ` (${sign}${tx.investment_quantity_delta} adet`
              if (tx.investment_unit_price) {
                invDetails += ` @ ${formatCurrency(tx.investment_unit_price)}`
              }
              invDetails += ')'
            }
            relatedParts.push(`Yatırım: ${invDetails}`)
          }
          const related = relatedParts.join(', ') || '-'

          const numAmount = Math.abs(Number(tx.amount) || 0)
          const amountFormatted = (tx.type === 'Harcama' || tx.type === 'Finansman/Masraf' || tx.type === 'Borç Ödemesi')
            ? `-${formatCurrency(numAmount)}`
            : (tx.type === 'Gelir' || tx.type === 'Tahsilat' || tx.type === 'İade')
            ? `+${formatCurrency(numAmount)}`
            : formatCurrency(numAmount)

          const recurrencePart = tx.recurrence ? ` [${tx.recurrence}]` : ''
          const typeWithRecurrence = `${tx.type || '-'}${recurrencePart}`

          lines.push(
            `| ${cleanCell(tx.date)} | ${cleanCell(typeWithRecurrence)} | ${cleanCell(desc)} | ${cleanCell(amountFormatted)} | ${cleanCell(tx.analysis_group)} | ${cleanCell(source)} | ${cleanCell(proj)} | ${cleanCell(related)} |`
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
