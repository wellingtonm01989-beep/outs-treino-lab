/* ==========================================================================
   OUTS · servidor — teste/cartas.mjs
   Testes das partidas de cartas da mesa com amigos (src/jogos/cartas.js com
   truco.js e ultima.js) direto no Node, sem o wrangler: uma "sala" de
   mentira (gravação em memória, conexões de mentira) e jogadores que
   respondem cada pedido com uma jogada válida sorteada.
   Confere: partidas inteiras até o fim; depois de jogadas sorteadas, o
   objeto "dorme" (perde a memória) e acorda refazendo a mão pelo que foi
   gravado — o pedido em aberto e os passos têm de sair iguais; ninguém
   recebe o que não pode ver (carta coberta, cartas compradas dos outros);
   prazo esgotado; jogada inválida recusada; parceiro respondendo no truco.
   ========================================================================== */
import { P } from '../src/nucleo.js';
import { PartidaCartas } from '../src/jogos/cartas.js';
import { truco } from '../src/jogos/truco.js';
import { ultima } from '../src/jogos/ultima.js';
import { jogadaTruco, jogadaUltima } from './jogadas.mjs';

let falhas = 0, total = 0;
async function teste(nome, f) {
  total++;
  const t0 = Date.now();
  try { await f(); console.log(`  ✓ ${nome} (${Date.now() - t0} ms)`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${e.stack || e.message}`); }
}
function ok(c, msg) { if (!c) throw new Error(msg); }
const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const sorteio = n => P.RNG.inteiroAbaixo(n);
const um = lista => lista[sorteio(lista.length)];

// ----------------------------------------------------- sala de mentira
class Conexao {
  constructor(token) { this.token = token; this.msgs = []; this.readyState = 1; }
  send(s) { this.msgs.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  deserializeAttachment() { return { token: this.token }; }
  ultimas(tipo) { return this.msgs.filter(m => m.tipo === tipo); }
}

class Gravacao {
  constructor() { this.dados = new Map(); this.alarme = null; }
  async get(chaves) { const m = new Map(); chaves.forEach(k => { if (this.dados.has(k)) m.set(k, copia(this.dados.get(k))); }); return m; }
  async put(a, b) { if (typeof a === 'string') this.dados.set(a, copia(b)); else Object.keys(a).forEach(k => this.dados.set(k, copia(a[k]))); }
  async getAlarm() { return this.alarme; }
  async setAlarm(t) { this.alarme = t; }
}

class SalaFalsa {
  constructor(config, nomes, regras) {
    this.ctx = { storage: new Gravacao() };
    this.tempoAcao = 30000;
    this.folgas = { mao: 5000, acao: 5000 };
    this.regras = regras;
    this.conexoes = nomes.map((n, i) => new Conexao('t' + i));
    this.estado = { codigo: 'ABCDEF', config, status: 'espera', jogadores: nomes.map((nome, i) => ({ token: 't' + i, nome, lugar: i, anfitriao: i === 0 })) };
    this.partida = new PartidaCartas(this, regras);
  }
  async salvar() { await this.ctx.storage.put('estado', this.estado); }
  async terminar() { this.estado.status = 'fim'; await this.salvar(); }
  abertos() { return this.conexoes.filter(c => c.readyState === 1); }
  conectados() { return new Set(this.abertos().map(c => c.token)); }
  async agendarAlarme(t) { const a = await this.ctx.storage.getAlarm(); if (a === null || a > t) await this.ctx.storage.setAlarm(t); }
  transmitirSala() {}
  erro(ws, motivo, texto) { ws.send(JSON.stringify({ tipo: 'erro', motivo, texto })); }
  fecharConexao() {}
  async comecar() { this.estado.status = 'jogando'; await this.partida.comecar(); }
  /** Dorme e acorda: memória perdida, tudo volta do que foi gravado. */
  async dormir() {
    const antes = this.partida;
    const salvo = await this.ctx.storage.get(['estado', 'log']);
    this.estado = salvo.get('estado');
    this.partida = new PartidaCartas(this, this.regras);
    await this.partida.acordar(salvo);
    const depois = this.partida;
    if (this.estado.status !== 'jogando') return;
    ok(!!depois.pedido === !!antes.pedido, 'acordou sem o pedido em aberto');
    ok(depois.pedido.id === antes.pedido.id && depois.pedido.metodo === antes.pedido.metodo && depois.pedido.assento === antes.pedido.assento,
      `pedido diferente ao acordar: ${JSON.stringify([antes.pedido.id, antes.pedido.metodo, antes.pedido.assento])} → ${JSON.stringify([depois.pedido.id, depois.pedido.metodo, depois.pedido.assento])}`);
    ok(depois.passos.length === antes.passos.length, `passos diferentes ao acordar: ${antes.passos.length} → ${depois.passos.length}`);
    const ult = p => JSON.stringify(p.passos[p.passos.length - 1].vistas);
    ok(ult(depois) === ult(antes), 'a vista do último passo mudou ao acordar');
  }
}

/** O pedido em aberto para a conexão c (o último "passos" que ela recebeu), se for com ela. */
function pedidoDe(c) {
  const ps = c.ultimas('passos');
  if (!ps.length) return null;
  const m = ps[ps.length - 1];
  if (!m.aberto) return null;
  for (let k = ps.length - 1; k >= 0; k--) {
    const achado = ps[k].passos.slice().reverse().find(p => p.pedido && p.pedido.id === m.aberto.id);
    if (achado) return achado.pedido.comigo ? achado : null;
  }
  return null;
}

/**
 * Joga até o fim respondendo cada pedido. dormir: chance de o objeto dormir
 * depois de cada jogada. Confere em cada mensagem o que não pode vazar.
 */
async function jogarAteOFim(sala, jogada, { dormir = 0.3, prazo = 0, conferir } = {}) {
  for (let passo = 0; passo < 20000 && sala.estado.status === 'jogando'; passo++) {
    // de vez em quando ninguém responde: o prazo acaba
    if (prazo && P.RNG.real() < prazo) {
      const p = sala.partida;
      p.prazo = Date.now() - 1;
      await p.alarme();
    } else {
      const quem = sala.conexoes.map((c, i) => [c, pedidoDe(c), i]).filter(x => x[1]);
      ok(quem.length, 'ninguém tem pedido em aberto e a partida não acabou');
      const [c, pp] = um(quem);
      const valor = jogada(pp.pedido.metodo, pp.vista, pp.pedido.extra);
      await sala.partida.mensagem(c, { tipo: 'decisao', id: pp.pedido.id, valor });
    }
    if (conferir) sala.conexoes.forEach((c, i) => conferir(c, i));
    if (sala.estado.status === 'jogando' && P.RNG.real() < dormir) await sala.dormir();
  }
  ok(sala.estado.status === 'fim', 'a partida não terminou');
  return sala.estado.jogo.resultado;
}

/** Truco: a carta coberta de outro jogador nunca chega; no fim da mão, só o que cada um mostrou. */
function conferirTruco(c, eu) {
  for (const m of c.msgs.splice(0)) {
    c.lidas = (c.lidas || []).concat([m]);
    if (m.tipo !== 'passos') continue;
    for (const p of m.passos) {
      if (p.ev && p.ev.tipo === 'jogada' && p.ev.coberta && p.ev.j !== 0) ok(p.ev.carta === null, 'vazou a carta coberta');
      if (p.vista && p.vista.jogadas) p.vista.jogadas.forEach(r => r.forEach(x => { if (x.coberta && x.j !== 0) ok(x.carta === null, 'vazou carta coberta na vista'); }));
      if (p.vista) ok(p.vista.eu === 0, 'a vista não está girada para o jogador');
    }
  }
  c.msgs = c.lidas.slice(-30);   // só o recente, para achar o pedido em aberto
  c.lidas = c.msgs.slice();
}

/** Última!: as cartas que os outros compram nunca chegam; a mão dos outros não aparece na vista. */
function conferirUltima(c) {
  for (const m of c.msgs.splice(0)) {
    c.lidas = (c.lidas || []).concat([m]);
    if (m.tipo !== 'passos') continue;
    for (const p of m.passos) {
      if (p.ev && p.ev.tipo === 'compra' && p.ev.j !== 0) ok(p.ev.cartas.length === 0, 'vazou carta comprada de outro');
      if (p.vista) { ok(p.vista.eu === 0, 'a vista não está girada'); ok(!('historico' in p.vista), 'o histórico foi junto'); ok(!('maos' in p.vista), 'as mãos dos outros foram juntas'); }
    }
  }
  c.msgs = c.lidas.slice(-30);
  c.lidas = c.msgs.slice();
}

// ------------------------------------------------------------- testes
console.log('Truco');
await teste('1 contra 1 (paulista) até o fim, dormindo no meio', async () => {
  const sala = new SalaFalsa({ jogo: 'truco', lugares: 2, regras: 'paulista' }, ['Ana', 'Bia'], truco);
  await sala.comecar();
  const r = await jogarAteOFim(sala, jogadaTruco, { conferir: conferirTruco });
  ok(r.placar[r.vencedor] >= 12, 'placar final: ' + JSON.stringify(r));
});

await teste('dupla (paranaense, com troca na mão de 11) até o fim, dormindo no meio', async () => {
  for (let k = 0; k < 3; k++) {
    const sala = new SalaFalsa({ jogo: 'truco', lugares: 4, regras: 'paranaense' }, ['Ana', 'Bia', 'Caio', 'Duda'], truco);
    await sala.comecar();
    const r = await jogarAteOFim(sala, jogadaTruco, { conferir: conferirTruco });
    ok(r.equipes[0].join() === 'Ana,Caio' && r.equipes[1].join() === 'Bia,Duda', 'equipes: ' + JSON.stringify(r.equipes));
  }
});

await teste('prazos esgotados no meio da partida (carta mais fraca, correr)', async () => {
  const sala = new SalaFalsa({ jogo: 'truco', lugares: 4, regras: 'paulista' }, ['Ana', 'Bia', 'Caio', 'Duda'], truco);
  await sala.comecar();
  await jogarAteOFim(sala, jogadaTruco, { prazo: 0.3, conferir: conferirTruco });
});

await teste('na dupla, o parceiro também pode responder ao truco', async () => {
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const sala = new SalaFalsa({ jogo: 'truco', lugares: 4, regras: 'paulista' }, ['Ana', 'Bia', 'Caio', 'Duda'], truco);
    await sala.comecar();
    // quem está na vez pede truco, se puder
    const naVez = sala.conexoes.map((c, i) => [c, pedidoDe(c), i]).find(x => x[1]);
    if (!naVez || !naVez[1].vista.podeTrucar) continue;
    await sala.partida.mensagem(naVez[0], { tipo: 'decisao', id: naVez[1].pedido.id, valor: { tipo: 'truco' } });
    const quem = sala.partida.pedido.quem;
    ok(quem.length === 2 && (quem[0] + 2) % 4 === quem[1], 'o pedido de resposta tem de ir para os dois parceiros: ' + JSON.stringify(quem));
    const parceiro = sala.conexoes[quem[1]];
    const pp = pedidoDe(parceiro);
    ok(pp && pp.pedido.metodo === 'responder', 'o parceiro não recebeu o pedido');
    await sala.partida.mensagem(parceiro, { tipo: 'decisao', id: pp.pedido.id, valor: 'aceitar' });
    const ev = sala.partida.passos.map(p => p.ev).filter(Boolean).find(e => e.tipo === 'resposta');
    ok(ev && ev.j === quem[1] && ev.resposta === 'aceitar', 'a resposta saiu com o nome errado: ' + JSON.stringify(ev));
    // o primeiro respondeu: o pedido do outro parceiro não vale mais
    const outro = sala.conexoes[quem[0]];
    await sala.partida.mensagem(outro, { tipo: 'decisao', id: pp.pedido.id, valor: 'correr' });
    ok(outro.msgs.some(m => m.tipo === 'erro' && m.motivo === 'acao'), 'a resposta atrasada deveria ser recusada');
    return;
  }
  throw new Error('não saiu nenhuma vez em que desse para pedir truco');
});

await teste('jogada inválida é recusada e o pedido continua em aberto', async () => {
  const sala = new SalaFalsa({ jogo: 'truco', lugares: 2, regras: 'paulista' }, ['Ana', 'Bia'], truco);
  await sala.comecar();
  const [c, pp] = sala.conexoes.map(c => [c, pedidoDe(c)]).find(x => x[1]);
  const id = sala.partida.pedido.id;
  for (const valor of [{ tipo: 'carta', carta: 999 }, { tipo: 'carta' }, 'aceitar', null, { tipo: 'truco', extra: 1 }].filter(v => !(v && v.tipo === 'truco' && pp.vista.podeTrucar))) {
    await sala.partida.mensagem(c, { tipo: 'decisao', id, valor });
    ok(sala.partida.pedido && sala.partida.pedido.id === id, 'o pedido não deveria ter andado com ' + JSON.stringify(valor));
  }
  ok(c.msgs.filter(m => m.tipo === 'erro' && m.repetir).length >= 3, 'faltou avisar que a jogada não vale');
  // quem não está na vez também não joga
  const outro = sala.conexoes.find(x => x !== c);
  await sala.partida.mensagem(outro, { tipo: 'decisao', id, valor: { tipo: 'carta', carta: 0 } });
  ok(sala.partida.pedido.id === id, 'jogada fora da vez andou');
});

console.log('Última!');
await teste('de 2 a 6 jogadores, uma mão, dormindo no meio', async () => {
  for (let n = 2; n <= 6; n++) {
    const nomes = ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabi'].slice(0, n);
    const sala = new SalaFalsa({ jogo: 'ultima', lugares: n, ate: 0, comprarAtePoder: n % 2 === 0, juntas: n > 3 }, nomes, ultima);
    await sala.comecar();
    const r = await jogarAteOFim(sala, jogadaUltima, { dormir: 0.15, conferir: conferirUltima });
    ok(r.vencedor >= 0 && r.vencedor < n, 'vencedor: ' + JSON.stringify(r));
  }
});

await teste('partida até 200 pontos, com prazos esgotados', async () => {
  const sala = new SalaFalsa({ jogo: 'ultima', lugares: 3, ate: 200, comprarAtePoder: false, juntas: true }, ['Ana', 'Bia', 'Caio'], ultima);
  await sala.comecar();
  const r = await jogarAteOFim(sala, jogadaUltima, { dormir: 0.05, prazo: 0.05, conferir: conferirUltima });
  ok(r.placar[r.vencedor] >= 200, 'placar final: ' + JSON.stringify(r));
});

console.log(`\n${total - falhas} de ${total} testes ok`);
if (falhas) process.exit(1);
