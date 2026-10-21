/* ==========================================================================
   OUTS · Treino Lab — ui-trilha.js
   Aba Trilha: nova partida (cor, nível do bot, voar com 3 peças, coach,
   desfazer), partida salva para continuar, como jogar e as estatísticas.
   O tabuleiro fica em ui-trilha-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const T = P.Trilha, IA = T.IA;
  const A = P.Armazenamento;

  const CHAVE_CFG = 'trilha.config', CHAVE_EST = 'trilha.estat', CHAVE_SALVA = 'trilha.partida';
  const PADRAO_CFG = { cor: 'brancas', nivel: 3, coach: 'sempre', desfazer: true, voar: true };
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
  T.Dados = Dados;

  function render() {
    const raiz = document.getElementById('tela-trilha');
    if (P.UITrilhaMesa && P.UITrilhaMesa.emJogo()) return;
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco xadrez trilha' });
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
    return el('section', { class: 'truco-faixa xadrez-faixa trilha-faixa' },
      el('div', {},
        el('h1', { html: '<b>Trilha</b>, com coach' }),
        el('p', { text: 'O jogo do moinho: 9 peças para cada um, três quadrados e 16 trilhas. Feche três em linha para tirar uma peça do adversário. O coach mostra o melhor lance, avisa da trilha que o adversário vai fechar, ensina a armar duas de uma vez e dá nota a cada lance seu.' })),
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
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UITrilhaMesa.iniciar({ retomar: salva }) }),
          el('button', { class: 'btn', text: 'Descartar', onclick: async () => {
            if (await P.UI.confirmar('Descartar a partida?', 'A partida salva será apagada (não conta como derrota).', 'Descartar', 'Manter')) { Dados.descartar(); render(); }
          } }))));
    }
    const cor = el('div', { class: 'opcoes-linha' });
    [['brancas', 'Brancas'], ['pretas', 'Pretas'], ['sorteio', 'Sorteio']].forEach(([id, txt]) => cor.appendChild(el('button', { class: 'opcao' + (cfg.cor === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.cor = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Você joga de' }), cor, el('small', { class: 'tr-ajuda', text: 'As brancas começam (colocam a primeira peça).' })));
    const niv = el('div', { class: 'xz-niveis' });
    IA.NIVEIS.forEach(n => niv.appendChild(el('button', { class: 'xz-nivel' + (cfg.nivel === n.id ? ' ativo' : ''), onclick: () => { cfg.nivel = n.id; salvar(); } },
      el('span', { class: 'xz-barras', html: '<i></i>'.repeat(n.id) + '<i class="vazia"></i>'.repeat(5 - n.id) }), el('b', { text: n.nome }))));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Nível do bot' }), niv, el('small', { class: 'tr-ajuda', text: IA.nivel(cfg.nivel).descricao })));
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) => coach.appendChild(el('button', { class: 'opcao' + (cfg.coach === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.coach = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach));
    box.appendChild(el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg.voar ? true : null, onchange: e => { cfg.voar = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: '<b>Voar com 3 peças</b><br><small>Quem fica com 3 peças pode levar uma para qualquer casa vazia (a regra mais comum).</small>' })));
    box.appendChild(el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg.desfazer ? true : null, onchange: e => { cfg.desfazer = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: '<b>Permitir desfazer lances</b><br><small>Treino: volte o seu lance (e o do bot) para tentar outro caminho.</small>' })));
    box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
      if (salva && !(await P.UI.confirmar('Começar outra?', 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
      Dados.descartar();
      P.UITrilhaMesa.iniciar({});
    } }));
    return box;
  }

  function regras() {
    const box = el('section', { class: 'painel tr-regras trilha-regras' });
    box.appendChild(el('h2', { text: 'Como jogar' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    box.appendChild(sec('O tabuleiro e o objetivo', true,
      el('div', { class: 'tl-regras-tab', html: P.UITrilhaMesa ? P.UITrilhaMesa.desenhoMini() : '' }),
      p('São <b>24 casas</b> em três quadrados ligados pelo meio dos lados, e <b>16 trilhas</b> (três casas numa linha). Cada um tem <b>9 peças</b>. Ganha quem deixar o adversário com <b>2 peças</b> ou <b>sem lance</b>.')));
    box.appendChild(sec('1ª fase: colocar', true,
      p('Na sua vez, coloque uma peça numa casa vazia qualquer. As brancas começam. Quando as 18 peças estão no tabuleiro, começa a 2ª fase.')));
    box.appendChild(sec('2ª fase: mover', true,
      p('Mova uma peça sua para uma casa <b>vizinha vazia</b>, seguindo as linhas. Peça cercada não anda; quem não tem lance perde.'),
      p('<b>Voar</b> (opção, ligada por padrão): quem fica com <b>3 peças</b> pode levar uma para <b>qualquer casa vazia</b>.')));
    box.appendChild(sec('Fechar trilha', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Fez três em linha (colocando ou movendo), <b>tire uma peça do adversário</b> à sua escolha.' }),
        el('li', { html: 'Não vale tirar peça que esteja numa trilha — a não ser que todas estejam.' }),
        el('li', { html: 'Fechar duas trilhas de uma vez tira uma peça só. Dá para abrir a trilha e fechar de novo no lance seguinte.' }))));
    box.appendChild(sec('Empates', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: `${T.LIMITE_SEM_TIRAR / 2} lances de cada lado, na 2ª fase, sem ninguém tirar peça.` }),
        el('li', { html: 'A mesma posição repetida 3 vezes.' }))));
    box.appendChild(sec('Dicas do coach', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Na 1ª fase, prefira as casas com mais vizinhas (o <b>meio dos lados</b>, com 3 ou 4): os cantos travam fácil.' }),
        el('li', { html: '<b>Trilha dupla</b>: arme duas trilhas por fechar ao mesmo tempo — o adversário só tapa uma.' }),
        el('li', { html: 'O <b>moinho</b>: uma peça que sai de uma trilha e entra em outra a cada lance tira uma peça por vez.' }),
        el('li', { html: 'Não deixe suas peças cercadas na 2ª fase: sem lance você perde, mesmo com mais peças.' }))));
    return box;
  }

  P.UITrilha = { render, regrasNo: () => regras() };
})(window.Poker = window.Poker || {});
