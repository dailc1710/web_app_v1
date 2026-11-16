/* Minimal service worker so Chrome can install as a standalone app (WebAPK),
   which shows a real icon without the Chrome badge — closer to iOS home screen. */
const CACHE = "tamtri-shell-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/manifest.json", "/icon-192.png", "/icon-512.png"]),
    ),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          const copy = res.clone()
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            caches.open(CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetched
    }),
  )
})
