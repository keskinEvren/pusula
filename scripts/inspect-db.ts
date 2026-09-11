import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ HATA: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam değişkenleri tanımlı olmalıdır.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function inspect() {
  console.log('=== 🧭 PUSULA CANLI VERİTABANI DENETİMİ ===\n')

  // 1. Credit Cards
  const { data: cards } = await supabase.from('credit_cards').select('*')
  console.log('💳 1. KREDİ KARTLARI:', cards)

  // 2. Card Statements
  const { data: statements } = await supabase.from('card_statements').select('*').order('statement_date', { ascending: false })
  console.log('\n📈 2. EKSTRE GEÇMİŞİ (card_statements):', statements)

  // 3. Accounts
  const { data: accounts } = await supabase.from('accounts').select('*')
  console.log('\n🏦 3. HESAPLAR / NAKİT KASA (accounts):', accounts)

  // 4. Subscriptions
  const { data: subs } = await supabase.from('subscriptions').select('*')
  console.log('\n🔄 4. ABONELİKLER (subscriptions):', subs)

  // 5. Transactions Summary
  const { data: txs } = await supabase.from('transactions').select('type, analysis_group, amount, date, description, merchant').order('date', { ascending: false })
  console.log(`\n📖 5. İŞLEM HAREKETLERİ (Toplam: ${txs?.length || 0} satır)`)
  if (txs && txs.length > 0) {
    console.log('Son 5 Hareket:', txs.slice(0, 5))
    const totalAmount = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    console.log('Tüm Hareketlerin Ham Toplamı:', totalAmount)
  }

  // 6. Statement Imports
  const { data: imports } = await supabase.from('statement_imports').select('*')
  console.log('\n📥 6. İTHALAT KAYITLARI (statement_imports):', imports)
}

inspect()
