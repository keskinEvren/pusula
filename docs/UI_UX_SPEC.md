# 🎨 Pusula — Kullanıcı Arayüzü & Deneyim Spesifikasyonu (UI/UX Spec)

Bu döküman, Pusula'nın görsel tasarım dilini, sayfa düzenlerini, bileşen kurallarını ve kullanıcı akışlarını tanımlar.

---

## 1. Tasarım Dili & Renk Paleti (Design System)

Pusula, kullanıcının gözünü yormayan, yüksek kontrastlı ve modern bir **Karanlık Tema (Dark Mode)** üzerine inşa edilmiştir.

### Renk Hiyerarşisi:
- **Arka Plan (Background):** `hsl(224, 71%, 4%)` — Derin koyu lacivert/siyah
- **Kartlar / Paneller (Card):** `hsl(224, 71%, 7%)` — İnce açık koyu ton
- **Kenarlıklar (Border):** `hsl(215, 27.9%, 16.9%)` — Zarif nötr sınırlar
- **Ana Vurgu (Primary):** `hsl(217.2, 91.2%, 59.8%)` — Canlı Pusula Mavisi
- **Artış / Olumlu / Trend Düşüşü (Success):** `hsl(142, 76%, 36%)` — Yeşil (Borç azalması, varlık artışı, birikim damlası)
- **Azalış / Borç Artışı / Limit Aşımı (Destructive):** `hsl(0, 84%, 60%)` — Kırmızı (Borç artışı, geciken taksit)
- **Odak / Üretim Vurgusu (Accent):** `hsl(262.1, 83.3%, 57.8%)` — Mor / İndigo

### Tipografi:
- Yazı tipi: **Inter**
- Finansal tutarlar ve tarihler için **Tabular Numbers (`font-mono` veya `tabular-nums`)** kullanılarak sütun hizalaması kusursuzlaştırılmıştır.

---

## 2. Navigasyon & Sayfa Yapısı

```
┌───────────────────┬────────────────────────────────────────────────────────┐
│  🧭 PUSULA        │  [Header: Bildirimler / AI Bağlamı / Kullanıcı / Çıkış]│
│                   ├────────────────────────────────────────────────────────┤
│  • Kokpit (/)     │                                                        │
│  • Hareketler     │  [Net Varlık]  [Hazır Para]  [Kart Borcu]  [Alacaklar] │
│  • Ekstre Yükle   │  ───────────────────────────────────────────────────── │
│  • Kartlar        │  [Aylık Bütçe & Nakit Dengesi]  [Çalışma Masası Odak]  │
│  • Hesaplar       │  (Gelir - Sabit - Değişken)     (Maks. 2 Aktif Proje)  │
│  • Borç / Alacak  │  ───────────────────────────────────────────────────── │
│  • Gelirler       │  [6 Aylık Planlı Nakit Yükü (Abonelik + Taksitler)]    │
│  • Abonelikler    │                                                        │
│  • Yatırımlar     │                                                        │
│  • Projeler       │                                                        │
│  • Ajanda & Yaşam │                                                        │
│  • AI Bağlamı     │                                                        │
│  • Kasa & Ayarlar │                                                        │
└───────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Temel Ekranlar ve Deneyim Standartları

### 1. 📊 Kokpit (`/`)
- **Tepe Göstergeleri:** Net Varlık, Hazır Para (Vadesiz + Birikim), Kredi Kartı Borçları, Kesin Alacaklar.
- **Aylık Bütçe & Nakit Dengesi:** Beyan edilen aylık gelir (`incomes`), sabit taahhütler (abonelikler + bu ayın borç taksitleri) ve değişken harcama yükünün karşılaştırması.
- **Kapasite Kapısı Banner'ı:** Aktif geliştirme/planlama projesi $\ge 2$ ise odak uyarısı gösterilir.
- **6 Aylık Nakit Yükü:** Gelecek 6 ayın abonelik, kart taksiti ve borç taksit planı projeksiyonu.

### 2. 📄 Ekstre Yükleme & Onay Ekranı (`/import`)
- **Sürükle-Bırak Alanı:** PDF, CSV veya XLSX dosyası kabul eder.
- **İki Farklı İçe Aktarım Modu:** Tam hareket listesi aktarma veya sadece kart dönem özeti (`summary_only`) güncelleme.
- **İnteraktif İnceleme Tablosu:** Kart ödemeleri otomatik `Hariç` gelir; kullanıcı işyeri adını veya analiz grubunu onaylayarak tek tıkla kaydeder.

### 3. 🏦 Hesaplar & Birikim (`/accounts`) ve 💳 Kredi Kartları (`/cards`)
- **Manuel & Bağımsız Kontrol:** Hesap bakiyeleri ve kredi kartı borçları başka modüllerin otomatik yan etkileri olmadan doğrudan güncellenir.
- **Damla Birikim Kartı:** Birikim hesaplarında günlük net getiri hızı, toplam biriken getiri ve ay sonu projeksiyonu canlı gösterilir.
- **Ekstre Geçmişi Tablosu:** Dönem borcu, önceki dönem borcu, ▲ Kırmızı (borç artışı) veya ▼ Yeşil (borç azalışı) trendi.

### 4. 🤝 Borç/Alacak (`/debts`) ve 💵 Gelirler (`/incomes`)
- **Taksitli Borç Planlayıcı:** Çok taksitli borçlarda vade tarihleri, ödenen/bekleyen taksitler ve aynı gün taksit birleştirme görünümü.
- **Gelir Beyanı:** Düzenli ve tek seferlik gelirlerin döviz dönüşümlü aylık net etkisi.

### 5. 🚀 Proje Çalışma Masası (`/projects`) & 🧠 AI Bağlamı (`/ai-context`)
- **Yalın Proje Yönetimi:** Projeler finansal karmaşadan arındırılmış olup durum takibi, Markdown şartname (`spec_markdown`) ve ajanda odak seanslarına odaklanır.
- **AI Bağlamı (`life.md`):** Tek tıkla kopyalanabilir veya indirilebilir tam sistem özeti.
