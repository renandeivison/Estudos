/**
 * Study Tracker - Service Worker
 * Estratégia de cache:
 *  - App Shell (HTML/CSS/JS/ícones/manifest): cache-first com atualização
 *    em segundo plano (stale-while-revalidate) -> resposta instantânea e
 *    sempre atualizado na próxima visita.
 *  - Fontes do Google (cross-origin): stale-while-revalidate em cache
 *    separado, com uso do cache quando estiver offline.
 *  - Navegação (abrir o app): tenta a rede primeiro; se falhar (offline),
 *    cai para o app shell em cache, garantindo que o app sempre abre.
 *  - Demais requisições same-origin: network-first com fallback em cache.
 */

const CACHE_VERSION = 'v18';
const APP_SHELL_CACHE = `study-tracker-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `study-tracker-runtime-${CACHE_VERSION}`;
const FONTS_CACHE = `study-tracker-fonts-${CACHE_VERSION}`;

const CACHES_ATUAIS = [APP_SHELL_CACHE, RUNTIME_CACHE, FONTS_CACHE];

// Arquivos essenciais para o app funcionar 100% offline
const APP_SHELL_URLS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

/**
 * INSTALL - pré-armazena o app shell
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

/**
 * ACTIVATE - remove caches de versões antigas
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((nomes) => Promise.all(
                nomes
                    .filter((nome) => !CACHES_ATUAIS.includes(nome))
                    .map((nome) => caches.delete(nome))
            ))
            .then(() => self.clients.claim())
    );
});

/**
 * FETCH - roteia cada requisição para a estratégia adequada
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Ignora métodos que não são GET (ex: POST) e requisições de outras extensões
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Navegação (o usuário abrindo/recarregando o app)
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    // Fontes do Google (cross-origin)
    if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
        event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
        return;
    }

    // Arquivos do app shell (same-origin)
    if (url.origin === self.location.origin && APP_SHELL_URLS.some((path) => url.pathname.endsWith(path.replace('./', '/')) || url.pathname === '/')) {
        event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
        return;
    }

    // Demais requisições same-origin: network-first com fallback em cache
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request, RUNTIME_CACHE));
    }
});

/**
 * Estratégia: cache-first com revalidação em segundo plano.
 * Responde rápido com o cache (se existir) e atualiza o cache com a rede
 * em paralelo, sem bloquear a resposta.
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(() => null); // offline: mantém o que já está em cache

    return cachedResponse || fetchPromise || Response.error();
}

/**
 * Estratégia: network-first, com fallback para o cache quando offline.
 */
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        throw err;
    }
}

/**
 * Estratégia para navegação: tenta a rede (conteúdo sempre fresco quando
 * online); se falhar, cai para o index.html em cache, garantindo que o
 * app sempre abre mesmo offline.
 */
async function handleNavigation(request) {
    const cache = await caches.open(APP_SHELL_CACHE);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put('./index.html', networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        const cachedShell = await cache.match('./index.html');
        if (cachedShell) return cachedShell;
        throw err;
    }
}
