/* eslint-disable no-restricted-globals */
// Service Worker for Elysium PWA
// ---------------------------------------------------------------------------
// - Précache le shell applicatif + la page de repli /offline.
// - Navigations : network-first, repli sur le cache puis sur /offline.
// - Assets statiques : cache-first (stale-while-revalidate pour les hashés).
// - Cycle de mise à jour piloté par la page (message SKIP_WAITING) afin
//   d'afficher un toast « nouvelle version disponible » plutôt que de couper
//   l'utilisateur en pleine navigation.
const VERSION = "v2";
const CACHE_NAME = `elysium-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.json",
  "/brand/logo-icon-gold.png",
  "/brand/logo-horizontal-white.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // `reload` évite de précacher une réponse HTTP déjà périmée.
      Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })))
      )
    )
  );
  // Pas de skipWaiting automatique : la page décide quand activer la MAJ.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// La page demande l'activation immédiate après clic sur « Mettre à jour ».
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const isBypassed = (url) =>
  url.includes("firestore") ||
  url.includes("identitytoolkit") ||
  url.includes("securetoken") ||
  url.includes("firebaseinstallations") ||
  url.includes("fcmregistrations") ||
  url.includes("googleapis.com/identitytoolkit") ||
  // Ne jamais mettre PayPal en cache : SDK et tunnel de paiement toujours réseau.
  url.includes("paypal.com") ||
  url.includes("paypalobjects.com");

/**
 * Le shell SPA n'est utile hors-ligne que si le bundle JS correspondant est lui
 * aussi en cache — sinon on afficherait une page blanche. On vérifie donc la
 * présence d'au moins un chunk avant de servir index.html.
 */
const hasCachedBundle = async (cache) => {
  const keys = await cache.keys();
  return keys.some((req) => req.url.includes("/static/js/"));
};

/** Navigations : réseau d'abord, puis shell en cache, puis page hors-ligne. */
const handleNavigation = async (event) => {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    const network = await fetch(event.request);
    // On garde une copie du shell pour les rechargements hors-ligne.
    if (network.ok) {
      const clone = network.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone)).catch(() => {});
    }
    return network;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cachedShell = await cache.match("/index.html");
    if (cachedShell && (await hasCachedBundle(cache))) return cachedShell;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Hors ligne — reconnectez-vous à Internet pour continuer.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (isBypassed(request.url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
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
