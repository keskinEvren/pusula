import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMorningDigest } from '@/lib/notifications/event-digest-engine'
import { renderMorningEmailHtml } from '@/lib/notifications/email-templates'
import { sendEmail, sendPushToUser } from '@/lib/notifications/dispatcher'

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

    // 1. Sabah bildirimi açık olan ve bugün henüz sabah bildirimi almamış kullanıcıları çek
    const { data: users, error: userError } = await adminClient
      .from('notification_preferences')
      .select('*')
      .eq('morning_enabled', true)
      .or(`last_morning_sent_date.is.null,last_morning_sent_date.neq.${todayStr}`)

    if (userError) {
      console.error('Cron morning fetch users error:', userError)
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'Gönderilecek sabah bildirimi bulunamadı.', processedCount: 0, date: todayStr })
    }

    let processedCount = 0

    for (const pref of users) {
      try {
        const userId = pref.user_id

        // Kullanıcının verilerini çek
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
          adminClient.from('agenda_items').select('*').eq('user_id', userId),
          adminClient.from('routines').select('*').eq('user_id', userId),
          adminClient.from('routine_logs').select('*').eq('user_id', userId),
          adminClient.from('credit_cards').select('*').eq('user_id', userId),
          adminClient.from('subscriptions').select('*').eq('user_id', userId),
          adminClient.from('accounts').select('*').eq('user_id', userId),
          adminClient.from('debts').select('*').eq('user_id', userId),
          adminClient.from('investments').select('*').eq('user_id', userId),
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
            weeklyFinanceEnabled: pref.weekly_finance_enabled,
          },
          todayStr
        )

        // E-posta gönderimi
        if (pref.email_enabled && pref.email) {
          const emailHtml = renderMorningEmailHtml(digest, appUrl)
          await sendEmail({
            to: pref.email,
            subject: digest.pushTitle,
            html: emailHtml,
          })
        }

        // Web Push gönderimi
        if (pref.push_enabled) {
          await sendPushToUser(adminClient, userId, {
            title: digest.pushTitle,
            body: digest.pushBody,
            url: '/agenda',
            tag: `morning-${todayStr}`,
          })
        }

        // Idempotency: Son gönderim tarihini güncelle
        await adminClient
          .from('notification_preferences')
          .update({
            last_morning_sent_date: todayStr,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)

        processedCount++
      } catch (userDispatchError) {
        console.error(`Error dispatching morning briefing to user ${pref.user_id}:`, userDispatchError)
      }
    }

    return NextResponse.json({
      success: true,
      processedCount,
      date: todayStr,
    })
  } catch (err: any) {
    console.error('Morning cron fatal error:', err)
    return NextResponse.json({ error: err?.message || 'İç sunucu hatası' }, { status: 500 })
  }
}
