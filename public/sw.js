// Service Worker for Elysium PWA
const CACHE_NAME = "elysium-v1";
const STATIC_ASSETS = [
  "/brand/logo-icon-gold.png",
  "/brand/logo-horizontal-white.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for API/Firebase calls, cache-first for static assets
  if (event.request.url.includes("firestore") || event.request.url.includes("identitytoolkit") || event.request.url.includes("securetoken")) {
    return; // Let network requests pass through for Firebase
  }
  // Never cache PayPal: the SDK and checkout flows must always hit the network
  if (event.request.url.includes("paypal.com") || event.request.url.includes("paypalobjects.com")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// Push notification handler (Firebase Cloud Messaging / Web Push).
self.addEventListener("push", (event) => {
  let raw = {};
  try { raw = event.data ? event.data.json() : {}; }
  catch { raw = { data: { body: event.data?.text?.() || "" } }; }

  const payload = raw.notification || raw.data || raw;
  const data = raw.data || payload || {};
  const title = payload.title || data.title || "Elysium";
  const url = data.url || raw.fcmOptions?.link || raw.webpush?.fcmOptions?.link || "/";
  const options = {
    body: payload.body || data.body || "",
    icon: payload.icon || "/brand/logo-icon-gold.png",
    badge: "/brand/logo-icon-gold.png",
    data: { url },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/";
  const url = new URL(rawUrl, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
