/**
 * 🧭 PUSULA — Bildirim Gönderim Servisi (Dispatcher)
 * Web Push ve Nodemailer SMTP gönderim fonksiyonları.
 */

import nodemailer from 'nodemailer'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface EmailSendParams {
  to: string
  subject: string
  html: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

export interface PushSendResult {
  success: boolean
  sentCount: number
  failedCount: number
  removedCount: number
  error?: string
}

/**
 * SMTP üzerinden e-posta gönderir.
 */
export async function sendEmail({ to, subject, html }: EmailSendParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465
  const secure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || `"Pusula Kokpit" <${user}>`

  if (!host || !user || !pass) {
    return {
      success: false,
      error: 'SMTP ayarları eksik. Lütfen .env dosyasında SMTP_HOST, SMTP_USER ve SMTP_PASS alanlarını tanımlayın.',
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    })

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    })

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err: any) {
    console.error('Nodemailer error sending email:', err)
    return {
      success: false,
      error: err?.message || 'E-posta gönderimi başarısız oldu.',
    }
  }
}

/**
 * Belirli bir kullanıcının tüm kayıtlı cihazlarına Web Push bildirimi gönderir.
 * Geçersiz (404/410) cihaz aboneliklerini veritabanından otomatik temizler.
 */
export async function sendPushToUser(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  const rawPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const rawPrivateKey = process.env.VAPID_PRIVATE_KEY
  const publicKey = rawPublicKey ? rawPublicKey.trim().replace(/^"(.*)"$/, '$1') : ''
  const privateKey = rawPrivateKey ? rawPrivateKey.trim().replace(/^"(.*)"$/, '$1') : ''
  const subject = (process.env.VAPID_SUBJECT || 'mailto:pusula@example.com').trim().replace(/^"(.*)"$/, '$1')

  if (!publicKey || !privateKey) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
      error: 'VAPID anahtarları eksik. Lütfen NEXT_PUBLIC_VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY alanlarını tanımlayın.',
    }
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch (err: any) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
      error: `VAPID yapılandırma hatası: ${err?.message}`,
    }
  }

  // Kullanıcının aboneliklerini çek
  const { data: subscriptions, error: dbError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)

  if (dbError) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
      error: `Abonelikler çekilemedi: ${dbError.message}`,
    }
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      success: true,
      sentCount: 0,
      failedCount: 0,
      removedCount: 0,
    }
  }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || 'pusula-notification',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
  })

  let sentCount = 0
  let failedCount = 0
  const deadEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payloadString
        )
        sentCount++
      } catch (err: any) {
        failedCount++
        // 404 Not Found veya 410 Gone: Cihaz aboneliği sonlanmış
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadEndpoints.push(sub.endpoint)
        } else {
          console.error(`Push send error for endpoint ${sub.endpoint}:`, err)
        }
      }
    })
  )

  let removedCount = 0
  if (deadEndpoints.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', deadEndpoints)

    if (!deleteError) {
      removedCount = deadEndpoints.length
    } else {
      console.error('Error removing expired push subscriptions:', deleteError)
    }
  }

  return {
    success: true,
    sentCount,
    failedCount,
    removedCount,
  }
}
