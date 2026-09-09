import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kvyslscyepxvkrcgsvvz.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_vPvXHuM3z_PHFOTDPz_RxA_75tKKrUE'
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const USER_ID = 'c74d8741-b8fb-4f79-83eb-f2fa9e12073f' // evrenkeskin0998@gmail.com
const GITHUB_TOKEN = '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'

async function fetchGitHubReadme(repoName: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/keskinEvren/${repoName}/readme`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
    if (!res.ok) return ''
    const data = (await res.json()) as { content?: string }
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf8')
    }
  } catch (e) {
    console.error(`Error fetching readme for ${repoName}:`, e)
  }
  return ''
}

async function fetchGitHubFile(repoName: string, filePath: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/keskinEvren/${repoName}/contents/${filePath}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    })
    if (!res.ok) return ''
    const data = (await res.json()) as { content?: string }
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf8')
    }
  } catch (e) {
    console.error(`Error fetching ${filePath} for ${repoName}:`, e)
  }
  return ''
}

async function run() {
  console.log('🚀 Ek GitHub projeleri Pusula veritabanına aktarılıyor...\n')

  // 1. Purchase Watch
  const pwReadme = await fetchGitHubReadme('purchase-watch')
  
  // 2. Hızır Saha
  const hsReadme = await fetchGitHubReadme('hizir-saha')
  const hsFaz2 = await fetchGitHubFile('hizir-saha', 'docs/faz2-kabul-kontrol-listesi.md')
  const hsDescription = `${hsReadme}\n\n---\n# 📱 Faz 2 Kabul Kontrol Listesi\n\n${hsFaz2}`

  // 3. CareerAttack (Local)
  let caDescription = ''
  const caReadmePath = '/Users/evren/Documents/GitHub/careerattack/README.md'
  const caVisionPath = '/Users/evren/Documents/GitHub/careerattack/PROJE_VIZYONU.md'
  if (fs.existsSync(caReadmePath)) {
    caDescription += fs.readFileSync(caReadmePath, 'utf8')
  }
  if (fs.existsSync(caVisionPath)) {
    caDescription += `\n\n---\n# 🎯 Proje Vizyonu\n\n${fs.readFileSync(caVisionPath, 'utf8')}`
  }

  // 4. Sarıoğlu
  const sariogluReadme = await fetchGitHubReadme('sarioglu')
  const sariogluSpec = await fetchGitHubFile('sarioglu', 'sarioglu-web-projesi.md')
  const sariogluDescription = `${sariogluSpec || sariogluReadme}`

  const projects = [
    {
      name: 'Atom Purchase Watch',
      slug: 'purchase-watch',
      status: 'Geliştirmede' as const,
      repo_url: 'https://github.com/keskinEvren/purchase-watch',
      live_url: null,
      budget_limit: 20000,
      description: pwReadme,
      tasks: [
        { title: 'SQLite WAL ve contention-safe depolama katmanı', category: 'Epics' as const, status: 'Tamamlandı' as const },
        { title: 'Pazaryeri hafif HTTP tarama ve minimum bayt filtre motoru', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Fastify 5.6 backend ve REST uç noktaları', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'React 18 + Vite 6 satın alma karar konsolu UI', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: '708 test suite ve veri bütünlüğü kontrolleri', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Canlı PDP doğrulama ve kâr şelalesi hesaplayıcı', category: 'Görev' as const, status: 'Sürüyor' as const },
        { title: 'Fırsat izleme ve otomatik bildirim/alarm mekanizması', category: 'Görev' as const, status: 'Yapılacak' as const },
      ]
    },
    {
      name: 'Hızır Saha (Saha Takip)',
      slug: 'hizir-saha',
      status: 'Geliştirmede' as const,
      repo_url: 'https://github.com/keskinEvren/hizir-saha',
      live_url: null,
      budget_limit: 25000,
      description: hsDescription,
      tasks: [
        { title: 'Turborepo monorepo ve shared tip paketi mimarisi', category: 'Epics' as const, status: 'Tamamlandı' as const },
        { title: 'Supabase veritabanı şeması ve çoklu bayi RLS politikaları', category: 'Epics' as const, status: 'Tamamlandı' as const },
        { title: 'E18 migration: visit_integrity veri güvenliği şeması', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: '@saha/mobile: Expo Android saha temsilcisi uygulaması', category: 'Görev' as const, status: 'Sürüyor' as const },
        { title: '100m GPS geofence check-in ve reddedilen denemeler paneli', category: 'Görev' as const, status: 'Sürüyor' as const },
        { title: 'Filigranlı kamera fotoğrafı ve süre takipli check-out akışı', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: '@saha/web: Next.js App Router canlı harita ve yönetici paneli', category: 'Görev' as const, status: 'Sürüyor' as const },
      ]
    },
    {
      name: 'CareerAttack',
      slug: 'careerattack',
      status: 'Geliştirmede' as const,
      repo_url: null,
      live_url: null,
      budget_limit: 5000,
      description: caDescription,
      tasks: [
        { title: 'ATS altyapıları (Greenhouse, Lever) açık form tarama motoru', category: 'Epics' as const, status: 'Tamamlandı' as const },
        { title: 'Akıllı CV profilleme ve Gemini AI pozisyon eşleştirici', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'İki aşamalı soru çözücü (config/questions.json + AI fallback)', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Manifest V3 Chrome Extension form doldurma uzantısı', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Playwright ile headful/headless otonom başvuru motoru', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'CAPTCHA algılama ve manuel onay arayüzü', category: 'Görev' as const, status: 'Sürüyor' as const },
      ]
    },
    {
      name: 'Sarıoğlu Emlak & İzolasyon',
      slug: 'sarioglu',
      status: 'Planlama' as const,
      repo_url: 'https://github.com/keskinEvren/sarioglu',
      live_url: null,
      budget_limit: 10000,
      description: sariogluDescription,
      tasks: [
        { title: 'Çift odaklı (Dual-Core) mimari ve yönlendirme merkezi tasarımı', category: 'Epics' as const, status: 'Tamamlandı' as const },
        { title: 'Gayrimenkul portföy filtreleme ve ilan listesi modülü', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'İzolasyon ve çelik çatı teklif alma formu / WhatsApp lead funnel', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'Sanity Studio CMS entegrasyonu ve Netlify dağıtımı', category: 'Görev' as const, status: 'Yapılacak' as const },
      ]
    }
  ]

  for (const proj of projects) {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('slug', proj.slug)
      .maybeSingle()

    let projectId: string

    if (existing) {
      console.log(`🔄 Güncelleniyor: ${proj.name} (${proj.slug})`)
      const { data: updated, error } = await supabase
        .from('projects')
        .update({
          name: proj.name,
          description: proj.description.trim() || null,
          status: proj.status,
          repo_url: proj.repo_url,
          live_url: proj.live_url,
          budget_limit: proj.budget_limit,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (error) {
        console.error(`❌ Hata (${proj.slug}):`, error.message)
        continue
      }
      projectId = updated.id
    } else {
      console.log(`➕ Ekleniyor: ${proj.name} (${proj.slug})`)
      const { data: inserted, error } = await supabase
        .from('projects')
        .insert({
          user_id: USER_ID,
          name: proj.name,
          slug: proj.slug,
          description: proj.description.trim() || null,
          status: proj.status,
          repo_url: proj.repo_url,
          live_url: proj.live_url,
          budget_limit: proj.budget_limit
        })
        .select('id')
        .single()

      if (error) {
        console.error(`❌ Hata (${proj.slug}):`, error.message)
        continue
      }
      projectId = inserted.id
    }

    // Görevler
    if (proj.tasks && proj.tasks.length > 0) {
      await supabase.from('project_tasks').delete().eq('project_id', projectId)

      const tasksToInsert = proj.tasks.map((t, idx) => ({
        project_id: projectId,
        user_id: USER_ID,
        title: t.title,
        category: t.category,
        status: t.status,
        sort_order: idx + 1
      }))

      const { error: taskError } = await supabase.from('project_tasks').insert(tasksToInsert)
      if (taskError) {
        console.error(`❌ Görev hatası (${proj.name}):`, taskError.message)
      } else {
        console.log(`   ✅ ${tasksToInsert.length} görev eklendi.`)
      }
    }
  }

  console.log('\n✨ Tüm ek projeler ve görevler başarıyla eklendi!')
}

run()
