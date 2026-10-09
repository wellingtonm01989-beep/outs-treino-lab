/* ==========================================================================
   OUTS · Treino Lab — testes/roteiro-ui.js
   Roteiro automático de interface (carregado só com index.html?roteiro=1):
   clica pelo app inteiro — lobby, treino relâmpago, mesa em modo quiz e
   "sob pedido", ações pelo teclado, histórico com replay, modais — e grava
   o resultado em atributos do <html> (data-roteiro, data-roteiro-log).
   Usa um armazenamento separado para não mexer nos seus dados.
   ========================================================================== */
(function (P) {
  'use strict';

  const raiz = document.documentElement;
  const log = [];
  const passo = t => { log.push(t); raiz.setAttribute('data-roteiro-log', log.join(' | ')); };
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  async function ate(cond, ms = 60000, rotulo = '') {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error('tempo esgotado esperando: ' + rotulo);
      await dormir(100);
    }
  }
  function clicar(el) { if (!el) throw new Error('elemento não encontrado'); el.click(); }
  function botaoComTexto(txt, escopo) {
    return $$((escopo || '') + ' button').find(b => b.textContent.indexOf(txt) >= 0 && !b.disabled);
  }
  function tecla(k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }

  // responde perguntas de quiz que ficaram abertas (ex.: a vez chegou antes da troca de modo)
  async function responderQuizes() {
    while ($('.modal-fundo')) {
      const opc = $('.modal .opcoes-quiz button');
      const inp = $('.modal .quiz input');
      if (opc && !opc.disabled) clicar(opc);
      else if (inp && !inp.disabled) { inp.value = '25'; clicar(botaoComTexto('Responder', '.modal')); }
      await dormir(150);
      const prox = botaoComTexto('Próxima', '.modal') || botaoComTexto('Ir para a mesa', '.modal');
      if (prox) clicar(prox);
      await dormir(150);
    }
  }
  async function vezDoHeroi(rotulo) {
    const t0 = Date.now();
    while ($('.btn-fold').disabled || $('.modal-fundo')) {
      if (Date.now() - t0 > 120000) throw new Error('tempo esgotado esperando: ' + rotulo);
      if ($('.modal-fundo')) await responderQuizes(); else await dormir(100);
    }
  }

  async function roteiro() {
    P.Config.set('velocidade', 'turbo');
    P.Config.set('som', false);

    // 1) lobby: abas, oponentes sorteados (sem escolha de nível), lugares
    P.App.irPara('lobby');
    if ($('.nivel')) throw new Error('o lobby não deveria ter escolha de nível');
    if (!$('.oponentes-sorteio')) throw new Error('faltou a explicação dos oponentes sorteados');
    clicar(botaoComTexto('Sit & Go'));
    clicar($$('.limite')[4]);
    clicar(botaoComTexto('9', '.botoes-lugares'));
    clicar(botaoComTexto('Torneio'));
    clicar(botaoComTexto('180 jogadores'));
    clicar(botaoComTexto('Cash Game'));
    passo('lobby ok');

    // 2) treino relâmpago: 10 perguntas
    P.App.irPara('treino');
    clicar(botaoComTexto('Sem limite'));
    clicar(botaoComTexto('Começar'));
    for (let i = 0; i < 10; i++) {
      await ate(() => $('.cartao-pergunta .quiz'), 5000, 'pergunta');
      const opc = $('.cartao-pergunta .opcoes-quiz button');
      if (opc) clicar(opc);
      else { $('.cartao-pergunta .quiz input').value = '7'; clicar(botaoComTexto('Responder')); }
      await ate(() => $('.cartao-pergunta .correcao'), 5000, 'correção');
      clicar(botaoComTexto(i === 9 ? 'Ver resultado' : 'Próxima', '.cartao-pergunta'));
    }
    await ate(() => document.body.textContent.indexOf('Resultado da rodada') >= 0, 5000, 'resultado');
    passo('treino ok');

    // 3) cola e configurações
    clicar($('#btn-cola'));
    await ate(() => $('.modal'), 3000, 'cola');
    clicar($('.modal .fechar'));
    clicar($('#btn-config'));
    await ate(() => $('.modal'), 3000, 'config');
    clicar(botaoComTexto('Azul', '.modal'));
    clicar(botaoComTexto('Fechar', '.modal'));
    passo('modais ok');

    // 4) mesa em modo quiz (cash, 3 lugares)
    P.Config.set('modoCoach', 'quiz');
    P.App.iniciarPartida({ modo: 'cash', lugares: 3, limite: P.Estruturas.CASH[2], buyinBB: 100, recompraAuto: true });
    let decisoes = 0;
    while (decisoes < 6) {
      await ate(() => $('.modal-fundo') || (!$('.btn-fold').disabled), 120000, 'vez do herói');
      if ($('.modal-fundo')) { await responderQuizes(); continue; }
      // alterna entre teclado e cliques
      if (decisoes % 3 === 0) tecla('c');
      else if (decisoes % 3 === 1) { tecla('r'); await dormir(50); tecla('Enter'); if (!$('.btn-fold').disabled) clicar($('.btn-call')); }
      else clicar($('.btn-call'));
      decisoes++;
      await dormir(300);
    }
    await ate(() => $('.feedback-nota'), 60000, 'nota da decisão');
    passo('quiz e ações ok (' + $$('.coach-corpo .bloco').length + ' blocos no coach)');

    // 5) modo "sob pedido": pedir dica
    P.Config.set('modoCoach', 'pedido');
    await vezDoHeroi('vez do herói (pedido)');
    const dica = botaoComTexto('Pedir dica');
    if (dica) clicar(dica);
    await ate(() => $('.recomendacao'), 30000, 'dica');
    clicar($('.btn-fold'));
    passo('dica ok');

    // 6) histórico e estatísticas por cima da mesa
    clicar(botaoComTexto('Histórico', '.mesa-barra'));
    await ate(() => $('.modal .mini-mesa-replay'), 5000, 'replay');
    const prox = botaoComTexto('Próxima decisão sua', '.modal');
    if (prox) clicar(prox);
    clicar(botaoComTexto('▶', '.modal .controles-replay'));
    clicar($('.modal .fechar'));
    clicar(botaoComTexto('Estatísticas', '.mesa-barra'));
    await ate(() => $('.modal .kpis-grade'), 5000, 'estatísticas');
    clicar($('.modal .fechar'));
    passo('overlays ok');

    // 7) coach desligado: sem dicas nem notas na mesa
    P.Config.set('modoCoach', 'desligado');
    if (!$('#painel-coach').classList.contains('recolhido')) throw new Error('painel do coach deveria recolher');
    for (let k = 0; k < 2; k++) {
      await vezDoHeroi('vez do herói (desligado)');
      if ($('.btn-acao.sugerido')) throw new Error('não deveria sugerir ação com o coach desligado');
      clicar($('.btn-call'));
      await dormir(300);
      if ($('.acoes-status .feedback-nota')) throw new Error('não deveria mostrar nota com o coach desligado');
    }
    passo('coach desligado ok');

    // 8) sair para o lobby: análise de fim de partida
    clicar(botaoComTexto('Sair para o lobby'));
    await ate(() => $('.modal .relatorio'), 10000, 'relatório');
    const replay = $('.modal .relatorio button[data-mao]');
    if (replay) {
      clicar(replay);
      await ate(() => $('.mini-mesa-replay') && !$('#tela-historico').classList.contains('oculto'), 5000, 'replay da decisão');
      passo('relatório → replay ok');
    } else {
      clicar(botaoComTexto('Fechar', '.modal'));
      passo('relatório ok');
    }
    P.Config.set('modoCoach', 'sempre');
    P.App.irPara('lobby');
    await ate(() => !$('#tela-lobby').classList.contains('oculto'), 5000, 'lobby');
    passo('saiu ok');

    // 8) SNG: registrar e abandonar
    const saldoAntes = P.Banca.saldo();
    clicar(botaoComTexto('Sit & Go'));
    clicar($('.btn-sentar'));
    await ate(() => $('.mesa-barra'), 5000, 'mesa sng');
    await dormir(500);
    clicar(botaoComTexto('Sair para o lobby'));
    await ate(() => $('.modal'), 5000, 'confirmação');
    clicar(botaoComTexto('Abandonar', '.modal'));
    await ate(() => !$('#tela-lobby').classList.contains('oculto'), 5000, 'lobby 2');
    await dormir(300);
    if ($('.modal .relatorio')) clicar(botaoComTexto('Fechar', '.modal'));
    if (!(P.Banca.saldo() < saldoAntes)) throw new Error('buy-in não foi cobrado');
    passo('sng abandonado ok');

    // 9) histórico e auditoria como telas
    P.App.irPara('historico');
    await ate(() => $('.mini-mesa-replay'), 3000, 'histórico');
    P.App.irPara('auditoria');
    passo('telas ok');
  }

  // dentro do simulador de celular (testes/celular.html) o resultado vai também para a página de fora
  const avisarFora = () => { if (window.parent !== window) window.parent.postMessage({ tipo: 'layout', estado: raiz.getAttribute('data-roteiro'), log: log.join(' | ') }, '*'); };
  roteiro().then(() => { raiz.setAttribute('data-roteiro', 'ok'); avisarFora(); })
    .catch(e => { raiz.setAttribute('data-roteiro', 'falha'); passo('ERRO: ' + e.message); avisarFora(); });
})(window.Poker = window.Poker || {});
