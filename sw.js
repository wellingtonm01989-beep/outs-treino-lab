/* ==========================================================================
   OUTS · Treino Lab — sw.js
   Service worker usado só quando o jogo é aberto pela internet (https),
   para permitir instalar como app e jogar sem conexão. Ao abrir pelo
   duplo clique (file://) ele não é registrado e nada muda.
   Estratégia: rede primeiro (sempre a versão mais nova); sem internet,
   usa a cópia guardada.
   ========================================================================== */
'use strict';

const CACHE = 'outs-treino-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(c => c !== CACHE).map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(resp => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html').then(i => i || caches.match('./')) : undefined))
    .then(r => r || Response.error())));
});
