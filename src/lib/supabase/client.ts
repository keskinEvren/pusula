import { createBrowserClient } from '@supabase/ssr'

const DEFAULT_SUPABASE_URL = 'https://***REDACTED_SUPABASE_HOST***'
const DEFAULT_SUPABASE_KEY = '***REDACTED_ANON_KEY***'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY

  return createBrowserClient(supabaseUrl, supabaseKey)
}
