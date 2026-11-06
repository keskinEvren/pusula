# 🗄️ Pusula — Veritabanı Şeması & Güvenlik Politikaları (Database Schema)

Bu döküman, Pusula'nın Supabase (PostgreSQL) üzerinde çalışan tablolarını, atomik RPC fonksiyonlarını, kısıtlamalarını (Constraints) ve Satır Düzeyi Güvenlik (Row Level Security - RLS) kurallarını tanımlar.

---

## 1. Tablo Listesi

| Tablo Adı | Açıklama | RLS Politikası |
| :--- | :--- | :---: |
| `profiles` | Kullanıcı profil ve tercihler tablosu | `auth.uid() = id` |
| `accounts` | Vadesiz, nakit, yatırım ve birikim ("Damla" getiri) hesapları | `auth.uid() = user_id` |
| `credit_cards` | Kredi kartları, limitler, kesim/son ödeme günleri ve güncel borçlar | `auth.uid() = user_id` |
| `card_statements` | Aylık kart ekstre geçmişi ve değişim trendleri | `auth.uid() = user_id` |
| `transactions` | Genel işlem defteri (ekstre ve manuel hareket kayıtları) | `auth.uid() = user_id` |
| `debts` | Şahsi/kurumsal borçlar ve kesin alacaklar | `auth.uid() = user_id` |
| `debt_installments` | Borçlara ait vadeli taksit planı ve ödeme durumları | `auth.uid() = user_id` |
| `incomes` | Beyan edilen düzenli ve tek seferlik gelirler | `auth.uid() = user_id` |
| `subscriptions` | Tekrarlayan SaaS, fatura ve lisans abonelikleri | `auth.uid() = user_id` |
| `investments` | Yatırım varlıkları (altın, döviz, hisse, fon, kripto) | `auth.uid() = user_id` |
| `projects` | Proje çalışma masası, durum ve Markdown şartname (`spec_markdown`) | `auth.uid() = user_id` |
| `ideas` | Fikir kuluçka havuzu (`Inbox`, `Maybe`, `Promoted`, `Killed`) | `auth.uid() = user_id` |
| `agenda_items` | Günlük odak masası, görevler ve çalışma süreleri | `auth.uid() = user_id` |
| `routines` | Günlük alışkanlıklar, seri (streak) ve mola ayarları | `auth.uid() = user_id` |
| `routine_logs` | Rutinlerin günlük tamamlama kayıtları (`date`, `level`) | `auth.uid() = user_id` |
| `journal_entries` | Markdown destekli günlük seyir defteri kayıtları | `auth.uid() = user_id` |
| `dreams` | Vizyon panosu ve orta/uzun vadeli hedefler | `auth.uid() = user_id` |
| `credentials` | İstemci taraflı şifrelenmiş (`AES-GCM 256-bit`) kimlik kasası | `auth.uid() = user_id` |
| `statement_imports` | Yüklenen ekstrelerin üst verisi, dosya özeti ve geri alma durumu | `auth.uid() = user_id` |
| `merchant_mappings` | Kullanıcının özel işyeri normalizasyon kuralları | `auth.uid() = user_id` |
| `notification_preferences` | Uygulama ve web push bildirim tercihleri | `auth.uid() = user_id` |
| `push_subscriptions` | Tarayıcı Web Push abonelik uç noktaları | `auth.uid() = user_id` |

---

## 2. Mimari Kısıtlamalar & Bütünlük İlkeleri (Integrity)

1. **Multi-Tenant İzolasyonu (RLS):** Her tabloda `user_id uuid references auth.users(id) on delete cascade` bulunur ve tüm `SELECT`, `INSERT`, `UPDATE`, `DELETE` politikaları `auth.uid() = user_id` kontrolüne tabidir.
2. **Bağımsız Modül Sınırları (Decoupled Storage):**
   - Hesap bakiyeleri (`accounts`), kredi kartı borçları (`credit_cards`), borç/alacak kayıtları (`debts` / `debt_installments`) ve projeler (`projects`) birbirinin durumunu gizli tetikleyicilerle ezmez.
   - `027_remove_project_tasks.sql` ve `028_decouple_projects_from_finance.sql` migrasyonları ile eski karmaşık görev tabloları ve zorunlu finans-proje köprüleri temizlenmiştir.
3. **Atomik Veritabanı Yordamları (PL/pgSQL RPCs):**
   - `import_statement_bundle` & `rollback_statement_import`: Ekstre içe aktarımını ve geri alma işlemini idempotent ve atomik olarak yürütür.
   - `list_transactions_page`: `(date, id)` imleci (keyset pagination) üzerinden yüksek performanslı işlem listelemesi sağlar.

---

## 3. PostgreSQL SQL Migrasyonları

Tüm şema evrimi [`supabase/migrations/`](../supabase/migrations/) dizinindeki 32 adet SQL migrasyon dosyasında (`001_initial_schema.sql` ➔ `031_incomes_module.sql`) sıralı olarak tanımlanmıştır.
