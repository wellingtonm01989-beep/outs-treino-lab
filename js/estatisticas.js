/* ==========================================================================
   OUTS · Treino Lab — estatisticas.js
   Estatísticas do herói: da sessão (desde que o app abriu) e acumuladas
   (localStorage). VPIP, PFR, 3-bet, agressividade, WTSD, bb/100 no cash,
   ROI em SNG/torneio, decisões corretas por street e erros mais frequentes.
   ========================================================================== */
(function (P) {
  'use strict';

  const CHAVE = 'estatisticas.v1';

  function vazio() {
    return {
      maos: 0, vpip: 0, pfr: 0, oport3bet: 0, tresBet: 0,
      apostasPos: 0, callsPos: 0, viuFlop: 0, wtsd: 0, wsd: 0,
      cash: { maos: 0, resultadoBB: 0, resultado: 0 },
      sng: { jogados: 0, investido: 0, premios: 0, itm: 0, vitorias: 0 },
      torneio: { jogados: 0, investido: 0, premios: 0, itm: 0, vitorias: 0, melhor: null },
      decisoes: {
        preflop: { total: 0, otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0, perdaBB: 0 },
        flop: { total: 0, otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0, perdaBB: 0 },
        turn: { total: 0, otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0, perdaBB: 0 },
        river: { total: 0, otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0, perdaBB: 0 }
      },
      erros: {},
      quiz: { perguntas: 0, acertos: 0, tempoTotal: 0, pontos: 0 },
      desde: Date.now()
    };
  }

  let acumulado = (function () {
    const salvo = P.Armazenamento.ler(CHAVE, null);
    const base = vazio();
    if (!salvo) return base;
    return mesclar(base, salvo);
  })();
  let sessao = vazio();

  function mesclar(base, dados) {
    for (const k in dados) {
      if (dados[k] && typeof dados[k] === 'object' && !Array.isArray(dados[k]) && base[k] && typeof base[k] === 'object') base[k] = mesclar(base[k], dados[k]);
      else base[k] = dados[k];
    }
    return base;
  }

  function salvar() { P.Armazenamento.gravar(CHAVE, acumulado); }

  function aplicar(fn) { fn(sessao); fn(acumulado); salvar(); }

  /**
   * Fatos de uma mão do herói (VPIP, PFR, 3-bet, agressão, showdown, ganho).
   * h = historicoCompleto(); heroi = assento
   */
  function fatosDaMao(h, heroi) {
    const acoes = h.eventos.filter(e => e.tipo === 'acao' && e.assento === heroi);
    const pre = acoes.filter(e => e.rua === 'preflop');
    const vpip = pre.some(e => e.acao === 'call' || e.acao === 'raise' || e.acao === 'bet');
    const pfr = pre.some(e => e.acao === 'raise' || e.acao === 'bet');
    // 3-bet: diante de exatamente um raise na primeira vez que agiu depois dele
    let raisesAntes = 0, oport = false, fez3 = false, jaAvaliou = false;
    h.eventos.forEach(e => {
      if (e.tipo !== 'acao' || e.rua !== 'preflop') return;
      if (e.assento === heroi && !jaAvaliou && raisesAntes === 1) {
        oport = true; jaAvaliou = true;
        if (e.acao === 'raise') fez3 = true;
      }
      if (e.acao === 'raise' || e.acao === 'bet') raisesAntes++;
    });
    const pos = acoes.filter(e => e.rua !== 'preflop');
    const apostas = pos.filter(e => e.acao === 'bet' || e.acao === 'raise').length;
    const calls = pos.filter(e => e.acao === 'call').length;
    const foldou = acoes.some(e => e.acao === 'fold');
    const viuFlop = h.board.length >= 3 && !h.eventos.some(e => e.tipo === 'acao' && e.assento === heroi && e.acao === 'fold' && e.rua === 'preflop');
    const showdown = !h.resultado.semShowdown && !foldou && h.resultado.showdown.some(s => s.assento === heroi);
    const ganho = h.resultado.ganhos[heroi] || 0;
    return { vpip, pfr, oport, fez3, apostas, calls, viuFlop, showdown, ganhouSD: showdown && ganho > 0, ganho, bb: h.blinds.bb };
  }

  /** Soma os fatos de uma mão num acumulador de estatísticas. */
  function somar(s, f, modo) {
    s.maos++;
    if (f.vpip) s.vpip++;
    if (f.pfr) s.pfr++;
    if (f.oport) s.oport3bet++;
    if (f.fez3) s.tresBet++;
    s.apostasPos += f.apostas;
    s.callsPos += f.calls;
    if (f.viuFlop) s.viuFlop++;
    if (f.showdown) s.wtsd++;
    if (f.ganhouSD) s.wsd++;
    if (modo === 'cash') {
      s.cash.maos++;
      s.cash.resultadoBB += f.ganho / f.bb;
      s.cash.resultado += f.ganho;
    }
  }

  /** Registra uma mão terminada (modo = 'cash' | 'sng' | 'torneio'). */
  function registrarMao(h, heroi, modo) {
    const f = fatosDaMao(h, heroi);
    aplicar(s => somar(s, f, modo));
  }

  /** Estatísticas de um conjunto de mãos (ex.: só as desta partida). */
  function resumirMaos(lista, modo) {
    const s = vazio();
    lista.forEach(r => somar(s, fatosDaMao(r.hist, r.heroi), modo));
    return resumo(s);
  }

  function registrarDecisao(nota) {
    if (!nota) return;
    aplicar(s => {
      const d = s.decisoes[nota.rua] || s.decisoes.river;
      d.total++;
      d[nota.nota]++;
      d.perdaBB += nota.perdaBB;
      if (nota.categoria) s.erros[nota.categoria] = (s.erros[nota.categoria] || 0) + 1;
    });
  }

  function registrarTorneio(tipo, investido, premio, posicao, field) {
    aplicar(s => {
      const t = s[tipo];
      t.jogados++;
      t.investido += investido;
      t.premios += premio;
      if (premio > 0) t.itm++;
      if (posicao === 1) t.vitorias++;
      if (tipo === 'torneio' && (t.melhor === null || posicao < t.melhor.posicao)) t.melhor = { posicao, field };
    });
  }

  function registrarQuiz(acertou, ms, pontos) {
    aplicar(s => {
      s.quiz.perguntas++;
      if (acertou) s.quiz.acertos++;
      s.quiz.tempoTotal += ms;
      s.quiz.pontos += pontos || 0;
    });
  }

  /** Números prontos para a tela. */
  function resumo(s) {
    const pc = (a, b) => (b > 0 ? a / b : null);
    const dec = {};
    let tot = 0, certas = 0;
    Object.keys(s.decisoes).forEach(r => {
      const d = s.decisoes[r];
      dec[r] = { total: d.total, corretas: pc(d.otima + d.boa, d.total), perdaMedia: pc(d.perdaBB, d.total), dist: d };
      tot += d.total; certas += d.otima + d.boa;
    });
    const erros = Object.keys(s.erros).map(k => ({ id: k, nome: (P.Coach && P.Coach.NOMES_ERRO[k]) || k, n: s.erros[k] }))
      .sort((a, b) => b.n - a.n);
    const roi = t => (t.investido > 0 ? (t.premios - t.investido) / t.investido : null);
    return {
      maos: s.maos,
      vpip: pc(s.vpip, s.maos), pfr: pc(s.pfr, s.maos), tresBet: pc(s.tresBet, s.oport3bet),
      af: s.callsPos > 0 ? s.apostasPos / s.callsPos : (s.apostasPos > 0 ? Infinity : null),
      wtsd: pc(s.wtsd, s.viuFlop), wsd: pc(s.wsd, s.wtsd),
      bb100: s.cash.maos > 0 ? s.cash.resultadoBB / s.cash.maos * 100 : null,
      cash: s.cash,
      sng: Object.assign({ roi: roi(s.sng) }, s.sng),
      torneio: Object.assign({ roi: roi(s.torneio) }, s.torneio),
      decisoes: dec, totalDecisoes: tot, corretas: pc(certas, tot),
      erros,
      quiz: Object.assign({ precisao: pc(s.quiz.acertos, s.quiz.perguntas), tempoMedio: pc(s.quiz.tempoTotal, s.quiz.perguntas) }, s.quiz),
      desde: s.desde
    };
  }

  P.Estatisticas = {
    registrarMao, registrarDecisao, registrarTorneio, registrarQuiz, fatosDaMao, resumirMaos,
    sessao: () => resumo(sessao),
    acumulado: () => resumo(acumulado),
    zerarAcumulado: () => { acumulado = vazio(); salvar(); },
    zerarSessao: () => { sessao = vazio(); }
  };
})(window.Poker = window.Poker || {});
