/* ==========================================================================
   OUTS · Treino Lab — ui-mesa.js
   A mesa jogável: desenha mesa oval, assentos, cartas e fichas, anima os
   eventos do motor (distribuição carta a carta, fichas indo ao pote, board
   virando, pote entregue ao vencedor), barra de ações com slider/atalhos
   de tamanho e teclado (F, C, R, Enter), HUD de torneio e o painel do coach.
   Também desenha a mesa com amigos (cfg.remota, partida-remota.js): sem coach,
   com o relógio de quem está na vez e "Sair" valendo desistência.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const F = P.Formato;
  const HEROI = 0;
  // multiplicador dos tempos de animação (o mesmo de partida.js para os bots)
  const VELOCIDADES = { lenta: 2, normal: 1.4, rapida: 1, turbo: 0.22 };

  let tela, palco, oval, boardEl, poteEl, voadores, faixa, msgs, hud, barraInfo, dealer;
  let assentos = [];
  let geo = null;
  let partida = null, cfg = null, lugares = 0;
  let est = null;
  let vistaAtual = null;
  let pendente = null;
  let pausas = 0;
  let intervaloHud = null;
  let observador = null;
  let ctxFmt = { modo: 'cash', bb: 1 };
  const barra = {};

  // mesa com amigos: aba escondida ou mensagens acumuladas → eventos aplicados sem animação
  let pressa = false;
  const fv = () => (pressa ? 0 : VELOCIDADES[P.Config.get('velocidade')] || 1);
  const fmt = v => F.valor(v, ctxFmt);
  const fmtReal = v => (ctxFmt.modo === 'cash' ? F.dinheiro(v) : F.fichas(v));

  /** Espera "ms" de tempo não pausado (modais abertos pausam a mesa). */
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
  function pausar(p) { pausas = Math.max(0, pausas + (p ? 1 : -1)); if (partida) partida.pausarRelogio(pausas > 0 || document.hidden); }

  // ================================================================ montagem
  function montar(config) {
    cfg = config;
    lugares = cfg.lugares;
    ctxFmt = { modo: cfg.modo, bb: cfg.modo === 'cash' ? cfg.limite.bb : 1 };
    tela = $('#tela-mesa');
    tela.innerHTML = '';
    tela.dataset.tema = P.Config.get('tema');
    tela.classList.toggle('sem-coach', !!cfg.remota);   // contra os amigos o coach fica desligado

    const coluna = el('div', { class: 'mesa-coluna' });
    barraInfo = el('div', { class: 'mesa-barra' },
      el('span', { class: 'rotulo', id: 'mb-rotulo' }),
      el('span', { class: 'detalhe', id: 'mb-detalhe' }),
      el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Histórico', title: 'Mãos jogadas e replay', onclick: () => overlay('historico') }),
      el('button', { class: 'btn so-largo', text: 'Estatísticas', onclick: () => overlay('estatisticas') }),
      el('button', { class: 'btn so-largo', text: 'Opções', onclick: () => overlay('config') }),
      el('button', { class: 'btn so-largo oculto', id: 'mb-mesas', text: 'Mesas', title: 'Assistir às outras mesas do torneio', onclick: () => alternarMesas() }),
      el('button', { class: 'btn', id: 'mb-coach', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => P.UICoach.alternar() }),
      el('button', { class: 'btn so-largo', text: cfg.remota ? 'Sair da mesa' : 'Sair para o lobby', onclick: sair }),
      el('button', { class: 'btn so-celular', id: 'mb-menu', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }));

    // celular: a barra de cima fica escondida (não cobre as cartas do showdown); este botão no canto a mostra
    barraInfo.addEventListener('click', e => { if (e.target.closest('button, .hud-torneio.clicavel')) alternarBarra(false); });
    palco = el('div', { class: 'mesa-palco' },
      el('button', { class: 'btn-barra so-celular', title: 'Mostrar blinds, jogadores, coach e menu', html: '&#9776;', onclick: () => alternarBarra() }));
    oval = el('div', { class: 'mesa-oval' },
      el('div', { class: 'borda' }),
      el('div', { class: 'feltro' }, el('div', { class: 'mesa-logo', html: '<b>OUTS</b><span>Treino Lab</span>' })));
    poteEl = el('div', { class: 'pote' });
    boardEl = el('div', { class: 'board' });
    for (let i = 0; i < 5; i++) boardEl.appendChild(el('div', { class: 'slot' }));
    oval.appendChild(el('div', { class: 'mesa-centro' }, poteEl, boardEl));
    palco.appendChild(oval);

    assentos = [];
    for (let s = 0; s < lugares; s++) {
      const a = criarAssento(s);
      assentos.push(a);
      palco.appendChild(a.raiz);
      palco.appendChild(a.aposta);
    }
    dealer = el('div', { class: 'botao-dealer', text: 'D' });
    palco.appendChild(dealer);
    voadores = el('div', { class: 'voadores' });
    faixa = el('div', { class: 'faixa-vencedor' });
    msgs = el('div', { class: 'mesa-msgs' });
    palco.append(voadores, faixa, msgs);
    // torneio: a faixa do torneio fica na barra de cima (no PC centralizada; no celular, versão curta)
    if (cfg.modo !== 'cash') { hud = el('div', { class: 'hud-torneio' }); barraInfo.insertBefore(hud, barraInfo.querySelector('.espaco')); barraInfo.classList.add('com-hud'); } else hud = null;

    coluna.append(barraInfo, palco, montarBarraAcoes());
    tela.appendChild(coluna);
    P.UICoach.montar(tela, { aoMudarModo: modo => { if (pendente && pendente.analise && vistaAtual && modo !== 'desligado') P.UICoach.pedirDica(pendente.analise); if (modo === 'desligado') limparSugestao(); } });

    if (observador) observador.disconnect();
    observador = new ResizeObserver(() => layout());
    observador.observe(palco);
    layout();
  }

  function criarAssento(s) {
    const a = {
      raiz: el('div', { class: 'assento vazio' + (s === HEROI ? ' heroi' : ''), 'data-s': s }),
      cartas: el('div', { class: 'cartas' }),
      corpo: el('div', { class: 'corpo' }),
      avatar: el('div', { class: 'avatar' }),
      nome: el('div', { class: 'nome' }),
      stack: el('div', { class: 'stack' }),
      tempo: el('div', { class: 'tempo' }, el('i')),
      marca: el('span', { class: 'marca-blind oculto' }),
      allin: el('span', { class: 'allin oculto', text: 'ALL-IN' }),
      tag: el('span'),
      balao: el('div', { class: 'balao' }),
      desc: el('div', { class: 'desc-mao oculto' }),
      aposta: el('div', { class: 'aposta oculto' }),
      timerBalao: null
    };
    a.corpo.append(a.avatar, el('div', { class: 'info' }, a.nome, el('div', { class: 'linha2' }, a.stack, a.tag)), a.tempo, a.marca, a.allin);
    a.raiz.append(a.cartas, a.corpo, a.balao, a.desc);
    return a;
  }

  // ================================================================ geometria
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

  // Celular em pé: ângulos dos lugares em volta da mesa vertical (90° = você, embaixo;
  // depois sentido horário: esquerda, topo, direita). Evitam a faixa do board.
  const ANGULOS_VERTICAL = {
    2: [90, 270], 3: [90, 215, 325], 4: [90, 165, 270, 15], 5: [90, 160, 230, 310, 20],
    6: [90, 152, 210, 270, 330, 28], 7: [90, 148, 195, 245, 295, 345, 32],
    8: [90, 145, 188, 232, 270, 308, 352, 35], 9: [90, 140, 180, 214, 248, 292, 326, 0, 40]
  };

  function layout() {
    if (!palco) return;
    const W = palco.clientWidth, H = palco.clientHeight;
    if (!W || !H) return;
    // alturas das barras: o painel do coach no celular abre entre elas (a de cima, escondida, não conta)
    const barraPorCima = getComputedStyle(barraInfo).position === 'absolute';
    tela.style.setProperty('--mesa-barra-h', (barraPorCima ? 0 : barraInfo.offsetHeight) + 'px');
    tela.style.setProperty('--acoes-h', barra.raiz.offsetHeight + 'px');
    tela.style.setProperty('--acoes-l', barra.raiz.offsetWidth + 'px');
    const compacto = W < 640 || H < 400;
    palco.classList.toggle('compacto', compacto);
    if (hud) {   // torneio: na tela pequena a faixa da barra de cima mostra só o essencial
      const mudou = hud.classList.contains('curto') !== compacto;
      hud.classList.toggle('curto', compacto);
      barraInfo.classList.toggle('hud-curto', compacto);
      if (mudou && partida && partida.ativo()) renderHud(partida.info());
      ajustarBarra(true);
    }
    if (compacto) layoutCompacto(W, H); else layoutNormal(W, H);
    if (est) {
      dealer.style.transition = 'none';          // ao redimensionar, sem animar
      posicionarDealer(est.botao);
      void dealer.offsetWidth;
      dealer.style.transition = '';
    }
  }

  /** Celular e janelas pequenas: assentos compactos (avatar em cima, nome e fichas embaixo). */
  function layoutCompacto(W, H) {
    const vertical = H > W * 1.05;
    const base = Math.min(W, H * 1.25);
    const assentoL = limitar(base * 0.21, 64, 86);
    const avatarL = limitar(assentoL * 0.5, 28, 42);
    // folga em cima: no showdown as cartas dos assentos de cima sobem um pouco acima do avatar
    // (o HUD do torneio fica na barra de cima)
    const topo = Math.ceil(avatarL * 0.32);
    const assentoH = avatarL + 29;                   // avatar + caixa de nome e fichas
    const heroiL = limitar(W * 0.42, 124, 168);
    const heroiH = limitar(avatarL + 10, 40, 52);
    const cartaHeroiL = vertical ? limitar(W * 0.135, 40, 62) : limitar((H - topo) * 0.15, 30, 50);
    const cx = W / 2;
    const yTopo = topo + 4 + assentoH / 2;
    const yHeroi = H - 4 - heroiH / 2;
    const cy = (yTopo + yHeroi) / 2, ry = (yHeroi - yTopo) / 2;
    const rx = vertical ? W / 2 - assentoL / 2 - 4 : Math.min(W / 2 - assentoL / 2 - 6, ry * 2.8);

    // mesa desenhada: o trilho passa pelos assentos
    const ow = 2 * rx * (vertical ? 1 : 0.94), oh = 2 * ry * (vertical ? 0.96 : 0.9);
    const ovalTopo = cy - oh / 2;
    Object.assign(oval.style, { left: (cx - ow / 2) + 'px', top: ovalTopo + 'px', width: ow + 'px', height: oh + 'px', borderRadius: vertical ? (ow / 2) + 'px' : '' });

    const angulos = vertical ? ANGULOS_VERTICAL[lugares] : lugares === 9 ? [90, 128, 166, 212, 254, 286, 328, 14, 52] : null;
    const pos = [];
    for (let s = 0; s < lugares; s++) {
      const t = (angulos ? angulos[s] : 90 + s * 360 / lugares) * Math.PI / 180;
      let x = cx + rx * Math.cos(t), y = cy + ry * Math.sin(t);
      if (s === HEROI) { x = cx; y = yHeroi; } else {
        x = limitar(x, assentoL / 2 + 3, W - assentoL / 2 - 3);
        y = limitar(y, topo + assentoH / 2 + 2, H - assentoH / 2 - 2);
        // não encostar na sua caixa: em pé sobe um pouco, deitado vai para o lado
        const folgaX = (heroiL + assentoL) / 2 + 3;
        if (Math.abs(x - cx) < folgaX && y + assentoH / 2 > yHeroi - heroiH / 2) {
          if (vertical) y = yHeroi - heroiH / 2 - assentoH / 2 - 2;
          else x = cx + Math.sign(x - cx || -1) * folgaX;
        }
      }
      pos.push({ x, y });
    }
    // telas baixas: afasta na vertical os assentos que ainda se encostam
    const yMin = topo + assentoH / 2 + 2, yMax = yHeroi - heroiH / 2 - assentoH / 2 - 2;
    for (let volta = 0; volta < 4; volta++) {
      for (let i = 1; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j];
          if (Math.abs(a.x - b.x) >= assentoL + 4) continue;
          const falta = assentoH + 4 - Math.abs(a.y - b.y);
          if (falta <= 0) continue;
          const [cima, baixo] = a.y <= b.y ? [a, b] : [b, a];
          const sobe = Math.min(falta / 2, cima.y - yMin);
          cima.y -= Math.max(0, sobe);
          baixo.y = Math.min(Math.max(yMax, baixo.y), baixo.y + falta - Math.max(0, sobe));
        }
      }
    }

    // board: largura entre os assentos laterais; altura na faixa livre do meio
    const larguraMax = vertical ? W - 2 * (assentoL + 8) : ow * 0.6;
    let cartaL = larguraMax / 5.4;
    const bw = () => cartaL * 5.4;
    const cartasHeroiTopo = yHeroi - heroiH / 2 - cartaHeroiL * 1.4 + 8;
    // faixa livre: abaixo dos assentos de cima e acima dos de baixo que ficam na frente do board
    let livreTopo = topo + 4, livreBase = cartasHeroiTopo - 6;
    pos.forEach((p, s) => {
      if (s === HEROI || Math.abs(p.x - cx) >= bw() / 2 + assentoL / 2) return;
      if (p.y < cy) livreTopo = Math.max(livreTopo, p.y + assentoH / 2);
      else livreBase = Math.min(livreBase, p.y - assentoH / 2);
    });
    const faixa = livreBase - livreTopo;
    cartaL = limitar(Math.min(cartaL, (faixa - 32) / 1.56, 54), 22, 54);
    const centroH = 26 + cartaL * 0.16 + cartaL * 1.4;
    const centroY = livreTopo + Math.max(centroH / 2, faixa / 2);
    const centro = oval.querySelector('.mesa-centro');
    centro.style.top = (centroY - ovalTopo) + 'px';
    const ret = { l: cx - bw() / 2 - 4, r: cx + bw() / 2 + 4, t: centroY - centroH / 2, b: centroY + centroH / 2 };

    pos.forEach((p, s) => {
      const dxv = cx - p.x, dyv = centroY - p.y, len = Math.hypot(dxv, dyv) || 1;
      if (s === HEROI) {
        p.bx = cx; p.by = cartasHeroiTopo - 14;
        if (p.by - 10 < ret.b) { p.bx = cx - heroiL / 2 - 26; p.by = yHeroi - heroiH / 2 - 4; }
        p.dx = cx + heroiL / 2 + 15; p.dy = yHeroi - 4;
        return;
      }
      // aposta logo à frente do assento, na direção do centro
      const passo = Math.min(len * 0.55, Math.abs(dxv) > Math.abs(dyv) ? assentoL / 2 + 22 : assentoH / 2 + 22);
      p.bx = p.x + dxv / len * passo; p.by = p.y + dyv / len * passo;
      if (p.bx > ret.l - 34 && p.bx < ret.r + 34 && p.by > ret.t - 10 && p.by < ret.b + 10) {   // ficha + valor ≈ 60 px
        p.by = p.by < centroY ? ret.t - 12 : ret.b + 12;
      }
      // botão do dealer: à esquerda do avatar (as cartas ficam à direita)
      p.dx = p.x - avatarL / 2 - 9;
      p.dy = p.y - assentoH / 2 + avatarL * 0.62;
    });
    pos.forEach((p, s) => {
      assentos[s].raiz.style.left = p.x + 'px';
      assentos[s].raiz.style.top = p.y + 'px';
      assentos[s].aposta.style.left = p.bx + 'px';
      assentos[s].aposta.style.top = p.by + 'px';
    });
    palco.style.setProperty('--carta-l', cartaL + 'px');
    palco.style.setProperty('--carta-heroi-l', cartaHeroiL + 'px');
    palco.style.setProperty('--carta-bot-l', limitar(avatarL * 0.55, 16, 24) + 'px');
    palco.style.setProperty('--assento-l', assentoL + 'px');
    palco.style.setProperty('--assento-heroi-l', heroiL + 'px');
    palco.style.setProperty('--avatar-l', avatarL + 'px');
    palco.style.setProperty('--borda-l', limitar(Math.min(ow, oh) * 0.035, 8, 14) + 'px');
    geo = { W, H, cx, cy: centroY, ow, oh, cartaL, pos, origem: { x: cx, y: centroY - cartaL } };
  }

  function layoutNormal(W, H) {
    oval.style.borderRadius = '';
    oval.querySelector('.mesa-centro').style.top = '';
    palco.style.removeProperty('--assento-heroi-l');
    let ow = Math.min(W * 0.74, (H - 200) * 2.15);
    ow = Math.max(300, ow);
    const oh = ow / 2.15;
    const cx = W / 2, cy = H / 2 - Math.min(16, H * 0.025);
    Object.assign(oval.style, { left: (cx - ow / 2) + 'px', top: (cy - oh / 2) + 'px', width: ow + 'px', height: oh + 'px' });
    const cartaL = Math.max(32, Math.min(74, ow * 0.066));
    const assentoL = Math.max(128, Math.min(176, ow * 0.2));
    palco.style.setProperty('--carta-l', cartaL + 'px');
    palco.style.setProperty('--carta-heroi-l', (cartaL * 1.12) + 'px');
    palco.style.setProperty('--carta-bot-l', (cartaL * 0.6) + 'px');
    palco.style.setProperty('--assento-l', assentoL + 'px');
    palco.style.setProperty('--avatar-l', Math.max(34, Math.min(50, ow * 0.055)) + 'px');
    palco.style.setProperty('--borda-l', Math.max(12, Math.min(22, ow * 0.024)) + 'px');
    const rx = ow / 2 + 8, ry = oh / 2 + 24;
    const pos = [];
    for (let s = 0; s < lugares; s++) {
      const t = (90 + s * 360 / lugares) * Math.PI / 180;
      const lado = Math.abs(Math.cos(t)) > 0.8 ? assentoL * 0.18 : 0;
      let x = cx + (rx + lado) * Math.cos(t), y = cy + ry * Math.sin(t);
      if (s === HEROI) y += 14;
      x = Math.max(assentoL / 2 + 6, Math.min(W - assentoL / 2 - 6, x));
      y = Math.max(52, Math.min(H - 34, y));
      const bx = cx + (x - cx) * 0.6, by = s === HEROI ? cy + oh * 0.27 : cy + (y - cy) * 0.55;
      const dxv = cx - x, dyv = cy - y, len = Math.hypot(dxv, dyv) || 1;
      let ddx = x + dxv / len * (assentoL * 0.5) + (-dyv / len) * 30, ddy = y + dyv / len * 52 + (dxv / len) * 18;
      if (s === HEROI) { ddx = x + assentoL * 0.5 + 20; ddy = y - 18; }   // ao lado, sem cobrir as suas cartas
      pos.push({ x, y, bx, by, dx: ddx, dy: ddy });
      assentos[s].raiz.style.left = x + 'px';
      assentos[s].raiz.style.top = y + 'px';
      assentos[s].aposta.style.left = bx + 'px';
      assentos[s].aposta.style.top = by + 'px';
    }
    geo = { W, H, cx, cy, ow, oh, cartaL, pos, origem: { x: cx, y: cy - oh * 0.3 } };
  }

  function posicionarDealer(s) {
    if (!geo || s === undefined || s === null || !geo.pos[s]) return;
    dealer.style.left = geo.pos[s].dx + 'px';
    dealer.style.top = geo.pos[s].dy + 'px';
  }

  function centroDe(elem) {
    const r = elem.getBoundingClientRect(), p = palco.getBoundingClientRect();
    return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
  }

  function voar(conteudo, de, para, dur, opts = {}) {
    const v = el('div', { class: 'voador' });
    v.appendChild(conteudo);
    v.style.transform = `translate(${de.x}px, ${de.y}px) translate(-50%, -50%)`;
    voadores.appendChild(v);
    void v.offsetWidth;
    v.style.transitionDuration = Math.max(1, dur) + 'ms';
    v.style.transform = `translate(${para.x}px, ${para.y}px) translate(-50%, -50%)` + (opts.girar ? ` rotate(${opts.girar}deg)` : '');
    if (opts.sumir) v.style.opacity = '0';
    return esperar(dur).then(() => { v.remove(); });
  }

  // ================================================================ desenho
  function jogadorMesa(s) { return partida ? partida.mesa().jogador(s) : null; }

  function renderAssento(s) {
    const a = assentos[s];
    const jm = jogadorMesa(s);
    const j = est && est.jogadores[s];
    if (!jm) {
      a.raiz.className = 'assento vazio' + (s === HEROI ? ' heroi' : '');
      a.avatar.innerHTML = '';
      a.nome.textContent = 'Lugar vazio';
      a.stack.textContent = '';
      return;
    }
    a.raiz.classList.remove('vazio');
    if (a.avatar.dataset.id !== String(jm.id)) {
      a.avatar.innerHTML = P.UI.avatarSVG(jm.avatar, jm.heroi);
      a.avatar.dataset.id = jm.id;
    }
    const perfil = jm.perfil && !jm.heroi ? P.Bots.PERFIS[jm.perfil] : null;
    a.nome.innerHTML = (jm.pais ? P.UI.bandeiraSVG(jm.pais) : '') + `<span style="overflow:hidden;text-overflow:ellipsis">${esc(jm.nome)}</span>`;
    a.tag.innerHTML = perfil ? `<span class="tag-perfil" style="--cor-perfil:${perfil.cor}" title="${esc(perfil.nome + ': ' + perfil.descricao)}">${perfil.sigla}</span>` : '';
    a.raiz.title = perfil ? `${jm.nome} (${jm.pais ? jm.pais.nome : ''}) — ${perfil.nome}: ${perfil.descricao}` : jm.nome;
    const fichas = j ? j.fichas : jm.fichas;
    a.stack.textContent = fichas > 0 || (j && j.allin) ? fmt(fichas) : (j ? fmt(0) : 'fora');
    if (j) {
      a.raiz.classList.toggle('foldou', !!j.foldou);
      a.allin.classList.toggle('oculto', !j.allin || j.foldou);
    }
  }

  /** Diâmetro das fichas na mesa, proporcional ao tamanho das cartas. */
  function tamFicha() { return Math.round(Math.max(18, Math.min(34, geo ? geo.cartaL * 0.42 : 22))); }

  function renderAposta(s) {
    const a = assentos[s], j = est.jogadores[s];
    a.aposta.innerHTML = '';
    if (!j || !(j.apostaRua > 0)) { a.aposta.classList.add('oculto'); return; }
    a.aposta.classList.remove('oculto');
    a.aposta.appendChild(P.UI.pilhaFichas(j.apostaRua, tamFicha()));
    a.aposta.appendChild(el('span', { class: 'valor', text: fmt(j.apostaRua) }));
  }

  function renderPote() {
    poteEl.innerHTML = '';
    if (!est) return;
    const apostas = Object.values(est.jogadores).reduce((s, j) => s + (j.apostaRua || 0), 0);
    const total = est.pote + apostas;
    if (total <= 0) return;
    const potes = est.potes && est.potes.length > 1 ? est.potes : null;
    const principal = potes ? potes[0].valor : est.pote;
    if (principal > 0) {
      poteEl.appendChild(el('div', { class: 'pote-principal' }, P.UI.pilhaFichas(principal, tamFicha()), el('small', { text: 'Pote' }), fmt(principal)));
    }
    if (potes) potes.slice(1).forEach((p, i) => poteEl.appendChild(el('span', { class: 'side-pot', text: `Side ${i + 1}: ${fmt(p.valor)}` })));
    if (apostas > 0) poteEl.appendChild(el('span', { class: 'pote-total', text: 'Total: ' + fmt(total) }));
  }

  function balao(s, texto, classe = '') {
    const a = assentos[s];
    a.balao.className = 'balao on ' + classe;
    a.balao.textContent = texto;
    clearTimeout(a.timerBalao);
    a.timerBalao = setTimeout(() => a.balao.classList.remove('on'), Math.max(1200, 2400 * fv()));
  }

  function limparBaloes() { assentos.forEach(a => a.balao.classList.remove('on')); }

  function limparMesa() {
    boardEl.innerHTML = '';
    for (let i = 0; i < 5; i++) boardEl.appendChild(el('div', { class: 'slot' }));
    assentos.forEach(a => {
      a.cartas.innerHTML = '';
      a.raiz.classList.remove('vencedor', 'mostrou', 'foldou', 'vez');
      a.desc.classList.add('oculto');
      a.allin.classList.add('oculto');
      a.marca.classList.add('oculto');
      a.aposta.classList.add('oculto');
      a.balao.classList.remove('on');
    });
    faixa.classList.remove('on');
    voadores.innerHTML = '';
  }

  function renderTudo() {
    for (let s = 0; s < lugares; s++) { renderAssento(s); if (est) renderAposta(s); }
    renderPote();
  }

  // ======================================================= ui da partida
  const ui = {
    aoIniciar(api) {
      renderTudo();
      // torneio com várias mesas: botão "Mesas" e HUD clicável para assistir às outras
      const t = api && api.torneio && api.torneio();
      const multi = !!(t && t.mesas() > 1);
      $('#mb-mesas').classList.toggle('oculto', !multi);
      if (hud) { hud.classList.toggle('clicavel', multi); hud.onclick = multi ? () => alternarMesas() : null; if (multi) hud.title = 'Ver as outras mesas e a classificação'; }
    },

    aoNovaMao(vista, info) {
      vistaAtual = vista;
      ctxFmt.bb = vista.blinds.bb;
      est = { numero: vista.numero, botao: vista.botao, board: [], pote: 0, potes: [], jogadores: {}, mostrados: {} };
      vista.jogadores.forEach(j => {
        est.jogadores[j.assento] = { nome: j.nome, fichas: j.fichasIniciais, apostaRua: 0, foldou: false, allin: false, cartas: j.cartas, posicao: j.posicao };
      });
      limparMesa();
      P.UICoach.novaMao();
      barra.nota.innerHTML = '';
      vista.jogadores.forEach(j => {
        if (j.sb || j.bb) { const m = assentos[j.assento].marca; m.textContent = j.sb && j.botao ? 'BTN·SB' : j.sb ? 'SB' : 'BB'; m.classList.remove('oculto'); }
      });
      posicionarDealer(vista.botao);
      renderTudo();
      ui.aoInfo(info);
      status(`Mão #${vista.numero}`);
    },

    async aoEventos(evs, vista) {
      vistaAtual = vista;
      for (const ev of evs) await animar(ev);
      sincronizar(vista);
    },

    async aoVezDoBot(s, ms) {
      const a = assentos[s];
      a.raiz.classList.add('vez');
      const barraT = a.tempo.firstChild;
      barraT.style.transition = 'none';
      barraT.style.transform = 'scaleX(1)';
      void barraT.offsetWidth;
      const total = Math.max(ms * 4, 8000);
      barraT.style.transition = `transform ${total}ms linear`;
      barraT.style.transform = 'scaleX(0)';
      status(`Vez de ${esc(est.jogadores[s] ? est.jogadores[s].nome : '')}…`);
      await esperar(ms);
      a.raiz.classList.remove('vez');
    },

    pedirAcao(vista, extra) {
      vistaAtual = vista;
      return new Promise(resolve => {
        const a = assentos[HEROI];
        a.raiz.classList.add('vez');
        const barraT = a.tempo.firstChild;
        barraT.style.transition = 'none'; barraT.style.transform = 'scaleX(1)';
        P.Som.vez();
        P.UIMesas.avisarVez(true);
        configurarBarra(vista, extra.analise);
        bloquear(true);
        pendente = {
          analise: extra.analise,
          resolve: acao => {
            pendente = null;
            P.UIMesas.avisarVez(false);
            a.raiz.classList.remove('vez');
            bloquear(true);
            limparSugestao();
            resolve(acao);
          }
        };
        const pronto = cfg.remota ? Promise.resolve() : P.UICoach.novaDecisao(extra.analise, extra.ctx);
        pronto.then(() => {
          if (!pendente) return;
          bloquear(false);
          if (P.Config.get('modoCoach') === 'sempre' && extra.analise) extra.analise.then(an => { if (pendente) sugerir(an); });
          status(textoStatusHeroi(vista));
        });
      });
    },

    /** Mesa com amigos: marca quem está na vez com o relógio do prazo (ms que faltam). */
    marcarVez(s, ms) {
      assentos.forEach((a, i) => { if (i !== s) a.raiz.classList.remove('vez'); });
      const a = assentos[s];
      if (!a) return;
      a.raiz.classList.add('vez');
      const barraT = a.tempo.firstChild;
      barraT.style.transition = 'none';
      barraT.style.transform = 'scaleX(1)';
      void barraT.offsetWidth;
      barraT.style.transition = `transform ${Math.max(0, ms)}ms linear`;
      barraT.style.transform = 'scaleX(0)';
      if (s !== HEROI && est.jogadores[s]) status(`Vez de ${esc(est.jogadores[s].nome)}…`);
    },

    /** Mesa com amigos: o tempo acabou e o servidor jogou por você; o pedido aberto cai. */
    cancelarPedido() { if (pendente) pendente.resolve(null); },

    /** Mesa com amigos: sem animações enquanto a aba está escondida ou há mensagens acumuladas. */
    acelerar(sim) { pressa = !!sim; },

    aoAnaliseParcial(an) { P.UICoach.atualizarParcial(an); },

    aoDecisaoAvaliada(nota, an) {
      barra.nota.innerHTML = '';
      if (P.Config.get('modoCoach') === 'desligado') { P.UICoach.registrarNota(nota, an); return; }   // só no relatório final
      barra.nota.appendChild(el('span', { class: 'feedback-nota nota-' + nota.nota, text: nota.nomeNota + (nota.perdaBB > 0.05 ? ` · −${F.num(nota.perdaBB, 1)} bb` : '') , title: nota.motivo }));
      P.UICoach.registrarNota(nota, an);
    },

    async aoFimDaMao(resumo) {
      const sd = !resumo.resultado.semShowdown;
      status(resumo.ganho > 0 ? `Você ganhou ${fmt(resumo.ganho)}` : resumo.ganho < 0 ? `Você perdeu ${fmt(-resumo.ganho)}` : 'Fim da mão');
      await esperar((sd ? 2600 : 1300) * fv());
    },

    aoInfo(info) {
      if (!info) return;
      renderBarraInfo(info);
      if (hud) renderHud(info);
    },

    aoMensagem(texto, tipo) {
      const m = el('div', { class: 'mesa-msg ' + (tipo || ''), text: texto });
      msgs.appendChild(m);
      while (msgs.children.length > 4) msgs.firstChild.remove();
      setTimeout(() => m.remove(), 6000);
      if (tipo === 'nivel') P.Som.alerta();
      for (let s = 0; s < lugares; s++) renderAssento(s);
    },

    perguntarRecompra(valor) {
      pausar(true);
      return P.UI.confirmar('Sem fichas', `Você ficou sem fichas. Recomprar por <b>${F.dinheiro(valor)}</b> da banca fictícia?`, 'Recomprar', 'Encerrar sessão')
        .then(r => { pausar(false); return r; });
    },

    async aoFimDaPartida(fim) {
      pararHud();
      // resultado + análise completa do coach (também com o coach desligado)
      const rel = partida.relatorio();
      const cfgAnterior = cfg;
      const r = await P.UIPaineis.abrirRelatorio(rel, [
        { texto: 'Voltar ao lobby', valor: 'lobby' }, { texto: 'Jogar de novo', classe: 'btn-ouro', valor: 'denovo' }]);
      encerrar(false);
      if (P.UIPaineis.tratarSaidaRelatorio(r)) return;
      if (r === 'denovo') P.App.iniciarPartida(cfgAnterior);
      else P.App.irPara('lobby');
    }
  };

  function sincronizar(vista) {
    if (!est) return;
    let apostas = 0;
    vista.jogadores.forEach(j => {
      const e = est.jogadores[j.assento];
      if (!e) return;
      e.fichas = j.fichas; e.apostaRua = j.apostaRua; e.foldou = j.foldou; e.allin = j.allin;
      apostas += j.apostaRua;
    });
    est.pote = vista.pote - apostas;
    est.potes = vista.potes;
    renderTudo();
  }

  // ======================================================= animação de eventos
  async function animar(ev) {
    if (!est) return;
    if (!geo) { aplicarSemAnimar(ev); return; }
    const meu = est;                         // se a mesa for encerrada no meio, para
    const f = fv();
    const s = ev.assento;
    const j = s !== undefined ? est.jogadores[s] : null;
    switch (ev.tipo) {
      case 'ante': {
        j.fichas -= ev.valor;
        est.pote += ev.valor;
        renderAssento(s);
        voar(P.UI.pilhaFichas(ev.valor, tamFicha()), geo.pos[s], centroDe(poteEl), 220 * f);
        renderPote();
        return esperar(40 * f);
      }
      case 'blind': {
        j.fichas -= ev.valor; j.apostaRua += ev.valor; j.allin = ev.allin;
        renderAssento(s);
        await voar(P.UI.pilhaFichas(ev.valor, tamFicha()), geo.pos[s], { x: geo.pos[s].bx, y: geo.pos[s].by }, 200 * f);
        if (est !== meu) return;
        renderAposta(s); renderPote();
        P.Som.ficha();
        return;
      }
      case 'distribuicao': return distribuir(ev.ordem);
      case 'acao': return animarAcao(ev, j);
      case 'devolucao': {
        j.fichas += ev.valor; j.apostaRua -= ev.valor; j.allin = false;
        renderAposta(s);
        await voar(P.UI.pilhaFichas(ev.valor, tamFicha()), { x: geo.pos[s].bx, y: geo.pos[s].by }, geo.pos[s], 260 * f);
        if (est !== meu) return;
        balao(s, 'Volta ' + fmt(ev.valor));
        renderAssento(s); renderPote();
        return;
      }
      case 'recolher': {
        const alvo = centroDe(poteEl);
        const voos = [];
        Object.keys(est.jogadores).forEach(k => {
          const jj = est.jogadores[k];
          if (jj.apostaRua > 0) {
            voos.push(voar(P.UI.pilhaFichas(jj.apostaRua, tamFicha()), { x: geo.pos[k].bx, y: geo.pos[k].by }, alvo, 300 * f));
            jj.apostaRua = 0;
            renderAposta(+k);
          }
        });
        if (voos.length) P.Som.ficha();
        await Promise.all(voos);
        if (est !== meu) return;
        est.pote = ev.pote;
        est.potes = ev.potes || [];
        renderPote();
        return esperar(120 * f);
      }
      case 'rua': {
        limparBaloes();
        if (ev.semApostas) await esperar(500 * f);
        if (est !== meu) return;
        const slots = boardEl.children;
        for (const c of ev.cartas) {
          const idx = est.board.length;
          const carta = P.UI.carta(c, { fechada: true });
          boardEl.replaceChild(carta, slots[idx]);
          est.board.push(c);
          P.Som.carta();
          await esperar(110 * f);
          P.UI.revelar(carta, c);
          await esperar(150 * f);
          if (est !== meu) return;
        }
        return esperar((ev.semApostas ? 700 : 250) * f);
      }
      case 'mostra': {
        const a = assentos[s];
        if (ev.mostrou) {
          a.raiz.classList.add('mostrou');
          est.mostrados[s] = { melhores: ev.melhores, descricao: ev.descricao };
          if (s !== HEROI) {
            a.cartas.innerHTML = '';
            ev.cartas.forEach(c => a.cartas.appendChild(P.UI.carta(c, { fechada: true })));
            await esperar(60 * f);
            Array.prototype.forEach.call(a.cartas.children, (div, i) => P.UI.revelar(div, ev.cartas[i]));
            P.Som.carta();
          }
          a.desc.textContent = ev.descricao;
          a.desc.classList.remove('oculto');
        } else {
          balao(s, 'Esconde', 'fold');
          if (s !== HEROI) a.cartas.innerHTML = '';
        }
        return esperar(550 * f);
      }
      case 'pote': {
        const origem = centroDe(poteEl);
        let texto = '';
        for (const v of ev.vencedores) {
          const jj = est.jogadores[v.assento];
          await voar(P.UI.pilhaFichas(v.valor, tamFicha()), origem, geo.pos[v.assento], 420 * f);
          if (est !== meu) return;
          jj.fichas += v.valor;
          est.pote = Math.max(0, est.pote - v.valor);
          assentos[v.assento].raiz.classList.add('vencedor');
          balao(v.assento, '+' + fmt(v.valor), 'ganho');
          renderAssento(v.assento);
          texto += `${esc(jj.nome)} ganha <b>${fmt(v.valor)}</b>`;
          if (v.assento === HEROI) P.Som.vitoria();
        }
        if (ev.descricao) texto += ` com <b>${esc(ev.descricao)}</b>`;
        if (ev.indice > 0) texto += ` (side pot ${ev.indice})`;
        if (ev.dividido) texto += ' — pote dividido';
        faixa.innerHTML = texto;
        faixa.classList.add('on');
        if (ev.indice === 0 && !ev.semShowdown) destacarVencedora(ev.vencedores[0].assento);
        if (est.potes && est.potes.length > 1) est.potes = est.potes.slice(1); else est.potes = [];
        renderPote();
        return esperar(800 * f);
      }
      default: return undefined;
    }
  }

  /**
   * Janela ainda sem tamanho (sem geometria para animar): aplica o evento direto,
   * para as cartas e o board não se perderem. Fichas e potes vêm de sincronizar().
   */
  function aplicarSemAnimar(ev) {
    const s = ev.assento;
    if (ev.tipo === 'distribuicao') {
      ev.ordem.forEach(x => {
        const a = assentos[x];
        a.cartas.innerHTML = '';
        (x === HEROI ? est.jogadores[x].cartas : [null, null]).forEach(c => a.cartas.appendChild(P.UI.carta(x === HEROI ? c : null, { fechada: x !== HEROI })));
      });
    } else if (ev.tipo === 'rua') {
      ev.cartas.forEach(c => { boardEl.replaceChild(P.UI.carta(c), boardEl.children[est.board.length]); est.board.push(c); });
    } else if (ev.tipo === 'mostra' && ev.mostrou) {
      const a = assentos[s];
      est.mostrados[s] = { melhores: ev.melhores, descricao: ev.descricao };
      if (s !== HEROI) { a.cartas.innerHTML = ''; ev.cartas.forEach(c => a.cartas.appendChild(P.UI.carta(c))); }
      a.raiz.classList.add('mostrou');
      a.desc.textContent = ev.descricao;
      a.desc.classList.remove('oculto');
    } else if (ev.tipo === 'acao') {
      assentos[s].raiz.classList.remove('vez');
      if (ev.acao === 'fold') {
        est.jogadores[s].foldou = true;
        if (s === HEROI) Array.prototype.forEach.call(assentos[s].cartas.children, c => c.classList.add('apagada'));
        else assentos[s].cartas.innerHTML = '';
      }
    }
  }

  async function animarAcao(ev, j) {
    const meu = est;
    const f = fv(), s = ev.assento;
    assentos[s].raiz.classList.remove('vez');
    j.fichas = ev.fichas;
    const antes = j.apostaRua;
    j.apostaRua = ev.apostaRua;
    j.allin = ev.allin;
    let texto, classe = ev.acao;
    switch (ev.acao) {
      case 'fold': texto = 'Fold'; j.foldou = true; break;
      case 'check': texto = 'Check'; break;
      case 'call': texto = 'Paga ' + fmt(ev.valor); break;
      case 'bet': texto = 'Aposta ' + fmt(ev.ate); break;
      case 'raise': texto = 'Aumenta ' + fmt(ev.ate); break;
      default: texto = ev.acao;
    }
    if (ev.allin && ev.acao !== 'fold') { texto = 'All-in ' + fmt(ev.apostaRua); classe = 'allin-b'; }
    balao(s, texto, classe);
    if (ev.acao === 'fold') {
      P.Som.fold();
      const a = assentos[s];
      if (s === HEROI) Array.prototype.forEach.call(a.cartas.children, c => c.classList.add('apagada'));
      else {
        const cs = Array.prototype.slice.call(a.cartas.children);
        cs.forEach(c => {
          const p = centroDe(c);
          const copia = P.UI.carta(null, { fechada: true });
          copia.style.setProperty('--l', getComputedStyle(c).width);
          voar(copia, p, { x: geo.cx, y: geo.cy - geo.oh * 0.1 }, 300 * f, { sumir: true, girar: 90 });
        });
        a.cartas.innerHTML = '';
      }
    } else if (ev.acao === 'check') P.Som.check();
    else P.Som.ficha();
    if (ev.valor > 0 && ev.apostaRua > antes) {
      await voar(P.UI.pilhaFichas(ev.valor, tamFicha()), geo.pos[s], { x: geo.pos[s].bx, y: geo.pos[s].by }, 230 * f);
      if (est !== meu) return;
    }
    renderAssento(s);
    renderAposta(s);
    renderPote();
    return esperar(140 * f);
  }

  async function distribuir(ordem) {
    const meu = est;
    const f = fv();
    for (let volta = 0; volta < 2; volta++) {
      for (const s of ordem) {
        const a = assentos[s];
        const c = s === HEROI ? est.jogadores[s].cartas[volta] : null;
        const nova = P.UI.carta(s === HEROI ? c : null, { fechada: true });
        nova.style.visibility = 'hidden';
        a.cartas.appendChild(nova);
        const destino = centroDe(nova);
        const voadora = P.UI.carta(null, { fechada: true });
        voadora.style.setProperty('--l', getComputedStyle(nova).width);
        P.Som.carta();
        voar(voadora, geo.origem, destino, 230 * f).then(() => { nova.style.visibility = ''; });
        await esperar(80 * f);
        if (est !== meu) return;
      }
    }
    await esperar(260 * f);
    if (est !== meu) return;
    const minhas = assentos[HEROI].cartas.children;
    Array.prototype.forEach.call(minhas, (div, i) => P.UI.revelar(div, est.jogadores[HEROI].cartas[i]));
    return esperar(200 * f);
  }

  function destacarVencedora(s) {
    const m = est.mostrados[s];
    if (!m || !m.melhores) return;
    const set = {};
    m.melhores.forEach(c => { set[c] = true; });
    Array.prototype.forEach.call(boardEl.querySelectorAll('.carta'), d => {
      d.classList.toggle('destaque', !!set[d.dataset.carta]);
      d.classList.toggle('apagada', !set[d.dataset.carta]);
    });
    Array.prototype.forEach.call(assentos[s].cartas.querySelectorAll('.carta'), d => {
      d.classList.toggle('destaque', !!set[d.dataset.carta]);
    });
  }

  // ============================================================ barra de ações
  function montarBarraAcoes() {
    barra.status = el('span', { id: 'acoes-status-txt', text: 'Preparando a mesa…' });
    barra.nota = el('span');
    barra.dica = el('button', { class: 'btn oculto', html: 'Pedir dica<span class="so-largo"> (H)</span>', onclick: pedirDica });
    barra.status.addEventListener('click', () => { if (barra.status.classList.contains('com-coach')) P.UICoach.alternar(true); });
    barra.tamanhos = el('div', { class: 'tamanhos' });
    barra.slider = el('input', { type: 'range' });
    barra.valor = el('input', { class: 'entrada', type: 'text', inputmode: 'decimal' });
    barra.unidade = el('button', { class: 'opcao', title: 'Alternar entre valores em dinheiro/fichas e em big blinds', onclick: alternarUnidade });
    barra.fold = el('button', { class: 'btn-acao btn-fold', html: 'Fold<kbd>F</kbd>', onclick: () => agir('fold') });
    barra.call = el('button', { class: 'btn-acao btn-call', html: 'Check<kbd>C</kbd>', onclick: () => agir('call') });
    barra.raise = el('button', { class: 'btn-acao btn-raise', html: 'Aumentar<kbd>R</kbd>', onclick: () => agir('raise') });
    barra.slider.addEventListener('input', () => { definirValor(+barra.slider.value, false); });
    barra.valor.addEventListener('change', lerValorDigitado);
    barra.valor.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lerValorDigitado(); agir('raise'); } });
    const raiz = el('div', { class: 'barra-acoes' },
      el('div', { class: 'acoes-esquerda' },
        el('div', { class: 'acoes-status' }, barra.status, barra.nota, el('span', { class: 'espaco', style: { flex: 1 } }), barra.dica),
        barra.tamanhos,
        el('div', { class: 'linha-slider' }, barra.slider, barra.valor, barra.unidade)),
      el('div', { class: 'acoes-botoes' }, barra.fold, barra.call, barra.raise));
    barra.raiz = raiz;
    atualizarUnidade();
    bloquear(true);
    return raiz;
  }

  function status(html) { if (barra.status) { barra.status.innerHTML = html; barra.status.classList.remove('com-coach'); } }

  // Linha do coach na barra de ações (com o painel fechado, a dica aparece aqui sem cobrir a mesa)
  const ROTULO_ACAO = { fold: 'FOLD', check: 'CHECK', call: 'PAGUE', bet: 'APOSTE', raise: 'AUMENTE', allin: 'ALL-IN' };
  function linhaCoach(an) {
    const painel = $('#painel-coach');
    if (!an || !an.recomendacao || !vistaAtual || !pendente || (painel && !painel.classList.contains('recolhido'))) return;
    const r = an.recomendacao;
    const valor = (r.acao === 'raise' || r.acao === 'bet') && r.ate ? ' ' + fmt(r.ate) : '';
    const motivo = an.passos && an.passos.length ? an.passos[an.passos.length - 1] : '';
    barra.status.innerHTML = `<span class="st-l1">${textoStatusCurto(vistaAtual)}</span><span class="coach-sug" title="Toque para ver a análise completa">♠ <b>${ROTULO_ACAO[r.acao] || r.acao}${valor}</b> — ${esc(motivo)}</span>`;
    barra.status.classList.add('com-coach');
  }

  function textoStatusHeroi(vista) {
    const v = vista.acoes;
    if (!v) return 'Sua vez';
    if (v.podeCheck) return '<b>Sua vez.</b> Ninguém apostou: check ou aposte.';
    const nec = v.valorCall / (vista.pote + v.valorCall);
    return `<b>Sua vez.</b> Pagar ${fmt(v.valorCall)} para ganhar ${fmt(vista.pote)} — precisa de ${F.pct(nec, 1)} de equity.`;
  }
  /** Versão de uma linha (quando a dica do coach ocupa a segunda). */
  function textoStatusCurto(vista) {
    const v = vista.acoes;
    if (!v || v.podeCheck) return '<b>Sua vez:</b> check ou aposte';
    return `<b>Sua vez:</b> pagar ${fmt(v.valorCall)} · precisa de ${F.pct(v.valorCall / (vista.pote + v.valorCall), 1)}`;
  }

  let valorAtual = 0, acoesAtuais = null;

  function passo(bb) { return ctxFmt.modo === 'cash' ? 1 : Math.max(1, Math.round(bb / 20)); }

  function configurarBarra(vista) {
    const v = vista.acoes;
    acoesAtuais = v;
    const bb = vista.blinds.bb;
    barra.fold.disabled = false;
    barra.call.innerHTML = (v.podeCheck ? 'Check' : `Pagar<small>${fmt(v.valorCall)}${v.callAllin ? ' (all-in)' : ''}</small>`) + '<kbd>C</kbd>';
    barra.dica.classList.toggle('oculto', P.Config.get('modoCoach') !== 'pedido' || !!cfg.remota);
    barra.tamanhos.innerHTML = '';
    if (!v.podeApostar) {
      barra.raise.disabled = true;
      barra.raise.innerHTML = 'Aumentar<kbd>R</kbd>';
      barra.slider.disabled = true; barra.valor.disabled = true;
      return;
    }
    barra.slider.disabled = false; barra.valor.disabled = false;
    barra.slider.min = v.minAte; barra.slider.max = v.maxAte; barra.slider.step = passo(bb);
    const preflop = vista.rua === 'preflop';
    const presets = preflop
      ? [['2,2x', () => v.apostaAtual * 2.2], ['2,5x', () => v.apostaAtual * 2.5], ['3x', () => v.apostaAtual * 3], ['Pote', () => v.apostaAtual + vista.pote + v.valorCall], ['All-in', () => v.maxAte]]
      : [['1/3', () => v.apostaAtual + (vista.pote + v.valorCall) / 3], ['1/2', () => v.apostaAtual + (vista.pote + v.valorCall) / 2], ['2/3', () => v.apostaAtual + (vista.pote + v.valorCall) * 2 / 3],
        ['Pote', () => v.apostaAtual + vista.pote + v.valorCall], ['All-in', () => v.maxAte]];
    presets.forEach(([rot, fn]) => {
      const alvo = ajustarValor(fn());
      barra.tamanhos.appendChild(el('button', { text: rot, title: fmt(alvo), 'data-ate': alvo, onclick: () => definirValor(alvo, true) }));
    });
    const padrao = preflop ? (v.apostaAtual <= bb ? v.apostaAtual * 2.5 : v.apostaAtual * 3) : v.apostaAtual + (vista.pote + v.valorCall) * 0.66;
    definirValor(ajustarValor(padrao), true);
  }

  function ajustarValor(x) {
    const v = acoesAtuais;
    if (!v) return 0;
    const p = passo(ctxFmt.bb);
    let r = Math.round(x / p) * p;
    r = Math.max(v.minAte, Math.min(v.maxAte, r));
    if (v.maxAte - r < p) r = v.maxAte;
    return r;
  }

  function definirValor(x, moverSlider) {
    const v = acoesAtuais;
    if (!v) return;
    valorAtual = ajustarValor(x);
    if (moverSlider) barra.slider.value = valorAtual;
    barra.valor.value = valorParaCampo(valorAtual);
    const allin = valorAtual >= v.maxAte;
    barra.raise.disabled = false;
    barra.raise.innerHTML = (allin ? 'All-in' : v.tipoAposta === 'bet' ? 'Apostar' : 'Aumentar') + `<small>${allin ? '' : v.tipoAposta === 'bet' ? '' : 'para '}${fmt(valorAtual)}</small><kbd>R</kbd>`;
  }

  function valorParaCampo(v) {
    if (P.Config.get('unidade') === 'bb') return F.num(v / ctxFmt.bb, 1);
    return ctxFmt.modo === 'cash' ? (v / 100).toFixed(2).replace('.', ',') : String(v);
  }

  function lerValorDigitado() {
    const n = parseFloat(String(barra.valor.value).replace(/\./g, '').replace(',', '.'));
    if (isNaN(n)) { definirValor(valorAtual, true); return; }
    let unidades = P.Config.get('unidade') === 'bb' ? n * ctxFmt.bb : ctxFmt.modo === 'cash' ? n * 100 : n;
    definirValor(unidades, true);
  }

  function alternarUnidade() {
    P.Config.set('unidade', P.Config.get('unidade') === 'bb' ? 'dinheiro' : 'bb');
  }

  function atualizarUnidade() {
    if (!barra.unidade) return;
    const bb = P.Config.get('unidade') === 'bb';
    barra.unidade.textContent = bb ? 'bb' : (cfg && cfg.modo !== 'cash' ? 'fichas' : '$');
    barra.unidade.classList.toggle('ativo', bb);
  }

  function bloquear(sim) {
    [barra.fold, barra.call, barra.raise].forEach(b => { if (b) b.disabled = sim; });
    if (barra.slider) barra.slider.disabled = sim;
    if (barra.valor) barra.valor.disabled = sim;
    if (barra.tamanhos) Array.prototype.forEach.call(barra.tamanhos.children, b => { b.disabled = sim; });
    if (barra.raise) barra.raise.classList.remove('armado');
    if (!sim && acoesAtuais && !acoesAtuais.podeApostar) { barra.raise.disabled = true; barra.slider.disabled = true; barra.valor.disabled = true; }
  }

  function agir(tipo) {
    if (!pendente || !acoesAtuais) return;
    const v = acoesAtuais;
    let acao;
    if (tipo === 'fold') acao = 'fold';
    else if (tipo === 'call') acao = v.podeCheck ? 'check' : 'call';
    else {
      if (!v.podeApostar) return;
      acao = valorAtual >= v.maxAte ? 'allin' : { tipo: v.tipoAposta, ate: valorAtual };
    }
    pendente.resolve(acao);
  }

  function sugerir(an) {
    limparSugestao();
    const r = an && an.recomendacao;
    if (!r) return;
    // painel fechado (celular): o botão "Coach" avisa que há dica nova
    const painel = $('#painel-coach');
    if (painel && painel.classList.contains('recolhido')) $('#mb-coach').classList.add('novidade');
    const btn = r.acao === 'fold' ? barra.fold : (r.acao === 'check' || r.acao === 'call') ? barra.call : barra.raise;
    if (btn && !btn.disabled) btn.classList.add('sugerido');
    if ((r.acao === 'raise' || r.acao === 'bet' || r.acao === 'allin') && acoesAtuais && acoesAtuais.podeApostar) {
      definirValor(r.acao === 'allin' ? acoesAtuais.maxAte : r.ate, true);
      Array.prototype.forEach.call(barra.tamanhos.children, b => b.classList.toggle('recomendado', +b.dataset.ate === valorAtual));
    }
    linhaCoach(an);
  }

  /** "Pedir dica": mostra a análise no painel e, com ele fechado, a dica na barra. */
  function pedirDica() {
    if (!pendente || !pendente.analise) return;
    const an = pendente.analise;
    P.UICoach.pedirDica(an);
    if (an) an.then(x => linhaCoach(x));
  }
  function limparSugestao() {
    [barra.fold, barra.call, barra.raise].forEach(b => b && b.classList.remove('sugerido'));
    const bc = $('#mb-coach');
    if (bc) bc.classList.remove('novidade');
    if (barra.tamanhos) Array.prototype.forEach.call(barra.tamanhos.children, b => b.classList.remove('recomendado'));
  }

  // teclado: F fold, C check/call, R prepara o aumento, Enter confirma, H dica
  document.addEventListener('keydown', e => {
    if (!tela || tela.classList.contains('oculto') || document.querySelector('.modal-fundo')) return;
    const tecla = e.key.toLowerCase();
    const digitando = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (digitando && tecla !== 'enter') return;
    if (!pendente) return;
    if (tecla === 'f') { e.preventDefault(); agir('fold'); }
    else if (tecla === 'c') { e.preventDefault(); agir('call'); }
    else if (tecla === 'r') {
      e.preventDefault();
      if (!barra.raise.disabled) { barra.raise.classList.add('armado'); barra.valor.focus(); barra.valor.select(); }
    } else if (tecla === 'enter') {
      if (barra.raise.classList.contains('armado') || digitando) { e.preventDefault(); lerValorDigitado(); agir('raise'); }
    } else if (tecla === 'h' && P.Config.get('modoCoach') === 'pedido') { pedirDica(); }
  });

  // ============================================================== HUD e barra
  function renderBarraInfo(info) {
    $('#mb-rotulo').textContent = info.rotulo;
    const b = info.blinds;
    let det;
    if (info.modo === 'cash') {
      const r = info.resultado;
      det = `${F.dinheiro(b.sb)}/${F.dinheiro(b.bb)} · ${info.lugares} lugares · ${info.maos} mãos · ` +
        `sessão <span class="${r >= 0 ? 'resultado-pos' : 'resultado-neg'}">${r >= 0 ? '+' : ''}${F.dinheiro(r)}</span>` +
        (info.maos ? ` (${F.num(info.bb100, 1)} bb/100)` : '');
    } else {
      det = `Nível ${info.nivel}: ${F.fichas(b.sb)}/${F.fichas(b.bb)}${b.ante ? (b.anteBB ? ' · BB ante ' : ' · ante ') + F.fichas(b.ante) : ''} · ${info.restantes}/${info.field} jogadores`;
    }
    $('#mb-detalhe').innerHTML = det;
  }

  function renderHud(info) {
    const tempo = info.restanteMs !== null ? F.tempo(info.restanteMs) : `${info.maosNoNivel}/${info.maosPorNivel} mãos`;
    const dur = (cfg.modo === 'sng' ? P.Estruturas.SNG_DURACAO : P.Estruturas.TORNEIO_DURACAO)[cfg.velocidade] * 1000;
    const prog = info.restanteMs !== null ? 1 - info.restanteMs / dur : 0;
    const b = info.blinds, p = info.proximo;
    const estado = info.itm ? '<span class="estado itm">NA PREMIAÇÃO</span>' : info.bolha ? '<span class="estado bolha">BOLHA</span>' : '';
    const fp = info.fmtPremio || F.dinheiro;   // mesa com amigos: reais
    const premios = info.premios.slice(0, 3).map((v, i) => `${i + 1}º ${fp(v)}`).join(' · ');
    const item = (rot, val, extra) => `<div class="item${extra ? ' extra' : ''}"><span>${rot}</span><b>${val}</b></div>`;
    hud.title = info.premios.length ? 'Premiação: ' + info.premios.map((v, i) => `${i + 1}º ${fp(v)}`).join(', ') : 'Sem premiação';
    if (hud.classList.contains('curto')) {   // versão curta (celular)
      hud.innerHTML = item(`Nível ${info.nivel}`, `${F.fichas(b.sb)}/${F.fichas(b.bb)}`) + `<div class="relogio">${tempo}</div>` +
        item('Jogadores', `${info.restantes}/${info.field}`) + item('Posição', `${info.posicao}º`) + estado;
      return;
    }
    hud.innerHTML =
      item(`Nível ${info.nivel}`, `${F.fichas(b.sb)}/${F.fichas(b.bb)}${b.ante ? ` · ${b.anteBB ? 'BB ante' : 'ante'} ${F.fichas(b.ante)}` : ''}`) +
      `<div class="item"><span>próximo ${F.fichas(p.sb)}/${F.fichas(p.bb)}</span><div class="relogio">${tempo}</div></div>` +
      `<div class="barra-nivel extra"><i style="width:${Math.min(100, prog * 100)}%"></i></div><span class="sep"></span>` +
      item('Jogadores', `${info.restantes}/${info.field}`) + (info.mesas > 1 ? item('Mesas', info.mesas) : '') + item('Stack médio', F.fichas(info.stackMedio), true) +
      item('Sua posição', `${info.posicao}º`) + item(`Pagos: ${info.pagos}`, premios, true) + estado;
    ajustarBarra(false);
  }

  /**
   * No PC a faixa do torneio fica no meio da barra de cima. Se não couber, some
   * primeiro o nome do torneio e depois os itens extras (barrinha do nível,
   * stack médio, prêmios). Recomeça do zero só ao redimensionar (sem piscar).
   */
  function ajustarBarra(recomecar) {
    if (!hud || hud.classList.contains('curto')) return;
    if (recomecar) { barraInfo.classList.remove('sem-rotulo'); hud.classList.remove('apertado'); }
    const cabe = () => hud.scrollWidth <= hud.clientWidth + 1 && barraInfo.scrollWidth <= barraInfo.clientWidth + 1;
    if (!cabe()) barraInfo.classList.add('sem-rotulo');
    if (!cabe()) hud.classList.add('apertado');
  }

  function iniciarHud() {
    pararHud();
    if (cfg.modo === 'cash') return;
    intervaloHud = setInterval(() => { if (partida && partida.ativo()) { const i = partida.info(); if (hud) renderHud(i); } }, 500);
  }
  function pararHud() { if (intervaloHud) clearInterval(intervaloHud); intervaloHud = null; }

  // ================================================================ ciclo
  let tokenPartida = 0;
  /** A interface só atende a partida atual; chamadas de uma partida já encerrada são ignoradas. */
  function uiDaPartida(token) {
    const proxy = {};
    Object.keys(ui).forEach(k => {
      proxy[k] = (...args) => {
        if (token !== tokenPartida || !est && k !== 'aoIniciar' && k !== 'aoNovaMao' && k !== 'aoInfo') {
          return k === 'pedirAcao' ? Promise.resolve('fold') : undefined;
        }
        return ui[k](...args);
      };
    });
    return proxy;
  }

  async function iniciar(config) {
    encerrar(false);
    montar(config);
    const token = ++tokenPartida;
    partida = (config.criarPartida || P.Partida.criar)(Object.assign({}, config, { heroi: { nome: P.Config.get('nome'), mostraPerdedoras: P.Config.get('mostrarPerdedoras') } }), uiDaPartida(token));
    iniciarHud();
    try {
      await partida.rodar();
    } catch (e) {
      console.error(e);
      (window.__errosGlobais = window.__errosGlobais || []).push('Partida: ' + (e.stack || e.message));
      document.documentElement.setAttribute('data-erros', String(window.__errosGlobais.length));
      document.documentElement.setAttribute('data-ultimo-erro', String(e.stack || e.message).slice(0, 400));
      P.UI.aviso('Erro na partida: ' + esc(e.message), 'erro');
    }
  }

  async function sair() {
    if (!partida) { P.App.irPara('lobby'); return; }
    if (cfg.remota) {
      if (partida.jogando()) {
        pausar(true);
        const ok = await P.UI.confirmar('Desistir da partida?', 'Se sair agora você desiste: fica fora desta partida, com a pior colocação, e quem continuar segue jogando.', 'Desistir', 'Continuar jogando');
        pausar(false);
        if (!ok) return;
      }
      encerrar(true);
      P.App.irPara('amigos');
      return;
    }
    if (partida.ativo() && cfg.modo !== 'cash' && !partida.fim()) {
      pausar(true);
      const ok = await P.UI.confirmar('Abandonar?', 'Se sair agora você perde o buy-in e a partida termina para você.', 'Abandonar', 'Continuar jogando');
      pausar(false);
      if (!ok) return;
    }
    const p = partida, modo = cfg.modo;
    const r = encerrar(true);
    P.App.irPara('lobby');
    if (r && modo === 'cash') P.UI.aviso(`Você saiu com ${F.dinheiro(r.devolvido)} (${r.resultado >= 0 ? '+' : ''}${F.dinheiro(r.resultado)} na sessão).`, r.resultado >= 0 ? 'ok' : '');
    // análise do coach do que foi jogado até aqui
    const rel = p.relatorio({ resultadoCash: r ? r.resultado : 0, abandonou: modo !== 'cash' });
    if (rel && rel.maos > 0) {
      const v = await P.UIPaineis.abrirRelatorio(rel, [{ texto: 'Fechar', classe: 'btn-ouro', valor: 'lobby' }]);
      P.UIPaineis.tratarSaidaRelatorio(v);
    }
  }

  /** Abre/fecha o painel das outras mesas (não pausa o jogo). */
  function alternarMesas() {
    if (!partida || !partida.torneio || !partida.torneio()) return;
    if (P.UIMesas.aberto()) { P.UIMesas.fechar(); return; }
    P.UIMesas.abrir(partida);
    if (pendente) P.UIMesas.avisarVez(true);
  }

  function encerrar(abandonou) {
    P.UIMesas.fechar();
    pararHud();
    let r = null;
    if (partida) {
      r = partida.sair();
      if (abandonou && cfg && cfg.modo !== 'cash' && !cfg.remota && !partida.fim()) {
        const n = cfg.modo === 'sng' ? Math.max(cfg.lugares, cfg.participantes || cfg.lugares) : cfg.field;
        P.Estatisticas.registrarTorneio(cfg.modo === 'sng' ? 'sng' : 'torneio', cfg.buyin.total, 0, n, n);
      }
    }
    tokenPartida++;
    if (pendente) pendente.resolve('fold');
    partida = null;
    est = null;
    pausas = 0;
    if (P.App && P.App.atualizarSaldo) P.App.atualizarSaldo();
    return r;
  }

  async function overlay(qual) {
    pausar(true);
    try {
      if (qual === 'config') await P.UIPaineis.abrirConfig();
      else if (qual === 'cola') await P.UIPaineis.abrirCola();
      else await P.UIPaineis.abrirOverlay(qual);
    } finally { pausar(false); }
  }

  /**
   * Celular: mostra/esconde a barra de cima da mesa (nível dos blinds, jogadores,
   * posição, coach e menu). Ela some sozinha depois de alguns segundos, ao tocar
   * fora dela ou ao usar um dos botões.
   */
  let timerBarra = null;
  function alternarBarra(abrir) {
    if (!barraInfo) return;
    const vai = abrir === undefined ? !barraInfo.classList.contains('aberta') : abrir;
    barraInfo.classList.toggle('aberta', vai);
    clearTimeout(timerBarra);
    if (vai) timerBarra = setTimeout(() => alternarBarra(false), 8000);
  }
  document.addEventListener('pointerdown', e => {
    if (barraInfo && barraInfo.classList.contains('aberta') && !barraInfo.contains(e.target) && !e.target.closest('.btn-barra')) alternarBarra(false);
  }, true);

  /** Menu da mesa no celular (os botões da barra não cabem na tela). */
  async function abrirMenu() {
    const instalado = window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    const multi = partida && partida.torneio && partida.torneio() && partida.torneio().mesas() > 1;
    const itens = [
      multi ? ['mesas', 'Mesas do torneio'] : null,
      ['historico', 'Histórico de mãos'], ['estatisticas', 'Estatísticas'], ['config', 'Opções'], ['cola', 'Cola de consulta'],
      ['som', P.Config.get('som') ? 'Desligar o som' : 'Ligar o som'],
      document.fullscreenEnabled && !instalado ? ['telaCheia', document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'] : null,
      ['sair', cfg.remota ? 'Sair da mesa' : 'Sair para o lobby']
    ].filter(Boolean);
    pausar(true);
    let escolha;
    try {
      escolha = await P.UI.modal({
        titulo: 'Menu', conteudo: el('div', { class: 'menu-mesa' }),
        aoAbrir: (corpo, fechar) => itens.forEach(([id, txt]) => corpo.firstChild.appendChild(
          el('button', { class: 'btn' + (id === 'sair' ? ' btn-sair' : ''), text: txt, onclick: () => fechar(id) })))
      });
    } finally { pausar(false); }
    if (!escolha) return;
    if (escolha === 'sair') sair();
    else if (escolha === 'mesas') alternarMesas();
    else if (escolha === 'som') P.Config.set('som', !P.Config.get('som'));
    else if (escolha === 'telaCheia') alternarTelaCheia();
    else overlay(escolha);
  }

  function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch (e) { /* navegador sem tela cheia */ }
  }

  // mudanças de configuração com a mesa aberta
  P.Config.aoMudar((k, v) => {
    if (!tela) return;
    if (k === 'tema') tela.dataset.tema = v;
    if (k === 'unidade') { atualizarUnidade(); if (est) renderTudo(); if (pendente && vistaAtual) configurarBarra(vistaAtual); }
    if (k === 'mostrarPerdedoras' && partida) { const h = partida.mesa().jogador(HEROI); if (h) h.mostraPerdedoras = v; }
    if (k === 'modoCoach') { P.UICoach.aplicarModo(v); if (barra.dica) barra.dica.classList.toggle('oculto', v !== 'pedido'); }
  });
  document.addEventListener('visibilitychange', () => { if (partida) partida.pausarRelogio(document.hidden || pausas > 0); });

  P.UIMesa = { iniciar, sair, encerrar, emJogo: () => !!(partida && partida.ativo()), pausar };
})(window.Poker = window.Poker || {});
