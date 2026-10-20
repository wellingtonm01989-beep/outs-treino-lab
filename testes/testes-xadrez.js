/* ==========================================================================
   OUTS · Treino Lab — testes/testes-xadrez.js
   Testes do xadrez: geração de lances (perft em posições de referência),
   roque, en passant, promoção, xeque-mate, afogamento, repetição, 50 lances,
   material insuficiente, notação em português, a busca (mate e tática) e o
   coach (recomendação e nota do lance).
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const X = P.Xadrez, XC = X.Coach;
  const G = 'Xadrez: regras', GB = 'Xadrez: busca e coach';
  const jogar = (pos, lances) => lances.split(' ').forEach(t => { const m = pos.lanceDe(t); if (!m) throw new Error('lance inválido: ' + t + ' em ' + pos.fen()); pos.fazer(m); });

  T(G, 'Perft: número exato de lances possíveis (inicial e "Kiwipete")', a => {
    const p0 = new X.Posicao();
    a.igualJSON([1, 2, 3].map(d => X.perft(p0, d)), [20, 400, 8902], 'posição inicial');
    const kiwi = new X.Posicao('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    a.igualJSON([1, 2].map(d => X.perft(kiwi, d)), [48, 2039], 'Kiwipete (roques, en passant, promoções, xeques)');
    const p5 = new X.Posicao('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    a.igualJSON([1, 2].map(d => X.perft(p5, d)), [44, 1486], 'promoção com captura');
    a.igual(p0.fen(), X.FEN_INICIAL, 'fazer/desfazer volta à posição');
    return '20 · 400 · 8.902 lances (inicial); 48 · 2.039 (Kiwipete)';
  });

  T(G, 'Roque: só sem ter mexido rei/torre, com caminho livre e sem passar por casa atacada', a => {
    let pos = new X.Posicao('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    a.verdadeiro(!!pos.lanceDe('O-O') && !!pos.lanceDe('O-O-O'), 'os dois roques');
    jogar(pos, 'O-O');
    a.igual(pos.fen().split(' ')[0], 'r3k2r/8/8/8/8/8/8/R4RK1', 'rei em g1, torre em f1');
    a.igual(pos.fen().split(' ')[2], 'kq', 'brancas perdem os dois roques');
    // casa de passagem atacada (bispo preto em c4 ataca f1)
    pos = new X.Posicao('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1');
    a.verdadeiro(!pos.lanceDe('O-O'), 'não roca passando por f1 atacada');
    // em xeque não roca
    pos = new X.Posicao('4k3/8/8/8/8/8/4r3/R3K3 w Q - 0 1');
    a.verdadeiro(!pos.lanceDe('O-O-O'), 'não roca em xeque');
    // a torre que se mexe tira o roque daquele lado
    pos = new X.Posicao('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    jogar(pos, 'Th2 Th7 Th1 Th8');
    a.verdadeiro(!pos.lanceDe('O-O') && !!pos.lanceDe('O-O-O'), 'só o grande sobra');
  });

  T(G, 'En passant: só no lance seguinte ao avanço duplo', a => {
    const pos = new X.Posicao();
    jogar(pos, 'e4 a6 e5 d5');
    const ep = pos.lanceDe('exd6');
    a.verdadeiro(!!ep && (X.marcasL(ep) & X.M_EP), 'exd6 en passant');
    jogar(pos, 'exd6');
    a.igual(pos.fen().split(' ')[0], 'rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR', 'o peão da d5 sai');
    const pos2 = new X.Posicao();
    jogar(pos2, 'e4 a6 e5 d5 Cf3 h6');
    a.verdadeiro(!pos2.lanceDe('exd6'), 'depois de outro lance, não vale mais');
  });

  T(G, 'Promoção: dama, torre, bispo ou cavalo, com a notação "=D"', a => {
    const pos = new X.Posicao('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const proms = pos.legais().filter(m => X.promoL(m));
    a.igual(proms.length, 4);
    a.igualJSON(proms.map(m => pos.san(m)).sort(), ['a8=B', 'a8=C', 'a8=D', 'a8=T']);
    jogar(pos, 'a8=D');
    a.igual(pos.fen().split(' ')[0], 'Q7/7k/8/8/8/8/8/K7');
  });

  T(G, 'Xeque-mate, afogamento e os empates', a => {
    let pos = new X.Posicao();
    jogar(pos, 'f3 e5 g4 Dh4#');
    let s = pos.situacao();
    a.igualJSON([s.fim, s.resultado, s.motivo], [true, '0-1', 'mate'], 'mate do louco');
    pos = new X.Posicao('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    s = pos.situacao();
    a.igualJSON([s.resultado, s.motivo], ['1/2-1/2', 'afogamento'], 'afogamento');
    pos = new X.Posicao();
    jogar(pos, 'Cf3 Cf6 Cg1 Cg8 Cf3 Cf6 Cg1 Cg8');
    a.igual(pos.situacao().motivo, 'repeticao', 'repetição tripla');
    pos = new X.Posicao('8/8/4k3/8/8/2N5/8/4K3 w - - 0 1');
    a.igual(pos.situacao().motivo, 'material', 'rei e cavalo contra rei');
    pos = new X.Posicao('8/8/4k3/8/8/2R5/8/4K3 w - - 99 80');
    jogar(pos, 'Tc4');
    a.igual(pos.situacao().motivo, '50lances', '50 lances');
  });

  T(G, 'Notação: desambiguação, capturas, roque, xeque e lances em inglês', a => {
    const pos = new X.Posicao('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
    const m = pos.legais().filter(x => X.paraL(x) === X.casaDe('d2'));
    a.igualJSON(m.map(x => pos.san(x)).sort(), ['Cbd2', 'Cfd2', 'Rd2'], 'Cbd2 e Cfd2 (e o rei)');
    const p2 = new X.Posicao();
    jogar(p2, 'e4 d5');
    a.igual(p2.san(p2.lanceDe('exd5')), 'exd5');
    a.verdadeiro(!!p2.lanceDe('Nf3') && p2.lanceDe('Nf3') === p2.lanceDe('Cf3'), 'aceita Nf3 (inglês) = Cf3');
    a.igual(X.uci(p2.lanceDe('Bb5+')), 'f1b5', 'Bb5+');
    a.igual(p2.san(p2.lanceDe('Bb5')), 'Bb5+', 'marca o xeque');
  });

  T(GB, 'Busca: acha mate em 2 e não deixa a dama ser capturada de graça', a => {
    // mate em 2 clássico: 1.Cf6+ gxf6 2.Bxf7#
    let pos = new X.Posicao('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
    let r = X.buscar(pos, { tempo: 3000 });
    a.igual(r.mate, 2, 'mate em 2');
    a.igual(pos.san(r.lance), 'Cf6+', 'o lance do mate');
    const mate = r.mate;
    // a dama branca está atacada pelo peão: tem que sair
    pos = new X.Posicao('rnb1kbnr/ppp2ppp/8/3pp3/3Q4/4P3/PPP2PPP/RNB1KBNR w KQkq - 0 4');
    r = X.buscar(pos, { tempo: 800 });
    a.verdadeiro(X.tipo(pos.t[X.deL(r.lance)]) === X.DAMA, 'a dama sai do ataque: ' + pos.san(r.lance));
    return 'mate em ' + mate + ' achado (Cf6+ gxf6 Bxf7#); a dama atacada sai com ' + pos.san(r.lance);
  });

  T(GB, 'Coach: manda capturar a peça solta e dá "erro grave" para quem entrega a dama', a => {
    // o cavalo preto em e5 está sem defesa e a dama branca em h5 pode tomar
    const jogo = { fen: 'rnbqkb1r/pppp1ppp/8/4n2Q/8/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1', lances: [] };
    const pos = XC.posicaoDe(jogo);
    const r = X.buscar(pos, { tempo: 900, multi: true });
    const an = { melhor: X.uci(r.lance), valor: r.valor, mate: r.mate, profundidade: r.profundidade, raiz: r.raiz.map(x => ({ uci: X.uci(x.lance), valor: x.valor })), pv: r.pv.map(X.uci), brancas: r.valor, lado: X.BRANCO };
    const c = XC.explicar(jogo, an);
    a.igual(an.melhor, 'h5e5', 'Dxe5+');
    a.verdadeiro(c.linhas[0].indexOf('captura o cavalo') >= 0, c.linhas[0]);
    // entregar a dama: Dxf7+?? Rxf7
    const nota = XC.avaliar(jogo, an, 'h5f7');
    a.igual(nota.nota, 'grave', nota.texto);
    const boa = XC.avaliar(jogo, an, 'h5e5');
    a.igual(boa.nota, 'otima');
    return c.linhas[0].replace(/<[^>]+>/g, '');
  });
})(window.Poker = window.Poker || {});
