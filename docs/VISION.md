# 🧭 Pusula — Vizyon ve Zihinsel Model

> **"Karmaşık otomatik köprüler değil; öngörülebilir, modüler ve tam kontrol sunan kişisel yaşam ve finans işletim sistemi."**

---

## 1. Problem: Solo Kurucunun ve Bağımsız Geliştiricinin Bilgi Dağınıklığı

Tek başına veya mikro ölçekte çalışan geliştiriciler ve üreticiler günlük hayatta üç temel katmanı aynı anda yönetmeye çalışır:

1. **Kişisel Finans & Nakit Dengesi:**
   - Vadesiz hesaplar, nakit kasalar ve günlük/aylık getiri sağlayan birikim hesapları ("Damla" getiri motoru).
   - Kredi kartları, ekstre kesim tarihleri, asgari ödemeler, dönemsel borç değişim trendleri (▲/▼).
   - Şahsi/kurumsal borçlar, taksitli geri ödeme planları (`debt_installments`) ve kesin alacaklar.
   - Beyan edilen düzenli ve tek seferlik gelirler (`incomes`) ile abonelik yükleri (`subscriptions`).
   - *"Bu ayki net gelirim, sabit taahhütlerimi (abonelik + taksit) ve değişken harcamalarımı karşıladıktan sonra ne kadar serbest bütçe bırakıyor?"* sorusu.

2. **Proje Portföyü & Odak Yönetimi:**
   - Onlarca fikir (`ideas`) arasından gerçekten hayata geçirileceklerin seçilmesi.
   - Aynı anda çok fazla projeye başlayıp hiçbirini bitirememe sendromuna karşı **Çalışma Masası Kapasite Sınırı (Focus Gate: Maksimum 2 Aktif Proje)**.
   - Projelerin karmaşık muhasebe kalemlerine boğulmadan kendi teknik şartnamesi (Markdown Spec), çalışma bağlantıları (Repo/Canlı URL) ve ajanda odak seanslarıyla yürütülmesi.

3. **Kişisel Yaşam, Disiplin ve Yapay Zekâ Bağlamı:**
   - Günlük ajanda & Pomodoro odak seansları (`agenda_items`), alışkanlık/rutin zincirleri (`routines`), seyir defteri (`journal_entries`), hayaller (`dreams`) ve istemci taraflı şifrelenmiş parola kasası (`credentials`).
   - Tüm bu verilerin yapay zekâ asistanlarına (LLM) tek tıkla aktarılabilecek yapılandırılmış bir **`life.md` (AI Bağlam Dokümanı)** çıktısına dönüştürülmesi.

---

## 2. Mimari Evrim: Neden "Bağımsız ve Kontrollü Modüller" (Decoupled Architecture)?

Pusula'nın ilk tasarım aşamasında *"Sıfır İzolasyon (Zero Silos)"* yaklaşımıyla her işlemin otomatik olarak banka bakiyesini, kredi kartı borcunu, proje maliyetini ve alacak kayıtlarını zincirleme değiştirdiği sıkı bağlı (tightly-coupled) bir köprü kurgulanmıştı.

Ancak gerçek kullanım deneyimi gösterdi ki:
- Otomatik yan etkiler (bir hareket veya borç kaydının arka planda başka bir hesabın bakiyesini değiştirmesi) zamanla **kontrol edilemez bakiye sapmalarına** ve takip karmaşasına yol açmaktadır.
- Kullanıcının her modülü kendi gerçekliğiyle, **şeffaf ve manuel kontrol** altında yönetmesi çok daha güvenilir ve öngörülebilirdir.

Bu doğrultuda Pusula'nın güncel vizyonu **Bağımsız, İzole ve Manuel Kontrollü Modüller** ilkesine dayanır:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PUSULA BAĞIMSIZ MODÜL EKOSİSTEMİ                     │
├───────────────────────────┬─────────────────────────┬───────────────────────┤
│   FİNANS & VARLIK         │   ÜRETİM & ODAK         │   YAŞAM & GÜVENLİK    │
│                           │                         │                       │
│ • Hesaplar & Birikim      │ • Proje Çalışma Masası  │ • Rutinler & Streak   │
│ • Kredi Kartları & Ekstre │   (Maks. 2 Aktif Odak)  │ • Seyir Defteri       │
│ • Borç / Alacak & Taksit  │ • Markdown Şartname     │ • Hayaller & Vizyon   │
│ • Gelirler & Abonelikler  │ • Fikir Havuzu          │ • Şifreli Kasa (AES)  │
│ • Yatırımlar & Hareketler │ • Ajanda & Zamanlayıcı  │ • AI Bağlamı (life.md)│
└───────────────────────────┴─────────────────────────┴───────────────────────┘
```

---

## 3. Temel Tasarım İlkeleri

1. **Modüler Bağımsızlık (Decoupled Modules):**
   Modüller birbirinin verisini gizli yan etkilerle bozmaz. Hesap bakiyeleri (`accounts`), kredi kartı borçları (`credit_cards`), borç/alacak planları (`debts`) ve projeler (`projects`) kendi sınırları içinde bağımsız olarak güncellenir.

2. **Manuel Kontrol ve Beyan Odaklılık:**
   - Hesap bakiyeleri ve kart borçları kullanıcının doğrudan kontrolündedir; kullanıcı dilediğinde bakiyesini günceller veya sadece özet ekstre (`summary_only`) ya da tam hareket listesi yükleyebilir.
   - Aylık bütçe dengesi, karmaşık "Runway" varsayımları yerine doğrudan **Beyan Edilen Aylık Gelir − Sabit Taahhütler (Abonelik + Bu Ayın Taksitleri) − Değişken Harcamalar** formülüyle şeffaf biçimde hesaplanır.

3. **Kuruş Hassasiyeti ve Çift Sayım Koruması (No Double-Counting):**
   - Tüm finansal hesaplamalar IEEE-754 kayan nokta hatalarını önlemek için kuruş (`integer cents`) tabanlı yürütülür.
   - Kredi kartı borç ödemeleri ve hesaplar arası transferler `Hariç` grubunda tutularak harcama olarak ikinci kez sayılmaz.

4. **Odak Kapasitesi Kapısı (Focus Gate):**
   Üreticinin aynı anda 2'den fazla projede aktif geliştirme/planlama yapmasını engelleyen çalışma masası disiplini korunur.
