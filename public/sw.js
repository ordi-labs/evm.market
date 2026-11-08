const CACHE_NAME = "evm-market-shell-v11-live-price-range-20261108";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest?v=market-20261108-price", "/icons/icon.svg?v=logo-20261106", "/icons/icon-180.png?v=logo-20261106", "/icons/icon-192.png?v=logo-20261106", "/icons/icon-512.png?v=logo-20261106"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("evm-market-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API results and explicit no-store requests must always reach the network.
  // In particular, cached pagination cursors can otherwise replay stale scan pages.
  if (url.pathname.startsWith("/api/") || request.cache === "no-store" || /(?:^|,)\s*no-store\s*(?:,|$)/i.test(request.headers.get("cache-control") || "")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/index.html"))));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
