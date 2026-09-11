import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'test') {
      return createBrowserClient('https://test.supabase.co', 'test-anon-key')
    }
    throw new Error(
      'Eksik Supabase ortam değişkeni: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlanmalıdır. Lütfen .env.local dosyanızı kontrol edin.'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseKey)
}
