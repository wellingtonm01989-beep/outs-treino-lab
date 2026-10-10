/* ==========================================================================
   OUTS · servidor — teste/servir-cliente.mjs
   Serve o app (a pasta de cima de servidor/) em http://localhost:8080 para
   testar a mesa com amigos junto com o `npm run dev` (servidor em :8787).
   Pelo localhost o app usa o servidor local sozinho (ver js/rede.js).
   Uso: npm run cliente   (porta diferente: npm run cliente -- 9000)
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTA = +process.argv[2] || 8080;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
  let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (caminho.endsWith('/')) caminho += 'index.html';
  const arquivo = normalize(join(RAIZ, caminho));
  // nada fora da pasta do app, nem o próprio servidor (node_modules etc.)
  if (!arquivo.startsWith(RAIZ + sep) || arquivo.startsWith(join(RAIZ, 'servidor') + sep)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(corpo);
  } catch (e) {
    res.writeHead(404).end('não encontrado');
  }
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`App em http://localhost:${PORTA}  (deixe o "npm run dev" rodando em outro terminal)`);
});
