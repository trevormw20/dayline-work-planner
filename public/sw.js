const CACHE = 'dayline-shell-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((response) => response || caches.match('./index.html'))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'DAYLINE_NOTIFY') {
    self.registration.showNotification(event.data.title || 'New work item', {
      body: event.data.body || 'Open Dayline to review it.',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: event.data.tag || 'dayline-task',
    })
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('./'))
})
