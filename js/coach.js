/* ==========================================================================
   OUTS · Treino Lab — coach.js
   O treinador: analisa a situação do herói e explica o porquê.

   Pré-flop: mão, categoria, posição, stack efetivo, range recomendado da
   posição (grade 13x13), ajuste ao perfil dos oponentes, push/fold, M e ICM.
   Pós-flop: mão feita, draws, outs (limpos e sujos), regra do 4 e do 2 x
   valor exato, equity Monte Carlo contra o range estimado, pot odds, EV,
   implied odds, SPR, MDF, alfa do blefe, textura e recomendação.
   Depois de cada decisão: nota (Ótima, Boa, Imprecisa, Erro, Erro grave)
   com a perda estimada de EV.

   Os valores de EV são estimativas de um modelo simplificado (equity atual,
   fold equity pelo perfil do vilão); servem para treinar o raciocínio, não
   substituem um solver.
   ========================================================================== */
(function (P) {
  'use strict';

  const R = P.Ranges, An = P.Analise, C = P.Cartas;

  const NOME_ACAO = { fold: 'Fold', check: 'Check', call: 'Pague', bet: 'Aposte', raise: 'Aumente', allin: 'All-in' };
  const NOME_PERFIL = { station: 'calling station', nit: 'nit', tag: 'TAG', lag: 'LAG', maniaco: 'maníaco', reg: 'regular', pro: 'profissional', desconhecido: 'jogador desconhecido' };

  const pct = (x, casas = 0) => (x * 100).toFixed(casas).replace('.', ',') + '%';
  const num = (x, casas = 1) => (Math.round(x * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas).replace('.', ',');

  // ======================================================================
  // PRÉ-FLOP
  // ======================================================================
  function fatorVsPerfil(perfil) {
    switch (perfil) {
      case 'nit': return { tres: 0.7, call: 0.75 };
      case 'station': return { tres: 0.85, call: 0.9 };
      case 'lag': return { tres: 1.25, call: 1.15 };
      case 'maniaco': return { tres: 1.6, call: 1.35 };
      default: return { tres: 1, call: 1 };
    }
  }

  function tamanhoAbertura(sit, ctx) {
    let x;
    if (ctx.modo !== 'cash') x = sit.efetivoBB < 25 ? 2 : 2.2;
    else if (sit.hu) x = 2.5;
    else if (sit.lugar === 'sb') x = 3;
    else x = sit.atras >= 5 ? 3 : sit.atras >= 3 ? 2.5 : 2.3;
    return x + (sit.limpers || 0);
  }

  /**
   * Monta o "plano" do pré-flop: o range para aumentar, o range para pagar,
   * o tamanho e o texto que explica a situação.
   */
  function planoPreflop(vista, sit, eu, ctx) {
    const bb = vista.blinds.bb, hu = sit.hu;
    const perfis = ctx.perfis || {};
    const perfilAg = sit.agressor !== null ? (perfis[sit.agressor] || 'desconhecido') : null;
    const nomeAg = sit.agressor !== null ? (An.jogadorDa(vista, sit.agressor) || {}).nome : '';
    const posAg = sit.agressor !== null ? (An.jogadorDa(vista, sit.agressor) || {}).posicao : '';
    const tot = eu.fichas + eu.apostaRua;
    const p = { raise: {}, call: {}, nomeRaise: 'Aumentar', nomeCall: 'Pagar', ateBB: 0, allin: false, titulo: '', explicacao: '', pushFold: false };
    const curto = ctx.modo !== 'cash' && sit.efetivoBB <= 15;

    if (curto) {
      p.pushFold = true;
      if (sit.tipo === 'aberto' || sit.tipo === 'limpers' || sit.tipo === 'bb_opcao') {
        p.raise = R.pushRange(sit.efetivoBB, sit.atras, hu);
        p.nomeRaise = 'All-in';
        p.allin = true;
        const pctP = R.pctPush(sit.efetivoBB, sit.atras, hu);
        p.titulo = `Push/fold — ${num(sit.efetivoBB)} bb no ${sit.posicao}`;
        p.explicacao = `Com ${num(sit.efetivoBB)} bb (menos de 15), abrir pequeno e largar para um re-raise queima fichas: o padrão é all-in ou fold. ` +
          `Do ${sit.posicao}, com ${sit.atras} jogador(es) para falar depois, o all-in é lucrativo com cerca de ${Math.round(pctP)}% das mãos.`;
      } else {
        const fator = perfilAg === 'maniaco' ? 1.35 : perfilAg === 'lag' ? 1.15 : perfilAg === 'nit' ? 0.7 : 1;
        const base = R.ajustarRange(R.callShoveRange(sit.efetivoBB, sit.atrasDoAgressor === null ? 2 : sit.atrasDoAgressor, hu), fator);
        if (sit.agressorAllin) { p.call = base; p.nomeCall = 'Pagar o all-in'; }
        else { p.raise = base; p.nomeRaise = 'All-in (re-shove)'; p.allin = true; }
        p.titulo = `Push/fold — contra ${sit.agressorAllin ? 'all-in' : 'raise'} de ${nomeAg} (${posAg})`;
        p.explicacao = `Stack curto (${num(sit.efetivoBB)} bb): contra a agressão a decisão é ir all-in/pagar ou foldar. ` +
          `Quem ${sit.agressorAllin ? 'dá all-in' : 'abre'} do ${posAg} ${perfilAg && perfilAg !== 'desconhecido' ? '(' + NOME_PERFIL[perfilAg] + ') ' : ''}` +
          `tem range ${fator > 1 ? 'mais largo' : fator < 1 ? 'mais apertado' : 'padrão'}; pague com as mãos que têm equity suficiente contra ele.`;
      }
      return p;
    }

    switch (sit.tipo) {
      case 'aberto': {
        p.raise = R.abertura(sit.atras, hu);
        p.ateBB = tamanhoAbertura(sit, ctx);
        p.nomeRaise = 'Abrir';
        p.titulo = `Ninguém entrou: range de abertura do ${sit.posicao}`;
        p.explicacao = `Mesa foldou até você. Do ${sit.posicao}, com ${sit.atras} jogador(es) ainda para falar, o range de abertura tem ` +
          `${num(R.percentual(p.raise), 0)}% das mãos. Quanto menos gente atrás, mais largo: há menos chance de alguém acordar com mão forte.`;
        break;
      }
      case 'limpers': {
        p.raise = R.isoRaise(sit.atras, hu);
        const limpersStation = vista.eventos.some(e => e.tipo === 'acao' && e.rua === 'preflop' && e.acao === 'call' && perfis[e.assento] === 'station');
        if (limpersStation) p.raise = R.ajustarRange(p.raise, 1.2);
        p.call = R.menos(R.parse('22-99, A2s-A9s, 54s, 65s, 76s, 87s, 98s, T9s, KTs, QTs, JTs'), p.raise);
        p.ateBB = 3 + sit.limpers;
        p.nomeRaise = 'Iso-raise';
        p.nomeCall = 'Limp atrás';
        p.titulo = `${sit.limpers} limper(s) na sua frente`;
        p.explicacao = `Limpers costumam ter mãos médias e jogam mal depois do flop. Aumente (iso-raise) para ${p.ateBB} bb com as mãos fortes ` +
          `para isolar e jogar em posição; mãos especulativas podem entrar pagando barato.` + (limpersStation ? ' Um dos limpers é calling station: isole mais largo para valor.' : '');
        break;
      }
      case 'bb_opcao': {
        p.raise = R.bbContraLimp();
        p.ateBB = 3 + sit.limpers;
        p.nomeRaise = 'Aumentar';
        p.nomeCall = 'Check';
        p.titulo = 'Limp até você no big blind';
        p.explicacao = `Ninguém aumentou: você vê o flop de graça. Aumente só com mãos fortes (para ${p.ateBB} bb); o resto dá check.`;
        break;
      }
      case 'vs_open': {
        const grupo = R.grupoAgressor(sit.atrasDoAgressor, hu);
        const resp = R.respostaAoRaise(grupo, sit.lugar);
        const f = fatorVsPerfil(perfilAg);
        const tamanhoBB = sit.tamanhoUltimo / bb;
        const aperto = Math.min(1, 3 / Math.max(2, tamanhoBB));
        const squeeze = sit.chamadores > 0;
        p.raise = R.ajustarRange(resp.tresBet, f.tres * (squeeze ? 0.7 : 1));
        p.call = R.ajustarRange(R.menos(resp.call, p.raise), f.call * aperto * (squeeze ? 0.8 : 1));
        const ip = sit.lugar === 'ip';
        p.ateBB = (vista.apostaAtual * (ip ? 3 : 4) + sit.chamadores * vista.apostaAtual) / bb;
        p.nomeRaise = squeeze ? 'Squeeze (3-bet)' : '3-bet';
        p.titulo = `${nomeAg} abriu do ${posAg} para ${num(tamanhoBB)} bb`;
        p.explicacao = `Contra abertura ${grupo === 'cedo' ? 'de posição inicial (range forte)' : grupo === 'meio' ? 'de posição intermediária' : 'de posição final (range largo)'}` +
          `${perfilAg && perfilAg !== 'desconhecido' ? ' de um ' + NOME_PERFIL[perfilAg] : ''}: 3-bet com ${num(R.percentual(p.raise))}% e pague com ` +
          `${num(R.percentual(p.call))}%.` + (ip ? ' Você terá posição depois do flop, o que permite pagar mais.' : ' Fora de posição, prefira 3-bet ou fold a pagar.') +
          (squeeze ? ` Há ${sit.chamadores} caller(s): o squeeze precisa ser maior e mais forte.` : '') +
          (tamanhoBB > 4 ? ' O raise foi grande: pague menos.' : '');
        break;
      }
      case 'vs_3bet': {
        const largo = sit.atrasDoAgressor <= 2 || perfilAg === 'lag' || perfilAg === 'maniaco';
        const ip = !eu.sb && !eu.bb;
        const r3 = R.respostaA3bet(largo, ip);
        p.raise = r3.quatroBet;
        p.call = R.menos(r3.call, p.raise);
        p.ateBB = vista.apostaAtual * 2.3 / bb;
        if (p.ateBB * bb >= tot * 0.4) { p.allin = true; p.nomeRaise = '4-bet all-in'; } else p.nomeRaise = '4-bet';
        p.titulo = `Você abriu e ${nomeAg} deu 3-bet`;
        p.explicacao = `O 3-bet de ${nomeAg}${perfilAg && perfilAg !== 'desconhecido' ? ' (' + NOME_PERFIL[perfilAg] + ')' : ''} ` +
          `${largo ? 'vem de um range largo (posição final ou jogador agressivo): defenda mais' : 'costuma ser forte: defenda pouco'}. ` +
          `4-bet com as melhores mãos (e alguns blefes com A5s) e pague ${ip ? 'em posição' : 'fora de posição, com menos mãos'}.`;
        break;
      }
      case 'vs_3bet_frio': {
        p.raise = R.parse('QQ+, AKs, AKo');
        p.call = R.parse('JJ-TT, AQs');
        p.allin = true;
        p.nomeRaise = '4-bet (all-in)';
        p.titulo = 'Raise e 3-bet antes de você (cold 4-bet)';
        p.explicacao = 'Dois jogadores já mostraram força. Só continue com mãos premium; pagar "a frio" com mãos médias é um vazamento clássico.';
        break;
      }
      case 'vs_4bet':
      case 'vs_4bet_frio': {
        const r4 = R.respostaA4bet();
        p.raise = r4.allin;
        p.call = sit.efetivoBB > 60 ? r4.call : {};
        p.allin = true;
        p.nomeRaise = 'All-in (5-bet)';
        p.titulo = `${nomeAg} deu 4-bet`;
        p.explicacao = 'Um 4-bet é muito forte na maioria dos jogadores. Continue com QQ+ e AK; o resto sai.';
        break;
      }
      case 'vs_shove': {
        const f = fatorVsPerfil(perfilAg);
        p.call = R.ajustarRange(sit.efetivoBB <= 25 ? R.callShoveRange(sit.efetivoBB, sit.atrasDoAgressor, hu) : R.parse('QQ+, AKs, AKo'), f.call);
        p.nomeCall = 'Pagar o all-in';
        p.titulo = `${nomeAg} foi all-in`;
        p.explicacao = `Contra all-in, a única pergunta é: minha equity contra o range dele paga o preço? ` +
          `${perfilAg && perfilAg !== 'desconhecido' ? 'Ele é ' + NOME_PERFIL[perfilAg] + ': ajuste o range dele. ' : ''}Veja a equity calculada abaixo.`;
        break;
      }
    }
    return p;
  }

  function celulasGrade(plano) {
    const cel = {};
    R.todasClasses().forEach(c => {
      const wr = plano.raise[c] || 0, wc = plano.call[c] || 0;
      if (wr >= 0.75) cel[c] = 'raise';
      else if (wc >= 0.75) cel[c] = 'call';
      else if (wr > 0 && wc > 0) cel[c] = 'misto';
      else if (wr > 0) cel[c] = 'raise-misto';
      else if (wc > 0) cel[c] = 'call-misto';
      else cel[c] = 'fold';
    });
    return cel;
  }

  /** Distância (em % das mãos) entre a classe e a borda do range. Positivo = dentro. */
  function margemNoRange(classe, mapa) {
    let pior = 0;
    for (const c in mapa) if (mapa[c] > 0) pior = Math.max(pior, R.percentilClasse(c));
    return pior - R.percentilClasse(classe);
  }

  function analisePreflop(vista, assento, ctx) {
    const eu = An.jogadorDa(vista, assento);
    const sit = An.situacaoPreflop(vista, assento);
    const classe = R.classeDaMao(eu.cartas[0], eu.cartas[1]);
    const plano = planoPreflop(vista, sit, eu, ctx);
    const bb = vista.blinds.bb;
    const v = vista.acoes || { podeCheck: sit.paraPagar === 0, podeApostar: true };
    const wR = plano.raise[classe] || 0, wC = plano.call[classe] || 0;

    let acao, ate = 0, misto = false;
    if (wR > 0 && wR >= wC && wR >= 0.5) {
      acao = plano.allin ? 'allin' : 'raise';
      ate = plano.allin ? eu.fichas + eu.apostaRua : Math.round(plano.ateBB * bb);
      misto = wR < 0.75;
    } else if (wC >= 0.5) {
      acao = v.podeCheck ? 'check' : 'call';
      misto = wC < 0.75;
    } else {
      acao = v.podeCheck ? 'check' : 'fold';
      misto = wR > 0 || wC > 0;
    }
    if (acao === 'raise' && ate >= (eu.fichas + eu.apostaRua) * 0.45) { acao = 'allin'; ate = eu.fichas + eu.apostaRua; }
    if (acao === 'raise' && v.podeApostar === false) acao = v.podeCheck ? 'check' : 'call';

    const pctl = R.percentilClasse(classe);
    const forcaTxt = pctl <= 50 ? `está entre as ${num(pctl, 0)}% melhores mãos iniciais` : `é mais fraca que ${num(pctl, 0)}% das mãos iniciais`;
    const passos = [
      `${classe} (${R.categoria(classe)}): ${forcaTxt}.`,
      plano.titulo + '.',
      textoDecisaoPre(acao, ate, bb, classe, plano, misto, ctx)
    ];
    return { sit, classe, plano, acao, ate, misto, wR, wC, passos, grade: celulasGrade(plano), percentil: pctl };
  }

  function textoDecisaoPre(acao, ate, bb, classe, plano, misto, ctx) {
    const fmt = ctx.fmtBB || (x => num(x / bb) + ' bb');
    const dentro = acao === 'raise' || acao === 'allin' ? `${classe} está no range de "${plano.nomeRaise}"` :
      acao === 'call' ? `${classe} está no range de "${plano.nomeCall}"` :
        acao === 'check' ? `${classe} não é forte o bastante para aumentar` : `${classe} está fora do range`;
    const fim = acao === 'raise' ? `aumente para ${fmt(ate)}` : acao === 'allin' ? 'vá all-in' : acao === 'call' ? 'pague' : acao === 'check' ? 'dê check' : 'fold';
    return `${dentro} → ${fim}.` + (misto ? ' (Mão de fronteira: as duas opções são aceitáveis.)' : '');
  }

  // ======================================================================
  // PÓS-FLOP: modelo de EV simplificado
  // ======================================================================
  // Quanto cada perfil "gruda" no pote: multiplica a MDF teórica.
  const TEIMOSIA = { station: 1.6, maniaco: 1.3, lag: 1.1, tag: 1, nit: 0.75, desconhecido: 1 };

  /**
   * Fold equity: o vilão defende ≈ MDF × teimosia do perfil.
   * MDF = 1 / (1 + aposta/pote). Contra raise (ele já apostou) defende mais.
   * Com vários oponentes, todos precisam foldar.
   */
  function foldEquity(fracao, perfisOps, ehRaise, rua) {
    let fe = 1;
    perfisOps.forEach(perfil => {
      let defende = (TEIMOSIA[perfil] || 1) / (1 + Math.max(0.05, fracao));
      if (ehRaise) defende *= 1.3;
      if (rua === 'river') defende *= 0.95;
      fe *= 1 - Math.max(0.02, Math.min(0.98, defende));
    });
    return fe;
  }

  /**
   * Equity quando a aposta é paga: quem paga é a parte forte do range.
   * Supõe que, contra as mãos que foldam, a sua equity seria min(1, eq + 0,4).
   */
  function eqQuandoPago(eq, fe) {
    const q = Math.max(0.05, 1 - fe);
    return Math.max(0.02, Math.min(eq, (eq - fe * Math.min(1, eq + 0.4)) / q));
  }

  /** Lista de opções com EV estimado (em fichas, relativo a foldar agora). */
  function opcoesEV(m) {
    const ops = [];
    const real = m.ip ? 1 : 0.92;
    const potOk = Math.max(1, m.pote);
    if (m.paraPagar === 0) {
      ops.push({ acao: 'check', ate: 0, ev: m.eq * m.pote * real });
      if (m.podeApostar) {
        [0.33, 0.5, 0.66, 1].forEach(fr => {
          const B = Math.min(m.maxAte, Math.max(m.minAte, Math.round(m.pote * fr)));
          ops.push(evAposta(m, B, 'bet'));
        });
        if (m.maxAte <= m.pote * 1.6) ops.push(evAposta(m, m.maxAte, 'allin'));
      }
    } else {
      ops.push({ acao: 'fold', ate: 0, ev: 0 });
      const implicita = m.rua !== 'river' && m.probProxima ? m.probProxima * Math.min(m.efetivoRestante, m.pote) * 0.3 : 0;
      ops.push({ acao: 'call', ate: 0, ev: m.eq * real * (m.pote + m.paraPagar) - m.paraPagar + implicita, implicita });
      if (m.podeApostar) {
        [2.5, 3.2].forEach(mult => {
          const Rt = Math.min(m.maxAte, Math.max(m.minAte, Math.round(m.apostaAtual * mult + (m.pote - m.apostaAtual) * 0.1)));
          ops.push(evAposta(m, Rt, 'raise'));
        });
        if (m.maxAte > m.minAte) ops.push(evAposta(m, m.maxAte, 'allin'));
      }
    }
    // remove duplicados (mesmo tamanho)
    const vistos = {};
    return ops.filter(o => { const k = o.acao + ':' + o.ate; if (vistos[k]) return false; vistos[k] = 1; return true; })
      .map(o => Object.assign(o, { evBB: o.ev / m.bb, rel: o.ev / potOk }));
  }

  /** EV de apostar/aumentar até "ate" (total na rua). */
  function evAposta(m, ate, rotulo) {
    const adicional = ate - m.minhaApostaRua;
    const vilaoPoe = Math.max(0, ate - m.apostaAtual);
    const fracao = vilaoPoe / Math.max(1, m.pote);
    const fe = foldEquity(fracao, m.perfisOps, m.paraPagar > 0, m.rua);
    const eqc = eqQuandoPago(m.eq, fe);
    const ev = fe * m.pote + (1 - fe) * (eqc * (m.pote + adicional + vilaoPoe) - adicional);
    return { acao: ate >= m.maxAte ? 'allin' : rotulo, ate, ev, fe };
  }

  function escolherMelhor(ops) {
    let melhor = ops[0];
    ops.forEach(o => {
      // prefere a opção mais simples quando a diferença é mínima
      const margem = (o.acao === 'check' || o.acao === 'call' || o.acao === 'fold') ? 0 : 0.02 * Math.abs(melhor.ev || 1);
      if (o.ev > melhor.ev + margem) melhor = o;
    });
    return melhor;
  }

  /** SPR do flop: stack efetivo no começo do flop ÷ pote do flop. */
  function sprDoFlop(vista, assento) {
    const evFlop = vista.eventos.find(e => e.tipo === 'rua' && e.rua === 'flop');
    if (!evFlop) return null;
    const gastoPos = {};
    vista.eventos.forEach(e => {
      if (e.tipo === 'acao' && e.rua !== 'preflop' && e.valor) gastoPos[e.assento] = (gastoPos[e.assento] || 0) + e.valor;
    });
    const stackFlop = j => j.fichas + (gastoPos[j.assento] || 0);
    const eu = An.jogadorDa(vista, assento);
    let maior = 0;
    vista.jogadores.forEach(j => { if (j.assento !== assento && !j.foldou) maior = Math.max(maior, stackFlop(j)); });
    const efetivo = Math.min(stackFlop(eu), maior);
    return { spr: efetivo / Math.max(1, evFlop.pote), efetivo, pote: evFlop.pote };
  }

  // ======================================================================
  // TORNEIO: M, zonas e ICM
  // ======================================================================
  function infoTorneio(vista, assento, ctx) {
    const t = ctx.torneio;
    if (!t) return null;
    const b = vista.blinds;
    const n = vista.jogadores.length;
    const custoRodada = b.sb + b.bb + (b.anteBB ? b.ante : b.ante * n);
    const eu = An.jogadorDa(vista, assento);
    const meuStack = eu.fichasIniciais;
    const M = meuStack / custoRodada;
    const zona = M >= 20 ? { nome: 'verde', texto: 'Zona verde (M ≥ 20): jogo normal, todas as jogadas disponíveis.' } :
      M >= 10 ? { nome: 'amarela', texto: 'Zona amarela (M 10–20): menos mãos especulativas; prefira aumentar a pagar.' } :
        M >= 6 ? { nome: 'laranja', texto: 'Zona laranja (M 6–10): pense em all-in ou fold, especialmente sem ninguém na frente.' } :
          M >= 1 ? { nome: 'vermelha', texto: 'Zona vermelha (M 1–5): só push/fold. Cada órbita custa caro: escolha a melhor chance e vá all-in.' } :
            { nome: 'morta', texto: 'Zona morta (M < 1): você precisa dobrar já; qualquer mão razoável serve.' };
    const r = { M, custoRodada, zona, restantes: t.restantes, pagos: t.pagos, bolha: false, icm: null };
    const falta = t.restantes - t.pagos;
    r.bolha = falta > 0 && falta <= Math.max(2, Math.ceil(t.pagos * 0.2));
    r.itm = falta <= 0;
    if (t.premios && t.premios.length && t.restantes <= 30) {
      const stacksMesa = vista.jogadores.map(j => j.fichasIniciais);
      const fora = t.stacksFora || [];
      const todos = stacksMesa.concat(fora);
      const iHeroi = vista.jogadores.findIndex(j => j.assento === assento);
      const eqs = P.ICM.equities(todos, t.premios);
      const pool = t.premios.reduce((s, x) => s + x, 0);
      const totalFichas = todos.reduce((s, x) => s + x, 0);
      r.icm = {
        valor: eqs[iHeroi], pctPool: eqs[iHeroi] / pool, pctFichas: todos[iHeroi] / totalFichas,
        stacks: todos, iHeroi, premios: t.premios
      };
    }
    return r;
  }

  // ======================================================================
  // ANÁLISE COMPLETA (assíncrona por causa do Monte Carlo)
  // ======================================================================
  let tokenAtual = 0;
  let controleMC = null;

  function cancelar() {
    tokenAtual++;
    if (controleMC) { controleMC.cancelar(); controleMC = null; }
  }

  /**
   * Analisa a situação do herói.
   * ctx: { perfis: {assento: perfil}, modo, nivel, torneio, iteracoes, fmt(valor), fmtBB(valor) }
   * aoProgresso(analiseParcial) é chamado durante o Monte Carlo.
   */
  function analisar(vista, assento, ctx, aoProgresso) {
    cancelar();
    const meuToken = tokenAtual;
    const eu = An.jogadorDa(vista, assento);
    const bb = vista.blinds.bb;
    const v = vista.acoes || {
      podeCheck: vista.apostaAtual <= eu.apostaRua, valorCall: Math.max(0, Math.min(eu.fichas, vista.apostaAtual - eu.apostaRua)),
      podeApostar: false, minAte: 0, maxAte: eu.fichas + eu.apostaRua, apostaAtual: vista.apostaAtual
    };
    const oponentes = vista.jogadores.filter(j => j.assento !== assento && !j.foldou);
    const perfis = ctx.perfis || {};
    let maiorOp = 0;
    oponentes.forEach(o => { maiorOp = Math.max(maiorOp, o.fichas + o.apostaRua); });
    const efetivo = Math.min(eu.fichas + eu.apostaRua, maiorOp);

    const an = {
      token: meuToken, rua: vista.rua, assento, bb, cartas: eu.cartas.slice(), board: vista.board.slice(),
      classe: R.classeDaMao(eu.cartas[0], eu.cartas[1]), posicao: eu.posicao,
      efetivo, efetivoBB: efetivo / bb, pote: vista.pote, paraPagar: v.valorCall || 0,
      podeCheck: v.podeCheck, apostaAtual: vista.apostaAtual,
      oponentes: oponentes.map(o => ({ assento: o.assento, nome: o.nome, perfil: perfis[o.assento] || 'desconhecido', posicao: o.posicao })),
      torneio: infoTorneio(vista, assento, ctx),
      preflop: null, posflop: null, equity: null, passos: [], recomendacao: null, opcoes: null, pronto: false
    };
    an.categoria = R.categoria(an.classe);

    if (vista.rua === 'preflop') {
      const pf = analisePreflop(vista, assento, ctx);
      an.preflop = pf;
      an.passos = pf.passos;
      an.recomendacao = { acao: pf.acao, ate: pf.ate, misto: pf.misto };
      an.equityPreflop = R.EQ_PREFLOP[an.classe];
      // ICM contra all-in
      if (an.torneio && an.torneio.icm && (pf.sit.tipo === 'vs_shove' || pf.sit.agressorAllin)) {
        const iVil = vista.jogadores.findIndex(j => j.assento === pf.sit.agressor);
        const vil = vista.jogadores[iVil];
        try {
          an.torneio.decisao = P.ICM.decisaoAllin({
            stacks: an.torneio.icm.stacks.map((s, i) => i < vista.jogadores.length ? vista.jogadores[i].fichas : s),
            premios: an.torneio.icm.premios, heroi: an.torneio.icm.iHeroi, vilao: iVil,
            inicioHeroi: eu.fichasIniciais, inicioVilao: vil.fichasIniciais,
            investidoHeroi: eu.investido, morto: vista.pote - eu.investido - vil.investido
          });
        } catch (e) { an.torneio.decisao = null; }
      }
      // equity contra o range do agressor (quando há agressão)
      if (pf.sit.agressor !== null) {
        const perfilAg = perfis[pf.sit.agressor] || 'desconhecido';
        const rangeAg = An.rangePreflopDe(vista, pf.sit.agressor, perfilAg);
        return rodarEquity(an, [{ combos: R.paraCombos(rangeAg, marcadas(eu.cartas)) }], [], ctx, aoProgresso, meuToken, () => {
          if (an.torneio && an.torneio.decisao && an.equity) {
            const d = an.torneio.decisao;
            const precisa = an.torneio.bolha || an.torneio.itm ? d.necessariaICM : d.necessariaFichas;
            if (pf.sit.agressorAllin || pf.sit.tipo === 'vs_shove') {
              const acao = an.equity.valor >= precisa ? 'call' : 'fold';
              if (acao !== an.recomendacao.acao && (an.recomendacao.acao === 'call' || an.recomendacao.acao === 'fold')) {
                an.recomendacao = { acao, ate: 0, misto: Math.abs(an.equity.valor - precisa) < 0.03, porICM: true };
              }
              an.passos[2] = `Equity ${pct(an.equity.valor)} contra o range de all-in; precisa de ${pct(precisa)} ` +
                `(${an.torneio.bolha || an.torneio.itm ? 'ICM' : 'fichas'}) → ${acao === 'call' ? 'pague' : 'fold'}.`;
            }
          }
        });
      }
      an.pronto = true;
      return Promise.resolve(an);
    }

    // ---------------------------------------------------------- pós-flop
    const hole = eu.cartas, board = vista.board;
    const mao = An.classificarMao(hole, board);
    const forca = An.forcaAtual(hole, board);
    const outs = An.outs(hole, board);
    const tex = An.textura(board);
    const probs = board.length < 5 ? An.probabilidades(outs.limpos, board.length) : null;
    const probsEf = board.length < 5 ? An.probabilidades(outs.efetivos, board.length) : null;
    const spr = sprDoFlop(vista, assento);
    const conhecidas = hole.concat(board);
    const ranges = oponentes.map(o => An.rangeEstimado(vista, o.assento, perfis[o.assento] || 'desconhecido', conhecidas));

    const ordemPos = An.ordemPosflop(vista).filter(s => s === assento || oponentes.some(o => o.assento === s));
    const ip = ordemPos[ordemPos.length - 1] === assento;

    an.posflop = { mao, forca, outs, tex, probs, probsEf, spr, ip, ranges: ranges.map(r => ({ percentualPreflop: r.percentualPreflop, combos: r.combosEfetivos })) };
    if (an.paraPagar > 0) {
      const potAntes = vista.pote - an.paraPagar;
      an.posflop.potOdds = {
        razao: vista.pote / an.paraPagar,
        necessaria: an.paraPagar / (vista.pote + an.paraPagar),
        mdf: potAntes / Math.max(1, potAntes + an.paraPagar),
        alfa: an.paraPagar / Math.max(1, potAntes + an.paraPagar)
      };
    }
    an.posflop.tamanhos = [1 / 3, 1 / 2, 2 / 3, 1, 2].map(f => ({ fracao: f, alfa: f / (1 + f), mdf: 1 / (1 + f), necessariaVilao: f / (1 + 2 * f) }));

    const modelo = {
      eq: forca.hs, pote: vista.pote, paraPagar: an.paraPagar, apostaAtual: vista.apostaAtual, minhaApostaRua: eu.apostaRua,
      podeApostar: !!v.podeApostar, minAte: v.minAte || 0, maxAte: v.maxAte || (eu.fichas + eu.apostaRua),
      perfisOps: an.oponentes.map(o => o.perfil), rua: vista.rua, ip, bb,
      efetivoRestante: Math.max(0, efetivo - eu.apostaRua - an.paraPagar),
      probProxima: probsEf ? probsEf.exatoProxima : 0
    };
    an.modelo = modelo;

    const finalizar = () => {
      modelo.eq = an.equity ? an.equity.valor : forca.hs;
      an.opcoes = opcoesEV(modelo);
      const melhor = escolherMelhor(an.opcoes);
      an.recomendacao = { acao: melhor.acao, ate: melhor.ate, ev: melhor.ev };
      if (an.paraPagar > 0) {
        const call = an.opcoes.find(o => o.acao === 'call');
        an.posflop.evCall = call ? call.ev : null;
        an.posflop.implicita = call ? call.implicita : 0;
        if (probsEf && an.paraPagar > 0 && probsEf.exatoProxima > 0) {
          const X = an.paraPagar / probsEf.exatoProxima - (vista.pote + an.paraPagar);
          an.posflop.implied = { precisaGanhar: Math.max(0, X), restante: modelo.efetivoRestante, viavel: X <= modelo.efetivoRestante * 0.5 };
        }
      }
      an.passos = passosPosflop(an, ctx);
    };

    return rodarEquity(an, ranges.map(r => ({ combos: r.combos })), board, ctx, aoProgresso, meuToken, finalizar);
  }

  function marcadas(cartas) {
    const m = new Uint8Array(52);
    cartas.forEach(c => { m[c] = 1; });
    return m;
  }

  function rodarEquity(an, viloes, board, ctx, aoProgresso, token, aoFim) {
    return new Promise(resolve => {
      const terminar = () => {
        if (token !== tokenAtual) return;
        try { aoFim && aoFim(); } catch (e) { /* mantém o que já foi calculado */ }
        an.pronto = true;
        resolve(an);
      };
      if (!viloes.length) { terminar(); return; }
      try {
        controleMC = P.Equity.monteCarlo({
          jogadores: [an.cartas].concat(viloes),
          board,
          iteracoes: ctx.iteracoes || 10000,
          aoProgresso: (f, r) => {
            if (token !== tokenAtual) return;
            an.equity = { valor: r.equity[0], iteracoes: r.iteracoes, erro: r.erroPadrao[0], parcial: true };
            if (aoProgresso) aoProgresso(an);
          },
          aoTerminar: r => {
            controleMC = null;
            an.equity = { valor: r.equity[0], iteracoes: r.iteracoes, erro: r.erroPadrao[0], parcial: false };
            terminar();
          },
          aoErro: () => { controleMC = null; terminar(); }
        });
      } catch (e) { terminar(); }
    });
  }

  function passosPosflop(an, ctx) {
    const pf = an.posflop, fmt = ctx.fmt || (x => String(x));
    const eq = an.equity ? an.equity.valor : pf.forca.hs;
    const viloes = an.oponentes.map(o => `${o.nome} (${NOME_PERFIL[o.perfil] || o.perfil})`).join(', ');
    const draws = pf.outs.draws.length ? ' + ' + pf.outs.draws.join(', ').toLowerCase() : '';
    const p1 = `Sua mão: ${pf.mao.rotulo.toLowerCase()}${draws}. Equity ≈ ${pct(eq)} contra o range estimado de ${viloes}.`;
    const rec = an.recomendacao;
    if (an.paraPagar > 0) {
      const po = pf.potOdds;
      const p2 = `Pot odds: pagar ${fmt(an.paraPagar)} para ganhar ${fmt(an.pote)} (${num(po.razao)}:1) → precisa de ${pct(po.necessaria, 1)} de equity.`;
      const evc = pf.evCall !== null && pf.evCall !== undefined ? pf.evCall : 0;
      let p3 = `${pct(eq)} ${eq >= po.necessaria ? '>' : '<'} ${pct(po.necessaria, 1)} → call tem EV ${evc >= 0 ? '+' : ''}${num(evc / an.bb)} bb. `;
      p3 += `Melhor opção: ${descreverAcao(rec, ctx)}.`;
      return [p1, p2, p3];
    }
    const p2 = `Board ${pf.tex.tipo}: ${pf.tex.notas[0].split(':')[1] ? pf.tex.notas[0].split(':')[1].trim() : pf.tex.notas[0]}`;
    let p3;
    const acaoTxt = descreverAcao(rec, ctx);
    const Acao = acaoTxt.charAt(0).toUpperCase() + acaoTxt.slice(1);
    if (rec.acao === 'check') p3 = eq >= 0.5 ? 'Check: mão de showdown, controle o tamanho do pote.' : 'Check: pouca equity e pouca fold equity — não jogue dinheiro fora.';
    else if (eq >= 0.6) p3 = `${Acao} para valor: você está na frente do range e quer ser pago.`;
    else if (eq >= 0.45) p3 = `${Acao} como valor fino e proteção: você ganha de boa parte do range e cobra das cartas que podem te passar.`;
    else if (pf.outs.efetivos >= 6) p3 = `${Acao} como semi-blefe: ${num(pf.outs.efetivos, 1)} outs + fold equity.`;
    else p3 = `${Acao} como blefe: o vilão desiste o bastante para a aposta se pagar.`;
    return [p1, p2, p3];
  }

  function descreverAcao(rec, ctx) {
    if (!rec) return '';
    const fmt = ctx.fmt || (x => String(x));
    switch (rec.acao) {
      case 'bet': return `aposte ${fmt(rec.ate)}`;
      case 'raise': return `aumente para ${fmt(rec.ate)}`;
      case 'allin': return 'all-in';
      case 'call': return 'pague';
      case 'check': return 'check';
      default: return 'fold';
    }
  }

  // ======================================================================
  // NOTA DA DECISÃO
  // ======================================================================
  const NOTAS = [
    { id: 'otima', nome: 'Ótima' }, { id: 'boa', nome: 'Boa' }, { id: 'imprecisa', nome: 'Imprecisa' },
    { id: 'erro', nome: 'Erro' }, { id: 'grave', nome: 'Erro grave' }
  ];

  function familia(acao) {
    const t = typeof acao === 'string' ? acao : acao.tipo;
    if (t === 'bet' || t === 'raise') return 'agressao';
    if (t === 'allin') return 'agressao';
    if (t === 'call') return 'call';
    if (t === 'check') return 'check';
    return 'fold';
  }

  /**
   * Compara a ação do herói com a recomendada.
   * acaoReal: { tipo, ate, allinDeFato } (como foi registrada pelo motor)
   */
  function avaliarDecisao(an, acaoReal) {
    if (!an || !an.recomendacao) return null;
    const bb = an.bb;
    const famH = familia(acaoReal), famR = familia(an.recomendacao.acao);
    let perdaBB = 0, motivo = '', categoria = null;

    if (an.rua === 'preflop') {
      const pf = an.preflop, plano = pf.plano;
      const mR = margemNoRange(an.classe, plano.raise), mC = margemNoRange(an.classe, R.uniao(plano.raise, plano.call));
      const top = pf.percentil;
      const paraPagarBB = an.paraPagar / bb;
      if (famH === famR || (famH === 'check' && famR === 'fold') || (famH === 'call' && famR === 'check')) {
        perdaBB = 0;
        if (famH === 'agressao' && acaoReal.ate && an.recomendacao.ate && famR === 'agressao') {
          const rel = acaoReal.ate / an.recomendacao.ate;
          if (rel > 1.8 || rel < 0.6) { perdaBB = 0.3; motivo = 'Tamanho fora do padrão: '; categoria = 'tamanho'; }
        }
        motivo += 'Seguiu o range recomendado.';
      } else if (famR === 'agressao' && famH === 'fold') {
        // quanto mais forte a mão e maior o pote, mais caro é largar
        const escala = Math.max(1, an.pote / bb / 3);
        perdaBB = (0.3 + 0.08 * Math.max(0, mR)) * escala + (top <= 3 ? 4 : top <= 6 ? 2 : top <= 10 ? 1 : 0);
        motivo = `Foldou ${an.classe}, que está no range de "${plano.nomeRaise}".`;
        categoria = plano.pushFold ? 'pre_pushfold' : 'pre_foldou_range';
      } else if (famR === 'agressao' && (famH === 'call' || famH === 'check')) {
        perdaBB = Math.min(1.5, 0.4 + 0.02 * Math.max(0, mR));
        motivo = `Passivo demais: ${an.classe} pede "${plano.nomeRaise}".`;
        categoria = 'pre_passivo';
      } else if ((famR === 'call' || famR === 'check') && famH === 'fold') {
        perdaBB = Math.min(3, 0.2 + 0.05 * Math.max(0, mC));
        motivo = `Foldou uma mão que tinha preço para continuar.`;
        categoria = 'pre_foldou_forte';
      } else if ((famR === 'call' || famR === 'check') && famH === 'agressao') {
        perdaBB = Math.min(4, 0.5 + 0.03 * Math.max(0, -mR));
        motivo = `${an.classe} não está no range de "${plano.nomeRaise}".`;
        categoria = 'pre_abriu_fora';
      } else if (famR === 'fold' && famH === 'call') {
        const d = Math.max(0, -mC);
        perdaBB = Math.max(0.15, paraPagarBB * Math.min(0.6, 0.02 * d + 0.1));
        motivo = `${an.classe} está fora do range para continuar.`;
        categoria = 'pre_pagou_fraco';
      } else if (famR === 'fold' && famH === 'agressao') {
        const d = Math.max(0, -mR);
        perdaBB = Math.min(8, 0.5 + 0.05 * d + (acaoReal.ate ? 0.1 * acaoReal.ate / bb : 0));
        motivo = `${an.classe} está fora do range de "${plano.nomeRaise}".`;
        categoria = plano.pushFold ? 'pre_pushfold' : 'pre_abriu_fora';
      } else {
        perdaBB = 0.3;
        motivo = 'Linha diferente da recomendada.';
      }
      if (an.recomendacao.misto && perdaBB > 0) { perdaBB = Math.min(perdaBB, 0.3); motivo += ' (mão de fronteira: desvio pequeno)'; }
    } else {
      const ops = an.opcoes || [];
      const melhor = ops.reduce((a, b) => (b.ev > a.ev ? b : a), ops[0]);
      let minha;
      if (famH === 'fold') minha = ops.find(o => o.acao === 'fold') || { ev: 0 };
      else if (famH === 'check') minha = ops.find(o => o.acao === 'check');
      else if (famH === 'call') minha = ops.find(o => o.acao === 'call');
      else minha = evAposta(an.modelo, acaoReal.ate || an.modelo.maxAte, acaoReal.tipo);
      if (!minha) minha = { ev: melhor.ev };
      perdaBB = Math.max(0, (melhor.ev - minha.ev) / bb);
      const eq = an.equity ? an.equity.valor : an.posflop.forca.hs;
      if (perdaBB > 0.01) {
        if (famH === 'call' && an.posflop.potOdds && eq < an.posflop.potOdds.necessaria) { categoria = 'pos_call_sem_odds'; motivo = `Pagou com ${pct(eq)} de equity quando precisava de ${pct(an.posflop.potOdds.necessaria)}.`; }
        else if (famH === 'fold' && an.posflop.potOdds && eq >= an.posflop.potOdds.necessaria) { categoria = 'pos_fold_com_odds'; motivo = `Foldou com ${pct(eq)} de equity; o preço pedia só ${pct(an.posflop.potOdds.necessaria)}.`; }
        else if (famH === 'check' && familia(melhor.acao) === 'agressao' && eq >= 0.6) { categoria = 'pos_perdeu_valor'; motivo = 'Deu check com mão forte: deixou de cobrar valor.'; }
        else if (famH === 'agressao' && eq < 0.4 && familia(melhor.acao) !== 'agressao') { categoria = 'pos_blefe_ruim'; motivo = 'Apostou sem equity e sem fold equity suficiente contra esse vilão.'; }
        else if (famH === 'agressao' && familia(melhor.acao) === 'agressao') { categoria = 'pos_tamanho'; motivo = 'A ideia era apostar, mas o tamanho escolhido rende menos.'; }
        else if (famH === 'fold') { categoria = 'pos_fold_com_odds'; motivo = 'Desistiu de uma mão com valor.'; }
        else { categoria = 'pos_linha'; motivo = 'Linha menos lucrativa que a recomendada.'; }
      } else motivo = 'Escolheu a opção de maior EV (ou empatada).';
    }

    const potBB = Math.max(2, an.pote / bb);
    const rel = perdaBB / potBB;
    let nota;
    if (perdaBB <= 0.15 || (an.rua !== 'preflop' && rel < 0.03)) nota = 'otima';
    else if (perdaBB <= 0.5 || rel < 0.08) nota = 'boa';
    else if (perdaBB <= 1.5 || rel < 0.18) nota = 'imprecisa';
    else if (perdaBB <= 4 || rel < 0.4) nota = 'erro';
    else nota = 'grave';
    if (nota === 'otima' || nota === 'boa') categoria = null;
    return {
      nota, nomeNota: NOTAS.find(n => n.id === nota).nome, perdaBB, perdaFichas: perdaBB * bb,
      motivo, categoria, rua: an.rua, recomendada: an.recomendacao, acao: acaoReal
    };
  }

  const NOMES_ERRO = {
    pre_abriu_fora: 'Entrou no pote com mão fora do range',
    pre_foldou_range: 'Foldou mão do range de abertura',
    pre_pagou_fraco: 'Pagou raise com mão fraca demais',
    pre_foldou_forte: 'Foldou mão boa contra raise',
    pre_passivo: 'Só pagou quando o certo era aumentar',
    pre_pushfold: 'Erro de push/fold',
    pos_call_sem_odds: 'Pagou sem pot odds',
    pos_fold_com_odds: 'Foldou com equity suficiente',
    pos_perdeu_valor: 'Check com mão forte (perdeu valor)',
    pos_blefe_ruim: 'Blefe sem fold equity',
    pos_tamanho: 'Tamanho de aposta ruim',
    pos_linha: 'Linha menos lucrativa',
    tamanho: 'Tamanho de abertura fora do padrão'
  };

  P.Coach = {
    analisar,
    cancelar,
    avaliarDecisao,
    descreverAcao,
    planoPreflop,
    opcoesEV,
    evAposta,
    foldEquity,
    NOTAS,
    NOMES_ERRO,
    NOME_ACAO,
    NOME_PERFIL
  };
})(window.Poker = window.Poker || {});
