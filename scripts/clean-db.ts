import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://***REDACTED_SUPABASE_HOST***'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '***REDACTED_SERVICE_ROLE_KEY***'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clean() {
  console.log('🧹 Pusula Veritabanı Temizleme Başlatılıyor...')

  // 1. Transactions
  const { error: tErr } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Transactions temizlendi:', tErr ? tErr.message : 'OK')

  // 2. Statement Imports
  const { error: siErr } = await supabase.from('statement_imports').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Statement imports temizlendi:', siErr ? siErr.message : 'OK')

  // 3. Card Statements History
  const { error: csErr } = await supabase.from('card_statements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Card statements temizlendi:', csErr ? csErr.message : 'OK')

  // 4. Subscriptions
  const { error: subErr } = await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Subscriptions temizlendi:', subErr ? subErr.message : 'OK')

  // 5. Credit Cards
  const { error: ccErr } = await supabase.from('credit_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Credit cards temizlendi:', ccErr ? ccErr.message : 'OK')

  // 6. Accounts (Reset to 0)
  const { error: accErr } = await supabase.from('accounts').update({ balance: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Accounts sıfırlandı:', accErr ? accErr.message : 'OK')

  console.log('✨ Tüm geçmiş ekstre ve hareket veritabanı sıfırlandı! Tertemiz bir başlangıç için hazır.')
}

clean()
