/* ==========================================================================
   OUTS · Treino Lab — ui-damas-mesa.js
   O tabuleiro das damas, com as mesmas peças do tabuleiro do xadrez: barra
   de cima, palco com o tabuleiro numa moldura de madeira, as placas dos dois
   jogadores (com as peças que cada um comeu), a lista de lances, a barra de
   ações (desfazer, dica, virar) e o coach (painel no PC, janela no celular).
   Mover: toque na peça e na casa. Nas capturas de várias peças, toque nas
   casas onde ela vai caindo — ou direto na última, se só houver um caminho.
   A partida fica salva a cada lance.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const Dm = P.Damas, IA = Dm.IA, DC = Dm.Coach;
  const D = () => Dm.Dados;
  const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

  // ------------------------------------------------------------------ peças
  // gradientes (luz vindo do alto à esquerda), uma vez só no documento
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<radialGradient id="dm-g-br" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#fffdf7"/><stop offset=".55" stop-color="#efe5cc"/><stop offset="1" stop-color="#c6b58c"/></radialGradient>' +
    '<radialGradient id="dm-g-pr" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#666c75"/><stop offset=".5" stop-color="#30343b"/><stop offset="1" stop-color="#121417"/></radialGradient>' +
    '<linearGradient id="dm-g-ouro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#e3b44d"/><stop offset="1" stop-color="#a5761c"/></linearGradient>' +
    '</defs></svg>';
  function garantirDefs() {
    if (document.getElementById('dm-g-br') || !document.body) return;
    const d = document.createElement('div');
    d.innerHTML = DEFS;
    document.body.appendChild(d.firstChild);
  }
  garantirDefs();
  /** Pedra (disco com a borda e os sulcos) ou dama (com a coroa dourada), cor 1 brancas / -1 pretas. */
  function pecaSVG(cor, dama) {
    garantirDefs();
    const b = cor > 0;
    const coroa = dama ? '<path class="dm-coroa" d="M31 58 L28 37 L39.5 46 L50 30 L60.5 46 L72 37 L69 58 Z"/><rect class="dm-coroa" x="31" y="60" width="38" height="6.5" rx="2.5"/>' +
      '<circle class="dm-joia" cx="50" cy="30" r="3.4"/><circle class="dm-joia" cx="28" cy="37" r="2.8"/><circle class="dm-joia" cx="72" cy="37" r="2.8"/>' : '';
    return `<svg class="dm-peca-svg ${b ? 'br' : 'pr'}${dama ? ' dama' : ''}" viewBox="0 0 100 100" aria-hidden="true">` +
      '<ellipse class="dm-pe" cx="50" cy="55.5" rx="43" ry="42"/>' +
      '<circle class="dm-face" cx="50" cy="48.5" r="43"/>' +
      (dama ? '<circle class="dm-sulco" cx="50" cy="48.5" r="36"/>' : '<circle class="dm-sulco" cx="50" cy="48.5" r="33"/><circle class="dm-sulco" cx="50" cy="48.5" r="23"/>') +
      '<path class="dm-brilho" d="M19 40 A32 32 0 0 1 42 17.5"/>' + coroa + '</svg>';
  }

  let jogo = null, pausas = 0, contador = 0;
  function pausar(p) { pausas = Math.max(0, pausas + (p ? 1 : -1)); }
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-damas');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    g.raiz = el('div', { class: 'tr-jogo xz-jogo dm-jogo', 'data-tema': P.Config.get('tema') || 'verde' });
    const nv = IA.nivel(jogo.nivel);
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra xz-barra' },
      el('span', { class: 'rotulo', text: 'Damas' }),
      el('span', { class: 'detalhe', text: `você de ${jogo.humano === Dm.BRANCO ? 'brancas' : 'pretas'} · bot ${nv.nome.toLowerCase()}` }),
      el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      el('button', { class: 'btn so-largo', text: 'Virar', title: 'Virar o tabuleiro', onclick: () => virar() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));
    const placa = quem => {
      const p = {};
      const info = quem === 'bot' ? jogo.bot : { nome: 'Você', avatar: null };
      p.capt = el('div', { class: 'xz-capturadas dm-comidas' });
      p.pensando = el('span', { class: 'xz-pensando oculto', text: 'pensando…' });
      p.raiz = el('div', { class: 'xz-placa ' + quem },
        el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, quem !== 'bot') }),
        el('div', { class: 'info' },
          el('span', { class: 'nome', html: esc(quem === 'bot' ? info.nome : 'Você') + (quem === 'bot' ? ` <span class="tag-perfil" style="--cor-perfil:${['#7aa2c7', '#4fbf8b', '#d9a441', '#e07a5f', '#b794f4'][nv.id - 1]}">${nv.nome.toUpperCase().slice(0, 3)}</span>` : '') }),
          el('div', { class: 'linha2' }, p.capt, p.pensando)));
      return p;
    };
    g.placaBot = placa('bot'); g.placaEu = placa('eu');
    g.tab = el('div', { class: 'xz-tabuleiro dm-tabuleiro' });
    g.casas = [];
    for (let i = 0; i < 64; i++) { const c = el('div', { class: 'xz-casa' }); g.casas.push(c); g.tab.appendChild(c); }
    g.setas = el('div', { class: 'xz-setas' });
    g.tab.appendChild(g.setas);
    g.tab.addEventListener('click', e => { const c = e.target.closest('.xz-casa'); if (c) tocar(+c.dataset.casa); });
    g.aval = el('div', { class: 'xz-avaliacao', title: 'Avaliação do coach' }, el('i'), el('span'));
    g.moldura = el('div', { class: 'xz-moldura' }, g.tab);
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
    g.btnVirar = el('button', { class: 'btn-acao btn-aceitar', html: 'Virar<small>o tabuleiro</small>', onclick: () => virar() });
    g.acoes = el('div', { class: 'barra-acoes tr-acoes xz-acoes' },
      el('div', { class: 'acoes-esquerda' }, g.status, g.coach),
      el('div', { class: 'acoes-botoes' }, g.btnDesfazer, g.btnDica, g.btnVirar));
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
    L = Math.max(200, Math.floor(L / 8) * 8);
    g.area.classList.toggle('apertado', apertado);
    g.raiz.style.setProperty('--xz-l', L + 'px');
    g.raiz.style.setProperty('--xz-placa-h', placaH + 'px');
    g.raiz.style.setProperty('--xz-moldura', moldura + 'px');
    g.raiz.style.setProperty('--xz-gap', gap + 'px');
    renderAvaliacao();
  }

  // ============================================================== desenho
  const visao = () => (jogo.virado ? -jogo.humano : jogo.humano);
  function casaDaGrade(i) {
    const lin = Math.floor(i / 8), col = i % 8;
    return visao() === Dm.BRANCO ? (7 - lin) * 8 + col : lin * 8 + (7 - col);
  }
  function gradeDaCasa(s) {
    const r = s >> 3, c = s & 7;
    return visao() === Dm.BRANCO ? (7 - r) * 8 + c : r * 8 + (7 - c);
  }
  /** Os lances que ainda cabem na seleção (origem + casas já tocadas). */
  function candidatos() {
    const sel = jogo.sel;
    if (!sel) return [];
    return jogo.legais.filter(m => m.de === sel.de && sel.cam.every((s, i) => m.cam[i] === s));
  }
  function render(animar) {
    const g = jogo.ui, t = jogo.pos.t;
    const ult = jogo.ultimoLance;
    const cands = candidatos();
    const proximas = new Set(), finais = new Set(), comidas = new Set();
    const k = jogo.sel ? jogo.sel.cam.length : 0;
    cands.forEach(m => { if (m.cam.length > k) proximas.add(m.cam[k]); finais.add(m.para); });
    if (cands.length === 1) cands[0].capt.forEach(s => comidas.add(s));
    const podem = new Set();
    if (podeMover() && !jogo.sel) jogo.legais.forEach(m => podem.add(m.de));
    g.casas.forEach((c, i) => {
      const s = casaDaGrade(i), r = s >> 3, col = s & 7;
      const clara = (r + col) % 2 === 1;
      let cls = 'xz-casa ' + (clara ? 'clara' : 'escura');
      if (ult && (ult.cam.indexOf(s) >= 0)) cls += ' ultimo';
      if (ult && ult.capt.indexOf(s) >= 0 && !t[s]) cls += ' comida-ult';
      if (jogo.sel && jogo.sel.cam.indexOf(s) >= 0) cls += ' sel';
      if (proximas.has(s)) cls += ' alvo';
      else if (finais.has(s) && jogo.sel) cls += ' alvo-final';
      if (comidas.has(s)) cls += ' vai-comer';
      if (podem.has(s) && jogo.legais[0] && jogo.legais[0].capt.length) cls += ' deve-comer';
      c.className = cls;
      c.dataset.casa = s;
      let coord = '';
      const iLin = Math.floor(i / 8), iCol = i % 8;
      if (iCol === 0) coord += `<span class="xz-coord lin">${r + 1}</span>`;
      if (iLin === 7) coord += `<span class="xz-coord col">${'abcdefgh'[col]}</span>`;
      const v = t[s];
      const html = coord + (v ? `<div class="xz-peca dm-peca" data-p="${v}">${pecaSVG(Math.sign(v), Math.abs(v) === 2)}</div>` : '');
      if (c._html !== html) { c.innerHTML = html; c._html = html; }
    });
    if (animar && ult) {
      const peca = g.casas[gradeDaCasa(ult.para)].querySelector('.xz-peca');
      if (peca) {
        const a = gradeDaCasa(ult.de), b = gradeDaCasa(ult.para);
        const Lc = g.tab.clientWidth / 8;
        const dx = ((a % 8) - (b % 8)) * Lc, dy = (Math.floor(a / 8) - Math.floor(b / 8)) * Lc;
        peca.style.transition = 'none';
        peca.style.transform = `translate(${dx}px, ${dy}px)`;
        peca.style.zIndex = 5;
        void peca.offsetWidth;
        peca.style.transition = `transform ${Math.min(420, 160 + ult.capt.length * 90)}ms ease`;
        peca.style.transform = '';
        setTimeout(() => { peca.style.zIndex = ''; }, 450);
      }
    }
    renderSetas();
    renderComidas();
    renderAvaliacao();
    renderHistorico();
  }
  function renderSetas() {
    const g = jogo.ui;
    g.setas.innerHTML = '';
    const an = jogo.analise;
    if (!jogo.conselho || !an || !an.melhor || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista) || jogo.pos.lado !== jogo.humano) return;
    const m = jogo.pos.lanceDe(an.melhor);
    if (!m) return;
    const pts = m.cam.map(s => { const i = gradeDaCasa(s); return [(i % 8) * 12.5 + 6.25, Math.floor(i / 8) * 12.5 + 6.25]; });
    const n = pts.length;
    const [x2, y2] = pts[n - 1], [x1, y1] = pts[n - 2];
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const xb = x2 - ux * 3.2, yb = y2 - uy * 3.2;
    const linha = pts.slice(0, -1).map(p => p.join(',')).join(' ') + ` ${xb},${yb}`;
    g.setas.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${linha}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke: rgba(47,191,113,.82)"/><polygon points="${x2},${y2} ${xb - uy * 2.6},${yb + ux * 2.6} ${xb + uy * 2.6},${yb - ux * 2.6}"/></svg>`;
  }
  /** As peças que cada um já comeu (pedras e damas do outro que saíram). */
  function renderComidas() {
    const g = jogo.ui, t = jogo.pos.t;
    const conta = { 1: 0, 2: 0, '-1': 0, '-2': 0 };
    for (let s = 0; s < 64; s++) if (t[s]) conta[t[s]]++;
    const eu = jogo.humano;
    const restam = cor => conta[cor] + conta[2 * cor];
    const saiu = cor => 12 - restam(cor);
    const mini = (cor, n) => (n > 0 ? `${pecaSVG(cor, false)}<b>${n}</b>` : '');
    g.placaEu.capt.innerHTML = mini(-eu, saiu(-eu)) + `<em>${restam(eu)} peças${conta[2 * eu] ? ` · ${conta[2 * eu]} ${conta[2 * eu] === 1 ? 'dama' : 'damas'}` : ''}</em>`;
    g.placaBot.capt.innerHTML = mini(eu, saiu(eu)) + `<em>${restam(-eu)} peças${conta[-2 * eu] ? ` · ${conta[-2 * eu]} ${conta[-2 * eu] === 1 ? 'dama' : 'damas'}` : ''}</em>`;
  }
  function renderAvaliacao() {
    const g = jogo && jogo.ui, an = jogo && jogo.ultimaAvaliacao;
    if (!g) return;
    const mostrar = an && jogo.opcoes.coach !== 'desligado' && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista || jogo.fim);
    g.aval.classList.toggle('oculta', !mostrar);
    if (!mostrar) return;
    const pB = DC.chance(an.brancas);
    const frac = visao() === Dm.BRANCO ? pB : 1 - pB;
    const deitada = g.area.classList.contains('retrato');
    g.aval.firstChild.style.height = deitada ? '' : Math.round(frac * 100) + '%';
    g.aval.firstChild.style.width = deitada ? Math.round(frac * 100) + '%' : '';
    g.aval.classList.toggle('pretas-embaixo', visao() !== Dm.BRANCO);
    g.aval.lastChild.textContent = DC.textoAvaliacao(an.brancas);
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

  // ========================================================= interação
  const podeMover = () => !!(jogo && jogo.vezHumano && !jogo.fim && jogo.pos.lado === jogo.humano);
  function tocar(s) {
    if (!podeMover()) return;
    const t = jogo.pos.t;
    const cands = candidatos();
    if (jogo.sel) {
      const k = jogo.sel.cam.length;
      // a próxima casa do caminho
      const seguem = cands.filter(m => m.cam[k] === s);
      if (seguem.length) {
        jogo.sel.cam.push(s);
        const completos = seguem.filter(m => m.cam.length === k + 1);
        if (completos.length === 1 && seguem.length === 1) return jogar(completos[0]);
        if (completos.length && seguem.every(m => m.cam.length === k + 1)) return jogar(completos[0]);
        render();
        return;
      }
      // direto no destino final (um caminho só)
      const vaoPara = cands.filter(m => m.para === s);
      if (vaoPara.length === 1) return jogar(vaoPara[0]);
      if (vaoPara.length > 1) { aviso('Há mais de um caminho até aí: toque nas casas por onde a peça passa.'); return; }
    }
    // escolher (ou trocar) a peça
    if (t[s] * jogo.humano > 0) {
      const dela = jogo.legais.filter(m => m.de === s);
      if (!dela.length) {
        jogo.sel = null; render();
        if (jogo.legais[0] && jogo.legais[0].capt.length) aviso('A captura é obrigatória: jogue com uma peça que pode comer (as marcadas).');
        return;
      }
      jogo.sel = { de: s, cam: [s] };
      render();
      return;
    }
    jogo.sel = null;
    render();
  }
  function aviso(txt) { if (P.Som) P.Som.erro(); const g = jogo.ui; g.status.innerHTML = `<b>${txt}</b>`; }

  // ============================================================== partida
  function aplicar(m, animar) {
    const pos = jogo.pos;
    const txt = Dm.texto(m);
    pos.fazer(m);
    jogo.lances.push(txt);
    jogo.ultimoLance = m;
    jogo.legais = pos.legais();
    jogo.sel = null;
    render(animar);
    if (P.Som) (m.capt.length ? P.Som.ficha : P.Som.carta)();
    if (m.promove && P.Som) P.Som.alerta();
    salvar();
  }

  async function jogar(m) {
    if (!podeMover()) return;
    jogo.vezHumano = false;
    const antes = jogo.lances.slice();
    const txt = Dm.texto(m);
    const analise = jogo.analise, promessa = jogo.promessaAnalise;
    aplicar(m, true);
    jogo.conselho = null; jogo.dicaVista = false;
    renderSetas();
    const token = jogo.token;
    (async () => {
      let an = analise;
      try { if (!an && promessa) an = await promessa; } catch (e) { an = null; }
      if (!jogo || jogo.token !== token || !an) return;
      const nota = DC.avaliar(antes, an, txt);
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
          const ref = await DC.refutacao(jogo.canalCoach, antes.concat([txt]), 500);
          if (ref && jogo && jogo.token === token) { nota.texto += ' ' + ref.texto; reg.texto = nota.texto; if (jogo.ultimaNota === nota) coachTexto(nota.texto); }
        } catch (e) { /* sem refutação */ }
      }
      salvar();
      atualizarPainel();
    })();
    await proximo();
  }

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
      const obrig = jogo.legais[0] && jogo.legais[0].capt.length;
      jogo.ui.status.innerHTML = obrig ? `<b>Captura obrigatória:</b> ${jogo.legais.length === 1 ? 'só há um jeito de comer' : 'escolha uma das peças marcadas'}` : '<b>Sua vez:</b> toque numa peça e na casa';
      render();
      if (P.Som) P.Som.vez();
      const pedido = jogo.lances.slice();
      if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Analisando…</span>'); }
      jogo.promessaAnalise = DC.analisar(jogo.canalCoach, pedido, jogo.opcoes.tempoCoach || 1300);
      jogo.promessaAnalise.then(an => {
        if (!jogo || jogo.token !== token) return;
        jogo.ultimaAvaliacao = { brancas: an.brancas };
        if (jogo.lances.length !== pedido.length) return;
        jogo.analise = an;
        jogo.conselho = DC.explicar(pedido, an);
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
    const podeDesfazer = jogo.opcoes.desfazer && jogo.vezHumano && jogo.lances.length >= (jogo.humano === Dm.BRANCO ? 2 : 3) && !jogo.fim;
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
  function virar() { if (!jogo) return; jogo.virado = !jogo.virado; render(); }

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
      else if (!ultima) corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Analisando…</b>Na sua vez o coach mostra o melhor lance, o que o adversário ameaça comer e a avaliação da posição.' }));
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
    D().salvar({ cfg: { cor: jogo.humano === Dm.BRANCO ? 'brancas' : 'pretas', nivel: jogo.nivel, bot: jogo.bot }, lances: jogo.lances, notas: jogo.notas, notaPorLance: jogo.notaPorLance, desfeitos: jogo.desfeitos });
  }

  /** Começa (ou retoma) uma partida. opcoes: { retomar, cor, nivel, autoHeroi, semSalvar, tempoCoach, coach }. */
  async function iniciar(opcoes) {
    encerrar();
    const cfg = D().config();
    const salva = opcoes.retomar || null;
    let cor = salva ? salva.cfg.cor : opcoes.cor || cfg.cor;
    if (cor === 'sorteio') cor = P.RNG.chance(0.5) ? 'brancas' : 'pretas';
    const nivel = salva ? salva.cfg.nivel : +(opcoes.nivel || cfg.nivel);
    const bot = salva ? salva.cfg.bot : { nome: P.RNG.escolher(IA.NOMES), avatar: P.Bots.sortearAvatar() };
    jogo = {
      token: ++contador, humano: cor === 'brancas' ? Dm.BRANCO : Dm.PRETO, nivel, bot,
      opcoes: Object.assign({ coach: cfg.coach, desfazer: cfg.desfazer }, opcoes),
      lances: [], notas: salva ? salva.notas || [] : [], notaPorLance: salva ? salva.notaPorLance || {} : {},
      desfeitos: salva ? salva.desfeitos || 0 : 0, virado: false, sel: null
    };
    jogo.pos = new Dm.Posicao();
    if (salva) salva.lances.forEach(u => { const m = jogo.pos.lanceDe(u); if (m) { jogo.pos.fazer(m); jogo.lances.push(u); jogo.ultimoLance = m; } });
    jogo.legais = jogo.pos.legais();
    jogo.canalBot = IA.criarCanal();
    jogo.canalCoach = IA.criarCanal();
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
    const motivo = { 'sem peças': 'comeu todas as peças', bloqueado: 'sem lance (bloqueado)', '20 lances de damas': '20 lances só de damas sem captura', 'final de damas (5 lances)': 'final de damas (5 lances)', 'repetição': 'repetição da posição', desistencia: 'desistência' }[sit.motivo] || sit.motivo;
    if (!jogo.opcoes.semSalvar) {
      D().descartar();
      D().alterarEstat(e => {
        e.partidas++;
        if (venceu) e.vitorias++; else if (empate) e.empates++; else e.derrotas++;
        const k = String(jogo.nivel); e.porNivel[k] = e.porNivel[k] || { v: 0, e: 0, d: 0 };
        e.porNivel[k][venceu ? 'v' : empate ? 'e' : 'd']++;
      });
    }
    document.documentElement.setAttribute('data-damas-fim', venceu ? 'vitoria' : empate ? 'empate' : 'derrota');
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
    const raiz = $('#tela-damas');
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
  }
  async function sair() {
    if (jogo && jogo.fim) { encerrar(); P.App.irPara('damas'); return; }
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Damas.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('damas');
  }
  async function abrirRegras() {
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UIDamas.regrasNo() }); } finally { pausar(false); }
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
      if (await P.UI.confirmar('Desistir?', 'A partida conta como derrota.', 'Desistir', 'Continuar')) fimDePartida({ fim: true, vencedor: -jogo.humano, motivo: 'desistencia' });
      return;
    }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) mudarModoCoach(modo[0]);
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-damas').dataset.tema = v; } });

  P.UIDamasMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, pecaSVG, _jogo: () => jogo, tocar };
})(window.Poker = window.Poker || {});
