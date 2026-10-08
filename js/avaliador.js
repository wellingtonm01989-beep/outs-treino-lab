/* ==========================================================================
   OUTS · Treino Lab — avaliador.js
   Avaliador de mãos de 5, 6 ou 7 cartas (melhor mão de 5).

   Devolve um número inteiro "pontuação": quanto maior, melhor a mão.
   Duas mãos com a mesma pontuação empatam (pote dividido).

   Formato da pontuação (24 bits):
     categoria << 20  |  5 "casas" de 4 bits com os ranks relevantes
   Ex.: Dois pares, Ases e Noves, kicker Rei:
     2 << 20 | A << 16 | 9 << 12 | K << 8

   Categorias: 0 Carta alta, 1 Par, 2 Dois pares, 3 Trinca, 4 Sequência,
               5 Flush, 6 Full house, 7 Quadra, 8 Straight flush
   ========================================================================== */
(function (P) {
  'use strict';

  var CATEGORIAS = ['Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência',
    'Flush', 'Full house', 'Quadra', 'Straight flush'];

  // --------------------------------------------------------------------
  // Tabelas sobre máscaras de 13 bits (um bit por rank). Geradas uma vez
  // no carregamento — nada de arquivo externo.
  // --------------------------------------------------------------------
  var SEQ_ALTA = new Int8Array(8192);   // carta mais alta da melhor sequência, ou -1
  var MAIOR_BIT = new Int8Array(8192);  // rank mais alto presente, ou -1
  var TOP5 = new Int32Array(8192);      // 5 maiores ranks empacotados (4 bits cada)

  (function gerarTabelas() {
    for (var m = 0; m < 8192; m++) {
      var r;
      // rank mais alto
      var alto = -1;
      for (r = 12; r >= 0; r--) { if (m & (1 << r)) { alto = r; break; } }
      MAIOR_BIT[m] = alto;

      // melhor sequência: 5 bits seguidos; A-2-3-4-5 ("roda") vale até o 5
      var seq = -1;
      for (var topo = 12; topo >= 4; topo--) {
        var alvo = 0x1F << (topo - 4);
        if ((m & alvo) === alvo) { seq = topo; break; }
      }
      if (seq < 0 && (m & 0x100F) === 0x100F) seq = 3; // A + 2,3,4,5 -> carta alta = 5 (rank 3)
      SEQ_ALTA[m] = seq;

      // 5 maiores ranks, o maior na casa mais significativa
      var pacote = 0, n = 0;
      for (r = 12; r >= 0 && n < 5; r--) {
        if (m & (1 << r)) { pacote = (pacote << 4) | r; n++; }
      }
      while (n < 5) { pacote = pacote << 4; n++; }
      TOP5[m] = pacote;
    }
  })();

  // Áreas de trabalho reaproveitadas (evitam alocar memória a cada avaliação)
  var contagem = new Int8Array(13);
  var mascaraNaipe = new Int32Array(4);
  var qtdNaipe = new Int8Array(4);

  /**
   * Avalia de 5 a 7 cartas e devolve a pontuação da melhor mão de 5.
   * @param {number[]} cartas
   * @param {number} [n] quantas cartas do array considerar (padrão: todas)
   */
  function avaliar(cartas, n) {
    if (n === undefined) n = cartas.length;
    var i, r, s;
    for (r = 0; r < 13; r++) contagem[r] = 0;
    mascaraNaipe[0] = mascaraNaipe[1] = mascaraNaipe[2] = mascaraNaipe[3] = 0;
    qtdNaipe[0] = qtdNaipe[1] = qtdNaipe[2] = qtdNaipe[3] = 0;

    var mascara = 0;
    for (i = 0; i < n; i++) {
      var c = cartas[i];
      r = c >> 2; s = c & 3;
      contagem[r]++;
      mascara |= 1 << r;
      mascaraNaipe[s] |= 1 << r;
      qtdNaipe[s]++;
    }

    // Flush e straight flush
    var naipeFlush = -1;
    for (s = 0; s < 4; s++) if (qtdNaipe[s] >= 5) naipeFlush = s;
    if (naipeFlush >= 0) {
      var sf = SEQ_ALTA[mascaraNaipe[naipeFlush]];
      if (sf >= 0) return (8 << 20) | (sf << 16);
    }

    // Quadra, trincas e pares (do maior para o menor rank)
    var quadra = -1, trinca1 = -1, trinca2 = -1, par1 = -1, par2 = -1;
    for (r = 12; r >= 0; r--) {
      var k = contagem[r];
      if (k === 4) quadra = r;
      else if (k === 3) { if (trinca1 < 0) trinca1 = r; else if (trinca2 < 0) trinca2 = r; }
      else if (k === 2) { if (par1 < 0) par1 = r; else if (par2 < 0) par2 = r; }
    }

    if (quadra >= 0) {
      var kq = MAIOR_BIT[mascara & ~(1 << quadra)];
      return (7 << 20) | (quadra << 16) | ((kq < 0 ? 0 : kq) << 12);
    }

    if (trinca1 >= 0 && (trinca2 >= 0 || par1 >= 0)) {
      // com duas trincas, a segunda vira o "par" do full house
      var parFull = trinca2 > par1 ? trinca2 : par1;
      return (6 << 20) | (trinca1 << 16) | (parFull << 12);
    }

    if (naipeFlush >= 0) return (5 << 20) | TOP5[mascaraNaipe[naipeFlush]];

    var seq = SEQ_ALTA[mascara];
    if (seq >= 0) return (4 << 20) | (seq << 16);

    var resto;
    if (trinca1 >= 0) {
      resto = mascara & ~(1 << trinca1);
      return (3 << 20) | (trinca1 << 16) | ((TOP5[resto] >> 12) << 8);   // 2 kickers
    }

    if (par1 >= 0 && par2 >= 0) {
      // um eventual terceiro par continua em "resto" e pode ser o kicker
      resto = mascara & ~(1 << par1) & ~(1 << par2);
      var kd = MAIOR_BIT[resto];
      return (2 << 20) | (par1 << 16) | (par2 << 12) | ((kd < 0 ? 0 : kd) << 8);
    }

    if (par1 >= 0) {
      resto = mascara & ~(1 << par1);
      return (1 << 20) | (par1 << 16) | ((TOP5[resto] >> 8) << 4);        // 3 kickers
    }

    return TOP5[mascara];
  }

  function categoria(pontuacao) { return pontuacao >> 20; }

  /** Rank guardado na casa i (0 = mais significativa) da pontuação. */
  function casa(pontuacao, i) { return (pontuacao >> (16 - 4 * i)) & 15; }

  /** Descrição em português: { categoria, nomeCategoria, descricao } */
  function descrever(pontuacao) {
    var cat = categoria(pontuacao);
    var NR = P.Cartas.NOME_RANK, NP = P.Cartas.NOME_RANK_PLURAL;
    var a = casa(pontuacao, 0), b = casa(pontuacao, 1);
    var d;
    switch (cat) {
      case 8: d = a === 12 ? 'Royal flush' : 'Straight flush até o ' + NR[a]; break;
      case 7: d = 'Quadra de ' + NP[a]; break;
      case 6: d = 'Full house, ' + NP[a] + ' com ' + NP[b]; break;
      case 5: d = 'Flush, ' + NR[a] + ' alto'; break;
      case 4: d = 'Sequência até o ' + NR[a] + (a === 3 ? ' (roda A-5)' : ''); break;
      case 3: d = 'Trinca de ' + NP[a]; break;
      case 2: d = 'Dois pares, ' + NP[a] + ' e ' + NP[b]; break;
      case 1: d = 'Par de ' + NP[a]; break;
      default: d = 'Carta alta, ' + NR[a];
    }
    return { categoria: cat, nomeCategoria: (cat === 8 && a === 12) ? 'Royal flush' : CATEGORIAS[cat], descricao: d };
  }

  /**
   * As 5 cartas que formam a melhor mão (para destacar na mesa).
   * Força bruta sobre as combinações de 5 — só usada para exibir.
   */
  function melhoresCinco(cartas) {
    var n = cartas.length;
    if (n <= 5) return cartas.slice();
    var alvo = avaliar(cartas, n);
    var tmp = [0, 0, 0, 0, 0];
    for (var a = 0; a < n; a++)
      for (var b = a + 1; b < n; b++)
        for (var c = b + 1; c < n; c++)
          for (var d = c + 1; d < n; d++)
            for (var e = d + 1; e < n; e++) {
              tmp[0] = cartas[a]; tmp[1] = cartas[b]; tmp[2] = cartas[c]; tmp[3] = cartas[d]; tmp[4] = cartas[e];
              if (avaliar(tmp, 5) === alvo) return tmp.slice();
            }
    return cartas.slice(0, 5);
  }

  P.Avaliador = {
    CATEGORIAS: CATEGORIAS,
    avaliar: avaliar,
    categoria: categoria,
    casa: casa,
    descrever: descrever,
    melhoresCinco: melhoresCinco,
    // expostas para o coach (detecção de draws) e para os testes
    tabelas: { SEQ_ALTA: SEQ_ALTA, MAIOR_BIT: MAIOR_BIT, TOP5: TOP5 }
  };
})(window.Poker = window.Poker || {});
