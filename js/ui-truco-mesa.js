/* ==========================================================================
   OUTS · Treino Lab — ui-truco-mesa.js
   A mesa do truco: placar, valor da mão e rodadas na barra de cima; os
   lugares (você embaixo, o parceiro em frente na dupla), as cartas jogadas
   em cada rodada, a vira com a manilha escrita; a sua mão (toque na carta
   para jogar), os botões de truco/cobrir/aceitar/correr e a faixa do coach
   (com a conta completa ao tocar nela). No fim de cada mão aparecem as
   cartas de todo mundo; no fim da partida, o resumo das suas decisões.
   A partida fica salva no começo de cada mão: se o app fechar, ela volta.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const T = P.Truco, R = T.Regras, IA = T.IA, CO = T.Coach, D = T.Dados;
  const VELOCIDADES = { lenta: 2, normal: 1.4, rapida: 1, turbo: 0.22 };
  const fv = () => (jogo && jogo.opcoes.velocidade !== undefined ? jogo.opcoes.velocidade : VELOCIDADES[P.Config.get('velocidade')] || 1);
  const limitar = (x, a, b) => Math.max(a, Math.min(b, x));
  const POS = { 2: ['baixo', 'cima'], 4: ['baixo', 'direita', 'cima', 'esquerda'] };

  let jogo = null;        // partida na tela
  let pausas = 0;
  let contador = 0;       // cada partida tem o seu número: o que sobrar de uma partida encerrada não mexe na próxima

  /** Espera "ms" de tempo não pausado (menus e modais abertos pausam a mesa). */
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

  // ======================================================== montar a mesa
  function montar() {
    const raiz = $('#tela-truco');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    const g = jogo.ui = {};
    const n = jogo.n;
    g.raiz = el('div', { class: 'tr-jogo', 'data-tema': P.Config.get('tema') || 'verde', 'data-n': n });

    // barra de cima
    g.nos = el('b', { text: '0' }); g.eles = el('b', { text: '0' });
    g.ladoNos = el('span', { class: 'lado nos' }, el('span', { class: 'rot', text: n === 4 ? 'Nós' : 'Você' }), g.nos);
    g.ladoEles = el('span', { class: 'lado eles' }, g.eles, el('span', { class: 'rot', text: 'Eles' }));
    g.vale = el('b', { text: '1' });
    g.valeRot = el('small', { text: 'vale' });
    g.valeBox = el('div', { class: 'tr-vale', title: 'Quanto vale a mão' }, g.valeRot, g.vale);
    g.rodadas = el('div', { class: 'tr-rodadas', title: 'Rodadas desta mão' }, el('i'), el('i'), el('i'));
    g.tipoMao = el('span', { class: 'tipo-mao oculto' });
    g.btnCoach = el('button', { class: 'btn', title: 'Ver a conta do coach', html: '💡<span class="rot"> Coach</span>', onclick: abrirCoach });
    g.barra = el('div', { class: 'tr-barra' },
      el('div', { class: 'tr-placar' }, g.ladoNos, el('span', { text: '×' }), g.ladoEles),
      g.valeBox, g.rodadas, g.tipoMao, el('span', { class: 'espaco' }),
      g.btnCoach,
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot"> Menu</span>', onclick: abrirMenu }));

    // palco
    g.feltro = el('div', { class: 'tr-feltro' });
    g.palco = el('div', { class: 'tr-palco' }, g.feltro);
    g.lugares = []; g.montes = [];
    for (let j = 0; j < n; j++) {
      const info = jogo.jogadores[j];
      const pos = POS[n][j];
      const eq = j % 2 === 0 ? 'nos' : 'eles';
      const lugar = { pos };
      lugar.balao = el('div', { class: 'balao' });
      lugar.costas = el('div', { class: 'tr-costas' });
      const linha2 = el('div', { class: 'linha2' });
      if (info.perfil) {
        const pf = IA.PERFIS[info.perfil];
        linha2.appendChild(el('span', { class: 'tag-perfil', style: { '--cor-perfil': pf.cor }, title: `${pf.nome}: ${pf.descricao}`, text: pf.sigla }));
      }
      linha2.appendChild(el('span', { class: 'equipe', text: j === 0 ? 'você' : j === 2 ? 'parceiro' : 'eles' }));
      lugar.raiz = el('div', { class: `tr-lugar ${eq}`, 'data-pos': pos },
        lugar.balao,
        el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, j === 0) }),
        el('div', { class: 'placa' }, el('span', { class: 'nome', text: info.nome }), linha2),
        j === 0 ? null : lugar.costas);
      g.lugares.push(lugar);
      g.palco.appendChild(lugar.raiz);
      const monte = el('div', { class: 'tr-monte', 'data-pos': pos });
      g.montes.push(monte);
      g.palco.appendChild(monte);
    }
    g.viraSlot = el('div', { class: 'vira-slot' });
    g.rotuloVira = el('div', { class: 'rotulo-vira' });
    g.centro = el('div', { class: 'tr-centro' }, g.viraSlot, g.rotuloVira);
    g.splash = el('div', { class: 'tr-splash' });
    g.palco.append(g.centro, g.splash);

    // coach, mão, ações
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada decisão sua.</span>' });
    g.coachNota = el('span');
    g.btnDica = el('button', { class: 'btn oculto', text: 'Dica', onclick: e => { e.stopPropagation(); mostrarDica(); } });
    g.coach = el('div', { class: 'tr-coach', onclick: abrirCoach }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt, g.btnDica);
    g.mao = el('div', { class: 'tr-mao' });
    // os três botões mudam de papel (truco/cobrir/dica na sua vez; aumentar/correr/aceitar quando pedem para você):
    // o clique fica só no .onclick, trocado em acoesEspera e nas respostas
    g.btnTruco = el('button', { class: 'btn-acao btn-truco', html: 'Truco!' });
    g.btnCobrir = el('button', { class: 'btn-acao btn-cobrir', html: 'Cobrir<small>carta virada</small>' });
    g.btnTerceiro = el('button', { class: 'btn-acao btn-tr-dica', html: 'Dica' });
    g.status = el('div', { class: 'tr-status' });
    g.acoes = el('div', { class: 'tr-acoes' }, g.btnTruco, g.btnCobrir, g.btnTerceiro, g.status);
    g.raiz.append(g.barra, g.palco, g.coach, g.mao, g.acoes);
    raiz.appendChild(g.raiz);
    aplicarModoCoach();
    acoesEspera('');

    if (jogo.observador) jogo.observador.disconnect();
    jogo.observador = new ResizeObserver(() => layout());
    jogo.observador.observe(g.palco);
    layout();
  }

  // ============================================================== geometria
  /**
   * Posições na mesa conforme o espaço: os lugares nas bordas, as cartas
   * jogadas de cada um em cruz no meio, a vira num canto. Tudo em px.
   */
  function layout() {
    if (!jogo || !jogo.ui) return;
    const g = jogo.ui, n = jogo.n;
    const Wtotal = g.palco.clientWidth, H = g.palco.clientHeight;
    if (!Wtotal || !H) return;
    // no PC a mesa não estica a tela inteira: largura útil proporcional à altura
    const W = Math.min(Wtotal, Math.max(H * 2.1, 360), 1100);
    const x0 = (Wtotal - W) / 2;
    g.feltro.style.left = (x0 + 8) + 'px';
    g.feltro.style.right = (x0 + 8) + 'px';
    const pad = 16;
    const deitado = W > H * 1.25;
    let cartaL = limitar(Math.min(W * (deitado ? 0.12 : n === 4 ? 0.16 : 0.19), H * (deitado ? 0.2 : 0.15)), 30, 76);
    let avatarL, costasL, lugarL, lugarH, lugarHVoce, gap;
    for (let volta = 0; volta < 4; volta++) {
      avatarL = limitar(Math.min(cartaL * 0.78, H * 0.09), 26, 46);
      costasL = limitar(cartaL * 0.36, 12, 22);
      lugarL = limitar(avatarL * 2.3, 74, 112);
      lugarH = avatarL + 30 + costasL * 1.4;        // avatar + placa + cartas viradas
      lugarHVoce = avatarL * 0.8 + 26;              // o seu lugar é menor (suas cartas ficam embaixo da mesa)
      gap = limitar(cartaL * 0.14, 4, 10);
      // as cartas de cima e de baixo (uma sobre a outra) precisam caber entre os lugares
      const cabe = (H - 2 * pad - lugarH - lugarHVoce - 3 * gap - 8) / 2.8;
      if (cartaL <= cabe + 0.5) break;
      cartaL = Math.max(26, cabe);
    }
    const cartaH = cartaL * 1.4;
    const cx = W / 2;
    const larguraMonte = cartaL * (1 + 2 * 0.38);    // três cartas sobrepostas
    const ocupado = [];                              // retângulos já usados (para achar lugar para a vira)
    const ret = (x, y, w, h) => ({ l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 });
    const set = (elem, x, y) => { elem.style.left = (x0 + x) + 'px'; elem.style.top = y + 'px'; };
    const lug = p => g.lugares.find(l => l.pos === p);
    const monte = p => g.montes[g.lugares.findIndex(l => l.pos === p)];

    const yCima = pad + lugarH / 2;
    const yBaixo = H - pad - lugarHVoce / 2;
    lug('baixo').raiz.style.setProperty('--avatar-l', avatarL * 0.8 + 'px');
    set(lug('baixo').raiz, cx, yBaixo);
    set(lug('cima').raiz, cx, yCima);
    ocupado.push(ret(cx, yBaixo, lugarL, lugarHVoce), ret(cx, yCima, lugarL, lugarH));
    const topoLivre = yCima + lugarH / 2, baseLivre = yBaixo - lugarHVoce / 2;
    const cyMeio = (topoLivre + baseLivre) / 2;
    // cartas jogadas em cruz no meio: em cima e embaixo (parceiro e você, ou o adversário e você)
    const yMonteCima = Math.max(topoLivre + 4 + cartaH / 2, cyMeio - cartaH / 2 - gap);
    const yMonteBaixo = Math.min(baseLivre - 4 - cartaH / 2, cyMeio + cartaH / 2 + gap);
    set(monte('cima'), cx, yMonteCima);
    set(monte('baixo'), cx, yMonteBaixo);
    ocupado.push(ret(cx, yMonteCima, larguraMonte, cartaH), ret(cx, yMonteBaixo, larguraMonte, cartaH));
    const yMeio = (yMonteCima + yMonteBaixo) / 2;
    if (n === 4) {
      // laterais: o monte encosta no meio; o lugar fica na borda, na altura do monte se couber, senão mais acima
      const xBordaMonte = cx - larguraMonte / 2 - gap * 2;          // borda de dentro do monte da esquerda
      const cabeLado = xBordaMonte - larguraMonte - gap >= pad + lugarL;
      const ySobe = Math.max(pad + lugarH / 2, yMeio - cartaH / 2 - gap - lugarH / 2);
      const yLado = cabeLado ? yMeio : ySobe;
      set(lug('esquerda').raiz, pad + lugarL / 2, yLado);
      set(lug('direita').raiz, W - pad - lugarL / 2, yLado);
      set(monte('esquerda'), xBordaMonte, yMeio);
      set(monte('direita'), W - xBordaMonte, yMeio);
      ocupado.push(ret(pad + lugarL / 2, yLado, lugarL, lugarH), ret(W - pad - lugarL / 2, yLado, lugarL, lugarH),
        ret(xBordaMonte - larguraMonte / 2, yMeio, larguraMonte, cartaH), ret(W - xBordaMonte + larguraMonte / 2, yMeio, larguraMonte, cartaH));
      // o sinal do parceiro fica à direita do lugar dele
      ocupado.push({ l: cx + lugarL / 2, r: cx + lugarL / 2 + 130, t: yCima - 24, b: yCima + 8 });
    }
    // vira: no primeiro canto livre (e menor, se precisar)
    const cruza = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    let viraL = cartaL * 0.82, pos = null;
    for (const f of [0.82, 0.7, 0.58, 0.48]) {
      viraL = cartaL * f;
      const bw = viraL + 8 + 74, bh = Math.max(viraL * 1.4, 34);
      const cantos = [[pad + bw / 2, pad + bh / 2], [pad + bw / 2, H - pad - bh / 2], [W - pad - bw / 2, H - pad - bh / 2], [W - pad - bw / 2, pad + bh / 2]];
      pos = cantos.find(([x, y]) => !ocupado.some(o => cruza(o, ret(x, y, bw + 6, bh + 6))));
      if (pos) break;
    }
    if (!pos) { const bh = Math.max(viraL * 1.4, 34); pos = [pad + (viraL + 82) / 2, H - pad - bh / 2]; }
    set(g.centro, pos[0], pos[1]);
    g.centro.style.setProperty('--vira-l', viraL + 'px');
    g.palco.style.setProperty('--carta-l', cartaL + 'px');
    g.palco.style.setProperty('--avatar-l', avatarL + 'px');
    g.palco.style.setProperty('--lugar-l', lugarL + 'px');
    g.palco.style.setProperty('--costas-l', costasL + 'px');
    jogo.geo = { W, H, x0, cartaL, yMeio, cx };
    if (g.sinal) posicionarSinal();
    // tamanho das suas cartas
    const larguraMao = g.mao.clientWidth || W;
    const deitadoTela = window.innerHeight < 500 && window.innerWidth >= 560;
    const maoL = deitadoTela ? limitar(Math.min(larguraMao / 3.9, window.innerHeight * 0.17), 44, 80) : limitar(Math.min(larguraMao / 3.7, window.innerHeight * 0.12), 50, 92);
    g.raiz.style.setProperty('--mao-l', maoL + 'px');
  }

  function posicionarSinal() {
    const g = jogo.ui;
    const l = g.lugares[2];
    if (!l || !g.sinal) return;
    const x = parseFloat(l.raiz.style.left), y = parseFloat(l.raiz.style.top);
    const w = l.raiz.offsetWidth || 90, bw = g.sinal.offsetWidth || 110;
    // à direita do parceiro; sem passar da borda da mesa
    const limite = jogo.geo.x0 + jogo.geo.W - 10 - bw;
    g.sinal.style.left = Math.min(limite, x + w / 2 + 6) + 'px';
    g.sinal.style.top = (y - 8) + 'px';
  }

  // ============================================================ desenho
  function atualizarPlacar(pulo) {
    const g = jogo.ui, [a, b] = jogo.placar;
    if (pulo === 0 && g.nos.textContent !== String(a)) { g.ladoNos.classList.remove('pulo'); void g.ladoNos.offsetWidth; g.ladoNos.classList.add('pulo'); }
    if (pulo === 1 && g.eles.textContent !== String(b)) { g.ladoEles.classList.remove('pulo'); void g.ladoEles.offsetWidth; g.ladoEles.classList.add('pulo'); }
    g.nos.textContent = a; g.eles.textContent = b;
  }
  function atualizarVale(v, pendente) {
    const g = jogo.ui;
    g.vale.textContent = pendente ? `${v}→${pendente}` : v;
    g.valeBox.classList.toggle('especial', v > 1 || !!pendente);
  }
  function atualizarRodadas(vista) {
    const g = jogo.ui;
    const bolas = g.rodadas.children;
    for (let i = 0; i < 3; i++) {
      const r = vista && vista.resultados ? vista.resultados[i] : undefined;
      bolas[i].className = r === undefined ? (vista && vista.rodada === i && !jogo.fimMao ? 'atual' : '') : r === 'E' ? 'empate' : r === 0 ? 'nos' : 'eles';
    }
  }
  function marcarVez(j) {
    jogo.ui.lugares.forEach((l, k) => l.raiz.classList.toggle('vez', k === j));
  }
  function marcarDador(j) {
    jogo.ui.lugares.forEach((l, k) => l.raiz.classList.toggle('dador', k === j));
  }
  function balao(j, texto, classe, ms) {
    const b = jogo.ui.lugares[j].balao;
    b.textContent = texto;
    b.className = 'balao on ' + (classe || '');
    clearTimeout(b._t);
    b._t = setTimeout(() => b.classList.remove('on'), ms || 1800 * Math.max(0.6, fv()));
  }
  function costas(j, k) {
    const c = jogo.ui.lugares[j].costas;
    c.innerHTML = '';
    for (let i = 0; i < k; i++) c.appendChild(P.UI.carta(null, { fechada: true }));
  }
  function aviso(html, ms) {
    const g = jogo.ui;
    if (g.avisoEl) g.avisoEl.remove();
    g.avisoEl = el('div', { class: 'tr-aviso-mesa', html });
    g.palco.appendChild(g.avisoEl);
    const este = g.avisoEl;
    if (ms) setTimeout(() => { if (este.parentNode) este.remove(); }, ms);
  }
  function limparAviso() { if (jogo && jogo.ui.avisoEl) { jogo.ui.avisoEl.remove(); jogo.ui.avisoEl = null; } }
  function splash(texto, equipe) {
    const s = jogo.ui.splash;
    s.textContent = texto;
    s.className = 'tr-splash ' + (equipe === 0 ? 'equipe-nos' : 'equipe-eles');
    s.style.setProperty('--t-splash', Math.round(1000 * Math.max(0.5, fv())) + 'ms');
    void s.offsetWidth;
    s.classList.add('on');
  }

  /** A sua mão (e a do parceiro na mão de 11). */
  function renderMao() {
    const g = jogo.ui, v = jogo.motor.vistaPara(0);
    g.mao.innerHTML = '';
    if (!v.cartas) return;
    const sugerida = jogo.conselho && jogo.conselho.tipo === 'vez' && jogo.opcoes.coach === 'sempre' ? jogo.conselho.carta : null;
    v.cartas.forEach((c, i) => {
      const cega = c === null;
      const div = P.UI.carta(cega ? null : c, { fechada: cega });
      const manilha = !cega && R.ehManilha(c, v.vira);
      const nome = el('span', { class: 'nome-carta' + (manilha ? ' manilha' : ''), text: cega ? '?' : manilha ? R.nome(c, v.vira) : '' });
      const b = el('button', { class: 'tr-carta-mao' + (c !== null && c === sugerida ? ' sugerida' : ''), 'data-carta': cega ? '' : c, 'data-indice': i, title: cega ? 'Carta escondida (mão de ferro)' : R.nome(c, v.vira) }, div, nome);
      b.addEventListener('click', () => jogarCarta(cega ? { indice: i } : { carta: c }));
      g.mao.appendChild(b);
    });
    if (v.cartasParceiro && jogo.mostrarParceiro) {
      g.mao.appendChild(el('span', { class: 'sep-parceiro', text: 'parceiro' }));
      v.cartasParceiro.forEach(c => {
        const manilha = R.ehManilha(c, v.vira);
        g.mao.appendChild(el('div', { class: 'tr-carta-mao parceiro' }, P.UI.carta(c), el('span', { class: 'nome-carta' + (manilha ? ' manilha' : ''), text: manilha ? R.nome(c, v.vira) : '' })));
      });
    }
    g.mao.classList.toggle('jogavel', !!(jogo.pendente && jogo.pendente.tipo === 'vez'));
    g.mao.classList.toggle('cobrindo', !!jogo.cobrir);
    // com as cartas do parceiro do lado, as suas diminuem para caber tudo na largura
    const comParceiro = !!(v.cartasParceiro && jogo.mostrarParceiro);
    if (comParceiro) {
      const base = parseFloat(getComputedStyle(g.raiz).getPropertyValue('--mao-l')) || 80;
      g.mao.style.setProperty('--mao-l', Math.min(base, (g.mao.clientWidth - 44) / 5.75) + 'px');
    } else g.mao.style.removeProperty('--mao-l');
  }

  function renderVira(vira) {
    const g = jogo.ui;
    g.viraSlot.innerHTML = '';
    if (vira === null || vira === undefined) { g.rotuloVira.innerHTML = ''; return; }
    const d = P.UI.carta(vira, { fechada: true });
    g.viraSlot.appendChild(d);
    setTimeout(() => P.UI.revelar(d, vira), 60);
    g.rotuloVira.innerHTML = `vira<br>manilha<br><b>${R.ROTULO_RANK[R.manilhaDe(vira)]}</b>`;
  }

  function cartaNoMonte(j, carta, coberta) {
    const g = jogo.ui;
    const monte = g.montes[j];
    const d = P.UI.carta(coberta && j !== 0 ? null : carta, { fechada: !!coberta });
    d.dataset.rodada = jogo.rodadaUI;
    d.dataset.j = j;
    // de onde vem: do lugar do jogador
    const l = g.lugares[j].raiz;
    const dx = parseFloat(l.style.left) - parseFloat(monte.style.left), dy = parseFloat(l.style.top) - parseFloat(monte.style.top);
    d.style.setProperty('--de-x', dx + 'px');
    d.style.setProperty('--de-y', dy + 'px');
    d.style.setProperty('--t-entrar', Math.round(300 * Math.max(0.4, fv())) + 'ms');
    d.classList.add('entrando');
    monte.appendChild(d);
    return d;
  }

  // =========================================================== coach (faixa)
  function aplicarModoCoach() {
    const g = jogo.ui, modo = jogo.opcoes.coach;
    g.coach.classList.toggle('oculto-coach', modo === 'desligado');
    g.btnCoach.classList.toggle('oculto', modo === 'desligado');
  }
  function coachTexto(html) { if (jogo) jogo.ui.coachTxt.innerHTML = html; }
  function coachNota(av) {
    const g = jogo.ui;
    g.coachNota.innerHTML = '';
    if (!av) return;
    g.coachNota.appendChild(el('span', { class: 'feedback-nota nota-' + av.nota, text: av.rotulo }));
  }
  /** Mostra o conselho de agora na faixa (conforme o modo). */
  function mostrarConselho() {
    if (!jogo || !jogo.conselho) return;
    const modo = jogo.opcoes.coach;
    jogo.ui.btnDica.classList.toggle('oculto', modo !== 'pedido' || jogo.dicaVista);
    if (modo === 'sempre' || jogo.dicaVista) {
      coachNota(null);
      coachTexto(jogo.conselho.resumo);
      marcarSugestoes();
    } else if (modo === 'pedido') {
      coachTexto('<span class="calc">Quer ajuda? Toque em <b>Dica</b>.</span>');
    }
  }
  function mostrarDica() {
    if (!jogo || !jogo.conselho) return;
    jogo.dicaVista = true;
    mostrarConselho();
    abrirCoach();
  }
  function marcarSugestoes() {
    const g = jogo.ui, c = jogo.conselho;
    const mostrar = jogo.opcoes.coach === 'sempre' || jogo.dicaVista;
    g.acoes.querySelectorAll('.btn-acao').forEach(b => b.classList.remove('sugerido'));
    g.mao.querySelectorAll('.tr-carta-mao').forEach(b => b.classList.remove('sugerida'));
    if (!c || !mostrar) return;
    if (c.tipo === 'vez') {
      if (c.carta !== undefined) { const b = g.mao.querySelector(`.tr-carta-mao[data-carta="${c.carta}"]`); if (b) b.classList.add('sugerida'); }
      if (c.truco === 'pedir') g.btnTruco.classList.add('sugerido');
    } else if (c.tipo === 'resposta' || c.tipo === 'onze') {
      const alvo = { aumentar: g.btnTruco, aceitar: g.btnTerceiro, jogar: g.btnTerceiro, correr: g.btnCobrir }[c.recomendacao];
      if (alvo) alvo.classList.add('sugerido');
    }
  }

  async function abrirCoach() {
    if (!jogo) return;
    const c = jogo.conselho, ultima = jogo.ultimaNota;
    const corpo = el('div', { class: 'tr-coach-modal' });
    if (c && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista || jogo.opcoes.coach === 'pedido')) {
      if (jogo.opcoes.coach === 'pedido') { jogo.dicaVista = true; mostrarConselho(); }
      corpo.appendChild(el('ul', {}, c.linhas.map(l => el('li', { html: l }))));
      if (c.tipo === 'vez' && c.analise && c.analise.cartas.length > 1) {
        const barras = el('div', { class: 'tr-barras-cartas' });
        c.analise.cartas.forEach(x => barras.appendChild(el('div', { class: 'tr-barra-carta' },
          el('span', { html: CO.cartaHtml(x.carta) + (R.ehManilha(x.carta, c.vira) ? ' <small>' + R.nome(x.carta, c.vira) + '</small>' : '') }),
          el('div', { class: 'barra' }, el('i', { style: { width: Math.round(x.p * 100) + '%' } })),
          el('b', { text: CO.pct(x.p) }))));
        corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Chance de ganhar a mão com cada carta' }), barras));
      }
      if (c.tipo === 'resposta') {
        const med = el('div', { class: 'medidor' },
          el('div', { class: 'eq' + (c.p < c.min ? ' abaixo' : ''), style: { width: Math.round(c.p * 100) + '%' } }),
          el('div', { class: 'nec', 'data-rotulo': 'precisa ' + CO.pct(c.min), style: { left: (c.min * 100) + '%' } }),
          el('div', { class: 'txt', text: 'sua chance ' + CO.pct(c.p) }));
        corpo.appendChild(el('div', { class: 'bloco' }, el('h4', { text: 'Sua chance × o mínimo para aceitar' }), med));
      }
      if (c.analise) corpo.appendChild(el('div', { class: 'rodape-calc', text: `Conta feita simulando ${c.analise.amostras} jeitos de as cartas que você não vê estarem distribuídas, com todos jogando bem até o fim da mão.` }));
    } else if (ultima) {
      corpo.appendChild(el('p', { html: `<span class="feedback-nota nota-${ultima.nota}">${ultima.rotulo}</span> ${ultima.texto}` }));
      if (ultima.linhas) corpo.appendChild(el('ul', {}, ultima.linhas.map(l => el('li', { html: l }))));
    } else {
      corpo.appendChild(el('p', { text: 'Na sua vez o coach mostra a chance de ganhar a mão com cada carta, se vale pedir truco e, quando pedirem para você, se vale aceitar ou correr.' }));
    }
    pausar(true);
    try { await P.UI.modal({ titulo: 'Coach', conteudo: corpo }); } finally { pausar(false); }
  }

  /** Nota de uma decisão sua: aparece na faixa e entra no resumo da partida. */
  function registrarNota(conselho, acao) {
    const av = CO.avaliar(conselho, acao);
    if (!av) return;
    av.linhas = conselho.linhas;
    av.mao = jogo.motor.maoNumero();
    jogo.notas.push({ nota: av.nota, texto: av.texto, perda: av.perda || 0, mao: av.mao });
    jogo.ultimaNota = av;
    if (!jogo.opcoes.semSalvar) D.alterarEstat(e => { e.notas[av.nota] = (e.notas[av.nota] || 0) + 1; });
    if (jogo.opcoes.coach !== 'desligado') {
      coachNota(av);
      coachTexto(av.texto);
    }
    if (jogo.opcoes.coach !== 'desligado' && P.Som) (av.nota === 'erro' ? P.Som.erro : av.nota === 'otima' ? P.Som.acerto : () => {})();
  }

  // ================================================================ ações
  function acoesEspera(texto) {
    const g = jogo.ui;
    g.btnTruco.innerHTML = 'Truco!';
    g.btnCobrir.innerHTML = 'Cobrir<small>carta virada</small>';
    g.btnTerceiro.innerHTML = 'Dica';
    [g.btnTruco, g.btnCobrir, g.btnTerceiro].forEach(b => { b.disabled = true; b.classList.remove('sugerido', 'ativo'); });
    g.btnTruco.className = 'btn-acao btn-truco';
    g.btnCobrir.className = 'btn-acao btn-cobrir';
    g.btnTerceiro.className = 'btn-acao btn-tr-dica';
    g.btnTerceiro.onclick = () => mostrarDica();
    g.btnCobrir.onclick = () => alternarCobrir();
    g.btnTruco.onclick = () => acaoTruco();
    g.status.innerHTML = texto || '';
    jogo.cobrir = false;
    g.mao.classList.remove('jogavel', 'cobrindo');
  }

  function prepararVez(vista) {
    const g = jogo.ui;
    acoesEspera(vista.cegas ? '<b>Mão de ferro:</b> toque numa carta (ninguém sabe qual é)' : '<b>Sua vez:</b> toque numa carta para jogar');
    if (vista.podeTrucar) {
      g.btnTruco.disabled = false;
      g.btnTruco.innerHTML = R.NOMES_PEDIDO[vista.nivel + 1] + '!<small>vale ' + R.VALORES[vista.nivel + 1] + '</small>';
    } else if (vista.tipo === 'normal' && vista.nivel < 4) {
      g.btnTruco.innerHTML = R.NOMES_PEDIDO[vista.nivel + 1] + '!<small>só o outro lado</small>';
    } else if (vista.tipo !== 'normal') {
      g.btnTruco.innerHTML = 'Truco<small>' + (vista.tipo === 'onze' ? 'não na mão de 11' : 'não na de ferro') + '</small>';
    }
    g.btnCobrir.disabled = !vista.podeCobrir;
    if (!vista.podeCobrir && !vista.cegas) g.btnCobrir.innerHTML = 'Cobrir<small>a partir da 2ª</small>';
    g.btnTerceiro.disabled = jogo.opcoes.coach !== 'pedido';
    if (jogo.opcoes.coach !== 'pedido') g.btnTerceiro.innerHTML = 'Dica<small>' + (jogo.opcoes.coach === 'sempre' ? 'já na faixa' : 'coach desligado') + '</small>';
    g.mao.classList.add('jogavel');
  }

  function alternarCobrir() {
    if (!jogo || !jogo.pendente || jogo.pendente.tipo !== 'vez') return;
    jogo.cobrir = !jogo.cobrir;
    jogo.ui.btnCobrir.classList.toggle('ativo', jogo.cobrir);
    jogo.ui.mao.classList.toggle('cobrindo', jogo.cobrir);
    jogo.ui.status.innerHTML = jogo.cobrir ? '<b>Cobrir:</b> toque na carta que vai virada para baixo' : '<b>Sua vez:</b> toque numa carta para jogar';
  }

  /** O conselho da decisão em aberto; se você foi mais rápido que a conta, ela é feita agora (para a nota). */
  function conselhoAgora(pend) {
    if (jogo.conselho) return jogo.conselho;
    try {
      const op = Object.assign(opcoesCoach(), { amostras: Math.min(200, jogo.opcoes.amostras || 200) });
      jogo.conselho = pend.tipo === 'vez' ? CO.vez(pend.vista, op) : pend.tipo === 'resposta' ? CO.resposta(pend.vista, pend.nivel, op) : CO.onze(pend.vista, op);
    } catch (e) { console.error(e); }
    return jogo.conselho;
  }

  function jogarCarta(qual) {
    const pend = jogo && jogo.pendente;
    if (!pend || pend.tipo !== 'vez') return;
    const v = pend.vista;
    const acao = Object.assign({ tipo: 'carta', coberta: !!(jogo.cobrir && v.podeCobrir) }, qual);
    if (acao.carta !== undefined && !v.cegas && conselhoAgora(pend)) registrarNota(jogo.conselho, acao);
    resolverPendente(acao);
  }

  function acaoTruco() {
    const pend = jogo && jogo.pendente;
    if (!pend) return;
    if (pend.tipo === 'vez') {
      if (!pend.vista.podeTrucar) return;
      if (conselhoAgora(pend)) registrarNota(jogo.conselho, { tipo: 'truco' });
      resolverPendente({ tipo: 'truco' });
    } else if (pend.tipo === 'resposta' && pend.nivel < 4) {
      if (conselhoAgora(pend)) registrarNota(jogo.conselho, 'aumentar');
      resolverPendente('aumentar');
    }
  }

  function resolverPendente(valor) {
    const pend = jogo.pendente;
    jogo.pendente = null;
    jogo.conselho = null;
    jogo.dicaVista = false;
    jogo.ui.btnDica.classList.add('oculto');
    marcarSugestoes();
    acoesEspera('');
    pend.resolve(valor);
  }

  /** O coach sabe o estilo de cada bot (aparece na mesa) e usa isso para ler os pedidos de truco. */
  function opcoesCoach() { return { amostras: jogo.opcoes.amostras, perfis: jogo.jogadores.map(x => x.perfil || null) }; }

  /** Calcula o conselho do coach sem travar o desenho da tela. */
  function calcularConselho(fn) {
    const token = jogo.token;
    if (jogo.opcoes.coach !== 'desligado') { coachNota(null); coachTexto('<span class="calc">Calculando…</span>'); }
    return new Promise(res => setTimeout(() => {
      if (!jogo || jogo.token !== token) return res(null);
      let c = null;
      try { c = fn(); } catch (e) { console.error(e); }
      res(c);
    }, 30));
  }

  // ============================================================ agentes
  function agenteHumano() {
    return {
      bot: false,
      decidir(vista) {
        return new Promise(resolve => {
          jogo.pendente = { tipo: 'vez', vista, resolve };
          jogo.conselho = null;
          marcarVez(0);
          renderMao();
          prepararVez(vista);
          if (P.Som) P.Som.vez();
          const pend = jogo.pendente;
          calcularConselho(() => CO.vez(vista, opcoesCoach())).then(c => {
            if (!jogo || jogo.pendente !== pend) return;
            jogo.conselho = c;
            renderMao();
            mostrarConselho();
            if (jogo.opcoes.autoHeroi) setTimeout(() => autoJogar(pend), 10);
          });
        });
      },
      responder(vista, nivel) {
        return new Promise(resolve => {
          jogo.pendente = { tipo: 'resposta', vista, nivel, resolve };
          jogo.conselho = null;
          renderMao();
          const g = jogo.ui;
          acoesEspera(`<b>Pediram ${R.NOMES_PEDIDO[nivel].toLowerCase()}!</b> Correr dá ${R.VALORES[nivel - 1]} a eles; aceitar faz a mão valer ${R.VALORES[nivel]}`);
          g.btnCobrir.className = 'btn-acao btn-correr'; g.btnCobrir.innerHTML = 'Correr<small>eles +' + R.VALORES[nivel - 1] + '</small>'; g.btnCobrir.disabled = false;
          g.btnCobrir.onclick = () => responderHumano('correr');
          g.btnTerceiro.className = 'btn-acao btn-aceitar'; g.btnTerceiro.innerHTML = 'Aceitar<small>vale ' + R.VALORES[nivel] + '</small>'; g.btnTerceiro.disabled = false;
          g.btnTerceiro.onclick = () => responderHumano('aceitar');
          if (nivel < 4) { g.btnTruco.disabled = false; g.btnTruco.innerHTML = R.NOMES_PEDIDO[nivel + 1] + '!<small>vale ' + R.VALORES[nivel + 1] + '</small>'; }
          else g.btnTruco.innerHTML = 'Doze<small>é o máximo</small>';
          if (P.Som) P.Som.vez();
          const pend = jogo.pendente;
          calcularConselho(() => CO.resposta(vista, nivel, opcoesCoach())).then(c => {
            if (!jogo || jogo.pendente !== pend) return;
            jogo.conselho = c;
            mostrarConselho();
            if (jogo.opcoes.autoHeroi) setTimeout(() => autoJogar(pend), 10);
          });
        });
      },
      onze(vista) {
        return new Promise(resolve => {
          jogo.pendente = { tipo: 'onze', vista, resolve };
          jogo.conselho = null;
          jogo.mostrarParceiro = true;
          renderMao();
          const g = jogo.ui;
          acoesEspera(`<b>Mão de 11:</b> jogar valendo 3 ou correr (eles +1)?`);
          g.btnCobrir.className = 'btn-acao btn-correr'; g.btnCobrir.innerHTML = 'Correr<small>eles +1</small>'; g.btnCobrir.disabled = false;
          g.btnCobrir.onclick = () => responderHumano('correr');
          g.btnTerceiro.className = 'btn-acao btn-aceitar'; g.btnTerceiro.innerHTML = 'Jogar<small>vale 3</small>'; g.btnTerceiro.disabled = false;
          g.btnTerceiro.onclick = () => responderHumano('jogar');
          g.btnTruco.innerHTML = 'Truco<small>não na mão de 11</small>';
          aviso(vista.cartasParceiro ? '<b>Mão de 11!</b> Vocês veem as cartas do parceiro (embaixo, à direita) e decidem: jogar valendo 3 ou correr.' : '<b>Mão de 11!</b> Veja suas cartas e decida: jogar valendo 3 ou correr.');
          const pend = jogo.pendente;
          calcularConselho(() => CO.onze(vista, opcoesCoach())).then(c => {
            if (!jogo || jogo.pendente !== pend) return;
            jogo.conselho = c;
            mostrarConselho();
            if (jogo.opcoes.autoHeroi) setTimeout(() => autoJogar(pend), 10);
          });
        });
      }
    };
  }

  function responderHumano(r) {
    const pend = jogo && jogo.pendente;
    if (!pend || (pend.tipo !== 'resposta' && pend.tipo !== 'onze')) return;
    if (conselhoAgora(pend)) registrarNota(jogo.conselho, r);
    if (pend.tipo === 'onze') { jogo.mostrarParceiro = false; limparAviso(); }
    resolverPendente(r);
    renderMao();
  }

  /** Testes automáticos (?truco=demo&auto=1): você joga sozinho seguindo o coach. */
  function autoJogar(pend) {
    if (!jogo || jogo.pendente !== pend) return;
    const c = jogo.conselho;
    if (pend.tipo === 'vez') {
      if (pend.vista.cegas) return jogarCarta({ indice: 0 });
      if (c && c.truco === 'pedir' && pend.vista.podeTrucar) return acaoTruco();
      return jogarCarta({ carta: c ? c.carta : pend.vista.cartas[0] });
    }
    if (pend.tipo === 'resposta') return c && c.recomendacao === 'aumentar' ? acaoTruco() : responderHumano(c ? c.recomendacao : 'aceitar');
    if (pend.tipo === 'onze') return responderHumano(c ? c.recomendacao : 'jogar');
  }

  function agenteBot(j, perfil) {
    const b = IA.criarBot(perfil, jogo.jogadores.map(x => x.perfil || null));
    const pensar = base => esperar(base * fv() * (0.75 + P.RNG.real() * 0.5));
    const token = jogo.token;
    const vivo = () => jogo && jogo.token === token;
    return {
      bot: true, perfil,
      async decidir(v) { await pensar(650); if (!vivo()) return { tipo: 'carta', indice: 0 }; return b.decidir(v); },
      async responder(v, nivel) { await pensar(900); if (!vivo()) return 'correr'; return b.responder(v, nivel); },
      async onze(v) { await pensar(1000); if (!vivo()) return 'correr'; return b.onze(v); },
      observar: b.observar
    };
  }

  // ============================================================== eventos
  async function aoEvento(ev) {
    if (!jogo) return;
    const token = jogo.token;
    jogo.agentes.forEach((a, j) => { if (a.observar) a.observar(ev, j % 2); });
    const g = jogo.ui;
    const nome = j => (j === 0 ? 'Você' : jogo.jogadores[j].nome);
    switch (ev.tipo) {
      case 'inicioPartida':
        jogo.placar = ev.placar.slice();
        atualizarPlacar();
        break;
      case 'inicioMao': {
        jogo.fimMao = false;
        jogo.rodadaUI = 0;
        jogo.placar = ev.placar.slice();
        jogo.mostrarParceiro = false;
        atualizarPlacar();
        g.montes.forEach(m => { m.innerHTML = ''; });
        if (g.sinal) { g.sinal.remove(); g.sinal = null; }
        limparAviso();
        atualizarVale(ev.tipoMao === 'onze' ? 3 : 1);
        g.tipoMao.classList.toggle('oculto', ev.tipoMao === 'normal');
        g.tipoMao.textContent = ev.tipoMao === 'onze' ? 'MÃO DE 11' : ev.tipoMao === 'ferro' ? 'MÃO DE FERRO' : '';
        g.valeRot.textContent = ev.tipoMao === 'onze' ? 'mão 11' : ev.tipoMao === 'ferro' ? 'ferro' : 'vale';
        marcarDador(ev.dador);
        marcarVez(-1);
        const v0 = jogo.motor.vistaPara(0);
        atualizarRodadas(v0);
        renderVira(null);
        g.mao.innerHTML = '';
        acoesEspera(`Mão ${ev.maoNumero} · quem dá: <b>${esc(nome(ev.dador))}</b>`);
        // distribuição: cartas viradas para os bots, as suas aparecem uma a uma
        for (let j = 1; j < jogo.n; j++) costas(j, 0);
        for (let volta = 1; volta <= 3; volta++) {
          for (let j = 1; j < jogo.n; j++) costas(j, volta);
          if (P.Som) P.Som.carta();
          await esperar(110 * fv());
          if (!jogo || jogo.token !== token) return;
        }
        renderMao();
        renderVira(ev.vira);
        await esperar(350 * fv());
        if (!jogo || jogo.token !== token) return;
        // sinal do parceiro (dupla)
        if (jogo.n === 4 && ev.tipoMao === 'normal' && v0.sinalParceiro !== undefined) {
          const s = CO.sinalDaCarta(v0.sinalParceiro, ev.vira);
          g.sinal = el('div', { class: 'tr-sinal', title: 'Sinal do seu parceiro' }, el('i', { text: s.rosto }), el('span', { text: s.chave === 'nada' ? 'nada forte' : s.significa }));
          g.palco.appendChild(g.sinal);
          posicionarSinal();
        }
        if (ev.tipoMao === 'ferro') aviso('<b>Mão de ferro!</b> 11 a 11: ninguém vê as cartas. Quem ganhar a mão ganha a partida.', 3500);
        else if (ev.tipoMao === 'onze' && ev.equipeOnze === 1) aviso('<b>Mão de 11 deles:</b> eles veem as cartas e decidem se jogam (vale 3) ou correm.', 2500);
        break;
      }
      case 'onze': {
        limparAviso();
        const nosso = ev.equipe === 0;
        if (ev.resposta === 'correr') { balao(ev.j, 'Corro!', 'correu'); aviso(nosso ? 'Vocês correram da mão de 11: <b>eles +1</b>.' : 'Eles correram da mão de 11: <b>vocês +1</b>.', 1800); if (P.Som) P.Som.fold(); }
        else { balao(ev.j, 'Vamos jogar!', 'aceitou'); aviso(nosso ? 'Vocês jogam a mão de 11 (vale 3).' : 'Eles jogam a mão de 11 (vale 3).', 1500); }
        await esperar(900 * fv());
        break;
      }
      case 'vez':
        marcarVez(ev.j);
        if (ev.j !== 0) jogo.ui.status.innerHTML = `Vez de <b>${esc(nome(ev.j))}</b>…`;
        break;
      case 'pedido': {
        const txt = R.NOMES_PEDIDO[ev.nivel].toUpperCase() + '!';
        balao(ev.j, txt, 'forte', 2200 * Math.max(0.6, fv()));
        splash(txt, ev.equipe);
        atualizarVale(ev.nivel === 1 ? jogo.motor.vistaPara(0).valor : R.VALORES[ev.nivel - 1], ev.valor);
        if (P.Som) P.Som.alerta();
        await esperar(900 * fv());
        break;
      }
      case 'resposta': {
        if (ev.resposta === 'correr') { balao(ev.j, 'Corro!', 'correu'); if (P.Som) P.Som.fold(); }
        else if (ev.resposta === 'aceitar') { balao(ev.j, R.NOMES_PEDIDO[ev.nivel] === 'Truco' ? 'Aceito!' : 'Desce!', 'aceitou'); atualizarVale(R.VALORES[ev.nivel]); if (P.Som) P.Som.check(); }
        else { atualizarVale(R.VALORES[ev.nivel]); }
        await esperar(600 * fv());
        break;
      }
      case 'jogada': {
        cartaNoMonte(ev.j, ev.carta, ev.coberta);
        if (ev.j !== 0) costas(ev.j, jogo.motor.vistaPara(0).nCartas[ev.j]);
        else renderMao();
        if (ev.coberta && ev.j !== 0) balao(ev.j, 'Coberta', '', 1200);
        if (P.Som) P.Som.carta();
        await esperar(330 * fv());
        break;
      }
      case 'fimRodada': {
        marcarVez(-1);
        const cartas = g.montes.map(m => m.lastElementChild).filter(Boolean);
        if (ev.vencedor === 'E') {
          cartas.forEach(c => { if (!c.classList.contains('fechada') && R.valor(+c.dataset.carta, jogo.motor.vistaPara(0).vira) === ev.maior) c.classList.add('empatou'); });
          jogo.ui.status.innerHTML = `<b>${ev.rodada + 1}ª rodada empatou</b>`;
        } else {
          const vencedora = g.montes[ev.quem].lastElementChild;
          if (vencedora) vencedora.classList.add('ganhou');
          jogo.ui.status.innerHTML = `<b>${esc(nome(ev.quem))}</b> ganhou a ${ev.rodada + 1}ª rodada`;
        }
        atualizarRodadas(jogo.motor.vistaPara(0));
        await esperar((ev.fimMao ? 700 : 1000) * fv());
        if (!jogo || jogo.token !== token) return;
        g.montes.forEach(m => Array.from(m.children).forEach(c => c.classList.add('antiga')));
        jogo.rodadaUI++;
        break;
      }
      case 'fimMao':
        jogo.fimMao = true;
        jogo.placar = ev.placar.slice();
        await fimDeMao(ev, token);
        break;
      default: break;
    }
  }

  async function fimDeMao(ev, token) {
    const g = jogo.ui;
    marcarVez(-1);
    acoesEspera('');
    atualizarRodadas(jogo.motor.vistaPara(0));
    atualizarPlacar(ev.vencedor === null ? -1 : ev.vencedor);
    atualizarVale(ev.vencedor === null ? R.VALORES[ev.nivel] : ev.pontos);
    if (g.sinal) { g.sinal.remove(); g.sinal = null; }
    if (!jogo.opcoes.semSalvar) D.alterarEstat(e => { e.maos++; });
    const n = jogo.n;
    const titulo = ev.vencedor === null ? 'Ninguém marca: as três rodadas empataram'
      : ev.vencedor === 0 ? (n === 4 ? 'Vocês' : 'Você') + ` ganh${n === 4 ? 'aram' : 'ou'} a mão: +${ev.pontos}`
        : `Eles ganharam a mão: +${ev.pontos}`;
    const motivo = ev.motivo === 'correu' ? (ev.vencedor === 0 ? 'Eles correram.' : (n === 4 ? 'Vocês correram.' : 'Você correu.'))
      : ev.motivo === 'onzeCorreu' ? 'Correram da mão de 11.'
        : ev.nivel > 0 ? `Valendo ${R.VALORES[ev.nivel]} (${R.NOMES_PEDIDO[ev.nivel].toLowerCase()} aceito).` : ev.tipoMao === 'onze' ? 'Mão de 11, valendo 3.' : '';
    const fimPartida = ev.placar[0] >= R.PONTOS_PARTIDA || ev.placar[1] >= R.PONTOS_PARTIDA;
    if (ev.vencedor === 0 && P.Som) P.Som.ficha();
    const caixa = el('div', { class: 'tr-fim' },
      el('h3', { class: ev.vencedor === 0 ? 'nos' : ev.vencedor === 1 ? 'eles' : '', text: titulo }),
      motivo ? el('div', { class: 'motivo', text: motivo }) : null);
    const maos = el('div', { class: 'maos' });
    for (let k = 0; k < n; k++) {
      const j = k;
      const cs = el('div', { class: 'cs' });
      ev.iniciais[j].forEach(c => { const d = P.UI.carta(c); if (R.ehManilha(c, ev.vira)) d.classList.add('manilha'); cs.appendChild(d); });
      maos.appendChild(el('div', { class: 'mao-linha ' + (j % 2 === 0 ? 'nos' : 'eles') },
        el('span', { class: 'quem', html: (j === 0 ? 'Você' : esc(jogo.jogadores[j].nome)) + (j === 2 ? ' <small>parceiro</small>' : '') }), cs));
    }
    caixa.appendChild(maos);
    const vf = P.UI.carta(ev.vira);
    caixa.appendChild(el('div', { class: 'vira-fim' }, el('span', { text: 'vira' }), vf, el('span', { html: `manilha: <b>${R.ROTULO_RANK[R.manilhaDe(ev.vira)]}</b> (contorno dourado)` })));
    const barra = el('i');
    const botao = el('button', { class: 'btn btn-ouro', text: fimPartida ? 'Ver o resultado' : 'Próxima mão' });
    caixa.appendChild(el('div', { class: 'proxima' }, el('div', { class: 'progresso' }, barra), botao));
    g.palco.appendChild(caixa);
    // espera o toque (ou alguns segundos; tocar na caixa para a contagem)
    const total = (jogo.opcoes.autoHeroi ? 400 : 6000) * Math.max(0.5, fv());
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
  /**
   * Começa (ou retoma) uma partida. opcoes: { n, retomar (partida salva),
   * coach, autoHeroi, velocidade, amostras, aviso }.
   */
  async function iniciar(opcoes) {
    encerrar();
    const cfgT = D.config();
    let salva = opcoes.retomar || null;
    const n = salva ? salva.cfg.n : (opcoes.n === 2 ? 2 : 4);
    let jogadores;
    if (salva) jogadores = salva.cfg.jogadores;
    else {
      const nomes = P.Baralho.embaralhar(IA.NOMES.slice());
      jogadores = [{ nome: P.Config.get('nome') || 'Você', avatar: null }];
      for (let j = 1; j < n; j++) jogadores.push({ nome: nomes[j], perfil: P.RNG.escolher(IA.LISTA_PERFIS), avatar: P.Bots.sortearAvatar() });
    }
    jogo = {
      n, jogadores, token: ++contador, notas: salva ? (salva.notas || []) : [], placar: [0, 0],
      opcoes: Object.assign({ coach: cfgT.coach, amostras: 400 }, opcoes),
      pendente: null, conselho: null
    };
    jogo.agentes = [agenteHumano()];
    for (let j = 1; j < n; j++) jogo.agentes.push(agenteBot(j, jogadores[j].perfil));

    // na tela: a mesa ocupa tudo (sem o menu de baixo)
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    const estado = salva ? salva.estado : { placar: [0, 0], dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 };
    const token = jogo.token;
    const semSalvar = !!opcoes.semSalvar;
    jogo.motor = T.Motor.criar(Object.assign({ n }, estado), jogo.agentes, {
      evento: ev => aoEvento(ev),
      salvar: est => {
        if (semSalvar || !jogo || jogo.token !== token) return;
        D.salvar({ cfg: { n, jogadores }, estado: est, notas: jogo.notas, emJogo: true });
      }
    });
    if (opcoes.aviso && salva) P.UI.aviso(`<b>Partida de truco retomada</b> (${salva.estado.placar[0]} × ${salva.estado.placar[1]}). A mão que estava em andamento foi anulada.`, 'aviso-ouro');
    let r = null;
    try {
      r = await jogo.motor.rodar();
    } catch (e) {
      console.error(e);
      (window.__errosGlobais = window.__errosGlobais || []).push('Truco: ' + (e.stack || e.message));
      document.documentElement.setAttribute('data-erros', String(window.__errosGlobais.length));
      document.documentElement.setAttribute('data-ultimo-erro', String(e.stack || e.message).slice(0, 400));
      P.UI.aviso('Erro no truco: ' + esc(e.message), 'erro');
    }
    if (!jogo || jogo.token !== token || !r) return;
    await fimDePartida(r);
  }

  async function fimDePartida(r) {
    const venceu = r.vencedor === 0;
    if (!jogo.opcoes.semSalvar) {
      D.descartar();
      D.alterarEstat(e => { e.partidas++; if (venceu) e.vitorias++; });
    }
    document.documentElement.setAttribute('data-truco-fim', venceu ? 'vitoria' : 'derrota');
    if (venceu && P.Som) P.Som.vitoria();
    const notas = jogo.notas;
    const cont = { otima: 0, boa: 0, imprecisa: 0, erro: 0, blefe: 0 };
    notas.forEach(x => { cont[x.nota] = (cont[x.nota] || 0) + 1; });
    const corpo = el('div', { class: 'tr-resultado' },
      el('div', { class: 'grande ' + (venceu ? 'nos' : 'eles'), text: (venceu ? (jogo.n === 4 ? 'Vocês venceram ' : 'Você venceu ') : (jogo.n === 4 ? 'Vocês perderam ' : 'Você perdeu ')) + `${r.placar[0]} a ${r.placar[1]}` }),
      el('div', { style: { textAlign: 'center', color: 'var(--texto-2)', fontSize: '13px' }, text: `${r.maos} mãos jogadas · ${notas.length} decisões avaliadas pelo coach` }));
    const nt = el('div', { class: 'notas' });
    [['otima', 'Ótimas'], ['boa', 'Boas'], ['blefe', 'Blefes'], ['imprecisa', 'Imprecisas'], ['erro', 'Erros']].forEach(([k, rot]) => nt.appendChild(el('div', { class: 'nota-' + k }, el('b', { text: cont[k] }), el('span', { text: rot }))));
    corpo.appendChild(nt);
    const piores = notas.filter(x => x.nota === 'erro' || x.nota === 'imprecisa').sort((a, b) => b.perda - a.perda).slice(0, 3);
    if (piores.length) {
      corpo.appendChild(el('h3', { text: 'Para revisar' }));
      corpo.appendChild(el('div', { class: 'piores' }, piores.map(x => el('div', { html: `<span class="feedback-nota nota-${x.nota}">${CO.ROTULOS[x.nota]}</span> Mão ${x.mao}: ${x.texto}` }))));
    } else if (notas.length) corpo.appendChild(el('p', { style: { textAlign: 'center', color: 'var(--ok)' }, text: 'Nenhum erro nas decisões avaliadas. Muito bem!' }));
    if (jogo.opcoes.autoHeroi) { encerrar(); P.App.irPara('truco'); return; }
    const v = await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, fechavel: false, botoes: [{ texto: 'Voltar', valor: 'voltar' }, { texto: 'Jogar de novo', classe: 'btn-ouro', valor: 'denovo' }] });
    const n = jogo.n;
    encerrar();
    if (v === 'denovo') iniciar({ n });
    else P.App.irPara('truco');
  }

  /** Para a partida e tira a mesa da tela (a partida salva continua salva). */
  function encerrar() {
    if (!jogo) return;
    const j = jogo;
    jogo = null;
    j.token = -1;
    if (j.motor) j.motor.parar();
    if (j.observador) j.observador.disconnect();
    if (j.pendente) {
      const p = j.pendente;
      p.resolve(p.tipo === 'vez' ? { tipo: 'carta', indice: 0 } : 'correr');
    }
    // a partida saiu da tela: na próxima abertura do app não volta sozinha
    const s = D.salva();
    if (s && s.emJogo) { s.emJogo = false; D.salvar(s); }
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    $('#tela-truco').classList.remove('tela-mesa');
    pausas = 0;
  }

  async function sair() {
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Truco, do começo da mão atual.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('truco');
  }

  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar'], ['quiz', 'Treino de cartas']]
      .concat(modos.filter(m => m[0] !== jogo.opcoes.coach))
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
    if (escolha === 'regras') {
      pausar(true);
      try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UITruco.regrasNo ? P.UITruco.regrasNo() : '' }); } finally { pausar(false); }
      return;
    }
    if (escolha === 'quiz') { pausar(true); try { await P.UITruco.abrirQuiz(); } finally { pausar(false); } return; }
    const modo = modos.find(m => m[0] === escolha);
    if (modo) {
      jogo.opcoes.coach = modo[0];
      const c = D.config(); c.coach = modo[0]; D.salvarConfig(c);
      aplicarModoCoach();
      if (jogo.pendente) { if (jogo.pendente.tipo === 'vez') prepararVez(jogo.pendente.vista); mostrarConselho(); }
      layout();
    }
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) jogo.ui.raiz.dataset.tema = v; });

  P.UITrucoMesa = { iniciar, encerrar, emJogo: () => !!jogo, pausar, _jogo: () => jogo };
})(window.Poker = window.Poker || {});
