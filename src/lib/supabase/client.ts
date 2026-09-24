import { createBrowserClient } from '@supabase/ssr'
import { isolateUserCache } from '@/lib/user-cache'

let cacheListenerInstalled = false

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. ' +
      'See .env.example for reference.'
    )
  }

  const client = createBrowserClient(supabaseUrl, supabaseKey)
  if (typeof window !== 'undefined' && !cacheListenerInstalled) {
    cacheListenerInstalled = true
    client.auth.onAuthStateChange((_event, session) => {
      try { isolateUserCache(window.localStorage, session?.user.id || null) } catch { /* Storage may be unavailable. */ }
    })
  }
  return client
}
