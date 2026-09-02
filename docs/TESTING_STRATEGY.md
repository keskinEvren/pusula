# 🧪 Pusula — Test Stratejisi & Kalite Güvencesi (Testing Strategy)

Bu döküman, Pusula projesindeki otomatik test yaklaşımını, test kapsamını ve sürekli entegrasyon (CI) ilkelerini tanımlar.

---

## 1. Test Piramidi & Kapsam Hedefleri

Pusula, finansal hesaplamalar ve banka verisi işlediği için **sıfır hata toleranslı** bir test mimarisine sahiptir:

```
         ┌───────────────┐
         │     E2E /     │  Kritik kullanıcı akışları
         │  Entegrasyon  │  (Ekstre yükleme ➔ Bilanço güncelleme)
         ├───────────────┤
         │  Birim (Unit) │  Saf Finans Motoru & Banka Regex/Parser
         │     Testi     │  (100% matematik ve Türkçe font doğrulaması)
         └───────────────┘
```

---

## 2. Test Katmanları

### A. Saf Finans Motoru Testleri (`tests/finance-engine.test.ts`)
- **Net Varlık Hesaplaması:** Hazır Para + Alacaklar - (Kart Borçları + Diğer Borçlar) formülünün IEEE-754 yuvarlama hatası olmadan kuruşu kuruşuna doğrulanması.
- **Ekstre Dönem Değişimi:** Önceki döneme göre borç artış/azalış tutarı ve yüzde değişimi (▲/▼ trend).
- **Harcama Dağılımı:** Kişisel vs İş vs Finansman vs Hariç ayrıştırması.
- **Proje Gerçek Maliyeti:** Bir projeye bağlı tekil hareketler ile aboneliklerin toplamı.
- **6 Aylık Nakit Yükü & Taksit Projeksiyonu:** Gelecek 6 ayın planlı nakit çıkış projeksiyonu.
- **Kurucu Runway Hesabı:** Mevcut nakit mevcudunun aylık toplam nakit yakma hızına bölünmesi.

### B. Ekstre & Parser Testleri (`tests/parser.test.ts`)
- **Banka Tespiti:** Enpara, Akbank, Ziraat, Garanti formatlarının otomatik tanınması.
- **Türkçe Karakter Restorasyonu:** Font kodlamasından düşen Türkçe harflerin (`OK` ➔ ŞOK, `B M` ➔ BİM, ` deme` ➔ Ödeme vb.) onarılması.
- **Taksit Sütunu Ayrıştırması:** Parantez içindeki ana tutar yerine gerçek dönem taksit tutarının alınması.
- **Başlık Satırlarının Elenmesi:** `Kullanılabilir kart limiti`, `Ekstre borcu` gibi özet satırlarının hareket sanılmaması.

### C. İşyeri Normalizasyon Testleri (`tests/merchant-matcher.test.ts`)
- Süpermarket zincirleri (BİM, A101, ŞOK, File, Migros).
- SaaS ve kurucu araçları (Cursor, OpenAI, Hostinger, AWS, Google Workspace, Canva, Yengeç.co).
- Ödeme geçidi öneklerinin temizlenmesi (`IYZICO/`, `PARAM/`, `PAYTR/`, `ÖDEAL//`).
- Özel kullanıcı eşleştirme kurallarının önceliklendirilmesi (`merchant_mappings`).

---

## 3. Test Komutları

```bash
# Tüm testleri çalıştırma
npm run test

# İzleme modunda (watch mode) test çalıştırma
npx vitest

# Test kapsam (coverage) raporu alma
npx vitest --coverage
```
