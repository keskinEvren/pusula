# 🧭 Pusula — Solo Kurucu Komuta Merkezi

> Kişisel finans ve proje yönetiminin tek bir ekranda buluştuğu, paranın nereden gelip nereye gittiğini ve projelerin bu denklemi nasıl etkilediğini gösteren bütünleşik solo kurucu işletim sistemi.

---

## 📚 Mimari & Tasarım Dökümanları

Projenin tüm vizyon, veri modeli ve sistem dinamikleri `docs/` klasöründe detaylandırılmıştır:

1. 🎯 [**Vizyon & Zihinsel Model** (`docs/VISION.md`)](docs/VISION.md) — Solo kurucunun finansal & operasyonel kaosu ve Pusula'nın çözüm felsefesi.
2. 🏛️ [**Domain Modeli & Varlık İlişkileri** (`docs/DOMAIN_MODEL.md`)](docs/DOMAIN_MODEL.md) — Veritabanı varlıkları, ilişkiler ve türetilen metrikler.
3. ⚡ [**Sistem Dinamikleri & Olay Akışları** (`docs/SYSTEM_DYNAMICS.md`)](docs/SYSTEM_DYNAMICS.md) — Bir olay gerçekleştiğinde sistemin nasıl zincirleme tepki verdiği.
4. 📄 [**Ekstre Ayrıştırma Spesifikasyonu** (`docs/SPEC_PARSER.md`)](docs/SPEC_PARSER.md) — PDF/CSV parser, font onarım motoru ve onay ekranı kuralları.
5. 🗺️ [**Geliştirme Yol Haritası** (`docs/ROADMAP.md`)](docs/ROADMAP.md) — Aşama aşama geliştirme planı.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

- **Runtime:** Node.js >= 20.x (Önerilen: Node 22 LTS)
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Veritabanı:** Supabase (PostgreSQL 15+, Row Level Security, Auth, PL/pgSQL Atomic Stored Procedures)
- **Ekstre & Doküman İşleme:** `pdfjs-dist` (Client-side PDF metin çıkarma & Axess Type3 font decoder), `xlsx`
- **Kasa Motoru:** Web Crypto API (PBKDF2 + AES-GCM 256-bit istemci tarafı şifreleme)
- **Test:** Vitest (Saf Finans Motoru, Atomik Köprü, Kasa ve Parser testleri)

---

## 🚀 Başlangıç ve Kurulum

### 1. Gereksinimler
- Node.js `v20.0.0` veya üzeri
- Bir Supabase projesi (PostgreSQL veritabanı ile)

### 2. Ortam Değişkenleri
Proje kök dizininde `.env.local` dosyası oluşturun:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-anon-key
```

> **Güvenlik Uyarısı:** `SUPABASE_SERVICE_ROLE_KEY` asla istemci tarafına veya genel repository'e konulmamalıdır. Yalnızca yetkili CLI bakım scriptleri için opsiyoneldir.

### 3. Veritabanı Migrasyonları
Supabase SQL Editor üzerinden sırasıyla çalıştırınız:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_financial_bridge.sql`
3. `supabase/migrations/002_import_batch_and_rollback.sql`
4. `supabase/migrations/003_link_transactions_to_debts.sql`
5. `supabase/migrations/004_create_investments.sql`
6. `supabase/migrations/005_create_dreams.sql`
7. `supabase/migrations/006_create_routines_and_logs.sql`
8. `supabase/migrations/007_create_journal_entries.sql`
9. `supabase/migrations/008_security_and_financial_integrity.sql` *(Atomik stored procedure'lar, kilitler ve güvenlik sertleştirmeleri)*

### 4. Komutlar
```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# Tip denetimi (TypeScript)
npm run typecheck

# Otomatik testleri çalıştır (Vitest)
npm test

# Üretim derlemesi
npm run build
```
