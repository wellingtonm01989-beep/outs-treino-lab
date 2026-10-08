/* ==========================================================================
   OUTS · Treino Lab — equity.js
   Cálculo de equity:
     - Monte Carlo (mãos fixas e/ou ranges), em blocos para não travar a tela
     - Enumeração exata de todos os boards possíveis (mãos fixas)

   Equity = vitórias + (empates divididos pelo número de empatados).
   Cada participante é:
     [c1, c2]                 mão fixa (números)
     { mao: "AsKs" }          mão fixa (texto ou números)
     { range: "QQ+, AKs" }    range (texto ou mapa de P.Ranges.parse)
   ========================================================================== */
(function (P) {
  'use strict';

  var agora = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  function normalizarJogador(j) {
    if (Array.isArray(j) && j.length === 2 && typeof j[0] === 'number') return { tipo: 'mao', mao: j.slice() };
    if (typeof j === 'string') {
      try { var cs = P.Cartas.lista(j); if (cs.length === 2) return { tipo: 'mao', mao: cs }; } catch (e) { /* não é mão: tenta range */ }
      return { tipo: 'range', mapa: P.Ranges.parse(j) };
    }
    if (j && j.mao) return { tipo: 'mao', mao: typeof j.mao === 'string' ? P.Cartas.lista(j.mao) : j.mao.slice() };
    if (j && j.combos) return { tipo: 'range', combosProntos: j.combos };   // {a, b, w} já pesados (range estimado)
    if (j && j.range !== undefined) return { tipo: 'range', mapa: typeof j.range === 'string' ? P.Ranges.parse(j.range) : j.range };
    throw new Error('Participante inválido no cálculo de equity');
  }

  function normalizarCartas(x) {
    if (!x) return [];
    return typeof x === 'string' ? P.Cartas.lista(x) : x.slice();
  }

  /** Marca cartas em uso e acusa repetição (ex.: mesma carta em duas mãos). */
  function marcarBase(cartas) {
    var marcadas = new Uint8Array(52);
    for (var i = 0; i < cartas.length; i++) {
      var c = cartas[i];
      if (!(c >= 0 && c < 52)) throw new Error('Carta inválida: ' + c);
      if (marcadas[c]) throw new Error('Carta repetida: ' + P.Cartas.texto(c));
      marcadas[c] = 1;
    }
    return marcadas;
  }

  function novoResultado(n) {
    return { equity: new Float64Array(n), vitorias: new Float64Array(n), empates: new Float64Array(n) };
  }

  /** Pontua um board já montado nas mãos de 7 cartas e acumula no placar. */
  function pontuar(maos7, n, placar, acumulado) {
    var melhor = -1, qtd = 0, p, s;
    for (p = 0; p < n; p++) {
      s = P.Avaliador.avaliar(maos7[p], 7);
      placar[p] = s;
      if (s > melhor) { melhor = s; qtd = 1; } else if (s === melhor) qtd++;
    }
    var parte = 1 / qtd;
    for (p = 0; p < n; p++) {
      if (placar[p] === melhor) {
        acumulado.equity[p] += parte;
        if (qtd === 1) acumulado.vitorias[p]++; else acumulado.empates[p]++;
      }
    }
  }

  function montarResultado(acum, n, feitas, alvo, exato) {
    var r = { exato: exato, iteracoes: feitas, alvo: alvo, progresso: alvo ? feitas / alvo : 1,
      equity: [], vitoria: [], empate: [], erroPadrao: [] };
    for (var p = 0; p < n; p++) {
      var e = feitas ? acum.equity[p] / feitas : 0;
      r.equity.push(e);
      r.vitoria.push(feitas ? acum.vitorias[p] / feitas : 0);
      r.empate.push(feitas ? acum.empates[p] / feitas : 0);
      r.erroPadrao.push(exato || !feitas ? 0 : Math.sqrt(e * (1 - e) / feitas));
    }
    return r;
  }

  // ------------------------------------------------------------------
  // Monte Carlo
  // ------------------------------------------------------------------
  function criarTrabalhoMonteCarlo(opts) {
    var jogadores = opts.jogadores.map(normalizarJogador);
    var n = jogadores.length;
    if (n < 2) throw new Error('Equity precisa de pelo menos 2 participantes');
    var board = normalizarCartas(opts.board);
    if (board.length > 5) throw new Error('Board com mais de 5 cartas');

    var base = board.concat(normalizarCartas(opts.mortas));
    jogadores.forEach(function (j) { if (j.tipo === 'mao') base = base.concat(j.mao); });
    var marcadasBase = marcarBase(base);

    // Ranges viram listas de combos sem conflito com as cartas conhecidas
    jogadores.forEach(function (j, i) {
      if (j.tipo !== 'range') return;
      var cb;
      if (j.combosProntos) {
        var src = j.combosProntos;
        cb = { a: [], b: [], w: [], n: 0 };
        for (var q = 0; q < src.a.length; q++) {
          if (!(src.w[q] > 0) || marcadasBase[src.a[q]] || marcadasBase[src.b[q]]) continue;
          cb.a.push(src.a[q]); cb.b.push(src.b[q]); cb.w.push(src.w[q]); cb.n++;
        }
      } else cb = P.Ranges.paraCombos(j.mapa, marcadasBase);
      if (!cb.n) throw new Error('Range do participante ' + (i + 1) + ' ficou vazio (cartas bloqueadas)');
      j.ca = cb.a; j.cb = cb.b;
      j.uniforme = cb.w.every(function (w) { return w === cb.w[0]; });
      j.acum = new Float64Array(cb.n);
      var s = 0;
      for (var k = 0; k < cb.n; k++) { s += cb.w[k]; j.acum[k] = s; }
      j.total = s;
    });

    function sortearCombo(j) {
      if (j.uniforme) return P.RNG.inteiroAbaixo(j.ca.length);
      var x = P.RNG.real() * j.total, lo = 0, hi = j.acum.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (j.acum[mid] > x) hi = mid; else lo = mid + 1; }
      return lo;
    }

    var alvo = opts.iteracoes || 10000;
    var feitas = 0, falhas = 0;
    var acum = novoResultado(n);
    var carimbo = new Int32Array(52), geracao = 0;
    var maos7 = jogadores.map(function () { return [0, 0, 0, 0, 0, 0, 0]; });
    var placar = new Int32Array(n);
    var tabuleiro = [0, 0, 0, 0, 0];

    function passo(max) {
      var fim = Math.min(alvo, feitas + max);
      while (feitas < fim) {
        geracao++;
        var i, p, c;
        for (i = 0; i < base.length; i++) carimbo[base[i]] = geracao;

        // 1) mãos dos participantes
        var ok = true;
        for (p = 0; p < n && ok; p++) {
          var j = jogadores[p], h = maos7[p];
          if (j.tipo === 'mao') { h[0] = j.mao[0]; h[1] = j.mao[1]; continue; }
          var tent = 0, idx, a, b;
          do {
            idx = sortearCombo(j); a = j.ca[idx]; b = j.cb[idx]; tent++;
          } while ((carimbo[a] === geracao || carimbo[b] === geracao) && tent < 200);
          if (carimbo[a] === geracao || carimbo[b] === geracao) { ok = false; break; }
          carimbo[a] = geracao; carimbo[b] = geracao;
          h[0] = a; h[1] = b;
        }
        if (!ok) {
          if (++falhas > alvo * 5) throw new Error('Ranges incompatíveis entre si (cartas demais em conflito)');
          continue;
        }

        // 2) completa o board com cartas livres
        for (i = 0; i < board.length; i++) tabuleiro[i] = board[i];
        for (i = board.length; i < 5; i++) {
          do { c = P.RNG.inteiroAbaixo(52); } while (carimbo[c] === geracao);
          carimbo[c] = geracao;
          tabuleiro[i] = c;
        }
        for (p = 0; p < n; p++) {
          var m = maos7[p];
          m[2] = tabuleiro[0]; m[3] = tabuleiro[1]; m[4] = tabuleiro[2]; m[5] = tabuleiro[3]; m[6] = tabuleiro[4];
        }

        // 3) showdown
        pontuar(maos7, n, placar, acum);
        feitas++;
      }
    }

    return {
      passo: passo,
      feito: function () { return feitas >= alvo; },
      resultado: function () { return montarResultado(acum, n, feitas, alvo, false); }
    };
  }

  // ------------------------------------------------------------------
  // Enumeração exata (todas as combinações de board restantes)
  // ------------------------------------------------------------------
  function combinacoes(m, k) {
    var r = 1;
    for (var i = 1; i <= k; i++) r = r * (m - k + i) / i;
    return Math.round(r);
  }

  function criarTrabalhoExato(opts) {
    var jogadores = opts.jogadores.map(normalizarJogador);
    var n = jogadores.length;
    if (n < 2) throw new Error('Equity precisa de pelo menos 2 participantes');
    jogadores.forEach(function (j) {
      if (j.tipo !== 'mao') throw new Error('Enumeração exata só aceita mãos fixas');
    });
    var board = normalizarCartas(opts.board);
    var base = board.concat(normalizarCartas(opts.mortas));
    jogadores.forEach(function (j) { base = base.concat(j.mao); });
    var marcadas = marcarBase(base);

    var restantes = [];
    for (var c = 0; c < 52; c++) if (!marcadas[c]) restantes.push(c);
    var m = restantes.length, k = 5 - board.length;
    var alvo = combinacoes(m, k);

    var maos7 = jogadores.map(function (j) {
      var h = [j.mao[0], j.mao[1], 0, 0, 0, 0, 0];
      for (var i = 0; i < board.length; i++) h[2 + i] = board[i];
      return h;
    });
    var placar = new Int32Array(n);
    var acum = novoResultado(n);
    var idx = [];
    for (var i = 0; i < k; i++) idx.push(i);
    var feitas = 0, acabou = false;
    var inicioBoard = 2 + board.length;

    function passo(max) {
      var lim = feitas + max;
      while (!acabou && feitas < lim) {
        var p, t;
        for (t = 0; t < k; t++) {
          var carta = restantes[idx[t]];
          for (p = 0; p < n; p++) maos7[p][inicioBoard + t] = carta;
        }
        pontuar(maos7, n, placar, acum);
        feitas++;
        // próxima combinação em ordem lexicográfica
        t = k - 1;
        while (t >= 0 && idx[t] === m - k + t) t--;
        if (t < 0) { acabou = true; break; }
        idx[t]++;
        for (var u = t + 1; u < k; u++) idx[u] = idx[u - 1] + 1;
      }
    }

    return {
      passo: passo,
      feito: function () { return acabou; },
      resultado: function () { return montarResultado(acum, n, feitas, alvo, true); }
    };
  }

  // ------------------------------------------------------------------
  // Execução em blocos (não trava a tela) e versões síncronas
  // ------------------------------------------------------------------
  function executarEmBlocos(trabalho, opts) {
    var cancelado = false;
    var blocoMs = opts.blocoMs || 14;
    var porPasso = opts.porPasso || 250;
    var porBloco = opts.porBloco || Infinity;   // teto opcional de iterações por bloco
    function tick() {
      if (cancelado) return;
      var t0 = agora(), noBloco = 0;
      try {
        do { trabalho.passo(porPasso); noBloco += porPasso; }
        while (!trabalho.feito() && agora() - t0 < blocoMs && noBloco < porBloco);
      } catch (e) {
        if (opts.aoErro) opts.aoErro(e); else throw e;
        return;
      }
      var r = trabalho.resultado();
      if (opts.aoProgresso) opts.aoProgresso(r.progresso, r);
      if (trabalho.feito()) { if (opts.aoTerminar) opts.aoTerminar(r); }
      else setTimeout(tick, 0);
    }
    setTimeout(tick, 0);
    return { cancelar: function () { cancelado = true; } };
  }

  function emBlocos(criar) {
    return function (opts) {
      var trabalho;
      try { trabalho = criar(opts); } catch (e) {
        if (opts.aoErro) { setTimeout(function () { opts.aoErro(e); }, 0); return { cancelar: function () {} }; }
        throw e;
      }
      return executarEmBlocos(trabalho, opts);
    };
  }

  function sincrono(criar) {
    return function (opts) {
      var t = criar(opts);
      while (!t.feito()) t.passo(100000);
      return t.resultado();
    };
  }

  /** Versão Promise: P.Equity.promessa('monteCarlo', opts).then(r => ...) */
  function promessa(tipo, opts) {
    return new Promise(function (ok, falha) {
      var o = {};
      for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      o.aoTerminar = ok;
      o.aoErro = falha;
      P.Equity[tipo](o);
    });
  }

  P.Equity = {
    monteCarlo: emBlocos(criarTrabalhoMonteCarlo),
    exata: emBlocos(criarTrabalhoExato),
    monteCarloSincrono: sincrono(criarTrabalhoMonteCarlo),
    exataSincrona: sincrono(criarTrabalhoExato),
    promessa: promessa,
    combinacoes: combinacoes
  };
})(window.Poker = window.Poker || {});
