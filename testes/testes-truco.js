/* ==========================================================================
   OUTS · Treino Lab — testes/testes-truco.js
   Testes do truco: regras (ordem, manilhas, rodadas, empates, valores,
   conta do placar), motor (mãos montadas com baralho conhecido: truco, seis,
   correr, mão de 11, mão de ferro, carta coberta, o que cada um enxerga),
   coach (chance de ganhar, conselhos, notas), bots, as regras do
   paranaense (retruco, troca na mão de 11, empates) e o torneio.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const R = P.Truco.Regras, M = P.Truco.Motor, IA = P.Truco.IA, CO = P.Truco.Coach;
  const c = s => P.Cartas.deTexto(s);
  const cs = str => str.trim().split(/\s+/).map(c);
  const pct = x => (x * 100).toFixed(1).replace('.', ',') + '%';

  /**
   * Baralho montado para o motor: mãos por lugar (3 cartas cada) e a vira.
   * Com cfg.dador = n - 2 a primeira mão é dada pelo lugar n-1 e o lugar 0 começa.
   */
  function baralho(maos, vira, n) {
    const usadas = new Set([vira]);
    maos.forEach(m => m.forEach(x => usadas.add(x)));
    const d = [];
    for (let volta = 0; volta < 3; volta++) for (let k = 0; k < n; k++) d.push(maos[k][volta]);
    d.push(vira);
    R.BARALHO.forEach(x => { if (!usadas.has(x)) d.push(x); });
    if (d.length !== 40 || new Set(d).size !== 40) throw new Error('baralho de teste inválido');
    return d;
  }
  /** Agente que segue um roteiro: cartas em texto ('4c'), 'truco', 'cobre:4c', e respostas. */
  function roteiro(lista, nome) {
    const fila = lista.slice();
    const prox = (o) => { if (!fila.length) throw new Error(`roteiro de ${nome || '?'} acabou (${o})`); return fila.shift(); };
    return {
      bot: true, vistas: [],
      decidir(v) {
        this.vistas.push(v);
        const a = prox('decidir');
        if (a === 'truco') return { tipo: 'truco' };
        if (typeof a === 'string' && a.indexOf('cobre:') === 0) return { tipo: 'carta', carta: c(a.slice(6)), coberta: true };
        if (typeof a === 'number') return { tipo: 'carta', indice: a };
        return { tipo: 'carta', carta: c(a) };
      },
      responder(v, nivel) { this.vistas.push(v); return prox('responder ' + nivel); },
      onze(v) { this.vistas.push(v); return prox('onze'); }
    };
  }
  /** Joga uma única mão (para depois de fimMao). */
  async function umaMao(n, maos, vira, agentes, extra) {
    const eventos = [];
    // para no começo da mão seguinte (ou no fim da partida)
    const m = M.criar(Object.assign({ n, dador: n - 2, baralhos: [baralho(maos, vira, n), R.BARALHO.slice()] }, extra || {}), agentes, {
      evento: ev => { eventos.push(ev); if (ev.tipo === 'inicioMao' && eventos.some(e => e.tipo === 'fimMao')) m.parar(); }
    });
    await m.rodar();
    return { m, eventos, fim: eventos.find(e => e.tipo === 'fimMao') };
  }

  // ================================================================ regras
  const G = 'Truco: regras do paulista';

  T(G, 'Baralho de 40 cartas, sem 8, 9 e 10', a => {
    a.igual(R.BARALHO.length, 40);
    a.igual(new Set(R.BARALHO).size, 40);
    R.BARALHO.forEach(x => a.verdadeiro([6, 7, 8].indexOf(x >> 2) < 0, 'carta proibida: ' + P.Cartas.texto(x)));
  });

  T(G, 'Ordem de força das cartas comuns: 4 5 6 7 Q J K A 2 3', a => {
    const vira = c('4h');                    // manilha = 5 (fora da comparação abaixo)
    const ordem = cs('6s 7s Qs Js Ks As 2s 3s');
    for (let i = 1; i < ordem.length; i++) a.maior(R.valor(ordem[i], vira), R.valor(ordem[i - 1], vira), P.Cartas.texto(ordem[i]));
    a.verdadeiro(R.valor(c('Qd'), c('5h')) < R.valor(c('Jd'), c('5h')), 'dama perde para valete');
    a.igual(R.valor(c('3s'), c('Kh')), R.valor(c('3d'), c('Kh')), 'naipe não importa nas comuns');
  });

  T(G, 'Manilha é a carta seguinte à vira (e dá a volta)', a => {
    const caso = (vira, manilha) => a.igual(R.ROTULO_RANK[R.manilhaDe(c(vira))], manilha, 'vira ' + vira);
    caso('4c', '5'); caso('7d', 'Q'); caso('Qs', 'J'); caso('Jh', 'K'); caso('Ks', 'A'); caso('As', '2'); caso('2h', '3'); caso('3d', '4');
    return 'vira 3 → manilha 4; vira 7 → manilha Q';
  });

  T(G, 'Manilhas: zap > copas > espadilha > pica-fumo, e qualquer manilha ganha do 3', a => {
    const vira = c('6d');                    // manilha = 7
    const z = R.valor(c('7c'), vira), co = R.valor(c('7h'), vira), es = R.valor(c('7s'), vira), pf = R.valor(c('7d'), vira);
    a.verdadeiro(z > co && co > es && es > pf, 'ordem dos naipes');
    a.maior(pf, R.valor(c('3s'), vira), 'pica-fumo ganha do 3');
    a.igual(R.nome(c('7c'), vira), 'Zap'); a.igual(R.nome(c('7d'), vira), 'Pica-fumo');
  });

  T(G, 'Rodada: maior carta ganha; cartas iguais de equipes diferentes empatam', a => {
    const vira = c('Ks'), eq = j => j % 2;
    const r1 = R.resultadoRodada([{ j: 0, carta: c('3h') }, { j: 1, carta: c('2c') }], vira, eq);
    a.igual(r1.vencedor, 0); a.igual(r1.quem, 0);
    const r2 = R.resultadoRodada([{ j: 0, carta: c('3h') }, { j: 1, carta: c('3c') }], vira, eq);
    a.igual(r2.vencedor, 'E'); a.igual(r2.quem, 0, 'no empate começa quem jogou primeiro a mais alta');
    const r3 = R.resultadoRodada([{ j: 0, carta: c('2h') }, { j: 1, carta: c('5c') }, { j: 2, carta: c('2c') }, { j: 3, carta: c('4c') }], vira, eq);
    a.igual(r3.vencedor, 0, 'parceiros com a mesma carta não empatam');
    const r4 = R.resultadoRodada([{ j: 0, carta: c('Ac'), coberta: true }, { j: 1, carta: c('4d') }], vira, eq);
    a.igual(r4.vencedor, 1, 'carta coberta perde para qualquer uma');
  });

  T(G, 'Quem ganha a mão, com todos os empates', a => {
    const d = r => JSON.stringify(R.decidirMao(r));
    a.igual(d([0]), '{"fim":false}');
    a.igual(d([0, 0]), '{"fim":true,"vencedor":0}');
    a.igual(d([0, 1]), '{"fim":false}');
    a.igual(d([0, 1, 1]), '{"fim":true,"vencedor":1}');
    a.igual(d(['E', 1]), '{"fim":true,"vencedor":1}', 'empatou a 1ª: leva quem ganhar a 2ª');
    a.igual(d([1, 'E']), '{"fim":true,"vencedor":1}', 'empatou a 2ª: leva quem ganhou a 1ª');
    a.igual(d([0, 1, 'E']), '{"fim":true,"vencedor":0}', 'empatou a 3ª: leva quem ganhou a 1ª');
    a.igual(d(['E', 'E']), '{"fim":false}');
    a.igual(d(['E', 'E', 0]), '{"fim":true,"vencedor":0}');
    a.igual(d(['E', 'E', 'E']), '{"fim":true,"vencedor":null}', 'três empates: ninguém marca');
  });

  T(G, 'Valores: 1, truco 3, seis 6, nove 9, doze 12; mínimo para aceitar', a => {
    a.igualJSON(R.VALORES, [1, 3, 6, 9, 12]);
    a.proximo(R.minimoParaAceitar(1, 3), 1 / 3, 1e-9, 'truco');
    a.proximo(R.minimoParaAceitar(3, 6), 1 / 4, 1e-9, 'seis');
    a.proximo(R.minimoParaAceitar(6, 9), 1 / 6, 1e-9, 'nove');
    a.proximo(R.minimoParaAceitar(9, 12), 1 / 8, 1e-9, 'doze');
    return 'truco 33,3% · seis 25% · nove 16,7% · doze 12,5%';
  });

  T(G, 'Conta do placar: simétrica, 50% no empate e decisiva no fim', a => {
    a.igual(R.chancePartida(0, 0), 0.5);
    a.igual(R.chancePartida(11, 11), 0.5);
    for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) a.proximo(R.chancePartida(x, y) + R.chancePartida(y, x), 1, 1e-9, x + 'x' + y);
    for (let x = 0; x < 11; x++) a.maior(R.chancePartida(x + 1, 5), R.chancePartida(x, 5), 'mais pontos, mais chance');
    // perder valendo 3 entrega a partida: aceitar exige mais
    a.maior(R.minimoParaAceitar(1, 3, 3, 10), 0.4, 'com 3 x 10 o mínimo sobe');
    return `0x0: ${pct(R.minimoParaAceitar(1, 3, 0, 0))} · 3x10: ${pct(R.minimoParaAceitar(1, 3, 3, 10))} · 10x3: ${pct(R.minimoParaAceitar(1, 3, 10, 3))}`;
  });

  T(G, 'Conta do blefe: quantas vezes precisam correr', a => {
    a.igual(R.correrMinimoBlefe(0.6, 1, 3), 0, 'favorito não precisa de corrida');
    a.proximo(R.correrMinimoBlefe(0.3, 1, 3), 0.8 / 2.2, 1e-9);
    a.maior(R.correrMinimoBlefe(0.1, 1, 3), R.correrMinimoBlefe(0.3, 1, 3), 'mão pior precisa de mais corrida');
  });

  // ================================================================= motor
  const GM = 'Truco: motor da partida';

  T(GM, 'Distribuição: 3 cartas para cada um a partir de quem é mão, depois a vira', async a => {
    const maos = [cs('3s 2s As'), cs('4c 5c 6c')];
    const ag = [roteiro(['3s', '2s']), roteiro(['4c', '5c'])];
    const { m, fim } = await umaMao(2, maos, c('Kd'), ag);
    a.igualJSON(ag[0].vistas[0].cartas, maos[0]);
    a.igual(ag[0].vistas[0].vira, c('Kd'));
    a.igual(ag[0].vistas[0].manilha, 12, 'vira K → manilha A');
    a.igual(fim.vencedor, 0); a.igual(fim.pontos, 1);
    a.igualJSON(m.placar(), [1, 0]);
  });

  T(GM, 'Ninguém vê as cartas dos outros (nem a coberta)', async a => {
    const maos = [cs('3s 2s As'), cs('4c 5c 6c')];
    const ag = [roteiro(['As', 'cobre:2s', '3s']), roteiro(['4c', '5c', '6c'])];
    await umaMao(2, maos, c('Kd'), ag);
    const v1 = ag[1].vistas[1];                              // vista do lugar 1 na 2ª rodada
    a.igualJSON(v1.cartas, cs('5c 6c'));
    const jog = v1.jogadas[1].find(x => x.j === 0);
    a.verdadeiro(jog && jog.coberta && jog.carta === null, 'a carta coberta do outro aparece sem valor');
    a.verdadeiro(!('maos' in v1) && !('iniciais' in v1), 'a vista não tem as mãos dos outros');
    const v0 = ag[0].vistas[1];
    a.verdadeiro(v0.jogadas[0].every(x => x.j !== 1 || x.carta === c('4c')), 'carta aberta jogada aparece');
  });

  T(GM, 'Carta coberta não vale na 1ª rodada (é jogada aberta)', async a => {
    const ag = [roteiro(['cobre:As', '3s']), roteiro(['4c', '5c'])];
    const { eventos } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag);
    const j = eventos.find(e => e.tipo === 'jogada' && e.j === 0);
    a.igual(j.coberta, false);
  });

  T(GM, 'Truco aceito: a mão vale 3', async a => {
    const ag = [roteiro(['truco', '3s', '2s']), roteiro(['aceitar', '4c', '5c'])];
    const { fim, m } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag);
    a.igual(fim.pontos, 3); a.igual(fim.vencedor, 0); a.igualJSON(m.placar(), [3, 0]);
  });

  T(GM, 'Correr do truco: quem pediu leva 1 e a mão acaba na hora', async a => {
    const ag = [roteiro(['truco']), roteiro(['correr'])];
    const { fim, eventos } = await umaMao(2, [cs('4s 5s 6s'), cs('3c 2c Ac')], c('Kd'), ag);
    a.igual(fim.vencedor, 0); a.igual(fim.pontos, 1); a.igual(fim.motivo, 'correu');
    a.igual(eventos.filter(e => e.tipo === 'jogada').length, 0, 'ninguém jogou carta');
  });

  T(GM, 'Seis: quem aumenta aceita o truco; se o outro correr, leva 3', async a => {
    const ag = [roteiro(['truco', 'correr']), roteiro(['aumentar'])];
    const { fim, eventos } = await umaMao(2, [cs('4s 5s 6s'), cs('3c 2c Ac')], c('Kd'), ag);
    a.igual(fim.vencedor, 1); a.igual(fim.pontos, 3);
    const pedidos = eventos.filter(e => e.tipo === 'pedido').map(e => e.nome);
    a.igualJSON(pedidos, ['Truco', 'Seis']);
  });

  T(GM, 'Quem pediu por último não pode pedir de novo', async a => {
    const ag = [roteiro(['truco', '3s', '2s']), roteiro(['aceitar', '4c', '5c'])];
    await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag);
    const depois = ag[0].vistas[1];                       // a vez do lugar 0 depois do truco aceito
    a.igual(depois.podeTrucar, false, 'lugar 0 pediu: não pede seis');
    a.igual(ag[1].vistas[1].podeTrucar, true, 'lugar 1 pode pedir seis');
    a.igual(depois.valor, 3);
  });

  T(GM, 'Doze é o máximo: não dá para aumentar mais', async a => {
    const ag = [roteiro(['truco', 'aumentar', 'aumentar', '3s', '2s']), roteiro(['aumentar', 'aumentar', '4c', '5c'])];
    const { fim, eventos } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag);
    a.igualJSON(eventos.filter(e => e.tipo === 'pedido').map(e => e.valor), [3, 6, 9, 12]);
    a.igual(fim.pontos, 12);
  });

  T(GM, 'Dupla: sinal do parceiro é a melhor carta dele (manilha, 3 ou 2)', async a => {
    const vira = c('6d');                                 // manilha 7
    const maos = [cs('7c 4s 5s'), cs('4d 5d 6s'), cs('3h Qs Js'), cs('Kd Ks 4h')];
    const ag = [roteiro(['4s']), roteiro(['4d']), roteiro(['Qs']), roteiro(['4h'])];
    let vistas;
    const m = M.criar({ n: 4, dador: 2, baralhos: [baralho(maos, vira, 4)] }, ag, { evento: ev => { if (ev.tipo === 'fimRodada') m.parar(); } });
    await m.rodar();
    vistas = ag.map(x => x.vistas[0]);
    a.igual(vistas[0].sinalParceiro, c('3h'), 'parceiro do lugar 0 tem um 3');
    a.igual(vistas[2].sinalParceiro, c('7c'), 'parceiro do lugar 2 tem o zap');
    a.igual(vistas[1].sinalParceiro, null, 'parceiro do lugar 1 não tem nada forte');
    a.igual(M.sinalDe(cs('2d 4s 5s'), vira), c('2d'), 'o 2 também é sinalizado');
  });

  T(GM, 'Mão de 11 (dupla): vê as cartas do parceiro; correr dá 1 ponto aos outros', async a => {
    const vira = c('6d');
    const maos = [cs('7c 4s 5s'), cs('4d 5d 6s'), cs('3h Qs Js'), cs('Kd Ks 4h')];
    const ag = [roteiro(['correr']), roteiro([]), roteiro(['correr']), roteiro([])];
    const { fim } = await umaMao(4, maos, vira, ag, { placar: [11, 4] });
    const v = ag[0].vistas[0];
    a.igual(v.tipo, 'onze');
    a.igualJSON(v.cartasParceiro, maos[2]);
    a.igual(v.podeTrucar, false);
    a.igual(fim.vencedor, 1); a.igual(fim.pontos, 1); a.igual(fim.motivo, 'onzeCorreu');
  });

  T(GM, 'Mão de 11 jogada vale 3 e não tem truco', async a => {
    const ag = [roteiro(['jogar', '3s', '2s']), roteiro(['4c', '5c'])];
    const { fim, m } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag, { placar: [11, 7] });
    a.igual(ag[0].vistas[1].podeTrucar, false);
    a.igual(fim.pontos, 3);
    a.igualJSON(m.placar(), [12, 7]);
    a.verdadeiro(m.fim(), 'a partida acabou');
  });

  T(GM, 'Mão de ferro (11 a 11): ninguém vê as cartas e quem ganha leva a partida', async a => {
    const ag = [roteiro([0, 0]), roteiro([0, 0])];
    const { fim, m } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag, { placar: [11, 11] });
    const v = ag[0].vistas[0];
    a.verdadeiro(v.cegas && v.cartas.every(x => x === null), 'cartas escondidas');
    a.igual(v.podeTrucar, false);
    a.igual(fim.vencedor, 0);
    a.verdadeiro(m.fim());
  });

  T(GM, 'Três empates: ninguém marca', async a => {
    const vira = c('Kd');
    const ag = [roteiro(['3s', '2s', '4s']), roteiro(['3c', '2c', '4c'])];
    const { fim } = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], vira, ag);
    a.igual(fim.vencedor, null); a.igual(fim.pontos, 0);
  });

  T(GM, 'Partidas inteiras entre bots: placar coerente, vencedor com 12', async a => {
    let maos = 0;
    for (let i = 0; i < 6; i++) {
      const n = i % 2 ? 4 : 2;
      const ag = Array.from({ length: n }, (_, j) => IA.criarBot(IA.LISTA_PERFIS[(i + j) % 3]));
      const pts = [0, 0];
      const m = M.criar({ n }, ag, { evento: ev => {
        ag.forEach((x, j) => x.observar(ev, j % 2));
        if (ev.tipo === 'fimMao' && ev.vencedor !== null) pts[ev.vencedor] = Math.min(12, pts[ev.vencedor] + ev.pontos);
      } });
      const r = await m.rodar();
      maos += r.maos;
      a.igualJSON(r.placar, pts, 'soma dos pontos das mãos');
      a.igual(r.placar[r.vencedor], 12);
      a.verdadeiro(r.placar[1 - r.vencedor] < 12);
    }
    return `6 partidas (1x1 e dupla), ${maos} mãos`;
  });

  // ======================================================== coach e bots
  const GC = 'Truco: coach e bots';
  const vista1x1 = (minhas, vira, extra) => Object.assign({
    eu: 0, n: 2, equipe: 0, parceiro: null, placar: [0, 0], nos: 0, eles: 0, tipo: 'normal', vira, manilha: R.manilhaDe(vira),
    cartas: minhas, nCartas: [minhas.length, 3], rodada: 0, jogadas: [[]], resultados: [], vez: 0, valor: 1, nivel: 0,
    ultimoAumento: null, pedido: null, historicoPedidos: [], podeTrucar: true, podeCobrir: false
  }, extra || {});

  T(GC, 'Com zap, copas e espadilha a chance de ganhar a mão é 100%', a => {
    const vira = c('6d');
    const an = IA.analisar(vista1x1(cs('7c 7h 7s'), vira), { amostras: 200 });
    a.proximo(an.p, 1, 1e-9);
    return 'p = ' + pct(an.p);
  });

  T(GC, 'Mão fraca sem manilha tem pouca chance', a => {
    const vira = c('Kd');                                   // manilha A
    const an = IA.analisar(vista1x1(cs('4s 5h 6c'), vira), { amostras: 300 });
    a.verdadeiro(an.p < 0.2, 'p = ' + an.p);
    return 'p = ' + pct(an.p);
  });

  T(GC, 'Parceiro ganhando a rodada: o coach manda jogar a menor', a => {
    const vira = c('Kd');
    const v = Object.assign(vista1x1(cs('3h 4s'), vira), {
      eu: 3, equipe: 1, n: 4, parceiro: 1, nCartas: [1, 1, 1, 2], rodada: 1, resultados: [1], vez: 3,
      jogadas: [[{ j: 1, carta: c('2s') }, { j: 2, carta: c('5d') }, { j: 3, carta: c('7c') }, { j: 0, carta: c('6c') }],
        [{ j: 0, carta: c('4d') }, { j: 1, carta: c('Ac') }, { j: 2, carta: c('6d') }]]
    });
    const cons = CO.vez(v, { amostras: 200 });
    a.igual(cons.carta, c('4s'), 'joga o 4 e guarda o 3');
    a.verdadeiro(cons.linhas.join(' ').indexOf('parceiro') >= 0, 'explica que o parceiro já ganhou');
  });

  T(GC, 'Resposta ao truco: aceitar se a chance passa do mínimo', a => {
    const vira = c('6d');
    const forte = Object.assign(vista1x1(cs('7c 7h 3s'), vira), { vez: 1, pedido: { nivel: 1, equipe: 1, j: 1 }, historicoPedidos: [{ nivel: 1, equipe: 1, j: 1, rodada: 0 }] });
    const r1 = CO.resposta(forte, 1, { amostras: 200 });
    a.verdadeiro(r1.recomendacao !== 'correr', 'mão forte não corre: ' + r1.recomendacao);
    const fraca = Object.assign(vista1x1(cs('4s 5h Qc'), vira), { vez: 1, pedido: { nivel: 1, equipe: 1, j: 1 }, historicoPedidos: [{ nivel: 1, equipe: 1, j: 1, rodada: 0 }] });
    const r2 = CO.resposta(fraca, 1, { amostras: 300 });
    a.igual(r2.recomendacao, 'correr');
    a.proximo(r2.min, 1 / 3, 0.01);
    return `forte: ${pct(r1.p)} → ${r1.recomendacao}; fraca: ${pct(r2.p)} → correr`;
  });

  T(GC, 'Quem pede truco "tem mão": o peso dos sorteios favorece mão forte', a => {
    // uma mão média: o pedido do outro muda a leitura (contra uma mão péssima, ele ganharia de qualquer jeito)
    const vira = c('4d');
    const v = Object.assign(vista1x1(cs('3h Kc 7s'), vira), { vez: 1, historicoPedidos: [{ nivel: 1, equipe: 1, j: 1, rodada: 0 }] });
    const prep = IA.prepararAmostragem(v);
    let somaW = 0, somaWF = 0, somaF = 0, N = 3000;
    for (let i = 0; i < N; i++) {
      const maos = IA.sortear(prep, v);
      const f = IA.forcaMao(maos[1], vira), w = IA.pesoSorteio(maos, prep, v);
      somaF += f; somaW += w; somaWF += w * f;
    }
    a.maior(somaWF / somaW, somaF / N + 0.08, 'força média de quem pediu');
    return `força média sem pedido ${(somaF / N).toFixed(2)}; com pedido ${(somaWF / somaW).toFixed(2)}`;
  });

  T(GC, 'Notas: melhor carta é ótima; carta que derruba a chance é erro', a => {
    const vira = c('Kd');
    const v = Object.assign(vista1x1(cs('3h 4s'), vira), {
      rodada: 2, resultados: [0, 1], nCartas: [2, 1], vez: 0,
      jogadas: [[{ j: 0, carta: c('2s') }, { j: 1, carta: c('5d') }], [{ j: 1, carta: c('3d') }, { j: 0, carta: c('Qs') }], [{ j: 1, carta: c('2d') }]]
    });
    v.cartas = cs('3h 4s'); v.nCartas = [2, 0];
    const cons = CO.vez(v, { amostras: 50 });
    a.igual(cons.carta, c('3h'), 'o 3 ganha do 2 na última rodada');
    a.igual(CO.avaliar(cons, { tipo: 'carta', carta: c('3h') }).nota, 'otima');
    a.igual(CO.avaliar(cons, { tipo: 'carta', carta: c('4s') }).nota, 'erro');
  });

  T(GC, 'Bots: mão imbatível aceita ou aumenta; mão sem chance corre (Cauteloso)', a => {
    const vira = c('6d');
    const pedido = { vez: 1, pedido: { nivel: 1, equipe: 1, j: 1 }, historicoPedidos: [{ nivel: 1, equipe: 1, j: 1, rodada: 0 }] };
    for (const perfil of IA.LISTA_PERFIS) {
      const r = IA.criarBot(perfil).responder(Object.assign(vista1x1(cs('7c 7h 7s'), vira), pedido), 1);
      a.verdadeiro(r.resposta !== 'correr', perfil + ' correu com zap, copas e espadilha');
    }
    const r = IA.criarBot('cauteloso').responder(Object.assign(vista1x1(cs('4s 5h Qc'), vira), pedido), 1);
    a.igual(r.resposta, 'correr');
  });

  T(GC, 'O Esperto ganha quase sempre de quem só joga a carta mais forte', async a => {
    const ingenuo = () => ({ bot: true, observar() {},
      decidir: v => (v.cegas ? { tipo: 'carta', indice: 0 } : { tipo: 'carta', carta: v.cartas.slice().sort((x, y) => R.valor(y, v.vira) - R.valor(x, v.vira))[0] }),
      responder: () => 'aceitar', onze: () => 'jogar' });
    let v = 0;
    const N = 20;
    for (let i = 0; i < N; i++) {
      const ag = i % 2 ? [IA.criarBot('esperto'), ingenuo()] : [ingenuo(), IA.criarBot('esperto')];
      const r = await M.criar({ n: 2 }, ag, { evento: ev => ag.forEach((x, j) => x.observar(ev, j % 2)) }).rodar();
      if (r.vencedor === (i % 2 ? 0 : 1)) v++;
    }
    a.verdadeiro(v >= 15, `ganhou só ${v} de ${N}`);
    return `ganhou ${v} de ${N}`;
  });

  // ========================================================= paranaense
  const GP = 'Truco: regras do paranaense';
  const PR = { regras: 'paranaense' };

  T(GP, 'Truco vale 3 e retruco vale 6; depois do retruco não há mais aumento', async a => {
    const vr = R.variante('paranaense');
    a.igualJSON(vr.VALORES, [1, 3, 6]);
    a.igualJSON(vr.NOMES_PEDIDO, ['', 'Truco', 'Retruco']);
    // o lugar 0 pede truco, o 1 retruca e o 0 tenta aumentar de novo: vira aceite
    const ag = [roteiro(['truco', 'aumentar', '3s', '2s']), roteiro(['aumentar', '4c', '5c'])];
    const { fim, eventos } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag, PR);
    a.igualJSON(eventos.filter(e => e.tipo === 'pedido').map(e => e.nome), ['Truco', 'Retruco']);
    a.igual(eventos.filter(e => e.tipo === 'resposta').pop().resposta, 'aceitar', 'aumentar depois do retruco vira aceitar');
    a.igual(fim.pontos, 6);
  });

  T(GP, 'Correr do retruco dá 3 pontos a quem retrucou', async a => {
    const ag = [roteiro(['truco', 'correr']), roteiro(['aumentar'])];
    const { fim } = await umaMao(2, [cs('4s 5s 6s'), cs('3c 2c Ac')], c('Kd'), ag, PR);
    a.igual(fim.vencedor, 1); a.igual(fim.pontos, 3);
  });

  T(GP, 'Só retruca quem tem até 8 pontos', async a => {
    // a dupla com 9 recebe um truco e tenta aumentar: vira aceite (não pode retrucar)
    const ag = [roteiro(['3s', 'aumentar', '2s']), roteiro(['truco', '4c', '5c'])];
    const { eventos, fim } = await umaMao(2, [cs('3s 2s As'), cs('4c 5c 6c')], c('Kd'), ag, { regras: 'paranaense', placar: [9, 2] });
    a.igual(ag[0].vistas[1].podeAumentar, false, 'a vista avisa que não dá para retrucar');
    a.igual(eventos.find(e => e.tipo === 'resposta').resposta, 'aceitar');
    a.igual(eventos.filter(e => e.tipo === 'pedido').length, 1);
    a.igual(fim.pontos, 3);
    const vr = R.variante('paranaense');
    a.igual(R.podePedirNivel(vr, 2, 8), true);
    a.igual(R.podePedirNivel(vr, 2, 9), false);
    a.igual(R.podePedirNivel(vr, 1, 11), true, 'o truco continua valendo');
    a.igual(R.podePedirNivel(R.variante('paulista'), 2, 10), true, 'no paulista não tem limite');
  });

  T(GP, 'Mão de 11 em dupla: a dupla com 11 pode trocar cartas entre os parceiros', async a => {
    const vira = c('6d');
    const maos = [cs('4s 5s Qs'), cs('4d 5d 6s'), cs('7c 3h Js'), cs('Kd Ks 4h')];
    const troca = { 0: cs('7c 3h 4s'), 2: cs('5s Qs Js') };
    const ag = [roteiro([{ resposta: 'jogar', troca }, '7c', '3h']), roteiro(['4d', '5d']), roteiro(['5s', 'Qs']), roteiro(['Kd', 'Ks'])];
    ag[0].bot = false;                        // na sua dupla, quem decide a mão de 11 é você
    const { eventos, fim } = await umaMao(4, maos, vira, ag, { regras: 'paranaense', placar: [11, 4] });
    const v = ag[0].vistas[0];
    a.verdadeiro(v.trocaPermitida, 'a troca aparece na vista');
    const onze = eventos.find(e => e.tipo === 'onze');
    a.igual(onze.trocadas, 2, 'duas cartas mudaram de mão');
    const ordem = arr => arr.slice().sort((x, y) => x - y);
    a.igualJSON(ordem(ag[0].vistas[1].cartas), ordem(troca[0]), 'você joga com as cartas trocadas');
    a.igualJSON(ordem(fim.iniciais[2]), ordem(troca[2]), 'o parceiro fica com as outras');
    a.igual(fim.vencedor, 0); a.igual(fim.pontos, 3, 'mão de 11 vale 3');
  });

  T(GP, 'Troca com carta que a dupla não tem é recusada; no paulista não existe troca', async a => {
    const vira = c('6d');
    const maos = [cs('4s 5s Qs'), cs('4d 5d 6s'), cs('7c 3h Js'), cs('Kd Ks 4h')];
    let erro = null;
    try {
      const ag0 = [roteiro([{ resposta: 'jogar', troca: { 0: cs('Kd 3h 4s'), 2: cs('5s Qs Js') } }]), roteiro([]), roteiro([]), roteiro([])];
      ag0[0].bot = false;
      await umaMao(4, maos, vira, ag0, { regras: 'paranaense', placar: [11, 4] });
    } catch (e) { erro = e; }
    a.verdadeiro(erro && /troca/.test(erro.message), 'deveria recusar a troca');
    const ag = [roteiro([{ resposta: 'jogar', troca: { 0: cs('7c 3h 4s'), 2: cs('5s Qs Js') } }, '4s', '5s']), roteiro(['4d', '5d', '6s']), roteiro(['7c', '3h']), roteiro(['Kd', 'Ks', '4h'])];
    ag[0].bot = false;
    const { eventos } = await umaMao(4, maos, vira, ag, { regras: 'paulista', placar: [11, 4] });
    a.igual(ag[0].vistas[0].trocaPermitida, false);
    a.igual(eventos.find(e => e.tipo === 'onze').trocadas, 0, 'no paulista a troca é ignorada');
  });

  T(GP, 'Três empates na mão de 11: os 3 pontos vão para quem não está com 11', async a => {
    const ag = [roteiro(['jogar', '3s', '2s', '4s']), roteiro(['3c', '2c', '4c'])];
    const { fim } = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], c('Kd'), ag, { regras: 'paranaense', placar: [11, 4] });
    a.igual(fim.vencedor, 1); a.igual(fim.pontos, 3); a.igual(fim.motivo, 'empateOnze');
    // 11 a 11 (mão de ferro): ninguém marca
    const ag2 = [roteiro([0, 0, 0]), roteiro([0, 0, 0])];
    const r2 = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], c('Kd'), ag2, { regras: 'paranaense', placar: [11, 11] });
    a.igual(r2.fim.vencedor, null);
  });

  T(GP, 'Três empates depois de truco: ganha quem pediu no escuro, perde quem pediu vendo a carta', async a => {
    // no escuro: o lugar 0 pede antes de o adversário jogar
    let r = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], c('Kd'), [roteiro(['truco', '3s', '2s', '4s']), roteiro(['aceitar', '3c', '2c', '4c'])], PR);
    a.igual(r.fim.vencedor, 0, 'no escuro: o empate é de quem pediu'); a.igual(r.fim.pontos, 3); a.igual(r.fim.motivo, 'empateEscuro');
    a.igual(r.eventos.find(e => e.tipo === 'pedido').escuro, true);
    // com carta exposta: o lugar 1 pede já vendo o 3 do lugar 0
    r = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], c('Kd'), [roteiro(['3s', 'aceitar', '2s', '4s']), roteiro(['truco', '3c', '2c', '4c'])], PR);
    a.igual(r.fim.vencedor, 0, 'com carta exposta: o empate é contra quem pediu');
    a.igual(r.eventos.find(e => e.tipo === 'pedido').escuro, false);
    // no paulista, três empates: ninguém marca (mesmo com truco)
    r = await umaMao(2, [cs('3s 2s 4s'), cs('3c 2c 4c')], c('Kd'), [roteiro(['truco', '3s', '2s', '4s']), roteiro(['aceitar', '3c', '2c', '4c'])], { regras: 'paulista' });
    a.igual(r.fim.vencedor, null);
  });

  T(GP, 'A análise conta o empate de quem pediu no escuro', a => {
    const vira = c('Kd');
    const v = Object.assign(vista1x1(cs('4s'), vira), {
      rodada: 2, resultados: ['E', 'E'], nCartas: [1, 1], vez: 0, nivel: 1, valor: 3, podeTrucar: false, regras: 'paranaense',
      jogadas: [[{ j: 0, carta: c('3s') }, { j: 1, carta: c('3c') }], [{ j: 0, carta: c('2s') }, { j: 1, carta: c('2c') }], []]
    });
    // o adversário só pode ter cartas que empatam ou não: com empate a favor (0), a chance sobe
    const contra = IA.analisar(Object.assign({}, v, { empateTriplo: 1 }), { amostras: 200 }).pGanhar;
    const favor = IA.analisar(Object.assign({}, v, { empateTriplo: 0 }), { amostras: 200 }).pGanhar;
    a.maior(favor, contra);
    return `ganhar com o empate a favor: ${pct(favor)}; contra: ${pct(contra)}`;
  });

  T(GP, 'Melhor troca: usa as 6 cartas da dupla e não piora a chance', a => {
    const vira = c('6d');
    const v = Object.assign(vista1x1(cs('4s 5s Qs'), vira), {
      n: 4, parceiro: 2, nCartas: [3, 3, 3, 3], tipo: 'onze', equipeOnze: 0, placar: [11, 4], nos: 11, eles: 4,
      cartasParceiro: cs('7c 3h Js'), trocaPermitida: true, podeTrucar: false, regras: 'paranaense'
    });
    const t = IA.melhorTroca(v, { amostras: 120 });
    const todas = t.troca[0].concat(t.troca[2]).slice().sort((x, y) => x - y).join();
    a.igual(todas, cs('4s 5s Qs 7c 3h Js').sort((x, y) => x - y).join());
    a.verdadeiro(t.p >= t.pAtual - 1e-9, 'a troca não piora');
    return `chance sem troca ${pct(t.pAtual)}; com a melhor troca ${pct(t.p)} (${t.mudaram} carta${t.mudaram === 1 ? '' : 's'})`;
  });

  T(GP, 'Partidas inteiras entre bots no paranaense: nunca passa do retruco nem retruca com 9', async a => {
    let maos = 0, alto = 0, proibido = 0;
    for (let i = 0; i < 6; i++) {
      const n = i % 2 ? 4 : 2;
      const ag = Array.from({ length: n }, (_, j) => IA.criarBot(IA.LISTA_PERFIS[(i + j) % 3]));
      let placar = [0, 0];
      const r = await M.criar({ n, regras: 'paranaense' }, ag, { evento: ev => {
        ag.forEach((x, j) => x.observar(ev, j % 2));
        if (ev.tipo === 'inicioMao') placar = ev.placar;
        if (ev.tipo === 'pedido') { if (ev.nivel > 2) alto++; if (ev.nivel === 2 && placar[ev.equipe] > 8) proibido++; }
      } }).rodar();
      maos += r.maos;
      a.igual(r.placar[r.vencedor], 12);
    }
    a.igual(alto, 0, 'pedido acima do retruco'); a.igual(proibido, 0, 'retruco com 9 ou mais');
    return `6 partidas, ${maos} mãos`;
  });

  // ============================================================== torneio
  const GT = 'Truco: torneio';
  const TT = P.Truco.Torneio;

  T(GT, 'Chave com qualquer número de participantes: fases, byes e todos na 1ª fase', a => {
    const linhas = [];
    [2, 3, 5, 7, 8, 13, 24, 33, 64].forEach(N => {
      const t = TT.criar({ regras: 'paulista', n: 2, participantes: N, melhorDe: 1, nome: 'Você' });
      let tam = 1, fases = 0; while (tam < N) { tam *= 2; fases++; }
      a.igual(t.rodadas.length, fases, N + ' participantes: fases');
      a.igual(t.rodadas[0].length, tam / 2);
      const byes = t.rodadas[0].filter(c => c.bye).length;
      a.igual(byes, tam - N, 'byes');
      const vistos = [];
      t.rodadas[0].forEach(c => { vistos.push(c.a); if (c.b !== null) vistos.push(c.b); });
      a.igual(vistos.slice().sort((x, y) => x - y).join(), t.participantes.map((_, i) => i).join(), 'cada um aparece uma vez');
      // quem passou direto já está na 2ª fase
      if (byes && t.rodadas.length > 1) a.igual(t.rodadas[1].reduce((s, c) => s + (c.a !== null) + (c.b !== null), 0), byes);
      linhas.push(`${N}: ${fases} fases, ${byes} byes`);
    });
    return linhas.join(' · ');
  });

  T(GT, 'Nomes sem repetir mesmo com 64 duplas; você é o participante 0', a => {
    const t = TT.criar({ regras: 'paranaense', n: 4, participantes: 64, melhorDe: 3, nome: 'Wellington' });
    const nomes = [];
    t.participantes.forEach(p => p.membros.forEach(m => nomes.push(m.nome)));
    a.igual(nomes.length, 128);
    a.igual(new Set(nomes).size, 128, 'nomes repetidos');
    a.verdadeiro(t.participantes[0].voce && t.participantes[0].membros[0].voce);
    a.igual(t.participantes[0].membros[1].perfil !== undefined, true, 'seu parceiro é um bot com estilo');
    a.igual(t.regras, 'paranaense'); a.igual(t.melhorDe, 3);
  });

  T(GT, 'Melhor de 3: o confronto acaba com duas vitórias; perder te elimina', a => {
    const t = TT.criar({ regras: 'paulista', n: 2, participantes: 4, melhorDe: 3, nome: 'Você' });
    const meu = TT.meuConfronto(t);
    a.verdadeiro(meu && meu.r === 0);
    const eu = meu.lado, ele = eu === 'a' ? 'b' : 'a';
    TT.registrarJogo(t, meu.r, meu.i, eu, [12, 5]);
    a.igual(meu.c.vencedor, null, '1 a 0 ainda não acabou');
    TT.registrarJogo(t, meu.r, meu.i, ele, [8, 12]);
    TT.registrarJogo(t, meu.r, meu.i, ele, [10, 12]);
    a.igual(meu.c.vencedor, ele);
    a.igual(t.eliminadoNa, 0);
    a.igual(TT.meuConfronto(t), null);
    a.igual(TT.campanha(t).texto, 'Eliminado na semifinal.');
    a.lanca(() => TT.registrarJogo(t, meu.r, meu.i, eu, [12, 0]), 'confronto decidido não aceita mais jogos');
    const jg = TT.seusJogos(t);
    a.igual(jg.vitorias, 1); a.igual(jg.derrotas, 2);
  });

  T(GT, 'Torneio inteiro com partidas de verdade entre bots, até o campeão', async a => {
    const t = TT.criar({ regras: 'paranaense', n: 4, participantes: 6, melhorDe: 1, nome: 'Você' });
    // você também "joga" aqui como bot, para o teste ir até o fim
    for (let volta = 0; volta < 10; volta++) {
      const meu = TT.meuConfronto(t);
      await TT.simular(t, meu ? meu.r : undefined, null, true);
      if (!meu) break;
      const res = await TT.jogarEntreBots(t, meu.c.a, meu.c.b, true);
      TT.registrarJogo(t, meu.r, meu.i, res.vencedor, res.placar);
    }
    await TT.simular(t, undefined, null, true);
    t.rodadas.forEach(rod => rod.forEach(cf => a.verdadeiro(cf.vencedor, 'confronto sem vencedor')));
    a.verdadeiro(t.campeao !== null);
    const final = t.rodadas[t.rodadas.length - 1][0];
    a.igual(final.vencedor === 'a' ? final.a : final.b, t.campeao);
    JSON.parse(JSON.stringify(t));               // fica salvo como JSON
    return `campeão: ${t.participantes[t.campeao].nome}; você: ${TT.campanha(t).texto}`;
  });
})(window.Poker = window.Poker || {});
