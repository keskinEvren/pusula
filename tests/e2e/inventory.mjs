import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]) }
const pages = walk('src/app').filter(f => /(?:page|route)\.tsx?$/.test(f))
const lines = ['# QA uygulama haritası ve test matrisi', '', '2026-09-16. Kaynak envanteri; aşağıdaki planlanan kontrollerin varlığı PASS anlamına gelmez. Çalıştırılmış senaryolar ve sonuçları QA_REPORT.md içindedir.', '', '## Mimari', '', 'Next.js App Router; tarayıcıdan Supabase Auth + PostgREST + PostgreSQL RPC. Ayrı yönetici rolü bulunmadı; kullanıcı sahipliği user_id ve RLS ile sınırlandırılıyor. JWT/cookie doğrulaması src/proxy.ts; PKCE callback /auth/callback. Harici servisler: Supabase, Yahoo Finance, CoinGecko, Google Fonts, hedef görselleri. Kasa: PBKDF2/AES-GCM, yerel önbellek + bulut.', '', '## Ekran / endpoint matrisi', '', '| Route | Veri tabloları | Handler / işlem noktaları | Planlanan kontroller |', '|---|---|---|---|']
for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  const route = '/' + file.replaceAll('\\', '/').replace(/^src\/app\//, '').replace(/\/?(?:page|route)\.tsx?$/, '')
  const tables = [...new Set([...src.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1]))]
  const handlers = [...new Set([...src.matchAll(/(?:function\s+|const\s+)((?:handle|confirm|load|fetch)[A-Z]\w*)/g)].map(m => m[1]))]
  lines.push(`| ${route} | ${tables.join(', ')} | ${handlers.join(', ')} | Doğrudan URL, auth, açılış, boş/verili liste, ilgili create/update/delete, refresh, invalid/boş/uzun girdi, çift tık, API hatası, console/network, 1440/768/390px |`)
}
lines.push('', '## Ortak bileşenler', '', 'AppShell, Sidebar, Header, BottomNav; QuickCaptureSheet; Modal/ConfirmDialog (Escape, focus trap, kapatma, mobil taşma); MarkdownEditor/Preview (dosya, biçimlendirme, kaydetme, XSS); DashboardRoutineStrip; StatementGuideSheet; TimerProvider; ToastProvider.', '', '## PostgreSQL tabloları', '')
for (const file of walk('supabase/migrations')) {
  for (const m of readFileSync(file, 'utf8').matchAll(/create table if not exists public\.(\w+)/gi)) lines.push(`- ${m[1]} — ${file.replaceAll('\\', '/')}`)
}
lines.push('', '## Kalıcılık doğrulama sınırları', '', 'HTTP fixture: aynı süreçte create/update/delete sonrası bağımsız backend state sorgusu ve tarayıcı refresh. Disk/PostgreSQL kalıcılığı veya RLS değildir. Gömülü PostgreSQL testleri ayrı SQL/RLS doğrulamasıdır; dağıtılmış Supabase kurulumu değildir. Gerçek test hesabı/servisi olmadan production Supabase kullanılmaz.', '', '## Ek manuel/entegrasyon kontrol kuyruğu', '', '- Auth: email confirmation, expiry, iki kullanıcı, logout, bozuk cookie, callback error.', '- Finans: harcama/gelir/transfer/kart ödeme/borç ödeme/tahsilat/silme/borç ve yatırım eşleştirme; tutar 0/negatif/NaN/çok büyük; yetkisiz FK; eşzamanlılık.', '- İçe aktarım: PDF/CSV/XLSX, duplicate, boş/bozuk dosya, seçim, kart/hesap eşleştirme, commit, rollback ve kalıcı silme.', '- Kasa: tam/eksik fetch, şifreli export, yanlış parola, merge/replace, ara hata, credential anahtarları, büyük tablo pagination.', '- Kişisel: rutin CRUD/tamamlama/not/sayaç/tarih; günlük CRUD/arama/şablon/pin; hedef CRUD/horizon/başarı; credential oluştur/kilitle/aç/kopyala/parola değiştir.', '- Navigasyon: menü/link/geri/ileri, mobil hızlı kayıt, modal focus ve Escape, tüm filtreler/arama/sıralama.')
mkdirSync('docs/qa', { recursive: true }); writeFileSync('docs/qa/TEST_MATRIX.md', lines.join('\n'))
