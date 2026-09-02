# 🎨 Pusula — Kullanıcı Arayüzü & Deneyim Spesifikasyonu (UI/UX Spec)

Bu döküman, Pusula'nın görsel tasarım dilini, sayfa düzenlerini, bileşen kurallarını ve kullanıcı akışlarını tanımlar.

---

## 1. Tasarım Dili & Renk Paleti (Design System)

Pusula, kurucunun gözünü yormayan, yüksek kontrastlı ve modern bir **Karanlık Tema (Dark Mode)** üzerine inşa edilmiştir.

### Renk Hiyerarşisi:
- **Arka Plan (Background):** `hsl(224, 71%, 4%)` — Derin koyu lacivert/siyah
- **Kartlar / Paneller (Card):** `hsl(224, 71%, 7%)` — İnce açık koyu ton
- **Kenarlıklar (Border):** `hsl(215, 27.9%, 16.9%)` — Zarif nötr sınırlar
- **Ana Vurgu (Primary):** `hsl(217.2, 91.2%, 59.8%)` — Canlı Pusula Mavisi
- **Artış / Olumlu / Trend Düşüşü (Success):** `hsl(142, 76%, 36%)` — Yeşil (Borç azalması, varlık artışı)
- **Azalış / Borç Artışı / Limit Aşımı (Destructive):** `hsl(0, 84%, 60%)` — Kırmızı (Borç artışı, bütçe aşımı)
- **Köprü / Proje Vurgusu (Bridge / Accent):** `hsl(262.1, 83.3%, 57.8%)` — Mor / İndigo

### Tipografi:
- Yazı tipi: **Inter**
- Finansal tutarlar ve tarihler için **Tabular Numbers (`font-mono` veya `tabular-nums`)** kullanılarak sütun hizalaması kusursuzlaştırılmıştır.

---

## 2. Navigasyon & Sayfa Yapısı

```
┌─────────────────┬────────────────────────────────────────────────────────┐
│  🧭 PUSULA      │  [Dashboard Header: Kullanıcı Bilgisi / Çıkış]         │
│                 ├────────────────────────────────────────────────────────┤
│  • Dashboard    │                                                        │
│  • Hareketler   │  [Net Varlık]  [Hazır Para]  [Kart Borcu]  [Alacaklar] │
│  • Ekstre Yükle │  ───────────────────────────────────────────────────── │
│  • Kartlar      │  [Harcama Dağılımı]         [Aktif Projeler & Bütçe]   │
│  • Borç/Alacak  │  (Kişisel/İş/Finansman)     (Kanban & Kapasite Kapısı) │
│  • Abonelikler  │  ───────────────────────────────────────────────────── │
│  • Projeler     │  [Yaklaşan Taksit & Abonelik Nakit Yükü (6 Aylık)]     │
│  • Fikirler     │                                                        │
│  • Ayarlar      │                                                        │
└─────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Temel Ekranlar ve Deneyim Standartları

### 1. 📊 Dashboard (`/`)
- **Tepe Göstergeleri:** Net Varlık, Hazır Para, Kredi Kartı Borçları, Kesin Alacaklar.
- **Kapasite Kapısı Banner'ı:** Aktif geliştirme $\ge 2$ ise sarı/turuncu uyarı kutusu gösterilir.
- **Runway Sayacı:** "Mevcut nakitinizle $X$ ay hayatta kalabilirsiniz".
- **Harcama Dağılımı Çubuğu:** Kişisel (%) vs İş (%) vs Finansman (%).

### 2. 📄 Ekstre Yükleme & Onay Ekranı (`/import`)
- **Sürükle-Bırak Alanı:** PDF, CSV veya XLSX dosyası kabul eder.
- **İstemci Taraflı Hızlı Ayrıştırma:** Dosya seçildiği anda 1 saniyede satırları çözer.
- **İnteraktif İnceleme Tablosu (Review Table):**
  - Tarih, Ham Açıklama, Normalize İşyeri, Analiz Grubu, Bağlı Proje ve Tutar.
  - Kart ödemeleri otomatik `Hariç` gelir ve seçili olmaz.
  - Kullanıcı tek tıkla işyeri adını veya bağlı projeyi satır satır değiştirebilir.
- **Tek Tıkla Senkronizasyon Butonu:** "Onayla ve $N$ Hareketi Supabase'e Aktar".

### 3. 💳 Kredi Kartları (`/cards`)
- **Kart Görünümü:** Her kartın limiti, güncel borcu, asgari ödemesi, son ödeme tarihi.
- **Ekstre Geçmişi Tablosu:** Dönem borcu, önceki dönem borcu, ▲ Kırmızı (borç artışı) veya ▼ Yeşil (borç azalışı) trendi ve % değişim oranı.

### 4. 🚀 Proje Portföyü (`/projects`) & Proje Detayı (`/projects/[slug]`)
- **Kanban Görünümü:** `Fikir` ➔ `Planlama` ➔ `Geliştirmede` ➔ `Canlı` ➔ `Arşiv`.
- **Proje Detay:**
  - Epics & Görev Kontrol Listesi.
  - **Bütçe İlerleme Çubuğu:** Harcanan tutar / Bütçe tavanı (`budget_limit`).
  - **Gerçek Maliyet Kalemleri:** O projeye etiketlenmiş tüm tekil harcamaların ve bağlı SaaS aboneliklerinin dökümü.
