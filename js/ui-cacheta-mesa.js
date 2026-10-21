/* ==========================================================================
   OUTS · Treino Lab — ui-cacheta-mesa.js
   A mesa da cacheta, com as mesmas peças das mesas do poker, do truco e do
   Última!: barra de cima, palco com a mesa oval, placas dos jogadores em
   volta (vidas, o que cada um pegou do lixo e, se quiser, o que descartou),
   no meio a vira com o curinga, o monte e o lixo; a sua mão sobre a borda da
   mesa, arrumada em jogos (ou por naipe, ou por valor); a barra de ações e o
   coach (painel no PC, janela no celular).
   Na sua vez: toque no monte ou no lixo para comprar; depois toque numa
   carta para escolher e em Descartar (ou toque nela de novo), ou em Bater.
   A partida fica salva no começo de cada mão: se o app fechar, ela volta
   pela aba (a mão em andamento é anulada).
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const K = P.Cacheta, R = K.Regras, IA = K.IA, CO = K.Coach;
  const D = () => K.Dados;
  const VELOCIDADES = { lenta: 1.8, normal: 1.25, rapida: 0.9, turbo: 0.25 };
  const fv = () => (jogo && jogo.opcoes.velocidade !== undefined ? jogo.opcoes.velocidade : VELOCIDADES[P.Config.get('velocidade')] || 1);
  const limitar = (x, a, b) => Math.max(a, Math.min(b, x));
  const ORDENS = [['jogos', 'em jogos'], ['naipe', 'por naipe'], ['valor', 'por valor']];

  let jogo = null, pausas = 0, contador = 0;

  function esperar(ms) {
    return new Promise(res => {
      let restante = ms, ultimo = performance.now();
      const tick = () => {
        const agora = performance.now();
        if (pausas === 0) restante -= agora - ultimo;
        ultimo = agora;
        if (restante <= 0) res(); else setTimeout(tick, Math.min(80, Math.max(8, restante)));
      };
      if (ms <= 0 && pausas === 0) res(); else setTimeout(tick, Math.min(Math.max(ms, 0), 80));
    });
  }
  function pausar(p) { pausas = Math.max(0, pausas + (p ? 1 : -1)); }

  // ================================================================ cartas
  /** Carta da cacheta (id) com o desenho do poker; o curinga ganha a estrela. Sem id: o verso. */
  function cartaEl(id, opts) {
    opts = opts || {};
    if (id === null || id === undefined) return P.UI.carta(null, { fechada: true, classe: opts.classe });
    const c = P.UI.carta(R.pokerId(id), { classe: opts.classe });
    if (jogo && jogo.cur && R.ehCuringa(id, jogo.cur)) { c.classList.add('ca-curinga'); c.appendChild(el('span', { class: 'ca-estrela', text: '★' })); }
    c.title = R.nome(id) + (jogo && jogo.cur && R.ehCuringa(id, jogo.cur) ? ' (curinga)' : '');
    return c;
  }

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-cacheta');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    const n = jogo.n, op = jogo.op;
    g.raiz = el('div', { class: 'tr-jogo ca-jogo', 'data-tema': P.Config.get('tema') || 'verde', 'data-n': n });
    const detalhe = `${n} jogadores · ${op.vidas} vidas · ${op.curinga === 'sem' ? 'sem curinga' : op.curinga === 'cor' ? 'curinga na cor' : 'curinga no naipe'}${op.furar ? ' · fura a fila' : ''} · bots ${IA.NIVEIS[jogo.nivel].nome.toLowerCase()}`;
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra ca-barra' },
      el('span', { class: 'rotulo', text: 'Cacheta' }), el('span', { class: 'detalhe', text: detalhe }), el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));
    // palco
    g.oval = el('div', { class: 'mesa-oval' }, el('div', { class: 'borda' }),
      el('div', { class: 'feltro' }, el('div', { class: 'mesa-logo', html: '<b>CACHETA</b><span>Treino Lab</span>' })));
    g.hudMao = el('span', { text: 'Mão 1' });
    g.hudCur = el('span', { class: 'ca-hud-cur' });
    g.hud = el('div', { class: 'tr-hud un-hud ca-hud' }, el('b', { text: 'Cacheta' }), g.hudMao, g.hudCur);
    g.palco = el('div', { class: 'mesa-palco tr-palco un-palco ca-palco' }, g.oval, g.hud,
      el('button', { class: 'btn-barra so-celular tr-btn-menu', title: 'Menu', html: '&#9776;', onclick: abrirMenu }));
    g.lugares = [];
    for (let j = 0; j < n; j++) {
      const info = jogo.jogadores[j];
      const l = { j };
      l.balao = el('div', { class: 'balao' });
      l.costas = el('div', { class: 'un-costas ca-costas' });
      l.vidas = el('span', { class: 'ca-vidas' });
      l.mostra = el('div', { class: 'ca-mostra' });
      const linha2 = el('div', { class: 'linha2' });
      if (info.perfil) { const pf = IA.PERFIS[info.perfil]; linha2.appendChild(el('span', { class: 'tag-perfil', style: { '--cor-perfil': pf.cor }, title: `${pf.nome}: ${pf.descricao}`, text: pf.sigla })); }
      linha2.appendChild(l.vidas);
      l.raiz = el('div', { class: 'tr-lugar un-lugar ca-lugar' + (j === 0 ? ' heroi' : '') },
        j === 0 ? null : l.costas,
        el('div', { class: 'corpo' },
          el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, j === 0) }),
          el('div', { class: 'info' }, el('span', { class: 'nome', text: j === 0 ? 'Você' : info.nome }), linha2)),
        j === 0 ? null : l.mostra, l.balao);
      g.lugares.push(l);
      g.palco.appendChild(l.raiz);
    }
    // centro: vira (com o curinga), monte e lixo
    g.vira = el('div', { class: 'ca-vira' });
    g.viraTxt = el('div', { class: 'ca-vira-txt' });
    g.monte = el('button', { class: 'ca-monte', title: 'Monte: compre a de cima' }, cartaEl(null), cartaEl(null), cartaEl(null));
    g.monteQtd = el('span', { class: 'un-compra-qtd' });
    g.monte.appendChild(g.monteQtd);
    g.lixo = el('button', { class: 'ca-lixo', title: 'Lixo: pegue a de cima' });
    g.lixoRot = el('span', { class: 'ca-rot', text: 'lixo' });
    g.centro = el('div', { class: 'ca-centro' },
      el('div', { class: 'ca-vira-caixa' }, g.vira, g.viraTxt),
      el('div', { class: 'ca-pilha-caixa' }, g.monte, el('span', { class: 'ca-rot', text: 'monte' })),
      el('div', { class: 'ca-pilha-caixa' }, g.lixo, g.lixoRot));
    g.monte.addEventListener('click', () => acaoComprar('monte'));
    g.lixo.addEventListener('click', () => acaoComprar('lixo'));
    g.splash = el('div', { class: 'tr-splash un-splash' });
    g.mao = el('div', { class: 'ca-mao' });
    g.ordem = el('button', { class: 'ca-ordem', title: 'Arrumar a mão', onclick: () => trocarOrdem() });
    g.palco.append(g.centro, g.mao, g.ordem, g.splash);
    // ações
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada jogada sua.</span>' });
    g.coachNota = el('span');
    g.btnDica = el('button', { class: 'btn oculto', text: 'Dica', onclick: e => { e.stopPropagation(); mostrarDica(); } });
    g.coach = el('div', { class: 'tr-coach', title: 'Ver a conta do coach', onclick: () => abrirCoach() }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt, g.btnDica);
    g.status = el('div', { class: 'tr-status' });
    g.btnA = el('button', { class: 'btn-acao btn-truco' });
    g.btnB = el('button', { class: 'btn-acao btn-aceitar' });
    g.btnC = el('button', { class: 'btn-acao btn-tr-dica' });
    g.acoes = el('div', { class: 'barra-acoes tr-acoes un-acoes ca-acoes' },
      el('div', { class: 'acoes-esquerda' }, g.status, g.coach),
      el('div', { class: 'acoes-botoes' }, g.btnA, g.btnB, g.btnC));
    // painel do coach (PC)
    g.painelCorpo = el('div', { class: 'coach-corpo' });
    g.painelModos = el('div', { class: 'coach-modos' });
    [['sempre', 'Sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) =>
      g.painelModos.appendChild(el('button', { 'data-modo': id, text: txt, onclick: () => mudarModoCoach(id) })));
    g.painel = el('aside', { class: 'painel-coach tr-painel' + (P.Config.get('coachAberto') !== false && jogo.opcoes.coach !== 'desligado' ? '' : ' recolhido') },
      el('div', { class: 'coach-cab' }, el('h2', { html: '<i>💡</i> Coach' }),
        el('button', { class: 'btn btn-icone', title: 'Recolher painel', html: '&rsaquo;', onclick: () => alternarPainel(false) })),
      g.painelModos, g.painelCorpo);
    g.coluna = el('div', { class: 'mesa-coluna' }, g.barra, g.palco, g.acoes);
    g.raiz.append(g.coluna, g.painel);
    raiz.appendChild(g.raiz);
    aplicarModoCoach();
    acoesEspera('');
    atualizarOrdem();
    atualizarPainel();
    if (jogo.observador) jogo.observador.disconnect();
    jogo.observador = new ResizeObserver(() => layout());
    jogo.observador.observe(g.palco);
    layout();
  }

  // ============================================================== geometria
  const ANGULOS = { 2: [90, 270], 3: [90, 205, 335], 4: [90, 180, 270, 0], 5: [90, 165, 235, 305, 15], 6: [90, 155, 213, 270, 327, 25] };
  const ANGULOS_VERTICAL = { 2: [90, 270], 3: [90, 215, 325], 4: [90, 175, 270, 5], 5: [90, 160, 235, 305, 20], 6: [90, 152, 215, 270, 325, 28] };

  function layout() {
    if (!jogo || !jogo.ui) return;
    const g = jogo.ui, n = jogo.n;
    const W = g.palco.clientWidth, H = g.palco.clientHeight;
    if (!W || !H) return;
    const compacto = W < 640 || H < 400;
    const vertical = H > W * 1.05;
    g.palco.classList.toggle('compacto', compacto);
    const pad = compacto ? 6 : 12;
    let assentoL, avatarL, seatH, heroL, heroH;
    if (compacto) {
      const base = Math.min(W, H * 1.25);
      assentoL = limitar(base * 0.2, 62, 84);
      avatarL = limitar(assentoL * 0.5, 28, 40);
      seatH = avatarL + 29;
      heroL = limitar(W * 0.36, 110, 150);
      heroH = limitar(avatarL + 8, 38, 50);
    } else {
      avatarL = limitar(H * 0.06, 32, 44);
      assentoL = limitar(W * 0.15, 120, 156);
      seatH = avatarL + 12;
      heroL = assentoL; heroH = seatH;
    }
    const costasL = limitar(avatarL * 0.52, 14, 22);
    const sobra = costasL * 1.4 * 0.6;
    // a sua mão: até 10 cartas, em blocos (jogos)
    const blocos = jogo.blocos || [[]];
    const nMao = Math.max(1, blocos.reduce((s, b) => s + b.length, 0));
    const nBlocos = Math.max(1, blocos.filter(b => b.length).length);
    let maoL = compacto ? (vertical ? limitar(W * 0.15, 44, 64) : limitar(H * 0.16, 38, 58)) : limitar(Math.min(W * 0.065, H * 0.12), 50, 84);
    const yHeroi = H - pad - heroH / 2;
    const maoBase = yHeroi - heroH / 2 + Math.min(10, heroH * 0.2);
    const topo = pad + sobra + seatH / 2;
    const oTopo = topo - (compacto ? seatH * 0.1 : 0), oBase = yHeroi;
    const oh = oBase - oTopo;
    const ow = Math.min(W - 2 * pad - assentoL * 0.9, oh * 2.15);
    const cx = W / 2;
    Object.assign(g.oval.style, { left: (cx - ow / 2) + 'px', top: oTopo + 'px', width: ow + 'px', height: oh + 'px', borderRadius: oh > ow ? (ow / 2) + 'px' : '' });
    g.palco.style.setProperty('--borda-l', limitar(Math.min(ow, oh) * (compacto ? 0.035 : 0.026), 8, 20) + 'px');
    let maoH = maoL * 1.4;
    const angulos = (vertical ? ANGULOS_VERTICAL : ANGULOS)[n];
    const rx = Math.min(ow / 2, W / 2 - pad - assentoL / 2), ry = (yHeroi - topo) / 2, cyL = (yHeroi + topo) / 2;
    const yMaxLado = vertical ? maoBase - maoH - seatH / 2 - 26 : yHeroi - heroH / 2 - seatH / 2 - maoH * 0.4;
    const pos = [];
    for (let j = 0; j < n; j++) {
      const t = angulos[j] * Math.PI / 180;
      let x = cx + rx * Math.cos(t), y = cyL + ry * Math.sin(t);
      if (j === 0) { x = cx; y = yHeroi; }
      else { x = limitar(x, assentoL / 2 + pad, W - assentoL / 2 - pad); y = limitar(y, topo, Math.max(topo, yMaxLado)); }
      pos.push({ x, y });
      g.lugares[j].raiz.style.left = x + 'px';
      g.lugares[j].raiz.style.top = y + 'px';
      g.lugares[j].raiz.dataset.lado = j === 0 ? 'baixo' : x < cx - 20 ? 'esq' : x > cx + 20 ? 'dir' : 'cima';
    }
    // largura da mão
    let largMao = Math.min(W - 2 * pad, compacto ? W : W * 0.82);
    pos.forEach((p, j) => { if (!j || p.y + seatH / 2 < maoBase - maoH) return; largMao = Math.min(largMao, 2 * (Math.abs(p.x - cx) - assentoL / 2 - 6)); });
    largMao = Math.max(largMao, maoL * 3);
    const gapBloco = () => maoL * 0.22;
    let passo = maoL * 1.04;
    const largura = () => maoL + (nMao - 1) * passo + (nBlocos - 1) * gapBloco();
    if (largura() > largMao) passo = (largMao - maoL - (nBlocos - 1) * gapBloco()) / Math.max(1, nMao - 1);
    if (passo < maoL * 0.42) { maoL = Math.max(30, largMao / (1 + (nMao - 1) * 0.42 + (nBlocos - 1) * 0.22)); passo = maoL * 0.42; }
    maoH = maoL * 1.4;
    // centro: vira, monte e lixo lado a lado — o maior tamanho que cabe entre os lugares e a sua mão
    const base0 = maoBase - maoH - 10;
    const extraMostra = jogo.mostrarDescartes ? 20 : 4;          // as cartinhas embaixo de cada lugar
    let cartaL = compacto ? limitar(Math.min(W * (vertical ? 0.15 : 0.08), H * 0.14), 34, 60) : limitar(Math.min(W * 0.065, H * 0.12), 48, 80);
    let yCentro = null;
    for (let L = Math.floor(cartaL); L >= 24; L--) {
      g.palco.style.setProperty('--carta-l', L + 'px');
      const wC = g.centro.offsetWidth || L * 3.7, hC = g.centro.offsetHeight || L * 1.4 + 24;   // o tamanho de verdade (com os rótulos)
      const topoC = Math.max(oTopo + 6, ...pos.filter((p, j) => j && Math.abs(p.x - cx) < wC / 2 + assentoL / 2 + 4).map(p => p.y + seatH / 2 + extraMostra));
      if (base0 - topoC >= hC || L === 24) { cartaL = L; yCentro = (topoC + base0) / 2 - 2; break; }
    }
    g.centro.style.left = cx + 'px';
    g.centro.style.top = yCentro + 'px';
    g.palco.style.setProperty('--carta-l', cartaL + 'px');
    g.palco.style.setProperty('--avatar-l', avatarL + 'px');
    g.palco.style.setProperty('--assento-l', assentoL + 'px');
    g.palco.style.setProperty('--heroi-l', heroL + 'px');
    g.palco.style.setProperty('--costas-l', costasL + 'px');
    g.palco.style.setProperty('--mao-l', maoL + 'px');
    g.palco.style.setProperty('--mao-passo', passo + 'px');
    g.palco.style.setProperty('--mao-gap', gapBloco() + 'px');
    g.mao.style.left = cx + 'px';
    g.mao.style.top = maoBase + 'px';
    // o botão de arrumar fica à esquerda da sua placa
    g.ordem.style.left = Math.max(pad, cx - heroL / 2 - 8) + 'px';
    g.ordem.style.top = yHeroi + 'px';
    const logo = g.oval.querySelector('.mesa-logo');
    logo.style.top = ((yCentro + cartaL * 0.7 + 30 + maoBase - maoH) / 2 - oTopo) + 'px';
    logo.style.display = (maoBase - maoH) - (yCentro + cartaL * 0.7 + 30) > 40 ? '' : 'none';
    jogo.geo = { W, H, cx, yCentro, cartaL, pos, compacto };
  }

  // ============================================================ desenho
  function balao(j, texto, classe, ms) {
    const b = jogo.ui.lugares[j].balao;
    b.innerHTML = texto;
    b.className = 'balao on ' + (classe || '');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('on'), ms || 1500 * Math.max(0.6, fv()));
  }
  function splash(texto, classe) {
    const s = jogo.ui.splash;
    s.textContent = texto;
    s.className = 'tr-splash un-splash ' + (classe || '');
    s.style.setProperty('--t-splash', Math.round(1000 * Math.max(0.5, fv())) + 'ms');
    void s.offsetWidth;
    s.classList.add('on');
  }
  function aviso(html, ms) {
    const g = jogo.ui;
    if (g.avisoEl) g.avisoEl.remove();
    g.avisoEl = el('div', { class: 'tr-aviso-mesa', html });
    g.palco.appendChild(g.avisoEl);
    const este = g.avisoEl;
    if (ms) setTimeout(() => { if (este.parentNode) este.remove(); }, ms);
  }
  function marcarVez(j) { jogo.ui.lugares.forEach((l, k) => l.raiz.classList.toggle('vez', k === j)); }
  const nomeDe = j => (j === 0 ? 'Você' : jogo.jogadores[j].nome);

  /** Placas: vidas, cartas viradas e o que cada um mostrou (pegou do lixo / descartou). */
  function atualizarLugares(v) {
    const g = jogo.ui;
    const conh = IA.conhecimento(v);
    g.lugares.forEach((l, j) => {
      const vv = v.vidas[j];
      l.vidas.innerHTML = vv > 0 ? `<i>♥</i>${vv}` : 'fora';
      l.vidas.classList.toggle('poucas', vv > 0 && vv <= 2);
      l.raiz.classList.toggle('fora', !(vv > 0));
      if (!j) return;
      const k = v.nCartas[j];
      const mostrar = Math.min(k, 3);
      if (l.costas.children.length !== mostrar) { l.costas.innerHTML = ''; for (let i = 0; i < mostrar; i++) l.costas.appendChild(cartaEl(null)); }
      // o que é público: as cartas que pegou do lixo (e ainda tem) e as últimas que descartou
      l.mostra.innerHTML = '';
      conh.naMao[j].forEach(id => l.mostra.appendChild(el('span', { class: 'ca-mini pegou', title: 'Pegou do lixo', html: CO.cartaHtml(id, v.curinga) })));
      if (jogo.mostrarDescartes) conh.descartou[j].slice(-3).forEach(id => l.mostra.appendChild(el('span', { class: 'ca-mini', title: 'Descartou', html: CO.cartaHtml(id, v.curinga) })));
    });
    g.monteQtd.textContent = v.monte;
  }

  function renderCentro(v, animar) {
    const g = jogo.ui;
    // vira e curinga
    if (g.vira._id !== v.vira) {
      g.vira.innerHTML = '';
      if (v.vira !== null && v.vira !== undefined) g.vira.appendChild(cartaEl(v.vira));
      g.vira._id = v.vira;
      layout();
      g.viraTxt.innerHTML = v.curinga ? `curinga<br><b>${esc(R.nomeCuringa(v.curinga, true))}</b>` : 'sem<br>curinga';
      g.hudCur.innerHTML = v.curinga ? `curinga <b>${esc(R.nomeCuringa(v.curinga))}</b>` : 'sem curinga';
    }
    // lixo: as duas de cima, a última por cima
    g.lixo.innerHTML = '';
    const ult = v.lixo.slice(-2);
    if (!ult.length) g.lixo.appendChild(el('span', { class: 'ca-vazio', text: 'vazio' }));
    ult.forEach((id, i) => {
      const c = cartaEl(id, { classe: i === ult.length - 1 ? 'ca-topo' : 'antiga' });
      if (i === ult.length - 1 && animar && animar.de !== undefined) {
        const l = g.lugares[animar.de].raiz, ref = g.centro;
        const dx = parseFloat(l.style.left) - parseFloat(ref.style.left), dy = parseFloat(l.style.top) - parseFloat(ref.style.top);
        c.style.setProperty('--de-x', dx + 'px'); c.style.setProperty('--de-y', dy + 'px');
        c.style.setProperty('--t-entrar', Math.round(300 * Math.max(0.4, fv())) + 'ms');
        c.classList.add('entrando');
      }
      g.lixo.appendChild(c);
    });
    g.lixoRot.textContent = v.lixo.length > 2 ? `lixo · ${v.lixo.length}` : 'lixo';
    g.monteQtd.textContent = v.monte;
  }

  /** A sua mão, arrumada (em jogos, por naipe ou por valor). */
  function renderMao() {
    const g = jogo.ui, v = jogo.motor.vistaPara(0);
    const pend = jogo.pendente;
    const ordem = jogo.ordem || 'jogos';
    jogo.blocos = v.mao.length ? R.ordenar(v.mao, v.curinga, ordem) : [[]];
    g.mao.innerHTML = '';
    const sug = sugerida();
    const novaId = jogo.nova;
    jogo.blocos.forEach((bloco, bi) => {
      bloco.forEach((id, i) => {
        const b = el('button', { class: 'ca-carta-mao' + (bi && !i ? ' novo-bloco' : '') + (id === jogo.sel ? ' selecionada' : '') + (id === sug ? ' sugerida' : '') + (id === novaId ? ' nova' : '') + (pend && pend.vista.doLixo === id ? ' do-lixo' : ''),
          'data-carta': id, title: R.nome(id) }, cartaEl(id));
        b.addEventListener('click', () => tocarCarta(id));
        g.mao.appendChild(b);
      });
    });
    g.mao.classList.toggle('minha-vez', !!(pend && pend.tipo === 'jogar'));
    layout();
  }
  function sugerida() {
    const c = jogo.conselho;
    if (!c || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista) || c.tipo !== 'jogar') return null;
    if (c.melhor.tipo === 'descartar') {
      const v = jogo.pendente && jogo.pendente.vista;
      if (!v) return null;
      return v.mao.find(id => id === c.melhor.carta) !== undefined ? c.melhor.carta : null;
    }
    return null;
  }
  function trocarOrdem() {
    if (!jogo) return;
    const i = ORDENS.findIndex(o => o[0] === jogo.ordem);
    jogo.ordem = ORDENS[(i + 1) % ORDENS.length][0];
    const c = D().config(); c.ordem = jogo.ordem; D().salvarConfig(c);
    atualizarOrdem();
    renderMao();
  }
  function atualizarOrdem() { const o = ORDENS.find(x => x[0] === jogo.ordem) || ORDENS[0]; jogo.ui.ordem.innerHTML = `<small>arrumar</small>${o[1]}`; }

  // =========================================================== coach
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
    jogo.ui.btnDica.classList.toggle('oculto', modo !== 'pedido' || jogo.dicaVista);
    if (modo === 'sempre' || jogo.dicaVista) { coachNota(null); coachTexto(jogo.conselho.resumo); }
    else if (modo === 'pedido') coachTexto('<span class="calc">Quer ajuda? Toque em <b>Dica</b>.</span>');
    marcarSugestoes();
    atualizarPainel();
  }
  function mostrarDica() {
    if (!jogo || !jogo.conselho) return;
    jogo.dicaVista = true;
    mostrarConselho();
    renderMao();
    if (!painelVisivel()) abrirCoach();
  }
  function marcarSugestoes() {
    const g = jogo.ui, c = jogo.conselho;
    [g.btnA, g.btnB, g.btnC, g.monte, g.lixo].forEach(b => b.classList.remove('sugerido'));
    if (!c || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista)) return;
    if (c.tipo === 'comprar') { (c.melhor.de === 'lixo' ? g.lixo : g.monte).classList.add('sugerido'); [g.btnA, g.btnB].forEach(b => { if (b.dataset.papel === c.melhor.de) b.classList.add('sugerido'); }); }
    else if (c.melhor.tipo === 'bater') g.btnA.classList.add('sugerido');
  }
  function conteudoCoach(paraVer) {
    const c = jogo.conselho, ultima = jogo.ultimaNota, modo = jogo.opcoes.coach;
    const corpo = el('div', { class: 'tr-coach-modal ca-coach-modal' });
    if (modo === 'desligado') {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach desligado</b>Sem dicas durante o jogo. As suas jogadas continuam sendo avaliadas, e o resumo aparece no fim da partida.' }));
      return corpo;
    }
    if (ultima && (!c || !(modo === 'sempre' || jogo.dicaVista))) {
      corpo.appendChild(el('div', { class: 'bloco tr-ultima' }, el('h4', { text: 'Sua última jogada' }),
        el('p', { html: `<span class="feedback-nota nota-${ultima.nota}">${ultima.rotulo}</span> ${ultima.texto}` })));
    }
    if (c && (modo === 'sempre' || jogo.dicaVista || (modo === 'pedido' && paraVer))) {
      if (modo === 'pedido' && paraVer && !jogo.dicaVista) { jogo.dicaVista = true; mostrarConselho(); renderMao(); }
      corpo.appendChild(el('div', { class: 'bloco recomendacao' }, el('h4', { text: 'Recomendação' }), el('ul', {}, c.linhas.map(l => el('li', { html: l })))));
      if (c.tipo === 'jogar' && c.opcoes && c.opcoes.length > 1) {
        const barras = el('div', { class: 'tr-barras-cartas ca-barras' });
        const max = Math.max(0.01, ...c.opcoes.map(o => o.valor));
        c.opcoes.slice(0, 6).forEach(o => barras.appendChild(el('div', { class: 'tr-barra-carta' },
          el('span', { html: CO.descreve(o, jogo.cur) }),
          el('div', { class: 'barra' }, el('i', { style: { width: Math.round(Math.max(0, o.valor) / max * 100) + '%' } })),
          el('b', { text: CO.pct(Math.max(0, o.valor)) }))));
        corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Chance de ganhar a mão com cada descarte' }), barras));
        corpo.appendChild(el('div', { class: 'rodape-calc', text: 'Conta: quantas cartas faltam para bater, quantas das que ainda podem vir ajudam (contando as cópias que já apareceram) e o perigo de a carta fechar a batida do próximo (sorteando as mãos dos outros pelo que eles pegaram do lixo e pelo tempo de jogo).' }));
      }
    } else if (c && modo === 'pedido') {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach sob pedido</b>Quer ajuda nesta jogada? Toque em <b>Dica</b>.' }));
    } else if (!ultima) {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Aguardando a sua vez</b>Na sua vez o coach diz se vale pegar a carta do lixo, qual descartar (quantas cartas faltam, quais ajudam, o perigo de cada descarte) e quando bater.' }));
    }
    return corpo;
  }
  const painelVisivel = () => !!(jogo && jogo.ui && jogo.ui.painel && !jogo.ui.painel.classList.contains('recolhido') && getComputedStyle(jogo.ui.painel).display !== 'none');
  function atualizarPainel() {
    const g = jogo && jogo.ui;
    if (!g || !g.painelCorpo) return;
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
    if (aberto && jogo.opcoes.coach === 'desligado') mudarModoCoach('sempre');
    g.painel.classList.toggle('recolhido', !aberto);
    P.Config.set('coachAberto', aberto);
    atualizarPainel();
  }
  function mudarModoCoach(id) {
    if (!jogo) return;
    jogo.opcoes.coach = id;
    const c = D().config(); c.coach = id; D().salvarConfig(c);
    aplicarModoCoach();
    if (jogo.pendente) { prepararBotoes(jogo.pendente); mostrarConselho(); renderMao(); }
    atualizarPainel();
  }
  async function abrirCoach() {
    if (!jogo) return;
    if (painelVisivel()) { conteudoCoach(true); atualizarPainel(); return; }
    if (jogo.ui.painel && getComputedStyle(jogo.ui.painel).display !== 'none') { alternarPainel(true); return; }
    const corpo = conteudoCoach(true);
    pausar(true);
    try { await P.UI.modal({ titulo: 'Coach', conteudo: corpo }); } finally { pausar(false); }
  }
  function registrarNota(acao, vista) {
    const av = CO.avaliar(jogo.conselho, acao, vista);
    if (!av) return;
    jogo.notas.push({ nota: av.nota, texto: av.texto, perda: av.perda, mao: jogo.motor.maoNumero() });
    jogo.ultimaNota = av;
    if (!jogo.opcoes.semSalvar) D().alterarEstat(e => { e.notas[av.nota] = (e.notas[av.nota] || 0) + 1; });
    if (jogo.opcoes.coach !== 'desligado') { coachNota(av); coachTexto(av.texto); }
    if (jogo.opcoes.coach !== 'desligado' && P.Som) (av.nota === 'erro' ? P.Som.erro : av.nota === 'otima' ? P.Som.acerto : () => {})();
  }
  function calcularConselho(pend) {
    const token = jogo.token;
    if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Calculando…</span>'); }
    setTimeout(() => {
      if (!jogo || jogo.token !== token || jogo.pendente !== pend) return;
      let c = null;
      try { c = CO.conselho(pend.vista, { amostras: jogo.opcoes.amostras || 60, nomes: jogo.jogadores.map((x, j) => nomeDe(j)) }); } catch (e) { console.error(e); }
      if (!jogo || jogo.pendente !== pend) return;
      jogo.conselho = c;
      mostrarConselho();
      renderMao();
      if (jogo.opcoes.autoHeroi) setTimeout(() => autoJogar(pend), 10);
    }, 30);
  }

  // ================================================================ ações
  function acoesEspera(texto) {
    const g = jogo.ui;
    [g.btnA, g.btnB, g.btnC].forEach(b => { b.disabled = true; b.classList.remove('sugerido', 'pulsa'); b.onclick = null; b.dataset.papel = ''; });
    g.btnA.className = 'btn-acao btn-truco'; g.btnA.innerHTML = 'Bater';
    g.btnB.className = 'btn-acao btn-aceitar'; g.btnB.innerHTML = 'Descartar';
    g.btnC.className = 'btn-acao btn-tr-dica'; g.btnC.innerHTML = 'Dica';
    g.status.innerHTML = texto || '';
    g.mao.classList.remove('minha-vez');
    g.monte.classList.remove('pode', 'sugerido'); g.lixo.classList.remove('pode', 'sugerido');
  }
  function botao(b, classe, html, papel, fn) { b.disabled = false; b.className = 'btn-acao ' + classe; b.innerHTML = html; b.dataset.papel = papel; b.onclick = fn; }
  function ajustarDica() {
    const g = jogo.ui;
    g.btnC.className = 'btn-acao btn-tr-dica';
    g.btnC.disabled = jogo.opcoes.coach !== 'pedido';
    g.btnC.innerHTML = 'Dica' + (jogo.opcoes.coach === 'sempre' ? '<small>já na faixa</small>' : jogo.opcoes.coach === 'desligado' ? '<small>coach desligado</small>' : '');
    g.btnC.onclick = () => mostrarDica();
  }
  function prepararBotoes(pend) {
    const g = jogo.ui, v = pend.vista;
    acoesEspera('');
    if (pend.tipo === 'comprar') {
      botao(g.btnA, 'btn-aceitar', 'Monte<small>a de cima</small>', 'monte', () => acaoComprar('monte'));
      if (v.topo !== null) botao(g.btnB, 'btn-cobrir', `Lixo<small>pegar o ${R.nome(v.topo)}</small>`, 'lixo', () => acaoComprar('lixo'));
      else { g.btnB.innerHTML = 'Lixo<small>vazio</small>'; }
      ajustarDica();
      g.monte.classList.add('pode');
      if (v.topo !== null) g.lixo.classList.add('pode');
      g.status.innerHTML = v.topo !== null ? '<b>Sua vez:</b> compre do monte ou pegue a do lixo' : '<b>Sua vez:</b> compre do monte (o lixo está vazio)';
    } else if (pend.tipo === 'jogar') {
      botao(g.btnA, 'btn-truco', 'Bater<small>mostrar os jogos</small>', 'bater', () => acaoBater());
      if (jogo.sel !== null && jogo.sel !== undefined) botao(g.btnB, 'btn-correr', `Descartar<small>o ${R.nome(jogo.sel)}</small>`, 'descartar', () => acaoDescartar(jogo.sel));
      else { g.btnB.className = 'btn-acao btn-correr'; g.btnB.innerHTML = 'Descartar<small>escolha a carta</small>'; }
      ajustarDica();
      g.status.innerHTML = jogo.sel !== null && jogo.sel !== undefined ? `<b>${R.nome(jogo.sel)}</b> escolhida — toque de novo nela ou em Descartar` : '<b>Descarte uma:</b> toque na carta — ou bata, se fechar';
      g.mao.classList.add('minha-vez');
    } else if (pend.tipo === 'furar') {
      botao(g.btnA, 'btn-truco pulsa', `Bater!<small>com o ${R.nome(pend.carta)}</small>`, 'furar', () => resolver(true));
      botao(g.btnB, 'btn-correr', 'Deixar<small>passar a vez</small>', 'deixar', () => resolver(false));
      g.status.innerHTML = `<b>${esc(nomeDe(pend.de))} descartou o ${R.nome(pend.carta)}</b> — dá para furar a fila e bater!`;
    }
    marcarSugestoes();
  }

  function resolver(acao) {
    const pend = jogo.pendente;
    if (!pend) return;
    if (jogo.conselho && pend.tipo !== 'furar') {
      const a = pend.tipo === 'comprar' ? { de: acao } : acao;
      registrarNota(a, pend.vista);
    }
    jogo.pendente = null;
    jogo.conselho = null;
    jogo.dicaVista = false;
    jogo.sel = null;
    jogo.ui.btnDica.classList.add('oculto');
    acoesEspera('');
    renderMao();
    atualizarPainel();
    pend.resolve(acao);
  }
  function recusar(texto) { if (P.Som) P.Som.erro(); aviso(texto, 2400); }

  function acaoComprar(de) {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.tipo !== 'comprar') return;
    if (de === 'lixo' && pend.vista.topo === null) return recusar('O lixo está vazio: compre do monte.');
    resolver(de);
  }
  function tocarCarta(id) {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.tipo !== 'jogar') return;
    if (jogo.sel === id) return acaoDescartar(id);
    jogo.sel = id;
    prepararBotoes(pend);
    renderMao();
  }
  function acaoDescartar(id) {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.tipo !== 'jogar' || id === null || id === undefined) return;
    if (id === pend.vista.doLixo) return recusar('Não vale devolver ao lixo a carta que você acabou de pegar dele.');
    resolver({ tipo: 'descartar', carta: id });
  }
  function acaoBater() {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.tipo !== 'jogar') return;
    const v = pend.vista;
    const b = R.batidas(v.mao, v.curinga);
    if (b.com10) return resolver({ tipo: 'bater', com: 10 });
    const com9 = b.com9.filter(o => o.descarte !== v.doLixo);
    if (com9.length) {
      // se você escolheu uma carta que dá para descartar, é ela; senão, a que sobra
      const esc9 = com9.find(o => o.descarte === jogo.sel) || com9.find(o => jogo.sel !== null && o.descarte % 52 === jogo.sel % 52) || com9[0];
      return resolver({ tipo: 'bater', com: 9, descarte: esc9.descarte });
    }
    const f = R.faltam(v.mao, v.curinga, 9);
    recusar(`Ainda não fecha: ${f === 1 ? 'falta 1 carta' : 'faltam ' + f + ' cartas'} para bater. Descarte uma.`);
  }

  /** Herói automático (testes): segue o coach. */
  function autoJogar(pend) {
    if (!jogo || jogo.pendente !== pend || !jogo.conselho) return;
    const m = jogo.conselho.melhor;
    if (pend.tipo === 'comprar') resolver(m.de || 'monte');
    else if (m.tipo === 'bater') resolver(m.com === 10 ? { tipo: 'bater', com: 10 } : { tipo: 'bater', com: 9, descarte: m.descarte });
    else resolver({ tipo: 'descartar', carta: m.carta });
  }

  // ============================================================== agentes
  function agenteHumano() {
    function pedir(vista, tipo) {
      return new Promise(resolve => {
        const pend = jogo.pendente = { vista, resolve, tipo };
        jogo.conselho = null;
        jogo.sel = null;
        marcarVez(0);
        prepararBotoes(pend);
        renderMao();
        if (P.Som && tipo === 'comprar') P.Som.vez();
        calcularConselho(pend);
      });
    }
    return {
      bot: false,
      comprar: v => pedir(v, 'comprar'),
      jogar: v => pedir(v, 'jogar'),
      furar(vista, carta, de) {
        if (jogo.opcoes.autoHeroi) return true;
        return new Promise(resolve => {
          const token = jogo.token;
          const pend = jogo.pendente = { vista, resolve, tipo: 'furar', carta, de };
          prepararBotoes(pend);
          if (P.Som) P.Som.alerta();
          esperar(6000 * Math.max(0.6, fv())).then(() => { if (jogo && jogo.token === token && jogo.pendente === pend) resolver(false); });
        });
      }
    };
  }
  function agenteBot(j, perfil) {
    const b = IA.criarBot(perfil, { nivel: jogo.nivel, amostras: jogo.opcoes.amostrasBots });
    const pensar = base => esperar(base * fv() * (0.7 + P.RNG.real() * 0.6));
    const token = jogo.token;
    const vivo = () => jogo && jogo.token === token;
    return {
      bot: true, perfil,
      async comprar(v) { await pensar(650); if (!vivo()) return 'monte'; return b.comprar(v); },
      async jogar(v) { await pensar(750); if (!vivo()) return { tipo: 'descartar', carta: v.mao.find(x => x !== v.doLixo) }; return b.jogar(v); },
      async furar(v, c, de) { await pensar(300); return vivo() ? b.furar(v, c, de) : false; }
    };
  }

  // ============================================================== eventos
  async function aoEvento(ev) {
    if (!jogo) return;
    const token = jogo.token;
    const g = jogo.ui;
    const vista = () => jogo.motor.vistaPara(0);
    switch (ev.tipo) {
      case 'inicioPartida': break;
      case 'inicioMao': {
        jogo.cur = ev.curinga;
        jogo.nova = null;
        g.hudMao.textContent = 'Mão ' + ev.maoNumero;
        g.vira._id = undefined;
        if (g.avisoEl) { g.avisoEl.remove(); g.avisoEl = null; }
        marcarVez(-1);
        acoesEspera(`Mão ${ev.maoNumero} · quem dá: <b>${esc(nomeDe(ev.dador))}</b>`);
        g.lugares.forEach(l => { l.costas.innerHTML = ''; l.mostra.innerHTML = ''; });
        g.mao.innerHTML = '';
        jogo.blocos = [[]];
        for (let k = 1; k <= 3; k++) {
          g.lugares.forEach((l, j) => { if (j && ev.vivos[j] && l.costas.children.length < 3) l.costas.appendChild(cartaEl(null)); });
          if (P.Som) P.Som.carta();
          await esperar(90 * fv());
          if (!jogo || jogo.token !== token) return;
        }
        const v = vista();
        atualizarLugares(v);
        renderCentro(v);
        renderMao();
        g.vira.classList.remove('virando'); void g.vira.offsetWidth; g.vira.classList.add('virando');
        aviso(v.curinga ? `Vira ${CO.cartaHtml(v.vira, null)} · o curinga é <b>${esc(R.nomeCuringa(v.curinga))}</b>` : `Vira ${CO.cartaHtml(v.vira, null)} · sem curinga`, 1800 * Math.max(0.6, fv()));
        await esperar(700 * fv());
        break;
      }
      case 'vez':
        marcarVez(ev.j);
        if (ev.j !== 0) g.status.innerHTML = `Vez de <b>${esc(nomeDe(ev.j))}</b>…`;
        break;
      case 'compra': {
        const v = vista();
        if (ev.de === 'lixo') {
          renderCentro(v);
          balao(ev.j, ev.furou ? `Furou! ${CO.cartaHtml(ev.carta, v.curinga)}` : `Pegou ${CO.cartaHtml(ev.carta, v.curinga)}`, ev.furou ? 'forte' : 'aceitou', 1500);
          if (ev.furou) splash('FUROU!', ev.j === 0 ? 'nos' : '');
        } else balao(ev.j, 'Comprou', '', 900);
        if (ev.j === 0) jogo.nova = v.comprada !== null ? v.comprada : (v.mao[v.mao.length - 1]);
        atualizarLugares(v);
        g.monteQtd.textContent = v.monte;
        if (ev.j === 0) renderMao();
        if (P.Som) P.Som.carta();
        await esperar((ev.de === 'lixo' ? 550 : 300) * fv());
        break;
      }
      case 'descarte': {
        const v = vista();
        renderCentro(v, { de: ev.j });
        atualizarLugares(v);
        if (ev.j === 0) { jogo.nova = null; renderMao(); }
        if (P.Som) P.Som.carta();
        await esperar(380 * fv());
        break;
      }
      case 'reembaralhou':
        aviso('O monte acabou: o lixo (menos a de cima) foi embaralhado e virou monte.', 1800);
        renderCentro(vista());
        break;
      case 'bateu': {
        splash(ev.com === 10 ? 'BATEU COM 10!' : 'BATEU!', ev.j === 0 ? 'nos' : '');
        balao(ev.j, ev.com === 10 ? 'Bati com 10!' : 'Bati!', 'forte', 1800);
        if (P.Som) (ev.j === 0 ? P.Som.ficha : P.Som.alerta)();
        if (ev.descarte !== null && ev.descarte !== undefined) renderCentro(vista(), { de: ev.j });
        await esperar(900 * fv());
        break;
      }
      case 'fimMao':
        await fimDeMao(ev, token);
        break;
      case 'eliminado':
        if (ev.j !== 0) aviso(`<b>${esc(nomeDe(ev.j))}</b> ficou sem vidas e saiu da mesa.`, 1800);
        break;
      default: break;
    }
  }

  async function fimDeMao(ev, token) {
    const g = jogo.ui;
    marcarVez(-1);
    acoesEspera('');
    const cur = ev.curinga;
    const venceu = ev.vencedor === 0;
    if (!jogo.opcoes.semSalvar && ev.vidasAntes[0] > 0) D().alterarEstat(e => { e.maos++; if (venceu) { e.batidas++; if (ev.com === 10) e.batidas10++; } });
    atualizarLugares(Object.assign(jogo.motor.vistaPara(0), { vidas: ev.vidas }));
    const eu = ev.vidas[0];
    const fimPartida = ev.vidas.filter(v => v > 0).length <= 1 || !(eu > 0);
    const titulo = ev.vencedor === null ? 'Mão anulada (o monte acabou)'
      : venceu ? `Você bateu${ev.com === 10 ? ' com 10' : ''}!` : `${nomeDe(ev.vencedor)} bateu${ev.com === 10 ? ' com 10' : ''}${ev.furou ? ' (furou a fila)' : ''}`;
    const caixa = el('div', { class: 'tr-fim un-fim ca-fim' },
      el('h3', { class: ev.vencedor === null ? '' : venceu ? 'nos' : 'eles', text: titulo }),
      el('div', { class: 'motivo', html: ev.vencedor === null ? 'Ninguém perde vida.' : `Cada um dos outros perde <b>${ev.perda} ${ev.perda === 1 ? 'vida' : 'vidas'}</b>.` + (cur ? ` Curinga: ${esc(R.nomeCuringa(cur))}.` : '') }));
    if (ev.jogos) {
      const jg = el('div', { class: 'ca-jogos-fim' });
      ev.jogos.forEach(gr => { const b = el('div', { class: 'ca-jogo-fim' }); gr.cartas.forEach(id => b.appendChild(cartaEl(id))); jg.appendChild(b); });
      caixa.appendChild(jg);
    }
    const maos = el('div', { class: 'maos' });
    ev.maos.forEach((m, j) => {
      if (j === ev.vencedor || !(ev.vidasAntes[j] > 0)) return;
      const pl = R.faltam(m, cur, 9, true);
      const cs = el('div', { class: 'cs' });
      R.ordenar(m, cur, 'jogos').forEach((bl, bi) => bl.forEach((id, i) => { const c = cartaEl(id); if (bi && !i) c.classList.add('novo-bloco'); cs.appendChild(c); }));
      const dv = ev.vidasAntes[j] - ev.vidas[j];
      maos.appendChild(el('div', { class: 'mao-linha' + (j === 0 ? ' eu' : '') },
        el('span', { class: 'quem', html: esc(nomeDe(j)) + ` <small>${ev.vidas[j] > 0 ? '♥ ' + ev.vidas[j] : 'saiu'}${dv ? ' (−' + dv + ')' : ''} · faltavam ${pl.faltam}</small>` }), cs));
    });
    caixa.appendChild(maos);
    const barra = el('i');
    const botao = el('button', { class: 'btn btn-ouro', text: fimPartida ? 'Ver o resultado' : 'Próxima mão' });
    caixa.appendChild(el('div', { class: 'proxima' }, el('div', { class: 'progresso' }, barra), botao));
    g.palco.appendChild(caixa);
    const total = (jogo.opcoes.autoHeroi ? 300 : 9000) * Math.max(0.5, fv());
    let parado = false;
    caixa.addEventListener('click', e => { if (e.target !== botao) { parado = true; barra.style.width = '0'; } });
    await new Promise(res => {
      let t = 0;
      botao.onclick = () => res();
      const tick = () => {
        if (!jogo || jogo.token !== token) return res();
        if (!parado && pausas === 0) { t += 100; barra.style.width = Math.min(100, t / total * 100) + '%'; }
        if (t >= total) res(); else setTimeout(tick, 100);
      };
      tick();
    });
    caixa.remove();
    // você saiu: a partida acaba para você (a colocação é a de quem saiu agora)
    if (jogo && jogo.token === token && !(eu > 0)) {
      jogo.motor.parar();
      const vivos = ev.vidas.filter(v => v > 0).length;
      jogo.saiu = { colocacao: vivos + 1, vidas: ev.vidas.slice() };
    }
  }

  // ============================================================ partida
  /** Começa (ou retoma) uma partida. opcoes: { n, retomar, coach, autoHeroi, velocidade, amostras, amostrasBots, semSalvar, nivel }. */
  async function iniciar(opcoes) {
    encerrar();
    const cfgC = D().config();
    const salva = opcoes.retomar || null;
    const n = salva ? salva.cfg.n : Math.max(2, Math.min(6, opcoes.n || cfgC.jogadores));
    const op = R.opcoes(salva ? salva.cfg.opcoes : { vidas: cfgC.vidas, curinga: cfgC.curinga, furar: cfgC.furar });
    const nivel = salva ? salva.cfg.nivel || 'mestre' : opcoes.nivel || cfgC.nivel;
    let jogadores;
    if (salva) jogadores = salva.cfg.jogadores;
    else {
      const nomes = P.Baralho.embaralhar(IA.NOMES.slice());
      jogadores = [{ nome: P.Config.get('nome') || 'Você', avatar: null }];
      for (let j = 1; j < n; j++) jogadores.push({ nome: nomes[j], perfil: P.RNG.escolher(IA.LISTA_PERFIS), avatar: P.Bots.sortearAvatar() });
    }
    jogo = {
      n, jogadores, op, nivel, token: ++contador, notas: salva ? (salva.notas || []) : [],
      opcoes: Object.assign({ coach: cfgC.coach, amostras: 60 }, opcoes),
      pendente: null, conselho: null, sel: null, ordem: cfgC.ordem || 'jogos', mostrarDescartes: opcoes.descartes !== undefined ? opcoes.descartes : cfgC.descartes,
      cur: null, blocos: [[]]
    };
    jogo.agentes = [agenteHumano()];
    for (let j = 1; j < n; j++) jogo.agentes.push(agenteBot(j, jogadores[j].perfil));
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    const estado = salva ? salva.estado : { vidas: new Array(n).fill(op.vidas), dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 };
    const token = jogo.token;
    const semSalvar = !!opcoes.semSalvar;
    jogo.motor = K.Motor.criar({ n, opcoes: op, vidas: estado.vidas, dador: estado.dador, maoNumero: estado.maoNumero }, jogo.agentes, {
      evento: ev => aoEvento(ev),
      salvar: est => {
        if (semSalvar || !jogo || jogo.token !== token) return;
        D().salvar({ cfg: { n, jogadores, opcoes: op, nivel }, estado: { vidas: est.vidas, dador: est.dador, maoNumero: Math.max(0, est.maoNumero - 1) }, notas: jogo.notas, emJogo: true });
      }
    });
    if (salva) P.UI.aviso('<b>Partida retomada.</b> A mão que estava em andamento foi anulada.', 'aviso-ouro');
    let r = null;
    try { r = await jogo.motor.rodar(); }
    catch (e) {
      console.error(e);
      (window.__errosGlobais = window.__errosGlobais || []).push('Cacheta: ' + (e.stack || e.message));
      document.documentElement.setAttribute('data-erros', String(window.__errosGlobais.length));
      document.documentElement.setAttribute('data-ultimo-erro', String(e.stack || e.message).slice(0, 400));
      P.UI.aviso('Erro na cacheta: ' + esc(e.message), 'erro');
    }
    if (!jogo || jogo.token !== token) return;
    if (r) await fimDePartida({ colocacao: r.colocacao[0], vencedor: r.vencedor, maos: r.maos, vidas: r.vidas });
    else if (jogo.saiu) await fimDePartida({ colocacao: jogo.saiu.colocacao, vencedor: null, maos: jogo.motor.maoNumero(), vidas: jogo.saiu.vidas });
  }

  async function fimDePartida(r) {
    const venceu = r.colocacao === 1;
    if (!jogo.opcoes.semSalvar) { D().descartar(); D().alterarEstat(e => { e.partidas++; if (venceu) e.vitorias++; }); }
    document.documentElement.setAttribute('data-cacheta-fim', venceu ? 'vitoria' : 'derrota');
    if (venceu && P.Som) P.Som.vitoria();
    const cont = { otima: 0, boa: 0, imprecisa: 0, erro: 0 };
    jogo.notas.forEach(x => { cont[x.nota] = (cont[x.nota] || 0) + 1; });
    const corpo = el('div', { class: 'tr-resultado' },
      el('div', { class: 'grande ' + (venceu ? 'nos' : 'eles'), text: venceu ? 'Você venceu!' : `Você ficou em ${r.colocacao}º lugar` }),
      el('div', { style: { textAlign: 'center', color: 'var(--texto-2)', fontSize: '13px' }, text: `${r.maos} ${r.maos === 1 ? 'mão' : 'mãos'} · ${jogo.notas.length} jogadas avaliadas pelo coach` }));
    const tab = el('div', { class: 'un-placar-fim' });
    r.vidas.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).forEach(([v, j]) => tab.appendChild(el('div', { class: j === 0 ? 'eu' : '' }, el('span', { text: nomeDe(j) }), el('b', { text: v > 0 ? `♥ ${v}` : 'saiu' }))));
    corpo.appendChild(tab);
    const nt = el('div', { class: 'notas un-notas' });
    [['otima', 'Ótimas'], ['boa', 'Boas'], ['imprecisa', 'Imprecisas'], ['erro', 'Erros']].forEach(([k, rot]) => nt.appendChild(el('div', { class: 'nota-' + k }, el('b', { text: cont[k] }), el('span', { text: rot }))));
    corpo.appendChild(nt);
    const piores = jogo.notas.filter(x => x.nota === 'erro' || x.nota === 'imprecisa').sort((a, b) => b.perda - a.perda).slice(0, 3);
    if (piores.length) {
      const l = el('div', { class: 'piores' });
      piores.forEach(x => l.appendChild(el('div', { html: `<b>Mão ${x.mao}:</b> ${x.texto}` })));
      corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Para rever' }), l));
    }
    if (jogo.opcoes.autoHeroi) { encerrar(); return; }
    pausar(true);
    let escolha;
    try { escolha = await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, botoes: [{ texto: 'Voltar', valor: 'sair' }, { texto: 'Jogar de novo', valor: 'denovo', classe: 'btn-ouro' }] }); }
    finally { pausar(false); }
    const n = jogo.n;
    encerrar();
    if (escolha === 'denovo') iniciar({ n });
    else P.App.irPara('cacheta');
  }

  function encerrar() {
    if (!jogo) return;
    const j = jogo;
    jogo = null;
    j.token = -1;
    if (j.motor) j.motor.parar();
    if (j.observador) j.observador.disconnect();
    if (j.pendente) j.pendente.resolve(j.pendente.tipo === 'comprar' ? 'monte' : j.pendente.tipo === 'furar' ? false : { tipo: 'descartar', carta: j.pendente.vista.mao.find(x => x !== j.pendente.vista.doLixo) });
    const s = D().salva();
    if (s && s.emJogo) { s.emJogo = false; D().salvar(s); }
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    const raiz = $('#tela-cacheta');
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
  }

  async function sair() {
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Cacheta, do começo da mão atual.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('cacheta');
  }
  async function abrirRegras() {
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UICacheta.regrasNo() }); } finally { pausar(false); }
  }
  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar'], ['ordem', 'Arrumar a mão: ' + ORDENS[(ORDENS.findIndex(o => o[0] === jogo.ordem) + 1) % ORDENS.length][1]],
      ['descartes', jogo.mostrarDescartes ? 'Esconder o que cada um descartou' : 'Mostrar o que cada um descartou'], ['vidas', 'Vidas']]
      .concat(modos.filter(m => m[0] !== jogo.opcoes.coach)).concat([['som', P.Config.get('som') ? 'Desligar o som' : 'Ligar o som'], ['sair', 'Sair da partida']]);
    pausar(true);
    let escolha;
    try {
      escolha = await P.UI.modal({ titulo: 'Menu', conteudo: el('div', { class: 'menu-mesa' }),
        aoAbrir: (corpo, fechar) => itens.forEach(([id, txt]) => corpo.firstChild.appendChild(el('button', { class: 'btn' + (id === 'sair' ? ' btn-sair' : ''), text: txt, onclick: () => fechar(id) }))) });
    } finally { pausar(false); }
    if (!escolha || !jogo) return;
    if (escolha === 'sair') return sair();
    if (escolha === 'som') return P.Config.set('som', !P.Config.get('som'));
    if (escolha === 'regras') return abrirRegras();
    if (escolha === 'ordem') return trocarOrdem();
    if (escolha === 'descartes') {
      jogo.mostrarDescartes = !jogo.mostrarDescartes;
      const c = D().config(); c.descartes = jogo.mostrarDescartes; D().salvarConfig(c);
      atualizarLugares(jogo.motor.vistaPara(0));
      layout();
      return;
    }
    if (escolha === 'vidas') {
      const v = jogo.motor.vistaPara(0);
      const tab = el('div', { class: 'un-placar-fim' });
      v.vidas.map((x, j) => [x, j]).sort((a, b) => b[0] - a[0]).forEach(([x, j]) => tab.appendChild(el('div', { class: j === 0 ? 'eu' : '' }, el('span', { text: nomeDe(j) }), el('b', { text: x > 0 ? `♥ ${x}` : 'saiu' }))));
      pausar(true);
      try { await P.UI.modal({ titulo: 'Vidas', conteudo: tab }); } finally { pausar(false); }
      return;
    }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) mudarModoCoach(modo[0]);
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-cacheta').dataset.tema = v; } });

  P.UICachetaMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, _jogo: () => jogo, cartaEl };
})(window.Poker = window.Poker || {});
