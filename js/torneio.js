/* ==========================================================================
   OUTS · Treino Lab — torneio.js
   Estruturas de jogo: limites de cash, buy-ins de Sit & Go e torneio,
   níveis de blinds, premiação e o "field" simulado do torneio.

   Unidades: cash em centavos; SNG/torneio em fichas; prêmios e buy-ins em
   centavos de dólar fictício.
   ========================================================================== */
(function (P) {
  'use strict';

  var NIVEIS = ['micro', 'pequeno', 'medio', 'alto'];
  var NOMES_NIVEL = { micro: 'Micro', pequeno: 'Pequeno', medio: 'Médio', alto: 'Alto' };

  // ------------------------------------------------------------------ cash
  var CASH = {
    micro: [{ nome: 'NL2', sb: 1, bb: 2 }, { nome: 'NL5', sb: 2, bb: 5 }, { nome: 'NL10', sb: 5, bb: 10 }],
    pequeno: [{ nome: 'NL25', sb: 10, bb: 25 }, { nome: 'NL50', sb: 25, bb: 50 }],
    medio: [{ nome: 'NL100', sb: 50, bb: 100 }, { nome: 'NL200', sb: 100, bb: 200 }],
    alto: [{ nome: 'NL500', sb: 250, bb: 500 }, { nome: 'NL1000', sb: 500, bb: 1000 }]
  };

  // ---------------------------------------------------------------- Sit & Go
  // total = buy-in cobrado; premio = parte que vai para o prize pool
  var SNG = {
    micro: [{ total: 100, premio: 92 }, { total: 350, premio: 325 }],
    pequeno: [{ total: 700, premio: 650 }, { total: 1500, premio: 1400 }],
    medio: [{ total: 3000, premio: 2800 }, { total: 6000, premio: 5600 }],
    alto: [{ total: 10000, premio: 9400 }, { total: 20000, premio: 18800 }]
  };
  var SNG_STACK = 1500;
  // níveis do SNG (ante por jogador a partir do nível 6)
  var SNG_NIVEIS = [
    [10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 0], [75, 150, 0],
    [100, 200, 25], [150, 300, 25], [200, 400, 50], [300, 600, 75], [400, 800, 100],
    [600, 1200, 150], [800, 1600, 200], [1000, 2000, 250], [1500, 3000, 300], [2000, 4000, 500],
    [3000, 6000, 600], [4000, 8000, 800], [6000, 12000, 1200], [8000, 16000, 1600], [10000, 20000, 2000]
  ];
  var SNG_DURACAO = { regular: 5 * 60, turbo: 3 * 60 };   // segundos por nível

  // ---------------------------------------------------------------- torneio
  var TORNEIO = {
    micro: [{ total: 110, premio: 100 }, { total: 330, premio: 300 }, { total: 550, premio: 500 }],
    pequeno: [{ total: 1100, premio: 1000 }, { total: 2200, premio: 2000 }, { total: 3300, premio: 3000 }],
    medio: [{ total: 5500, premio: 5000 }, { total: 8200, premio: 7500 }, { total: 10900, premio: 10000 }],
    alto: [{ total: 21500, premio: 20000 }, { total: 53000, premio: 50000 }, { total: 105000, premio: 100000 }]
  };
  var TORNEIO_STACK = 10000;
  var TORNEIO_FIELDS = [45, 90, 180];
  // [sb, bb, big blind ante]
  var TORNEIO_NIVEIS = [
    [50, 100, 100], [60, 120, 120], [75, 150, 150], [100, 200, 200], [125, 250, 250],
    [150, 300, 300], [200, 400, 400], [250, 500, 500], [300, 600, 600], [400, 800, 800],
    [500, 1000, 1000], [600, 1200, 1200], [800, 1600, 1600], [1000, 2000, 2000], [1250, 2500, 2500],
    [1500, 3000, 3000], [2000, 4000, 4000], [2500, 5000, 5000], [3000, 6000, 6000], [4000, 8000, 8000],
    [5000, 10000, 10000], [6000, 12000, 12000], [8000, 16000, 16000], [10000, 20000, 20000], [12500, 25000, 25000],
    [15000, 30000, 30000], [20000, 40000, 40000], [25000, 50000, 50000], [30000, 60000, 60000], [40000, 80000, 80000]
  ];
  var TORNEIO_DURACAO = { regular: 6 * 60, turbo: 3 * 60 };

  /** Nível de blinds (índice começa em 0). Depois do último, dobra. */
  function nivelSNG(i) {
    if (i < SNG_NIVEIS.length) { var n = SNG_NIVEIS[i]; return { sb: n[0], bb: n[1], ante: n[2], anteBB: false }; }
    var u = nivelSNG(SNG_NIVEIS.length - 1), f = Math.pow(2, i - SNG_NIVEIS.length + 1);
    return { sb: u.sb * f, bb: u.bb * f, ante: u.ante * f, anteBB: false };
  }
  function nivelTorneio(i) {
    if (i < TORNEIO_NIVEIS.length) { var n = TORNEIO_NIVEIS[i]; return { sb: n[0], bb: n[1], ante: n[2], anteBB: true }; }
    var u = nivelTorneio(TORNEIO_NIVEIS.length - 1), f = Math.pow(1.5, i - TORNEIO_NIVEIS.length + 1);
    return { sb: Math.round(u.sb * f), bb: Math.round(u.bb * f), ante: Math.round(u.bb * f), anteBB: true };
  }

  // ------------------------------------------------------------- premiação
  /** Percentuais do SNG: 2 jogadores 100%; 3-6: 65/35; 7-9: 50/30/20. */
  function percentuaisSNG(n) {
    if (n <= 2) return [100];
    if (n <= 6) return [65, 35];
    return [50, 30, 20];
  }

  /**
   * Percentuais do torneio: cerca de 15% do field é pago. Cada pago recebe
   * no mínimo ~1,5 buy-in e o restante é dividido em curva (1/lugar^1,15).
   */
  function percentuaisTorneio(field) {
    var pagos = Math.max(3, Math.round(field * 0.15));
    var minimo = 1.5 / field;               // fração do pote = 1,5 buy-in
    var resto = 1 - minimo * pagos;
    var pesos = [], s = 0;
    for (var i = 1; i <= pagos; i++) { var w = 1 / Math.pow(i, 1.15); pesos.push(w); s += w; }
    return pesos.map(function (w) { return (minimo + resto * w / s) * 100; });
  }

  /** Valores (centavos) a partir do prize pool, sem perder centavos no arredondamento. */
  function valoresPremios(pool, percentuais) {
    var v = percentuais.map(function (p) { return Math.floor(pool * p / 100); });
    var sobra = pool - v.reduce(function (a, b) { return a + b; }, 0);
    v[0] += sobra;
    return v;
  }

  // ---------------------------------------------------- field simulado (MTT)
  /**
   * Só a mesa do jogador é jogada mão a mão. O resto do field fica num
   * "pool" abstrato: quantidade de jogadores e total de fichas. A cada mão
   * da mesa principal, as outras mesas também jogam e eliminam jogadores
   * com uma chance que cresce quando os stacks médios ficam curtos.
   */
  function criarCampo(cfg) {
    var field = cfg.field, lugares = cfg.lugares, stack = cfg.stackInicial;
    var totalFichas = field * stack;
    var pool = { jogadores: field - cfg.naMesa, fichas: totalFichas - cfg.naMesa * stack };
    var restantes = field;
    var eliminacoesFora = 0;
    var pagos = cfg.premios.length;

    function stackMedio() { return totalFichas / Math.max(1, restantes); }

    return {
      field: field,
      totalFichas: totalFichas,
      restantes: function () { return restantes; },
      pool: function () { return { jogadores: pool.jogadores, fichas: pool.fichas }; },
      stackMedio: stackMedio,
      pagos: pagos,
      eliminacoesFora: function () { return eliminacoesFora; },
      /** As outras mesas jogam uma mão. Devolve quantos caíram fora da mesa. */
      simularMaoFora: function (bb) {
        if (pool.jogadores <= 0) return 0;
        var mesas = pool.jogadores / lugares;
        var mediaBB = stackMedio() / bb;
        var p = Math.max(0.012, Math.min(0.3, 3 / mediaBB));
        var caiu = 0;
        var inteiras = Math.floor(mesas), fracao = mesas - inteiras;
        for (var m = 0; m < inteiras + (P.RNG.chance(fracao) ? 1 : 0); m++) {
          if (pool.jogadores <= 1) break;
          if (P.RNG.chance(p)) { pool.jogadores--; restantes--; caiu++; eliminacoesFora++; }
        }
        return caiu;
      },
      /** Alguém da mesa principal foi eliminado: devolve a colocação dele. */
      eliminarDaMesa: function () {
        var pos = restantes;
        restantes--;
        return pos;
      },
      /** Um jogador do pool senta na mesa principal: devolve o stack dele (ou null). */
      sentarNovo: function (bb) {
        if (pool.jogadores <= 0) return null;
        var st;
        if (pool.jogadores === 1) st = pool.fichas;
        else {
          var media = pool.fichas / pool.jogadores;
          var f = Math.exp(P.RNG.normal() * 0.45);
          var minimo = Math.max(bb, 1);
          st = Math.round(media * f);
          st = Math.max(minimo, Math.min(st, pool.fichas - minimo * (pool.jogadores - 1)));
        }
        pool.jogadores--;
        pool.fichas -= st;
        return st;
      },
      /** Stacks estimados de quem está fora da mesa (todos com a média do pool). */
      stacksFora: function () {
        var out = [];
        if (pool.jogadores <= 0) return out;
        var m = pool.fichas / pool.jogadores;
        for (var i = 0; i < pool.jogadores; i++) out.push(m);
        return out;
      }
    };
  }

  P.Estruturas = {
    NIVEIS: NIVEIS,
    NOMES_NIVEL: NOMES_NIVEL,
    CASH: CASH,
    SNG: SNG,
    SNG_STACK: SNG_STACK,
    SNG_DURACAO: SNG_DURACAO,
    TORNEIO: TORNEIO,
    TORNEIO_STACK: TORNEIO_STACK,
    TORNEIO_FIELDS: TORNEIO_FIELDS,
    TORNEIO_DURACAO: TORNEIO_DURACAO,
    nivelSNG: nivelSNG,
    nivelTorneio: nivelTorneio,
    percentuaisSNG: percentuaisSNG,
    percentuaisTorneio: percentuaisTorneio,
    valoresPremios: valoresPremios
  };
  P.Torneio = { criarCampo: criarCampo };
})(window.Poker = window.Poker || {});
