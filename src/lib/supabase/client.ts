import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://***REDACTED_SUPABASE_HOST***'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '***REDACTED_ANON_KEY***'

  return createBrowserClient(supabaseUrl, supabaseKey)
}
