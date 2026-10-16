import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { NotificationPreference } from '@/types/database'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    // 1. Kullanıcının tercihlerini çek
    const { data: pref, error: prefError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (prefError) {
      console.error('Error fetching notification preferences:', prefError)
      return NextResponse.json({ error: prefError.message }, { status: 500 })
    }

    let preferences: NotificationPreference

    if (!pref) {
      // Varsayılan kayıt oluştur
      const defaultPref = {
        user_id: user.id,
        email: user.email || null,
        push_enabled: true,
        email_enabled: true,
        morning_enabled: true,
        morning_time: '08:30',
        evening_enabled: true,
        evening_time: '21:30',
        weekly_finance_enabled: true,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('notification_preferences')
        .insert(defaultPref)
        .select()
        .single()

      if (insertError) {
        console.error('Error inserting default notification preferences:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      preferences = inserted
    } else {
      preferences = pref
    }

    // 2. Kayıtlı cihaz sayısını çek
    const { count, error: countError } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (countError) {
      console.error('Error counting push subscriptions:', countError)
    }

    return NextResponse.json({
      preferences,
      deviceCount: count || 0,
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    })
  } catch (err: any) {
    console.error('Preferences GET route error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
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
    const {
      email,
      push_enabled,
      email_enabled,
      morning_enabled,
      evening_enabled,
      weekly_finance_enabled,
      morning_time,
      evening_time,
    } = body

    const updatePayload: Partial<NotificationPreference> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof email !== 'undefined') updatePayload.email = email ? String(email).trim() : null
    if (typeof push_enabled === 'boolean') updatePayload.push_enabled = push_enabled
    if (typeof email_enabled === 'boolean') updatePayload.email_enabled = email_enabled
    if (typeof morning_enabled === 'boolean') updatePayload.morning_enabled = morning_enabled
    if (typeof evening_enabled === 'boolean') updatePayload.evening_enabled = evening_enabled
    if (typeof weekly_finance_enabled === 'boolean') updatePayload.weekly_finance_enabled = weekly_finance_enabled
    if (typeof morning_time === 'string') updatePayload.morning_time = morning_time
    if (typeof evening_time === 'string') updatePayload.evening_time = evening_time

    const { data: updated, error: updateError } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...updatePayload,
      })
      .select()
      .single()

    if (updateError) {
      console.error('Error updating notification preferences:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, preferences: updated })
  } catch (err: any) {
    console.error('Preferences PUT route error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}
