// Service worker enxuto: guarda o casco do app para abrir offline.
// Nada de cachear resposta da API — dado financeiro tem que vir fresco.
const CACHE = "rumofacil-shell-v2";
const STATIC = "rumofacil-static-v1";
const SHELL = ["/", "/manifest.webmanifest"];
/** Cada deploy traz arquivos com nome novo; sem limite, o cache só cresceria. */
const MAX_STATIC = 150;

function aparar(cache) {
  return cache.keys().then((keys) =>
    Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC)).map((k) => cache.delete(k)))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== STATIC).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  // JS, CSS e fontes do build têm o hash no nome: o arquivo de um endereço
  // nunca muda. Então vem do cache sem nem perguntar à rede — é o que faz o
  // app instalado abrir rápido mesmo com sinal ruim. Deploy novo = nomes
  // novos, que caem aqui pela primeira vez e entram no cache.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone()).then(() => aparar(cache));
              }
              return response;
            })
        )
      )
    );
    return;
  }

  // Páginas: sempre da rede (dado fresco); o cache só serve sem conexão.
  // Resposta de RSC (navegação dentro do app) não é guardada: ela depende
  // de cabeçalhos e não serve como página offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === "navigate" && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match("/")))
  );
});
