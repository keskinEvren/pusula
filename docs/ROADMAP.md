# 🗺️ Pusula — Geliştirme Yol Haritası (Roadmap)

---

## 🎯 Aşama 1 — Çekirdek Motor & Veritabanı Mimarisi (Foundations)
- [x] Temel mimari dökümanların (`VISION.md`, `DOMAIN_MODEL.md`, `SYSTEM_DYNAMICS.md`, `SPEC_PARSER.md`) hazırlanması.
- [ ] Supabase PostgreSQL şemasının oluşturulması (12 tablo, RLS politikaları, triggerlar, enumlar).
- [ ] Saf Finans Motoru (`finance-engine.ts`) ve Vitest test süitinin kurulması.
- [ ] Supabase Auth (e-posta & şifre) entegrasyonu ve oturum koruması (middleware).

---

## 📄 Aşama 2 — Ekstre Ayrıştırma & Reaktif Veri Akışı (Data Ingestion)
- [ ] İstemci taraflı PDF metin çıkarma ve X-koordinat sütun sıralaması (`pdfjs-dist`).
- [ ] Türkçe karakter onarım motoru (`turkish-cleaner.ts`).
- [ ] Otomatik banka tespiti ve satır regex ayrıştırıcısı.
- [ ] İşyeri normalizasyon sözlüğü ve kullanıcı eşleştirme kuralları (`merchant_mappings`).
- [ ] Kullanıcı Onay Ekranı (`Review & Confirm Screen`):
  - Satır bazında grup, işyeri, bağlı proje düzenleme.
  - Kart ödemelerinin otomatik `Hariç` olarak işaretlenmesi.
  - Toplu onaylama ve Supabase'e tek tıkla senkronizasyon.

---

## 💳 Aşama 3 — Finansal Takip & Zincirleme Etkiler (Finance Hub)
- [ ] Kredi kartları kart görünümü ve ekstre geçmişi tablosu (▲/▼ değişim trendi ve % analizi).
- [ ] Borç & Kesin Alacak yönetimi (Maaş hakedişleri, açık borçlar, tek tıkla tahsilat/kapatma).
- [ ] Abonelikler ve 6 Aylık Planlı Nakit Yükü Matrisi (İptal/Devam kararları).
- [ ] Banka ve nakit hesap bakiyeleri yönetimi.

---

## 🚀 Aşama 4 — Proje Portföyü & Finans Köprüsü (Projects & Bridge)
- [ ] Projeler Kanban Panosu (💡 Fikir ➔ 📐 Planlama ➔ 🚧 Geliştirmede ➔ ✅ Canlı ➔ ⏸️ Arşiv).
- [ ] Kapasite Kapısı Uyarısı (Aktif planlama + geliştirme $\ge 2$ uyarısı).
- [ ] Proje Çalışma Alanı (Görevler / Epics kontrol listesi).
- [ ] **💰 Proje Gerçek Maliyeti:** O projeye bağlanan hareketler ve aboneliklerin otomatik toplamı.
- [ ] **⏳ Kurucu Runway Sayacı:** Mevcut nakit ve harcama hızına göre kaç ay sürdürülebilirlik tahmini.
- [ ] Fikir Havuzu (Inbox, Maybe, Killed, Promoted).

---

## 📊 Aşama 5 — Görselleştirme & Rafine Deneyim (Analytics & Polish)
- [ ] Harcama dağılımı grafiği (Kişisel vs İş vs Finansman).
- [ ] 6 aylık nakit çıkış projeksiyon trend grafiği.
- [ ] Mobil uyumluluk ve karanlık tema (Dark mode) detay cilaları.
