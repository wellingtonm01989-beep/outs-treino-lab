/* ==========================================================================
   OUTS · Treino Lab — testes/testes-motor.js
   Testes da Fase 2: blinds, ordem de ação, heads-up, aumento mínimo,
   all-in incompleto, side pots, pote dividido, showdown, visão dos
   jogadores e simulações longas de conservação de fichas.
   ========================================================================== */
(function (P) {
  'use strict';

  var T = P.Testes.teste;
  var C = P.Cartas, M = P.Motor, RNG = P.RNG;

  // ----------------------------------------------------------- utilitários
  /** Ordem de distribuição: assentos a partir da esquerda do botão. */
  function ordemDesde(assentos, botao) {
    var depois = assentos.filter(function (s) { return s > botao; });
    var antes = assentos.filter(function (s) { return s <= botao; });
    return depois.concat(antes);
  }

  /**
   * Baralho de teste que entrega as mãos e o board pedidos
   * (burns e posições não usadas recebem as cartas que sobram).
   */
  function baralhoPara(ordem, maos, board) {
    var n = ordem.length, deck = new Array(52), usadas = {};
    function por(pos, c) {
      if (usadas[c]) throw new Error('Carta repetida no baralho de teste: ' + C.texto(c));
      deck[pos] = c; usadas[c] = 1;
    }
    ordem.forEach(function (s, k) {
      var cs = C.lista(maos[s]);
      por(k, cs[0]); por(n + k, cs[1]);
    });
    var p = 2 * n, posBoard = [p + 1, p + 2, p + 3, p + 5, p + 7];
    (board ? C.lista(board) : []).forEach(function (c, i) { por(posBoard[i], c); });
    var livres = [];
    for (var c = 0; c < 52; c++) if (!usadas[c]) livres.push(c);
    for (var i = 0; i < 52; i++) if (deck[i] === undefined) deck[i] = livres.shift();
    return deck;
  }

  /** Cria uma mão: { stacks: {assento: fichas}, botao, sb, bb, ante, anteBB, maos, board, mostra } */
  function criar(cfg) {
    var assentos = Object.keys(cfg.stacks).map(Number).sort(function (a, b) { return a - b; });
    var jogadores = assentos.map(function (s) {
      return { assento: s, nome: 'J' + s, fichas: cfg.stacks[s], mostraPerdedoras: !!(cfg.mostra && cfg.mostra[s]) };
    });
    var deck = cfg.maos ? baralhoPara(ordemDesde(assentos, cfg.botao), cfg.maos, cfg.board) : undefined;
    return M.novaMao({
      jogadores: jogadores, botao: cfg.botao, sb: cfg.sb, bb: cfg.bb,
      ante: cfg.ante, anteBB: cfg.anteBB, lugares: 9, baralhoDeTeste: deck
    });
  }

  /** Executa ações [assento, tipo, ate?] conferindo de quem é a vez. */
  function jogar(m, passos, a) {
    passos.forEach(function (p) {
      a.igual(m.vez(), p[0], 'vez antes de "' + p[1] + '"');
      m.agir(p[0], (p[1] === 'bet' || p[1] === 'raise') ? { tipo: p[1], ate: p[2] } : p[1]);
    });
  }

  function checkAteOFim(m) {
    var guarda = 0;
    while (!m.terminada()) {
      var v = m.acoesValidas();
      m.agir(v.assento, v.podeCheck ? 'check' : 'call');
      if (++guarda > 200) throw new Error('mão não terminou');
    }
  }

  function jogadorDe(v, assento) {
    for (var i = 0; i < v.jogadores.length; i++) if (v.jogadores[i].assento === assento) return v.jogadores[i];
    return null;
  }

  function somaObj(o) { return Object.keys(o).reduce(function (s, k) { return s + o[k]; }, 0); }

  // ================================================= blinds e ordem de ação
  var G = 'Motor: blinds, posições e ordem de ação';

  T(G, 'Blinds e ordem do pré-flop com 6 jogadores (UTG age primeiro)', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 1000, 5: 1000 }, botao: 0, sb: 5, bb: 10 });
    var v = m.vista(null);
    a.igual(v.assentoSB, 1, 'SB');
    a.igual(v.assentoBB, 2, 'BB');
    a.igual(m.vez(), 3, 'primeiro a agir');
    a.igual(jogadorDe(v, 1).apostaRua, 5);
    a.igual(jogadorDe(v, 2).apostaRua, 10);
    a.igual(v.pote, 15);
    a.igual(v.jogadores.map(function (j) { return j.posicao; }).join(','), 'BTN,SB,BB,UTG,HJ,CO');
    jogar(m, [[3, 'fold'], [4, 'fold'], [5, 'fold'], [0, 'fold'], [1, 'fold']], a);
    var r = m.resultado();
    a.verdadeiro(r.semShowdown, 'sem showdown');
    a.igual(r.ganhos[2], 5, 'BB ganha o SB');
    a.igual(r.ganhos[1], -5);
    return 'SB = assento 2, BB = assento 3, UTG abre a ação; todos foldam e o BB leva +5';
  });

  T(G, 'Heads-up: botão é o SB, age primeiro no pré-flop e por último depois do flop', function (a) {
    var m = criar({ stacks: { 2: 1000, 6: 1000 }, botao: 6, sb: 5, bb: 10 });
    var v = m.vista(null);
    a.igual(v.assentoSB, 6, 'o botão posta o SB');
    a.igual(v.assentoBB, 2);
    a.igual(m.vez(), 6, 'SB/botão age primeiro no pré-flop');
    jogar(m, [[6, 'call'], [2, 'check']], a);
    a.igual(m.rua(), 'flop');
    a.igual(m.vez(), 2, 'BB age primeiro no flop');
    jogar(m, [[2, 'check'], [6, 'check']], a);
    a.igual(m.rua(), 'turn');
    a.igual(m.vez(), 2, 'BB age primeiro no turn');
  });

  T(G, 'Heads-up: distribuição começa pelo BB (primeiro à esquerda do botão)', function (a) {
    var deck = P.Baralho.novoOrdenado();
    var m = M.novaMao({ jogadores: [{ assento: 2, fichas: 1000 }, { assento: 6, fichas: 1000 }], botao: 6, sb: 5, bb: 10, baralhoDeTeste: deck });
    m.agir(6, 'fold');
    var h = m.historicoCompleto();
    a.igualJSON(h.ordemDistribuicao, [2, 6]);
    var bb = h.jogadores.filter(function (j) { return j.assento === 2; })[0];
    a.igualJSON(bb.cartas, [deck[0], deck[2]], 'cartas do BB nas posições 1 e 3');
  });

  T(G, 'Posições por tamanho de mesa', function (a) {
    a.igual(M.nomesPosicoes(9).join(','), 'SB,BB,UTG,UTG+1,MP,LJ,HJ,CO,BTN');
    a.igual(M.nomesPosicoes(6).join(','), 'SB,BB,UTG,HJ,CO,BTN');
    a.igual(M.nomesPosicoes(3).join(','), 'SB,BB,BTN');
    a.igual(M.nomesPosicoes(2).join(','), 'BTN,BB');
  });

  T(G, 'Rotação do botão: pula assento vazio e jogador sem fichas', function (a) {
    var mesa = M.criarMesa({ lugares: 6, sb: 5, bb: 10, botaoInicial: 0 });
    mesa.sentar(0, { id: 'a', nome: 'A', fichas: 1000 });
    mesa.sentar(2, { id: 'b', nome: 'B', fichas: 1000 });
    mesa.sentar(3, { id: 'c', nome: 'C', fichas: 1000 });
    mesa.sentar(5, { id: 'd', nome: 'D', fichas: 0 });
    var botoes = [];
    for (var i = 0; i < 5; i++) {
      var m = mesa.proximaMao();
      botoes.push(m.vista(null).botao);
      while (!m.terminada()) m.agir(m.vez(), 'fold');
      mesa.concluirMao();
    }
    a.igualJSON(botoes, [0, 2, 3, 0, 2]);
    return 'botão: assentos ' + botoes.map(function (b) { return b + 1; }).join(' → ');
  });

  // ======================================================= aumento mínimo
  G = 'Motor: aumento mínimo e all-in incompleto';

  T(G, 'Pré-flop: abrir exige 2 BB; depois de abrir para 30, o re-raise mínimo é para 50', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }, botao: 0, sb: 5, bb: 10 });
    a.igual(m.acoesValidas().minAte, 20, 'abertura mínima');
    a.lanca(function () { m.agir(3, { tipo: 'raise', ate: 15 }); }, 'raise para 15 deveria ser recusado');
    m.agir(3, { tipo: 'raise', ate: 30 });
    var v = m.acoesValidas();
    a.igual(v.assento, 0);
    a.igual(v.minAte, 50, 're-raise mínimo');
    a.lanca(function () { m.agir(0, { tipo: 'raise', ate: 45 }); }, 'raise para 45 deveria ser recusado');
    m.agir(0, { tipo: 'raise', ate: 50 });
    a.igual(m.acoesValidas().minAte, 70, 'próximo mínimo');
  });

  T(G, 'Pós-flop: aposta mínima de 1 BB e raise mínimo do tamanho da aposta', function (a) {
    var m = criar({ stacks: { 2: 1000, 6: 1000 }, botao: 6, sb: 5, bb: 10 });
    jogar(m, [[6, 'call'], [2, 'check']], a);
    var v = m.acoesValidas();
    a.igual(v.tipoAposta, 'bet');
    a.igual(v.minAte, 10);
    a.lanca(function () { m.agir(2, { tipo: 'bet', ate: 5 }); });
    m.agir(2, { tipo: 'bet', ate: 40 });
    a.igual(m.acoesValidas().minAte, 80);
    a.lanca(function () { m.agir(6, { tipo: 'raise', ate: 79 }); });
    m.agir(6, { tipo: 'raise', ate: 80 });
    a.igual(m.acoesValidas().minAte, 120);
  });

  T(G, 'All-in incompleto não reabre a ação para quem já agiu', function (a) {
    // BTN 0, SB 1, BB 2 (stack curto)
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 160 }, botao: 0, sb: 5, bb: 10 });
    jogar(m, [[0, 'call'], [1, 'call'], [2, 'check']], a);
    a.igual(m.rua(), 'flop');
    jogar(m, [[1, 'bet', 100]], a);
    m.agir(2, 'allin');                                    // BB vai a 150: aumento de 50 (< 100)
    var vb = m.acoesValidas();
    a.igual(vb.assento, 0);
    a.verdadeiro(vb.podeApostar, 'o BTN ainda não agiu: pode aumentar');
    a.igual(vb.minAte, 250, 'mínimo = 150 + último aumento completo (100)');
    m.agir(0, 'call');
    var vs = m.acoesValidas();
    a.igual(vs.assento, 1);
    a.verdadeiro(!vs.podeApostar, 'o SB já agiu e só enfrenta +50: não pode re-aumentar');
    a.igual(vs.valorCall, 50);
    a.lanca(function () { m.agir(1, { tipo: 'raise', ate: 400 }); });
    a.lanca(function () { m.agir(1, 'allin'); });
    m.agir(1, 'call');
    a.igual(m.rua(), 'turn');
    return 'SB aposta 100, BB all-in 150 (incompleto): BTN pode aumentar; o SB só paga ou desiste';
  });

  T(G, 'All-ins incompletos que somados formam um aumento completo reabrem a ação', function (a) {
    // BTN 0, SB 1, BB 2, UTG 3
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 160, 3: 230 }, botao: 0, sb: 5, bb: 10 });
    jogar(m, [[3, 'call'], [0, 'call'], [1, 'call'], [2, 'check']], a);
    jogar(m, [[1, 'bet', 100]], a);
    m.agir(2, 'allin');     // 150
    m.agir(3, 'allin');     // 220 (aumento de 70: também incompleto)
    m.agir(0, 'call');
    var v = m.acoesValidas();
    a.igual(v.assento, 1);
    a.verdadeiro(v.podeApostar, 'o SB enfrenta +120 (≥ 100): ação reaberta');
    a.igual(v.minAte, 320);
    return 'SB aposta 100; all-ins de 150 e 220 → o SB enfrenta 120 a mais e pode re-aumentar';
  });

  T(G, 'BB curto (all-in no blind): os outros ainda pagam o big blind inteiro', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 6 }, botao: 0, sb: 5, bb: 10 });
    var v = m.acoesValidas();
    a.igual(v.assento, 0);
    a.igual(v.valorCall, 10, 'pagar o BB inteiro');
    jogar(m, [[0, 'call'], [1, 'call']], a);
    a.igual(m.rua(), 'flop', 'o BB all-in não tem o que decidir');
    var potes = m.vista(null).potes;
    a.igualJSON(potes.map(function (p) { return p.valor; }), [18, 8], 'pote principal 3×6, side pot 2×4');
    a.igualJSON(potes[1].elegiveis, [1, 0]);
  });

  // ================================================================ potes
  G = 'Motor: side pots, pote dividido e showdown';

  var MAOS_4 = { 1: 'Ah Ac', 2: 'Kh Kc', 3: 'Qh Qc', 0: 'Th Tc' };
  var BOARD_4 = '2c 7d 9h Js 4s';

  function cenarioTresAllins(maos) {
    // BTN 0 (1000), SB 1 (100), BB 2 (300), UTG 3 (600)
    var m = criar({ stacks: { 0: 1000, 1: 100, 2: 300, 3: 600 }, botao: 0, sb: 5, bb: 10, maos: maos, board: BOARD_4 });
    m.agir(3, 'allin');
    m.agir(0, 'call');
    m.agir(1, 'allin');
    m.agir(2, 'allin');
    return m;
  }

  T(G, 'Side pots com 3 all-ins: cada pote vai para a melhor mão elegível', function (a) {
    var m = cenarioTresAllins(MAOS_4);
    a.verdadeiro(m.terminada(), 'mão termina sozinha (board corrido)');
    var r = m.resultado();
    a.igualJSON(r.potes.map(function (p) { return p.valor; }), [400, 600, 600], 'valores dos potes');
    a.igualJSON(r.potes.map(function (p) { return p.elegiveis; }), [[1, 2, 3, 0], [2, 3, 0], [3, 0]], 'elegíveis');
    a.igualJSON(r.potes.map(function (p) { return p.vencedores[0].assento; }), [1, 2, 3], 'vencedores');
    a.igualJSON([r.fichasFinais[0], r.fichasFinais[1], r.fichasFinais[2], r.fichasFinais[3]], [400, 400, 600, 600]);
    a.verdadeiro(r.showdown.every(function (s) { return s.mostrou; }), 'com all-in, todos mostram');
    return 'principal 400 → AA · side 1 600 → KK · side 2 600 → QQ · TT fica com 400';
  });

  T(G, 'Side pots: o maior stack leva tudo quando tem a melhor mão', function (a) {
    var maos = { 1: 'Ah Ac', 2: 'Kh Kc', 3: 'Qh Qc', 0: '9s 9c' };
    var r = cenarioTresAllins(maos).resultado();
    a.igual(r.fichasFinais[0], 2000);
    a.igual(r.fichasFinais[1] + r.fichasFinais[2] + r.fichasFinais[3], 0);
  });

  T(G, 'Pote dividido: ficha ímpar vai para o primeiro vencedor à esquerda do botão', function (a) {
    // pote 25 (SB desiste) dividido entre BTN (0) e BB (2): o BB está mais perto da esquerda do botão
    var m = criar({ stacks: { 0: 100, 1: 100, 2: 100 }, botao: 0, sb: 5, bb: 10,
      maos: { 0: '2c 3d', 1: '6c 7c', 2: '4h 5h' }, board: 'As Ks Qs Js Ts' });
    jogar(m, [[0, 'call'], [1, 'fold'], [2, 'check']], a);
    checkAteOFim(m);
    var r = m.resultado();
    a.verdadeiro(r.potes[0].dividido);
    a.igual(r.ganhos[2], 3, 'BB recebe 13');
    a.igual(r.ganhos[0], 2, 'BTN recebe 12');
    a.igual(r.showdown[0].assento, 2, 'sem aposta no river, mostra primeiro quem está à esquerda do botão');
    return 'pote 25 → BB 13 e BTN 12';
  });

  T(G, 'Pote dividido em 3: as duas fichas ímpares vão para os dois primeiros à esquerda do botão', function (a) {
    // BTN 0, SB 1 (desiste), BB 2, UTG 3 → pote 35 entre BB, UTG e BTN
    var m = criar({ stacks: { 0: 100, 1: 100, 2: 100, 3: 100 }, botao: 0, sb: 5, bb: 10,
      maos: { 0: '2c 3d', 1: '6c 7c', 2: '4h 5h', 3: '8d 8c' }, board: 'As Ks Qs Js Ts' });
    jogar(m, [[3, 'call'], [0, 'call'], [1, 'fold'], [2, 'check']], a);
    checkAteOFim(m);
    var r = m.resultado();
    var v = {};
    r.potes[0].vencedores.forEach(function (x) { v[x.assento] = x.valor; });
    a.igualJSON([v[2], v[3], v[0]], [12, 12, 11]);
  });

  T(G, 'Aposta não paga é devolvida', function (a) {
    var m = criar({ stacks: { 2: 300, 6: 1000 }, botao: 6, sb: 5, bb: 10, maos: { 2: 'Ah Ad', 6: 'Kh Kd' }, board: '2c 7d 9h Js 4s' });
    m.agir(6, 'allin');
    m.agir(2, 'call');
    var ev = m.eventos().filter(function (e) { return e.tipo === 'devolucao'; });
    a.igual(ev.length, 1);
    a.igual(ev[0].assento, 6);
    a.igual(ev[0].valor, 700);
    var r = m.resultado();
    a.igual(r.potes[0].valor, 600);
    a.igual(r.fichasFinais[2], 600);
    a.igual(r.fichasFinais[6], 700);
  });

  T(G, 'Todos desistem: o último leva o pote sem showdown e não mostra as cartas', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }, botao: 0, sb: 5, bb: 10 });
    jogar(m, [[3, 'raise', 30], [0, 'fold'], [1, 'fold'], [2, 'fold']], a);
    var r = m.resultado();
    a.verdadeiro(r.semShowdown);
    a.igual(r.ganhos[3], 15, 'UTG ganha blinds');
    a.igual(r.showdown.length, 0);
    a.verdadeiro(jogadorDe(m.vista(null), 3).cartas === null, 'cartas do vencedor continuam escondidas');
  });

  function cenarioRiver(mostra) {
    // BTN 0, SB 1, BB 2 — o BB aposta no river e é pago pelos dois
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, botao: 0, sb: 5, bb: 10, mostra: mostra,
      maos: { 0: '2c 3d', 1: 'Kh Kd', 2: 'Ah Ad' }, board: '9c 7d 4h Js 5s' });
    m.agir(0, 'call'); m.agir(1, 'call'); m.agir(2, 'check');
    for (var r = 0; r < 2; r++) { m.agir(1, 'check'); m.agir(2, 'check'); m.agir(0, 'check'); }
    m.agir(1, 'check'); m.agir(2, { tipo: 'bet', ate: 50 }); m.agir(0, 'call'); m.agir(1, 'call');
    return m.resultado();
  }

  T(G, 'Showdown: o agressor do river mostra primeiro; perdedores podem esconder', function (a) {
    var r = cenarioRiver({});
    a.igualJSON(r.showdown.map(function (s) { return s.assento; }), [2, 0, 1], 'ordem: agressor e depois sentido horário');
    a.igualJSON(r.showdown.map(function (s) { return s.mostrou; }), [true, false, false], 'perdedores escondem');
    var r2 = cenarioRiver({ 1: true });
    a.igualJSON(r2.showdown.map(function (s) { return s.mostrou; }), [true, false, true], 'quem prefere mostrar, mostra');
    return 'BB aposta no river e mostra AA primeiro; 23o e KK podem esconder';
  });

  T(G, 'Antes e big blind ante entram no pote', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }, botao: 0, sb: 5, bb: 10, ante: 2 });
    a.igual(m.pote(), 23, '4 antes de 2 + blinds');
    var m2 = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000, 3: 1000 }, botao: 0, sb: 5, bb: 10, ante: 10, anteBB: true });
    a.igual(m2.pote(), 25, 'BB ante de 10 + blinds');
    a.igual(jogadorDe(m2.vista(null), 2).fichas, 980, 'o BB paga blind e ante');
    var m3 = criar({ stacks: { 0: 1000, 1: 1000, 2: 15, 3: 1000 }, botao: 0, sb: 5, bb: 10, ante: 10, anteBB: true });
    a.igual(m3.pote(), 20, 'BB curto: blind primeiro, ante com o que sobra');
    // dinheiro morto do BB ante vai para o pote principal
    jogar(m3, [[3, 'call'], [0, 'fold'], [1, 'fold']], a);
    checkAteOFim(m3);
    var r = m3.resultado();
    a.igual(somaObj(r.ganhos), 0, 'fichas conservadas');
    a.igual(r.potes.length, 1);
    a.igual(r.potes[0].valor, 30, 'pote: SB 5 + BB 10 + UTG 10 + ante morto 5');
  });

  T(G, 'Ações inválidas são recusadas', function (a) {
    var m = criar({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, botao: 0, sb: 5, bb: 10 });
    a.lanca(function () { m.agir(2, 'fold'); }, 'fora da vez');
    a.lanca(function () { m.agir(0, 'check'); }, 'check com aposta a pagar');
    a.lanca(function () { m.agir(0, { tipo: 'raise', ate: 2000 }); }, 'mais que o stack');
    a.lanca(function () { m.agir(0, { tipo: 'raise', ate: 25.5 }); }, 'valor fracionário');
    a.lanca(function () { m.agir(0, 'pular'); }, 'ação desconhecida');
    a.lanca(function () { m.historicoCompleto(); }, 'histórico completo antes do fim');
    m.agir(0, 'fold'); m.agir(1, 'fold');
    a.lanca(function () { m.agir(2, 'check'); }, 'ação depois do fim');
  });

  T(G, 'Visão do jogador não revela cartas alheias nem o baralho', function (a) {
    var m = criar({ stacks: { 0: 500, 1: 500, 2: 500, 3: 500, 4: 500, 5: 500 }, botao: 0, sb: 5, bb: 10 });
    [0, 1, 2, 3, 4, 5].forEach(function (s) {
      var v = m.vista(s);
      v.jogadores.forEach(function (j) {
        if (j.assento === s) a.igual(j.cartas.length, 2, 'as próprias cartas');
        else a.verdadeiro(j.cartas === null, 'assento ' + s + ' enxergou cartas do ' + j.assento);
      });
      var txt = JSON.stringify(v);
      a.verdadeiro(!/baralho|distribuidor|queimadas|ordemDistribuicao/.test(txt), 'vazou informação do baralho');
    });
    a.verdadeiro(m.vista(null).jogadores.every(function (j) { return j.cartas === null; }), 'espectador não vê cartas');
  });

  T(G, 'Histórico final traz a ordem completa do baralho e bate com a distribuição', function (a) {
    var m = criar({ stacks: { 0: 500, 1: 500, 2: 500, 3: 500 }, botao: 0, sb: 5, bb: 10 });
    checkAteOFim(m);
    var h = m.historicoCompleto(), n = h.ordemDistribuicao.length, d = h.baralho;
    a.igual(d.length, 52);
    a.igual(d.slice().sort(function (x, y) { return x - y; }).join(','), P.Baralho.novoOrdenado().join(','));
    h.ordemDistribuicao.forEach(function (s, k) {
      var j = h.jogadores.filter(function (x) { return x.assento === s; })[0];
      a.igualJSON(j.cartas, [d[k], d[n + k]], 'cartas do assento ' + s);
    });
    a.igualJSON(h.board, [d[2 * n + 1], d[2 * n + 2], d[2 * n + 3], d[2 * n + 5], d[2 * n + 7]], 'board');
    a.igualJSON(h.queimadas, [d[2 * n], d[2 * n + 4], d[2 * n + 6]], 'burns');
    var txt = P.Historico.texto(h);
    a.verdadeiro(txt.indexOf('Ordem do baralho') >= 0, 'texto do histórico');
  });

  // ============================================================ simulações
  G = 'Motor: simulações longas';

  function acaoAleatoria(v) {
    var r = RNG.real();
    if (r < 0.06 || (r < 0.15 && !v.podeCheck)) return 'fold';
    if (v.podeApostar && r > 0.72) {
      if (RNG.chance(0.15)) return 'allin';
      return { tipo: v.tipoAposta, ate: RNG.inteiroEntre(v.minAte, v.maxAte) };
    }
    return v.podeCheck ? 'check' : 'call';
  }

  /** Política mais "de mesa real": folda bastante, aposta proporcional ao pote, all-in raro. */
  function acaoCalma(v) {
    var r = RNG.real();
    // quanto maior a aposta em relação ao stack, mais fold
    if (!v.podeCheck && r < 0.3 + 1.2 * v.valorCall / (v.fichas + v.apostaRua)) return 'fold';
    if (v.podeApostar && r > 0.88) {
      if (RNG.chance(0.04)) return 'allin';
      var alvo = v.apostaAtual + Math.round(v.pote * (0.4 + RNG.real()));
      return { tipo: v.tipoAposta, ate: Math.max(v.minAte, Math.min(v.maxAte, alvo)) };
    }
    return v.podeCheck ? 'check' : 'call';
  }

  function conferirMao(m, iniciais, a, est, politica) {
    politica = politica || acaoAleatoria;
    var guarda = 0, olhou = false;
    while (!m.terminada()) {
      var v = m.acoesValidas();
      if (!olhou && RNG.chance(0.3)) {
        var vis = m.vista(v.assento);
        vis.jogadores.forEach(function (j) { if (j.assento !== v.assento && j.cartas) throw new Error('vista revelou cartas'); });
        olhou = true;
      }
      var reg = m.agir(v.assento, politica(v));
      if (reg.acao === 'raise' && !reg.completo) est.incompletos++;
      if (++guarda > 400) throw new Error('mão não terminou');
    }
    var r = m.resultado();
    var antes = somaObj(iniciais), depois = somaObj(r.fichasFinais);
    a.igual(depois, antes, 'conservação de fichas na mão #' + m.numero);
    Object.keys(r.fichasFinais).forEach(function (s) { a.verdadeiro(r.fichasFinais[s] >= 0, 'stack negativo'); });
    var totalPotes = r.potes.reduce(function (s, p) { return s + p.valor; }, 0);
    a.igual(totalPotes, m.pote(), 'potes = total investido');
    r.potes.forEach(function (p) {
      var pago = p.vencedores.reduce(function (s, x) { return s + x.valor; }, 0);
      a.igual(pago, p.valor, 'pote pago por inteiro');
      p.vencedores.forEach(function (x) { a.verdadeiro(p.elegiveis.indexOf(x.assento) >= 0, 'vencedor não elegível'); });
    });
    if (r.potes.length > 1) est.sidePots++;
    if (r.potes.some(function (p) { return p.dividido; })) est.divididos++;
    if (!r.semShowdown) est.showdowns++;
    return r;
  }

  function emBlocos(total, porBloco, fn) {
    return new Promise(function (ok, falha) {
      var i = 0;
      function bloco() {
        try {
          var fim = Math.min(total, i + porBloco);
          for (; i < fim; i++) fn(i);
          if (i < total) setTimeout(bloco, 0); else ok();
        } catch (e) { falha(e); }
      }
      setTimeout(bloco, 0);
    });
  }

  T(G, '5.000 mãos aleatórias (2 a 9 jogadores, stacks variados, antes) conservam as fichas', function (a) {
    var est = { sidePots: 0, divididos: 0, showdowns: 0, incompletos: 0 };
    return emBlocos(5000, 100, function () {
      var n = RNG.inteiroEntre(2, 9);
      var lugares = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      P.Baralho.embaralhar(lugares);
      var assentos = lugares.slice(0, n).sort(function (x, y) { return x - y; });
      var sb = RNG.inteiroEntre(1, 5), bb = sb * 2;
      var ante = RNG.chance(0.3) ? RNG.inteiroEntre(1, bb) : 0;
      var iniciais = {};
      var jogadores = assentos.map(function (s) {
        var f = RNG.chance(0.25) ? RNG.inteiroEntre(1, bb * 3) : RNG.inteiroEntre(bb * 5, bb * 300);
        iniciais[s] = f;
        return { assento: s, fichas: f, mostraPerdedoras: RNG.chance(0.3) };
      });
      var m = M.novaMao({ jogadores: jogadores, botao: RNG.escolher(assentos), sb: sb, bb: bb, ante: ante, anteBB: ante > 0 && RNG.chance(0.5), lugares: 9 });
      conferirMao(m, iniciais, a, est);
    }).then(function () {
      return est.showdowns + ' showdowns · ' + est.sidePots + ' mãos com side pot · ' + est.divididos + ' potes divididos · ' + est.incompletos + ' aumentos incompletos';
    });
  });

  T(G, 'Mesa de 9 jogando até sobrar um campeão (botão, eliminações e heads-up)', function (a) {
    var mesa = M.criarMesa({ lugares: 9, sb: 10, bb: 20 });
    for (var s = 0; s < 9; s++) mesa.sentar(s, { id: s, nome: 'J' + s, fichas: 1500 });
    var est = { sidePots: 0, divididos: 0, showdowns: 0, incompletos: 0 };
    var maos = 0, headsUp = 0;
    return new Promise(function (ok, falha) {
      function bloco() {
        try {
          for (var q = 0; q < 50; q++) {
            var ativos = mesa.ativos();
            if (ativos.length < 2) {
              a.igual(mesa.jogador(ativos[0]).fichas, 9 * 1500, 'campeão com todas as fichas');
              ok(maos + ' mãos até o campeão · ' + headsUp + ' mãos de heads-up · ' + est.sidePots + ' com side pot');
              return;
            }
            if (maos > 20000) throw new Error('torneio não terminou');
            if (maos > 0 && maos % 60 === 0) {               // blinds sobem para acelerar
              var b = mesa.blinds();
              mesa.definirBlinds({ sb: b.sb * 2, bb: b.bb * 2 });
            }
            var iniciais = {};
            ativos.forEach(function (x) { iniciais[x] = mesa.jogador(x).fichas; });
            var m = mesa.proximaMao();
            a.verdadeiro(ativos.indexOf(m.vista(null).botao) >= 0, 'botão em assento ativo');
            if (ativos.length === 2) {
              headsUp++;
              a.igual(m.vista(null).assentoSB, m.vista(null).botao, 'heads-up: botão é o SB');
            }
            conferirMao(m, iniciais, a, est, acaoCalma);
            mesa.concluirMao();
            maos++;
          }
          setTimeout(bloco, 0);
        } catch (e) { falha(e); }
      }
      setTimeout(bloco, 0);
    });
  });
})(window.Poker = window.Poker || {});
