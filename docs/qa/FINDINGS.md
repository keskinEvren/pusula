# QA bulguları — düzeltme öncesi kayıt

2026-09-16. Üretim verisi kullanılmadı. `SQL` gömülü PostgreSQL/PGlite; `UI` yerel HTTP fixture ile gerçek Chrome; `STATIC` kaynak incelemesi. STATIC bulgular çalıştırılmış PASS değildir.

| ID | Severity | Route / özellik | Tekrarlama / beklenen / gerçekleşen | Hata / kök neden / dosya |
|---|---|---|---|---|
| QA-01 | CRITICAL | Finans transfer RPC | SQL: 1000 bakiyeli hesaptan olmayan veya diğer kullanıcı hesabına 100 transfer et. Beklenen: ret ve 1000. Gerçek: ret ve 900. | `return success:false` önceki UPDATE'i geri almıyor. `008_security_and_financial_integrity.sql`, `fn_record_transfer_atomic`. |
| QA-02 | CRITICAL | Harcama RPC | SQL: geçerli account + geçersiz card ile 100 harcama. Beklenen: değişiklik yok. Gerçek: ret ile birlikte bakiye -100. | Mutasyondan sonra normal RETURN; aynı migration, `fn_record_expense_atomic`. |
| QA-03 | HIGH | /projects/[slug] hızlı gider | UI: transactions POST 500, gider formunu gönder. Beklenen: hata ve form açık. Gerçek: başarı toast, form kapanıyor. | FinancialBridge `success:false` sonucu okunmuyor. `src/app/projects/[slug]/page.tsx`. |
| QA-04 | CRITICAL | Finans istemci fallback | STATIC: RPC hata/timeout sonrası client insert + balance update; update hatası yok sayılıyor. Beklenen: atomik başarı veya hiç yazma. Gerçek: parçalı yazma/yanlış başarı/timeout sonrası çift kayıt mümkün. | `financial-bridge.ts`, `import-service.ts` rollback. |
| QA-05 | HIGH | /journal kaydet/sil | STATIC; UI hata enjeksiyonu eklendi: PATCH/DELETE 500 döndür. Beklenen: hata, başarı yok. Gerçek: local cache güncelleniyor, API error okunmuyor, başarı gösteriliyor. | `handleSaveEntry`, `confirmDeleteEntry`, `src/app/journal/page.tsx`. |
| QA-06 | HIGH | /cards ekstre oluştur | STATIC: card_statements POST başarılı, credit_cards PATCH 500. Beklenen: atomik ekstre+kart güncelleme. Gerçek: ekstre kalıyor, güncel borç değişmiyor, başarı gösteriliyor. | İkinci request sonucu yok sayılıyor; `src/app/cards/page.tsx`. |
| QA-07 | HIGH | /vault export/restore | STATIC: bir tablo SELECT 500; veya replace silmeleri sonrası ilk upsert 500. Beklenen: eksik yedek başarı sayılmamalı, restore atomik olmalı. Gerçek: fetch [] döndürüyor; replace çok istekli, veri kaybına açık; local cache buluttan önce değişiyor. | `fetchAllRows`, `confirmAndExecuteRestore`, `src/app/vault/page.tsx`. |
| QA-08 | HIGH | Auth proxy | STATIC: auth client throw veya /projects/secret.name anonim URL. Beklenen: koruma devam etmeli. Gerçek: catch next() ve pathname.includes('.') bypass. | `src/proxy.ts`. |
| QA-09 | HIGH | Kullanıcı değişimi / yerel önbellek | STATIC: A oturumu sona ersin, aynı tarayıcı B ile giriş yapsın, B routines tablosu boş olsun. Beklenen: A verisi görünmemeli/yüklenmemeli. Gerçek: global localStorage anahtarları B user_id ile otomatik yüklenebilir. Normal logout temizliği var; expiry/account switch kapsamıyor. | `routines/page.tsx`, `journal/page.tsx`, `supabase/client.ts`. |
| QA-10 | MEDIUM | Teknik testler | RUN: npm test Windows. 4 migration testi başarısız. | URL.pathname => C:\\C:\\ yolu; `tests/security-migrations.test.ts`. |
| QA-11 | MEDIUM | /accounts ve diğer liste ekranları | STATIC; UI test eklendi: SELECT 500. Beklenen: yükleme hatası. Gerçek: boş liste veya sıfır finans özeti. | Supabase {error} kullanılmıyor; accounts, dashboard, projects, subscriptions, settings. |
| QA-12 | MEDIUM | /signup | STATIC: email confirmation açık, signUp session null. Beklenen: e-posta doğrulama yönlendirmesi. Gerçek: 1.5 sn sonra protected /, ardından login; doğrulama açıklaması yok. | `src/app/signup/page.tsx`. |
| QA-13 | MEDIUM | /login ölü UI | UI/kaynak: Şifremi unuttum ve GitHub girişi disabled. Eksiklik açıkça yazıyor; çalışır gibi başarı verilmiyor. | Mevcut olmayan entegrasyon; yeni özellik kapsam dışı. |
| QA-14 | MEDIUM | Veri ölçeği | STATIC: dashboard/project maliyeti 1000, accounts/debts/subscriptions 500 hareket ile sınırlandırılıyor; görünür toplamların eksik hesaplanması mümkün. | İlgili load fonksiyonları; server pagination/aggregation yok. |
| QA-15 | MEDIUM | /api/market-prices | STATIC: kısmi Yahoo başarısında eski cache yeni timestamp ile isStale=false dönüyor; bozuk items tipi 500 üretiyor. | `src/app/api/market-prices/route.ts`. |
| QA-16 | LOW | Kurulum dokümanı | README Next 15 diyor; package Next 16. Migration listesi 008'de bitiyor. | `README.md`; yeni kurulumda sonraki tablolar/güvenlik eksik kalabilir. |

Son durum, yeniden test sonuçları ve açık riskler QA_REPORT.md içinde güncellenecektir.
