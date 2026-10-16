import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMorningDigest, buildEveningDigest } from '@/lib/notifications/event-digest-engine'
import { renderMorningEmailHtml, renderEveningEmailHtml } from '@/lib/notifications/email-templates'
import { sendEmail, sendPushToUser } from '@/lib/notifications/dispatcher'

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

    const body = await request.json().catch(() => ({}))
    const mode = body.mode === 'evening' ? 'evening' : 'morning'

    // Kullanıcı bildirim tercihlerini al
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const targetEmail = pref?.email || user.email || null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

    let emailResult = { attempted: false, success: false, error: null as string | null }
    let pushResult = { attempted: false, success: false, sentCount: 0, failedCount: 0, error: null as string | null }

    const adminClient = createAdminClient()

    if (mode === 'morning') {
      // Sabah verilerini çek
      const [
        { data: agendaItems },
        { data: routines },
        { data: routineLogs },
        { data: creditCards },
        { data: subscriptions },
        { data: accounts },
        { data: debts },
        { data: investments },
      ] = await Promise.all([
        supabase.from('agenda_items').select('*').eq('user_id', user.id),
        supabase.from('routines').select('*').eq('user_id', user.id),
        supabase.from('routine_logs').select('*').eq('user_id', user.id),
        supabase.from('credit_cards').select('*').eq('user_id', user.id),
        supabase.from('subscriptions').select('*').eq('user_id', user.id),
        supabase.from('accounts').select('*').eq('user_id', user.id),
        supabase.from('debts').select('*').eq('user_id', user.id),
        supabase.from('investments').select('*').eq('user_id', user.id),
      ])

      const digest = buildMorningDigest(
        {
          agendaItems: agendaItems || [],
          routines: routines || [],
          routineLogs: routineLogs || [],
          creditCards: creditCards || [],
          subscriptions: subscriptions || [],
          accounts: accounts || [],
          debts: debts || [],
          investments: investments || [],
          forceWeeklyFinance: pref?.weekly_finance_enabled ?? true,
          weeklyFinanceEnabled: pref?.weekly_finance_enabled ?? true,
        },
        todayStr
      )

      // 1. E-posta Test Gönderimi
      if (targetEmail) {
        emailResult.attempted = true
        const emailHtml = renderMorningEmailHtml(digest, appUrl)
        const sendRes = await sendEmail({
          to: targetEmail,
          subject: `[TEST] ${digest.pushTitle}`,
          html: emailHtml,
        })
        emailResult.success = sendRes.success
        emailResult.error = sendRes.error || null
      } else {
        emailResult.error = 'Kullanıcıya ait e-posta adresi bulunamadı.'
      }

      // 2. Web Push Test Gönderimi
      pushResult.attempted = true
      const pRes = await sendPushToUser(adminClient, user.id, {
        title: `[TEST] ${digest.pushTitle}`,
        body: digest.pushBody,
        url: '/agenda',
        tag: 'test-morning',
      })
      pushResult.success = pRes.success
      pushResult.sentCount = pRes.sentCount
      pushResult.failedCount = pRes.failedCount
      pushResult.error = pRes.error || null
    } else {
      // Akşam verilerini çek
      const [{ data: agendaItems }, { data: routines }, { data: routineLogs }] = await Promise.all([
        supabase.from('agenda_items').select('*').eq('user_id', user.id),
        supabase.from('routines').select('*').eq('user_id', user.id),
        supabase.from('routine_logs').select('*').eq('user_id', user.id),
      ])

      const digest = buildEveningDigest(
        {
          agendaItems: agendaItems || [],
          routines: routines || [],
          routineLogs: routineLogs || [],
        },
        todayStr
      )

      // 1. E-posta Test Gönderimi
      if (targetEmail) {
        emailResult.attempted = true
        const emailHtml = renderEveningEmailHtml(digest, appUrl)
        const sendRes = await sendEmail({
          to: targetEmail,
          subject: `[TEST] ${digest.pushTitle}`,
          html: emailHtml,
        })
        emailResult.success = sendRes.success
        emailResult.error = sendRes.error || null
      } else {
        emailResult.error = 'Kullanıcıya ait e-posta adresi bulunamadı.'
      }

      // 2. Web Push Test Gönderimi
      pushResult.attempted = true
      const pRes = await sendPushToUser(adminClient, user.id, {
        title: `[TEST] ${digest.pushTitle}`,
        body: digest.pushBody,
        url: '/routines',
        tag: 'test-evening',
      })
      pushResult.success = pRes.success
      pushResult.sentCount = pRes.sentCount
      pushResult.failedCount = pRes.failedCount
      pushResult.error = pRes.error || null
    }

    return NextResponse.json({
      success: true,
      mode,
      targetEmail,
      emailResult,
      pushResult,
    })
  } catch (err: any) {
    console.error('Test notification route error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}
