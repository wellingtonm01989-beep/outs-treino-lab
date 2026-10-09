/* ==========================================================================
   OUTS · Treino Lab — main.js
   Inicialização e navegação entre telas (lobby, mesa, treino relâmpago,
   estatísticas, histórico, auditoria), banca, som e preferências visuais.

   Parâmetros de URL usados só para testes automáticos:
     ?demo=cash|sng|torneio&lugares=N   abre direto uma mesa (&participantes=N no SNG)
     &autoheroi=1&maos=N                o herói joga sozinho N mãos
     ?tela=treino|estatisticas|...      abre direto uma tela
   ========================================================================== */
(function (P) {
  'use strict';

  const { $, $$ } = P.UI;
  const F = P.Formato;
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
    if (!cfg.retomar && !cfg.semBanca && P.Banca.saldo() < custo) { P.UI.aviso('Banca insuficiente para essa mesa.', 'erro'); return; }
    telaAtual = 'mesa';
    TELAS.forEach(t => $('#tela-' + t).classList.toggle('oculto', t !== 'mesa'));
    $('#nav').classList.add('oculto');
    $('#app').classList.add('em-jogo');
    marcarSessao({ emJogo: true });
    P.UIMesa.iniciar(cfg).then(() => { atualizarSaldo(); marcarSessao({ emJogo: false }); document.documentElement.setAttribute('data-partida-fim', '1'); });
    setTimeout(atualizarSaldo, 50);
  }

  // ------------------------------------------------ diagnóstico e retomada
  // Enquanto há partida aberta fica salva uma marca "em jogo" (e se o app está na tela).
  // Se na abertura seguinte a marca ainda estiver lá, o app foi fechado sem sair da mesa:
  // em segundo plano é o sistema do celular liberando memória; na tela, travamento.
  const CHAVE_SESSAO = 'diag.sessao', CHAVE_INTERRUPCAO = 'diag.interrupcao';
  function marcarSessao(extra) {
    const s = Object.assign(P.Armazenamento.ler(CHAVE_SESSAO, {}), { visivel: !document.hidden, ultimo: Date.now() }, extra || {});
    P.Armazenamento.gravar(CHAVE_SESSAO, s);
  }
  function errosSalvos() {
    try { return JSON.parse(localStorage.getItem((window.__OUTS_PREFIXO || 'outs.treino.') + 'diag.erros') || '[]'); } catch (e) { return []; }
  }
  /** Na abertura: a sessão anterior terminou no meio de uma partida? */
  function verificarInterrupcao() {
    const ant = P.Armazenamento.ler(CHAVE_SESSAO, null);
    P.Armazenamento.gravar(CHAVE_SESSAO, { emJogo: false, visivel: !document.hidden, ultimo: Date.now() });
    if (!ant || !ant.emJogo) return null;
    const erro = errosSalvos().find(e => Math.abs(e.quando - ant.ultimo) < 120000);
    const motivo = erro ? 'erro' : ant.visivel === false ? 'sistema' : 'tela';
    const reg = { quando: ant.ultimo, motivo, erro: erro ? erro.texto : null };
    P.Armazenamento.gravar(CHAVE_INTERRUPCAO, reg);
    return reg;
  }
  const TEXTO_MOTIVO = {
    sistema: 'O celular fechou o app enquanto ele estava em segundo plano (para liberar memória ou economizar bateria). Não foi erro do jogo.',
    tela: 'O app parou enquanto estava aberto na tela, sem registrar erro do jogo — normalmente falta de memória no celular.',
    erro: 'O app parou depois de um erro do jogo (registrado abaixo).'
  };
  function diagnostico() {
    const partes = [];
    const ult = P.Armazenamento.ler(CHAVE_INTERRUPCAO, null);
    partes.push(ult ? `<b>Último fechamento inesperado:</b> ${new Date(ult.quando).toLocaleString('pt-BR')}. ${TEXTO_MOTIVO[ult.motivo] || ''}` + (ult.erro ? `<br><code>${P.UI.esc(ult.erro)}</code>` : '')
      : 'Nenhum fechamento inesperado registrado.');
    const erros = errosSalvos();
    if (erros.length) partes.push(`<b>Erros registrados:</b> ${erros.length} (último em ${new Date(erros[0].quando).toLocaleString('pt-BR')}): <code>${P.UI.esc(erros[0].texto)}</code>`);
    else partes.push('Nenhum erro do jogo registrado.');
    let usado = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); usado += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { /* sem acesso */ }
    partes.push(`Dados salvos pelo app: ${F.num(usado * 2 / 1048576, 1)} MB` + (navigator.deviceMemory ? ` · memória do aparelho: ~${navigator.deviceMemory} GB` : ''));
    return partes.join('<br>');
  }

  function retomar(s, motivo) {
    P.Partida.marcarRetomada(s);
    iniciarPartida(Object.assign({}, s.cfg, { retomar: s }));
    P.UI.aviso(`<b>Partida retomada:</b> ${P.UI.esc(s.rotulo)}. A mão que estava em andamento foi anulada.` + (motivo ? `<br><small>${TEXTO_MOTIVO[motivo.motivo]}</small>` : ''), 'aviso-ouro');
  }
  async function perguntarRetomada(s, motivo) {
    const ok = await P.UI.confirmar('Partida em andamento', `Você tem uma partida aberta: <b>${P.UI.esc(s.rotulo)}</b>.` +
      (motivo ? `<br><small>${TEXTO_MOTIVO[motivo.motivo]}</small>` : '') + '<br>Continuar de onde parou?', 'Continuar', 'Encerrar partida');
    if (ok) retomar(s, null);
    else { P.Partida.descartarSalva(); atualizarSaldo(); irPara('lobby'); }
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
    const interrupcao = verificarInterrupcao();
    document.addEventListener('visibilitychange', () => marcarSessao());
    setInterval(() => { if (telaAtual === 'mesa') marcarSessao(); }, 20000);

    // atalhos de teste/demonstração pela URL
    // ?roteiro=retomar (testes): segue o caminho normal de abertura, que retoma a partida salva
    if (parametro('roteiro') && parametro('roteiro') !== 'retomar') {
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
      else Object.assign(cfg, { buyin: demo === 'sng' ? E.SNG.micro[1] : E.TORNEIO.micro[1], velocidade: 'turbo', field: demo === 'torneio' ? (+parametro('field') || 45) : lugares, participantes: +parametro('participantes') || lugares });
      cfg.semSalvar = true;
      if (parametro('autoheroi')) Object.assign(cfg, { autoHeroi: true, limiteMaos: +parametro('maos') || 20, maosPorNivel: 5 });
      if (parametro('preflop') === 'auto') cfg.autoHeroiPreflop = true;
      if (parametro('coach') === '1') Object.assign(cfg, { autoCoach: true, iteracoesCoach: 500 });
      if (parametro('velocidade')) P.Config.set('velocidade', parametro('velocidade'));
      iniciarPartida(cfg);
      return;
    }
    // partida que ficou aberta (o app foi fechado no meio): volta direto para ela
    const salva = P.Partida.salva();
    if (salva) {
      irPara('lobby');
      if ((salva.retomadas || 0) >= 2) perguntarRetomada(salva, interrupcao);   // fechou várias vezes seguidas: pergunta
      else retomar(salva, interrupcao);
      return;
    }
    irPara(parametro('tela') || 'lobby');
  }

  P.App = { irPara, iniciarPartida, atualizarSaldo, diagnostico };
  iniciar();
})(window.Poker = window.Poker || {});
