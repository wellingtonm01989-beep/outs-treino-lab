/* ==========================================================================
   OUTS · Treino Lab — cacheta-coach.js
   Coach da cacheta: na compra, se vale pegar a carta do lixo; depois de
   comprar, se dá para bater (com 9 ou com 10, ou se vale esperar a de 10) e
   qual descartar — com a conta em português simples: os seus jogos, quantas
   cartas faltam, quais cartas ajudam (e quantas ainda podem vir), o perigo
   de dar a batida para o próximo. Depois da sua jogada, dá a nota.
   ========================================================================== */
(function (P) {
  'use strict';

  const K = P.Cacheta, R = K.Regras, IA = K.IA;
  const pct = x => Math.round(x * 100) + '%';

  /** Carta em texto colorido (o mesmo desenho dos textos do poker); curinga com estrela. */
  function cartaHtml(id, cur) {
    const t = id % 52;
    const n = (t / 13) | 0;
    return `<span class="carta-txt n-${n}${cur && R.ehCuringa(id, cur) ? ' ca-cur' : ''}">${R.nome(id)}</span>`;
  }
  const tipoHtml = (t, cur) => cartaHtml(t, cur);
  const lista = (ids, cur) => ids.map(id => cartaHtml(id, cur)).join(' ');
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

  /** Os jogos da mão em texto: "3♥ 4♥ 5♥ · 7♠ 7♦ (falta 1)". */
  function jogosHtml(plano, cur) {
    const partes = plano.grupos.filter(g => g.cartas.length > 1 || g.faltam === 0).map(g => {
      const nome = g.tipo === 'trinca' ? 'trinca' : g.tipo === 'seq' ? 'sequência' : 'jogo';
      return `${lista(g.cartas, cur)} <small>(${g.faltam ? (g.faltam === 1 ? 'falta 1' : 'faltam ' + g.faltam) : nome + ' pronta'})</small>`;
    });
    const soltas = plano.soltas.concat(...plano.grupos.filter(g => g.cartas.length <= 1 && g.faltam > 0).map(g => g.cartas));
    if (soltas.length) partes.push(`soltas: ${lista(soltas, cur)}`);
    return partes.join(' · ');
  }
  /** "7♥ (2), 4♠ (1)..." — as cartas que ajudam e quantas cópias ainda podem vir. */
  function ajudamHtml(tipos, disp, cur, max) {
    const l = tipos.slice().sort((a, b) => disp[b] - disp[a]).slice(0, max || 10);
    return l.map(t => `${tipoHtml(t, cur)}<small>×${disp[t]}</small>`).join(' ') + (tipos.length > l.length ? ' …' : '');
  }
  const faltamTxt = d => (d === 0 ? 'as 9 já fecham' : d === 1 ? 'falta <b>1 carta</b> para bater (você está na boa)' : `faltam <b>${d} cartas</b> para bater`);

  // ------------------------------------------------------------- compra
  /** Conselho na hora de comprar. Devolve { tipo: 'comprar', melhor: { de }, opcoes, linhas, resumo }. */
  function conselhoCompra(vista, opts) {
    opts = opts || {};
    const cur = vista.curinga;
    const conh = IA.conhecimento(vista);
    const dc = IA.decidirCompra(vista, { conh });
    const linhas = [];
    const agora = R.faltam(vista.mao, cur, 9, true);
    linhas.push(`Sua mão: ${jogosHtml(agora, cur)} — ${faltamTxt(agora.faltam)}.`);
    const topo = vista.topo;
    let resumo;
    if (topo === null) {
      linhas.unshift('<b>Compre do monte</b> — o lixo ainda está vazio.');
      resumo = 'Compre do monte';
      return { tipo: 'comprar', melhor: { de: 'monte' }, opcoes: [], linhas, resumo, unica: true };
    }
    const c = dc.comLixo;
    const pLixo = c ? c.p : 0;
    if (dc.de === 'lixo') {
      const ganhou = agora.faltam - c.d;
      resumo = `Pegue o ${R.nome(topo)} do lixo`;
      linhas.unshift(`<b>Pegue o ${cartaHtml(topo, cur)} do lixo</b> e descarte ${cartaHtml(c.carta, cur)}: ` +
        (ganhou > 0 ? `você fica a ${plural(c.d, 'carta', 'cartas')} de bater (${ganhou === 1 ? 'uma' : ganhou} a menos)` : `a mão fica mais aberta (${plural(c.U, 'carta ajuda', 'cartas ajudam')}, contra ${dc.agora.U} hoje)`) + '.');
      linhas.push(`Comprando do monte, a chance de vir uma carta que ajuda é de ${pct(conh.total ? dc.agora.U / conh.total : 0)}; com a do lixo é certa.`);
      if (R.ehCuringa(topo, cur)) linhas.push('É um <b>curinga</b>: entra no lugar de qualquer carta. Quase sempre vale pegar.');
    } else {
      resumo = 'Compre do monte';
      const motivo = !c ? 'a carta do lixo não ajuda' : c.d >= agora.faltam ? `o ${cartaHtml(topo, cur)} não diminui o que falta` : 'a carta do lixo ajuda pouco';
      linhas.unshift(`<b>Compre do monte</b>: ${motivo}. No monte, ${plural(dc.agora.U, 'carta ajuda', 'cartas ajudam')} (${pct(conh.total ? dc.agora.U / conh.total : 0)} de chance).`);
      linhas.push('Pegar do lixo mostra a todo mundo o que você está juntando — só vale quando a carta faz diferença.');
    }
    return { tipo: 'comprar', melhor: { de: dc.de }, opcoes: [{ de: 'lixo', p: pLixo }, { de: 'monte', p: dc.pMonte }], linhas, resumo, conta: dc };
  }

  // ------------------------------------------------------------- jogada
  /** Conselho depois de comprar. Devolve { tipo: 'jogar', melhor, opcoes (descartes), linhas, resumo, batidas }. */
  function conselhoJogada(vista, opts) {
    opts = opts || {};
    const cur = vista.curinga;
    const conh = IA.conhecimento(vista);
    const nomes = opts.nomes || vista.vidas.map((_, j) => 'Lugar ' + (j + 1));
    const prox = R.proximoVivo(vista.eu, vista.vivos, vista.n);
    const dj = IA.decidirJogada(vista, { conh, amostras: opts.amostras || 60, esperar10: true });
    const linhas = [];
    let resumo, opcoes = [];
    if (dj.tipo === 'bater' && dj.com === 10) {
      resumo = 'Bata com 10!';
      linhas.push('<b>Bata com 10!</b> As 10 cartas fecham em jogos: cada um dos outros perde <b>2 vidas</b>.');
      linhas.push('Seus jogos: ' + dj.jogos.map(g => lista(g.cartas, cur)).join(' · ') + '.');
      return { tipo: 'jogar', melhor: { tipo: 'bater', com: 10 }, opcoes, linhas, resumo, jogos: dj.jogos };
    }
    if (dj.tipo === 'bater') {
      resumo = `Bata com 9 (descarte o ${R.nome(dj.descarte)})`;
      linhas.push(`<b>Bata!</b> Descarte o ${cartaHtml(dj.descarte, cur)}: as outras 9 fecham em jogos e cada um perde <b>1 vida</b>.`);
      linhas.push('Seus jogos: ' + dj.jogos.map(g => lista(g.cartas, cur)).join(' · ') + '.');
      if (dj.U10) linhas.push(`Dava para esperar a batida de 10 (${plural(dj.U10, 'carta serve', 'cartas servem')} de ponta), mas o risco de alguém bater antes não compensa agora.`);
      return { tipo: 'jogar', melhor: { tipo: 'bater', com: 9, descarte: dj.descarte }, opcoes, linhas, resumo, jogos: dj.jogos };
    }
    if (dj.esperando10) {
      const a = dj.analise;
      resumo = `Espere a de 10: descarte o ${R.nome(dj.carta)}`;
      linhas.push(`<b>Dá para bater com 9, mas vale esperar a de 10.</b> Descarte o ${cartaHtml(dj.carta, cur)} e fique com as 9 fechadas: na próxima, ${plural(a.U10, 'carta faz', 'cartas fazem')} a batida de 10 (${ajudamHtml(a.tipos, conh.disp, cur, 6)}).`);
      linhas.push(`Chance de vir a ponta: ~${pct(a.p10)} · risco de alguém bater antes: ~${pct(a.risco)}. Se não vier, você bate com 9 na próxima do mesmo jeito.`);
      return { tipo: 'jogar', melhor: { tipo: 'descartar', carta: dj.carta, esperando10: true }, opcoes, linhas, resumo, jogos: dj.jogos };
    }
    // descarte
    opcoes = dj.analise;
    const m = opcoes[0];
    const S = vista.mao.filter(y => y !== m.carta);
    const plano = R.faltam(S, cur, 9, true);
    resumo = `Descarte o ${R.nome(m.carta)}`;
    const porque = [];
    const lig = IA.ligacao(m.carta, vista.mao, cur);
    if (lig < 1) porque.push('ele não se liga a nenhuma carta sua');
    else if (lig < 3) porque.push('ele quase não se liga às suas cartas');
    const pior = opcoes.find(o => o.d < m.d || (o.d === m.d && o.p > m.p + 0.01));
    if (pior && pior.perigo > m.perigo) porque.push(`o ${cartaHtml(pior.carta, cur)} seria melhor para a sua mão, mas pode dar a batida para ${nomes[prox]}`);
    linhas.push(`<b>Descarte o ${cartaHtml(m.carta, cur)}</b>${porque.length ? ': ' + porque.join('; ') : ''}.`);
    linhas.push(`Depois dele: ${jogosHtml(plano, cur)} — ${faltamTxt(m.d)}.`);
    if (m.tipos.length) linhas.push(`Cartas que ajudam: ${ajudamHtml(m.tipos, conh.disp, cur, 8)} — ${plural(m.U, 'cópia ainda pode vir', 'cópias ainda podem vir')} (monte ou mão dos outros).`);
    const perigosas = opcoes.filter(o => o.perigo >= 0.12 && o.carta !== m.carta).sort((a, b) => b.perigo - a.perigo).slice(0, 2);
    if (m.perigo >= 0.12) linhas.push(`Atenção: o ${cartaHtml(m.carta, cur)} pode fechar a batida de ${vista.opcoes.furar ? 'alguém' : nomes[prox]} (~${pct(m.perigo)}), mas segurá-lo atrasa mais a sua mão.`);
    if (perigosas.length) {
      const pegou = conh.pegou[prox] && conh.pegou[prox].length ? ` (${nomes[prox]} pegou ${lista(conh.pegou[prox].slice(-3), cur)} do lixo)` : '';
      linhas.push(`Cuidado com ${perigosas.map(o => `${cartaHtml(o.carta, cur)} (~${pct(o.perigo)})`).join(' e ')}: ${perigosas.length > 1 ? 'podem' : 'pode'} fechar a batida de ${vista.opcoes.furar ? 'alguém' : nomes[prox]}${pegou}.`);
    } else if (opcoes.naBoa > 0.25) linhas.push(`${nomes[prox]} pode estar na boa (a 1 carta de bater) — evite descartar o que se liga ao que ele pegou do lixo.`);
    if (R.ehCuringa(m.carta, cur)) linhas.push('Descartar curinga quase nunca compensa — aqui a conta mostra que não há outra saída melhor.');
    return { tipo: 'jogar', melhor: { tipo: 'descartar', carta: m.carta }, opcoes, linhas, resumo, plano };
  }

  /** Conselho para a decisão da vez (compra ou jogada). */
  function conselho(vista, opts) {
    return vista.fase === 'comprar' ? conselhoCompra(vista, opts) : conselhoJogada(vista, opts);
  }

  /** Descrição curta de uma opção de descarte (para as barras do coach). */
  function descreve(o, cur) {
    return `${cartaHtml(o.carta, cur)} <small>${o.d === 0 ? 'fecha' : 'faltam ' + o.d} · ${o.U} ajudam${o.perigo >= 0.05 ? ' · ⚠ ' + pct(o.perigo) : ''}</small>`;
  }

  /**
   * Nota da sua jogada comparada à do coach.
   * acao: { de: 'monte'|'lixo' } na compra; { tipo: 'descartar', carta } ou { tipo: 'bater', com, descarte } depois.
   */
  function avaliar(cons, acao, vista) {
    if (!cons || cons.unica) return null;
    const nota = (perda, txtBom, txtRuim) => {
      let n, r;
      if (perda <= 0.015) { n = 'otima'; r = 'Ótima'; } else if (perda <= 0.04) { n = 'boa'; r = 'Boa'; }
      else if (perda <= 0.1) { n = 'imprecisa'; r = 'Imprecisa'; } else { n = 'erro'; r = 'Erro'; }
      return { nota: n, rotulo: r, texto: n === 'otima' ? txtBom : txtRuim, perda };
    };
    const cur = vista && vista.curinga;
    if (cons.tipo === 'comprar') {
      const m = cons.melhor.de;
      if (acao.de === m) return nota(0, m === 'lixo' ? 'Pegou a carta certa do lixo.' : 'Comprou do monte: a do lixo não valia a pena.', '');
      const pL = cons.opcoes.find(o => o.de === 'lixo').p, pM = cons.opcoes.find(o => o.de === 'monte').p;
      const perda = Math.abs(pL - pM) + 0.01;
      return nota(perda, '', acao.de === 'lixo' ? `Pegar do lixo ajudou pouco (e mostrou o que você junta): ${pct(pL)} contra ${pct(pM)} comprando do monte.` : `A carta do lixo ajudava: com ela ${pct(pL)}, comprando do monte ${pct(pM)}.`);
    }
    const m = cons.melhor;
    if (m.tipo === 'bater') {
      if (acao.tipo === 'bater') {
        if (m.com === 10 && acao.com === 9) return nota(0.12, '', 'Dava para bater com 10 (cada um perderia 2 vidas), não com 9.');
        return nota(0, acao.com === 10 ? 'Bateu com 10!' : 'Bateu na hora certa.', '');
      }
      return nota(0.3, '', `Você podia bater${m.com === 10 ? ' com 10' : ''} e não bateu.`);
    }
    if (acao.tipo === 'bater') return nota(m.esperando10 ? 0.03 : 0, 'Bateu com 9.', 'Bateu com 9 — a conta dizia para esperar a de 10, mas bater é sempre seguro.');
    if (m.esperando10) {
      if (acao.carta % 52 === m.carta % 52) return nota(0, 'Guardou as 9 fechadas esperando a de 10.', '');
      return nota(0.2, '', `Você tinha as 9 fechadas: era bater ou esperar a de 10 descartando o ${R.nome(m.carta)}.`);
    }
    const ops = cons.opcoes || [];
    const minha = ops.find(o => o.carta % 52 === acao.carta % 52 || (cur && R.ehCuringa(o.carta, cur) && R.ehCuringa(acao.carta, cur)));
    const best = ops[0];
    if (!minha || !best) return null;
    const perda = Math.max(0, best.valor - minha.valor);
    const det = o => `${o.d === 0 ? 'fecha' : 'faltam ' + o.d}, ${o.U} ajudam${o.perigo >= 0.05 ? ', perigo ' + pct(o.perigo) : ''}`;
    return nota(perda, `Descartou o ${R.nome(acao.carta)}: o melhor descarte (${det(minha)}).`,
      `Descartou o ${R.nome(acao.carta)} (${det(minha)}); o ${R.nome(best.carta)} era melhor (${det(best)}).`);
  }

  K.Coach = { conselho, conselhoCompra, conselhoJogada, avaliar, descreve, cartaHtml, lista, jogosHtml, ajudamHtml, pct };
})(window.Poker = window.Poker || {});
