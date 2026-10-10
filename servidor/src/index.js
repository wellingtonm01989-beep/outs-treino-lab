/* ==========================================================================
   OUTS · servidor — index.js
   Worker: rotas HTTP e upgrade para WebSocket. Cada mesa é um Durable Object
   "Mesa" (mesa.js), achado pelo código do link.

     POST /mesas               cria a mesa → { codigo, tokenAnfitriao }
     GET  /mesas/CODIGO/ws     WebSocket da mesa
     GET  /                    "estou no ar" (para conferir o deploy)

   Só aceita pedidos vindos do site (GitHub Pages). Com a variável
   PERMITIR_LOCALHOST=1 (npm run dev) aceita também http://localhost:*.
   ========================================================================== */
import { RE_CODIGO, codigoNovo } from './nucleo.js';
export { Mesa } from './mesa.js';

const ORIGEM_SITE = 'https://wellingtonm01989-beep.github.io';
const MAX_CORPO = 2048;          // bytes no POST /mesas
const MAX_PREMIO = 1000000;      // R$ 10.000,00 em centavos (só informativo: o dinheiro fica fora do app)

function origemPermitida(origem, env) {
  if (origem === ORIGEM_SITE) return true;
  return env.PERMITIR_LOCALHOST === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem || '');
}

function json(obj, status, cabecalhos) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cabecalhos) });
}

/** Valida as opções da mesa; devolve { config } ou { erro }. */
function validarConfig(c) {
  if (!c || typeof c !== 'object') return { erro: 'Opções da mesa ausentes.' };
  const lugares = c.lugares, fichas = c.fichas;
  if (!Number.isInteger(lugares) || lugares < 2 || lugares > 9) return { erro: 'A mesa precisa ter de 2 a 9 lugares.' };
  if (!Number.isInteger(fichas) || fichas < 500 || fichas > 100000) return { erro: 'Fichas iniciais inválidas.' };
  if (c.velocidade !== 'regular' && c.velocidade !== 'turbo') return { erro: 'Velocidade inválida.' };
  // prêmio total fixo em centavos, combinado pelo anfitrião (0 = sem premiação)
  const premio = c.premio === undefined ? 0 : c.premio;
  if (!Number.isInteger(premio) || premio < 0 || premio > MAX_PREMIO) return { erro: 'Premiação inválida (de R$ 0 a R$ 10.000).' };
  return { config: { lugares, fichas, velocidade: c.velocidade, premio, bots: c.bots === true } };
}

async function criarMesa(req, env, cors) {
  if (+(req.headers.get('Content-Length') || 0) > MAX_CORPO) return json({ erro: 'Pedido grande demais.' }, 413, cors);
  const texto = await req.text();
  if (texto.length > MAX_CORPO) return json({ erro: 'Pedido grande demais.' }, 413, cors);
  let corpo;
  try { corpo = JSON.parse(texto); } catch (e) { return json({ erro: 'Pedido em formato inválido.' }, 400, cors); }
  const v = validarConfig(corpo);
  if (v.erro) return json({ erro: v.erro }, 400, cors);
  // código repetido é quase impossível (31^6), mas se cair num que existe sorteia outro
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = codigoNovo();
    const mesa = env.MESAS.get(env.MESAS.idFromName(codigo));
    const tokenAnfitriao = await mesa.criar(codigo, v.config);
    if (tokenAnfitriao) return json({ codigo, tokenAnfitriao }, 201, cors);
  }
  return json({ erro: 'Não foi possível criar a mesa agora.' }, 503, cors);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origem = req.headers.get('Origin');
    const permitida = origemPermitida(origem, env);
    const cors = permitida ? { 'Access-Control-Allow-Origin': origem, 'Vary': 'Origin' } : {};

    if (url.pathname === '/mesas') {
      if (req.method === 'OPTIONS') {
        if (!permitida) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }, cors) });
      }
      if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405, cors);
      if (!permitida) return json({ erro: 'Origem não permitida.' }, 403);
      return criarMesa(req, env, cors);
    }

    const ws = /^\/mesas\/([^/]+)\/ws$/.exec(url.pathname);
    if (ws) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ erro: 'Esperado WebSocket.' }, 426);
      if (!permitida) return json({ erro: 'Origem não permitida.' }, 403);
      // código fora do formato nem chega ao Durable Object (não gasta cota)
      if (!RE_CODIGO.test(ws[1])) return json({ erro: 'Mesa não encontrada.' }, 404);
      return env.MESAS.get(env.MESAS.idFromName(ws[1])).fetch(req);
    }

    if (url.pathname === '/') return new Response('OUTS · servidor das mesas com amigos: no ar.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return json({ erro: 'Não encontrado.' }, 404);
  }
};
