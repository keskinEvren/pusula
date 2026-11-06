import { describe, it, expect } from 'vitest'
import {
  generateLifeMarkdown,
  cleanCell,
  cleanMultiLine,
  parseInstallmentInfo,
  extractActiveCardInstallments,
  summarizeInline,
} from '@/lib/life-md-engine'
import { EMPTY_VAULT_DATA, type PusulaVaultData } from '@/lib/vault-engine'

describe('life-md-engine', () => {
  it('boş veriyle hatasız çalışır ve varsayılan başlıkları üretir', () => {
    const result = generateLifeMarkdown(EMPTY_VAULT_DATA)
    expect(result.markdown).toContain('# 🧭 PUSULA — Kişisel Yaşam ve Finans Bağlamı (life.md)')
    expect(result.markdown).toContain('## 1. Yönetici Özeti (Genel Durum)')
    expect(result.markdown).toContain('## 2. Vizyon, Hedefler & Hayaller (Dreams)')
    expect(result.markdown).toContain('## 3. Çalışma: Projeler & Fikirler')
    expect(result.markdown).toContain('## 4. Günlük Yaşam: Rutinler & Ajanda')
    expect(result.markdown).toContain('## 5. Seyir Defteri / Günlük')
    expect(result.markdown).toContain('## 6. Finansal Varlıklar, Borçlar, Gelirler ve Abonelikler')
    expect(result.markdown).toContain('## 7. Hesap ve Kart Hareketleri')
    expect(result.stats.includedRecords).toBe(0)
    expect(result.stats.charCount).toBeGreaterThan(100)
    expect(result.stats.wordCount).toBeGreaterThan(20)
    expect(result.stats.estimatedTokens).toBe(Math.ceil(result.stats.charCount / 4))
  })

  it('GÜVENLİK KRİTİK: credentials tablosu verilerini ASLA çıktıya dahil etmez', () => {
    const sensitiveData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      credentials: [
        {
          id: 'cred-1',
          user_id: 'user-1',
          title: 'SUPER_SECRET_BANK_LOGIN',
          category: 'login',
          email: 'secret_agent@example.com',
          username: 'superadmin_username',
          url: 'https://secret.bank.com',
          is_favorite: true,
          encrypted_payload: 'ENCRYPTED_TOP_SECRET_PAYLOAD_XYZ987',
          encryption_iv: 'IV_SECRET_123',
          encryption_salt: 'SALT_SECRET_456',
          notes: 'Kasa PIN: 998811, Anahtar: SECRET_KEY_MASTER',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    }

    const result = generateLifeMarkdown(sensitiveData)
    const md = result.markdown

    // Asla hiçbir gizli alan yer almamalıdır
    expect(md).not.toContain('SUPER_SECRET_BANK_LOGIN')
    expect(md).not.toContain('secret_agent@example.com')
    expect(md).not.toContain('superadmin_username')
    expect(md).not.toContain('ENCRYPTED_TOP_SECRET_PAYLOAD_XYZ987')
    expect(md).not.toContain('IV_SECRET_123')
    expect(md).not.toContain('SALT_SECRET_456')
    expect(md).not.toContain('998811')
    expect(md).not.toContain('SECRET_KEY_MASTER')
    expect(md).not.toContain('credentials')
    expect(md).not.toContain('Kimlikler & Şifreler')

    // Kayıt sayımında credentials yer almamalıdır
    expect(result.stats.includedRecords).toBe(0)
    expect(result.stats.sectionCounts.credentials).toBeUndefined()
  })

  it('ilişkisel ID yabancı anahtarlarını insan tarafından okunabilir isimlere çözümler', () => {
    const mockData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      projects: [
        {
          id: 'proj-123',
          user_id: 'u1',
          slug: 'pusula-app',
          name: 'Pusula Kişisel Panel',
          description: 'Finans ve Proje Paneli',
          status: 'Canlı',
          project_type: 'saas',
          repo_url: 'https://github.com/org/pusula',
          live_url: 'https://pusula.app',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      accounts: [
        {
          id: 'acc-456',
          user_id: 'u1',
          name: 'İş Bankası Ana Hesap',
          type: 'Vadesiz TL',
          balance: 42000,
          balance_as_of: '2026-11-01',
          note: 'Maaş hesabı',
          interest_rate: null,
          withholding_tax_rate: null,
          reserved_base_amount: null,
          maturity_date: null,
          last_yield_applied_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      credit_cards: [
        {
          id: 'card-789',
          user_id: 'u1',
          bank: 'Garanti BBVA',
          card_name: 'Bonus Platinum',
          last_four: '4321',
          current_debt: 8500,
          statement_debt: 6000,
          minimum_payment: 2400,
          interest_fees: 0,
          statement_date: '2026-11-10',
          due_date: '2026-11-20',
          status_note: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      dreams: [
        {
          id: 'dream-999',
          user_id: 'u1',
          title: 'Kendi Bağımsız Yazılım Stüdyomu Kurmak',
          description: 'SaaS projeleriyle bağımsız gelir',
          identity_persona: 'Bağımsız Geliştirici & Girişimci',
          motivation_why: 'Finansal özgürlük ve yaratıcı üretkenlik',
          horizon: 'horizon_1_3y',
          category: 'Kariyer',
          status: 'active',
          next_focus_note: 'İlk 100 ödeyen kullanıcıya ulaşmak',
          cover_image_url: null,
          target_year: '2027',
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      debts: [
        {
          id: 'debt-321',
          user_id: 'u1',
          type: 'Borç',
          category: 'Kişisel',
          person_or_entity: 'Ahmet Yılmaz',
          description: 'Ekipman borcu',
          principal: 10000,
          past_payments: 4000,
          remaining: 6000,
          status: 'Açık',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      routines: [
        {
          id: 'routine-555',
          user_id: 'u1',
          title: 'Sabah Derin Çalışma Seansı',
          icon: 'brain',
          time_block: 'morning',
          frequency: 'weekdays',
          target_days: [1, 2, 3, 4, 5],
          target_duration_minutes: 90,
          minimum_effective_dose: '15 dk odaklanmış kodlama',
          dream_id: 'dream-999',
          identity_persona: 'Odaklı Yazılımcı',
          is_active: true,
          order_index: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      transactions: [
        {
          id: 'tx-001',
          user_id: 'u1',
          date: '2026-11-02',
          account_or_card: null,
          type: 'Harcama',
          description: 'Sunucu altyapı ücreti',
          amount: 650,
          analysis_group: 'İş',
          merchant: 'Vercel Inc',
          recurrence: 'Aylık',
          statement_date: null,
          card_id: 'card-789',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: 'RAW_FINGERPRINT_TO_EXCLUDE',
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '2026-11-02',
          updated_at: '2026-11-02',
        },
      ],
      subscriptions: [
        {
          id: 'sub-1',
          user_id: 'u1',
          service: 'GitHub Copilot Pro',
          group_type: 'İş',
          model: 'Aylık',
          amount: 350,
          currency: 'TRY',
          period: 'Aylık',
          end_date: null,
          decision: 'Devam',
          payment_method: null,
          status: 'Aktif',
          strategic_tag: 'Vazgeçilmez',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    }

    const result = generateLifeMarkdown(mockData)
    const md = result.markdown

    // Rutin içerisinde dream_id çözümlenmiş olmalı
    expect(md).toContain('Kendi Bağımsız Yazılım Stüdyomu Kurmak')

    // Borç içerisinde proje ve hesap çözümlenmiş olmalı
    expect(md).toContain('Ahmet Yılmaz')
    expect(md).toContain('Pusula Kişisel Panel')
    expect(md).toContain('İş Bankası Ana Hesap')

    // Hareketler tablosunda card_id kart adına ve project_id proje adına çözümlenmiş olmalı
    expect(md).toContain('Bonus Platinum')
    expect(md).toContain('Vercel Inc')

    // Dahili teknik alanlar (source_fingerprint vb.) yer almamalıdır
    expect(md).not.toContain('RAW_FINGERPRINT_TO_EXCLUDE')
    expect(md).not.toContain('card-789')
    expect(md).not.toContain('proj-123')
  })

  it('Markdown tablo hücrelerindeki pipe (|) ve satır sonu karakterlerini tabloyu bozmayacak şekilde temizler', () => {
    const rawData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      ideas: [
        {
          id: 'idea-1',
          user_id: 'u1',
          title: 'Mobil | Uygulama | Fikri',
          description: 'Birinci satır\nİkinci satır | Sütun gibi görünen metin\nÜçüncü satır',
          status: 'inbox',
          score: 8,
          tags: ['mobil|native', 'fintech\nyeni'],
          promoted_project_id: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
    }

    const result = generateLifeMarkdown(rawData)
    const md = result.markdown

    // Tablo satırında kontrol (kısa özet yer almalı, tablo kırılmamalı)
    const ideaLine = md.split('\n').find((l) => l.includes('Mobil \\| Uygulama \\| Fikri'))
    expect(ideaLine).toBeDefined()
    expect(ideaLine).toContain('Birinci satır')

    // Detay dokümantasyon başlığı ve tam metin tablonun altında yer almalı
    expect(md).toContain('#### 📁 Mobil | Uygulama | Fikri — Detaylı Dokümantasyon')
    expect(md).toContain('Birinci satır\nİkinci satır | Sütun gibi görünen metin\nÜçüncü satır')
  })

  it('cleanCell önceden kaçırılmış pipe karakterlerini bozmaz (idempotent)', () => {
    const raw = 'değer 1 | değer 2 \\| değer 3'
    const once = cleanCell(raw)
    const twice = cleanCell(once)
    expect(once).toBe('değer 1 \\| değer 2 \\| değer 3')
    expect(twice).toBe('değer 1 \\| değer 2 \\| değer 3')
    expect(twice).not.toContain('\\\\|')
  })

  it('kullanıcı önsözünü (customPreamble) başa ekler ve bölüm filtrelerine uyar', () => {
    const mockData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      dreams: [
        {
          id: 'd1',
          user_id: 'u1',
          title: 'Hayal 1',
          description: null,
          identity_persona: null,
          motivation_why: null,
          horizon: 'horizon_1y',
          category: 'Kişisel',
          status: 'active',
          next_focus_note: null,
          cover_image_url: null,
          target_year: '2026',
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      journal_entries: [
        {
          id: 'j1',
          user_id: 'u1',
          entry_date: '2026-11-05',
          title: 'Harika bir gün',
          content: 'Bugün çok verimli geçti.',
          mood: 'high_energy',
          template_type: 'freeform',
          tags: ['üretkenlik'],
          weather_note: 'Güneşli',
          pinned: true,
          word_count: 4,
          created_at: '2026-11-05',
          updated_at: '2026-11-05',
        },
      ],
    }

    const customPreamble = 'Sen benim kişisel yaşam koçumsun. Verilerime bakarak haftalık hedeflerimi değerlendir.'

    const result = generateLifeMarkdown(mockData, {
      customPreamble,
      includeSections: {
        executiveSummary: false,
        dreamsAndGoals: true,
        projectsAndIdeas: false,
        routinesAndAgenda: false,
        journal: false,
        financialOverview: false,
        transactions: false,
      },
    })

    const md = result.markdown

    // Preamble eklenmiş olmalı
    expect(md).toContain(customPreamble)

    // Sadece dreams aktif olmalı, diğer bölümler olmamalı
    expect(md).toContain('## 2. Vizyon, Hedefler & Hayaller (Dreams)')
    expect(md).toContain('Hayal 1')

    expect(md).not.toContain('## 1. Yönetici Özeti')
    expect(md).not.toContain('## 3. Çalışma: Projeler & Fikirler')
    expect(md).not.toContain('## 4. Günlük Yaşam: Rutinler & Ajanda')
    expect(md).not.toContain('## 5. Seyir Defteri / Günlük')
    expect(md).not.toContain('## 6. Finansal Varlıklar, Borçlar, Gelirler ve Abonelikler')
    expect(md).not.toContain('## 7. Hesap ve Kart Hareketleri')

    // Kayıt sayımı sadece aktif olan hayali içermelidir (1 adet)
    expect(result.stats.includedRecords).toBe(1)
    expect(result.stats.sectionCounts.dreams).toBe(1)
    expect(result.stats.sectionCounts.journal_entries).toBeUndefined()
  })

  it('Finansal net varlık ve özet hesaplamasını doğru yapar', () => {
    const financeData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      accounts: [
        {
          id: 'a1',
          user_id: 'u1',
          name: 'Vadesiz',
          type: 'Banka',
          balance: 100000,
          balance_as_of: null,
          note: null,
          interest_rate: null,
          withholding_tax_rate: null,
          reserved_base_amount: null,
          maturity_date: null,
          last_yield_applied_at: null,
          created_at: '',
          updated_at: '',
        },
      ],
      investments: [
        {
          id: 'i1',
          user_id: 'u1',
          name: 'Hisse A',
          symbol: 'THYAO',
          category: 'Borsa',
          institution: 'Banka',
          quantity: 100,
          unit_cost: 200,
          current_price: 300,
          currency: 'TRY',
          last_price_updated_at: null,
          note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      credit_cards: [
        {
          id: 'c1',
          user_id: 'u1',
          bank: 'Banka',
          card_name: 'Kart',
          last_four: '1111',
          current_debt: 20000,
          statement_debt: 15000,
          minimum_payment: 5000,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      debts: [
        {
          id: 'd_borc',
          user_id: 'u1',
          type: 'Borç',
          category: 'Kişisel',
          person_or_entity: 'Ali',
          description: null,
          principal: 10000,
          past_payments: 0,
          remaining: 10000,
          status: 'Açık',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'd_alacak',
          user_id: 'u1',
          type: 'Alacak',
          category: 'Kişisel',
          person_or_entity: 'Veli',
          description: null,
          principal: 5000,
          past_payments: 0,
          remaining: 5000,
          status: 'Açık',
          created_at: '',
          updated_at: '',
        },
      ],
    }

    // Beklenen Net Varlık:
    // (Banka 100.000 + Yatırım (100 * 300 = 30.000) + Alacak 5.000) - (Kart Borcu 20.000 + Borç 10.000)
    // = 135.000 - 30.000 = 105.000
    const result = generateLifeMarkdown(financeData)
    expect(result.markdown).toContain('105.000')
    expect(result.markdown).toContain('THYAO')
  })

  it('transfer hareketlerinde kaynak ve hedef hesapları doğru şekilde formatlar (Kaynak → Hedef)', () => {
    const transferData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      accounts: [
        {
          id: 'acc-src',
          user_id: 'u1',
          name: 'Vadesiz Maaş Hesabı',
          type: 'Banka',
          balance: 50000,
          balance_as_of: null,
          note: null,
          interest_rate: null,
          withholding_tax_rate: null,
          reserved_base_amount: null,
          maturity_date: null,
          last_yield_applied_at: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'acc-tgt',
          user_id: 'u1',
          name: 'Birikim / Altın Hesabı',
          type: 'Banka',
          balance: 20000,
          balance_as_of: null,
          note: null,
          interest_rate: null,
          withholding_tax_rate: null,
          reserved_base_amount: null,
          maturity_date: null,
          last_yield_applied_at: null,
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-trf-1',
          user_id: 'u1',
          date: '2026-11-03',
          account_or_card: 'Vadesiz Maaş Hesabı → Birikim / Altın Hesabı',
          type: 'Transfer',
          description: 'Birikim transferi',
          amount: 5000,
          analysis_group: 'Kişisel',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: null,
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(transferData)
    expect(result.markdown).toContain('Vadesiz Maaş Hesabı → Birikim / Altın Hesabı')
  })

  it('proje tablosu finansal köprü sütunları olmadan yalın olarak oluşturulur', () => {
    const projectFinanceData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      projects: [
        {
          id: 'proj-freelance',
          user_id: 'u1',
          slug: 'client-app',
          name: 'Müşteri E-Ticaret',
          description: 'Müşteri projesi',
          status: 'Canlı',
          project_type: 'client',
          repo_url: null,
          live_url: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(projectFinanceData)
    const projLine = result.markdown.split('\n').find((l) => l.includes('Müşteri E-Ticaret'))
    expect(projLine).toBeDefined()
    expect(projLine).toContain('| Müşteri E-Ticaret | Müşteri | Canlı | - | Müşteri projesi |')
  })

  it('yatırım fiyatı henüz girilmemişse veya 0 ise yanıltıcı -100% k/z üretmez', () => {
    const invData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      investments: [
        {
          id: 'inv-zero',
          user_id: 'u1',
          name: 'Yeni Alınan Fon',
          symbol: 'TEFAS',
          category: 'Fon',
          institution: 'Banka',
          quantity: 100,
          unit_cost: 15,
          current_price: 0,
          currency: 'TRY',
          last_price_updated_at: null,
          note: 'Yeni fon alımı',
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(invData)
    // -100.0% üretilmemeli, '-' olmalıdır
    const invLine = result.markdown.split('\n').find((l) => l.includes('Yeni Alınan Fon'))
    expect(invLine).toBeDefined()
    expect(invLine).not.toContain('-100.0%')
  })

  it('hareketlerde yatırım miktarı ve birim fiyat detaylarını çözümler', () => {
    const invTxData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      investments: [
        {
          id: 'inv-apple',
          user_id: 'u1',
          name: 'Apple Inc',
          symbol: 'AAPL',
          category: 'Hisse',
          institution: 'Midas',
          quantity: 10,
          unit_cost: 200,
          current_price: 220,
          currency: 'USD',
          last_price_updated_at: null,
          note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-inv-buy',
          user_id: 'u1',
          date: '2026-11-04',
          account_or_card: null,
          type: 'Harcama',
          description: 'Hisse Alımı',
          amount: 2200,
          analysis_group: 'İş',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: null,
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(invTxData)
    expect(result.markdown).toContain('Hisse Alımı')
    expect(result.markdown).not.toContain('Apple Inc (AAPL)')
  })

  it('günlük içeriğindeki Markdown başlıklarını hiyerarşiyi bozmayacak şekilde demote eder', () => {
    const journalData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      journal_entries: [
        {
          id: 'j-heading',
          user_id: 'u1',
          entry_date: '2026-11-05',
          title: 'Strateji Değerlendirmesi',
          content: '# Ana Strateji\nBu önemli bir karar.\n## Alt Hedef\nİkinci adım.',
          mood: 'reflective',
          template_type: 'stoic',
          tags: ['strateji'],
          weather_note: null,
          pinned: false,
          word_count: 10,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(journalData)
    // En üst düzey # Ana Strateji olmamalı, #### Ana Strateji olmalı
    expect(result.markdown).not.toMatch(/^# Ana Strateji/m)
    expect(result.markdown).toContain('#### Ana Strateji')
    expect(result.markdown).toContain('#### Alt Hedef')
  })

  it('uzun proje README/dokümanlarını tablo hücresinden ayırır ve projectAndIdeaDocs toggle ile yönetir', () => {
    const longProjectSpec = [
      '# Pusula Next Gen Architecture',
      'Bu proje kişisel veri yönetimini hedefler.',
      '```typescript',
      'const engine = new LifeEngine()',
      'engine.sync()',
      '```',
      '| Katman | Sorumluluk |',
      '| :--- | :--- |',
      '| Core | Saf Hesaplamalar |',
    ].join('\n')

    const projectData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      projects: [
        {
          id: 'p-long',
          user_id: 'u1',
          slug: 'pusula-core',
          name: 'Pusula Çekirdek Sistem',
          description: longProjectSpec,
          status: 'Geliştirmede',
          project_type: 'internal',
          repo_url: null,
          live_url: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    // 1. projectAndIdeaDocs: true (varsayılan) durumu
    const fullResult = generateLifeMarkdown(projectData)
    const fullMd = fullResult.markdown

    // Tabloda yalnızca kısa özet yer almalı, kod bloğu veya tablo başlığı tablo hücresini bozmamalı
    const projLine = fullMd.split('\n').find((l) => l.includes('Pusula Çekirdek Sistem'))
    expect(projLine).toBeDefined()
    expect(projLine).toContain('Bu proje kişisel veri yönetimini hedefler.')
    expect(projLine).not.toContain('```typescript')

    // Tablonun altında detaylı dokümantasyon tam metin ve kod bloklarıyla yer almalı
    expect(fullMd).toContain('#### 📁 Pusula Çekirdek Sistem — Detaylı Dokümantasyon')
    expect(fullMd).toContain('```typescript')
    expect(fullMd).toContain('const engine = new LifeEngine()')

    // 2. projectAndIdeaDocs: false (kompakt mod) durumu
    const compactResult = generateLifeMarkdown(projectData, {
      includeSections: {
        projectAndIdeaDocs: false,
      },
    })
    const compactMd = compactResult.markdown

    // Tablo satırı yine mevcut olmalı
    expect(compactMd).toContain('Pusula Çekirdek Sistem')
    // Ancak alt detay bloğu kesinlikle bulunmamalı
    expect(compactMd).not.toContain('#### 📁 Pusula Çekirdek Sistem — Detaylı Dokümantasyon')
    expect(compactMd).not.toContain('const engine = new LifeEngine()')
    // Kompakt modun karakter sayısı tam moddan belirgin şekilde az olmalı
    expect(compactResult.stats.charCount).toBeLessThan(fullResult.stats.charCount)
  })

  it('abonelik ve gelir periyotlarını normalize eder, tek seferlik ödemeleri aylık sabit yüke katmaz ve Aylık Eşdeğer sütununu ekler', () => {
    const subIncomeData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      incomes: [
        {
          id: 'inc-1',
          user_id: 'u1',
          title: 'Maaş',
          category: 'Maaş',
          amount: 60000,
          currency: 'TRY',
          period: 'Aylık',
          income_type: 'Sabit',
          status: 'Aktif',
          payday: 1,
          note: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'inc-2',
          user_id: 'u1',
          title: 'Yıllık Temettü',
          category: 'Yatırım',
          amount: 120000,
          currency: 'TRY',
          period: 'Yıllık',
          income_type: 'Değişken',
          status: 'Aktif',
          payday: null,
          note: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'inc-3',
          user_id: 'u1',
          title: 'Tek Seferlik Danışmanlık',
          category: 'Danışmanlık',
          amount: 25000,
          currency: 'TRY',
          period: 'Tek Seferlik',
          income_type: 'Değişken',
          status: 'Aktif',
          payday: null,
          note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      subscriptions: [
        {
          id: 'sub-1',
          user_id: 'u1',
          service: 'Spotify',
          group_type: 'Kişisel',
          model: 'Aylık',
          amount: 600,
          currency: 'TRY',
          period: 'Aylık',
          end_date: null,
          decision: 'Devam',
          payment_method: null,
          status: 'Aktif',
          strategic_tag: 'Esnek',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'sub-2',
          user_id: 'u1',
          service: 'Domain Hosting (Yıllık)',
          group_type: 'İş',
          model: 'Yıllık',
          amount: 2400,
          currency: 'TRY',
          period: 'Yıllık',
          end_date: null,
          decision: 'Devam',
          payment_method: null,
          status: 'Aktif',
          strategic_tag: 'Vazgeçilmez',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'sub-3',
          user_id: 'u1',
          service: 'Ömür Boyu Lisans (Tek Seferlik)',
          group_type: 'İş',
          model: 'Tek Seferlik',
          amount: 5000,
          currency: 'TRY',
          period: 'Tek Seferlik',
          end_date: null,
          decision: 'Devam',
          payment_method: null,
          status: 'Aktif',
          strategic_tag: 'Tek Seferlik',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'sub-4',
          user_id: 'u1',
          service: 'İptal Edilecek Servis',
          group_type: 'Kişisel',
          model: 'Aylık',
          amount: 1500,
          currency: 'TRY',
          period: 'Aylık',
          end_date: null,
          decision: 'İptal Et',
          payment_method: null,
          status: 'Aktif',
          strategic_tag: 'Esnek',
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(subIncomeData)
    const md = result.markdown

    // Normalleştirilmiş Gelir: Aylık 60.000 + Yıllık (120.000 / 12 = 10.000) = 70.000 TL
    // Tek Seferlik 25.000 TL aylık tekrarlayan gelire dahil edilmez
    expect(md).toContain('70.000')

    // Normalleştirilmiş Abonelik: Aylık 600 + Yıllık (2400 / 12 = 200) = 800 TL
    // Tek Seferlik 5000 TL aylık tekrarlayan yüke katılmaz, 'İptal Et' olan 1500 TL hariç tutulur
    expect(md).toContain('800,00')
    expect(md).toContain('5.000,00 tek seferlik')

    // Abonelikler tablosunda Aylık Eşdeğer sütunu kontrolü
    expect(md).toContain('Aylık Eşdeğer')
    // Yıllık 2400 TL için aylık eşdeğer 200,00 TL olmalı
    const annualSubLine = md.split('\n').find((l) => l.includes('Domain Hosting'))
    expect(annualSubLine).toBeDefined()
    expect(annualSubLine).toContain('200,00')

    // Tek seferlik abonelik için aylık eşdeğer 0,00 TL olmalı
    const oneTimeSubLine = md.split('\n').find((l) => l.includes('Ömür Boyu Lisans'))
    expect(oneTimeSubLine).toBeDefined()
    expect(oneTimeSubLine).toContain('0,00')
  })

  it('kart adında son 4 hane zaten mevcutsa (**** XXXX) tekrarını önler', () => {
    const cardData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      credit_cards: [
        {
          id: 'card-dedup',
          user_id: 'u1',
          bank: 'Ziraat Bankası',
          card_name: 'Bankkart • 6745',
          last_four: '6745',
          current_debt: 5000,
          statement_debt: 4000,
          minimum_payment: 1000,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'card-normal',
          user_id: 'u1',
          bank: 'İş Bankası',
          card_name: 'Maximum Kart',
          last_four: '9876',
          current_debt: 2000,
          statement_debt: 1500,
          minimum_payment: 500,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-card-1',
          user_id: 'u1',
          date: '2026-11-01',
          account_or_card: null,
          type: 'Harcama',
          description: 'Market Alışverişi',
          amount: 250,
          analysis_group: 'Kişisel',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: 'card-dedup',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'tx-card-2',
          user_id: 'u1',
          date: '2026-11-02',
          account_or_card: null,
          type: 'Harcama',
          description: 'Kitap Alımı',
          amount: 150,
          analysis_group: 'Kişisel',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: 'card-normal',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(cardData)
    const md = result.markdown

    // Kart adında zaten 6745 olduğu için sonuna (**** 6745) eklenmemelidir
    expect(md).toContain('Ziraat Bankası - Bankkart • 6745')
    expect(md).not.toContain('Bankkart • 6745 (**** 6745)')

    // Normal kartta ise (**** 9876) eklenmelidir
    expect(md).toContain('İş Bankası - Maximum Kart (**** 9876)')
  })

  it('Anlık Likit Net Durum ile Alacaklar Dahil Toplam Net Varlığı ayrıştırır ve Finansman/Faiz Kaybını raporlar', () => {
    const liquidData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      accounts: [
        {
          id: 'acc-1',
          user_id: 'u1',
          name: 'Vadesiz TL',
          type: 'Banka',
          balance: 30000,
          balance_as_of: null,
          note: null,
          interest_rate: null,
          withholding_tax_rate: null,
          reserved_base_amount: null,
          maturity_date: null,
          last_yield_applied_at: null,
          created_at: '',
          updated_at: '',
        },
      ],
      investments: [
        {
          id: 'inv-1',
          user_id: 'u1',
          name: 'Altın',
          symbol: 'ALTIN',
          category: 'Emtia',
          institution: 'Banka',
          quantity: 10,
          unit_cost: 2500,
          current_price: 3000, // 30.000 TL
          currency: 'TRY',
          last_price_updated_at: null,
          note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      credit_cards: [
        {
          id: 'card-1',
          user_id: 'u1',
          bank: 'Banka',
          card_name: 'Kart',
          last_four: '1234',
          current_debt: 40000,
          statement_debt: 30000,
          minimum_payment: 10000,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      debts: [
        {
          id: 'debt-borc',
          user_id: 'u1',
          type: 'Borç',
          category: 'Kişisel',
          person_or_entity: 'Kişi A',
          description: null,
          principal: 25000,
          past_payments: 0,
          remaining: 25000,
          status: 'Açık',
          created_at: '',
          updated_at: '',
        },
        {
          id: 'debt-alacak',
          user_id: 'u1',
          type: 'Alacak',
          category: 'Müşteri',
          person_or_entity: 'Müşteri B',
          description: null,
          principal: 100000,
          past_payments: 0,
          remaining: 100000,
          status: 'Açık',
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-fee-1',
          user_id: 'u1',
          date: '2026-11-01',
          account_or_card: null,
          type: 'Finansman/Masraf',
          description: 'Gecikme Faizi ve KKDF',
          amount: 450,
          analysis_group: 'Finansman',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: 'card-1',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'tx-fee-2',
          user_id: 'u1',
          date: '2026-11-02',
          account_or_card: null,
          type: 'Finansman/Masraf',
          description: 'BSMV Kesintisi',
          amount: 150,
          analysis_group: 'Finansman',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: 'card-1',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    // Hesaplamalar:
    // Nakit: 30.000 + Yatırım: 30.000 = 60.000 TL
    // Borçlar: Kart 40.000 + Açık Borç 25.000 = 65.000 TL
    // Anlık Likit Net Durum = 60.000 - 65.000 = -5.000 TL
    // Toplam Net Varlık (100.000 TL alacak dahil) = -5.000 + 100.000 = +95.000 TL
    // Finansman & Faiz Kaybı = 450 + 150 = 600 TL (2 işlem)
    const result = generateLifeMarkdown(liquidData)
    const md = result.markdown

    expect(md).toContain('Anlık Likit Net Durum (Alacaklar Hariç)')
    expect(md).toContain('-₺5.000,00')

    expect(md).toContain('Toplam Net Varlık (Alacaklar Dahil)')
    expect(md).toContain('95.000,00')

    expect(md).toContain('Finansman & Faiz Kaybı')
    expect(md).toContain('600,00')
    expect(md).toContain('2 işlem')
  })

  it('aktif kredi kartı taksitlerini doğru ayrıştırır, kalan ayları ve kalan toplam yükü hesaplar', () => {
    const installmentData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      credit_cards: [
        {
          id: 'card-inst',
          user_id: 'u1',
          bank: 'Garanti BBVA',
          card_name: 'Bonus Platinum',
          last_four: '7788',
          current_debt: 15000,
          statement_debt: 10000,
          minimum_payment: 3000,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-inst-1',
          user_id: 'u1',
          date: '2026-11-01',
          account_or_card: null,
          type: 'Harcama',
          description: 'MediaMarkt İşlemin 2/6 Taksidi',
          amount: 1500,
          analysis_group: 'Kişisel',
          merchant: 'MediaMarkt',
          recurrence: null,
          statement_date: null,
          card_id: 'card-inst',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'tx-inst-2',
          user_id: 'u1',
          date: '2026-11-02',
          account_or_card: null,
          type: 'Harcama',
          description: 'IKEA Mobilya',
          amount: 3000,
          analysis_group: 'Kişisel',
          merchant: 'IKEA',
          recurrence: 'Taksit (1/3)',
          statement_date: null,
          card_id: 'card-inst',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'tx-inst-finished',
          user_id: 'u1',
          date: '2026-11-03',
          account_or_card: null,
          type: 'Harcama',
          description: 'Eski Alışveriş İşlemin 4/4 Taksidi',
          amount: 500,
          analysis_group: 'Kişisel',
          merchant: 'Eski Alışveriş',
          recurrence: null,
          statement_date: null,
          card_id: 'card-inst',
          account_id: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(installmentData)
    const md = result.markdown

    // Aktif Taksitler Tablosu başlığı ve satırları
    expect(md).toContain('Aktif Kart Taksitleri & Kalan Yük')
    const installmentSection = md.split('#### ⏳ Aktif Kart Taksitleri & Kalan Yük')[1]?.split('###')[0] || ''

    // MediaMarkt: 2/6 taksit -> Kalan ay: 4, Kalan yük: 4 * 1500 = 6.000 TL
    expect(installmentSection).toContain('MediaMarkt')
    expect(installmentSection).toContain('2/6')
    expect(installmentSection).toContain('4 ay')
    expect(installmentSection).toContain('6.000,00')

    // IKEA: 1/3 taksit -> Kalan ay: 2, Kalan yük: 2 * 3000 = 6.000 TL
    expect(installmentSection).toContain('IKEA')
    expect(installmentSection).toContain('1/3')
    expect(installmentSection).toContain('2 ay')

    // Biten taksit (4/4) taksit tablosunda yer almamalıdır
    expect(installmentSection).not.toContain('Eski Alışveriş')

    // Yönetici Özetinde Gelecek Ay Taksit Yükü (1500 + 3000 = 4.500 TL)
    expect(md).toContain('Devam Eden Kart Taksit Yükü (Gelecek Ay)')
    expect(md).toContain('4.500,00')
  })

  it('hayalleri ve rutinleri kimlik personalarına göre gruplayarak Kimlik Personaları Özeti tablosunu oluşturur', () => {
    const personaData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      dreams: [
        {
          id: 'd-fit-1',
          user_id: 'u1',
          title: 'Maraton Koşmak',
          description: null,
          identity_persona: 'Fit Evren',
          motivation_why: null,
          horizon: 'horizon_1y',
          category: 'Spor',
          status: 'active',
          next_focus_note: null,
          cover_image_url: null,
          target_year: '2027',
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: 1,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'd-cash-1',
          user_id: 'u1',
          title: 'Aylık 10.000$ MRR SaaS Geliri',
          description: null,
          identity_persona: 'Cash Maker Evren',
          motivation_why: null,
          horizon: 'horizon_1_3y',
          category: 'Kariyer & Girişim',
          status: 'active',
          next_focus_note: null,
          cover_image_url: null,
          target_year: '2027',
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: 2,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'd-fit-old',
          user_id: 'u1',
          title: 'Eski Sağlık Hedefi',
          description: null,
          identity_persona: 'Fit Evren',
          motivation_why: null,
          horizon: 'horizon_1y',
          category: 'Sağlık',
          status: 'achieved', // Aktif değil
          next_focus_note: null,
          cover_image_url: null,
          target_year: '2026',
          achieved_at: '2026-06-01',
          achieved_note: 'Tamamlandı',
          achieved_image_url: null,
          order_index: 3,
          created_at: '',
          updated_at: '',
        },
      ],
      routines: [
        {
          id: 'r-fit-1',
          user_id: 'u1',
          title: 'Sabah Koşusu & Esneme',
          icon: 'run',
          time_block: 'morning',
          frequency: 'daily',
          target_days: [],
          target_duration_minutes: 45,
          minimum_effective_dose: '10 dk hafif tempo',
          dream_id: 'd-fit-1',
          identity_persona: 'Fit Evren',
          is_active: true,
          order_index: 1,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'r-fit-2',
          user_id: 'u1',
          title: 'Akşam Ağırlık Antrenmanı',
          icon: 'dumbbell',
          time_block: 'evening',
          frequency: 'custom',
          target_days: [1, 3, 5],
          target_duration_minutes: 60,
          minimum_effective_dose: '20 dk squat/pushup',
          dream_id: 'd-fit-1',
          identity_persona: 'Fit Evren',
          is_active: true,
          order_index: 2,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'r-cash-passive',
          user_id: 'u1',
          title: 'Eski Satış Çağrıları',
          icon: 'phone',
          time_block: 'afternoon',
          frequency: 'weekdays',
          target_days: [],
          target_duration_minutes: 30,
          minimum_effective_dose: null,
          dream_id: 'd-cash-1',
          identity_persona: 'Cash Maker Evren',
          is_active: false, // Pasif rutin
          order_index: 3,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(personaData)
    const md = result.markdown

    expect(md).toContain('### 🎭 Kimlik Personaları Özeti')
    expect(md).toContain('| Persona | Aktif Hedef Sayısı | Aktif Rutin Sayısı | Odak Alanları |')

    const personaSection = md.split('### 🎭 Kimlik Personaları Özeti')[1]?.split('\n## ')[0] || ''
    const fitLine = personaSection.split('\n').find((l) => l.includes('Fit Evren'))
    expect(fitLine).toBeDefined()
    expect(fitLine).toContain('1 hedef')
    expect(fitLine).toContain('2 rutin')

    // Cash Maker Evren: 1 aktif hedef, 0 aktif rutin (rutin pasif olduğu için sayılmamalı)
    const cashLine = personaSection.split('\n').find((l) => l.includes('Cash Maker Evren'))
    expect(cashLine).toBeDefined()
    expect(cashLine).toContain('1 hedef')
    expect(cashLine).toContain('0 rutin')
    expect(cashLine).toContain('Kariyer & Girişim')
  })

  it('cleanMultiLine kod blokları (``` ve ~~~) içindeki # yorumlarını korur ve dışarıdaki başlıkları seviyelendirir', () => {
    const rawContent = [
      '# Ana Başlık',
      'Açıklama paragrafı',
      '## Alt Bölüm',
      '```bash',
      '# install dependencies',
      'npm install pusula-core',
      '# run test',
      'npm test',
      '```',
      '### Detay Başlığı',
      '```python',
      '# calculate tax',
      'def tax(x):',
      '    return x * 0.2',
      '```',
    ].join('\n')

    // minLevel = 4 (varsayılan)
    const cleaned4 = cleanMultiLine(rawContent, 4)
    expect(cleaned4).toContain('#### Ana Başlık')
    expect(cleaned4).toContain('##### Alt Bölüm')
    expect(cleaned4).toContain('###### Detay Başlığı')
    // Kod bloğu içindeki bash ve python yorumları asla bozulmamalı (#### yapılmamalı)
    expect(cleaned4).toContain('# install dependencies')
    expect(cleaned4).toContain('# run test')
    expect(cleaned4).toContain('# calculate tax')
    expect(cleaned4).not.toContain('#### install dependencies')
    expect(cleaned4).not.toContain('#### calculate tax')

    // minLevel = 5 (proje dokümantasyonu için)
    const cleaned5 = cleanMultiLine(rawContent, 5)
    expect(cleaned5).toContain('##### Ana Başlık')
    expect(cleaned5).toContain('###### Alt Bölüm')
    expect(cleaned5).toContain('# install dependencies')
  })

  it('parseInstallmentInfo çeşitli banka ekstre formatlarını (Türkçe ve İngilizce) ve periyotları doğru ayrıştırır', () => {
    // 1. Ziraat / Garanti: İşlemin X/Y Taksidi / Taksiti
    expect(parseInstallmentInfo('MediaMarkt İşlemin 2/6 Taksidi')).toEqual({
      current: 2,
      total: 6,
      cleanDesc: 'MediaMarkt',
    })
    expect(parseInstallmentInfo('Trendyol İşlemin 3/9 Taksiti')).toEqual({
      current: 3,
      total: 9,
      cleanDesc: 'Trendyol',
    })

    // 2. Yapı Kredi / Akbank: Taksit (X/Y) ve Taksit: X/Y
    expect(parseInstallmentInfo('IKEA Mobilya - Taksit: 1/3')).toEqual({
      current: 1,
      total: 3,
      cleanDesc: 'IKEA Mobilya',
    })
    expect(parseInstallmentInfo('Teknosa Taksit (4/6)')).toEqual({
      current: 4,
      total: 6,
      cleanDesc: 'Teknosa',
    })

    // 3. X/Y Taksit / Taksiti / Taksidi / Tk.
    expect(parseInstallmentInfo('Koçtaş 2/6 Taksit')).toEqual({
      current: 2,
      total: 6,
      cleanDesc: 'Koçtaş',
    })
    expect(parseInstallmentInfo('Vatan Bilgisayar 1/12 Taksiti')).toEqual({
      current: 1,
      total: 12,
      cleanDesc: 'Vatan Bilgisayar',
    })
    expect(parseInstallmentInfo('Boyner 03/06 TK.')).toEqual({
      current: 3,
      total: 6,
      cleanDesc: 'Boyner',
    })

    // 4. Parantez içi / köşeli parantezli bare X/Y: (X/Y)
    expect(parseInstallmentInfo('Amazon.com.tr (2/4)')).toEqual({
      current: 2,
      total: 4,
      cleanDesc: 'Amazon.com.tr',
    })

    // 5. Bare X/Y satır sonunda (Enpara / Statement Parser)
    expect(parseInstallmentInfo('KOTON 1/3')).toEqual({
      current: 1,
      total: 3,
      cleanDesc: 'KOTON',
    })

    // 6. Recurrence alanı üzerinden
    expect(parseInstallmentInfo('Apple Store', 'Taksit (2/6)')).toEqual({
      current: 2,
      total: 6,
      cleanDesc: 'Apple Store',
    })
    expect(parseInstallmentInfo('Spotify', '1/3')).toEqual({
      current: 1,
      total: 3,
      cleanDesc: 'Spotify',
    })

    // 7. İngilizce ekstre formatları: Installment X/Y, X of Y
    expect(parseInstallmentInfo('AWS Cloud Installment 2 of 12')).toEqual({
      current: 2,
      total: 12,
      cleanDesc: 'AWS Cloud',
    })
    expect(parseInstallmentInfo('Stripe Payments (Installment 3/6)')).toEqual({
      current: 3,
      total: 6,
      cleanDesc: 'Stripe Payments',
    })

    // 8. Taksit olmayan durumlar (tarihler, tek ödemeler, geçersizler)
    expect(parseInstallmentInfo('Market Harcaması 15/05/2026')).toBeNull()
    expect(parseInstallmentInfo('İşlem 1/1')).toBeNull()
    expect(parseInstallmentInfo('İşlem 7/6')).toBeNull() // cur > tot
    expect(parseInstallmentInfo('İşlem 1/100')).toBeNull() // tot > 60
    expect(parseInstallmentInfo(null, null)).toBeNull()
  })

  it('extractActiveCardInstallments iade ve kart ödemesi işlemlerini hariç tutar ve noktalama temizliğini yapar', () => {
    const txs = [
      {
        id: 'tx-1',
        type: 'Harcama',
        description: 'Decathlon - İşlemin 2/4 Taksidi',
        amount: 800,
        card_id: 'card-1',
        merchant: 'Decathlon',
        date: '2026-11-01',
      },
      {
        id: 'tx-2-refund',
        type: 'İade', // İade taksit borcu olarak sayılmamalı
        description: 'Decathlon - İşlemin 2/4 Taksidi (İADE)',
        amount: 800,
        card_id: 'card-1',
        merchant: 'Decathlon',
        date: '2026-11-02',
      },
      {
        id: 'tx-3-payment',
        type: 'Kart Ödemesi', // Kart ödemesi taksit borcu sayılmamalı
        description: 'Otomatik Kart Borç Ödemesi 1/3',
        amount: 2500,
        card_id: 'card-1',
        date: '2026-11-03',
      },
    ]

    const installments = extractActiveCardInstallments(txs, () => 'Bonus Platinum')
    expect(installments.length).toBe(1)
    expect(installments[0].description).toBe('Decathlon')
    expect(installments[0].remainingMonths).toBe(2)
    expect(installments[0].remainingLoad).toBe(1600)
  })

  it('kart adı null/undefined olduğunda ve bağlı rutin hayal kategorisi miras aldığında güvenle çalışır', () => {
    const edgeData: PusulaVaultData = {
      ...EMPTY_VAULT_DATA,
      credit_cards: [
        {
          id: 'card-null-name',
          user_id: 'u1',
          bank: 'Ziraat Bankası',
          card_name: (null as unknown) as string,
          last_four: '9900',
          current_debt: 1000,
          statement_debt: 1000,
          minimum_payment: 200,
          interest_fees: 0,
          statement_date: null,
          due_date: null,
          status_note: null,
          created_at: '',
          updated_at: '',
        },
      ],
      dreams: [
        {
          id: 'dream-linked',
          user_id: 'u1',
          title: 'Yazılım Mimarı Olmak',
          description: null,
          identity_persona: null, // Hayalde persona doğrudan belirtilmemiş
          motivation_why: null,
          horizon: 'horizon_1y',
          category: 'Teknoloji',
          status: 'active',
          next_focus_note: null,
          cover_image_url: null,
          target_year: '2027',
          achieved_at: null,
          achieved_note: null,
          achieved_image_url: null,
          order_index: 1,
          created_at: '',
          updated_at: '',
        },
      ],
      routines: [
        {
          id: 'routine-inherit',
          user_id: 'u1',
          title: 'Sistem Tasarımı Okumaları',
          icon: 'book',
          time_block: 'evening',
          frequency: 'daily',
          target_days: [],
          target_duration_minutes: 30,
          minimum_effective_dose: '10 dk',
          dream_id: 'dream-linked', // Hayale bağlı
          identity_persona: 'Mimar Evren',
          is_active: true,
          order_index: 1,
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-null-card',
          user_id: 'u1',
          date: '2026-11-01',
          type: 'Harcama',
          description: 'Sunucu Ödemesi',
          amount: 250,
          card_id: 'card-null-name',
          analysis_group: 'İş',
          merchant: null,
          recurrence: null,
          statement_date: null,
          account_id: null,
          account_or_card: null,
          import_id: null,
          source_bank: null,
          source_account_ref: null,
          source_external_id: null,
          source_fingerprint: null,
          weak_fingerprint: null,
          fingerprint_strength: null,
          classification_status: 'CONFIRMED',
          classification_confidence: 'high',
          classification_reason: null,
          import_row_index: null,
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(edgeData)
    const md = result.markdown

    // Kart adı null olduğunda hata vermeden 'Kart (**** 9900)' olarak üretilmeli
    expect(md).toContain('Ziraat Bankası - Kart (**** 9900)')

    // Persona matrisi bağlı hayalin kategorisini (Teknoloji) odak alanı olarak yansıtmalı
    expect(md).toContain('Mimar Evren')
    expect(md).toContain('Teknoloji')
  })
})

