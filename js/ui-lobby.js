/* ==========================================================================
   OUTS · Treino Lab — ui-lobby.js
   Lobby: abas Cash / Sit & Go / Torneio, como os oponentes são sorteados,
   cartões de limite ou buy-in, seletor visual de 2 a 9 lugares, opções da
   mesa e o botão de sentar. Não há nível para escolher: cada partida sorteia
   quantos profissionais, regulares e jogadores comuns sentam com você.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc } = P.UI;
  const F = P.Formato, E = P.Estruturas;

  const DESC_ABA = {
    cash: 'Fichas valem dinheiro, blinds fixos, entre e saia quando quiser.',
    sng: 'Uma ou várias mesas jogando ao mesmo tempo, stack de 1.500, blinds sobem pelo relógio. Premiação para os primeiros.',
    torneio: 'Field de 45 a 180 jogadores em várias mesas, stack de 10.000 e big blind ante. Paga cerca de 15%.'
  };
  const PARTICIPANTES_SNG = [18, 27, 45, 90, 180];

  const salvo = P.Config.get('ultimoLobby') || {};
  const st = Object.assign({ aba: 'cash', indice: 1, lugares: 6, buyinBB: 100, recompraAuto: false, velocidade: 'regular', field: 90, participantes: 0 }, salvo);
  delete st.nivel;                       // versões antigas tinham escolha de nível
  /** Inscritos no Sit & Go (no mínimo uma mesa cheia). */
  const inscritosSNG = () => Math.max(st.lugares, Math.min(180, st.participantes || st.lugares));
  const mesasDe = (n, l) => Math.ceil(n / l);

  function salvar() { P.Config.set('ultimoLobby', st); }

  function itens() { return st.aba === 'cash' ? E.CASH : st.aba === 'sng' ? E.SNG : E.TORNEIO; }
  function itemAtual() { const l = itens(); if (st.indice >= l.length) st.indice = 0; return l[st.indice]; }

  function render() {
    const raiz = document.getElementById('tela-lobby');
    raiz.innerHTML = '';
    const lobby = el('div', { class: 'lobby' });
    lobby.appendChild(faixa());
    const grade = el('div', { class: 'lobby-grade' });
    grade.appendChild(principal());
    grade.appendChild(lateral());
    lobby.appendChild(grade);
    lobby.appendChild(atalhos());
    raiz.appendChild(lobby);
  }

  function faixa() {
    const ac = P.Estatisticas.acumulado();
    const kpi = (rot, val, cls) => el('div', { class: 'kpi' }, el('small', { text: rot }), el('b', { class: cls || '', text: val }));
    return el('section', { class: 'lobby-faixa' },
      el('div', { class: 'logo-grande', html: P.UI.LOGO_SVG }),
      el('div', {},
        el('h1', { html: '<b>OUTS</b> · Treino Lab' }),
        el('p', { text: 'Jogue contra bots com estilos reais enquanto o coach mostra a matemática de cada decisão — outs, pot odds, equity, EV — até ela ficar automática. Dinheiro fictício.' })),
      el('div', { class: 'lobby-kpis' },
        kpi('Banca', F.dinheiro(P.Banca.saldo())),
        kpi('Mãos jogadas', F.fichas(ac.maos)),
        kpi('Decisões certas', ac.corretas === null ? '—' : F.pct(ac.corretas, 0)),
        kpi('Cash bb/100', ac.bb100 === null ? '—' : F.num(ac.bb100, 1), ac.bb100 > 0 ? 'pos' : ac.bb100 < 0 ? 'neg' : '')));
  }

  function principal() {
    const box = el('div', { class: 'lobby-principal' });
    const abas = el('div', { class: 'abas' });
    [['cash', 'Cash Game'], ['sng', 'Sit & Go'], ['torneio', 'Torneio']].forEach(([id, txt]) => {
      abas.appendChild(el('button', { class: st.aba === id ? 'ativo' : '', text: txt, onclick: () => { st.aba = id; st.indice = id === 'cash' ? Math.min(st.indice, 1) : 0; salvar(); render(); } }));
    });
    box.appendChild(el('div', { class: 'lobby-cab' }, abas, el('span', { class: 'desc', text: DESC_ABA[st.aba] })));

    box.appendChild(caixaOponentes());

    // cartões
    const lim = el('div', { class: 'limites' });
    itens().forEach((it, i) => lim.appendChild(cartaoItem(it, i)));
    box.appendChild(lim);
    return box;
  }

  /** Como os oponentes são escolhidos (sorteio a cada partida). */
  function caixaOponentes() {
    const PF = P.Bots.PERFIS, CAT = P.Bots.CATEGORIAS;
    const chip = p => el('span', { class: 'tag-perfil', style: { '--cor-perfil': PF[p].cor }, title: `${PF[p].nome}: ${PF[p].descricao}`, text: PF[p].sigla });
    const tipo = (cat, txt) => el('div', { class: 'tipo-oponente' },
      el('div', { class: 'chips' }, CAT[cat].perfis.map(chip)),
      el('b', { text: CAT[cat].nome }),
      el('span', { class: 'txt', text: txt }));
    return el('section', { class: 'oponentes-sorteio' },
      el('h3', { text: 'Oponentes sorteados em cada partida' }),
      el('p', { text: 'O jogo sorteia quantos jogadores muito bons, medianos e comuns sentam com você: às vezes a mesa é dura, às vezes é fácil. No heads-up, o adversário pode ser de qualquer um dos três tipos.' }),
      el('div', { class: 'tipos-oponentes' },
        tipo('forte', 'Profissionais: contas de EV e ICM, leem o seu jogo e se adaptam.'),
        tipo('mediano', 'Regulares: jogo correto e atento, mas com mais erros.'),
        tipo('comum', 'Calling station, nit, TAG, LAG e maníaco, cada um com seus vazamentos.')),
      el('small', { text: 'Todos percebem quem vai all-in com qualquer mão e passam a pagar mais leve.' }));
  }

  function cartaoItem(it, i) {
    const ativo = st.indice === i;
    // a cor da faixa sobe com o valor da mesa
    const faixaCor = ['#2a8a5c', '#3b82c4', '#9b5de5', '#d8b25a'][Math.min(3, Math.floor(i / itens().length * 4))];
    let conteudo;
    if (st.aba === 'cash') {
      conteudo = [
        el('div', { class: 'nome', text: it.nome }),
        el('div', { class: 'sub', text: `${F.dinheiro(it.sb)} / ${F.dinheiro(it.bb)}` }),
        el('ul', { html: `<li>Buy-in: <b>${F.dinheiro(it.bb * 40)} – ${F.dinheiro(it.bb * 200)}</b></li><li>Padrão (100 bb): <b>${F.dinheiro(it.bb * 100)}</b></li><li>Blinds fixos · recompra opcional</li>` })
      ];
    } else if (st.aba === 'sng') {
      const n = inscritosSNG(), mesas = mesasDe(n, st.lugares);
      conteudo = [
        el('div', { class: 'nome', text: F.dinheiro(it.total) }),
        el('div', { class: 'sub', text: `Sit & Go · ${n} jogadores` + (mesas > 1 ? ` · ${mesas} mesas` : '') }),
        el('ul', { html: `<li>Prize pool: <b>${F.dinheiro(it.premio * n)}</b></li><li>Taxa: <b>${F.dinheiro(it.total - it.premio)}</b></li><li>Stack ${F.fichas(E.SNG_STACK)} · ante a partir do nível 6</li>` })
      ];
    } else {
      conteudo = [
        el('div', { class: 'nome', text: F.dinheiro(it.total) }),
        el('div', { class: 'sub', text: `Torneio · ${st.field} jogadores` }),
        el('ul', { html: `<li>Prize pool: <b>${F.dinheiro(it.premio * st.field)}</b></li><li>1º lugar: <b>${F.dinheiro(E.valoresPremios(it.premio * st.field, E.percentuaisTorneio(st.field))[0])}</b></li><li>Stack ${F.fichas(E.TORNEIO_STACK)} · big blind ante</li>` })
      ];
    }
    return el('button', { class: 'limite' + (ativo ? ' ativo' : ''), style: { '--faixa': faixaCor }, onclick: () => { st.indice = i; salvar(); render(); } }, ...conteudo);
  }

  function miniMesa(n) {
    const box = el('div', { class: 'mini-mesa' }, el('div', { class: 'oval' }));
    for (let s = 0; s < 9; s++) {
      if (s >= n) continue;
      const t = (90 + s * 360 / n) * Math.PI / 180;
      const x = 50 + 45 * Math.cos(t), y = 50 + 42 * Math.sin(t);
      box.appendChild(el('span', { class: 'lugar ' + (s === 0 ? 'voce' : 'ocupado'), style: { left: x + '%', top: y + '%' }, title: s === 0 ? 'Você' : 'Oponente' }));
    }
    return box;
  }

  function lateral() {
    const it = itemAtual();
    const box = el('aside', { class: 'painel lobby-config' });
    box.appendChild(el('h3', { text: 'Jogadores na mesa' }));
    const botoes = el('div', { class: 'botoes-lugares' });
    for (let n = 2; n <= 9; n++) botoes.appendChild(el('button', { class: 'opcao' + (st.lugares === n ? ' ativo' : ''), text: n, onclick: () => { st.lugares = n; salvar(); render(); } }));
    box.appendChild(el('div', { class: 'seletor-lugares' }, miniMesa(st.lugares), botoes));

    const resumo = el('div', { class: 'resumo-mesa' });
    const linha = (a, b) => resumo.appendChild(el('div', {}, el('span', { text: a }), el('b', { html: b })));
    let custo;

    if (st.aba === 'cash') {
      const bi = Math.round(st.buyinBB * it.bb);
      custo = bi;
      const valorSpan = el('b', { text: `${st.buyinBB} bb = ${F.dinheiro(bi)}` });
      const range = el('input', { type: 'range', min: 40, max: 200, step: 5, value: st.buyinBB });
      range.addEventListener('input', () => { st.buyinBB = +range.value; valorSpan.textContent = `${st.buyinBB} bb = ${F.dinheiro(Math.round(st.buyinBB * it.bb))}`; });
      range.addEventListener('change', () => { salvar(); render(); });
      box.appendChild(el('div', { class: 'campo' }, el('span', { html: 'Buy-in ' }), valorSpan, range));
      const chave = el('label', { class: 'chave' }, el('input', { type: 'checkbox', checked: st.recompraAuto ? true : null, onchange: e => { st.recompraAuto = e.target.checked; salvar(); } }), el('i'),
        el('span', { text: 'Recompra automática (completa o stack abaixo de 50% e recompra ao quebrar)' }));
      box.appendChild(chave);
      linha('Mesa', `${it.nome} · ${st.lugares} lugares`);
      linha('Blinds', `${F.dinheiro(it.sb)} / ${F.dinheiro(it.bb)}`);
      linha('Você senta com', F.dinheiro(bi));
    } else {
      const vel = el('div', { class: 'opcoes-linha' });
      const dur = st.aba === 'sng' ? E.SNG_DURACAO : E.TORNEIO_DURACAO;
      [['regular', 'Regular'], ['turbo', 'Turbo']].forEach(([id, txt]) => vel.appendChild(el('button', { class: 'opcao' + (st.velocidade === id ? ' ativo' : ''), text: `${txt} (${dur[id] / 60} min)`, onclick: () => { st.velocidade = id; salvar(); render(); } })));
      box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Velocidade dos níveis' }), vel));
      let premios;
      if (st.aba === 'torneio') {
        const fl = el('div', { class: 'opcoes-linha' });
        E.TORNEIO_FIELDS.forEach(f => fl.appendChild(el('button', { class: 'opcao' + (st.field === f ? ' ativo' : ''), text: f + ' jogadores', onclick: () => { st.field = f; salvar(); render(); } })));
        box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Tamanho do field' }), fl));
        premios = E.valoresPremios(it.premio * st.field, E.percentuaisTorneio(st.field));
        linha('Torneio', `${F.dinheiro(it.total)} · ${st.field} jogadores`);
        linha('Mesas', `${mesasDe(st.field, st.lugares)} mesas de até ${st.lugares}`);
        linha('Pagos', `${premios.length} lugares (${F.num(premios.length / st.field * 100, 0)}%)`);
      } else {
        // quantos participam: você + bots, em quantas mesas forem precisas
        const n = inscritosSNG(), mesas = mesasDe(n, st.lugares);
        const pl = el('div', { class: 'opcoes-linha' });
        const opcoes = [st.lugares].concat(PARTICIPANTES_SNG.filter(x => x > st.lugares));
        opcoes.forEach(x => pl.appendChild(el('button', {
          class: 'opcao' + (n === x ? ' ativo' : ''), text: x === st.lugares ? `${x} (1 mesa)` : String(x),
          onclick: () => { st.participantes = x; salvar(); render(); }
        })));
        const livre = el('input', { class: 'entrada entrada-participantes', type: 'number', min: st.lugares, max: 180, value: n, inputmode: 'numeric', title: 'Outro número de participantes' });
        livre.addEventListener('change', () => { st.participantes = Math.max(st.lugares, Math.min(180, Math.round(+livre.value) || st.lugares)); salvar(); render(); });
        pl.appendChild(livre);
        box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Participantes (você + bots)' }), pl,
          el('small', { style: { color: 'var(--texto-3)', fontSize: '11.5px' }, text: mesas > 1
            ? `${mesas} mesas de até ${st.lugares} jogando ao mesmo tempo. Quem perde sai; as mesas vão se juntando até a mesa final. Você pode assistir às outras mesas.`
            : 'Uma mesa só. Escolha mais participantes para jogar com várias mesas ao mesmo tempo.' })));
        const pct = E.percentuaisSNG(n);
        premios = E.valoresPremios(it.premio * n, pct);
        linha('Sit & Go', `${F.dinheiro(it.total)} · ${n} jogadores`);
        if (mesas > 1) linha('Mesas', `${mesas} mesas de até ${st.lugares}`);
        linha('Pagos', `${premios.length} ${premios.length > 1 ? 'lugares' : 'lugar'}` + (pct.length <= 3 ? ` (${pct.map(x => Math.round(x)).join('/')}%)` : ` (${F.num(premios.length / n * 100, 0)}%)`));
      }
      custo = it.total;
      box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Premiação' }),
        el('div', { class: 'premios-lista', html: premios.map((v, i) => `<span>${i + 1}º</span><b>${F.dinheiro(v)}</b>`).join('') })));
    }
    linha('Oponentes', 'sorteados na hora');

    // coach durante a partida (no fim sempre há a análise de desempenho)
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['quiz', 'Quiz'], ['desligado', 'Desligado']].forEach(([id, txt]) => {
      coach.appendChild(el('button', { class: 'opcao' + (P.Config.get('modoCoach') === id ? ' ativo' : ''), text: txt, onclick: () => { P.Config.set('modoCoach', id); render(); } }));
    });
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach,
      el('small', { style: { color: 'var(--texto-3)', fontSize: '11.5px' }, text: P.Config.get('modoCoach') === 'desligado'
        ? 'Sem dicas na mesa. O coach avalia em silêncio e mostra a análise completa no fim.'
        : 'No fim da partida o coach sempre mostra a análise do seu desempenho.' })));
    box.appendChild(resumo);
    const saldo = P.Banca.saldo();
    const semSaldo = saldo < custo;
    box.appendChild(el('button', {
      class: 'btn btn-ouro btn-sentar', disabled: semSaldo ? true : null,
      text: semSaldo ? 'Banca insuficiente' : st.aba === 'cash' ? `Sentar à mesa (${F.dinheiro(custo)})` : `Registrar (${F.dinheiro(custo)})`,
      onclick: comecar
    }));
    if (semSaldo) box.appendChild(el('button', { class: 'btn', text: 'Recarregar banca fictícia', onclick: () => { P.Banca.reiniciar(); P.App.atualizarSaldo(); render(); } }));
    return box;
  }

  function atalhos() {
    const a = (icone, titulo, txt, tela) => el('button', { class: 'atalho', onclick: () => tela === 'cola' ? P.UIPaineis.abrirCola() : P.App.irPara(tela) }, el('i', { text: icone }), el('b', { text: titulo }), el('span', { text: txt }));
    return el('div', { class: 'atalhos' },
      a('⚡', 'Treino relâmpago', 'Outs, pot odds e MDF contra o relógio', 'treino'),
      a('📊', 'Estatísticas', 'VPIP, PFR, bb/100, ROI e seus erros', 'estatisticas'),
      a('🕘', 'Histórico', 'Replay mão a mão com o coach', 'historico'),
      a('🎲', 'Auditoria', '1 milhão de embaralhamentos testados', 'auditoria'),
      a('📋', 'Cola rápida', 'Tabelas para consultar na mesa', 'cola'));
  }

  function comecar() {
    const it = itemAtual();
    const cfg = { modo: st.aba, lugares: st.lugares };
    if (st.aba === 'cash') Object.assign(cfg, { limite: it, buyinBB: st.buyinBB, recompraAuto: st.recompraAuto });
    else Object.assign(cfg, { buyin: it, velocidade: st.velocidade, field: st.aba === 'torneio' ? st.field : inscritosSNG(), participantes: st.aba === 'sng' ? inscritosSNG() : undefined });
    P.App.iniciarPartida(cfg);
  }

  P.UILobby = { render };
})(window.Poker = window.Poker || {});
