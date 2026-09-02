# 🗄️ Pusula — Veritabanı Şeması & Güvenlik Politikaları (Database Schema)

Bu döküman, Pusula'nın Supabase (PostgreSQL) üzerinde çalışan 12 tablosunu, kısıtlamalarını (Constraints), tetikleyicilerini (Triggers) ve Satır Düzeyi Güvenlik (Row Level Security - RLS) kurallarını tanımlar.

---

## 1. Tablo Listesi

| Tablo Adı | Açıklama | RLS Politikası |
| :--- | :--- | :---: |
| `profiles` | Kullanıcı profil ve tercihler tablosu | `auth.uid() = id` |
| `accounts` | Vadesiz, nakit ve yatırım hesapları | `auth.uid() = user_id` |
| `credit_cards` | Kredi kartları, limitler ve güncel borçlar | `auth.uid() = user_id` |
| `card_statements` | Aylık kart ekstre geçmişi ve değişim trendleri | `auth.uid() = user_id` |
| `transactions` | Genel işlem defteri (tüm para hareketleri) | `auth.uid() = user_id` |
| `debts` | Şahsi borçlar ve maaş/hakediş kesin alacakları | `auth.uid() = user_id` |
| `subscriptions` | Tekrarlayan SaaS ve lisans abonelikleri | `auth.uid() = user_id` |
| `projects` | Proje portföyü ve bütçe tavanları | `auth.uid() = user_id` |
| `project_tasks` | Proje görevleri ve epics listesi | `auth.uid() = user_id` |
| `ideas` | Fikir kuluçka havuzu (Inbox, Maybe, Killed) | `auth.uid() = user_id` |
| `statement_imports` | Yüklenen ekstre PDF/CSV dosyalarının üst verisi | `auth.uid() = user_id` |
| `merchant_mappings` | Kullanıcının özel işyeri eşleştirme kuralları | `auth.uid() = user_id` |

---

## 2. İlişki Kısıtlamaları & Bütünlük (Integrity)

1. **Multi-Tenant İzolasyonu:** Her tabloda `user_id uuid references auth.users(id) on delete cascade` bulunur.
2. **Otomatik Profil Tetikleyicisi:** Yeni bir kullanıcı kaydolduğunda (`auth.users` insert), `public.profiles` tablosuna otomatik bir satır eklenir.
3. **Otomatik `updated_at` Tetikleyicisi:** Tüm tablolarda kayıt güncellendiğinde `updated_at` sütunu otomatik olarak `now()` yapılır.
4. **Köprü (Bridge) İlişkileri:**
   - `transactions.project_id ➔ projects.id (on delete set null)`
   - `subscriptions.project_id ➔ projects.id (on delete set null)`
   - `debts.linked_account_id ➔ accounts.id (on delete set null)`

---

## 3. PostgreSQL SQL Tanımları (DDL)

Tam SQL göç dosyası [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql) altında bulunmaktadır.
