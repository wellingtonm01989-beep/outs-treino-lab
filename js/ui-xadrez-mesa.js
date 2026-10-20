/* ==========================================================================
   OUTS · Treino Lab — ui-xadrez-mesa.js
   O tabuleiro do xadrez, com as peças das outras mesas do app: barra de
   cima, palco escuro com o tabuleiro numa moldura de madeira, as placas dos
   dois jogadores (com as peças capturadas e o relógio), a barra de ações
   (desfazer, dica, virar) e o coach (painel no PC, janela no celular).
   Mover: toque na peça e na casa, ou arraste. O coach mostra o melhor lance
   com uma seta, a barra de avaliação ao lado do tabuleiro e a nota de cada
   lance seu. A partida fica salva a cada lance.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const X = P.Xadrez, IA = X.IA, XC = X.Coach;
  const D = () => X.Dados;
  const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

  // ------------------------------------------------------------------ peças
  // Desenho próprio, no estilo Staunton (viewBox 45×45): b = corpo (com o gradiente de luz,
  // como peça torneada), l = linha de detalhe, o = ponto cheio, h = brilho.
  const BASE = '<path class="b" d="M12.2 31.2h20.6l1.3 3.3H10.9z"/><path class="b" d="M10.4 34.5h24.2a1.6 1.6 0 0 1 1.6 1.6v2.3a1.6 1.6 0 0 1-1.6 1.6H10.4a1.6 1.6 0 0 1-1.6-1.6v-2.3a1.6 1.6 0 0 1 1.6-1.6z"/>';
  const DESENHO = {
    p: '<path class="b" d="M18.4 19.4c-.3 4.4-2.4 8.4-5.6 11.8h19.4c-3.2-3.4-5.3-7.4-5.6-11.8z"/>' +
       '<ellipse class="b" cx="22.5" cy="18.6" rx="6.3" ry="1.9"/>' +
       '<circle class="b" cx="22.5" cy="11.6" r="5.3"/>' +
       '<path class="h" d="M19.2 9.6a3.6 3.6 0 0 1 2.4-1.9M17.4 29.4c1.7-2.4 2.6-5.1 2.9-8.2"/>' + BASE,
    t: '<path class="b" d="M14.6 17.2h15.8l1.6 14H13z"/>' +
       '<path class="b" d="M11.4 7.8h4.6v3.4h3.2V7.8h6.6v3.4H29V7.8h4.6v7l-2.8 2.4H14.2l-2.8-2.4z"/>' +
       '<path class="l" d="M14.4 17.2h16.2M13.4 28.4h18.2M16.2 20.6h12.6"/>' +
       '<path class="h" d="M16.6 19v8.6M13.6 9.6v4.2"/>' + BASE,
    b: '<circle class="b" cx="22.5" cy="6.4" r="2.3"/>' +
       '<path class="b" d="M22.5 8.8c-5.6 3.6-8.1 8-7.6 11.9.4 3 2.9 4.9 7.6 4.9s7.2-1.9 7.6-4.9c.5-3.9-2-8.3-7.6-11.9z"/>' +
       '<ellipse class="b" cx="22.5" cy="26.9" rx="6.6" ry="1.8"/>' +
       '<path class="b" d="M17.7 28.4c-.4 1.3-2 2.3-3.5 2.8h16.6c-1.5-.5-3.1-1.5-3.5-2.8z"/>' +
       '<path class="l" d="M25.7 13.2l-4.6 5.4M19.8 22.4h5.4"/>' +
       '<path class="h" d="M17.2 19.4c-.1-2.2 1-4.6 3.2-6.8"/>' + BASE,
    c: '<path class="b" d="M13.4 31.2c.2-3.4 1.9-6 4.6-7.4-2 .5-4.3.9-6.4.6-1.8-.3-2.9-1.8-2.5-3.5.4-1.9 1.7-3.6 3.4-5.3 2-2 3.9-3.6 5.6-5.6l1.1-5.1 3 3.8.8-3.3 2.4 3.6c5 1.8 8.4 6.2 9.4 12.5.7 4.1.4 7.6-.8 10.2z"/>' +
       '<path class="l" d="M24.6 10.4c3.6 1.6 6.4 5 7.4 9.8M18 23.8c1.6-1.2 2.6-3 2.8-5.1M10.2 22.4c1.2.4 2.4.4 3.4.1"/>' +
       '<circle class="o" cx="18.4" cy="13.6" r="1.25"/><circle class="o" cx="11.3" cy="19.9" r=".75"/>' +
       '<path class="h" d="M15.5 29.6c.6-2.2 1.8-4 3.4-5.2"/>' + BASE,
    d: '<circle class="b" cx="9.6" cy="12.4" r="2.1"/><circle class="b" cx="16" cy="8.8" r="2.1"/><circle class="b" cx="22.5" cy="7.4" r="2.2"/><circle class="b" cx="29" cy="8.8" r="2.1"/><circle class="b" cx="35.4" cy="12.4" r="2.1"/>' +
       '<path class="b" d="M11.4 13.8l2.9 13.6h16.4l2.9-13.6-5.1 8.1.4-11.4-4.3 10.3-2.1-11.6-2.1 11.6-4.3-10.3.4 11.4z"/>' +
       '<path class="b" d="M14.3 27.4h16.4c.2 1.5.7 2.8 1.6 3.8H12.7c.9-1 1.4-2.3 1.6-3.8z"/>' +
       '<path class="l" d="M14.6 27.4h15.8"/>' +
       '<path class="h" d="M14.2 18.6l1.4 6.8"/>' + BASE,
    r: '<path class="b" d="M21.2 2.4h2.6v2.8h2.8v2.5h-2.8v3.1h-2.6V7.7h-2.8V5.2h2.8z"/>' +
       '<path class="b" d="M22.5 10.6c-6.6 0-10.8 3.9-10.4 9 .3 3.2 2 5.9 3.6 7.8h13.6c1.6-1.9 3.3-4.6 3.6-7.8.4-5.1-3.8-9-10.4-9z"/>' +
       '<path class="b" d="M15.7 27.4h13.6l1.4 3.8H14.3z"/>' +
       '<path class="l" d="M22.5 10.8v8.6M14.6 20.4c4.6-1.6 11.2-1.6 15.8 0M15.6 27.4h13.8"/>' +
       '<path class="h" d="M14.6 18.2c.4-2.2 1.9-3.9 4-4.9"/>' + BASE
  };
  // gradientes (uma vez no documento): luz vindo da esquerda, como um torneado
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<linearGradient id="xz-grad-br" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f4eedf"/><stop offset="1" stop-color="#cfc3a6"/></linearGradient>' +
    '<linearGradient id="xz-grad-pr" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0" stop-color="#6c737d"/><stop offset=".4" stop-color="#3a3f47"/><stop offset="1" stop-color="#15171b"/></linearGradient>' +
    '</defs></svg>';
  /** Os gradientes das peças ficam uma vez só no documento. */
  function garantirDefs() {
    if (document.getElementById('xz-grad-br') || !document.body) return;
    const d = document.createElement('div');
    d.innerHTML = DEFS;
    document.body.appendChild(d.firstChild);
  }
  garantirDefs();
  const LETRA = [null, 'p', 'c', 'b', 't', 'd', 'r'];
  /** SVG da peça: k = 'r','d','t','b','c','p' (ou o tipo do motor), cor = 'b' (brancas) ou 'p' (pretas). */
  function pecaSVG(k, cor) {
    garantirDefs();
    const l = typeof k === 'number' ? LETRA[k] : k;
    return `<svg class="xz-peca-svg ${cor === 'p' ? 'pr' : 'br'}" viewBox="0 0 45 45" aria-hidden="true">${DESENHO[l]}</svg>`;
  }

  let jogo = null, pausas = 0, contador = 0;
  function pausar(p) { pausas = Math.max(0, pausas + (p ? 1 : -1)); }
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-xadrez');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    g.raiz = el('div', { class: 'tr-jogo xz-jogo', 'data-tema': P.Config.get('tema') || 'verde' });
    const nv = IA.nivel(jogo.nivel);
    const rel = jogo.relogio ? ` · ${Math.round(jogo.relogio.base / 60)} min` + (jogo.relogio.inc ? ` + ${jogo.relogio.inc} s` : '') : '';
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra xz-barra' },
      el('span', { class: 'rotulo', text: 'Xadrez' }),
      el('span', { class: 'detalhe', text: `você de ${jogo.humano === X.BRANCO ? 'brancas' : 'pretas'} · bot ${nv.nome.toLowerCase()}${rel}` }),
      el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      el('button', { class: 'btn so-largo', text: 'Virar', title: 'Virar o tabuleiro', onclick: () => virar() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));

    // placas
    const placa = quem => {
      const p = { raiz: null };
      const info = quem === 'bot' ? jogo.bot : { nome: P.Config.get('nome') || 'Você', avatar: null };
      p.capt = el('div', { class: 'xz-capturadas' });
      p.relogio = el('div', { class: 'xz-relogio' + (jogo.relogio ? '' : ' oculto') });
      p.pensando = el('span', { class: 'xz-pensando oculto', text: 'pensando…' });
      p.raiz = el('div', { class: 'xz-placa ' + quem },
        el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, quem !== 'bot') }),
        el('div', { class: 'info' },
          el('span', { class: 'nome', html: esc(quem === 'bot' ? info.nome : 'Você') + (quem === 'bot' ? ` <span class="tag-perfil" style="--cor-perfil:${['#7aa2c7', '#4fbf8b', '#d9a441', '#e07a5f', '#b794f4'][nv.id - 1]}">${nv.nome.toUpperCase().slice(0, 3)}</span>` : '') }),
          el('div', { class: 'linha2' }, p.capt, p.pensando)),
        p.relogio);
      return p;
    };
    g.placaBot = placa('bot'); g.placaEu = placa('eu');
    // tabuleiro
    g.tab = el('div', { class: 'xz-tabuleiro' });
    g.casas = [];
    for (let i = 0; i < 64; i++) { const c = el('div', { class: 'xz-casa' }); g.casas.push(c); g.tab.appendChild(c); }
    g.setas = el('div', { class: 'xz-setas' });
    g.tab.appendChild(g.setas);
    g.aval = el('div', { class: 'xz-avaliacao', title: 'Avaliação do coach' }, el('i'), el('span'));
    g.moldura = el('div', { class: 'xz-moldura' }, g.tab);
    g.tabCaixa = el('div', { class: 'xz-tab-caixa' }, g.aval, g.moldura);
    g.hist = el('div', { class: 'xz-hist', title: 'Lances da partida' });
    g.area = el('div', { class: 'xz-area' }, g.placaBot.raiz, g.tabCaixa, g.placaEu.raiz, g.hist);
    g.promo = el('div', { class: 'xz-promo oculto' });
    g.palco = el('div', { class: 'mesa-palco xz-palco' }, g.area, g.promo,
      el('button', { class: 'btn-barra so-celular tr-btn-menu', title: 'Menu', html: '&#9776;', onclick: abrirMenu }));
    // ações
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada lance seu.</span>' });
    g.coachNota = el('span');
    g.coach = el('div', { class: 'tr-coach', title: 'Ver a análise do coach', onclick: () => abrirCoach() }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt);
    g.status = el('div', { class: 'tr-status' });
    g.btnDesfazer = el('button', { class: 'btn-acao btn-cobrir', html: 'Desfazer<small>volta seu lance</small>', onclick: () => desfazer() });
    g.btnDica = el('button', { class: 'btn-acao btn-tr-dica', html: 'Dica', onclick: () => dica() });
    g.btnVirar = el('button', { class: 'btn-acao btn-aceitar', html: 'Virar<small>o tabuleiro</small>', onclick: () => virar() });
    g.acoes = el('div', { class: 'barra-acoes tr-acoes xz-acoes' },
      el('div', { class: 'acoes-esquerda' }, g.status, g.coach),
      el('div', { class: 'acoes-botoes' }, g.btnDesfazer, g.btnDica, g.btnVirar));
    // painel do coach (PC)
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
    ligarTabuleiro();
    aplicarModoCoach();
    if (jogo.observador) jogo.observador.disconnect();
    jogo.observador = new ResizeObserver(() => layout());
    jogo.observador.observe(g.palco);
    layout();
  }

  // ============================================================== geometria
  /**
   * Em pé: placa do bot, barra de avaliação (deitada), tabuleiro na largura toda,
   * a sua placa e os lances embaixo — tudo centrado no espaço que sobra.
   * Deitado e no PC: as placas e a lista de lances à esquerda, o tabuleiro à direita.
   */
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
      const reserva = compacto ? 44 : 0;          // o botão ☰ no canto
      L = Math.min(H - 2 * pad - 2 * moldura, W - 2 * pad - placaL - 14 - avalL - gapAval - 2 * moldura - reserva);
      g.raiz.style.setProperty('--xz-placa-l', placaL + 'px');
    } else {
      const avalH = compacto ? 8 : 10;
      let histH = 30;
      const porLargura = W - 2 * pad - 2 * moldura;
      const porAltura = H - 2 * pad - 2 * placaH - avalH - histH - 4 * gap - 2 * moldura;
      L = Math.min(porLargura, porAltura);
      // sobrou altura (o tabuleiro já ocupa a largura toda): os lances ganham uma segunda linha
      if (porAltura - porLargura > 70) histH = 56;
      g.area.classList.toggle('hist-alto', histH > 30);
      g.raiz.style.setProperty('--xz-hist-h', histH + 'px');
      const total = Math.max(200, L) + 2 * moldura + 2 * placaH + avalH + histH + 4 * gap;
      apertado = (H - total) / 2 < 44 && W - (Math.max(200, L) + 2 * moldura) < 92;   // a placa de cima não pode ficar embaixo do ☰
      g.raiz.style.setProperty('--xz-aval-h', avalH + 'px');
    }
    L = Math.max(200, Math.floor(L / 8) * 8);
    g.area.classList.toggle('apertado', apertado);
    g.raiz.style.setProperty('--xz-l', L + 'px');
    g.raiz.style.setProperty('--xz-placa-h', placaH + 'px');
    g.raiz.style.setProperty('--xz-moldura', moldura + 'px');
    g.raiz.style.setProperty('--xz-gap', gap + 'px');
    renderAvaliacao();
  }

  // ============================================================== desenho
  const visao = () => jogo.virado ? (jogo.humano === X.BRANCO ? X.PRETO : X.BRANCO) : jogo.humano;
  /** Índice da casa na grade (0 = canto de cima à esquerda) → casa 0x88. */
  function casaDaGrade(i) {
    const lin = Math.floor(i / 8), col = i % 8;
    return visao() === X.BRANCO ? (7 - lin) * 16 + col : lin * 16 + (7 - col);
  }
  function gradeDaCasa(s) {
    const lin = s >> 4, col = s & 7;
    return visao() === X.BRANCO ? (7 - lin) * 8 + col : lin * 8 + (7 - col);
  }

  function render(animar) {
    const g = jogo.ui, pos = jogo.pos;
    const ultimo = jogo.ultimoLance || null;
    const xeque = pos.emXeque() ? pos.reis[pos.lado ? 1 : 0] : -1;
    const sel = jogo.sel;
    const destinos = sel !== null && sel !== undefined ? jogo.legais.filter(m => X.deL(m) === sel) : [];
    const anterior = jogo.posicoesDom || {};
    const novos = {};
    g.casas.forEach((c, i) => {
      const s = casaDaGrade(i), lin = s >> 4, col = s & 7;
      const clara = (lin + col) % 2 === 1;
      let cls = 'xz-casa ' + (clara ? 'clara' : 'escura');
      if (ultimo && (X.deL(ultimo) === s || X.paraL(ultimo) === s)) cls += ' ultimo';
      if (s === sel) cls += ' sel';
      if (s === xeque) cls += ' xeque';
      const dest = destinos.find(m => X.paraL(m) === s);
      if (dest) cls += pos.t[s] || (X.marcasL(dest) & X.M_EP) ? ' alvo-capt' : ' alvo';
      c.className = cls;
      c.dataset.casa = s;
      // coordenadas na borda
      let coord = '';
      const iLin = Math.floor(i / 8), iCol = i % 8;
      if (iCol === 0) coord += `<span class="xz-coord lin">${lin + 1}</span>`;
      if (iLin === 7) coord += `<span class="xz-coord col">${'abcdefgh'[col]}</span>`;
      const p = pos.t[s];
      const html = coord + (p ? `<div class="xz-peca" data-p="${p}">${pecaSVG(X.tipo(p), X.corDe(p) === X.BRANCO ? 'b' : 'p')}</div>` : '');
      if (c._html !== html) { c.innerHTML = html; c._html = html; }
      if (p) novos[s] = p;
    });
    // animação do lance: a peça desliza da casa de origem
    if (animar && ultimo) {
      const de = X.deL(ultimo), para = X.paraL(ultimo);
      const peca = g.casas[gradeDaCasa(para)].querySelector('.xz-peca');
      if (peca) {
        const a = gradeDaCasa(de), b = gradeDaCasa(para);
        const L = g.tab.clientWidth / 8;
        const dx = ((a % 8) - (b % 8)) * L, dy = (Math.floor(a / 8) - Math.floor(b / 8)) * L;
        peca.style.transition = 'none';
        peca.style.transform = `translate(${dx}px, ${dy}px)`;
        peca.style.zIndex = 5;
        void peca.offsetWidth;
        peca.style.transition = 'transform 180ms ease';
        peca.style.transform = '';
        setTimeout(() => { peca.style.zIndex = ''; }, 200);
      }
    }
    jogo.posicoesDom = novos;
    void anterior;
    renderSetas();
    renderCapturadas();
    renderAvaliacao();
    renderHistorico();
  }

  /** Os lances da partida (com a nota do coach nos seus), sempre mostrando o último. */
  function renderHistorico() {
    const g = jogo.ui;
    let h = '';
    for (let i = 0; i < jogo.sans.length; i++) {
      if (i % 2 === 0) h += `<span class="num">${i / 2 + 1}.</span>`;
      const nota = jogo.notaPorLance[i];
      h += `<span class="lance${nota ? ' n-' + nota : ''}${i === jogo.sans.length - 1 ? ' ultimo' : ''}">${esc(jogo.sans[i])}</span>`;
    }
    if (!h) h = '<span class="vazio">Os lances aparecem aqui.</span>';
    if (g.hist._html === h) return;
    g.hist.innerHTML = h;
    g.hist._html = h;
    const ult = g.hist.querySelector('.ultimo');
    if (ult) { if (g.hist.scrollWidth > g.hist.clientWidth + 2) g.hist.scrollLeft = g.hist.scrollWidth; g.hist.scrollTop = g.hist.scrollHeight; }
  }

  function renderSetas() {
    const g = jogo.ui;
    g.setas.innerHTML = '';
    const c = jogo.conselho;
    if (!c || !jogo.analise || !jogo.analise.melhor || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista) || jogo.pos.lado !== jogo.humano) return;
    const m = jogo.pos.lanceDe(jogo.analise.melhor);
    if (!m) return;
    const a = gradeDaCasa(X.deL(m)), b = gradeDaCasa(X.paraL(m));
    const cx = i => (i % 8) * 12.5 + 6.25, cy = i => Math.floor(i / 8) * 12.5 + 6.25;
    const x1 = cx(a), y1 = cy(a), x2 = cx(b), y2 = cy(b);
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const xb = x2 - ux * 3.2, yb = y2 - uy * 3.2;
    g.setas.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="${x1}" y1="${y1}" x2="${xb}" y2="${yb}" stroke-width="2.4" stroke-linecap="round"/><polygon points="${x2},${y2} ${xb - uy * 2.6},${yb + ux * 2.6} ${xb + uy * 2.6},${yb - ux * 2.6}"/></svg>`;
  }

  /** Peças capturadas por cada lado e a diferença de material. */
  function renderCapturadas() {
    const g = jogo.ui, t = jogo.pos.t;
    const inicial = [0, 8, 2, 2, 2, 1, 1];
    const conta = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
    for (let s = 0; s < 128; s++) { if (X.fora(s)) { s += 7; continue; } const p = t[s]; if (p) conta[X.corDe(p) ? 1 : 0][X.tipo(p)]++; }
    const val = [0, 1, 3, 3, 5, 9, 0];
    const material = c => conta[c].reduce((s, n, k) => s + n * val[k], 0);
    const capturadasDe = c => {   // peças da cor c que saíram (promoção pode deixar negativo)
      let h = '';
      [5, 4, 3, 2, 1].forEach(k => { const n = Math.max(0, inicial[k] - conta[c][k]); for (let i = 0; i < n; i++) h += pecaSVG(k, c ? 'p' : 'b'); });
      return h;
    };
    const eu = jogo.humano === X.BRANCO ? 0 : 1, bot = 1 - eu;
    const dif = material(eu) - material(bot);
    g.placaEu.capt.innerHTML = capturadasDe(bot) + (dif > 0 ? `<b>+${dif}</b>` : '');
    g.placaBot.capt.innerHTML = capturadasDe(eu) + (dif < 0 ? `<b>+${-dif}</b>` : '');
  }

  function renderAvaliacao() {
    const g = jogo.ui, an = jogo.ultimaAvaliacao;
    const mostrar = an && jogo.opcoes.coach !== 'desligado' && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista || jogo.fim);
    g.aval.classList.toggle('oculta', !mostrar);
    if (!mostrar) return;
    const cpB = an.brancas, mateB = an.mateBrancas;
    const pB = mateB ? (mateB > 0 ? 1 : 0) : XC.chance(cpB);
    const frac = visao() === X.BRANCO ? pB : 1 - pB;
    const deitada = g.area.classList.contains('retrato');
    g.aval.firstChild.style.height = deitada ? '' : Math.round(frac * 100) + '%';
    g.aval.firstChild.style.width = deitada ? Math.round(frac * 100) + '%' : '';
    g.aval.classList.toggle('pretas-embaixo', visao() !== X.BRANCO);
    g.aval.lastChild.textContent = XC.textoAvaliacao(cpB, mateB);
  }

  function renderRelogios() {
    const g = jogo.ui, r = jogo.relogio;
    if (!r) return;
    const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const eu = jogo.humano === X.BRANCO ? 'b' : 'p', bot = eu === 'b' ? 'p' : 'b';
    g.placaEu.relogio.textContent = fmt(r[eu]); g.placaBot.relogio.textContent = fmt(r[bot]);
    const vez = jogo.pos.lado === X.BRANCO ? 'b' : 'p';
    g.placaEu.relogio.classList.toggle('ativo', vez === eu && !jogo.fim);
    g.placaBot.relogio.classList.toggle('ativo', vez === bot && !jogo.fim);
    g.placaEu.relogio.classList.toggle('pouco', r[eu] < 20000);
    g.placaBot.relogio.classList.toggle('pouco', r[bot] < 20000);
  }
  function marcarVez() {
    const g = jogo.ui, vezEu = jogo.pos.lado === jogo.humano && !jogo.fim;
    g.placaEu.raiz.classList.toggle('vez', vezEu);
    g.placaBot.raiz.classList.toggle('vez', !vezEu && !jogo.fim);
  }

  // ========================================================= interação
  function ligarTabuleiro() {
    const g = jogo.ui;
    let arrasto = null;
    const casaNoPonto = (x, y) => {
      const r = g.tab.getBoundingClientRect();
      if (x < r.left || y < r.top || x >= r.right || y >= r.bottom) return null;
      const col = Math.floor((x - r.left) / (r.width / 8)), lin = Math.floor((y - r.top) / (r.height / 8));
      return casaDaGrade(lin * 8 + col);
    };
    g.tab.addEventListener('pointerdown', e => {
      if (!podeMover()) return;
      const s = casaNoPonto(e.clientX, e.clientY);
      if (s === null) return;
      const p = jogo.pos.t[s];
      if (jogo.sel !== null && jogo.sel !== undefined && jogo.legais.some(m => X.deL(m) === jogo.sel && X.paraL(m) === s)) { tentar(jogo.sel, s); return; }
      if (p && X.corDe(p) === jogo.humano) {
        jogo.sel = s; render();
        const peca = g.casas[gradeDaCasa(s)].querySelector('.xz-peca');
        if (peca) {
          arrasto = { s, peca, x0: e.clientX, y0: e.clientY, movendo: false };
          g.tab.setPointerCapture(e.pointerId);
        }
      } else { jogo.sel = null; render(); }
    });
    g.tab.addEventListener('pointermove', e => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x0, dy = e.clientY - arrasto.y0;
      if (!arrasto.movendo && Math.hypot(dx, dy) < 6) return;
      arrasto.movendo = true;
      arrasto.peca.style.transition = 'none';
      arrasto.peca.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
      arrasto.peca.style.zIndex = 10;
    });
    const soltar = e => {
      if (!arrasto) return;
      const a = arrasto; arrasto = null;
      if (!a.movendo) return;
      const s = casaNoPonto(e.clientX, e.clientY);
      a.peca.style.transform = ''; a.peca.style.zIndex = '';
      if (s !== null && s !== a.s && jogo.legais.some(m => X.deL(m) === a.s && X.paraL(m) === s)) tentar(a.s, s, true);
      else render();
    };
    g.tab.addEventListener('pointerup', soltar);
    g.tab.addEventListener('pointercancel', () => { if (arrasto) { arrasto.peca.style.transform = ''; arrasto = null; render(); } });
  }
  const podeMover = () => !!(jogo && jogo.vezHumano && !jogo.fim && jogo.pos.lado === jogo.humano);

  /** Tenta o lance de → para (pergunta a promoção, se for o caso). */
  function tentar(de, para, semAnimar) {
    const ms = jogo.legais.filter(m => X.deL(m) === de && X.paraL(m) === para);
    if (!ms.length) return;
    jogo.sel = null;
    if (ms.length > 1) { escolherPromocao(ms, semAnimar); return; }
    lanceHumano(ms[0], !semAnimar);
  }
  function escolherPromocao(ms, semAnimar) {
    const g = jogo.ui, cor = jogo.humano === X.BRANCO ? 'b' : 'p';
    g.promo.innerHTML = '';
    g.promo.appendChild(el('div', { class: 'xz-promo-tit', text: 'Promover para' }));
    const linha = el('div', { class: 'xz-promo-linha' });
    [X.DAMA, X.TORRE, X.BISPO, X.CAVALO].forEach(k => {
      const m = ms.find(x => X.promoL(x) === k);
      linha.appendChild(el('button', { class: 'xz-promo-op', html: pecaSVG(k, cor), title: XC.NOME[k], onclick: () => { g.promo.classList.add('oculto'); lanceHumano(m, !semAnimar); } }));
    });
    g.promo.appendChild(linha);
    g.promo.appendChild(el('button', { class: 'btn', text: 'Cancelar', onclick: () => { g.promo.classList.add('oculto'); render(); } }));
    g.promo.classList.remove('oculto');
  }

  // ============================================================== partida
  function aplicar(m, animar) {
    const pos = jogo.pos;
    const san = pos.san(m, jogo.legais.length ? jogo.legais : undefined);
    const capt = X.marcasL(m) & X.M_CAPT;
    pos.fazer(m);
    jogo.lances.push(X.uci(m));
    jogo.sans.push(san);
    jogo.ultimoLance = m;
    jogo.legais = pos.legais();
    if (jogo.relogio && jogo.lances.length > 1) {
      const quem = pos.lado === X.BRANCO ? 'p' : 'b';   // quem acabou de jogar
      jogo.relogio[quem] += jogo.relogio.inc * 1000;
    }
    render(animar);
    if (P.Som) (capt ? P.Som.ficha : P.Som.carta)();
    if (pos.emXeque() && P.Som) P.Som.alerta();
    salvar();
  }

  async function lanceHumano(m, animar) {
    if (!podeMover()) return;
    jogo.vezHumano = false;
    const antes = { fen: jogo.fen0, lances: jogo.lances.slice() };
    const uci = X.uci(m);
    const analise = jogo.analise, promessa = jogo.promessaAnalise;
    aplicar(m, animar);
    jogo.conselho = null; jogo.dicaVista = false;
    renderSetas();
    const token = jogo.token;
    // nota do lance (quando a análise da vez terminar)
    (async () => {
      let an = analise;
      try { if (!an && promessa) an = await promessa; } catch (e) { an = null; }
      if (!jogo || jogo.token !== token || !an) return;
      const nota = XC.avaliar(antes, an, uci);
      if (!nota) return;
      const reg = { n: antes.lances.length, nota: nota.nota, texto: nota.texto, perda: nota.perda, san: nota.jogadoSan };
      jogo.notas.push(reg);
      jogo.notaPorLance[antes.lances.length] = nota.nota;
      renderHistorico();
      jogo.ultimaNota = nota;
      if (!jogo.opcoes.semSalvar) D().alterarEstat(e => { e.notas[nota.nota] = (e.notas[nota.nota] || 0) + 1; });
      if (jogo.opcoes.coach !== 'desligado') {
        coachNota(nota); coachTexto(nota.texto);
        if (P.Som) (nota.nota === 'grave' || nota.nota === 'erro' ? P.Som.erro : nota.nota === 'otima' ? P.Som.acerto : () => {})();
      }
      if ((nota.nota === 'erro' || nota.nota === 'grave') && jogo.opcoes.coach !== 'desligado') {
        try {
          const ref = await XC.refutacao(jogo.canalCoach, { fen: jogo.fen0, lances: antes.lances.concat([uci]) }, 500);
          if (ref && jogo && jogo.token === token) { nota.texto += ' ' + ref.texto; reg.texto = nota.texto; if (jogo.ultimaNota === nota) coachTexto(nota.texto); }
        } catch (e) { /* sem refutação */ }
      }
      salvar();
      atualizarPainel();
    })();
    await proximo();
  }

  /** Quem joga agora: você (espera o lance, com o coach analisando) ou o bot. */
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
      jogo.ui.status.innerHTML = jogo.pos.emXeque() ? '<b>Xeque!</b> Tire o rei do ataque' : '<b>Sua vez:</b> toque numa peça e na casa (ou arraste)';
      if (P.Som) P.Som.vez();
      // análise do coach (em segundo plano)
      const pedido = { fen: jogo.fen0, lances: jogo.lances.slice() };
      if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Analisando…</span>'); }
      jogo.promessaAnalise = XC.analisar(jogo.canalCoach, pedido, jogo.opcoes.tempoCoach || 1400);
      jogo.promessaAnalise.then(an => {
        if (!jogo || jogo.token !== token) return;
        jogo.ultimaAvaliacao = { brancas: an.brancas, mateBrancas: an.lado === X.BRANCO ? an.mate : -an.mate };
        if (jogo.lances.length !== pedido.lances.length) return;   // você já jogou
        jogo.analise = an;
        jogo.conselho = XC.explicar(pedido, an);
        mostrarConselho();
        renderAvaliacao();
        if (jogo.opcoes.autoHeroi && jogo.vezHumano) {
          const m = jogo.pos.lanceDe(an.melhor);
          if (m) setTimeout(() => { if (jogo && jogo.token === token) lanceHumano(m, false); }, 20);
        }
      }).catch(e => console.error(e));
      return;
    }
    // vez do bot
    jogo.vezHumano = false;
    atualizarBotoes();
    jogo.ui.status.innerHTML = `Vez de <b>${esc(jogo.bot.nome)}</b>…`;
    jogo.ui.placaBot.pensando.classList.remove('oculto');
    const t0 = Date.now();
    let r;
    try { r = await IA.lanceDoBot(jogo.canalBot, { fen: jogo.fen0, lances: jogo.lances.slice() }, jogo.nivel); }
    catch (e) { console.error(e); r = null; }
    if (!jogo || jogo.token !== token) return;
    // um tempinho mínimo (lance do livro ou nível baixo responderia instantâneo)
    const minimo = jogo.opcoes.autoHeroi ? 0 : 450;
    if (Date.now() - t0 < minimo) await esperar(minimo - (Date.now() - t0));
    if (!jogo || jogo.token !== token) return;
    jogo.ui.placaBot.pensando.classList.add('oculto');
    let m = r && r.uci ? jogo.pos.lanceDe(r.uci) : null;
    if (!m) m = jogo.legais[0];
    aplicar(m, true);
    await proximo();
  }

  function atualizarBotoes() {
    const g = jogo.ui;
    const podeDesfazer = jogo.opcoes.desfazer && jogo.vezHumano && jogo.lances.length >= (jogo.humano === X.BRANCO ? 2 : 3) && !jogo.fim;
    g.btnDesfazer.disabled = !podeDesfazer;
    if (!jogo.opcoes.desfazer) g.btnDesfazer.innerHTML = 'Desfazer<small>desligado</small>';
    g.btnDica.disabled = !(jogo.vezHumano && jogo.opcoes.coach === 'pedido' && !jogo.dicaVista);
    g.btnDica.innerHTML = 'Dica' + (jogo.opcoes.coach === 'sempre' ? '<small>já na faixa</small>' : jogo.opcoes.coach === 'desligado' ? '<small>coach desligado</small>' : '<small>melhor lance</small>');
    g.btnVirar.disabled = false;
  }

  /** Desfaz o seu último lance (e a resposta do bot). */
  function desfazer() {
    if (!jogo || !jogo.vezHumano || !jogo.opcoes.desfazer) return;
    const tirar = jogo.pos.lado === jogo.humano ? 2 : 1;
    if (jogo.lances.length < tirar) return;
    for (let i = 0; i < tirar; i++) { jogo.pos.desfazer(); jogo.lances.pop(); jogo.sans.pop(); delete jogo.notaPorLance[jogo.lances.length]; }
    jogo.desfeitos++;
    jogo.ultimoLance = null;
    jogo.legais = jogo.pos.legais();
    jogo.sel = null;
    jogo.token++;          // descarta análises em andamento
    render();
    salvar();
    proximo();
  }

  function virar() { if (!jogo) return; jogo.virado = !jogo.virado; render(); renderAvaliacao(); }

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
    if (av) g.coachNota.appendChild(el('span', { class: 'feedback-nota nota-' + (av.nota === 'grave' ? 'grave' : av.nota), text: av.rotulo }));
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
        if (jogo.analise) corpo.appendChild(el('div', { class: 'rodape-calc', text: `Busca de ${jogo.analise.profundidade} lances à frente (meio-lances), avaliando todos os seus lances.` }));
      } else if (c && modo === 'pedido') corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach sob pedido</b>Quer ajuda neste lance? Toque em <b>Dica</b>.' }));
      else if (!ultima) corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Analisando…</b>Na sua vez o coach mostra o melhor lance, o que está ameaçado e a avaliação da posição.' }));
    }
    // lista de lances
    if (jogo.sans.length) {
      const lista = el('div', { class: 'xz-lances' });
      const offset = jogo.inicioPretas ? 1 : 0;
      for (let i = 0; i < jogo.sans.length; i++) {
        const k = i + offset;
        if (k % 2 === 0) lista.appendChild(el('span', { class: 'num', text: (Math.floor(k / 2) + 1) + '.' }));
        else if (i === 0) { lista.appendChild(el('span', { class: 'num', text: '1.' })); lista.appendChild(el('span', { class: 'lance', text: '…' })); }
        const nota = jogo.notaPorLance[i];
        lista.appendChild(el('span', { class: 'lance' + (nota ? ' n-' + nota : ''), text: jogo.sans[i] }));
      }
      corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Lances' }), lista));
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
    const l = g.painelCorpo.querySelector('.xz-lances');
    if (l) l.scrollTop = l.scrollHeight;
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

  // ================================================================ relógio
  function tique() {
    if (!jogo || !jogo.relogio || jogo.fim) return;
    const agora = Date.now(), dt = agora - (jogo.relogio.ultimo || agora);
    jogo.relogio.ultimo = agora;
    if (pausas === 0 && jogo.lances.length >= 1) {
      const vez = jogo.pos.lado === X.BRANCO ? 'b' : 'p';
      jogo.relogio[vez] -= dt;
      if (jogo.relogio[vez] <= 0) {
        jogo.relogio[vez] = 0;
        renderRelogios();
        const perdeu = vez === 'b' ? X.BRANCO : X.PRETO;
        fimDePartida({ fim: true, resultado: perdeu === X.BRANCO ? '0-1' : '1-0', motivo: 'tempo' });
        return;
      }
    }
    renderRelogios();
  }

  // ======================================================== começo e fim
  function salvar() {
    if (!jogo || jogo.opcoes.semSalvar || jogo.fim) return;
    const r = jogo.relogio;
    D().salvar({ cfg: { cor: jogo.humano === X.BRANCO ? 'brancas' : 'pretas', nivel: jogo.nivel, bot: jogo.bot }, fen0: jogo.fen0, lances: jogo.lances, sans: jogo.sans, notas: jogo.notas, notaPorLance: jogo.notaPorLance,
      relogio: r ? { base: r.base, inc: r.inc, b: r.b, p: r.p } : null, desfeitos: jogo.desfeitos });
  }

  /** Começa (ou retoma) uma partida. opcoes: { retomar, cor, nivel, autoHeroi, semSalvar, tempoCoach, coach }. */
  async function iniciar(opcoes) {
    encerrar();
    const cfg = D().config();
    const salva = opcoes.retomar || null;
    let cor = salva ? salva.cfg.cor : opcoes.cor || cfg.cor;
    if (cor === 'sorteio') cor = P.RNG.chance(0.5) ? 'brancas' : 'pretas';
    const nivel = salva ? salva.cfg.nivel : +(opcoes.nivel || cfg.nivel);
    const nomes = ['Magnólia', 'Bóris', 'Tal Vez', 'Capa Branca', 'Rainha Ana', 'Peão Pedro', 'Dona Torre', 'Cavaleiro Zé', 'Bispo Lu', 'Roque Silva'];
    const bot = salva ? salva.cfg.bot : { nome: P.RNG.escolher(nomes), avatar: P.Bots.sortearAvatar() };
    const rs = salva ? salva.relogio : (cfg.relogio ? { base: cfg.relogio, inc: (D().RELOGIOS.find(x => x[0] === cfg.relogio) || [0, 0])[1] } : null);
    jogo = {
      token: ++contador, humano: cor === 'brancas' ? X.BRANCO : X.PRETO, nivel, bot,
      opcoes: Object.assign({ coach: cfg.coach, desfazer: cfg.desfazer }, opcoes),
      fen0: salva ? salva.fen0 : X.FEN_INICIAL, lances: [], sans: [], notas: salva ? salva.notas || [] : [], notaPorLance: salva ? salva.notaPorLance || {} : {},
      desfeitos: salva ? salva.desfeitos || 0 : 0, virado: false, sel: null,
      relogio: rs ? { base: rs.base, inc: rs.inc, b: rs.b !== undefined ? rs.b : rs.base * 1000, p: rs.p !== undefined ? rs.p : rs.base * 1000, ultimo: Date.now() } : null
    };
    jogo.pos = new X.Posicao(jogo.fen0);
    jogo.inicioPretas = jogo.pos.lado === X.PRETO;
    if (salva) salva.lances.forEach(u => { const m = jogo.pos.lanceDe(u); if (m) { jogo.sans.push(jogo.pos.san(m)); jogo.pos.fazer(m); jogo.lances.push(u); jogo.ultimoLance = m; } });
    jogo.legais = jogo.pos.legais();
    jogo.canalBot = IA.criarCanal();
    jogo.canalCoach = IA.criarCanal();
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    render();
    renderRelogios();
    if (jogo.relogio) jogo.relogioTimer = setInterval(tique, 200);
    if (salva) P.UI.aviso('<b>Partida retomada.</b>', 'aviso-ouro');
    proximo();
  }

  async function fimDePartida(sit) {
    if (!jogo || jogo.fim) return;
    jogo.fim = true;
    jogo.vezHumano = false;
    marcarVez(); renderRelogios(); atualizarBotoes();
    const eu = jogo.humano;
    const venceu = (sit.resultado === '1-0' && eu === X.BRANCO) || (sit.resultado === '0-1' && eu === X.PRETO);
    const empate = sit.resultado === '1/2-1/2';
    const motivo = { mate: 'xeque-mate', afogamento: 'afogamento', '50lances': '50 lances sem captura nem lance de peão', repeticao: 'repetição da posição', material: 'material insuficiente', tempo: 'tempo esgotado', desistencia: 'desistência' }[sit.motivo] || sit.motivo;
    if (!jogo.opcoes.semSalvar) {
      D().descartar();
      D().alterarEstat(e => {
        e.partidas++;
        if (venceu) e.vitorias++; else if (empate) e.empates++; else e.derrotas++;
        const k = String(jogo.nivel); e.porNivel[k] = e.porNivel[k] || { v: 0, e: 0, d: 0 };
        e.porNivel[k][venceu ? 'v' : empate ? 'e' : 'd']++;
      });
    }
    document.documentElement.setAttribute('data-xadrez-fim', venceu ? 'vitoria' : empate ? 'empate' : 'derrota');
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
      piores.forEach(x => l.appendChild(el('div', { html: `<b>Lance ${Math.floor((x.n + (jogo.inicioPretas ? 1 : 0)) / 2) + 1}:</b> ${x.texto}` })));
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
    if (j.relogioTimer) clearInterval(j.relogioTimer);
    if (j.observador) j.observador.disconnect();
    if (j.canalBot) j.canalBot.encerrar();
    if (j.canalCoach) j.canalCoach.encerrar();
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    const raiz = $('#tela-xadrez');
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
  }

  async function sair() {
    if (jogo && jogo.fim) { encerrar(); P.App.irPara('xadrez'); return; }
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Xadrez.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('xadrez');
  }
  async function abrirRegras() {
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UIXadrez.regrasNo() }); } finally { pausar(false); }
  }
  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar'], ['virar', 'Virar o tabuleiro']].concat(jogo.fim ? [['nova', 'Nova partida']] : [['desistir', 'Desistir']])
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
    if (escolha === 'virar') return virar();
    if (escolha === 'nova') return iniciar({});
    if (escolha === 'desistir') {
      if (await P.UI.confirmar('Desistir?', 'A partida conta como derrota.', 'Desistir', 'Continuar')) fimDePartida({ fim: true, resultado: jogo.humano === X.BRANCO ? '0-1' : '1-0', motivo: 'desistencia' });
      return;
    }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) mudarModoCoach(modo[0]);
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-xadrez').dataset.tema = v; } });

  P.UIXadrezMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, pecaSVG, _jogo: () => jogo };
})(window.Poker = window.Poker || {});
