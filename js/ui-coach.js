/* ==========================================================================
   OUTS · Treino Lab — ui-coach.js
   Painel lateral do coach (recolhível) e o modo quiz.
   Três modos: dicas sempre visíveis, dica só quando pedir, quiz antes de agir.
   Também exporta o renderizador de perguntas usado no treino relâmpago.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc, cartaTxt } = P.UI;
  const F = P.Formato;
  const pct = (x, c = 1) => F.pct(x, c);

  const ROTULO_ACAO = { fold: 'FOLD', check: 'CHECK', call: 'PAGUE', bet: 'APOSTE', raise: 'AUMENTE', allin: 'ALL-IN' };
  const CORES_NOTA = { otima: '#3dd68c', boa: '#4c9aff', imprecisa: '#f5a524', erro: '#ef5350', grave: '#b71c1c' };

  let raiz = null, corpo = null, ctxAtual = null, analiseAtual = null, notasMao = [];
  let aoMudarModo = null;

  function fmt(v) { return ctxAtual && ctxAtual.fmt ? ctxAtual.fmt(v) : F.fichas(v); }
  function fmtBB(v, bb) { return F.bb(v, bb); }

  // ------------------------------------------------------------ montagem
  function montar(container, opts = {}) {
    aoMudarModo = opts.aoMudarModo;
    const desligado = P.Config.get('modoCoach') === 'desligado';
    raiz = el('aside', { class: 'painel-coach' + (P.Config.get('coachAberto') && !desligado ? '' : ' recolhido'), id: 'painel-coach' });
    const cab = el('div', { class: 'coach-cab' },
      el('h2', { html: '<i>♠</i> Coach' }),
      el('button', { class: 'btn btn-icone', title: 'Recolher painel', html: '&rsaquo;', onclick: () => alternar(false) }));
    const modos = el('div', { class: 'coach-modos' });
    MODOS.forEach(([id, txt]) => {
      modos.appendChild(el('button', {
        'data-modo': id, class: P.Config.get('modoCoach') === id ? 'ativo' : '', text: txt,
        onclick: () => { P.Config.set('modoCoach', id); }
      }));
    });
    corpo = el('div', { class: 'coach-corpo' });
    raiz.appendChild(cab);
    raiz.appendChild(modos);
    raiz.appendChild(corpo);
    container.appendChild(raiz);
    if (desligado) mensagemDesligado();
    else vazio('Aguardando a sua vez', 'Quando for a sua decisão, o coach mostra a matemática da mão aqui.');
    return raiz;
  }

  const MODOS = [['sempre', 'Sempre'], ['pedido', 'Sob pedido'], ['quiz', 'Quiz'], ['desligado', 'Desligado']];
  const desligado = () => P.Config.get('modoCoach') === 'desligado';

  function mensagemDesligado() {
    if (!corpo) return;
    corpo.innerHTML = '';
    corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach desligado</b>Sem dicas durante o jogo. As suas decisões continuam sendo avaliadas em silêncio, e a análise completa aparece no fim da partida.' }));
  }

  /** Troca de modo (pelo painel, pelas Opções ou pelo lobby). */
  function aplicarModo(modo) {
    atualizarModos();
    if (!raiz) return;
    if (modo === 'desligado') { raiz.classList.add('recolhido'); mensagemDesligado(); }
    else if (raiz.classList.contains('recolhido') && P.Config.get('coachAberto')) raiz.classList.remove('recolhido');
    window.dispatchEvent(new Event('resize'));
    if (aoMudarModo) aoMudarModo(modo);
  }

  function atualizarModos() {
    if (!raiz) return;
    raiz.querySelectorAll('.coach-modos button').forEach(b => b.classList.toggle('ativo', b.dataset.modo === P.Config.get('modoCoach')));
  }

  function alternar(abrir) {
    if (!raiz) return;
    const vai = abrir === undefined ? raiz.classList.contains('recolhido') : abrir;
    raiz.classList.toggle('recolhido', !vai);
    P.Config.set('coachAberto', vai);
    window.dispatchEvent(new Event('resize'));
  }

  function vazio(titulo, texto) {
    if (!corpo) return;
    corpo.innerHTML = '';
    corpo.appendChild(el('div', { class: 'coach-vazio', html: `<b>${esc(titulo)}</b>${esc(texto || '')}` }));
    if (notasMao.length) corpo.appendChild(blocoFeedback());
  }

  function novaMao() {
    notasMao = []; analiseAtual = null;
    if (desligado()) mensagemDesligado(); else vazio('Nova mão', 'Aguardando a sua vez.');
  }

  // ----------------------------------------------------------- renderização
  function chips(lista) {
    return el('div', { class: 'chips-texto' }, lista.filter(Boolean).map(([txt, cls]) => el('span', { class: 'chip ' + (cls || ''), text: txt })));
  }

  function bloco(titulo, ...filhos) {
    return el('div', { class: 'bloco' }, el('h4', { html: titulo }), ...filhos);
  }

  function blocoRecomendacao(an) {
    const r = an.recomendacao;
    if (!r) return null;
    const bb = an.bb;
    let tam = '';
    if ((r.acao === 'raise' || r.acao === 'bet') && r.ate) tam = `${fmt(r.ate)} <small>(${fmtBB(r.ate, bb)})</small>`;
    if (r.acao === 'call') tam = `<small>${fmt(an.paraPagar)}</small>`;
    const div = el('div', { class: 'bloco recomendacao' },
      el('h4', { html: `Recomendação ${r.misto ? '<span class="chip ouro">mão de fronteira</span>' : ''}${r.porICM ? '<span class="chip ouro">ajustado por ICM</span>' : ''}` }),
      el('div', { class: 'acao ' + (r.acao === 'fold' ? 'fold' : ''), html: `${ROTULO_ACAO[r.acao] || r.acao} ${tam}` }),
      el('ol', { class: 'passos' }, (an.passos || []).map(p => el('li', { text: p })))
    );
    return div;
  }

  function cabecalho(an) {
    const lst = [[an.classe, 'ouro'], [an.categoria], [an.posicao], [`${F.num(an.efetivoBB, 0)} bb efetivos`]];
    if (an.rua !== 'preflop') lst.push([an.rua.toUpperCase(), 'verde']);
    return chips(lst);
  }

  function gradeRange(an) {
    const pf = an.preflop, plano = pf.plano;
    const g = el('div', { class: 'grade' });
    P.Ranges.todasClasses().forEach(c => {
      g.appendChild(el('div', { class: (pf.grade[c] || 'fold') + (c === an.classe ? ' minha' : ''), text: c.replace(/[so]$/, ''), title: c }));
    });
    const leg = el('div', { class: 'legenda-grade' },
      el('span', { style: { '--c': '#b4782c' }, text: plano.nomeRaise }),
      Object.keys(plano.call).length ? el('span', { style: { '--c': '#2a7a52' }, text: plano.nomeCall }) : null,
      el('span', { style: { '--c': 'linear-gradient(135deg,#b4782c 50%,#2a7a52 50%)' }, text: 'misto' }),
      el('span', { style: { '--c': '#1a222c' }, text: 'fold' }));
    const pctR = P.Ranges.percentual(plano.raise), pctC = P.Ranges.percentual(plano.call);
    return bloco(`Range recomendado <span>${F.num(pctR, 0)}% ${plano.nomeRaise.toLowerCase()}${pctC ? ' · ' + F.num(pctC, 0) + '% ' + plano.nomeCall.toLowerCase() : ''}</span>`,
      el('p', { text: plano.explicacao }), g, leg);
  }

  function blocoTorneio(an) {
    const t = an.torneio;
    if (!t) return null;
    const filhos = [el('div', { class: 'zona ' + t.zona.nome, text: `M = ${F.num(t.M, 1)} — ${t.zona.texto}` })];
    filhos.push(el('div', { class: 'par-dados', html:
      `<span>M (stack ÷ custo de uma volta)</span><b>${F.num(t.M, 1)}</b>` +
      `<span>Custo da volta (SB + BB + antes)</span><b>${fmt(t.custoRodada)}</b>` +
      `<span>Jogadores restantes / pagos</span><b>${t.restantes} / ${t.pagos}</b>` }));
    if (t.icm) {
      filhos.push(el('div', { class: 'par-dados', html:
        `<span>Valor ICM do seu stack</span><b>${F.dinheiro(Math.round(t.icm.valor))}</b>` +
        `<span>Seu % das fichas</span><b>${pct(t.icm.pctFichas)}</b>` +
        `<span>Seu % do prêmio (ICM)</span><b>${pct(t.icm.pctPool)}</b>` }));
      filhos.push(el('p', { text: 'No ICM, fichas que você ganha valem menos do que fichas que você perde: com stack grande, cada ficha extra vale menos.' }));
    }
    if (t.bolha) filhos.push(el('div', { class: 'zona vermelha', text: 'Pressão de bolha! Faltam poucos para a premiação: evite riscos marginais com stack médio e pressione os stacks curtos se você for o maior.' }));
    if (t.itm) filhos.push(el('div', { class: 'zona verde', text: 'Você está na premiação: cada eliminação aumenta o prêmio garantido.' }));
    if (t.decisao) {
      const d = t.decisao;
      filhos.push(el('div', { class: 'par-dados', html:
        `<span>Equity para pagar (fichas)</span><b>${pct(d.necessariaFichas)}</b>` +
        `<span>Equity para pagar (ICM)</span><b>${pct(d.necessariaICM)}</b>` +
        `<span>$ se foldar / ganhar / perder</span><b>${F.dinheiro(Math.round(d.valorFold))} / ${F.dinheiro(Math.round(d.valorGanha))} / ${F.dinheiro(Math.round(d.valorPerde))}</b>` }));
      filhos.push(el('p', { text: `O ICM pede ${F.num((d.necessariaICM - d.necessariaFichas) * 100, 1)} pontos a mais de equity do que a conta em fichas: esse é o "prêmio de risco" da bolha.` }));
    }
    return bloco('Torneio: M, zona e ICM', ...filhos);
  }

  function medidor(eq, nec) {
    const m = el('div', { class: 'medidor' },
      el('div', { class: 'eq' + (eq < nec ? ' abaixo' : ''), style: { width: Math.max(2, eq * 100) + '%' } }),
      el('div', { class: 'nec', style: { left: (nec * 100) + '%' }, 'data-rotulo': 'precisa ' + pct(nec, 0) }),
      el('div', { class: 'txt', text: 'Sua equity ' + pct(eq) }));
    return m;
  }

  function blocosPosflop(an) {
    const pf = an.posflop, out = [];
    const bb = an.bb;
    const eq = an.equity ? an.equity.valor : null;
    // mão feita
    out.push(bloco('Sua mão',
      el('p', { html: `<b style="color:var(--texto)">${esc(pf.mao.rotulo)}</b>` }),
      el('div', { class: 'par-dados', html:
        `<span>Vence contra todas as mãos possíveis</span><b>${pct(pf.forca.hs)}</b>` +
        `<span>Combos que te vencem agora</span><b>${pf.forca.perde} de ${pf.forca.total}</b>` }),
      pf.outs.draws.length ? chips(pf.outs.draws.map(d => [d, 'ouro'])) : null));
    // outs
    if (an.board.length < 5) {
      const o = pf.outs;
      const lista = el('div', { class: 'lista-outs', html: o.outs.map(x => cartaTxt(x.carta, x.peso >= 1 ? 'limpa' : 'suja')).join('') || '<span class="chip">sem outs relevantes</span>' });
      const sujos = o.outs.filter(x => x.peso < 1);
      const motivos = {};
      sujos.forEach(x => { motivos[x.motivo] = (motivos[x.motivo] || []).concat([x.carta]); });
      out.push(bloco(`Outs <span>${o.limpos} limpos · ${o.sujos} sujos · ${F.num(o.efetivos, 1)} efetivos</span>`, lista,
        ...Object.keys(motivos).map(m => el('p', { html: `${motivos[m].map(c => cartaTxt(c, 'suja')).join('')} ${esc(m)}` }))));
      if (o.limpos > 0 || o.efetivos > 0) {
        const pr = pf.probsEf;
        const usaLimpos = o.limpos > 0;
        const base = usaLimpos ? pf.probs : pf.probsEf;
        const linhas = [];
        if (an.board.length === 3) {
          linhas.push(['Até o river (2 cartas)', base.regra4, base.exatoAteRiver, 'regra do 4']);
          linhas.push(['Só no turn (1 carta)', base.regra2, base.exatoProxima, 'regra do 2']);
        } else linhas.push(['No river (1 carta)', base.regra2, base.exatoProxima, 'regra do 2']);
        out.push(bloco(`Chance de melhorar <span>${usaLimpos ? o.limpos + ' outs limpos' : F.num(o.efetivos, 1) + ' outs efetivos'}</span>`,
          el('div', { class: 'comparativo', html: `<span class="cab"></span><span class="cab">Atalho</span><span class="cab">Exato</span>` +
            linhas.map(l => `<span>${l[0]}</span><b>${pct(l[1], 0)} <small style="color:var(--texto-3)">${l[3]}</small></b><b>${pct(l[2])}</b>`).join('') }),
          el('p', { text: o.limpos > 8 ? `Acima de 8 outs a regra do 4 exagera: subtraia (outs − 8). ${o.limpos} × 4 − ${o.limpos - 8} = ${o.limpos * 4 - (o.limpos - 8)}%.` :
            `Com os outs sujos contando pela metade (${F.num(o.efetivos, 1)}), a chance real fica perto de ${pct(pr && an.board.length === 3 ? pr.exatoAteRiver : (pr ? pr.exatoProxima : 0))}.` })));
      }
    }
    // equity x preço
    const eqBloco = [];
    if (eq !== null) {
      eqBloco.push(el('p', { html: `Equity contra o range estimado (${an.equity.parcial ? '<span class="calculando">calculando ' + an.equity.iteracoes.toLocaleString('pt-BR') + '</span>' : an.equity.iteracoes.toLocaleString('pt-BR') + ' simulações Monte Carlo'}): <b style="color:var(--texto)">${pct(eq)}</b> ± ${pct(an.equity.erro * 2, 1)}` }));
    } else eqBloco.push(el('div', { class: 'calculando', text: 'Calculando equity (Monte Carlo)…' }));
    if (an.paraPagar > 0 && pf.potOdds) {
      const po = pf.potOdds;
      if (eq !== null) eqBloco.push(medidor(eq, po.necessaria));
      eqBloco.push(el('div', { class: 'par-dados', html:
        `<span>Pagar / pote</span><b>${fmt(an.paraPagar)} / ${fmt(an.pote)}</b>` +
        `<span>Pot odds (razão)</span><b>${F.num(po.razao, 1)} : 1</b>` +
        `<span>Equity necessária</span><b>${pct(po.necessaria)}</b>` +
        (pf.evCall !== undefined && pf.evCall !== null ? `<span>EV do call</span><b style="color:${pf.evCall >= 0 ? 'var(--ok)' : 'var(--erro)'}">${pf.evCall >= 0 ? '+' : ''}${fmt(Math.round(pf.evCall))} (${pf.evCall >= 0 ? '+' : ''}${F.num(pf.evCall / bb, 1)} bb)</b>` : '') }));
      eqBloco.push(el('p', { html: `Equity necessária = pagar ÷ (pote + aposta + pagar) = ${fmt(an.paraPagar)} ÷ ${fmt(an.pote + an.paraPagar)}.` }));
      if (pf.implied) {
        eqBloco.push(el('p', { html: pf.implied.precisaGanhar > 0
          ? `<b>Implied odds:</b> para o call se pagar só com a próxima carta, você precisa ganhar mais <b>${fmt(Math.round(pf.implied.precisaGanhar))}</b> quando acertar. Restam ${fmt(pf.implied.restante)} no stack efetivo — ${pf.implied.viavel ? 'é realista.' : 'é difícil receber isso.'}`
          : '<b>Implied odds:</b> as pot odds diretas já pagam o call; o que vier depois é lucro.' }));
      }
    }
    out.push(bloco('Equity x preço', ...eqBloco));
    // números da mão
    const tam = pf.tamanhos.map(t => `<tr><td>${t.fracao === 1 / 3 ? '1/3' : t.fracao === 0.5 ? '1/2' : t.fracao === 2 / 3 ? '2/3' : t.fracao === 1 ? 'pote' : '2x pote'}</td><td>${pct(t.necessariaVilao)}</td><td>${pct(t.alfa)}</td><td>${pct(t.mdf)}</td></tr>`).join('');
    out.push(bloco('SPR, MDF e blefe',
      el('div', { class: 'par-dados', html:
        (pf.spr ? `<span>SPR no flop</span><b>${F.num(pf.spr.spr, 1)}</b>` : '') +
        `<span>SPR agora</span><b>${F.num(an.efetivo / Math.max(1, an.pote), 1)}</b>` +
        (pf.potOdds ? `<span>MDF contra esta aposta</span><b>${pct(pf.potOdds.mdf)}</b><span>Blefe do vilão precisa de folds</span><b>${pct(pf.potOdds.alfa)}</b>` : '') }),
      el('p', { text: pf.spr ? (pf.spr.spr < 4 ? 'SPR baixo: top pair forte já justifica colocar tudo.' : pf.spr.spr > 10 ? 'SPR alto: só mãos muito fortes querem um pote enorme.' : 'SPR médio: dois pares ou melhor costumam querer stack-off.') : '' }),
      el('table', { class: 'tabela-mini', html: `<thead><tr><th>Sua aposta</th><th>Vilão precisa</th><th>Blefe (alfa)</th><th>MDF</th></tr></thead><tbody>${tam}</tbody>` })));
    // textura
    out.push(bloco(`Textura do board <span>${esc(pf.tex.tipo)}</span>`, chips(pf.tex.tags.map(t => [t])), ...pf.tex.notas.map(n => el('p', { text: n }))));
    // opções
    if (an.opcoes) {
      const melhor = an.opcoes.reduce((a, b) => (b.ev > a.ev ? b : a));
      const linhas = an.opcoes.map(o => `<tr style="${o === melhor ? 'color:var(--ok);font-weight:700' : ''}"><td>${(ROTULO_ACAO[o.acao] || o.acao)}${o.ate ? ' ' + fmt(o.ate) : ''}</td><td>${o.fe !== undefined ? pct(o.fe, 0) : '—'}</td><td>${o.evBB >= 0 ? '+' : ''}${F.num(o.evBB, 1)} bb</td></tr>`).join('');
      out.push(bloco('Opções (EV estimado)', el('table', { class: 'tabela-mini', html: `<thead><tr><th>Ação</th><th>Fold equity</th><th>EV</th></tr></thead><tbody>${linhas}</tbody>` }),
        el('p', { text: 'Modelo simplificado: equity atual, fold equity pela MDF ajustada ao perfil do vilão. Serve para comparar linhas, não é um solver.' })));
    }
    return out;
  }

  function blocoFeedback() {
    if (!notasMao.length) return el('div');
    return bloco('Suas decisões nesta mão', el('div', { class: 'feedback-lista' }, notasMao.map(n => el('div', { class: 'feedback-item' },
      el('span', { class: 'feedback-nota nota-' + n.nota, text: n.nomeNota }),
      el('p', { html: `<b style="color:var(--texto)">${n.rua === 'preflop' ? 'Pré-flop' : n.rua}</b> · ${esc(n.motivo)}${n.perdaBB > 0.01 ? ` <span style="color:var(--erro)">(−${F.num(n.perdaBB, 1)} bb)</span>` : ''}` })))));
  }

  /** Desenha a análise completa (ou parcial, durante o Monte Carlo). */
  function renderizar(an) {
    if (!corpo || !an) return;
    analiseAtual = an;
    const rolagem = corpo.scrollTop;
    corpo.innerHTML = '';
    corpo.appendChild(cabecalho(an));
    if (an.pronto || an.rua === 'preflop') corpo.appendChild(blocoRecomendacao(an) || el('div'));
    else corpo.appendChild(el('div', { class: 'bloco' }, el('div', { class: 'calculando', text: 'Analisando a mão…' })));
    if (an.rua === 'preflop') {
      const pf = an.preflop;
      const eqs = an.equityPreflop;
      corpo.appendChild(bloco('Mão inicial', el('div', { class: 'par-dados', html:
        `<span>Força (percentil)</span><b>top ${F.num(pf.percentil, 0)}%</b>` +
        (eqs ? `<span>Equity contra 1 mão aleatória</span><b>${pct(eqs.vs1)}</b><span>Contra 3 mãos aleatórias</span><b>${pct(eqs.vs3)}</b>` : '') +
        (an.equity ? `<span>Contra o range de quem aumentou</span><b>${pct(an.equity.valor)}${an.equity.parcial ? '…' : ''}</b>` : '') })));
      const t = blocoTorneio(an);
      if (t) corpo.appendChild(t);
      corpo.appendChild(gradeRange(an));
    } else {
      const t = blocoTorneio(an);
      if (t) corpo.appendChild(t);
      blocosPosflop(an).forEach(b => corpo.appendChild(b));
    }
    corpo.appendChild(blocoFeedback());
    corpo.scrollTop = rolagem;
  }

  /** Depois que o herói age: guarda a nota e mostra a análise completa para comparar. */
  function registrarNota(nota, an) {
    notasMao.push(nota);
    if (desligado()) return;                 // avaliada em silêncio: só aparece no relatório final
    if (an || analiseAtual) renderizar(an || analiseAtual);
    else vazio('Decisão registrada', '');
  }

  // ------------------------------------------------- fluxo de cada decisão
  /**
   * Chamado na vez do herói. Devolve Promise que resolve quando o herói pode
   * agir (no modo quiz, depois das perguntas).
   */
  async function novaDecisao(promAnalise, ctx) {
    ctxAtual = ctx;
    const modo = P.Config.get('modoCoach');
    if (modo === 'desligado') { mensagemDesligado(); return; }
    if (modo === 'sempre') {
      vazio('Analisando…', '');
      promAnalise.then(an => renderizar(an));
      return;
    }
    if (modo === 'pedido') {
      corpo.innerHTML = '';
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Pense primeiro</b>Quando quiser ajuda, peça uma dica.' }));
      corpo.appendChild(el('button', { class: 'btn btn-ouro btn-dica', text: 'Pedir dica (H)', onclick: () => pedirDica(promAnalise) }));
      if (notasMao.length) corpo.appendChild(blocoFeedback());
      return;
    }
    // quiz
    vazio('Modo quiz', 'Responda antes de agir.');
    const an = await promAnalise;
    await quiz(an);
    renderizar(an);
  }

  function pedirDica(promAnalise) {
    vazio('Analisando…', '');
    promAnalise.then(an => renderizar(an));
  }

  function atualizarParcial(an) {
    if (P.Config.get('modoCoach') === 'sempre') renderizar(an);
    else if (analiseAtual && analiseAtual.token === an.token) renderizar(an);
  }

  // ---------------------------------------------------- perguntas (quiz)
  /**
   * Monta a interface de uma pergunta. opts: { tempo (ms), aoResponder(resultado) }
   * Devolve { elemento, focar() }.
   */
  function perguntaUI(p, opts = {}) {
    const caixa = el('div', { class: 'quiz' });
    if (p.cartas || p.board) {
      const ctxDiv = el('div', { class: 'contexto' });
      if (p.cartas) ctxDiv.appendChild(el('div', {}, el('small', { text: p.cartasVilao ? 'Mão 1' : 'Suas cartas' }), el('div', { class: 'grupo-cartas' }, p.cartas.map(c => P.UI.carta(c, { classe: 'mini-quiz' })))));
      if (p.cartasVilao) ctxDiv.appendChild(el('div', {}, el('small', { text: 'Mão 2' }), el('div', { class: 'grupo-cartas' }, p.cartasVilao.map(c => P.UI.carta(c)))));
      if (p.board) ctxDiv.appendChild(el('div', {}, el('small', { text: 'Board' }), el('div', { class: 'grupo-cartas' }, p.board.map(c => P.UI.carta(c)))));
      ctxDiv.querySelectorAll('.carta').forEach(c => c.style.setProperty('--l', '46px'));
      caixa.appendChild(ctxDiv);
    }
    caixa.appendChild(el('div', { class: 'pergunta', text: p.enunciado }));
    const crono = el('div', { class: 'cronometro' }, el('i'));
    if (opts.tempo) caixa.appendChild(crono);
    const t0 = performance.now();
    let respondido = false, timer = null;
    const resultadoBox = el('div');
    function responder(valor) {
      if (respondido) return;
      respondido = true;
      clearTimeout(timer);
      const ms = performance.now() - t0;
      const r = P.Treino.corrigir(p, valor, ms);
      r.ms = ms;
      const unidade = p.unidade === '%' ? '%' : p.unidade === ':1' ? ' : 1' : p.unidade === 'outs' ? ' outs' : '';
      const certa = p.opcoes ? p.resposta : (p.unidade === 'outs' ? Math.round(p.resposta) : F.num(p.resposta, p.unidade === ':1' ? 1 : 1)) + unidade;
      resultadoBox.innerHTML = '';
      resultadoBox.appendChild(el('div', { class: 'correcao ' + (r.acertou ? 'certo' : r.parcial ? 'parcial' : 'errado'), html:
        `<b>${r.acertou ? 'Certo!' : r.parcial ? 'Quase!' : (valor === null ? 'Tempo esgotado' : 'Não foi dessa vez')} · +${r.pontos} pontos · ${F.num(ms / 1000, 1)} s</b>` +
        `Resposta: <b style="display:inline">${esc(String(certa))}</b>. ${esc(p.explicacao || '')}` }));
      if (r.acertou) P.Som.acerto(); else P.Som.erro();
      caixa.querySelectorAll('input, .opcoes-quiz button, .btn-responder').forEach(x => { x.disabled = true; });
      if (opts.aoResponder) opts.aoResponder(r);
    }
    let entrada = null;
    if (p.opcoes) {
      caixa.appendChild(el('div', { class: 'opcoes-quiz' }, p.opcoes.map(o => el('button', { class: 'btn', text: o, onclick: () => responder(o) }))));
    } else {
      entrada = el('input', { class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: p.unidade === 'outs' ? 'nº de outs' : p.unidade === ':1' ? 'ex.: 3' : 'em %' });
      entrada.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); responder(entrada.value); } });
      caixa.appendChild(el('div', { class: 'resposta-linha' }, entrada,
        el('span', { class: 'unidade', style: { fontSize: '15px' }, text: p.unidade === '%' ? '%' : p.unidade === ':1' ? ': 1' : 'outs' }),
        el('button', { class: 'btn btn-ouro btn-responder', text: 'Responder (Enter)', onclick: () => responder(entrada.value) })));
    }
    caixa.appendChild(resultadoBox);
    if (opts.tempo) {
      const barra = crono.firstChild;
      barra.style.transition = `transform ${opts.tempo}ms linear`;
      requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.transform = 'scaleX(0)'; }));
      timer = setTimeout(() => responder(null), opts.tempo);
    }
    return { elemento: caixa, focar: () => entrada && entrada.focus(), responder, respondido: () => respondido };
  }

  /** Quiz na mesa: perguntas sobre a situação real antes de agir. */
  function quiz(an) {
    const perguntas = P.Treino.perguntasDaMesa(an).map(p => Object.assign({ cartas: an.cartas, board: an.board.length ? an.board : null }, p));
    if (!perguntas.length) return Promise.resolve();
    return new Promise(resolve => {
      let i = 0, total = 0;
      P.UI.modal({
        titulo: 'Quiz — antes de agir', fechavel: false, largo: false,
        conteudo: el('div', { id: 'quiz-area' }),
        aoAbrir: (corpoModal, fechar) => {
          const proxima = () => {
            corpoModal.innerHTML = '';
            if (i >= perguntas.length) {
              corpoModal.appendChild(el('p', { html: `<b>${total} pontos</b> nesta decisão. Agora é com você na mesa.` }));
              corpoModal.appendChild(el('button', { class: 'btn btn-ouro', text: 'Ir para a mesa (Enter)', onclick: () => { document.removeEventListener('keydown', teclaFim, true); fechar(true); resolve(); } }));
              document.addEventListener('keydown', teclaFim, true);
              return;
            }
            const p = perguntas[i];
            corpoModal.appendChild(el('div', { class: 'chips-texto', style: { marginBottom: '10px' } }, el('span', { class: 'chip ouro', text: `Pergunta ${i + 1} de ${perguntas.length}` })));
            const ui = perguntaUI(p, {
              tempo: 20000,
              aoResponder: r => {
                total += r.pontos;
                P.Estatisticas.registrarQuiz(r.acertou, r.ms, r.pontos);
                const btn = el('button', { class: 'btn btn-ouro', style: { marginTop: '10px' }, text: 'Próxima (Enter)', onclick: avancar });
                corpoModal.appendChild(btn);
                setTimeout(() => btn.focus(), 30);
              }
            });
            corpoModal.appendChild(ui.elemento);
            setTimeout(ui.focar, 50);
          };
          const avancar = () => { i++; proxima(); };
          function teclaFim(e) { if (e.key === 'Enter') { e.preventDefault(); document.removeEventListener('keydown', teclaFim, true); fechar(true); resolve(); } }
          proxima();
        }
      });
    });
  }

  P.UICoach = { montar, alternar, novaMao, novaDecisao, atualizarParcial, registrarNota, renderizar, perguntaUI, quiz, pedirDica, CORES_NOTA, atualizarModos, aplicarModo, MODOS };
})(window.Poker = window.Poker || {});
