/* ==========================================================================
   OUTS · Treino Lab — rng.js
   Fonte única de aleatoriedade do app: crypto.getRandomValues.
   Math.random NÃO é usado em lugar nenhum (nem nas cartas, nem nos bots,
   nem nas simulações), para não existir dúvida sobre a origem dos números.
   ========================================================================== */
(function (P) {
  'use strict';

  var cripto = window.crypto || window.msCrypto;
  if (!cripto || typeof cripto.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues indisponível: o navegador não oferece aleatoriedade criptográfica.');
  }

  var DOIS_32 = 4294967296;        // 2^32
  var DOIS_53 = 9007199254740992;  // 2^53
  var TAM_RESERVA = 16384;         // 16.384 Uint32 = 64 KB (limite por chamada do getRandomValues)

  // Reserva de números já sorteados: buscar em lote é muito mais rápido
  // do que chamar o crypto a cada carta.
  var reserva = new Uint32Array(TAM_RESERVA);
  var pos = TAM_RESERVA;           // força o preenchimento na primeira chamada
  var recargas = 0;                // diagnóstico: quantas vezes o crypto foi chamado

  /** Próximo inteiro sem sinal de 32 bits, uniforme em [0, 2^32). */
  function uint32() {
    if (pos >= TAM_RESERVA) {
      cripto.getRandomValues(reserva);
      pos = 0;
      recargas++;
    }
    return reserva[pos++];
  }

  /**
   * Maior múltiplo de n que cabe em 2^32.
   * Sorteios >= esse limite são descartados (rejection sampling); assim
   * cada resto de "x % n" tem exatamente a mesma quantidade de valores de
   * origem e não existe viés de módulo.
   */
  function limiteRejeicao(n) {
    return DOIS_32 - (DOIS_32 % n);
  }

  /** Inteiro uniforme em [0, n), sem viés de módulo. */
  function inteiroAbaixo(n) {
    if (!(n >= 1 && n <= DOIS_32 && Math.floor(n) === n)) {
      throw new RangeError('inteiroAbaixo: n inválido (' + n + ')');
    }
    if (n === 1) return 0;
    var limite = limiteRejeicao(n);
    var x;
    do { x = uint32(); } while (x >= limite);
    return x % n;
  }

  /** Inteiro uniforme em [min, max] (inclusive). */
  function inteiroEntre(min, max) {
    return min + inteiroAbaixo(max - min + 1);
  }

  /** Real uniforme em [0, 1) com 53 bits de precisão. */
  function real() {
    var alto = uint32() >>> 5;   // 27 bits
    var baixo = uint32() >>> 6;  // 26 bits
    return (alto * 67108864 + baixo) / DOIS_53;
  }

  /** true com probabilidade p. */
  function chance(p) {
    return real() < p;
  }

  /** Elemento uniforme de uma lista. */
  function escolher(lista) {
    return lista[inteiroAbaixo(lista.length)];
  }

  /** Normal padrão (Box-Muller) — usada só para variar tempos/tamanhos dos bots. */
  function normal() {
    var u = 0, v = 0;
    while (u === 0) u = real();
    while (v === 0) v = real();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function diagnostico() {
    return { recargas: recargas, tamanhoReserva: TAM_RESERVA, fonte: 'crypto.getRandomValues' };
  }

  P.RNG = {
    uint32: uint32,
    limiteRejeicao: limiteRejeicao,
    inteiroAbaixo: inteiroAbaixo,
    inteiroEntre: inteiroEntre,
    real: real,
    chance: chance,
    escolher: escolher,
    normal: normal,
    diagnostico: diagnostico
  };
})(window.Poker = window.Poker || {});
