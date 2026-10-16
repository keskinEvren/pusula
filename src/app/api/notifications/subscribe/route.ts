import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint, keys, userAgent } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Eksik push abonelik parametreleri' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1. Aboneliği upsert et (admin istemcisi sayesinde aynı cihazda farklı kullanıcı oturum açmış olsa bile RLS çakışması yaşanmaz)
    const { error: upsertError } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || null,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: 'endpoint',
      }
    )

    if (upsertError) {
      console.error('Error upserting push subscription:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // 2. Kullanıcının push_enabled tercihini de aktif hale getir
    await admin
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          push_enabled: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Subscribe route error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint parametresi zorunludur' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error: deleteError } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (deleteError) {
      console.error('Error deleting push subscription:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Unsubscribe route error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}
