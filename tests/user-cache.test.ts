import { describe, expect, it } from 'vitest'
import { isolateUserCache } from '@/lib/user-cache'
function storage() {
  const map = new Map<string,string>()
  return { get length() { return map.size }, key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key,value) },
    removeItem: (key: string) => { map.delete(key) }, clear: () => map.clear() }
}
describe('user cache boundary', () => {
  it('clears private cache on account switch and signout but keeps unrelated storage', () => {
    const s = storage(); s.setItem('unrelated','keep'); isolateUserCache(s,'A')
    s.setItem('pusula_local_routines','private A'); isolateUserCache(s,'A')
    expect(s.getItem('pusula_local_routines')).toBe('private A')
    isolateUserCache(s,'B'); expect(s.getItem('pusula_local_routines')).toBeNull()
    s.setItem('pusula_project_doc_test','private B'); isolateUserCache(s,null)
    expect(s.getItem('pusula_project_doc_test')).toBeNull(); expect(s.getItem('unrelated')).toBe('keep')
  })
  it('does not assign legacy unowned data to a newly signed-in user', () => {
    const s=storage(); s.setItem('pusula_local_journal_entries','unknown owner'); isolateUserCache(s,'B')
    expect(s.getItem('pusula_local_journal_entries')).toBeNull()
  })
})
