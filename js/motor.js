/* ==========================================================================
   OUTS · Treino Lab — motor.js
   Motor de No-Limit Hold'em: uma mão do início ao fim e a mesa que gira
   o botão entre as mãos. Não toca no DOM (a interface só lê o estado e
   chama agir()), por isso é testado direto em testes.html.

   Valores SEMPRE inteiros, na menor unidade do jogo (centavos no cash,
   fichas no torneio). Assim não existe erro de arredondamento e a
   "ficha ímpar" do pote dividido é exatamente 1 unidade.

   Regras implementadas:
   - SB à esquerda do botão e BB depois; no heads-up o botão é o SB,
     age primeiro no pré-flop e por último depois do flop.
   - Ante por jogador ou big blind ante (pago pelo BB, dinheiro morto).
   - BB curto (all-in no blind): os outros ainda pagam o big blind inteiro.
   - Aposta mínima = 1 BB; aumento mínimo = tamanho do último aumento completo.
   - All-in menor que um aumento completo NÃO reabre a ação para quem já
     agiu, a menos que, somado, chegue a um aumento completo.
   - Aposta não paga é devolvida; side pots por níveis de contribuição.
   - Pote dividido: ficha ímpar para o primeiro vencedor à esquerda do botão.
   - Showdown: começa pelo último agressor do river (ou pelo primeiro à
     esquerda do botão); quem não pode ganhar pode esconder as cartas;
     com alguém all-in, todas as mãos são mostradas.
   ========================================================================== */
(function (P) {
  'use strict';

  var RUAS = ['preflop', 'flop', 'turn', 'river'];

  // Posições que não são blinds, do primeiro a falar até o botão
  var SEM_BLINDS = {
    1: ['BTN'],
    2: ['CO', 'BTN'],
    3: ['HJ', 'CO', 'BTN'],
    4: ['UTG', 'HJ', 'CO', 'BTN'],
    5: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
    6: ['UTG', 'UTG+1', 'MP', 'HJ', 'CO', 'BTN'],
    7: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'],
    8: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN']
  };

  /** Nomes das posições a partir do SB (heads-up: botão e BB). */
  function nomesPosicoes(n) {
    if (n === 2) return ['BTN', 'BB'];
    return ['SB', 'BB'].concat(SEM_BLINDS[n - 2] || []);
  }

  function erro(msg) {
    var e = new Error(msg);
    e.doMotor = true;
    throw e;
  }

  function copia(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  // ======================================================================
  // UMA MÃO
  // ======================================================================
  /**
   * cfg: {
   *   jogadores: [{ assento, id, nome, fichas, mostraPerdedoras }],
   *   botao: assento do botão, sb, bb, ante, anteBB (bool),
   *   lugares: total de assentos da mesa, numero: nº da mão,
   *   baralhoDeTeste: (só testes) ordem fixa das 52 cartas
   * }
   */
  function novaMao(cfg) {
    var lugares = cfg.lugares || 10;
    var SB = cfg.sb, BB = cfg.bb, ANTE = cfg.ante || 0, ANTE_BB = !!cfg.anteBB;
    [SB, BB, ANTE].forEach(function (v) { if (Math.round(v) !== v || v < 0) erro('Blinds e antes devem ser inteiros (menor unidade)'); });
    if (!(BB > 0) || SB > BB) erro('Blinds inválidos');

    // --------------------------------------------------- jogadores na mão
    var J = [];
    var ocupado = {};
    (cfg.jogadores || []).forEach(function (x) {
      if (!(x.fichas > 0)) return;                       // sem fichas não joga
      if (!(x.assento >= 0 && x.assento < lugares)) erro('Assento inválido: ' + x.assento);
      if (ocupado[x.assento]) erro('Assento repetido: ' + x.assento);
      if (Math.round(x.fichas) !== x.fichas) erro('Fichas devem ser inteiras (menor unidade)');
      ocupado[x.assento] = true;
      J.push({
        assento: x.assento,
        id: x.id !== undefined ? x.id : x.assento,
        nome: x.nome || ('Assento ' + (x.assento + 1)),
        fichasIniciais: x.fichas,
        fichas: x.fichas,
        apostaRua: 0,          // colocado na rua atual
        investido: 0,          // total na mão (antes + apostas)
        foldou: false,
        allin: false,
        pendente: false,       // ainda precisa agir nesta rodada
        agiu: false,           // já agiu voluntariamente nesta rodada
        nivelAoAgir: 0,        // aposta atual no momento em que agiu
        cartas: null,
        revelada: false,
        mostraPerdedoras: !!x.mostraPerdedoras,
        posicao: ''
      });
    });
    J.sort(function (a, b) { return a.assento - b.assento; });
    var n = J.length;
    if (n < 2) erro('A mão precisa de pelo menos 2 jogadores com fichas');

    // Como J está em ordem de assento, "o próximo no sentido horário" é i+1.
    function seg(i) { return (i + 1) % n; }

    var iBotao = -1, k;
    for (k = 0; k < n; k++) if (J[k].assento === cfg.botao) iBotao = k;
    if (iBotao < 0) {                                   // botão em assento vazio: próximo ocupado
      for (k = 0; k < n; k++) if (J[k].assento > cfg.botao) { iBotao = k; break; }
      if (iBotao < 0) iBotao = 0;
    }
    var iSB, iBB;
    if (n === 2) { iSB = iBotao; iBB = seg(iBotao); }
    else { iSB = seg(iBotao); iBB = seg(iSB); }

    /** Índices a partir do primeiro à esquerda do botão (sentido horário). */
    function ordemDaEsquerdaDoBotao() {
      var o = [];
      for (var q = 0; q < n; q++) o.push((iBotao + 1 + q) % n);
      return o;
    }

    var nomes = nomesPosicoes(n);
    if (n === 2) { J[iBotao].posicao = 'BTN'; J[iBB].posicao = 'BB'; }
    else ordemDaEsquerdaDoBotao().forEach(function (idx, q) { J[idx].posicao = nomes[q]; });

    // --------------------------------------------------------------- estado
    var numero = cfg.numero || 1;
    var rua = 'preflop';
    var board = [];
    var apostaAtual = 0;       // maior aposta da rua (o que é preciso igualar)
    var ultimoAumento = BB;    // tamanho do último aumento completo da rua
    var vez = -1;              // índice em J de quem age (-1 = ninguém)
    var terminada = false;
    var morto = 0;             // dinheiro morto (big blind ante)
    var agressorRio = -1;
    var eventos = [];
    var resultado = null;
    var distribuidor = P.Baralho.criarDistribuidor(cfg.baralhoDeTeste);

    function evento(e) { e.rua = rua; eventos.push(e); return e; }
    function podeAgir(j) { return !j.foldou && !j.allin; }

    function poteTotal() {
      var t = morto;
      for (var q = 0; q < n; q++) t += J[q].investido;
      return t;
    }

    /** Move fichas do stack para a aposta da rua (limitado ao stack). */
    function colocar(j, valor) {
      var v = Math.min(valor, j.fichas);
      j.fichas -= v;
      j.apostaRua += v;
      j.investido += v;
      if (j.fichas === 0) j.allin = true;
      return v;
    }

    // -------------------------------------------------- antes e blinds
    evento({
      tipo: 'inicio', numero: numero, botao: J[iBotao].assento, sb: J[iSB].assento, bb: J[iBB].assento,
      blinds: { sb: SB, bb: BB, ante: ANTE, anteBB: ANTE_BB },
      jogadores: J.map(function (j) { return { assento: j.assento, nome: j.nome, fichas: j.fichas, posicao: j.posicao }; })
    });

    if (ANTE > 0 && !ANTE_BB) {
      ordemDaEsquerdaDoBotao().forEach(function (idx) {
        var j = J[idx], v = Math.min(ANTE, j.fichas);
        j.fichas -= v; j.investido += v;          // ante entra no pote, mas não na aposta da rua
        if (j.fichas === 0) j.allin = true;
        evento({ tipo: 'ante', assento: j.assento, valor: v, allin: j.allin });
      });
    }

    function postarBlind(idx, valor, qual) {
      var j = J[idx];
      if (j.allin) return;
      var v = colocar(j, valor);
      evento({ tipo: 'blind', assento: j.assento, qual: qual, valor: v, allin: j.allin });
    }
    postarBlind(iSB, SB, 'SB');
    postarBlind(iBB, BB, 'BB');

    if (ANTE > 0 && ANTE_BB) {
      // Big blind ante: o blind tem prioridade; o ante é dinheiro morto no pote principal
      var jb = J[iBB], va = Math.min(ANTE, jb.fichas);
      jb.fichas -= va; morto += va;
      if (jb.fichas === 0) jb.allin = true;
      evento({ tipo: 'ante', assento: jb.assento, valor: va, anteBB: true, allin: jb.allin });
    }

    // BB curto: a aposta a pagar continua sendo o big blind inteiro
    apostaAtual = BB;
    for (k = 0; k < n; k++) if (J[k].apostaRua > apostaAtual) apostaAtual = J[k].apostaRua;
    ultimoAumento = BB;

    // ------------------------------------------------------- distribuição
    var ordemDist = ordemDaEsquerdaDoBotao().map(function (idx) { return J[idx].assento; });
    var maos = distribuidor.distribuirMaos(ordemDist);
    J.forEach(function (j) { j.cartas = maos[j.assento]; });
    evento({ tipo: 'distribuicao', ordem: ordemDist });

    // ================================================= rodada de apostas
    function proximoAPartirDe(i0) {
      for (var q = 0; q < n; q++) {
        var idx = (i0 + q) % n;
        if (podeAgir(J[idx]) && J[idx].pendente) return idx;
      }
      return -1;
    }

    function rodadaEncerrada() {
      var vivos = 0, podem = [], q;
      for (q = 0; q < n; q++) {
        if (!J[q].foldou) vivos++;
        if (podeAgir(J[q])) podem.push(J[q]);
      }
      if (vivos <= 1) return true;
      if (podem.length === 0) return true;
      if (podem.length === 1 && podem[0].apostaRua >= apostaAtual) return true;
      for (q = 0; q < podem.length; q++) if (podem[q].pendente) return false;
      return true;
    }

    function iniciarApostas(i0) {
      J.forEach(function (j) { j.agiu = false; j.nivelAoAgir = 0; j.pendente = podeAgir(j); });
      if (rodadaEncerrada()) { fecharRua(); return; }
      vez = proximoAPartirDe(i0);
      if (vez < 0) fecharRua();
    }

    /** O que o jogador da vez pode fazer agora. */
    function acoesValidas() {
      if (terminada || vez < 0) return null;
      var j = J[vez];
      var paraPagar = Math.max(0, apostaAtual - j.apostaRua);
      var maxAte = j.apostaRua + j.fichas;
      var outrosPodem = false;
      for (var q = 0; q < n; q++) if (q !== vez && podeAgir(J[q])) outrosPodem = true;
      // reaberta: ainda não agiu, ou desde então enfrentou pelo menos um aumento completo
      var reaberta = !j.agiu || (apostaAtual - j.nivelAoAgir >= ultimoAumento);
      var minAte = apostaAtual === 0 ? BB : apostaAtual + ultimoAumento;
      return {
        assento: j.assento,
        podeCheck: paraPagar === 0,
        valorCall: Math.min(paraPagar, j.fichas),
        callAllin: paraPagar > 0 && j.fichas <= paraPagar,
        podeApostar: outrosPodem && reaberta && maxAte > apostaAtual,
        tipoAposta: apostaAtual === 0 ? 'bet' : 'raise',
        minAte: Math.min(minAte, maxAte),
        maxAte: maxAte,
        apostaAtual: apostaAtual,
        apostaRua: j.apostaRua,
        fichas: j.fichas,
        pote: poteTotal(),
        ultimoAumento: ultimoAumento,
        bb: BB,
        rua: rua
      };
    }

    /**
     * Aplica a ação do jogador da vez.
     * acao: 'fold' | 'check' | 'call' | 'allin' | { tipo: 'bet'|'raise', ate: total na rua }
     */
    function agir(assento, acao) {
      if (terminada) erro('A mão já terminou');
      if (vez < 0 || J[vez].assento !== assento) erro('Não é a vez do assento ' + assento);
      var j = J[vez], v = acoesValidas();
      var tipo = typeof acao === 'string' ? acao : (acao && acao.tipo);
      var ate = acao && acao.ate;
      var reg;

      if (tipo === 'allin') {
        if (v.podeApostar) { tipo = 'raise'; ate = v.maxAte; }
        else if (!v.podeCheck && v.callAllin) tipo = 'call';
        else erro('All-in não permitido agora (a ação não foi reaberta)');
      }

      switch (tipo) {
        case 'fold':
          j.foldou = true;
          reg = { acao: 'fold' };
          break;
        case 'check':
          if (!v.podeCheck) erro('Não dá para dar check: há ' + (apostaAtual - j.apostaRua) + ' para pagar');
          reg = { acao: 'check' };
          break;
        case 'call':
          if (v.podeCheck) { reg = { acao: 'check' }; break; }
          reg = { acao: 'call', valor: colocar(j, v.valorCall) };
          break;
        case 'bet':
        case 'raise':
          if (!v.podeApostar) erro('Aumento não permitido agora (a ação não foi reaberta ou não há quem pague)');
          if (Math.round(ate) !== ate) erro('Valor de aposta deve ser inteiro');
          if (!(ate > apostaAtual)) erro('A aposta precisa superar ' + apostaAtual);
          if (ate > v.maxAte) erro('Valor maior que o stack (máximo ' + v.maxAte + ')');
          if (ate < v.minAte && ate !== v.maxAte) erro('Aposta mínima: ' + v.minAte);
          var incremento = ate - apostaAtual;
          var completo = incremento >= ultimoAumento;
          var nome = apostaAtual === 0 ? 'bet' : 'raise';
          var pago = colocar(j, ate - j.apostaRua);
          if (completo) ultimoAumento = incremento;
          apostaAtual = ate;
          if (rua === 'river') agressorRio = vez;
          for (var q = 0; q < n; q++) if (q !== vez && podeAgir(J[q])) J[q].pendente = true;
          reg = { acao: nome, valor: pago, ate: ate, completo: completo };
          break;
        default:
          erro('Ação desconhecida: ' + tipo);
      }

      j.agiu = true;
      j.pendente = false;
      j.nivelAoAgir = apostaAtual;
      reg.tipo = 'acao';
      reg.assento = assento;
      reg.allin = j.allin;
      reg.apostaRua = j.apostaRua;
      reg.fichas = j.fichas;
      reg.pote = poteTotal();
      evento(reg);
      depoisDaAcao(vez);
      return reg;
    }

    function depoisDaAcao(i) {
      var vivos = J.filter(function (j) { return !j.foldou; });
      if (vivos.length === 1) { vez = -1; vitoriaSemShowdown(); return; }
      if (rodadaEncerrada()) { vez = -1; fecharRua(); return; }
      vez = proximoAPartirDe(seg(i));
      if (vez < 0) fecharRua();
    }

    // ================================================== fim de cada rua
    /** Devolve a parte de uma aposta que ninguém igualou. */
    function devolverNaoPago() {
      var iMax = -1, max = -1, segundo = 0;
      J.forEach(function (j, i) {
        if (j.apostaRua > max) { segundo = Math.max(segundo, max); max = j.apostaRua; iMax = i; }
        else if (j.apostaRua > segundo) segundo = j.apostaRua;
      });
      if (iMax >= 0 && max > segundo) {
        var d = max - segundo, j = J[iMax];
        j.apostaRua -= d; j.investido -= d; j.fichas += d;
        if (j.fichas > 0) j.allin = false;
        evento({ tipo: 'devolucao', assento: j.assento, valor: d });
      }
    }

    function recolher() {
      var total = 0;
      J.forEach(function (j) { total += j.apostaRua; j.apostaRua = 0; });
      if (total > 0) evento({ tipo: 'recolher', valor: total, pote: poteTotal(), potes: potesPublicos() });
    }

    function fecharRua() {
      vez = -1;
      devolverNaoPago();
      recolher();
      if (rua === 'river') { showdown(); return; }
      rua = RUAS[RUAS.indexOf(rua) + 1];
      var novas = rua === 'flop' ? distribuidor.flop() : [rua === 'turn' ? distribuidor.turn() : distribuidor.river()];
      board = board.concat(novas);
      apostaAtual = 0;
      ultimoAumento = BB;
      var podem = J.filter(podeAgir).length;
      evento({ tipo: 'rua', cartas: novas.slice(), board: board.slice(), pote: poteTotal(), semApostas: podem < 2 });
      if (podem >= 2) iniciarApostas(seg(iBotao));
      else fecharRua();                     // ninguém mais pode apostar: corre o board
    }

    // ========================================================== potes
    /**
     * Divide as contribuições em pote principal e side pots.
     * Cada nível é o menor valor ainda não alocado entre quem NÃO foldou;
     * dinheiro de quem foldou entra nos potes mas não dá direito a ganhar.
     */
    function calcularPotes(contrib, incluirMorto) {
      var ordem = ordemDaEsquerdaDoBotao();
      var resto = contrib.slice();
      var potes = [];
      for (;;) {
        var eleg = ordem.filter(function (i) { return !J[i].foldou && resto[i] > 0; });
        if (!eleg.length) {
          var sobra = resto.reduce(function (s, x) { return s + x; }, 0);
          if (sobra > 0) {
            if (potes.length) potes[potes.length - 1].valor += sobra;
            else potes.push({ valor: sobra, elegiveis: ordem.filter(function (i) { return !J[i].foldou; }) });
          }
          break;
        }
        var nivel = Math.min.apply(null, eleg.map(function (i) { return resto[i]; }));
        var valor = 0;
        for (var i = 0; i < n; i++) { var t = Math.min(resto[i], nivel); valor += t; resto[i] -= t; }
        potes.push({ valor: valor, elegiveis: eleg });
      }
      if (incluirMorto && morto > 0) {
        if (potes.length) potes[0].valor += morto;
        else potes.push({ valor: morto, elegiveis: ordem.filter(function (i) { return !J[i].foldou; }) });
      }
      return potes;
    }

    /** Potes já recolhidos (sem as apostas da rua atual), com assentos. */
    function potesPublicos() {
      var contrib = J.map(function (j) { return j.investido - j.apostaRua; });
      return calcularPotes(contrib, true).filter(function (p) { return p.valor > 0; }).map(function (p) {
        return { valor: p.valor, elegiveis: p.elegiveis.map(function (i) { return J[i].assento; }) };
      });
    }

    // ===================================================== fim da mão
    function vitoriaSemShowdown() {
      devolverNaoPago();
      recolher();
      var i = -1;
      J.forEach(function (j, q) { if (!j.foldou) i = q; });
      var total = poteTotal();
      J[i].fichas += total;
      evento({ tipo: 'pote', indice: 0, valor: total, vencedores: [{ assento: J[i].assento, valor: total }], semShowdown: true });
      finalizar({
        semShowdown: true,
        potes: [{ valor: total, elegiveis: [J[i].assento], vencedores: [{ assento: J[i].assento, valor: total }], descricao: null }],
        showdown: []
      });
    }

    function showdown() {
      rua = 'showdown';
      var ordem = ordemDaEsquerdaDoBotao();
      var ativos = ordem.filter(function (i) { return !J[i].foldou; });
      var pont = {};
      ativos.forEach(function (i) { pont[i] = P.Avaliador.avaliar(J[i].cartas.concat(board)); });
      var potes = calcularPotes(J.map(function (j) { return j.investido; }), true);
      var todosMostram = ativos.some(function (i) { return J[i].allin; });

      // ordem de exposição: último agressor do river, senão o primeiro à esquerda do botão
      var inicio = (agressorRio >= 0 && !J[agressorRio].foldou) ? ativos.indexOf(agressorRio) : 0;
      var ordemShow = ativos.slice(inicio).concat(ativos.slice(0, inicio));
      var melhorMostrado = potes.map(function () { return -1; });
      var registros = [];

      ordemShow.forEach(function (i) {
        var j = J[i];
        var podeGanhar = potes.some(function (p, q) {
          return p.elegiveis.length > 1 && p.elegiveis.indexOf(i) >= 0 && pont[i] >= melhorMostrado[q];
        });
        var mostra = todosMostram || podeGanhar || j.mostraPerdedoras || registros.length === 0;
        if (mostra) {
          j.revelada = true;
          potes.forEach(function (p, q) {
            if (p.elegiveis.indexOf(i) >= 0 && pont[i] > melhorMostrado[q]) melhorMostrado[q] = pont[i];
          });
        }
        var desc = P.Avaliador.descrever(pont[i]);
        var r = {
          assento: j.assento,
          mostrou: mostra,
          cartas: mostra ? j.cartas.slice() : null,
          pontuacao: mostra ? pont[i] : null,
          descricao: mostra ? desc.descricao : null,
          melhores: mostra ? P.Avaliador.melhoresCinco(j.cartas.concat(board)) : null
        };
        registros.push(r);
        evento({ tipo: 'mostra', assento: r.assento, mostrou: mostra, cartas: r.cartas, descricao: r.descricao, melhores: r.melhores });
      });

      // distribuição de cada pote
      var res = potes.map(function (p, q) {
        var melhor = -1;
        p.elegiveis.forEach(function (i) { if (pont[i] > melhor) melhor = pont[i]; });
        var venc = p.elegiveis.filter(function (i) { return pont[i] === melhor; }); // já em ordem a partir do botão
        var parte = Math.floor(p.valor / venc.length), sobra = p.valor - parte * venc.length;
        var vencedores = venc.map(function (i, x) {
          var v = parte + (x < sobra ? 1 : 0);     // ficha ímpar: primeiro(s) à esquerda do botão
          J[i].fichas += v;
          return { assento: J[i].assento, valor: v };
        });
        var r = {
          valor: p.valor,
          elegiveis: p.elegiveis.map(function (i) { return J[i].assento; }),
          vencedores: vencedores,
          descricao: P.Avaliador.descrever(melhor).descricao,
          dividido: venc.length > 1
        };
        evento({ tipo: 'pote', indice: q, valor: p.valor, vencedores: vencedores, descricao: r.descricao, dividido: r.dividido });
        return r;
      });

      finalizar({ semShowdown: false, potes: res, showdown: registros });
    }

    function finalizar(r) {
      terminada = true;
      vez = -1;
      r.board = board.slice();
      r.fichasFinais = {};
      r.ganhos = {};
      J.forEach(function (j) {
        r.fichasFinais[j.assento] = j.fichas;
        r.ganhos[j.assento] = j.fichas - j.fichasIniciais;
      });
      resultado = r;
      evento({ tipo: 'fim', semShowdown: r.semShowdown, ganhos: copia(r.ganhos) });
    }

    // ===================================================== leitura do estado
    /**
     * O que um assento enxerga (ou um espectador, com assento = null).
     * Nunca inclui cartas fechadas de outros jogadores nem o baralho.
     */
    function vista(assentoVisor) {
      var av = acoesValidas();
      return {
        numero: numero,
        rua: rua,
        board: board.slice(),
        pote: poteTotal(),
        potes: potesPublicos(),
        apostaAtual: apostaAtual,
        ultimoAumento: ultimoAumento,
        blinds: { sb: SB, bb: BB, ante: ANTE, anteBB: ANTE_BB },
        botao: J[iBotao].assento,
        assentoSB: J[iSB].assento,
        assentoBB: J[iBB].assento,
        vez: vez >= 0 ? J[vez].assento : null,
        terminada: terminada,
        jogadores: J.map(function (j, i) {
          var podeVer = j.cartas && (j.assento === assentoVisor || j.revelada);
          return {
            assento: j.assento, id: j.id, nome: j.nome, posicao: j.posicao,
            fichas: j.fichas, fichasIniciais: j.fichasIniciais,
            apostaRua: j.apostaRua, investido: j.investido,
            foldou: j.foldou, allin: j.allin,
            botao: i === iBotao, sb: i === iSB, bb: i === iBB,
            cartas: podeVer ? j.cartas.slice() : null
          };
        }),
        eventos: copia(eventos),
        acoes: (av && av.assento === assentoVisor) ? av : null,
        resultado: terminada ? copia(resultado) : null
      };
    }

    /** Histórico completo (todas as cartas e a ordem do baralho). Só depois da mão. */
    function historicoCompleto() {
      if (!terminada) erro('O histórico completo só fica disponível no fim da mão');
      return {
        numero: numero,
        blinds: { sb: SB, bb: BB, ante: ANTE, anteBB: ANTE_BB },
        botao: J[iBotao].assento,
        lugares: lugares,
        jogadores: J.map(function (j) {
          return { assento: j.assento, id: j.id, nome: j.nome, posicao: j.posicao, fichasIniciais: j.fichasIniciais, cartas: j.cartas.slice() };
        }),
        ordemDistribuicao: ordemDist.slice(),
        board: board.slice(),
        baralho: distribuidor.ordemCompleta(),
        queimadas: distribuidor.queimadas(),
        eventos: copia(eventos),
        resultado: copia(resultado)
      };
    }

    // a ação do pré-flop começa à esquerda do BB (no heads-up, pelo botão/SB)
    iniciarApostas(n === 2 ? iSB : seg(iBB));

    return {
      numero: numero,
      agir: agir,
      acoesValidas: acoesValidas,
      vista: vista,
      historicoCompleto: historicoCompleto,
      vez: function () { return vez >= 0 ? J[vez].assento : null; },
      rua: function () { return rua; },
      terminada: function () { return terminada; },
      resultado: function () { return copia(resultado); },
      pote: poteTotal,
      eventos: function () { return copia(eventos); },
      totalEventos: function () { return eventos.length; }
    };
  }

  // ======================================================================
  // MESA (várias mãos: assentos, stacks e rotação do botão)
  // ======================================================================
  /**
   * cfg: { lugares, sb, bb, ante, anteBB, botaoInicial (opcional) }
   * Botão "móvel": a cada mão vai para o próximo assento com fichas.
   */
  function criarMesa(cfg) {
    var lugares = cfg.lugares;
    var blinds = { sb: cfg.sb, bb: cfg.bb, ante: cfg.ante || 0, anteBB: !!cfg.anteBB };
    var assentos = [];
    for (var i = 0; i < lugares; i++) assentos.push(null);
    var botao = cfg.botaoInicial !== undefined ? cfg.botaoInicial : -1;
    var primeira = true;
    var mao = null, numero = cfg.numeroInicial || 0;

    function ativos() {
      var a = [];
      for (var q = 0; q < lugares; q++) if (assentos[q] && assentos[q].fichas > 0 && !assentos[q].ausente) a.push(q);
      return a;
    }

    function proximoDe(b, lista) {
      for (var q = 0; q < lista.length; q++) if (lista[q] > b) return lista[q];
      return lista[0];
    }

    return {
      lugares: lugares,
      sentar: function (assento, jogador) {
        if (assento < 0 || assento >= lugares) erro('Assento inexistente: ' + assento);
        if (assentos[assento]) erro('Assento ocupado: ' + assento);
        assentos[assento] = jogador;
      },
      levantar: function (assento) {
        var j = assentos[assento];
        assentos[assento] = null;
        return j;
      },
      jogador: function (assento) { return assentos[assento]; },
      assentos: function () { return assentos.slice(); },
      ativos: ativos,
      botao: function () { return botao; },
      blinds: function () { return { sb: blinds.sb, bb: blinds.bb, ante: blinds.ante, anteBB: blinds.anteBB }; },
      definirBlinds: function (b) {
        for (var c in b) if (Object.prototype.hasOwnProperty.call(b, c)) blinds[c] = b[c];
      },
      maoAtual: function () { return mao; },
      /** Começa a próxima mão (opts.baralhoDeTeste só nos testes). */
      proximaMao: function (opts) {
        if (mao && !mao.terminada()) erro('A mão atual ainda não terminou');
        var a = ativos();
        if (a.length < 2) erro('São necessários pelo menos 2 jogadores com fichas');
        if (primeira) {
          if (botao < 0 || a.indexOf(botao) < 0) botao = botao < 0 ? P.RNG.escolher(a) : proximoDe(botao, a);
          primeira = false;
        } else {
          botao = proximoDe(botao, a);
        }
        numero++;
        mao = novaMao({
          lugares: lugares,
          jogadores: a.map(function (q) {
            var j = assentos[q];
            return { assento: q, id: j.id, nome: j.nome, fichas: j.fichas, mostraPerdedoras: j.mostraPerdedoras };
          }),
          botao: botao,
          sb: blinds.sb, bb: blinds.bb, ante: blinds.ante, anteBB: blinds.anteBB,
          numero: numero,
          baralhoDeTeste: opts && opts.baralhoDeTeste
        });
        return mao;
      },
      /** Aplica as fichas finais da mão aos assentos. */
      concluirMao: function () {
        if (!mao || !mao.terminada()) erro('Não há mão terminada para concluir');
        var r = mao.resultado();
        Object.keys(r.fichasFinais).forEach(function (s) { assentos[+s].fichas = r.fichasFinais[s]; });
        return r;
      }
    };
  }

  P.Motor = {
    RUAS: RUAS,
    nomesPosicoes: nomesPosicoes,
    novaMao: novaMao,
    criarMesa: criarMesa
  };
})(window.Poker = window.Poker || {});
