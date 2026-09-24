# 🗺️ Pusula — Geliştirme Yol Haritası (Roadmap)

---

## 🎯 Tamamlanan Aşamalar (v1.0.0 — v2.1.0)

### Aşama 1 — Çekirdek Mimari & Veri Modeli
- [x] Temel mimari dökümanların (`VISION.md`, `DOMAIN_MODEL.md`, `SYSTEM_DYNAMICS.md`, `SPEC_PARSER.md`) hazırlanması.
- [x] Supabase PostgreSQL şemasının oluşturulması (tablolar, RLS politikaları, tetikleyiciler, RPC fonksiyonları).
- [x] Kuruş hassasiyetli finans hesaplama motoru (`finance-engine.ts`) ve birim test süitinin kurulması.
- [x] Supabase Auth ve oturum koruma katmanı (`proxy.ts`).

### Aşama 2 — Ekstre Ayrıştırma & Reaktif Veri Akışı
- [x] İstemci taraflı PDF metin çıkarma ve X-koordinat sütun sıralaması (`pdfjs-dist`).
- [x] Türkçe karakter ve glif onarım motoru (`turkish-cleaner.ts`).
- [x] Banka format tespiti (Enpara, Akbank, Ziraat, Garanti) ve satır ayrıştırıcı.
- [x] İşyeri normalizasyon kuralları ve kullanıcı eşleştirme desteği (`merchant_mappings`).
- [x] Kullanıcı onay ekranı ve geri alma (rollback) destekli içe aktarım servisi.

### Aşama 3 — Finansal Takip & Nakit Yükü
- [x] Kredi kartları görünümü ve ekstre geçmişi tablosu (dönemsel değişim trendi).
- [x] Borç & Kesin Alacak yönetimi (tek tıkla tahsilat ve bakiye senkronizasyonu).
- [x] Abonelikler ve 6 aylık planlı nakit yükü matrisi.
- [x] Vadesiz banka ve nakit hesap bakiyeleri yönetimi.

### Aşama 4 — Proje Portföyü & Finans Köprüsü
- [x] Projeler Kanban Panosu (Fikir ➔ Planlama ➔ Geliştirmede ➔ Canlı ➔ Arşiv).
- [x] Kapasite uyarısı (aynı anda odaklanılan aktif proje limiti).
- [x] Proje detay çalışma alanı, şartname önizleme ve notlar.
- [x] Proje Gerçek Maliyeti: Projeye bağlanan hareketlerin ve aboneliklerin otomatik maliyet köprüsü.
- [x] Fikir kuluçka havuzu ve tek tıkla projeye dönüştürme.

### Aşama 5 — Bütünleşik Yaşam & Güvenlik Modülleri
- [x] Ajanda & Günlük Odak Masası (pomodoro zamanlayıcı, taşınabilir görevler).
- [x] Rutinler & Alışkanlıklar (3 seviyeli tamamlama skoru, streak zinciri, mola/dondurma).
- [x] Kaptanın Seyir Defteri (Jurnal) (markdown destekli günlük kayıtlar).
- [x] Hayaller & Vizyon panosu.
- [x] Hibrit Yatırımlar portföy takibi.
- [x] Kasa (Credentials Vault): PBKDF2 + AES-GCM 256-bit istemci taraflı şifrelenmiş kimlik kasası.
- [x] Keyset pagination ile yüksek hacimli işlem defteri optimizasyonu.

---

## 🔮 Gelecek Yol Haritası & Planlanan İyileştirmeler

### Aşama 6 — İleri Entegrasyonlar & Analitik
- [ ] Açık bankacılık / hesap ekstresi entegrasyonu (izinli API köprüsü).
- [ ] Çoklu para birimi desteği (USD / EUR / GBP çapraz kur takibi).
- [ ] Dönemsel bütçe hedefleri ve harcama kategorisi sapma alarmları.
- [ ] Veri dışa aktarım seçenekleri (detaylı Excel / CSV ve şifreli yerel yedekleme).
