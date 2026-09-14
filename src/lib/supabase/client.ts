import { createBrowserClient } from '@supabase/ssr'

const DEFAULT_SUPABASE_URL = 'https://kvyslscyepxvkrcgsvvz.supabase.co'
const DEFAULT_SUPABASE_KEY = 'sb_publishable_yACai0Ao0l9Hp-TD6PlFBg_8nV0veu1'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY

  return createBrowserClient(supabaseUrl, supabaseKey)
}
