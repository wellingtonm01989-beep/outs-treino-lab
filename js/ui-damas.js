/* ==========================================================================
   OUTS · Treino Lab — ui-damas.js
   Aba Damas: nova partida (cor, nível do bot, coach, desfazer), partida
   salva para continuar, como jogar (regras brasileiras) e as estatísticas.
   O tabuleiro fica em ui-damas-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const D = P.Damas, IA = D.IA;
  const A = P.Armazenamento;

  const CHAVE_CFG = 'damas.config', CHAVE_EST = 'damas.estat', CHAVE_SALVA = 'damas.partida';
  const PADRAO_CFG = { cor: 'brancas', nivel: 3, coach: 'sempre', desfazer: true };
  const PADRAO_EST = () => ({ partidas: 0, vitorias: 0, empates: 0, derrotas: 0, porNivel: {}, notas: { otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0 } });
  const Dados = {
    config() { return Object.assign({}, PADRAO_CFG, A.ler(CHAVE_CFG, {})); },
    salvarConfig(c) { A.gravar(CHAVE_CFG, c); },
    estat() { const e = Object.assign(PADRAO_EST(), A.ler(CHAVE_EST, {})); e.notas = Object.assign(PADRAO_EST().notas, e.notas || {}); e.porNivel = e.porNivel || {}; return e; },
    alterarEstat(fn) { const e = Dados.estat(); fn(e); A.gravar(CHAVE_EST, e); return e; },
    salva() { const s = A.ler(CHAVE_SALVA, null); return s && s.cfg && Array.isArray(s.lances) ? s : null; },
    salvar(s) { A.gravar(CHAVE_SALVA, s); },
    descartar() { A.remover(CHAVE_SALVA); },
    precisao(e) { const n = e.notas, tot = n.otima + n.boa + n.imprecisa + n.erro + n.grave; return tot ? (n.otima + n.boa) / tot : null; }
  };
  D.Dados = Dados;

  function render() {
    const raiz = document.getElementById('tela-damas');
    if (P.UIDamasMesa && P.UIDamasMesa.emJogo()) return;
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco xadrez damas' });
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
    let maior = 0;
    Object.keys(e.porNivel).forEach(k => { if (e.porNivel[k].v > 0) maior = Math.max(maior, +k); });
    return el('section', { class: 'truco-faixa xadrez-faixa damas-faixa' },
      el('div', {},
        el('h1', { html: '<b>Damas</b> brasileiras, com coach' }),
        el('p', { text: 'Regras da Confederação Brasileira: a pedra come para trás, a captura é obrigatória (e a que come mais) e a dama corre a diagonal inteira. O coach mostra o melhor lance, avisa do golpe que o adversário prepara e dá nota a cada lance seu.' })),
      el('div', { class: 'lobby-kpis' },
        kpi('Partidas', e.partidas ? `${e.vitorias}V ${e.empates}E ${e.derrotas}D` : '—'),
        kpi('Lances bons', pr === null ? '—' : P.Formato.pct(pr, 0)),
        kpi('Maior nível vencido', maior ? IA.nivel(maior).nome : '—')));
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
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UIDamasMesa.iniciar({ retomar: salva }) }),
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
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) => coach.appendChild(el('button', { class: 'opcao' + (cfg.coach === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.coach = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach));
    box.appendChild(el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg.desfazer ? true : null, onchange: e => { cfg.desfazer = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: '<b>Permitir desfazer lances</b><br><small>Treino: volte o seu lance (e o do bot) para tentar outro caminho.</small>' })));
    box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
      if (salva && !(await P.UI.confirmar('Começar outra?', 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
      Dados.descartar();
      P.UIDamasMesa.iniciar({});
    } }));
    return box;
  }

  function regras() {
    const box = el('section', { class: 'painel tr-regras damas-regras' });
    box.appendChild(el('h2', { text: 'Como jogar' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    const peca = (cor, dama) => `<span class="dm-mini">${P.UIDamasMesa ? P.UIDamasMesa.pecaSVG(cor, dama) : ''}</span>`;
    box.appendChild(sec('O objetivo', true,
      p(`Cada um começa com <b>12 pedras</b> ${peca(1)}${peca(-1)} nas casas escuras. Ganha quem <b>comer todas</b> as peças do outro ou deixá-lo <b>sem lance</b>. As brancas começam.`)));
    box.appendChild(sec('A pedra', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Anda <b>uma casa na diagonal, só para frente</b>.' }),
        el('li', { html: 'Come <b>pulando</b> a peça do adversário que está colada nela, caindo na casa vazia logo depois — <b>para frente ou para trás</b>. Se depois dá para comer outra, continua no mesmo lance.' }),
        el('li', { html: `Chegou à última fila, vira <b>dama</b> ${peca(1, true)}. Se só passar por ela no meio de uma captura e continuar comendo, segue como pedra.` }))));
    box.appendChild(sec('A dama', true,
      p('Anda <b>quantas casas quiser na diagonal</b>, para frente e para trás. Come à distância: pula a peça do adversário (com casa vazia depois) e pode parar em qualquer casa livre depois dela — e continuar comendo.')));
    box.appendChild(sec('Captura obrigatória e lei da maioria', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Se dá para comer, <b>é obrigatório</b> comer (não existe "sopro").' }),
        el('li', { html: 'Havendo mais de um jeito, vale a <b>lei da maioria</b>: é obrigatório o que come <b>mais peças</b> (pedra e dama contam igual).' }),
        el('li', { html: 'As peças comidas só saem no fim do lance e não dá para pular a mesma peça duas vezes. Duas peças coladas na diagonal não podem ser comidas juntas.' }))));
    box.appendChild(sec('Empates', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: '20 lances seguidos (de cada lado) só com damas, sem captura nem movimento de pedra.' }),
        el('li', { html: 'Nos finais de 2 damas contra 2, 2 contra 1, 2 contra 1 dama e 1 pedra, 1 contra 1 e 1 contra 1 dama e 1 pedra: depois de 5 lances.' }),
        el('li', { html: 'A mesma posição repetida 3 vezes.' }))));
    box.appendChild(sec('Dicas do coach', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: '<b>Golpe</b>: como a captura é obrigatória, dá para entregar uma pedra e obrigar o adversário a cair onde você come duas ou três. Antes de cada lance, olhe o que ele é obrigado a fazer depois.' }),
        el('li', { html: 'Pedras <b>juntas</b> se protegem: uma pedra sozinha na frente costuma ser comida.' }),
        el('li', { html: 'Segure a <b>última fila</b> (a sua primeira) o máximo que der: ela impede o adversário de fazer dama.' }),
        el('li', { html: 'A dama na <b>grande diagonal</b> (a1–h8) controla o tabuleiro.' }))));
    return box;
  }

  P.UIDamas = { render, regrasNo: () => regras() };
})(window.Poker = window.Poker || {});
