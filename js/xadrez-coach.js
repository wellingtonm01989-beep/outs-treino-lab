/* ==========================================================================
   OUTS · Treino Lab — xadrez-coach.js
   Coach do xadrez. Na sua vez, analisa a posição (a mesma busca dos bots,
   avaliando todos os seus lances) e explica: o melhor lance e por quê, o que
   está ameaçado, que peça do adversário está solta, se há mate, e as ideias
   de abertura (desenvolver, roque, centro). Depois do seu lance, a nota:
   compara a chance de vencer antes e depois (a avaliação vira "chance").
   ========================================================================== */
(function (P) {
  'use strict';

  const X = P.Xadrez;
  const NOME = ['', 'peão', 'cavalo', 'bispo', 'torre', 'dama', 'rei'];
  const ART = ['', 'o', 'o', 'o', 'a', 'a', 'o'];
  const VALOR = [0, 1, 3, 3, 5, 9, 100];

  /** Chance de vencer (0..1) a partir da avaliação em centipeões (de quem joga). */
  function chance(cp) {
    if (cp >= X.MATE - 400) return 1;
    if (cp <= -X.MATE + 400) return 0;
    return 1 / (1 + Math.exp(-0.00368 * cp));
  }
  /** Avaliação em texto, do ponto de vista das brancas: "+1,3", "−0,4", "M3" (mate em 3). */
  function textoAvaliacao(cpBrancas, mate) {
    if (mate) return (mate > 0 ? '+' : '−') + 'M' + Math.abs(mate);
    const v = cpBrancas / 100;
    return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
  }
  function resumoAvaliacao(cpBrancas, mate) {
    if (mate) return mate > 0 ? `as brancas têm mate em ${mate}` : `as pretas têm mate em ${-mate}`;
    const a = Math.abs(cpBrancas), quem = cpBrancas > 0 ? 'as brancas' : 'as pretas';
    if (a < 35) return 'posição equilibrada';
    if (a < 90) return `${quem} um pouco melhor`;
    if (a < 200) return `vantagem d${quem === 'as brancas' ? 'as brancas' : 'as pretas'} (mais ou menos um peão)`;
    if (a < 500) return `vantagem clara d${quem === 'as brancas' ? 'as brancas' : 'as pretas'}`;
    return `${quem} estão ganhando`;
  }

  /** Quem ataca a casa s (lista de casas), pelas peças da cor "por". */
  function atacantes(pos, s, por) {
    const out = [], t = pos.t;
    const tipo = X.tipo, cor = X.corDe;
    const passos = (dirs, tipos, longe) => dirs.forEach(dd => {
      for (let x = s + dd; !X.fora(x); x += dd) {
        const p = t[x];
        if (p) { if (cor(p) === por && tipos.indexOf(tipo(p)) >= 0) out.push(x); break; }
        if (!longe) break;
      }
    });
    // peões
    const pe = por === X.BRANCO ? [-15, -17] : [15, 17];
    pe.forEach(d => { const x = s + d; if (!X.fora(x) && t[x] === (X.PEAO | por)) out.push(x); });
    passos([33, 31, 18, 14, -33, -31, -18, -14], [X.CAVALO], false);
    passos([17, 15, -17, -15], [X.BISPO, X.DAMA], true);
    passos([16, 1, -16, -1], [X.TORRE, X.DAMA], true);
    passos([17, 15, -17, -15, 16, 1, -16, -1], [X.REI], false);
    return out;
  }
  /** Peças da cor "cor" atacadas e mal defendidas (sem defesa, ou atacadas por peça de menor valor). */
  function pecasEmPerigo(pos, cor) {
    const out = [];
    for (let s = 0; s < 128; s++) {
      if (X.fora(s)) { s += 7; continue; }
      const p = pos.t[s];
      if (!p || X.corDe(p) !== cor || X.tipo(p) === X.REI) continue;
      const ata = atacantes(pos, s, cor ^ 8);
      if (!ata.length) continue;
      const def = atacantes(pos, s, cor);
      const menor = ata.reduce((b, x) => (VALOR[X.tipo(pos.t[x])] < VALOR[X.tipo(pos.t[b])] ? x : b), ata[0]);
      if (!def.length || VALOR[X.tipo(pos.t[menor])] < VALOR[X.tipo(p)]) out.push({ casa: s, peca: X.tipo(p), atacante: menor, tipoAtacante: X.tipo(pos.t[menor]), defendida: def.length > 0 });
    }
    return out.sort((a, b) => VALOR[b.peca] - VALOR[a.peca]);
  }

  const nomePeca = (k, casa) => `${ART[k]} ${NOME[k]}${casa !== undefined ? ' em ' + X.nomeCasa(casa) : ''}`;
  const sanSeq = (pos, ucis, max) => {
    const out = [], feitos = [];
    for (const u of ucis.slice(0, max || 5)) { const m = pos.lanceDe(u); if (!m) break; out.push(pos.san(m)); pos.fazer(m); feitos.push(m); }
    feitos.forEach(() => pos.desfazer());
    return out.join(' ');
  };

  /**
   * Análise para a sua vez: busca avaliando todos os lances (multi).
   * Devolve { melhor (uci), valor (cp de quem joga), mate, raiz: [{uci, valor}], pv (uci), profundidade, brancas (cp do ponto de vista das brancas) }.
   */
  async function analisar(canal, jogo, tempo) {
    const r = await canal.buscar(jogo.fen, jogo.lances, { tempo: tempo || 1400, multi: true });
    const pos = posicaoDe(jogo);
    const lado = pos.lado;
    return {
      melhor: r.lance ? X.uci(r.lance) : null, valor: r.valor, mate: r.mate, profundidade: r.profundidade,
      raiz: (r.raiz || []).map(x => ({ uci: X.uci(x.lance), valor: x.valor })),
      pv: (r.pv || []).map(m => X.uci(m)),
      brancas: lado === X.BRANCO ? r.valor : -r.valor,
      lado
    };
  }
  function posicaoDe(jogo) {
    const pos = new X.Posicao(jogo.fen);
    jogo.lances.forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
    return pos;
  }

  /** O conselho em linhas de texto (HTML), a partir da análise. */
  function explicar(jogo, an) {
    const pos = posicaoDe(jogo);
    const eu = pos.lado, ele = eu ^ 8;
    const linhas = [];
    if (!an || !an.melhor) return { linhas: ['Sem lances: a partida acabou.'], resumo: '' };
    const m = pos.lanceDe(an.melhor);
    const san = pos.san(m);
    const de = X.deL(m), para = X.paraL(m), k = X.tipo(pos.t[de]), capt = X.marcasL(m) & X.M_CAPT;
    let porque = '';
    if (an.mate > 0) porque = `há <b>mate em ${an.mate}</b>: ${sanSeq(pos, an.pv, an.mate * 2 - 1)}`;
    else if (X.marcasL(m) & X.M_ROQUE) porque = 'o rei fica protegido e a torre entra no jogo';
    else if (capt) {
      const alvo = X.marcasL(m) & X.M_EP ? X.PEAO : X.tipo(pos.t[para]);
      const def = atacantes(pos, para, ele).length;
      porque = `captura ${nomePeca(alvo, para)}` + (!def ? ', que estava sem defesa' : VALOR[alvo] > VALOR[k] ? ` (vale mais que ${ART[k]} ${NOME[k]} que captura)` : '');
    } else if (X.promoL(m)) porque = 'promove o peão';
    else {
      // dá xeque? ameaça algo?
      pos.fazer(m);
      const xeque = pos.emXeque();
      const ameacadas = pecasEmPerigo(pos, ele).filter(x => atacantes(pos, x.casa, eu).indexOf(para) >= 0);
      pos.desfazer();
      if (xeque) porque = 'dá xeque e tira a iniciativa do adversário';
      else if (ameacadas.length) porque = `ameaça ${nomePeca(ameacadas[0].peca, ameacadas[0].casa)}`;
      else if (pos.numero <= 12 && (k === X.CAVALO || k === X.BISPO) && ((eu === X.BRANCO && (de >> 4) === 0) || (eu === X.PRETO && (de >> 4) === 7))) porque = `desenvolve ${ART[k]} ${NOME[k]} (na abertura, tire as peças da primeira fileira)`;
      else if (pos.numero <= 8 && k === X.PEAO && [3, 4].indexOf(para & 7) >= 0) porque = 'ocupa o centro';
    }
    linhas.push(`<b>Jogue ${san}</b>` + (porque ? ` — ${porque}.` : '.'));
    // o que está em perigo agora (antes do seu lance)
    const perigo = pecasEmPerigo(pos, eu);
    if (perigo.length) {
      const x = perigo[0];
      linhas.push(`Atenção: ${nomePeca(x.peca, x.casa)} está atacad${ART[x.peca]} pel${ART[x.tipoAtacante]} ${NOME[x.tipoAtacante]} em ${X.nomeCasa(x.atacante)}${x.defendida ? ' (e vale mais que ele)' : ' e sem defesa'}.`);
    }
    const soltas = pecasEmPerigo(pos, ele).filter(x => !x.defendida || VALOR[x.peca] > VALOR[x.tipoAtacante]);
    if (soltas.length && !(capt && X.paraL(m) === soltas[0].casa)) {
      const x = soltas[0];
      linhas.push(`${nomePeca(x.peca, x.casa)[0].toUpperCase() + nomePeca(x.peca, x.casa).slice(1)} do adversário ${x.defendida ? 'pode ser trocad' + ART[x.peca] + ' com vantagem' : 'está sem defesa'} — mas confira se tomar não deixa algo seu para trás.`);
    }
    // avaliação
    linhas.push(`Avaliação: <b>${textoAvaliacao(an.brancas, an.lado === X.BRANCO ? an.mate : -an.mate)}</b> (${resumoAvaliacao(an.brancas, an.lado === X.BRANCO ? an.mate : -an.mate)}).`);
    if (an.pv.length > 1 && !an.mate) linhas.push(`Sequência provável: ${sanSeq(pos, an.pv, 5)}.`);
    // outras boas
    const outras = an.raiz.slice(1, 4).filter(x => an.valor - x.valor < 60).map(x => { const mm = pos.lanceDe(x.uci); return mm ? pos.san(mm) : null; }).filter(Boolean);
    if (outras.length) linhas.push(`Também boas: ${outras.join(', ')}.`);
    return { linhas, resumo: `Jogue ${san}` + (an.mate > 0 ? ` (mate em ${an.mate})` : ''), san };
  }

  /**
   * Nota do lance jogado (uci), comparando com a análise da vez.
   * Devolve { nota, rotulo, texto, perda (chance), melhorSan, jogadoSan }.
   */
  function avaliar(jogo, an, uci) {
    if (!an || !an.raiz.length) return null;
    const pos = posicaoDe(jogo);
    const jog = an.raiz.find(x => x.uci === uci);
    const mJ = pos.lanceDe(uci), mB = pos.lanceDe(an.melhor);
    if (!jog || !mJ || !mB) return null;
    const perda = Math.max(0, chance(an.raiz[0].valor) - chance(jog.valor));
    const melhorSan = pos.san(mB), jogadoSan = pos.san(mJ);
    let nota, rotulo;
    if (uci === an.melhor || perda <= 0.02) { nota = 'otima'; rotulo = uci === an.melhor ? 'Melhor lance' : 'Ótima'; }
    else if (perda <= 0.06) { nota = 'boa'; rotulo = 'Boa'; }
    else if (perda <= 0.13) { nota = 'imprecisa'; rotulo = 'Imprecisa'; }
    else if (perda <= 0.28) { nota = 'erro'; rotulo = 'Erro'; }
    else { nota = 'grave'; rotulo = 'Erro grave'; }
    const v = x => textoAvaliacao(an.lado === X.BRANCO ? x : -x, 0);
    let texto = nota === 'otima' ? `${jogadoSan}: ${uci === an.melhor ? 'o melhor lance' : 'tão bom quanto o melhor'}.`
      : `${jogadoSan} (${v(jog.valor)}); melhor era ${melhorSan} (${v(an.raiz[0].valor)}).`;
    if (jog.valor <= -X.MATE + 400) texto = `${jogadoSan} deixa um mate. Melhor era ${melhorSan}.`;
    return { nota, rotulo, texto, perda, melhorSan, jogadoSan };
  }

  /** Depois de um erro: o que o adversário faz agora (busca curta a partir da posição nova). */
  async function refutacao(canal, jogo, tempo) {
    const r = await canal.buscar(jogo.fen, jogo.lances, { tempo: tempo || 600 });
    if (!r.lance) return null;
    const pos = posicaoDe(jogo);
    const seq = sanSeq(pos, (r.pv || []).map(m => X.uci(m)), 3);
    const m = r.lance, para = X.paraL(m);
    let ganho = '';
    if (r.mate > 0) ganho = `e dá mate em ${r.mate}`;
    else if (X.marcasL(m) & X.M_CAPT) ganho = `e ganha ${nomePeca(X.tipo(pos.t[para]))}`;
    return { texto: `Agora o adversário tem ${seq || pos.san(m)}${ganho ? ' ' + ganho : ''}.`, valor: r.valor };
  }

  X.Coach = { chance, textoAvaliacao, resumoAvaliacao, atacantes, pecasEmPerigo, analisar, explicar, avaliar, refutacao, posicaoDe, NOME };
})(window.Poker = window.Poker || {});
