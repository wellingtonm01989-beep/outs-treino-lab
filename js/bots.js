/* ==========================================================================
   OUTS · Treino Lab — bots.js
   Oponentes: perfis, composição por nível, identidade fictícia (nome, país,
   avatar) e a lógica de decisão.

   Os bots recebem SÓ a vista pública do próprio assento (motor.vista): as
   próprias cartas, o board, stacks e ações. Nunca veem cartas de outros
   jogadores nem o baralho restante. O que eles "lembram" dos outros vem da
   leitura (leitura.js), que também só anota informação pública.

   Diante de all-in no pré-flop todos os perfis fazem a conta: equity contra o
   range provável do all-in x preço do call (em fichas ou, no torneio, ICM).
   O perfil Profissional ainda decide os próprios all-ins pela conta de EV,
   adapta ranges e blefes ao que leu de cada oponente e joga com ICM.
   ========================================================================== */
(function (P) {
  'use strict';

  var R = P.Ranges, RNG = P.RNG, An = P.Analise;

  // ------------------------------------------------------------- perfis
  // margemShove: equity a mais (+) ou a menos (−) que o perfil exige para pagar all-in
  // desconfia: o quanto acha que o all-in dos outros é largo (blefe)
  // adapta: 0 = não presta atenção nos outros; 1 = ajusta rápido como um profissional
  var PERFIS = {
    station: {
      nome: 'Calling station', sigla: 'CS', cor: '#d9a441',
      descricao: 'Paga demais e raramente aumenta. Contra ele: aposte valor maior e quase nunca blefe.',
      abre: 0.8, paga: 2.2, tresBet: 0.4, limpa: 0.7, blefe: 0.06, cbet: 0.35, agressao: 0.35,
      margemCall: -0.12, valorMin: 0.72, tamanhos: [0.5, 0.6],
      margemShove: -0.1, desconfia: 2.5, adapta: 0
    },
    nit: {
      nome: 'Nit', sigla: 'NIT', cor: '#7aa2c7',
      descricao: 'Joga poucas mãos e só aposta forte com mão forte. Contra ele: roube blinds e respeite a agressão.',
      abre: 0.65, paga: 0.7, tresBet: 0.5, limpa: 0.05, blefe: 0.05, cbet: 0.55, agressao: 0.6,
      margemCall: 0.08, valorMin: 0.68, tamanhos: [0.5, 0.66],
      margemShove: 0.05, desconfia: 1, adapta: 0.35
    },
    tag: {
      nome: 'TAG', sigla: 'TAG', cor: '#4fbf8b',
      descricao: 'Tight-agressivo: ranges sólidos, aposta e aumenta com propósito.',
      abre: 1, paga: 1, tresBet: 1, limpa: 0, blefe: 0.25, cbet: 0.65, agressao: 1,
      margemCall: 0, valorMin: 0.62, tamanhos: [0.33, 0.5, 0.66],
      margemShove: 0, desconfia: 1, adapta: 0.6
    },
    lag: {
      nome: 'LAG', sigla: 'LAG', cor: '#e07a5f',
      descricao: 'Loose-agressivo: muitas mãos, muita pressão, blefes frequentes.',
      abre: 1.35, paga: 1.25, tresBet: 1.6, limpa: 0, blefe: 0.4, cbet: 0.75, agressao: 1.4,
      margemCall: -0.03, valorMin: 0.58, tamanhos: [0.33, 0.66, 1],
      margemShove: -0.02, desconfia: 1.3, adapta: 0.6
    },
    maniaco: {
      nome: 'Maníaco', sigla: 'MAN', cor: '#e5484d',
      descricao: 'Aumenta quase tudo e blefa sem parar. Contra ele: pague mais leve e deixe ele blefar.',
      abre: 2.2, paga: 1.5, tresBet: 3, limpa: 0.05, blefe: 0.65, cbet: 0.9, agressao: 2.2,
      margemCall: -0.06, valorMin: 0.5, tamanhos: [0.75, 1, 1.5],
      margemShove: -0.07, desconfia: 2, adapta: 0
    },
    pro: {
      nome: 'Profissional', sigla: 'PRO', cor: '#b794f4',
      descricao: 'Joga como profissional: ranges de equilíbrio, contas de EV e ICM, e lê o seu jogo. Se você empurra all-in demais, ele paga mais leve; se paga tudo, ele para de blefar.',
      abre: 1.05, paga: 1, tresBet: 1.15, limpa: 0, blefe: 0.3, cbet: 0.62, agressao: 1.15,
      margemCall: 0, valorMin: 0.6, tamanhos: [0.33, 0.5, 0.75],
      margemShove: 0, desconfia: 1, adapta: 1, pro: true
    }
  };

  // composição das mesas por nível
  var COMPOSICAO = {
    micro: { station: 0.45, nit: 0.15, tag: 0.15, lag: 0.1, maniaco: 0.15 },
    pequeno: { station: 0.25, nit: 0.2, tag: 0.25, lag: 0.2, maniaco: 0.1 },
    medio: { station: 0.1, nit: 0.15, tag: 0.4, lag: 0.25, maniaco: 0.05, pro: 0.05 },
    alto: { station: 0.05, nit: 0.05, tag: 0.25, lag: 0.3, maniaco: 0.05, pro: 0.3 },
    pro: { pro: 1 }
  };

  function sortearPerfil(nivel) {
    var comp = COMPOSICAO[nivel] || COMPOSICAO.pequeno, x = RNG.real(), acc = 0;
    for (var p in comp) { acc += comp[p]; if (x < acc) return p; }
    return 'tag';
  }

  // ------------------------------------------------------ identidade fictícia
  var NOMES = ['Duda_Rio', 'LoboCinza', 'Marquinhos88', 'TiaNena', 'CapivaraAce', 'ZéFicha', 'BiaBlefe', 'RiverRato',
    'SeuJuca', 'NinaAllIn', 'Tubarão7', 'DoutorOuts', 'KátiaK', 'Pedrão', 'Aldo.M', 'ClaraV', 'RuiSilva', 'InêsF',
    'GaelT', 'YaraB', 'OttoL', 'LiaRos', 'HugoP', 'NádiaC', 'BaianoGTO', 'MineiroFold', 'Gaúcho3bet', 'Pipoca',
    'Fênix21', 'Cacique', 'JoanaD', 'VovóBet', 'Tico', 'Teco', 'Magrão', 'LuaCheia', 'SolNascente', 'Faísca',
    'Trovão', 'Brisa', 'CaféComLeite', 'Pastel77', 'Kombi', 'Jacaré', 'Arara', 'TatuBola', 'Sabiá', 'Ipê',
    'Mandacaru', 'Caju', 'Bituca', 'Rafinha', 'Lelê', 'DaniR', 'GustavoP', 'Mel', 'Tainá', 'Iara', 'DaviK', 'VitóriaS',
    'Quixote', 'Barão', 'Marola', 'Sereia', 'Pirata', 'Cometa', 'Ventania', 'Rapadura', 'Pamonha', 'Siri'];

  var PAISES = [
    { nome: 'Valdória', cores: ['#2b6f4e', '#f4ecd8', '#b8433c'], tipo: 'v' },
    { nome: 'Ilhas Corvinas', cores: ['#1d3c6e', '#e9c46a', '#1d3c6e'], tipo: 'h' },
    { nome: 'Nova Arcádia', cores: ['#6a2c70', '#f6f1e9', '#6a2c70'], tipo: 'v', circulo: '#e0a526' },
    { nome: 'Estrelândia', cores: ['#0b3954', '#bfd7ea', '#ff5a5f'], tipo: 'h' },
    { nome: 'Pratamar', cores: ['#c0c7cc', '#2a4d69', '#c0c7cc'], tipo: 'h' },
    { nome: 'Montebranco', cores: ['#f5f5f5', '#d62828', '#f5f5f5'], tipo: 'v' },
    { nome: 'Solvânia', cores: ['#f77f00', '#fcbf49', '#003049'], tipo: 'h' },
    { nome: 'Kartésia', cores: ['#14213d', '#fca311', '#e5e5e5'], tipo: 'v' },
    { nome: 'Aurélia do Sul', cores: ['#386641', '#a7c957', '#f2e8cf'], tipo: 'h', circulo: '#bc4749' },
    { nome: 'Lumíria', cores: ['#3a0ca3', '#4cc9f0', '#3a0ca3'], tipo: 'v' },
    { nome: 'Terra de Ondina', cores: ['#00798c', '#edae49', '#d1495b'], tipo: 'h' },
    { nome: 'Grão-Ducado de Velm', cores: ['#540b0e', '#e09f3e', '#335c67'], tipo: 'v' }
  ];

  var TONS_PELE = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#f8d9c0'];
  var CORES_CABELO = ['#2b1b0e', '#5a3a1a', '#a0522d', '#d4a017', '#1a1a1a', '#9e9e9e', '#c0392b'];

  var contador = 0;
  function sortearAvatar() {
    return {
      fundo: RNG.inteiroAbaixo(360),
      pele: RNG.escolher(TONS_PELE),
      cabelo: RNG.escolher(CORES_CABELO),
      estilo: RNG.inteiroAbaixo(6),
      oculos: RNG.chance(0.25),
      barba: RNG.chance(0.25),
      bone: RNG.chance(0.15),
      roupa: RNG.inteiroAbaixo(360)
    };
  }

  /** Novo oponente com nome que ainda não está na mesa. */
  function criar(nivel, nomesEmUso, perfilFixo) {
    var usados = nomesEmUso || [];
    var livres = NOMES.filter(function (n) { return usados.indexOf(n) < 0; });
    var nome = livres.length ? RNG.escolher(livres) : null;
    // torneios grandes: acabados os nomes, apelido + número (sem repetir)
    for (var t = 0; !nome && t < 50; t++) {
      var c = RNG.escolher(NOMES) + RNG.inteiroEntre(2, 99);
      if (usados.indexOf(c) < 0) nome = c;
    }
    if (!nome) nome = 'Jogador' + (++contador);
    var perfil = perfilFixo || sortearPerfil(nivel);
    var bot = {
      id: 'bot-' + (++contador) + '-' + RNG.inteiroAbaixo(1e6),
      nome: nome,
      pais: RNG.escolher(PAISES),
      avatar: sortearAvatar(),
      perfil: perfil,
      bot: true
    };
    // cada profissional tem o seu jeito: uns mais soltos, outros mais apertados
    if (perfil === 'pro') bot.estilo = Math.round((0.88 + RNG.real() * 0.36) * 100) / 100;
    return bot;
  }

  // ---------------------------------------------------------- utilidades
  function naRange(mapa, classe) {
    var w = mapa[classe] || 0;
    return w >= 1 || (w > 0 && RNG.chance(w));
  }

  function limitar(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function arredondar(v, bb) {
    var passo = bb >= 100 ? Math.max(1, Math.round(bb / 20)) : 1;
    return Math.max(passo, Math.round(v / passo) * passo);
  }

  /** Converte a intenção do bot numa ação legal para o motor. */
  function normalizar(acao, v, bb) {
    if (typeof acao === 'string') {
      if (acao === 'fold' && v.podeCheck) return 'check';
      if (acao === 'check' && !v.podeCheck) return 'fold';
      if (acao === 'call' && v.podeCheck) return 'check';
      if (acao === 'allin') {
        if (v.podeApostar) return 'allin';
        return v.podeCheck ? 'check' : 'call';
      }
      return acao;
    }
    if (!v.podeApostar) return v.podeCheck ? 'check' : 'call';
    var ate = arredondar(acao.ate, bb);
    ate = Math.max(v.minAte, Math.min(v.maxAte, ate));
    if (ate >= v.maxAte * 0.85) ate = v.maxAte;
    return { tipo: v.tipoAposta, ate: ate };
  }

  function acoesPreflop(vista) {
    return vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === 'preflop'; });
  }
  function ehAumento(e) { return e.acao === 'raise' || e.acao === 'bet'; }

  // ------------------------------------------------------------- leitura
  /** O que este bot sabe de um jogador ({ c: contadores, e: estimativas }) ou null. */
  function lerJogador(ctx, prof, j) {
    if (!ctx.leitura || !prof.adapta || !j || !j.id) return null;
    var c = ctx.leitura.contadores(j.id);
    if (!c || !c.maos) return null;
    return { c: c, e: ctx.leitura.estimar(c, 1 / prof.adapta) };
  }

  /** Estimativas da leitura → fatores de range para a análise (analise.rangeEstimado). */
  function fatoresDe(e) {
    return {
      abre: limitar(e.abre / 0.24, 0.5, 3),
      paga: limitar(e.pagaRaise / 0.16, 0.5, 3),
      tresBet: limitar(e.tresBet / 0.08, 0.4, 4),
      limpa: limitar((e.vpip - e.pfr) / 0.07 * 0.3, 0.05, 1),
      blefe: limitar(0.3 * Math.pow(e.agressaoPos / 0.45, 1.2) * Math.pow(e.blefeRiver / 0.25, 0.6), 0.08, 0.9),
      estacao: e.desisteAposta < 0.3
    };
  }

  // --------------------------------------------------------------- contas
  function equityContra(cartas, mapas, board, iteracoes) {
    var js = [cartas].concat(mapas.map(function (m) { return { range: m }; }));
    return P.Equity.monteCarloSincrono({ jogadores: js, board: board || [], iteracoes: iteracoes }).equity[0];
  }

  /**
   * ICM do torneio para este bot: devolve valor(finais) = quanto vale (em $)
   * terminar a mão com os stacks "finais" ({assento: fichas}; quem não
   * aparece fica com as fichas atuais). null quando não há premiação a
   * disputar ou a conta exata ficaria cara (fields grandes).
   */
  function contextoICM(vista, eu, ctx) {
    var t = ctx.torneio;
    if (ctx.modo === 'cash' || !t || !t.premios || t.premios.length < 2 || !(t.restantes > 2)) return null;
    var fora = t.stacksFora || [];
    var n = vista.jogadores.length + fora.length;
    var k = Math.min(t.premios.length, n);
    if (n > 13) {
      var perm = 1;
      for (var i = 0; i < k; i++) perm *= (n - i);
      if (perm > 2e5) return null;
    }
    var iEu = -1;
    vista.jogadores.forEach(function (j, q) { if (j.assento === eu.assento) iEu = q; });
    var premioSeCair = t.premios.length >= t.restantes ? t.premios[t.restantes - 1] : 0;
    return function (finais) {
      var stacks = vista.jogadores.map(function (j) {
        return finais[j.assento] !== undefined ? Math.max(0, finais[j.assento]) : j.fichas;
      }).concat(fora);
      if (stacks[iEu] <= 0) return premioSeCair;
      return P.ICM.equities(stacks, t.premios)[iEu];
    };
  }

  /** Prêmio de risco aproximado (equity a mais para pagar all-in) quando o ICM exato é caro. */
  function premioRiscoAprox(vista, eu, ctx) {
    var t = ctx.torneio;
    if (ctx.modo === 'cash' || !t || !t.pagos) return 0;
    var faltam = t.restantes - t.pagos;
    var pressao = faltam > 0 ? limitar(1 - faltam / Math.max(3, t.pagos), 0, 1) : 0.35;
    var total = 0, n = 0;
    vista.jogadores.forEach(function (j) { total += j.fichas + j.investido; n++; });
    (t.stacksFora || []).forEach(function (s) { total += s; n++; });
    var media = total / Math.max(1, n), meu = eu.fichas + eu.investido;
    var fator = meu >= media * 1.6 ? 0.45 : meu <= media * 0.45 ? 0.55 : 1;
    return 0.09 * pressao * fator;
  }

  /**
   * Range (% das mãos) de um all-in pré-flop de "vil": parte de um padrão
   * para o tipo de all-in (abertura, re-shove, 4-bet ou mais) e o stack dele,
   * e se ajusta ao que este bot já viu esse jogador fazer.
   */
  function pctDoShove(vista, vil, ctx, prof) {
    var bb = vista.blinds.bb;
    var acoes = acoesPreflop(vista);
    var raisesAntes = 0;
    for (var i = 0; i < acoes.length; i++) {
      if (!ehAumento(acoes[i])) continue;
      if (acoes[i].assento === vil.assento && acoes[i].allin) break;
      raisesAntes++;
    }
    var sBB = (vil.fichasIniciais || (vil.fichas + vil.investido)) / bb;
    var ordem = An.ordemPreflop(vista), hu = ordem.length === 2;
    var atrasVil = ordem.length - 1 - ordem.indexOf(vil.assento);
    var lido = lerJogador(ctx, prof, vil);
    var c = lido ? lido.c : null;
    var base, vezes = 0, oport = 0;
    if (raisesAntes === 0) {
      base = sBB <= 20 ? R.pctPush(sBB, atrasVil, hu) : Math.max(3, R.pctPush(20, atrasVil, hu) * 20 / sBB);
      if (c) {
        if (sBB > P.Leitura.FUNDO_BB) { vezes = c.abriuAllinFundo; oport = c.abrirOpFundo; }
        else { vezes = c.abriuAllin - c.abriuAllinFundo; oport = c.abrirOp - c.abrirOpFundo; }
      }
    } else if (raisesAntes === 1) {
      base = limitar(16 * Math.pow(12 / Math.max(sBB, 12), 0.9), 3, 30);
      if (c) { vezes = c.vsRaiseAllin; oport = c.vsRaiseOp; }
    } else {
      base = 3.5;
      if (lido) base *= limitar(lido.e.pfr / 0.17, 1, 3);
    }
    base *= prof.desconfia || 1;
    var pct = base;
    if (c && oport > 0) {
      var peso = 6 / prof.adapta;
      pct = Math.max(base * 0.6, 100 * (base / 100 * peso + vezes) / (peso + oport));
    }
    return limitar(pct, 2, 100);
  }

  /** Equity necessária para pagar o all-in de "vil" pelo ICM (ou null). */
  function necessariaICM(vista, eu, vil, ctx) {
    var valor = contextoICM(vista, eu, ctx);
    if (!valor) return null;
    var Teu = eu.fichas + eu.investido, Tv = vil.fichas + vil.investido;
    var E = Math.min(Teu, Tv);
    var D = Math.max(0, vista.pote - eu.investido - vil.investido);   // fichas de quem já foldou
    var f = {}, g = {}, p = {};
    f[eu.assento] = eu.fichas; f[vil.assento] = vil.fichas + vista.pote;
    g[eu.assento] = Teu + E + D; g[vil.assento] = Tv - E;
    p[eu.assento] = Teu - E; p[vil.assento] = Tv + E + D;
    var vF = valor(f), vG = valor(g), vP = valor(p);
    if (!(vG > vP)) return null;
    return (vF - vP) / (vG - vP);
  }

  /**
   * Pagar (ou não) um all-in no pré-flop: equity contra o range provável do
   * all-in (e de quem já pagou) x equity necessária pelo preço do call.
   */
  function decidirContraShove(vista, eu, prof, ctx, sit, v, classe) {
    var vil = An.jogadorDa(vista, sit.agressor);
    var acoes = acoesPreflop(vista);
    var iShove = -1;
    acoes.forEach(function (e, i) { if (e.assento === sit.agressor && ehAumento(e)) iShove = i; });
    var pagaram = [];
    for (var i = iShove + 1; i < acoes.length; i++) if (acoes[i].acao === 'call') pagaram.push(acoes[i].assento);
    var faltam = vista.jogadores.filter(function (j) {
      return j.assento !== eu.assento && j.assento !== vil.assento && !j.foldou && !j.allin && pagaram.indexOf(j.assento) < 0;
    }).length;

    var pct = pctDoShove(vista, vil, ctx, prof);
    var mapas = [R.topPercent(pct)];
    pagaram.forEach(function () { mapas.push(R.topPercent(Math.max(2, pct * 0.5))); });
    var eq;
    try { eq = equityContra(eu.cartas, mapas, [], prof.pro ? 900 : 500); }
    catch (e) { eq = (R.EQ_PREFLOP[classe] || { vs1: 0.5 }).vs1 * 0.85; }

    var paraPagar = Math.min(v.valorCall, eu.fichas);
    var meuTotal = eu.investido + paraPagar;
    var ganhavel = 0;
    vista.jogadores.forEach(function (j) { ganhavel += j.assento === eu.assento ? meuTotal : Math.min(j.investido, meuTotal); });
    var precisa = paraPagar / Math.max(1, ganhavel);
    if (ctx.modo !== 'cash') {
      if (prof.pro) {
        var icm = pagaram.length ? null : necessariaICM(vista, eu, vil, ctx);
        if (icm !== null && isFinite(icm)) precisa = icm;
        else precisa += premioRiscoAprox(vista, eu, ctx);
      } else precisa += (1 - (ctx.bolha || 1)) * 0.15;
    }
    precisa += (prof.margemShove || 0) + 0.015 * faltam;
    if (eq >= precisa) {
      // mão muito forte e ainda tem gente para falar: re-aumenta para isolar
      if (faltam > 0 && v.podeApostar && eq > 0.62) return 'allin';
      return 'call';
    }
    return 'fold';
  }

  /**
   * EV de ir all-in agora, comparado a foldar (ou dar check). Cada oponente
   * ainda na mão paga com uma fração das mãos: o padrão de equilíbrio para o
   * stack em jogo, ajustado pela leitura (quem paga demais, quem desiste
   * demais). Se alguém paga, vale a equity contra o range de quem paga. Com
   * ICM disponível, a conta é em dinheiro do torneio.
   * Devolve { ev, pFold, eq } ou null.
   */
  function evShove(vista, eu, prof, ctx) {
    var bb = vista.blinds.bb;
    var Teu = eu.fichas + eu.investido;
    var ops = vista.jogadores.filter(function (j) { return j.assento !== eu.assento && !j.foldou && !j.allin; });
    if (!ops.length) return null;
    var ordem = An.ordemPreflop(vista), hu = ordem.length === 2;
    var meuAtras = ordem.length - 1 - ordem.indexOf(eu.assento);
    var acoes = acoesPreflop(vista);
    var aumentos = acoes.filter(ehAumento);
    var pFold = 1, chamador = null, maiorC = -1, pctChamador = 0;
    ops.forEach(function (o) {
      var To = o.fichas + o.investido, E = Math.min(Teu, To);
      var lido = lerJogador(ctx, prof, o);
      var meusAumentos = aumentos.filter(function (e) { return e.assento === o.assento; });
      var pct;
      if (meusAumentos.length) {
        // quem já aumentou paga com parte do range com que aumentou
        var idx = aumentos.indexOf(meusAumentos[meusAumentos.length - 1]);
        var rangePct, atrasO = ordem.length - 1 - ordem.indexOf(o.assento);
        if (idx === 0) {
          rangePct = R.percentual(R.abertura(atrasO, hu));
          if (lido) rangePct *= limitar(lido.e.abre / P.Leitura.PADRAO.abre[0], 0.5, 3);
        } else if (idx === 1) {
          rangePct = 6;
          if (lido) rangePct *= limitar(lido.e.tresBet / P.Leitura.PADRAO.tresBet[0], 0.5, 4);
        } else rangePct = 3.5;
        var fica = lido ? 1 - lido.e.foldA3bet : 0.45;
        pct = rangePct * limitar(fica, 0.2, 0.85);
        if (o.investido >= To * 0.4) pct = Math.max(pct, rangePct * 0.85);   // já comprometido com o pote
      } else {
        pct = Math.max(3, R.pctPush(E / bb, meuAtras, hu) * 0.55);
        if (o.bb) pct *= 1.15;                                                // o big blind já tem fichas no pote
        if (lido) pct *= limitar(lido.e.pagaShove / P.Leitura.PADRAO.pagaShove[0], 0.5, 3);
      }
      pct = limitar(pct, 1, 100);
      pFold *= 1 - pct / 100;
      if (pct > maiorC) { maiorC = pct; chamador = o; pctChamador = pct; }
    });

    var Tc = chamador.fichas + chamador.investido, E = Math.min(Teu, Tc);
    var eq;
    try { eq = equityContra(eu.cartas, [R.topPercent(pctChamador)], [], 700); }
    catch (e) { return null; }
    var Ieu = eu.investido, Ic = chamador.investido;
    var D = Math.max(0, vista.pote - Ieu - Ic);
    var valor = contextoICM(vista, eu, ctx);
    var ev;
    if (valor) {
      var agora = {}, todos = {}, ganha = {}, perde = {};
      agora[eu.assento] = eu.fichas;
      todos[eu.assento] = eu.fichas + vista.pote;
      ganha[eu.assento] = eu.fichas + E + Ieu + D; ganha[chamador.assento] = Tc - E;
      perde[eu.assento] = eu.fichas - (E - Ieu); perde[chamador.assento] = Tc + E + D;
      ev = pFold * valor(todos) + (1 - pFold) * (eq * valor(ganha) + (1 - eq) * valor(perde)) - valor(agora);
    } else {
      ev = pFold * vista.pote + (1 - pFold) * (eq * (E + Ieu + D) - (1 - eq) * (E - Ieu));
    }
    return { ev: ev, pFold: pFold, eq: eq };
  }

  // ---------------------------------------------------------- pré-flop
  function tamanhoAbertura(sit, bb, prof, ctx) {
    var x;
    if (prof === PERFIS.maniaco) x = 3 + RNG.inteiroAbaixo(3);
    else if (ctx.modo !== 'cash') x = sit.efetivoBB < 25 ? 2 : 2.2;
    else if (sit.hu) x = ctx.nivel === 'alto' || prof.pro ? 2.2 : 2.5;
    else if (sit.lugar === 'sb') x = 3;
    else x = sit.atras >= 5 ? (ctx.nivel === 'alto' || prof.pro ? 2.5 : 3) : sit.atras >= 3 ? 2.5 : 2.3;
    return Math.round(x * bb);
  }

  function tamanho3bet(sit, vista, prof) {
    var ip = sit.lugar === 'ip';
    var base = vista.apostaAtual * (ip ? 3 : 3.8) + sit.chamadores * vista.apostaAtual;
    if (prof === PERFIS.maniaco) base *= 1.2;
    return base;
  }

  /** Quanto os que ainda falam defendem contra um roubo (pagam ou re-aumentam). */
  function fatorRoubo(vista, eu, prof, ctx) {
    var defesas = [];
    vista.jogadores.forEach(function (j) {
      if (j.assento === eu.assento || j.foldou) return;
      var lido = lerJogador(ctx, prof, j);
      if (lido) defesas.push(lido.e.pagaRaise + lido.e.tresBet);
    });
    if (!defesas.length) return 1;
    var media = defesas.reduce(function (s, x) { return s + x; }, 0) / defesas.length;
    return limitar(Math.pow(0.24 / Math.max(0.05, media), 0.5), 0.75, 1.6);
  }

  /**
   * Profissional com stack curto ou médio: all-in quando a conta de EV
   * manda (abrindo, re-shove contra abertura, 4-bet all-in contra 3-bet).
   * Devolve null quando o stack é fundo (aí valem as tabelas, com leitura).
   */
  function preflopPro(vista, eu, prof, ctx, v, sit, classe) {
    var torneio = ctx.modo !== 'cash';
    var ef = sit.efetivoBB, r;
    if ((sit.tipo === 'aberto' || sit.tipo === 'limpers' || sit.tipo === 'bb_opcao') && ef <= (torneio ? 15 : 12)) {
      r = evShove(vista, eu, prof, ctx);
      if (r && r.ev > 0) return 'allin';
      return v.podeCheck ? 'check' : 'fold';
    }
    var vsAbertura = sit.tipo === 'vs_open' && ef <= 25;
    var vs3bet = (sit.tipo === 'vs_3bet' || sit.tipo === 'vs_3bet_frio') && ef <= 40;
    if (vsAbertura || vs3bet) {
      r = evShove(vista, eu, prof, ctx);
      if (r && r.ev > 0) return 'allin';
      // sem all-in lucrativo: paga só com a parte mais forte do range de call (ainda há stack para jogar)
      if (vsAbertura && ef > 15) {
        var resp = R.respostaAoRaise(R.grupoAgressor(sit.atrasDoAgressor, sit.hu), sit.lugar);
        if (naRange(R.ajustarRange(resp.call, 0.6), classe)) return 'call';
      }
      if (sit.tipo === 'vs_3bet' && ef > 30) {
        var r3 = R.respostaA3bet(sit.atrasDoAgressor <= 2, !eu.sb && !eu.bb);
        if (naRange(R.ajustarRange(r3.call, 0.6), classe)) return 'call';
      }
      return 'fold';
    }
    return null;
  }

  function preflop(vista, eu, prof, ctx, v) {
    var sit = An.situacaoPreflop(vista, eu.assento);
    var classe = R.classeDaMao(eu.cartas[0], eu.cartas[1]);
    var bb = vista.blinds.bb;
    var bolha = ctx.bolha || 1;
    var tot = eu.fichas + eu.apostaRua;
    var estilo = ctx.estilo || 1;

    // diante de all-in: conta de EV (equity contra o range provável x preço)
    if (sit.agressorAllin && v.valorCall > 0) return decidirContraShove(vista, eu, prof, ctx, sit, v, classe);

    if (prof.pro) {
      var dp = preflopPro(vista, eu, prof, ctx, v, sit, classe);
      if (dp) return dp;
    }

    // stack curto em SNG/torneio: push ou fold
    if (ctx.modo !== 'cash' && sit.efetivoBB <= 13) {
      if (sit.tipo === 'aberto' || sit.tipo === 'limpers' || sit.tipo === 'bb_opcao') {
        var push = R.ajustarRange(R.pushRange(sit.efetivoBB, sit.atras, sit.hu), Math.sqrt(prof.abre) * (ctx.agressividade || 1));
        if (sit.tipo === 'bb_opcao') push = R.ajustarRange(push, 0.6);
        if (naRange(push, classe)) return 'allin';
        return v.podeCheck ? 'check' : 'fold';
      }
      var call = R.ajustarRange(R.callShoveRange(sit.efetivoBB, sit.atrasDoAgressor === null ? 2 : sit.atrasDoAgressor, sit.hu), Math.sqrt(prof.paga) * bolha);
      if (naRange(call, classe)) return 'allin';
      return 'fold';
    }

    var agressor = sit.agressor !== null ? An.jogadorDa(vista, sit.agressor) : null;
    var lidoAg = agressor ? lerJogador(ctx, prof, agressor) : null;

    switch (sit.tipo) {
      case 'aberto': {
        var roubo = sit.atras <= 3 ? fatorRoubo(vista, eu, prof, ctx) : 1;
        var r = R.ajustarRange(R.abertura(sit.atras, sit.hu), prof.abre * estilo * roubo);
        if (naRange(r, classe)) {
          if (prof.limpa > 0 && RNG.chance(prof.limpa) && !eu.bb) return 'call';
          return { tipo: 'raise', ate: tamanhoAbertura(sit, bb, prof, ctx) };
        }
        if (eu.sb && prof.limpa > 0.3 && R.percentilClasse(classe) < 55) return 'call';
        return 'fold';
      }
      case 'limpers': {
        var iso = R.ajustarRange(R.isoRaise(sit.atras, sit.hu), prof.abre * estilo);
        if (naRange(iso, classe) && !(prof.limpa > 0.5 && RNG.chance(0.5))) return { tipo: 'raise', ate: (3 + sit.limpers) * bb };
        if (naRange(R.topPercent(Math.min(100, 28 * prof.paga)), classe)) return 'call';
        return 'fold';
      }
      case 'bb_opcao': {
        if (naRange(R.ajustarRange(R.bbContraLimp(), prof.tresBet), classe)) return { tipo: 'raise', ate: (3 + sit.limpers) * bb };
        return 'check';
      }
      case 'vs_open': {
        var resp = R.respostaAoRaise(R.grupoAgressor(sit.atrasDoAgressor, sit.hu), sit.lugar);
        var tamanhoBB = sit.tamanhoUltimo / bb;
        var aperto = Math.min(1, 3 / Math.max(2, tamanhoBB));
        // quem abre demais leva mais 3-bet e mais call
        var largura = lidoAg ? lidoAg.e.abre / P.Leitura.PADRAO.abre[0] : 1;
        var tres = R.ajustarRange(resp.tresBet, prof.tresBet * estilo * (sit.chamadores ? 0.7 : 1) * limitar(Math.pow(largura, 0.6), 0.8, 2.5));
        var pagar = R.ajustarRange(resp.call, prof.paga * aperto * bolha * limitar(Math.pow(largura, 0.35), 0.85, 1.6));
        if (naRange(tres, classe)) {
          var t3 = tamanho3bet(sit, vista, prof);
          return t3 >= tot * 0.4 ? 'allin' : { tipo: 'raise', ate: t3 };
        }
        if (naRange(pagar, classe)) return 'call';
        return 'fold';
      }
      case 'vs_3bet': {
        var largo = sit.atrasDoAgressor <= 2;
        var ipVs3 = !eu.sb && !eu.bb;
        var r3 = R.respostaA3bet(largo, ipVs3);
        var largura3 = lidoAg ? lidoAg.e.tresBet / P.Leitura.PADRAO.tresBet[0] : 1;
        if (naRange(R.ajustarRange(r3.quatroBet, prof.tresBet * limitar(Math.pow(largura3, 0.6), 0.8, 2.5)), classe)) {
          var t4 = vista.apostaAtual * 2.3;
          return t4 >= tot * 0.4 ? 'allin' : { tipo: 'raise', ate: t4 };
        }
        if (naRange(R.ajustarRange(r3.call, prof.paga * bolha * limitar(Math.pow(largura3, 0.3), 0.85, 1.5)), classe)) return 'call';
        return 'fold';
      }
      case 'vs_3bet_frio': {
        if (naRange(R.ajustarRange(R.parse('QQ+, AKs, AKo'), prof.tresBet), classe)) return 'allin';
        if (naRange(R.ajustarRange(R.parse('JJ-TT, AQs'), prof.paga), classe)) return 'call';
        return 'fold';
      }
      case 'vs_4bet':
      case 'vs_4bet_frio': {
        var r4 = R.respostaA4bet();
        if (naRange(R.ajustarRange(r4.allin, Math.sqrt(prof.tresBet)), classe)) return 'allin';
        if (sit.efetivoBB > 60 && naRange(r4.call, classe)) return 'call';
        return 'fold';
      }
    }
    return v.podeCheck ? 'check' : 'fold';
  }

  // ---------------------------------------------------------- pós-flop
  function tamanhoValor(tex, prof, alto) {
    if (alto) return RNG.escolher(tex.tipo === 'seco' ? [0.33, 0.5, 0.75] : [0.66, 0.75, 1, 1.25]);
    var base = tex.tipo === 'seco' ? 0.4 : tex.tipo === 'molhado' ? 0.75 : 0.55;
    if (prof === PERFIS.maniaco) base *= 1.4;
    if (prof === PERFIS.station) base = 0.5;
    return base;
  }

  function posflop(vista, eu, prof, ctx, v) {
    var board = vista.board, cartas = eu.cartas, bb = vista.blinds.bb;
    var oponentes = vista.jogadores.filter(function (j) { return j.assento !== eu.assento && !j.foldou; });
    var nOp = oponentes.length;
    var conhecidas = cartas.concat(board);
    var leituras = oponentes.map(function (o) { return lerJogador(ctx, prof, o); });
    var eq;
    try {
      var ranges = oponentes.map(function (o, i) {
        var perfilOp = leituras[i] ? fatoresDe(leituras[i].e) : 'desconhecido';
        return { combos: An.rangeEstimado(vista, o.assento, perfilOp, conhecidas).combos };
      });
      eq = P.Equity.monteCarloSincrono({ jogadores: [cartas].concat(ranges), board: board, iteracoes: prof.pro ? 600 : 350 }).equity[0];
    } catch (e) {
      eq = Math.pow(An.forcaAtual(cartas, board).hs, nOp);
    }
    var outs = board.length < 5 ? An.outs(cartas, board).efetivos : 0;
    var tex = An.textura(board);
    var pote = vista.pote;
    var alto = ctx.nivel === 'alto' || prof.pro;
    var estilo = ctx.estilo || 1;
    var raisesPre = vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === 'preflop' && (e.acao === 'raise' || e.acao === 'bet'); });
    var agressorPre = raisesPre.length && raisesPre[raisesPre.length - 1].assento === eu.assento;

    // leitura: quanto os oponentes desistem diante de aposta (blefe só funciona contra quem desiste)
    var desiste = P.Leitura.PADRAO.desisteAposta[0], nLidos = 0, somaDes = 0;
    leituras.forEach(function (l) { if (l) { somaDes += l.e.desisteAposta; nLidos++; } });
    if (nLidos) desiste = somaDes / nLidos;
    var fatorBlefe = nLidos ? limitar(Math.pow(desiste / 0.45, 1.3), 0.15, 1.8) : 1;
    var ajusteValor = nLidos ? (desiste < 0.33 ? -0.06 : desiste > 0.6 ? 0.03 : 0) : 0;

    function aposta(frac) { return { tipo: 'bet', ate: Math.max(bb, pote * frac) }; }
    function aumento() {
      var alvo = vista.apostaAtual * (2.6 + RNG.real() * 0.6) + (pote - vista.apostaAtual) * 0.15;
      if (alvo >= (eu.fichas + eu.apostaRua) * 0.45) return 'allin';
      return { tipo: 'raise', ate: alvo };
    }

    if (v.podeCheck) {
      var valorMin = prof.valorMin + 0.04 * (nOp - 1) + ajusteValor;
      if (eq >= valorMin) {
        if (eq > 0.85 && tex.tipo === 'seco' && RNG.chance(0.2)) return 'check';     // slowplay ocasional
        return aposta(tamanhoValor(tex, prof, alto));
      }
      if (vista.rua === 'flop' && agressorPre && nOp <= 2 &&
        RNG.chance(prof.cbet * (tex.tipo === 'seco' ? 1.1 : tex.tipo === 'molhado' ? 0.75 : 0.9) * (nLidos ? limitar(desiste / 0.45, 0.5, 1.4) : 1))) {
        return aposta(tex.tipo === 'seco' ? 0.33 : 0.5);
      }
      if (outs >= 8 && RNG.chance(0.3 * prof.agressao)) return aposta(0.6);
      if (nOp === 1 && RNG.chance(prof.blefe * estilo * fatorBlefe * (vista.rua === 'river' ? 0.4 : 0.3))) {
        return aposta(alto ? RNG.escolher([0.5, 0.75, 1.2]) : 0.6);
      }
      return 'check';
    }

    var paraPagar = v.valorCall;
    var potOdds = paraPagar / (pote + paraPagar);
    if (eq >= Math.max(0.7, prof.valorMin + 0.14 + ajusteValor) && RNG.chance(Math.min(0.85, 0.35 * prof.agressao + 0.2))) return aumento();
    if (outs >= 9 && vista.rua !== 'river' && RNG.chance(0.15 * prof.agressao)) return aumento();
    if (nOp === 1 && RNG.chance(prof.blefe * fatorBlefe * 0.08)) return aumento();
    var implicitas = vista.rua !== 'river' ? Math.min(0.07, outs * 0.006) : 0;
    var precisa = potOdds + prof.margemCall + 0.03 * (nOp - 1);
    if (eq + implicitas >= precisa) return 'call';
    if (prof === PERFIS.station && paraPagar <= pote * 0.8 && An.classificarMao(cartas, board).nivel !== 'nada') return 'call';
    return 'fold';
  }

  // ---------------------------------------------------------- decisão
  /**
   * Decide a ação do bot.
   * ctx: { perfil, nivel, modo, bolha (fator <1 aperta calls), agressividade,
   *        leitura (P.Leitura da partida), torneio ({premios, stacksFora, restantes, pagos}),
   *        estilo (profissional: >1 mais solto) }
   * Retorna { acao, ms } — ms é o tempo de "pensamento" sugerido.
   */
  function decidir(vista, assento, ctx) {
    var v = vista.acoes;
    var eu = An.jogadorDa(vista, assento);
    var prof = PERFIS[ctx.perfil] || PERFIS.tag;
    var bruta;
    try {
      bruta = vista.rua === 'preflop' ? preflop(vista, eu, prof, ctx, v) : posflop(vista, eu, prof, ctx, v);
    } catch (e) {
      bruta = v.podeCheck ? 'check' : 'fold';
    }
    var acao = normalizar(bruta, v, vista.blinds.bb);
    return { acao: acao, ms: tempoDecisao(acao, vista, v) };
  }

  function tempoDecisao(acao, vista, v) {
    var tipo = typeof acao === 'string' ? acao : acao.tipo;
    var base, desvio;
    if (tipo === 'fold' && vista.rua === 'preflop') { base = 650; desvio = 250; }
    else if (tipo === 'check') { base = 900; desvio = 350; }
    else if (tipo === 'allin' || (v.valorCall > 0 && v.callAllin)) { base = 2600; desvio = 800; }
    else if (vista.rua === 'river') { base = 1900; desvio = 700; }
    else { base = 1400; desvio = 550; }
    return Math.max(300, Math.round(base + RNG.normal() * desvio));
  }

  P.Bots = {
    PERFIS: PERFIS,
    COMPOSICAO: COMPOSICAO,
    PAISES: PAISES,
    criar: criar,
    sortearPerfil: sortearPerfil,
    decidir: decidir,
    normalizar: normalizar,
    // expostos para os testes
    evShove: evShove,
    pctDoShove: pctDoShove
  };
})(window.Poker = window.Poker || {});
