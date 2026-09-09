import { describe, it, expect } from 'vitest'
import {
  createVaultPayload,
  validateVaultPayload,
  encryptVaultData,
  decryptVaultData,
  calculateMergeDiff,
  executeMerge,
  EMPTY_VAULT_DATA,
  PusulaVaultData,
} from '../src/lib/vault-engine'

describe('Pusula Kişisel Kasa & Veri Bağımsızlığı (Vault Engine) Testleri', () => {
  const dummyData: Partial<PusulaVaultData> = {
    accounts: [
      {
        id: 'acc1',
        user_id: 'u1',
        name: 'Ana Vadesiz TL',
        type: 'vadesiz',
        balance: 45000,
        note: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ],
    transactions: [
      {
        id: 'tx1',
        user_id: 'u1',
        account_id: 'acc1',
        card_id: null,
        date: '2026-09-09',
        amount: -250,
        type: 'Harcama',
        description: 'Market Alışverişi',
        analysis_group: 'Kişisel',
        merchant: 'Migros',
        recurrence: null,
        statement_date: null,
        project_id: null,
        source_account_id: null,
        target_account_id: null,
        related_debt_id: null,
        import_id: null,
        account_or_card: null,
        created_at: '2026-09-09T10:00:00Z',
        updated_at: '2026-09-09T10:00:00Z',
      },
    ],
    dreams: [
      {
        id: 'd1',
        user_id: 'u1',
        title: 'Kyoto Seyahati',
        description: null,
        identity_persona: 'Dünya Gezgini',
        motivation_why: 'Ufuk genişletme',
        horizon: 'horizon_1_3y',
        category: 'Deneyim',
        status: 'active',
        next_focus_note: 'Vize araştır',
        cover_image_url: null,
        target_year: '2027',
        achieved_at: null,
        achieved_note: null,
        achieved_image_url: null,
        order_index: 0,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ],
    journal_entries: [
      {
        id: 'j1',
        user_id: 'u1',
        entry_date: '2026-09-09',
        title: 'Kasa Açılışı',
        content: 'Verilerimi kendi kontrolüme aldım.',
        mood: 'calm',
        template_type: 'freeform',
        tags: ['Güvenlik'],
        weather_note: null,
        pinned: true,
        word_count: 5,
        created_at: '2026-09-09T12:00:00Z',
        updated_at: '2026-09-09T12:00:00Z',
      },
    ],
  }

  it('1. Tam sistem yedeği yükü (payload) ve manifestini doğru üretir', () => {
    const payload = createVaultPayload(dummyData)

    expect(payload.manifest.version).toBe('1.0.0')
    expect(payload.manifest.app).toBe('Pusula Life OS')
    expect(payload.manifest.total_records).toBe(4) // 1 acc + 1 tx + 1 dream + 1 journal
    expect(payload.manifest.counts.accounts).toBe(1)
    expect(payload.manifest.counts.transactions).toBe(1)
    expect(payload.manifest.counts.dreams).toBe(1)
    expect(payload.manifest.counts.journal_entries).toBe(1)
    expect(payload.manifest.counts.investments).toBe(0)
    expect(payload.manifest.estimated_size_kb).toBeGreaterThan(0)

    expect(payload.data.accounts.length).toBe(1)
    expect(payload.data.transactions.length).toBe(1)
  })

  it('2. Geçerli ve geçersiz yedek yüklerini doğru doğrular', () => {
    const payload = createVaultPayload(dummyData)
    const jsonStr = JSON.stringify(payload)

    // Geçerli JSON string
    const res1 = validateVaultPayload(jsonStr)
    expect(res1.isValid).toBe(true)
    expect(res1.payload?.manifest.total_records).toBe(4)

    // Geçersiz format (bozuk string)
    const res2 = validateVaultPayload('NOT_A_JSON')
    expect(res2.isValid).toBe(false)
    expect(res2.error).toContain('Dosya ayrıştırma hatası')

    // Başka uygulamanın yedeği
    const fakePayload = { manifest: { app: 'Other App' }, data: {} }
    const res3 = validateVaultPayload(fakePayload)
    expect(res3.isValid).toBe(false)
    expect(res3.error).toContain('Pusula Life OS yedeği değil')
  })

  it('3. Web Crypto API ile parolalı AES-GCM şifreleme ve çözme işlemini hatasız yürütür', async () => {
    const secretText = JSON.stringify({ secretMessage: 'Pusula Tüm Varlıklarım', balance: 999999 })
    const password = 'GucluParola!2026'

    // Şifrele
    const encryptedBytes = await encryptVaultData(secretText, password)
    expect(encryptedBytes.length).toBeGreaterThan(44)

    // Doğru parola ile çöz
    const decryptedText = await decryptVaultData(encryptedBytes, password)
    expect(decryptedText).toBe(secretText)
    const parsed = JSON.parse(decryptedText)
    expect(parsed.secretMessage).toBe('Pusula Tüm Varlıklarım')

    // Hatalı parola ile çözmeyi dene -> Hata fırlatmalı
    await expect(decryptVaultData(encryptedBytes, 'YanlisParola')).rejects.toThrow(
      'Hatalı parola veya bozulmuş dosya'
    )
  })

  it('4. Akıllı birleştirme (merge diff) ve çakışma çözümünü doğru hesaplar', () => {
    const current: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      accounts: [
        {
          id: 'acc1',
          user_id: 'u1',
          name: 'Eski İsim',
          type: 'vadesiz',
          balance: 1000,
          note: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
    }

    const incoming: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      accounts: [
        {
          id: 'acc1', // Çakışan (güncellenecek)
          user_id: 'u1',
          name: 'Güncellenmiş İsim',
          type: 'vadesiz',
          balance: 2000,
          note: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-09T00:00:00Z',
        },
        {
          id: 'acc2', // Yeni kayıt
          user_id: 'u1',
          name: 'Yeni Kasa',
          type: 'nakit',
          balance: 500,
          note: null,
          created_at: '2026-09-09T00:00:00Z',
          updated_at: '2026-09-09T00:00:00Z',
        },
      ],
    }

    const diff = calculateMergeDiff(current, incoming)
    const accDiff = diff.find((d) => d.tableKey === 'accounts')

    expect(accDiff?.currentCount).toBe(1)
    expect(accDiff?.incomingCount).toBe(2)
    expect(accDiff?.newItemsCount).toBe(1)
    expect(accDiff?.updatedItemsCount).toBe(1)

    // Birleştirmeyi icra et
    const merged = executeMerge(current, incoming)
    expect(merged.accounts.length).toBe(2)
    const acc1 = merged.accounts.find((a) => a.id === 'acc1')
    expect(acc1?.name).toBe('Güncellenmiş İsim')
    expect(acc1?.balance).toBe(2000)
    const acc2 = merged.accounts.find((a) => a.id === 'acc2')
    expect(acc2?.name).toBe('Yeni Kasa')
  })
})
