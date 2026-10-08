/* ==========================================================================
   OUTS · Treino Lab — treino.js
   Perguntas de matemática do poker: treino relâmpago (fora da mesa) e o
   modo quiz (na mesa, antes de você agir). Cada pergunta traz a resposta,
   a tolerância e a explicação.
   ========================================================================== */
(function (P) {
  'use strict';

  const RNG = P.RNG, An = P.Analise, C = P.Cartas;
  const pct = (x, c = 1) => (x * 100).toFixed(c).replace('.', ',') + '%';
  const num = (x, c = 1) => x.toFixed(c).replace('.', ',');

  const TIPOS = {
    outs: 'Contar outs',
    regra: 'Regra do 4 e do 2',
    potodds: 'Pot odds (equity necessária)',
    razao: 'Pot odds em razão',
    mdf: 'MDF (defesa mínima)',
    alfa: 'Frequência do blefe',
    equity: 'Equity pré-flop',
    fatos: 'Probabilidades úteis'
  };

  function baralhoEmbaralhado() { return P.Baralho.embaralhar(P.Baralho.novoOrdenado()); }

  // ------------------------------------------------------------- geradores
  function gerarOuts() {
    for (let tent = 0; tent < 400; tent++) {
      const d = baralhoEmbaralhado();
      const hole = [d[0], d[1]];
      const board = d.slice(2, RNG.chance(0.7) ? 5 : 6);
      const cl = An.classificarMao(hole, board);
      if (cl.nivel === 'monstro' || cl.nivel === 'forte') continue;
      const o = An.outs(hole, board);
      if (!o.draws.length || o.limpos < 4 || o.limpos > 15) continue;
      const tipos = {};
      o.outs.filter(x => x.peso >= 1).forEach(x => x.tipos.forEach(t => { tipos[t] = (tipos[t] || 0) + 1; }));
      const sujos = o.outs.filter(x => x.peso < 1);
      return {
        tipo: 'outs', unidade: 'outs', resposta: o.limpos, tolerancia: 0,
        enunciado: 'Quantos outs LIMPOS você tem para melhorar para uma mão forte?',
        cartas: hole, board,
        explicacao: `Draws: ${o.draws.join(', ')}. Outs limpos: ${o.limpos} (` +
          Object.keys(tipos).map(t => `${tipos[t]} de ${t}`).join(', ') + `): ${C.listaBonita(o.outs.filter(x => x.peso >= 1).map(x => x.carta))}.` +
          (sujos.length ? ` Sujos (não contam inteiros): ${sujos.map(x => C.bonito(x.carta) + ' — ' + x.motivo).join('; ')}.` : '')
      };
    }
    return gerarRegra();
  }

  function gerarRegra() {
    const nOuts = RNG.escolher([4, 6, 8, 9, 12, 15]);
    const flop = RNG.chance(0.6);
    const pr = An.probabilidades(nOuts, flop ? 3 : 4);
    if (flop) {
      return {
        tipo: 'regra', unidade: '%', resposta: pr.regra4 * 100, tolerancia: 2,
        enunciado: `Flop: você tem ${nOuts} outs e vai ver turn e river (all-in). Pela regra do 4, qual a chance de acertar até o river?`,
        explicacao: `Regra do 4: ${nOuts} × 4 = ${nOuts * 4}%` + (nOuts > 8 ? `, menos (${nOuts} − 8) = ${nOuts - 8} de correção → ${num(pr.regra4 * 100, 0)}%` : '') +
          `. Valor exato: 1 − C(${47 - nOuts},2)/C(47,2) = ${pct(pr.exatoAteRiver)}.`
      };
    }
    return {
      tipo: 'regra', unidade: '%', resposta: pr.regra2 * 100, tolerancia: 2,
      enunciado: `Turn: você tem ${nOuts} outs para o river. Pela regra do 2, qual a chance de acertar?`,
      explicacao: `Regra do 2: ${nOuts} × 2 = ${nOuts * 2}%. Valor exato: ${nOuts}/46 = ${pct(pr.exatoProxima)}.`
    };
  }

  function sortearPoteAposta() {
    const pote = RNG.escolher([40, 60, 80, 100, 120, 150, 200, 240, 300]);
    const frac = RNG.escolher([0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2]);
    return { pote, aposta: Math.round(pote * frac / 5) * 5 || 5 };
  }

  function gerarPotOdds() {
    const { pote, aposta } = sortearPoteAposta();
    const nec = aposta / (pote + 2 * aposta);
    return {
      tipo: 'potodds', unidade: '%', resposta: nec * 100, tolerancia: 2,
      enunciado: `O pote tem ${pote}. O vilão aposta ${aposta}. Qual a equity mínima para pagar?`,
      explicacao: `Equity necessária = pagar ÷ (pote + aposta + pagar) = ${aposta} ÷ (${pote} + ${aposta} + ${aposta}) = ${pct(nec)}.`
    };
  }

  function gerarRazao() {
    const { pote, aposta } = sortearPoteAposta();
    const r = (pote + aposta) / aposta;
    return {
      tipo: 'razao', unidade: ':1', resposta: r, tolerancia: 0.2,
      enunciado: `Pote ${pote}, aposta do vilão ${aposta}. As pot odds são quantos para 1?`,
      explicacao: `O pote fica ${pote + aposta} e você paga ${aposta}: ${pote + aposta} ÷ ${aposta} = ${num(r)} : 1 (equity necessária 1 ÷ (${num(r)} + 1) = ${pct(1 / (r + 1))}).`
    };
  }

  function gerarMDF() {
    const { pote, aposta } = sortearPoteAposta();
    const mdf = pote / (pote + aposta);
    return {
      tipo: 'mdf', unidade: '%', resposta: mdf * 100, tolerancia: 2,
      enunciado: `O vilão aposta ${aposta} num pote de ${pote}. Qual a MDF (com que frequência você precisa continuar para o blefe dele não lucrar automaticamente)?`,
      explicacao: `MDF = pote ÷ (pote + aposta) = ${pote} ÷ ${pote + aposta} = ${pct(mdf)}.`
    };
  }

  function gerarAlfa() {
    const { pote, aposta } = sortearPoteAposta();
    const a = aposta / (pote + aposta);
    return {
      tipo: 'alfa', unidade: '%', resposta: a * 100, tolerancia: 2,
      enunciado: `Você quer blefar ${aposta} num pote de ${pote}. O vilão precisa foldar em pelo menos quantos % para o blefe empatar?`,
      explicacao: `Frequência de equilíbrio do blefe = aposta ÷ (pote + aposta) = ${aposta} ÷ ${pote + aposta} = ${pct(a)}.`
    };
  }

  const CONFRONTOS = [
    ['AsKd', '2c2h', 'Par pequeno × duas overcards: quase cara ou coroa.'],
    ['AsKs', 'QhQd', 'Par médio contra duas overcards naipadas.'],
    ['AhAd', 'KsKc', 'Par maior contra par menor: ~4,5 para 1.'],
    ['AsKd', 'AhQc', 'Dominação: o kicker menor tem só 3 outs "limpos".'],
    ['JhTh', 'AsKd', 'Conectores naipados contra AK: não é tão ruim quanto parece.'],
    ['8s8d', 'AhKc', 'O "coin flip" clássico.'],
    ['AsKd', 'KhQc', 'K dominado pelo AK.'],
    ['7h6h', 'AsAd', 'Conectores contra AA: cerca de 1 em 5.'],
    ['QsQd', 'AhKc', 'QQ é leve favorito contra AK.'],
    ['AsTd', 'KhQc', 'Ás alto contra duas cartas médias.'],
    ['5s5d', '4h4c', 'Par contra par menor.'],
    ['AhJh', 'KsKd', 'Ás naipado contra par alto.']
  ];

  function gerarEquity() {
    const [a, b, dica] = RNG.escolher(CONFRONTOS);
    const r = P.Equity.monteCarloSincrono({ jogadores: [a, b], iteracoes: 8000 });
    const ca = C.lista(a), cb = C.lista(b);
    return {
      tipo: 'equity', unidade: '%', resposta: r.equity[0] * 100, tolerancia: 5,
      enunciado: `Pré-flop, all-in: ${C.listaBonita(ca)} contra ${C.listaBonita(cb)}. Qual a equity da primeira mão?`,
      cartas: ca, cartasVilao: cb,
      explicacao: `${dica} Valor calculado: ${pct(r.equity[0])} × ${pct(r.equity[1])}.`
    };
  }

  const FATOS = [
    ['Com um par na mão, qual a chance de acertar set (ou melhor) no flop?', 11.8, 1.5, 'Cerca de 11,8% (≈ 1 em 8,5): por isso "set mining" exige implied odds de ~15 a 20 vezes o call.'],
    ['Com flush draw no flop, qual a chance de completar até o river?', 35, 2, '9 outs: 1 − (38×37)/(47×46) ≈ 35,0%.'],
    ['Com open-ended no flop, qual a chance de completar até o river?', 31.5, 2, '8 outs: ≈ 31,5%.'],
    ['Com gutshot no flop, qual a chance de completar até o river?', 16.5, 2, '4 outs: ≈ 16,5%.'],
    ['Com flush draw + open-ended (15 outs) no flop, qual a chance até o river?', 54.1, 2.5, '15 outs: ≈ 54,1% — você é favorito!'],
    ['Qual a chance de receber um par na mão?', 5.9, 0.5, '3/51 ≈ 5,88%.'],
    ['Qual a chance de receber AA?', 0.45, 0.1, '6 combos em 1.326 ≈ 0,45% (1 em 221).'],
    ['Qual a chance de receber duas cartas do mesmo naipe?', 23.5, 1, '12/51 ≈ 23,5%.'],
    ['Com duas cartas naipadas, qual a chance de flopar flush feito?', 0.84, 0.3, 'C(11,3)/C(50,3) ≈ 0,84%.'],
    ['Com duas naipadas, qual a chance de flopar flush draw (exatamente 2 do naipe)?', 10.9, 1.5, '≈ 10,9%.']
  ];

  function gerarFato() {
    const [enunciado, resposta, tol, exp] = RNG.escolher(FATOS);
    return { tipo: 'fatos', unidade: '%', resposta, tolerancia: tol, enunciado, explicacao: exp };
  }

  const GERADORES = { outs: gerarOuts, regra: gerarRegra, potodds: gerarPotOdds, razao: gerarRazao, mdf: gerarMDF, alfa: gerarAlfa, equity: gerarEquity, fatos: gerarFato };

  function gerar(tipos) {
    const lista = tipos && tipos.length ? tipos : Object.keys(GERADORES);
    return GERADORES[RNG.escolher(lista)]();
  }

  // ---------------------------------------------------------- correção
  /**
   * Corrige a resposta. Pontos: até 100 pela precisão + até 50 pela velocidade.
   */
  function corrigir(p, resposta, ms) {
    if (p.opcoes) {
      const acertou = resposta === p.resposta;
      const pontos = acertou ? 100 + Math.max(0, Math.round(50 * (1 - ms / 15000))) : 0;
      return { acertou, parcial: false, pontos, erro: acertou ? 0 : 1 };
    }
    const v = parseFloat(String(resposta).replace(',', '.'));
    if (isNaN(v)) return { acertou: false, parcial: false, pontos: 0, erro: Infinity };
    const erro = Math.abs(v - p.resposta);
    const acertou = erro <= p.tolerancia + 1e-9;
    const parcial = !acertou && erro <= Math.max(p.tolerancia * 2.5, p.unidade === 'outs' ? 1 : 0.5);
    const velocidade = Math.max(0, Math.round(50 * (1 - ms / 15000)));
    const pontos = acertou ? 100 + velocidade : parcial ? 40 + Math.round(velocidade / 2) : 0;
    return { acertou, parcial, pontos, erro };
  }

  // ------------------------------------------------- quiz na mesa (modo c)
  /** Perguntas sobre a situação real, a partir da análise do coach. */
  function perguntasDaMesa(an) {
    const out = [];
    if (!an) return out;
    if (an.rua === 'preflop') {
      const fam = a => (a === 'raise' || a === 'bet') ? 'aumentar' : a === 'allin' ? 'all-in' : a === 'call' ? 'pagar' : a === 'check' ? 'check' : 'fold';
      const opcoes = an.podeCheck ? ['check', 'aumentar'] : ['fold', 'pagar', 'aumentar'];
      if (an.preflop && an.preflop.plano.allin && opcoes.indexOf('all-in') < 0) opcoes.push('all-in');
      out.push({
        tipo: 'acao', opcoes, resposta: fam(an.recomendacao.acao),
        enunciado: `Pré-flop com ${an.classe} no ${an.posicao}: qual a jogada recomendada?`,
        explicacao: an.passos.join(' ')
      });
      return out;
    }
    const pf = an.posflop;
    if (pf.outs.limpos > 0 && an.board.length < 5) {
      out.push({
        tipo: 'outs', unidade: 'outs', resposta: pf.outs.limpos, tolerancia: 1,
        enunciado: 'Quantos outs limpos você tem?',
        explicacao: `Draws: ${pf.outs.draws.join(', ') || 'nenhum'}. Limpos: ${pf.outs.limpos}` +
          (pf.outs.sujos ? `; sujos: ${pf.outs.sujos} (contam pela metade ou menos).` : '.')
      });
    }
    if (an.paraPagar > 0) {
      out.push({
        tipo: 'potodds', unidade: '%', resposta: pf.potOdds.necessaria * 100, tolerancia: 3,
        enunciado: 'Qual a equity necessária para pagar (pot odds)?',
        explicacao: `Pagar ÷ (pote + pagar) = ${pct(pf.potOdds.necessaria)} (razão ${num(pf.potOdds.razao)}:1).`
      });
    }
    if (an.equity) {
      out.push({
        tipo: 'equity', unidade: '%', resposta: an.equity.valor * 100, tolerancia: 8,
        enunciado: 'Qual a sua equity aproximada contra o range estimado?',
        explicacao: `Monte Carlo (${an.equity.iteracoes.toLocaleString('pt-BR')} simulações): ${pct(an.equity.valor)}.`
      });
    }
    return out;
  }

  // ---------------------------------------------------- histórico do treino
  const CHAVE = 'treino.sessoes';
  function salvarSessao(s) {
    const lista = P.Armazenamento.ler(CHAVE, []);
    lista.push(s);
    while (lista.length > 60) lista.shift();
    P.Armazenamento.gravar(CHAVE, lista);
  }
  function sessoes() { return P.Armazenamento.ler(CHAVE, []); }

  P.Treino = { TIPOS, gerar, corrigir, perguntasDaMesa, salvarSessao, sessoes };
})(window.Poker = window.Poker || {});
