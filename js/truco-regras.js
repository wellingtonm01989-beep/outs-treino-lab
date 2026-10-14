/* ==========================================================================
   OUTS · Treino Lab — truco-regras.js
   Regras do truco paulista (sem estado): baralho de 40 cartas, ordem de
   força, vira e manilhas, quem ganha cada rodada (vaza), quem ganha a mão
   com os empates, valores do truco e a "conta do placar" (chance de ganhar
   a partida a partir de cada placar), usada pelo coach e pelos bots.

   As cartas usam o mesmo número do poker (carta = rank * 4 + naipe), então
   o desenho das cartas e os nomes já existentes servem aqui também.
     rank do poker: 0 = 2, 1 = 3, 2 = 4, 3 = 5, 4 = 6, 5 = 7, 9 = J, 10 = Q, 11 = K, 12 = A
     (8, 9 e 10 — ranks 6, 7 e 8 — ficam fora do baralho do truco)
     naipe: 0 = espadas, 1 = copas, 2 = ouros, 3 = paus
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Truco = P.Truco || {};

  // ------------------------------------------------------------- baralho
  // Ordem de força das cartas comuns, da mais fraca para a mais forte:
  // 4, 5, 6, 7, Q, J, K, A, 2, 3 (em ranks do poker)
  const ORDEM = [2, 3, 4, 5, 10, 9, 11, 12, 0, 1];
  const FORCA_RANK = new Array(13).fill(-1);
  ORDEM.forEach((r, i) => { FORCA_RANK[r] = i; });

  // Força das manilhas pelo naipe: ouros (pica-fumo) < espadas (espadilha) < copas < paus (zap)
  const FORCA_NAIPE_MANILHA = [1, 2, 0, 3];           // índice = naipe do poker
  const NOME_MANILHA = ['Espadilha', 'Copas', 'Pica-fumo', 'Zap'];
  const NOME_RANK = { 2: 'Quatro', 3: 'Cinco', 4: 'Seis', 5: 'Sete', 10: 'Dama', 9: 'Valete', 11: 'Rei', 12: 'Ás', 0: 'Dois', 1: 'Três' };
  const NOME_RANK_PLURAL = { 2: 'Quatros', 3: 'Cincos', 4: 'Seis', 5: 'Setes', 10: 'Damas', 9: 'Valetes', 11: 'Reis', 12: 'Ases', 0: 'Dois', 1: 'Três' };
  const ROTULO_RANK = { 2: '4', 3: '5', 4: '6', 5: '7', 10: 'Q', 9: 'J', 11: 'K', 12: 'A', 0: '2', 1: '3' };

  const rankDe = c => c >> 2;
  const naipeDe = c => c & 3;

  /** As 40 cartas do truco, em ordem (números do poker). */
  const BARALHO = [];
  for (let c = 0; c < 52; c++) if (FORCA_RANK[c >> 2] >= 0) BARALHO.push(c);

  function ehCartaDeTruco(c) { return c >= 0 && c < 52 && FORCA_RANK[c >> 2] >= 0; }

  /** Rank (do poker) das manilhas para uma vira: a carta seguinte na ordem (depois do 3 volta ao 4). */
  function manilhaDe(vira) { return ORDEM[(FORCA_RANK[rankDe(vira)] + 1) % 10]; }

  /**
   * Força de uma carta com essa vira: 0 (um 4 comum) até 9 (um 3); as manilhas
   * valem 10 (pica-fumo) a 13 (zap). Carta coberta (jogada virada) vale -1.
   */
  function valor(c, vira) {
    if (rankDe(c) === manilhaDe(vira)) return 10 + FORCA_NAIPE_MANILHA[naipeDe(c)];
    return FORCA_RANK[rankDe(c)];
  }
  const VALOR_COBERTA = -1;
  const ehManilha = (c, vira) => rankDe(c) === manilhaDe(vira);

  /** Nome da carta no truco ("Zap", "Três", "Dama"...). */
  function nome(c, vira) {
    if (vira !== undefined && vira !== null && ehManilha(c, vira)) return NOME_MANILHA[naipeDe(c)];
    return NOME_RANK[rankDe(c)];
  }
  /** "4♣" — o rótulo curto (o mesmo do baralho do poker, com 10 virando Q/J/K/A normalmente). */
  function rotulo(c) { return ROTULO_RANK[rankDe(c)] + P.Cartas.SIMBOLOS[naipeDe(c)]; }

  // ------------------------------------------------------------- rodadas
  /**
   * Resultado de uma rodada. jogadas: [{ j, carta, coberta }] na ordem em que
   * foram jogadas; equipe(j) devolve 0 ou 1.
   * Devolve { vencedor: 0 | 1 | 'E' (empate), maior: valor da maior carta,
   *           quem: jogador que fez a maior carta (o primeiro que a jogou) }.
   */
  function resultadoRodada(jogadas, vira, equipe) {
    let maior = -2, quem = null;
    const equipesNoTopo = new Set();
    jogadas.forEach(x => {
      const v = x.coberta ? VALOR_COBERTA : valor(x.carta, vira);
      if (v > maior) { maior = v; quem = x.j; equipesNoTopo.clear(); equipesNoTopo.add(equipe(x.j)); }
      else if (v === maior) equipesNoTopo.add(equipe(x.j));
    });
    const vencedor = equipesNoTopo.size > 1 ? 'E' : equipe(quem);
    return { vencedor, maior, quem };
  }

  /**
   * Quem ganha a mão com os resultados das rodadas até agora (0, 1 ou 'E' em cada uma).
   *  - empate na 1ª: quem ganhar a 2ª leva (empatou a 2ª também: decide a 3ª)
   *  - empate na 2ª ou na 3ª: leva quem ganhou a 1ª
   *  - empate nas três: ninguém marca
   * Devolve { fim: false } ou { fim: true, vencedor: 0 | 1 | null }.
   */
  function decidirMao(res) {
    const n = res.length;
    if (n < 2) return { fim: false };
    const [r1, r2, r3] = res;
    if (n === 2) {
      if (r1 !== 'E' && r2 === r1) return { fim: true, vencedor: r1 };
      if (r1 !== 'E' && r2 === 'E') return { fim: true, vencedor: r1 };
      if (r1 === 'E' && r2 !== 'E') return { fim: true, vencedor: r2 };
      return { fim: false };                      // 1 a 1, ou dois empates
    }
    if (r3 !== 'E') return { fim: true, vencedor: r3 };
    if (r1 !== 'E') return { fim: true, vencedor: r1 };
    return { fim: true, vencedor: null };          // três empates
  }

  // ------------------------------------------------------- truco e valores
  // nível 0 = mão normal (1 ponto); 1 = truco (3); 2 = seis; 3 = nove; 4 = doze
  const VALORES = [1, 3, 6, 9, 12];
  const NOMES_PEDIDO = ['', 'Truco', 'Seis', 'Nove', 'Doze'];
  const PONTOS_PARTIDA = 12;

  // ------------------------------------------------------ conta do placar
  /**
   * Chance de a equipe ganhar a partida estando "nos" a "eles", num modelo
   * simples: cada mão daqui para a frente é cara ou coroa e vale 1 ponto,
   * com as regras da mão de 11 (vale 3, quem está com 11 pode correr) e da
   * mão de ferro (11 a 11: quem ganhar a mão ganha a partida).
   * Serve para o coach comparar decisões perto do fim da partida, quando
   * correr ou aceitar muda muito a chance de ganhar o jogo.
   */
  const memo = new Map();
  function chancePartida(nos, eles) {
    if (nos >= PONTOS_PARTIDA) return 1;
    if (eles >= PONTOS_PARTIDA) return 0;
    const k = nos * 100 + eles;
    if (memo.has(k)) return memo.get(k);
    let m;
    if (nos === 11 && eles === 11) m = 0.5;
    else if (nos === 11) m = Math.max(0.5 + 0.5 * chancePartida(11, eles + 3), chancePartida(11, eles + 1));
    else if (eles === 11) m = Math.min(0.5 * chancePartida(nos + 3, 11), chancePartida(nos + 1, 11));
    else m = 0.5 * chancePartida(nos + 1, eles) + 0.5 * chancePartida(nos, eles + 1);
    memo.set(k, m);
    return m;
  }

  /**
   * Chance mínima de ganhar a mão para valer a pena aceitar uma aposta
   * (em vez de correr). Correr dá "vale" pontos para eles; aceitar põe
   * "novo" pontos em jogo. Com o placar (a, b) usa a conta do placar;
   * sem placar, a conta simples: (novo - vale) / (2 × novo).
   */
  function minimoParaAceitar(vale, novo, a, b) {
    const simples = (novo - vale) / (2 * novo);
    if (a === undefined || b === undefined) return simples;
    const correr = chancePartida(a, b + vale);
    const ganhar = chancePartida(a + novo, b), perder = chancePartida(a, b + novo);
    if (ganhar - perder < 1e-9) return correr <= perder ? 0 : 1;
    return Math.min(1, Math.max(0, (correr - perder) / (ganhar - perder)));
  }

  /**
   * Blefe: com chance "p" de ganhar a mão, quantas vezes os outros precisam
   * correr para pedir a aposta valer a pena (pontos, sem o placar).
   * Pedir: correm → +vale; aceitam → novo × (2p − 1). Não pedir: vale × (2p − 1).
   */
  function correrMinimoBlefe(p, vale, novo) {
    const e = 2 * p - 1;
    if (e >= 0) return 0;                          // favorito: pedir já compensa
    return Math.min(1, (e * (vale - novo)) / (vale - novo * e));
  }

  T.Regras = {
    BARALHO, ORDEM, FORCA_RANK, VALORES, NOMES_PEDIDO, PONTOS_PARTIDA, VALOR_COBERTA,
    NOME_MANILHA, NOME_RANK, NOME_RANK_PLURAL, ROTULO_RANK,
    rankDe, naipeDe, ehCartaDeTruco, manilhaDe, valor, ehManilha, nome, rotulo,
    resultadoRodada, decidirMao, chancePartida, minimoParaAceitar, correrMinimoBlefe
  };
})(window.Poker = window.Poker || {});
