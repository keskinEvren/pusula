// 🧭 Pusula PWA Service Worker — Web Push & Notification Dispatcher

self.addEventListener('install', (event) => {
  // Aktifleşmeyi hemen sağla
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Tüm açık sekmelerin kontrolünü anında devral
  event.waitUntil(self.clients.claim())
})

// Web Push Bildirimi Geldiğinde
self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch (e) {
      data = {
        title: 'Pusula Bildirimi',
        body: event.data.text(),
      }
    }
  }

  const title = data.title || '🧭 Pusula'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'pusula-notification',
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    renotify: true,
    vibrate: [100, 50, 100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Bildirime Tıklandığında
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  const absoluteUrl = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Eğer mevcut bir Pusula penceresi açıksa ona odaklan ve yönlendir
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(absoluteUrl)
          }
          return client.focus()
        }
      }
      // Açık pencere yoksa yeni pencerede aç
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl)
      }
    })
  )
})
