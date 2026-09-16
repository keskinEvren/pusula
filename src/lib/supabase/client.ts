import { createBrowserClient } from '@supabase/ssr'
import { isolateUserCache } from '@/lib/user-cache'

const DEFAULT_SUPABASE_URL = 'https://***REDACTED_SUPABASE_HOST***'
const DEFAULT_SUPABASE_KEY = '***REDACTED_ANON_KEY***'
let cacheListenerInstalled = false

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY

  const client = createBrowserClient(supabaseUrl, supabaseKey)
  if (typeof window !== 'undefined' && !cacheListenerInstalled) {
    cacheListenerInstalled = true
    client.auth.onAuthStateChange((_event, session) => {
      try { isolateUserCache(window.localStorage, session?.user.id || null) } catch { /* Storage may be unavailable. */ }
    })
  }
  return client
}
