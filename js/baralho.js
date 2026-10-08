/* ==========================================================================
   OUTS · Treino Lab — baralho.js
   Representação das cartas, embaralhamento Fisher-Yates e o distribuidor
   de uma mão (baralho novo, embaralhado uma única vez, ordem real de
   distribuição com burn antes de flop, turn e river).

   Carta = número de 0 a 51:  carta = rank * 4 + naipe
     rank : 0 = 2, 1 = 3, ..., 8 = T, 9 = J, 10 = Q, 11 = K, 12 = A
     naipe: 0 = espadas (s), 1 = copas (h), 2 = ouros (d), 3 = paus (c)
   ========================================================================== */
(function (P) {
  'use strict';

  var RANKS = '23456789TJQKA';
  var NAIPES = 'shdc';
  var SIMBOLOS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣
  var NOMES_NAIPE = ['espadas', 'copas', 'ouros', 'paus'];

  // Nomes em português (singular e plural) usados pelo avaliador e pelo coach
  var NOME_RANK = ['Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Valete', 'Dama', 'Rei', 'Ás'];
  var NOME_RANK_PLURAL = ['Dois', 'Três', 'Quatros', 'Cincos', 'Seis', 'Setes', 'Oitos', 'Noves', 'Dez', 'Valetes', 'Damas', 'Reis', 'Ases'];
  var ROTULO_RANK = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  // ---------------------------------------------------------------- Cartas
  function criar(rank, naipe) { return rank * 4 + naipe; }
  function rankDe(c) { return c >> 2; }
  function naipeDe(c) { return c & 3; }

  /** "As", "Td", "9c"... */
  function texto(c) { return RANKS.charAt(c >> 2) + NAIPES.charAt(c & 3); }

  /** "A♠", "10♦"... (para exibir ao usuário) */
  function bonito(c) { return ROTULO_RANK[c >> 2] + SIMBOLOS[c & 3]; }

  /** Converte "As" / "10s" / "aS" em número. Lança erro se inválido. */
  function deTexto(s) {
    s = String(s).trim();
    var r, n;
    if (s.length === 3 && s.substr(0, 2) === '10') { r = 8; n = NAIPES.indexOf(s.charAt(2).toLowerCase()); }
    else if (s.length === 2) { r = RANKS.indexOf(s.charAt(0).toUpperCase()); n = NAIPES.indexOf(s.charAt(1).toLowerCase()); }
    else { r = -1; n = -1; }
    if (r < 0 || n < 0) throw new Error('Carta inválida: "' + s + '"');
    return criar(r, n);
  }

  /** "AsKd Qh" ou "AsKdQh" -> [51, 46, 41] */
  function lista(str) {
    if (Array.isArray(str)) return str.slice();
    var limpo = String(str).replace(/[\s,]+/g, '').replace(/10/g, 'T');
    if (limpo.length % 2 !== 0) throw new Error('Lista de cartas inválida: "' + str + '"');
    var out = [];
    for (var i = 0; i < limpo.length; i += 2) out.push(deTexto(limpo.substr(i, 2)));
    return out;
  }

  function listaTexto(cartas, separador) {
    return cartas.map(texto).join(separador === undefined ? ' ' : separador);
  }

  function listaBonita(cartas) {
    return cartas.map(bonito).join(' ');
  }

  P.Cartas = {
    RANKS: RANKS,
    NAIPES: NAIPES,
    SIMBOLOS: SIMBOLOS,
    NOMES_NAIPE: NOMES_NAIPE,
    NOME_RANK: NOME_RANK,
    NOME_RANK_PLURAL: NOME_RANK_PLURAL,
    ROTULO_RANK: ROTULO_RANK,
    criar: criar,
    rankDe: rankDe,
    naipeDe: naipeDe,
    texto: texto,
    bonito: bonito,
    deTexto: deTexto,
    lista: lista,
    listaTexto: listaTexto,
    listaBonita: listaBonita
  };

  // --------------------------------------------------------------- Baralho
  /** Baralho de 52 cartas em ordem (0..51). */
  function novoOrdenado() {
    var b = new Array(52);
    for (var i = 0; i < 52; i++) b[i] = i;
    return b;
  }

  /**
   * Fisher-Yates completo (versão de Durstenfeld), in-place.
   * Para i de n-1 até 1: j uniforme em [0, i] (crypto + rejection sampling).
   * Funciona com Array comum ou typed array (a auditoria usa Uint8Array).
   */
  function embaralhar(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = P.RNG.inteiroAbaixo(i + 1);
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /**
   * Distribuidor de UMA mão. O baralho fica preso neste closure: o motor
   * pede cartas uma a uma e ninguém (bots, coach, interface) enxerga o
   * restante. A ordem completa só é revelada no fim da mão, para o histórico.
   *
   * ordemDeTeste: USO EXCLUSIVO de testes.html, para montar situações
   * conhecidas (side pots, empates...). O jogo nunca passa esse parâmetro:
   * na mesa o baralho é sempre embaralhado pelo crypto.
   */
  function criarDistribuidor(ordemDeTeste) {
    var cartas;
    if (ordemDeTeste) {
      cartas = ordemDeTeste.slice();
      var vistas = {};
      if (cartas.length !== 52) throw new Error('Baralho de teste precisa de 52 cartas');
      cartas.forEach(function (c) {
        if (!(c >= 0 && c < 52) || vistas[c]) throw new Error('Baralho de teste inválido');
        vistas[c] = 1;
      });
    } else {
      cartas = embaralhar(novoOrdenado()); // embaralhado UMA única vez
    }
    var topo = 0;
    var queimadas = [];

    function proxima() {
      if (topo >= 52) throw new Error('Baralho esgotado');
      return cartas[topo++];
    }

    /**
     * Distribui 2 cartas para cada assento, uma carta por vez, na ordem
     * recebida (o motor passa a ordem começando à esquerda do botão).
     * Retorna { assento: [c1, c2] }.
     */
    function distribuirMaos(ordemAssentos) {
      var maos = {};
      var k;
      for (k = 0; k < ordemAssentos.length; k++) maos[ordemAssentos[k]] = [];
      for (var volta = 0; volta < 2; volta++) {
        for (k = 0; k < ordemAssentos.length; k++) maos[ordemAssentos[k]].push(proxima());
      }
      return maos;
    }

    function queimar() {
      var c = proxima();
      queimadas.push(c);
      return c;
    }

    return {
      distribuirMaos: distribuirMaos,
      flop: function () { queimar(); return [proxima(), proxima(), proxima()]; },
      turn: function () { queimar(); return proxima(); },
      river: function () { queimar(); return proxima(); },
      queimadas: function () { return queimadas.slice(); },
      usadas: function () { return topo; },
      /** Ordem completa do baralho (cópia). Só deve ser lida depois da mão. */
      ordemCompleta: function () { return cartas.slice(); }
    };
  }

  P.Baralho = {
    novoOrdenado: novoOrdenado,
    embaralhar: embaralhar,
    criarDistribuidor: criarDistribuidor
  };
})(window.Poker = window.Poker || {});
