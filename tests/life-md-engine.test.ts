import { describe, it, expect } from 'vitest'
import { generateLifeMarkdown, cleanCell } from '@/lib/life-md-engine'
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
          budget_limit: 15000,
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
          linked_account_id: 'acc-456',
          project_id: 'proj-123',
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
          project_id: 'proj-123',
          source_account_id: null,
          target_account_id: null,
          related_debt_id: null,
          related_investment_id: null,
          investment_quantity_delta: null,
          investment_unit_price: null,
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
          project_id: 'proj-123',
          payment_card_id: 'card-789',
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

    // Tablo satırında kontrol
    const ideaLine = md.split('\n').find((l) => l.includes('Mobil \\| Uygulama \\| Fikri'))
    expect(ideaLine).toBeDefined()
    // Satır içi satır sonları boşluğa dönüştürülmüş olmalı
    expect(ideaLine).toContain('Birinci satır İkinci satır \\| Sütun gibi görünen metin Üçüncü satır')
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
          linked_account_id: null,
          project_id: null,
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
          linked_account_id: null,
          project_id: null,
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
          created_at: '',
          updated_at: '',
        },
      ],
      transactions: [
        {
          id: 'tx-trf-1',
          user_id: 'u1',
          date: '2026-11-03',
          account_or_card: null,
          type: 'Transfer',
          description: 'Birikim transferi',
          amount: 5000,
          analysis_group: 'Kişisel',
          merchant: null,
          recurrence: null,
          statement_date: null,
          card_id: null,
          account_id: null,
          project_id: null,
          source_account_id: 'acc-src',
          target_account_id: 'acc-tgt',
          related_debt_id: null,
          related_investment_id: null,
          investment_quantity_delta: null,
          investment_unit_price: null,
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

  it('proje tablosunda Borç ve Alacak ayrımını doğru yapar ve borcu alacakla karıştırmaz', () => {
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
          budget_limit: null,
          repo_url: null,
          live_url: null,
          created_at: '',
          updated_at: '',
        },
      ],
      debts: [
        {
          id: 'd-alacak-1',
          user_id: 'u1',
          type: 'Alacak',
          category: 'Müşteri',
          person_or_entity: 'Müşteri Şirket A.Ş.',
          description: 'Son hakediş alacağı',
          principal: 50000,
          past_payments: 0,
          remaining: 50000,
          status: 'Açık',
          linked_account_id: null,
          project_id: 'proj-freelance',
          created_at: '',
          updated_at: '',
        },
      ],
    }

    const result = generateLifeMarkdown(projectFinanceData)
    // Proje satırında "Alacak" olarak görünmeli, açık borç olarak gösterilmemeli
    const projLine = result.markdown.split('\n').find((l) => l.includes('Müşteri E-Ticaret'))
    expect(projLine).toBeDefined()
    expect(projLine).toContain('Alacak:')
    expect(projLine).toContain('50.000')
    expect(projLine).not.toContain('Borç: ₺50.000')
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
          project_id: null,
          source_account_id: null,
          target_account_id: null,
          related_debt_id: null,
          related_investment_id: 'inv-apple',
          investment_quantity_delta: 10,
          investment_unit_price: 220,
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
    expect(result.markdown).toContain('Apple Inc (AAPL)')
    expect(result.markdown).toContain('+10 adet')
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
})

