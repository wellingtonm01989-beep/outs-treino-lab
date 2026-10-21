/* ==========================================================================
   OUTS · Treino Lab — ui-trilha-mesa.js
   O tabuleiro da trilha, no mesmo palco do xadrez e das damas: barra de
   cima, tabuleiro (os três quadrados) numa moldura de madeira, as placas dos
   dois jogadores (com as peças que ainda estão na mão), a lista de lances,
   a barra de ações (desfazer, dica, regras) e o coach (painel no PC,
   janela no celular).
   Jogar: na 1ª fase, toque numa casa vazia; na 2ª, toque na peça e na casa.
   Fechou trilha: toque na peça do adversário que vai sair (as marcadas).
   A partida fica salva a cada lance.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const Tr = P.Trilha, IA = Tr.IA, TC = Tr.Coach;
  const D = () => Tr.Dados;

  // posição de cada casa no quadriculado 7×7 (coluna, linha de cima para baixo)
  const XY = Tr.NOMES.map(n => [n.charCodeAt(0) - 97, 7 - (+n[1])]);
  const LINHAS = [[[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]], [[1, 1], [5, 1], [5, 5], [1, 5], [1, 1]], [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
    [[3, 0], [3, 2]], [[3, 4], [3, 6]], [[0, 3], [2, 3]], [[4, 3], [6, 3]]];
  const u = k => k * 100 + 50;   // unidade do desenho (viewBox 0..700)
  // o desenho ocupa 92% do tabuleiro (a borda guarda as letras e os números)
  const MARGEM = 4, AREA = 92;
  const pct = k => MARGEM + (k + 0.5) / 7 * AREA;

  // ------------------------------------------------------------------ peças
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<radialGradient id="tl-g-br" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ece4d0"/><stop offset="1" stop-color="#bfae86"/></radialGradient>' +
    '<radialGradient id="tl-g-pr" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#6e7580"/><stop offset=".5" stop-color="#30353c"/><stop offset="1" stop-color="#0f1114"/></radialGradient>' +
    '</defs></svg>';
  function garantirDefs() {
    if (document.getElementById('tl-g-br') || !document.body) return;
    const d = document.createElement('div');
    d.innerHTML = DEFS;
    document.body.appendChild(d.firstChild);
  }
  garantirDefs();
  /** Peça (pedra redonda com relevo), cor 1 brancas / -1 pretas. */
  function pecaSVG(cor) {
    garantirDefs();
    return `<svg class="tl-peca-svg ${cor > 0 ? 'br' : 'pr'}" viewBox="0 0 100 100" aria-hidden="true">` +
      '<ellipse class="tl-pe" cx="50" cy="55" rx="44" ry="42"/><circle class="tl-face" cx="50" cy="48" r="44"/>' +
      '<circle class="tl-sulco" cx="50" cy="48" r="30"/><path class="tl-brilho" d="M20 38 A32 32 0 0 1 42 16.5"/></svg>';
  }
  /** O desenho do tabuleiro (as linhas), para a mesa e para a página de regras. */
  function linhasSVG(extra) {
    return LINHAS.map(l => `<polyline points="${l.map(([x, y]) => u(x) + ',' + u(y)).join(' ')}"/>`).join('') + (extra || '');
  }
  function desenhoMini() {
    const pts = XY.map(([x, y]) => `<circle cx="${u(x)}" cy="${u(y)}" r="14"/>`).join('');
    const exemplo = [[0, 0], [3, 0], [6, 0]].map(([x, y]) => `<circle class="br" cx="${u(x)}" cy="${u(y)}" r="30"/>`).join('') + `<circle class="pr" cx="${u(3)}" cy="${u(4)}" r="30"/>`;
    return `<svg class="tl-mini" viewBox="0 0 700 700" aria-hidden="true"><g class="linhas">${linhasSVG()}</g><polyline class="trilha" points="${u(0)},${u(0)} ${u(6)},${u(0)}"/><g class="pts">${pts}</g>${exemplo}</svg>`;
  }

  let jogo = null, pausas = 0, contador = 0;
  function pausar(p) { pausas = Math.max(0, pausas + (p ? 1 : -1)); }
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-trilha');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    g.raiz = el('div', { class: 'tr-jogo xz-jogo tl-jogo', 'data-tema': P.Config.get('tema') || 'verde' });
    const nv = IA.nivel(jogo.nivel);
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra xz-barra' },
      el('span', { class: 'rotulo', text: 'Trilha' }),
      el('span', { class: 'detalhe', text: `você de ${jogo.humano === Tr.BRANCO ? 'brancas' : 'pretas'} · bot ${nv.nome.toLowerCase()}${jogo.opcoes.voar ? '' : ' · sem voar'}` }),
      el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));
    const placa = quem => {
      const p = {};
      const info = quem === 'bot' ? jogo.bot : { nome: 'Você', avatar: null };
      p.mao = el('div', { class: 'xz-capturadas tl-mao' });
      p.pensando = el('span', { class: 'xz-pensando oculto', text: 'pensando…' });
      p.raiz = el('div', { class: 'xz-placa ' + quem },
        el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, quem !== 'bot') }),
        el('div', { class: 'info' },
          el('span', { class: 'nome', html: esc(quem === 'bot' ? info.nome : 'Você') + (quem === 'bot' ? ` <span class="tag-perfil" style="--cor-perfil:${['#7aa2c7', '#4fbf8b', '#d9a441', '#e07a5f', '#b794f4'][nv.id - 1]}">${nv.nome.toUpperCase().slice(0, 3)}</span>` : '') }),
          el('div', { class: 'linha2' }, p.mao, p.pensando)));
      return p;
    };
    g.placaBot = placa('bot'); g.placaEu = placa('eu');
    g.tab = el('div', { class: 'tl-tabuleiro' });
    g.svg = el('div', { class: 'tl-linhas' });
    g.tab.appendChild(g.svg);
    g.casas = XY.map(([x, y], s) => {
      const c = el('div', { class: 'tl-casa', 'data-casa': s, style: { left: pct(x) + '%', top: pct(y) + '%' } });
      g.tab.appendChild(c);
      return c;
    });
    g.coords = el('div', { class: 'tl-coords', html: 'abcdefg'.split('').map((l, i) => `<span class="col" style="left:${pct(i)}%">${l}</span>`).join('') +
      [7, 6, 5, 4, 3, 2, 1].map((n, i) => `<span class="lin" style="top:${pct(i)}%">${n}</span>`).join('') });
    g.tab.appendChild(g.coords);
    g.setas = el('div', { class: 'xz-setas tl-setas' });
    g.tab.appendChild(g.setas);
    g.tab.addEventListener('click', e => { const c = e.target.closest('.tl-casa'); if (c) tocar(+c.dataset.casa); });
    g.aval = el('div', { class: 'xz-avaliacao', title: 'Avaliação do coach' }, el('i'), el('span'));
    g.moldura = el('div', { class: 'xz-moldura tl-moldura' }, g.tab);
    g.tabCaixa = el('div', { class: 'xz-tab-caixa' }, g.aval, g.moldura);
    g.hist = el('div', { class: 'xz-hist', title: 'Lances da partida' });
    g.area = el('div', { class: 'xz-area' }, g.placaBot.raiz, g.tabCaixa, g.placaEu.raiz, g.hist);
    g.palco = el('div', { class: 'mesa-palco xz-palco' }, g.area,
      el('button', { class: 'btn-barra so-celular tr-btn-menu', title: 'Menu', html: '&#9776;', onclick: abrirMenu }));
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada lance seu.</span>' });
    g.coachNota = el('span');
    g.coach = el('div', { class: 'tr-coach', title: 'Ver a análise do coach', onclick: () => abrirCoach() }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt);
    g.status = el('div', { class: 'tr-status' });
    g.btnDesfazer = el('button', { class: 'btn-acao btn-cobrir', html: 'Desfazer<small>volta seu lance</small>', onclick: () => desfazer() });
    g.btnDica = el('button', { class: 'btn-acao btn-tr-dica', html: 'Dica', onclick: () => dica() });
    g.btnRegras = el('button', { class: 'btn-acao btn-aceitar', html: 'Regras<small>como jogar</small>', onclick: () => abrirRegras() });
    g.acoes = el('div', { class: 'barra-acoes tr-acoes xz-acoes' },
      el('div', { class: 'acoes-esquerda' }, g.status, g.coach),
      el('div', { class: 'acoes-botoes' }, g.btnDesfazer, g.btnDica, g.btnRegras));
    g.painelCorpo = el('div', { class: 'coach-corpo' });
    g.painelModos = el('div', { class: 'coach-modos' });
    [['sempre', 'Sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) =>
      g.painelModos.appendChild(el('button', { 'data-modo': id, text: txt, onclick: () => mudarModoCoach(id) })));
    g.painel = el('aside', { class: 'painel-coach tr-painel xz-painel' + (P.Config.get('coachAberto') !== false ? '' : ' recolhido') },
      el('div', { class: 'coach-cab' }, el('h2', { html: '<i>💡</i> Coach' }),
        el('button', { class: 'btn btn-icone', title: 'Recolher painel', html: '&rsaquo;', onclick: () => alternarPainel(false) })),
      g.painelModos, g.painelCorpo);
    g.coluna = el('div', { class: 'mesa-coluna' }, g.barra, g.palco, g.acoes);
    g.raiz.append(g.coluna, g.painel);
    raiz.appendChild(g.raiz);
    aplicarModoCoach();
    if (jogo.observador) jogo.observador.disconnect();
    jogo.observador = new ResizeObserver(() => layout());
    jogo.observador.observe(g.palco);
    layout();
  }

  // ============================================================== geometria (a mesma do xadrez)
  function layout() {
    if (!jogo || !jogo.ui) return;
    const g = jogo.ui;
    const W = g.palco.clientWidth, H = g.palco.clientHeight;
    if (!W || !H) return;
    const compacto = W < 640 || H < 420;
    const lado = W > H * 1.2;
    g.area.classList.toggle('lado', lado);
    g.area.classList.toggle('retrato', !lado);
    g.palco.classList.toggle('compacto', compacto);
    const placaH = compacto ? 46 : 56, pad = compacto ? 4 : 16;
    const moldura = compacto ? 4 : 11, gap = compacto ? 6 : 8;
    let L, apertado = false;
    if (lado) {
      const avalL = compacto ? 10 : 14, gapAval = compacto ? 5 : 8;
      const placaL = Math.min(260, Math.round(W * 0.3));
      const reserva = compacto ? 44 : 0;
      L = Math.min(H - 2 * pad - 2 * moldura, W - 2 * pad - placaL - 14 - avalL - gapAval - 2 * moldura - reserva);
      g.raiz.style.setProperty('--xz-placa-l', placaL + 'px');
    } else {
      const avalH = compacto ? 8 : 10;
      let histH = 30;
      const porLargura = W - 2 * pad - 2 * moldura;
      const porAltura = H - 2 * pad - 2 * placaH - avalH - histH - 4 * gap - 2 * moldura;
      L = Math.min(porLargura, porAltura);
      if (porAltura - porLargura > 70) histH = 56;
      g.area.classList.toggle('hist-alto', histH > 30);
      g.raiz.style.setProperty('--xz-hist-h', histH + 'px');
      const total = Math.max(200, L) + 2 * moldura + 2 * placaH + avalH + histH + 4 * gap;
      apertado = (H - total) / 2 < 44 && W - (Math.max(200, L) + 2 * moldura) < 92;
      g.raiz.style.setProperty('--xz-aval-h', avalH + 'px');
    }
    L = Math.max(200, Math.floor(L / 7) * 7);
    g.area.classList.toggle('apertado', apertado);
    g.raiz.style.setProperty('--xz-l', L + 'px');
    g.raiz.style.setProperty('--xz-placa-h', placaH + 'px');
    g.raiz.style.setProperty('--xz-moldura', moldura + 'px');
    g.raiz.style.setProperty('--xz-gap', gap + 'px');
    renderAvaliacao();
  }

  // ============================================================== desenho
  const tiraveisDaSel = () => (jogo.sel && jogo.sel.tirar ? jogo.legais.filter(m => m.de === jogo.sel.de && m.para === jogo.sel.para && m.tira >= 0).map(m => m.tira) : []);
  /** Tabuleiro que aparece: na hora de escolher a peça a tirar, já com a sua peça na casa nova. */
  function tabuleiroVisto() {
    const t = Int8Array.from(jogo.pos.t);
    const sel = jogo.sel;
    if (sel && sel.tirar) { if (sel.de >= 0) t[sel.de] = 0; t[sel.para] = jogo.humano; }
    return t;
  }
  /** As trilhas fechadas que passam pela casa s (no tabuleiro t). */
  const trilhasEm = (t, s) => (t[s] ? Tr.TRILHAS.filter(l => l.indexOf(s) >= 0 && l.every(x => t[x] === t[s])) : []);
  function render(animar) {
    const g = jogo.ui, t = tabuleiroVisto(), eu = jogo.humano;
    const ult = jogo.ultimoLance, sel = jogo.sel;
    const minha = podeMover();
    const fase = jogo.pos.fase(eu);
    const tiraveis = new Set(tiraveisDaSel());
    const alvos = new Set();
    // na 1ª fase toda casa vazia serve (não marca nada); na 2ª, as casas aonde a peça escolhida pode ir
    if (minha && sel && !sel.tirar) jogo.legais.forEach(m => { if (m.de === sel.de) alvos.add(m.para); });
    const podem = new Set();
    if (minha && fase !== 'colocar' && !sel) jogo.legais.forEach(m => podem.add(m.de));
    g.casas.forEach((c, s) => {
      let cls = 'tl-casa';
      if (ult && !(sel && sel.tirar) && (s === ult.para || s === ult.de)) cls += ' ultimo';
      if (ult && ult.tira === s && !t[s] && !(sel && sel.tirar)) cls += ' tirada-ult';
      if (sel && (s === sel.de || (sel.tirar && s === sel.para))) cls += ' sel';
      if (alvos.has(s)) cls += ' alvo';
      if (podem.has(s)) cls += ' pode';
      if (tiraveis.has(s)) cls += ' tirar';
      if (t[s]) cls += ' ocupada';
      c.className = cls;
      const html = t[s] ? `<div class="tl-peca" data-p="${t[s]}">${pecaSVG(t[s])}</div>` : '<i class="ponto"></i>';
      if (c._html !== html) { c.innerHTML = html; c._html = html; }
    });
    // trilhas em destaque: a que acabou de fechar (ou a que você está fechando)
    let destaque = [];
    if (sel && sel.tirar) destaque = trilhasEm(t, sel.para);
    else if (ult && ult.tira >= 0) destaque = trilhasEm(t, ult.para);
    const extra = destaque.map(l => `<polyline class="trilha${sel && sel.tirar ? ' minha' : ''}" points="${l.map(s => u(XY[s][0]) + ',' + u(XY[s][1])).join(' ')}"/>`).join('');
    const svg = `<svg viewBox="0 0 700 700" aria-hidden="true"><g class="linhas">${linhasSVG()}</g>${extra}</svg>`;
    if (g.svg._html !== svg) { g.svg.innerHTML = svg; g.svg._html = svg; }
    if (animar && ult) {
      const peca = g.casas[ult.para].querySelector('.tl-peca');
      if (peca) {
        peca.style.transition = 'none';
        if (ult.de >= 0) {
          const Lc = g.tab.clientWidth * AREA / 100 / 7;
          const dx = (XY[ult.de][0] - XY[ult.para][0]) * Lc, dy = (XY[ult.de][1] - XY[ult.para][1]) * Lc;
          peca.style.transform = `translate(${dx}px, ${dy}px)`;
        } else peca.style.transform = 'scale(1.35)';
        peca.style.zIndex = 5;
        void peca.offsetWidth;
        peca.style.transition = `transform ${ult.de >= 0 ? 320 : 220}ms ease`;
        peca.style.transform = '';
        setTimeout(() => { peca.style.zIndex = ''; }, 380);
      }
    }
    renderSetas();
    renderMao();
    renderAvaliacao();
    renderHistorico();
  }
  function renderSetas() {
    const g = jogo.ui;
    g.setas.innerHTML = '';
    const an = jogo.analise;
    if (!jogo.conselho || !an || !an.melhor || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista) || jogo.pos.lado !== jogo.humano || (jogo.sel && jogo.sel.tirar)) return;
    const m = jogo.pos.lanceDe(an.melhor);
    if (!m) return;
    const c = s => [(XY[s][0] + 0.5) / 7 * 100, (XY[s][1] + 0.5) / 7 * 100];
    const cor = 'rgba(47,191,113,.85)';
    let h = '';
    const [x2, y2] = c(m.para);
    if (m.de >= 0) {
      const [x1, y1] = c(m.de);
      const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const xb = x2 - ux * 4, yb = y2 - uy * 4;
      h += `<line x1="${x1}" y1="${y1}" x2="${xb}" y2="${yb}" stroke-width="2.4" stroke-linecap="round" style="stroke:${cor}"/>` +
        `<polygon points="${x2},${y2} ${xb - uy * 3},${yb + ux * 3} ${xb + uy * 3},${yb - ux * 3}" style="fill:${cor}"/>`;
    } else h += `<circle cx="${x2}" cy="${y2}" r="5.6" fill="none" stroke-width="1.8" stroke-dasharray="3 2" style="stroke:${cor}"/>`;
    if (m.tira >= 0) {
      const [x3, y3] = c(m.tira);
      h += `<path d="M${x3 - 3} ${y3 - 3} L${x3 + 3} ${y3 + 3} M${x3 + 3} ${y3 - 3} L${x3 - 3} ${y3 + 3}" stroke-width="1.8" stroke-linecap="round" style="stroke:rgba(255,90,82,.95)"/>`;
    }
    g.setas.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${h}</svg>`;
  }
  /** As peças na mão de cada um (1ª fase) e quantas estão no tabuleiro. */
  function renderMao() {
    const g = jogo.ui, pos = jogo.pos, eu = jogo.humano;
    // 1ª fase: as peças que faltam colocar; depois, quantas peças cada um tem
    const linha = cor => {
      const mao = pos.mao[cor], tab = pos.n[cor];
      if (mao) return `<span class="pedras">${pecaSVG(cor).repeat(Math.min(mao, 9))}</span><b>${mao}</b><em>na mão</em>`;
      return `<span class="pedras">${pecaSVG(cor)}</span><b>${tab}</b><em>${tab === 1 ? 'peça' : 'peças'}${jogo.opcoes.voar && tab === 3 ? ' · pode voar' : ''}</em>`;
    };
    g.placaEu.mao.innerHTML = linha(eu);
    g.placaBot.mao.innerHTML = linha(-eu);
  }
  function renderAvaliacao() {
    const g = jogo && jogo.ui, an = jogo && jogo.ultimaAvaliacao;
    if (!g) return;
    const mostrar = an && jogo.opcoes.coach !== 'desligado' && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista || jogo.fim);
    g.aval.classList.toggle('oculta', !mostrar);
    if (!mostrar) return;
    const pB = TC.chance(an.brancas);
    const frac = jogo.humano === Tr.BRANCO ? pB : 1 - pB;
    const deitada = g.area.classList.contains('retrato');
    g.aval.firstChild.style.height = deitada ? '' : Math.round(frac * 100) + '%';
    g.aval.firstChild.style.width = deitada ? Math.round(frac * 100) + '%' : '';
    g.aval.classList.toggle('pretas-embaixo', jogo.humano !== Tr.BRANCO);
    g.aval.lastChild.textContent = TC.textoAvaliacao(an.brancas);
  }
  function renderHistorico() {
    const g = jogo.ui;
    let h = '';
    for (let i = 0; i < jogo.lances.length; i++) {
      if (i % 2 === 0) h += `<span class="num">${i / 2 + 1}.</span>`;
      const nota = jogo.notaPorLance[i];
      h += `<span class="lance${nota ? ' n-' + nota : ''}${i === jogo.lances.length - 1 ? ' ultimo' : ''}">${esc(jogo.lances[i])}</span>`;
    }
    if (!h) h = '<span class="vazio">Os lances aparecem aqui.</span>';
    if (g.hist._html === h) return;
    g.hist.innerHTML = h; g.hist._html = h;
    if (g.hist.scrollWidth > g.hist.clientWidth + 2) g.hist.scrollLeft = g.hist.scrollWidth;
    g.hist.scrollTop = g.hist.scrollHeight;
  }
  function marcarVez() {
    const g = jogo.ui, vezEu = jogo.pos.lado === jogo.humano && !jogo.fim;
    g.placaEu.raiz.classList.toggle('vez', vezEu);
    g.placaBot.raiz.classList.toggle('vez', !vezEu && !jogo.fim);
  }
  function statusVez() {
    const g = jogo.ui, pos = jogo.pos, eu = jogo.humano, fase = pos.fase(eu);
    if (jogo.sel && jogo.sel.tirar) { g.status.innerHTML = '<b>Trilha!</b> Toque na peça do adversário que vai sair (as marcadas)'; return; }
    if (fase === 'colocar') g.status.innerHTML = `<b>Sua vez:</b> coloque uma peça numa casa vazia (${pos.mao[eu]} na mão)`;
    else if (fase === 'voar') g.status.innerHTML = '<b>Sua vez:</b> você tem 3 peças e pode voar — toque na peça e em qualquer casa vazia';
    else g.status.innerHTML = '<b>Sua vez:</b> toque na peça e na casa vizinha vazia';
  }

  // ========================================================= interação
  const podeMover = () => !!(jogo && jogo.vezHumano && !jogo.fim && jogo.pos.lado === jogo.humano);
  function tocar(s) {
    if (!podeMover()) return;
    const t = jogo.pos.t, eu = jogo.humano, sel = jogo.sel;
    const fase = jogo.pos.fase(eu);
    // escolhendo a peça para tirar
    if (sel && sel.tirar) {
      const m = jogo.legais.find(x => x.de === sel.de && x.para === sel.para && x.tira === s);
      if (m) return jogar(m);
      if ((fase === 'colocar' && !t[s]) || t[s] === eu || s === sel.para) { jogo.sel = null; render(); statusVez(); if (s !== sel.para) tocar(s); return; }
      aviso(t[s] === -eu ? 'Essa está numa trilha: escolha uma das peças marcadas.' : 'Toque numa das peças marcadas do adversário.');
      return;
    }
    if (fase === 'colocar') {
      const ms = jogo.legais.filter(m => m.para === s);
      if (!ms.length) return;
      if (ms[0].tira < 0) return jogar(ms[0]);
      jogo.sel = { de: -1, para: s, tirar: true };
      render(); statusVez();
      if (P.Som) P.Som.alerta();
      return;
    }
    if (t[s] === eu) {
      const dela = jogo.legais.filter(m => m.de === s);
      jogo.sel = dela.length ? { de: s } : null;
      render();
      if (!dela.length) aviso('Essa peça está cercada: não tem casa vizinha livre.');
      return;
    }
    if (sel && !t[s]) {
      const ms = jogo.legais.filter(m => m.de === sel.de && m.para === s);
      if (!ms.length) { aviso('Só dá para andar para uma casa vizinha livre, seguindo as linhas.'); return; }
      if (ms[0].tira < 0) return jogar(ms[0]);
      jogo.sel = { de: sel.de, para: s, tirar: true };
      render(); statusVez();
      if (P.Som) P.Som.alerta();
      return;
    }
    jogo.sel = null;
    render();
  }
  function aviso(txt) { if (P.Som) P.Som.erro(); jogo.ui.status.innerHTML = `<b>${txt}</b>`; }

  // ============================================================== partida
  function aplicar(m, animar) {
    const txt = Tr.texto(m);
    jogo.pos.fazer(m);
    jogo.lances.push(txt);
    jogo.ultimoLance = m;
    jogo.legais = jogo.pos.legais();
    jogo.sel = null;
    render(animar);
    if (P.Som) (m.tira >= 0 ? P.Som.ficha : P.Som.carta)();
    salvar();
  }

  async function jogar(m) {
    if (!podeMover()) return;
    jogo.vezHumano = false;
    const antes = jogo.lances.slice();
    const txt = Tr.texto(m);
    const analise = jogo.analise, promessa = jogo.promessaAnalise;
    aplicar(m, true);
    jogo.conselho = null; jogo.dicaVista = false;
    renderSetas();
    const token = jogo.token;
    (async () => {
      let an = analise;
      try { if (!an && promessa) an = await promessa; } catch (e) { an = null; }
      if (!jogo || jogo.token !== token || !an) return;
      const nota = TC.avaliar(an, txt);
      if (!nota) return;
      const reg = { n: antes.length, nota: nota.nota, texto: nota.texto, perda: nota.perda };
      jogo.notas.push(reg);
      jogo.notaPorLance[antes.length] = nota.nota;
      renderHistorico();
      jogo.ultimaNota = nota;
      if (!jogo.opcoes.semSalvar) D().alterarEstat(e => { e.notas[nota.nota] = (e.notas[nota.nota] || 0) + 1; });
      if (jogo.opcoes.coach !== 'desligado') {
        coachNota(nota); coachTexto(nota.texto);
        if (P.Som) (nota.nota === 'grave' || nota.nota === 'erro' ? P.Som.erro : nota.nota === 'otima' ? P.Som.acerto : () => {})();
      }
      if ((nota.nota === 'erro' || nota.nota === 'grave') && jogo.opcoes.coach !== 'desligado') {
        try {
          const ref = await TC.refutacao(jogo.canalCoach, antes.concat([txt]), regrasDaPartida(), 500);
          if (ref && jogo && jogo.token === token) { nota.texto += ' ' + ref.texto; reg.texto = nota.texto; if (jogo.ultimaNota === nota) coachTexto(nota.texto); }
        } catch (e) { /* sem refutação */ }
      }
      salvar();
      atualizarPainel();
    })();
    await proximo();
  }
  const regrasDaPartida = () => ({ voar: !!jogo.opcoes.voar });

  async function proximo() {
    if (!jogo) return;
    const token = jogo.token;
    marcarVez();
    const sit = jogo.pos.situacao();
    if (sit.fim) return fimDePartida(sit);
    if (jogo.pos.lado === jogo.humano) {
      jogo.vezHumano = true;
      jogo.analise = null;
      atualizarBotoes();
      statusVez();
      render();
      if (P.Som) P.Som.vez();
      const pedido = jogo.lances.slice();
      if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Analisando…</span>'); }
      jogo.promessaAnalise = TC.analisar(jogo.canalCoach, pedido, jogo.opcoes.tempoCoach || 1300).then(an => TC.completar(an, jogo.pos));
      jogo.promessaAnalise.then(an => {
        if (!jogo || jogo.token !== token) return;
        jogo.ultimaAvaliacao = { brancas: an.brancas };
        if (jogo.lances.length !== pedido.length) return;
        jogo.analise = an;
        jogo.conselho = TC.explicar(jogo.pos, an);
        mostrarConselho();
        renderAvaliacao();
        if (jogo.opcoes.autoHeroi && jogo.vezHumano) {
          const m = jogo.pos.lanceDe(an.melhor);
          if (m) setTimeout(() => { if (jogo && jogo.token === token) jogar(m); }, 20);
        }
      }).catch(e => console.error(e));
      return;
    }
    jogo.vezHumano = false;
    atualizarBotoes();
    jogo.ui.status.innerHTML = `Vez de <b>${esc(jogo.bot.nome)}</b>…`;
    jogo.ui.placaBot.pensando.classList.remove('oculto');
    render();
    const t0 = Date.now();
    let r;
    try { r = await IA.lanceDoBot(jogo.canalBot, jogo.lances.slice(), jogo.nivel); }
    catch (e) { console.error(e); r = null; }
    if (!jogo || jogo.token !== token) return;
    const minimo = jogo.opcoes.autoHeroi ? 0 : 450;
    if (Date.now() - t0 < minimo) await esperar(minimo - (Date.now() - t0));
    if (!jogo || jogo.token !== token) return;
    jogo.ui.placaBot.pensando.classList.add('oculto');
    let m = r && r.lance ? jogo.pos.lanceDe(r.lance) : null;
    if (!m) m = jogo.legais[0];
    aplicar(m, true);
    await proximo();
  }

  function atualizarBotoes() {
    const g = jogo.ui;
    const podeDesfazer = jogo.opcoes.desfazer && jogo.vezHumano && jogo.lances.length >= (jogo.humano === Tr.BRANCO ? 2 : 3) && !jogo.fim;
    g.btnDesfazer.disabled = !podeDesfazer;
    if (!jogo.opcoes.desfazer) g.btnDesfazer.innerHTML = 'Desfazer<small>desligado</small>';
    g.btnDica.disabled = !(jogo.vezHumano && jogo.opcoes.coach === 'pedido' && !jogo.dicaVista);
    g.btnDica.innerHTML = 'Dica' + (jogo.opcoes.coach === 'sempre' ? '<small>já na faixa</small>' : jogo.opcoes.coach === 'desligado' ? '<small>coach desligado</small>' : '<small>melhor lance</small>');
  }
  function desfazer() {
    if (!jogo || !jogo.vezHumano || !jogo.opcoes.desfazer) return;
    const tirar = jogo.pos.lado === jogo.humano ? 2 : 1;
    if (jogo.lances.length < tirar) return;
    for (let i = 0; i < tirar; i++) { jogo.pos.desfazer(); jogo.lances.pop(); delete jogo.notaPorLance[jogo.lances.length]; }
    jogo.desfeitos++;
    jogo.ultimoLance = null;
    jogo.legais = jogo.pos.legais();
    jogo.sel = null;
    jogo.token++;
    render();
    salvar();
    proximo();
  }

  // ================================================================ coach
  function aplicarModoCoach() {
    const g = jogo.ui, modo = jogo.opcoes.coach;
    g.coach.classList.toggle('oculto-coach', modo === 'desligado');
    g.painelModos.querySelectorAll('button').forEach(b => b.classList.toggle('ativo', b.dataset.modo === modo));
  }
  function coachTexto(html) { if (jogo) jogo.ui.coachTxt.innerHTML = html; }
  function coachNota(av) {
    const g = jogo.ui;
    g.coachNota.innerHTML = '';
    if (av) g.coachNota.appendChild(el('span', { class: 'feedback-nota nota-' + av.nota, text: av.rotulo }));
  }
  function mostrarConselho() {
    if (!jogo || !jogo.conselho) return;
    const modo = jogo.opcoes.coach;
    if (modo === 'sempre' || jogo.dicaVista) { coachNota(null); coachTexto(jogo.conselho.resumo); }
    else if (modo === 'pedido') coachTexto('<span class="calc">Quer ajuda? Toque em <b>Dica</b>.</span>');
    renderSetas();
    atualizarBotoes();
    atualizarPainel();
  }
  function dica() {
    if (!jogo || !jogo.conselho) return;
    jogo.dicaVista = true;
    mostrarConselho();
    renderAvaliacao();
    if (!painelVisivel()) abrirCoach();
  }
  function conteudoCoach(paraVer) {
    const c = jogo.conselho, ultima = jogo.ultimaNota, modo = jogo.opcoes.coach;
    const corpo = el('div', { class: 'tr-coach-modal' });
    if (modo === 'desligado') corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach desligado</b>Sem dicas durante o jogo. Os seus lances continuam sendo avaliados, e o resumo aparece no fim da partida.' }));
    else {
      if (ultima) corpo.appendChild(el('div', { class: 'bloco tr-ultima' }, el('h4', { text: 'Seu último lance' }), el('p', { html: `<span class="feedback-nota nota-${ultima.nota}">${ultima.rotulo}</span> ${ultima.texto}` })));
      if (c && (modo === 'sempre' || jogo.dicaVista || (modo === 'pedido' && paraVer))) {
        if (modo === 'pedido' && paraVer && !jogo.dicaVista) { jogo.dicaVista = true; mostrarConselho(); renderAvaliacao(); }
        corpo.appendChild(el('div', { class: 'bloco recomendacao' }, el('h4', { text: 'Recomendação' }), el('ul', {}, c.linhas.map(l => el('li', { html: l })))));
        if (jogo.analise) corpo.appendChild(el('div', { class: 'rodape-calc', text: `Busca de ${jogo.analise.profundidade} lances à frente (meios-lances), avaliando todos os seus lances.` }));
      } else if (c && modo === 'pedido') corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach sob pedido</b>Quer ajuda neste lance? Toque em <b>Dica</b>.' }));
      else if (!ultima) corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Analisando…</b>Na sua vez o coach mostra o melhor lance, as trilhas que o adversário ameaça fechar e a avaliação da posição.' }));
    }
    return corpo;
  }
  const painelVisivel = () => !!(jogo && jogo.ui && !jogo.ui.painel.classList.contains('recolhido') && getComputedStyle(jogo.ui.painel).display !== 'none');
  function atualizarPainel() {
    const g = jogo && jogo.ui;
    if (!g) return;
    g.btnCoach.classList.toggle('ativo', painelVisivel());
    if (!painelVisivel()) return;
    g.painelCorpo.innerHTML = '';
    g.painelCorpo.appendChild(conteudoCoach(false));
  }
  function alternarPainel(abrir) {
    const g = jogo && jogo.ui;
    if (!g) return;
    if (getComputedStyle(g.painel).display === 'none') { abrirCoach(); return; }
    const aberto = abrir !== undefined ? abrir : g.painel.classList.contains('recolhido');
    g.painel.classList.toggle('recolhido', !aberto);
    P.Config.set('coachAberto', aberto);
    atualizarPainel();
  }
  function mudarModoCoach(id) {
    if (!jogo) return;
    jogo.opcoes.coach = id;
    const c = D().config(); c.coach = id; D().salvarConfig(c);
    aplicarModoCoach();
    mostrarConselho();
    renderSetas(); renderAvaliacao();
    atualizarBotoes();
    atualizarPainel();
  }
  async function abrirCoach() {
    if (!jogo) return;
    if (painelVisivel()) { conteudoCoach(true); atualizarPainel(); return; }
    if (getComputedStyle(jogo.ui.painel).display !== 'none') { alternarPainel(true); return; }
    const corpo = conteudoCoach(true);
    pausar(true);
    try { await P.UI.modal({ titulo: 'Coach', conteudo: corpo }); } finally { pausar(false); }
  }

  // ======================================================== começo e fim
  function salvar() {
    if (!jogo || jogo.opcoes.semSalvar || jogo.fim) return;
    D().salvar({ cfg: { cor: jogo.humano === Tr.BRANCO ? 'brancas' : 'pretas', nivel: jogo.nivel, bot: jogo.bot, voar: !!jogo.opcoes.voar }, lances: jogo.lances, notas: jogo.notas, notaPorLance: jogo.notaPorLance, desfeitos: jogo.desfeitos });
  }

  /** Começa (ou retoma) uma partida. opcoes: { retomar, cor, nivel, voar, autoHeroi, semSalvar, tempoCoach, coach }. */
  async function iniciar(opcoes) {
    encerrar();
    const cfg = D().config();
    const salva = opcoes.retomar || null;
    let cor = salva ? salva.cfg.cor : opcoes.cor || cfg.cor;
    if (cor === 'sorteio') cor = P.RNG.chance(0.5) ? 'brancas' : 'pretas';
    const nivel = salva ? salva.cfg.nivel : +(opcoes.nivel || cfg.nivel);
    const bot = salva ? salva.cfg.bot : { nome: P.RNG.escolher(IA.NOMES), avatar: P.Bots.sortearAvatar() };
    const voar = salva ? salva.cfg.voar !== false : opcoes.voar !== undefined ? !!opcoes.voar : cfg.voar;
    jogo = {
      token: ++contador, humano: cor === 'brancas' ? Tr.BRANCO : Tr.PRETO, nivel, bot,
      opcoes: Object.assign({ coach: cfg.coach, desfazer: cfg.desfazer }, opcoes, { voar }),
      lances: [], notas: salva ? salva.notas || [] : [], notaPorLance: salva ? salva.notaPorLance || {} : {},
      desfeitos: salva ? salva.desfeitos || 0 : 0, sel: null
    };
    jogo.pos = new Tr.Posicao(null, Tr.BRANCO, null, { voar });
    if (salva) salva.lances.forEach(x => { const m = jogo.pos.lanceDe(x); if (m) { jogo.pos.fazer(m); jogo.lances.push(x); jogo.ultimoLance = m; } });
    jogo.legais = jogo.pos.legais();
    jogo.canalBot = IA.criarCanal({ voar });
    jogo.canalCoach = IA.criarCanal({ voar });
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    render();
    if (salva) P.UI.aviso('<b>Partida retomada.</b>', 'aviso-ouro');
    proximo();
  }

  async function fimDePartida(sit) {
    if (!jogo || jogo.fim) return;
    jogo.fim = true;
    jogo.vezHumano = false;
    marcarVez(); atualizarBotoes(); render();
    const venceu = sit.vencedor === jogo.humano, empate = sit.vencedor === 0;
    const quem = sit.vencedor === jogo.humano ? 'o bot' : 'você';
    const motivo = { 'poucas peças': `${quem} ficou com 2 peças`, bloqueado: `${quem} ficou sem lance (cercado)`, '50 lances sem tirar peça': `${Tr.LIMITE_SEM_TIRAR / 2} lances sem ninguém tirar peça`, 'repetição': 'repetição da posição', desistencia: 'desistência' }[sit.motivo] || sit.motivo;
    if (!jogo.opcoes.semSalvar) {
      D().descartar();
      D().alterarEstat(e => {
        e.partidas++;
        if (venceu) e.vitorias++; else if (empate) e.empates++; else e.derrotas++;
        const k = String(jogo.nivel); e.porNivel[k] = e.porNivel[k] || { v: 0, e: 0, d: 0 };
        e.porNivel[k][venceu ? 'v' : empate ? 'e' : 'd']++;
      });
    }
    document.documentElement.setAttribute('data-trilha-fim', venceu ? 'vitoria' : empate ? 'empate' : 'derrota');
    if (venceu && P.Som) P.Som.vitoria();
    jogo.ui.status.innerHTML = `<b>${venceu ? 'Você venceu' : empate ? 'Empate' : 'Você perdeu'}</b> · ${motivo}`;
    if (jogo.opcoes.autoHeroi) return;
    await esperar(700);
    if (!jogo) return;
    const cont = { otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0 };
    jogo.notas.forEach(x => { cont[x.nota] = (cont[x.nota] || 0) + 1; });
    const tot = jogo.notas.length;
    const corpo = el('div', { class: 'tr-resultado' },
      el('div', { class: 'grande ' + (venceu ? 'nos' : empate ? '' : 'eles'), text: venceu ? 'Você venceu!' : empate ? 'Empate' : 'Você perdeu' }),
      el('div', { style: { textAlign: 'center', color: 'var(--texto-2)', fontSize: '13px' }, text: `${motivo[0].toUpperCase() + motivo.slice(1)} · ${Math.ceil(jogo.lances.length / 2)} lances · nível ${IA.nivel(jogo.nivel).nome}` + (jogo.desfeitos ? ` · ${jogo.desfeitos} ${jogo.desfeitos === 1 ? 'lance desfeito' : 'lances desfeitos'}` : '') }));
    const nt = el('div', { class: 'notas xz-notas' });
    [['otima', 'Ótimas'], ['boa', 'Boas'], ['imprecisa', 'Imprecisas'], ['erro', 'Erros'], ['grave', 'Graves']].forEach(([k, rot]) => nt.appendChild(el('div', { class: 'nota-' + k }, el('b', { text: cont[k] }), el('span', { text: rot }))));
    corpo.appendChild(nt);
    if (tot) corpo.appendChild(el('div', { style: { textAlign: 'center', fontSize: '13px', color: 'var(--texto-2)' }, html: `Precisão: <b>${Math.round(100 * (cont.otima + cont.boa) / tot)}%</b> dos seus lances foram bons ou ótimos.` }));
    const piores = jogo.notas.filter(x => x.nota === 'erro' || x.nota === 'grave').sort((a, b) => b.perda - a.perda).slice(0, 3);
    if (piores.length) {
      const l = el('div', { class: 'piores' });
      piores.forEach(x => l.appendChild(el('div', { html: `<b>Lance ${Math.floor(x.n / 2) + 1}:</b> ${x.texto}` })));
      corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Para rever' }), l));
    }
    pausar(true);
    let escolha;
    try { escolha = await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, botoes: [{ texto: 'Ver o tabuleiro', valor: 'ver' }, { texto: 'Jogar de novo', valor: 'denovo', classe: 'btn-ouro' }] }); }
    finally { pausar(false); }
    if (escolha === 'denovo') iniciar({});
  }

  function encerrar() {
    if (!jogo) return;
    const j = jogo;
    jogo = null;
    j.token = -1;
    if (j.observador) j.observador.disconnect();
    if (j.canalBot) j.canalBot.encerrar();
    if (j.canalCoach) j.canalCoach.encerrar();
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    const raiz = $('#tela-trilha');
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
  }
  async function sair() {
    if (jogo && jogo.fim) { encerrar(); P.App.irPara('trilha'); return; }
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Trilha.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('trilha');
  }
  async function abrirRegras() {
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UITrilha.regrasNo() }); } finally { pausar(false); }
  }
  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar']].concat(jogo.fim ? [['nova', 'Nova partida']] : [['desistir', 'Desistir']])
      .concat(modos.filter(m => m[0] !== jogo.opcoes.coach))
      .concat([['som', P.Config.get('som') ? 'Desligar o som' : 'Ligar o som'], ['sair', 'Sair da partida']]);
    pausar(true);
    let escolha;
    try {
      escolha = await P.UI.modal({ titulo: 'Menu', conteudo: el('div', { class: 'menu-mesa' }),
        aoAbrir: (corpo, fechar) => itens.forEach(([id, txt]) => corpo.firstChild.appendChild(el('button', { class: 'btn' + (id === 'sair' || id === 'desistir' ? ' btn-sair' : ''), text: txt, onclick: () => fechar(id) }))) });
    } finally { pausar(false); }
    if (!escolha || !jogo) return;
    if (escolha === 'sair') return sair();
    if (escolha === 'som') return P.Config.set('som', !P.Config.get('som'));
    if (escolha === 'regras') return abrirRegras();
    if (escolha === 'nova') return iniciar({});
    if (escolha === 'desistir') {
      if (await P.UI.confirmar('Desistir?', 'A partida conta como derrota.', 'Desistir', 'Continuar')) fimDePartida({ fim: true, vencedor: -jogo.humano, motivo: 'desistencia' });
      return;
    }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) mudarModoCoach(modo[0]);
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-trilha').dataset.tema = v; } });

  P.UITrilhaMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, pecaSVG, desenhoMini, _jogo: () => jogo, tocar };
})(window.Poker = window.Poker || {});
