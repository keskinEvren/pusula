import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  uint8ArrayToBase64,
  base64ToUint8Array,
  deriveCredentialsKey,
  encryptSecretPayload,
  decryptSecretPayload,
  setupMasterPassword,
  verifyMasterPassword,
  generateStrongPassword,
  generatePin,
  evaluatePasswordStrength,
  createSampleCredentials,
  requestVaultReset,
  cancelVaultReset,
  executeVaultWipe,
  formatRemainingTime,
  STORAGE_KEY_RESET,
  STORAGE_KEY_CREDENTIALS,
  STORAGE_KEY_CANARY
} from '@/lib/credentials-engine'

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({})),
}))

describe('Credentials Engine Testleri', () => {
  let localStorageMock: Map<string, string>

  beforeEach(() => {
    localStorageMock = new Map()
    
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock.get(key) || null,
      setItem: (key: string, value: string) => localStorageMock.set(key, value),
      removeItem: (key: string) => localStorageMock.delete(key),
      clear: () => localStorageMock.clear(),
    })
    
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      crypto: globalThis.crypto // ensure crypto is available on window for tests if accessed that way
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Temel Kriptografi', () => {
    it('uint8ArrayToBase64 ve base64ToUint8Array fonksiyonları için round-trip (gidiş-dönüş) çalışmalıdır', () => {
      const original = new Uint8Array([10, 20, 30, 255, 0, 128])
      const base64 = uint8ArrayToBase64(original)
      const restored = base64ToUint8Array(base64)
      expect(restored).toEqual(original)
    })

    it('deriveCredentialsKey 256-bit AES-GCM anahtarı üretmelidir', async () => {
      const salt = new Uint8Array(16)
      crypto.getRandomValues(salt)
      const key = await deriveCredentialsKey('my-secret-password', salt)
      
      expect(key.algorithm.name).toBe('AES-GCM')
      expect((key.algorithm as any).length).toBe(256)
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })
  })

  describe('Gizli Veri Şifreleme', () => {
    it('encryptSecretPayload ve decryptSecretPayload round-trip başarılı olmalıdır', async () => {
      const salt = new Uint8Array(16)
      const key = await deriveCredentialsKey('test-pass', salt)
      const payload = { primary_secret: 'gizli123', secret_notes: 'notlar' }
      
      const encrypted = await encryptSecretPayload(payload, key, salt)
      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.salt).toBeDefined()
      
      const decrypted = await decryptSecretPayload(encrypted.ciphertext, encrypted.iv, key)
      expect(decrypted).toEqual(payload)
    })

    it('decryptSecretPayload yanlış anahtar ile hata fırlatmalıdır', async () => {
      const salt = new Uint8Array(16)
      const key = await deriveCredentialsKey('test-pass', salt)
      const wrongKey = await deriveCredentialsKey('wrong-pass', salt)
      const payload = { primary_secret: 'gizli' }
      
      const encrypted = await encryptSecretPayload(payload, key, salt)
      
      await expect(
        decryptSecretPayload(encrypted.ciphertext, encrypted.iv, wrongKey)
      ).rejects.toThrow()
    })
  })

  describe('Kasa Kanaryası (Vault Canary)', () => {
    it('setupMasterPassword yeni bir kanarya (canary) üretmelidir', async () => {
      const result = await setupMasterPassword('master123')
      expect(result.canary.ciphertext).toBeDefined()
      expect(result.canary.iv).toBeDefined()
      expect(result.canary.salt).toBeDefined()
      expect(result.canary.created_at).toBeDefined()
      expect(result.key.algorithm.name).toBe('AES-GCM')
    })

    it('verifyMasterPassword doğru parola ile anahtarı dönmelidir', async () => {
      const { canary } = await setupMasterPassword('master123')
      const key = await verifyMasterPassword('master123', canary)
      expect(key).not.toBeNull()
      expect(key?.algorithm.name).toBe('AES-GCM')
    })

    it('verifyMasterPassword yanlış parola ile null dönmelidir', async () => {
      const { canary } = await setupMasterPassword('master123')
      const key = await verifyMasterPassword('yanlis123', canary)
      expect(key).toBeNull()
    })
  })

  describe('Parola ve PIN Üreteci', () => {
    it('generateStrongPassword varsayılan olarak 20 karakter uzunluğunda parola üretmelidir', () => {
      const pwd = generateStrongPassword()
      expect(pwd.length).toBe(20)
    })

    it('generateStrongPassword özel uzunlukta (custom length) parola üretmelidir', () => {
      const pwd = generateStrongPassword({ length: 12 })
      expect(pwd.length).toBe(12)
    })

    it('generateStrongPassword karakter seti filtrelerini (charset filters) uygulamalıdır', () => {
      // Sadece sayılar olsun
      const pwd = generateStrongPassword({ uppercase: false, lowercase: false, symbols: false, numbers: true, length: 10 })
      expect(pwd).toMatch(/^[0-9]+$/)
    })

    it('generatePin(4) 4 haneli sayısal değer dönmelidir', () => {
      const pin = generatePin(4)
      expect(pin.length).toBe(4)
      expect(pin).toMatch(/^[0-9]{4}$/)
    })

    it('generatePin(6) 6 haneli sayısal değer dönmelidir', () => {
      const pin = generatePin(6)
      expect(pin.length).toBe(6)
      expect(pin).toMatch(/^[0-9]{6}$/)
    })
  })

  describe('Parola Gücü Değerlendirmesi', () => {
    it("evaluatePasswordStrength('123') zayıf (weak, 0-1) skor dönmelidir", () => {
      const result = evaluatePasswordStrength('123')
      expect(result.score).toBeLessThanOrEqual(1)
      expect(result.label).toMatch(/Zayıf/)
    })

    it('evaluatePasswordStrength güçlü parola için 4 veya 5 skor dönmelidir', () => {
      const result = evaluatePasswordStrength('Aa1!KarmasikBirSifreGerekiyor!')
      expect(result.score).toBeGreaterThanOrEqual(4)
    })

    it("evaluatePasswordStrength('') boş parola için 0 skor dönmelidir", () => {
      const result = evaluatePasswordStrength('')
      expect(result.score).toBe(0)
    })
  })

  describe('Örnek Kimlik Bilgileri (Sample Credentials)', () => {
    it('createSampleCredentials geçerli şifrelenmiş kayıtlar üretmelidir', async () => {
      const salt = new Uint8Array(16)
      crypto.getRandomValues(salt)
      const key = await deriveCredentialsKey('master123', salt)
      
      const samples = await createSampleCredentials(key, salt)
      expect(samples.length).toBeGreaterThan(0)
      expect(samples[0].encrypted_payload).toBeDefined()
      expect(samples[0].title).toBeDefined()
      
      const decrypted = await decryptSecretPayload(samples[0].encrypted_payload, samples[0].encryption_iv, key)
      expect(decrypted.primary_secret).toBeDefined()
    })
  })

  describe('Kasa Sıfırlama İşlemleri', () => {
    it('requestVaultReset isteği localStorage içerisine yazmalıdır', () => {
      const req = requestVaultReset(24)
      expect(req.is_active).toBe(true)
      const stored = JSON.parse(localStorageMock.get(STORAGE_KEY_RESET)!)
      expect(stored.is_active).toBe(true)
    })

    it('cancelVaultReset iptal işlemi localStorage içerisinden kaydı silmelidir', () => {
      requestVaultReset(24)
      cancelVaultReset()
      expect(localStorageMock.has(STORAGE_KEY_RESET)).toBe(false)
    })

    it('executeVaultWipe kasa silme işlemi tüm kimlik anahtarlarını temizlemelidir', () => {
      localStorageMock.set(STORAGE_KEY_CREDENTIALS, 'dummy_data')
      localStorageMock.set(STORAGE_KEY_CANARY, 'dummy_canary')
      localStorageMock.set(STORAGE_KEY_RESET, 'dummy_reset')
      
      executeVaultWipe()
      
      expect(localStorageMock.has(STORAGE_KEY_CREDENTIALS)).toBe(false)
      expect(localStorageMock.has(STORAGE_KEY_CANARY)).toBe(false)
      expect(localStorageMock.has(STORAGE_KEY_RESET)).toBe(false)
    })
  })

  describe('Zaman Formatlama', () => {
    it('formatRemainingTime kalan zamanı formatlamalıdır', () => {
      vi.useFakeTimers()
      try {
        const now = 1700000000000
        vi.setSystemTime(now)
        // 2 saat, 30 dakika sonra
        const targetTime = new Date(now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString()
        const result = formatRemainingTime(targetTime)
        
        expect(result.isExpired).toBe(false)
        expect(result.hours).toBe(2)
        expect(result.minutes).toBe(30)
        expect(result.formatted).toMatch(/2 sa 30 dk/)
      } finally {
        vi.useRealTimers()
      }
    })

    it('formatRemainingTime geçmiş tarih (past date) için sıfır (zero) ve isExpired dönmelidir', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString()
      const result = formatRemainingTime(pastTime)
      
      expect(result.isExpired).toBe(true)
      expect(result.hours).toBe(0)
      expect(result.minutes).toBe(0)
      expect(result.seconds).toBe(0)
    })
  })
})
