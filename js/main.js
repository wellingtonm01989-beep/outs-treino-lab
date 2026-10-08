/* ==========================================================================
   OUTS · Treino Lab — main.js
   Inicialização e navegação entre telas (lobby, mesa, treino relâmpago,
   estatísticas, histórico, auditoria), banca, som e preferências visuais.

   Parâmetros de URL usados só para testes automáticos:
     ?demo=cash|sng|torneio&lugares=N   abre direto uma mesa
     &autoheroi=1&maos=N                o herói joga sozinho N mãos
     ?tela=treino|estatisticas|...      abre direto uma tela
   ========================================================================== */
(function (P) {
  'use strict';

  const { $, $$ } = P.UI;
  const TELAS = ['lobby', 'mesa', 'treino', 'estatisticas', 'historico', 'auditoria'];
  let telaAtual = 'lobby';

  const ICONE_SOM = on => on
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/></svg>';

  function atualizarSaldo() { $('#saldo').textContent = P.Formato.dinheiro(P.Banca.saldo()); }

  function aplicarPreferencias() {
    document.body.classList.toggle('quatro-cores', !!P.Config.get('quatroCores'));
    $('#btn-som').innerHTML = ICONE_SOM(P.Config.get('som'));
  }

  function irPara(tela) {
    if (TELAS.indexOf(tela) < 0) tela = 'lobby';
    if (telaAtual === 'mesa' && tela !== 'mesa' && P.UIMesa.emJogo()) P.UIMesa.encerrar(true);
    telaAtual = tela;
    TELAS.forEach(t => $('#tela-' + t).classList.toggle('oculto', t !== tela));
    $('#app').classList.toggle('em-jogo', tela === 'mesa');
    $$('#nav button').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
    $('#nav').classList.toggle('oculto', tela === 'mesa');
    atualizarSaldo();
    const raiz = $('#tela-' + tela);
    if (tela === 'lobby') P.UILobby.render();
    else if (tela === 'treino') P.UIPaineis.renderTreino(raiz);
    else if (tela === 'estatisticas') P.UIPaineis.renderEstatisticas(raiz);
    else if (tela === 'historico') P.UIPaineis.renderHistorico(raiz);
    else if (tela === 'auditoria') P.UIPaineis.renderAuditoria(raiz);
  }

  function iniciarPartida(cfg) {
    const custo = cfg.modo === 'cash' ? Math.round(cfg.buyinBB * cfg.limite.bb) : cfg.buyin.total;
    if (!cfg.semBanca && P.Banca.saldo() < custo) { P.UI.aviso('Banca insuficiente para essa mesa.', 'erro'); return; }
    telaAtual = 'mesa';
    TELAS.forEach(t => $('#tela-' + t).classList.toggle('oculto', t !== 'mesa'));
    $('#nav').classList.add('oculto');
    $('#app').classList.add('em-jogo');
    P.UIMesa.iniciar(cfg).then(() => { atualizarSaldo(); document.documentElement.setAttribute('data-partida-fim', '1'); });
    setTimeout(atualizarSaldo, 50);
  }

  function parametro(nome) {
    const m = new RegExp('[?&]' + nome + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function iniciar() {
    $('#logo-topo').innerHTML = P.UI.LOGO_SVG;
    aplicarPreferencias();
    atualizarSaldo();
    $$('#nav button').forEach(b => b.addEventListener('click', () => irPara(b.dataset.tela)));
    $('#marca').addEventListener('click', e => { e.preventDefault(); if (telaAtual !== 'mesa') irPara('lobby'); });
    $('#btn-som').addEventListener('click', () => { P.Config.set('som', !P.Config.get('som')); if (P.Config.get('som')) P.Som.ficha(); });
    $('#btn-cola').addEventListener('click', () => P.UIPaineis.abrirCola());
    $('#btn-config').addEventListener('click', async () => {
      const emJogo = P.UIMesa.emJogo();
      if (emJogo) P.UIMesa.pausar(true);
      await P.UIPaineis.abrirConfig();
      if (emJogo) P.UIMesa.pausar(false);
      if (telaAtual === 'lobby') P.UILobby.render();
    });
    P.Config.aoMudar(() => aplicarPreferencias());
    document.addEventListener('pointerdown', () => P.Som.desbloquear(), { once: true });

    // atalhos de teste/demonstração pela URL
    if (parametro('roteiro')) {
      irPara('lobby');
      const arquivo = parametro('roteiro') === 'layout' ? 'testes/layout-celular.js' : 'testes/roteiro-ui.js';
      document.body.appendChild(Object.assign(document.createElement('script'), { src: arquivo }));
      return;
    }
    const demo = parametro('demo');
    if (demo) {
      const E = P.Estruturas;
      const lugares = +parametro('lugares') || 6;
      const cfg = { modo: demo, nivel: parametro('nivel') || 'pequeno', lugares, semBanca: true };
      if (demo === 'cash') Object.assign(cfg, { limite: E.CASH.micro[2], buyinBB: 100, recompraAuto: true });
      else Object.assign(cfg, { buyin: demo === 'sng' ? E.SNG.micro[1] : E.TORNEIO.micro[1], velocidade: 'turbo', field: demo === 'torneio' ? (+parametro('field') || 45) : lugares });
      if (parametro('autoheroi')) Object.assign(cfg, { autoHeroi: true, limiteMaos: +parametro('maos') || 20, maosPorNivel: 5 });
      if (parametro('preflop') === 'auto') cfg.autoHeroiPreflop = true;
      if (parametro('coach') === '1') Object.assign(cfg, { autoCoach: true, iteracoesCoach: 500 });
      if (parametro('velocidade')) P.Config.set('velocidade', parametro('velocidade'));
      iniciarPartida(cfg);
      return;
    }
    irPara(parametro('tela') || 'lobby');
  }

  P.App = { irPara, iniciarPartida, atualizarSaldo };
  iniciar();
})(window.Poker = window.Poker || {});
