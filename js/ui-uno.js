/* ==========================================================================
   OUTS · Treino Lab — ui-uno.js
   Aba "Última!" (cartas coloridas): nova partida (quantos jogadores, nível
   dos bots, até quantos pontos, regras da casa, coach), partida salva para
   continuar, como jogar e as estatísticas. A mesa fica em ui-uno-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc } = P.UI;
  const U = P.Uno, R = U.Regras, IA = U.IA;
  const A = P.Armazenamento;

  // ------------------------------------------------------------ dados
  const CHAVE_CFG = 'uno.config', CHAVE_EST = 'uno.estat', CHAVE_SALVA = 'uno.partida', CHAVE_LEITURA = 'uno.leitura';
  const PADRAO_CFG = { jogadores: 4, nivel: 'mestre', coach: 'sempre', ate: 200, acumular: false, comprarAtePoder: false, desafio: true };
  const PADRAO_EST = () => ({ partidas: 0, vitorias: 0, maos: 0, maosGanhas: 0, notas: { otima: 0, boa: 0, imprecisa: 0, erro: 0 } });
  const Dados = {
    config() { return Object.assign({}, PADRAO_CFG, A.ler(CHAVE_CFG, {})); },
    salvarConfig(c) { A.gravar(CHAVE_CFG, c); },
    estat() { const e = Object.assign(PADRAO_EST(), A.ler(CHAVE_EST, {})); e.notas = Object.assign(PADRAO_EST().notas, e.notas || {}); return e; },
    alterarEstat(fn) { const e = Dados.estat(); fn(e); A.gravar(CHAVE_EST, e); return e; },
    salva() { const s = A.ler(CHAVE_SALVA, null); return s && s.cfg && s.estado ? s : null; },
    salvar(s) { A.gravar(CHAVE_SALVA, s); },
    descartar() { A.remover(CHAVE_SALVA); },
    leituraVoce() { const c = A.ler(CHAVE_LEITURA, null); return c && typeof c === 'object' && c.blefe ? c : null; },
    salvarLeituraVoce(c) { A.gravar(CHAVE_LEITURA, c); },
    esquecerLeituraVoce() { A.remover(CHAVE_LEITURA); },
    acerto(e) { const n = e.notas, tot = n.otima + n.boa + n.imprecisa + n.erro; return tot ? (n.otima + n.boa) / tot : null; }
  };
  U.Dados = Dados;

  // ------------------------------------------------------------ entrada
  function render() {
    const raiz = document.getElementById('tela-uno');
    if (P.UIUnoMesa && P.UIUnoMesa.emJogo()) return;
    raiz.classList.remove('tela-mesa');
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco uno' });
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
    const leque = [[0, '7'], [2, '+2'], [3, '⇄'], [1, '9']].map(([cor, s], i) =>
      `<span class="un-carta ${R.CORES[cor]}" style="--l:46px;transform:rotate(${-18 + i * 12}deg) translateY(${Math.abs(i - 1.5) * 6}px)"><span class="meio">${s}</span></span>`).join('');
    return el('section', { class: 'truco-faixa uno-faixa' },
      el('div', {},
        el('h1', { html: '<b>Última!</b> o jogo das cartas coloridas' }),
        el('p', { text: 'Combine a cor ou o número da carta da mesa e seja o primeiro a ficar sem cartas. +2, +4, Pular e Inverter mudam tudo — e quando sobrar uma, grite Última! Os bots leem o que você compra e as cores que escolhe; o coach mostra a chance de ganhar com cada jogada.' })),
      el('div', { class: 'uno-faixa-dir' },
        el('div', { class: 'uno-leque', html: leque }),
        el('div', { class: 'lobby-kpis' },
          kpi('Partidas', e.partidas ? `${e.vitorias}/${e.partidas}` : '—'),
          kpi('Mãos ganhas', e.maos ? `${e.maosGanhas}/${e.maos}` : '—'),
          kpi('Jogadas boas', ac === null ? '—' : P.Formato.pct(ac, 0)))));
  }

  function novaPartida() {
    const cfg = Dados.config();
    const salvar = () => { Dados.salvarConfig(cfg); render(); };
    const box = el('section', { class: 'painel truco-novo' });
    box.appendChild(el('h2', { text: 'Nova partida' }));
    const salva = Dados.salva();
    if (salva) {
      const pl = salva.estado.placar;
      box.appendChild(el('div', { class: 'truco-continuar' },
        el('div', { html: `<b>Partida em andamento</b> · ${salva.cfg.n} jogadores · você <b>${pl[0]}</b> pontos (mão ${salva.estado.maoNumero + 1})` }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UIUnoMesa.iniciar({ retomar: salva }) }),
          el('button', { class: 'btn', text: 'Descartar', onclick: async () => {
            if (await P.UI.confirmar('Descartar a partida?', 'A partida salva será apagada (não conta como derrota).', 'Descartar', 'Manter')) { Dados.descartar(); render(); }
          } }))));
    }
    // jogadores
    const jog = el('div', { class: 'opcoes-linha' });
    [2, 3, 4, 5, 6].forEach(x => jog.appendChild(el('button', { class: 'opcao' + (cfg.jogadores === x ? ' ativo' : ''), text: String(x), onclick: () => { cfg.jogadores = x; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Jogadores (com você)' }), jog,
      el('small', { class: 'tr-ajuda', text: cfg.jogadores === 2 ? 'Mano a mano: Inverter vale como Pular.' : `Você e ${cfg.jogadores - 1} bots, cada um por si.` })));
    // nível
    const niv = el('div', { class: 'opcoes-linha' });
    [['mestre', 'Mestre'], ['medio', 'Médio'], ['facil', 'Fácil']].forEach(([id, txt]) => niv.appendChild(el('button', { class: 'opcao' + (cfg.nivel === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.nivel = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Nível dos bots' }), niv,
      el('small', { class: 'tr-ajuda', text: { mestre: 'Simulam cada jogada até o fim da mão e leem o que você tem pelo que compra e pelas cores que escolhe.', medio: 'Fazem a conta, mas com menos cuidado, e às vezes jogam no impulso.', facil: 'Jogam qualquer carta que sirva. Bom para aprender as regras.' }[cfg.nivel] })));
    // até quantos pontos
    const ate = el('div', { class: 'opcoes-linha' });
    [[0, 'Uma mão'], [200, '200 pontos'], [500, '500 pontos']].forEach(([x, txt]) => ate.appendChild(el('button', { class: 'opcao' + (cfg.ate === x ? ' ativo' : ''), text: txt, onclick: () => { cfg.ate = x; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Partida' }), ate,
      el('small', { class: 'tr-ajuda', text: cfg.ate ? `Quem zera a mão marca os pontos das cartas dos outros; ganha quem chegar a ${cfg.ate}. (A regra oficial é 500.)` : 'Só uma mão: ganha quem zerar as cartas primeiro.' })));
    // regras da casa
    const chave = (campo, titulo, sub) => el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', checked: cfg[campo] ? true : null, onchange: e => { cfg[campo] = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: `<b>${titulo}</b><br><small>${sub}</small>` }));
    box.appendChild(el('div', { class: 'campo uno-casa' }, el('span', { text: 'Regras' }),
      chave('desafio', 'Desafio do +4 (oficial)', 'O +4 só vale sem carta da cor da mesa; quem recebe pode desafiar. Desligado: o jogo nem deixa jogar o +4 com a cor na mão.'),
      chave('acumular', 'Acumular +2 e +4 (da casa)', 'Quem recebe +2 pode passar adiante com outro +2 (ou +4); o próximo compra tudo.'),
      chave('comprarAtePoder', 'Comprar até poder jogar (da casa)', 'Sem jogada, compra até sair uma carta que sirva.')));
    // coach
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) => coach.appendChild(el('button', { class: 'opcao' + (cfg.coach === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.coach = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach));
    // adversários
    const perfis = el('div', { class: 'tr-perfis' });
    IA.LISTA_PERFIS.forEach(id => {
      const p = IA.PERFIS[id];
      perfis.appendChild(el('div', { class: 'tr-perfil' }, el('span', { class: 'tag-perfil', style: { '--cor-perfil': p.cor }, text: p.sigla }), el('div', {}, el('b', { text: p.nome }), el('span', { text: p.descricao }))));
    });
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Adversários sorteados a cada partida' }), perfis));
    const lembra = Dados.leituraVoce();
    box.appendChild(el('p', { class: 'tr-memoria' },
      el('span', { text: lembra ? 'Os bots lembram de você: quanto blefa no +4 e quanto desafia. ' : 'Os bots aprendem quanto você blefa no +4 e quanto desafia, e lembram nas próximas partidas. ' }),
      lembra ? el('button', { class: 'link', text: 'Fazer eles esquecerem', onclick: async () => {
        if (await P.UI.confirmar('Apagar a memória dos bots?', 'Eles voltam a jogar contra você como se fosse a primeira vez.', 'Apagar', 'Cancelar')) { Dados.esquecerLeituraVoce(); render(); }
      } }) : null));
    box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
      if (salva && !(await P.UI.confirmar('Começar outra?', 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
      Dados.descartar();
      P.UIUnoMesa.iniciar({ n: cfg.jogadores });
    } }));
    return box;
  }

  /** Mini carta para os textos (HTML). */
  const mini = (cor, s) => `<span class="un-mini ${cor}">${s}</span>`;

  function regras() {
    const box = el('section', { class: 'painel tr-regras uno-regras' });
    box.appendChild(el('h2', { text: 'Como jogar' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    box.appendChild(sec('O objetivo', true,
      p('Cada um recebe <b>7 cartas</b>. Ganha a mão quem ficar <b>sem cartas</b> primeiro. Ele marca os pontos das cartas que sobraram na mão dos outros: número vale o número; Pular, Inverter e +2 valem <b>20</b>; coringas valem <b>50</b>.'),
      p('Na partida por pontos, ganha quem chegar primeiro ao total combinado (200 ou 500).')));
    box.appendChild(sec('A sua vez', true,
      p(`Jogue uma carta que combine com a de cima da pilha: <b>mesma cor</b> (${mini('verde', '3')} em ${mini('verde', '8')}), <b>mesmo número</b> (${mini('azul', '8')} em ${mini('verde', '8')}) ou <b>mesmo símbolo</b> (${mini('vermelho', '+2')} em ${mini('azul', '+2')}). Os <b>coringas</b> combinam com tudo e você escolhe a cor que vale dali em diante.`),
      p('Não tem jogada (ou não quer jogar)? <b>Compre</b> uma carta. Se ela servir, pode jogá-la na hora; senão, passa a vez.')));
    box.appendChild(sec('As cartas especiais', true,
      el('ul', { class: 'tr-lista' },
        el('li', { html: `${mini('amarelo', '⊘')} <b>Pular</b>: o próximo perde a vez.` }),
        el('li', { html: `${mini('verde', '⇄')} <b>Inverter</b>: muda o sentido. Com 2 jogadores, vale como Pular.` }),
        el('li', { html: `${mini('vermelho', '+2')} <b>+2</b>: o próximo compra 2 e perde a vez.` }),
        el('li', { html: `${mini('coringa', '★')} <b>Coringa</b>: escolha a cor.` }),
        el('li', { html: `${mini('coringa', '+4')} <b>Coringa +4</b>: escolha a cor; o próximo compra 4 e perde a vez. Só vale quando você <b>não tem carta da cor da mesa</b>. Quem recebe pode <b>desafiar</b>: se era blefe, quem jogou compra 4; se não era, quem desafiou compra 6.` }))));
    box.appendChild(sec('Última!', true,
      p('Quando for jogar a <b>penúltima</b> carta, aperte <b>Última!</b> antes. Se esquecer e alguém perceber antes do próximo jogar, você compra 2. E se um bot esquecer, aperte <b>Pegou!</b> rápido.')));
    box.appendChild(sec('Dicas do coach', false,
      el('ul', { class: 'tr-lista' },
        el('li', { html: 'Guarde os <b>coringas</b> para quando não tiver jogada — e para o fim, quando valem 50 pontos se ficarem na mão de alguém.' }),
        el('li', { html: 'Use <b>+2 e Pular</b> em quem está com poucas cartas.' }),
        el('li', { html: 'Repare em quem <b>compra</b>: se alguém comprou com a mesa em azul, provavelmente não tem azul. Leve a mesa para essa cor quando ele for o próximo.' }),
        el('li', { html: 'Quando alguém está perto de sair, solte as cartas de <b>mais pontos</b>.' }))));
    return box;
  }

  P.UIUno = { render, regrasNo: () => regras() };
})(window.Poker = window.Poker || {});
