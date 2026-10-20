/* ==========================================================================
   OUTS · Treino Lab — ui-truco.js
   Aba Truco: partida avulsa ou torneio (1 contra 1 ou em dupla com um
   parceiro bot), nas regras paulista ou paranaense; continuar a partida ou o
   torneio salvos; como jogar (com as cartas na tela), treino de cartas (qual
   é a manilha, qual carta ganha), a opção de esconder a manilha na mesa e os
   números do seu jogo. A mesa fica em ui-truco-mesa.js e a chave do torneio
   em ui-truco-torneio.js. Aqui também ficam as preferências, as estatísticas,
   a partida e o torneio salvos.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc } = P.UI;
  const T = P.Truco, R = T.Regras, IA = T.IA, CO = T.Coach;
  const A = P.Armazenamento;

  // ------------------------------------------------------------ dados
  const CHAVE_CFG = 'truco.config', CHAVE_EST = 'truco.estat', CHAVE_SALVA = 'truco.partida', CHAVE_TORNEIO = 'truco.torneio';
  const PADRAO_EST = () => ({ partidas: 0, vitorias: 0, maos: 0, notas: { otima: 0, boa: 0, imprecisa: 0, erro: 0, blefe: 0 }, quizMelhor: 0, quizFeitos: 0,
    torneios: { jogados: 0, titulos: 0, finais: 0 } });
  const PADRAO_CFG = { jogadores: 4, coach: 'sempre', regras: 'paulista', esconderManilha: false, aba: 'partida', participantes: 8, melhorDe: 1 };
  const Dados = {
    config() { return Object.assign({}, PADRAO_CFG, A.ler(CHAVE_CFG, {})); },
    salvarConfig(c) { A.gravar(CHAVE_CFG, c); },
    estat() {
      const e = Object.assign(PADRAO_EST(), A.ler(CHAVE_EST, {}));
      e.notas = Object.assign(PADRAO_EST().notas, e.notas || {});
      e.torneios = Object.assign(PADRAO_EST().torneios, e.torneios || {});
      return e;
    },
    alterarEstat(fn) { const e = Dados.estat(); fn(e); A.gravar(CHAVE_EST, e); return e; },
    zerarEstat() { A.gravar(CHAVE_EST, PADRAO_EST()); },
    salva() { const s = A.ler(CHAVE_SALVA, null); return s && s.cfg && s.estado ? s : null; },
    salvar(s) { A.gravar(CHAVE_SALVA, s); },
    descartar() { A.remover(CHAVE_SALVA); },
    torneio() { const t = A.ler(CHAVE_TORNEIO, null); return t && t.rodadas && t.participantes ? t : null; },
    salvarTorneio(t) { A.gravar(CHAVE_TORNEIO, t); },
    descartarTorneio() { A.remover(CHAVE_TORNEIO); },
    /** % de decisões boas (ótimas + boas + blefes) entre as avaliadas. */
    acerto(e) {
      const n = e.notas, tot = n.otima + n.boa + n.imprecisa + n.erro + n.blefe;
      return tot ? (n.otima + n.boa + n.blefe) / tot : null;
    }
  };
  T.Dados = Dados;

  // ------------------------------------------------------------ entrada
  let telaTorneio = false;      // com um torneio aberto, a aba mostra a chave dele (ou a entrada)

  function render() {
    const raiz = document.getElementById('tela-truco');
    if (P.UITrucoMesa && P.UITrucoMesa.emJogo()) return;     // a mesa está na tela
    raiz.classList.remove('tela-mesa');
    if (telaTorneio && Dados.torneio()) { P.UITrucoTorneio.render(raiz); return; }
    telaTorneio = false;
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco' });
    pag.appendChild(faixa());
    const grade = el('div', { class: 'truco-grade' });
    // no celular a nova partida vem primeiro; no PC as regras ficam à esquerda
    grade.appendChild(el('div', { class: 'truco-col col-novo' }, novaPartida()));
    grade.appendChild(el('div', { class: 'truco-col col-regras' }, regras(Dados.config().regras)));
    pag.appendChild(grade);
    raiz.appendChild(pag);
  }
  function abrirTorneio() { telaTorneio = true; render(); }
  function abrirEntrada() { telaTorneio = false; render(); }

  function faixa() {
    const e = Dados.estat();
    const ac = Dados.acerto(e);
    const kpi = (rot, val) => el('div', { class: 'kpi' }, el('small', { text: rot }), el('b', { text: val }));
    return el('section', { class: 'truco-faixa' },
      el('div', {},
        el('h1', { html: '<b>Truco</b> paulista e paranaense' }),
        el('p', { text: 'Aprenda a jogar contra bots, sozinho ou em dupla, em partidas avulsas ou em torneios. O coach mostra a conta de cada decisão: a chance de ganhar a mão, qual carta jogar, quando pedir truco e quando vale aceitar ou correr.' })),
      el('div', { class: 'lobby-kpis' },
        kpi('Partidas', e.partidas ? `${e.vitorias}/${e.partidas}` : '—'),
        kpi('Torneios', e.torneios.jogados ? `${e.torneios.titulos} ${e.torneios.titulos === 1 ? 'título' : 'títulos'}` : '—'),
        kpi('Decisões boas', ac === null ? '—' : P.Formato.pct(ac, 0))));
  }

  function svgFormato(n) {
    // mesinha vista de cima com 2 ou 4 lugares (você em dourado, parceiro em verde)
    const lug = n === 2 ? [[32, 34, 'v'], [32, 6, 'a']] : [[32, 34, 'v'], [58, 20, 'a'], [32, 6, 'p'], [6, 20, 'a']];
    const cor = { v: '#d8b25a', p: '#2fbf71', a: '#ef5350' };
    return `<svg viewBox="0 0 64 40"><rect x="8" y="7" width="48" height="26" rx="13" fill="#17603f" stroke="#2a1d14" stroke-width="3"/>${lug.map(([x, y, t]) => `<circle cx="${x}" cy="${y}" r="5" fill="${cor[t]}" stroke="#0a0e13" stroke-width="1.5"/>`).join('')}</svg>`;
  }

  const DESC_REGRAS = {
    paulista: 'Truco, seis, nove e doze. Três empates: ninguém marca.',
    paranaense: 'Regras da Federação Paranaense: truco e retruco (só até 8 pontos), troca de cartas na mão de 11 e empate decidido pelo pedido no escuro.'
  };
  const PARTICIPANTES_RAPIDOS = [4, 8, 16, 32];

  function novaPartida() {
    const cfg = Dados.config();
    const salvar = () => { Dados.salvarConfig(cfg); render(); };
    const box = el('section', { class: 'painel truco-novo' });
    const salva = Dados.salva();
    const torneio = Dados.torneio();
    const TT = T.Torneio;
    if (torneio) {
      const camp = TT.campanha(torneio);
      const n = torneio.participantes.length;
      box.appendChild(el('div', { class: 'truco-continuar' },
        el('div', { html: `<b>Torneio ${torneio.regras === 'paranaense' ? 'paranaense' : 'paulista'}</b> · ${n} ${torneio.n === 4 ? 'duplas' : 'jogadores'} · ${esc(camp.texto)}` }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn btn-ouro', text: 'Abrir o torneio', onclick: abrirTorneio }))));
    }
    if (salva && !salva.cfg.torneio) {
      const pl = salva.estado.placar;
      box.appendChild(el('div', { class: 'truco-continuar' },
        el('div', { html: `<b>Partida em andamento</b> · ${salva.cfg.regras === 'paranaense' ? 'paranaense' : 'paulista'} · ${salva.cfg.n === 4 ? 'em dupla' : '1 contra 1'} · vocês <b>${pl[0]}</b> × <b>${pl[1]}</b> eles` }),
        el('div', { class: 'linha' },
          el('button', { class: 'btn btn-ouro', text: 'Continuar', onclick: () => P.UITrucoMesa.iniciar({ retomar: salva }) }),
          el('button', { class: 'btn', text: 'Descartar', onclick: async () => {
            if (await P.UI.confirmar('Descartar a partida?', 'A partida salva será apagada (não conta como derrota).', 'Descartar', 'Manter')) { Dados.descartar(); render(); }
          } }))));
    }

    // partida avulsa ou torneio
    const abas = el('div', { class: 'abas tr-abas' });
    [['partida', 'Partida'], ['torneio', 'Torneio']].forEach(([id, txt]) => abas.appendChild(el('button', {
      class: cfg.aba === id ? 'ativo' : '', text: txt, onclick: () => { cfg.aba = id; salvar(); } })));
    box.appendChild(abas);
    const ehTorneio = cfg.aba === 'torneio';

    // regras
    const reg = el('div', { class: 'opcoes-linha' });
    [['paulista', 'Paulista'], ['paranaense', 'Paranaense']].forEach(([id, txt]) => reg.appendChild(el('button', {
      class: 'opcao' + (cfg.regras === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.regras = id; salvar(); } })));
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Regras' }), reg,
      el('small', { class: 'tr-ajuda', text: DESC_REGRAS[cfg.regras] || DESC_REGRAS.paulista })));

    // formato
    const fmt = el('div', { class: 'tr-formato' });
    [[4, 'Em dupla', ehTorneio ? 'Você e um parceiro bot; as outras duplas são bots' : 'Você e um parceiro bot contra dois'],
      [2, '1 contra 1', ehTorneio ? 'Cada um por si, contra bots' : 'Você contra um bot']].forEach(([n, titulo, sub]) => {
      fmt.appendChild(el('button', { class: cfg.jogadores === n ? 'ativo' : '', onclick: () => { cfg.jogadores = n; salvar(); } },
        el('span', { html: svgFormato(n) }), el('b', { text: titulo }), el('small', { text: sub })));
    });
    box.appendChild(fmt);

    if (ehTorneio) {
      // quantos participantes (jogadores ou duplas), escolhido à vontade
      const qtd = Math.max(TT.MIN_PARTICIPANTES, Math.min(TT.MAX_PARTICIPANTES, cfg.participantes || 8));
      const unidade = cfg.jogadores === 4 ? 'duplas' : 'jogadores';
      const linha = el('div', { class: 'opcoes-linha tr-participantes' });
      PARTICIPANTES_RAPIDOS.forEach(x => linha.appendChild(el('button', { class: 'opcao' + (qtd === x ? ' ativo' : ''), text: String(x), onclick: () => { cfg.participantes = x; salvar(); } })));
      const menos = el('button', { class: 'opcao tr-passo', text: '−', title: 'Menos um', 'aria-label': 'Menos um participante', onclick: () => { cfg.participantes = Math.max(TT.MIN_PARTICIPANTES, qtd - 1); salvar(); } });
      const campo = el('input', { class: 'entrada tr-qtd', id: 'tr-qtd', type: 'number', inputmode: 'numeric', min: TT.MIN_PARTICIPANTES, max: TT.MAX_PARTICIPANTES, value: qtd, 'aria-label': 'Número de participantes' });
      campo.addEventListener('change', () => { cfg.participantes = Math.max(TT.MIN_PARTICIPANTES, Math.min(TT.MAX_PARTICIPANTES, Math.round(+campo.value) || qtd)); salvar(); });
      const mais = el('button', { class: 'opcao tr-passo', text: '+', title: 'Mais um', 'aria-label': 'Mais um participante', onclick: () => { cfg.participantes = Math.min(TT.MAX_PARTICIPANTES, qtd + 1); salvar(); } });
      linha.appendChild(el('span', { class: 'tr-stepper' }, menos, campo, mais));
      let fases = 0; for (let x = 1; x < qtd; x *= 2) fases++;
      let tam = 1; while (tam < qtd) tam *= 2;
      const byes = tam - qtd;
      const pessoas = cfg.jogadores === 4 ? ` (${qtd * 2} pessoas)` : '';
      box.appendChild(el('div', { class: 'campo' }, el('span', { text: `Participantes: ${qtd} ${unidade}${pessoas}, contando você` }), linha,
        el('small', { class: 'tr-ajuda', text: `Mata-mata em ${fases} ${fases === 1 ? 'fase' : 'fases'}` + (byes ? `; ${byes} ${byes === 1 ? 'passa' : 'passam'} direto da primeira fase (sorteio).` : '.') + ` De ${TT.MIN_PARTICIPANTES} a ${TT.MAX_PARTICIPANTES} ${unidade}.` })));
      const md = el('div', { class: 'opcoes-linha' });
      [[1, 'Uma partida'], [3, 'Melhor de 3']].forEach(([x, txt]) => md.appendChild(el('button', {
        class: 'opcao' + (cfg.melhorDe === x ? ' ativo' : ''), text: txt, onclick: () => { cfg.melhorDe = x; salvar(); } })));
      box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Cada confronto' }), md));
    }

    // coach e treino
    const coach = el('div', { class: 'opcoes-linha' });
    [['sempre', 'Dicas sempre'], ['pedido', 'Sob pedido'], ['desligado', 'Desligado']].forEach(([id, txt]) => {
      coach.appendChild(el('button', { class: 'opcao' + (cfg.coach === id ? ' ativo' : ''), text: txt, onclick: () => { cfg.coach = id; salvar(); } }));
    });
    box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Coach durante a partida' }), coach,
      el('small', { class: 'tr-ajuda', text: cfg.coach === 'desligado'
        ? 'Sem dicas na mesa: o coach só avalia, e no fim mostra como você foi.'
        : 'Depois de cada decisão sua aparece a nota (ótima, boa, imprecisa, erro). No fim, o resumo da partida.' })));
    box.appendChild(el('label', { class: 'chave tr-chave' },
      el('input', { type: 'checkbox', id: 'tr-esconder-manilha', checked: cfg.esconderManilha ? true : null, onchange: e => { cfg.esconderManilha = e.target.checked; Dados.salvarConfig(cfg); } }), el('i'),
      el('span', { html: '<b>Esconder a manilha</b><br><small>Treino: a mesa não diz qual é a manilha nem o nome das suas cartas fortes; você descobre pela vira. Ela aparece no resumo do fim de cada mão.</small>' })));

    if (!ehTorneio) {
      const perfis = el('div', { class: 'tr-perfis' });
      IA.LISTA_PERFIS.forEach(id => {
        const p = IA.PERFIS[id];
        perfis.appendChild(el('div', { class: 'tr-perfil' },
          el('span', { class: 'tag-perfil', style: { '--cor-perfil': p.cor }, text: p.sigla }),
          el('div', {}, el('b', { text: p.nome }), el('span', { text: p.descricao }))));
      });
      box.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Adversários sorteados a cada partida' }), perfis));
      box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: salva && !salva.cfg.torneio ? 'Começar outra partida' : 'Começar partida', onclick: async () => {
        if (salva && !(await P.UI.confirmar('Começar outra?', salva.cfg.torneio ? 'O jogo do torneio que estava em andamento recomeça do 0 a 0 quando você voltar a ele.' : 'A partida em andamento será descartada.', 'Começar', 'Cancelar'))) return;
        Dados.descartar();
        P.UITrucoMesa.iniciar({ n: cfg.jogadores, regras: cfg.regras });
      } }));
    } else {
      box.appendChild(el('small', { class: 'tr-ajuda', text: 'Os adversários são bots Cauteloso, Esperto e Trucador, sorteados. Os outros jogos da chave são partidas de verdade entre eles.' }));
      box.appendChild(el('button', { class: 'btn btn-ouro btn-sentar', text: torneio ? 'Começar outro torneio' : 'Começar torneio', onclick: async () => {
        if (torneio && !(await P.UI.confirmar('Começar outro torneio?', 'O torneio em andamento será abandonado.', 'Começar outro', 'Cancelar'))) return;
        if (torneio) P.UITrucoTorneio.abandonar(torneio);
        const t = TT.criar({ regras: cfg.regras, n: cfg.jogadores, participantes: cfg.participantes, melhorDe: cfg.melhorDe, nome: P.Config.get('nome') || 'Você' });
        Dados.salvarTorneio(t);
        abrirTorneio();
      } }));
    }
    box.appendChild(el('button', { class: 'btn', text: 'Treino de cartas: manilhas e quem ganha', onclick: abrirQuiz }));
    return box;
  }

  // ------------------------------------------------------------ regras
  const cartaMini = (c, l) => { const d = P.UI.carta(c); if (l) d.style.setProperty('--l', l + 'px'); return d; };

  function faixaOrdem(vira) {
    // 4 5 6 7 Q J K A 2 3 (um de cada, em naipes variados) — com a vira, as manilhas no fim
    const box = el('div', { class: 'tr-ordem' });
    const manilha = vira !== undefined ? R.manilhaDe(vira) : null;
    R.ORDEM.forEach((rank, i) => {
      if (rank === manilha) return;
      box.appendChild(el('div', { class: 'rot' }, cartaMini(rank * 4 + (i % 4)), el('span', { text: R.ROTULO_RANK[rank] })));
    });
    if (manilha !== null) {
      [2, 0, 1, 3].forEach(nai => box.appendChild(el('div', { class: 'rot manilha' }, cartaMini(manilha * 4 + nai), el('span', { text: R.NOME_MANILHA[nai] }))));
    }
    return box;
  }

  function regras(variante) {
    const parana = variante === 'paranaense';
    const box = el('section', { class: 'painel tr-regras' });
    box.appendChild(el('h2', { text: parana ? 'Como jogar · paranaense' : 'Como jogar · paulista' }));
    const sec = (titulo, aberto, ...conteudo) => {
      const d = el('details', aberto ? { open: true } : {});
      d.appendChild(el('summary', { text: titulo }));
      d.appendChild(el('div', { class: 'corpo' }, ...conteudo));
      return d;
    };
    const p = html => el('p', { html });
    const vira7 = 5 * 4 + 2;     // 7♦ → manilha é a dama
    box.appendChild(sec('O objetivo', true,
      p('Fazer <b>12 pontos</b> antes do outro lado. Cada mão vale <b>1 ponto</b> — ou mais, se alguém pedir <b>truco</b>.'),
      p('Cada um recebe <b>3 cartas</b>. A mão tem até <b>3 rodadas</b>: em cada uma, todo mundo joga uma carta e a mais forte ganha. Quem ganhar <b>2 rodadas</b> leva a mão.')));
    if (parana) box.appendChild(sec('O que muda no paranaense', true,
      p('Baralho, vira, manilhas e rodadas são iguais aos do paulista. As diferenças, pelo regulamento da Federação Paranaense de Truco:'),
      el('ul', { class: 'tr-lista' },
        el('li', { html: '<b>Truco e retruco.</b> O truco vale 3 e o retruco vale 6; não tem nove nem doze. Correr do truco dá 1 ponto ao outro lado; correr do retruco dá 3.' }),
        el('li', { html: '<b>Retruco só até 8 pontos.</b> Com 9 pontos ou mais a dupla não pode retrucar (com 9, o truco já fecha a partida).' }),
        el('li', { html: '<b>Troca na mão de 11.</b> A dupla que está com 11 vê as cartas do parceiro e, se resolver jogar, pode trocar cartas entre os dois. A outra dupla não troca.' }),
        el('li', { html: '<b>Três empates na mão de 11:</b> os 3 pontos vão para quem não está com 11. Com 11 a 11, ninguém marca.' }),
        el('li', { html: '<b>Empate com truco:</b> se a mão terminar em três empates depois de um truco ou retruco, o ponto é de quem pediu <b>no escuro</b> (sem ter visto a carta do adversário naquela rodada) e é contra quem pediu <b>com carta exposta</b> (já vendo a carta dele).' }))));
    box.appendChild(sec('A força das cartas', true,
      p('O baralho não tem 8, 9 e 10 (sobram 40 cartas). Da mais fraca para a mais forte:'),
      faixaOrdem(),
      el('div', { class: 'tr-legenda-ordem' }, el('span', { text: '← mais fraca' }), el('span', { text: 'mais forte →' })),
      p('Nas cartas comuns o naipe não importa: dois 3 de naipes diferentes <b>empatam</b>. Repare: a <b>dama (Q) perde para o valete (J)</b>, diferente de outros jogos.')));
    box.appendChild(sec('A vira e as manilhas', true,
      p('Depois de dar as cartas, vira-se uma carta na mesa: a <b>vira</b>. As <b>manilhas</b> são as cartas logo acima da vira na ordem. Se a vira é 7, a manilha é a <b>dama</b>; se a vira é 3, a manilha é o <b>4</b> (dá a volta).'),
      p('As quatro manilhas ganham de todas as outras cartas, e entre elas vale o naipe: ♦ <b>pica-fumo</b> &lt; ♠ <b>espadilha</b> &lt; ♥ <b>copas</b> &lt; ♣ <b>zap</b>. Com a vira 7♦, a ordem fica assim:'),
      faixaOrdem(vira7)));
    box.appendChild(sec('Rodadas e empates', false,
      p('Quem ganha uma rodada começa a próxima. Se a rodada empatar, começa quem jogou primeiro a carta mais alta.'),
      p('<b>Empates:</b> se a 1ª rodada empatar, quem ganhar a 2ª leva a mão. Se a 2ª ou a 3ª empatar, leva quem ganhou a 1ª. Se as três empatarem, ninguém marca ponto.'),
      p('<b>Carta coberta:</b> da 2ª rodada em diante, dá para jogar uma carta virada para baixo. Ela perde para qualquer outra, mas esconde o que você tem.')));
    box.appendChild(sec(parana ? 'Truco e retruco' : 'Truco, seis, nove e doze', false,
      p('Na sua vez, antes de jogar a carta, você pode pedir <b>truco</b>: se aceitarem, a mão passa a valer <b>3</b>. O outro lado pode <b>aceitar</b>, <b>correr</b> (vocês levam 1 ponto) ou <b>aumentar para seis</b> (vale 6; se vocês correrem, eles levam 3). Depois vêm <b>nove</b> e <b>doze</b>.'),
      p('Quem pediu por último não pode pedir de novo: o próximo aumento é sempre do outro lado.'),
      p('<b>A conta para aceitar:</b> correr do truco custa 1 ponto; aceitar arrisca 3 para ganhar 3. Vale aceitar se você ganha a mão mais de <b>1 vez em 3 (33%)</b>. No seis basta 25%, no nove 17% e no doze 12,5% — quanto mais alto, mais barato aceitar. Perto do fim da partida o placar muda essa conta, e o coach mostra quanto.'),
      parana ? p('<b>No paranaense</b> o aumento do truco é o <b>retruco</b> (vale 6) e para por aí. A conta do retruco é a mesma do seis: basta ganhar 25% das vezes.') : null));
    box.appendChild(sec('Mão de 11 e mão de ferro', false,
      p('Quem chega a <b>11 pontos</b> joga a <b>mão de 11</b>: a dupla vê as cartas do parceiro e decide se joga (a mão vale 3) ou corre (os outros ganham 1). Ninguém pede truco na mão de 11.' + (parana ? ' No paranaense, quem vai jogar ainda pode <b>trocar cartas</b> com o parceiro.' : '')),
      p('Se as duas equipes estão com 11, é a <b>mão de ferro</b>: ninguém vê as próprias cartas e quem ganhar a mão ganha a partida.')));
    const sinais = el('div', { class: 'tr-tabela-sinais' });
    [['zap', 'Zap'], ['copas', 'Copas'], ['espadilha', 'Espadilha'], ['picafumo', 'Pica-fumo'], ['tres', 'Um 3'], ['dois', 'Um 2'], ['nada', 'Nada disso']].forEach(([k, txt]) => {
      sinais.appendChild(el('div', {}, el('i', { text: CO.SINAIS[k].rosto }), el('span', { html: `<b>${txt}</b><br><small>${CO.SINAIS[k].gesto}</small>` })));
    });
    box.appendChild(sec('Torneio', false,
      p('No torneio você escolhe quantos participantes entram (de 2 a 64 jogadores, ou duplas), as regras e se cada confronto é uma partida só ou melhor de 3. É mata-mata: quem perde sai. Quando o número não fecha a chave (8, 16, 32...), alguns passam direto da primeira fase, por sorteio.'),
      p('Você joga os seus confrontos na mesa. Os outros jogos da chave são partidas de verdade entre os bots, jogadas na hora, sem animação.')));
    box.appendChild(sec('Sinais na dupla', false,
      p('Parceiros combinam sinais para contar a melhor carta que têm. Nesta mesa, seu parceiro faz o sinal para você (e você para ele) no começo de cada mão:'),
      sinais,
      p('Cada região tem os seus sinais; estes são os desta mesa.')));
    return box;
  }

  // ------------------------------------------------------- treino de cartas
  function abrirQuiz() {
    const TOTAL = 10;
    let feitas = 0, certas = 0;
    const corpo = el('div', { class: 'tr-quiz' });
    const proxima = () => {
      corpo.innerHTML = '';
      if (feitas >= TOTAL) {
        const e = Dados.alterarEstat(x => { x.quizFeitos++; x.quizMelhor = Math.max(x.quizMelhor, certas); });
        corpo.append(el('div', { class: 'pergunta', text: `Você acertou ${certas} de ${TOTAL}.` }),
          el('div', { class: 'explica', text: certas === TOTAL ? 'Perfeito! A ordem das cartas já está na cabeça.' : certas >= 7 ? 'Muito bom. Mais uma rodada e fica automático.' : 'Dá uma olhada em "A vira e as manilhas" e tente de novo.' }),
          el('div', { class: 'placar-quiz', text: `Seu recorde: ${e.quizMelhor} de ${TOTAL}` }),
          el('div', { class: 'opcoes' }, el('button', { class: 'btn btn-ouro', text: 'De novo', onclick: () => { feitas = 0; certas = 0; proxima(); } })));
        return;
      }
      const tipo = feitas % 2 === 0 ? 'manilha' : 'ganha';
      const baralho = P.Baralho.embaralhar(R.BARALHO.slice());
      const vira = baralho[0];
      const explica = el('div', { class: 'explica' });
      const placar = el('div', { class: 'placar-quiz', text: `Pergunta ${feitas + 1} de ${TOTAL} · ${certas} certas` });
      const responder = (ok, txt) => {
        feitas++; if (ok) certas++;
        explica.className = 'explica ' + (ok ? 'certo' : 'errado');
        explica.innerHTML = (ok ? 'Certo! ' : 'Não. ') + txt;
        corpo.querySelectorAll('button.resp, .carta.clicavel').forEach(b => { b.disabled = true; b.classList.remove('clicavel'); b.onclick = null; });
        corpo.appendChild(el('div', { class: 'opcoes' }, el('button', { class: 'btn btn-ouro', text: feitas >= TOTAL ? 'Ver resultado' : 'Próxima', onclick: proxima })));
      };
      if (tipo === 'manilha') {
        const certa = R.manilhaDe(vira);
        corpo.append(el('div', { class: 'pergunta', text: 'A vira é esta. Qual é a manilha?' }),
          el('div', { class: 'cartas' }, el('div', { class: 'rotulo-carta' }, cartaMini(vira, 70), el('span', { text: 'vira' }))));
        const opcoes = el('div', { class: 'opcoes' });
        // a certa + 3 outras (a vira e vizinhas confundem mais)
        const idx = R.FORCA_RANK[R.rankDe(vira)];
        const cands = [certa, R.rankDe(vira), R.ORDEM[(idx + 2) % 10], R.ORDEM[(idx + 9) % 10]];
        const usadas = [];
        cands.forEach(r => { if (usadas.indexOf(r) < 0) usadas.push(r); });
        while (usadas.length < 4) { const r = P.RNG.escolher(R.ORDEM); if (usadas.indexOf(r) < 0) usadas.push(r); }
        P.Baralho.embaralhar(usadas).forEach(r => opcoes.appendChild(el('button', { class: 'btn resp', text: R.ROTULO_RANK[r], onclick: () => {
          responder(r === certa, `Na ordem 4 5 6 7 Q J K A 2 3, a carta depois do ${R.ROTULO_RANK[R.rankDe(vira)]} é o <b>${R.ROTULO_RANK[certa]}</b>: as quatro cartas ${R.ROTULO_RANK[certa]} são as manilhas (o ${R.ROTULO_RANK[certa]}♣ é o zap).`);
        } })));
        corpo.append(opcoes, explica, placar);
      } else {
        // duas cartas (às vezes uma manilha, às vezes empate): qual ganha?
        let a = baralho[1], b = baralho[2];
        if (P.RNG.chance(0.3)) { const m = R.manilhaDe(vira); const nai = P.RNG.inteiroAbaixo(4); const c = m * 4 + nai; if (c !== vira && c !== b) a = c; }
        else if (P.RNG.chance(0.15)) { const mesmo = R.BARALHO.find(c => R.rankDe(c) === R.rankDe(a) && c !== a && c !== vira && !R.ehManilha(c, vira)); if (mesmo !== undefined && !R.ehManilha(a, vira)) b = mesmo; }
        const va = R.valor(a, vira), vb = R.valor(b, vira);
        const nomeC = c => `${CO.cartaHtml(c)}${R.ehManilha(c, vira) ? ' (' + R.nome(c, vira) + ', manilha)' : ''}`;
        const txt = va === vb ? `As duas são ${R.NOME_RANK_PLURAL[R.rankDe(a)].toLowerCase()} e nenhuma é manilha: empatam (naipe só conta nas manilhas).`
          : `${nomeC(va > vb ? a : b)} ganha de ${nomeC(va > vb ? b : a)}. A manilha com esta vira é o ${R.ROTULO_RANK[R.manilhaDe(vira)]}.`;
        corpo.append(el('div', { class: 'pergunta', text: 'Com esta vira, qual carta ganha? (toque nela)' }));
        const linha = el('div', { class: 'cartas' });
        linha.appendChild(el('div', { class: 'rotulo-carta' }, cartaMini(vira, 46), el('span', { text: 'vira' })));
        [a, b].forEach(c => {
          const d = cartaMini(c, 70);
          d.classList.add('clicavel');
          d.onclick = () => responder(R.valor(c, vira) > R.valor(c === a ? b : a, vira), txt);
          linha.appendChild(d);
        });
        corpo.append(linha, el('div', { class: 'opcoes' }, el('button', { class: 'btn resp', text: 'Empate', onclick: () => responder(va === vb, txt) })), explica, placar);
      }
    };
    proxima();
    return P.UI.modal({ titulo: 'Treino de cartas', conteudo: corpo });
  }

  /** Na abertura do app: havia uma partida de truco aberta? Volta para ela. */
  function retomarSeHouver() {
    const s = Dados.salva();
    if (!s || !s.emJogo) return false;
    if (s.cfg.torneio && Dados.torneio()) telaTorneio = true;
    P.App.irPara('truco');
    P.UITrucoMesa.iniciar({ retomar: s, aviso: true });
    return true;
  }

  P.UITruco = { render, abrirQuiz, retomarSeHouver, abrirTorneio, abrirEntrada, regrasNo: v => regras(v || Dados.config().regras) };
})(window.Poker = window.Poker || {});
