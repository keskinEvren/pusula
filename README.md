# 🧭 Pusula — Solo Kurucu Komuta Merkezi

> Kişisel finans ve proje yönetiminin tek bir ekranda buluştuğu, paranın nereden gelip nereye gittiğini ve projelerin bu denklemi nasıl etkilediğini gösteren bütünleşik solo kurucu işletim sistemi.

---

## 📚 Mimari & Tasarım Dökümanları

Projenin tüm vizyon, veri modeli ve sistem dinamikleri `docs/` klasöründe detaylandırılmıştır:

1. 🎯 [**Vizyon & Zihinsel Model** (`docs/VISION.md`)](docs/VISION.md) — Solo kurucunun finansal & operasyonel kaosu ve Pusula'nın çözüm felsefesi.
2. 🏛️ [**Domain Modeli & Varlık İlişkileri** (`docs/DOMAIN_MODEL.md`)](docs/DOMAIN_MODEL.md) — Veritabanı varlıkları, ilişkiler ve türetilen metrikler.
3. ⚡ [**Sistem Dinamikleri & Olay Akışları** (`docs/SYSTEM_DYNAMICS.md`)](docs/SYSTEM_DYNAMICS.md) — Bir olay gerçekleştiğinde sistemin nasıl zincirleme tepki verdiği.
4. 📄 [**Ekstre Ayrıştırma Spesifikasyonu** (`docs/SPEC_PARSER.md`)](docs/SPEC_PARSER.md) — PDF/CSV parser, font onarım motoru ve onay ekranı kuralları.
5. 🗺️ [**Geliştirme Yol Haritası** (`docs/ROADMAP.md`)](docs/ROADMAP.md) — Aşama aşama geliştirme planı.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Backend / Veritabanı:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Ekstre İşleme:** `pdfjs-dist` (Client-side PDF metin çıkarma), `xlsx`
- **Test:** Vitest (Saf Finans Motoru & Parser testleri)
