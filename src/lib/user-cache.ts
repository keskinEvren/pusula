const OWNER_KEY = 'pusula_cache_owner'

/** Discard unowned/other-user caches before using them under a new session. */
export function isolateUserCache(storage: Storage, userId: string | null) {
  const owner = storage.getItem(OWNER_KEY)
  if (owner === userId && userId) return
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
  for (const key of keys) {
    if (key && (key.startsWith('pusula_') || key.startsWith('pusula:'))) storage.removeItem(key)
  }
  if (userId) storage.setItem(OWNER_KEY, userId)
}
