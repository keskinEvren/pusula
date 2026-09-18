import { describe, it, expect } from 'vitest'
import {
  createVaultPayload,
  validateVaultPayload,
  encryptVaultData,
  decryptVaultData,
  calculateMergeDiff,
  executeMerge,
  EMPTY_VAULT_DATA,
  VAULT_TABLE_LABELS,
  PusulaVaultData
} from '@/lib/vault-engine'

describe('vault-engine', () => {
  describe('createVaultPayload', () => {
    it('manifest değerlerini (version, counts, size) doğru oluşturur', () => {
      const partialData = { accounts: [{ id: '1' } as any] }
      const payload = createVaultPayload(partialData)
      expect(payload.manifest.version).toBe('1.0.0')
      expect(payload.manifest.counts.accounts).toBe(1)
      expect(payload.manifest.total_records).toBe(1)
      expect(payload.manifest.estimated_size_kb).toBeGreaterThan(0)
    })
    
    it('boş veri verildiğinde boş manifest oluşturur', () => {
      const payload = createVaultPayload({})
      expect(payload.manifest.total_records).toBe(0)
      expect(payload.manifest.counts.accounts).toBe(0)
      expect(payload.data.accounts).toEqual([])
    })
  })

  describe('validateVaultPayload', () => {
    it('geçerli payload nesnesini kabul eder', () => {
      const payload = createVaultPayload({})
      const result = validateVaultPayload(payload)
      expect(result.isValid).toBe(true)
    })

    it('yabancı / bilinmeyen uygulama JSON verisini reddeder', () => {
      const result = validateVaultPayload({ manifest: { app: 'Other App' }, data: {} })
      expect(result.isValid).toBe(false)
    })

    it('hatalı JSON formatı verildiğinde hata döner', () => {
      const result = validateVaultPayload('{ invalid json')
      expect(result.isValid).toBe(false)
    })
  })

  describe('Encryption & Decryption', () => {
    it('encryptVaultData ve decryptVaultData başarılı gidiş-dönüş yapar', async () => {
      const password = 'test-password'
      const plaintext = 'test-data'

      const encrypted = await encryptVaultData(plaintext, password)
      expect(encrypted).toBeInstanceOf(Uint8Array)

      const decrypted = await decryptVaultData(encrypted, password)
      expect(decrypted).toBe(plaintext)
    })

    it('yanlış parola ile decryptVaultData hata fırlatır', async () => {
      const password = 'test-password'
      const plaintext = 'test-data'

      const encrypted = await encryptVaultData(plaintext, password)
      await expect(decryptVaultData(encrypted, 'wrong-password')).rejects.toThrow()
    })
  })

  describe('calculateMergeDiff', () => {
    it('yeni kayıtları tespit eder', () => {
      const current: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1' } as any] }
      const incoming: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1' } as any, { id: '2' } as any] }
      
      const diff = calculateMergeDiff(current, incoming)
      const accountsDiff = diff.find(d => d.tableKey === 'accounts')
      
      expect(accountsDiff?.newItemsCount).toBe(1)
      expect(accountsDiff?.updatedItemsCount).toBe(1)
    })

    it('güncellenen kayıtları tespit eder', () => {
      const current: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1', name: 'Old' } as any] }
      const incoming: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1', name: 'New' } as any] }
      
      const diff = calculateMergeDiff(current, incoming)
      const accountsDiff = diff.find(d => d.tableKey === 'accounts')
      
      expect(accountsDiff?.updatedItemsCount).toBe(1)
      expect(accountsDiff?.newItemsCount).toBe(0)
    })
  })

  describe('executeMerge', () => {
    it('ID değerine göre verileri birleştirir', () => {
      const current: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1' } as any] }
      const incoming: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '2' } as any] }
      
      const result = executeMerge(current, incoming)
      expect(result.accounts).toHaveLength(2)
    })

    it('çakışma durumunda gelen veri mevcut verinin üzerine yazar', () => {
      const current: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1', name: 'Old' } as any] }
      const incoming: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1', name: 'New' } as any] }
      
      const result = executeMerge(current, incoming)
      expect(result.accounts).toHaveLength(1)
      expect(result.accounts[0].name).toBe('New')
    })

    it('gelen veri boş olduğunda değişiklik yapmaz', () => {
      const current: PusulaVaultData = { ...EMPTY_VAULT_DATA, accounts: [{ id: '1' } as any] }
      const incoming: PusulaVaultData = { ...EMPTY_VAULT_DATA }
      
      const result = executeMerge(current, incoming)
      expect(result.accounts).toHaveLength(1)
    })
  })

  describe('Constants', () => {
    it('EMPTY_VAULT_DATA 18 tablonun tümüne sahiptir', () => {
      const keys = Object.keys(EMPTY_VAULT_DATA)
      expect(keys.length).toBe(18)
    })

    it('VAULT_TABLE_LABELS tüm tablolar için tanımlanmıştır', () => {
      const keys = Object.keys(EMPTY_VAULT_DATA)
      const labelKeys = Object.keys(VAULT_TABLE_LABELS)
      
      keys.forEach(key => {
        expect(labelKeys).toContain(key)
      })
    })
  })
})
