/* ==========================================================================
   OUTS · Treino Lab — testes/testes-app.js
   Testes das Fases 3 a 6: leitura de mão, outs, textura, ICM, estruturas
   de SNG/torneio, field simulado, bots, coach e partidas automáticas.
   As partidas completas (cash, SNG e torneio, com 2 e 9 jogadores) rodam
   com o herói jogando sozinho, sem animação.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const C = P.Cartas, An = P.Analise, E = P.Estruturas;
  const L = s => C.lista(s);
  const pct = x => (x * 100).toFixed(1).replace('.', ',') + '%';
  const soma = a => a.reduce((s, x) => s + x, 0);

  // ======================================================= leitura de mão
  let G = 'Análise: outs, draws e mão feita';

  T(G, 'Flush draw = 9 outs limpos', a => {
    const o = An.outs(L('Ah 9h'), L('Kh 7h 2c'));
    a.igual(o.limpos, 9);
    a.verdadeiro(o.draws.some(d => /Flush draw \(nut\)/.test(d)), 'deveria ser nut flush draw');
    return o.draws.join(', ') + ' · ' + o.limpos + ' limpos';
  });

  T(G, 'Open-ended = 8 outs; em flop de dois naipes, 2 deles ficam sujos', a => {
    const o = An.outs(L('9c 8d'), L('Ts 7h 2c'));
    a.igual(o.limpos, 8, 'arco-íris');
    const o2 = An.outs(L('9c 8d'), L('Th 7h 2c'));
    a.igual(o2.limpos, 6, 'dois naipes: J♥ e 6♥ colocam 3 copas na mesa');
    a.igual(o2.sujos, 2);
    return 'arco-íris: 8 limpos · dois naipes: 6 limpos + 2 sujos';
  });

  T(G, 'Gutshot = 4 outs; combo draw (flush + open-ended) = 15 outs', a => {
    a.igual(An.outs(L('Kc Qd'), L('Js 9h 2c')).limpos, 4, 'gutshot');
    a.igual(An.outs(L('Jh Th'), L('9h 8c 2h')).limpos, 15, 'combo draw');
  });

  T(G, 'Par na mão = 2 outs de set; duas overcards = 6 outs descontados', a => {
    a.igual(An.outs(L('7c 7d'), L('Ks 9h 2c')).limpos, 2, 'set');
    const o = An.outs(L('Ac Kd'), L('9s 6h 2c'));
    a.igual(o.sujos, 6, 'overcards contam como sujas');
    a.proximo(o.efetivos, 3, 1e-9, 'valem metade');
  });

  T(G, 'Gutshot pela ponta de baixo é marcado como sujo', a => {
    const o = An.outs(L('Ac 5d'), L('4s 3h 9c'));
    const seq = o.outs.filter(x => x.tipos.indexOf('sequência') >= 0);
    a.igual(seq.length, 4, 'os quatro 2 fazem A-2-3-4-5');
    a.verdadeiro(seq.every(x => x.peso === 0.5 && /ponta de baixo/.test(x.motivo)), 'todos sujos (6-5 faz sequência maior)');
    a.igual(o.limpos, 0, 'o Ás também é overcard (suja)');
  });

  T(G, 'Mão feita em linguagem de mesa', a => {
    a.verdadeiro(/Top pair, kicker forte/.test(An.classificarMao(L('As Kd'), L('Ah 7c 2d')).rotulo));
    a.verdadeiro(/Overpair/.test(An.classificarMao(L('Qh Qd'), L('Jh 7c 2d')).rotulo));
    a.verdadeiro(/^Set/.test(An.classificarMao(L('7c 7d'), L('7h Kc 2d')).rotulo));
    a.verdadeiro(/Par do meio/.test(An.classificarMao(L('9c 8d'), L('Kh 9s 2d')).rotulo));
    a.verdadeiro(/joga o board/.test(An.classificarMao(L('2c 3d'), L('As Ks Qd Jh Tc')).rotulo));
  });

  T(G, 'Força contra todas as mãos (HS) e nuts', a => {
    const f = An.forcaAtual(L('As Ks'), L('Qs Js Ts'));
    a.verdadeiro(f.nuts, 'royal flush é nuts');
    a.igual(f.total, 1081, '47 cartas → 1.081 mãos de oponente');
    const f2 = An.forcaAtual(L('7c 2d'), L('Ah Kh Qs'));
    a.verdadeiro(f2.hs < 0.2, 'lixo em board alto');
  });

  T(G, 'Regra do 4 e do 2 com correção acima de 8 outs', a => {
    const p9 = An.probabilidades(9, 3);
    a.proximo(p9.regra4, 0.35, 1e-9, 'regra do 4 com 9 outs (36 − 1)');
    a.proximo(p9.exatoAteRiver, 0.3497, 0.0001, 'exato');
    const p15 = An.probabilidades(15, 3);
    a.proximo(p15.regra4, 0.53, 1e-9, '15 × 4 − 7');
    a.proximo(p15.exatoAteRiver, 0.5412, 0.0001);
    a.proximo(An.probabilidades(9, 4).exatoProxima, 9 / 46, 1e-12);
    return '9 outs: regra 35% × exato ' + pct(p9.exatoAteRiver) + ' · 15 outs: regra 53% × exato ' + pct(p15.exatoAteRiver);
  });

  T(G, 'Textura do board', a => {
    a.igual(An.textura(L('9h 8h 7c')).tipo, 'molhado');
    a.igual(An.textura(L('Kd 7s 2c')).tipo, 'seco');
    a.verdadeiro(An.textura(L('Ah Kh 5h')).tags.indexOf('monocromático') >= 0);
    a.verdadeiro(An.textura(L('8c 8d 3s')).pareado);
  });

  // ==================================================== situação pré-flop
  G = 'Análise: situação pré-flop e ranges';

  function maoDeTeste(n, botao) {
    const jogadores = [];
    for (let s = 0; s < n; s++) jogadores.push({ assento: s, nome: 'J' + s, fichas: 2000 });
    return P.Motor.novaMao({ jogadores, botao, sb: 10, bb: 20, lugares: 9 });
  }

  T(G, 'Mesa de 6: UTG abre, BTN enfrenta raise de posição inicial', a => {
    const m = maoDeTeste(6, 0);              // BTN 0, SB 1, BB 2, UTG 3, HJ 4, CO 5
    const s0 = An.situacaoPreflop(m.vista(3), 3);
    a.igual(s0.tipo, 'aberto');
    a.igual(s0.atras, 5);
    m.agir(3, { tipo: 'raise', ate: 60 });
    m.agir(4, 'fold'); m.agir(5, 'fold');
    const s = An.situacaoPreflop(m.vista(0), 0);
    a.igual(s.tipo, 'vs_open');
    a.igual(s.agressor, 3);
    a.igual(s.atrasDoAgressor, 5);
    a.igual(s.lugar, 'ip');
    a.igual(P.Ranges.grupoAgressor(s.atrasDoAgressor, false), 'cedo');
  });

  T(G, 'Ranges de abertura ficam mais largos perto do botão', a => {
    let anterior = 0;
    [8, 7, 6, 5, 4, 3, 2].forEach(atras => {
      const p = P.Ranges.percentual(P.Ranges.abertura(atras, false));
      a.verdadeiro(p > anterior, 'range com ' + atras + ' atrás deveria ser maior');
      anterior = p;
    });
    return [8, 5, 3, 2].map(x => (x === 2 ? 'BTN' : x === 3 ? 'CO' : x === 5 ? 'LJ' : 'UTG') + ' ' + Math.round(P.Ranges.percentual(P.Ranges.abertura(x, false))) + '%').join(' · ');
  });

  T(G, 'Push/fold: range mais largo com menos fichas e mais perto do botão', a => {
    const p = (bb, atras) => P.Ranges.percentual(P.Ranges.pushRange(bb, atras, false));
    a.maior(p(5, 2), p(15, 2), 'BTN com 5 bb > BTN com 15 bb');
    a.maior(p(10, 1), p(10, 8), 'SB > UTG');
    return `BTN 10 bb: ${Math.round(p(10, 2))}% · SB 10 bb: ${Math.round(p(10, 1))}% · UTG 10 bb: ${Math.round(p(10, 8))}%`;
  });

  T(G, 'ajustarRange alarga e aperta mantendo as mãos fortes', a => {
    const base = P.Ranges.abertura(4, false);
    const largo = P.Ranges.ajustarRange(base, 1.5), justo = P.Ranges.ajustarRange(base, 0.5);
    a.maior(P.Ranges.percentual(largo), P.Ranges.percentual(base));
    a.maior(P.Ranges.percentual(base), P.Ranges.percentual(justo));
    a.verdadeiro(justo.AA === 1 && largo.AA === 1, 'AA continua');
  });

  // ================================================================== ICM
  G = 'ICM (Malmuth-Harville)';

  T(G, 'Stacks iguais dividem o prêmio por igual', a => {
    const e = P.ICM.equities([1000, 1000], [65, 35]);
    a.proximo(e[0], 50, 1e-9);
    a.proximo(e[1], 50, 1e-9);
  });

  T(G, 'Exemplo clássico: 5.000 / 3.000 / 2.000 com 50/30/20', a => {
    const e = P.ICM.exatoDP([5000, 3000, 2000], [50, 30, 20]);
    a.proximo(e[0], 38.3929, 0.001, 'líder');
    a.proximo(soma(e), 100, 1e-9, 'soma');
    const r = P.ICM.exatoRecursivo([5000, 3000, 2000], [50, 30, 20]);
    a.proximo(r[0], e[0], 1e-9, 'recursivo = DP');
    const mc = P.ICM.monteCarlo([5000, 3000, 2000], [50, 30, 20], 40000);
    a.proximo(mc[0], e[0], 0.6, 'Monte Carlo');
    return 'equities: ' + e.map(x => x.toFixed(2)).join(' / ') + ' (50% das fichas valem só 38,4% do prêmio)';
  });

  T(G, 'Na bolha, pagar all-in exige mais equity em ICM do que em fichas', a => {
    const d = P.ICM.decisaoAllin({
      stacks: [3000, 3000, 5000, 2500], premios: [50, 30, 20], heroi: 0, vilao: 1,
      inicioHeroi: 3000, inicioVilao: 3000, investidoHeroi: 0, morto: 300
    });
    a.maior(d.necessariaICM, d.necessariaFichas);
    return `fichas: ${pct(d.necessariaFichas)} · ICM: ${pct(d.necessariaICM)}`;
  });

  // ===================================================== estruturas e field
  G = 'Sit & Go e torneio: estrutura, premiação e field';

  T(G, 'Premiação do SNG: 100% / 65-35 / 50-30-20', a => {
    a.igualJSON(E.percentuaisSNG(2), [100]);
    a.igualJSON(E.percentuaisSNG(6), [65, 35]);
    a.igualJSON(E.percentuaisSNG(9), [50, 30, 20]);
    const v = E.valoresPremios(92 * 9, E.percentuaisSNG(9));
    a.igual(soma(v), 92 * 9, 'sem perder centavos');
  });

  T(G, 'Torneio paga ~15% do field, com prêmio mínimo ≥ 1,5 buy-in', a => {
    const det = [];
    E.TORNEIO_FIELDS.forEach(f => {
      const p = E.percentuaisTorneio(f);
      a.proximo(soma(p), 100, 1e-6, 'soma dos % (' + f + ')');
      a.proximo(p.length / f, 0.15, 0.02, 'pagos (' + f + ')');
      a.verdadeiro(p[p.length - 1] / 100 * f >= 1.5 - 1e-9, 'prêmio mínimo');
      for (let i = 1; i < p.length; i++) a.verdadeiro(p[i] <= p[i - 1], 'decrescente');
      det.push(`${f}: ${p.length} pagos, 1º ${p[0].toFixed(1).replace('.', ',')}%`);
    });
    return det.join(' · ');
  });

  T(G, 'Níveis sobem sempre; SNG tem ante a partir do nível 6; torneio usa big blind ante', a => {
    for (let i = 1; i < 30; i++) {
      a.maior(E.nivelSNG(i).bb, E.nivelSNG(i - 1).bb - 1);
      a.maior(E.nivelTorneio(i).bb, E.nivelTorneio(i - 1).bb);
    }
    a.igual(E.nivelSNG(4).ante, 0);
    a.maior(E.nivelSNG(5).ante, 0);
    a.verdadeiro(E.nivelTorneio(0).anteBB);
  });

  T(G, 'Sit & Go com várias mesas segue a curva do torneio (18 e 45 inscritos)', a => {
    const p18 = E.percentuaisSNG(18), p45 = E.percentuaisSNG(45);
    a.proximo(soma(p18), 100, 1e-6, 'soma 18');
    a.igual(p18.length, 3, 'pagos de 18');
    a.igual(p45.length, 7, 'pagos de 45');
    return `18: ${p18.map(x => x.toFixed(0)).join('/')}% · 45: ${p45.length} pagos`;
  });

  T(G, 'Mesas do torneio: 18 inscritos em mesas de 6 = 3 mesas cheias', a => {
    const heroi = { id: 'h', nome: 'Herói', heroi: true, fichas: 1500 };
    const t = P.MultiMesa.criar({
      participantes: 18, lugares: 6, stack: 1500, nivel: 'medio', modo: 'sng', heroi, pagos: 3,
      blinds: () => E.nivelSNG(0), fator: () => 1, pausado: () => false, instantaneo: true,
      aoEliminar: () => {}, aoMensagem: () => {}
    });
    const d = t.diagnostico();
    a.igual(t.mesas(), 3);
    a.igualJSON(d.mesas, [6, 6, 6], 'jogadores por mesa');
    a.igual(d.fichas, 18 * 1500, 'fichas');
    const t2 = P.MultiMesa.criar({
      participantes: 20, lugares: 6, stack: 1500, nivel: 'medio', modo: 'sng', heroi: { id: 'h2', nome: 'Herói', heroi: true, fichas: 1500 }, pagos: 3,
      blinds: () => E.nivelSNG(0), fator: () => 1, pausado: () => false, instantaneo: true,
      aoEliminar: () => {}, aoMensagem: () => {}
    });
    a.igualJSON(t2.diagnostico().mesas, [5, 5, 5, 5], '20 em mesas de 6 = 4 mesas de 5');
    return '18 → 6/6/6 · 20 → 5/5/5/5';
  });

  // ====================================================== bots e coach
  G = 'Bots e coach';

  T(G, 'Bots só fazem ações legais (600 mãos de 6 bots, todos os perfis)', a => {
    const perfis = Object.keys(P.Bots.PERFIS);
    const cont = {};
    for (let k = 0; k < 600; k++) {
      const jogadores = [];
      for (let s = 0; s < 6; s++) jogadores.push({ assento: s, fichas: P.RNG.inteiroEntre(300, 4000) });
      const m = P.Motor.novaMao({ jogadores, botao: k % 6, sb: 10, bb: 20, lugares: 6 });
      let guarda = 0;
      while (!m.terminada()) {
        const s = m.vez();
        const perfil = perfis[s % perfis.length];
        const d = P.Bots.decidir(m.vista(s), s, { perfil, nivel: 'medio', modo: k % 2 ? 'cash' : 'torneio' });
        const reg = m.agir(s, d.acao);          // lança erro se a ação for ilegal
        cont[reg.acao] = (cont[reg.acao] || 0) + 1;
        if (++guarda > 300) throw new Error('mão não terminou');
      }
      const r = m.resultado();
      a.igual(soma(Object.values(r.ganhos)), 0, 'conservação');
    }
    return Object.keys(cont).map(k => `${k} ${cont[k]}`).join(' · ');
  });

  // ------------------------------------------- leitura e bots profissionais
  /** Mão com cartas escolhidas para alguns assentos (o resto do baralho em ordem). */
  function maoMontada(n, botao, sb, bb, fichas, cartasPorAssento) {
    const ordem = [];
    for (let k = 1; k <= n; k++) ordem.push((botao + k) % n);
    const usadas = [].concat(...Object.keys(cartasPorAssento).map(s => L(cartasPorAssento[s])));
    const resto = P.Baralho.novoOrdenado().filter(c => usadas.indexOf(c) < 0);
    const d = new Array(52);
    Object.keys(cartasPorAssento).forEach(s => { const cs = L(cartasPorAssento[s]), k = ordem.indexOf(+s); d[k] = cs[0]; d[n + k] = cs[1]; });
    let r = 0;
    for (let i = 0; i < 52; i++) if (d[i] === undefined) d[i] = resto[r++];
    const jogadores = fichas.map((f, s) => ({ assento: s, id: 'j' + s, nome: 'J' + s, fichas: f }));
    return P.Motor.novaMao({ jogadores, botao, sb, bb, lugares: n, baralhoDeTeste: d });
  }

  T(G, 'Leitura: anota quem abre all-in e quem desiste, e volta igual depois de salvar', a => {
    const lei = P.Leitura.criar();
    for (let k = 0; k < 12; k++) {
      const jogadores = [0, 1, 2, 3].map(s => ({ assento: s, id: 'j' + s, nome: 'J' + s, fichas: 3000 }));
      const m = P.Motor.novaMao({ jogadores, botao: k % 4, sb: 10, bb: 20, lugares: 4 });
      while (!m.terminada()) {
        const s = m.vez(), v = m.acoesValidas();
        if (s === 0) m.agir(s, v.podeApostar ? 'allin' : v.podeCheck ? 'check' : 'call');   // j0 só empurra
        else m.agir(s, v.podeCheck ? 'check' : 'fold');                                    // os outros só desistem
      }
      lei.registrar(m.vista(null));
    }
    const c0 = lei.contadores('j0'), c1 = lei.contadores('j1');
    a.igual(c0.maos, 12, 'mãos');
    a.maior(c0.abrirOp, 0, 'oportunidades de abrir');
    a.igual(c0.abriuAllin, c0.abrirOp, 'abriu all-in em todas');
    a.igual(c0.abrirOpFundo, c0.abrirOp, '150 bb: todas "fundas"');
    a.maior(c1.vsShoveOp, 0, 'j1 enfrentou all-in');
    a.igual(c1.vsShoveCall, 0, 'e nunca pagou');
    const e0 = P.Leitura.estimar(c0, 1), e1 = P.Leitura.estimar(c1, 1);
    a.maior(e0.abre, 0.4, 'estimativa de abertura de j0');
    a.maior(0.1, e1.pagaShove, 'estimativa de call de all-in de j1');
    const lei2 = P.Leitura.criar(JSON.parse(JSON.stringify(lei.exportar())));
    a.igualJSON(lei2.contadores('j0'), c0, 'contadores depois de salvar e carregar');
    return `j0: ${c0.abriuAllin}/${c0.abrirOp} all-ins abrindo (estimativa ${pct(e0.abre)}) · j1 pagou ${c1.vsShoveCall}/${c1.vsShoveOp} all-ins (estimativa ${pct(e1.pagaShove)})`;
  });

  /** Herói que vai all-in em toda mão (75 bb) contra 5 bots de um perfil, com leitura. */
  function simularEmpurrador(perfil, maos) {
    const lei = P.Leitura.criar();
    let saldo = 0, showdowns = 0, decisoes = 0, tempo = 0;
    for (let k = 0; k < maos; k++) {
      const jogadores = [];
      for (let s = 0; s < 6; s++) jogadores.push({ assento: s, id: s === 0 ? 'heroi' : 'b' + s, nome: 'J' + s, fichas: 1500 });
      const m = P.Motor.novaMao({ jogadores, botao: k % 6, sb: 10, bb: 20, lugares: 6 });
      let guarda = 0;
      while (!m.terminada()) {
        const s = m.vez(), v = m.acoesValidas();
        if (s === 0) m.agir(0, v.podeApostar ? 'allin' : v.podeCheck ? 'check' : 'call');
        else {
          const t0 = performance.now();
          m.agir(s, P.Bots.decidir(m.vista(s), s, { perfil, nivel: 'pro', modo: 'cash', leitura: lei }).acao);
          tempo += performance.now() - t0; decisoes++;
        }
        if (++guarda > 200) throw new Error('mão não terminou');
      }
      lei.registrar(m.vista(null));
      if (!m.resultado().semShowdown) showdowns++;
      saldo += m.resultado().ganhos[0];
    }
    return { saldo, bb100: saldo / 20 / maos * 100, showdowns, msDecisao: tempo / Math.max(1, decisoes) };
  }

  T(G, 'Quem vai all-in em toda mão perde contra profissionais e TAGs (eles leem e pagam mais leve)', a => {
    const pro = simularEmpurrador('pro', 200);
    const tag = simularEmpurrador('tag', 200);
    a.maior(0, pro.saldo, 'contra profissionais o empurrador deveria perder');
    a.maior(0, tag.saldo, 'contra TAGs o empurrador deveria perder');
    const f = r => `${r.bb100 > 0 ? '+' : ''}${r.bb100.toFixed(0)} bb/100 (${r.showdowns} pagos em 200)`;
    return `empurrador × profissionais: ${f(pro)} · × TAGs: ${f(tag)} · ${pro.msDecisao.toFixed(1)} ms por decisão do profissional`;
  });

  T(G, 'Profissional na bolha: paga o all-in pela conta de fichas, folda pelo ICM', a => {
    // 4 restantes, 3 pagos. O botão (25 bb) empurra; o profissional no big blind tem AJo e 15 bb.
    const fichas = [5000, 3000, 3000, 2500];
    const montar = () => {
      const m = maoMontada(4, 0, 100, 200, fichas, { 2: 'Ah Jd' });
      m.agir(3, 'fold'); m.agir(0, 'allin'); m.agir(1, 'fold');
      return m;
    };
    const torneio = { premios: [5000, 3000, 2000], stacksFora: [], restantes: 4, pagos: 3 };
    let foldaICM = 0, pagaFichas = 0;
    for (let i = 0; i < 6; i++) {
      const m = montar();
      if (P.Bots.decidir(m.vista(2), 2, { perfil: 'pro', modo: 'sng', torneio }).acao === 'fold') foldaICM++;
      if (P.Bots.decidir(m.vista(2), 2, { perfil: 'pro', modo: 'cash' }).acao !== 'fold') pagaFichas++;
    }
    a.maior(foldaICM, 4, 'no ICM deveria foldar AJo');
    a.maior(pagaFichas, 4, 'em fichas deveria pagar AJo');
    return `AJo no BB contra all-in do botão: ICM → fold ${foldaICM}/6 · fichas → call ${pagaFichas}/6`;
  });

  function vistaHeroi(mao, assento) { return mao.vista(assento); }

  T(G, 'Coach pré-flop: AA abre de UTG, 72o folda, AKs 3-beta contra abertura do CO', a => {
    const deck = P.Baralho.novoOrdenado();
    // monta um baralho com AA para o UTG (assento 3 numa mesa de 6 com botão 0)
    function maoCom(cartasHeroi, assentoHeroi, n, botao) {
      const ordem = [];
      for (let k = 1; k <= n; k++) ordem.push((botao + k) % n);
      const cs = L(cartasHeroi);
      const resto = deck.filter(c => cs.indexOf(c) < 0);
      const d = new Array(52);
      const kH = ordem.indexOf(assentoHeroi);
      d[kH] = cs[0]; d[n + kH] = cs[1];
      let r = 0;
      for (let i = 0; i < 52; i++) if (d[i] === undefined) d[i] = resto[r++];
      const jogadores = [];
      for (let s = 0; s < n; s++) jogadores.push({ assento: s, nome: 'J' + s, fichas: 2000 });
      return P.Motor.novaMao({ jogadores, botao, sb: 10, bb: 20, lugares: 9, baralhoDeTeste: d });
    }
    const ctx = { modo: 'cash', perfis: {}, iteracoes: 500 };
    const m1 = maoCom('As Ah', 3, 6, 0);
    return P.Coach.analisar(m1.vista(3), 3, ctx).then(an => {
      a.igual(an.recomendacao.acao, 'raise', 'AA');
      const m2 = maoCom('7c 2d', 3, 6, 0);
      return P.Coach.analisar(m2.vista(3), 3, ctx);
    }).then(an => {
      a.igual(an.recomendacao.acao, 'fold', '72o');
      const m3 = maoCom('As Ks', 0, 6, 0);       // herói no BTN
      m3.agir(3, 'fold'); m3.agir(4, 'fold'); m3.agir(5, { tipo: 'raise', ate: 50 });   // CO abre
      return P.Coach.analisar(m3.vista(0), 0, ctx);
    }).then(an => {
      a.igual(an.preflop.sit.tipo, 'vs_open');
      a.igual(an.recomendacao.acao, 'raise', 'AKs contra o CO');
      a.verdadeiro(an.equity && an.equity.valor > 0.5, 'equity contra o range do CO');
      const nota = P.Coach.avaliarDecisao(an, { tipo: 'fold' });
      a.verdadeiro(nota.nota === 'erro' || nota.nota === 'grave', 'foldar AKs deveria ser erro: ' + JSON.stringify({ nota: nota.nota, perda: nota.perdaBB, motivo: nota.motivo, rec: an.recomendacao, pote: an.pote }));
      return 'AKs × range do CO: ' + pct(an.equity.valor) + ' · fold seria "' + nota.nomeNota + '" (−' + nota.perdaBB.toFixed(1) + ' bb)';
    });
  });

  T(G, 'Coach pós-flop: equity, pot odds, MDF, recomendação e nota', a => {
    // heads-up: herói (BTN/SB, assento 0) paga, vilão aposta no flop
    const jogadores = [{ assento: 0, nome: 'Herói', fichas: 2000 }, { assento: 1, nome: 'Vilão', fichas: 2000 }];
    const m = P.Motor.novaMao({ jogadores, botao: 0, sb: 10, bb: 20, lugares: 2 });
    m.agir(0, 'call'); m.agir(1, 'check');
    m.agir(1, { tipo: 'bet', ate: 30 });
    const v = m.vista(0);
    return P.Coach.analisar(v, 0, { modo: 'cash', perfis: { 1: 'tag' }, iteracoes: 3000, fmt: x => String(x) }).then(an => {
      a.verdadeiro(an.posflop && an.equity && an.equity.iteracoes === 3000, 'Monte Carlo completo');
      a.proximo(an.posflop.potOdds.necessaria, 30 / (70 + 30), 1e-9, 'pot odds');
      a.proximo(an.posflop.potOdds.mdf, 40 / 70, 1e-9, 'MDF = pote ÷ (pote + aposta)');
      a.verdadeiro(an.passos.length === 3, 'raciocínio em 3 passos');
      a.verdadeiro(!!an.recomendacao.acao, 'recomendação');
      const nota = P.Coach.avaliarDecisao(an, { tipo: 'call' });
      a.verdadeiro(!!nota.nomeNota);
      return `${C.listaBonita(an.cartas)} em ${C.listaBonita(an.board)}: equity ${pct(an.equity.valor)}, precisa ${pct(an.posflop.potOdds.necessaria)} → ${an.recomendacao.acao}; call = "${nota.nomeNota}"`;
    });
  });

  T(G, 'Perguntas do treino relâmpago têm resposta e explicação', a => {
    Object.keys(P.Treino.TIPOS).forEach(t => {
      for (let i = 0; i < 5; i++) {
        const p = P.Treino.gerar([t]);
        a.verdadeiro(typeof p.resposta === 'number' && isFinite(p.resposta), 'resposta numérica em ' + t);
        a.verdadeiro(p.explicacao && p.enunciado, 'texto em ' + t);
        a.verdadeiro(P.Treino.corrigir(p, p.resposta, 3000).acertou, 'a própria resposta deveria estar certa (' + t + ')');
      }
    });
  });

  // ================================================== partidas completas
  G = 'Partidas completas (herói automático)';

  function partida(cfg) {
    const base = { nivel: 'pequeno', heroi: { nome: 'Teste' }, autoHeroi: true, instantaneo: true, semBanca: true, maosPorNivel: 6 };
    const p = P.Partida.criar(Object.assign(base, cfg), {});
    return p.rodar().then(fim => ({ p, fim }));
  }

  const completo = /[?&]completo=1/.test(location.search);

  T(G, 'Cash com 2 jogadores (60 mãos, coach ativo) e análise de fim de partida', a => partida({
    modo: 'cash', lugares: 2, limite: E.CASH.pequeno[0], buyinBB: 100, recompraAuto: true, limiteMaos: 60, autoCoach: true, iteracoesCoach: 300
  }).then(({ p }) => {
    a.verdadeiro(p.info().maos >= 60, 'mãos jogadas');
    const rel = p.relatorio();
    a.igual(rel.maos, p.info().maos, 'mãos no relatório');
    a.maior(rel.decisoes, 0, 'decisões avaliadas');
    a.verdadeiro(rel.nota >= 0 && rel.nota <= 10, 'nota entre 0 e 10');
    const somaDist = Object.keys(rel.dist).reduce((s, k) => s + rel.dist[k], 0);
    a.igual(somaDist, rel.decisoes, 'distribuição das notas');
    a.verdadeiro(rel.plano.length > 0 && rel.estilo.length > 0, 'plano e estilo');
    return `${p.info().maos} mãos · relatório: nota ${rel.nota.toFixed(1)}, ${rel.decisoes} decisões, ${rel.erros.length} tipos de vazamento`;
  }));

  T(G, 'Cash com 9 jogadores (60 mãos)', a => partida({
    modo: 'cash', lugares: 9, limite: E.CASH.micro[1], buyinBB: 100, recompraAuto: true, limiteMaos: 60
  }).then(({ p }) => {
    a.verdadeiro(p.info().maos >= 60);
    return p.info().maos + ' mãos';
  }));

  T(G, 'Sit & Go com 2 jogadores até o fim', a => partida({ modo: 'sng', lugares: 2, buyin: E.SNG.micro[0], velocidade: 'turbo' })
    .then(({ fim }) => {
      a.verdadeiro(fim && (fim.posicao === 1 || fim.posicao === 2), 'terminou com colocação');
      return `${fim.posicao}º lugar em ${fim.maos} mãos (prêmio ${fim.premio})`;
    }));

  T(G, 'Sit & Go com 9 jogadores até o fim', a => partida({ modo: 'sng', lugares: 9, buyin: E.SNG.medio[0], velocidade: 'turbo' })
    .then(({ fim }) => {
      a.verdadeiro(fim && fim.posicao >= 1 && fim.posicao <= 9);
      return `${fim.posicao}º lugar em ${fim.maos} mãos, nível ${fim.nivel}`;
    }));

  T(G, 'Sit & Go de 18 só com profissionais (2 mesas de 9, leitura e ICM) até o fim', a => {
    const t0 = performance.now();
    return partida({ modo: 'sng', lugares: 9, participantes: 18, nivel: 'pro', buyin: E.SNG.pro[0], velocidade: 'turbo' }).then(({ p, fim }) => {
      a.verdadeiro(fim && fim.posicao >= 1 && fim.posicao <= 18, 'colocação');
      const lidos = Object.keys(p.leitura().exportar()).length;
      a.maior(lidos, 10, 'leitura de quase todos os jogadores');
      return `${fim.posicao}º de 18 em ${fim.maos} mãos · ${lidos} jogadores anotados · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    });
  });

  T(G, 'Torneio inteiro com 45 inscritos em mesas de 9: mesas desfeitas até a final e 1 campeão', a => {
    let rodada = 0, maxDif = 0, msgs = 0;
    const heroi = { id: 'h', nome: 'Herói', heroi: true, fichas: 1500, perfil: 'tag' };
    const t = P.MultiMesa.criar({
      participantes: 45, lugares: 9, stack: 1500, nivel: 'medio', modo: 'torneio', heroi, pagos: 7,
      blinds: () => E.nivelSNG(Math.floor(rodada / 5)), fator: () => 1, pausado: () => false, instantaneo: true,
      aoEliminar: () => {}, aoMensagem: () => { msgs++; }
    });
    const m = t.mesaHeroi();
    const jogar = async () => {
      while (t.restantes() > 1) {
        if (++rodada > 4000) throw new Error('torneio não terminou: ' + JSON.stringify(t.diagnostico()) + ' ' + JSON.stringify(t.resumo().map(r => [r.id, r.jogadores, r.quebrada, r.quebrando, r.maos])) + ' herói ' + heroi.fichas);
        t.entreMaosHeroi();
        if (m.ativos().length >= 2) {
          m.definirBlinds(E.nivelSNG(Math.floor(rodada / 5)));
          const mao = m.proximaMao();
          while (!mao.terminada()) {
            const s = mao.vez(), j = m.jogador(s);
            mao.agir(s, P.Bots.decidir(mao.vista(s), s, { perfil: j.perfil, nivel: 'medio', modo: 'torneio' }).acao);
          }
          t.fimDeMaoHeroi(m.concluirMao(), mao.historicoCompleto());
        }
        await t.rodadaInstantanea();
        const d = t.diagnostico();
        a.igual(d.fichas, 45 * 1500, 'fichas conservadas (rodada ' + rodada + ')');
        if (d.mesas.length > 1) maxDif = Math.max(maxDif, Math.max.apply(null, d.mesas) - Math.min.apply(null, d.mesas));
      }
    };
    return jogar().then(() => {
      const d = t.diagnostico();
      a.igual(d.vivos, 1, 'um campeão');
      a.igual(t.mesasAbertas(), 1, 'só a mesa final no fim');
      a.igual(new Set(d.posicoes).size, 44, '44 colocações diferentes');
      a.igualJSON(d.posicoes.slice().sort((x, y) => x - y), Array.from({ length: 44 }, (_, i) => i + 2), 'do 45º ao 2º');
      a.verdadeiro(maxDif <= 1, 'diferença entre mesas ≤ 1 (foi ' + maxDif + ')');
      return `${rodada} rodadas · ${msgs} avisos de mesa · maior diferença entre mesas: ${maxDif}`;
    });
  });

  T(G, 'Retomar torneio salvo: mesmas mesas, jogadores, fichas e eliminados', a => {
    let rodada = 0;
    const opts = h => ({
      participantes: 27, lugares: 6, stack: 1500, nivel: 'medio', modo: 'sng', heroi: h, pagos: 4,
      blinds: () => E.nivelSNG(Math.floor(rodada / 3)), fator: () => 1, pausado: () => false, instantaneo: true,
      aoEliminar: () => {}, aoMensagem: () => {}
    });
    const t = P.MultiMesa.criar(opts({ id: 'h', nome: 'Herói', heroi: true, fichas: 1500 }));
    const jogar = async () => { for (; rodada < 25; rodada++) { t.entreMaosHeroi(); await t.rodadaInstantanea(); } };
    return jogar().then(() => {
      const salvo = JSON.parse(JSON.stringify(t.exportar()));           // como fica no armazenamento
      const heroi2 = { id: 'h', heroi: true };
      const t2 = P.MultiMesa.criar(Object.assign(opts(heroi2), { restaurar: salvo }));
      const d1 = t.diagnostico(), d2 = t2.diagnostico();
      a.igual(d2.fichas, d1.fichas, 'fichas');
      a.igual(d2.restantes, d1.restantes, 'restantes');
      a.igualJSON(d2.mesas, d1.mesas, 'jogadores por mesa');
      a.igualJSON(d2.posicoes, d1.posicoes, 'eliminados');
      a.igual(heroi2.nome, 'Herói', 'herói restaurado');
      a.verdadeiro(t2.mesaHeroi().jogador(0) === heroi2, 'herói no lugar 0 da mesa 1');
      return `${d1.restantes} restantes em ${d1.mesas.length} mesas, ${d1.posicoes.length} eliminados — igual depois de retomar`;
    });
  });

  T(G, 'Sit & Go de 18 em mesas de 6 até o fim: fichas conservadas, mesas equilibradas, colocações únicas', a => {
    let checagens = 0, maxDif = 0;
    const base = { nivel: 'pequeno', heroi: { nome: 'Teste' }, autoHeroi: true, instantaneo: true, semBanca: true, maosPorNivel: 6 };
    let p;
    const ui = {
      aoFimDaMao: () => {
        const d = p.torneio().diagnostico();
        a.igual(d.fichas, 18 * E.SNG_STACK, 'fichas conservadas');
        a.igual(d.restantes + d.posicoes.length, 18, 'restantes + eliminados');
        if (d.mesas.length > 1) maxDif = Math.max(maxDif, Math.max.apply(null, d.mesas) - Math.min.apply(null, d.mesas));
        checagens++;
      }
    };
    p = P.Partida.criar(Object.assign(base, { modo: 'sng', lugares: 6, participantes: 18, buyin: E.SNG.micro[0], velocidade: 'turbo' }), ui);
    return p.rodar().then(fim => {
      a.verdadeiro(fim && fim.posicao >= 1 && fim.posicao <= 18, 'colocação');
      a.verdadeiro(maxDif <= 1, 'diferença entre mesas ≤ 1 (foi ' + maxDif + ')');
      const pos = p.torneio().diagnostico().posicoes;
      a.igual(new Set(pos).size, pos.length, 'colocações sem repetir');
      return `${fim.posicao}º de 18 em ${fim.maos} mãos · ${checagens} conferências · ${p.torneio().mesasAbertas()} mesa(s) no fim`;
    });
  });

  T(G, 'Torneio (45) com mesas de 9 até o fim' + (completo ? '' : ' — rode com ?completo=1'), a => {
    if (!completo) return 'pulado (abra testes.html?completo=1 para simular)';
    return partida({ modo: 'torneio', lugares: 9, field: 45, buyin: E.TORNEIO.micro[0], velocidade: 'turbo' }).then(({ fim }) => {
      a.verdadeiro(fim && fim.posicao >= 1 && fim.posicao <= 45);
      return `${fim.posicao}º de 45 em ${fim.maos} mãos (prêmio ${fim.premio})`;
    });
  });

  T(G, 'Torneio (45) com mesas de 2 até o fim' + (completo ? '' : ' — rode com ?completo=1'), a => {
    if (!completo) return 'pulado (abra testes.html?completo=1 para simular)';
    return partida({ modo: 'torneio', lugares: 2, field: 45, buyin: E.TORNEIO.micro[0], velocidade: 'turbo' }).then(({ fim }) => {
      a.verdadeiro(fim && fim.posicao >= 1 && fim.posicao <= 45);
      return `${fim.posicao}º de 45 em ${fim.maos} mãos (prêmio ${fim.premio})`;
    });
  });
})(window.Poker = window.Poker || {});
