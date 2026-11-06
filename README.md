# 🧭 Pusula
### Kişisel Finans, Proje ve Yaşam İşletim Sistemi

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)

> Geliştiriciler ve bağımsız üreticiler için kişisel finansı, birikim getirilerini, kredi kartı ekstrelerini, proje çalışma masasını ve günlük odak akışlarını **bağımsız, öngörülebilir ve tam kontrollü modüllerle** tek çatıda toplayan kişisel işletim sistemi.

---

## 📸 Arayüz & Ekran Görüntüleri

### Finans & Proje Kokpiti
![Finans & Proje Kokpiti](docs/screenshots/03_dashboard_cockpit.png)

| Finansal Hareketler & Ledger | Proje & Fikir Portföyü |
|:---:|:---:|
| ![İşlem Hareketleri](docs/screenshots/04_transactions.png) | ![Proje Yönetimi](docs/screenshots/06_projects_management.png) |

| Kredi Kartları & Ekstre Trendi | Ajanda & Operasyonel Planlayıcı |
|:---:|:---:|
| ![Kartlar ve Hesaplar](docs/screenshots/05_cards_accounts.png) | ![Ajanda Planlayıcı](docs/screenshots/07_agenda_planner.png) |

---

## 🛡️ Mühendislik Öne Çıkanları

- **Bağımsız ve Kontrollü Modül Mimarisi (Decoupled Architecture):** Modüller birbirinin verisini arka planda gizli yan etkilerle bozmaz. Hesap bakiyeleri, kart borçları, taksitli borç planları ve projeler şeffaf ve öngörülebilir biçimde doğrudan kullanıcı kontrolündedir.
- **İstemci Taraflı Ekstre Ayrıştırma:** Banka ekstreleri (PDF/XLSX), dosya sunucuya iletilmeden doğrudan tarayıcı belleğinde (`pdfjs-dist`) işlenir. Karakter glif restorasyonu ve regex kuralları ile işlem satırları, taksit detayları ve işyerleri otomatik normalize edilir.
- **Kuruş Hassasiyetli Finans & Birikim Motoru:** Tüm finansal hesaplamalar, aylık bütçe dengesi (`Gelir - Sabit Taahhütler - Değişken Yük`) ve birikim hesaplarındaki günlük "Damla" getiri hesaplamaları (`savings-engine.ts`), IEEE-754 kayan nokta yuvarlama sapmalarını önlemek amacıyla kuruş tabanlı sabit hassasiyetle yürütülür.
- **İstemci Taraflı Şifrelenmiş Kasa:** Hassas kimlik ve parola kayıtları, Web Crypto API (`PBKDF2` anahtar türetimi ve `AES-GCM 256-bit`) ile istemci tarafında şifrelenir; veritabanında yalnızca şifrelenmiş veri saklanır.
- **Yapay Zekâ Bağlam Üreticisi (`life.md`):** Kullanıcının finansal, operasyonel ve kişisel yaşam verileri tek tıkla yapılandırılmış bir `life.md` dokümanına dönüştürülerek LLM asistanlarına eksiksiz bağlam olarak aktarılabilir.

---

## 🧩 Modül Ekosistemi

| Kategori | Modül | Açıklama |
|:---|:---|:---|
| **Finans** | **Kokpit (`/`)** | Net varlık, hazır nakit, kart borçları, aylık bütçe dengesi ve 6 aylık nakit yükü özeti. |
| | **İşlem Hareketleri (`/transactions`)** | Banka ekstrelerinden otomatik ayrıştırma, harcama grupları ve imleç tabanlı (keyset) işlem defteri. |
| | **Kredi Kartları (`/cards`)** | Kart limitleri, manuel borç/ekstre kontrolü, dönem ekstreleri ve borç değişim trendleri (▲/▼). |
| | **Hesaplar & Birikim (`/accounts`)** | Vadesiz banka, nakit kasa ve günlük net getiri hesaplayan "Damla" birikim hesapları. |
| | **Borç & Alacak (`/debts`)** | Kişisel/kurumsal borçlar, alacaklar ve vadeli taksit planlayıcı (`debt_installments`). |
| | **Gelirler (`/incomes`)** | Düzenli ve tek seferlik gelir beyanları, çoklu döviz desteği ve aylık bütçe etkisi. |
| | **Abonelikler (`/subscriptions`)** | Düzenli SaaS, fatura ve lisans ödemeleri, 6 aylık nakit çıkış projeksiyonu. |
| | **Yatırımlar (`/investments`)** | Altın, döviz, hisse, fon ve kripto varlıkları ile canlı piyasa kuru takibi. |
| **Proje & Operasyon** | **Projeler & Fikirler (`/projects`)** | Çalışma masası odak disiplini (maks. 2 aktif proje), Markdown şartname ve fikir kuluçka havuzu. |
| | **Ajanda (`/agenda`)** | Günlük odak masası, Pomodoro/kronometre zamanlayıcı ve taşınabilir görev listesi. |
| **Kişisel & Güvenlik** | **Rutinler (`/routines`)** | Günlük alışkanlık takibi, 3 seviyeli başarı skoru, streak zinciri ve mola/dondurma desteği. |
| | **Seyir Defteri (`/journal`)** | Markdown destekli günlük çalışma ve karar notları. |
| | **Hayaller (`/dreams`)** | Yaşam vizyonu ve orta/uzun vadeli hedefler. |
| | **AI Bağlamı (`/ai-context`)** | Tüm yaşam ve finans durumunu LLM'ler için `life.md` formatında derleyen bağlam motoru. |
| | **Kasa (`/credentials`)** | PBKDF2 + AES-GCM 256-bit şifrelenmiş istemci tarafı kimlik/parola kasası. |

---

## 🛠️ Teknoloji Yığını

- **Runtime:** Node.js >= 20.x (Önerilen: Node 22 LTS)
- **Frontend:** Next.js 16.3.5 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Veritabanı:** Supabase (PostgreSQL 15+, Row Level Security, Auth, PL/pgSQL Atomic RPCs)
- **Ekstre & Doküman İşleme:** `pdfjs-dist` (Client-side PDF metin çıkarma & font glif restorasyonu), `xlsx`
- **Şifreleme:** Web Crypto API (PBKDF2 + AES-GCM 256-bit)
- **Test:** Vitest (34 test dosyası, 520+ birim, entegrasyon ve veritabanı bütünlük testi)

---

## 🚀 Kurulum ve Başlangıç

### 1. Gereksinimler
- Node.js `v20.0.0` veya üzeri
- Bir Supabase projesi (PostgreSQL veritabanı)

### 2. Ortam Değişkenleri
Örnek yapılandırma dosyasını kopyalayarak yerel `.env.local` dosyasını oluşturun:

```bash
cp .env.example .env.local
```

`.env.local` dosyasını kendi Supabase proje bilgilerinizle doldurun:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-anon-key
```

> **Güvenlik Uyarısı:** `SUPABASE_SERVICE_ROLE_KEY` asla istemci tarafına veya repository'e konulmamalıdır; yalnızca yerel bakım/yönetim scriptleri için opsiyoneldir.

### 3. Veritabanı Şeması
`supabase/migrations/` dizininde projenin ihtiyaç duyduğu 32 adet SQL migrasyon dosyası (`001` ➔ `031`) yer almaktadır.

Bu dosyaları Supabase CLI ile veya Supabase Dashboard üzerindeki **SQL Editor** aracılığıyla sırayla uygulayabilirsiniz:

```bash
# Supabase CLI ile yerel veya uzak veritabanına aktarma:
supabase db push
```

### 4. Çalıştırma Komutları
```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat (http://localhost:3000)
npm run dev

# Tip denetimi (TypeScript)
npm run typecheck

# Test süitini çalıştır (Vitest)
npm test

# Üretim derlemesi
npm run build
```

---

## 📚 Mimari & Tasarım Dokümanları

Pusula'nın mimari temelleri, domain modelleri ve ayrıştırma kuralları `docs/` klasöründe detaylandırılmıştır:

1. 🎯 [**Vizyon & Zihinsel Model** (`docs/VISION.md`)](docs/VISION.md) — Bağımsız, öngörülebilir ve manuel kontrollü modüler mimari felsefesi.
2. 🏛️ [**Domain Modeli & Varlık İlişkileri** (`docs/DOMAIN_MODEL.md`)](docs/DOMAIN_MODEL.md) — Veritabanı varlıkları, ilişkiler ve türetilen metrikler.
3. ⚡ [**Sistem Dinamikleri & Olay Akışları** (`docs/SYSTEM_DYNAMICS.md`)](docs/SYSTEM_DYNAMICS.md) — Ekstre içe aktarımı, Damla birikim motoru, taksitli borçlar ve aylık bütçe dengesi akışları.
4. 🗄️ [**Veritabanı Şeması & Güvenlik** (`docs/DATABASE_SCHEMA.md`)](docs/DATABASE_SCHEMA.md) — PostgreSQL tabloları, RLS politikaları ve atomik RPC'ler.
5. 📄 [**Ekstre Ayrıştırma Spesifikasyonu** (`docs/SPEC_PARSER.md`)](docs/SPEC_PARSER.md) — PDF/CSV ayrıştırma mimarisi ve glif restorasyon kuralları.
6. 🧪 [**Test Stratejisi** (`docs/TESTING_STRATEGY.md`)](docs/TESTING_STRATEGY.md) — Otomatik test piramidi ve kalite güvencesi ilkeleri.
7. 🗺️ [**Geliştirme Yol Haritası** (`docs/ROADMAP.md`)](docs/ROADMAP.md) — Tamamlanan aşamalar ve gelecek planları.

---

## 📄 Lisans

Bu proje için henüz seçilmiş bir açık kaynak lisansı bulunmamaktadır. Aksi belirtilmedikçe tüm hakları saklıdır.
