# 🗺️ Pusula — Geliştirme Yol Haritası (Roadmap)

---

## 🎯 Tamamlanan Aşamalar (v1.0.0 — v2.4.0)

### Aşama 1 — Çekirdek Mimari & Veri Modeli
- [x] Temel mimari dökümanların (`VISION.md`, `DOMAIN_MODEL.md`, `SYSTEM_DYNAMICS.md`, `SPEC_PARSER.md`) hazırlanması.
- [x] Supabase PostgreSQL şemasının oluşturulması (tablolar, RLS politikaları, tetikleyiciler, atomik RPC fonksiyonları).
- [x] Kuruş hassasiyetli finans hesaplama motoru (`finance-engine.ts`) ve birim test süitinin kurulması.
- [x] Supabase Auth, oturum koruma katmanı (`proxy.ts`) ve kullanıcı bazlı yerel önbellek izolasyonu (`user-cache-isolation.ts`).

### Aşama 2 — Ekstre Ayrıştırma & Atomik İçe Aktarım
- [x] İstemci taraflı PDF metin çıkarma ve X-koordinat sütun sıralaması (`pdfjs-dist`).
- [x] Türkçe karakter ve glif onarım motoru (`turkish-cleaner.ts`).
- [x] Banka format tespiti (Enpara, Akbank, Ziraat, Garanti) ve satır ayrıştırıcı.
- [x] İşyeri normalizasyon kuralları ve kullanıcı eşleştirme desteği (`merchant_mappings`).
- [x] Tam hareket veya sadece ekstre özeti (`summary_only`) yükleme ve atomik geri alma (rollback) servisi.

### Aşama 3 — Bağımsız Finansal Modüller & Bütçe Dengesi
- [x] Kredi kartları görünümü, manuel borç/ekstre kontrolü ve ekstre geçmişi değişim trendi (▲/▼).
- [x] Borç & Alacak yönetimi ve vadeli **Taksit Planlayıcı (`debt_installments`)** (aynı gün taksit birleştirme destekli).
- [x] **Gelirler (`incomes`)** modülü: Düzenli ve tek seferlik gelir beyanı, döviz kuru dönüşümü ve aylık bütçe dengesi.
- [x] Abonelikler ve 6 aylık planlı nakit yükü matrisi (çift sayım korumalı).
- [x] Vadesiz banka, nakit kasa ve **Birikim ("Damla" Günlük Getiri Motoru - `savings-engine.ts`)** hesapları yönetimi.

### Aşama 4 — Yalın Proje Çalışma Masası & Odak Kapasitesi
- [x] Projeler ve Fikir Havuzu çalışma alanı (`Fikir`, `Planlama`, `Geliştirmede`, `Canlı`, `Arşiv`).
- [x] Kapasite uyarısı (aynı anda odaklanılan maksimum 2 aktif proje sınırı).
- [x] Projelerin finansal muhasebeden ayrıştırılarak (Decoupled Projects) doğrudan Markdown şartname (`spec_markdown`), repo/canlı bağlantılar ve ajanda odak seanslarıyla yönetilmesi.

### Aşama 5 — Bütünleşik Yaşam, Güvenlik & AI Bağlamı
- [x] Ajanda & Günlük Odak Masası (Pomodoro/kronometre zamanlayıcı, proje odak bağlantısı, taşınabilir görevler).
- [x] Rutinler & Alışkanlıklar (3 seviyeli tamamlama skoru, streak zinciri, mola/dondurma).
- [x] Kaptanın Seyir Defteri (Jurnal) (XSS korumalı Markdown önizleme ve günlük kayıtlar).
- [x] Hayaller & Vizyon panosu.
- [x] Yatırımlar portföy takibi ve canlı kur/fiyat önbelleği (`/api/market-prices`).
- [x] Kasa (Credentials Vault): `PBKDF2 + AES-GCM 256-bit` istemci taraflı şifrelenmiş kimlik kasası.
- [x] **AI Bağlam Motoru (`life.md`):** Tüm yaşam, finans ve proje verilerini LLM asistanları için tek tıkla yapılandırılmış Markdown dokümanına dönüştürme.

---

## 🔮 Gelecek Yol Haritası & Planlanan İyileştirmeler

### Aşama 6 — İleri Analitik & Kişisel Karar Desteği
- [ ] Haftalık değerlendirme ve kişisel retrospektif özeti ekranı.
- [ ] Dönemsel bütçe hedefleri ve kategori bazlı sapma bildirimleri.
- [ ] Portfolyo sunumu için anonimleştirilmiş demo/örnek veri modu.
