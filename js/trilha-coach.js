/* ==========================================================================
   OUTS · Treino Lab — trilha-coach.js
   Coach da trilha. Na sua vez, analisa a posição (a mesma busca dos bots,
   avaliando todos os seus lances) e explica: o melhor lance e por quê
   (fechar trilha e qual peça tirar, tapar a trilha do adversário, armar
   duas trilhas de uma vez, abrir a trilha para fechar de novo), as trilhas
   que o adversário ameaça fechar e a avaliação em peças. Depois do seu
   lance, a nota: compara a chance de vencer antes e depois.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Trilha;
  const PECA = 120;   // uma peça na avaliação

  function chance(v) {
    if (v >= T.MATE - 500) return 1;
    if (v <= -T.MATE + 500) return 0;
    return 1 / (1 + Math.exp(-0.008 * v));
  }
  /** Avaliação em peças, do ponto de vista das brancas: "+1,2", "−0,3", "V5" (vitória em 5 lances). */
  function textoAvaliacao(vBrancas) {
    if (Math.abs(vBrancas) >= T.MATE - 500) { const n = Math.ceil((T.MATE - Math.abs(vBrancas)) / 2); return (vBrancas > 0 ? '+' : '−') + 'V' + n; }
    const v = vBrancas / PECA;
    return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
  }
  function resumoAvaliacao(vBrancas) {
    const quem = vBrancas > 0 ? 'as brancas' : 'as pretas';
    if (Math.abs(vBrancas) >= T.MATE - 500) return `${quem} ganham à força`;
    const a = Math.abs(vBrancas);
    if (a < 35) return 'posição equilibrada';
    if (a < 90) return `${quem} um pouco melhor`;
    if (a < 200) return `vantagem d${quem} (mais ou menos uma peça)`;
    if (a < 420) return `vantagem clara d${quem}`;
    return `${quem} estão ganhando`;
  }
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const nome = s => T.nomeCasa(s);
  const listaCasas = l => l.map(nome).join(', ').replace(/, ([^,]*)$/, ' e $1');

  /** A posição depois dos lances (desde o início, com as regras da partida); aceita também uma posição pronta. */
  function posicaoDe(lances, opcoes) {
    if (lances instanceof T.Posicao) return lances.clone();
    const pos = new T.Posicao(null, T.BRANCO, null, opcoes);
    (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
    return pos;
  }
  /** As casas onde "cor" fecharia trilha se jogasse agora. */
  function ameacas(pos, cor) {
    const p = pos.clone();
    p.lado = cor;
    const casas = new Set();
    p.legais().forEach(m => { if (m.fecha) casas.add(m.para); });
    return Array.from(casas);
  }

  async function analisar(canal, lances, tempo) {
    const r = await canal.buscar(lances, { tempo: tempo || 1400 });
    return { melhor: r.lance, valor: r.valor, profundidade: r.profundidade, raiz: r.raiz || [], pv: r.pv || [], unico: !!r.unico };
  }
  /** Completa a análise com o lado e a avaliação das brancas (precisa da posição). */
  function completar(an, pos) {
    an.lado = pos.lado;
    an.brancas = pos.lado === T.BRANCO ? an.valor : -an.valor;
    return an;
  }

  /** O conselho em linhas de texto (HTML), a partir da análise. */
  function explicar(lances, an, opcoes) {
    const pos = posicaoDe(lances, opcoes);
    if (!an || !an.melhor) return { linhas: ['Sem lances: a partida acabou.'], resumo: '' };
    completar(an, pos);
    const m = pos.lanceDe(an.melhor);
    if (!m) return { linhas: [], resumo: '' };
    const eu = pos.lado, ele = -eu;
    const dele = ameacas(pos, ele);
    pos.fazer(m);
    const minhas = ameacas(pos, eu), deleDepois = ameacas(pos, ele);
    pos.desfazer();
    const linhas = [];
    let porque;
    const onde = m.de >= 0 ? `${nome(m.de)} para ${nome(m.para)}` : `em ${nome(m.para)}`;
    if (m.tira >= 0) {
      // por que tirar essa peça
      const p2 = pos.clone();
      p2.t[m.tira] = 0;
      const sem = ameacas(p2, ele);
      const tirada = nome(m.tira);
      let motivo = '';
      if (dele.length && sem.length < dele.length) motivo = ` — era a peça que ia fechar trilha`;
      else if (minhas.length >= 1) motivo = ' — e você continua ameaçando outra trilha';
      porque = `<b>fecha trilha</b> e tira a peça de ${tirada}${motivo}`;
    } else if (dele.indexOf(m.para) >= 0) porque = `<b>tapa a trilha</b> do adversário em ${nome(m.para)}`;
    else if (minhas.length >= 2) porque = `<b>arma duas trilhas</b> de uma vez (${listaCasas(minhas)}): o adversário só consegue tapar uma`;
    else if (m.de >= 0 && T.emTrilha(pos.t, m.de, eu) && minhas.indexOf(m.de) >= 0) porque = `<b>abre a trilha</b>: no próximo lance ela fecha de novo em ${nome(m.de)}`;
    else if (minhas.length === 1) porque = `ameaça fechar trilha em ${nome(minhas[0])}`;
    else if (pos.fase(eu) === 'colocar') porque = 'boa casa: deixa as suas peças com caminho livre e não dá trilha ao adversário';
    else porque = 'lance seguro: não abre trilha para o adversário';
    linhas.push(`<b>Jogue ${an.melhor}</b> (${onde}) — ${porque}.`);
    if (deleDepois.length) linhas.push(`Atenção: mesmo assim o adversário pode fechar trilha em ${listaCasas(deleDepois)}` + (deleDepois.length > 1 ? ' (são duas: não dá para tapar todas)' : '') + '.');
    linhas.push(`Avaliação: <b>${textoAvaliacao(an.brancas)}</b> (${resumoAvaliacao(an.brancas)}).`);
    if (an.pv.length > 1) linhas.push(`Sequência provável: ${an.pv.slice(0, 5).join(' ')}.`);
    const outras = an.raiz.slice(1, 4).filter(x => an.valor - x.valor < 30).map(x => x.lance);
    if (outras.length) linhas.push(`Também boas: ${outras.join(', ')}.`);
    return { linhas, resumo: `Jogue ${an.melhor}` + (m.tira >= 0 ? ' (fecha trilha)' : dele.indexOf(m.para) >= 0 ? ' (tapa a trilha)' : minhas.length >= 2 ? ' (duas trilhas)' : ''), lance: an.melhor };
  }

  /** Nota do lance jogado, comparando com a análise da vez. */
  function avaliar(an, lance) {
    if (!an || !an.raiz.length || an.unico) return null;
    const jog = an.raiz.find(x => x.lance === lance);
    if (!jog) return null;
    const perda = Math.max(0, chance(an.raiz[0].valor) - chance(jog.valor));
    let nota, rotulo;
    if (lance === an.melhor || perda <= 0.02) { nota = 'otima'; rotulo = lance === an.melhor ? 'Melhor lance' : 'Ótima'; }
    else if (perda <= 0.06) { nota = 'boa'; rotulo = 'Boa'; }
    else if (perda <= 0.13) { nota = 'imprecisa'; rotulo = 'Imprecisa'; }
    else if (perda <= 0.28) { nota = 'erro'; rotulo = 'Erro'; }
    else { nota = 'grave'; rotulo = 'Erro grave'; }
    const v = x => textoAvaliacao(an.lado === T.BRANCO ? x : -x);
    let texto = nota === 'otima' ? `${lance}: ${lance === an.melhor ? 'o melhor lance' : 'tão bom quanto o melhor'}.`
      : `${lance} (${v(jog.valor)}); melhor era ${an.melhor} (${v(an.raiz[0].valor)}).`;
    if (jog.valor <= -T.MATE + 500) texto = `${lance} perde à força. Melhor era ${an.melhor}.`;
    return { nota, rotulo, texto, perda };
  }

  /** Depois de um erro: o que o adversário faz agora. */
  async function refutacao(canal, lances, opcoes, tempo) {
    const r = await canal.buscar(lances, { tempo: tempo || 600 });
    if (!r.lance) return null;
    const pos = posicaoDe(lances, opcoes);
    const m = pos.lanceDe(r.lance);
    let txt = `Agora o adversário tem ${(r.pv || []).slice(0, 3).join(' ') || r.lance}`;
    if (m && m.tira >= 0) txt += ` e fecha trilha (tira a sua peça de ${nome(m.tira)})`;
    else if (m) { pos.fazer(m); const am = ameacas(pos, pos.lado * -1); if (am.length >= 2) txt += ` e arma duas trilhas (${listaCasas(am)})`; }
    return { texto: txt + '.', valor: r.valor };
  }

  T.Coach = { chance, textoAvaliacao, resumoAvaliacao, ameacas, analisar, completar, explicar, avaliar, refutacao, posicaoDe, PECA };
})(window.Poker = window.Poker || {});
