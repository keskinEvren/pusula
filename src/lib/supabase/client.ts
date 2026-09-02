import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kvyslscyepxvkrcgsvvz.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_yACai0Ao0l9Hp-TD6PlFBg_8nV0veu1'

  return createBrowserClient(supabaseUrl, supabaseKey)
}
