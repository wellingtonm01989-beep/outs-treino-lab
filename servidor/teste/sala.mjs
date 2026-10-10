/* ==========================================================================
   OUTS · servidor — teste/sala.mjs
   Simulação da sala de espera com vários clientes WebSocket (npm test).
   Sobe o servidor com `wrangler dev` numa porta própria (com o tempo de
   abandono encurtado), roda os cenários e desliga o servidor no fim.
   Usa só o Node (fetch e WebSocket nativos), sem bibliotecas de teste.
   ========================================================================== */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 8799;
const HTTP = `http://127.0.0.1:${PORTA}`;
const WS = `ws://127.0.0.1:${PORTA}`;
const ORIGEM = 'http://localhost:8080';
const ABANDONO_MS = 3000;
const TEMPO_ACAO_MS = 2000;   // prazo de cada jogada, encurtado para os testes
const dormir = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------ servidor
const estado = mkdtempSync(join(tmpdir(), 'outs-mesas-'));
const wrangler = spawn(process.execPath, [join(PASTA, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
  '--port', String(PORTA), '--ip', '127.0.0.1', '--persist-to', estado, '--show-interactive-dev-session=false',
  '--var', 'PERMITIR_LOCALHOST:1', '--var', `ABANDONO_MS:${ABANDONO_MS}`, '--var', `TEMPO_ACAO_MS:${TEMPO_ACAO_MS}`], {
  cwd: PASTA, env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }), stdio: ['ignore', 'pipe', 'pipe']
});
let saidaServidor = '';
wrangler.stdout.on('data', d => { saidaServidor += d; });
wrangler.stderr.on('data', d => { saidaServidor += d; });

function desligar() {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${wrangler.pid} /T /F`, { stdio: 'ignore' });
    else wrangler.kill('SIGTERM');
  } catch (e) { /* já saiu */ }
  try { rmSync(estado, { recursive: true, force: true }); } catch (e) { /* arquivo preso: fica na pasta temporária */ }
}

async function esperarServidor() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    try { if ((await fetch(HTTP + '/')).ok) return; } catch (e) { /* ainda subindo */ }
    if (wrangler.exitCode !== null) break;
    await dormir(300);
  }
  throw new Error('o wrangler dev não subiu:\n' + saidaServidor);
}

// ------------------------------------------------------------- clientes
function criarMesa(config, origem = ORIGEM) {
  const headers = { 'Content-Type': 'application/json' };
  if (origem) headers.Origin = origem;
  return fetch(HTTP + '/mesas', { method: 'POST', headers, body: typeof config === 'string' ? config : JSON.stringify(config) });
}
const CONFIG = { lugares: 3, fichas: 2500, velocidade: 'turbo', premio: 2000 };

class Cliente {
  constructor(rotulo) { this.rotulo = rotulo; this.fila = []; this.ouvintes = []; }

  /** Abre a conexão. Resolve 'aberta' ou 'recusada' (fechou antes de abrir). */
  abrir(codigo, origem = ORIGEM) {
    this.ws = new WebSocket(`${WS}/mesas/${codigo}/ws`, { headers: { Origin: origem } });
    this.ws.onmessage = e => {
      const m = e.data === 'pong' ? { tipo: 'pong' } : JSON.parse(e.data);
      if (m.tipo === 'mao') this.mao = m;          // última vista recebida (para jogar)
      if (m.tipo === 'jogo') this.jogo = m;
      if (m.tipo === 'fim') this.fim = m;
      this.fila.push(m);
      this.ouvintes.forEach(f => f());
    };
    this.fechado = new Promise(r => { this.ws.onclose = e => r({ code: e.code, reason: e.reason }); });
    return Promise.race([
      new Promise(r => { this.ws.onopen = () => r('aberta'); }),
      this.fechado.then(() => 'recusada')
    ]);
  }

  enviar(obj) { this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); }

  /** Próxima mensagem que satisfaz a condição (descarta as anteriores a ela). */
  espera(cond, ms = 3000) {
    const teste = typeof cond === 'string' ? m => m.tipo === cond : cond;
    return new Promise((resolve, reject) => {
      const olhar = () => {
        const i = this.fila.findIndex(teste);
        if (i < 0) return false;
        const m = this.fila[i];
        this.fila.splice(0, i + 1);
        this.ouvintes = this.ouvintes.filter(f => f !== olhar);
        clearTimeout(timer);
        resolve(m);
        return true;
      };
      const timer = setTimeout(() => {
        this.ouvintes = this.ouvintes.filter(f => f !== olhar);
        reject(new Error(`${this.rotulo}: tempo esgotado esperando mensagem; recebidas: ${JSON.stringify(this.fila)}`));
      }, ms);
      if (!olhar()) this.ouvintes.push(olhar);
    });
  }

  /** Espera a conexão fechar e devolve o código. */
  async fechamento(ms = 3000) {
    const r = await Promise.race([this.fechado, dormir(ms).then(() => null)]);
    if (!r) throw new Error(`${this.rotulo}: a conexão deveria ter fechado`);
    return r.code;
  }

  fechar() { this.ws.close(1000); return this.fechado; }
}

/** Abre um cliente e já consome a primeira "sala". */
async function conectado(rotulo, codigo) {
  const c = new Cliente(rotulo);
  const r = await c.abrir(codigo);
  if (r !== 'aberta') throw new Error(`${rotulo}: conexão recusada`);
  await c.espera('sala');
  return c;
}

const salaCom = cond => m => m.tipo === 'sala' && cond(m);
const jogador = (sala, nome) => sala.jogadores.find(j => j.nome === nome);

// ------------------------------------------------------------- execução
const testes = [];
const teste = (nome, f) => testes.push({ nome, f });
function igual(a, b, rotulo) { if (a !== b) throw new Error(`${rotulo}: esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); }
function ok(cond, rotulo) { if (!cond) throw new Error(rotulo); }

const ctx = {};   // estado compartilhado entre os cenários da mesma mesa

teste('servidor no ar', async () => {
  const r = await fetch(HTTP + '/');
  igual(r.status, 200, 'GET /');
});

teste('criar mesa só pela origem do site', async () => {
  igual((await criarMesa(CONFIG, null)).status, 403, 'sem Origin');
  igual((await criarMesa(CONFIG, 'https://outro-site.example')).status, 403, 'outra origem');
  const pre = await fetch(HTTP + '/mesas', { method: 'OPTIONS', headers: { Origin: ORIGEM, 'Access-Control-Request-Method': 'POST' } });
  igual(pre.status, 204, 'preflight');
  igual(pre.headers.get('access-control-allow-origin'), ORIGEM, 'CORS do preflight');
});

teste('recusa opções inválidas', async () => {
  igual((await criarMesa({ lugares: 12, fichas: 1500, velocidade: 'turbo' })).status, 400, '12 lugares');
  igual((await criarMesa({ lugares: 6, fichas: 1500, velocidade: 'relampago' })).status, 400, 'velocidade');
  igual((await criarMesa({ lugares: 6, fichas: 10, velocidade: 'turbo' })).status, 400, 'fichas');
  igual((await criarMesa({ lugares: 6, fichas: 1500, velocidade: 'turbo', premio: -100 })).status, 400, 'prêmio negativo');
  igual((await criarMesa({ lugares: 6, fichas: 1500, velocidade: 'turbo', premio: 20.5 })).status, 400, 'prêmio fora de centavos');
  igual((await criarMesa({ lugares: 6, fichas: 1500, velocidade: 'turbo', premio: 1000001 })).status, 400, 'prêmio acima de R$ 10.000');
  igual((await criarMesa({ lugares: 6, fichas: 1500, velocidade: 'turbo', premio: '2000' })).status, 400, 'prêmio em texto');
  igual((await criarMesa('isso não é json')).status, 400, 'json inválido');
  igual((await criarMesa('{"x":"' + 'a'.repeat(3000) + '"}')).status, 413, 'pedido grande');
});

teste('mesa inexistente e código inválido', async () => {
  const a = new Cliente('fantasma');
  igual(await a.abrir('ZZZZZZ'), 'aberta', 'abre para explicar');
  igual((await a.espera('erro')).motivo, 'inexistente', 'motivo');
  igual(await a.fechamento(), 4404, 'código de fechamento');
  const b = new Cliente('código ruim');
  igual(await b.abrir('abc'), 'recusada', 'formato inválido nem conecta');
});

teste('WebSocket de outra origem é recusado', async () => {
  const r = await criarMesa(CONFIG);
  const { codigo } = await r.json();
  const c = new Cliente('intruso');
  igual(await c.abrir(codigo, 'https://outro-site.example'), 'recusada', 'outra origem');
  ctx.codigoExtra = codigo;
});

teste('anfitrião cria a mesa e senta no lugar 0', async () => {
  const r = await criarMesa(CONFIG);
  igual(r.status, 201, 'status');
  igual(r.headers.get('access-control-allow-origin'), ORIGEM, 'CORS');
  const { codigo, tokenAnfitriao } = await r.json();
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(codigo), 'código no formato: ' + codigo);
  ok(/^[0-9a-f]{32}$/.test(tokenAnfitriao), 'token de 128 bits');
  Object.assign(ctx, { codigo, tokenAnfitriao });
  const ana = new Cliente('Ana');
  igual(await ana.abrir(codigo), 'aberta', 'conexão');
  const sala = await ana.espera('sala');
  igual(sala.jogadores.length, 0, 'sala vazia');
  igual(sala.config.lugares, 3, 'lugares');
  igual(sala.config.fichas, 2500, 'fichas com valor livre');
  igual(sala.config.premio, 2000, 'prêmio de R$ 20,00 em centavos');
  igual(sala.status, 'espera', 'status');
  ana.enviar({ tipo: 'entrar', nome: 'Ana', token: tokenAnfitriao });
  const eu = await ana.espera('voce');
  igual(eu.lugar, 0, 'lugar do anfitrião');
  igual(eu.anfitriao, true, 'é anfitrião');
  const s2 = await ana.espera('sala');
  igual(s2.jogadores.length, 1, 'um sentado');
  ok(jogador(s2, 'Ana').conectado, 'Ana conectada');
  ctx.ana = ana;
});

teste('convidado entra pelo link só com o nome', async () => {
  const bia = new Cliente('Bia');
  await bia.abrir(ctx.codigo);
  const antes = await bia.espera('sala');
  ok(jogador(antes, 'Ana'), 'quem chega já vê a Ana');
  bia.enviar({ tipo: 'entrar', nome: 'Bia' });
  const eu = await bia.espera('voce');
  igual(eu.lugar, 1, 'lugar da Bia');
  igual(eu.anfitriao, false, 'não é anfitriã');
  ok(/^[0-9a-f]{32}$/.test(eu.token), 'recebe token para reconectar');
  const vista = await ctx.ana.espera(salaCom(s => s.jogadores.length === 2));
  ok(vista.jogadores.every(j => !('token' in j)), 'a sala nunca mostra tokens');
  ok(!JSON.stringify(vista).includes(ctx.tokenAnfitriao), 'token do anfitrião não vaza');
  Object.assign(ctx, { bia, tokenBia: eu.token });
});

teste('validação de nomes', async () => {
  const caio = await conectado('Caio', ctx.codigo);
  caio.enviar({ tipo: 'entrar', nome: 'ANA' });
  igual((await caio.espera('erro')).motivo, 'nome-repetido', 'nome repetido (maiúsculas)');
  caio.enviar({ tipo: 'entrar', nome: '   ' });
  igual((await caio.espera('erro')).motivo, 'nome', 'nome vazio');
  caio.enviar({ tipo: 'entrar', nome: 'x'.repeat(19) });
  igual((await caio.espera('erro')).motivo, 'nome', 'nome com 19 caracteres');
  caio.enviar({ tipo: 'entrar', nome: '  Caio \n​ ' });
  const eu = await caio.espera('voce');
  igual(eu.lugar, 2, 'lugar do Caio');
  const s = await caio.espera('sala');
  ok(jogador(s, 'Caio'), 'nome limpo: "Caio"');
  ctx.caio = caio;
});

teste('mesa cheia', async () => {
  const duda = await conectado('Duda', ctx.codigo);
  duda.enviar({ tipo: 'entrar', nome: 'Duda' });
  igual((await duda.espera('erro')).motivo, 'cheia', 'motivo');
  ctx.duda = duda;
});

teste('queda e reconexão com o token', async () => {
  await ctx.bia.fechar();
  const s = await ctx.ana.espera(salaCom(x => jogador(x, 'Bia') && !jogador(x, 'Bia').conectado));
  igual(s.jogadores.length, 3, 'Bia continua sentada');
  const bia2 = await conectado('Bia (volta)', ctx.codigo);
  bia2.enviar({ tipo: 'entrar', token: ctx.tokenBia });
  const eu = await bia2.espera('voce');
  igual(eu.lugar, 1, 'mesmo lugar');
  await ctx.ana.espera(salaCom(x => jogador(x, 'Bia').conectado));
  ctx.bia = bia2;
});

teste('mesma pessoa em outra aba: vale a conexão nova', async () => {
  const bia3 = await conectado('Bia (outra aba)', ctx.codigo);
  bia3.enviar({ tipo: 'entrar', token: ctx.tokenBia });
  igual((await bia3.espera('voce')).lugar, 1, 'mesmo lugar');
  igual((await ctx.bia.espera('erro')).motivo, 'outra-aba', 'aba antiga avisada');
  igual(await ctx.bia.fechamento(), 4001, 'aba antiga fechada');
  ctx.bia = bia3;
});

teste('ping respondido sem acordar a mesa', async () => {
  ctx.ana.enviar('ping');
  await ctx.ana.espera('pong');
});

teste('sair libera o lugar', async () => {
  ctx.caio.enviar({ tipo: 'sair' });
  igual(await ctx.caio.fechamento(), 1000, 'conexão do Caio fechada');
  await ctx.ana.espera(salaCom(x => x.jogadores.length === 2 && !jogador(x, 'Caio')));
  ctx.duda.enviar({ tipo: 'entrar', nome: 'Duda' });
  igual((await ctx.duda.espera('voce')).lugar, 2, 'Duda pega o lugar do Caio');
});

teste('mensagens inválidas', async () => {
  const x = await conectado('bagunça', ctx.codigo);
  x.enviar('isso não é json');
  igual((await x.espera('erro')).motivo, 'formato', 'formato');
  x.enviar({ tipo: 'apostar-tudo' });
  igual((await x.espera('erro')).motivo, 'tipo', 'tipo desconhecido');
  x.enviar('a'.repeat(2000));
  igual(await x.fechamento(), 1009, 'mensagem grande demais');
});

teste('excesso de mensagens derruba a conexão', async () => {
  const x = await conectado('metralhadora', ctx.codigo);
  for (let i = 0; i < 25; i++) x.enviar({ tipo: 'nada' });
  igual(await x.fechamento(), 4008, 'código');
});

teste('anfitrião cancela: todos saem e o link morre', async () => {
  ctx.ana.enviar({ tipo: 'sair' });
  for (const c of [ctx.ana, ctx.bia, ctx.duda]) {
    const m = await c.espera('encerrada');
    igual(m.motivo, 'cancelada', c.rotulo + ': motivo');
    igual(await c.fechamento(), 4410, c.rotulo + ': fechamento');
  }
  const depois = new Cliente('depois');
  await depois.abrir(ctx.codigo);
  igual((await depois.espera('erro')).motivo, 'inexistente', 'link não funciona mais');
});

teste('mesa abandonada é apagada pelo alarme', async () => {
  const r = await criarMesa(CONFIG);
  const { codigo, tokenAnfitriao } = await r.json();
  const a = await conectado('Ana', codigo);
  a.enviar({ tipo: 'entrar', nome: 'Ana', token: tokenAnfitriao });
  await a.espera('voce');
  await a.fechar();
  // a mesa criada no cenário da origem ninguém nunca abriu: também tem que sumir
  await dormir(ABANDONO_MS + 2000);
  for (const cod of [codigo, ctx.codigoExtra]) {
    const c = new Cliente('depois');
    await c.abrir(cod);
    igual((await c.espera('erro')).motivo, 'inexistente', cod + ' apagada');
  }
});

// ------------------------------------------------------------- partida
/** Mesa com anfitrião e convidados já sentados: [anfitrião, ...convidados]. */
async function mesaCom(nomes, config) {
  const r = await criarMesa(Object.assign({ lugares: 6, fichas: 1500, velocidade: 'turbo', premio: 2000 }, config));
  const { codigo, tokenAnfitriao } = await r.json();
  const clientes = [];
  for (let i = 0; i < nomes.length; i++) {
    const c = await conectado(nomes[i], codigo);
    c.enviar({ tipo: 'entrar', nome: nomes[i], token: i === 0 ? tokenAnfitriao : undefined });
    c.token = (await c.espera('voce')).token;
    clientes.push(c);
  }
  return { codigo, clientes };
}

const daVez = c => c.mao && c.mao.vista.acoes && !c.mao.vista.terminada ? c : null;

/** Joga pelas regras de "politica" até a condição valer (cada cliente age quando chega a vez dele). */
async function jogarAte(clientes, cond, politica, ms = 20000) {
  const t0 = Date.now(), feitas = new Map();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado jogando; última mão: ' + JSON.stringify(clientes.map(c => c.mao && { n: c.mao.numero, vez: c.mao.vista.vez })));
    for (const c of clientes) {
      const m = daVez(c);
      const chave = m && `${m.mao.numero}:${m.mao.desde + m.mao.eventos.length}`;
      if (m && feitas.get(c) !== chave) {
        feitas.set(c, chave);
        c.enviar({ tipo: 'acao', numero: m.mao.numero, acao: politica(m.mao.vista.acoes) });
      }
    }
    await dormir(15);
  }
}
const pagaTudo = v => (v.podeCheck ? 'check' : 'call');
const allin = v => (v.podeApostar ? 'allin' : v.podeCheck ? 'check' : 'call');

teste('partida: só o anfitrião começa, com 2 ou mais sentados', async () => {
  const { codigo, clientes: [ana] } = await mesaCom(['Ana']);
  ana.enviar({ tipo: 'comecar' });
  igual((await ana.espera('erro')).motivo, 'comecar', 'sozinha não começa');
  const bia = await conectado('Bia', codigo);
  bia.enviar({ tipo: 'entrar', nome: 'Bia' });
  bia.token = (await bia.espera('voce')).token;
  bia.enviar({ tipo: 'comecar' });
  igual((await bia.espera('erro')).motivo, 'comecar', 'convidada não começa');
  ana.enviar({ tipo: 'comecar' });   // mesa de 6 com 2: não precisa encher
  for (const c of [ana, bia]) {
    await c.espera(salaCom(s => s.status === 'jogando'));
    const j = await c.espera('jogo');
    igual(j.lugares, 2, c.rotulo + ': a partida usa só quem está sentado');
    igual(j.jogadores.length, 2, c.rotulo + ': jogadores');
    igual((await c.espera('mao')).numero, 1, c.rotulo + ': primeira mão');
  }
  const caio = await conectado('Caio', codigo);
  caio.enviar({ tipo: 'entrar', nome: 'Caio' });
  igual((await caio.espera('erro')).motivo, 'comecou', 'depois de começar ninguém novo senta');
  Object.assign(ctx, { p1: { codigo, ana, bia } });
});

teste('partida: cada um vê só as próprias cartas', async () => {
  const { ana, bia } = ctx.p1;
  for (const c of [ana, bia]) {
    const eu = c.jogo.meuAssento;
    c.mao.vista.jogadores.forEach(j => {
      if (j.assento === eu) ok(j.cartas && j.cartas.length === 2, c.rotulo + ': vê as próprias cartas');
      else ok(j.cartas === null, c.rotulo + ': não vê as cartas do outro');
    });
    ok(!JSON.stringify(c.mao).includes('baralho'), 'o baralho nunca sai do servidor');
  }
  igual(ana.jogo.meuAssento === bia.jogo.meuAssento, false, 'assentos diferentes');
});

teste('partida: jogada fora da vez é recusada', async () => {
  const { ana, bia } = ctx.p1;
  const fora = daVez(ana) ? bia : ana;
  fora.enviar({ tipo: 'acao', numero: fora.mao.numero, acao: 'fold' });
  igual((await fora.espera('erro')).motivo, 'acao', 'erro');
  const m = await fora.espera('mao');
  igual(m.eventos.length, 0, 'recebe a vista de novo, sem eventos');
});

teste('partida: a jogada vale para os dois (e quem está na vez recebe o prazo)', async () => {
  const { ana, bia } = ctx.p1;
  const vez = daVez(ana) || daVez(bia);
  ok(vez, 'alguém está na vez');
  ok(vez.mao.prazo > 0 && vez.mao.prazo <= TEMPO_ACAO_MS, 'prazo em ms: ' + vez.mao.prazo);
  const n = vez.mao.numero;
  vez.enviar({ tipo: 'acao', numero: n, acao: 'call' });
  for (const c of [ana, bia]) {
    const m = await c.espera(x => x.tipo === 'mao' && x.eventos.some(e => e.tipo === 'acao' && e.acao === 'call'));
    igual(m.numero, n, c.rotulo + ': mesma mão');
  }
});

teste('partida: prazo esgotado sem resposta é fold', async () => {
  const { ana, bia } = ctx.p1;
  await dormir(100);
  const vez = daVez(ana) || daVez(bia);
  ok(vez, 'alguém está na vez');
  const meu = vez.jogo.meuAssento;
  // ninguém joga: o servidor joga por quem está na vez quando o prazo acaba
  const m = await ana.espera(x => x.tipo === 'mao' && x.eventos.some(e => e.tipo === 'acao' && e.assento === meu), TEMPO_ACAO_MS + 3000);
  const ev = m.eventos.find(e => e.tipo === 'acao' && e.assento === meu);
  igual(ev.acao, 'fold', 'jogada automática');
});

teste('partida: quem reconecta recebe a mão inteira e o placar', async () => {
  const { codigo, bia } = ctx.p1;
  await bia.fechar();
  const volta = await conectado('Bia (volta)', codigo);
  volta.enviar({ tipo: 'entrar', token: bia.token });
  await volta.espera('voce');
  const j = await volta.espera('jogo');
  ok(j.jogadores.some(x => x.nome === 'Bia'), 'placar');
  const m = await volta.espera('mao');
  igual(m.desde, 0, 'desde o começo');
  igual(m.eventos[0].tipo, 'inicio', 'primeiro evento é o início da mão');
  ok(m.vista.jogadores.find(x => x.assento === j.meuAssento).cartas.length === 2, 'as próprias cartas de volta');
  volta.token = bia.token;
  ctx.p1.bia = volta;
  ctx.p1.biaVoltou = true;
});

teste('partida: até o fim, com colocação e premiação', async () => {
  const { ana, bia, biaVoltou } = ctx.p1;
  ok(biaVoltou, 'depende do cenário da reconexão');
  await jogarAte([ana, bia], () => ana.fim && bia.fim, allin, 30000);
  const c = ana.fim.classificacao;
  igual(c.length, 2, 'dois classificados');
  igual(c[0].posicao, 1, '1º');
  igual(c[0].premio, 2000, '2 jogadores: o campeão leva os R$ 20,00');
  igual(c[1].premio, 0, '2º sem prêmio');
  igual(JSON.stringify(bia.fim), JSON.stringify(ana.fim), 'os dois veem o mesmo resultado');
  const campeao = ana.jogo.jogadores.find(x => x.posicao === 1);
  igual(campeao.fichas, 3000, 'o campeão fica com todas as fichas');
  ana.enviar({ tipo: 'acao', numero: 1, acao: 'fold' });
  igual((await ana.espera('erro')).motivo, 'acao', 'depois do fim não há jogada');
});

teste('partida: quem sai fica fora (a mesa espera o prazo e dá fold) e volta quando quiser', async () => {
  const { codigo, clientes: [ana, bia, caio] } = await mesaCom(['Ana', 'Bia', 'Caio']);
  ana.enviar({ tipo: 'comecar' });
  for (const c of [ana, bia, caio]) await c.espera('mao');
  const assentoCaio = caio.jogo.meuAssento;
  caio.enviar({ tipo: 'sair' });
  const placar = await caio.espera(m => m.tipo === 'jogo' && m.jogadores[assentoCaio].fora);
  igual(placar.jogadores[assentoCaio].desistiu, false, 'sair não é desistir');
  // com o Caio fora, a vez dele espera o prazo inteiro, como a de todo mundo; quando o
  // tempo acaba, a mesa dá fold por ele (nunca check, nem quando ele poderia passar no BB)
  let vezDoCaio = 0, menorEspera = Infinity, folds = 0, checks = 0;
  ana.ouvintes.push(() => {
    const m = ana.fila[ana.fila.length - 1];
    if (!m || m.tipo !== 'mao') return;
    for (const ev of m.eventos) if (ev.tipo === 'acao' && ev.assento === assentoCaio) {
      if (vezDoCaio) menorEspera = Math.min(menorEspera, Date.now() - vezDoCaio);
      vezDoCaio = 0;
      if (ev.acao === 'fold') folds++;
      if (ev.acao === 'check') checks++;
    }
    if (!m.vista.terminada && m.vista.vez === assentoCaio && !vezDoCaio) vezDoCaio = Date.now();
  });
  const n0 = ana.jogo.numero;
  await jogarAte([ana, bia], () => folds >= 2 || ana.fim, pagaTudo, 30000);
  ok(folds >= 2 && checks === 0, `Caio fora: fold quando o tempo acaba, nunca check (${folds} folds, ${checks} checks)`);
  ok(menorEspera >= TEMPO_ACAO_MS - 300, 'a mesa esperou o prazo do Caio: ' + menorEspera + ' ms');
  ok(ana.jogo.numero > n0, 'as mãos seguem');
  ok(!ana.fim && ana.jogo.jogadores[assentoCaio].posicao === null, 'Caio continua no jogo');
  // volta pelo botão (mesma conexão)
  caio.enviar({ tipo: 'entrar', token: caio.token, voltar: true });
  // (os placares de antes, com ele fora, ficam para trás na fila)
  await caio.espera(m => m.tipo === 'jogo' && !m.jogadores[assentoCaio].fora);
  // fechou a aba e perdeu o token: volta pelo mesmo nome
  await caio.fechar();
  const volta = await conectado('Caio (outro aparelho)', codigo);
  volta.enviar({ tipo: 'entrar', nome: 'caio', voltar: true });
  igual((await volta.espera('voce')).token, caio.token, 'mesmo lugar, mesmo token');
  igual((await volta.espera('jogo')).meuAssento, assentoCaio, 'mesmo assento');
  // não toma o lugar de quem está conectado
  const intruso = await conectado('Intruso', codigo);
  intruso.enviar({ tipo: 'entrar', nome: 'Bia', voltar: true });
  igual((await intruso.espera('erro')).motivo, 'conectado', 'Bia está conectada');
  intruso.enviar({ tipo: 'entrar', nome: 'Zé' });
  igual((await intruso.espera('erro')).motivo, 'comecou', 'nome que não está na partida');
});

async function rodar() {
  try {
    await esperarServidor();
  } catch (e) {
    console.log(e.message);
    desligar();
    process.exit(1);
  }
  console.log(`servidor de teste em ${HTTP}\n`);
  let falhas = 0;
  for (const t of testes) {
    const t0 = Date.now();
    try {
      await t.f();
      console.log(`  ✓ ${t.nome} (${Date.now() - t0} ms)`);
    } catch (e) {
      falhas++;
      console.log(`  ✗ ${t.nome}\n      ${e.message}`);
    }
  }
  desligar();
  console.log(`\n${testes.length - falhas} de ${testes.length} cenários ok`);
  process.exit(falhas ? 1 : 0);
}
rodar();
