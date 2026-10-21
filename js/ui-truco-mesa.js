/* ==========================================================================
   OUTS · Treino Lab — ui-truco-mesa.js
   A mesa do truco: placar, valor da mão e rodadas na barra de cima; os
   lugares (você embaixo, o parceiro em frente na dupla), as cartas jogadas
   em cada rodada, a vira com a manilha escrita; a sua mão (toque na carta
   para jogar), os botões de truco/cobrir/aceitar/correr e a faixa do coach
   (com a conta completa ao tocar nela). No fim de cada mão aparecem as
   cartas de todo mundo; no fim da partida, o resumo das suas decisões.
   A partida fica salva no começo de cada mão: se o app fechar, ela volta.
   Regras paulista ou paranaense (com a troca de cartas na mão de 11), a
   opção de esconder a manilha (treino) e os jogos do torneio, que no fim
   voltam para a chave (ui-truco-torneio.js).
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, $, esc } = P.UI;
  const T = P.Truco, R = T.Regras, IA = T.IA, CO = T.Coach, D = T.Dados;
  const VELOCIDADES = { lenta: 2, normal: 1.4, rapida: 1, turbo: 0.22 };
  // mesa com amigos: atrasada em relação ao servidor (aba escondida, sua vez já na fila), anda sem animação
  const fv = () => (jogo && jogo.remota && jogo.remota.atrasado() ? 0.05
    : jogo && jogo.opcoes.velocidade !== undefined ? jogo.opcoes.velocidade : VELOCIDADES[P.Config.get('velocidade')] || 1);
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
  // na mesa com amigos o prazo corre no servidor: menus abertos não param a mesa
  function pausar(p) { if (jogo && jogo.remota) return; pausas = Math.max(0, pausas + (p ? 1 : -1)); }

  // ======================================================== montar a mesa
  /**
   * A mesa tem as mesmas peças da mesa do poker: barra de cima, palco escuro
   * com a mesa oval (borda de madeira e feltro), placas dos jogadores em volta,
   * as suas cartas sobre a borda da mesa, a barra de ações embaixo e, no PC,
   * o painel do coach à direita. No celular a barra de cima some (o ☰ do
   * canto abre o menu) e o coach abre por cima, tocando na faixa dele.
   */
  function montar() {
    const raiz = $('#tela-truco');
    raiz.innerHTML = '';
    raiz.classList.add('tela-mesa');
    raiz.dataset.tema = P.Config.get('tema') || 'verde';
    const g = jogo.ui = {};
    const n = jogo.n;
    g.raiz = el('div', { class: 'tr-jogo' + (jogo.remota ? ' remota' : ''), 'data-tema': P.Config.get('tema') || 'verde', 'data-n': n });

    // placar, valor da mão e rodadas: num quadro no canto da mesa (sempre à vista, também no celular)
    g.nos = el('b', { text: '0' }); g.eles = el('b', { text: '0' });
    g.ladoNos = el('span', { class: 'lado nos' }, el('span', { class: 'rot', text: n === 4 ? 'Nós' : 'Você' }), g.nos);
    g.ladoEles = el('span', { class: 'lado eles' }, g.eles, el('span', { class: 'rot', text: 'Eles' }));
    g.vale = el('b', { text: '1' });
    g.valeRot = el('small', { text: 'vale' });
    g.valeBox = el('div', { class: 'tr-vale', title: 'Quanto vale a mão' }, g.valeRot, g.vale);
    g.rodadas = el('div', { class: 'tr-rodadas', title: 'Rodadas desta mão' }, el('i'), el('i'), el('i'));
    g.tipoMao = el('span', { class: 'tipo-mao oculto' });
    g.hud = el('div', { class: 'tr-hud' },
      el('div', { class: 'tr-placar' }, g.ladoNos, el('span', { class: 'x', text: '×' }), g.ladoEles),
      el('div', { class: 'tr-hud-linha' }, g.valeBox, g.rodadas, g.tipoMao));

    // barra de cima (como a do poker)
    const detalhe = (jogo.torneio && jogo.torneio.curto ? jogo.torneio.curto + ' · ' : '') + jogo.vr.nome + ' · ' + (n === 4 ? 'dupla (4 jogadores)' : '1 contra 1');
    g.chipInfo = el('span', { class: 'detalhe tr-chip-info', text: detalhe });
    g.btnCoach = el('button', { class: 'btn', text: 'Coach', title: 'Mostrar/recolher o coach', onclick: () => alternarPainel() });
    g.barra = el('div', { class: 'mesa-barra tr-barra' },
      el('span', { class: 'rotulo', text: 'Truco' }), g.chipInfo, el('span', { class: 'espaco' }),
      el('button', { class: 'btn so-largo', text: 'Como jogar', onclick: () => abrirRegras() }),
      el('button', { class: 'btn so-largo', text: 'Treino de cartas', onclick: () => abrirQuiz() }),
      g.btnCoach,
      el('button', { class: 'btn btn-icone btn-som so-largo', title: 'Som ligado/desligado', html: $('#btn-som') ? $('#btn-som').innerHTML : '', onclick: () => { const b = $('#btn-som'); if (b) b.click(); } }),
      el('button', { class: 'btn', title: 'Menu', html: '&#9776;<span class="rot-menu"> Menu</span>', onclick: abrirMenu }),
      el('button', { class: 'btn so-largo', text: 'Sair para o lobby', onclick: sair }));

    // palco com a mesa oval
    g.oval = el('div', { class: 'mesa-oval' },
      el('div', { class: 'borda' }),
      el('div', { class: 'feltro' }, el('div', { class: 'mesa-logo', html: '<b>TRUCO</b><span>Treino Lab</span>' })));
    g.palco = el('div', { class: 'mesa-palco tr-palco' }, g.oval, g.hud,
      el('button', { class: 'btn-barra so-celular tr-btn-menu', title: 'Menu', html: '&#9776;', onclick: abrirMenu }));
    g.feltro = g.oval;
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
      linha2.appendChild(el('span', { class: 'equipe', text: j === 0 ? (n === 4 ? 'nós' : 'você') : j === 2 ? 'parceiro' : 'eles' }));
      lugar.raiz = el('div', { class: `tr-lugar ${eq}` + (j === 0 ? ' heroi' : ''), 'data-pos': pos },
        j === 0 ? null : lugar.costas,
        el('div', { class: 'corpo' },
          el('div', { class: 'avatar', html: P.UI.avatarSVG(info.avatar, j === 0) }),
          el('div', { class: 'info' }, el('span', { class: 'nome', text: info.nome }), linha2)),
        lugar.balao);
      g.lugares.push(lugar);
      g.palco.appendChild(lugar.raiz);
      const monte = el('div', { class: 'tr-monte', 'data-pos': pos });
      g.montes.push(monte);
      g.palco.appendChild(monte);
    }
    g.dealer = el('div', { class: 'botao-dealer tr-dealer oculto', text: 'D' });
    g.viraSlot = el('div', { class: 'vira-slot' });
    g.rotuloVira = el('div', { class: 'rotulo-vira' });
    g.centro = el('div', { class: 'tr-centro' }, g.viraSlot, g.rotuloVira);
    g.splash = el('div', { class: 'tr-splash' });
    // a sua mão fica sobre a borda da mesa, em cima da sua placa (como as cartas no poker)
    g.mao = el('div', { class: 'tr-mao' });
    g.palco.append(g.dealer, g.centro, g.mao, g.splash);

    // barra de ações (como a do poker): à esquerda o que está acontecendo e o coach; à direita os botões
    g.coachTxt = el('div', { class: 'txt', html: '<span class="calc">O coach comenta cada decisão sua.</span>' });
    g.coachNota = el('span');
    g.btnDica = el('button', { class: 'btn oculto', text: 'Dica', onclick: e => { e.stopPropagation(); mostrarDica(); } });
    g.coach = el('div', { class: 'tr-coach', title: 'Ver a conta do coach', onclick: () => abrirCoach() }, el('span', { class: 'ic', text: '💡' }), g.coachNota, g.coachTxt, g.btnDica);
    // os três botões mudam de papel (truco/cobrir/dica na sua vez; aumentar/correr/aceitar quando pedem para você):
    // o clique fica só no .onclick, trocado em acoesEspera e nas respostas
    g.btnTruco = el('button', { class: 'btn-acao btn-truco', html: 'Truco!' });
    g.btnCobrir = el('button', { class: 'btn-acao btn-cobrir', html: 'Cobrir<small>carta virada</small>' });
    g.btnTerceiro = el('button', { class: 'btn-acao btn-tr-dica', html: 'Dica' });
    g.status = el('div', { class: 'tr-status' });
    g.relogio = el('span', { class: 'relogio-vez oculto' });   // prazo da vez (mesa com amigos)
    g.acoes = el('div', { class: 'barra-acoes tr-acoes' },
      el('div', { class: 'acoes-esquerda' }, g.relogio, g.status, g.coach),
      el('div', { class: 'acoes-botoes' }, g.btnTruco, g.btnCobrir, g.btnTerceiro));

    // painel do coach (PC), igual ao do poker
    g.painelCorpo = el('div', { class: 'coach-corpo' });
    g.painelModos = el('div', { class: 'coach-modos' });
    if (!jogo.remota) [['sempre', 'Sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) =>
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

  async function abrirRegras() {
    if (!jogo) return;
    pausar(true);
    try { await P.UI.modal({ titulo: 'Como jogar', largo: true, conteudo: P.UITruco.regrasNo ? P.UITruco.regrasNo(jogo.vr.id) : '' }); } finally { pausar(false); }
  }
  async function abrirQuiz() { pausar(true); try { await P.UITruco.abrirQuiz(); } finally { pausar(false); } }

  /** O painel do coach só existe no PC; no celular, a faixa do coach abre a conta numa janela. */
  const painelVisivel = () => !!(jogo && jogo.ui && jogo.ui.painel && !jogo.ui.painel.classList.contains('recolhido') && getComputedStyle(jogo.ui.painel).display !== 'none');
  function alternarPainel(abrir) {
    const g = jogo && jogo.ui;
    if (!g) return;
    if (getComputedStyle(g.painel).display === 'none') { abrirCoach(); return; }   // celular
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
    if (jogo.pendente) { if (jogo.pendente.tipo === 'vez') prepararVez(jogo.pendente.vista); mostrarConselho(); }
    atualizarPainel();
  }

  // ============================================================== geometria
  /**
   * Posições na mesa conforme o espaço (em px). De cima para baixo, no meio:
   * o lugar de cima, as cartas jogadas em cruz em volta da vira, as suas
   * cartas e a sua placa. A mesa oval passa pelos lugares, como no poker.
   */
  function layout() {
    if (!jogo || !jogo.ui) return;
    const g = jogo.ui, n = jogo.n;
    const W = g.palco.clientWidth, H = g.palco.clientHeight;
    if (!W || !H) return;
    const compacto = W < 640 || H < 400;
    const vertical = H > W * 1.05;
    g.palco.classList.toggle('compacto', compacto);
    const pad = compacto ? 6 : 12;
    // lugares
    let assentoL, avatarL, seatH, heroL, heroH;
    if (compacto) {
      const base = Math.min(W, H * 1.25);
      assentoL = limitar(base * 0.21, 64, 86);
      avatarL = limitar(assentoL * 0.5, 28, 42);
      seatH = avatarL + 29;
      heroL = limitar(W * 0.36, 110, 150);
      heroH = limitar(avatarL + 8, 38, 50);
    } else {
      avatarL = limitar(H * 0.065, 34, 46);
      assentoL = limitar(W * 0.16, 124, 164);
      seatH = avatarL + 12;
      heroL = assentoL; heroH = seatH;
    }
    const costasL = limitar(avatarL * (compacto ? 0.5 : 0.55), 14, 24);
    const sobraCostas = costasL * 1.4 * 0.62;          // as cartas viradas passam um pouco acima da placa de cima
    // suas cartas
    const larguraUtil = W - 2 * pad;
    let maoL = compacto ? (vertical ? limitar(W * 0.19, 54, 84) : limitar(H * 0.15, 38, 60)) : limitar(Math.min(W * 0.075, H * 0.14), 54, 96);
    const comParceiro = !!(jogo.mostrarParceiro && g.mao.querySelector('.parceiro'));
    if (comParceiro) maoL = Math.min(maoL, (larguraUtil - 40) / 6.6);
    // de cima para baixo
    const yCima = pad + sobraCostas + seatH / 2 + (compacto ? 0 : 4);
    const yHeroi = H - pad - heroH / 2;
    let maoH = maoL * 1.4;
    const maoBase = yHeroi - heroH / 2 + Math.min(10, heroH * 0.2);   // as cartas encostam na sua placa
    // cartas jogadas: espaço entre o lugar de cima e as suas cartas
    let cartaL = compacto ? limitar(Math.min(W * (vertical ? 0.15 : 0.08), H * 0.14), 28, 58) : limitar(Math.min(W * 0.065, H * 0.11), 36, 72);
    const gap = compacto ? 4 : 8;
    for (let volta = 0; volta < 6; volta++) {
      const livre = (maoBase - maoH) - (yCima + seatH / 2) - 2 * gap;
      const vira = n === 4 ? cartaL * 0.78 * 1.4 + 16 : 0;          // na dupla a vira fica no meio da cruz
      const precisa = 2 * cartaL * 1.4 + vira + 5 * gap;
      if (precisa <= livre + 0.5) break;
      if (cartaL > 26) cartaL = Math.max(26, cartaL * Math.max(0.75, livre / precisa));
      else { maoL = Math.max(34, maoL * 0.9); maoH = maoL * 1.4; }
    }
    const cartaH = cartaL * 1.4;
    const viraL = cartaL * (n === 4 ? 0.78 : 0.82);
    const cx = W / 2;
    const topoLivre = yCima + seatH / 2 + gap, baseLivre = maoBase - maoH - gap;
    const cyMeio = (topoLivre + baseLivre) / 2;
    // mesa oval: passa pelo lugar de cima e pela sua placa; nas laterais, pelos lugares do lado
    const oTopo = yCima - (compacto ? seatH * 0.15 : 0), oBase = yHeroi + (compacto ? 0 : 2);
    const oh = oBase - oTopo;
    let ow = n === 4 ? W - 2 * pad - assentoL * (compacto ? 0.9 : 1) : W - 2 * pad - 24;
    ow = Math.min(ow, oh * 2.15);
    const cyOval = oTopo + oh / 2;
    Object.assign(g.oval.style, { left: (cx - ow / 2) + 'px', top: oTopo + 'px', width: ow + 'px', height: oh + 'px', borderRadius: oh > ow ? (ow / 2) + 'px' : '' });
    g.palco.style.setProperty('--borda-l', limitar(Math.min(ow, oh) * (compacto ? 0.035 : 0.026), 8, 20) + 'px');

    const set = (elem, x, y) => { elem.style.left = x + 'px'; elem.style.top = y + 'px'; };
    const lug = p => g.lugares.find(l => l.pos === p);
    const monte = p => g.montes[g.lugares.findIndex(l => l.pos === p)];
    set(lug('baixo').raiz, cx, yHeroi);
    set(lug('cima').raiz, cx, yCima);
    // a cruz das cartas jogadas, com a vira no meio (dupla) ou ao lado (1 contra 1)
    const larguraMonte = cartaL * (1 + 2 * 0.38);
    const meioV = n === 4 ? (viraL * 1.4 + 16) / 2 + gap : gap / 2;
    const yMonteCima = cyMeio - meioV - cartaH / 2, yMonteBaixo = cyMeio + meioV + cartaH / 2;
    set(monte('cima'), cx, yMonteCima);
    set(monte('baixo'), cx, yMonteBaixo);
    if (n === 4) {
      const xLado = Math.min(ow / 2, W / 2 - pad - assentoL / 2);
      const yLado = compacto && vertical ? cyOval : cyMeio;
      set(lug('esquerda').raiz, cx - xLado, yLado);
      set(lug('direita').raiz, cx + xLado, yLado);
      const dxMonte = Math.max(viraL / 2, 34) + gap * 2;
      set(monte('esquerda'), cx - dxMonte, cyMeio);
      set(monte('direita'), cx + dxMonte, cyMeio);
      set(g.centro, cx, cyMeio);
      g.centro.classList.add('no-meio');
    } else {
      // 1 contra 1: a vira à esquerda do meio
      const xVira = cx - larguraMonte / 2 - gap * 3 - Math.max(viraL, 64) / 2;
      set(g.centro, Math.max(pad + ow * 0.12 + viraL / 2, xVira), cyMeio);
      g.centro.classList.remove('no-meio');
    }
    g.centro.style.setProperty('--vira-l', viraL + 'px');
    // suas cartas, em cima da sua placa
    set(g.mao, cx, maoBase);
    // o nome da mesa no feltro: entre as cartas jogadas e a sua mão, se couber
    const logo = g.oval.querySelector('.mesa-logo');
    const vaoLogo = (maoBase - maoH) - (yMonteBaixo + cartaH / 2);
    logo.style.display = vaoLogo > 34 ? '' : 'none';
    logo.style.top = ((yMonteBaixo + cartaH / 2 + maoBase - maoH) / 2 - oTopo) + 'px';
    // botão de quem dá: ao lado da placa
    jogo.geo = { W, H, x0: 0, cartaL, yMeio: cyMeio, cx, assentoL, heroL, seatH, heroH, avatarL, compacto };
    posicionarDador();
    g.palco.style.setProperty('--carta-l', cartaL + 'px');
    g.palco.style.setProperty('--avatar-l', avatarL + 'px');
    g.palco.style.setProperty('--assento-l', assentoL + 'px');
    g.palco.style.setProperty('--heroi-l', heroL + 'px');
    g.palco.style.setProperty('--costas-l', costasL + 'px');
    g.palco.style.setProperty('--mao-l', maoL + 'px');
    g.raiz.style.setProperty('--mao-l', maoL + 'px');
    if (g.sinal) posicionarSinal();
  }

  /** O "D" de quem dá as cartas, ao lado da placa dele. */
  function posicionarDador() {
    const g = jogo && jogo.ui, geo = jogo && jogo.geo;
    if (!g || !geo) return;
    const j = jogo.dadorAtual;
    if (j === undefined || j === null || !g.lugares[j]) { g.dealer.classList.add('oculto'); return; }
    const l = g.lugares[j].raiz;
    const x = parseFloat(l.style.left), y = parseFloat(l.style.top);
    const larg = j === 0 ? geo.heroL : (geo.compacto ? geo.avatarL : geo.assentoL);
    // à esquerda da placa (à direita do parceiro fica o sinal dele); o lugar da esquerda leva o D do lado de dentro
    const lado = g.lugares[j].pos === 'esquerda' ? 1 : -1;
    g.dealer.style.left = (x + lado * (larg / 2 + 12)) + 'px';
    g.dealer.style.top = (y + (geo.compacto && j !== 0 ? geo.avatarL * 0.1 : 0)) + 'px';
    g.dealer.classList.remove('oculto');
  }

  function posicionarSinal() {
    const g = jogo.ui;
    const l = g.lugares[2];
    if (!l || !g.sinal) return;
    const x = parseFloat(l.raiz.style.left), y = parseFloat(l.raiz.style.top);
    const w = l.raiz.offsetWidth || 90, bw = g.sinal.offsetWidth || 110;
    // à direita do parceiro; sem passar da borda da mesa
    const limite = jogo.geo.W - 10 - bw;
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
    jogo.dadorAtual = j;
    jogo.ui.lugares.forEach((l, k) => l.raiz.classList.toggle('dador', k === j));
    posicionarDador();
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

  /** A sua mão (e a do parceiro na mão de 11; no paranaense, com a troca de cartas). */
  function renderMao() {
    const g = jogo.ui, v = jogo.motor.vistaPara(0);
    g.mao.innerHTML = '';
    if (!v.cartas) return;
    const esconder = !!jogo.opcoes.esconderManilha;
    const troca = jogo.troca && jogo.pendente && jogo.pendente.tipo === 'onze' ? jogo.troca : null;
    const minhas = troca ? troca.eu : v.cartas, dele = troca ? troca.ele : v.cartasParceiro;
    const sugerida = jogo.conselho && jogo.conselho.tipo === 'vez' && jogo.opcoes.coach === 'sempre' ? jogo.conselho.carta : null;
    // coach (dicas sempre): as cartas que ele sugere trocar ficam marcadas
    const sugTroca = troca && jogo.conselho && jogo.conselho.troca && jogo.conselho.troca.mudaram && (jogo.opcoes.coach === 'sempre' || jogo.dicaVista)
      ? jogo.conselho.troca.saem.concat(jogo.conselho.troca.entram) : [];
    const rotulo = c => (esconder ? '' : R.ehManilha(c, v.vira) ? R.nome(c, v.vira) : '');
    const titulo = c => (esconder || !R.ehManilha(c, v.vira) ? P.Cartas.bonito(c) : R.nome(c, v.vira));
    minhas.forEach((c, i) => {
      const cega = c === null;
      const div = P.UI.carta(cega ? null : c, { fechada: cega });
      const nome = el('span', { class: 'nome-carta' + (!cega && rotulo(c) ? ' manilha' : ''), text: cega ? '?' : rotulo(c) });
      const cls = 'tr-carta-mao' + (c !== null && c === sugerida ? ' sugerida' : '') + (troca && jogo.selTroca === c ? ' selecionada' : '') + (sugTroca.indexOf(c) >= 0 ? ' troca-sugerida' : '');
      const b = el('button', { class: cls, 'data-carta': cega ? '' : c, 'data-indice': i, title: cega ? 'Carta escondida (mão de ferro)' : titulo(c) }, div, nome);
      b.addEventListener('click', () => (troca ? tocarTroca(c, 'eu') : jogarCarta(cega ? { indice: i } : { carta: c })));
      g.mao.appendChild(b);
    });
    if (dele && jogo.mostrarParceiro) {
      g.mao.appendChild(el('span', { class: 'sep-parceiro', text: troca ? 'parceiro · toque para trocar' : 'parceiro' }));
      dele.forEach(c => {
        const cls = 'tr-carta-mao parceiro' + (troca ? ' trocavel' : '') + (troca && jogo.selTroca === c ? ' selecionada' : '') + (sugTroca.indexOf(c) >= 0 ? ' troca-sugerida' : '');
        const b = el(troca ? 'button' : 'div', { class: cls, 'data-carta': c, title: titulo(c) }, P.UI.carta(c), el('span', { class: 'nome-carta' + (rotulo(c) ? ' manilha' : ''), text: rotulo(c) }));
        if (troca) b.addEventListener('click', () => tocarTroca(c, 'ele'));
        g.mao.appendChild(b);
      });
    }
    g.mao.classList.toggle('jogavel', !!(jogo.pendente && jogo.pendente.tipo === 'vez'));
    g.mao.classList.toggle('trocando', !!troca);
    g.mao.classList.toggle('cobrindo', !!jogo.cobrir);
    // com as cartas do parceiro do lado, as suas diminuem para caber tudo na largura (o layout refaz as contas)
    const comParceiro = !!(dele && jogo.mostrarParceiro);
    if (comParceiro !== !!g.maoComParceiro) { g.maoComParceiro = comParceiro; layout(); }
  }

  /** Troca na mão de 11 (paranaense): toque numa carta sua e numa do parceiro. */
  function tocarTroca(c, lado) {
    const t = jogo && jogo.troca;
    if (!t) return;
    const sel = jogo.selTroca;
    if (sel === null || sel === undefined) { jogo.selTroca = c; renderMao(); return; }
    if (sel === c) { jogo.selTroca = null; renderMao(); return; }
    const ladoSel = t.eu.indexOf(sel) >= 0 ? 'eu' : 'ele';
    if (ladoSel === lado) { jogo.selTroca = c; renderMao(); return; }      // mesma mão: muda a escolha
    const [minha, dele] = lado === 'eu' ? [c, sel] : [sel, c];
    t.eu[t.eu.indexOf(minha)] = dele;
    t.ele[t.ele.indexOf(dele)] = minha;
    jogo.selTroca = null;
    atualizarBotaoTroca();
    renderMao();
  }
  function trocaMudou() {
    const t = jogo.troca, v = jogo.pendente && jogo.pendente.vista;
    return !!(t && v && t.eu.some(c => v.cartas.indexOf(c) < 0));
  }
  function atualizarBotaoTroca() {
    const g = jogo.ui, mudou = trocaMudou();
    g.btnTruco.disabled = !mudou;
    g.btnTruco.className = 'btn-acao btn-truco';
    g.btnTruco.innerHTML = mudou ? 'Desfazer<small>a troca</small>' : 'Troca<small>toque nas cartas</small>';
    g.btnTruco.onclick = () => {
      const v = jogo.pendente && jogo.pendente.vista;
      if (!v) return;
      jogo.troca = { eu: v.cartas.slice(), ele: v.cartasParceiro.slice() };
      jogo.selTroca = null;
      atualizarBotaoTroca();
      renderMao();
    };
  }

  function renderVira(vira, semAnimar) {
    const g = jogo.ui;
    jogo.viraAtual = vira;
    g.viraSlot.innerHTML = '';
    if (vira === null || vira === undefined) { g.rotuloVira.innerHTML = ''; return; }
    const d = P.UI.carta(vira, { fechada: !semAnimar });
    // o baralho atravessado embaixo da vira
    const baralho = P.UI.carta(null, { fechada: true });
    baralho.classList.add('tr-baralho');
    g.viraSlot.append(baralho, d);
    if (!semAnimar) setTimeout(() => P.UI.revelar(d, vira), 60);
    // treino "esconder a manilha": só a vira; a manilha você descobre
    g.rotuloVira.innerHTML = jogo.opcoes.esconderManilha ? 'manilha <b class="sem-manilha">?</b>' : `manilha <b>${R.ROTULO_RANK[R.manilhaDe(vira)]}</b>`;
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
    g.painelModos.querySelectorAll('button').forEach(b => b.classList.toggle('ativo', b.dataset.modo === modo));
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
    atualizarPainel();
  }
  function mostrarDica() {
    if (!jogo || !jogo.conselho) return;
    jogo.dicaVista = true;
    mostrarConselho();
    if (!painelVisivel()) abrirCoach();
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

  /**
   * A conta do coach (o mesmo conteúdo no painel do PC e na janela do celular).
   * paraVer: no modo "sob pedido", abrir a conta conta como pedir a dica.
   */
  function conteudoCoach(paraVer) {
    const c = jogo.conselho, ultima = jogo.ultimaNota, modo = jogo.opcoes.coach;
    const corpo = el('div', { class: 'tr-coach-modal' });
    if (jogo.remota) {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Sem coach</b>Na mesa com amigos não tem coach: a partida é só entre vocês.' }));
      return corpo;
    }
    if (modo === 'desligado') {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach desligado</b>Sem dicas durante o jogo. As suas decisões continuam sendo avaliadas, e o resumo aparece no fim da partida.' }));
      return corpo;
    }
    if (ultima && (!c || !(modo === 'sempre' || jogo.dicaVista))) {
      corpo.appendChild(el('div', { class: 'bloco tr-ultima' }, el('h4', { text: 'Sua última decisão' }),
        el('p', { html: `<span class="feedback-nota nota-${ultima.nota}">${ultima.rotulo}</span> ${ultima.texto}` })));
    }
    if (c && (modo === 'sempre' || jogo.dicaVista || (modo === 'pedido' && paraVer))) {
      if (modo === 'pedido' && paraVer && !jogo.dicaVista) { jogo.dicaVista = true; mostrarConselho(); }
      corpo.appendChild(el('div', { class: 'bloco recomendacao' }, el('h4', { text: 'Recomendação' }),
        el('ul', {}, c.linhas.map(l => el('li', { html: l })))));
      if (c.tipo === 'vez' && c.analise && c.analise.cartas.length > 1) {
        const barras = el('div', { class: 'tr-barras-cartas' });
        c.analise.cartas.forEach(x => barras.appendChild(el('div', { class: 'tr-barra-carta' },
          el('span', { html: CO.cartaHtml(x.carta) + (!jogo.opcoes.esconderManilha && R.ehManilha(x.carta, c.vira) ? ' <small>' + R.nome(x.carta, c.vira) + '</small>' : '') }),
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
      if (c.analise) corpo.appendChild(el('div', { class: 'rodape-calc', text: `Conta feita simulando ${c.analise.amostras} jeitos de as cartas que você não vê estarem distribuídas, com todos jogando bem até o fim da mão. Os bots também aprendem o seu jeito de jogar.` }));
    } else if (c && modo === 'pedido') {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Coach sob pedido</b>Quer ajuda nesta decisão? Toque em <b>Dica</b>.' }));
    } else if (!ultima) {
      corpo.appendChild(el('div', { class: 'coach-vazio', html: '<b>Aguardando a sua vez</b>Na sua vez o coach mostra a chance de ganhar a mão com cada carta, se vale pedir truco e, quando pedirem para você, se vale aceitar ou correr.' }));
    }
    return corpo;
  }

  /** Painel do PC: redesenha com a conta de agora (se estiver aberto). */
  function atualizarPainel() {
    const g = jogo && jogo.ui;
    if (!g || !g.painelCorpo) return;
    g.btnCoach.classList.toggle('ativo', painelVisivel());
    if (!painelVisivel()) return;
    g.painelCorpo.innerHTML = '';
    g.painelCorpo.appendChild(conteudoCoach(false));
  }

  async function abrirCoach() {
    if (!jogo) return;
    if (painelVisivel()) { conteudoCoach(true); atualizarPainel(); return; }
    if (jogo.ui.painel && getComputedStyle(jogo.ui.painel).display !== 'none') { alternarPainel(true); return; }   // PC com o painel recolhido: abre o painel
    const corpo = conteudoCoach(true);
    pausar(true);
    try { await P.UI.modal({ titulo: 'Coach', conteudo: corpo }); } finally { pausar(false); }
  }

  /** Nota de uma decisão sua: aparece na faixa e entra no resumo da partida. */
  function registrarNota(conselho, acao, extra) {
    const av = CO.avaliar(conselho, acao, extra);
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
    const vr = jogo.vr;
    if (vista.podeTrucar) {
      g.btnTruco.disabled = false;
      g.btnTruco.innerHTML = vr.NOMES_PEDIDO[vista.nivel + 1] + '!<small>vale ' + vr.VALORES[vista.nivel + 1] + '</small>';
    } else if (vista.tipo === 'normal' && vista.nivel < vr.maxNivel) {
      const porPontos = vista.ultimoAumento !== vista.equipe && !R.podePedirNivel(vr, vista.nivel + 1, vista.nos);
      g.btnTruco.innerHTML = vr.NOMES_PEDIDO[vista.nivel + 1] + '!<small>' + (porPontos ? 'só até 8 pontos' : 'só o outro lado') + '</small>';
    } else if (vista.tipo === 'normal') {
      g.btnTruco.innerHTML = vr.NOMES_PEDIDO[vista.nivel] + '<small>é o máximo</small>';
    } else {
      g.btnTruco.innerHTML = 'Truco<small>' + (vista.tipo === 'onze' ? 'não na mão de 11' : 'não na de ferro') + '</small>';
    }
    g.btnCobrir.disabled = !vista.podeCobrir;
    if (!vista.podeCobrir && !vista.cegas) g.btnCobrir.innerHTML = 'Cobrir<small>a partir da 2ª</small>';
    g.btnTerceiro.disabled = jogo.opcoes.coach !== 'pedido';
    if (jogo.opcoes.coach !== 'pedido') g.btnTerceiro.innerHTML = 'Dica<small>' + (jogo.remota ? 'sem coach' : jogo.opcoes.coach === 'sempre' ? 'já na faixa' : 'coach desligado') + '</small>';
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
    if (jogo.remota) return null;     // mesa com amigos: sem coach (nem a nota)
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
    } else if (pend.tipo === 'resposta' && pend.vista.podeAumentar) {
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
    atualizarPainel();
    pend.resolve(valor);
  }

  /** Refaz o conselho da decisão em aberto (ex.: depois de esconder ou mostrar a manilha). */
  function recalcularConselho(pend) {
    const v = pend.vista;
    const fn = pend.tipo === 'vez' ? () => CO.vez(v, opcoesCoach()) : pend.tipo === 'resposta' ? () => CO.resposta(v, pend.nivel, opcoesCoach()) : () => CO.onze(v, opcoesCoach());
    calcularConselho(fn).then(c => { if (!jogo || jogo.pendente !== pend) return; jogo.conselho = c; renderMao(); mostrarConselho(); });
  }

  /**
   * O coach sabe o estilo de cada bot (aparece na mesa) e, como os bots, vai
   * aprendendo na partida como cada um pede e responde (o leitor) — é isso
   * que ele usa para ler os pedidos de truco.
   */
  function opcoesCoach() {
    const perfis = jogo.jogadores.map(x => x.perfil || null);
    const modelos = perfis.map((pf, j) => (j === 0 ? null : jogo.leitor.modelo(j, IA.MODELOS[pf || 'geral'] || IA.MODELOS.geral)));
    return { amostras: jogo.opcoes.amostras, perfis, modelos, esconderManilha: !!jogo.opcoes.esconderManilha };
  }

  /** Calcula o conselho do coach sem travar o desenho da tela. */
  function calcularConselho(fn) {
    if (jogo.remota) return Promise.resolve(null);
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
          const vr = jogo.vr;
          acoesEspera(`<b>Pediram ${vr.NOMES_PEDIDO[nivel].toLowerCase()}!</b> Correr dá ${vr.VALORES[nivel - 1]} a eles; aceitar faz a mão valer ${vr.VALORES[nivel]}`);
          g.btnCobrir.className = 'btn-acao btn-correr'; g.btnCobrir.innerHTML = 'Correr<small>eles +' + vr.VALORES[nivel - 1] + '</small>'; g.btnCobrir.disabled = false;
          g.btnCobrir.onclick = () => responderHumano('correr');
          g.btnTerceiro.className = 'btn-acao btn-aceitar'; g.btnTerceiro.innerHTML = 'Aceitar<small>vale ' + vr.VALORES[nivel] + '</small>'; g.btnTerceiro.disabled = false;
          g.btnTerceiro.onclick = () => responderHumano('aceitar');
          if (vista.podeAumentar) { g.btnTruco.disabled = false; g.btnTruco.innerHTML = vr.NOMES_PEDIDO[nivel + 1] + '!<small>vale ' + vr.VALORES[nivel + 1] + '</small>'; }
          else if (nivel < vr.maxNivel) g.btnTruco.innerHTML = vr.NOMES_PEDIDO[nivel + 1] + '<small>só até 8 pontos</small>';
          else g.btnTruco.innerHTML = vr.NOMES_PEDIDO[nivel] + '<small>é o máximo</small>';
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
          jogo.troca = vista.trocaPermitida ? { eu: vista.cartas.slice(), ele: vista.cartasParceiro.slice() } : null;
          jogo.selTroca = null;
          renderMao();
          const g = jogo.ui;
          acoesEspera(vista.trocaPermitida ? '<b>Mão de 11:</b> troque cartas com o parceiro, se quiser, e jogue (vale 3) ou corra (eles +1)'
            : `<b>Mão de 11:</b> jogar valendo 3 ou correr (eles +1)?`);
          g.btnCobrir.className = 'btn-acao btn-correr'; g.btnCobrir.innerHTML = 'Correr<small>eles +1</small>'; g.btnCobrir.disabled = false;
          g.btnCobrir.onclick = () => responderHumano('correr');
          g.btnTerceiro.className = 'btn-acao btn-aceitar'; g.btnTerceiro.innerHTML = 'Jogar<small>vale 3</small>'; g.btnTerceiro.disabled = false;
          g.btnTerceiro.onclick = () => responderHumano('jogar');
          g.btnTruco.innerHTML = 'Truco<small>não na mão de 11</small>';
          if (vista.trocaPermitida) atualizarBotaoTroca();
          aviso(vista.trocaPermitida ? '<b>Mão de 11!</b> Vocês veem as cartas do parceiro e, no paranaense, podem trocar: toque numa carta sua e depois numa dele. Depois, jogue (vale 3) ou corra.'
            : vista.cartasParceiro ? '<b>Mão de 11!</b> Vocês veem as cartas do parceiro (embaixo, à direita) e decidem: jogar valendo 3 ou correr.' : '<b>Mão de 11!</b> Veja suas cartas e decida: jogar valendo 3 ou correr.');
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
    let valor = r, extra;
    if (pend.tipo === 'onze' && jogo.troca && r === 'jogar') {
      const t = jogo.troca, mudou = trocaMudou();
      const c = conselhoAgora(pend);
      extra = { pTroca: c && c.troca ? c.troca.pDe(t.eu, t.ele) : undefined };
      if (mudou) { const troca = {}; troca[0] = t.eu.slice(); troca[2] = t.ele.slice(); valor = { resposta: 'jogar', troca }; }
    }
    if (conselhoAgora(pend)) registrarNota(jogo.conselho, r, extra);
    if (pend.tipo === 'onze') { jogo.mostrarParceiro = false; jogo.troca = null; jogo.selTroca = null; limparAviso(); }
    resolverPendente(valor);
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
    if (pend.tipo === 'onze') {
      if (c && c.troca && c.troca.mudaram && jogo.troca) jogo.troca = { eu: c.troca.troca[0].slice(), ele: c.troca.troca[2].slice() };
      return responderHumano(c ? c.recomendacao : 'jogar');
    }
  }

  function agenteBot(j, perfil) {
    // os bots lembram do seu jeito de jogar das partidas anteriores (você é o lugar 0)
    const b = IA.criarBot(perfil, jogo.jogadores.map(x => x.perfil || null), jogo.memoriaVoce ? { memoria: { 0: jogo.memoriaVoce } } : null);
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
    jogo.leitor.observar(ev);
    // fim de mão: guarda o que se aprendeu de você (memória de antes + esta partida)
    if (ev.tipo === 'fimMao' && !jogo.opcoes.semSalvar && !jogo.opcoes.autoHeroi) {
      try { D.salvarLeituraVoce(IA.juntarLeituras(jogo.memoriaVoce, jogo.leitor.exportar(0), 150)); } catch (e) { /* a leitura nunca derruba a mesa */ }
    }
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
        else {
          balao(ev.j, 'Vamos jogar!', 'aceitou');
          const troca = ev.trocadas ? ` ${nosso ? 'Vocês trocaram' : 'Eles trocaram'} ${ev.trocadas} ${ev.trocadas === 1 ? 'carta' : 'cartas'} entre si.` : '';
          aviso((nosso ? 'Vocês jogam a mão de 11 (vale 3).' : 'Eles jogam a mão de 11 (vale 3).') + troca, troca ? 2400 : 1500);
          if (nosso) renderMao();
        }
        await esperar(900 * fv());
        break;
      }
      case 'vez':
        marcarVez(ev.j);
        if (ev.j !== 0) jogo.ui.status.innerHTML = `Vez de <b>${esc(nome(ev.j))}</b>…`;
        break;
      case 'pedido': {
        const txt = jogo.vr.NOMES_PEDIDO[ev.nivel].toUpperCase() + '!';
        balao(ev.j, txt, 'forte', 2200 * Math.max(0.6, fv()));
        splash(txt, ev.equipe);
        atualizarVale(ev.nivel === 1 ? jogo.motor.vistaPara(0).valor : jogo.vr.VALORES[ev.nivel - 1], ev.valor);
        if (P.Som) P.Som.alerta();
        await esperar(900 * fv());
        break;
      }
      case 'resposta': {
        if (ev.resposta === 'correr') { balao(ev.j, 'Corro!', 'correu'); if (P.Som) P.Som.fold(); }
        else if (ev.resposta === 'aceitar') { balao(ev.j, ev.nivel === 1 ? 'Aceito!' : 'Desce!', 'aceitou'); atualizarVale(jogo.vr.VALORES[ev.nivel]); if (P.Som) P.Som.check(); }
        else { atualizarVale(jogo.vr.VALORES[ev.nivel]); }
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
    atualizarVale(ev.vencedor === null ? jogo.vr.VALORES[ev.nivel] : ev.pontos);
    if (g.sinal) { g.sinal.remove(); g.sinal = null; }
    if (!jogo.opcoes.semSalvar) D.alterarEstat(e => { e.maos++; });
    const n = jogo.n;
    const titulo = ev.vencedor === null ? 'Ninguém marca: as três rodadas empataram'
      : ev.vencedor === 0 ? (n === 4 ? 'Vocês' : 'Você') + ` ganh${n === 4 ? 'aram' : 'ou'} a mão: +${ev.pontos}`
        : `Eles ganharam a mão: +${ev.pontos}`;
    const motivo = ev.motivo === 'correu' ? (ev.vencedor === 0 ? 'Eles correram.' : (n === 4 ? 'Vocês correram.' : 'Você correu.'))
      : ev.motivo === 'onzeCorreu' ? 'Correram da mão de 11.'
        : ev.motivo === 'empateOnze' ? 'Três empates na mão de 11: pela regra paranaense, os pontos vão para quem não estava com 11.'
          : ev.motivo === 'empateEscuro' ? `Três empates depois do ${jogo.vr.NOMES_PEDIDO[ev.nivel].toLowerCase()}: pela regra paranaense, o empate é de quem pediu no escuro e contra quem pediu já vendo a carta do adversário.`
            : ev.nivel > 0 ? `Valendo ${jogo.vr.VALORES[ev.nivel]} (${jogo.vr.NOMES_PEDIDO[ev.nivel].toLowerCase()} aceito).` : ev.tipoMao === 'onze' ? 'Mão de 11, valendo 3.' : '';
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
    // espera o toque (ou alguns segundos; tocar na caixa para a contagem). Na mesa com amigos a
    // próxima mão já começou no servidor: o resumo fica pouco tempo e não dá para parar a contagem
    const remota = !!jogo.remota;
    const total = remota ? (jogo.remota.atrasado() ? 0 : 3500) : (jogo.opcoes.autoHeroi ? 400 : 6000) * Math.max(0.5, fv());
    let parado = false;
    caixa.addEventListener('click', e => { if (e.target !== botao && !remota) { parado = true; barra.style.width = '0'; } });
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
    // mesa com amigos: { controle (cartas-remotas.js), n, regras, jogadores (já girados: você no 0), aoSair, aoTerminar, aoFechar }
    const remota = opcoes.remota || null;
    if (remota) opcoes = Object.assign({}, opcoes, { coach: 'desligado', semSalvar: true, velocidade: 1 });
    const n = remota ? remota.n : salva ? salva.cfg.n : (opcoes.n === 2 ? 2 : 4);
    const regras = R.variante(remota ? remota.regras : salva ? salva.cfg.regras : opcoes.regras || cfgT.regras).id;
    const torneio = salva ? salva.cfg.torneio || null : opcoes.torneio || null;
    let jogadores;
    if (remota) jogadores = remota.jogadores;
    else if (salva) jogadores = salva.cfg.jogadores;
    else if (opcoes.jogadores) jogadores = opcoes.jogadores;
    else {
      const nomes = P.Baralho.embaralhar(IA.NOMES.slice());
      jogadores = [{ nome: P.Config.get('nome') || 'Você', avatar: null }];
      for (let j = 1; j < n; j++) jogadores.push({ nome: nomes[j], perfil: P.RNG.escolher(IA.LISTA_PERFIS), avatar: P.Bots.sortearAvatar() });
    }
    jogo = {
      n, jogadores, token: ++contador, notas: salva ? (salva.notas || []) : [], placar: [0, 0],
      opcoes: Object.assign({ coach: cfgT.coach, amostras: 400, esconderManilha: !!cfgT.esconderManilha }, opcoes),
      pendente: null, conselho: null, vr: R.variante(regras), torneio, leitor: IA.criarLeitor(),
      memoriaVoce: D.leituraVoce(), remota: remota ? remota.controle : null, cfgRemota: remota
    };
    jogo.agentes = [agenteHumano()];
    // na mesa com amigos os outros lugares são gente (jogam no aparelho deles)
    for (let j = 1; j < n; j++) jogo.agentes.push(remota ? { bot: false } : agenteBot(j, jogadores[j].perfil));

    // na tela: a mesa ocupa tudo (sem o menu de baixo)
    $('#app').classList.add('em-jogo');
    $('#nav').classList.add('oculto');
    montar();
    const estado = salva ? salva.estado : { placar: [0, 0], dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 };
    const token = jogo.token;
    const semSalvar = !!opcoes.semSalvar;
    const ganchos = {
      evento: ev => aoEvento(ev),
      salvar: est => {
        if (semSalvar || !jogo || jogo.token !== token) return;
        D.salvar({ cfg: { n, jogadores, regras, torneio }, estado: est, notas: jogo.notas, emJogo: true });
      }
    };
    jogo.motor = remota ? remota.controle.motor(jogo.agentes, ganchos) : T.Motor.criar(Object.assign({ n, regras }, estado), jogo.agentes, ganchos);
    if (opcoes.aviso && salva) P.UI.aviso(`<b>Partida de truco retomada</b> (${salva.estado.placar[0]} × ${salva.estado.placar[1]}). A mão que estava em andamento foi anulada.`, 'aviso-ouro');
    else if (torneio && torneio.rotulo) P.UI.aviso(`<b>${esc(torneio.rotulo)}</b>`, 'aviso-ouro');
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

  /** Fim da partida da mesa com amigos: o placar e de volta para a sala (sem o resumo do coach). */
  async function fimRemoto(r) {
    const venceu = r.vencedor === 0, n = jogo.n;
    if (venceu && P.Som) P.Som.vitoria();
    document.documentElement.setAttribute('data-truco-fim', venceu ? 'vitoria' : 'derrota');
    const nomes = eq => jogo.jogadores.filter((x, j) => j % 2 === eq).map(x => x.nome).join(' e ');
    const corpo = el('div', { class: 'tr-resultado' },
      el('div', { class: 'grande ' + (venceu ? 'nos' : 'eles'), text: (venceu ? (n === 4 ? 'Vocês venceram ' : 'Você venceu ') : (n === 4 ? 'Vocês perderam ' : 'Você perdeu ')) + `${r.placar[0]} a ${r.placar[1]}` }),
      el('div', { style: { textAlign: 'center', color: 'var(--texto-2)', fontSize: '13px' }, text: `${n === 4 ? 'Venceram ' + nomes(venceu ? 0 : 1) : (venceu ? 'Você' : jogo.jogadores[1].nome) + ' venceu'} · ${r.maos} mãos jogadas` }));
    const cfg = jogo.cfgRemota;
    await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, fechavel: false, botoes: [{ texto: 'Voltar para a sala', classe: 'btn-ouro', valor: 'ok' }] });
    encerrar();
    if (cfg && cfg.aoTerminar) cfg.aoTerminar();
  }

  async function fimDePartida(r) {
    if (jogo.remota) return fimRemoto(r);
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
    const torneio = jogo.torneio;
    if (torneio && !jogo.opcoes.semSalvar) {
      // jogo de torneio: o resultado vai para a chave e a aba volta para ela
      const resumo = P.UITrucoTorneio.registrarPartida(torneio, venceu, r.placar);
      if (resumo) corpo.insertBefore(el('div', { class: 'tr-torneio-res', html: resumo }), corpo.children[1]);
      if (jogo.opcoes.autoHeroi) { encerrar(); P.UITruco.abrirTorneio(); P.App.irPara('truco'); return; }
      await P.UI.modal({ titulo: 'Fim do jogo', conteudo: corpo, fechavel: false, botoes: [{ texto: 'Voltar ao torneio', classe: 'btn-ouro', valor: 'torneio' }] });
      encerrar();
      P.UITruco.abrirTorneio();
      P.App.irPara('truco');
      return;
    }
    if (jogo.opcoes.autoHeroi) { encerrar(); P.App.irPara('truco'); return; }
    const v = await P.UI.modal({ titulo: 'Fim da partida', conteudo: corpo, fechavel: false, botoes: [{ texto: 'Voltar', valor: 'voltar' }, { texto: 'Jogar de novo', classe: 'btn-ouro', valor: 'denovo' }] });
    const n = jogo.n, regras = jogo.vr.id;
    encerrar();
    if (v === 'denovo') iniciar({ n, regras });
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
    if (j.remota) {
      // mesa com amigos: a partida continua no servidor; a aba Mesa com amigos mostra como voltar
      if (j.cfgRemota && j.cfgRemota.aoFechar) j.cfgRemota.aoFechar();
    } else {
      // a partida saiu da tela: na próxima abertura do app não volta sozinha
      const s = D.salva();
      if (s && s.emJogo) { s.emJogo = false; D.salvar(s); }
    }
    $('#app').classList.remove('em-jogo');
    $('#nav').classList.remove('oculto');
    $('#tela-truco').classList.remove('tela-mesa');
    pausas = 0;
  }

  async function sair() {
    if (jogo.remota) {
      const cfg = jogo.cfgRemota;
      const ok = await P.UI.confirmar('Sair da mesa?', 'A partida continua sem você: na sua vez, a mesa espera o tempo acabar e joga por você (a carta mais fraca; num pedido de truco, corre). Dá para voltar pela aba Mesa com amigos enquanto a partida não terminar.', 'Sair', 'Continuar jogando');
      if (!ok || !jogo) return;
      if (cfg.aoSair) cfg.aoSair();
      encerrar();
      P.App.irPara('amigos');
      return;
    }
    pausar(true);
    const ok = await P.UI.confirmar('Sair da partida?', 'A partida fica salva: dá para continuar depois pela aba Truco, do começo da mão atual.', 'Sair', 'Continuar jogando');
    pausar(false);
    if (!ok) return;
    encerrar();
    P.App.irPara('truco');
  }

  /** Mesa com amigos: o pedido em aberto deixou de valer (o prazo acabou, o parceiro respondeu). */
  function cancelarPendente() {
    if (!jogo || !jogo.pendente) return;
    jogo.pendente = null;
    jogo.mostrarParceiro = false; jogo.troca = null; jogo.selTroca = null; jogo.cobrir = false;
    limparAviso();
    acoesEspera('');
    renderMao();
  }

  /** Mesa com amigos: o prazo do pedido em aberto ({ ms, meu } ou null). */
  function relogio(info) {
    const r = jogo && jogo.ui && jogo.ui.relogio;
    if (!r) return;
    r.classList.toggle('oculto', !info);
    if (!info) return;
    const s = Math.ceil(info.ms / 1000);
    r.textContent = '⏱ ' + s + ' s';
    r.classList.toggle('meu', !!info.meu);
    r.classList.toggle('urgente', !!info.meu && s <= 10);
    if (info.meu && s <= 5 && s !== jogo.ultimoBip && P.Som) { jogo.ultimoBip = s; P.Som.alerta(); }
  }

  async function abrirMenu() {
    if (!jogo) return;
    const modos = [['sempre', 'Coach: dicas sempre'], ['pedido', 'Coach: sob pedido'], ['desligado', 'Coach: desligado']];
    const itens = [['regras', 'Como jogar'], ['quiz', 'Treino de cartas'], ['manilha', jogo.opcoes.esconderManilha ? 'Mostrar a manilha' : 'Esconder a manilha (treino)']]
      .concat(jogo.remota ? [] : modos.filter(m => m[0] !== jogo.opcoes.coach))
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
    if (escolha === 'manilha') {
      jogo.opcoes.esconderManilha = !jogo.opcoes.esconderManilha;
      const c = D.config(); c.esconderManilha = jogo.opcoes.esconderManilha; D.salvarConfig(c);
      if (jogo.viraAtual !== undefined) renderVira(jogo.viraAtual, true);
      renderMao();
      if (jogo.conselho) { jogo.conselho = null; if (jogo.pendente) recalcularConselho(jogo.pendente); }
      P.UI.aviso(jogo.opcoes.esconderManilha ? 'Manilha escondida: descubra pela vira.' : 'A manilha volta a aparecer na mesa.', 'aviso-ouro');
      return;
    }
    if (escolha === 'regras') return abrirRegras();
    if (escolha === 'quiz') return abrirQuiz();
    const modo = modos.find(m => m[0] === escolha);
    if (modo) { mudarModoCoach(modo[0]); layout(); }
  }

  P.Config.aoMudar((k, v) => { if (k === 'tema' && jogo && jogo.ui) { jogo.ui.raiz.dataset.tema = v; $('#tela-truco').dataset.tema = v; } });

  P.UITrucoMesa = { iniciar, encerrar, emJogo: () => !!jogo, remota: () => !!(jogo && jogo.remota), pausar, cancelarPendente, relogio, _jogo: () => jogo };
})(window.Poker = window.Poker || {});
