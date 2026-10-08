/* ==========================================================================
   OUTS · Treino Lab — historico.js
   Transforma o histórico completo de uma mão (motor.historicoCompleto())
   em texto legível, terminando com a ordem completa do baralho daquela
   mão para conferência. O replay passo a passo entra na Fase 6.
   ========================================================================== */
(function (P) {
  'use strict';

  var NOME_RUA = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

  function cartasTxt(cs) { return '[' + P.Cartas.listaBonita(cs) + ']'; }

  /**
   * Papel de cada posição do baralho na mão: mão de quem, burn, flop, turn, river
   * ou "não usada".
   */
  function papeisDoBaralho(h) {
    var n = h.ordemDistribuicao.length;
    var nomes = {};
    h.jogadores.forEach(function (j) { nomes[j.assento] = j.nome; });
    var papeis = [];
    for (var i = 0; i < 52; i++) papeis.push('não usada');
    for (var v = 0; v < 2; v++)
      for (var k = 0; k < n; k++) papeis[v * n + k] = nomes[h.ordemDistribuicao[k]];
    var p = 2 * n;
    var nb = h.board.length;
    if (nb >= 3) { papeis[p] = 'burn'; papeis[p + 1] = papeis[p + 2] = papeis[p + 3] = 'flop'; }
    if (nb >= 4) { papeis[p + 4] = 'burn'; papeis[p + 5] = 'turn'; }
    if (nb >= 5) { papeis[p + 6] = 'burn'; papeis[p + 7] = 'river'; }
    return papeis;
  }

  /**
   * @param h historicoCompleto()
   * @param opts { formatar(valor) -> texto, titulo }
   * @returns {string[]} linhas
   */
  function linhas(h, opts) {
    opts = opts || {};
    var f = opts.formatar || function (v) { return String(v); };
    var nomes = {};
    h.jogadores.forEach(function (j) { nomes[j.assento] = j.nome; });
    var L = [];
    var b = h.blinds;
    L.push((opts.titulo ? opts.titulo + ' · ' : '') + 'Mão #' + h.numero + ' · Blinds ' + f(b.sb) + '/' + f(b.bb) +
      (b.ante ? ' · ' + (b.anteBB ? 'BB ante ' : 'ante ') + f(b.ante) : ''));
    L.push('Botão no assento ' + (h.botao + 1));
    h.jogadores.forEach(function (j) {
      L.push('Assento ' + (j.assento + 1) + ' (' + j.posicao + '): ' + j.nome + ' — ' + f(j.fichasIniciais));
    });

    var ruaAtual = 'preflop';
    var cartasMostradas = false;
    h.eventos.forEach(function (e) {
      switch (e.tipo) {
        case 'ante':
          L.push(nomes[e.assento] + ': ' + (e.anteBB ? 'big blind ante ' : 'ante ') + f(e.valor) + (e.allin ? ' (all-in)' : ''));
          break;
        case 'blind':
          L.push(nomes[e.assento] + ': posta ' + (e.qual === 'SB' ? 'small blind ' : 'big blind ') + f(e.valor) + (e.allin ? ' (all-in)' : ''));
          break;
        case 'distribuicao':
          L.push('*** Cartas fechadas ***');
          h.jogadores.forEach(function (j) { L.push(j.nome + ': ' + cartasTxt(j.cartas)); });
          cartasMostradas = true;
          L.push('*** ' + NOME_RUA.preflop + ' ***');
          break;
        case 'acao':
          var t = nomes[e.assento] + ': ';
          if (e.acao === 'fold') t += 'fold';
          else if (e.acao === 'check') t += 'check';
          else if (e.acao === 'call') t += 'paga ' + f(e.valor);
          else if (e.acao === 'bet') t += 'aposta ' + f(e.ate);
          else if (e.acao === 'raise') t += 'aumenta para ' + f(e.ate) + (e.completo ? '' : ' (aumento incompleto)');
          if (e.allin) t += ' e está all-in';
          L.push(t);
          break;
        case 'devolucao':
          L.push('Aposta não paga de ' + f(e.valor) + ' devolvida para ' + nomes[e.assento]);
          break;
        case 'rua':
          ruaAtual = e.rua;
          L.push('*** ' + NOME_RUA[e.rua] + ' *** ' + cartasTxt(e.board) + '  (pote ' + f(e.pote) + ')');
          break;
        case 'mostra':
          if (ruaAtual !== 'showdown') { L.push('*** Showdown ***'); ruaAtual = 'showdown'; }
          L.push(nomes[e.assento] + (e.mostrou ? ': mostra ' + cartasTxt(e.cartas) + ' — ' + e.descricao : ': esconde as cartas'));
          break;
        case 'pote':
          var qual = e.semShowdown ? 'do pote' : (e.indice === 0 ? 'do pote principal' : 'do side pot ' + e.indice);
          e.vencedores.forEach(function (v) {
            L.push(nomes[v.assento] + ' ganha ' + f(v.valor) + ' ' + qual + (e.dividido ? ' (dividido)' : '') +
              (e.semShowdown ? ' sem showdown' : ''));
          });
          break;
      }
    });
    if (!cartasMostradas) h.jogadores.forEach(function (j) { L.push(j.nome + ': ' + cartasTxt(j.cartas)); });

    L.push('*** Resumo ***');
    var total = h.resultado.potes.reduce(function (s, p) { return s + p.valor; }, 0);
    L.push('Pote total ' + f(total) + (h.board.length ? ' · Board ' + cartasTxt(h.board) : ' · sem board'));
    h.jogadores.forEach(function (j) {
      var g = h.resultado.ganhos[j.assento];
      L.push(j.nome + ': ' + (g > 0 ? '+' : '') + f(g));
    });

    L.push('*** Ordem do baralho desta mão (posição 1 → 52) ***');
    var papeis = papeisDoBaralho(h);
    var linha = [];
    h.baralho.forEach(function (c, i) {
      linha.push(('0' + (i + 1)).slice(-2) + ' ' + P.Cartas.bonito(c) + ' (' + papeis[i] + ')');
      if (linha.length === 4) { L.push(linha.join('   ')); linha = []; }
    });
    if (linha.length) L.push(linha.join('   '));
    return L;
  }

  P.Historico = {
    linhas: linhas,
    texto: function (h, opts) { return linhas(h, opts).join('\n'); },
    papeisDoBaralho: papeisDoBaralho
  };

  // ------------------------------------------------------------------
  // Mãos guardadas para o histórico/replay: as da sessão ficam na memória
  // e as últimas 80 também no localStorage.
  // ------------------------------------------------------------------
  var CHAVE = 'historico.maos';
  var LIMITE_SALVO = 80;
  var sessao = [];
  var proximoId = Date.now();

  P.HistoricoMaos = {
    adicionar: function (reg) {
      reg.id = proximoId++;
      reg.data = Date.now();
      sessao.unshift(reg);
      if (sessao.length > 300) sessao.pop();
      var salvo = P.Armazenamento ? P.Armazenamento.ler(CHAVE, []) : [];
      salvo.unshift(reg);
      while (salvo.length > LIMITE_SALVO) salvo.pop();
      if (P.Armazenamento && !P.Armazenamento.gravar(CHAVE, salvo)) {
        // cota cheia: guarda menos mãos
        P.Armazenamento.gravar(CHAVE, salvo.slice(0, 20));
      }
      return reg;
    },
    /** Mãos desta sessão + as salvas de sessões anteriores (sem repetir). */
    todas: function () {
      var salvo = P.Armazenamento ? P.Armazenamento.ler(CHAVE, []) : [];
      var ids = {};
      var out = [];
      sessao.concat(salvo).forEach(function (r) { if (!ids[r.id]) { ids[r.id] = 1; out.push(r); } });
      return out.sort(function (a, b) { return b.data - a.data; });
    },
    porId: function (id) {
      var t = P.HistoricoMaos.todas();
      for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
      return null;
    },
    limpar: function () {
      sessao = [];
      if (P.Armazenamento) P.Armazenamento.remover(CHAVE);
    }
  };
})(window.Poker = window.Poker || {});
