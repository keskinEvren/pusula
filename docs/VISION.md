# 🧭 Pusula — Vizyon ve Zihinsel Model

> **"Kişisel finansını bilmeyen kurucu, projesini yönetemez. Projesinin gerçek maliyetini bilmeyen kurucu, yarınını planlayamaz."**

---

## 1. Problem: Solo Kurucunun Çok Katmanlı Kaosu

Tek başına veya mikro bir ekiple dijital ürünler geliştiren solo kurucular (Indie Hackers) iki ayrı dünyanın baskısı altındadır:

1. **Kişisel Hayat & Finansal Gerçeklik:**
   - Kredi kartları, ekstre kesim tarihleri, asgari ödemeler, faiz/masraf yükleri.
   - Şahsi borçlar (artı para, aile/şahıs borçları) ve kesin alacaklar (maaş hakedişleri, freelance ödemeler).
   - Abonelikler (Cursor, OpenAI, Hosting, eğlence, faturalar).
   - "Bu ay cebimde ne kaldı, ne kadar borcum var, net varlığım nedir?" sorusu.

2. **Proje Portföyü & Üretim Gerçekliği:**
   - Aklına gelen onlarca fikir arasından odaklanılması gerekenler.
   - Kanban üzerinde ilerleyen geliştirme süreçleri, epics ve görevler.
   - Odak dağılması (aynı anda 4 projeye başlayıp hiçbirini bitirememe sendromu).

3. **Kritik Kesişim (The Missing Bridge — Eksik Halka):**
   - Piyasadaki mevcut araçlar (Notion, Trello, Jira) sadece görevleri takip eder; paranın nereden geldiğini bilmez.
   - Finans uygulamaları (Mint, YNAB, Excel bütçeleri) sadece harcamaları listeler; paranın hangi projeyi beslediğini veya tükettiğini bilmez.
   - Kurucu şu 3 temel sorunun cevabını **tek ekranda** göremez:
     - *"Bu projeye bugüne kadar cebimden kuruşu kuruşuna ne kadar harcadım?"*
     - *"Projelerimin aylık nakit yakma hızı (burn rate) kişisel runway'imi kaç ay kısaltıyor?"*
     - *"Maaşım veya hakedişim geldiğinde kart borçlarımı ve proje giderlerimi nasıl kapatacağım?"*

---

## 2. Pusula'nın Zihinsel Modeli (Core Mental Model)

Pusula, izole ekranlar ve bağımsız CRUD listeleri bütünü **değildir**. 
Pusula, kurucunun hayatındaki **tüm finansal ve operasyonel olayların tek bir canlı organizma gibi birbirini tetiklediği reaktif bir sistem dinamiğidir.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PUSULA EKOSİSTEMİ                             │
├───────────────────────────┬─────────────────────────┬───────────────────┤
│    KİŞİSEL FİNANS         │        KÖPRÜ            │   PROJE PORTFÖYÜ  │
│                           │                         │                   │
│  • Hazır Para (Nakit)     │  • Proje Maliyeti       │  • Fikir Havuzu   │
│  • Kredi Kartları         │  • Kurucu Runway'i      │  • Odak Kapasitesi│
│  • Ekstre Trendi (▲▼)     │  • Harcama İlişkilendirme│ • Kanban & Epics │
│  • Borç & Kesin Alacak    │  • 6 Aylık Yük Tahmini  │  • Canlı Durum    │
└───────────────────────────┴─────────────────────────┴───────────────────┘
```

---

## 3. Temel Tasarım İlkeleri

1. **Sıfır İzolasyon (Zero Silos):**
   Hiçbir hareket sadece "bir hareket" değildir. Bir harcama; bir hesabı düşürür, bir kartın ekstre borcunu artırır, potansiyel olarak bir projeye maliyet yazar ve net varlığı anında değiştirir.

2. **Gerçekçi ve Dürüst Metrikler (No Vanity Metrics):**
   - Kategori enflasyonu yoktur (Kişisel, İş, Finansman, Hariç şeklinde 4 net analiz grubu).
   - Borç ödemeleri (tahsilat / transfer) harcama gibi çift sayılmaz (`Hariç`).
   - Taksitli işlemlerde tüm ana tutar değil, o döneme yansıyan gerçek taksit tutarı döneme işlenir.

3. **Odak Kapasitesi Kapısı (Focus Gate):**
   Kurucunun aynı anda 2'den fazla projede aktif planlama/geliştirme yapmasını engelleyen disiplin mekanizması.

4. **Kullanıcı Eforunu Sıfıra Yaklaştırma (Frictionless Ingestion):**
   Banka ekstre PDF'leri tek tıkla yüklenir; sistem bankayı tanır, Türkçe harf hatalarını onarır, işyerlerini normalize eder ve sadece onay bekler.
