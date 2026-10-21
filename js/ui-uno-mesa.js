/* ==========================================================================
   OUTS · Treino Lab — ui-uno-mesa.js
   A mesa do "Última!", com as mesmas peças das mesas do poker e do truco:
   barra de cima, palco com a mesa oval, placas dos jogadores em volta (com
   as cartas viradas e quantas têm), no meio a compra e a pilha com a cor da
   vez e o sentido; a sua mão sobre a borda da mesa (toque numa carta para
   jogar; na regra "cartas iguais juntas", toque para escolher e aperte
   Jogar), a barra de ações (Última!, Comprar/Passar, Desafiar/Pegou!) e o
   coach (painel no PC, janela no celular). A partida fica salva no começo de
   cada mão: se o app fechar, ela volta pela aba (a mão em andamento é anulada).
   A mesa não entrega o jogo: as cartas que servem não ficam destacadas (só a
   dica do coach, se você quiser), cada carta comprada é um toque em Comprar
   e, depois de comprar, quem decide se joga ou passa é você.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const U = P.Uno, R = U.Regras, IA = U.IA, CO = U.Coach, D = U.Dados;
  const C = R.CARTAS;
  const VELOCIDADES = { lenta: 1.8, normal: 1.25, rapida: 0.9, turbo: 0.25 };
  const fv = () => (jogo && jogo.opcoes.velocidade !== undefined ? jogo.opcoes.velocidade : VELOCIDADES[P.Config.get('velocidade')] || 1);
  const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

  let jogo = null;
  let pausas = 0;
  let contador = 0;

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
  /** Carta do Última! (id) ou o verso (null). */
  function cartaEl(id, opts) {
    opts = opts || {};
    if (id === null || id === undefined) return el('div', { class: 'un-carta verso' + (opts.classe ? ' ' + opts.classe : '') }, el('span', { class: 'logo', text: 'Última!' }));
    const c = C[id], s = R.simbolo(id);
    const cor = c.coringa ? 'coringa' : R.CORES[c.cor];
    const sub = c.tipo === 'num' && (c.num === 6 || c.num === 9) ? ' sub' : '';
    return el('div', { class: `un-carta ${cor}` + (opts.classe ? ' ' + opts.classe : ''), 'data-id': id, title: R.nome(id) },
      el('span', { class: 'canto' + sub, text: s }),
      c.coringa ? el('span', { class: 'disco' }) : null,
      el('span', { class: 'meio' + sub + (s.length > 1 ? ' longo' : ''), text: s }),
      el('span', { class: 'canto b' + sub, text: s }));
  }

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-uno');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    const n = jogo.n;
    g.raiz = el('div', { class: 'tr-jogo un-jogo', 'data-tema': P.Config.get('tema') || 'verde', 'data-n': n });

    // barra de cima
    const op = jogo.op;
    const detalhe = `${n} jogadores · ${op.ate ? 'até ' + op.ate + ' pontos' : 'uma mão'}${op.juntas ? ' · iguais juntas' : ''} · bots ${IA.NIVEIS[jogo.nivel].nome.toLowerCase()}`;
    g.detalhe = el('span', { class: 'detalhe', text: detalhe });
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra un-barra' },
      el('span', { class: 'rotulo', text: 'Última!' }), g.detalhe, el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));

    // palco
    g.oval = el('div', { class: 'mesa-oval' },
      el('div', { class: 'borda' }),
      el('div', { class: 'feltro' }, el('div', { class: 'mesa-logo', html: '<b>ÚLTIMA!</b><span>Treino Lab</span>' })));
    g.hudMao = el('span', { text: 'Mão 1' });
    g.hudAlvo = el('span', { text: op.ate ? `até ${op.ate}` : 'uma mão' });
    g.hud = el('div', { class: 'tr-hud un-hud' }, el('b', { text: 'Última!' }), g.hudMao, g.hudAlvo);
    g.palco = el('div', { class: 'mesa-palco tr-palco un-palco' }, g.oval, g.hud,
      el('button', { class: 'btn-barra so-celular tr-btn-menu', title: 'Menu', html: '&#9776;', onclick: abrirMenu }));
    g.lugares = [];
    for (let j = 0; j < n; j++) {
      const info = jogo.jogadores[j];
      const l = { j };
      l.balao = el('div', { class: 'balao' });
      l.costas = el('div', { class: 'un-costas' });
      l.qtd = el('span', { class: 'un-qtd', text: '7' });
      l.pontos = el('span', { class: 'un-pts', text: '0' });
      l.selo = el('span', { class: 'un-selo oculto', text: 'Última!' });
      const linha2 = el('div', { class: 'linha2' });
      if (info.perfil) { const pf = IA.PERFIS[info.perfil]; linha2.appendChild(el('span', { class: 'tag-perfil', style: { '--cor-perfil': pf.cor }, title: `${pf.nome}: ${pf.descricao}`, text: pf.sigla })); }
      linha2.appendChild(l.pontos);
      l.raiz = el('div', { class: 'tr-lugar un-lugar' + (j === 0 ? ' heroi' : '') },
        j === 0 ? null : l.costas,
        el('div', { class: 'corpo' },
          el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, j === 0) }),
          el('div', { class: 'info' }, el('span', { class: 'nome', text: j === 0 ? 'Você' : info.nome }), linha2),
          j === 0 ? null : l.qtd),
        l.selo, l.balao);
      g.lugares.push(l);
      g.palco.appendChild(l.raiz);
    }
    // centro: compra, pilha (com a cor da vez) e o sentido
    g.compraEl = el('div', { class: 'un-compra', title: 'Compra' }, cartaEl(null), cartaEl(null), cartaEl(null));
    g.compraQtd = el('span', { class: 'un-compra-qtd' });
    g.compraEl.appendChild(g.compraQtd);
    g.pilha = el('div', { class: 'un-pilha' });
    g.anel = el('div', { class: 'un-anel' });
    g.sentido = el('div', { class: 'un-sentido', html: '<svg viewBox="0 0 100 100"><path d="M50 8a42 42 0 0 1 36 20" /><path d="M92 50a42 42 0 0 1-20 36" /><path d="M50 92a42 42 0 0 1-36-20" /><path d="M8 50a42 42 0 0 1 20-36" /></svg>' });
    g.corTxt = el('div', { class: 'un-cor-vez' });
    g.centro = el('div', { class: 'un-centro' }, g.sentido, g.compraEl, el('div', { class: 'un-pilha-caixa' }, g.anel, g.pilha), g.corTxt);
    g.compraEl.addEventListener('click', () => {
      if (!jogo) return;
      if (jogo.compraPendente) { resolverCompra(); return; }
      if (jogo.pendente && !g.btnB.disabled && ['comprar', 'comprarOutra', 'aceitar'].indexOf(g.btnB.dataset.papel) >= 0) g.btnB.click();
    });
    g.splash = el('div', { class: 'tr-splash un-splash' });
    g.mao = el('div', { class: 'un-mao' });
    g.cores = el('div', { class: 'un-cores oculto' });
    g.palco.append(g.centro, g.mao, g.splash, g.cores);

    // barra de ações
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada jogada sua.</span>' });
    g.coachNota = el('span');
    g.btnDica = el('button', { class: 'btn oculto', text: 'Dica', onclick: e => { e.stopPropagation(); mostrarDica(); } });
    g.coach = el('div', { class: 'tr-coach', title: 'Ver a conta do coach', onclick: () => abrirCoach() }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt, g.btnDica);
    g.status = el('div', { class: 'tr-status' });
    g.btnA = el('button', { class: 'btn-acao un-btn-ultima', html: 'Última!<small>antes da penúltima</small>' });
    g.btnB = el('button', { class: 'btn-acao btn-aceitar', html: 'Comprar' });
    g.btnC = el('button', { class: 'btn-acao btn-tr-dica', html: 'Dica' });
    g.acoes = el('div', { class: 'barra-acoes tr-acoes un-acoes' },
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
    atualizarPainel();
    if (jogo.observador) jogo.observador.disconnect();
    jogo.observador = new ResizeObserver(() => layout());
    jogo.observador.observe(g.palco);
    layout();
  }

  // ============================================================== geometria
  // ângulos dos lugares (90° = você, embaixo; depois no sentido horário da tela: esquerda, topo, direita)
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
    // sua mão: cartas maiores no celular em pé (a largura é acertada depois de pôr os lugares)
    const nMao = Math.max(1, g.mao.children.length);
    let maoL = compacto ? (vertical ? limitar(W * 0.17, 50, 74) : limitar(H * 0.17, 40, 62)) : limitar(Math.min(W * 0.07, H * 0.13), 52, 90);
    let maoH = maoL * 1.5;
    const yHeroi = H - pad - heroH / 2;
    const maoBase = yHeroi - heroH / 2 + Math.min(10, heroH * 0.2);
    // mesa oval: dos lugares de cima até a sua placa
    const topo = pad + sobra + seatH / 2;
    const oTopo = topo - (compacto ? seatH * 0.1 : 0), oBase = yHeroi;
    const oh = oBase - oTopo;
    const ow = Math.min(W - 2 * pad - assentoL * 0.9, oh * 2.15);
    const cx = W / 2;
    Object.assign(g.oval.style, { left: (cx - ow / 2) + 'px', top: oTopo + 'px', width: ow + 'px', height: oh + 'px', borderRadius: oh > ow ? (ow / 2) + 'px' : '' });
    g.palco.style.setProperty('--borda-l', limitar(Math.min(ow, oh) * (compacto ? 0.035 : 0.026), 8, 20) + 'px');
    // lugares em volta (elipse que passa pelas bordas); os de baixo ficam acima da faixa da sua mão
    const angulos = (vertical ? ANGULOS_VERTICAL : ANGULOS)[n];
    const rx = Math.min(ow / 2, W / 2 - pad - assentoL / 2), ry = (yHeroi - topo) / 2, cyL = (yHeroi + topo) / 2;
    const yMaxLado = vertical ? maoBase - maoH - seatH / 2 - 4 : yHeroi - heroH / 2 - seatH / 2 - maoH * 0.4;
    const pos = [];
    for (let j = 0; j < n; j++) {
      const t = angulos[j] * Math.PI / 180;
      let x = cx + rx * Math.cos(t), y = cyL + ry * Math.sin(t);
      if (j === 0) { x = cx; y = yHeroi; }
      else {
        x = limitar(x, assentoL / 2 + pad, W - assentoL / 2 - pad);
        y = limitar(y, topo, Math.max(topo, yMaxLado));
      }
      pos.push({ x, y });
      g.lugares[j].raiz.style.left = x + 'px';
      g.lugares[j].raiz.style.top = y + 'px';
    }
    // largura da mão: entre os lugares que ficam na altura dela
    let largMao = Math.min(W - 2 * pad, compacto ? W : W * 0.8);
    pos.forEach((p, j) => {
      if (!j || p.y + seatH / 2 < maoBase - maoH) return;
      largMao = Math.min(largMao, 2 * (Math.abs(p.x - cx) - assentoL / 2 - 6));
    });
    largMao = Math.max(largMao, maoL * 2.2);
    // muitas cartas: sobrepõe (passo mínimo ~30% da carta) e, se ainda não couber, diminui
    let passo = maoL * 1.08;
    if (nMao > 1 && maoL + (nMao - 1) * passo > largMao) passo = (largMao - maoL) / (nMao - 1);
    if (passo < maoL * 0.3) { maoL = Math.max(34, largMao / (1 + (nMao - 1) * 0.3)); passo = (largMao - maoL) / Math.max(1, nMao - 1); maoH = maoL * 1.5; }
    // centro: compra e pilha lado a lado, entre os lugares de cima e a sua mão
    let cartaL = compacto ? limitar(Math.min(W * (vertical ? 0.17 : 0.085), H * 0.15), 38, 64) : limitar(Math.min(W * 0.07, H * 0.13), 50, 88);
    // faixa livre no meio: abaixo dos lugares que ficam em cima do centro e acima da sua mão
    const meiaLarg = cartaL * 1.3 + assentoL / 2;
    const livreTopo = Math.max(oTopo + 6, ...pos.filter((p, j) => j && Math.abs(p.x - cx) < meiaLarg).map(p => p.y + seatH / 2));
    const livreBase = maoBase - maoH - 8;
    cartaL = Math.max(30, Math.min(cartaL, (livreBase - livreTopo - 28) / 1.5));
    const yCentro = (livreTopo + livreBase) / 2 - 6;
    g.centro.style.left = cx + 'px';
    g.centro.style.top = yCentro + 'px';
    g.palco.style.setProperty('--carta-l', cartaL + 'px');
    g.palco.style.setProperty('--avatar-l', avatarL + 'px');
    g.palco.style.setProperty('--assento-l', assentoL + 'px');
    g.palco.style.setProperty('--heroi-l', heroL + 'px');
    g.palco.style.setProperty('--costas-l', costasL + 'px');
    g.palco.style.setProperty('--mao-l', maoL + 'px');
    g.palco.style.setProperty('--mao-passo', passo + 'px');
    g.mao.style.left = cx + 'px';
    g.mao.style.top = maoBase + 'px';
    const logo = g.oval.querySelector('.mesa-logo');
    logo.style.top = ((yCentro + cartaL * 0.75 + 30 + maoBase - maoH) / 2 - oTopo) + 'px';
    logo.style.display = (maoBase - maoH) - (yCentro + cartaL * 0.75 + 30) > 40 ? '' : 'none';
    jogo.geo = { W, H, cx, yCentro, cartaL, pos, compacto };
  }

  // ============================================================ desenho
  function balao(j, texto, classe, ms) {
    const b = jogo.ui.lugares[j].balao;
    b.textContent = texto;
    b.className = 'balao on ' + (classe || '');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('on'), ms || 1500 * Math.max(0.6, fv()));
  }
  function splash(texto, classe) {
    const s = jogo.ui.splash;
    s.textContent = texto;
    s.className = 'tr-splash un-splash ' + (classe || '');
    s.style.setProperty('--t-splash', Math.round(900 * Math.max(0.5, fv())) + 'ms');
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

  /** Placas: quantas cartas cada um tem, os pontos e o selo de Última!. */
  function atualizarLugares(v) {
    const g = jogo.ui;
    g.lugares.forEach((l, j) => {
      const k = v.nCartas[j];
      l.qtd.textContent = k;
      l.qtd.classList.toggle('pouca', k <= 2);
      l.pontos.textContent = jogo.op.ate ? `${v.placar[j]} pts` : (j === 0 ? 'você' : '');
      l.selo.classList.toggle('oculto', !(k === 1 && v.ultima[j]));
      if (j) {
        const mostrar = Math.min(k, 4);
        if (l.costas.children.length !== mostrar) {
          l.costas.innerHTML = '';
          for (let i = 0; i < mostrar; i++) l.costas.appendChild(cartaEl(null));
        }
      }
    });
    g.compraQtd.textContent = v.compra;
  }

  function renderCentro(v, animar) {
    const g = jogo.ui;
    const topo = cartaEl(v.topo, { classe: animar ? 'entrando' : '' });
    if (animar && animar.de !== undefined) {
      const l = g.lugares[animar.de].raiz, ref = g.centro;
      const dx = parseFloat(l.style.left) - parseFloat(ref.style.left), dy = parseFloat(l.style.top) - parseFloat(ref.style.top);
      topo.style.setProperty('--de-x', dx + 'px'); topo.style.setProperty('--de-y', dy + 'px');
      topo.style.setProperty('--de-r', (P.RNG.real() * 30 - 15) + 'deg');
      topo.style.setProperty('--t-entrar', Math.round(320 * Math.max(0.4, fv())) + 'ms');
    }
    // a pilha guarda as 3 de cima, levemente tortas
    const antigas = Array.from(g.pilha.children).slice(-2);
    g.pilha.innerHTML = '';
    antigas.forEach(c => { c.classList.remove('entrando'); c.classList.add('antiga'); g.pilha.appendChild(c); });
    topo.style.setProperty('--giro', (P.RNG.real() * 16 - 8) + 'deg');
    g.pilha.appendChild(topo);
    g.anel.className = 'un-anel ' + R.CORES[v.cor];
    g.corTxt.className = 'un-cor-vez ' + R.CORES[v.cor];
    g.corTxt.textContent = R.NOMES_COR[v.cor];
    g.sentido.classList.toggle('anti', v.sentido < 0);
  }

  /** Cartas que o coach sugere (assinaturas; várias na jogada de cartas juntas). */
  function cartasSugeridas() {
    const c = jogo.conselho;
    if (!c || !c.melhor || c.melhor.tipo !== 'carta' || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista)) return [];
    return (c.melhor.cartas && c.melhor.cartas.length > 1 ? c.melhor.cartas : [c.melhor.carta]).map(id => C[id].sig);
  }

  /** A sua mão. Nada indica quais cartas servem (só a dica do coach, quando ligada). */
  function renderMao() {
    const g = jogo.ui, v = jogo.motor.vistaPara(0);
    g.mao.innerHTML = '';
    const pend = jogo.pendente;
    const sug = cartasSugeridas();
    const sel = jogo.selecao || [];
    // ordem: por cor, depois número/ação; coringas no fim
    const mao = v.mao.slice().sort((a, b) => {
      const x = C[a], y = C[b];
      const kx = x.coringa ? 9 : x.cor, ky = y.coringa ? 9 : y.cor;
      return kx - ky || (x.tipo === 'num' ? x.num : 20 + R.TIPOS.indexOf(x.tipo)) - (y.tipo === 'num' ? y.num : 20 + R.TIPOS.indexOf(y.tipo));
    });
    let primeiraSug = true;
    mao.forEach((id, i) => {
      const k = sug.indexOf(C[id].sig);
      const sugerida = k >= 0;
      if (sugerida) sug.splice(k, 1);
      const ordem = sel.indexOf(id);
      const b = el('button', { class: 'un-carta-mao' + (sugerida ? ' sugerida' + (primeiraSug ? '' : ' sug-extra') : '') + (ordem >= 0 ? ' selecionada' : '') + (jogo.novas && jogo.novas.indexOf(id) >= 0 ? ' nova' : '') + (pend && pend.vista.comprada === id ? ' comprada' : ''),
        style: { '--i': i }, 'data-carta': id, title: R.nome(id) }, cartaEl(id),
        ordem >= 0 && sel.length > 1 ? el('span', { class: 'un-ordem', text: String(ordem + 1) }) : null);
      if (sugerida) primeiraSug = false;
      b.addEventListener('click', () => tocarCarta(id));
      g.mao.appendChild(b);
    });
    g.mao.classList.toggle('minha-vez', !!pend);
    jogo.novas = null;
    layout();
  }

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
    if (modo === 'sempre' || jogo.dicaVista) { coachNota(null); coachTexto(jogo.conselho.resumo); marcarSugestoes(); renderMao(); }
    else if (modo === 'pedido') coachTexto('<span class="calc">Quer ajuda? Toque em <b>Dica</b>.</span>');
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
    [g.btnA, g.btnB, g.btnC].forEach(b => b.classList.remove('sugerido'));
    if (!c || !(jogo.opcoes.coach === 'sempre' || jogo.dicaVista)) return;
    const t = c.melhor.tipo;
    const papel = { comprar: ['comprar', 'comprarOutra', 'aceitar'], passar: ['passar'], desafiar: ['desafiar'] }[t] || [];
    [g.btnB, g.btnC].forEach(b => { if (!b.disabled && papel.indexOf(b.dataset.papel) >= 0) b.classList.add('sugerido'); });
  }

  function conteudoCoach(paraVer) {
    const c = jogo.conselho, ultima = jogo.ultimaNota, modo = jogo.opcoes.coach;
    const corpo = el('div', { class: 'tr-coach-modal' });
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
      if (c.opcoes && c.opcoes.length > 1 && !c.melhor.unica) {
        const barras = el('div', { class: 'tr-barras-cartas' });
        c.opcoes.slice(0, 7).forEach(o => barras.appendChild(el('div', { class: 'tr-barra-carta' },
          el('span', { html: CO.descreve(o) }),
          el('div', { class: 'barra' }, el('i', { style: { width: Math.round(o.p * 100) + '%' } })),
          el('b', { text: CO.pct(o.p) }))));
        corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Chance de ganhar a mão com cada jogada' }), barras));
        corpo.appendChild(el('div', { class: 'rodape-calc', text: 'Conta feita sorteando muitas vezes as cartas que você não vê (pesando o que cada um mostrou: o que comprou, as cores que escolheu) e jogando a mão até o fim com cada jogada.' }));
      }
    } else if (c && modo === 'pedido') {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach sob pedido</b>Quer ajuda nesta jogada? Toque em <b>Dica</b>.' }));
    } else if (!ultima) {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Aguardando a sua vez</b>Na sua vez o coach mostra a chance de ganhar a mão com cada jogada e explica a melhor.' }));
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
    const c = D.config(); c.coach = id; D.salvarConfig(c);
    aplicarModoCoach();
    if (jogo.pendente) { prepararBotoes(jogo.pendente.vista); mostrarConselho(); renderMao(); }
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
  function registrarNota(acao) {
    const cons = jogo.conselho;
    const av = CO.avaliar(cons, acao);
    if (!av) return;
    jogo.notas.push({ nota: av.nota, texto: av.texto, perda: av.perda, mao: jogo.motor.maoNumero() });
    jogo.ultimaNota = av;
    if (!jogo.opcoes.semSalvar) D.alterarEstat(e => { e.notas[av.nota] = (e.notas[av.nota] || 0) + 1; });
    if (jogo.opcoes.coach !== 'desligado') { coachNota(av); coachTexto(av.texto); }
    if (jogo.opcoes.coach !== 'desligado' && P.Som) (av.nota === 'erro' ? P.Som.erro : av.nota === 'otima' ? P.Som.acerto : () => {})();
  }
  function opcoesCoach() {
    const modelos = jogo.jogadores.map((x, j) => {
      if (j === 0) return null;
      const m = jogo.leitor.modelo(j), pf = IA.PERFIS[x.perfil];
      return { blefe: Math.min(0.9, m.blefe * (pf ? pf.blefe : 1)), desafio: m.desafio };
    });
    return { amostras: jogo.opcoes.amostras || 160, modelos, nomes: jogo.jogadores.map((x, j) => (j === 0 ? 'Você' : x.nome)) };
  }
  function calcularConselho(vista) {
    const token = jogo.token, pend = jogo.pendente;
    if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Calculando…</span>'); }
    setTimeout(() => {
      if (!jogo || jogo.token !== token || jogo.pendente !== pend) return;
      let c = null;
      try { c = CO.conselho(vista, opcoesCoach()); } catch (e) { console.error(e); }
      if (!jogo || jogo.pendente !== pend) return;
      jogo.conselho = c;
      mostrarConselho();
      renderMao();
      if (jogo.opcoes.autoHeroi) setTimeout(() => autoJogar(pend), 10);
    }, 30);
  }

  // ================================================================ ações
  /** Os três botões: [Última!] [Comprar/Jogar/Passar/Comprar N] [Dica/Desafiar/Passar]. */
  function acoesEspera(texto) {
    const g = jogo.ui;
    [g.btnA, g.btnB, g.btnC].forEach(b => { b.disabled = true; b.classList.remove('sugerido', 'ativo', 'pulsa'); b.onclick = null; b.dataset.papel = ''; });
    g.btnA.className = 'btn-acao un-btn-ultima'; g.btnA.innerHTML = 'Última!<small>antes da penúltima</small>';
    g.btnB.className = 'btn-acao btn-aceitar'; g.btnB.innerHTML = 'Comprar';
    g.btnC.className = 'btn-acao btn-tr-dica'; g.btnC.innerHTML = 'Dica';
    g.status.innerHTML = texto || '';
    g.mao.classList.remove('minha-vez');
  }
  function botao(b, classe, html, papel, fn) {
    b.disabled = false; b.className = 'btn-acao ' + classe; b.innerHTML = html; b.dataset.papel = papel; b.onclick = fn;
  }
  /** Os textos não contam se você tem jogada: quem procura a carta é você. */
  function prepararBotoes(vista) {
    const g = jogo.ui, op = jogo.op;
    acoesEspera('');
    const n = vista.mao.length;
    // Última!: com 2 cartas na mão (ou, jogando cartas juntas, a qualquer hora: várias de uma vez podem deixar uma só)
    if (vista.fase !== 'responder' && (n <= 2 || (op.juntas && vista.fase === 'jogar'))) {
      g.btnA.disabled = false;
      g.btnA.classList.toggle('ativo', !!jogo.ultimaArmada);
      g.btnA.innerHTML = jogo.ultimaArmada ? 'Última!<small>dito ✓</small>' : 'Última!<small>aperte e jogue</small>';
      g.btnA.onclick = () => { jogo.ultimaArmada = !jogo.ultimaArmada; prepararBotoes(vista); };
      if (!jogo.ultimaArmada && n === 2 && vista.fase === 'jogar') g.btnA.classList.add('pulsa');
    }
    if (vista.fase === 'responder') {
      const p = vista.pendente;
      botao(g.btnB, 'btn-correr', `Comprar ${p.qtd}<small>uma por toque</small>`, 'aceitar', () => acaoComprar());
      if (vista.podeDesafiar) botao(g.btnC, 'un-btn-desafio', 'Desafiar<small>blefe? ele compra 4</small>', 'desafiar', () => acaoDesafiar());
      else ajustarDica();
      const passar = op.acumular ? ' Ou passe adiante com um +2 ou +4 (toque nele).' : '';
      g.status.innerHTML = vista.podeDesafiar ? `<b>+4 em você!</b> Compre as 4 ou desafie (se não era blefe, você compra 6).${passar}` : `<b>+${p.qtd} em você!</b> Compre as cartas.${passar}`;
    } else if (vista.fase === 'depoisDeComprar') {
      const comprada = CO.cartaHtml(vista.comprada);
      if (op.comprarAtePoder) {
        botao(g.btnB, 'btn-aceitar', 'Comprar outra<small>até sair uma que sirva</small>', 'comprarOutra', () => acaoComprarOutra());
        botao(g.btnC, 'btn-correr', 'Passar<small>guardar a carta</small>', 'passar', () => acaoPassar());
        g.status.innerHTML = `<b>Você comprou ${comprada}</b> Se servir, toque nela para jogar (ou passe); se não, compre outra`;
      } else {
        botao(g.btnB, 'btn-aceitar', 'Passar<small>guardar a carta</small>', 'passar', () => acaoPassar());
        ajustarDica();
        g.status.innerHTML = `<b>Você comprou ${comprada}</b> Toque nela para jogar, ou passe a vez`;
      }
    } else {
      const sel = jogo.selecao || [];
      if (op.juntas && sel.length) {
        botao(g.btnB, 'btn-aceitar', sel.length === 1 ? 'Jogar<small>ou toque nas iguais</small>' : `Jogar ${sel.length}<small>a última por cima</small>`, 'jogar', () => acaoJogarSelecao());
      } else botao(g.btnB, 'btn-aceitar', 'Comprar<small>uma carta</small>', 'comprar', () => acaoComprar());
      ajustarDica();
      g.status.innerHTML = op.juntas
        ? (sel.length ? `<b>${sel.length} ${sel.length === 1 ? 'escolhida' : 'escolhidas'}</b> — toque nas iguais ou aperte Jogar` : '<b>Sua vez:</b> escolha as cartas e aperte Jogar, ou compre')
        : '<b>Sua vez:</b> toque numa carta para jogar, ou compre';
    }
    g.mao.classList.add('minha-vez');
    marcarSugestoes();
  }
  /** A pessoa precisa comprar (+2, +4, desafio, Última! esquecido): um toque por carta. */
  function pedirCompra(info) {
    return new Promise(resolve => {
      jogo.compraPendente = { resolve, info };
      prepararCompra();
      if (jogo.opcoes.autoHeroi) setTimeout(resolverCompra, 5);
    });
  }
  function prepararCompra() {
    const g = jogo.ui, i = jogo.compraPendente.info;
    acoesEspera('');
    const feitas = i.total - i.faltam;
    botao(g.btnB, 'btn-correr', `Comprar<small>${i.total > 1 ? `carta ${feitas + 1} de ${i.total}` : 'uma carta'}</small>`, 'compraPendente', () => resolverCompra());
    g.btnB.classList.add('pulsa');
    const motivo = i.motivo === 'mais2' ? '+2 em você' : i.motivo === 'mais4' ? '+4 em você' : i.motivo === 'pegou' ? 'Pegaram você sem dizer Última!'
      : i.motivo === 'desafio' ? (i.total === 6 ? 'Não era blefe' : 'Pegaram o blefe') : 'Compre';
    g.status.innerHTML = `<b>${motivo}:</b> toque em Comprar para pegar cada carta (${i.faltam === 1 ? 'falta 1' : 'faltam ' + i.faltam})`;
  }
  function resolverCompra() {
    const cp = jogo && jogo.compraPendente;
    if (!cp) return;
    jogo.compraPendente = null;
    acoesEspera('');
    cp.resolve();
  }
  function ajustarDica() {
    const g = jogo.ui;
    g.btnC.className = 'btn-acao btn-tr-dica';
    g.btnC.disabled = jogo.opcoes.coach !== 'pedido';
    g.btnC.innerHTML = 'Dica' + (jogo.opcoes.coach === 'sempre' ? '<small>já na faixa</small>' : jogo.opcoes.coach === 'desligado' ? '<small>coach desligado</small>' : '');
    g.btnC.onclick = () => mostrarDica();
  }

  function resolver(acao) {
    const pend = jogo.pendente;
    if (!pend) return;
    if (jogo.conselho) registrarNota(acao);
    jogo.pendente = null;
    jogo.conselho = null;
    jogo.dicaVista = false;
    jogo.selecao = [];
    jogo.ui.btnDica.classList.add('oculto');
    esconderCores();
    acoesEspera('');
    renderMao();
    atualizarPainel();
    pend.resolve(acao);
  }
  /** Toque numa carta que não pode ir: avisa (sem castigo) e a vez continua. */
  function recusar(texto) {
    if (P.Som) P.Som.erro();
    aviso(texto, 2200);
  }
  function naoServe(id) {
    if (C[id].tipo === 'mais4' && !jogo.op.desafio) return 'O +4 só vale quando você <b>não tem carta da cor da mesa</b>.';
    return 'Essa carta não combina com a mesa: precisa ser da <b>mesma cor</b>, do <b>mesmo número</b> ou do <b>mesmo símbolo</b>.';
  }
  function tocarCarta(id) {
    const pend = jogo && jogo.pendente;
    if (!pend) return;
    const v = pend.vista;
    if (v.fase === 'depoisDeComprar') {
      if (id !== v.comprada) return recusar('Depois de comprar, só dá para jogar <b>a carta que você comprou</b>.');
      if (v.jogaveis.indexOf(id) < 0) return recusar(naoServe(id));
      return jogarUma(id);
    }
    if (v.fase === 'responder') {
      if (v.jogaveis.indexOf(id) < 0) return recusar(jogo.op.acumular ? 'Para passar adiante, só com um <b>+2</b> ou um <b>+4</b>.' : 'Agora é comprar as 4 ou desafiar.');
      return jogarUma(id);
    }
    if (jogo.op.juntas) return escolher(id);
    if (v.jogaveis.indexOf(id) < 0) return recusar(naoServe(id));
    jogarUma(id);
  }
  function jogarUma(id) {
    const ultima = !!jogo.ultimaArmada;
    if (C[id].coringa) { mostrarCores(id, cor => resolver({ tipo: 'carta', carta: id, cor, ultima })); return; }
    resolver({ tipo: 'carta', carta: id, ultima });
  }
  /** Cartas juntas: o toque escolhe (ou tira); uma carta de outro número começa outra escolha. */
  function escolher(id) {
    const v = jogo.pendente.vista;
    const sel = jogo.selecao = jogo.selecao || [];
    const k = sel.indexOf(id);
    if (k >= 0) sel.splice(k, 1);
    else if (sel.length && C[sel[0]].tipo === 'num' && C[id].tipo === 'num' && C[id].num === C[sel[0]].num) sel.push(id);
    else { sel.length = 0; sel.push(id); }
    prepararBotoes(v);
    renderMao();
  }
  function acaoJogarSelecao() {
    const pend = jogo && jogo.pendente;
    if (!pend) return;
    const v = pend.vista, sel = (jogo.selecao || []).slice();
    if (!sel.length) return;
    if (sel.length === 1) {
      if (v.jogaveis.indexOf(sel[0]) < 0) return recusar(naoServe(sel[0]));
      return jogarUma(sel[0]);
    }
    // a primeira tem de combinar com a mesa: se a primeira escolhida não combina, vai na frente uma que combine
    // (de preferência sem tirar a última, que é a que fica por cima)
    if (v.jogaveis.indexOf(sel[0]) < 0) {
      const f = sel.slice(0, -1).find(x => v.jogaveis.indexOf(x) >= 0);
      const g = f !== undefined ? f : sel.find(x => v.jogaveis.indexOf(x) >= 0);
      if (g === undefined) return recusar('Nenhuma dessas combina com a mesa: a primeira precisa ser da <b>mesma cor</b> ou do <b>mesmo número</b> da carta de cima.');
      sel.splice(sel.indexOf(g), 1);
      sel.unshift(g);
    }
    if (!R.grupoValido(v.mao, sel, v.topo, v.cor, jogo.op, null)) return recusar('Juntas, só cartas de número iguais.');
    resolver({ tipo: 'carta', carta: sel[0], cartas: sel, ultima: !!jogo.ultimaArmada });
  }
  function acaoComprar() { if (jogo && jogo.pendente) resolver({ tipo: 'comprar' }); }
  function acaoComprarOutra() {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.vista.fase !== 'depoisDeComprar') return;
    if (pend.vista.jogaveis.length) return recusar('A carta que você comprou serve: na regra de comprar até poder jogar, você para nela — jogue ou passe.');
    resolver({ tipo: 'comprar' });
  }
  function acaoPassar() {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.vista.fase !== 'depoisDeComprar') return;
    const v = pend.vista;
    if (jogo.op.comprarAtePoder && !v.jogaveis.length && v.compra + v.descarte.length > 1) return recusar('Na regra de comprar até poder jogar, você só para quando sair uma carta que sirva: compre outra.');
    resolver({ tipo: 'passar' });
  }
  function acaoDesafiar() { if (jogo && jogo.pendente && jogo.pendente.vista.podeDesafiar) resolver({ tipo: 'desafiar' }); }

  /** Escolha da cor do coringa (id null: a primeira carta da pilha foi coringa). */
  function mostrarCores(id, pronto) {
    const g = jogo.ui;
    g.cores.innerHTML = '';
    const c = jogo.conselho;
    const sug = c && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista) && c.melhor && c.melhor.tipo === 'carta' && id !== null && C[c.melhor.carta].sig === C[id].sig ? c.melhor.cor : null;
    g.cores.appendChild(el('div', { class: 'un-cores-tit', text: id === null ? 'A primeira carta é coringa: escolha a cor' : 'Escolha a cor' }));
    const grade = el('div', { class: 'un-cores-grade' });
    [0, 1, 2, 3].forEach(cor => grade.appendChild(el('button', { class: 'un-cor ' + R.CORES[cor] + (sug === cor ? ' sugerida' : ''), text: R.NOMES_COR[cor], onclick: () => { esconderCores(); pronto(cor); } })));
    g.cores.appendChild(grade);
    if (id !== null) g.cores.appendChild(el('button', { class: 'btn un-cores-cancelar', text: 'Cancelar', onclick: () => esconderCores() }));
    g.cores.classList.remove('oculto');
  }
  function esconderCores() { if (jogo && jogo.ui) jogo.ui.cores.classList.add('oculto'); }

  /** Herói automático (testes): segue o coach. */
  function autoJogar(pend) {
    if (!jogo || jogo.pendente !== pend || !jogo.conselho) return;
    const m = jogo.conselho.melhor;
    const usa = m.cartas && m.cartas.length > 1 ? m.cartas.length : 1;
    const ultima = (pend.vista.fase === 'depoisDeComprar' ? pend.vista.mao.length : pend.vista.mao.length - usa) === 1;
    if (m.tipo === 'carta' && usa > 1) resolver({ tipo: 'carta', carta: m.carta, cartas: m.cartas.slice(), ultima });
    else if (m.tipo === 'carta') resolver({ tipo: 'carta', carta: m.carta, cor: m.cor, ultima });
    else resolver({ tipo: m.tipo === 'passar' ? 'passar' : m.tipo === 'desafiar' ? 'desafiar' : 'comprar' });
  }

  // ============================================================== agentes
  function agenteHumano() {
    function pedir(vista) {
      return new Promise(resolve => {
        jogo.pendente = { vista, resolve };
        jogo.conselho = null;
        jogo.selecao = [];
        if (vista.mao.length > 2) jogo.ultimaArmada = false;
        marcarVez(0);
        prepararBotoes(vista);
        renderMao();
        if (P.Som) P.Som.vez();
        calcularConselho(vista);
      });
    }
    return {
      bot: false,
      manual: true,          // cada carta comprada é um toque, e depois de comprar quem decide é você
      jogar: pedir,
      depoisDeComprar: pedir,
      antesDeComprar(v, info) { return pedirCompra(info); },
      escolherCor() {
        if (jogo.opcoes.autoHeroi) return IA.melhorCor(jogo.motor.vistaPara(0).mao, -1);
        return new Promise(resolve => mostrarCores(null, resolve));
      },
      pegar() { return null; }
    };
  }

  function agenteBot(j, perfil) {
    const memoria = jogo.memoriaVoce ? { 0: jogo.memoriaVoce } : null;
    const b = IA.criarBot(perfil, { nivel: jogo.nivel, memoria, amostras: jogo.opcoes.amostrasBots });
    const pensar = base => esperar(base * fv() * (0.7 + P.RNG.real() * 0.6));
    const token = jogo.token;
    const vivo = () => jogo && jogo.token === token;
    return {
      bot: true, perfil,
      async jogar(v) { await pensar(700); if (!vivo()) return { tipo: 'comprar' }; return b.jogar(v); },
      async depoisDeComprar(v) { await pensar(500); if (!vivo()) return { tipo: 'passar' }; return b.depoisDeComprar(v); },
      async escolherCor(v) { await pensar(500); return b.escolherCor(v); },
      pegar(v, alvo) { return b.pegar(v, alvo); },
      observar: b.observar
    };
  }

  /** Alguém ficou com uma carta sem dizer "Última!": a janela para pegar (ou, se foi você, para dizer a tempo). */
  function janelaUltima(j, outros, reacoes) {
    const g = jogo.ui, token = jogo.token;
    let primeiro = null;
    reacoes.forEach((ms, i) => { if (outros[i] !== 0 && ms !== null && ms !== undefined && (!primeiro || ms < primeiro.ms)) primeiro = { k: outros[i], ms }; });
    if (jogo.opcoes.autoHeroi) return Promise.resolve(j === 0 ? 0 : primeiro ? primeiro.k : null);
    return new Promise(resolve => {
      let feito = false;
      const fim = r => { if (feito) return; feito = true; acoesEspera(''); resolve(r); };
      const limite = (primeiro ? primeiro.ms : 2600) * Math.max(0.45, fv());
      if (j === 0) {
        g.btnA.disabled = false; g.btnA.className = 'btn-acao un-btn-ultima pulsa'; g.btnA.innerHTML = 'Última!<small>rápido!</small>';
        g.btnA.onclick = () => fim(0);
        g.status.innerHTML = '<b>Você não disse Última!</b> Aperte antes que percebam';
      } else {
        g.btnA.disabled = false; g.btnA.className = 'btn-acao un-btn-pegou pulsa'; g.btnA.innerHTML = 'Pegou!<small>' + esc(jogo.jogadores[j].nome) + ' esqueceu</small>';
        g.btnA.onclick = () => fim(0);
        g.status.innerHTML = `<b>${esc(jogo.jogadores[j].nome)} ficou com uma e não disse Última!</b> Aperte Pegou!`;
      }
      esperar(limite).then(() => { if (!jogo || jogo.token !== token) return fim(null); fim(primeiro ? primeiro.k : null); });
    });
  }

  // ============================================================== eventos
  async function aoEvento(ev) {
    if (!jogo) return;
    const token = jogo.token;
    jogo.agentes.forEach(a => { if (a.observar) a.observar(ev); });
    jogo.leitor.observar(ev);
    if (ev.tipo === 'fimMao' && !jogo.opcoes.semSalvar && !jogo.opcoes.autoHeroi) {
      try { D.salvarLeituraVoce(IA.juntarLeituras(jogo.memoriaVoce, jogo.leitor.exportar(0), 60)); } catch (e) { /* nunca derruba a mesa */ }
    }
    const g = jogo.ui;
    const nome = j => (j === 0 ? 'Você' : jogo.jogadores[j].nome);
    const vista = () => jogo.motor.vistaPara(0);
    switch (ev.tipo) {
      case 'inicioPartida': break;
      case 'inicioMao': {
        jogo.fimMao = false;
        jogo.ultimaArmada = false;
        g.hudMao.textContent = 'Mão ' + ev.maoNumero;
        g.pilha.innerHTML = '';
        if (g.avisoEl) { g.avisoEl.remove(); g.avisoEl = null; }
        marcarVez(-1);
        acoesEspera(`Mão ${ev.maoNumero} · quem dá: <b>${esc(nome(ev.dador))}</b>`);
        // distribuição
        g.lugares.forEach(l => { l.costas.innerHTML = ''; l.qtd.textContent = '0'; });
        g.mao.innerHTML = '';
        const v = vista();
        for (let k = 1; k <= 7; k++) {
          g.lugares.forEach((l, j) => { if (j) { l.qtd.textContent = k; if (l.costas.children.length < 4) l.costas.appendChild(cartaEl(null)); } });
          if (P.Som && k % 2) P.Som.carta();
          await esperar(70 * fv());
          if (!jogo || jogo.token !== token) return;
        }
        atualizarLugares(v);
        renderMao();
        renderCentro(v, { de: undefined });
        await esperar(350 * fv());
        break;
      }
      case 'vez':
        marcarVez(ev.j);
        if (ev.j !== 0) g.status.innerHTML = `Vez de <b>${esc(nome(ev.j))}</b>…`;
        break;
      case 'jogada': {
        const v = vista();
        renderCentro(v, { de: ev.j });
        atualizarLugares(v);
        if (ev.j === 0) renderMao();
        if (P.Som) P.Som.carta();
        const final = !ev.de || ev.parte === ev.de;
        if (ev.ultima) { balao(ev.j, 'Última!', 'forte', 1600); splash('ÚLTIMA!', ev.j === 0 ? 'nos' : ''); if (P.Som) P.Som.alerta(); }
        else if (C[ev.carta].coringa) balao(ev.j, R.NOMES_COR[ev.cor] + '!', 'cor-' + R.CORES[ev.cor], 1400);
        else if (ev.de > 1 && final) balao(ev.j, ev.de + ' de uma vez!', 'forte', 1400);
        await esperar((final ? 380 : 220) * fv());
        break;
      }
      case 'efeito': {
        if (ev.efeito === 'pular') { balao(ev.alvo, 'Perdeu a vez', 'correu'); splash('PULOU!', ''); }
        else if (ev.efeito === 'inverter') { splash('INVERTEU!', ''); g.sentido.classList.toggle('anti', ev.sentido < 0); g.sentido.classList.remove('gira'); void g.sentido.offsetWidth; g.sentido.classList.add('gira'); }
        else if (ev.efeito === 'mais2' || ev.efeito === 'mais4') { splash('+' + ev.qtd + '!', ev.efeito === 'mais4' ? 'quatro' : ''); if (P.Som) P.Som.alerta(); }
        else if (ev.efeito === 'corInicial') { renderCentro(vista()); balao(ev.j, R.NOMES_COR[ev.cor] + '!', 'cor-' + R.CORES[ev.cor]); }
        await esperar(450 * fv());
        break;
      }
      case 'compra': {
        const v = vista();
        atualizarLugares(v);
        if (ev.j === 0) { jogo.novas = ev.cartas.slice(); renderMao(); }
        if (ev.parte) balao(ev.j, ev.total > 1 ? `${ev.parte}/${ev.total}` : 'Comprou', ev.motivo !== 'vez' ? 'correu' : '', 900);
        else if (ev.motivo !== 'vez') balao(ev.j, '+' + ev.qtd, 'correu', 1300);
        else balao(ev.j, ev.qtd === 1 ? 'Comprou' : 'Comprou ' + ev.qtd, '', 1000);
        g.lugares[ev.j].raiz.classList.remove('comprou'); void g.lugares[ev.j].raiz.offsetWidth; g.lugares[ev.j].raiz.classList.add('comprou');
        if (P.Som) P.Som.carta();
        await esperar((ev.parte ? 160 : ev.motivo === 'vez' ? 300 : 500) * fv());
        break;
      }
      case 'passou':
        balao(ev.j, 'Passo', '', 900);
        await esperar(250 * fv());
        break;
      case 'desafio': {
        splash('DESAFIO!', 'quatro');
        await esperar(700 * fv());
        if (!jogo || jogo.token !== token) return;
        aviso(ev.culpado ? `<b>Era blefe!</b> ${esc(nome(ev.contra))} tinha ${R.NOMES_COR[ev.corAntes].toLowerCase()} e compra 4.` : `<b>Não era blefe:</b> ${esc(nome(ev.contra))} não tinha ${R.NOMES_COR[ev.corAntes].toLowerCase()}. ${ev.j === 0 ? 'Você compra' : esc(nome(ev.j)) + ' compra'} 6.`, 2200);
        await esperar(900 * fv());
        break;
      }
      case 'ultima':
        atualizarLugares(vista());
        if (ev.atrasada) { balao(ev.j, 'Última!', 'forte', 1400); if (P.Som) P.Som.alerta(); }
        break;
      case 'pegou':
        balao(ev.por, 'Pegou!', 'forte', 1500);
        aviso(`<b>${esc(nome(ev.j))} não disse Última!</b> ${ev.por === 0 ? 'Você pegou' : esc(nome(ev.por)) + ' pegou'}: ${ev.j === 0 ? 'você compra' : 'compra'} 2.`, 1800);
        if (P.Som) P.Som.erro();
        await esperar(600 * fv());
        break;
      case 'reembaralhou':
        aviso('A compra acabou: a pilha foi embaralhada de novo.', 1500);
        break;
      case 'fimMao':
        jogo.fimMao = true;
        await fimDeMao(ev, token);
        break;
      default: break;
    }
  }

  async function fimDeMao(ev, token) {
    const g = jogo.ui;
    marcarVez(-1);
    acoesEspera('');
    const venceu = ev.vencedor === 0;
    if (!jogo.opcoes.semSalvar) D.alterarEstat(e => { e.maos++; if (venceu) e.maosGanhas++; });
    if (venceu && P.Som) P.Som.ficha();
    splash(venceu ? 'VOCÊ SAIU!' : 'SAIU!', venceu ? 'nos' : '');
    await esperar(800 * fv());
    if (!jogo || jogo.token !== token) return;
    const fimPartida = !jogo.op.ate || ev.placar[ev.vencedor] >= jogo.op.ate;
    const caixa = el('div', { class: 'tr-fim un-fim' },
      el('h3', { class: venceu ? 'nos' : 'eles', text: (venceu ? 'Você ganhou a mão' : `${jogo.jogadores[ev.vencedor].nome} ganhou a mão`) + (jogo.op.ate ? `: +${ev.pontos}` : '') }),
      el('div', { class: 'motivo', text: jogo.op.ate ? 'Pontos das cartas que sobraram com os outros (número = valor; ação = 20; coringa = 50).' : '' }));
    const maos = el('div', { class: 'maos' });
    ev.maos.forEach((m, j) => {
      const cs = el('div', { class: 'cs' });
      m.slice(0, 12).forEach(id => cs.appendChild(cartaEl(id)));
      if (m.length > 12) cs.appendChild(el('span', { class: 'mais', text: '+' + (m.length - 12) }));
      maos.appendChild(el('div', { class: 'mao-linha ' + (j === ev.vencedor ? 'nos' : '') },
        el('span', { class: 'quem', html: esc(j === 0 ? 'Você' : jogo.jogadores[j].nome) + (jogo.op.ate ? ` <small>${ev.placar[j]} pts</small>` : '') }),
        m.length ? cs : el('b', { class: 'saiu', text: 'saiu!' })));
    });
    caixa.appendChild(maos);
    const barra = el('i');
    const botao = el('button', { class: 'btn btn-ouro', text: fimPartida ? 'Ver o resultado' : 'Próxima mão' });
    caixa.appendChild(el('div', { class: 'proxima' }, el('div', { class: 'progresso' }, barra), botao));
    g.palco.appendChild(caixa);
    const total = (jogo.opcoes.autoHeroi ? 400 : 7000) * Math.max(0.5, fv());
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
  }

  // ============================================================ partida
  /** Começa (ou retoma) uma partida. opcoes: { n, retomar, coach, autoHeroi, velocidade, amostras, semSalvar }. */
  async function iniciar(opcoes) {
    encerrar();
    const cfgU = D.config();
    const salva = opcoes.retomar || null;
    const n = salva ? salva.cfg.n : Math.max(2, Math.min(6, opcoes.n || cfgU.jogadores));
    // sem o desafio do +4 (ele só sai sem a cor da mesa) e +2/+4 sempre passam adiante — vale também para partidas salvas antes
    const op = R.opcoes(Object.assign(salva ? salva.cfg.opcoes : { ate: cfgU.ate, comprarAtePoder: cfgU.comprarAtePoder, juntas: cfgU.juntas }, { desafio: false, acumular: true }));
    const nivel = salva ? salva.cfg.nivel || 'mestre' : opcoes.nivel || cfgU.nivel;
    let jogadores;
    if (salva) jogadores = salva.cfg.jogadores;
    else {
      const nomes = P.Baralho.embaralhar(IA.NOMES.slice());
      jogadores = [{ nome: P.Config.get('nome') || 'Você', avatar: null }];
      for (let j = 1; j < n; j++) jogadores.push({ nome: nomes[j], perfil: P.RNG.escolher(IA.LISTA_PERFIS), avatar: P.Bots.sortearAvatar() });
    }
    jogo = {
      n, jogadores, op, nivel, token: ++contador, notas: salva ? (salva.notas || []) : [],
      opcoes: Object.assign({ coach: cfgU.coach, amostras: 160 }, opcoes),
      pendente: null, conselho: null, leitor: IA.criarLeitor(), memoriaVoce: D.leituraVoce()
    };
    jogo.agentes = [agenteHumano()];
    for (let j = 1; j < n; j++) jogo.agentes.push(agenteBot(j, jogadores[j].perfil));
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    const estado = salva ? salva.estado : { placar: new Array(n).fill(0), dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 };
    const token = jogo.token;
    const semSalvar = !!opcoes.semSalvar;
    jogo.motor = U.Motor.criar({ n, opcoes: op, placar: estado.placar, dador: estado.dador, maoNumero: estado.maoNumero }, jogo.agentes, {
      evento: ev => aoEvento(ev),
      janelaUltima,
      salvar: est => {
        if (semSalvar || !jogo || jogo.token !== token) return;
        D.salvar({ cfg: { n, jogadores, opcoes: op, nivel }, estado: { placar: est.placar, dador: est.dador, maoNumero: Math.max(0, est.maoNumero - 1) }, notas: jogo.notas, emJogo: true });
      }
    });
    if (salva) P.UI.aviso(`<b>Partida retomada.</b> A mão que estava em andamento foi anulada.`, 'aviso-ouro');
    let r = null;
    try { r = await jogo.motor.rodar(); }
    catch (e) {
      console.error(e);
      (window.__errosGlobais = window.__errosGlobais || []).push('Última: ' + (e.stack || e.message));
      document.documentElement.setAttribute('data-erros', String(window.__errosGlobais.length));
      document.documentElement.setAttribute('data-ultimo-erro', String(e.stack || e.message).slice(0, 400));
      P.UI.aviso('Erro no Última!: ' + esc(e.message), 'erro');
    }
    if (!jogo || jogo.token !== token || !r) return;
    await fimDePartida(r);
  }

  async function fimDePartida(r) {
    const venceu = r.vencedor === 0;
    if (!jogo.opcoes.semSalvar) { D.descartar(); D.alterarEstat(e => { e.partidas++; if (venceu) e.vitorias++; }); }
    document.documentElement.setAttribute('data-uno-fim', venceu ? 'vitoria' : 'derrota');
    if (venceu && P.Som) P.Som.vitoria();
    const cont = { otima: 0, boa: 0, imprecisa: 0, erro: 0 };
    jogo.notas.forEach(x => { cont[x.nota] = (cont[x.nota] || 0) + 1; });
    const corpo = el('div', { class: 'tr-resultado' },
      el('div', { class: 'grande ' + (venceu ? 'nos' : 'eles'), text: venceu ? 'Você venceu!' : `${jogo.jogadores[r.vencedor].nome} venceu` }),
      el('div', { style: { textAlign: 'center', color: 'var(--texto-2)', fontSize: '13px' }, text: `${r.maos} ${r.maos === 1 ? 'mão' : 'mãos'} · ${jogo.notas.length} jogadas avaliadas pelo coach` }));
    if (jogo.op.ate) {
      const tab = el('div', { class: 'un-placar-fim' });
      r.placar.map((p, j) => [p, j]).sort((a, b) => b[0] - a[0]).forEach(([p, j]) => tab.appendChild(el('div', { class: j === 0 ? 'eu' : '' }, el('span', { text: j === 0 ? 'Você' : jogo.jogadores[j].nome }), el('b', { text: p + ' pts' }))));
      corpo.appendChild(tab);
    }
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
    try {
      escolha = await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, botoes: [{ texto: 'Voltar', valor: 'sair' }, { texto: 'Jogar de novo', valor: 'denovo', classe: 'btn-ouro' }] });
    } finally { pausar(false); }
    const n = jogo.n, auto = jogo.opcoes.autoHeroi;
    encerrar();
    if (auto) return;
    if (escolha === 'denovo') iniciar({ n });
    else P.App.irPara('uno');
  }

  function encerrar() {
    if (!jogo) return;
    const j = jogo;
    jogo = null;
    j.token = -1;
    if (j.motor) j.motor.parar();
    if (j.observador) j.observador.disconnect();
    if (j.pendente) j.pendente.resolve({ tipo: 'comprar' });
    if (j.compraPendente) j.compraPendente.resolve();
    const s = D.salva();
    if (s && s.emJogo) { s.emJogo = false; D.salvar(s); }
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    const raiz = $('#tela-uno');
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
  }

  async function sair() {
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Última!, do começo da mão atual.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('uno');
  }

  async function abrirRegras() {
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UIUno.regrasNo() }); } finally { pausar(false); }
  }

  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar'], ['placar', 'Placar']].concat(modos.filter(m => m[0] !== jogo.opcoes.coach))
      .concat([['som', P.Config.get('som') ? 'Desligar o som' : 'Ligar o som'], ['sair', 'Sair da partida']]);
    pausar(true);
    let escolha;
    try {
      escolha = await P.UI.modal({
        titulo: 'Menu', conteudo: el('div', { class: 'menu-mesa' }),
        aoAbrir: (corpo, fechar) => itens.forEach(([id, txt]) => corpo.firstChild.appendChild(
          el('button', { class: 'btn' + (id === 'sair' ? ' btn-sair' : ''), text: txt, onclick: () => fechar(id) })))
      });
    } finally { pausar(false); }
    if (!escolha || !jogo) return;
    if (escolha === 'sair') return sair();
    if (escolha === 'som') return P.Config.set('som', !P.Config.get('som'));
    if (escolha === 'regras') return abrirRegras();
    if (escolha === 'placar') {
      const v = jogo.motor.vistaPara(0);
      const tab = el('div', { class: 'un-placar-fim' });
      v.placar.map((p, j) => [p, j]).sort((a, b) => b[0] - a[0]).forEach(([p, j]) => tab.appendChild(el('div', { class: j === 0 ? 'eu' : '' }, el('span', { text: j === 0 ? 'Você' : jogo.jogadores[j].nome }), el('b', { text: p + ' pts' }))));
      pausar(true);
      try { await P.UI.modal({ titulo: jogo.op.ate ? `Placar (até ${jogo.op.ate})` : 'Placar', conteudo: tab }); } finally { pausar(false); }
      return;
    }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) mudarModoCoach(modo[0]);
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-uno').dataset.tema = v; } });

  P.UIUnoMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, _jogo: () => jogo, cartaEl };
})(window.Poker = window.Poker || {});
