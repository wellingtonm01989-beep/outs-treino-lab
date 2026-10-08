/* ==========================================================================
   OUTS · Treino Lab — auditoria.js
   Auditoria estatística do embaralhamento. Usa EXATAMENTE a mesma função
   do jogo (P.Baralho.embaralhar), roda em blocos e mede:

   1) Qui-quadrado da tabela carta x posição (52 x 52 = 2.704 células).
      Esperado por célula = N / 52.
      Detalhe técnico: como cada embaralhamento é uma permutação, as somas
      de linha e coluna são fixas. A estatística de Pearson bruta, nesse
      caso, segue (52/51) * qui²(51*51). Por isso multiplicamos por 51/52
      e testamos contra 2.601 graus de liberdade.
   2) Frequências das duas primeiras cartas (uma "mão"):
      par na mão 3/51 = 5,882% | AA 6/1326 = 0,452% | naipada 12/51 = 23,53%
   ========================================================================== */
(function (P) {
  'use strict';

  var agora = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  // ------------------------------------------------ utilitários estatísticos
  /** Função erro complementar (Numerical Recipes, erro < 1,2e-7). */
  function erfc(x) {
    var z = Math.abs(x);
    var t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  /** P(Z <= z) da normal padrão. */
  function normalAcumulada(z) { return 0.5 * erfc(-z / Math.SQRT2); }

  /** P(X >= x) para X ~ qui²(k) — Wilson-Hilferty (ótima para k grande). */
  function pQuiQuadrado(x, k) {
    if (x <= 0) return 1;
    var z = (Math.pow(x / k, 1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
    return 1 - normalAcumulada(z);
  }

  /** Qui-quadrado de uma lista de contagens contra esperados iguais. */
  function quiQuadradoUniforme(contagens) {
    var total = 0, i;
    for (i = 0; i < contagens.length; i++) total += contagens[i];
    var esperado = total / contagens.length, x2 = 0;
    for (i = 0; i < contagens.length; i++) { var d = contagens[i] - esperado; x2 += d * d / esperado; }
    var gl = contagens.length - 1;
    return { x2: x2, gl: gl, p: pQuiQuadrado(x2, gl) };
  }

  /** z-score de uma proporção observada contra a teórica. */
  function zProporcao(sucessos, n, p) {
    return (sucessos / n - p) / Math.sqrt(p * (1 - p) / n);
  }

  P.Estat = {
    erfc: erfc,
    normalAcumulada: normalAcumulada,
    pQuiQuadrado: pQuiQuadrado,
    quiQuadradoUniforme: quiQuadradoUniforme,
    zProporcao: zProporcao
  };

  // ---------------------------------------------------------------- auditoria
  var N = 52;
  var LIMITE_Z = 4;        // |z| acima disso nas frequências reprova
  var LIMITE_P = 0.001;    // p-valor abaixo disso reprova

  /**
   * Roda a auditoria em blocos.
   * opts: { embaralhamentos (padrão 1.000.000), aoProgresso(fracao), aoTerminar(resultado) }
   * Retorna { cancelar() }.
   */
  function rodar(opts) {
    var total = opts.embaralhamentos || 1000000;
    var contagem = new Uint32Array(N * N);   // contagem[carta * 52 + posicao]
    var baralho = new Uint8Array(N);
    var feitos = 0, pares = 0, ases = 0, naipadas = 0;
    var cancelado = false;
    var t0 = agora();

    function bloco() {
      if (cancelado) return;
      var inicio = agora();
      while (feitos < total && agora() - inicio < 30) {
        var lim = Math.min(total, feitos + 2000);
        for (; feitos < lim; feitos++) {
          var i;
          for (i = 0; i < N; i++) baralho[i] = i;      // baralho novo a cada vez
          P.Baralho.embaralhar(baralho);               // mesma função do jogo
          for (i = 0; i < N; i++) contagem[baralho[i] * N + i]++;
          var c1 = baralho[0], c2 = baralho[1];
          if ((c1 >> 2) === (c2 >> 2)) { pares++; if ((c1 >> 2) === 12) ases++; }
          else if ((c1 & 3) === (c2 & 3)) naipadas++;
        }
      }
      if (opts.aoProgresso) opts.aoProgresso(feitos / total);
      if (feitos < total) setTimeout(bloco, 0);
      else if (opts.aoTerminar) opts.aoTerminar(analisar());
    }

    function analisar() {
      var esperado = total / N;
      var varCelula = esperado * (1 - 1 / N);
      var x2 = 0, maxZ = 0, celulaMax = 0;
      var z = new Float32Array(N * N);
      for (var k = 0; k < N * N; k++) {
        var d = contagem[k] - esperado;
        x2 += d * d / esperado;
        z[k] = d / Math.sqrt(varCelula);
        if (Math.abs(z[k]) > Math.abs(maxZ)) { maxZ = z[k]; celulaMax = k; }
      }
      var gl = (N - 1) * (N - 1);
      var x2c = x2 * (N - 1) / N;
      var p = pQuiQuadrado(x2c, gl);

      var freq = [
        { nome: 'Par na mão', obs: pares, teorica: 3 / 51 },
        { nome: 'AA', obs: ases, teorica: 6 / 1326 },
        { nome: 'Mão naipada', obs: naipadas, teorica: 12 / 51 }
      ].map(function (f) {
        f.observada = f.obs / total;
        f.z = zProporcao(f.obs, total, f.teorica);
        f.aprovado = Math.abs(f.z) < LIMITE_Z;
        return f;
      });

      var ms = agora() - t0;
      return {
        embaralhamentos: total,
        x2Bruto: x2,
        x2: x2c,
        gl: gl,
        p: p,
        maxZ: maxZ,
        celulaMax: { carta: Math.floor(celulaMax / N), posicao: celulaMax % N },
        frequencias: freq,
        z: z,
        contagem: contagem,
        ms: ms,
        porSegundo: total / (ms / 1000),
        aprovado: p > LIMITE_P && freq.every(function (f) { return f.aprovado; }),
        criterios: { limiteP: LIMITE_P, limiteZ: LIMITE_Z }
      };
    }

    setTimeout(bloco, 0);
    return { cancelar: function () { cancelado = true; } };
  }

  P.Auditoria = { rodar: rodar };
})(window.Poker = window.Poker || {});
