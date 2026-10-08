/* ==========================================================================
   OUTS · Treino Lab — relatorio.js
   Análise de desempenho no fim da partida: nota geral, EV perdido, acertos
   por street, estilo (VPIP, PFR, 3-bet...) comparado com a faixa ideal para
   o tamanho da mesa, principais vazamentos com dica, decisões mais caras,
   boas jogadas e plano de treino. Funciona mesmo com o coach desligado:
   as decisões são avaliadas em silêncio durante o jogo.
   ========================================================================== */
(function (P) {
  'use strict';

  const PESO_NOTA = { otima: 1, boa: 0.8, imprecisa: 0.5, erro: 0.2, grave: 0 };
  const RUAS = ['preflop', 'flop', 'turn', 'river'];

  // Dica de cada tipo de vazamento + treino recomendado
  const DICAS = {
    pre_abriu_fora: { dica: 'Entre no pote só com o range da posição (veja a grade 13×13 do coach). Mãos fora do range viram potes difíceis, muitas vezes fora de posição.', treino: null, estudo: 'ranges' },
    pre_foldou_range: { dica: 'Você está largando mãos lucrativas. Do CO, do botão e do SB o range de abertura é largo: roubar os blinds é dinheiro fácil.', treino: null, estudo: 'ranges' },
    pre_pagou_fraco: { dica: 'Pagar raise com mão fraca é o vazamento mais caro do pré-flop. Diante de um raise: 3-bet com as melhores, pague as boas em posição, folde o resto.', treino: null, estudo: 'ranges' },
    pre_foldou_forte: { dica: 'Mãos boas contra raise têm preço para continuar, principalmente em posição ou no big blind (você já tem fichas no pote).', treino: 'potodds', estudo: 'ranges' },
    pre_passivo: { dica: 'Com mãos fortes, aumente. Limp ou call deixa os outros verem o flop barato e esconde pouco da sua mão.', treino: null, estudo: 'ranges' },
    pre_pushfold: { dica: 'Com menos de 15 bb é push ou fold. Decore os ranges de all-in por posição: quanto menos gente atrás e menos fichas, mais largo.', treino: null, estudo: 'pushfold' },
    pos_call_sem_odds: { dica: 'Antes de pagar, compare equity com o preço: pagar ÷ (pote + pagar). Se a sua equity for menor, o call perde dinheiro no longo prazo.', treino: 'potodds' },
    pos_fold_com_odds: { dica: 'Você está foldando mãos que tinham preço. Conte os outs, use a regra do 4 e do 2 e compare com a equity necessária.', treino: 'outs' },
    pos_perdeu_valor: { dica: 'Com mão forte, aposte: quem paga com mão pior é a sua maior fonte de lucro. O check só serve quando o vilão blefa muito.', treino: null },
    pos_blefe_ruim: { dica: 'Blefe precisa de fold equity: escolha vilões que desistem (nits, TAGs) e boards que favorecem o seu range. Nunca blefe calling station.', treino: 'alfa' },
    pos_tamanho: { dica: 'Ajuste o tamanho: boards secos pedem apostas pequenas; boards molhados, apostas grandes para cobrar dos draws.', treino: 'mdf' },
    pos_linha: { dica: 'Compare as opções pelo EV antes de agir: check, aposta pequena e aposta grande rendem coisas diferentes em cada spot.', treino: 'mdf' },
    tamanho: { dica: 'Abra com tamanhos padrão (2 a 3 bb, mais 1 bb por limper). Tamanhos estranhos entregam a força da mão.', treino: null, estudo: 'ranges' }
  };

  /** Faixas de referência de um jogador sólido pelo tamanho da mesa. */
  function faixasIdeais(lugares) {
    if (lugares <= 2) return { vpip: [0.5, 0.75], pfr: [0.4, 0.65], tresBet: [0.12, 0.25] };
    if (lugares <= 4) return { vpip: [0.28, 0.4], pfr: [0.22, 0.32], tresBet: [0.08, 0.14] };
    if (lugares <= 6) return { vpip: [0.21, 0.29], pfr: [0.17, 0.24], tresBet: [0.06, 0.11] };
    return { vpip: [0.15, 0.23], pfr: [0.12, 0.19], tresBet: [0.05, 0.09] };
  }

  function conceito(nota) {
    if (nota >= 9) return 'Excelente: jogo sólido e consistente.';
    if (nota >= 7.5) return 'Muito bom: poucos erros, e quase todos pequenos.';
    if (nota >= 6) return 'Bom, com ajustes a fazer nos vazamentos abaixo.';
    if (nota >= 4) return 'Precisa treinar: os mesmos erros estão se repetindo.';
    return 'Fundamentos em construção: foque em um vazamento por vez.';
  }

  /**
   * dados: { modo, rotulo, lugares, maos: [registros do histórico], decisoes: [decisões avaliadas],
   *          inicio, fim (resultado do SNG/torneio) , resultadoCash, bb, abandonou }
   */
  function gerar(d) {
    const decisoes = d.decisoes || [];
    const n = decisoes.length;
    const dist = { otima: 0, boa: 0, imprecisa: 0, erro: 0, grave: 0 };
    let perda = 0, qualidade = 0;
    const porRua = {};
    RUAS.forEach(r => { porRua[r] = { total: 0, corretas: 0, perdaBB: 0 }; });
    const erros = {};
    decisoes.forEach(x => {
      const nt = x.nota;
      dist[nt.nota]++;
      perda += nt.perdaBB;
      qualidade += PESO_NOTA[nt.nota];
      const r = porRua[nt.rua] || porRua.river;
      r.total++;
      if (nt.nota === 'otima' || nt.nota === 'boa') r.corretas++;
      r.perdaBB += nt.perdaBB;
      if (nt.categoria) {
        if (!erros[nt.categoria]) erros[nt.categoria] = { id: nt.categoria, n: 0, perdaBB: 0 };
        erros[nt.categoria].n++;
        erros[nt.categoria].perdaBB += nt.perdaBB;
      }
    });
    const nota = n ? 10 * qualidade / n : null;

    // estilo nesta partida
    const est = P.Estatisticas.resumirMaos(d.maos || [], d.modo);
    const ideal = faixasIdeais(d.lugares);
    const estilo = [];
    const poucas = est.maos < 20;      // amostra pequena: mostra os números, mas não julga
    const avaliar = (nome, valor, faixa, alto, baixo) => {
      if (valor === null || valor === undefined) return;
      const st = poucas ? 'amostra' : valor > faixa[1] ? 'alto' : valor < faixa[0] ? 'baixo' : 'ok';
      estilo.push({ nome, valor, faixa, status: st, comentario: st === 'alto' ? alto : st === 'baixo' ? baixo : st === 'amostra' ? 'Amostra pequena para avaliar.' : 'Dentro da faixa de um jogador sólido.' });
    };
    avaliar('VPIP', est.vpip, ideal.vpip, 'Você está entrando em potes demais: aperte o range, principalmente nas primeiras posições.', 'Você está jogando muito pouco: as posições finais pedem mais mãos.');
    avaliar('PFR', est.pfr, ideal.pfr, 'Muitos aumentos pré-flop: cuidado para não abrir mãos fracas.', 'Poucos aumentos: entre no pote aumentando, não pagando.');
    avaliar('3-bet', est.tresBet, ideal.tresBet, '3-bet frequente demais: os bons jogadores vão pagar e te punir em posição.', 'Pouco 3-bet: você deixa os agressivos roubarem à vontade.');
    if (est.af !== null && isFinite(est.af) && !poucas) {
      estilo.push({ nome: 'Agressividade', valor: est.af, faixa: [2, 4], status: est.af > 4.5 ? 'alto' : est.af < 1.5 ? 'baixo' : 'ok', fator: true,
        comentario: est.af < 1.5 ? 'Muito passivo depois do flop: você paga mais do que aposta. Quem aposta ganha também quando o vilão desiste.' :
          est.af > 4.5 ? 'Agressividade muito alta: contra calling stations, isso vira blefe pago.' : 'Equilíbrio bom entre apostar e pagar.' });
    }
    if (est.wtsd !== null && !poucas) {
      estilo.push({ nome: 'WTSD', valor: est.wtsd, faixa: [0.24, 0.34], status: est.wtsd > 0.36 ? 'alto' : est.wtsd < 0.22 ? 'baixo' : 'ok',
        comentario: est.wtsd > 0.36 ? 'Você vai demais ao showdown: está pagando o river com mãos fracas.' : est.wtsd < 0.22 ? 'Você desiste muito antes do showdown: o vilão percebe e blefa mais.' : 'Frequência saudável de showdown.' });
    }

    const listaErros = Object.values(erros).map(e => Object.assign(e, {
      nome: (P.Coach.NOMES_ERRO[e.id]) || e.id,
      dica: (DICAS[e.id] || {}).dica || '',
      treino: (DICAS[e.id] || {}).treino || null,
      estudo: (DICAS[e.id] || {}).estudo || null
    })).sort((a, b) => b.perdaBB - a.perdaBB);

    const piores = decisoes.filter(x => x.nota.perdaBB > 0.3).sort((a, b) => b.nota.perdaBB - a.nota.perdaBB).slice(0, 3);
    const melhores = decisoes.filter(x => x.nota.nota === 'otima' && x.rua !== 'preflop').sort((a, b) => (b.pote || 0) - (a.pote || 0)).slice(0, 3);
    if (melhores.length < 2) {
      decisoes.filter(x => x.nota.nota === 'otima' && x.rua === 'preflop' && melhores.indexOf(x) < 0 && x.nota.acao && x.nota.acao.tipo !== 'fold')
        .sort((a, b) => (b.pote || 0) - (a.pote || 0)).slice(0, 3 - melhores.length).forEach(x => melhores.push(x));
    }

    // pontos fortes: streets com 85%+ de acerto
    const fortes = RUAS.filter(r => porRua[r].total >= 3 && porRua[r].corretas / porRua[r].total >= 0.85)
      .map(r => `${r === 'preflop' ? 'Pré-flop' : r[0].toUpperCase() + r.slice(1)}: ${Math.round(porRua[r].corretas / porRua[r].total * 100)}% de decisões certas.`);
    estilo.filter(e => e.status === 'ok').forEach(e => fortes.push(`${e.nome} dentro da faixa ideal.`));

    // plano de treino
    const plano = [];
    const treinos = {};
    listaErros.slice(0, 3).forEach(e => { if (e.treino) treinos[e.treino] = true; });
    if (listaErros.some(e => e.estudo === 'ranges')) plano.push('Antes da próxima sessão, revise a grade 13×13 das posições em que você errou (o coach mostra a grade em cada decisão pré-flop).');
    if (listaErros.some(e => e.estudo === 'pushfold')) plano.push('Jogue um Sit & Go turbo com o coach em "Dicas sempre" e acompanhe a tabela de push/fold quando ficar com menos de 15 bb.');
    Object.keys(treinos).forEach(t => plano.push(`Faça uma rodada de treino relâmpago de "${P.Treino.TIPOS[t]}".`));
    if (!plano.length && n) plano.push(nota >= 8 ? 'Mantenha o ritmo: experimente um nível acima ou o coach desligado para testar o automático.' : 'Jogue mais algumas mãos com o coach em "Sob pedido" para fixar o raciocínio.');
    if (est.maos < 30) plano.push(`Amostra pequena (${est.maos} mãos): as estatísticas de estilo ainda oscilam bastante.`);

    const minutos = Math.max(1, Math.round((Date.now() - (d.inicio || Date.now())) / 60000));
    return {
      modo: d.modo, rotulo: d.rotulo, lugares: d.lugares, minutos,
      maos: est.maos, decisoes: n, dist, perdaBB: perda, perdaPorDecisao: n ? perda / n : 0,
      perdaPor100: est.maos ? perda / est.maos * 100 : 0,
      nota, conceito: nota === null ? 'Nenhuma decisão sua foi avaliada nesta partida.' : conceito(nota),
      porRua, estilo, erros: listaErros, piores, melhores, fortes, plano, treinos: Object.keys(treinos),
      fim: d.fim || null, resultadoCash: d.resultadoCash, bb: d.bb, abandonou: !!d.abandonou, est
    };
  }

  P.Relatorio = { gerar, faixasIdeais, DICAS };
})(window.Poker = window.Poker || {});
