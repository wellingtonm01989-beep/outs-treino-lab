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

    // 4b) celular: a barra de cima (blinds, coach, menu) fica escondida e aparece pelo botão ☰ do canto
    if (matchMedia('(max-width: 640px), (max-height: 500px)').matches) {
      const barra = $('.mesa-barra');
      // no navegador sem janela as animações de CSS não andam: desliga só durante este teste
      const semAnimacao = document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.mesa-barra { transition: none !important; }' }));
      const naTela = () => { const r = barra.getBoundingClientRect(); return getComputedStyle(barra).visibility !== 'hidden' && r.bottom > 0; };
      await dormir(300);
      if (naTela()) throw new Error('no celular a barra de cima deveria começar escondida');
      clicar($('.btn-barra'));
      await dormir(400);
      if (!naTela()) throw new Error('a barra deveria aparecer ao tocar no ☰');
      $('.mesa-palco').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await dormir(400);
      if (naTela()) throw new Error('a barra deveria sumir ao tocar fora dela');
      clicar($('.btn-barra'));
      await dormir(300);
      clicar($('#mb-coach'));
      await dormir(400);
      if (naTela()) throw new Error('a barra deveria sumir depois de usar um botão');
      if ($('#painel-coach').classList.contains('recolhido')) throw new Error('o botão Coach da barra deveria abrir o coach');
      P.UICoach.alternar(false);
      semAnimacao.remove();
      passo('celular: barra de cima escondida, abre no ☰');
    }

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

    // 10) truco: 1 contra 1 com o coach, pedir truco, jogar, sair (fica salva), continuar e descartar
    P.App.irPara('truco');
    await ate(() => $('.truco-novo'), 3000, 'tela do truco');
    if (!$('.tr-regras details')) throw new Error('faltou o "como jogar" do truco');
    clicar(botaoComTexto('1 contra 1'));
    clicar(botaoComTexto('Dicas sempre'));
    clicar(botaoComTexto('Começar partida'));
    await ate(() => $('.tr-jogo') && $('#app').classList.contains('em-jogo'), 5000, 'mesa do truco');
    let acoes = 0, pediu = false;
    const t0 = Date.now();
    while (acoes < 5) {
      if (Date.now() - t0 > 90000) throw new Error('truco: tempo esgotado jogando');
      const prox = $('.tr-fim .btn-ouro'), aceitar = $('.tr-acoes .btn-aceitar:not(:disabled)'), carta = $('.tr-mao.jogavel .tr-carta-mao');
      if (prox) clicar(prox);
      else if (aceitar) { clicar(aceitar); acoes++; }
      else if (carta && !$('.tr-coach .calc')) {
        const truco = $('.tr-acoes .btn-truco:not(:disabled)');
        if (!pediu && truco) { clicar(truco); pediu = true; } else clicar(carta);
        acoes++;
      }
      await dormir(200);
    }
    const jogoT = P.UITrucoMesa._jogo();
    if (!jogoT || !jogoT.notas.length) throw new Error('truco: o coach não avaliou nenhuma decisão');
    // a conta do coach: no PC fica no painel ao lado da mesa (como no poker); no celular abre numa janela
    clicar($('.tr-coach'));
    await ate(() => $('.modal .tr-coach-modal') || $('.tr-painel:not(.recolhido) .tr-coach-modal'), 3000, 'coach do truco');
    if ($('.modal .tr-coach-modal')) clicar($('.modal .fechar'));
    clicar($('.tr-barra button[title="Menu"]'));
    await ate(() => $('.modal .menu-mesa'), 3000, 'menu do truco');
    clicar(botaoComTexto('Sair da partida', '.modal'));
    await ate(() => botaoComTexto('Continuar jogando', '.modal'), 3000, 'confirmação de saída');
    clicar(botaoComTexto('Sair', '.modal .modal-rodape'));
    await ate(() => $('.truco-continuar') && !$('#app').classList.contains('em-jogo'), 5000, 'partida salva');
    clicar(botaoComTexto('Continuar', '.truco-continuar'));
    await ate(() => $('.tr-jogo'), 5000, 'partida retomada');
    await dormir(400);
    clicar($('.tr-barra button[title="Menu"]'));
    await ate(() => $('.modal .menu-mesa'), 3000, 'menu do truco 2');
    clicar(botaoComTexto('Sair da partida', '.modal'));
    await ate(() => botaoComTexto('Continuar jogando', '.modal'), 3000, 'confirmação de saída 2');
    clicar(botaoComTexto('Sair', '.modal .modal-rodape'));
    await ate(() => $('.truco-continuar'), 5000, 'partida salva 2');
    clicar(botaoComTexto('Descartar', '.truco-continuar'));
    await ate(() => botaoComTexto('Manter', '.modal'), 3000, 'confirmação de descarte');
    clicar(botaoComTexto('Descartar', '.modal .modal-rodape'));
    await ate(() => !$('.truco-continuar') && $('.truco-novo'), 3000, 'partida descartada');
    passo(`truco ok (${jogoT.notas.length} notas do coach)`);

    // 11) torneio de truco paranaense: 3 jogadores, chave, jogar, esconder a manilha, sair (salvo), continuar, abandonar
    clicar(botaoComTexto('Torneio', '.tr-abas'));
    clicar(botaoComTexto('Paranaense'));
    clicar(botaoComTexto('1 contra 1'));
    const qtd = $('#tr-qtd');
    qtd.value = '3'; qtd.dispatchEvent(new Event('change'));
    await ate(() => $('#tr-qtd') && $('#tr-qtd').value === '3', 3000, 'participantes');
    clicar(botaoComTexto('Começar torneio'));
    await ate(() => $('.tr-torneio .tr-t-chave'), 5000, 'chave do torneio');
    await ate(() => $('#tr-t-jogar'), 30000, 'botão jogar');
    clicar($('#tr-t-jogar'));
    await ate(() => $('.tr-jogo') && /Paranaense/.test($('.tr-chip-info').textContent), 5000, 'mesa do torneio');
    // esconder a manilha pelo menu
    await ate(() => $('.tr-centro .rotulo-vira b'), 15000, 'vira com a manilha');
    clicar($('.tr-barra button[title="Menu"]'));
    await ate(() => $('.modal .menu-mesa'), 3000, 'menu');
    clicar(botaoComTexto('Esconder a manilha', '.modal'));
    await ate(() => !$('.modal') && $('.tr-centro .sem-manilha') && !$('.tr-mao .nome-carta.manilha'), 3000, 'manilha escondida');
    let acoesT = 0;
    const t1 = Date.now();
    while (acoesT < 3) {
      if (Date.now() - t1 > 90000) throw new Error('torneio: tempo esgotado jogando');
      const prox = $('.tr-fim .btn-ouro'), aceitar = $('.tr-acoes .btn-aceitar:not(:disabled)'), carta = $('.tr-mao.jogavel .tr-carta-mao');
      if (prox) clicar(prox);
      else if (aceitar) { clicar(aceitar); acoesT++; }
      else if (carta && !$('.tr-coach .calc')) { clicar(carta); acoesT++; }
      await dormir(200);
    }
    clicar($('.tr-barra button[title="Menu"]'));
    await ate(() => $('.modal .menu-mesa'), 3000, 'menu 2');
    clicar(botaoComTexto('Mostrar a manilha', '.modal'));
    clicar($('.tr-barra button[title="Menu"]'));
    await ate(() => $('.modal .menu-mesa'), 3000, 'menu 3');
    clicar(botaoComTexto('Sair da partida', '.modal'));
    await ate(() => botaoComTexto('Continuar jogando', '.modal'), 3000, 'confirmação de saída do torneio');
    clicar(botaoComTexto('Sair', '.modal .modal-rodape'));
    await ate(() => $('.tr-torneio') && $('#tr-t-jogar') && /Continuar o jogo/.test($('#tr-t-jogar').textContent), 5000, 'jogo do torneio salvo');
    clicar(botaoComTexto('Abandonar', '.tr-t-cab'));
    await ate(() => botaoComTexto('Continuar no torneio', '.modal'), 3000, 'confirmação de abandono');
    clicar(botaoComTexto('Abandonar', '.modal .modal-rodape'));
    await ate(() => $('.truco-novo') && !$('.tr-torneio'), 5000, 'torneio abandonado');
    if (P.Truco.Dados.torneio() || P.Truco.Dados.salva()) throw new Error('torneio abandonado ficou salvo');
    if (P.Truco.Dados.estat().torneios.jogados !== 1) throw new Error('torneio abandonado não contou como jogado');
    passo('torneio ok');

    // 10) Última!: lobby, uma partida curta (jogue cartas que servem, compre quando não houver), coach, sair
    P.Config.set('velocidade', 'turbo');
    P.App.irPara('uno');
    await ate(() => $('.uno .truco-novo'), 3000, 'lobby do Última!');
    clicar(botaoComTexto('3', '.uno .truco-novo'));
    P.UIUnoMesa.iniciar({ n: 3, semSalvar: true, amostras: 40, amostrasBots: 10, velocidade: 0.05 });
    let jogadasU = 0;
    const t0U = Date.now();
    while (jogadasU < 4 && Date.now() - t0U < 60000) {
      await dormir(150);
      if ($('.un-fim .btn-ouro')) { clicar($('.un-fim .btn-ouro')); continue; }
      if (!$('.un-cores.oculto') && $('.un-cores .un-cor')) { clicar($('.un-cores .un-cor')); jogadasU++; continue; }
      const carta = $('.un-mao.jogavel .un-carta-mao.pode');
      const b = $('.un-acoes .btn-acao:not(:disabled)[class*="btn-aceitar"], .un-acoes .btn-acao:not(:disabled).btn-correr');
      if (carta) { clicar(carta); if (!$('.un-cores') || $('.un-cores').classList.contains('oculto')) jogadasU++; }
      else if (b && P.UIUnoMesa._jogo() && P.UIUnoMesa._jogo().pendente) { clicar(b); jogadasU++; }
    }
    if (jogadasU < 4) throw new Error('Última!: não consegui jogar');
    clicar($('.un-acoes .tr-coach'));
    await ate(() => $('.modal .tr-coach-modal') || $('.tr-painel:not(.recolhido) .tr-coach-modal'), 3000, 'coach do Última!');
    if ($('.modal .tr-coach-modal')) clicar($('.modal .fechar'));
    P.UIUnoMesa.encerrar();
    passo('última ok (' + jogadasU + ' jogadas)');

    // 11) Xadrez: lobby, e2-e4 por toque, resposta do bot, desfazer, sair
    P.App.irPara('xadrez');
    await ate(() => $('.xadrez .truco-novo'), 3000, 'lobby do xadrez');
    clicar(botaoComTexto('Casual', '.xadrez .truco-novo'));
    P.UIXadrezMesa.iniciar({ semSalvar: true, cor: 'brancas', nivel: 1, tempoCoach: 300 });
    await ate(() => $('.xz-tabuleiro .xz-casa[data-casa="20"] .xz-peca'), 5000, 'tabuleiro');
    const tocar = s => { const c = $(`.xz-casa[data-casa="${s}"]`), r = c.getBoundingClientRect(); c.parentNode.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 })); c.parentNode.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 })); };
    tocar(20); await dormir(80); tocar(52);                      // e2 → e4
    await ate(() => P.UIXadrezMesa._jogo().lances.length >= 2, 15000, 'resposta do bot');
    tocar(6); await dormir(80); tocar(37);                       // Cg1 → f3
    await ate(() => P.UIXadrezMesa._jogo().lances.length >= 4, 15000, 'segunda resposta');
    await ate(() => !$('.xz-acoes .btn-cobrir').disabled, 5000, 'desfazer liberado');
    clicar($('.xz-acoes .btn-cobrir'));
    await ate(() => P.UIXadrezMesa._jogo().lances.length === 2, 3000, 'desfeito');
    const lancesX = P.UIXadrezMesa._jogo().sans.join(' ');
    P.UIXadrezMesa.encerrar();
    passo('xadrez ok (' + lancesX + ')');
  }

  // dentro do simulador de celular (testes/celular.html) o resultado vai também para a página de fora
  const avisarFora = () => { if (window.parent !== window) window.parent.postMessage({ tipo: 'layout', estado: raiz.getAttribute('data-roteiro'), log: log.join(' | ') }, '*'); };
  roteiro().then(() => { raiz.setAttribute('data-roteiro', 'ok'); avisarFora(); })
    .catch(e => { raiz.setAttribute('data-roteiro', 'falha'); passo('ERRO: ' + e.message); avisarFora(); });
})(window.Poker = window.Poker || {});
