/* ==========================================================================
   OUTS · servidor — teste/jogo.mjs
   Testes das regras do jogo (src/jogo.js) direto no Node, sem servidor:
   blinds proporcionais, refazer a mão pelas jogadas gravadas (como depois
   da hibernação), eliminação, colocação, fim e premiação.
   ========================================================================== */
import { P } from '../src/nucleo.js';
import * as Jogo from '../src/jogo.js';

let falhas = 0, total = 0;
function teste(nome, f) {
  total++;
  try { f(); console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${e.stack || e.message}`); }
}
function ok(c, msg) { if (!c) throw new Error(msg); }
const json = x => JSON.stringify(x);

const sentados = n => Array.from({ length: n }, (_, i) => ({ token: 't' + i, nome: 'J' + i, lugar: [0, 2, 3, 5, 6, 7, 8, 1, 4][i] }));
const CONFIG = { lugares: 9, fichas: 1500, velocidade: 'turbo', premio: 2000 };

/** Jogada aleatória válida (inclui apostas de tamanhos variados e all-in). */
function jogadaAleatoria(m) {
  const v = m.acoesValidas();
  const r = P.RNG.real();
  if (r < 0.15) return 'fold';
  if (r < 0.6 || !v.podeApostar) return v.podeCheck ? 'check' : 'call';
  if (r < 0.7) return 'allin';
  return { tipo: v.tipoAposta, ate: v.minAte + P.RNG.inteiroAbaixo(Math.max(1, v.maxAte - v.minAte + 1)) };
}

teste('blinds proporcionais às fichas iniciais (com 1.500 é a estrutura do app)', () => {
  for (let i = 0; i < 25; i++) ok(json(P.Estruturas.nivelSNGProporcional(i, 1500)) === json(P.Estruturas.nivelSNG(i)), 'nível ' + i);
  for (const stack of [500, 2500, 3000, 5000, 100000]) {
    for (let i = 0; i < 25; i++) {
      const b = P.Estruturas.nivelSNGProporcional(i, stack);
      ok(Number.isInteger(b.sb) && Number.isInteger(b.bb) && Number.isInteger(b.ante), 'inteiros');
      ok(b.sb >= 1 && b.sb < b.bb, `sb < bb (${stack}, nível ${i}: ${b.sb}/${b.bb})`);
    }
  }
  const b = P.Estruturas.nivelSNGProporcional(0, 3000);
  ok(b.sb === 20 && b.bb === 40, '3.000 fichas começa em 20/40: ' + json(b));
});

teste('assentos seguem a ordem dos lugares e a premiação é congelada no começo', () => {
  const j = Jogo.criarJogo(CONFIG, sentados(4), 0);
  ok(json(j.jogadores.map(x => x.nome)) === json(['J0', 'J1', 'J2', 'J3']), 'ordem: ' + json(j.jogadores.map(x => x.nome)));
  ok(json(j.premios) === json([1300, 700]), '4 jogadores: 65/35 de R$ 20: ' + json(j.premios));
  ok(j.jogadores.every(x => x.fichas === 1500), 'fichas iniciais');
  ok(json(Jogo.criarJogo(Object.assign({}, CONFIG, { premio: 0 }), sentados(2), 0).premios) === '[]', 'sem premiação');
});

teste('a mão refeita pelas jogadas gravadas é idêntica (como depois da hibernação)', () => {
  let comparacoes = 0;
  for (let partida = 0; partida < 30; partida++) {
    const jogo = Jogo.criarJogo(CONFIG, sentados(2 + partida % 8), 0);
    let fim = false;
    for (let mao = 0; mao < 40 && !fim; mao++) {
      const m = Jogo.novaMao(jogo, mao * 20000);
      const acoes = [];
      while (!m.terminada()) {
        const vez = m.vez();
        const acao = jogadaAleatoria(m);
        m.agir(vez, acao);
        acoes.push({ assento: vez, acao });
        // "dorme e acorda": tudo vira JSON e a mão é refeita do zero
        const salvo = JSON.parse(json({ mao: jogo.mao, acoes }));
        const r = Jogo.motorDaMao(salvo.mao, salvo.acoes);
        for (const a of [null, 0, 1]) ok(json(r.vista(a)) === json(m.vista(a)), `vista diferente (partida ${partida}, mão ${mao}, assento ${a})`);
        comparacoes++;
      }
      fim = Jogo.concluirMao(jogo, m).fim;
    }
  }
  ok(comparacoes > 300, 'poucas comparações: ' + comparacoes);
});

teste('cada jogador só vê as próprias cartas', () => {
  const jogo = Jogo.criarJogo(CONFIG, sentados(5), 0);
  const m = Jogo.novaMao(jogo, 0);
  for (let a = 0; a < 5; a++) {
    const v = m.vista(a);
    v.jogadores.forEach(x => ok(x.assento === a ? x.cartas && x.cartas.length === 2 : x.cartas === null, `assento ${a} vendo cartas de ${x.assento}`));
    ok(!json(v).includes('baralho'), 'baralho não aparece na vista');
  }
});

teste('eliminação, colocação, fim e prêmios (todo mundo all-in até sobrar um)', () => {
  for (let k = 0; k < 50; k++) {
    const n = 2 + k % 8;
    const jogo = Jogo.criarJogo(Object.assign({}, CONFIG, { fichas: 500 }), sentados(n), 0);
    let fim = false, maos = 0;
    while (!fim) {
      ok(++maos < 2000, 'não terminou');
      const m = Jogo.novaMao(jogo, maos * 60000);
      while (!m.terminada()) { const v = m.acoesValidas(); m.agir(m.vez(), v.podeApostar ? 'allin' : v.podeCheck ? 'check' : 'call'); }
      const r = Jogo.concluirMao(jogo, m);
      fim = r.fim;
      const fichas = jogo.jogadores.reduce((s, j) => s + j.fichas, 0);
      ok(fichas === 500 * n, 'fichas não se perdem: ' + fichas);
    }
    const c = Jogo.classificacao(jogo);
    ok(c.length === n, 'todos classificados');
    ok(json(c.map(x => x.posicao)) === json(Array.from({ length: n }, (_, i) => i + 1)), 'posições 1..n: ' + json(c.map(x => x.posicao)));
    ok(c.reduce((s, x) => s + x.premio, 0) === 2000, 'prêmio total distribuído');
    ok(jogo.jogadores.filter(j => j.fichas > 0).length === 1 && c[0].assento === jogo.jogadores.find(j => j.fichas > 0).assento, 'o campeão tem todas as fichas');
  }
});

teste('quem desiste sai no fim da mão com a pior colocação', () => {
  const jogo = Jogo.criarJogo(CONFIG, sentados(3), 0);
  const m = Jogo.novaMao(jogo, 0);
  jogo.jogadores[1].desistiu = true;
  while (!m.terminada()) m.agir(m.vez(), m.vez() === 1 ? 'fold' : Jogo.acaoAutomatica(m));
  const r = Jogo.concluirMao(jogo, m);
  ok(r.eliminados.length === 1 && r.eliminados[0].assento === 1 && jogo.jogadores[1].posicao === 3, 'desistente em 3º');
  ok(jogo.jogadores[1].fichas === 0 && !r.fim, 'fichas do desistente saem e o jogo segue');
  // os dois que sobraram desistem juntos: um deles fica para vencer
  const m2 = Jogo.novaMao(jogo, 0);
  jogo.jogadores[0].desistiu = jogo.jogadores[2].desistiu = true;
  while (!m2.terminada()) m2.agir(m2.vez(), 'fold');
  const r2 = Jogo.concluirMao(jogo, m2);
  ok(r2.fim && Jogo.restantes(jogo).length === 0 && Jogo.classificacao(jogo).length === 3, 'termina com campeão');
});

teste('jogadas recebidas são limpas', () => {
  ok(Jogo.acaoLimpa('fold') === 'fold' && Jogo.acaoLimpa('allin') === 'allin', 'texto');
  ok(json(Jogo.acaoLimpa({ tipo: 'raise', ate: 300, extra: 'x' })) === json({ tipo: 'raise', ate: 300 }), 'objeto');
  ok(Jogo.acaoLimpa({ tipo: 'raise', ate: 1.5 }) === null && Jogo.acaoLimpa('apostar') === null && Jogo.acaoLimpa(null) === null, 'inválidas');
});

console.log(`\n${total - falhas} de ${total} testes das regras ok`);
process.exit(falhas ? 1 : 0);
