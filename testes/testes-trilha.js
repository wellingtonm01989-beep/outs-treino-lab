/* ==========================================================================
   OUTS · Treino Lab — testes/testes-trilha.js
   Testes da trilha: o tabuleiro (24 casas, ligações, 16 trilhas), colocar,
   fechar trilha e tirar peça (não da trilha, a não ser que todas estejam;
   duas trilhas de uma vez tiram uma), mover para a vizinha, voar com 3,
   fim (2 peças, sem lance) e empates, notação, a busca (tapar, fechar,
   trilha dupla), o coach e os bots no Web Worker.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const Tr = P.Trilha, TC = Tr.Coach, IA = Tr.IA;
  const G = 'Trilha: regras', GB = 'Trilha: busca, bots e coach';

  /** Posição montada: casas das brancas e das pretas, quem joga, peças na mão de cada um e a regra de voar. */
  function montar(brancas, pretas, lado, maoB, maoP, voar) {
    const t = new Int8Array(24);
    (brancas ? brancas.split(' ') : []).forEach(x => { t[Tr.casaDe(x)] = 1; });
    (pretas ? pretas.split(' ') : []).forEach(x => { t[Tr.casaDe(x)] = -1; });
    return new Tr.Posicao(t, lado || Tr.BRANCO, { 1: maoB || 0, '-1': maoP || 0 }, { voar: voar !== false });
  }
  const textos = pos => pos.legais().map(Tr.texto).sort();
  const jogar = (pos, lances) => lances.split(' ').forEach(u => { const m = pos.lanceDe(u); if (!m) throw new Error('lance inválido: ' + u); pos.fazer(m); });
  /** Um lance que não fecha trilha nem repete posição (para os empates). */
  function lanceTranquilo(pos) {
    for (const m of pos.legais()) {
      if (m.fecha) continue;
      pos.fazer(m);
      const ok = (pos.vistas.get(pos.hash) || 0) === 1;
      pos.desfazer();
      if (ok) return m;
    }
    return null;
  }

  T(G, 'Tabuleiro: 24 casas, 32 ligações e 16 trilhas; perft da colocação', a => {
    a.igual(Tr.NOMES.length, 24);
    let ligacoes = 0, simetrico = true;
    Tr.VIZ.forEach((v, s) => v.forEach(q => { ligacoes++; if (Tr.VIZ[q].indexOf(s) < 0) simetrico = false; }));
    a.igual(ligacoes / 2, 32, 'ligações');
    a.verdadeiro(simetrico, 'vizinhança simétrica');
    a.igual(Tr.TRILHAS.length, 16);
    a.verdadeiro(Tr.NOMES.every((_, s) => Tr.TRILHAS.filter(l => l.indexOf(s) >= 0).length === 2), 'cada casa está em 2 trilhas');
    a.verdadeiro(Tr.TRILHAS.every(l => Tr.VIZ[l[1]].indexOf(l[0]) >= 0 && Tr.VIZ[l[1]].indexOf(l[2]) >= 0), 'as trilhas seguem as linhas');
    const pos = new Tr.Posicao();
    a.igualJSON([1, 2, 3].map(d => Tr.contarLances(pos, d)), [24, 552, 12144]);
    a.igual(pos.hash, pos.calcHash(), 'fazer/desfazer volta ao mesmo hash');
  });

  T(G, 'Fechar trilha tira uma peça do adversário (que não esteja numa trilha, a não ser que todas estejam)', a => {
    // brancas a7 e d7: g7 fecha a trilha de cima
    let pos = montar('a7 d7', 'b6 d6', 1, 7, 7);
    a.verdadeiro(!!pos.lanceDe('g7xb6') && !!pos.lanceDe('g7xd6'), 'escolhe qual tirar');
    a.verdadeiro(!pos.lanceDe('g7'), 'não dá para fechar sem tirar');
    jogar(pos, 'g7xd6');
    a.igualJSON([pos.t[Tr.casaDe('d6')], pos.n[-1], pos.mao[1]], [0, 1, 6]);
    // as pretas têm uma trilha (a1 d1 g1) e a b2 solta: só a b2 pode sair
    pos = montar('a7 d7', 'a1 d1 g1 b2', 1, 7, 5);
    a.igualJSON(pos.legais().filter(m => m.para === Tr.casaDe('g7')).map(Tr.texto), ['g7xb2']);
    // todas as pretas em trilha: qualquer uma sai
    pos = montar('a7 d7', 'a1 d1 g1', 1, 7, 6);
    a.igualJSON(pos.legais().filter(m => m.para === Tr.casaDe('g7')).map(Tr.texto).sort(), ['g7xa1', 'g7xd1', 'g7xg1']);
  });

  T(G, 'Fechar duas trilhas de uma vez tira uma peça só', a => {
    // d7 fecha a de cima (a7 d7 g7) e a do meio (d7 d6 d5)
    const pos = montar('a7 g7 d6 d5', 'a1 g1 b4', 1, 5, 6);
    const ms = pos.legais().filter(m => m.para === Tr.casaDe('d7'));
    a.igual(ms.length, 3, 'uma opção por peça preta');
    a.verdadeiro(ms.every(m => m.tira >= 0), 'todas tiram');
    jogar(pos, 'd7xb4');
    a.igual(pos.n[-1], 2, 'saiu uma só');
  });

  T(G, 'Mover só para a vizinha vazia; com 3 peças, voar (opção)', a => {
    let pos = montar('a7 d6 g1 b4', 'g7 b2 f4 e5', 1);
    a.igual(pos.fase(1), 'mover');
    a.igualJSON(pos.legais().filter(m => m.de === Tr.casaDe('a7')).map(Tr.texto).sort(), ['a7-a4', 'a7-d7'], 'a7 vai para d7 ou a4');
    a.igualJSON(pos.legais().filter(m => m.de === Tr.casaDe('d6')).map(Tr.texto).sort(), ['d6-b6', 'd6-d5', 'd6-d7', 'd6-f6']);
    // com 3 peças voa para qualquer casa vazia
    pos = montar('a7 d6 g1', 'g7 b2 f4 e5', 1);
    a.igual(pos.fase(1), 'voar');
    a.igual(pos.legais().length, 3 * 17, '3 peças × 17 casas vazias');
    // sem a regra de voar, continua casa a casa
    pos = montar('a7 d6 g1', 'g7 b2 f4 e5', 1, 0, 0, false);
    a.igual(pos.fase(1), 'mover');
    a.maior(17, pos.legais().length);
  });

  T(G, 'Fim: com 2 peças ou sem lance perde; empates (50 meios-lances sem tirar peça, repetição)', a => {
    // as pretas têm 3 peças; a trilha das brancas tira uma e elas ficam com 2
    let pos = montar('a7 d7 b4 b2', 'g1 f2 e3', 1);
    jogar(pos, 'b4-a4');
    a.igual(pos.situacao().fim, false);
    pos = montar('a4 d7 g7 b2', 'g1 f2 e3', 1);
    jogar(pos, 'a4-a7xg1');
    a.igualJSON(pos.situacao(), { fim: true, vencedor: 1, motivo: 'poucas peças' });
    // pretas nos quatro cantos, cercadas
    pos = montar('d7 a4 g4 d1', 'a7 g7 a1 g1', -1);
    a.igualJSON(pos.situacao(), { fim: true, vencedor: 1, motivo: 'bloqueado' });
    // 50 meios-lances sem ninguém tirar peça
    pos = montar('a7 d6 f4 c3', 'g7 b4 e3 d1', 1);
    for (let i = 0; i < Tr.LIMITE_SEM_TIRAR - 1; i++) { const m = lanceTranquilo(pos); a.verdadeiro(!!m, 'lance tranquilo ' + i); pos.fazer(m); }
    a.igual(pos.situacao().fim, false, 'ainda não');
    pos.fazer(lanceTranquilo(pos));
    a.igual(pos.situacao().motivo, '50 lances sem tirar peça');
    // na 1ª fase não conta
    pos = new Tr.Posicao();
    jogar(pos, 'a7 g1 d6 b2');
    a.igual(pos.semTirar, 0);
    // repetição
    pos = montar('a7 b2 f6 c3', 'g1 b6 f2 e5', 1);
    jogar(pos, 'a7-d7 g1-d1 d7-a7 d1-g1 a7-d7 g1-d1 d7-a7');
    a.igual(pos.situacao().fim, false);
    jogar(pos, 'd1-g1');
    a.igual(pos.situacao().motivo, 'repetição');
  });

  T(G, 'Notação: "d7" coloca, "a7-d7" move, "xg4" tira', a => {
    a.igual(Tr.nomeCasa(Tr.casaDe('e4')), 'e4');
    const pos = montar('d7 g7 g1', 'g4 b6 f2 c3', 1);
    a.igualJSON(textos(pos).filter(t => t.indexOf('d7-a7') === 0), ['d7-a7']);
    const p2 = montar('a4 d7 g7 b2', 'g4 b6 f2 c3', 1);
    const m = p2.lanceDe('a4-a7xg4');
    a.verdadeiro(!!m && m.tira === Tr.casaDe('g4'), 'a4-a7 fecha a trilha de cima e tira g4');
    const p3 = new Tr.Posicao();
    a.igual(Tr.texto(p3.lanceDe('d7')), 'd7');
  });

  // ================================================================== busca
  T(GB, 'Busca: tapa a trilha do adversário, fecha a sua e arma trilha dupla', a => {
    // as pretas ameaçam f6 (b6 d6): tem que tapar
    let pos = montar('a1 e4', 'b6 d6', 1, 7, 7);
    let r = Tr.buscar(pos, { profundidade: 6, tempo: 20000 });
    a.igual(r.lance, 'f6', 'tapa em f6');
    a.maior(r.valor, r.raiz[r.raiz.length - 1].valor + 100, 'não tapar perde peça');
    // as brancas fecham em d2 e tiram a d1 (as pretas iam fechar em g1 com a1 e d1)
    pos = montar('c5 d5 a4 f4 b2 f2', 'g7 c4 d3 e3 a1 d1', 1, 3, 3);
    r = Tr.buscar(pos, { profundidade: 6, tempo: 20000 });
    a.igual(r.lance, 'd2xd1', 'fecha e tira a peça que ameaçava');
    // trilha dupla: g7 ameaça d7 (com a7) e g4 (com g1)
    pos = montar('a7 g1', 'b4 f4', 1, 7, 7);
    r = Tr.buscar(pos, { profundidade: 6, tempo: 20000 });
    pos.fazer(pos.lanceDe(r.lance));
    const am = TC.ameacas(pos, 1);
    a.maior(am.length, 1, `${r.lance} arma duas trilhas`);
    return 'tapa f6 · fecha d2xd1 · trilha dupla com ' + r.lance;
  });

  T(GB, 'Coach: explica o lance (tapar, fechar, trilha dupla) e dá nota', a => {
    const an = pos => { const r = Tr.buscar(pos, { profundidade: 6, tempo: 20000 }); return { melhor: r.lance, valor: r.valor, profundidade: r.profundidade, raiz: r.raiz, pv: r.pv }; };
    let pos = montar('a1 e4', 'b6 d6', 1, 7, 7);
    let x = an(pos);
    let c = TC.explicar(pos, x);
    a.verdadeiro(c.linhas[0].indexOf('tapa a trilha') >= 0, c.linhas[0]);
    a.igual(TC.avaliar(x, 'f6').nota, 'otima');
    const nota = TC.avaliar(x, 'c5');
    a.verdadeiro(nota.nota === 'erro' || nota.nota === 'grave', 'não tapar: ' + nota.nota);
    pos = montar('c5 d5 a4 f4 b2 f2', 'g7 c4 d3 e3 a1 d1', 1, 3, 3);
    c = TC.explicar(pos, an(pos));
    a.verdadeiro(c.linhas[0].indexOf('fecha trilha') >= 0 && c.linhas[0].indexOf('ia fechar trilha') >= 0, c.linhas[0]);
    pos = montar('a7 g1', 'b4 f4', 1, 7, 7);
    c = TC.explicar(pos, an(pos));
    a.verdadeiro(c.linhas[0].indexOf('duas trilhas') >= 0, c.linhas[0]);
    return c.linhas[0].replace(/<[^>]+>/g, '');
  });

  T(GB, 'Bots: a busca roda no Web Worker (com a regra de voar) e cada nível devolve um lance legal', async a => {
    const canal = IA.criarCanal({ voar: true });
    try {
      a.verdadeiro(canal.temWorker(), 'worker criado');
      const lances = ['d6', 'f4', 'b4'];
      const pos = new Tr.Posicao(); jogar(pos, lances.join(' '));
      const r = await canal.buscar(lances, { tempo: 300 });
      a.verdadeiro(!!pos.lanceDe(r.lance), 'lance legal do worker: ' + r.lance);
      const feitos = [];
      for (const nv of [1, 2, 3]) {
        const b = await IA.lanceDoBot(canal, lances, nv);
        a.verdadeiro(!!pos.lanceDe(b.lance), 'nível ' + nv + ': ' + b.lance);
        feitos.push(IA.nivel(nv).nome + ' ' + b.lance);
      }
      return feitos.join(' · ');
    } finally { canal.encerrar(); }
  });
})(window.Poker = window.Poker || {});
