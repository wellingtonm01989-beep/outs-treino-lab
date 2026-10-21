/* ==========================================================================
   OUTS · Treino Lab — testes/testes-uno.js
   Testes do "Última!" (cartas coloridas): baralho, quando uma carta serve,
   motor com baralho montado (Pular, Inverter, +2, +4 com desafio, Última!
   esquecido, pontos), regras da casa (acumular, comprar até poder, cartas
   iguais juntas), compras uma por toque para você, leitura das mãos e bots
   jogando partidas inteiras.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const U = P.Uno, R = U.Regras, M = U.Motor, IA = U.IA, CO = U.Coach;
  const C = R.CARTAS;
  const G = 'Última!: regras e motor', GB = 'Última!: bots e coach';
  const COR = { r: 0, a: 1, g: 2, b: 3 };

  /** Ids por texto: 'r7' (7 vermelho), 'bP' (Pular azul), 'gI' (Inverter verde), 'a+2', 'W' (coringa), 'W4' (+4). */
  function ids(txt, usadas) {
    usadas = usadas || new Set();
    return txt.trim().split(/\s+/).map(t => {
      let ok;
      if (t === 'W') ok = c => c.tipo === 'coringa';
      else if (t === 'W4') ok = c => c.tipo === 'mais4';
      else {
        const cor = COR[t[0]], resto = t.slice(1);
        const tipo = resto === 'P' ? 'pular' : resto === 'I' ? 'inverter' : resto === '+2' ? 'mais2' : 'num';
        ok = c => c.cor === cor && c.tipo === tipo && (tipo !== 'num' || c.num === +resto);
      }
      const c = C.find(x => ok(x) && !usadas.has(x.id));
      if (!c) throw new Error('carta não encontrada: ' + t);
      usadas.add(c.id);
      return c.id;
    });
  }
  /**
   * Baralho montado: mãos (texto, 7 cartas cada, na ordem dos lugares a partir de quem está à esquerda do dador),
   * a carta de cima da pilha e as próximas compras. O resto vem em ordem (sem +4 por cima).
   */
  function baralho(maos, topo, compras) {
    const usadas = new Set();
    const hs = maos.map(m => ids(m, usadas));
    const t = ids(topo, usadas)[0];
    const cs = compras ? ids(compras, usadas) : [];
    const d = [];
    for (let k = 0; k < 7; k++) hs.forEach(h => d.push(h[k]));
    d.push(t);
    cs.forEach(x => d.push(x));
    for (let id = 0; id < R.TOTAL; id++) if (!usadas.has(id)) d.push(id);
    return d;
  }
  /** Agente com roteiro: 'r7' joga a carta; 'W:g' coringa escolhendo verde; 'r7!' joga dizendo Última!; 'comprar', 'passar', 'desafiar'. */
  function roteiro(lista) {
    const fila = lista.slice();
    const prox = o => { if (!fila.length) throw new Error('roteiro acabou (' + o + ')'); return fila.shift(); };
    const acao = (t, v) => {
      if (t === 'comprar' || t === 'passar' || t === 'desafiar') return { tipo: t };
      const ultima = t.endsWith('!');
      const [carta, cor] = t.replace('!', '').split(':');
      const alvo = ids(carta)[0];
      const id = v.mao.find(x => C[x].sig === C[alvo].sig);
      if (id === undefined) throw new Error('não tenho ' + carta);
      return { tipo: 'carta', carta: id, cor: cor ? COR[cor] : undefined, ultima };
    };
    return { vistas: [], jogar(v) { this.vistas.push(v); return acao(prox('jogar'), v); }, depoisDeComprar(v) { this.vistas.push(v); return acao(prox('depois'), v); }, escolherCor() { return 0; }, pegar: () => null };
  }
  /** Joga uma mão só (para no começo da próxima). */
  async function umaMao(n, d, agentes, op, extra) {
    const eventos = [];
    const m = M.criar(Object.assign({ n, dador: n - 1, baralhos: [d], opcoes: Object.assign({ ate: 0 }, op || {}) }, extra || {}), agentes, {
      evento: ev => { eventos.push(ev); }
    });
    const r = await m.rodar();
    return { m, r, eventos, fim: eventos.find(e => e.tipo === 'fimMao') };
  }

  T(G, 'Baralho: 108 cartas, 25 de cada cor, 8 coringas e os pontos', a => {
    a.igual(R.TOTAL, 108);
    for (let cor = 0; cor < 4; cor++) {
      const da = C.filter(c => c.cor === cor);
      a.igual(da.length, 25, 'cartas da cor ' + cor);
      a.igual(da.filter(c => c.tipo === 'num' && c.num === 0).length, 1, 'um zero');
      a.igual(da.filter(c => c.tipo === 'num' && c.num === 7).length, 2, 'dois setes');
      ['pular', 'inverter', 'mais2'].forEach(t => a.igual(da.filter(c => c.tipo === t).length, 2, t));
    }
    a.igual(C.filter(c => c.tipo === 'coringa').length, 4);
    a.igual(C.filter(c => c.tipo === 'mais4').length, 4);
    a.igual(R.pontosDaMao(ids('r7 b0 gP W W4')), 7 + 0 + 20 + 50 + 50);
    return 'pontos: r7 b0 Pular coringa +4 = 127';
  });

  T(G, 'Quando uma carta serve: cor, número, símbolo e coringas', a => {
    const [r7, g7, gP, bP, r2, rmais2, bmais2, W, W4] = ids('r7 g7 gP bP r2 r+2 b+2 W W4');
    a.verdadeiro(R.casa(g7, r7, 0), 'mesmo número');
    a.verdadeiro(R.casa(r2, r7, 0), 'mesma cor');
    a.verdadeiro(!R.casa(gP, r7, 0), 'nem cor nem número');
    a.verdadeiro(R.casa(bP, gP, 2), 'mesmo símbolo');
    a.verdadeiro(R.casa(bmais2, rmais2, 0), '+2 em +2');
    a.verdadeiro(R.casa(W, r7, 0) && R.casa(W4, r7, 0), 'coringas sempre');
    a.verdadeiro(!R.casa(g7, W, 3), 'depois do coringa vale a cor escolhida');
    a.verdadeiro(R.casa(g7, W, 2), 'na cor escolhida');
    // sem desafio, o +4 só sai sem a cor da mesa
    const op = R.opcoes({ desafio: false });
    a.igualJSON(R.jogaveis([r2, W4], r7, 0, op, null), [r2], 'tem vermelho: +4 não');
    const r5 = ids('r5')[0];
    a.igualJSON(R.jogaveis([g7, W4], r5, 0, op, null), [W4], 'sem vermelho (e sem 5): só o +4');
    // acumulando: responde só com +2 / +4
    const opA = R.opcoes({ acumular: true });
    a.igualJSON(R.jogaveis([r2, bmais2, W4], rmais2, 0, opA, { qtd: 2, tipo: 'mais2' }), [bmais2, W4]);
    a.igualJSON(R.jogaveis([r2, bmais2, W4], W4, 0, opA, { qtd: 4, tipo: 'mais4' }), [bmais2, W4], '+2 também passa o +4 adiante');
  });

  T(G, 'Pular, Inverter (vale Pular com 2) e +2 em partida de 2', async a => {
    // lugar 0 começa (dador 1). 0: Pular → joga de novo; Inverter → de novo; +2 → o 1 compra 2 e perde a vez
    const d = baralho(['rP rI r+2 r5 r6 r8 r9', 'b1 b2 b3 b4 b5 b6 b7'], 'r3');
    const ag0 = roteiro(['rP', 'rI', 'r+2', 'r5', 'r6', 'r8!', 'r9']);
    const ag1 = roteiro([]);
    // o 1 não tem vermelho: compra e passa (mesmo quando a comprada serve)
    ag1.jogar = v => ({ tipo: 'comprar' }); ag1.depoisDeComprar = () => ({ tipo: 'passar' });
    const { eventos, fim } = await umaMao(2, d, [ag0, ag1]);
    const jogadas = eventos.filter(e => e.tipo === 'jogada' && e.j === 0).length;
    a.igual(jogadas, 7, 'o lugar 0 jogou as 7');
    const compra2 = eventos.find(e => e.tipo === 'compra' && e.motivo === 'mais2');
    a.verdadeiro(compra2 && compra2.j === 1 && compra2.qtd === 2, 'o +2 fez o 1 comprar 2');
    a.igual(fim.vencedor, 0);
    a.igual(fim.pontos, R.pontosDaMao(fim.maos[1]), 'pontos = cartas do outro');
    return `vencedor marcou ${fim.pontos} pontos`;
  });

  T(G, 'Inverter com 3 jogadores muda o sentido', async a => {
    const d = baralho(['rI r1 r2 r3 r4 r5 r6', 'g1 g2 g3 g4 g5 g6 g7', 'b1 b2 b3 b4 b5 b6 b7'], 'r9');
    const vezes = [];
    const ag = [roteiro(['rI']), roteiro([]), roteiro([])];
    let para = false;
    const m = M.criar({ n: 3, dador: 2, baralhos: [d], opcoes: { ate: 0 } }, ag, { evento: ev => { if (ev.tipo === 'vez') { vezes.push(ev.j); if (vezes.length === 2) { para = true; m.parar(); } } } });
    ag[1].jogar = ag[2].jogar = () => ({ tipo: 'comprar' });
    await m.rodar();
    a.igualJSON(vezes, [0, 2], 'depois do Inverter, a vez volta pelo outro lado');
  });

  T(G, '+4 com desafio (só no motor; a mesa joga sem): blefe pego compra 4, desafio errado compra 6', async a => {
    // blefe: 0 tem vermelho e joga +4 em vermelho
    let d = baralho(['W4 r1 g1 g2 g3 g4 g5', 'b1 b2 b3 b4 b5 b6 b7'], 'r9');
    const ag = [roteiro(['W4:g']), roteiro(['desafiar'])];
    let ev = [];
    let m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, desafio: true } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'desafio') m.parar(); } });
    ag[1].jogar = v => { ag[1].vistas.push(v); if (v.podeDesafiar) return { tipo: 'desafiar' }; m.parar(); return { tipo: 'comprar' }; };
    await m.rodar();
    let des = ev.find(e => e.tipo === 'desafio');
    a.verdadeiro(des && des.culpado === true, 'era blefe');
    let compra = ev.find(e => e.tipo === 'compra' && e.motivo === 'desafio');
    a.verdadeiro(compra && compra.j === 0 && compra.qtd === 4, 'quem blefou compra 4');
    // limpo: 0 não tem vermelho
    d = baralho(['W4 g1 g2 g3 g4 g5 g6', 'b1 b2 b3 b4 b5 b6 b7'], 'r9');
    const ag2 = [roteiro(['W4:g']), roteiro([])];
    ev = [];
    m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, desafio: true } }, ag2, { evento: e => { ev.push(e); } });
    ag2[1].jogar = v => { if (v.podeDesafiar) return { tipo: 'desafiar' }; m.parar(); return { tipo: 'comprar' }; };
    ag2[0].jogar = v => { if (v.mao.length === 7) return { tipo: 'carta', carta: v.mao.find(x => C[x].tipo === 'mais4'), cor: 2 }; m.parar(); return { tipo: 'comprar' }; };
    await m.rodar();
    des = ev.find(e => e.tipo === 'desafio');
    a.verdadeiro(des && des.culpado === false, 'não era blefe');
    compra = ev.find(e => e.tipo === 'compra' && e.motivo === 'desafio');
    a.verdadeiro(compra && compra.j === 1 && compra.qtd === 6, 'quem desafiou compra 6');
  });

  T(G, 'Última! esquecido: quem perceber primeiro faz comprar 2; dito a tempo, nada acontece', async a => {
    // o 0 joga seis vermelhas seguidas (o 1 só compra); a sexta deixa uma carta e ele não diz "Última!"
    const d2 = baralho(['r1 r2 r3 r4 r5 r6 r7', 'b1 b2 b3 b4 b5 b6 b7'], 'r9');
    const ag = [roteiro(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']), roteiro([])];
    ag[1].jogar = () => ({ tipo: 'comprar' }); ag[1].depoisDeComprar = () => ({ tipo: 'passar' });
    ag[1].pegar = () => 500;
    const ev = [];
    const m = M.criar({ n: 2, dador: 1, baralhos: [d2], opcoes: { ate: 0 } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'pegou') m.parar(); } });
    await m.rodar();
    const peg = ev.find(e => e.tipo === 'pegou');
    a.verdadeiro(peg && peg.j === 0 && peg.por === 1, 'o 1 pegou o 0');
    const compra = ev.find(e => e.tipo === 'compra' && e.motivo === 'pegou');
    a.verdadeiro(compra && compra.qtd === 2 && compra.j === 0, 'e o 0 comprou 2');
    // dito a tempo
    const ag2 = [roteiro(['r1', 'r2', 'r3', 'r4', 'r5', 'r6!', 'r7']), roteiro([])];
    ag2[1].jogar = () => ({ tipo: 'comprar' }); ag2[1].depoisDeComprar = () => ({ tipo: 'passar' }); ag2[1].pegar = () => 500;
    const r2 = await umaMao(2, baralho(['r1 r2 r3 r4 r5 r6 r7', 'b1 b2 b3 b4 b5 b6 b7'], 'r9'), ag2);
    a.verdadeiro(!r2.eventos.some(e => e.tipo === 'pegou'), 'ninguém pega quem disse');
    a.verdadeiro(r2.eventos.some(e => e.tipo === 'ultima' && e.j === 0), 'o "Última!" aparece');
    a.igual(r2.fim.vencedor, 0);
  });

  T(G, 'Acumular +2 (regra da casa): passa adiante e o próximo compra tudo', async a => {
    const d = baralho(['r+2 r1 r2 r3 r4 r5 r6', 'b+2 b1 b2 b3 b4 b5 b6', 'g1 g2 g3 g4 g5 g6 g7'], 'r9');
    const ag = [roteiro(['r+2']), roteiro(['b+2']), roteiro(['comprar'])];
    const ev = [];
    const m = M.criar({ n: 3, dador: 2, baralhos: [d], opcoes: { ate: 0, acumular: true } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'compra') m.parar(); } });
    await m.rodar();
    const c = ev.find(e => e.tipo === 'compra');
    a.verdadeiro(c && c.j === 2 && c.qtd === 4, 'o terceiro comprou 4');
  });

  T(G, '+2 passa o +4 adiante: o próximo compra 6', async a => {
    // o 0 não tem vermelho (o +4 vale); o 1 passa adiante com o +2 azul; o 2 compra tudo
    const d = baralho(['W4 g1 g2 g3 g4 g5 g6', 'b+2 b1 b2 b3 b4 b5 b6', 'g1 g2 g3 g4 g5 g6 g7'], 'r9');
    const ag = [roteiro(['W4:g']), roteiro(['b+2']), roteiro(['comprar'])];
    const ev = [];
    const m = M.criar({ n: 3, dador: 2, baralhos: [d], opcoes: { ate: 0 } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'compra') m.parar(); } });
    await m.rodar();
    const c = ev.find(e => e.tipo === 'compra');
    a.verdadeiro(c && c.j === 2 && c.qtd === 6, 'o terceiro comprou 4 + 2');
  });

  T(G, 'Comprar até poder jogar (regra da casa)', async a => {
    // 0 não tem vermelho nem 9; as compras: b1, b2, r4 → para no r4 e pode jogar
    const d = baralho(['g1 g2 g3 g4 g5 g6 g7', 'b3 b4 b5 b6 b7 b8 b0'], 'r9', 'b1 b2 r4');
    const ag = [roteiro(['comprar', 'r4']), roteiro([])];
    const ev = [];
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, comprarAtePoder: true } }, ag, { evento: e => { ev.push(e); if (e.tipo === 'jogada') m.parar(); } });
    await m.rodar();
    a.igual(ev.filter(e => e.tipo === 'compra' && e.j === 0).length, 3, 'comprou 3 vezes');
    const jog = ev.find(e => e.tipo === 'jogada');
    a.igual(R.nome(jog.carta), '4 Vermelho');
  });

  T(G, 'Cartas iguais juntas (regra da casa): só números iguais, a primeira combinando com a mesa', a => {
    const usadas = new Set();
    const [g1, b1, r1, a1, b5, rP, bP] = ids('g1 b1 r1 a1 b5 rP bP', usadas);
    const mao = [b1, r1, a1, b5, rP, bP];
    const op = R.opcoes({ juntas: true }), sem = R.opcoes();
    a.verdadeiro(R.grupoValido(mao, [b1, r1, a1], g1, 2, op, null), 'três 1 sobre um 1');
    a.verdadeiro(!R.grupoValido(mao, [b1, r1, a1], g1, 2, sem, null), 'sem a regra, não');
    a.verdadeiro(!R.grupoValido(mao, [b1, b5], g1, 2, op, null), 'números diferentes, não');
    a.verdadeiro(!R.grupoValido(mao, [rP, bP], ids('gP', usadas)[0], 2, op, null), 'ações vão uma por vez');
    const g7 = ids('g7', usadas)[0];
    a.verdadeiro(!R.grupoValido(mao, [b1, r1], g7, 2, op, null), 'nenhuma combina com o 7 verde');
    a.verdadeiro(R.grupoValido(mao, [b1, r1], ids('b9', usadas)[0], 3, op, null), 'a primeira (1 azul) combina pela cor');
    a.verdadeiro(!R.grupoValido(mao, [r1, b1], ids('b8', usadas)[0], 3, op, null), 'mas a primeira tem de combinar (o 1 vermelho não)');
    a.igualJSON(R.iguais(mao, b1).sort(), [r1, a1].sort(), 'as iguais ao 1 azul');
  });

  T(G, 'Jogar juntas: os três 1 vão de uma vez e a última fica por cima', async a => {
    const d = baralho(['b1 r1 a1 b5 b6 b7 b8', 'g2 g3 g4 g5 g6 g7 g8'], 'g1');
    const usadasAg = [];
    const ag0 = {
      jogar(v) {
        if (v.mao.length === 7) { const um = v.mao.filter(x => C[x].tipo === 'num' && C[x].num === 1); usadasAg.push(um); return { tipo: 'carta', carta: um.find(x => C[x].cor === 3), cartas: [um.find(x => C[x].cor === 3), um.find(x => C[x].cor === 0), um.find(x => C[x].cor === 1)] }; }
        m.parar(); return { tipo: 'comprar' };
      },
      depoisDeComprar: () => ({ tipo: 'passar' }), escolherCor: () => 0, pegar: () => null
    };
    const ag1 = { jogar: () => ({ tipo: 'comprar' }), depoisDeComprar: () => ({ tipo: 'passar' }), escolherCor: () => 0, pegar: () => null };
    const ev = [];
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, juntas: true } }, [ag0, ag1], { evento: e => { ev.push(e); if (e.tipo === 'vez' && e.j === 1) m.parar(); } });
    await m.rodar();
    const jog = ev.filter(e => e.tipo === 'jogada');
    a.igual(jog.length, 3, 'três jogadas seguidas');
    a.igualJSON(jog.map(e => e.parte + '/' + e.de), ['1/3', '2/3', '3/3']);
    const mo = m._mao();
    a.igual(C[mo.descarte[mo.descarte.length - 1]].cor, 1, 'o 1 amarelo (o último) ficou por cima');
    a.igual(mo.cor, 1, 'e a cor da vez é amarelo');
    a.igual(mo.maos[0].length, 4, 'sobraram 4 cartas');
    const op = IA.opcoesDe(Object.assign(m.vistaPara(0), { fase: 'jogar' }));
    a.verdadeiro(Array.isArray(op), 'opções calculadas');
  });

  T(G, 'Você (manual): cada carta comprada espera um toque, e depois de comprar quem decide é você', async a => {
    // o 0 (bot) joga +2 em você (lugar 1): duas compras, um toque cada; na sua vez você compra (o toque vale) e passa
    const d = baralho(['r+2 r1 r2 r3 r4 r5 r6', 'g1 g2 g3 g4 g5 g6 g7'], 'r9', 'b1 b2 b3 b4');
    const toques = [], depois = [];
    let vezes0 = 0;
    const ag0 = { jogar(v) { vezes0++; if (vezes0 === 1) return { tipo: 'carta', carta: v.mao.find(x => C[x].tipo === 'mais2') }; if (vezes0 === 2) return { tipo: 'carta', carta: v.mao.find(x => C[x].num === 1) }; m.parar(); return { tipo: 'comprar' }; },
      depoisDeComprar: () => ({ tipo: 'passar' }), escolherCor: () => 0, pegar: () => null };
    const eu = { manual: true, jogar: () => ({ tipo: 'comprar' }), depoisDeComprar(v) { depois.push(v); return { tipo: 'passar' }; },
      antesDeComprar(v, info) { toques.push(info); return Promise.resolve(); }, escolherCor: () => 0, pegar: () => null };
    const ev = [];
    // sem passar adiante (motor): o +2 cai direto em você; com a regra da mesa, o toque em "Comprar 2" já vale pela primeira
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, acumular: false } }, [ag0, eu], { evento: e => { ev.push(e); } });
    await m.rodar();
    a.igualJSON(toques.map(t => t.motivo + ':' + t.faltam + '/' + t.total), ['mais2:2/2', 'mais2:1/2'], 'um toque por carta do +2');
    a.igual(ev.filter(e => e.tipo === 'compra' && e.j === 1 && e.motivo === 'mais2').length, 2, 'e cada carta chega numa compra');
    a.igual(depois.length, 1, 'depois de comprar na vez, você decide');
    a.verdadeiro(depois[0].jogaveis.length === 0, 'mesmo com a comprada sem servir (a mesa não decide por você)');
    a.verdadeiro(ev.some(e => e.tipo === 'passou' && e.j === 1), 'você passou');
  });

  T(G, 'Você (manual) na regra de comprar até poder: compra outra a cada toque e para quando serve', async a => {
    const d = baralho(['g1 g2 g3 g4 g5 g6 g7', 'b3 b4 b5 b6 b7 b8 b0'], 'r9', 'b1 b2 r4');
    const toques = [], depois = [];
    const eu = { manual: true, jogar: () => ({ tipo: 'comprar' }),
      depoisDeComprar(v) { depois.push(v.comprada); if (depois.length === 1) return { tipo: 'passar' }; if (!v.jogaveis.length) return { tipo: 'comprar' }; return { tipo: 'carta', carta: v.comprada }; },
      antesDeComprar(v, info) { toques.push(info.motivo); return Promise.resolve(); }, escolherCor: () => 0, pegar: () => null };
    const ag1 = { jogar: () => ({ tipo: 'comprar' }), depoisDeComprar: () => ({ tipo: 'passar' }), escolherCor: () => 0, pegar: () => null };
    const ev = [];
    const m = M.criar({ n: 2, dador: 1, baralhos: [d], opcoes: { ate: 0, comprarAtePoder: true } }, [eu, ag1], { evento: e => { ev.push(e); if (e.tipo === 'jogada') m.parar(); } });
    await m.rodar();
    a.igualJSON(depois.map(x => R.nome(x)), ['1 Azul', '2 Azul', '4 Vermelho'], 'decidiu depois de cada compra');
    a.igual(toques.length, 1, 'passar sem poder não vale: a compra seguinte esperou um toque');
    a.igual(R.nome(ev.find(e => e.tipo === 'jogada').carta), '4 Vermelho');
  });

  T(GB, 'Leitura das mãos: quem comprou com a mesa em azul quase certamente não tem azul', a => {
    const vista = {
      eu: 0, n: 2, mao: ids('r1 r2'), descarte: ids('b5'), nCartas: [2, 6],
      historico: [{ j: 1, acao: 'comprou', qtd: 1, motivo: 'vez', corMesa: 3, topoMesa: ids('b5')[0] }]
    };
    const inf = IA.inferir(vista);
    a.maior(inf[1].falta[3], 0.7, 'falta azul');
    let azuis = 0, tot = 0;
    for (let k = 0; k < 300; k++) { const w = IA.sortearMundo(vista, inf); w.maos[1].forEach(id => { tot++; if (C[id].cor === 3) azuis++; }); }
    a.maior(0.08, azuis / tot, 'nos sorteios, quase não sai azul para ele');
    return `azul nas mãos sorteadas: ${(100 * azuis / tot).toFixed(1).replace('.', ',')}% (sem leitura seria ~24%)`;
  });

  T(GB, 'Bots jogam partidas inteiras sem jogada ilegal (2 a 6 jogadores, regras da casa)', async a => {
    let maos = 0;
    for (let i = 0; i < 5; i++) {
      const n = 2 + i;
      const ag = Array.from({ length: n }, (_, j) => IA.criarBot(IA.LISTA_PERFIS[(i + j) % 3], { nivel: ['mestre', 'medio', 'facil'][j % 3], amostras: 8 }));
      const op = { ate: 0, acumular: i % 2 === 1, comprarAtePoder: i === 2, desafio: i !== 3, juntas: i >= 2 };
      const r = await M.criar({ n, opcoes: op }, ag, { evento: ev => ag.forEach(x => x.observar(ev)) }).rodar();
      maos += r.maos;
      a.verdadeiro(r.vencedor >= 0 && r.vencedor < n, 'tem vencedor');
    }
    return `5 partidas de uma mão (2 a 6 jogadores) sem erro`;
  });

  T(GB, 'Coach: recomenda o +2 em quem está com uma carta só', a => {
    const usadas = new Set();
    const mao = ids('r+2 r5 g7', usadas);
    const topo = ids('r9', usadas);
    const vista = {
      eu: 0, n: 2, opcoes: R.opcoes(), mao, topo: topo[0], cor: 0, sentido: 1, vez: 0, nCartas: [3, 1], compra: 80,
      descarte: topo, pendente: null, fase: 'jogar', comprada: null, ultima: [false, true], historico: [], placar: [0, 0]
    };
    vista.jogaveis = R.jogaveis(mao, vista.topo, 0, vista.opcoes, null);
    vista.podeDesafiar = false;
    const c = CO.conselho(vista, { amostras: 120, nomes: ['Você', 'Bot'] });
    a.igual(C[c.melhor.carta].tipo, 'mais2', 'recomendação: ' + c.resumo);
    a.verdadeiro(c.linhas.join(' ').indexOf('só 1 carta') >= 0, 'explica que o outro está quase saindo');
    const nota = CO.avaliar(c, { tipo: 'carta', carta: ids('r5')[0] });
    a.verdadeiro(nota && (nota.nota === 'erro' || nota.nota === 'imprecisa'), 'jogar o 5 é erro: ' + (nota && nota.texto));
    return c.resumo;
  });
})(window.Poker = window.Poker || {});
