/* ==========================================================================
   OUTS · Treino Lab — leitura.js
   Leitura dos oponentes: os bots "anotam" o que veem na mesa, como um
   profissional com HUD. Só entra informação pública — as ações de cada mão e
   as cartas mostradas no showdown — e cada jogador acumula contadores como
   VPIP, PFR, quanto abre all-in, quanto paga all-in, quanto desiste diante de
   apostas e quanto blefa no river.

   As estimativas misturam o observado com um valor padrão (média ponderada,
   no estilo bayesiano): com pouca amostra vale o padrão; com mais mãos, o que
   foi visto. Quanto maior o peso do padrão, mais devagar o bot se adapta — os
   profissionais se adaptam rápido; os jogadores fracos nem prestam atenção.
   ========================================================================== */
(function (P) {
  'use strict';

  var CAMPOS = ['maos', 'vpip', 'pfr',
    'abrirOp', 'abriu', 'abriuAllin', 'abrirOpFundo', 'abriuAllinFundo',
    'vsRaiseOp', 'vsRaise3bet', 'vsRaiseCall', 'vsRaiseAllin', 'vs3betOp', 'vs3betFold',
    'vsShoveOp', 'vsShoveCall',
    'posAgr', 'posCall', 'posFold', 'vsApostaOp', 'vsApostaFold', 'cbetOp', 'cbet',
    'sd', 'sdAgressivo', 'sdBlefe'];

  // stack (em bb) acima do qual abrir all-in foge do padrão
  var FUNDO_BB = 15;

  // [valor padrão, peso do padrão em "oportunidades"]
  var PADRAO = {
    vpip: [0.24, 12], pfr: [0.17, 12],
    abre: [0.24, 10],              // aumenta quando é o primeiro a entrar
    tresBet: [0.08, 12],           // re-aumenta diante de um raise
    pagaRaise: [0.16, 12],         // paga um raise
    foldA3bet: [0.55, 6],          // abriu e largou para 3-bet
    pagaShove: [0.15, 6],          // paga all-in no pré-flop
    agressaoPos: [0.45, 10],       // bets + raises ÷ (bets + raises + calls) depois do flop
    desisteAposta: [0.45, 10],     // folda diante de aposta depois do flop
    cbet: [0.6, 6],
    blefeRiver: [0.25, 5]          // apostou no river e mostrou mão fraca
  };

  function novo() {
    var c = {};
    CAMPOS.forEach(function (k) { c[k] = 0; });
    return c;
  }

  function obter(dados, id) {
    if (!dados[id]) dados[id] = novo();
    return dados[id];
  }

  /** Lê uma mão terminada (vista pública, de espectador) e soma nos contadores de cada jogador. */
  function registrarMao(dados, v) {
    if (!v || !v.terminada) return;
    var bb = v.blinds.bb;
    var porAssento = {};
    v.jogadores.forEach(function (j) { porAssento[j.assento] = j; obter(dados, j.id).maos++; });
    var de = function (s) { return porAssento[s] ? obter(dados, porAssento[s].id) : null; };
    var acoes = v.eventos.filter(function (e) { return e.tipo === 'acao'; });

    // ------------------------------------------------------------ pré-flop
    var raises = 0, limps = 0, ultimoAllin = false, primeiro = null, ultimoAgressor = null;
    var agiu = {}, vpip = {}, pfr = {};
    acoes.forEach(function (e) {
      if (e.rua !== 'preflop') return;
      var s = e.assento, x = de(s);
      if (!x) return;
      var agressao = e.acao === 'raise' || e.acao === 'bet';
      var fundo = porAssento[s].fichasIniciais / bb > FUNDO_BB;
      if (raises >= 1 && ultimoAllin && e.acao !== 'check') {
        x.vsShoveOp++;
        if (e.acao === 'call') x.vsShoveCall++;
      }
      if (!agiu[s]) {
        if (raises === 0 && limps === 0) {
          x.abrirOp++;
          if (fundo) x.abrirOpFundo++;
          if (agressao) {
            x.abriu++;
            if (e.allin) { x.abriuAllin++; if (fundo) x.abriuAllinFundo++; }
          }
        } else if (raises === 1) {
          x.vsRaiseOp++;
          if (agressao) { x.vsRaise3bet++; if (e.allin) x.vsRaiseAllin++; }
          else if (e.acao === 'call') x.vsRaiseCall++;
        }
      } else if (s === primeiro && raises === 2) {
        x.vs3betOp++;
        if (e.acao === 'fold') x.vs3betFold++;
      }
      if (e.acao === 'call' || agressao) vpip[s] = true;
      if (agressao) {
        pfr[s] = true;
        raises++;
        ultimoAllin = !!e.allin;
        if (primeiro === null) primeiro = s;
        ultimoAgressor = s;
      } else if (e.acao === 'call' && raises === 0) limps++;
      agiu[s] = true;
    });
    Object.keys(vpip).forEach(function (s) { de(+s).vpip++; });
    Object.keys(pfr).forEach(function (s) { de(+s).pfr++; });

    // ------------------------------------------------------------ pós-flop
    ['flop', 'turn', 'river'].forEach(function (rua) {
      var aposta = false, falou = {};
      acoes.forEach(function (e) {
        if (e.rua !== rua) return;
        var x = de(e.assento);
        if (!x) return;
        var agr = e.acao === 'bet' || e.acao === 'raise';
        if (rua === 'flop' && e.assento === ultimoAgressor && !falou[e.assento] && !aposta) {
          x.cbetOp++;
          if (agr) x.cbet++;
        }
        falou[e.assento] = true;
        if (aposta) { x.vsApostaOp++; if (e.acao === 'fold') x.vsApostaFold++; }
        if (agr) x.posAgr++;
        else if (e.acao === 'call') x.posCall++;
        else if (e.acao === 'fold') x.posFold++;
        if (agr) aposta = true;
      });
    });

    // ------------------------------------------------------------ showdown
    var agrRiver = {};
    acoes.forEach(function (e) { if (e.rua === 'river' && (e.acao === 'bet' || e.acao === 'raise')) agrRiver[e.assento] = true; });
    v.eventos.forEach(function (e) {
      if (e.tipo !== 'mostra') return;
      var x = de(e.assento);
      if (!x) return;
      x.sd++;
      if (e.cartas && agrRiver[e.assento] && v.board.length === 5) {
        x.sdAgressivo++;
        var nivel = P.Analise.classificarMao(e.cartas, v.board).nivel;
        if (nivel === 'nada' || nivel === 'fraca') x.sdBlefe++;
      }
    });
  }

  /** (peso·padrão + vezes) ÷ (peso + oportunidades) */
  function misturar(padrao, vezes, oport, peso) {
    return (padrao[0] * padrao[1] * peso + vezes) / (padrao[1] * peso + oport);
  }

  /**
   * Estimativas (0..1) a partir dos contadores. "lento" multiplica o peso do
   * padrão: 1 = profissional; 2 = demora o dobro para confiar no que viu.
   */
  function estimar(c, lento) {
    var k = lento || 1;
    c = c || novo();
    return {
      maos: c.maos,
      vpip: misturar(PADRAO.vpip, c.vpip, c.maos, k),
      pfr: misturar(PADRAO.pfr, c.pfr, c.maos, k),
      abre: misturar(PADRAO.abre, c.abriu, c.abrirOp, k),
      tresBet: misturar(PADRAO.tresBet, c.vsRaise3bet, c.vsRaiseOp, k),
      pagaRaise: misturar(PADRAO.pagaRaise, c.vsRaiseCall, c.vsRaiseOp, k),
      foldA3bet: misturar(PADRAO.foldA3bet, c.vs3betFold, c.vs3betOp, k),
      pagaShove: misturar(PADRAO.pagaShove, c.vsShoveCall, c.vsShoveOp, k),
      agressaoPos: misturar(PADRAO.agressaoPos, c.posAgr, c.posAgr + c.posCall, k),
      desisteAposta: misturar(PADRAO.desisteAposta, c.vsApostaFold, c.vsApostaOp, k),
      cbet: misturar(PADRAO.cbet, c.cbet, c.cbetOp, k),
      blefeRiver: misturar(PADRAO.blefeRiver, c.sdBlefe, c.sdAgressivo, k)
    };
  }

  /**
   * Caderno de anotações de uma partida (compartilhado por todas as mesas do
   * torneio: quem muda de mesa leva a fama junto).
   * salvo: o que exportar() devolveu (para retomar a partida).
   */
  function criar(salvo) {
    var dados = {};
    if (salvo && typeof salvo === 'object') {
      Object.keys(salvo).forEach(function (id) {
        var arr = salvo[id], c = novo();
        if (!Array.isArray(arr)) return;
        CAMPOS.forEach(function (k, i) { c[k] = +arr[i] || 0; });
        dados[id] = c;
      });
    }
    return {
      /** Mão terminada, vista de espectador (mao.vista(null)). */
      registrar: function (vistaFinal) {
        try { registrarMao(dados, vistaFinal); } catch (e) { /* leitura nunca derruba a mesa */ }
      },
      contadores: function (id) { return dados[id] || null; },
      estimar: function (c, lento) { return estimar(c, lento); },
      /** Compacto para salvar: { id: [contadores na ordem de CAMPOS] } (só quem já jogou). */
      exportar: function () {
        var out = {};
        Object.keys(dados).forEach(function (id) {
          var c = dados[id];
          if (c.maos > 0) out[id] = CAMPOS.map(function (k) { return c[k]; });
        });
        return out;
      }
    };
  }

  P.Leitura = { criar: criar, estimar: estimar, PADRAO: PADRAO, CAMPOS: CAMPOS, FUNDO_BB: FUNDO_BB };
})(window.Poker = window.Poker || {});
