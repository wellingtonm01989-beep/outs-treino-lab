/* ==========================================================================
   OUTS · Treino Lab — damas-coach.js
   Coach das damas. Na sua vez, analisa a posição (a mesma busca dos bots,
   avaliando todos os seus lances) e explica: o melhor lance e por quê
   (captura obrigatória e lei da maioria, golpe — entregar pedra para comer
   mais —, ameaça, virar dama), o que o adversário ameaça comer, a avaliação
   em pedras. Depois do seu lance, a nota: compara a chance de vencer antes
   e depois.
   ========================================================================== */
(function (P) {
  'use strict';

  const D = P.Damas;

  /** Chance de vencer (0..1) pela avaliação (100 = uma pedra) de quem joga. */
  function chance(v) {
    if (v >= D.MATE - 500) return 1;
    if (v <= -D.MATE + 500) return 0;
    return 1 / (1 + Math.exp(-0.009 * v));
  }
  /** Avaliação em pedras, do ponto de vista das brancas: "+1,2", "−0,3", "V5" (vitória em 5 lances). */
  function textoAvaliacao(vBrancas) {
    if (Math.abs(vBrancas) >= D.MATE - 500) { const n = Math.ceil((D.MATE - Math.abs(vBrancas)) / 2); return (vBrancas > 0 ? '+' : '−') + 'V' + n; }
    const v = vBrancas / 100;
    return (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
  }
  function resumoAvaliacao(vBrancas) {
    const quem = vBrancas > 0 ? 'as brancas' : 'as pretas';
    if (Math.abs(vBrancas) >= D.MATE - 500) return `${quem} ganham à força`;
    const a = Math.abs(vBrancas);
    if (a < 30) return 'posição equilibrada';
    if (a < 80) return `${quem} um pouco melhor`;
    if (a < 180) return `vantagem d${quem} (mais ou menos uma pedra)`;
    if (a < 400) return `vantagem clara d${quem}`;
    return `${quem} estão ganhando`;
  }
  const nomeLado = cor => (cor === D.BRANCO ? 'as brancas' : 'as pretas');
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

  /** A posição depois dos lances (desde o início); aceita também uma posição pronta. */
  function posicaoDe(lances) {
    if (lances instanceof D.Posicao) return lances.clone();
    const pos = new D.Posicao();
    (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
    return pos;
  }
  /** O que o lado "cor" poderia comer agora, se fosse a vez dele: { pecas (casas), lance }. */
  function ameacas(pos, cor) {
    const p = pos.clone();
    p.lado = cor;
    const cap = p.capturas();
    if (!cap.length) return null;
    const m = cap[0];
    return { n: m.capt.length, casas: m.capt, lance: D.texto(m), opcoes: cap.length };
  }
  /** Material de cada lado (pedra 1, dama ~3) para contar quanto uma sequência ganha. */
  function material(pos, cor) {
    let n = 0;
    for (let s = 0; s < 64; s++) { const v = pos.t[s]; if (v * cor > 0) n += Math.abs(v) === 2 ? 3 : 1; }
    return n;
  }

  /** Análise para a sua vez: busca avaliando todos os lances. */
  async function analisar(canal, lances, tempo) {
    const r = await canal.buscar(lances, { tempo: tempo || 1400 });
    const pos = posicaoDe(lances);
    return { melhor: r.lance, valor: r.valor, profundidade: r.profundidade, raiz: r.raiz || [], pv: r.pv || [], brancas: pos.lado === D.BRANCO ? r.valor : -r.valor, lado: pos.lado, unico: !!r.unico };
  }

  /** O conselho em linhas de texto (HTML), a partir da análise. */
  function explicar(lances, an) {
    const pos = posicaoDe(lances);
    const eu = pos.lado, ele = -eu;
    const linhas = [];
    if (!an || !an.melhor) return { linhas: ['Sem lances: a partida acabou.'], resumo: '' };
    const m = pos.lanceDe(an.melhor);
    if (!m) return { linhas: [], resumo: '' };
    const legais = pos.legais();
    let porque = '';
    if (m.capt.length) {
      const varias = legais.length > 1;
      porque = `<b>captura obrigatória</b>: come ${plural(m.capt.length, 'peça', 'peças')}` +
        (m.capt.length > 1 ? ' (pela lei da maioria, só valem as capturas que comem o máximo)' : '') +
        (varias ? `; das ${legais.length} capturas permitidas, esta é a que deixa você melhor` : '') + (m.promove ? ' — e vira dama' : '');
    } else {
      // golpe: entrego, ele é obrigado a comer, e eu como mais (material: pedra 1, dama 3)
      const antes = material(pos, eu) - material(pos, ele);
      const p2 = pos.clone();
      let ok = true;
      for (const u of an.pv.slice(0, 4)) { const mm = p2.lanceDe(u); if (!mm) { ok = false; break; } p2.fazer(mm); }
      const depois = ok ? material(p2, eu) - material(p2, ele) : antes;
      pos.fazer(m);
      const eleCome = pos.capturas().length > 0;
      const minhaAmeaca = ameacas(pos, eu);
      pos.desfazer();
      const ganha = an.valor >= D.MATE - 500;
      const dama = m.promove ? ' (e a pedra vira dama)' : '';
      if (eleCome && (depois > antes || ganha)) porque = `<b>golpe</b>${dama}: você entrega peça, o adversário é obrigado a comer e, em seguida, você come mais` + (ganha ? ' — e a partida está ganha' : ` (ganha ${plural(depois - antes, 'pedra', 'pedras')} na sequência)`);
      else if (m.promove) porque = 'a pedra chega à última fila e <b>vira dama</b>';
      else if (eleCome) porque = 'troca de pedras (o adversário é obrigado a comer e você come de volta)';
      else if (minhaAmeaca) porque = `ameaça comer ${plural(minhaAmeaca.n, 'peça', 'peças')} no próximo lance`;
      else porque = 'lance seguro: não deixa pedra para ser comida';
    }
    linhas.push(`<b>Jogue ${an.melhor}</b> — ${porque}.`);
    // o que o adversário ameaça agora
    const am = ameacas(pos, ele);
    if (am && !m.capt.length) linhas.push(`Atenção: o adversário ameaça comer ${plural(am.n, 'peça sua', 'peças suas')} (${am.lance}). Proteja, tire de lá ou arme um contragolpe.`);
    linhas.push(`Avaliação: <b>${textoAvaliacao(an.brancas)}</b> (${resumoAvaliacao(an.brancas)}).`);
    if (an.pv.length > 1) linhas.push(`Sequência provável: ${an.pv.slice(0, 5).join(' ')}.`);
    const outras = an.raiz.slice(1, 4).filter(x => an.valor - x.valor < 40).map(x => x.lance);
    if (outras.length) linhas.push(`Também boas: ${outras.join(', ')}.`);
    return { linhas, resumo: `Jogue ${an.melhor}` + (m.capt.length ? ` (come ${m.capt.length})` : m.promove ? ' (vira dama)' : ''), lance: an.melhor };
  }

  /** Nota do lance jogado, comparando com a análise da vez. */
  function avaliar(lances, an, lance) {
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
    const v = x => textoAvaliacao(an.lado === D.BRANCO ? x : -x);
    let texto = nota === 'otima' ? `${lance}: ${lance === an.melhor ? 'o melhor lance' : 'tão bom quanto o melhor'}.`
      : `${lance} (${v(jog.valor)}); melhor era ${an.melhor} (${v(an.raiz[0].valor)}).`;
    if (jog.valor <= -D.MATE + 500) texto = `${lance} perde à força. Melhor era ${an.melhor}.`;
    return { nota, rotulo, texto, perda };
  }

  /** Depois de um erro: o que o adversário faz agora. */
  async function refutacao(canal, lances, tempo) {
    const r = await canal.buscar(lances, { tempo: tempo || 600 });
    if (!r.lance) return null;
    const pos = posicaoDe(lances);
    const m = pos.lanceDe(r.lance);
    const antes = material(pos, pos.lado);
    const p2 = pos.clone();
    (r.pv || []).slice(0, 3).forEach(u => { const mm = p2.lanceDe(u); if (mm) p2.fazer(mm); });
    const ganho = (material(pos, -pos.lado) - material(p2, -pos.lado)) - (antes - material(p2, pos.lado));
    let txt = `Agora o adversário tem ${(r.pv || []).slice(0, 3).join(' ') || r.lance}`;
    if (m && m.capt.length) txt += ` e come ${plural(m.capt.length, 'peça', 'peças')}`;
    else if (ganho > 0) txt += ` e ganha ${plural(ganho, 'pedra', 'pedras')}`;
    return { texto: txt + '.', valor: r.valor };
  }

  D.Coach = { chance, textoAvaliacao, resumoAvaliacao, ameacas, analisar, explicar, avaliar, refutacao, posicaoDe, nomeLado };
})(window.Poker = window.Poker || {});
