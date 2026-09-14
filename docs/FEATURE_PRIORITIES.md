# Pusula — Feature Öncelikleri ve Kademeli Ürün Yol Haritası

## 1. Bu belgenin amacı

Pusula öncelikle kişisel kullanım için geliştirilen, zaman içinde portfolyoda da gösterilebilecek bir üründür. Bu nedenle hedef, kısa sürede mümkün olan her özelliği eklemek veya ürünü kusursuz hale getirmek değildir.

Doğru yaklaşım:

1. Ürünü gerçek hayatta kullanmaya başlamak.
2. Veri kaybı veya yanlış finansal sonuç doğurabilecek alanları erkenden güvenilir hale getirmek.
3. Günlük kullanımda tekrar eden ihtiyaçları gözlemlemek.
4. Yalnızca gerçek kullanım değeri kanıtlanan özellikleri eklemek.
5. Portfolyo sunumunu, çalışan ürünün doğal sonucu olarak iyileştirmek.

Bu yol haritasında özellikler, en çok önerilenden en düşük önceliğe doğru gruplandırılmıştır. Öncelik; kullanıcı değeri, mevcut modüllerle uyum, uygulama maliyeti ve teknik risk birlikte değerlendirilerek belirlenmiştir.

## 2. Öncelik modeli

| Grup | Anlamı | Uygulama yaklaşımı |
| --- | --- | --- |
| A — Önce sağlamlaştır | Günlük kullanıma güvenmek için gerekli | Kullanımın ilk döneminde ele al |
| B — En çok önerilen | Mevcut modülleri birbirine bağlayan yüksek değerli özellikler | Gerçek kullanım ihtiyacı görüldükçe sırayla ekle |
| C — Güçlü tamamlayıcılar | Ürünü daha kullanışlı ve portfolyoda daha bütünlüklü gösterir | Çekirdek akışlar oturduktan sonra ekle |
| D — İyi olabilir | Belirli kullanım alışkanlıkları oluşursa değer sağlar | İhtiyaç kanıtlanırsa değerlendir |
| E — Şimdilik beklet | Kapsamı ve bakım yükünü ciddi artırır | Açık ihtiyaç oluşmadan geliştirme |

Öncelik grupları kesin teslim tarihleri değildir. Bir alt gruptaki özellik günlük kullanımda açık bir sorunu çözüyor ve düşük risk taşıyorsa daha erken ele alınabilir.

## 3. Mevcut modüller ve önerilen konumları

### Çekirdek finans

| Modül | Karar | Rolü |
| --- | --- | --- |
| Genel Bakış | Kalsın | Finans, proje ve kişisel yaşam özetlerini tek yerde birleştirir |
| Hesaplar | Kalsın | Nakit ve banka hesaplarının güncel durumunu tutar |
| Kredi Kartları | Kalsın | Kart borcu, ekstre ve ödeme tarihlerini takip eder |
| Hareketler | Kalsın; çekirdek kayıt sistemi olsun | Diğer finans ekranlarının beslendiği ana işlem defteridir |
| Ekstre İçe Aktarma | Kalsın; farklılaştırıcı özelliktir | Manuel veri girişini azaltır ve Pusula'nın en güçlü teknik özelliklerinden biridir |
| Ekstre Geçmişi | Kalsın | İçe aktarmaların kaynağını ve geri alınmasını görünür kılar |
| Borç ve Alacaklar | Kalsın | Kişiler ve kurumlarla olan açık finansal yükümlülükleri hareketlerle bağlar |
| Abonelikler | Kalsın | Düzenli giderleri ve proje maliyetlerini görünür kılar |
| Yatırımlar | Kalsın; kapsamı kontrollü tutulsun | Net varlık ve portföy görünümü sağlar; işlem platformuna dönüşmemelidir |

### Proje ve üretim

| Modül | Karar | Rolü |
| --- | --- | --- |
| Projeler | Kalsın | Proje durumu, maliyeti, bütçesi ve görevlerini birleştirir |
| Fikirler | Kalsın | Fikirleri projeye dönüştürmeden önce değerlendirmeyi sağlar |
| Proje görevleri | Kalsın; sade tutulmalı | Finansal ve stratejik proje görünümünü destekler; Jira benzeri ayrı bir ürün olmamalıdır |

### Kişisel yaşam

| Modül | Karar | Rolü |
| --- | --- | --- |
| Hedefler | Kalsın | Uzun vadeli yönü belirler |
| Rutinler | Kalsın | Hedefleri günlük davranışlara bağlar |
| Günlük | Kalsın | Karar, ilerleme ve kişisel bağlamın kaydını tutar |

Bu üç modülün uzun vadeli anlamı aralarındaki bağdır:

```text
Hedef → Proje veya Rutin → Günlük Uygulama → Haftalık Değerlendirme
```

Bu bağ güçlendirilmezse kişisel yaşam modülleri bağımsız uygulamalar gibi görünmeye başlayabilir. Bu nedenle yeni kişisel modül eklemek yerine mevcut üçünü birbirine bağlamak önceliklidir.

### Sistem

| Modül | Karar | Rolü |
| --- | --- | --- |
| Veri ve Yedekleme | Kalsın; önce güvenilir hale getirilmeli | Kullanıcının verisine sahip olmasını ve gerektiğinde geri dönebilmesini sağlar |
| Ayarlar | Kalsın | Para birimi, hesap ve kullanıcı tercihlerinin merkezi olmalıdır |

## 4. Grup A — Önce sağlamlaştır

Bu grup yeni ve gösterişli özelliklerden oluşmaz. Pusula'yı düzenli kullanırken veriye güvenebilmek için gereken temel iyileştirmelerdir.

### A1. Finansal işlem bütünlüğü

**Neden öneriliyor:** Bir ödeme, transfer veya borç tahsilatı birden fazla kaydı etkiler. İşlemin yarıda kalması bakiye ile hareket geçmişini ayırabilir.

**Beklenen davranış:**

- Para hareketi ya tamamen kaydedilir ya da hiçbir etkisi kalmaz.
- Aynı işlem yanlışlıkla iki kez gönderildiğinde çift etki oluşmaz.
- İki işlem aynı anda yapıldığında biri diğerinin bakiye değişikliğini ezmez.
- Kullanıcıya başarı mesajı yalnızca kayıt gerçekten tamamlandığında gösterilir.

**Portfolyo değeri:** Finansal domain'de transaction, concurrency ve idempotency kavramlarını bilinçli yönettiğini gösterir.

### A2. Güvenli import ve rollback

**Neden öneriliyor:** Ekstre içe aktarma Pusula'nın en güçlü özelliğidir; yanlış geri alma veya kısmi kayıt, bu özelliğe güveni doğrudan zedeler.

**Beklenen davranış:**

- Import'un etkilediği hareket, hesap, kart ve borçlar kesin olarak izlenir.
- Başarısız import kısmi veri bırakmaz.
- Rollback yalnızca ilgili import'un etkisini geri alır.
- Daha sonra yapılan doğru işlemler eski rollback tarafından ezilmez.
- Aynı dosyanın tekrar yüklenmesi kontrollü biçimde ele alınır.

### A3. Gerçek yedekleme ve geri yükleme

**Neden öneriliyor:** Kişisel kullanımda uzun süre birikecek finans ve günlük verisinin kaybolmaması, yeni feature eklemekten daha değerlidir.

**Beklenen davranış:**

- Desteklenen tüm modüller yedeğe dahil edilir.
- Yedek doğrulanmadan geri yükleme başlamaz.
- Birleştir ve değiştir seçenekleri söyledikleri davranışı gerçekten uygular.
- Başarısız geri yükleme mevcut veriyi yarım durumda bırakmaz.
- Geri yükleme sonunda kaç kaydın başarıyla işlendiği gerçek sonuçtan hesaplanır.

### A4. Yerel veri ve bulut senkronizasyonunun netleştirilmesi

**Neden öneriliyor:** Yerel kayıt, örnek veri, boş bulut sonucu ve bağlantı hatası birbirine karışmamalıdır.

**Beklenen davranış:**

- Yerel veriler kullanıcı hesabına göre ayrılır.
- Kullanıcı değiştirildiğinde önceki kullanıcının verisi görünmez.
- Bulut kayıt hatası sessizce başarıya dönüşmez.
- Yerel kayıtların senkronize, bekliyor veya hatalı olduğu anlaşılır.
- Buluta gönderilen kimlikler veritabanı şemasıyla uyumludur.

### A5. Temel güvenlik temizliği

**Neden öneriliyor:** Portfolyoya açık bir repository koymadan önce ayrıcalıklı anahtarların, kullanıcı izolasyonunun ve kullanıcı içeriği render etmenin güvenli olması gerekir.

**Beklenen davranış:**

- Repository'de sunucu yetkili anahtar bulunmaz.
- Her kullanıcı yalnızca kendi verisini okuyabilir ve değiştirebilir.
- Markdown önizlemesi zararlı HTML çalıştırmaz.
- Yıkıcı bakım script'leri yanlış ortamda veya yanlışlıkla çalışmaz.

## 5. Grup B — En çok önerilen yeni özellikler

### B1. Finansal Mutabakat Merkezi

**Öneri seviyesi:** En yüksek

Pusula içindeki farklı finans kayıtlarının birbirini doğrulamasını sağlayan bir kontrol ekranıdır.

**Kontrol edebileceği durumlar:**

- Hesap bakiyesi ile hareket etkileri uyuşmuyor.
- Kart borcu ile ekstre ve ödeme hareketleri uyuşmuyor.
- Borcun kalan tutarı ile bağlı ödeme/tahsilat toplamı uyuşmuyor.
- Import tamamlanmış görünüyor fakat beklenen hareket sayısı eksik.
- Bir hareket muhtemelen iki kez kaydedilmiş.
- İlişkisiz veya kaynağı belirsiz hareket var.

**İlk sürüm:** Yalnızca sorunları listeleyen read-only bir kontrol ekranı yeterlidir. Otomatik düzeltme daha sonra eklenebilir.

**Neden güçlü:** Mevcut bütün finans modüllerini birbirine bağlar, gerçek kişisel kullanımda güven verir ve portfolyoda sıradan CRUD uygulamasından daha güçlü bir hikâye oluşturur.

### B2. Haftalık Değerlendirme

**Öneri seviyesi:** Çok yüksek

Finans, proje, hedef, rutin ve günlüğü haftalık karar ekranında birleştirir.

**İçerik:**

- Haftalık gelir, gider ve önemli hareketler
- Bütçe veya nakit sapmaları
- Yaklaşan kart, borç ve abonelik ödemeleri
- Proje ilerlemesi ve maliyet değişimi
- Tamamlanan ve aksayan rutinler
- Günlük notlarından seçilen başlıklar
- Gelecek haftanın riskleri
- Kullanıcının belirlediği en fazla üç odak

**İlk sürüm:** Otomatik oluşturulan özet ve kullanıcının yazdığı kısa değerlendirme yeterlidir. Yapay zekâ entegrasyonu gerekmez.

**Neden güçlü:** Pusula'nın farklı modüllerini tek ürün vizyonunda birleştirir.

### B3. İnceleme Kutusu

**Öneri seviyesi:** Çok yüksek

Kullanıcının karar vermesi gereken kayıtların tek yerde toplandığı bir inbox'tır.

**Örnek öğeler:**

- Düşük güvenli parser sonuçları
- Kategorisiz veya projesiz iş harcamaları
- Abonelik olabilecek tekrar eden ödemeler
- Eşleşmeyen borç veya kart ödemeleri
- Senkronizasyon hataları
- Güncel olmayan yatırım fiyatları
- Yaklaşan ödeme ve yenilemeler

**İlk sürüm:** Filtrelenmiş bir görev listesi ve ilgili kayda yönlendirme yeterlidir.

### B4. Finansal değişiklik geçmişi

**Öneri seviyesi:** Yüksek

Kritik bir finansal kaydın nasıl oluştuğunu ve değiştiğini gösterir.

**Gösterilecek bilgiler:**

- Manuel, import veya otomatik eşleme kaynağı
- Oluşturulma ve değiştirilme zamanı
- Önceki ve yeni değer
- Geri alma durumu
- İlişkili hareket, kart, hesap veya borç

Tam event sourcing gerekmiyor. İlk aşamada yalnızca kritik finansal komutlar için append-only kayıt yeterlidir.

### B5. Hareket kaynağı ve etki görünümü

**Öneri seviyesi:** Yüksek

Her hareket detayında şu sorular cevaplanır:

- Bu kayıt nereden geldi?
- Hangi import'a ait?
- Hangi hesabı veya kartı etkiledi?
- Bir borç, abonelik, yatırım veya projeyle ilişkili mi?
- Silinirse veya bağlantısı kaldırılırsa ne değişecek?

Bu özellik hem hata ayıklamayı hem de kullanıcı güvenini iyileştirir.

## 6. Grup C — Güçlü tamamlayıcı özellikler

### C1. Hareketleri bölme

Tek banka hareketini birden fazla kategoriye veya projeye ayırır. Market alışverişi, ortak gider veya kişisel/iş harcaması karışımı gibi gerçek durumlarda faydalıdır.

**Ne zaman eklenmeli:** Kullanım sırasında tek hareketin düzenli olarak birden fazla amaca hizmet ettiği görülürse.

### C2. Toplu hareket düzenleme

Birden fazla harekete kategori, proje veya merchant atamayı sağlar.

**Ne zaman eklenmeli:** Import sonrası aynı düzeltmeler tekrar tekrar yapılıyorsa.

### C3. Abonelik eşleme ve ödeme takibi

Gerçek hareketleri aboneliklerle bağlar.

**Özellikler:**

- Sonraki ödeme tarihi
- Beklenen ödeme gerçekleşmedi uyarısı
- Fiyat değişikliği geçmişi
- Aylık/yıllık normalize maliyet
- Projeye bağlı SaaS maliyeti
- İptal edilecekler listesi

Yeni bir fatura modülü açmadan önce mevcut abonelik modülü genişletilmelidir.

### C4. Borç ve alacak zaman çizelgesi

Bir borcun veya alacağın tüm ödeme/tahsilat geçmişini, kalan tutarını ve vadesini tek ekranda gösterir.

**Özellikler:**

- Kısmi ödeme geçmişi
- Vade tarihi
- Beklenen ödeme planı
- İlgili işlemlere geçiş
- Kalan tutar mutabakatı

### C5. Proje finans görünümü

Projelerin yalnızca görev durumunu değil, ekonomik etkisini de gösterir.

**Özellikler:**

- Gelir ve gider ayrımı
- Toplam maliyet ve aylık burn rate
- Projeye bağlı abonelikler
- Bütçe geçmişi
- Basit kârlılık görünümü
- Proje karar günlüğü veya retrospektif

Görev sistemini büyütmek yerine Pusula'nın finans ve proje arasındaki köprüsü güçlendirilmelidir.

### C6. Uygulama içi bildirim ve yaklaşanlar merkezi

**Örnek bildirimler:**

- Kart son ödeme tarihi
- Borç/alacak vadesi
- Abonelik yenilemesi
- Proje bütçe eşiği
- Bekleyen import incelemesi
- Güncel olmayan yatırım fiyatı

İlk sürümde uygulama içi liste yeterlidir. E-posta, push ve karmaşık zamanlayıcı altyapısı zorunlu değildir.

### C7. Hedef–proje–rutin bağlantısı

Hedeflerin yalnızca bir liste olmamasını sağlar.

**Özellikler:**

- Hedefe bağlı projeler ve rutinler
- Son 30 günlük ilerleme
- Hedefe katkı sağlayan tamamlanmış işler
- Rutin aksadığında hedef bağlamını gösterme
- Hedef tamamlandığında kısa retrospektif

## 7. Grup D — Kullanım ihtiyacı oluşursa değerlendir

### D1. Gelişmiş yatırım görünümü

- Alım/satım geçmişi
- Gerçekleşmiş ve gerçekleşmemiş kâr/zarar
- Kur etkisinin ayrı gösterimi
- Maliyet hesaplama yöntemi
- Fiyat kaynağı ve güncellik bilgisi

**Sınır:** Pusula yatırım emri veren veya profesyonel portföy yönetimi yapan bir uygulamaya dönüşmemelidir.

### D2. Parser açıklanabilirliği

- Bir satırın neden belirli kategoriye atandığını gösterme
- Güven skoru
- Banka formatı değiştiğinde hata raporu
- Anonimleştirilmiş parser fixture üretimi

**Ne zaman eklenmeli:** Yeni banka formatları eklenirken düzeltme maliyeti artarsa.

### D3. OCR desteği

Metin katmanı olmayan taranmış PDF'lerden veri çıkarır.

**Ne zaman eklenmeli:** Gerçek kullanımda düzenli olarak taranmış ekstrelerle karşılaşılırsa. Yalnızca dependency mevcut olduğu için geliştirilmemelidir.

### D4. Basit bütçe planlama

Kategori veya proje bazında aylık hedefler ve gerçekleşen karşılaştırması sağlar.

**Ne zaman eklenmeli:** Hareket verisi birkaç ay biriktikten ve gerçek bütçe davranışı görüldükten sonra.

### D5. Portfolyo sunum modu

Gerçek kişisel veriyi göstermeden ürünün kabiliyetlerini sergileyen demo veya örnek veri modu.

**Özellikler:**

- Anonim örnek veri
- Kısa ürün turu
- Öne çıkan teknik kararların açıklaması
- Hassas veriyi gizleyen ekran görüntüsü modu

Bu özellik portfolyoya koyma zamanı yaklaştığında değerlidir; günlük kullanım başlamadan önce öncelikli değildir.

## 8. Grup E — Şimdilik beklet

Aşağıdaki özellikler ürün odağını, güvenlik sorumluluğunu veya bakım maliyetini ciddi biçimde artırır:

- Canlı banka/Open Banking bağlantıları
- Uygulama içinden ödeme yapma
- Hisse veya kripto alım-satım emri verme
- Muhasebe, e-fatura, bordro veya ERP kapsamı
- Takım üyeleri, organizasyonlar ve karmaşık rol sistemi
- Tam kapsamlı Jira/Trello benzeri görev yönetimi
- Sosyal ağ veya topluluk özellikleri
- Her alana yayılan yapay zekâ finans danışmanı
- Microservice, event bus, queue veya Kubernetes altyapısı
- Gerçek zamanlı çok kullanıcılı ortak çalışma

Bu özelliklerden biri ancak gerçek bir kullanım problemi, açık güvenlik modeli ve sürdürülebilir bakım isteği oluştuğunda tekrar değerlendirilmelidir.

## 9. Önerilen kademeli kullanım planı

### Dönem 1 — Kullanmaya başla

Amaç, ürünün günlük hayatta nerede sürtünme oluşturduğunu görmek.

- Hesap, kart, hareket ve proje verilerini kullan.
- Birkaç gerçek ekstreyi kontrollü biçimde içe aktar.
- Yedekleri düzenli al; restore güvenilir hale gelene kadar ayrıca doğrulanmış dış kayıt tut.
- Hatalı, tekrarlanan veya gereksiz adımları kısa notlarla kaydet.
- Kullanılmayan modülleri geliştirmek için zaman harcama.

### Dönem 2 — Güven oluştur

Amaç, A grubundaki riskleri kullanımda karşılaşılan sırayla azaltmak.

- Önce işlem bütünlüğü ve başarı/hata doğruluğu.
- Sonra import/rollback.
- Ardından yedekleme ve yerel/bulut senkronizasyonu.
- Portfolyo paylaşımından önce güvenlik temizliği.

### Dönem 3 — Modülleri birbirine bağla

Amaç, Pusula'yı bağımsız CRUD ekranları toplamından karar destek ürününe dönüştürmek.

Önerilen sıra:

1. Finansal Mutabakat Merkezi
2. Haftalık Değerlendirme
3. İnceleme Kutusu
4. Hareket kaynağı ve etki görünümü
5. Finansal değişiklik geçmişi

### Dönem 4 — Gerçek ihtiyaçlara göre derinleştir

Amaç, yalnızca tekrar eden kullanım sorunlarına cevap vermek.

- Çok sayıda manuel düzeltme varsa toplu düzenleme.
- Karışık harcamalar varsa hareket bölme.
- Düzenli ödeme takibi zorlaşıyorsa abonelik eşleme.
- Borç/alacak takibi zorlaşıyorsa zaman çizelgesi.
- Proje kararları finansla yeterince bağlanmıyorsa proje finans görünümü.

### Dönem 5 — Portfolyo sunumunu hazırla

Amaç, kişisel veriyi açmadan çalışan sistemi göstermek.

- Güvenli demo verisi oluştur.
- README'ye ürün problemi, mimari kararlar ve ekran görüntüleri ekle.
- Import, mutabakat ve haftalık değerlendirme üzerinden kısa ürün hikâyesi anlat.
- Güvenlik ve veri bütünlüğü testlerini görünür hale getir.
- Bilinen sınırları dürüstçe dokümante et.

## 10. Yeni feature karar filtresi

Yeni bir özelliğe başlamadan önce şu sorular cevaplanmalıdır:

1. Bu problem gerçek kullanımda en az birkaç kez ortaya çıktı mı?
2. Özellik mevcut bir modülü güçlendiriyor mu, yoksa yeni ve bağımsız bir alan mı açıyor?
3. Aynı fayda daha küçük bir değişiklikle sağlanabilir mi?
4. Yeni veri modeli veya senkronizasyon riski oluşturuyor mu?
5. Bu özelliğin bakımını altı ay sonra da yapmak isteyecek miyim?
6. Portfolyo değeri yalnızca görsel mi, yoksa anlamlı bir mühendislik veya ürün kararını mı gösteriyor?

İlk iki sorudan biri “hayır” ise feature bekletilmelidir. Veri bütünlüğü veya güvenlik riski oluşturuyorsa, uygulamadan önce bu riskin kabul kriteri yazılmalıdır.

## 11. Kısa öncelik özeti

```text
ÖNCE
  Güvenilir para hareketleri
  Güvenli import ve rollback
  Gerçek yedekleme
  Net yerel/bulut senkronizasyonu
  Temel güvenlik

SONRA
  Finansal Mutabakat Merkezi
  Haftalık Değerlendirme
  İnceleme Kutusu
  Hareket kaynağı ve değişiklik geçmişi

İHTİYAÇ OLDUKÇA
  Hareket bölme ve toplu düzenleme
  Abonelik/borç/proje bağlantılarını derinleştirme
  Bildirimler
  Gelişmiş yatırım ve parser özellikleri

ŞİMDİLİK BEKLET
  Banka entegrasyonu, ödeme, trading, ERP, takım sistemi,
  tam görev platformu ve ağır altyapı yatırımları
```

Pusula için en doğru büyüme yolu, modül sayısını hızla artırmak değil; gerçek kullanım sırasında en fazla karar desteği sağlayan bağlantıları kademeli olarak güçlendirmektir.
