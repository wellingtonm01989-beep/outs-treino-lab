/* ==========================================================================
   OUTS · Treino Lab — testes/testes-nucleo.js
   Testes da Fase 1: RNG, baralho, avaliador de mãos, ranges e equity.
   ========================================================================== */
(function (P) {
  'use strict';

  var T = P.Testes.teste;
  var C = P.Cartas, A = P.Avaliador, RNG = P.RNG;
  var DOIS_32 = 4294967296;

  function av(str) { return A.avaliar(C.lista(str)); }
  function pct(x, casas) { return (x * 100).toFixed(casas === undefined ? 2 : casas).replace('.', ',') + '%'; }
  function milhar(n) { return Math.round(n).toLocaleString('pt-BR'); }
  function ordenar(arr) { return arr.slice().sort(function (a, b) { return a - b; }); }

  // =================================================================== RNG
  var G = 'Aleatoriedade (crypto + rejection sampling)';

  T(G, 'inteiroAbaixo(n) sempre devolve inteiro em [0, n)', function (a) {
    [1, 2, 3, 7, 52, 1000, 2147483649].forEach(function (n) {
      for (var i = 0; i < 3000; i++) {
        var x = RNG.inteiroAbaixo(n);
        a.verdadeiro(x >= 0 && x < n && Math.floor(x) === x, 'n=' + n + ' gerou ' + x);
      }
    });
    a.lanca(function () { RNG.inteiroAbaixo(0); }, 'n=0 deveria ser recusado');
    a.lanca(function () { RNG.inteiroAbaixo(2.5); }, 'n fracionário deveria ser recusado');
  });

  T(G, 'Limite de rejeição = maior múltiplo de n que cabe em 2^32', function (a) {
    [2, 3, 7, 51, 52, 1000003, 2147483649].forEach(function (n) {
      var L = RNG.limiteRejeicao(n);
      a.igual(L % n, 0, 'limite múltiplo de ' + n);
      a.verdadeiro(L <= DOIS_32 && DOIS_32 - L < n, 'limite máximo para n=' + n);
    });
    var L52 = RNG.limiteRejeicao(52);
    return 'n = 52: descarta os ' + (DOIS_32 - L52) + ' valores ≥ ' + milhar(L52) + ' antes do módulo';
  });

  T(G, 'Uniformidade de inteiroAbaixo(6) — qui-quadrado, 600.000 sorteios', function (a) {
    var c = new Float64Array(6);
    for (var i = 0; i < 600000; i++) c[RNG.inteiroAbaixo(6)]++;
    var r = P.Estat.quiQuadradoUniforme(c);
    a.verdadeiro(r.p > 0.001, 'p-valor baixo demais: ' + r.p);
    return 'χ² = ' + r.x2.toFixed(2) + ' (gl ' + r.gl + '), p = ' + r.p.toFixed(3);
  });

  T(G, 'Uniformidade de inteiroAbaixo(52) — qui-quadrado, 1.040.000 sorteios', function (a) {
    var c = new Float64Array(52);
    for (var i = 0; i < 1040000; i++) c[RNG.inteiroAbaixo(52)]++;
    var r = P.Estat.quiQuadradoUniforme(c);
    a.verdadeiro(r.p > 0.001, 'p-valor baixo demais: ' + r.p);
    return 'χ² = ' + r.x2.toFixed(2) + ' (gl ' + r.gl + '), p = ' + r.p.toFixed(3);
  });

  T(G, 'Os números vêm de crypto.getRandomValues (reserva é recarregada)', function (a) {
    var antes = RNG.diagnostico().recargas;
    for (var i = 0; i < 40000; i++) RNG.uint32();
    var depois = RNG.diagnostico().recargas;
    a.maior(depois, antes, 'recargas do crypto');
    return (depois - antes) + ' recargas de ' + milhar(RNG.diagnostico().tamanhoReserva) + ' números';
  });

  T(G, 'Math.random nunca é chamado (embaralhar, distribuir e equity)', function (a) {
    var original = Math.random, chamadas = 0;
    Math.random = function () { chamadas++; return original(); };
    try {
      for (var i = 0; i < 2000; i++) {
        var d = P.Baralho.criarDistribuidor();
        d.distribuirMaos([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        d.flop(); d.turn(); d.river();
      }
      P.Equity.monteCarloSincrono({ jogadores: ['AsAh', { range: 'todas' }], iteracoes: 2000 });
    } finally {
      Math.random = original;
    }
    a.igual(chamadas, 0, 'chamadas a Math.random');
    return '2.000 mãos distribuídas + 2.000 simulações: 0 chamadas';
  });

  // =============================================================== Baralho
  G = 'Baralho e distribuição';

  T(G, 'Cartas: texto ↔ número para as 52 cartas', function (a) {
    for (var c = 0; c < 52; c++) a.igual(C.deTexto(C.texto(c)), c, 'ida e volta de ' + c);
    a.igual(C.deTexto('As'), 48);
    a.igual(C.deTexto('2s'), 0);
    a.igualJSON(C.lista('AsKd 10h'), [48, 46, 33]);
    a.lanca(function () { C.deTexto('Xx'); });
    return '2♠ = 0 … A♣ = 51';
  });

  T(G, 'Fisher-Yates preserva as 52 cartas (5.000 embaralhamentos)', function (a) {
    var ref = P.Baralho.novoOrdenado().join(',');
    for (var i = 0; i < 5000; i++) {
      var b = P.Baralho.embaralhar(P.Baralho.novoOrdenado());
      a.igual(ordenar(b).join(','), ref, 'permutação inválida');
    }
  });

  T(G, 'Ordem real: 1 carta por vez a partir da esquerda do botão, burn antes de flop/turn/river', function (a) {
    var d = P.Baralho.criarDistribuidor();
    var ordem = d.ordemCompleta();
    var assentos = [3, 5, 7, 0];            // ordem a partir da esquerda do botão
    var maos = d.distribuirMaos(assentos);
    assentos.forEach(function (s, k) {
      a.igual(maos[s][0], ordem[k], '1ª carta do assento ' + s);
      a.igual(maos[s][1], ordem[assentos.length + k], '2ª carta do assento ' + s);
    });
    a.igualJSON(d.flop(), [ordem[9], ordem[10], ordem[11]], 'flop (burn na posição 8)');
    a.igual(d.turn(), ordem[13], 'turn (burn na posição 12)');
    a.igual(d.river(), ordem[15], 'river (burn na posição 14)');
    a.igualJSON(d.queimadas(), [ordem[8], ordem[12], ordem[14]], 'cartas queimadas');
    a.igual(d.usadas(), 16);
    return '4 jogadores: cartas 0–7 nas mãos, burn 8, flop 9–11, burn 12, turn 13, burn 14, river 15';
  });

  T(G, 'Baralho novo a cada mão, embaralhado uma única vez', function (a) {
    var d = P.Baralho.criarDistribuidor();
    var antes = d.ordemCompleta();
    d.distribuirMaos([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    d.flop(); d.turn(); d.river();
    a.igualJSON(d.ordemCompleta(), antes, 'a ordem mudou durante a mão');
    var copia = d.ordemCompleta(); copia[0] = 99;
    a.verdadeiro(d.ordemCompleta()[0] !== 99, 'ordemCompleta deve devolver cópia');
    var vistos = {};
    for (var i = 0; i < 500; i++) {
      var k = P.Baralho.criarDistribuidor().ordemCompleta().join(',');
      a.verdadeiro(!vistos[k], 'dois baralhos idênticos');
      vistos[k] = 1;
    }
  });

  // ============================================================= Avaliador
  G = 'Avaliador de mãos (7 cartas)';

  T(G, 'Ranking das 9 categorias', function (a) {
    var maos = [
      ['9h 8h 7h 6h 5h 2c 3d', 8],
      ['Ks Kh Kd Kc 2h 3d 7s', 7],
      ['Qs Qh Qd 4c 4d 9s 2h', 6],
      ['Ah Th 7h 4h 2h Kc Qd', 5],
      ['9c 8d 7h 6s 5c Ks 2d', 4],
      ['7s 7h 7d Ac Kd 4s 2h', 3],
      ['As Ad 9c 9h Kd 4s 2h', 2],
      ['Js Jd Ac 9h 6d 4s 2h', 1],
      ['Ac Qd 9h 7s 5c 3d 2h', 0]
    ];
    var anterior = Infinity;
    maos.forEach(function (m) {
      var s = av(m[0]);
      a.igual(A.categoria(s), m[1], m[0]);
      a.verdadeiro(s < anterior, m[0] + ' deveria perder para a mão anterior');
      anterior = s;
    });
    return maos.map(function (m) { return A.descrever(av(m[0])).nomeCategoria; }).join(' > ');
  });

  T(G, 'Royal flush é reconhecido e vence straight flush até o Rei', function (a) {
    var r = av('As Ks Qs Js Ts 2d 3c');
    a.igual(A.descrever(r).nomeCategoria, 'Royal flush');
    a.maior(r, av('Ks Qs Js Ts 9s 2d 3c'));
  });

  T(G, 'Sequência A-2-3-4-5 (roda) vale até o 5 e perde para 2-3-4-5-6', function (a) {
    var roda = av('Ac 2d 3h 4s 5c Kd 9h');
    a.igual(A.categoria(roda), 4);
    a.igual(A.casa(roda, 0), 3, 'carta alta da roda deve ser o 5');
    a.maior(av('2d 3h 4s 5c 6d Kd 9h'), roda);
    a.igual(A.casa(av('As 2d 3h 4c 5s 6d Kh'), 0), 4, 'A-2-3-4-5-6 deve virar sequência até o 6');
    a.maior(av('Ac Kd Qh Js Tc 2d 3h'), av('Kd Qh Js Tc 9c 2d 3h'));
    return A.descrever(roda).descricao;
  });

  T(G, 'Straight flush A-5 perde para straight flush até o 6 e vence quadra', function (a) {
    var sfRoda = av('Ah 2h 3h 4h 5h Kd Qc');
    a.igual(A.categoria(sfRoda), 8);
    a.maior(av('2h 3h 4h 5h 6h Kd Qc'), sfRoda);
    a.maior(sfRoda, av('As Ad Ah Ac Kd Qc 2s'));
  });

  T(G, 'Straight flush tem prioridade sobre um flush maior nas mesmas 7 cartas', function (a) {
    var s = av('9h 8h 7h 6h 5h Ah Kh');
    a.igual(A.categoria(s), 8);
    a.igual(A.casa(s, 0), 7, 'straight flush até o 9');
  });

  T(G, 'Kicker decide entre pares iguais', function (a) {
    var board = 'Ah 9c 7d 4s 2h ';
    a.maior(av(board + 'As Kd'), av(board + 'Ac Qd'), 'AK deveria vencer AQ');
    var board2 = 'Ah 9c 7d Ks Qh ';
    a.igual(av(board2 + 'As 3d'), av(board2 + 'Ac 5d'), 'kickers do board jogam: empate');
  });

  T(G, 'Empate quando o board joga (pote dividido)', function (a) {
    a.igual(av('As Ks Qd Jh Tc 2c 3d'), av('As Ks Qd Jh Tc 4h 5h'), 'broadway no board');
    a.igual(av('Ah Ad Kc Ks Qh 2c 3c'), av('Ah Ad Kc Ks Qh Jd 9d'), 'AAKKQ no board');
  });

  T(G, 'Dois pares: com três pares usa os dois maiores e o melhor kicker', function (a) {
    a.igual(av('Ks Kd 9h 9c 5s 5d Qh'), av('Ks Kd 9h 9c Qh'), 'kicker Q');
    a.igual(av('Ks Kd 9h 9c 5s 5d 2h'), av('Ks Kd 9h 9c 5s'), 'terceiro par vira kicker');
  });

  T(G, 'Full house: com duas trincas usa a maior como trinca', function (a) {
    a.igual(av('8s 8d 8h 4c 4d 4s Kh'), av('8s 8d 8h 4c 4d'));
    a.igual(av('8s 8d 8h 4c 4d Kc Kd'), av('8s 8d 8h Kc Kd'), 'escolhe o maior par');
    a.maior(av('As Ad Ah 2c 2d'), av('Ks Kd Kh Ac Ad'), 'AAA22 > KKKAA');
  });

  T(G, 'Flush: com 6 cartas do naipe usa as 5 maiores; a 5ª carta desempata', function (a) {
    a.igual(av('Ah Kh 9h 6h 4h 3h 2c'), av('Ah Kh 9h 6h 4h'));
    a.maior(av('Ah Kh 9h 6h 4h'), av('Ah Kh 9h 6h 3h'));
  });

  T(G, 'Quadra: o kicker pode vir do board', function (a) {
    a.igual(av('7s 7h 7d 7c Ad Kc Qc'), av('7s 7h 7d 7c Ad 2c 3c'), 'A do board joga: empate');
    a.maior(av('7s 7h 7d 7c 2d Kc 3c'), av('7s 7h 7d 7c 2d Qc Jc'), 'kicker K > Q');
  });

  T(G, 'Trinca: os dois kickers decidem', function (a) {
    a.maior(av('8s 8h 8d 5c 2d Ac 3h'), av('8s 8h 8d 5c 2d Kc Qh'), 'A-5 > K-Q');
    a.maior(av('8s 8h 8d 5c 2d Ac Qh'), av('8s 8h 8d 5c 2d Ad Jh'), 'A-Q > A-J');
  });

  T(G, 'Sequência: com 6 cartas seguidas usa a maior', function (a) {
    a.igual(A.casa(av('4c 5d 6h 7s 8c 9d Kh'), 0), 7, 'deve ser até o 9');
  });

  T(G, 'melhoresCinco devolve as cartas que formam a mão', function (a) {
    var cinco = A.melhoresCinco(C.lista('As Ad 9c 9h Kd 4s 2h'));
    a.igualJSON(ordenar(cinco), ordenar(C.lista('As Ad 9c 9h Kd')));
  });

  T(G, '7 cartas = melhor das 21 combinações de 5 (3.000 mãos aleatórias)', function (a) {
    var h5 = [0, 0, 0, 0, 0];
    for (var i = 0; i < 3000; i++) {
      var h = P.Baralho.embaralhar(P.Baralho.novoOrdenado()).slice(0, 7);
      var melhor = -1;
      for (var x = 0; x < 7; x++) for (var y = x + 1; y < 7; y++) {
        var k = 0;
        for (var z = 0; z < 7; z++) if (z !== x && z !== y) h5[k++] = h[z];
        var s = A.avaliar(h5, 5);
        if (s > melhor) melhor = s;
      }
      a.igual(A.avaliar(h, 7), melhor, C.listaTexto(h));
    }
  });

  T(G, 'Contagem exata das 2.598.960 mãos de 5 cartas por categoria (e 7.462 classes)', function (a) {
    var esperado = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
    return new Promise(function (ok, falha) {
      var cont = [0, 0, 0, 0, 0, 0, 0, 0, 0], vistos = new Uint8Array(9 << 20);
      var royal = 0, c1 = 0, h = [0, 0, 0, 0, 0];
      var ROYAL = (8 << 20) | (12 << 16);
      function bloco() {
        try {
          var t0 = performance.now(), n = 0;
          while (c1 < 48 && (n === 0 || performance.now() - t0 < 40)) {
            for (var c2 = c1 + 1; c2 < 49; c2++)
              for (var c3 = c2 + 1; c3 < 50; c3++)
                for (var c4 = c3 + 1; c4 < 51; c4++)
                  for (var c5 = c4 + 1; c5 < 52; c5++) {
                    h[0] = c1; h[1] = c2; h[2] = c3; h[3] = c4; h[4] = c5;
                    var s = A.avaliar(h, 5);
                    cont[s >> 20]++;
                    vistos[s] = 1;
                    if (s === ROYAL) royal++;
                  }
            c1++; n++;
          }
          if (c1 < 48) { setTimeout(bloco, 0); return; }
          var distintos = 0;
          for (var i = 0; i < vistos.length; i++) distintos += vistos[i];
          for (var k = 0; k < 9; k++) a.igual(cont[k], esperado[k], A.CATEGORIAS[k]);
          a.igual(royal, 4, 'royal flushes');
          a.igual(distintos, 7462, 'classes distintas de mão');
          ok('SF 40 (4 royal) · quadra 624 · full 3.744 · flush 5.108 · seq 10.200 · trinca 54.912 · 2 pares 123.552 · par 1.098.240 · carta alta 1.302.540');
        } catch (e) { falha(e); }
      }
      setTimeout(bloco, 0);
    });
  });

  T(G, 'Velocidade do avaliador (7 cartas)', function (a) {
    var maos = [];
    for (var i = 0; i < 2000; i++) maos.push(P.Baralho.embaralhar(P.Baralho.novoOrdenado()).slice(0, 7));
    var t0 = performance.now(), soma = 0;
    for (var r = 0; r < 500; r++) for (i = 0; i < 2000; i++) soma += A.avaliar(maos[i], 7);
    var ms = Math.max(performance.now() - t0, 1);
    var porSeg = 1000000 / (ms / 1000);
    a.verdadeiro(soma > 0);
    a.verdadeiro(porSeg > 200000, 'avaliador lento demais: ' + Math.round(porSeg) + '/s');
    return (porSeg / 1e6).toFixed(1).replace('.', ',') + ' milhões de mãos por segundo';
  });

  // ================================================================ Ranges
  G = 'Ranges e grade 13×13';

  T(G, 'Parser de ranges conta os combos certos', function (a) {
    var casos = [
      ['QQ+', 18], ['AKs', 4], ['AKo', 12], ['QQ+, AKs', 22], ['22+', 78], ['todas', 1326],
      ['ATs+', 16], ['A5s-A2s', 16], ['KQ', 16], ['77-TT', 24], ['TT-77', 24], ['AJo:0.5', 6], ['K9o+', 48]
    ];
    casos.forEach(function (c) { a.igual(P.Ranges.contarCombos(P.Ranges.parse(c[0])), c[1], c[0]); });
    a.lanca(function () { P.Ranges.parse('AXs'); });
    a.lanca(function () { P.Ranges.parse('A'); });
    return casos.map(function (c) { return c[0] + ' = ' + c[1]; }).join(' · ');
  });

  T(G, 'Grade 13×13: 169 classes, naipadas acima da diagonal', function (a) {
    var todas = P.Ranges.todasClasses();
    a.igual(todas.length, 169);
    var unicas = {};
    todas.forEach(function (n) { unicas[n] = 1; });
    a.igual(Object.keys(unicas).length, 169, 'classes únicas');
    a.igual(P.Ranges.classeDaCelula(0, 0), 'AA');
    a.igual(P.Ranges.classeDaCelula(0, 1), 'AKs');
    a.igual(P.Ranges.classeDaCelula(1, 0), 'AKo');
    a.igual(P.Ranges.classeDaCelula(12, 12), '22');
    a.igual(P.Ranges.classeDaMao(C.deTexto('Ks'), C.deTexto('As')), 'AKs');
    a.igual(P.Ranges.classeDaMao(C.deTexto('7d'), C.deTexto('7c')), '77');
    var total = 0;
    todas.forEach(function (n) {
      var cel = P.Ranges.celulaDaClasse(n);
      a.igual(P.Ranges.classeDaCelula(cel.lin, cel.col), n, 'ida e volta de ' + n);
      total += P.Ranges.combosDaClasse(n).length;
    });
    a.igual(total, 1326, 'total de combos');
  });

  // ================================================================ Equity
  G = 'Equity';

  /**
   * Equity média exata de uma classe contra outra. Os naipes mudam a conta
   * (ex.: KK com naipes que o AA não tem ganha mais flushes), então somamos
   * as configurações de naipes possíveis, cada uma com o seu peso
   * (quantos combos reais caem nela). Cada configuração = 1.712.304 boards.
   */
  function mediaExata(configs) {
    var resultados = [];
    return configs.reduce(function (cadeia, cfg) {
      return cadeia.then(function () {
        return P.Equity.promessa('exata', { jogadores: cfg.maos }).then(function (r) {
          verificarBoards(r);
          resultados.push({ cfg: cfg, r: r });
        });
      });
    }, Promise.resolve()).then(function () {
      var soma = 0, pesos = 0;
      resultados.forEach(function (x) { soma += x.r.equity[0] * x.cfg.peso; pesos += x.cfg.peso; });
      return { media: soma / pesos, partes: resultados };
    });
  }
  function verificarBoards(r) {
    if (r.iteracoes !== 1712304) throw new Error('esperava 1.712.304 boards, enumerou ' + r.iteracoes);
  }
  function detalheConfigs(partes) {
    return partes.map(function (x) {
      return C.listaBonita(C.lista(x.cfg.maos[0])) + ' × ' + C.listaBonita(C.lista(x.cfg.maos[1])) + ' ' + pct(x.r.equity[0]) + ' (peso ' + x.cfg.peso + ')';
    }).join(' · ');
  }

  T(G, 'AA × KK pré-flop ≈ 82% (exata: 3 configurações de naipes × 1.712.304 boards)', function (a) {
    // AA fixo em ♠♥. Dos 6 combos de KK: 1 com os mesmos naipes, 4 com um naipe em comum, 1 sem nenhum.
    return mediaExata([
      { maos: ['AsAh', 'KsKh'], peso: 1 },
      { maos: ['AsAh', 'KsKd'], peso: 4 },
      { maos: ['AsAh', 'KdKc'], peso: 1 }
    ]).then(function (m) {
      a.proximo(m.media * 100, 82, 1, 'equity média do AA');
      return 'Média AA × KK: ' + pct(m.media) + ' — ' + detalheConfigs(m.partes);
    });
  });

  T(G, 'AKs × QQ pré-flop ≈ 46% (exata: 2 configurações de naipes)', function (a) {
    // AKs em ♠. Dos 6 combos de QQ: 3 têm uma Dama de ♠ (bloqueia o flush), 3 não têm.
    return mediaExata([
      { maos: ['AsKs', 'QsQh'], peso: 3 },
      { maos: ['AsKs', 'QhQd'], peso: 3 }
    ]).then(function (m) {
      a.proximo(m.media * 100, 46, 1, 'equity média do AKs');
      return 'Média AKs × QQ: ' + pct(m.media) + ' — ' + detalheConfigs(m.partes);
    });
  });

  T(G, 'Monte Carlo (20.000) bate com o valor exato: AA × KK', function (a) {
    var exato = P.Equity.exataSincrona({ jogadores: ['AsAh', 'KdKc'], board: '' });
    return P.Equity.promessa('monteCarlo', { jogadores: ['AsAh', 'KdKc'], iteracoes: 20000 }).then(function (r) {
      a.proximo(r.equity[0], exato.equity[0], 0.015, 'Monte Carlo × exato');
      return 'Monte Carlo ' + pct(r.equity[0]) + ' (± ' + pct(r.erroPadrao[0]) + ') × exato ' + pct(exato.equity[0]);
    });
  });

  T(G, 'Equity contra range: AA × mão aleatória ≈ 85,2%', function (a) {
    return P.Equity.promessa('monteCarlo', { jogadores: ['AsAh', { range: 'todas' }], iteracoes: 20000 }).then(function (r) {
      a.proximo(r.equity[0] * 100, 85.2, 1.5, 'AA contra 100% das mãos');
      return 'AA ' + pct(r.equity[0]) + ' contra 100% das mãos (Monte Carlo 20.000)';
    });
  });

  T(G, 'River: equity exata 100% e pote dividido 50%', function (a) {
    var r = P.Equity.exataSincrona({ jogadores: ['JsTs', 'AhAd'], board: 'As Ks Qs 2d 3c' });
    a.igual(r.iteracoes, 1);
    a.igual(r.equity[0], 1, 'royal flush do herói');
    r = P.Equity.exataSincrona({ jogadores: ['2c3d', 'AhAd'], board: 'As Ks Qs Js Ts' });
    a.igual(r.equity[0], 0.5, 'royal no board: divide');
  });

  T(G, 'Outs sujos: flush draw com 9 cartas, mas o 9♥ dá full house ao vilão (8/44)', function (a) {
    var r = P.Equity.exataSincrona({ jogadores: ['KhQh', 'As9d'], board: 'Ah 7h 2c 9s' });
    a.igual(r.iteracoes, 44, 'rivers possíveis');
    a.proximo(r.equity[0], 8 / 44, 1e-12, 'equity do herói no turn');
    return 'herói ' + pct(r.equity[0]) + ' = 8 outs limpos ÷ 44 cartas';
  });

  T(G, 'Multiway: equities somam 100% (AA × KK × QQ)', function (a) {
    var r = P.Equity.monteCarloSincrono({ jogadores: ['AsAh', 'KdKc', 'QsQh'], iteracoes: 20000 });
    a.proximo(r.equity[0] + r.equity[1] + r.equity[2], 1, 1e-9, 'soma');
    a.maior(r.equity[0], r.equity[1], 'AA > KK');
    a.maior(r.equity[1], r.equity[2] - 0.02, 'KK ≥ QQ');
    return 'AA ' + pct(r.equity[0], 1) + ' · KK ' + pct(r.equity[1], 1) + ' · QQ ' + pct(r.equity[2], 1);
  });

  T(G, 'Carta repetida é recusada', function (a) {
    a.lanca(function () { P.Equity.monteCarloSincrono({ jogadores: ['AsAh', 'AsKd'], iteracoes: 10 }); });
    a.lanca(function () { P.Equity.monteCarloSincrono({ jogadores: ['AsAh', 'KdKc'], board: 'Kd 7h 2c', iteracoes: 10 }); });
  });

  T(G, 'Monte Carlo roda em blocos (a tela não trava)', function (a) {
    var avisos = 0;
    return P.Equity.promessa('monteCarlo', {
      jogadores: ['AhKh', { range: 'QQ+, AK' }], board: 'Kd 7h 2c', iteracoes: 10000, porBloco: 1000,
      aoProgresso: function () { avisos++; }
    }).then(function (r) {
      a.maior(avisos, 5, 'blocos executados');
      return avisos + ' blocos · A♥K♥ em K♦7♥2♣ contra QQ+/AK: ' + pct(r.equity[0], 1);
    });
  });

  T(G, '10.000 simulações (herói × range) em menos de 1 segundo', function (a) {
    var t0 = performance.now();
    var r = P.Equity.monteCarloSincrono({ jogadores: ['AhKh', { range: 'QQ+, AK, KQs, 77-99' }], board: 'Kd 7h 2c', iteracoes: 10000 });
    var ms = performance.now() - t0;
    a.verdadeiro(ms < 1000, 'levou ' + Math.round(ms) + ' ms');
    return Math.round(ms) + ' ms · equity ' + pct(r.equity[0], 1);
  });
})(window.Poker = window.Poker || {});
