/* ==========================================================================
   OUTS · Treino Lab — icm.js
   ICM pelo modelo Malmuth-Harville: a chance de um jogador terminar em 1º
   é proporcional ao stack; dado quem já ficou à frente, a chance de ser o
   próximo é proporcional ao stack entre os que sobraram.

   - Exato por programação dinâmica sobre subconjuntos (até 13 jogadores)
   - Exato por recursão quando poucos lugares são pagos
   - Monte Carlo (sorteio de ordens de chegada) para fields grandes
   ========================================================================== */
(function (P) {
  'use strict';

  function soma(a) { return a.reduce(function (s, x) { return s + x; }, 0); }

  /** DP sobre subconjuntos: prob[mask] = chance de "mask" ocupar os primeiros lugares. */
  function exatoDP(stacks, premios) {
    var n = stacks.length, total = soma(stacks);
    var k = Math.min(premios.length, n);
    var eq = new Float64Array(n);
    var tam = 1 << n;
    var prob = new Float64Array(tam), somaMask = new Float64Array(tam), qtd = new Uint8Array(tam);
    prob[0] = 1;
    for (var m = 1; m < tam; m++) {
      var baixo = m & -m, i = 31 - Math.clz32(baixo);
      somaMask[m] = somaMask[m ^ baixo] + stacks[i];
      qtd[m] = qtd[m ^ baixo] + 1;
    }
    for (var mask = 0; mask < tam; mask++) {
      var pm = prob[mask];
      if (!pm || qtd[mask] >= k) continue;
      var restante = total - somaMask[mask];
      if (restante <= 0) continue;
      var lugar = qtd[mask];
      for (var j = 0; j < n; j++) {
        if (mask & (1 << j) || stacks[j] <= 0) continue;
        var p = pm * stacks[j] / restante;
        eq[j] += p * premios[lugar];
        prob[mask | (1 << j)] += p;
      }
    }
    return Array.prototype.slice.call(eq);
  }

  /** Recursão em profundidade limitada aos lugares pagos (bom para muitos jogadores e poucos prêmios). */
  function exatoRecursivo(stacks, premios) {
    var n = stacks.length, total = soma(stacks), k = Math.min(premios.length, n);
    var eq = new Array(n).fill(0), usado = new Array(n).fill(false);
    function desce(lugar, restante, prob) {
      if (lugar >= k || restante <= 0) return;
      for (var j = 0; j < n; j++) {
        if (usado[j] || stacks[j] <= 0) continue;
        var p = prob * stacks[j] / restante;
        eq[j] += p * premios[lugar];
        usado[j] = true;
        desce(lugar + 1, restante - stacks[j], p);
        usado[j] = false;
      }
    }
    desce(0, total, 1);
    return eq;
  }

  /** Monte Carlo: sorteia ordens de chegada pelo modelo de Harville. */
  function monteCarlo(stacks, premios, amostras) {
    amostras = amostras || 20000;
    var n = stacks.length, k = Math.min(premios.length, n);
    var eq = new Float64Array(n), vivo = new Uint8Array(n);
    var total = soma(stacks);
    for (var a = 0; a < amostras; a++) {
      vivo.fill(1);
      var restante = total;
      for (var lugar = 0; lugar < k && restante > 0; lugar++) {
        var x = P.RNG.real() * restante, acc = 0, esc = -1;
        for (var j = 0; j < n; j++) {
          if (!vivo[j] || stacks[j] <= 0) continue;
          acc += stacks[j];
          esc = j;
          if (x < acc) break;
        }
        vivo[esc] = 0;
        restante -= stacks[esc];
        eq[esc] += premios[lugar];
      }
    }
    var out = [];
    for (var i = 0; i < n; i++) out.push(eq[i] / amostras);
    return out;
  }

  /**
   * Valor em dinheiro de cada stack.
   * @param {number[]} stacks
   * @param {number[]} premios em ordem (1º, 2º, ...)
   */
  function equities(stacks, premios) {
    var n = stacks.length, k = Math.min(premios.length, n);
    if (n === 0) return [];
    if (n <= 13) return exatoDP(stacks, premios);
    var perm = 1;
    for (var i = 0; i < k; i++) perm *= (n - i);
    if (perm <= 3e6) return exatoRecursivo(stacks, premios);
    return monteCarlo(stacks, premios, 20000);
  }

  /**
   * Decisão de pagar um all-in sob ICM. Compara o valor em $ de:
   *   foldar  -> herói perde o que já pôs; vilão leva o pote
   *   ganhar  -> herói ganha o valor efetivo E do vilão + dinheiro morto D
   *   perder  -> herói perde E; vilão leva E + D
   * c: { stacks: fichas atrás de todos (índices da lista), premios, heroi, vilao,
   *      inicioHeroi, inicioVilao (fichas no começo da mão), investidoHeroi,
   *      morto (fichas no pote de outros jogadores) }
   * Retorna as equities necessárias em fichas e em ICM.
   */
  function decisaoAllin(c) {
    var E = Math.min(c.inicioHeroi, c.inicioVilao);
    var D = c.morto || 0, iH = c.investidoHeroi || 0;
    function cenario(fimHeroi, fimVilao) {
      var s = c.stacks.slice();
      s[c.heroi] = fimHeroi;
      s[c.vilao] = fimVilao;
      return equities(s, c.premios)[c.heroi];
    }
    var eF = cenario(c.inicioHeroi - iH, c.inicioVilao + iH + D);
    var eG = cenario(c.inicioHeroi + E + D, c.inicioVilao - E);
    var eP = cenario(c.inicioHeroi - E, c.inicioVilao + E + D);
    return {
      valorFold: eF, valorGanha: eG, valorPerde: eP,
      necessariaICM: (eF - eP) / Math.max(1e-9, eG - eP),
      necessariaFichas: (E - iH) / (2 * E + D),
      emRisco: E
    };
  }

  P.ICM = {
    equities: equities,
    exatoDP: exatoDP,
    exatoRecursivo: exatoRecursivo,
    monteCarlo: monteCarlo,
    decisaoAllin: decisaoAllin
  };
})(window.Poker = window.Poker || {});
