import type {
  Account,
  CreditCard,
  CardStatement,
  Transaction,
  Debt,
  Subscription,
  MerchantMapping,
  Investment,
  Project,
  ProjectTask,
  Idea,
  Dream,
  Routine,
  RoutineLog,
  JournalEntry,
} from '@/types/database'

export interface PusulaVaultData {
  accounts: Account[]
  credit_cards: CreditCard[]
  card_statements: CardStatement[]
  transactions: Transaction[]
  debts: Debt[]
  subscriptions: Subscription[]
  merchant_mappings: MerchantMapping[]
  investments: Investment[]
  projects: Project[]
  project_tasks: ProjectTask[]
  ideas: Idea[]
  dreams: Dream[]
  routines: Routine[]
  routine_logs: RoutineLog[]
  journal_entries: JournalEntry[]
}

export interface VaultManifest {
  version: string
  app: string
  exported_at: string
  counts: Record<keyof PusulaVaultData, number>
  total_records: number
  estimated_size_kb: number
}

export interface VaultPayload {
  manifest: VaultManifest
  data: PusulaVaultData
}

export const EMPTY_VAULT_DATA: PusulaVaultData = {
  accounts: [],
  credit_cards: [],
  card_statements: [],
  transactions: [],
  debts: [],
  subscriptions: [],
  merchant_mappings: [],
  investments: [],
  projects: [],
  project_tasks: [],
  ideas: [],
  dreams: [],
  routines: [],
  routine_logs: [],
  journal_entries: [],
}

export const VAULT_TABLE_LABELS: Record<keyof PusulaVaultData, { label: string; icon: string; category: string }> = {
  accounts: { label: 'Banka & Kasalar', icon: '', category: 'Finans' },
  credit_cards: { label: 'Kredi Kartları', icon: '', category: 'Finans' },
  card_statements: { label: 'Kart Ekstreleri', icon: '', category: 'Finans' },
  transactions: { label: 'Hesap Hareketleri', icon: '', category: 'Finans' },
  debts: { label: 'Borç & Alacaklar', icon: '', category: 'Finans' },
  subscriptions: { label: 'Abonelikler & Sabit Giderler', icon: '', category: 'Finans' },
  investments: { label: 'Yatırımlar & Portföy', icon: '', category: 'Finans' },
  merchant_mappings: { label: 'Eşleştirme Kuralları', icon: '', category: 'Finans' },
  projects: { label: 'Projeler', icon: '', category: 'Çalışma' },
  project_tasks: { label: 'Proje Görevleri', icon: '', category: 'Çalışma' },
  ideas: { label: 'Fikirler', icon: '', category: 'Çalışma' },
  dreams: { label: 'Hedefler & Vizyon', icon: '', category: 'Kişisel' },
  routines: { label: 'Rutinler & Alışkanlıklar', icon: '', category: 'Kişisel' },
  routine_logs: { label: 'Rutin Kayıtları', icon: '', category: 'Kişisel' },
  journal_entries: { label: 'Günlük Kayıtları', icon: '', category: 'Kişisel' },
}

// ---------------------------------------------------------------------------
// 1. Yedek Yükü (Payload) Oluşturma
// ---------------------------------------------------------------------------

export function createVaultPayload(data: Partial<PusulaVaultData>): VaultPayload {
  const completeData: PusulaVaultData = {
    accounts: data.accounts || [],
    credit_cards: data.credit_cards || [],
    card_statements: data.card_statements || [],
    transactions: data.transactions || [],
    debts: data.debts || [],
    subscriptions: data.subscriptions || [],
    merchant_mappings: data.merchant_mappings || [],
    investments: data.investments || [],
    projects: data.projects || [],
    project_tasks: data.project_tasks || [],
    ideas: data.ideas || [],
    dreams: data.dreams || [],
    routines: data.routines || [],
    routine_logs: data.routine_logs || [],
    journal_entries: data.journal_entries || [],
  }

  const counts: Record<keyof PusulaVaultData, number> = {
    accounts: completeData.accounts.length,
    credit_cards: completeData.credit_cards.length,
    card_statements: completeData.card_statements.length,
    transactions: completeData.transactions.length,
    debts: completeData.debts.length,
    subscriptions: completeData.subscriptions.length,
    merchant_mappings: completeData.merchant_mappings.length,
    investments: completeData.investments.length,
    projects: completeData.projects.length,
    project_tasks: completeData.project_tasks.length,
    ideas: completeData.ideas.length,
    dreams: completeData.dreams.length,
    routines: completeData.routines.length,
    routine_logs: completeData.routine_logs.length,
    journal_entries: completeData.journal_entries.length,
  }

  const total_records = Object.values(counts).reduce((a, b) => a + b, 0)
  const jsonStr = JSON.stringify(completeData)
  const estimated_size_kb = Math.max(1, Math.round(jsonStr.length / 1024))

  const manifest: VaultManifest = {
    version: '1.0.0',
    app: 'Pusula Life OS',
    exported_at: new Date().toISOString(),
    counts,
    total_records,
    estimated_size_kb,
  }

  return {
    manifest,
    data: completeData,
  }
}

// ---------------------------------------------------------------------------
// 2. Yedek Bütünlüğü Doğrulama (Validation)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean
  error?: string
  payload?: VaultPayload
}

export function validateVaultPayload(rawJsonOrObject: unknown): ValidationResult {
  try {
    let payload: any = rawJsonOrObject
    if (typeof rawJsonOrObject === 'string') {
      payload = JSON.parse(rawJsonOrObject)
    }

    if (!payload || typeof payload !== 'object') {
      return { isValid: false, error: 'Yedek dosyası geçerli bir JSON objesi içermiyor.' }
    }

    if (!payload.manifest || !payload.data) {
      return { isValid: false, error: 'Pusula yedek formatı eksik (manifest veya data alanı bulunamadı).' }
    }

    if (payload.manifest.app !== 'Pusula Life OS') {
      return { isValid: false, error: 'Bu dosya Pusula Life OS yedeği değil veya uyumsuz bir sürüme ait.' }
    }

    // Gerekli veri tablolarını normalize et
    const normalizedData: PusulaVaultData = {
      accounts: Array.isArray(payload.data.accounts) ? payload.data.accounts : [],
      credit_cards: Array.isArray(payload.data.credit_cards) ? payload.data.credit_cards : [],
      card_statements: Array.isArray(payload.data.card_statements) ? payload.data.card_statements : [],
      transactions: Array.isArray(payload.data.transactions) ? payload.data.transactions : [],
      debts: Array.isArray(payload.data.debts) ? payload.data.debts : [],
      subscriptions: Array.isArray(payload.data.subscriptions) ? payload.data.subscriptions : [],
      merchant_mappings: Array.isArray(payload.data.merchant_mappings) ? payload.data.merchant_mappings : [],
      investments: Array.isArray(payload.data.investments) ? payload.data.investments : [],
      projects: Array.isArray(payload.data.projects) ? payload.data.projects : [],
      project_tasks: Array.isArray(payload.data.project_tasks) ? payload.data.project_tasks : [],
      ideas: Array.isArray(payload.data.ideas) ? payload.data.ideas : [],
      dreams: Array.isArray(payload.data.dreams) ? payload.data.dreams : [],
      routines: Array.isArray(payload.data.routines) ? payload.data.routines : [],
      routine_logs: Array.isArray(payload.data.routine_logs) ? payload.data.routine_logs : [],
      journal_entries: Array.isArray(payload.data.journal_entries) ? payload.data.journal_entries : [],
    }

    const verifiedPayload: VaultPayload = {
      manifest: payload.manifest,
      data: normalizedData,
    }

    return { isValid: true, payload: verifiedPayload }
  } catch (err: any) {
    return { isValid: false, error: `Dosya ayrıştırma hatası: ${err.message || 'Geçersiz veri'}` }
  }
}

// ---------------------------------------------------------------------------
// 3. Web Crypto API: Parola ile AES-GCM-256 Şifreleme ve Çözme
// ---------------------------------------------------------------------------

const MAGIC_HEADER = 'PUSULA_VAULT_V1' // 16 bytes format identifier

function getCryptoSubtle(): SubtleCrypto {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  throw new Error('Web Crypto API bu ortamda desteklenmiyor.')
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getCryptoSubtle()
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Verilen metni veya JSON'ı PBKDF2 + AES-GCM (256-bit) ile istemci tarafında şifreler.
 * Format: [16 Byte Magic] + [16 Byte Salt] + [12 Byte IV] + [Ciphertext + Tag]
 */
export async function encryptVaultData(payloadString: string, password: string): Promise<Uint8Array> {
  const subtle = getCryptoSubtle()
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveAesKey(password, salt)
  const encodedPayload = enc.encode(payloadString)

  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    encodedPayload
  )

  const ciphertext = new Uint8Array(encryptedBuffer)
  const magicBytes = enc.encode(MAGIC_HEADER.padEnd(16, ' '))

  // Paket boyutunu hesapla
  const totalLength = 16 + 16 + 12 + ciphertext.length
  const result = new Uint8Array(totalLength)

  result.set(magicBytes, 0)
  result.set(salt, 16)
  result.set(iv, 32)
  result.set(ciphertext, 44)

  return result
}

/**
 * Şifrelenmiş `.vault` ikili verisini parola ile çözer ve orijinal metne dönüştürür.
 */
export async function decryptVaultData(encryptedData: Uint8Array, password: string): Promise<string> {
  if (encryptedData.length < 44) {
    throw new Error('Geçersiz şifreli dosya boyutu.')
  }

  const dec = new TextDecoder()
  const magic = dec.decode(encryptedData.slice(0, 16)).trim()
  if (magic !== MAGIC_HEADER) {
    throw new Error('Bu dosya Pusula şifreli kasa formatına uymuyor.')
  }

  const salt = encryptedData.slice(16, 32)
  const iv = encryptedData.slice(32, 44)
  const ciphertext = encryptedData.slice(44)

  const subtle = getCryptoSubtle()
  const key = await deriveAesKey(password, salt)

  try {
    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    )
    return dec.decode(decryptedBuffer)
  } catch (err) {
    throw new Error('Hatalı parola veya bozulmuş dosya. Şifre çözülemedi.')
  }
}

// ---------------------------------------------------------------------------
// 4. Akıllı Birleştirme (Smart Merge) & Diff Hesaplama
// ---------------------------------------------------------------------------

export interface MergeDiffSummary {
  tableKey: keyof PusulaVaultData
  tableName: string
  icon: string
  currentCount: number
  incomingCount: number
  newItemsCount: number
  updatedItemsCount: number
}

export function calculateMergeDiff(
  currentData: PusulaVaultData,
  incomingData: PusulaVaultData
): MergeDiffSummary[] {
  const tableKeys = Object.keys(VAULT_TABLE_LABELS) as (keyof PusulaVaultData)[]

  return tableKeys.map((key) => {
    const currentList = (currentData[key] || []) as any[]
    const incomingList = (incomingData[key] || []) as any[]

    const currentIdSet = new Set(currentList.map((item) => item.id))
    let newItemsCount = 0
    let updatedItemsCount = 0

    for (const item of incomingList) {
      if (item && item.id) {
        if (currentIdSet.has(item.id)) {
          updatedItemsCount++
        } else {
          newItemsCount++
        }
      }
    }

    return {
      tableKey: key,
      tableName: VAULT_TABLE_LABELS[key].label,
      icon: VAULT_TABLE_LABELS[key].icon,
      currentCount: currentList.length,
      incomingCount: incomingList.length,
      newItemsCount,
      updatedItemsCount,
    }
  })
}

/**
 * İki veri kümesini birleştirir: Mevcut verileri korur, gelen verileri ID bazlı günceller veya ekler.
 */
export function executeMerge(
  currentData: PusulaVaultData,
  incomingData: PusulaVaultData
): PusulaVaultData {
  const merged: PusulaVaultData = { ...EMPTY_VAULT_DATA }
  const tableKeys = Object.keys(VAULT_TABLE_LABELS) as (keyof PusulaVaultData)[]

  for (const key of tableKeys) {
    const currentList = (currentData[key] || []) as any[]
    const incomingList = (incomingData[key] || []) as any[]

    const map = new Map<string, any>()
    currentList.forEach((item) => {
      if (item && item.id) map.set(item.id, item)
    })
    incomingList.forEach((item) => {
      if (item && item.id) map.set(item.id, item)
    })

    merged[key] = Array.from(map.values()) as any
  }

  return merged
}

// ---------------------------------------------------------------------------
// 5. Güvenli Dosya İndirme Yardımcısı (Browser Trigger)
// ---------------------------------------------------------------------------

export function triggerDownload(content: BlobPart, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
