import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hwcvkumpkjlweqlmbcya.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_b8UJYjGQ0MJ1gN9l5SuTRw_PA4k3aJ9'

  return createBrowserClient(supabaseUrl, supabaseKey)
}
