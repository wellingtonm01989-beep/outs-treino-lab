/* ==========================================================================
   OUTS · Treino Lab — testes/testes-cacheta.js
   Testes da cacheta: baralho, curinga, jogos (trinca, sequência, Ás baixo e
   alto, curinga um por jogo), quanto falta para bater, as batidas com 9 e
   com 10, o motor com baralho montado (vidas, lixo, eliminação, furar a
   fila), a contagem de cartas, o perigo, o coach e bots jogando partidas.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const K = P.Cacheta, R = K.Regras, M = K.Motor, IA = K.IA, CO = K.Coach;
  const G = 'Cacheta: regras e motor', GB = 'Cacheta: bots e coach';
  const NA = { s: 0, h: 1, d: 2, c: 3 }, VAL = { A: 1, J: 11, Q: 12, K: 13 };

  /** Ids por texto: 'Ah 10s 7c 7c' (a segunda cópia de uma carta vem do segundo baralho). */
  function ids(txt, usadas) {
    usadas = usadas || new Set();
    return txt.trim().split(/\s+/).map(t => {
      const n = NA[t.slice(-1)], vs = t.slice(0, -1), v = VAL[vs] || +vs;
      let id = R.tipoDe(v, n);
      if (usadas.has(id)) id += 52;
      if (usadas.has(id)) throw new Error('carta usada 3 vezes: ' + t);
      usadas.add(id);
      return id;
    });
  }
  const nomes = l => l.map(R.nome).join(' ');
  /**
   * Baralho montado: mãos (9 cartas cada, na ordem a partir de quem está à esquerda do dador),
   * a vira e as próximas cartas do monte (de cima para baixo). O resto vem em ordem.
   */
  function baralho(maos, vira, monte) {
    const usadas = new Set();
    const hs = maos.map(m => ids(m, usadas));
    const vv = ids(vira, usadas)[0];
    const mt = monte ? ids(monte, usadas) : [];
    const d = [];
    for (let k = 0; k < 9; k++) hs.forEach(h => d.push(h[k]));
    d.push(vv);
    mt.forEach(x => d.push(x));
    for (let id = 0; id < R.TOTAL; id++) if (!usadas.has(id)) d.push(id);
    return d;
  }
  /** Agente com roteiro: 'monte' | 'lixo' para comprar; 'X' descarta X; 'bater' / 'bater9:X' / 'bater10'. */
  function roteiro(lista) {
    const fila = lista.slice();
    const prox = o => { if (!fila.length) throw new Error('roteiro acabou (' + o + ')'); return fila.shift(); };
    const carta = (v, t) => { const alvo = ids(t)[0] % 52; const id = v.mao.find(x => x % 52 === alvo); if (id === undefined) throw new Error('não tenho ' + t); return id; };
    return {
      vistas: [],
      comprar(v) { this.vistas.push(v); return prox('comprar'); },
      jogar(v) {
        this.vistas.push(v);
        const t = prox('jogar');
        if (t === 'bater10') return { tipo: 'bater', com: 10 };
        if (t.startsWith('bater9:')) return { tipo: 'bater', com: 9, descarte: carta(v, t.slice(7)) };
        return { tipo: 'descartar', carta: carta(v, t) };
      },
      furar: () => false
    };
  }
  const comprarMonteDescartarComprada = () => ({ comprar: () => 'monte', jogar: v => ({ tipo: 'descartar', carta: v.comprada !== v.doLixo ? v.comprada : v.mao.find(x => x !== v.doLixo) }), furar: () => false });

  // ============================================================== regras
  T(G, 'Baralho: 104 cartas (dois de 52), naipes, valores e o desenho do poker', a => {
    a.igual(R.TOTAL, 104);
    const [as, as2, kh, dez] = ids('As As Kh 10d');
    a.igual(R.tipo(as), R.tipo(as2), 'as duas cópias têm o mesmo tipo');
    a.verdadeiro(as !== as2, 'mas são cartas diferentes');
    a.igual(R.valor(kh), 13); a.igual(R.naipe(kh), 1);
    a.igual(R.nome(dez), '10♦');
    a.igual(R.pokerId(as), 12 * 4 + 0, 'Ás de espadas no desenho do poker');
    a.igual(R.pokerId(kh), 11 * 4 + 1, 'Rei de copas');
  });

  T(G, 'Curinga: a carta logo acima da vira (mesmo naipe, mesma cor ou sem)', a => {
    const [v5h, vKc] = ids('5h Kc');
    const c1 = R.curingaDe(v5h, 'naipe');
    a.verdadeiro(R.ehCuringa(ids('6h')[0], c1) && R.ehCuringa(ids('6h 6h')[1], c1), 'as duas cópias do 6♥');
    a.verdadeiro(!R.ehCuringa(ids('6d')[0], c1), 'o 6♦ não');
    a.igual(R.nomeCuringa(c1), '6♥');
    a.verdadeiro(R.ehCuringa(ids('Ac')[0], R.curingaDe(vKc, 'naipe')), 'vira K: curinga Ás');
    const c2 = R.curingaDe(v5h, 'cor');
    a.verdadeiro(R.ehCuringa(ids('6d')[0], c2) && !R.ehCuringa(ids('6s')[0], c2), 'na cor: os 6 vermelhos');
    a.igual(R.nomeCuringa(c2), '6 vermelho');
    a.igual(R.curingaDe(v5h, 'sem'), null);
  });

  T(G, 'Jogos: trinca de naipes diferentes, sequências (Ás antes do 2 ou depois do K), curinga um por jogo', a => {
    const fecha = (txt, cur) => !!R.arranjar(ids(txt), cur);
    a.verdadeiro(fecha('7s 7h 7d 3h 4h 5h Js Qs Ks'), 'trinca + duas sequências');
    a.verdadeiro(fecha('As 2s 3s Qd Kd Ad 9c 9s 9h'), 'Ás baixo e Ás alto');
    a.verdadeiro(!fecha('Kd Ad 2d 9c 9s 9h 5s 6s 7s'), 'K-A-2 não vale');
    a.verdadeiro(!fecha('7c 7c 7s 4h 5h 6h Js Qs Ks'), 'trinca com naipe repetido não vale');
    a.verdadeiro(fecha('7c 7s 7h 7d 4h 5h 6h Js Qs Ks'), 'trinca de 4 (bate com 10)');
    a.verdadeiro(fecha('3h 4h 5h 6h 7h 8h 9h 10h Jh'), 'sequência comprida');
    const cur = R.curingaDe(ids('5d')[0], 'naipe');      // curinga 6♦
    a.verdadeiro(fecha('7c 7s 6d 3h 5h 6d 9s 10s Js', cur), 'curinga numa trinca e outro numa sequência com buraco');
    a.verdadeiro(!fecha('7c 6d 6d 3h 4h 5h 9s 10s Js', cur), 'dois curingas no mesmo jogo não');
    a.verdadeiro(fecha('4d 5d 6d 9s 9h 9c Js Qs Ks', cur), 'o curinga vale como ele mesmo (4♦ 5♦ 6♦)');
    const j = R.arranjar(ids('7s 7h 7d 3h 4h 5h Js Qs Ks'), null);
    a.igual(j.length, 3, 'três jogos');
    return j.map(g => nomes(g.cartas)).join(' | ');
  });

  T(G, 'Quanto falta para bater e a arrumação em jogos', a => {
    a.igual(R.faltam(ids('7s 7h 7d 3h 4h 5h Js Qs Ks'), null, 9), 0, 'fechada');
    a.igual(R.faltam(ids('7s 7h 7d 3h 4h 5h Js Qs 2c'), null, 9), 1, 'falta o K♠ (ou o 10♠)');
    a.igual(R.faltam(ids('7s 7h 7d 3h 4h 5h Js Qs Ks'), null, 10), 1, 'para bater com 10 falta uma ponta');
    a.igual(R.faltam(ids('7s 7h 3h 4h 2c 9d Js Qs 5c'), null, 9), 3, 'três jogos com uma carta faltando cada (e soltas)');
    const pl = R.faltam(ids('7s 7h 7d 3h 4h 5h Js Qs 2c'), null, 9, true);
    a.igual(pl.faltam, 1);
    a.igualJSON(pl.soltas.map(R.nome), ['2♣'], 'a solta é o 2♣');
    const blocos = R.ordenar(ids('2c 7s 3h Js 7h 4h Qs 7d 5h'), null, 'jogos');
    a.igual(blocos.length, 4, 'três jogos e as soltas');
    return blocos.map(b => nomes(b)).join(' | ');
  });

  T(G, 'Batidas: com 10 (todas em jogos) e com 9 (descartando a que sobra)', a => {
    const b10 = R.batidas(ids('3h 4h 5h 6h 7s 7h 7d Ks Qs Js'), null);
    a.verdadeiro(!!b10.com10, 'com 10');
    a.igualJSON(b10.com9.map(x => R.nome(x.descarte)).sort(), ['3♥', '6♥'], 'com 9: soltando uma das pontas');
    const b9 = R.batidas(ids('3h 4h 5h 9c 7s 7h 7d Ks Qs Js'), null);
    a.verdadeiro(!b9.com10, 'não bate com 10');
    a.igualJSON(b9.com9.map(x => R.nome(x.descarte)), ['9♣']);
    a.verdadeiro(R.confere(ids('3h 4h 5h 9c 7s 7h 7d Ks Qs Js'), null, 9, ids('9c')[0]), 'o motor confere');
  });

  // =============================================================== motor
  T(G, 'Motor: distribui 9, vira, quem bate com 9 tira 1 vida de cada um', async a => {
    // dador 1 → o lugar 0 começa (o lixo está vazio: compra do monte); ele pega o K♠ e bate com 9 descartando o 2♣
    const d = baralho(['7s 7h 7d 3h 4h 5h Js Qs 2c', 'Ac 3c 5c 7c 9c Jc 4d 6d 8d'], '9s', 'Ks');
    const ag = [roteiro(['bater9:2c']), roteiro([])];
    const ev = [];
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { vidas: 5, curinga: 'naipe' } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'fimMao') m.parar(); } });
    await m.rodar();
    const ini = ev.find(e => e.tipo === 'inicioMao');
    a.igual(R.nome(ini.vira), '9♠', 'a vira');
    a.igual(R.nomeCuringa(ini.curinga), '10♠', 'o curinga');
    a.igualJSON(ini.nCartas, [9, 9]);
    const fim = ev.find(e => e.tipo === 'fimMao');
    a.igual(fim.vencedor, 0); a.igual(fim.com, 9); a.igual(fim.perda, 1);
    a.igualJSON(fim.vidas, [5, 4], 'o outro perdeu 1');
    a.igual(R.nome(fim.descarte), '2♣');
    return fim.jogos.map(g => nomes(g.cartas)).join(' | ');
  });

  T(G, 'Motor: bater com 10 tira 2; quem zera sai e a partida acaba com a colocação', async a => {
    const d = baralho(['7s 7h 7d 3h 4h 5h Js Qs Ks', 'Ac 3c 5c 7c 9c Jc 4d 6d 8d', '2s 4s 6s 8s 10s 2h 6h 8h 10h'], 'Kd', '6h');
    const ag = [roteiro(['bater10']), roteiro([]), roteiro([])];
    const ev = [];
    const r = await M.criar({ n: 3, dador: 2, baralhos: [d], opcoes: { vidas: 2, curinga: 'sem' } }, ag, { evento: e => { ev.push(e); } }).rodar();
    const fim = ev.find(e => e.tipo === 'fimMao');
    a.igual(fim.com, 10); a.igual(fim.perda, 2);
    a.igualJSON(fim.eliminados.sort(), [1, 2], 'os dois zeraram');
    a.igual(r.vencedor, 0, 'o lugar 0 ganhou');
    a.igualJSON(r.colocacao, [1, 2, 2], 'os dois que saíram juntos empatam em 2º');
  });

  T(G, 'Lixo: pega a de cima e não pode devolvê-la; o monte acaba e o lixo vira monte', async a => {
    const d = baralho(['7s 7h 7d 3h 4h 5h Js Qs 2c', 'Ac 3c 5c 7c 9c Jc 4d 6d 8d'], '9s', 'Kc 2d');
    let erro = null;
    const ag0 = { comprar: () => 'monte', jogar: v => ({ tipo: 'descartar', carta: v.comprada }), furar: () => false };
    const ag1 = { comprar: () => 'lixo', jogar: v => { if (v.doLixo === null) return { tipo: 'descartar', carta: v.mao[0] }; return { tipo: 'descartar', carta: v.doLixo }; }, furar: () => false };
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { vidas: 3 } }, [ag0, ag1], {});
    try { await m.rodar(); } catch (e) { erro = e.message; }
    a.verdadeiro(erro && /não vale descartar a carta que pegou do lixo/.test(erro), 'devolver a do lixo é recusado: ' + erro);
    // reembaralhar: os dois só compram do monte e descartam a comprada
    const ev = [];
    const m2 = M.criar({ n: 2, dador: 1, baralhos: [baralho(['7s 7h 7d 3h 4h 5h Js Qs 2c', 'Ac 3c 5c 7c 9c Jc 4d 6d 8d'], '9s')], opcoes: { vidas: 3, curinga: 'sem' } },
      [comprarMonteDescartarComprada(), comprarMonteDescartarComprada()], { evento: e => { ev.push(e); if (e.tipo === 'reembaralhou' || e.tipo === 'fimMao') m2.parar(); } });
    await m2.rodar();
    const re = ev.find(e => e.tipo === 'reembaralhou');
    a.verdadeiro(re && re.monte > 50, 'o lixo (menos a de cima) virou monte: ' + (re && re.monte));
  });

  T(G, 'Furar a fila: quem bate com a carta descartada pega fora da vez (e o de 10 vem antes)', async a => {
    // dador 2 → ordem 0, 1, 2. O 0 descarta o K♠: o 2 bate com ele (fora da vez), o 1 não.
    const d = baralho(['2c 4c 6c 8c 10c 2d 6d 8d Ks', 'Ac 3c 5c 7c 9c Jc 4d 10d Qd', '7s 7h 7d 3h 4h 5h Js Qs 9h'], '9s', 'Kd');
    const furou = [];
    const ag0 = roteiro(['Ks']);
    const ag1 = { comprar: () => 'monte', jogar: v => ({ tipo: 'descartar', carta: v.comprada }), furar() { furou.push(1); return true; } };
    const ag2 = { comprar: () => 'monte', jogar: v => ({ tipo: 'descartar', carta: v.comprada }), furar(v, c, de) { furou.push(2); return true; } };
    const ev = [];
    const m = M.criar({ n: 3, dador: 2, baralhos: [d], opcoes: { vidas: 3, furar: true, curinga: 'sem' } }, [ag0, ag1, ag2], { evento: e => { ev.push(e); if (e.tipo === 'fimMao') m.parar(); } });
    await m.rodar();
    const fim = ev.find(e => e.tipo === 'fimMao');
    a.igual(fim.vencedor, 2, 'o lugar 2 furou a fila e bateu');
    a.verdadeiro(fim.furou, 'marcado como furada');
    a.igualJSON(furou, [2], 'só perguntou a quem batia');
    a.igual(R.nome(fim.descarte), '9♥', 'e descartou a que sobrava');
  });

  // ========================================================= bots e coach
  T(GB, 'Contagem de cartas: o lixo, a vira e o que cada um pegou do lixo', a => {
    const usadas = new Set();
    const mao = ids('7s 7h 3h 4h 2c 9d Js Qs 5c', usadas);
    const [vira, tresC, seisC, oitoC] = ids('Kd 3c 6h 8h', usadas);
    // o 1 descartou o 3♣; eu descartei o 6♥; o 1 pegou o 6♥ do lixo e descartou o 8♥ (que está no lixo)
    const vista = { eu: 0, n: 2, mao, lixo: [tresC, oitoC], vira, historico: [
      { j: 1, acao: 'monte' }, { j: 1, acao: 'descarte', carta: tresC }, { j: 0, acao: 'monte' }, { j: 0, acao: 'descarte', carta: seisC },
      { j: 1, acao: 'lixo', carta: seisC }, { j: 1, acao: 'descarte', carta: oitoC }] };
    const c = IA.conhecimento(vista);
    a.igual(c.disp[R.tipo(vira)], 1, 'a vira não volta');
    a.igual(c.disp[R.tipo(mao[0])], 1, 'uma cópia do 7♠ está comigo');
    a.igualJSON(c.naMao[1].map(R.nome), ['6♥'], 'o outro ficou com o 6♥ que pegou do lixo');
    a.igual(c.disp[R.tipo(seisC)], 1, 'então só sobra uma cópia do 6♥');
    a.igual(c.disp[R.tipo(oitoC)], 1, 'o 8♥ está no lixo');
    a.igual(c.vezes[1], 2, 'o outro jogou duas vezes');
    a.igual(c.total, 104 - 9 - 1 - 2 - 1, 'cartas que eu não sei onde estão');
  });

  T(GB, 'Perigo: a carta que fecha a batida de quem pegou do lixo é a mais perigosa', a => {
    // o próximo (lugar 1) pegou 7♥ e 8♥ do lixo: o 9♥ e o 6♥ fecham a sequência dele
    const usadas = new Set();
    const mao = ids('9h 2s 2d Kc Kd 5s 6s 7s Jd Ad', usadas);
    const pegos = ids('7h 8h', usadas);
    const historico = [];
    for (let k = 0; k < 8; k++) { historico.push({ j: 1, acao: 'monte' }); historico.push({ j: 1, acao: 'descarte', carta: ids('3c', new Set())[0] + (k % 2) * 52 }); }
    historico.push({ j: 1, acao: 'lixo', carta: pegos[0] }, { j: 1, acao: 'descarte', carta: ids('4c', new Set())[0] });
    historico.push({ j: 1, acao: 'lixo', carta: pegos[1] }, { j: 1, acao: 'descarte', carta: ids('4c 4c', new Set())[1] });
    const vista = { eu: 0, n: 2, mao, lixo: [], vira: ids('3d', usadas)[0], curinga: null, historico, vivos: [true, true], nCartas: [10, 9], opcoes: R.opcoes({ curinga: 'sem' }), vidas: [5, 5], doLixo: null };
    const conh = IA.conhecimento(vista);
    const pg = IA.perigos(vista, conh, [mao[0], mao[9]], 160);
    a.maior(pg.perigo[R.tipo(mao[0])], pg.perigo[R.tipo(mao[9])] + 0.05, `9♥ ${Math.round(pg.perigo[R.tipo(mao[0])] * 100)}% contra A♦ ${Math.round(pg.perigo[R.tipo(mao[9])] * 100)}%`);
    return `perigo do 9♥: ${Math.round(pg.perigo[R.tipo(mao[0])] * 100)}% · do A♦: ${Math.round(pg.perigo[R.tipo(mao[9])] * 100)}%`;
  });

  T(GB, 'Coach: pegue do lixo a carta que fecha; bata quando fechar; o descarte ruim leva nota baixa', a => {
    const usadas = new Set();
    const mao = ids('7s 7h 7d 3h 4h 5h Js Qs 2c', usadas);
    const topo = ids('Ks', usadas)[0];
    const base = { eu: 0, n: 2, opcoes: R.opcoes({ curinga: 'sem' }), vidas: [5, 1], vivos: [true, true], maoNumero: 1, dador: 1, vira: ids('9d', usadas)[0], curinga: null, vez: 0, monte: 70, historico: [{ j: 1, acao: 'monte' }, { j: 1, acao: 'descarte', carta: topo }], nCartas: [9, 9], vezes: 2 };
    const vc = Object.assign({}, base, { fase: 'comprar', mao, lixo: [topo], topo, comprada: null, doLixo: null });
    const c1 = CO.conselho(vc, { nomes: ['Você', 'Bot'] });
    a.igual(c1.melhor.de, 'lixo', 'pegar o K♠: ' + c1.resumo);
    const vj = Object.assign({}, base, { fase: 'jogar', mao: mao.concat([topo]), lixo: [], topo: null, comprada: topo, doLixo: topo });
    const c2 = CO.conselho(vj, { nomes: ['Você', 'Bot'], amostras: 20 });
    a.igual(c2.melhor.tipo, 'bater', 'bater (o outro tem 1 vida: bater com 9 já elimina): ' + c2.resumo);
    a.igual(R.nome(c2.melhor.descarte), '2♣');
    const nota = CO.avaliar(c2, { tipo: 'descartar', carta: mao[0] }, vj);
    a.igual(nota.nota, 'erro', 'não bater é erro: ' + nota.texto);
    // descarte: a solta é o melhor; quebrar a trinca é pior
    const vd = Object.assign({}, base, { fase: 'jogar', mao: ids('7s 7h 7d 3h 4h 5h Js Qs 2c 9d', new Set()), lixo: [], topo: null, doLixo: null });
    vd.comprada = vd.mao[9];
    const c3 = CO.conselho(vd, { nomes: ['Você', 'Bot'], amostras: 20 });
    a.verdadeiro(['2♣', '9♦'].indexOf(R.nome(c3.melhor.carta)) >= 0, 'descarta uma solta: ' + c3.resumo);
    const n3 = CO.avaliar(c3, { tipo: 'descartar', carta: vd.mao[0] }, vd);
    a.verdadeiro(n3.nota === 'erro' || n3.nota === 'imprecisa', 'quebrar a trinca: ' + n3.texto);
    return c1.resumo + ' · ' + c2.resumo + ' · ' + c3.resumo;
  });

  T(GB, 'Bots jogam partidas inteiras sem jogada ilegal (2 a 6 jogadores, os três curingas, furar a fila)', async a => {
    let maos = 0;
    for (let i = 0; i < 5; i++) {
      const n = 2 + i;
      const ag = Array.from({ length: n }, (_, j) => IA.criarBot(IA.LISTA_PERFIS[(i + j) % 3], { nivel: ['mestre', 'medio', 'facil'][j % 3], amostras: 6 }));
      const r = await M.criar({ n, opcoes: { vidas: 1, curinga: ['naipe', 'cor', 'sem'][i % 3], furar: i % 2 === 1 } }, ag, {}).rodar();
      maos += r.maos;
      a.verdadeiro(r.vencedor >= 0 && r.vencedor < n, 'tem vencedor');
    }
    return `5 partidas (2 a 6 jogadores), ${maos} mãos, sem erro`;
  });
})(window.Poker = window.Poker || {});
