/* ==========================================================================
   OUTS · Treino Lab — sw.js
   Service worker usado só quando o jogo é aberto pela internet (https),
   para permitir instalar como app e jogar sem conexão. Ao abrir pelo
   duplo clique (file://) ele não é registrado e nada muda.
   Estratégia: rede primeiro (sempre a versão mais nova); sem internet,
   usa a cópia guardada. "Rede" quer dizer conferir com o servidor de
   verdade: o GitHub Pages manda guardar os arquivos por 10 min, e sem o
   no-cache uma atualização publicada só aparecia depois desse tempo.
   ========================================================================== */
'use strict';

const CACHE = 'outs-treino-v1';

/** Busca no servidor sem usar o cache HTTP (se não mudou, ele responde 304 e é rápido). */
function daRede(req) {
  // redirecionamento (ex.: endereço sem a barra final) volta para o caminho normal do navegador
  return fetch(req.url, { cache: 'no-cache' }).then(r => (r.redirected ? fetch(req) : r));
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chaves => Promise.all(chaves.filter(c => c !== CACHE).map(c => caches.delete(c))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(daRede(req).then(resp => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html').then(i => i || caches.match('./')) : undefined))
    .then(r => r || Response.error())));
});
