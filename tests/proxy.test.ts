import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }))
import { proxy } from '@/proxy'
describe('route protection', () => {
  beforeEach(() => { getUser.mockReset() })
  it.each(['/accounts','/projects/private.name','/login-lookalike'])('protects %s anonymously', async (path) => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await proxy(new NextRequest('http://localhost'+path))).headers.get('location')).toBe('http://localhost/login')
  })
  it('fails closed if auth throws', async () => {
    getUser.mockRejectedValue(new Error('QA auth unavailable'))
    const response = await proxy(new NextRequest('http://localhost/accounts'))
    expect(response.headers.get('location')).toBe('http://localhost/login')
  })
})
