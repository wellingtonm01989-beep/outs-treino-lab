/* ==========================================================================
   OUTS · Treino Lab — analise.js
   Leitura de mão e de board, compartilhada pelo coach, pelos bots e pelos
   treinos. Tudo aqui é cálculo puro (sem tela):
     - força da mão contra todas as mãos possíveis (HS) e "combos que te vencem"
     - mão feita em linguagem de mesa (top pair, overpair, set...)
     - draws, outs (limpos e sujos), regra do 4 e do 2 x valor exato
     - textura do board
     - situação pré-flop (aberto, contra raise, contra 3-bet...)
     - range estimado de cada vilão a partir das ações dele
   ========================================================================== */
(function (P) {
  'use strict';

  var A = P.Avaliador, C = P.Cartas, R = P.Ranges;
  var NR = C.NOME_RANK, NP = C.NOME_RANK_PLURAL;

  function rank(c) { return c >> 2; }
  function naipe(c) { return c & 3; }

  function cartasNaoVistas(conhecidas) {
    var marc = new Uint8Array(52), out = [];
    conhecidas.forEach(function (c) { marc[c] = 1; });
    for (var c = 0; c < 52; c++) if (!marc[c]) out.push(c);
    return out;
  }

  // ------------------------------------------------------------------
  // Força contra todas as mãos (HS) e combos que vencem o herói
  // ------------------------------------------------------------------
  /**
   * Compara a mão do herói com todas as 2 cartas possíveis do oponente.
   * Retorna { hs (0..1), vence, empata, perde, total, nuts }.
   */
  function forcaAtual(hole, board) {
    var minha = A.avaliar(hole.concat(board));
    var resto = cartasNaoVistas(hole.concat(board));
    var mao = board.slice();
    mao.push(0, 0);
    var nb = board.length;
    var v = 0, e = 0, d = 0;
    for (var i = 0; i < resto.length; i++) {
      for (var j = i + 1; j < resto.length; j++) {
        mao[nb] = resto[i]; mao[nb + 1] = resto[j];
        var s = A.avaliar(mao, nb + 2);
        if (minha > s) v++; else if (minha === s) e++; else d++;
      }
    }
    var total = v + e + d;
    return { hs: (v + e / 2) / total, vence: v, empata: e, perde: d, total: total, nuts: d === 0, pontuacao: minha };
  }

  // ------------------------------------------------------------------
  // Mão feita em linguagem de mesa
  // ------------------------------------------------------------------
  function qualidadeKicker(r) {
    if (r >= 11) return 'kicker forte';
    if (r >= 8) return 'kicker médio';
    return 'kicker fraco';
  }

  /**
   * Classifica a mão feita. Retorna { categoria, descricao, rotulo, nivel, usaCartas }
   * nivel: 'monstro' | 'forte' | 'media' | 'fraca' | 'nada'
   */
  function classificarMao(hole, board) {
    var s = A.avaliar(hole.concat(board));
    var cat = s >> 20;
    var desc = A.descrever(s);
    var bRanks = board.map(rank).sort(function (a, b) { return b - a; });
    var unicos = bRanks.filter(function (r, i) { return bRanks.indexOf(r) === i; });
    var topo = bRanks[0];
    var h1 = Math.max(rank(hole[0]), rank(hole[1])), h2 = Math.min(rank(hole[0]), rank(hole[1]));
    var parNaMao = h1 === h2;
    var sBoard = board.length >= 5 ? A.avaliar(board) : -1;
    var r = { categoria: cat, descricao: desc.descricao, rotulo: desc.descricao, nivel: 'media', usaCartas: s !== sBoard };

    if (board.length >= 5 && s === sBoard) {
      r.rotulo = 'Você joga o board (' + desc.descricao.toLowerCase() + ')';
      r.nivel = cat >= 4 ? 'media' : 'nada';
      return r;
    }

    var contBoard = {};
    bRanks.forEach(function (x) { contBoard[x] = (contBoard[x] || 0) + 1; });
    var boardPareado = unicos.length < bRanks.length;

    switch (cat) {
      case 0:
        var overs = [h1, h2].filter(function (x) { return x > topo; }).length;
        r.rotulo = overs === 2 ? 'Nada feito: duas overcards (' + NR[h1] + ' alto)' :
          overs === 1 ? 'Nada feito: uma overcard (' + NR[h1] + ')' : 'Nada feito (' + NR[h1] + ' alto)';
        r.nivel = 'nada';
        break;
      case 1:
        var pr = A.casa(s, 0);
        if (parNaMao && pr === h1) {
          if (h1 > topo) { r.rotulo = 'Overpair (' + NP[h1] + ')'; r.nivel = 'forte'; }
          else if (h1 > (unicos[1] !== undefined ? unicos[1] : -1)) { r.rotulo = 'Par na mão abaixo da carta mais alta do board (' + NP[h1] + ')'; r.nivel = 'media'; }
          else { r.rotulo = 'Par baixo na mão (' + NP[h1] + ')'; r.nivel = 'fraca'; }
        } else if (contBoard[pr] >= 2) {
          r.rotulo = 'Só o par do board (' + NR[h1] + ' alto)';
          r.nivel = 'nada';
        } else {
          var kick = pr === h1 ? h2 : h1;
          if (pr === topo) {
            r.rotulo = 'Top pair, ' + qualidadeKicker(kick) + ' (' + NP[pr] + ' com ' + NR[kick] + ')';
            r.nivel = kick >= 9 ? 'forte' : 'media';
          } else if (pr === unicos[1]) {
            r.rotulo = 'Par do meio (' + NP[pr] + ')';
            r.nivel = 'media';
          } else {
            r.rotulo = 'Par baixo (' + NP[pr] + ')';
            r.nivel = 'fraca';
          }
        }
        break;
      case 2:
        var p1 = A.casa(s, 0), p2 = A.casa(s, 1);
        var usaDuas = !parNaMao && (p1 === h1 || p1 === h2) && (p2 === h1 || p2 === h2);
        if (usaDuas) { r.rotulo = 'Dois pares com as duas cartas (' + NP[p1] + ' e ' + NP[p2] + ')'; r.nivel = 'forte'; }
        else if (parNaMao) { r.rotulo = 'Par na mão + par do board (' + NP[p1] + ' e ' + NP[p2] + ')'; r.nivel = h1 > topo ? 'forte' : 'media'; }
        else { r.rotulo = 'Dois pares, um deles do board (' + NP[p1] + ' e ' + NP[p2] + ')'; r.nivel = (p1 === topo && contBoard[p2] >= 2) ? 'media' : 'media'; }
        break;
      case 3:
        var tr = A.casa(s, 0);
        if (parNaMao && tr === h1) { r.rotulo = 'Set (trinca com par na mão: ' + NP[tr] + ')'; r.nivel = 'monstro'; }
        else if (contBoard[tr] === 3) { r.rotulo = 'Trinca no board'; r.nivel = 'fraca'; }
        else { r.rotulo = 'Trips (uma carta sua + par do board: ' + NP[tr] + ')'; r.nivel = 'forte'; }
        break;
      case 4:
        r.rotulo = 'Sequência até o ' + NR[A.casa(s, 0)];
        r.nivel = 'monstro';
        break;
      case 5:
        r.rotulo = 'Flush, ' + NR[A.casa(s, 0)] + ' alto';
        r.nivel = 'monstro';
        break;
      default:
        r.rotulo = desc.descricao;
        r.nivel = 'monstro';
    }
    if (boardPareado && (cat === 4 || cat === 5)) r.rotulo += ' (cuidado: board pareado permite full house)';
    return r;
  }

  // ------------------------------------------------------------------
  // Textura do board
  // ------------------------------------------------------------------
  function textura(board) {
    if (board.length < 3) return null;
    var naipes = [0, 0, 0, 0], cont = {};
    board.forEach(function (c) { naipes[naipe(c)]++; cont[rank(c)] = (cont[rank(c)] || 0) + 1; });
    var maxNaipe = Math.max.apply(null, naipes);
    var ranks = Object.keys(cont).map(Number).sort(function (a, b) { return a - b; });
    var pareado = ranks.length < board.length;
    var trinca = Object.keys(cont).some(function (k) { return cont[k] >= 3; });

    // conexão: quantas "janelas" de 5 ranks têm 3+ cartas do board (A conta como 1 também)
    var mascara = 0;
    ranks.forEach(function (r) { mascara |= 1 << (r + 1); if (r === 12) mascara |= 1; });
    var janelas3 = 0, janelas4 = 0;
    for (var ini = 0; ini <= 9; ini++) {
      var n = 0;
      for (var k = 0; k < 5; k++) if (mascara & (1 << (ini + k))) n++;
      if (n >= 3) janelas3++;
      if (n >= 4) janelas4++;
    }
    var altas = board.filter(function (c) { return rank(c) >= 8; }).length;

    var molhado = 0;
    if (maxNaipe === 2 && board.length === 3) molhado += 1;
    if (maxNaipe >= 3) molhado += 2;
    if (janelas3 >= 1) molhado += 1;
    if (janelas3 >= 3 || janelas4 >= 1) molhado += 1;
    if (pareado) molhado -= 1;

    var tags = [];
    var notas = [];
    if (maxNaipe >= 3) {
      tags.push(maxNaipe === board.length && board.length === 3 ? 'monocromático' : maxNaipe >= 4 ? '4 do mesmo naipe' : '3 do mesmo naipe');
      notas.push(maxNaipe >= 4 ? 'Qualquer carta do naipe já faz flush: sem ela, sua mão perdeu muito valor.'
        : 'Flush possível: sem carta do naipe, jogue mais devagar; com o naipe alto, você domina.');
    } else if (maxNaipe === 2 && board.length < 5) {
      tags.push('dois naipes (flush draw possível)');
    } else {
      tags.push('arco-íris (sem flush draw)');
    }
    if (trinca) { tags.push('trinca no board'); notas.push('Trinca no board: o kicker e o full house decidem; poucas mãos melhoram.'); }
    else if (pareado) { tags.push('pareado'); notas.push('Board pareado: menos combinações de mãos fortes; c-bets pequenas funcionam e trips é rara.'); }
    if (janelas4 >= 1) { tags.push('sequência possível'); notas.push('Quatro cartas próximas: muitas sequências possíveis, cuidado com uma carta só.'); }
    else if (janelas3 >= 1) { tags.push('conectado'); }

    var tipo = molhado >= 3 ? 'molhado' : molhado >= 1 ? 'médio' : 'seco';
    if (tipo === 'seco') notas.unshift('Board seco: poucos draws. Aposta pequena (1/3 do pote) basta para mãos de valor e blefes; quem acertou, acertou.');
    else if (tipo === 'molhado') notas.unshift('Board molhado: muitos draws. Mãos feitas apostam maior (2/3 a pote) para cobrar dos draws; slowplay é perigoso.');
    else notas.unshift('Board intermediário: alguns draws. Aposta média (1/2 do pote) é o padrão.');

    return {
      tipo: tipo, pareado: pareado, maxNaipe: maxNaipe, conectado: janelas3 >= 1, altas: altas,
      tags: tags, notas: notas,
      resumo: tipo.charAt(0).toUpperCase() + tipo.slice(1) + ' · ' + tags.join(' · ')
    };
  }

  // ------------------------------------------------------------------
  // Draws e outs
  // ------------------------------------------------------------------
  function maiorSequencia(cartas) {
    var s = A.avaliar(cartas);
    return (s >> 20) === 4 || (s >> 20) === 8 ? A.casa(s, 0) : -1;
  }

  /** Existe sequência mais alta possível para um oponente nesse board? */
  function sequenciaMaisAltaPossivel(boardFinal, alta) {
    var bm = 0;
    boardFinal.forEach(function (c) { bm |= 1 << rank(c); });
    for (var a = 0; a < 13; a++) for (var b = a; b < 13; b++) {
      var m = bm | (1 << a) | (1 << b);
      var seq = A.tabelas.SEQ_ALTA[m];
      if (seq > alta) return true;
    }
    return false;
  }

  /**
   * Draws e outs do herói (flop ou turn).
   * Retorna { draws: [..], outs: [{carta, tipos, peso, motivo}], limpos, sujos, efetivos }
   */
  function outs(hole, board) {
    var res = { draws: [], outs: [], limpos: 0, sujos: 0, efetivos: 0, cartasOuts: [] };
    if (board.length < 3 || board.length > 4) return res;
    var todas = hole.concat(board);
    var s0 = A.avaliar(todas), cat0 = s0 >> 20;
    var resto = cartasNaoVistas(todas);
    var classe = classificarMao(hole, board);

    // ---- detecção de draws (para descrever)
    var nH = [0, 0, 0, 0], nB = [0, 0, 0, 0];
    hole.forEach(function (c) { nH[naipe(c)]++; });
    board.forEach(function (c) { nB[naipe(c)]++; });
    var naipeFD = -1;
    for (var q = 0; q < 4; q++) if (nH[q] >= 1 && nH[q] + nB[q] === 4 && cat0 < 5) naipeFD = q;
    if (naipeFD >= 0) {
      // nut flush draw: a maior carta do naipe que falta está com você?
      var maiorFalta = -1;
      for (var rr = 12; rr >= 0; rr--) {
        var cc = rr * 4 + naipeFD;
        if (board.indexOf(cc) < 0) { maiorFalta = cc; break; }
      }
      var nut = hole.indexOf(maiorFalta) >= 0;
      res.draws.push(nut ? 'Flush draw (nut)' : 'Flush draw');
    } else if (board.length === 3) {
      for (q = 0; q < 4; q++) if (nH[q] === 2 && nB[q] === 1) res.draws.push('Backdoor flush draw (precisa de turn e river)');
    }

    // ---- contagem carta a carta
    var mapaOut = {};
    function marcar(c, tipo, peso, motivo) {
      if (!mapaOut[c]) mapaOut[c] = { carta: c, tipos: [], peso: 1, motivos: [] };
      var o = mapaOut[c];
      if (o.tipos.indexOf(tipo) < 0) o.tipos.push(tipo);
      if (peso < o.peso) o.peso = peso;
      if (motivo && o.motivos.indexOf(motivo) < 0) o.motivos.push(motivo);
    }

    var sequenciasFeitas = {};
    var boardJaPareado = board.some(function (x, i) { return board.some(function (y, j) { return j > i && rank(x) === rank(y); }); });
    resto.forEach(function (c) {
      var nova = todas.concat([c]);
      var s1 = A.avaliar(nova), cat1 = s1 >> 20;
      var bf = board.concat([c]);
      var sB = A.avaliar(bf), catB = sB >> 20;
      var usa = s1 > sB && cat1 > catB;
      var naipesBF = [0, 0, 0, 0];
      bf.forEach(function (x) { naipesBF[naipe(x)]++; });
      var maxNB = Math.max.apply(null, naipesBF);
      // flush (em board já pareado, o vilão pode ter ou fazer full house)
      if (cat1 === 5 && cat0 < 5 && usa) {
        if (boardJaPareado) marcar(c, 'flush', 0.5, 'board pareado: o vilão pode já ter ou fazer full house');
        else marcar(c, 'flush', 1);
      }
      // sequência
      if (cat1 === 4 && cat0 < 4 && usa) {
        var alta = A.casa(s1, 0);
        sequenciasFeitas[alta] = true;
        if (maxNB >= 4) marcar(c, 'sequência', 0, 'coloca 4 cartas do mesmo naipe na mesa: qualquer flush vence');
        else if (maxNB === 3 && naipesBF[naipe(c)] === 3 && cat0 < 5) marcar(c, 'sequência', 0.5, 'completa a sequência mas deixa 3 do mesmo naipe na mesa (flush possível)');
        else if (sequenciaMaisAltaPossivel(bf, alta)) marcar(c, 'sequência', 0.5, 'sequência pela ponta de baixo: existe sequência maior com essa carta');
        else if (boardJaPareado) marcar(c, 'sequência', 0.5, 'board pareado: o vilão pode ter full house');
        else marcar(c, 'sequência', 1);
      }
      // straight flush / quadra / full a partir de mãos já fortes
      if (cat1 >= 6 && cat0 < cat1 && usa && cat0 >= 2) marcar(c, cat1 === 6 ? 'full house' : cat1 === 7 ? 'quadra' : 'straight flush', 1);
      // par na mão -> set
      if (cat0 === 1 && rank(hole[0]) === rank(hole[1]) && cat1 === 3 && rank(c) === rank(hole[0])) marcar(c, 'set', 1);
      // par fraco -> dois pares / trips (só quando o par não é top pair+)
      if (cat0 === 1 && rank(hole[0]) !== rank(hole[1]) && (classe.nivel === 'fraca' || classe.nivel === 'media' || classe.nivel === 'nada') &&
        (cat1 === 2 || cat1 === 3) && usa && (rank(c) === rank(hole[0]) || rank(c) === rank(hole[1]))) {
        marcar(c, cat1 === 2 ? 'dois pares' : 'trips', 0.75, 'melhora para dois pares/trinca, mas o vilão pode já estar à frente');
      }
      // overcards: sem par, carta que pareia uma das suas acima do board
      if (cat0 === 0 && cat1 === 1 && usa) {
        var topoB = Math.max.apply(null, board.map(rank));
        if (rank(c) > topoB && (rank(c) === rank(hole[0]) || rank(c) === rank(hole[1]))) {
          marcar(c, 'overcard', 0.5, 'top pair pode não bastar (o vilão pode ter a mesma carta com kicker melhor ou dois pares)');
        }
      }
    });

    // descrição dos draws de sequência
    var cartasSeq = Object.keys(mapaOut).filter(function (k) { return mapaOut[k].tipos.indexOf('sequência') >= 0; }).length;
    var ranksSeq = {};
    Object.keys(mapaOut).forEach(function (k) { if (mapaOut[k].tipos.indexOf('sequência') >= 0) ranksSeq[rank(+k)] = 1; });
    var nRanksSeq = Object.keys(ranksSeq).length;
    if (nRanksSeq >= 2) res.draws.push(cat0 < 4 ? 'Open-ended / double gutshot (' + cartasSeq + ' cartas)' : '');
    else if (nRanksSeq === 1) res.draws.push('Gutshot (' + cartasSeq + ' cartas)');
    if (naipeFD >= 0 && nRanksSeq >= 1) res.draws.push('Combo draw (flush + sequência)');
    if (cat0 === 0) {
      var topoBoard = Math.max.apply(null, board.map(rank));
      var nOver = hole.filter(function (c) { return rank(c) > topoBoard; }).length;
      if (nOver) res.draws.push(nOver === 2 ? 'Duas overcards' : 'Uma overcard');
    }
    res.draws = res.draws.filter(Boolean);

    res.outs = Object.keys(mapaOut).map(function (k) {
      var o = mapaOut[k];
      return { carta: o.carta, tipos: o.tipos, peso: o.peso, motivo: o.motivos.join('; ') };
    }).sort(function (a, b) { return b.carta - a.carta; });
    res.outs.forEach(function (o) {
      if (o.peso >= 1) res.limpos++; else res.sujos++;
      res.efetivos += o.peso;
    });
    res.cartasOuts = res.outs.map(function (o) { return o.carta; });
    return res;
  }

  /**
   * Probabilidade de acertar com N outs.
   * Retorna regra do 4/2 (com correção acima de 8 outs) e os valores exatos.
   */
  function probabilidades(nOuts, tamanhoBoard) {
    var r = { outs: nOuts };
    if (tamanhoBoard === 3) {
      var desc = 47;
      r.exatoProxima = nOuts / desc;
      r.exatoAteRiver = 1 - ((desc - nOuts) * (desc - nOuts - 1)) / (desc * (desc - 1));
      r.regra2 = Math.min(1, nOuts * 2 / 100);
      r.regra4 = Math.min(1, (nOuts * 4 - (nOuts > 8 ? nOuts - 8 : 0)) / 100);
      r.regra4Simples = Math.min(1, nOuts * 4 / 100);
    } else if (tamanhoBoard === 4) {
      r.exatoProxima = nOuts / 46;
      r.exatoAteRiver = r.exatoProxima;
      r.regra2 = Math.min(1, nOuts * 2 / 100);
      r.regra4 = null;
    }
    return r;
  }

  // ------------------------------------------------------------------
  // Situação pré-flop
  // ------------------------------------------------------------------
  /** Ordem de ação do pré-flop (assentos) a partir da vista. */
  function ordemPreflop(vista) {
    var js = vista.jogadores.slice().sort(function (a, b) { return a.assento - b.assento; });
    var n = js.length;
    var iBB = -1, iSB = -1;
    js.forEach(function (j, i) { if (j.bb) iBB = i; if (j.sb) iSB = i; });
    var inicio = n === 2 ? iSB : (iBB + 1) % n;
    var ordem = [];
    for (var k = 0; k < n; k++) ordem.push(js[(inicio + k) % n].assento);
    return ordem;
  }

  /** Ordem de ação depois do flop (assentos), a partir do primeiro à esquerda do botão. */
  function ordemPosflop(vista) {
    var js = vista.jogadores.slice().sort(function (a, b) { return a.assento - b.assento; });
    var n = js.length, iBtn = 0;
    js.forEach(function (j, i) { if (j.botao) iBtn = i; });
    var ordem = [];
    for (var k = 1; k <= n; k++) ordem.push(js[(iBtn + k) % n].assento);
    return ordem;
  }

  function jogadorDa(vista, assento) {
    for (var i = 0; i < vista.jogadores.length; i++) if (vista.jogadores[i].assento === assento) return vista.jogadores[i];
    return null;
  }

  /**
   * Lê as ações do pré-flop e descreve a situação de "assento".
   * tipo: 'aberto' | 'limpers' | 'bb_opcao' | 'vs_open' | 'vs_3bet' | 'vs_4bet' | 'vs_shove'
   */
  function situacaoPreflop(vista, assento) {
    var ordem = ordemPreflop(vista);
    var n = ordem.length, hu = n === 2;
    var bb = vista.blinds.bb;
    var eu = jogadorDa(vista, assento);
    var acoes = vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === 'preflop'; });
    var raises = [], limpers = [], chamadoresDoRaise = [];
    acoes.forEach(function (e) {
      if (e.acao === 'raise' || e.acao === 'bet') { raises.push(e); chamadoresDoRaise = []; }
      else if (e.acao === 'call') { if (raises.length === 0) limpers.push(e.assento); else chamadoresDoRaise.push(e.assento); }
    });
    var atrasDe = function (s) { return n - 1 - ordem.indexOf(s); };
    var meuRaise = raises.map(function (e) { return e.assento; }).lastIndexOf(assento);

    // stack efetivo: o menor entre o meu e o maior dos oponentes vivos
    var meuTotal = eu.fichas + eu.apostaRua;
    var maiorOponente = 0;
    vista.jogadores.forEach(function (j) { if (j.assento !== assento && !j.foldou) maiorOponente = Math.max(maiorOponente, j.fichas + j.apostaRua); });
    var efetivo = Math.min(meuTotal, maiorOponente);

    var lugar = eu.bb ? 'bb' : (eu.sb && !hu) ? 'sb' : 'ip';
    if (hu) lugar = eu.bb ? 'bb' : 'ip';
    var sit = {
      tipo: 'aberto', hu: hu, n: n, ordem: ordem,
      atras: atrasDe(assento), lugar: lugar, posicao: eu.posicao,
      limpers: limpers.length, raises: raises.length,
      chamadores: chamadoresDoRaise.length,
      efetivo: efetivo, efetivoBB: efetivo / bb,
      paraPagar: Math.max(0, vista.apostaAtual - eu.apostaRua),
      agressor: null, atrasDoAgressor: null, agressorAllin: false
    };
    var ultimo = raises[raises.length - 1];
    if (ultimo) {
      sit.agressor = ultimo.assento;
      sit.atrasDoAgressor = atrasDe(ultimo.assento);
      sit.agressorAllin = !!ultimo.allin;
      sit.primeiroRaiser = raises[0].assento;
      sit.atrasDoPrimeiro = atrasDe(raises[0].assento);
      sit.tamanhoUltimo = ultimo.ate;
    }
    if (raises.length === 0) {
      sit.tipo = limpers.length === 0 ? 'aberto' : (eu.bb && sit.paraPagar === 0 ? 'bb_opcao' : 'limpers');
    } else if (sit.agressorAllin && sit.paraPagar >= 0.5 * meuTotal) {
      sit.tipo = 'vs_shove';
    } else if (raises.length === 1) {
      sit.tipo = 'vs_open';
    } else if (raises.length === 2) {
      sit.tipo = meuRaise === 0 ? 'vs_3bet' : 'vs_3bet_frio';
    } else {
      sit.tipo = meuRaise >= 1 ? 'vs_4bet' : 'vs_4bet_frio';
    }
    return sit;
  }

  // ------------------------------------------------------------------
  // Range estimado de um vilão
  // ------------------------------------------------------------------
  // Fatores por perfil (quanto o jogador alarga ou aperta os ranges padrão)
  var FATORES_PERFIL = {
    station: { abre: 0.8, paga: 2.2, tresBet: 0.4, limpa: 1, blefe: 0.15 },
    nit: { abre: 0.65, paga: 0.7, tresBet: 0.5, limpa: 0.2, blefe: 0.1 },
    tag: { abre: 1, paga: 1, tresBet: 1, limpa: 0.1, blefe: 0.3 },
    lag: { abre: 1.35, paga: 1.3, tresBet: 1.6, limpa: 0.1, blefe: 0.45 },
    maniaco: { abre: 2.2, paga: 1.6, tresBet: 3, limpa: 0.2, blefe: 0.7 },
    reg: { abre: 1, paga: 1.05, tresBet: 1.05, limpa: 0, blefe: 0.3 },
    pro: { abre: 1.05, paga: 1, tresBet: 1.2, limpa: 0, blefe: 0.35 },
    desconhecido: { abre: 1.1, paga: 1.2, tresBet: 1, limpa: 0.3, blefe: 0.3 }
  };

  /**
   * "perfil" pode ser o nome de um perfil ou um objeto de fatores já pronto
   * (a leitura que um bot fez do jogador: { abre, paga, tresBet, limpa, blefe, estacao }).
   */
  function fatoresDo(perfil) {
    if (perfil && typeof perfil === 'object') return perfil;
    return FATORES_PERFIL[perfil] || FATORES_PERFIL.desconhecido;
  }
  function ehEstacao(perfil) { return perfil === 'station' || !!(perfil && perfil.estacao); }

  /** Primeiro índice de "lista" (ordenada) com valor >= x. */
  function limiteInferior(lista, x) {
    var lo = 0, hi = lista.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (lista[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }

  /** Duas cartas + naipes do board somam exatamente 4 de um naipe (com pelo menos uma das cartas). */
  function temFlushDraw(a, b, naipesBoard) {
    for (var s = 0; s < 4; s++) {
      var minhas = (naipe(a) === s ? 1 : 0) + (naipe(b) === s ? 1 : 0);
      if (minhas >= 1 && minhas + naipesBoard[s] === 4) return true;
    }
    return false;
  }

  /** Range pré-flop provável de "assento" pelas ações dele no pré-flop. */
  function rangePreflopDe(vista, assento, perfil) {
    var f = fatoresDo(perfil);
    var ordem = ordemPreflop(vista), n = ordem.length, hu = n === 2;
    var atrasDe = function (s) { return n - 1 - ordem.indexOf(s); };
    var acoes = vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === 'preflop'; });
    var j = jogadorDa(vista, assento);
    var lugar = j.bb ? 'bb' : (j.sb && !hu) ? 'sb' : 'ip';
    var raisesAntes = 0, primeiroRaiser = null, range = null, limpou = false;
    acoes.forEach(function (e) {
      if (e.assento === assento) {
        if (e.acao === 'raise' || e.acao === 'bet') {
          if (raisesAntes === 0) range = R.ajustarRange(limpou ? R.topPercent(8) : R.abertura(atrasDe(assento), hu), f.abre);
          else if (raisesAntes === 1) range = R.ajustarRange(R.respostaAoRaise(R.grupoAgressor(atrasDe(primeiroRaiser), hu), lugar).tresBet, f.tresBet);
          else range = R.ajustarRange(R.parse('QQ+, AKs, AKo'), f.tresBet);
          if (e.allin && raisesAntes >= 1) range = R.uniao(range, R.parse('TT+, AQs+, AKo'));
        } else if (e.acao === 'call') {
          if (raisesAntes === 0) { limpou = true; range = R.menos(R.topPercent(ehEstacao(perfil) ? 55 : 40), R.topPercent(ehEstacao(perfil) ? 3 : 7)); }
          else if (raisesAntes === 1) {
            var resp = R.respostaAoRaise(R.grupoAgressor(atrasDe(primeiroRaiser), hu), lugar);
            range = R.ajustarRange(resp.call, f.paga);
          } else range = R.ajustarRange(R.respostaA3bet(false, true).call, f.paga);
        } else if (e.acao === 'check' && j.bb && raisesAntes === 0) {
          range = R.menos(R.topPercent(100), R.topPercent(10));
        }
      }
      if (e.acao === 'raise' || e.acao === 'bet') { if (raisesAntes === 0) primeiroRaiser = e.assento; raisesAntes++; }
    });
    if (!range) range = j.bb ? R.topPercent(100) : R.topPercent(40);
    return range;
  }

  /**
   * Range estimado de um vilão, já pesado pelas ações dele depois do flop.
   * Retorna { combos: {a, b, w, n}, percentual, descricao }.
   * conhecidas: cartas que o herói vê (as dele + board), para tirar do range.
   */
  function rangeEstimado(vista, assento, perfil, conhecidas) {
    var f = fatoresDo(perfil);
    var mapa = rangePreflopDe(vista, assento, perfil);
    var marc = new Uint8Array(52);
    conhecidas.forEach(function (c) { marc[c] = 1; });
    var cb = R.paraCombos(mapa, marc);
    var w = cb.w.slice();
    var board = vista.board;

    // ações do vilão por rua depois do flop
    var tamanhos = { flop: 3, turn: 4, river: 5 };
    ['flop', 'turn', 'river'].forEach(function (rua) {
      if (board.length < tamanhos[rua]) return;
      var acoes = vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === rua && e.assento === assento; });
      if (!acoes.length) return;
      var bRua = board.slice(0, tamanhos[rua]);
      // força relativa de cada combo dentro do próprio range nesse board
      var pont = [];
      for (var i = 0; i < cb.n; i++) pont.push(A.avaliar([cb.a[i], cb.b[i]].concat(bRua)));
      var ordenados = pont.slice().sort(function (x, y) { return x - y; });
      var naipes = [0, 0, 0, 0];
      bRua.forEach(function (c) { naipes[naipe(c)]++; });
      acoes.forEach(function (e) {
        for (var i2 = 0; i2 < cb.n; i2++) {
          if (!(w[i2] > 0)) continue;
          var pos = limiteInferior(ordenados, pont[i2]) / Math.max(1, ordenados.length - 1); // 0 = pior, 1 = melhor
          var draw = rua !== 'river' && temFlushDraw(cb.a[i2], cb.b[i2], naipes);
          var mult;
          if (e.acao === 'bet' || e.acao === 'raise') {
            mult = pos >= 0.7 ? 1 : pos >= 0.4 ? 0.5 : (draw ? 0.7 : f.blefe);
            if (e.acao === 'raise') mult = pos >= 0.8 ? 1 : (draw ? 0.5 : mult * 0.5);
          } else if (e.acao === 'call') {
            mult = pos >= 0.85 ? 0.7 : pos >= 0.35 ? 1 : (draw ? 1 : (ehEstacao(perfil) ? 0.8 : 0.25));
          } else if (e.acao === 'check') {
            mult = pos >= 0.85 ? 0.45 : 1;
          } else mult = 1;
          w[i2] *= mult;
        }
      });
    });
    var soma = 0;
    for (var k = 0; k < cb.n; k++) soma += w[k];
    return {
      combos: { a: cb.a, b: cb.b, w: w, n: cb.n },
      mapaPreflop: mapa,
      percentualPreflop: R.percentual(mapa),
      combosEfetivos: soma
    };
  }

  P.Analise = {
    cartasNaoVistas: cartasNaoVistas,
    forcaAtual: forcaAtual,
    classificarMao: classificarMao,
    textura: textura,
    outs: outs,
    probabilidades: probabilidades,
    ordemPreflop: ordemPreflop,
    ordemPosflop: ordemPosflop,
    jogadorDa: jogadorDa,
    situacaoPreflop: situacaoPreflop,
    rangePreflopDe: rangePreflopDe,
    rangeEstimado: rangeEstimado,
    FATORES_PERFIL: FATORES_PERFIL,
    maiorSequencia: maiorSequencia
  };
})(window.Poker = window.Poker || {});
