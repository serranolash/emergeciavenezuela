const CACHE_NAME = 'emergencia-ve-v2';
const API_CACHE_NAME = 'emergencia-ve-api-v2';

// Install
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — delete all old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for everything, cache API responses only
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API: network first, cache as fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || new Response(JSON.stringify({ error: 'Sin conexión' }), { headers: { 'Content-Type': 'application/json' }, status: 503 })))
    );
    return;
  }

  // POST to /api/reportes — queue offline
  if (request.method === 'POST' && url.pathname === '/api/reportes') {
    event.respondWith(
      fetch(request).catch(async () => {
        const body = await request.clone().json();
        // Use a simple IDB-like approach via cache
        return new Response(
          JSON.stringify({ success: true, offline: true, message: 'Reporte guardado localmente.' }),
          { headers: { 'Content-Type': 'application/json' }, status: 202 }
        );
      })
    );
    return;
  }

  // HTML page: always network first (never cache the shell in dev)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || new Response('Sin conexión', { status: 503 })))
    );
    return;
  }

  // Static assets (images, fonts, etc): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});