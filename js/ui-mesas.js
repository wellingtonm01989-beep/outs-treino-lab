/* ==========================================================================
   OUTS · Treino Lab — ui-mesas.js
   Painel "Mesas do torneio": lista das mesas, a mesa escolhida ao vivo
   (cartas fechadas, só abertas no showdown, como para qualquer espectador)
   e a classificação geral. Abre por cima da área da mesa SEM pausar o jogo:
   a sua mesa continua e os botões de ação ficam à vista; quando chega a
   sua vez, o painel avisa.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc } = P.UI;
  const F = P.Formato;

  let raiz = null, partida = null, torneio = null, desligar = null;
  let aba = 'mesas', selecionada = null, agendado = false, ultimoLista = 0;

  const fx = v => F.fichas(Math.round(v));

  function aberto() { return !!raiz; }

  function abrir(p) {
    fechar();
    partida = p;
    torneio = p.torneio();
    if (!torneio) return;
    const palco = document.querySelector('.mesa-palco');
    if (!palco) return;
    if (!selecionada || selecionada > torneio.mesas()) selecionada = torneio.resumo().find(m => !m.heroi && !m.quebrada)?.id || 1;
    raiz = el('div', { class: 'painel-mesas' });
    palco.appendChild(raiz);
    desligar = torneio.ouvir(() => agendar());
    render();
  }

  function fechar() {
    if (desligar) desligar();
    desligar = null;
    if (raiz) raiz.remove();
    raiz = null;
  }

  function agendar() {
    if (agendado || !raiz) return;
    agendado = true;
    // a classificação (até 180 linhas) atualiza no máximo 1 vez por segundo
    const atraso = aba === 'classificacao' ? Math.max(0, 1000 - (Date.now() - ultimoLista)) : 0;
    setTimeout(() => requestAnimationFrame(() => { agendado = false; if (raiz) render(); }), atraso);
  }

  /** A sua vez chegou (ou passou): mostra o aviso no topo do painel. */
  function avisarVez(sim) {
    if (!raiz) return;
    const v = raiz.querySelector('.pm-vez');
    if (v) v.classList.toggle('oculto', !sim);
  }

  function render() {
    const vez = raiz.querySelector('.pm-vez');
    const vezVisivel = vez && !vez.classList.contains('oculto');
    // mantém a rolagem da lista e da classificação entre as atualizações
    const rol = ['.pm-corpo', '.pm-lista'].map(s => { const e = raiz.querySelector(s); return e ? [s, e.scrollTop, e.scrollLeft] : null; }).filter(Boolean);
    ultimoLista = Date.now();
    raiz.innerHTML = '';
    const resumo = torneio.resumo();
    const abertas = resumo.filter(m => !m.quebrada).length;
    const cab = el('div', { class: 'pm-cab' },
      el('div', { class: 'pm-titulo' }, el('b', { text: 'Mesas do torneio' }),
        el('span', { text: `${abertas} ${abertas === 1 ? 'mesa' : 'mesas'} · ${torneio.restantes()} de ${partida.info().field} jogadores` })),
      el('div', { class: 'abas pm-abas' },
        el('button', { class: aba === 'mesas' ? 'ativo' : '', text: 'Mesas', onclick: () => { aba = 'mesas'; render(); } }),
        el('button', { class: aba === 'classificacao' ? 'ativo' : '', text: 'Classificação', onclick: () => { aba = 'classificacao'; render(); } })),
      el('button', { class: 'fechar', title: 'Voltar à sua mesa', html: '&times;', onclick: fechar }));
    raiz.appendChild(cab);
    raiz.appendChild(el('button', { class: 'btn btn-ouro pm-vez' + (vezVisivel ? '' : ' oculto'), text: 'Sua vez! Voltar à sua mesa', onclick: fechar }));
    raiz.appendChild(aba === 'mesas' ? corpoMesas(resumo) : corpoClassificacao());
    rol.forEach(([s, t, l]) => { const e = raiz.querySelector(s); if (e) { e.scrollTop = t; e.scrollLeft = l; } });
  }

  function corpoMesas(resumo) {
    const corpo = el('div', { class: 'pm-corpo' });
    const lista = el('div', { class: 'pm-lista' });
    resumo.forEach(m => {
      if (m.quebrada) return;
      const estado = m.quebrando ? 'sendo desfeita' : m.rua ? m.rua : 'entre mãos';
      lista.appendChild(el('button', {
        class: 'pm-item' + (m.id === selecionada ? ' ativo' : '') + (m.heroi ? ' sua' : ''),
        onclick: () => { selecionada = m.id; render(); }
      },
        el('b', { text: `Mesa ${m.id}` + (m.heroi ? ' · você' : '') }),
        el('span', { text: `${m.jogadores} jog. · ${estado}` }),
        m.lider ? el('small', { text: `Líder: ${m.lider.nome} ${fx(m.lider.fichas)}` }) : null));
    });
    corpo.appendChild(lista);
    const ver = torneio.vistaMesa(selecionada);
    const area = el('div', { class: 'pm-mesa' });
    if (!ver || ver.quebrada) area.appendChild(el('div', { class: 'vazio-msg', text: 'Esta mesa foi desfeita. Escolha outra na lista.' }));
    else if (ver.heroi) area.appendChild(el('div', { class: 'vazio-msg', text: 'Esta é a sua mesa — feche o painel para voltar a ela.' }));
    else area.appendChild(miniMesa(ver));
    corpo.appendChild(area);
    return corpo;
  }

  function miniMesa(v) {
    const mesa = el('div', { class: 'mini-mesa-replay pm-ao-vivo' }, el('div', { class: 'oval-r' }));
    const b = v.blinds;
    const centro = el('div', { class: 'centro-r' },
      el('div', { class: 'pm-blinds', text: `Mão #${v.numero} · blinds ${fx(b.sb)}/${fx(b.bb)}` + (b.ante ? ` · ante ${fx(b.ante)}` : '') }),
      v.pote + v.apostas > 0 ? el('div', { style: { fontWeight: '800' }, text: 'Pote ' + fx(v.pote) }) : null,
      el('div', { class: 'board-r' }, v.board.map(c => P.UI.carta(c))),
      v.resultado ? el('div', { class: 'pm-resultado', text: v.resultado }) : null);
    mesa.appendChild(centro);
    v.assentos.forEach(a => {
      if (!a) return;
      const t = (90 + a.assento * 360 / v.lugares) * Math.PI / 180;
      const x = 50 + 41 * Math.cos(t), y = 50 + 39 * Math.sin(t);
      const cartas = a.naMao && !a.foldou ? (a.cartas ? a.cartas.map(c => P.UI.carta(c)) : [P.UI.carta(null, { fechada: true }), P.UI.carta(null, { fechada: true })]) : [];
      const perfil = a.perfil && P.Bots.PERFIS[a.perfil];
      mesa.appendChild(el('div', {
        class: 'lugar-r' + (a.foldou ? ' foldou' : '') + (a.vez ? ' ativo' : ''),
        style: { left: `clamp(var(--meio-r, 64px), ${x}%, calc(100% - var(--meio-r, 64px)))`, top: y + '%' }
      },
        el('div', { class: 'cs' }, cartas),
        el('div', { class: 'caixa' },
          el('div', { class: 'n', html: esc(a.nome) + (a.botao ? ' <span class="pm-d">D</span>' : '') }),
          el('div', { class: 's', html: (a.fichas > 0 || a.naMao ? fx(a.fichas) : 'fora') + (perfil ? ` <span class="tag-perfil" style="--cor-perfil:${perfil.cor}">${perfil.sigla}</span>` : '') }),
          a.ult ? el('div', { class: 'ult', text: a.ult }) : null,
          a.aposta > 0 ? el('div', { class: 'ap', text: 'aposta ' + fx(a.aposta) }) : null,
          a.saindo ? el('div', { class: 'ult', text: 'vai mudar de mesa' }) : null)));
    });
    return mesa;
  }

  function corpoClassificacao() {
    const corpo = el('div', { class: 'pm-corpo pm-classificacao' });
    const premios = partida.premios();
    const linhas = torneio.classificacao().map((j, i) => {
      const premio = premios[i] ? `<span class="pm-premio">${F.dinheiro(premios[i])}</span>` : '';
      return `<tr class="${j.heroi ? 'pm-eu' : ''}"><td>${i + 1}º</td><td>${esc(j.nome)}</td><td class="dir">${fx(j.fichas)}</td><td class="dir">${j.mesa ? 'mesa ' + j.mesa : 'trocando'}</td><td class="dir">${premio}</td></tr>`;
    }).join('');
    corpo.appendChild(el('div', { class: 'pm-tabela', html: `<table class="tabela"><thead><tr><th>#</th><th>Jogador</th><th class="dir">Fichas</th><th class="dir">Mesa</th><th class="dir">Prêmio</th></tr></thead><tbody>${linhas}</tbody></table>` }));
    const elim = partida.eliminados().slice().sort((a, b) => a.posicao - b.posicao);
    if (elim.length) {
      corpo.appendChild(el('div', { class: 'pm-tabela', html: `<h3>Eliminados</h3><table class="tabela"><tbody>${elim.map(e =>
        `<tr><td>${e.posicao}º</td><td>${esc(e.nome)}</td><td class="dir">${e.premio ? F.dinheiro(e.premio) : ''}</td></tr>`).join('')}</tbody></table>` }));
    }
    return corpo;
  }

  P.UIMesas = { abrir, fechar, aberto, avisarVez };
})(window.Poker = window.Poker || {});
