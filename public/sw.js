// ===== SERVICE WORKER — Tainara Nails =====
const CACHE_NAME = 'tainara-nails-v1';

// Assets estáticos que serão cacheados na instalação
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/agendar.html',
  '/css/style.css',
  '/css/agendar.css',
  '/js/api.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/modal.js',
  '/js/app.js',
  '/js/agendar.js',
  '/js/pages/dashboard.js',
  '/js/pages/agenda.js',
  '/js/pages/clients.js',
  '/js/pages/services.js',
  '/js/pages/professionals.js',
  '/js/pages/financial.js',
  '/js/pages/reports.js',
  '/js/pages/settings.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL: faz cache dos assets estáticos ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falha se qualquer asset não existir; usamos add individual pra ser resiliente
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  // Ativa imediatamente sem esperar abas antigas fecharem
  self.skipWaiting();
});

// ── ACTIVATE: limpa caches antigos ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
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

// ── FETCH: estratégia Network-First para API, Cache-First para assets ────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Requisições de API: sempre vai à rede (nunca cacheia dados da API)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets estáticos: Cache-First (responde do cache, atualiza em background)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        // Só cacheia respostas válidas de mesma origem
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // se offline e não tem cache, retorna o que tiver

      return cached || networkFetch;
    })
  );
});
