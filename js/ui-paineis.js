/* ==========================================================================
   OUTS · Treino Lab — ui-paineis.js
   Telas fora da mesa: treino relâmpago, estatísticas, histórico com replay
   passo a passo (com a análise do coach em cada decisão), auditoria do
   embaralhamento, cola de consulta rápida e configurações.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc, cartaTxt } = P.UI;
  const F = P.Formato;
  const CORES_NOTA = { otima: '#3dd68c', boa: '#4c9aff', imprecisa: '#f5a524', erro: '#ef5350', grave: '#b71c1c' };
  const NOMES_NOTA = { otima: 'Ótima', boa: 'Boa', imprecisa: 'Imprecisa', erro: 'Erro', grave: 'Erro grave' };

  // =================================================== TREINO RELÂMPAGO
  const treino = { tipos: Object.keys(P.Treino.TIPOS), n: 10, tempo: 20000, sessao: null };

  function renderTreino(raiz) {
    raiz.innerHTML = '';
    const box = el('div', { class: 'conteudo' });
    box.appendChild(el('div', { class: 'titulo-tela' }, el('h1', { text: 'Treino relâmpago' }),
      el('p', { text: 'Só matemática, contra o relógio: outs, regra do 4 e 2, pot odds, MDF e equity.' })));
    const layout = el('div', { class: 'treino-layout' });
    const area = el('div', { class: 'cartao cartao-pergunta' });
    const lado = el('div', { style: { display: 'grid', gap: '16px' } });
    layout.append(area, lado);
    box.appendChild(layout);
    raiz.appendChild(box);
    desenharLadoTreino(lado);
    if (treino.sessao && treino.sessao.ativa) proximaPergunta(area, lado); else telaInicialTreino(area, lado);
  }

  function telaInicialTreino(area, lado) {
    area.innerHTML = '';
    area.appendChild(el('h2', { text: 'Monte a sua rodada' }));
    const tipos = el('div', { class: 'tipos-treino' });
    Object.keys(P.Treino.TIPOS).forEach(t => {
      const cb = el('input', { type: 'checkbox', checked: treino.tipos.indexOf(t) >= 0 ? true : null });
      cb.addEventListener('change', () => {
        treino.tipos = Array.prototype.slice.call(tipos.querySelectorAll('input')).map((x, i) => x.checked ? Object.keys(P.Treino.TIPOS)[i] : null).filter(Boolean);
      });
      tipos.appendChild(el('label', {}, cb, P.Treino.TIPOS[t]));
    });
    area.appendChild(tipos);
    const qtd = el('div', { class: 'opcoes-linha' });
    [10, 20, 30].forEach(n => qtd.appendChild(el('button', { class: 'opcao' + (treino.n === n ? ' ativo' : ''), text: n + ' perguntas', onclick: e => { treino.n = n; marcar(qtd, e.target); } })));
    const tempo = el('div', { class: 'opcoes-linha' });
    [[0, 'Sem limite'], [30000, '30 s'], [20000, '20 s'], [10000, '10 s']].forEach(([ms, t]) => tempo.appendChild(el('button', { class: 'opcao' + (treino.tempo === ms ? ' ativo' : ''), text: t, onclick: e => { treino.tempo = ms; marcar(tempo, e.target); } })));
    area.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Quantidade' }), qtd));
    area.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Tempo por pergunta' }), tempo));
    const btn = el('button', { class: 'btn btn-ouro', style: { height: '46px', fontSize: '15px' }, text: 'Começar (Enter)', onclick: () => {
      if (!treino.tipos.length) { P.UI.aviso('Escolha pelo menos um tipo de pergunta.', 'erro'); return; }
      treino.sessao = { ativa: true, i: 0, pontos: 0, acertos: 0, tempos: [] };
      proximaPergunta(area, lado);
    } });
    area.appendChild(btn);
    setTimeout(() => btn.focus(), 30);
  }

  function marcar(grupo, alvo) { Array.prototype.forEach.call(grupo.children, b => b.classList.toggle('ativo', b === alvo)); }

  function proximaPergunta(area, lado) {
    const s = treino.sessao;
    area.innerHTML = '';
    if (s.i >= treino.n) return fimTreino(area, lado);
    const p = P.Treino.gerar(treino.tipos);
    area.appendChild(el('div', { class: 'chips-texto' },
      el('span', { class: 'chip ouro', text: `Pergunta ${s.i + 1} de ${treino.n}` }),
      el('span', { class: 'chip', text: P.Treino.TIPOS[p.tipo] || p.tipo }),
      el('span', { class: 'chip verde', text: `${s.pontos} pontos` })));
    const q = P.UICoach.perguntaUI(p, {
      tempo: treino.tempo,
      aoResponder: r => {
        s.pontos += r.pontos;
        if (r.acertou) s.acertos++;
        s.tempos.push(r.ms);
        P.Estatisticas.registrarQuiz(r.acertou, r.ms, r.pontos);
        const prox = el('button', { class: 'btn btn-ouro', text: s.i + 1 >= treino.n ? 'Ver resultado (Enter)' : 'Próxima (Enter)', onclick: () => { s.i++; proximaPergunta(area, lado); } });
        area.appendChild(prox);
        setTimeout(() => prox.focus(), 30);
      }
    });
    area.appendChild(q.elemento);
    setTimeout(q.focar, 40);
  }

  function fimTreino(area, lado) {
    const s = treino.sessao;
    s.ativa = false;
    const media = s.tempos.length ? s.tempos.reduce((a, b) => a + b, 0) / s.tempos.length : 0;
    P.Treino.salvarSessao({ data: Date.now(), n: treino.n, acertos: s.acertos, tempoMedio: media, pontos: s.pontos });
    area.innerHTML = '';
    area.appendChild(el('h2', { text: 'Resultado da rodada' }));
    area.appendChild(el('div', { class: 'kpis-grade', html:
      `<div class="kpi"><small>Pontos</small><b>${s.pontos}</b></div>` +
      `<div class="kpi"><small>Acertos</small><b>${s.acertos}/${treino.n}</b><em>${F.pct(s.acertos / treino.n, 0)}</em></div>` +
      `<div class="kpi"><small>Tempo médio</small><b>${F.num(media / 1000, 1)} s</b></div>` }));
    area.appendChild(el('p', { style: { color: 'var(--texto-2)' }, text: s.acertos / treino.n >= 0.8 ? 'Excelente! Tente baixar o tempo médio: a meta é responder no automático.' : 'Repita a rodada: a repetição é o que torna a conta automática.' }));
    const btn = el('button', { class: 'btn btn-ouro', text: 'Nova rodada (Enter)', onclick: () => telaInicialTreino(area, lado) });
    area.appendChild(btn);
    desenharLadoTreino(lado);
    setTimeout(() => btn.focus(), 30);
  }

  function desenharLadoTreino(lado) {
    lado.innerHTML = '';
    const sessoes = P.Treino.sessoes();
    const st = P.Estatisticas.acumulado().quiz;
    lado.appendChild(el('div', { class: 'cartao' }, el('h3', { text: 'Seu histórico' }),
      el('div', { class: 'par-dados', html:
        `<span>Perguntas respondidas</span><b>${st.perguntas}</b>` +
        `<span>Precisão</span><b>${st.precisao === null ? '—' : F.pct(st.precisao, 0)}</b>` +
        `<span>Tempo médio</span><b>${st.tempoMedio === null ? '—' : F.num(st.tempoMedio / 1000, 1) + ' s'}</b>` +
        `<span>Rodadas completas</span><b>${sessoes.length}</b>` })));
    const graf = el('div', { class: 'cartao grafico' }, el('h3', { text: 'Evolução por rodada' }));
    if (sessoes.length < 2) graf.appendChild(el('p', { style: { color: 'var(--texto-3)', fontSize: '13px' }, text: 'Complete pelo menos duas rodadas para ver a evolução do tempo médio e da precisão.' }));
    else graf.appendChild(graficoEvolucao(sessoes.slice(-20)));
    graf.appendChild(el('div', { class: 'legenda-grafico' }, el('span', { style: { '--c': 'var(--ouro)' }, text: 'tempo médio (s)' }), el('span', { style: { '--c': 'var(--ok)' }, text: 'acertos (%)' })));
    lado.appendChild(graf);
    lado.appendChild(el('div', { class: 'cartao' }, el('h3', { text: 'Atalhos para decorar' }), el('div', { html: htmlColaResumida() })));
  }

  function graficoEvolucao(sess) {
    const W = 300, H = 160, m = 24;
    const tempos = sess.map(s => s.tempoMedio / 1000), acertos = sess.map(s => s.acertos / s.n * 100);
    const maxT = Math.max(5, Math.max.apply(null, tempos) * 1.15);
    const x = i => m + i * (W - 2 * m) / Math.max(1, sess.length - 1);
    const yT = v => H - m - v / maxT * (H - 2 * m), yA = v => H - m - v / 100 * (H - 2 * m);
    const linha = (arr, fy) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${fy(v).toFixed(1)}`).join(' ');
    const div = el('div');
    div.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line class="eixo" x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}"/>
      <line class="eixo" x1="${m}" y1="${m}" x2="${m}" y2="${H - m}"/>
      <path class="linha-tempo" d="${linha(tempos, yT)}"/>
      <path class="linha-acerto" d="${linha(acertos, yA)}"/>
      <text x="2" y="${m + 4}">${F.num(maxT, 0)}s</text><text x="2" y="${H - m}">0</text>
      <text x="${W - m - 30}" y="${H - 6}">rodada ${sess.length}</text></svg>`;
    return div;
  }

  // ======================================================== ESTATÍSTICAS
  let abaEstat = 'acumulado';
  function renderEstatisticas(raiz, compacto) {
    raiz.innerHTML = '';
    const box = el('div', { class: compacto ? '' : 'conteudo' });
    const abas = el('div', { class: 'abas' });
    [['sessao', 'Esta sessão'], ['acumulado', 'Acumulado']].forEach(([id, t]) => abas.appendChild(el('button', { class: abaEstat === id ? 'ativo' : '', text: t, onclick: () => { abaEstat = id; renderEstatisticas(raiz, compacto); } })));
    box.appendChild(el('div', { class: 'titulo-tela' }, compacto ? null : el('h1', { text: 'Estatísticas' }), abas,
      el('span', { style: { flex: 1 } }),
      abaEstat === 'acumulado' ? el('button', { class: 'btn', text: 'Zerar acumulado', onclick: async () => {
        if (await P.UI.confirmar('Zerar estatísticas', 'Apagar todas as estatísticas acumuladas?', 'Zerar')) { P.Estatisticas.zerarAcumulado(); renderEstatisticas(raiz, compacto); }
      } }) : null));
    const s = abaEstat === 'sessao' ? P.Estatisticas.sessao() : P.Estatisticas.acumulado();
    const v = (x, f) => (x === null || x === undefined || !isFinite(x) ? '—' : f(x));
    const pc = x => v(x, y => F.pct(y, 1));
    const kpi = (rot, val, nota, cls) => `<div class="kpi"><small>${rot}</small><b class="${cls || ''}">${val}</b>${nota ? `<em>${nota}</em>` : ''}</div>`;
    const sng = s.sng, tor = s.torneio;
    box.appendChild(el('div', { class: 'kpis-grade', html:
      kpi('Mãos', F.fichas(s.maos)) +
      kpi('VPIP', pc(s.vpip), 'entrou no pote (TAG: 18–25%)') +
      kpi('PFR', pc(s.pfr), 'aumentou pré-flop (perto do VPIP)') +
      kpi('3-bet', pc(s.tresBet), 'quando teve chance (6–10%)') +
      kpi('Agressividade', v(s.af, x => F.num(x, 1)), '(apostas + aumentos) ÷ calls') +
      kpi('WTSD', pc(s.wtsd), 'viu o showdown após o flop') +
      kpi('W$SD', pc(s.wsd), 'ganhou no showdown') +
      kpi('Cash bb/100', v(s.bb100, x => (x > 0 ? '+' : '') + F.num(x, 1)), `${s.cash.maos} mãos de cash`, s.bb100 > 0 ? 'pos' : s.bb100 < 0 ? 'neg' : '') +
      kpi('Cash resultado', F.dinheiro(s.cash.resultado), '', s.cash.resultado > 0 ? 'pos' : s.cash.resultado < 0 ? 'neg' : '') +
      kpi('Sit & Go ROI', v(sng.roi, x => (x > 0 ? '+' : '') + F.pct(x, 0)), `${sng.jogados} jogados · ${sng.itm} ITM · ${sng.vitorias} vitórias`, sng.roi > 0 ? 'pos' : sng.roi < 0 ? 'neg' : '') +
      kpi('Torneio ROI', v(tor.roi, x => (x > 0 ? '+' : '') + F.pct(x, 0)), `${tor.jogados} jogados · ${tor.itm} ITM${tor.melhor ? ' · melhor ' + tor.melhor.posicao + 'º/' + tor.melhor.field : ''}`, tor.roi > 0 ? 'pos' : tor.roi < 0 ? 'neg' : '') +
      kpi('Decisões certas', pc(s.corretas), `${s.totalDecisoes} decisões avaliadas`) +
      kpi('Quiz', pc(s.quiz.precisao), `${s.quiz.perguntas} perguntas · ${v(s.quiz.tempoMedio, x => F.num(x / 1000, 1) + ' s')} em média`) }));

    const grade = el('div', { class: 'grade-2', style: { marginTop: '16px' } });
    const ruas = el('div', { class: 'cartao' }, el('h3', { text: 'Decisões por street' }));
    const barras = el('div', { class: 'barras-ruas' });
    ['preflop', 'flop', 'turn', 'river'].forEach(r => {
      const d = s.decisoes[r];
      const trilho = el('div', { class: 'trilho' });
      if (d.total) ['otima', 'boa', 'imprecisa', 'erro', 'grave'].forEach(n => {
        if (d.dist[n]) trilho.appendChild(el('i', { style: { width: (d.dist[n] / d.total * 100) + '%', background: CORES_NOTA[n] }, title: `${NOMES_NOTA[n]}: ${d.dist[n]}` }));
      });
      barras.appendChild(el('div', { class: 'barra-rua' }, el('span', { text: r === 'preflop' ? 'Pré-flop' : r[0].toUpperCase() + r.slice(1) }), trilho,
        el('b', { text: d.total ? F.pct(d.corretas, 0) : '—', title: 'Ótima + Boa' })));
    });
    ruas.appendChild(barras);
    ruas.appendChild(el('div', { class: 'legenda-grade', html: Object.keys(NOMES_NOTA).map(n => `<span style="--c:${CORES_NOTA[n]}">${NOMES_NOTA[n]}</span>`).join('') }));
    const erros = el('div', { class: 'cartao' }, el('h3', { text: 'Erros mais frequentes' }));
    if (!s.erros.length) erros.appendChild(el('p', { style: { color: 'var(--texto-3)' }, text: 'Nenhum erro registrado ainda. Jogue algumas mãos com o coach ativo.' }));
    else erros.appendChild(el('div', { class: 'erros-lista' }, s.erros.slice(0, 8).map(e => el('div', { class: 'erro-item' }, el('span', { text: e.nome }), el('b', { text: e.n + '×' })))));
    grade.append(ruas, erros);
    box.appendChild(grade);
    raiz.appendChild(box);
  }

  // ============================================================ HISTÓRICO
  let maoSelecionada = null, passoReplay = 0, mostrarTodas = false, timerReplay = null, eventoInicial = null;

  /** Abre o histórico já na mão e na decisão indicadas. */
  function abrirMao(id, evento) {
    maoSelecionada = id;
    passoReplay = 0;
    eventoInicial = evento === undefined ? null : evento;
    P.App.irPara('historico');
  }

  function renderHistorico(raiz, compacto) {
    raiz.innerHTML = '';
    clearInterval(timerReplay);
    const box = el('div', { class: compacto ? '' : 'conteudo', style: compacto ? {} : { height: '100%' } });
    if (!compacto) box.appendChild(el('div', { class: 'titulo-tela' }, el('h1', { text: 'Histórico de mãos' }),
      el('p', { text: 'Replay passo a passo, com a análise do coach em cada decisão sua.' })));
    const maos = P.HistoricoMaos.todas();
    if (!maos.length) { box.appendChild(el('div', { class: 'vazio-msg', text: 'Nenhuma mão jogada ainda. Sente numa mesa pelo lobby!' })); raiz.appendChild(box); return; }
    if (!maoSelecionada || !maos.some(m => m.id === maoSelecionada)) maoSelecionada = maos[0].id;
    const layout = el('div', { class: 'historico-layout' });
    const lista = el('div', { class: 'lista-maos' });
    const direita = el('div', { class: 'replay' });
    maos.slice(0, 150).forEach(m => {
      const h = m.hist;
      const heroi = h.jogadores.find(j => j.assento === m.heroi);
      const fmtM = v => (m.unidade === 'dinheiro' ? F.dinheiro(v) : F.fichas(v));
      const notas = el('div', { class: 'pontos-notas' }, (m.decisoes || []).map(d => el('i', { style: { background: CORES_NOTA[d.nota.nota] }, title: d.nota.nomeNota })));
      const item = el('button', { class: 'item-mao' + (m.id === maoSelecionada ? ' ativo' : ''), onclick: () => { maoSelecionada = m.id; passoReplay = 0; renderHistorico(raiz, compacto); } },
        el('div', { html: heroi ? heroi.cartas.map(c => cartaTxt(c)).join('') : '' }),
        el('div', {}, el('div', { html: `<b>${esc(m.rotulo)}</b> · #${h.numero}` }), el('div', { class: 'meta', text: new Date(m.data).toLocaleString('pt-BR') }), notas),
        el('span', { class: 'res', style: { color: m.ganho > 0 ? 'var(--ok)' : m.ganho < 0 ? 'var(--erro)' : 'var(--texto-3)' }, text: (m.ganho > 0 ? '+' : '') + fmtM(m.ganho) }));
      lista.appendChild(item);
    });
    layout.append(lista, direita);
    box.appendChild(layout);
    raiz.appendChild(box);
    desenharReplay(direita, P.HistoricoMaos.porId(maoSelecionada));
  }

  /** Reconstrói os estados da mão a partir dos eventos. */
  function passosDaMao(reg) {
    const h = reg.hist;
    const fmtM = v => (reg.unidade === 'dinheiro' ? F.dinheiro(v) : F.fichas(v));
    const est = { board: [], pote: 0, jog: {} };
    h.jogadores.forEach(j => { est.jog[j.assento] = { nome: j.nome, fichas: j.fichasIniciais, aposta: 0, foldou: false, cartas: j.cartas, mostrou: false, ult: '', posicao: j.posicao }; });
    const passos = [];
    const snap = (desc, idx) => passos.push({ desc, idx, board: est.board.slice(), pote: est.pote, jog: JSON.parse(JSON.stringify(est.jog)), ativo: idx !== null && h.eventos[idx] ? h.eventos[idx].assento : null });
    const decisoes = {};
    (reg.decisoes || []).forEach(d => { decisoes[d.evento] = d; });
    h.eventos.forEach((e, i) => {
      const j = e.assento !== undefined ? est.jog[e.assento] : null;
      switch (e.tipo) {
        case 'ante': j.fichas -= e.valor; est.pote += e.valor; break;
        case 'blind': j.fichas -= e.valor; j.aposta += e.valor; j.ult = e.qual + ' ' + fmtM(e.valor); break;
        case 'distribuicao': snap('Cartas distribuídas (uma por vez, a partir da esquerda do botão)', null); break;
        case 'acao': {
          j.fichas = e.fichas; j.aposta = e.apostaRua;
          if (e.acao === 'fold') j.foldou = true;
          const t = e.acao === 'fold' ? 'fold' : e.acao === 'check' ? 'check' : e.acao === 'call' ? 'paga ' + fmtM(e.valor) : e.acao === 'bet' ? 'aposta ' + fmtM(e.ate) : 'aumenta para ' + fmtM(e.ate);
          j.ult = t + (e.allin ? ' (all-in)' : '');
          snap(`${j.nome}: ${j.ult}`, i);
          if (decisoes[i]) passos[passos.length - 1].decisao = decisoes[i];
          break;
        }
        case 'devolucao': j.fichas += e.valor; j.aposta -= e.valor; snap(`${j.nome} recebe de volta ${fmtM(e.valor)} (aposta não paga)`, i); break;
        case 'recolher': Object.values(est.jog).forEach(x => { x.aposta = 0; x.ult = x.foldou ? 'fold' : ''; }); est.pote = e.pote; break;
        case 'rua': est.board = e.board.slice(); snap(`${e.rua === 'flop' ? 'Flop' : e.rua === 'turn' ? 'Turn' : 'River'}: ${P.Cartas.listaBonita(e.cartas)}`, null); break;
        case 'mostra': if (e.mostrou) { j.mostrou = true; j.ult = e.descricao; } else j.ult = 'esconde'; snap(`${j.nome} ${e.mostrou ? 'mostra ' + P.Cartas.listaBonita(e.cartas) + ' — ' + e.descricao : 'esconde as cartas'}`, i); break;
        case 'pote': e.vencedores.forEach(v => { est.jog[v.assento].fichas += v.valor; }); est.pote -= e.valor; snap(e.vencedores.map(v => `${est.jog[v.assento].nome} ganha ${fmtM(v.valor)}`).join(' · ') + (e.descricao ? ` com ${e.descricao}` : ''), null); break;
      }
    });
    return passos;
  }

  function desenharReplay(box, reg) {
    box.innerHTML = '';
    if (!reg) return;
    const h = reg.hist;
    const passos = passosDaMao(reg);
    if (eventoInicial !== null) {
      const i = passos.findIndex(p => p.decisao && p.decisao.evento === eventoInicial);
      if (i >= 0) passoReplay = i;
      eventoInicial = null;
    }
    if (passoReplay >= passos.length) passoReplay = passos.length - 1;
    const fmtM = v => (reg.unidade === 'dinheiro' ? F.dinheiro(v) : F.fichas(v));
    const mesa = el('div', { class: 'mini-mesa-replay' }, el('div', { class: 'oval-r' }));
    const centro = el('div', { class: 'centro-r' });
    mesa.appendChild(centro);
    const n = h.jogadores.length, lugaresT = h.lugares && h.lugares <= 10 ? h.lugares : n;
    const lugarDe = {};
    h.jogadores.forEach(j => { lugarDe[j.assento] = j.assento; });
    const desc = el('div', { class: 'passo-txt' });
    const analise = el('div');
    const slider = el('input', { type: 'range', min: 0, max: passos.length - 1, value: passoReplay });
    function desenhar() {
      const p = passos[passoReplay];
      mesa.querySelectorAll('.lugar-r').forEach(x => x.remove());
      centro.innerHTML = '';
      centro.appendChild(el('div', { style: { fontWeight: '800' }, text: 'Pote ' + fmtM(p.pote + Object.values(p.jog).reduce((s, j) => s + j.aposta, 0)) }));
      centro.appendChild(el('div', { class: 'board-r' }, p.board.map(c => P.UI.carta(c))));
      h.jogadores.forEach(j => {
        const s = j.assento, e = p.jog[s];
        const t = (90 + s * 360 / lugaresT) * Math.PI / 180;
        const x = 50 + 41 * Math.cos(t), y = 50 + 39 * Math.sin(t);
        const ver = s === reg.heroi || e.mostrou || mostrarTodas;
        const lugar = el('div', { class: 'lugar-r' + (e.foldou ? ' foldou' : '') + (p.ativo === s ? ' ativo' : '') + (s === reg.heroi ? ' heroi' : ''), style: { left: `clamp(var(--meio-r, 64px), ${x}%, calc(100% - var(--meio-r, 64px)))`, top: y + '%' } },
          el('div', { class: 'cs' }, e.cartas.map(c => P.UI.carta(ver ? c : null, { fechada: !ver }))),
          el('div', { class: 'caixa' },
            el('div', { class: 'n', text: `${e.nome} · ${e.posicao}` }),
            el('div', { class: 's', text: fmtM(e.fichas) }),
            el('div', { class: 'ult', text: e.ult || '' }),
            e.aposta > 0 ? el('div', { class: 'ap', text: 'aposta ' + fmtM(e.aposta) }) : null));
        mesa.appendChild(lugar);
      });
      desc.textContent = `Passo ${passoReplay + 1}/${passos.length} — ${p.desc}`;
      slider.value = passoReplay;
      analise.innerHTML = '';
      if (p.decisao) analise.appendChild(cartaoDecisao(p.decisao, fmtM));
    }
    const ir = d => { passoReplay = Math.max(0, Math.min(passos.length - 1, passoReplay + d)); desenhar(); };
    slider.addEventListener('input', () => { passoReplay = +slider.value; desenhar(); });
    const play = el('button', { class: 'btn', text: '▶ Reproduzir', onclick: () => {
      if (timerReplay) { clearInterval(timerReplay); timerReplay = null; play.textContent = '▶ Reproduzir'; return; }
      play.textContent = '❚❚ Pausar';
      timerReplay = setInterval(() => { if (passoReplay >= passos.length - 1) { clearInterval(timerReplay); timerReplay = null; play.textContent = '▶ Reproduzir'; return; } ir(1); }, 1100);
    } });
    const proxDecisao = () => { for (let i = passoReplay + 1; i < passos.length; i++) if (passos[i].decisao) { passoReplay = i; desenhar(); return; } P.UI.aviso('Não há mais decisões suas nesta mão.'); };
    const todas = el('label', { class: 'chave' }, el('input', { type: 'checkbox', checked: mostrarTodas ? true : null, onchange: e => { mostrarTodas = e.target.checked; desenhar(); } }), el('i'), el('span', { text: 'mostrar todas as cartas' }));
    box.appendChild(mesa);
    box.appendChild(el('div', { class: 'controles-replay' },
      el('button', { class: 'btn', text: '⏮', title: 'Início', onclick: () => { passoReplay = 0; desenhar(); } }),
      el('button', { class: 'btn', text: '◀', title: 'Voltar', onclick: () => ir(-1) }),
      play,
      el('button', { class: 'btn', text: '▶', title: 'Avançar', onclick: () => ir(1) }),
      el('button', { class: 'btn', text: '⏭', title: 'Fim', onclick: () => { passoReplay = passos.length - 1; desenhar(); } }),
      el('button', { class: 'btn btn-ouro', text: 'Próxima decisão sua', onclick: proxDecisao }),
      slider, todas));
    box.appendChild(desc);
    box.appendChild(analise);
    const resumoDec = (reg.decisoes || []).map(d => `<span class="feedback-nota nota-${d.nota.nota}" title="${esc(d.nota.motivo)}">${d.rua === 'preflop' ? 'Pré' : d.rua}: ${d.nota.nomeNota}</span>`).join(' ');
    if (resumoDec) box.appendChild(el('div', { class: 'chips-texto', html: resumoDec }));
    const det = el('details', { class: 'cartao' }, el('summary', { style: { cursor: 'pointer', fontWeight: '700' }, text: 'Texto completo da mão e ordem do baralho' }),
      el('pre', { class: 'texto-mao', text: P.Historico.texto(h, { titulo: reg.rotulo, formatar: fmtM }) }));
    box.appendChild(det);
    desenhar();
  }

  function cartaoDecisao(d, fmtM) {
    const r = d.recomendacao || {};
    const rotulo = { fold: 'Fold', check: 'Check', call: 'Pagar', bet: 'Apostar', raise: 'Aumentar', allin: 'All-in' };
    const n = d.nota;
    return el('div', { class: 'cartao analise-replay' },
      el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
        el('h3', { text: 'Análise do coach nesta decisão' }),
        el('span', { class: 'feedback-nota nota-' + n.nota, text: n.nomeNota + (n.perdaBB > 0.05 ? ` · −${F.num(n.perdaBB, 1)} bb` : '') })),
      el('div', { class: 'par-dados', html:
        `<span>Sua mão</span><b>${esc(d.mao || '')}</b>` +
        `<span>Recomendado</span><b>${rotulo[r.acao] || r.acao || '—'}${r.ate ? ' ' + fmtM(r.ate) : ''}</b>` +
        `<span>Você fez</span><b>${rotulo[(n.acao && n.acao.tipo) || ''] || (n.acao && n.acao.tipo) || ''}${n.acao && n.acao.ate ? ' ' + fmtM(n.acao.ate) : ''}</b>` +
        (d.equity !== null && d.equity !== undefined ? `<span>Equity estimada</span><b>${F.pct(d.equity)}</b>` : '') +
        (d.potOdds ? `<span>Equity necessária</span><b>${F.pct(d.potOdds)}</b>` : '') +
        (d.outs ? `<span>Outs limpos / sujos</span><b>${d.outs.limpos} / ${d.outs.sujos}</b>` : '') }),
      el('ol', { class: 'passos' }, (d.passos || []).map(p => el('li', { text: p }))),
      el('p', { style: { color: 'var(--texto-2)', fontSize: '13px' }, text: n.motivo }));
  }

  // ============================================================ AUDITORIA
  let controleAud = null;
  function renderAuditoria(raiz) {
    raiz.innerHTML = '';
    const box = el('div', { class: 'conteudo' });
    box.appendChild(el('div', { class: 'titulo-tela' }, el('h1', { text: 'Auditoria do embaralhamento' }),
      el('p', { text: 'Prova estatística de que as cartas não são manipuladas.' })));
    const g = el('div', { class: 'grade-2' });
    const esq = el('div', { class: 'cartao' });
    esq.innerHTML = `
      <p>Cada mão usa um <b>baralho novo de 52 cartas</b>, embaralhado <b>uma única vez</b> com Fisher-Yates completo.
      Os números vêm de <code>crypto.getRandomValues</code> (gerador criptográfico do navegador), com descarte dos valores que
      causariam viés de módulo. <code>Math.random</code> não é usado em lugar nenhum. Os bots só recebem a visão pública da mesa:
      nunca veem cartas fechadas de ninguém nem o baralho restante. Nada de "action flops" ou equilíbrio de sorte.</p>
      <p>Esta auditoria embaralha <b>1.000.000 de baralhos</b> com a mesma função da mesa e verifica: (1) se cada carta cai em cada
      posição 1/52 das vezes (teste qui-quadrado em 2.704 células) e (2) se as frequências de par na mão, AA e mão naipada
      batem com a teoria.</p>`;
    const barraP = el('div', { class: 'progresso' }, el('i'));
    const status = el('div', { style: { color: 'var(--texto-2)', fontSize: '13px' } });
    const resultados = el('div');
    const btn = el('button', { class: 'btn btn-ouro', text: 'Rodar 1.000.000 de embaralhamentos', onclick: () => rodar() });
    esq.append(btn, barraP, status, resultados);
    const dir = el('div', { class: 'cartao' }, el('h3', { text: 'Mapa de calor: carta × posição' }));
    const canvas = el('canvas', { width: 312, height: 312, style: { width: '100%', maxWidth: '420px', imageRendering: 'pixelated', borderRadius: '6px', border: '1px solid var(--borda)', justifySelf: 'center' } });
    dir.append(canvas, el('p', { style: { color: 'var(--texto-3)', fontSize: '12px' }, text: 'Linhas: cartas (2♠ → A♣). Colunas: posição no baralho (1 → 52). Azul = abaixo do esperado, vermelho = acima. Num embaralhamento justo o mapa parece ruído uniforme, sem faixas ou diagonais.' }));
    g.append(esq, dir);
    box.appendChild(g);
    raiz.appendChild(box);

    function rodar() {
      if (controleAud) controleAud.cancelar();
      btn.disabled = true;
      resultados.innerHTML = '';
      const t0 = performance.now();
      controleAud = P.Auditoria.rodar({
        embaralhamentos: 1000000,
        aoProgresso: f => { barraP.firstChild.style.width = (f * 100) + '%'; status.textContent = `${F.fichas(f * 1e6)} baralhos · ${F.num((performance.now() - t0) / 1000, 1)} s`; },
        aoTerminar: r => {
          btn.disabled = false;
          controleAud = null;
          status.textContent = `${F.fichas(r.embaralhamentos)} baralhos em ${F.num(r.ms / 1000, 1)} s.`;
          let ext = 0;
          for (let i = 0; i < r.z.length; i++) if (Math.abs(r.z[i]) > 3) ext++;
          resultados.innerHTML = `
            <div class="zona ${r.aprovado ? 'verde' : 'vermelha'}" style="margin:8px 0">${r.aprovado ? 'Sem viés detectado.' : 'Desvio estatístico detectado — rode de novo para confirmar.'}</div>
            <table class="tabela"><tbody>
              <tr><td>Qui-quadrado carta × posição</td><td class="dir">${F.num(r.x2, 1)} (gl ${F.fichas(r.gl)})</td></tr>
              <tr><td>p-valor</td><td class="dir">${r.p.toFixed(4).replace('.', ',')}</td></tr>
              <tr><td>Células com |z| &gt; 3</td><td class="dir">${ext} (esperado ≈ 7)</td></tr>
            </tbody></table>
            <table class="tabela" style="margin-top:10px"><thead><tr><th>Evento</th><th class="dir">Observada</th><th class="dir">Teórica</th><th class="dir">z</th></tr></thead><tbody>
            ${r.frequencias.map(f => `<tr><td>${f.nome}</td><td class="dir">${F.pct(f.observada, 3)}</td><td class="dir">${F.pct(f.teorica, 3)}</td><td class="dir">${F.num(f.z, 2)}</td></tr>`).join('')}
            </tbody></table>
            <p style="color:var(--texto-3);font-size:12px;margin-top:8px">Critério: p-valor acima de 0,001 e |z| abaixo de 4 nas frequências. O p-valor muda a cada rodada; valores entre 0,05 e 0,95 são os mais comuns.</p>`;
          const ctx = canvas.getContext('2d');
          for (let c = 0; c < 52; c++) for (let p = 0; p < 52; p++) {
            const v = r.z[c * 52 + p], t = Math.min(Math.abs(v) / 4, 1);
            const alvo = v >= 0 ? [239, 83, 80] : [76, 154, 255], base = [27, 36, 48];
            ctx.fillStyle = `rgb(${Math.round(base[0] + (alvo[0] - base[0]) * t)},${Math.round(base[1] + (alvo[1] - base[1]) * t)},${Math.round(base[2] + (alvo[2] - base[2]) * t)})`;
            ctx.fillRect(p * 6, c * 6, 6, 6);
          }
        }
      });
    }
  }

  // ================================================================= COLA
  function htmlColaResumida() {
    return `<table class="tabela-mini"><thead><tr><th>Aposta</th><th>Equity p/ pagar</th></tr></thead><tbody>
      <tr><td>1/4 do pote</td><td>16,7%</td></tr><tr><td>1/3</td><td>20%</td></tr><tr><td>1/2</td><td>25%</td></tr>
      <tr><td>2/3</td><td>28,6%</td></tr><tr><td>3/4</td><td>30%</td></tr><tr><td>pote</td><td>33,3%</td></tr><tr><td>2× pote</td><td>40%</td></tr></tbody></table>`;
  }

  function abrirCola() {
    P.UIMesa && P.UIMesa.emJogo() && P.UIMesa.pausar(true);
    const html = `<div class="cola">
      <div><h3>Equity necessária por tamanho de aposta</h3>
        <table class="tabela"><thead><tr><th>Aposta do vilão</th><th class="dir">Pot odds</th><th class="dir">Equity p/ pagar</th><th class="dir">MDF</th></tr></thead><tbody>
        <tr><td>1/4 do pote</td><td class="dir">5:1</td><td class="dir">16,7%</td><td class="dir">80%</td></tr>
        <tr><td>1/3 do pote</td><td class="dir">4:1</td><td class="dir">20%</td><td class="dir">75%</td></tr>
        <tr><td>1/2 do pote</td><td class="dir">3:1</td><td class="dir">25%</td><td class="dir">66,7%</td></tr>
        <tr><td>2/3 do pote</td><td class="dir">2,5:1</td><td class="dir">28,6%</td><td class="dir">60%</td></tr>
        <tr><td>3/4 do pote</td><td class="dir">2,33:1</td><td class="dir">30%</td><td class="dir">57,1%</td></tr>
        <tr><td>pote</td><td class="dir">2:1</td><td class="dir">33,3%</td><td class="dir">50%</td></tr>
        <tr><td>2× pote</td><td class="dir">1,5:1</td><td class="dir">40%</td><td class="dir">33,3%</td></tr></tbody></table>
        <p style="color:var(--texto-3);font-size:12px">Equity necessária = pagar ÷ (pote + aposta + pagar). MDF = pote ÷ (pote + aposta). Seu blefe precisa de folds ≥ aposta ÷ (pote + aposta).</p></div>
      <div><h3>Outs comuns</h3>
        <table class="tabela"><thead><tr><th>Draw</th><th class="dir">Outs</th><th class="dir">Flop→river</th><th class="dir">Turn→river</th></tr></thead><tbody>
        <tr><td>Flush + open-ended</td><td class="dir">15</td><td class="dir">54,1%</td><td class="dir">32,6%</td></tr>
        <tr><td>Flush + gutshot</td><td class="dir">12</td><td class="dir">45,0%</td><td class="dir">26,1%</td></tr>
        <tr><td>Flush draw</td><td class="dir">9</td><td class="dir">35,0%</td><td class="dir">19,6%</td></tr>
        <tr><td>Open-ended</td><td class="dir">8</td><td class="dir">31,5%</td><td class="dir">17,4%</td></tr>
        <tr><td>Duas overcards</td><td class="dir">6</td><td class="dir">24,1%</td><td class="dir">13,0%</td></tr>
        <tr><td>Par → dois pares/trinca</td><td class="dir">5</td><td class="dir">20,4%</td><td class="dir">10,9%</td></tr>
        <tr><td>Gutshot</td><td class="dir">4</td><td class="dir">16,5%</td><td class="dir">8,7%</td></tr>
        <tr><td>Par na mão → set</td><td class="dir">2</td><td class="dir">8,4%</td><td class="dir">4,3%</td></tr></tbody></table>
        <p style="color:var(--texto-3);font-size:12px">Regra do 4 (flop, 2 cartas) e do 2 (1 carta). Acima de 8 outs, regra do 4 − (outs − 8).</p></div>
      <div><h3>Probabilidades pré-flop úteis</h3>
        <table class="tabela"><tbody>
        <tr><td>Par na mão</td><td class="dir">5,88% (1 em 17)</td></tr>
        <tr><td>AA (ou qualquer par específico)</td><td class="dir">0,45% (1 em 221)</td></tr>
        <tr><td>Duas cartas naipadas</td><td class="dir">23,5%</td></tr>
        <tr><td>Acertar set ou melhor no flop</td><td class="dir">≈ 11,8% (1 em 8,5)</td></tr>
        <tr><td>Flopar flush com naipadas</td><td class="dir">0,84%</td></tr>
        <tr><td>Flopar flush draw com naipadas</td><td class="dir">10,9%</td></tr>
        <tr><td>AA × KK</td><td class="dir">≈ 82% × 18%</td></tr>
        <tr><td>AKs × QQ</td><td class="dir">≈ 46% × 54%</td></tr>
        <tr><td>Par × duas overcards</td><td class="dir">≈ 55% × 45%</td></tr>
        <tr><td>Dominado (AK × AQ)</td><td class="dir">≈ 74% × 26%</td></tr></tbody></table>
        <h3 style="margin-top:12px">Zonas de M (torneio)</h3>
        <table class="tabela"><tbody>
        <tr><td>Verde (M ≥ 20)</td><td>jogo normal</td></tr><tr><td>Amarela (10–20)</td><td>menos especulação</td></tr>
        <tr><td>Laranja (6–10)</td><td>all-in ou fold sem ação na frente</td></tr><tr><td>Vermelha (1–5)</td><td>só push/fold</td></tr></tbody></table></div></div>`;
    return P.UI.modal({ titulo: 'Cola de consulta rápida', conteudo: html, largo: true }).then(() => { P.UIMesa && P.UIMesa.emJogo() && P.UIMesa.pausar(false); });
  }

  // ======================================================= CONFIGURAÇÕES
  function abrirConfig() {
    const C = P.Config;
    const corpo = el('div', { style: { display: 'grid', gap: '16px' } });
    const nome = el('input', { class: 'entrada', value: C.get('nome'), maxlength: 18 });
    nome.addEventListener('change', () => C.set('nome', nome.value.trim() || 'Você'));
    corpo.appendChild(el('label', { class: 'campo' }, el('span', { text: 'Seu nome na mesa' }), nome));
    const grupo = (rotulo, chave, opcoes) => {
      const linha = el('div', { class: 'opcoes-linha' });
      opcoes.forEach(([v, t]) => linha.appendChild(el('button', { class: 'opcao' + (C.get(chave) === v ? ' ativo' : ''), text: t, onclick: e => { C.set(chave, v); marcar(linha, e.target); } })));
      corpo.appendChild(el('div', { class: 'campo' }, el('span', { text: rotulo }), linha));
    };
    grupo('Tema da mesa', 'tema', [['verde', 'Verde'], ['azul', 'Azul'], ['vermelho', 'Vermelho'], ['preto', 'Preto']]);
    grupo('Velocidade do jogo (bots e animações)', 'velocidade', [['lenta', 'Lenta'], ['normal', 'Normal'], ['rapida', 'Rápida'], ['turbo', 'Turbo']]);
    grupo('Modo do coach', 'modoCoach', [['sempre', 'Dicas sempre visíveis'], ['pedido', 'Só quando eu pedir'], ['quiz', 'Modo quiz'], ['desligado', 'Desligado (análise só no fim)']]);
    grupo('Valores na mesa', 'unidade', [['dinheiro', '$ / fichas'], ['bb', 'Big blinds (bb)']]);
    const chave = (rotulo, k) => corpo.appendChild(el('label', { class: 'chave' }, el('input', { type: 'checkbox', checked: C.get(k) ? true : null, onchange: e => C.set(k, e.target.checked) }), el('i'), el('span', { text: rotulo })));
    chave('Baralho de 4 cores (♠ preto, ♥ vermelho, ♦ azul, ♣ verde)', 'quatroCores');
    chave('Sons (Web Audio)', 'som');
    chave('Mostrar minhas cartas perdedoras no showdown', 'mostrarPerdedoras');
    corpo.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Dados' }), el('div', { class: 'opcoes-linha' },
      el('button', { class: 'btn', text: 'Recarregar banca ($25.000)', onclick: () => { P.Banca.reiniciar(); P.App.atualizarSaldo(); P.UI.aviso('Banca recarregada.', 'ok'); } }),
      el('button', { class: 'btn', text: 'Apagar histórico de mãos', onclick: async () => { if (await P.UI.confirmar('Apagar histórico', 'Apagar todas as mãos salvas?', 'Apagar')) { P.HistoricoMaos.limpar(); P.UI.aviso('Histórico apagado.'); } } }))));
    if (!P.Armazenamento.disponivel()) corpo.appendChild(el('div', { class: 'zona amarela', text: 'O navegador bloqueou o armazenamento local: as configurações valem só até fechar a página.' }));
    // diagnóstico: por que o app fechou sozinho (sistema do celular ou erro do app)
    const diag = P.App && P.App.diagnostico ? P.App.diagnostico() : null;
    if (diag) corpo.appendChild(el('div', { class: 'campo' }, el('span', { text: 'Diagnóstico' }), el('div', { class: 'diagnostico', html: diag })));
    return P.UI.modal({ titulo: 'Configurações', conteudo: corpo, botoes: [{ texto: 'Fechar', classe: 'btn-ouro', valor: true }] });
  }

  function abrirOverlay(qual) {
    const corpo = el('div');
    const p = P.UI.modal({ titulo: qual === 'historico' ? 'Histórico de mãos' : 'Estatísticas', conteudo: corpo, largo: true });
    if (qual === 'historico') renderHistorico(corpo, true); else renderEstatisticas(corpo, true);
    return p.then(() => clearInterval(timerReplay));
  }

  // ================================================ ANÁLISE DE FIM DE PARTIDA
  const ROTULO_ACAO = { fold: 'Fold', check: 'Check', call: 'Pagar', bet: 'Apostar', raise: 'Aumentar', allin: 'All-in' };
  const NOME_RUA = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

  /**
   * Mostra a análise do coach no fim da partida. Botões extras viram o valor
   * devolvido; "Ver no replay" devolve {replay}, "Treinar" devolve {treino}.
   */
  function abrirRelatorio(rel, botoes) {
    if (!rel) return Promise.resolve(null);
    const corpo = el('div', { class: 'relatorio' });
    const fmtM = v => (rel.modo === 'cash' ? F.dinheiro(v) : F.fichas(v));
    const kpi = (rot, val, nota, cls) => `<div class="kpi"><small>${rot}</small><b class="${cls || ''}">${val}</b>${nota ? `<em>${nota}</em>` : ''}</div>`;

    // ---- resultado e nota geral
    let resultado = '';
    if (rel.modo === 'cash') {
      const v = rel.resultadoCash || 0;
      resultado = kpi('Resultado', (v > 0 ? '+' : '') + F.dinheiro(v), rel.est.bb100 !== null ? `${F.num(rel.est.bb100, 1)} bb/100` : '', v > 0 ? 'pos' : v < 0 ? 'neg' : '');
    } else if (rel.fim && rel.fim.posicao) {
      const lucro = rel.fim.premio - rel.fim.buyin;
      resultado = kpi('Colocação', `${rel.fim.posicao}º de ${rel.fim.field}`) +
        kpi('Prêmio', F.dinheiro(rel.fim.premio), `resultado ${lucro >= 0 ? '+' : ''}${F.dinheiro(lucro)}`, lucro >= 0 ? 'pos' : 'neg');
    } else if (rel.abandonou) resultado = kpi('Resultado', 'Abandonou', 'buy-in perdido', 'neg');
    const notaTxt = rel.nota === null ? '—' : F.num(rel.nota, 1) + ' / 10';
    const corNota = rel.nota === null ? '' : rel.nota >= 7.5 ? 'pos' : rel.nota < 5 ? 'neg' : '';
    corpo.appendChild(el('div', { class: 'kpis-grade', html: resultado +
      kpi('Nota do coach', notaTxt, '', corNota) +
      kpi('Mãos', String(rel.maos), `${rel.minutos} min`) +
      kpi('Decisões avaliadas', String(rel.decisoes), rel.decisoes ? `${F.pct((rel.dist.otima + rel.dist.boa) / rel.decisoes, 0)} certas` : '') +
      kpi('EV perdido', `${F.num(rel.perdaBB, 1)} bb`, rel.maos ? `${F.num(rel.perdaPor100, 1)} bb a cada 100 mãos` : '', rel.perdaBB > 0.5 ? 'neg' : '') }));
    corpo.appendChild(el('p', { class: 'conceito', html: `<b>${esc(rel.conceito)}</b>` }));

    if (rel.decisoes) {
      // ---- distribuição das notas
      const barra = el('div', { class: 'barra-notas' });
      ['otima', 'boa', 'imprecisa', 'erro', 'grave'].forEach(k => {
        if (rel.dist[k]) barra.appendChild(el('i', { style: { width: (rel.dist[k] / rel.decisoes * 100) + '%', background: CORES_NOTA[k] }, title: `${NOMES_NOTA[k]}: ${rel.dist[k]}` }));
      });
      corpo.appendChild(barra);
      corpo.appendChild(el('div', { class: 'legenda-grade', html: Object.keys(NOMES_NOTA).map(k => `<span style="--c:${CORES_NOTA[k]}">${NOMES_NOTA[k]}: ${rel.dist[k]}</span>`).join('') }));

      // ---- por street e estilo
      const grade = el('div', { class: 'grade-2' });
      const linhasRua = ['preflop', 'flop', 'turn', 'river'].map(r => {
        const x = rel.porRua[r];
        return `<tr><td>${NOME_RUA[r]}</td><td>${x.total}</td><td>${x.total ? F.pct(x.corretas / x.total, 0) : '—'}</td><td>${x.total ? F.num(x.perdaBB, 1) + ' bb' : '—'}</td></tr>`;
      }).join('');
      grade.appendChild(el('div', { class: 'cartao' }, el('h3', { text: 'Por street' }),
        el('table', { class: 'tabela-mini', html: `<thead><tr><th>Street</th><th>Decisões</th><th>Certas</th><th>EV perdido</th></tr></thead><tbody>${linhasRua}</tbody>` })));
      const linhasEstilo = rel.estilo.map(e => {
        const v = e.fator ? F.num(e.valor, 1) : F.pct(e.valor, 0);
        const fx = e.fator ? `${e.faixa[0]}–${e.faixa[1]}` : `${Math.round(e.faixa[0] * 100)}–${Math.round(e.faixa[1] * 100)}%`;
        const cor = e.status === 'ok' ? 'var(--ok)' : e.status === 'amostra' ? 'var(--texto)' : 'var(--aviso)';
        return `<tr title="${esc(e.comentario)}"><td>${e.nome}</td><td style="color:${cor};font-weight:700">${v}</td><td>${fx}</td></tr>`;
      }).join('');
      const cartaoEstilo = el('div', { class: 'cartao' }, el('h3', { text: `Seu estilo (mesa de ${rel.lugares})` }),
        el('table', { class: 'tabela-mini', html: `<thead><tr><th>Estatística</th><th>Você</th><th>Faixa ideal</th></tr></thead><tbody>${linhasEstilo}</tbody>` }));
      if (rel.estilo.some(e => e.status === 'amostra')) cartaoEstilo.appendChild(el('p', { class: 'nota-rel', text: `Só ${rel.maos} mãos: pouca amostra para julgar o estilo. Os números ficam confiáveis a partir de algumas dezenas de mãos.` }));
      rel.estilo.filter(e => e.status === 'alto' || e.status === 'baixo').forEach(e => cartaoEstilo.appendChild(el('p', { class: 'nota-rel', text: `${e.nome}: ${e.comentario}` })));
      grade.appendChild(cartaoEstilo);
      corpo.appendChild(grade);

      // ---- vazamentos
      if (rel.erros.length) {
        const c = el('div', { class: 'cartao' }, el('h3', { text: 'Principais vazamentos' }));
        rel.erros.slice(0, 4).forEach(e => c.appendChild(el('div', { class: 'vazamento' },
          el('div', { html: `<b>${esc(e.nome)}</b> <span class="chip vermelho">${e.n}× · −${F.num(e.perdaBB, 1)} bb</span>` }),
          el('p', { text: e.dica }))));
        corpo.appendChild(c);
      }
    }

    // ---- decisões mais caras e boas jogadas
    const cartaoDecisoes = (titulo, lista, ruim) => {
      if (!lista.length) return null;
      const c = el('div', { class: 'cartao' }, el('h3', { text: titulo }));
      lista.forEach(d => {
        const n = d.nota, rec = d.recomendacao || {};
        const feito = `${ROTULO_ACAO[n.acao && n.acao.tipo] || (n.acao && n.acao.tipo) || ''}${n.acao && n.acao.ate ? ' ' + fmtM(n.acao.ate) : ''}`;
        const recTxt = `${ROTULO_ACAO[rec.acao] || rec.acao || ''}${rec.ate ? ' ' + fmtM(rec.ate) : ''}`;
        const linha = el('div', { class: 'decisao-rel' },
          el('div', { class: 'cartas-rel', html: (d.cartas || []).map(x => cartaTxt(x)).join('') + (d.board && d.board.length ? ' <span style="color:var(--texto-3)">|</span> ' + d.board.map(x => cartaTxt(x)).join('') : '') }),
          el('div', {},
            el('div', { html: `<b>Mão #${d.numeroMao} · ${NOME_RUA[d.rua] || d.rua}</b> — você: <b>${esc(feito)}</b>${ruim ? ` · coach: <b>${esc(recTxt)}</b>` : ''} <span class="feedback-nota nota-${n.nota}">${n.nomeNota}${n.perdaBB > 0.05 ? ' −' + F.num(n.perdaBB, 1) + ' bb' : ''}</span>` }),
            el('p', { text: ruim ? n.motivo : (d.passos && d.passos[2]) || n.motivo })),
          d.maoId ? el('button', { class: 'btn', text: 'Ver no replay', 'data-mao': d.maoId, 'data-evento': d.evento }) : el('span'));
        c.appendChild(linha);
      });
      return c;
    };
    const caras = cartaoDecisoes('Decisões mais caras', rel.piores, true);
    const boas = cartaoDecisoes('Boas jogadas', rel.melhores, false);
    if (caras) corpo.appendChild(caras);
    if (boas) corpo.appendChild(boas);

    // ---- pontos fortes e plano de treino
    const g2 = el('div', { class: 'grade-2' });
    if (rel.fortes.length) g2.appendChild(el('div', { class: 'cartao' }, el('h3', { text: 'Pontos fortes' }), el('ul', { class: 'lista-rel' }, rel.fortes.map(t => el('li', { text: t })))));
    if (rel.plano.length) {
      const c = el('div', { class: 'cartao' }, el('h3', { text: 'Plano de treino' }), el('ul', { class: 'lista-rel' }, rel.plano.map(t => el('li', { text: t }))));
      if (rel.treinos.length) c.appendChild(el('button', { class: 'btn btn-ouro', text: 'Treinar agora (relâmpago)', 'data-treino': rel.treinos.join(',') }));
      g2.appendChild(c);
    }
    if (g2.children.length) corpo.appendChild(g2);

    let titulo = 'Análise do coach';
    if (rel.modo === 'cash') titulo = 'Fim da sessão — análise do coach';
    else if (rel.fim && rel.fim.posicao) titulo = (rel.fim.posicao === 1 ? '🏆 Campeão! ' : `${rel.fim.posicao}º lugar — `) + 'análise do coach';
    else if (rel.abandonou) titulo = 'Partida abandonada — análise do coach';

    return P.UI.modal({
      titulo, conteudo: corpo, largo: true, fechavel: false, botoes: botoes,
      aoAbrir: (cx, fechar) => {
        cx.addEventListener('click', e => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.mao) fechar({ replay: { id: +b.dataset.mao, evento: +b.dataset.evento } });
          else if (b.dataset.treino) fechar({ treino: b.dataset.treino.split(',') });
        });
      }
    });
  }

  /** Navega para o replay ou para o treino escolhido no relatório. Devolve true se tratou. */
  function tratarSaidaRelatorio(v) {
    if (v && v.replay) { abrirMao(v.replay.id, v.replay.evento); return true; }
    if (v && v.treino) { treino.tipos = v.treino; treino.sessao = null; P.App.irPara('treino'); return true; }
    return false;
  }

  P.UIPaineis = { renderTreino, renderEstatisticas, renderHistorico, renderAuditoria, abrirCola, abrirConfig, abrirOverlay, abrirRelatorio, tratarSaidaRelatorio, abrirMao };
})(window.Poker = window.Poker || {});
