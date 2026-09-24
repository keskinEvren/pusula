import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.TARGET_USER_ID || process.env.USER_ID
const PLANNER_PATH = process.env.PLANNER_PATH

if (!supabaseUrl || !supabaseServiceKey || !USER_ID || !PLANNER_PATH) {
  console.error('❌ HATA: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_USER_ID ve PLANNER_PATH ortam değişkenleri tanımlı olmalıdır.')
  process.exit(1)
}

const plannerPath: string = PLANNER_PATH
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function importPlannerData() {
  console.log('🚀 Projects-Planner verilerini Pusula veritabanına aktarma başlatılıyor...\n')

  // --- 1. PROJELER & GÖREVLER ---
  const projectsToImport = [
    {
      name: 'Best Eleven',
      slug: 'best-eleven',
      status: 'Planlama' as const,
      repo_url: null,
      live_url: null,
      budget_limit: 15000,
      descriptionFiles: [
        'pj-best-eleven/README.md',
        'pj-best-eleven/MVP_SCOPE_AND_ROADMAP.md',
        'pj-best-eleven/SESSION_FLOW.md',
        'pj-best-eleven/TECH_STACK.md'
      ],
      tasks: [
        { title: 'E00: Kural Sözleşmesi ve Kabul Örnekleri', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E01: Monorepo ve Hızlı Geri Bildirim Döngüsü', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E02: Sürümlü İçerik, Config ve Deterministik RNG', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E03: Saf Ekonomi ve Transfer Motoru', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E04: Botlar ve Toplu Ekonomi Simülasyonu', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E05: Deterministik Maç Simülasyonu ve Saha Raporu', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E06: Lokal Web Masası ve Tam Session Orchestrator', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E07: Joker Kartları Dikey Dilimi', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E08: Sunucu Otoriteli Realtime Oda', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E09: Reconnect, AFK ve Bot Takeover', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E10: Telemetri ve Playtest Operasyonları', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E11: Kalıcılık, Misafir Hesabı ve Sonuç Kaydı', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E12: Android İstemci ve Paylaşılan UI Sınırı', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E13: Onboarding, Erişilebilirlik ve Akış Cilası', category: 'Epics' as const, status: 'Yapılacak' as const },
        { title: 'E14: Alpha Güvenilirliği, Güvenlik ve Dağıtım', category: 'Epics' as const, status: 'Yapılacak' as const },
      ]
    },
    {
      name: 'CoverCraft',
      slug: 'covercraft',
      status: 'Planlama' as const,
      repo_url: null,
      live_url: null,
      budget_limit: 5000,
      descriptionFiles: [
        'pj-covercraft/README.md',
        'pj-covercraft/PLAN.md'
      ],
      tasks: [
        { title: 'Manifest V3 iskeleti ve content script entegrasyonu', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'İlan sayfası DOM analiz motoru (Greenhouse, Lever, LinkedIn)', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'React Side Panel UI ve ayarlar ekranı', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'Gemini 2.0 Flash Lite API ile cover letter üretim promptu', category: 'Görev' as const, status: 'Yapılacak' as const },
        { title: 'Chrome Web Store dağıtım hazırlığı ve gizlilik politikası', category: 'Görev' as const, status: 'Yapılacak' as const },
      ]
    },
    {
      name: 'WatchPath',
      slug: 'watchpath',
      status: 'Canlı' as const,
      repo_url: 'https://github.com/keskinEvren/watchpath',
      live_url: 'https://www.watchpath.app',
      budget_limit: 10000,
      descriptionFiles: [
        'pj-watchpath/README.md',
        'pj-watchpath/SPEC.md'
      ],
      tasks: [
        { title: 'Next.js App Router & TypeScript altyapısı', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'XYFlow React interaktif zihin haritası & Dagre layout', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'YouTube Data API & Transcript çıkarma servisi', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Gemini AI konu analiz ve yol haritası üretim pipeline', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Supabase roadmap ve search_cache CRUD katmanı', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Vercel prodüksiyon dağıtımı ve SEO iyileştirmeleri', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Kullanıcı geri bildirim ve paylaşılabilir link motoru', category: 'Görev' as const, status: 'Sürüyor' as const },
      ]
    },
    {
      name: 'Apartman Plus (komşu.site)',
      slug: 'apartman-plus',
      status: 'Arşiv' as const,
      repo_url: 'https://github.com/keskinEvren/apartman-plus-resident-ops',
      live_url: null,
      budget_limit: 0,
      descriptionFiles: [
        'archive/pj-apartman-plus/README.md',
        'archive/pj-apartman-plus/MVP_KAPSAM.md'
      ],
      tasks: [
        { title: 'Problem ve ICP analizi tamamlama', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'Prisma şeması ve veri modeli tasarımı', category: 'Görev' as const, status: 'Tamamlandı' as const },
        { title: 'B2B resident portal prototipi', category: 'Görev' as const, status: 'Tamamlandı' as const },
      ]
    },
    {
      name: 'Sherlith',
      slug: 'sherlith',
      status: 'Arşiv' as const,
      repo_url: 'https://github.com/keskinEvren/sherlith',
      live_url: null,
      budget_limit: 0,
      descriptionFiles: [
        'archive/pj-sherlith/README.md'
      ],
      tasks: [
        { title: 'Sherlith marka ve IP ekosistem tasarımı', category: 'Görev' as const, status: 'Tamamlandı' as const }
      ]
    }
  ]

  for (const proj of projectsToImport) {
    let combinedDescription = ''
    for (const file of proj.descriptionFiles) {
      const fullPath = path.join(plannerPath, file)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8')
        combinedDescription += `\n\n# 📄 ${path.basename(file)}\n\n${content}\n\n---\n`
      }
    }

    // Check if project exists by slug
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('slug', proj.slug)
      .maybeSingle()

    let projectId: string

    if (existing) {
      console.log(`🔄 Güncelleniyor: Proje '${proj.name}' (${proj.slug})`)
      const { data: updated, error } = await supabase
        .from('projects')
        .update({
          name: proj.name,
          description: combinedDescription.trim() || null,
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
      console.log(`➕ Ekleniyor: Proje '${proj.name}' (${proj.slug})`)
      const { data: inserted, error } = await supabase
        .from('projects')
        .insert({
          user_id: USER_ID,
          name: proj.name,
          slug: proj.slug,
          description: combinedDescription.trim() || null,
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

    // Insert tasks
    if (proj.tasks && proj.tasks.length > 0) {
      // Remove old tasks to avoid duplication
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

  // --- 2. FİKİRLER ---
  const ideasToImport = [
    {
      file: 'ideas/maybe/is-it-okey-diet.md',
      title: 'Is it Okey Diet',
      status: 'maybe' as const,
      score: 5.0,
      tags: ['diet', 'health', 'micro-saas', 'nutrition']
    },
    {
      file: 'ideas/killed/closet-ai.md',
      title: 'Closet AI + Outfit Color Matching',
      status: 'killed' as const,
      score: 4.0,
      tags: ['fashion', 'wardrobe', 'ai', 'vision']
    },
    {
      file: 'ideas/killed/playlist-splitter.md',
      title: 'YouTube & Spotify Playlist Splitter',
      status: 'killed' as const,
      score: 3.5,
      tags: ['spotify', 'youtube', 'tool', 'music', 'tags']
    },
    {
      file: 'ideas/killed/quiet-map.md',
      title: 'Quiet Map (Sessiz Çalışma Alanı Bulucu)',
      status: 'killed' as const,
      score: 3.5,
      tags: ['map', 'study', 'community', 'crowdsource']
    },
    {
      file: 'ideas/killed/venture-readiness-os.md',
      title: 'Venture Readiness OS',
      status: 'killed' as const,
      score: 3.3,
      tags: ['b2b', 'founder', 'saas', 'business-plan']
    },
    {
      file: 'ideas/killed/zinciri-kirma.md',
      title: 'Zinciri Kırma (Don\'t Break the Chain)',
      status: 'killed' as const,
      score: 4.3,
      tags: ['habits', 'tasks', 'google-tasks', 'productivity']
    }
  ]

  console.log('\n💡 Fikirler aktarılıyor...')
  for (const item of ideasToImport) {
    const fullPath = path.join(plannerPath, item.file)
    let content = ''
    if (fs.existsSync(fullPath)) {
      content = fs.readFileSync(fullPath, 'utf8')
    }

    const { data: existingIdea } = await supabase
      .from('ideas')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('title', item.title)
      .maybeSingle()

    if (existingIdea) {
      console.log(`🔄 Güncelleniyor: Fikir '${item.title}'`)
      await supabase
        .from('ideas')
        .update({
          description: content || null,
          status: item.status,
          score: item.score,
          tags: item.tags,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingIdea.id)
    } else {
      console.log(`➕ Ekleniyor: Fikir '${item.title}'`)
      await supabase
        .from('ideas')
        .insert({
          user_id: USER_ID,
          title: item.title,
          description: content || null,
          status: item.status,
          score: item.score,
          tags: item.tags
        })
    }
  }

  console.log('\n✨ Aktarım tamamlandı!')
}

importPlannerData()
