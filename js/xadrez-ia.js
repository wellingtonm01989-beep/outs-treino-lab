/* ==========================================================================
   OUTS · Treino Lab — xadrez-ia.js
   Os adversários do xadrez: a busca roda num Web Worker (a tela não trava);
   se o navegador não deixar criar o worker, roda na própria página.

   Níveis: do Iniciante (olha 1 lance e erra bastante) ao Mestre (busca
   completa por alguns segundos). Nos níveis de baixo o bot escolhe entre os
   lances quase tão bons quanto o melhor, com uma "margem de erro"; nos de
   cima joga o melhor. No começo da partida, os bots variam as aberturas
   (um livrinho de linhas conhecidas) para nenhuma partida sair igual.
   ========================================================================== */
(function (P) {
  'use strict';

  const X = P.Xadrez;
  const RNG = P.RNG;

  // ----------------------------------------------------------------- worker
  let proximoId = 1;
  function criarCanal() {
    let w = null;
    const pendentes = new Map();
    try {
      const url = URL.createObjectURL(new Blob(['(' + X.fonteNucleo.toString() + ')({}, true);'], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = e => { const p = pendentes.get(e.data.id); if (!p) return; pendentes.delete(e.data.id); if (e.data.ok) p.res(e.data.r); else p.rej(new Error(e.data.erro)); };
      w.onerror = () => { w = null; pendentes.forEach(p => p.rej(new Error('worker'))); pendentes.clear(); };
    } catch (e) { w = null; }
    return {
      /** Busca numa posição: fen inicial + lances (UCI) até agora. */
      buscar(fen, lances, opts) {
        if (w) {
          const id = proximoId++;
          return new Promise((res, rej) => { pendentes.set(id, { res, rej }); w.postMessage({ id, fen, lances, opts }); })
            .catch(() => buscarAqui(fen, lances, opts));
        }
        return new Promise(res => setTimeout(() => res(buscarAqui(fen, lances, opts)), 20));
      },
      encerrar() { if (w) w.terminate(); w = null; pendentes.clear(); },
      temWorker: () => !!w
    };
  }
  /** Sem worker: busca aqui mesmo (mais curta, para não travar a tela por muito tempo). */
  function buscarAqui(fen, lances, opts) {
    const pos = new X.Posicao(fen);
    (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
    return X.buscar(pos, Object.assign({}, opts, { tempo: Math.min(opts.tempo || 800, 900) }));
  }

  // ------------------------------------------------------------------ níveis
  const NIVEIS = [
    { id: 1, nome: 'Iniciante', descricao: 'Olha só um lance à frente e erra bastante: bom para quem está aprendendo.', tempo: 250, profundidade: 1, margem: 220, erro: 0.25 },
    { id: 2, nome: 'Casual', descricao: 'Vê ameaças simples, mas ainda deixa peça para trás de vez em quando.', tempo: 400, profundidade: 2, margem: 110, erro: 0.1 },
    { id: 3, nome: 'Clube', descricao: 'Joga como um bom jogador de clube: raramente entrega material.', tempo: 700, profundidade: 4, margem: 45, erro: 0.03 },
    { id: 4, nome: 'Forte', descricao: 'Calcula vários lances à frente; é preciso jogar bem para ganhar.', tempo: 1300, profundidade: 64, margem: 12, erro: 0 },
    { id: 5, nome: 'Mestre', descricao: 'Busca completa por alguns segundos em cada lance. O mais forte.', tempo: 2600, profundidade: 64, margem: 0, erro: 0 }
  ];
  const nivel = id => NIVEIS.find(n => n.id === +id) || NIVEIS[3];

  // -------------------------------------------------------------- aberturas
  // linhas conhecidas (UCI): Italiana, Espanhola, Siciliana, Francesa, Caro-Kann, Gambito da Dama, Índia do Rei, Inglesa, Escandinava...
  const LIVRO = [
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
    'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7',
    'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5 c4d5 f6d5',
    'g1f3 d7d5 g2g3 g8f6 f1g2 c7c6 e1g1 c8g4',
    'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6 f2f4 g8f6',
    'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6 g1f3 f8e7'
  ].map(l => l.split(' '));
  /** Próximo lance do livro, se a partida até aqui seguir alguma linha (sorteado entre as linhas). */
  function doLivro(lancesUci) {
    const n = lancesUci.length;
    const opcoes = LIVRO.filter(l => l.length > n && lancesUci.every((u, i) => l[i] === u)).map(l => l[n]);
    return opcoes.length ? RNG.escolher(opcoes) : null;
  }

  /**
   * O lance do bot. jogo: { fen (inicial), lances (UCI) }, nivelId.
   * Devolve { uci, valor, profundidade, livro }.
   */
  async function lanceDoBot(canal, jogo, nivelId) {
    const nv = nivel(nivelId);
    if (nv.id >= 3 && jogo.fen === X.FEN_INICIAL && jogo.lances.length < 10 && RNG.chance(0.85)) {
      const u = doLivro(jogo.lances);
      if (u) return { uci: u, livro: true };
    }
    const multi = nv.margem > 0;
    const r = await canal.buscar(jogo.fen, jogo.lances, { tempo: nv.tempo, profundidade: nv.profundidade, multi });
    if (!r.lance) return { uci: null };
    let escolhido = r.lance;
    if (multi && r.raiz && r.raiz.length > 1) {
      const melhor = r.raiz[0].valor;
      if (RNG.chance(nv.erro)) {
        // um "erro": qualquer um dos lances razoáveis (não entrega mate de graça)
        const ok = r.raiz.filter(x => x.valor > -X.MATE + 400).slice(0, 6);
        escolhido = RNG.escolher(ok.length ? ok : r.raiz).lance;
      } else {
        // entre os lances dentro da margem, sorteio que prefere os melhores
        const perto = r.raiz.filter(x => melhor - x.valor <= nv.margem);
        const pesos = perto.map(x => Math.exp(-(melhor - x.valor) / Math.max(10, nv.margem / 2)));
        let s = pesos.reduce((a, b) => a + b, 0) * RNG.real();
        for (let i = 0; i < perto.length; i++) { s -= pesos[i]; if (s <= 0) { escolhido = perto[i].lance; break; } }
      }
    }
    return { uci: X.uci(escolhido), valor: r.valor, profundidade: r.profundidade };
  }

  X.IA = { NIVEIS, nivel, LIVRO, doLivro, criarCanal, lanceDoBot, buscarAqui };
})(window.Poker = window.Poker || {});
