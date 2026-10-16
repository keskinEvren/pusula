/**
 * 🧭 PUSULA — Koyu Tema HTML E-posta Şablonları (Email Templates)
 * Pusula tasarım paletiyle uyumlu, tüm e-posta istemcileriyle uyumlu inline-style tablo şablonları.
 */

import type { MorningDigest, EveningDigest } from './event-digest-engine'

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatTRY(amount: number | null | undefined): string {
  const valid = typeof amount === 'number' && !isNaN(amount) ? amount : 0
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valid)
}

/**
 * 🌅 Sabah Odak ve Ajanda Brifingi HTML Şablonu
 */
export function renderMorningEmailHtml(digest: MorningDigest, appUrl: string): string {
  const baseUrl = (appUrl && appUrl.trim()) ? appUrl.trim() : 'http://localhost:3000'
  const safeAppUrl = escapeHtml(baseUrl.replace(/\/$/, ''))

  // Odak Görevleri Listesi
  const agendaListHtml =
    digest.todayAgendaItems.length > 0
      ? digest.todayAgendaItems
          .map(
            (item) => `
            <tr>
              <td style="padding: 10px 14px; border-bottom: 1px solid #1e293b;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle;">
                      <span style="display: inline-block; width: 8px; height: 8px; background-color: #3b82f6; border-radius: 50%; margin-right: 10px;"></span>
                      <strong style="color: #f8fafc; font-size: 14px;">${escapeHtml(item.title)}</strong>
                    </td>
                    ${
                      item.plan_time
                        ? `<td align="right" style="vertical-align: middle; white-space: nowrap;">
                            <span style="display: inline-block; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px;">
                              🕒 ${escapeHtml(item.plan_time)}
                            </span>
                          </td>`
                        : ''
                    }
                  </tr>
                </table>
              </td>
            </tr>`
          )
          .join('')
      : `<tr><td style="padding: 14px; color: #94a3b8; font-size: 13px; font-style: italic;">Bugün için planlanmış odak görevi bulunmuyor. Yeni bir görev ekleyerek güne başlayabilirsin.</td></tr>`

  // Gecikmiş Görev Uyarısı
  const overdueBannerHtml =
    digest.overdueAgendaCount > 0
      ? `
        <div style="background-color: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align: top; width: 24px;">⏰</td>
              <td style="vertical-align: top; padding-left: 8px;">
                <span style="color: #fbbf24; font-size: 13px; font-weight: 600;">
                  Önceki günlerden devreden ${digest.overdueAgendaCount} adet gecikmiş görevin var.
                </span>
                <div style="margin-top: 4px;">
                  <a href="${safeAppUrl}/agenda" style="color: #f59e0b; text-decoration: underline; font-size: 12px;">Ajandaya Git ve Yeniden Planla &rarr;</a>
                </div>
              </td>
            </tr>
          </table>
        </div>`
      : ''

  // Sabah Rutinleri Listesi
  const routinesListHtml =
    digest.morningRoutines.length > 0
      ? digest.morningRoutines
          .map(
            (r) => `
            <tr>
              <td style="padding: 10px 14px; border-bottom: 1px solid #1e293b;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align: middle;">
                      <span style="display: inline-block; width: 8px; height: 8px; background-color: #f59e0b; border-radius: 50%; margin-right: 10px;"></span>
                      <strong style="color: #f8fafc; font-size: 14px;">${escapeHtml(r.title)}</strong>
                    </td>
                    <td align="right" style="vertical-align: middle; white-space: nowrap;">
                      ${
                        r.streakCount > 0
                          ? `<span style="background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 6px; margin-right: 6px;">
                              🔥 ${r.streakCount}g
                            </span>`
                          : ''
                      }
                      <span style="color: #94a3b8; font-size: 12px;">${r.target_duration_minutes ? `${r.target_duration_minutes} dk` : (r.minimum_effective_dose ? escapeHtml(r.minimum_effective_dose) : '')}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
          )
          .join('')
      : `<tr><td style="padding: 14px; color: #94a3b8; font-size: 13px; font-style: italic;">Sabah bloğunda bekleyen aktif rutin bulunmuyor.</td></tr>`

  // Finansal Uyarılar Bölümü
  const hasFinanceAlerts =
    digest.statementCards.length > 0 || digest.dueCards.length > 0 || digest.subscriptionAlerts.length > 0 || digest.weeklyFinanceSummary

  let financeSectionHtml = ''
  if (hasFinanceAlerts) {
    const alertItems: string[] = []

    // Son Ödeme Uyarıları
    for (const card of digest.dueCards) {
      alertItems.push(`
        <div style="background-color: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="color: #fda4af; font-size: 13px;">
                🚨 <strong>${escapeHtml(card.card_name)}</strong> son ödeme günü: <strong style="color: #fff;">${card.isToday ? 'BUGÜN' : 'YARIN'}</strong> (${escapeHtml(card.due_date)})
              </td>
              <td align="right" style="color: #fb7185; font-size: 14px; font-weight: bold; white-space: nowrap;">
                ${formatTRY(card.statement_debt)}
              </td>
            </tr>
          </table>
        </div>`)
    }

    // Ekstre Kesim Uyarıları
    for (const card of digest.statementCards) {
      alertItems.push(`
        <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="color: #93c5fd; font-size: 13px;">
                💳 <strong>${escapeHtml(card.card_name)}</strong> (${escapeHtml(card.bank)}) hesap kesim günü bugün.
                <div style="font-size: 11px; color: #60a5fa; margin-top: 2px;">Ekstreniz çıktığında PDF yükleyerek borç durumunu güncelleyin.</div>
              </td>
              <td align="right" style="color: #cbd5e1; font-size: 13px; font-weight: 600; white-space: nowrap;">
                ${formatTRY(card.statement_debt || card.current_debt)}
              </td>
            </tr>
          </table>
        </div>`)
    }

    // Abonelik Karar / Yenileme Uyarıları
    for (const sub of digest.subscriptionAlerts) {
      alertItems.push(`
        <div style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="color: #fde68a; font-size: 13px;">
                🔔 <strong>${escapeHtml(sub.service)}</strong> ${
                  sub.reason === 'decision_needed'
                    ? `için karar bekleniyor: <span style="color: #f87171; font-weight: bold;">"${escapeHtml(sub.decision)}"</span>`
                    : `yenileme tarihi yaklaşıyor (${escapeHtml(sub.end_date || '')})`
                }
              </td>
              <td align="right" style="color: #cbd5e1; font-size: 13px; font-weight: 600; white-space: nowrap;">
                ${sub.amount} ${escapeHtml(sub.currency)}
              </td>
            </tr>
          </table>
        </div>`)
    }

    // Haftalık Finans Özeti (Pazartesi)
    let weeklySummaryHtml = ''
    if (digest.weeklyFinanceSummary) {
      const { totalCash, totalCardDebt, totalReceivables, netWorth } = digest.weeklyFinanceSummary
      weeklySummaryHtml = `
        <div style="background-color: #1a2234; border: 1px solid #2d3748; border-radius: 8px; padding: 14px; margin-top: 12px;">
          <div style="font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            📊 Haftalık Finansal Durum
          </div>
          <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
            <tr>
              <td style="color: #94a3b8;">Hazır Nakit:</td>
              <td align="right" style="color: #10b981; font-weight: 600;">${formatTRY(totalCash)}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8;">Toplam Kart Borcu:</td>
              <td align="right" style="color: #f43f5e; font-weight: 600;">${formatTRY(totalCardDebt)}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8;">Bekleyen Alacaklar:</td>
              <td align="right" style="color: #38bdf8; font-weight: 600;">${formatTRY(totalReceivables)}</td>
            </tr>
            <tr style="border-top: 1px solid #2d3748;">
              <td style="color: #f8fafc; font-weight: bold; padding-top: 8px;">Net Varlık:</td>
              <td align="right" style="color: ${netWorth >= 0 ? '#10b981' : '#f43f5e'}; font-weight: bold; font-size: 15px; padding-top: 8px;">${formatTRY(netWorth)}</td>
            </tr>
          </table>
        </div>`
    }

    financeSectionHtml = `
      <div style="margin-top: 28px;">
        <div style="font-size: 13px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
          💳 Finansal Hatırlatıcılar & Olaylar
        </div>
        ${alertItems.join('')}
        ${weeklySummaryHtml}
      </div>`
  }

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pusula Sabah Brifingi</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px 28px; border-bottom: 1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">🧭 PUSULA</span>
                    <span style="display: inline-block; background-color: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-left: 8px; vertical-align: middle;">SABAH BRİFİNGİ</span>
                  </td>
                  <td align="right" style="color: #94a3b8; font-size: 13px; font-weight: 500;">
                    ${escapeHtml(digest.dayName)}, ${escapeHtml(digest.date)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 28px;">
              ${overdueBannerHtml}

              <!-- Focus Tasks Block -->
              <div style="margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                  <tr>
                    <td style="font-size: 13px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">
                      🎯 Bugünün Odak Görevleri (${digest.todayAgendaItems.length})
                    </td>
                    <td align="right">
                      <a href="${safeAppUrl}/agenda" style="color: #94a3b8; font-size: 12px; text-decoration: none;">Ajandayı Aç &rarr;</a>
                    </td>
                  </tr>
                </table>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 8px;">
                  ${agendaListHtml}
                </table>
              </div>

              <!-- Morning Routines Block -->
              <div style="margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                  <tr>
                    <td style="font-size: 13px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px;">
                      ☀️ Sabah Rutinleri (${digest.morningRoutines.length})
                    </td>
                    <td align="right">
                      <a href="${safeAppUrl}/routines" style="color: #94a3b8; font-size: 12px; text-decoration: none;">Rutinlere Git &rarr;</a>
                    </td>
                  </tr>
                </table>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 8px;">
                  ${routinesListHtml}
                </table>
              </div>

              ${financeSectionHtml}

              <!-- Action CTA Button -->
              <div style="margin-top: 32px; text-align: center;">
                <a href="${safeAppUrl}/agenda" style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                  Bugünün Ajandasını Başlat 🚀
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d121f; padding: 16px 28px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
              Bu e-posta Pusula Akıllı Tetikleyici Sistemi tarafından otomatik olarak gönderilmiştir.<br>
              Bildirim ayarlarınızı dilediğiniz zaman <a href="${safeAppUrl}/settings" style="color: #94a3b8; text-decoration: underline;">Ayarlar Sayfasından</a> güncelleyebilirsiniz.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/**
 * 🌙 Akşam Rutin ve Seri Koruması Kapanış HTML Şablonu
 */
export function renderEveningEmailHtml(digest: EveningDigest, appUrl: string): string {
  const baseUrl = (appUrl && appUrl.trim()) ? appUrl.trim() : 'http://localhost:3000'
  const safeAppUrl = escapeHtml(baseUrl.replace(/\/$/, ''))

  // Tehlikedeki Seriler (Streak at risk)
  let atRiskHtml = ''
  if (digest.atRiskRoutines.length > 0) {
    const list = digest.atRiskRoutines
      .map(
        (r) => `
        <tr>
          <td style="padding: 12px 14px; border-bottom: 1px solid rgba(244, 63, 94, 0.2);">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align: middle;">
                  <strong style="color: #ffffff; font-size: 14px;">${escapeHtml(r.title)}</strong>
                </td>
                <td align="right" style="vertical-align: middle; white-space: nowrap;">
                  <span style="display: inline-block; background-color: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.4); color: #fda4af; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px;">
                    🔥 ${r.currentStreak} GÜNLÜK SERİ TEHLİKEDE
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      )
      .join('')

    atRiskHtml = `
      <div style="background-color: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: #fb7185; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
          🚨 Zinciri Kırma! Bu Rutinler Bugün Tamamlanmazsa Seri Sıfırlanacak:
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${list}
        </table>
      </div>`
  }

  // Diğer Tamamlanmamış Rutinler
  let otherIncompleteHtml = ''
  if (digest.incompleteOtherRoutines.length > 0) {
    const list = digest.incompleteOtherRoutines
      .map(
        (r) => `
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align: middle;">
                  <span style="display: inline-block; width: 8px; height: 8px; background-color: #94a3b8; border-radius: 50%; margin-right: 10px;"></span>
                  <span style="color: #cbd5e1; font-size: 14px;">${escapeHtml(r.title)}</span>
                </td>
                <td align="right" style="vertical-align: middle; color: #64748b; font-size: 12px;">
                  ${escapeHtml(r.time_block)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      )
      .join('')

    otherIncompleteHtml = `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
          Bekleyen Diğer Rutinler (${digest.incompleteOtherRoutines.length})
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 8px;">
          ${list}
        </table>
      </div>`
  }

  // Tebrik Bloğu (Tüm rutinler tamamlandıysa)
  let allDoneHtml = ''
  if (digest.atRiskRoutines.length === 0 && digest.incompleteOtherRoutines.length === 0 && digest.totalActiveRoutinesCount > 0) {
    allDoneHtml = `
      <div style="background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <div style="font-size: 20px; margin-bottom: 4px;">🎉 Harika İş!</div>
        <div style="color: #6ee7b7; font-size: 14px; font-weight: 600;">
          Bugünkü ${digest.completedRoutinesCount} rutininin tamamını bitirdin. Zincir sağlam!
        </div>
      </div>`
  }

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pusula Akşam Kapanışı</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px 28px; border-bottom: 1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">🧭 PUSULA</span>
                    <span style="display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-left: 8px; vertical-align: middle;">AKŞAM KAPANIŞI</span>
                  </td>
                  <td align="right" style="color: #94a3b8; font-size: 13px; font-weight: 500;">
                    ${escapeHtml(digest.dayName)}, ${escapeHtml(digest.date)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 28px;">
              ${allDoneHtml}
              ${atRiskHtml}
              ${otherIncompleteHtml}

              <!-- Gün Sonu Ajanda Özeti -->
              <div style="background-color: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                  📋 Gün Sonu Ajanda Karnesi
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
                  <tr>
                    <td style="color: #cbd5e1; padding: 4px 0;">✅ Tamamlanan Görevler:</td>
                    <td align="right" style="color: #10b981; font-weight: 700;">${digest.completedAgendaCount} adet</td>
                  </tr>
                  <tr>
                    <td style="color: #cbd5e1; padding: 4px 0;">⏳ Yarına Devredenler / Bekleyenler:</td>
                    <td align="right" style="color: #f59e0b; font-weight: 700;">${digest.pendingAgendaCount} adet</td>
                  </tr>
                </table>
              </div>

              <!-- Action CTA Button -->
              <div style="margin-top: 32px; text-align: center;">
                <a href="${safeAppUrl}/routines" style="display: inline-block; background-color: #10b981; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                  Rutinleri Tamamla & Seriyi Koru 🔥
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d121f; padding: 16px 28px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
              Bu e-posta Pusula Akıllı Tetikleyici Sistemi tarafından otomatik olarak gönderilmiştir.<br>
              Bildirim ayarlarınızı dilediğiniz zaman <a href="${safeAppUrl}/settings" style="color: #94a3b8; text-decoration: underline;">Ayarlar Sayfasından</a> güncelleyebilirsiniz.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}
