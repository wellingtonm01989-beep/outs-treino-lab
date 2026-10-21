/* ==========================================================================
   OUTS · Treino Lab — ui-cacheta.js
   Aba "Cacheta": nova partida (quantos jogadores, nível dos bots, vidas,
   curinga, furar a fila, mostrar os descartes, coach), partida salva para
   continuar, como jogar e as estatísticas. A mesa fica em ui-cacheta-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const K = P.Cacheta, R = K.Regras, IA = K.IA;
  const A = P.Armazenamento;

  // ------------------------------------------------------------ dados
  const CHAVE_CFG = 'cacheta.config', CHAVE_EST = 'cacheta.estat', CHAVE_SALVA = 'cacheta.partida';
  const PADRAO_CFG = { jogadores: 4, nivel: 'mestre', coach: 'sempre', vidas: 7, curinga: 'naipe', furar: false, descartes: true, ordem: 'jogos' };
  const PADRAO_EST = () => ({ partidas: 0, vitorias: 0, maos: 0, batidas: 0, batidas10: 0, notas: { otima: 0, boa: 0, imprecisa: 0, erro: 0 } });
  const Dados = {
    config() { return Object.assign({}, PADRAO_CFG, A.ler(CHAVE_CFG, {})); },
    salvarConfig(c) { A.gravar(CHAVE_CFG, c); },
    estat() { const e = Object.assign(PADRAO_EST(), A.ler(CHAVE_EST, {})); e.notas = Object.assign(PADRAO_EST().notas, e.notas || {}); return e; },
    alterarEstat(fn) { const e = Dados.estat(); fn(e); A.gravar(CHAVE_EST, e); return e; },
    salva() { const s = A.ler(CHAVE_SALVA, null); return s && s.cfg && s.estado ? s : null; },
    salvar(s) { A.gravar(CHAVE_SALVA, s); },
    descartar() { A.remover(CHAVE_SALVA); },
    acerto(e) { const n = e.notas, tot = n.otima + n.boa + n.imprecisa + n.erro; return tot ? (n.otima + n.boa) / tot : null; }
  };
  K.Dados = Dados;

  /** Carta pequena (o desenho do poker) para a faixa e os textos de regras. */
  const mini = (txt, cur) => {
    const NA = { s: 0, h: 1, d: 2, c: 3 }, VAL = { A: 1, J: 11, Q: 12, K: 13 };
    return txt.split(' ').map(t => {
      const n = NA[t.slice(-1)], v = VAL[t.slice(0, -1)] || +t.slice(0, -1);
      return `<span class="carta-txt n-${n}${cur ? ' ca-cur' : ''}">${R.ROTULO[v]}${R.NAIPES[n]}</span>`;
    }).join(' ');
  };

  // ------------------------------------------------------------ entrada
  function render() {
    const raiz = document.getElementById('tela-cacheta');
    if (P.UICachetaMesa && P.UICachetaMesa.emJogo()) return;
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco cacheta' });
    pag.appendChild(faixa());
    const grade = el('div', { class: 'truco-grade' });
    grade.appendChild(el('div', { class: 'truco-col col-novo' }, novaPartida()));
    grade.appendChild(el('div', { class: 'truco-col col-regras' }, regras()));
    pag.appendChild(grade);
    raiz.appendChild(pag);
  }

  function faixa() {
    const e = Dados.estat();
    const ac = Dados.acerto(e);
    const kpi = (rot, val) => el('div', { class: 'kpi' }, el('small', { text: rot }), el('b', { text: val }));
    const leque = el('div', { class: 'ca-leque' });
    [[5, 1], [6, 1], [7, 1], [11, 3], [11, 0]].forEach(([v, n], i) => {
      const c = P.UI.carta((v === 1 ? 12 : v - 2) * 4 + n);
      c.style.transform = `rotate(${-20 + i * 10}deg) translateY(${Math.abs(i - 2) * 5}px)`;
      leque.appendChild(c);
    });
    return el('section', { class: 'truco-faixa cacheta-faixa' },
      el('div', {},
        el('h1', { html: '<b>Cacheta</b> contra os bots' }),
        el('p', { text: 'Junte as suas 9 cartas em trincas e sequências e bata antes dos outros. A vira define o curinga; cada batida tira vidas de quem ficou, e ganha quem sobrar na mesa. Os bots contam as cartas — inclusive as que você pega do lixo; o coach mostra quantas cartas faltam, quais ajudam e quando um descarte pode dar a batida para o próximo.' })),
      el('div', { class: 'uno-faixa-dir' },
        leque,
        el('div', { class: 'lobby-kpis' },
          kpi('Partidas', e.partidas ? `${e.vitorias}/${e.partidas}` : '—'),
          kpi('Batidas', e.maos ? `${e.batidas}/${e.maos}` : '—'),
          kpi('Jogadas boas', ac === null ? '—' : P.Formato.pct(ac, 0)))));
  }

  function novaPartida() {
    const cfg = Dados.config();
    const salvar = () => { Dados.salvarConfig(cfg); render(); };
    const box = el('section', { class: 'painel truco-novo' });
    box.appendChild(el('h2', { text: 'Nova partida' }));
    const salva = Dados.salva();
    if (salva) {
      const v = salva.estado.vidas;
      box.appendChild(el('div', { class: 'truco-continuar' },
        el('div', { html: `<b>Partida em andamento</b> · ${salva.cfg.n} jogadores · você com <b>${v[0]}</b> ${v[0] === 1 ? 'vida' : 'vidas'} (mão ${salva.estado.maoNumero + 1})` }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UICachetaMesa.iniciar({ retomar: salva }) }),
          el('button', { class: 'btn', text: 'Descartar', onclick: async () => {
            if (await P.UI.confirmar('Descartar a partida?', 'A partida salva será apagada (não conta como derrota).', 'Descartar', 'Manter')) { Dados.descartar(); render(); }
          } }))));
    }
    const opcoes = (lista, campo, aoMudar) => {
      const l = el('div', { class: 'opcoes-linha' });
      lista.forEach(([val, txt]) => l.appendChild(el('button', { class: 'opcao' + (cfg[campo] === val ? ' ativo' : ''), text: txt, onclick: () => { cfg[campo] = val; if (aoMudar) aoMudar(); salvar(); } })));
      return l;
    };
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Jogadores (com você)' }), opcoes([2, 3, 4, 5, 6].map(x => [x, String(x)]), 'jogadores'),
      el('small', { class: 'tr-ajuda', text: cfg.jogadores === 2 ? 'Mano a mano contra um bot.' : `Você e ${cfg.jogadores - 1} bots, cada um por si.` })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Nível dos bots' }), opcoes([['mestre', 'Mestre'], ['medio', 'Médio'], ['facil', 'Fácil']], 'nivel'),
      el('small', { class: 'tr-ajuda', text: { mestre: 'Contam as cartas (as duas cópias de cada uma, inclusive as que você pega do lixo), pesam quantas das que ainda podem vir ajudam cada descarte e sabem a hora de esperar a batida de 10.', medio: 'Fazem a conta das cartas que faltam, mas não cuidam do que descartam para o próximo e às vezes erram.', facil: 'Descartam pelo jeito da mão, sem contar as cartas. Bom para aprender as regras.' }[cfg.nivel] })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Vidas de cada um' }), opcoes([[3, '3'], [5, '5'], [7, '7'], [10, '10']], 'vidas'),
      el('small', { class: 'tr-ajuda', text: 'Bateu com 9: cada um dos outros perde 1 vida; com 10, perde 2. Quem zera sai; ganha o último na mesa.' })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Curinga' }), opcoes([['naipe', 'Mesmo naipe'], ['cor', 'Mesma cor'], ['sem', 'Sem curinga']], 'curinga'),
      el('small', { class: 'tr-ajuda', html: cfg.curinga === 'sem' ? 'Ninguém é curinga: só jogos com as cartas de verdade.'
        : `A carta logo acima da vira é o curinga: vira ${mini('5h')} → curinga ${mini('6h', true)}${cfg.curinga === 'cor' ? ` e ${mini('6d', true)} (os dois vermelhos)` : ' (as duas cópias)'}.` })));
    const chave = (campo, titulo, sub) => el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg[campo] ? true : null, onchange: e => { cfg[campo] = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: `<b>${titulo}</b><br><small>${sub}</small>` }));
    box.appendChild(el('div', { class: 'campo uno-casa' }, el('span', { text: 'Regras e ajudas' }),
      chave('furar', 'Furar a fila', 'Quem bate com a carta que alguém acabou de descartar pode pegá-la fora da vez (vale primeiro quem bate com 10).'),
      chave('descartes', 'Mostrar o que cada um descartou', 'As últimas cartas que cada jogador jogou no lixo ficam ao lado dele. Desligado, é preciso lembrar.')));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), opcoes([['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']], 'coach')));
    const perfis = el('div', { class: 'tr-perfis' });
    IA.LISTA_PERFIS.forEach(id => {
      const p = IA.PERFIS[id];
      perfis.appendChild(el('div', { class: 'tr-perfil' }, el('span', { class: 'tag-perfil', style: { '--cor-perfil': p.cor }, text: p.sigla }), el('div', {}, el('b', { text: p.nome }), el('span', { text: p.descricao }))));
    });
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Adversários sorteados a cada partida' }), perfis));
    box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
      if (salva && !(await P.UI.confirmar('Começar outra?', 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
      Dados.descartar();
      P.UICachetaMesa.iniciar({ n: cfg.jogadores });
    } }));
    return box;
  }

  function regras() {
    const box = el('section', { class: 'painel tr-regras ca-regras' });
    box.appendChild(el('h2', { text: 'Como jogar' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    box.appendChild(sec('O objetivo', true,
      p('São <b>dois baralhos</b> de 52 cartas. Cada um recebe <b>9 cartas</b> e tenta juntá-las em <b>jogos</b>. Quem fecha a mão primeiro <b>bate</b> e os outros perdem vidas; quem fica sem vidas sai, e ganha o último na mesa.')));
    box.appendChild(sec('Os jogos', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: `<b>Trinca</b>: 3 ou 4 cartas do mesmo valor, de naipes diferentes — ${mini('7s 7h 7d')}.` }),
        el('li', { html: `<b>Sequência</b>: 3 ou mais cartas do mesmo naipe, em seguida — ${mini('4h 5h 6h 7h')}. O Ás vale antes do 2 (${mini('As 2s 3s')}) ou depois do K (${mini('Qd Kd Ad')}), mas não no meio (K-A-2 não vale).` }))));
    box.appendChild(sec('A vira e o curinga', true,
      p(`Depois de dar as cartas, vira-se a de cima do monte: a <b>vira</b>. O <b>curinga</b> é a carta logo acima dela — vira ${mini('5h')}, curinga ${mini('6h', true)} (as duas cópias; na opção "mesma cor", também o ${mini('6d', true)}). Vira K, curinga Ás.`),
      p(`O curinga entra no lugar de qualquer carta, <b>um por jogo</b>: ${mini('9c 9s')} + curinga é trinca; ${mini('3h 5h')} + curinga é sequência. Ele também vale como ele mesmo.`)));
    box.appendChild(sec('A sua vez', true,
      p('<b>Compre</b> a carta de cima do monte ou a de cima do <b>lixo</b> (a última que alguém descartou). Depois <b>descarte</b> uma no lixo — não vale devolver a carta que você acabou de pegar dele.'),
      p('Pegar do lixo mostra a todos o que você está juntando. Os bots reparam.')));
    box.appendChild(sec('Bater e as vidas', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: '<b>Bater com 9</b>: depois de comprar, 9 cartas em jogos e a outra descartada. Cada um dos outros perde <b>1 vida</b>.' }),
        el('li', { html: '<b>Bater com 10</b>: as 10 cartas em jogos (um jogo com 4 ou mais). Cada um perde <b>2 vidas</b>.' }),
        el('li', { html: 'Com as 9 fechadas, dá para <b>esperar a de 10</b>: descarte a que sobra e torça para vir uma "ponta" antes que alguém bata. Na próxima, se não vier, você bate com 9 do mesmo jeito.' }),
        el('li', { html: '<b>Furar a fila</b> (opção): quem bate com a carta que alguém acabou de descartar pode pegá-la fora da vez.' }))));
    box.appendChild(sec('Dicas do coach', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Guarde o que se liga: pares (7♠ 7♦) e cartas vizinhas (5♥ 6♥) viram jogo com uma carta só. Descarte primeiro a carta solta.' }),
        el('li', { html: 'Conte as cópias: cada carta existe duas vezes. Se as duas que você precisa já saíram, aquele jogo morreu.' }),
        el('li', { html: 'Repare no que o próximo pega do lixo: se ele pegou o 7♥, não descarte o 6♥ nem o 8♥ (nem outro 7).' }),
        el('li', { html: 'Curinga não se descarta. E pegue o curinga do lixo sempre que ele aparecer.' }))));
    return box;
  }

  P.UICacheta = { render, regrasNo: () => regras() };
})(window.Poker = window.Poker || {});
