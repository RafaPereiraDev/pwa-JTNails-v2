// ===== SERVICE WORKER — Juliana & Tainara Atelier Nails =====
const CACHE_NAME = 'atelier-nails-v29';

// Assets estáticos que serão cacheados na instalação
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/agendar',
  '/agendar.html',
  '/manifest-agendar.json',
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
  '/icon-192x192.png',
  '/icon-512x512.png',
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

// ── PUSH: recebe notificações do servidor ────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Atelier Nails', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Atelier Nails';
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    // vibrate vem do servidor: [200,100,200] se ativado, [] se desativado
    vibrate: Array.isArray(data.vibrate) ? data.vibrate : [200, 100, 200],
    data: { url: data.url || '/' },
    tag: 'novo-agendamento',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATIONCLICK: abre o app ao tocar na notificação ─────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já há uma aba aberta, foca nela
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Senão, abre uma nova
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
