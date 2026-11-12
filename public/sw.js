const CACHE_NAME = "pechincha-pwa-v2";
const URLS_PARA_CACHE = [
  "/",
  "/compra",
  "/produtos",
  "/orcamento",
  "/mais",
  "/historico",
  "/exportar",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_PARA_CACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Não intercepta chamadas externas, APIs nem o próprio arquivo do Service Worker
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  // Estratégia Network-First com fallback para o Cache quando o mercado estiver sem sinal
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && !res.redirected) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, clone);
          });
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") {
            return caches.match("/compra") || caches.match("/");
          }
          return Response.error();
        })
      )
  );
});
