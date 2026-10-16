/**
 * 🧭 PUSULA — Web Push Tarayıcı İstemci Yardımcıları
 * Tarayıcı tarafında Service Worker kaydı, izin alma ve VAPID aboneliği yönetimi.
 */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    await navigator.serviceWorker.ready
    return registration
  } catch (err) {
    console.error('Service Worker registration failed:', err)
    return null
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch (err) {
    console.error('Error getting push subscription:', err)
    return null
  }
}

export async function subscribeBrowserToPush(
  vapidPublicKey: string
): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Bu tarayıcı Web Push bildirimlerini desteklemiyor.' }
  }

  try {
    // 1. Bildirim izni iste
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { success: false, error: 'Bildirim izni verilmedi.' }
    }

    // 2. Service Worker'ı hazırla
    const registration = await registerServiceWorker()
    if (!registration) {
      return { success: false, error: 'Service Worker başlatılamadı.' }
    }

    // 3. Mevcut aboneliği kontrol et veya yeni abonelik oluştur
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      })
    }

    const subJson = subscription.toJSON()
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, error: 'Abonelik anahtarları üretilemedi.' }
    }

    // 4. Sunucuya kaydet
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        userAgent: navigator.userAgent,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      return { success: false, error: errorData.error || 'Abonelik sunucuya kaydedilemedi.' }
    }

    return { success: true, subscription }
  } catch (err: any) {
    console.error('Push subscription failed:', err)
    return { success: false, error: err?.message || 'Push aboneliği oluşturulamadı.' }
  }
}

export async function unsubscribeBrowserFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Desteklenmiyor' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()

    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      // Sunucudan da sil
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    }

    return { success: true }
  } catch (err: any) {
    console.error('Push unsubscription error:', err)
    return { success: false, error: err?.message || 'Abonelik iptal edilemedi.' }
  }
}
