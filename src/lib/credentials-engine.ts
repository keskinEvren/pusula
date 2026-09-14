import type { Credential } from '@/types/database'

export type CredentialCategory =
  | 'login'
  | 'gaming'
  | 'card_pin'
  | 'wifi'
  | 'identity'
  | 'license'
  | 'note'

export interface CustomSecretField {
  id: string
  label: string
  value: string
  is_secret?: boolean
}

export interface DecryptedSecretPayload {
  primary_secret: string
  secondary_secret?: string
  custom_fields?: CustomSecretField[]
  secret_notes?: string
}

export interface EncryptedSecretData {
  ciphertext: string // Base64
  iv: string         // Base64
  salt: string       // Base64
}

export interface VaultCanary {
  ciphertext: string // Base64
  iv: string         // Base64
  salt: string       // Base64
  created_at: string
}

export const CATEGORY_CONFIG: Record<
  CredentialCategory,
  {
    label: string
    shortLabel: string
    description: string
    iconName: string
    primaryFieldLabel: string
    primaryPlaceholder: string
    secondaryFieldLabel?: string
    secondaryPlaceholder?: string
    color: string
    badgeClass: string
  }
> = {
  login: {
    label: 'Web & Uygulama',
    shortLabel: 'Giriş',
    description: 'E-posta, kullanıcı adı ve web/uygulama şifreleri',
    iconName: 'Globe',
    primaryFieldLabel: 'Parola',
    primaryPlaceholder: 'Güçlü hesap parolası',
    secondaryFieldLabel: '2FA Kurtarma Kodu',
    secondaryPlaceholder: 'Yedek kurtarma anahtarı (opsiyonel)',
    color: 'text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  gaming: {
    label: 'Oyun & Platform',
    shortLabel: 'Oyun',
    description: 'Steam, Riot, Epic Games, PlayStation, Xbox vb.',
    iconName: 'Gamepad2',
    primaryFieldLabel: 'Hesap Şifresi',
    primaryPlaceholder: 'Oyun hesabı şifresi',
    secondaryFieldLabel: 'Kurtarma Kodu / PIN',
    secondaryPlaceholder: 'Steam Guard veya ikincil PIN (opsiyonel)',
    color: 'text-violet-600 dark:text-violet-400',
    badgeClass: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  },
  card_pin: {
    label: 'Kart & ATM PIN',
    shortLabel: 'Kart PIN',
    description: 'Banka / kredi kartı PIN şifreleri ve güvenlik kodları',
    iconName: 'CreditCard',
    primaryFieldLabel: 'Kart PIN Kodu',
    primaryPlaceholder: '4 veya 6 haneli PIN',
    secondaryFieldLabel: 'CVV / Güvenlik Kodu',
    secondaryPlaceholder: '3 haneli CVV (opsiyonel)',
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  wifi: {
    label: 'Wi-Fi & Modem',
    shortLabel: 'Wi-Fi',
    description: 'Ev/ofis Wi-Fi şifreleri ve modem yönetim paneli parolaları',
    iconName: 'Wifi',
    primaryFieldLabel: 'Wi-Fi Şifresi',
    primaryPlaceholder: 'WPA2/WPA3 kablosuz ağ şifresi',
    secondaryFieldLabel: 'Modem Arayüz Şifresi',
    secondaryPlaceholder: '192.168.1.1 admin şifresi (opsiyonel)',
    color: 'text-teal-600 dark:text-teal-400',
    badgeClass: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  },
  identity: {
    label: 'Resmi Belgeler',
    shortLabel: 'Kimlik',
    description: 'T.C. Kimlik, Pasaport, Ehliyet, Vergi No ve Seri Numaraları',
    iconName: 'FileBadge',
    primaryFieldLabel: 'Belge / Kimlik No',
    primaryPlaceholder: '11 haneli TCKN veya Pasaport No',
    secondaryFieldLabel: 'Seri / Cilt No',
    secondaryPlaceholder: 'Belge seri numarası (opsiyonel)',
    color: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  license: {
    label: 'Yazılım Lisansı',
    shortLabel: 'Lisans',
    description: 'Windows, IDE, araç seri ve ürün aktivasyon anahtarları',
    iconName: 'KeySquare',
    primaryFieldLabel: 'Lisans / Seri Anahtarı',
    primaryPlaceholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
    secondaryFieldLabel: 'Sipariş / Fatura No',
    secondaryPlaceholder: 'Sipariş ID veya Referans Kodu (opsiyonel)',
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  note: {
    label: 'Güvenli Not',
    shortLabel: 'Not',
    description: 'Çok satırlı gizli notlar, kurtarma anahtarları ve özel bilgiler',
    iconName: 'Lock',
    primaryFieldLabel: 'Gizli Başlık / Kod',
    primaryPlaceholder: 'Özel anahtar veya kod satırı',
    secondaryFieldLabel: 'İkincil Kod / Etiket',
    secondaryPlaceholder: 'Opsiyonel kod',
    color: 'text-slate-600 dark:text-slate-400',
    badgeClass: 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
}

// ---------------------------------------------------------------------------
// 1. Binary <-> Base64 Yardımcıları
// ---------------------------------------------------------------------------

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ---------------------------------------------------------------------------
// 2. Web Crypto API: PBKDF2 + AES-GCM (256-bit)
// ---------------------------------------------------------------------------

function getCryptoSubtle(): SubtleCrypto {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  throw new Error('Web Crypto API bu ortamda desteklenmiyor.')
}

/**
 * Ana paroladan 100.000 iterasyon PBKDF2 ve SHA-256 ile 256-bit AES-GCM CryptoKey türetir.
 */
export async function deriveCredentialsKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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
 * Gizli JSON yükünü AES-GCM ile şifreler.
 */
export async function encryptSecretPayload(
  payload: DecryptedSecretPayload,
  key: CryptoKey,
  salt?: Uint8Array
): Promise<EncryptedSecretData> {
  const subtle = getCryptoSubtle()
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const finalSalt = salt || crypto.getRandomValues(new Uint8Array(16))

  const jsonString = JSON.stringify(payload)
  const encoded = enc.encode(jsonString)

  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    encoded
  )

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(encryptedBuffer)),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(finalSalt),
  }
}

/**
 * Şifreli veriyi AES-GCM ile çözer ve JSON yükünü döner.
 */
export async function decryptSecretPayload(
  ciphertextBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<DecryptedSecretPayload> {
  const subtle = getCryptoSubtle()
  const dec = new TextDecoder()
  const ciphertext = base64ToUint8Array(ciphertextBase64)
  const iv = base64ToUint8Array(ivBase64)

  const decryptedBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext as any
  )

  const jsonString = dec.decode(decryptedBuffer)
  return JSON.parse(jsonString) as DecryptedSecretPayload
}

// ---------------------------------------------------------------------------
// 3. Kasa Kanaryası (Master Password Verification Token)
// ---------------------------------------------------------------------------

const CANARY_MESSAGE = 'PUSULA_CREDENTIALS_KEYCHAIN_CANARY_V1'

/**
 * Yeni ana parola belirlendiğinde doğrulama kanaryasını şifreler ve anahtarı döner.
 */
export async function setupMasterPassword(password: string): Promise<{ canary: VaultCanary; key: CryptoKey }> {
  const subtle = getCryptoSubtle()
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveCredentialsKey(password, salt)
  const encoded = enc.encode(CANARY_MESSAGE)

  const encryptedBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    encoded
  )

  const canary: VaultCanary = {
    ciphertext: uint8ArrayToBase64(new Uint8Array(encryptedBuffer)),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(salt),
    created_at: new Date().toISOString(),
  }

  return { canary, key }
}

/**
 * Girilen ana parolayı kanarya token ile test eder.
 * Başarılıysa CryptoKey döner, hatalıysa null döner.
 */
export async function verifyMasterPassword(password: string, canary: VaultCanary): Promise<CryptoKey | null> {
  try {
    const subtle = getCryptoSubtle()
    const dec = new TextDecoder()
    const salt = base64ToUint8Array(canary.salt)
    const iv = base64ToUint8Array(canary.iv)
    const ciphertext = base64ToUint8Array(canary.ciphertext)

    const key = await deriveCredentialsKey(password, salt)

    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    )

    const message = dec.decode(decryptedBuffer)
    if (message === CANARY_MESSAGE) {
      return key
    }
    return null
  } catch (err) {
    // Parola yanlış olduğunda AES-GCM tag mismatch hatası fırlatır
    return null
  }
}

// ---------------------------------------------------------------------------
// 4. Parola & PIN Üreteci (Generator)
// ---------------------------------------------------------------------------

export interface PasswordGeneratorOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  avoidAmbiguous: boolean
}

export const DEFAULT_GENERATOR_OPTIONS: PasswordGeneratorOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: false,
}

export function generateStrongPassword(options: Partial<PasswordGeneratorOptions> = {}): string {
  const opts = { ...DEFAULT_GENERATOR_OPTIONS, ...options }

  let upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let lower = 'abcdefghijkmnopqrstuvwxyz'
  let numbers = '23456789'
  let symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?'

  if (!opts.avoidAmbiguous) {
    upper += 'I'
    lower += 'l'
    numbers += '01'
  }

  let charset = ''
  const requiredChars: string[] = []

  if (opts.uppercase) {
    charset += upper
    requiredChars.push(getRandomChar(upper))
  }
  if (opts.lowercase) {
    charset += lower
    requiredChars.push(getRandomChar(lower))
  }
  if (opts.numbers) {
    charset += numbers
    requiredChars.push(getRandomChar(numbers))
  }
  if (opts.symbols) {
    charset += symbols
    requiredChars.push(getRandomChar(symbols))
  }

  if (charset.length === 0) {
    charset = lower + numbers
  }

  const remainingLength = Math.max(0, opts.length - requiredChars.length)
  const randomChars: string[] = []

  for (let i = 0; i < remainingLength; i++) {
    randomChars.push(getRandomChar(charset))
  }

  // Karıştır
  const allChars = [...requiredChars, ...randomChars]
  for (let i = allChars.length - 1; i > 0; i--) {
    const randomBuffer = new Uint32Array(1)
    crypto.getRandomValues(randomBuffer)
    const j = randomBuffer[0] % (i + 1)
    ;[allChars[i], allChars[j]] = [allChars[j], allChars[i]]
  }

  return allChars.join('')
}

function getRandomChar(str: string): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return str[buf[0] % str.length]
}

export function generatePin(length = 4): string {
  const digits = '0123456789'
  const result: string[] = []
  for (let i = 0; i < length; i++) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    result.push(digits[buf[0] % 10])
  }
  return result.join('')
}

export function evaluatePasswordStrength(password: string): {
  score: number // 0-4
  label: 'Çok Zayıf' | 'Zayıf' | 'Orta' | 'Güçlü' | 'Kırılmaz'
  color: string
  percent: number
} {
  if (!password) {
    return { score: 0, label: 'Çok Zayıf', color: 'bg-rose-500', percent: 0 }
  }

  let poolSize = 0
  if (/[a-z]/.test(password)) poolSize += 26
  if (/[A-Z]/.test(password)) poolSize += 26
  if (/[0-9]/.test(password)) poolSize += 10
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33

  if (poolSize === 0) poolSize = 10
  const entropy = password.length * Math.log2(poolSize)

  if (entropy < 30) {
    return { score: 1, label: 'Çok Zayıf', color: 'bg-rose-500', percent: 20 }
  } else if (entropy < 50) {
    return { score: 2, label: 'Zayıf', color: 'bg-amber-500', percent: 45 }
  } else if (entropy < 70) {
    return { score: 3, label: 'Orta', color: 'bg-sky-500', percent: 70 }
  } else if (entropy < 90) {
    return { score: 4, label: 'Güçlü', color: 'bg-emerald-500', percent: 90 }
  } else {
    return { score: 5, label: 'Kırılmaz', color: 'bg-teal-500', percent: 100 }
  }
}

// ---------------------------------------------------------------------------
// 5. LocalStorage & Fallback
// ---------------------------------------------------------------------------

export const STORAGE_KEY_CREDENTIALS = 'pusula_local_credentials'
export const STORAGE_KEY_CANARY = 'pusula_vault_canary'

export function loadLocalCanary(): VaultCanary | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CANARY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveLocalCanary(canary: VaultCanary): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_CANARY, JSON.stringify(canary))
}

export function loadLocalCredentials(): Credential[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CREDENTIALS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLocalCredentials(items: Credential[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_CREDENTIALS, JSON.stringify(items))
}

/**
 * İlk kez kasa oluşturan kullanıcı için örnek güvenli kayıtlar üretir.
 */
export async function createSampleCredentials(key: CryptoKey, salt: Uint8Array): Promise<Credential[]> {
  const samples: Array<{
    title: string
    category: CredentialCategory
    email: string | null
    username: string | null
    url: string | null
    is_favorite: boolean
    payload: DecryptedSecretPayload
    notes?: string
  }> = [
    {
      title: 'Google Ana Hesabı',
      category: 'login',
      email: 'demo@example.com',
      username: 'demo-user',
      url: 'https://accounts.google.com',
      is_favorite: true,
      payload: {
        primary_secret: 'DEMO-NOT-A-REAL-PASSWORD',
        secondary_secret: 'DEMO-RECOVERY-CODE',
        custom_fields: [
          { id: '1', label: '2FA Yöntemi', value: 'Google Authenticator + Donanım Anahtarı' },
        ],
        secret_notes: 'Birincil kurtarma e-postası kayıtlıdır.',
      },
    },
    {
      title: 'Steam Hesabı',
      category: 'gaming',
      email: 'demo@example.com',
      username: 'demo-player',
      url: 'https://store.steampowered.com',
      is_favorite: true,
      payload: {
        primary_secret: 'DEMO-NOT-A-REAL-PASSWORD',
        secondary_secret: 'DEMO-CODE',
        custom_fields: [
          { id: '1', label: 'Steam Guard Kodu', value: 'DEMO-CODE', is_secret: true },
          { id: '2', label: 'SteamID64', value: '76561198000000000' },
        ],
        secret_notes: 'CS2, Dota ve kütüphane oyunları bu hesapta.',
      },
    },
    {
      title: 'Garanti BBVA Bonus Kredi Kartı',
      category: 'card_pin',
      email: null,
      username: 'Son 4 Hane: 4921',
      url: 'https://garantibbva.com.tr',
      is_favorite: true,
      payload: {
        primary_secret: '0000',
        secondary_secret: '000',
        custom_fields: [
          { id: '1', label: 'Kart Sahibi', value: 'Demo Kullanıcı' },
          { id: '2', label: 'Son Kullanma Tarihi', value: '09/29' },
        ],
        secret_notes: 'Temassız limit günlük 1.500 TL olarak ayarlanmıştır.',
      },
    },
    {
      title: 'Ev Wi-Fi 5G & Modem',
      category: 'wifi',
      email: null,
      username: 'Keskin_Ev_5G',
      url: 'http://192.168.1.1',
      is_favorite: false,
      payload: {
        primary_secret: 'DEMO-NOT-A-REAL-WIFI-PASSWORD',
        secondary_secret: 'DEMO-NOT-A-REAL-MODEM-PASSWORD',
        custom_fields: [
          { id: '1', label: 'Modem Giriş Kullanıcısı', value: 'admin' },
          { id: '2', label: 'Modem Modeli', value: 'ZTE H3600 Wi-Fi 6' },
        ],
        secret_notes: 'Misafir ağı 2.4G ayrı SSID ile açıktır.',
      },
    },
    {
      title: 'T.C. Kimlik Kartı & Seri No',
      category: 'identity',
      email: null,
      username: 'Demo Kullanıcı',
      url: null,
      is_favorite: false,
      payload: {
        primary_secret: '12345678901',
        secondary_secret: 'A24B90142',
        custom_fields: [
          { id: '1', label: 'Geçerlilik Tarihi', value: '14.09.2032' },
          { id: '2', label: 'Veren Makam', value: 'İçişleri Bakanlığı Nüfus Md.' },
        ],
        secret_notes: 'Cüzdan yanınızda yokken resmi başvurular için.',
      },
    },
    {
      title: 'JetBrains All Products Pack',
      category: 'license',
      email: 'is@firma.com',
      username: 'Demo Kullanıcı',
      url: 'https://account.jetbrains.com',
      is_favorite: false,
      payload: {
        primary_secret: 'JB-2026-X94K2-PL902-8821B-QQ102',
        secondary_secret: 'INV-2026-8819',
        custom_fields: [
          { id: '1', label: 'Lisans Tipi', value: 'Yıllık Ticari Lisans' },
          { id: '2', label: 'Yenileme Tarihi', value: '31 Aralık 2026' },
        ],
        secret_notes: 'WebStorm, IntelliJ IDEA, RustRover ve Rider dahil.',
      },
    },
  ]

  const results: Credential[] = []
  for (const s of samples) {
    const encrypted = await encryptSecretPayload(s.payload, key, salt)
    results.push({
      id: crypto.randomUUID(),
      user_id: '00000000-0000-0000-0000-000000000000',
      title: s.title,
      category: s.category,
      email: s.email,
      username: s.username,
      url: s.url,
      is_favorite: s.is_favorite,
      encrypted_payload: encrypted.ciphertext,
      encryption_iv: encrypted.iv,
      encryption_salt: encrypted.salt,
      notes: s.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// 6. Zaman Kilitli Kasa Sıfırlama (Time-locked Emergency Reset)
// ---------------------------------------------------------------------------

export interface VaultResetRequest {
  requested_at: string       // ISO Tarih
  target_wiping_at: string   // ISO Tarih (Karantina bitişi, örn: 24 saat sonra)
  is_active: boolean
}

export const STORAGE_KEY_RESET = 'pusula_vault_reset_request'

export function getPendingResetRequest(): VaultResetRequest | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESET)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VaultResetRequest
    return parsed.is_active ? parsed : null
  } catch {
    return null
  }
}

export function requestVaultReset(hours = 24): VaultResetRequest {
  const now = new Date()
  const target = new Date(now.getTime() + hours * 60 * 60 * 1000)
  const req: VaultResetRequest = {
    requested_at: now.toISOString(),
    target_wiping_at: target.toISOString(),
    is_active: true,
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_RESET, JSON.stringify(req))
    window.dispatchEvent(new CustomEvent('pusula:vault-reset-changed'))
  }
  return req
}

export function cancelVaultReset(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_RESET)
    window.dispatchEvent(new CustomEvent('pusula:vault-reset-changed'))
  }
}

export function executeVaultWipe(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_CREDENTIALS)
    localStorage.removeItem(STORAGE_KEY_CANARY)
    localStorage.removeItem(STORAGE_KEY_RESET)
    window.dispatchEvent(new CustomEvent('pusula:vault-reset-changed'))
  }
}

export function formatRemainingTime(targetIso: string): {
  formatted: string
  isExpired: boolean
  hours: number
  minutes: number
  seconds: number
} {
  const diffMs = new Date(targetIso).getTime() - Date.now()
  if (diffMs <= 0) {
    return {
      formatted: 'Süre Doldu (Kasa Sıfırlanabilir)',
      isExpired: true,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  return {
    formatted: `${hours} sa ${minutes} dk ${seconds} sn`,
    isExpired: false,
    hours,
    minutes,
    seconds,
  }
}
