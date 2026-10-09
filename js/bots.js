/* ==========================================================================
   OUTS · Treino Lab — bots.js
   Oponentes: perfis, composição por nível, identidade fictícia (nome, país,
   avatar) e a lógica de decisão.

   Os bots recebem SÓ a vista pública do próprio assento (motor.vista): as
   próprias cartas, o board, stacks e ações. Nunca veem cartas de outros
   jogadores nem o baralho restante.
   ========================================================================== */
(function (P) {
  'use strict';

  var R = P.Ranges, RNG = P.RNG, An = P.Analise;

  // ------------------------------------------------------------- perfis
  var PERFIS = {
    station: {
      nome: 'Calling station', sigla: 'CS', cor: '#d9a441',
      descricao: 'Paga demais e raramente aumenta. Contra ele: aposte valor maior e quase nunca blefe.',
      abre: 0.8, paga: 2.2, tresBet: 0.4, limpa: 0.7, blefe: 0.06, cbet: 0.35, agressao: 0.35,
      margemCall: -0.12, valorMin: 0.72, tamanhos: [0.5, 0.6]
    },
    nit: {
      nome: 'Nit', sigla: 'NIT', cor: '#7aa2c7',
      descricao: 'Joga poucas mãos e só aposta forte com mão forte. Contra ele: roube blinds e respeite a agressão.',
      abre: 0.65, paga: 0.7, tresBet: 0.5, limpa: 0.05, blefe: 0.05, cbet: 0.55, agressao: 0.6,
      margemCall: 0.08, valorMin: 0.68, tamanhos: [0.5, 0.66]
    },
    tag: {
      nome: 'TAG', sigla: 'TAG', cor: '#4fbf8b',
      descricao: 'Tight-agressivo: ranges sólidos, aposta e aumenta com propósito.',
      abre: 1, paga: 1, tresBet: 1, limpa: 0, blefe: 0.25, cbet: 0.65, agressao: 1,
      margemCall: 0, valorMin: 0.62, tamanhos: [0.33, 0.5, 0.66]
    },
    lag: {
      nome: 'LAG', sigla: 'LAG', cor: '#e07a5f',
      descricao: 'Loose-agressivo: muitas mãos, muita pressão, blefes frequentes.',
      abre: 1.35, paga: 1.25, tresBet: 1.6, limpa: 0, blefe: 0.4, cbet: 0.75, agressao: 1.4,
      margemCall: -0.03, valorMin: 0.58, tamanhos: [0.33, 0.66, 1]
    },
    maniaco: {
      nome: 'Maníaco', sigla: 'MAN', cor: '#e5484d',
      descricao: 'Aumenta quase tudo e blefa sem parar. Contra ele: pague mais leve e deixe ele blefar.',
      abre: 2.2, paga: 1.5, tresBet: 3, limpa: 0.05, blefe: 0.65, cbet: 0.9, agressao: 2.2,
      margemCall: -0.06, valorMin: 0.5, tamanhos: [0.75, 1, 1.5]
    }
  };

  // composição das mesas por nível
  var COMPOSICAO = {
    micro: { station: 0.45, nit: 0.15, tag: 0.15, lag: 0.1, maniaco: 0.15 },
    pequeno: { station: 0.25, nit: 0.2, tag: 0.25, lag: 0.2, maniaco: 0.1 },
    medio: { station: 0.1, nit: 0.15, tag: 0.45, lag: 0.25, maniaco: 0.05 },
    alto: { station: 0.05, nit: 0.05, tag: 0.4, lag: 0.45, maniaco: 0.05 }
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
    return {
      id: 'bot-' + (++contador) + '-' + RNG.inteiroAbaixo(1e6),
      nome: nome,
      pais: RNG.escolher(PAISES),
      avatar: sortearAvatar(),
      perfil: perfilFixo || sortearPerfil(nivel),
      bot: true
    };
  }

  // ---------------------------------------------------------- utilidades
  function naRange(mapa, classe) {
    var w = mapa[classe] || 0;
    return w >= 1 || (w > 0 && RNG.chance(w));
  }

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

  // ---------------------------------------------------------- pré-flop
  function tamanhoAbertura(sit, bb, prof, ctx) {
    var x;
    if (prof === PERFIS.maniaco) x = 3 + RNG.inteiroAbaixo(3);
    else if (ctx.modo !== 'cash') x = sit.efetivoBB < 25 ? 2 : 2.2;
    else if (sit.hu) x = ctx.nivel === 'alto' ? 2.2 : 2.5;
    else if (sit.lugar === 'sb') x = 3;
    else x = sit.atras >= 5 ? (ctx.nivel === 'alto' ? 2.5 : 3) : sit.atras >= 3 ? 2.5 : 2.3;
    return Math.round(x * bb);
  }

  function tamanho3bet(sit, vista, prof) {
    var ip = sit.lugar === 'ip';
    var base = vista.apostaAtual * (ip ? 3 : 3.8) + sit.chamadores * vista.apostaAtual;
    if (prof === PERFIS.maniaco) base *= 1.2;
    return base;
  }

  function preflop(vista, eu, prof, ctx, v) {
    var sit = An.situacaoPreflop(vista, eu.assento);
    var classe = R.classeDaMao(eu.cartas[0], eu.cartas[1]);
    var bb = vista.blinds.bb;
    var bolha = ctx.bolha || 1;
    var tot = eu.fichas + eu.apostaRua;

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

    switch (sit.tipo) {
      case 'aberto': {
        var r = R.ajustarRange(R.abertura(sit.atras, sit.hu), prof.abre);
        if (naRange(r, classe)) {
          if (prof.limpa > 0 && RNG.chance(prof.limpa) && !eu.bb) return 'call';
          return { tipo: 'raise', ate: tamanhoAbertura(sit, bb, prof, ctx) };
        }
        if (eu.sb && prof.limpa > 0.3 && R.percentilClasse(classe) < 55) return 'call';
        return 'fold';
      }
      case 'limpers': {
        var iso = R.ajustarRange(R.isoRaise(sit.atras, sit.hu), prof.abre);
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
        var tres = R.ajustarRange(resp.tresBet, prof.tresBet * (sit.chamadores ? 0.7 : 1));
        var pagar = R.ajustarRange(resp.call, prof.paga * aperto * bolha);
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
        if (naRange(R.ajustarRange(r3.quatroBet, prof.tresBet), classe)) {
          var t4 = vista.apostaAtual * 2.3;
          return t4 >= tot * 0.4 ? 'allin' : { tipo: 'raise', ate: t4 };
        }
        if (naRange(R.ajustarRange(r3.call, prof.paga * bolha), classe)) return 'call';
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
      case 'vs_shove': {
        var base = sit.efetivoBB <= 25 ? R.callShoveRange(sit.efetivoBB, sit.atrasDoAgressor, sit.hu) : R.parse('QQ+, AKs, AKo');
        if (naRange(R.ajustarRange(base, Math.pow(prof.paga, 0.7) * bolha), classe)) return 'call';
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
    var eq;
    try {
      var ranges = oponentes.map(function (o) { return { combos: An.rangeEstimado(vista, o.assento, 'desconhecido', conhecidas).combos }; });
      eq = P.Equity.monteCarloSincrono({ jogadores: [cartas].concat(ranges), board: board, iteracoes: 350 }).equity[0];
    } catch (e) {
      eq = Math.pow(An.forcaAtual(cartas, board).hs, nOp);
    }
    var outs = board.length < 5 ? An.outs(cartas, board).efetivos : 0;
    var tex = An.textura(board);
    var pote = vista.pote;
    var alto = ctx.nivel === 'alto';
    var raisesPre = vista.eventos.filter(function (e) { return e.tipo === 'acao' && e.rua === 'preflop' && (e.acao === 'raise' || e.acao === 'bet'); });
    var agressorPre = raisesPre.length && raisesPre[raisesPre.length - 1].assento === eu.assento;

    function aposta(frac) { return { tipo: 'bet', ate: Math.max(bb, pote * frac) }; }
    function aumento() {
      var alvo = vista.apostaAtual * (2.6 + RNG.real() * 0.6) + (pote - vista.apostaAtual) * 0.15;
      if (alvo >= (eu.fichas + eu.apostaRua) * 0.45) return 'allin';
      return { tipo: 'raise', ate: alvo };
    }

    if (v.podeCheck) {
      var valorMin = prof.valorMin + 0.04 * (nOp - 1);
      if (eq >= valorMin) {
        if (eq > 0.85 && tex.tipo === 'seco' && RNG.chance(0.2)) return 'check';     // slowplay ocasional
        return aposta(tamanhoValor(tex, prof, alto));
      }
      if (vista.rua === 'flop' && agressorPre && nOp <= 2 &&
        RNG.chance(prof.cbet * (tex.tipo === 'seco' ? 1.1 : tex.tipo === 'molhado' ? 0.75 : 0.9))) {
        return aposta(tex.tipo === 'seco' ? 0.33 : 0.5);
      }
      if (outs >= 8 && RNG.chance(0.3 * prof.agressao)) return aposta(0.6);
      if (nOp === 1 && RNG.chance(prof.blefe * (vista.rua === 'river' ? 0.4 : 0.3))) {
        return aposta(alto ? RNG.escolher([0.5, 0.75, 1.2]) : 0.6);
      }
      return 'check';
    }

    var paraPagar = v.valorCall;
    var potOdds = paraPagar / (pote + paraPagar);
    if (eq >= Math.max(0.7, prof.valorMin + 0.14) && RNG.chance(Math.min(0.85, 0.35 * prof.agressao + 0.2))) return aumento();
    if (outs >= 9 && vista.rua !== 'river' && RNG.chance(0.15 * prof.agressao)) return aumento();
    if (nOp === 1 && RNG.chance(prof.blefe * 0.08)) return aumento();
    var implicitas = vista.rua !== 'river' ? Math.min(0.07, outs * 0.006) : 0;
    var precisa = potOdds + prof.margemCall + 0.03 * (nOp - 1);
    if (eq + implicitas >= precisa) return 'call';
    if (prof === PERFIS.station && paraPagar <= pote * 0.8 && An.classificarMao(cartas, board).nivel !== 'nada') return 'call';
    return 'fold';
  }

  // ---------------------------------------------------------- decisão
  /**
   * Decide a ação do bot.
   * ctx: { perfil, nivel, modo, bolha (fator <1 aperta calls), agressividade }
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
    normalizar: normalizar
  };
})(window.Poker = window.Poker || {});
