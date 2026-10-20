/* ==========================================================================
   OUTS · Treino Lab — ui-xadrez.js
   Aba Xadrez: nova partida (cor, nível do bot, relógio, coach, desfazer),
   partida salva para continuar, como jogar (movimento das peças e lances
   especiais) e as estatísticas. O tabuleiro fica em ui-xadrez-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const X = P.Xadrez, IA = X.IA;
  const A = P.Armazenamento;

  const CHAVE_CFG = 'xadrez.config', CHAVE_EST = 'xadrez.estat', CHAVE_SALVA = 'xadrez.partida';
  const PADRAO_CFG = { cor: 'brancas', nivel: 3, relogio: 0, coach: 'sempre', desfazer: true };
  const PADRAO_EST = () => ({ partidas: 0, vitorias: 0, empates: 0, derrotas: 0, porNivel: {}, notas: { otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0 } });
  const RELOGIOS = [[0, 0, 'Sem relógio'], [600, 0, '10 min'], [300, 3, '5 min + 3 s'], [180, 2, '3 min + 2 s']];
  const Dados = {
    RELOGIOS,
    config() { return Object.assign({}, PADRAO_CFG, A.ler(CHAVE_CFG, {})); },
    salvarConfig(c) { A.gravar(CHAVE_CFG, c); },
    estat() { const e = Object.assign(PADRAO_EST(), A.ler(CHAVE_EST, {})); e.notas = Object.assign(PADRAO_EST().notas, e.notas || {}); e.porNivel = e.porNivel || {}; return e; },
    alterarEstat(fn) { const e = Dados.estat(); fn(e); A.gravar(CHAVE_EST, e); return e; },
    salva() { const s = A.ler(CHAVE_SALVA, null); return s && s.cfg && Array.isArray(s.lances) ? s : null; },
    salvar(s) { A.gravar(CHAVE_SALVA, s); },
    descartar() { A.remover(CHAVE_SALVA); },
    precisao(e) { const n = e.notas, tot = n.otima + n.boa + n.imprecisa + n.erro + n.grave; return tot ? (n.otima + n.boa) / tot : null; }
  };
  X.Dados = Dados;

  function render() {
    const raiz = document.getElementById('tela-xadrez');
    if (P.UIXadrezMesa && P.UIXadrezMesa.emJogo()) return;
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco xadrez' });
    pag.appendChild(faixa());
    const grade = el('div', { class: 'truco-grade' });
    grade.appendChild(el('div', { class: 'truco-col col-novo' }, novaPartida()));
    grade.appendChild(el('div', { class: 'truco-col col-regras' }, regras()));
    pag.appendChild(grade);
    raiz.appendChild(pag);
  }

  function faixa() {
    const e = Dados.estat(), pr = Dados.precisao(e);
    const kpi = (rot, val) => el('div', { class: 'kpi' }, el('small', { text: rot }), el('b', { text: val }));
    return el('section', { class: 'truco-faixa xadrez-faixa' },
      el('div', {},
        el('h1', { html: '<b>Xadrez</b> contra bots, com coach' }),
        el('p', { text: 'Do iniciante ao mestre: escolha o nível do bot e jogue com o coach mostrando o melhor lance, o que está ameaçado e a nota de cada lance seu. Dá para desfazer lances e treinar sem pressa — ou ligar o relógio.' })),
      el('div', { class: 'lobby-kpis' },
        kpi('Partidas', e.partidas ? `${e.vitorias}V ${e.empates}E ${e.derrotas}D` : '—'),
        kpi('Lances bons', pr === null ? '—' : P.Formato.pct(pr, 0)),
        kpi('Maior nível vencido', maiorNivel(e))));
  }
  function maiorNivel(e) {
    let m = 0;
    Object.keys(e.porNivel).forEach(k => { if (e.porNivel[k].v > 0) m = Math.max(m, +k); });
    return m ? IA.nivel(m).nome : '—';
  }

  function novaPartida() {
    const cfg = Dados.config();
    const salvar = () => { Dados.salvarConfig(cfg); render(); };
    const box = el('section', { class: 'painel truco-novo' });
    box.appendChild(el('h2', { text: 'Nova partida' }));
    const salva = Dados.salva();
    if (salva) {
      box.appendChild(el('div', { class: 'truco-continuar' },
        el('div', { html: `<b>Partida em andamento</b> · você de ${salva.cfg.cor === 'brancas' ? 'brancas' : 'pretas'} · nível ${IA.nivel(salva.cfg.nivel).nome} · ${Math.ceil(salva.lances.length / 2)} lances` }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UIXadrezMesa.iniciar({ retomar: salva }) }),
          el('button', { class: 'btn', text: 'Descartar', onclick: async () => {
            if (await P.UI.confirmar('Descartar a partida?', 'A partida salva será apagada (não conta como derrota).', 'Descartar', 'Manter')) { Dados.descartar(); render(); }
          } }))));
    }
    const cor = el('div', { class: 'opcoes-linha' });
    [['brancas', 'Brancas'], ['pretas', 'Pretas'], ['sorteio', 'Sorteio']].forEach(([id, txt]) => cor.appendChild(el('button', { class: 'opcao' + (cfg.cor === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.cor = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Você joga de' }), cor, el('small', { class: 'tr-ajuda', text: 'As brancas começam.' })));
    const niv = el('div', { class: 'xz-niveis' });
    IA.NIVEIS.forEach(n => niv.appendChild(el('button', { class: 'xz-nivel' + (cfg.nivel === n.id ? ' ativo' : ''), onclick: () => { cfg.nivel = n.id; salvar(); } },
      el('span', { class: 'xz-barras', html: '<i></i>'.repeat(n.id) + '<i class="vazia"></i>'.repeat(5 - n.id) }), el('b', { text: n.nome }))));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Nível do bot' }), niv, el('small', { class: 'tr-ajuda', text: IA.nivel(cfg.nivel).descricao })));
    const rel = el('div', { class: 'opcoes-linha' });
    RELOGIOS.forEach(([s, inc, txt]) => rel.appendChild(el('button', { class: 'opcao' + (cfg.relogio === s ? ' ativo' : ''), text: txt, onclick: () => { cfg.relogio = s; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Relógio' }), rel, el('small', { class: 'tr-ajuda', text: cfg.relogio ? 'Quem zerar o tempo perde (o bot também tem relógio).' : 'Sem pressa: bom para treinar com o coach.' })));
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) => coach.appendChild(el('button', { class: 'opcao' + (cfg.coach === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.coach = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach));
    box.appendChild(el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg.desfazer ? true : null, onchange: e => { cfg.desfazer = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: '<b>Permitir desfazer lances</b><br><small>Treino: volte o seu lance (e o do bot) para tentar outro caminho.</small>' })));
    box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
      if (salva && !(await P.UI.confirmar('Começar outra?', 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
      Dados.descartar();
      P.UIXadrezMesa.iniciar({});
    } }));
    return box;
  }

  function regras() {
    const box = el('section', { class: 'painel tr-regras xadrez-regras' });
    box.appendChild(el('h2', { text: 'Como jogar' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    const peca = (k, cor) => `<span class="xz-mini">${P.UIXadrezMesa ? P.UIXadrezMesa.pecaSVG(k, cor || 'b') : ''}</span>`;
    box.appendChild(sec('O objetivo', true,
      p('Dar <b>xeque-mate</b>: atacar o rei adversário de um jeito que ele não tenha como escapar. As brancas começam e cada um joga um lance por vez.')));
    box.appendChild(sec('Como cada peça anda', true,
      el('ul', { class: 'tr-lista xz-pecas' },
        el('li', { html: `${peca('r')} <b>Rei (R)</b>: uma casa em qualquer direção. Nunca pode ficar em xeque.` }),
        el('li', { html: `${peca('d')} <b>Dama (D)</b>: quantas casas quiser, em linha reta ou na diagonal.` }),
        el('li', { html: `${peca('t')} <b>Torre (T)</b>: quantas casas quiser, na horizontal ou na vertical.` }),
        el('li', { html: `${peca('b')} <b>Bispo (B)</b>: quantas casas quiser, na diagonal (fica sempre na mesma cor).` }),
        el('li', { html: `${peca('c')} <b>Cavalo (C)</b>: em "L" (duas casas para um lado e uma para o outro); é o único que pula as outras peças.` }),
        el('li', { html: `${peca('p')} <b>Peão</b>: anda uma casa para a frente (duas na primeira vez) e captura na diagonal, uma casa à frente.` }))));
    box.appendChild(sec('Lances especiais', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: '<b>Roque</b>: o rei anda duas casas para o lado da torre e a torre pula para o outro lado dele. Só vale se nenhum dos dois já se mexeu, se não houver peças no meio e se o rei não estiver em xeque nem passar por casa atacada. (Toque no rei e depois na casa duas ao lado.)' }),
        el('li', { html: '<b>En passant</b>: se um peão adversário andar duas casas e parar ao lado do seu, você pode capturá-lo como se ele tivesse andado só uma — mas só no lance seguinte.' }),
        el('li', { html: '<b>Promoção</b>: o peão que chega à última fileira vira dama, torre, bispo ou cavalo (quase sempre dama).' }))));
    box.appendChild(sec('Xeque, mate e empate', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: '<b>Xeque</b>: o rei está atacado; o próximo lance tem que tirá-lo do ataque.' }),
        el('li', { html: '<b>Xeque-mate</b>: xeque sem saída. Fim de jogo.' }),
        el('li', { html: '<b>Afogamento</b>: quem joga não está em xeque mas não tem nenhum lance legal. É empate.' }),
        el('li', { html: 'Também é empate: a mesma posição repetida três vezes, 50 lances seguidos sem captura nem lance de peão, e material insuficiente para dar mate (ex.: rei contra rei e cavalo).' }))));
    box.appendChild(sec('Dicas de abertura', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Ocupe o <b>centro</b> com peões (e4, d4 / e5, d5).' }),
        el('li', { html: '<b>Desenvolva</b> cavalos e bispos antes de mexer a dama; não mexa a mesma peça duas vezes sem motivo.' }),
        el('li', { html: 'Faça o <b>roque</b> cedo: o rei fica seguro e as torres se ligam.' }),
        el('li', { html: 'Antes de cada lance, olhe: <b>o que o adversário ameaça?</b> Que peça minha está sem defesa?' }))));
    return box;
  }

  P.UIXadrez = { render, regrasNo: () => regras() };
})(window.Poker = window.Poker || {});
