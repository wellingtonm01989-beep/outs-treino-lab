/* ==========================================================================
   OUTS · Treino Lab — truco-coach.js
   O coach do truco: transforma a análise (truco-ia.js) em conselho em
   português simples, para quem está aprendendo, e dá a nota de cada decisão.

   Três momentos:
   - a sua vez: qual carta jogar (com a chance de ganhar a mão com cada uma)
     e se vale pedir truco (ou seis, nove, doze) — com a conta do blefe;
   - pediram truco para você: aceitar, correr ou aumentar, comparando a sua
     chance com a chance mínima (a "pot odds" do truco: correr custa 1 ponto,
     aceitar arrisca 3 para ganhar 3 → precisa ganhar 1 vez em 3);
   - mão de 11: jogar valendo 3 ou correr.
   Notas: ótima, boa, imprecisa, erro (as mesmas cores do coach do poker).
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Truco = P.Truco || {};
  const R = T.Regras, IA = T.IA;

  const pct = x => Math.round(x * 100) + '%';
  const pontos = v => v + (v === 1 ? ' ponto' : ' pontos');
  const cartaHtml = c => `<span class="carta-txt n-${c & 3}">${P.Cartas.bonito(c)}</span>`;
  /** "4♣ (Zap)" para manilhas, "3♦" para as outras. */
  function cartaNome(c, vira) {
    return cartaHtml(c) + (R.ehManilha(c, vira) ? ` <small>(${R.nome(c, vira)})</small>` : '');
  }

  // ------------------------------------------------------------ apoio
  /** Situação da rodada em andamento, do ponto de vista de "vista.eu". */
  function mesaAgora(vista) {
    const atuais = vista.jogadas[vista.rodada] || [];
    let nossa = -2, deles = -2;
    atuais.forEach(x => {
      const v = x.coberta ? R.VALOR_COBERTA : R.valor(x.carta, vista.vira);
      if (x.j % 2 === vista.equipe) nossa = Math.max(nossa, v); else deles = Math.max(deles, v);
    });
    const faltam = vista.n - atuais.length - 1;   // quantos jogam depois de mim nesta rodada
    return { atuais, nossa, deles, faltam, primeiro: atuais.length === 0, ultimo: faltam === 0 };
  }

  /** Por que essa carta (uma frase), olhando a mesa. */
  function motivoCarta(vista, an) {
    const melhor = an.cartas[0];
    const mesa = mesaAgora(vista);
    const valores = vista.cartas.map(c => R.valor(c, vista.vira)).sort((a, b) => a - b);
    const menor = valores[0], maior = valores[valores.length - 1];
    const ganhaMesa = melhor.valor > mesa.deles;
    if (!mesa.primeiro && mesa.nossa > mesa.deles && melhor.valor === menor) {
      return mesa.ultimo ? 'Seu parceiro já ganhou esta rodada: jogue a menor e guarde as fortes.'
        : 'Seu parceiro está ganhando a rodada: jogue a menor e guarde as fortes.';
    }
    if (an.cartas.length > 1 && an.cartas.every(x => Math.abs((x.pGanhar - x.pPerder) - (melhor.pGanhar - melhor.pPerder)) < 0.005)) {
      return 'Aqui tanto faz a carta: todas dão o mesmo resultado nas simulações (na dúvida, guarde a mais forte).';
    }
    if (mesa.ultimo && !mesa.primeiro) {
      if (melhor.valor === mesa.deles) return 'Você é o último a jogar: dá para empatar a rodada com essa carta.';
      if (ganhaMesa) {
        const ganhadoras = valores.filter(v => v > mesa.deles);
        if (melhor.valor === ganhadoras[0]) return 'Você é o último a jogar: ganhe a rodada com a menor carta que basta.';
      } else if (melhor.valor === menor) return 'Nenhuma carta sua ganha esta rodada: jogue a mais fraca.';
    }
    if (!mesa.primeiro && !ganhaMesa && melhor.valor === menor) return 'Essa rodada está difícil de ganhar: entregue a mais fraca e guarde as boas.';
    if (mesa.primeiro && vista.rodada === 0) {
      if (melhor.valor === maior && valores.length > 1) return 'Saindo forte, você tenta garantir a 1ª rodada — quem ganha a 1ª leva a mão se a 2ª ou a 3ª empatar.';
      if (melhor.valor === menor) return 'Saindo com a menor, você guarda as fortes para depois que os outros mostrarem as deles.';
    }
    if (!mesa.primeiro && ganhaMesa) return 'Essa carta passa o que o adversário jogou.';
    return 'Nas simulações, é a carta que ganha a mão mais vezes.';
  }

  function linhaChances(an, vira) {
    if (an.cartas.length < 2) return '';
    return an.cartas.map(x => `${cartaNome(x.carta, vira)} ${pct(x.p)}`).join(' · ');
  }

  function linhaSinal(vista) {
    if (vista.sinalParceiro === undefined) return '';     // 1 contra 1, ou mão sem sinais
    const s = vista.sinalParceiro;
    if (s === null) return 'Seu parceiro não tem manilha, 3 nem 2 (pelo sinal).';
    if (R.ehManilha(s, vista.vira)) {
      const nome = R.nome(s, vista.vira);
      return `Seu parceiro tem ${nome === 'Espadilha' ? 'a' : 'o'} ${nome.toLowerCase()} (pelo sinal).`;
    }
    return `Seu parceiro tem ${R.rankDe(s) === 1 ? 'um 3' : 'um 2'} (pelo sinal), sem manilha.`;
  }

  // ------------------------------------------------------- a sua vez
  /**
   * Conselho para a vez de jogar. Devolve { analise, carta, truco, linhas, resumo }.
   * truco: 'pedir' | 'pode' | 'nao' | null (quando não dá para pedir).
   */
  function vez(vista, opts) {
    if (vista.cegas) {
      return { cegas: true, linhas: ['<b>Mão de ferro:</b> 11 a 11, ninguém vê as próprias cartas e não tem truco. É pura sorte: escolha qualquer uma. Quem ganhar a mão ganha a partida.'], resumo: 'Mão de ferro: escolha qualquer carta' };
    }
    const an = IA.analisar(vista, { amostras: (opts && opts.amostras) || 400, perfis: opts && opts.perfis });
    const melhor = an.cartas[0];
    const linhas = [];
    if (an.cartas.length === 1 && vista.cartas.length === 1) {
      linhas.push(`Sua última carta: ${cartaNome(melhor.carta, vista.vira)}. Chance de ganhar a mão: ${pct(melhor.p)}.`);
    } else {
      linhas.push(`<b>Jogue ${cartaNome(melhor.carta, vista.vira)}</b> — com ela você ganha a mão ${pct(melhor.p)} das vezes.`);
      linhas.push(motivoCarta(vista, an));
    }
    const ch = linhaChances(an, vista.vira);
    if (ch) linhas.push('Chance com cada carta: ' + ch);
    if (melhor.coberta && melhor.valor >= R.FORCA_RANK[11] && (melhor.pGanhar - melhor.pPerder) - (melhor.coberta.pGanhar - melhor.coberta.pPerder) < 0.005) {
      linhas.push(`Dá para jogar ${cartaHtml(melhor.carta)} <b>coberta</b>: o resultado é o mesmo e os outros não ficam sabendo que você tinha essa carta.`);
    }
    const sinal = linhaSinal(vista);
    if (sinal) linhas.push(sinal);

    let truco = null, linhaTruco = '';
    if (vista.podeTrucar && an.truco) {
      const nivel = vista.nivel + 1, nomeP = R.NOMES_PEDIDO[nivel].toLowerCase();
      const t = an.truco, p = an.p;
      const conta = `Se pedir: eles correm ~${pct(t.correm)} das vezes (vocês levam ${pontos(t.vale)}); quando aceitam, você ganha ${pct(t.pAceito)} valendo ${t.novo}.`;
      // pedir com a mão na frente quando a conta fecha; blefe só aparece como informação (contra estes bots ele rende pouco)
      if (p >= 0.5 && t.ganho > 0.05) {
        truco = 'pedir';
        linhaTruco = `<b>Peça ${nomeP}!</b> ${conta}`;
      } else if (p >= 0.5 && t.ganho >= -0.05) {
        truco = 'pode';
        linhaTruco = `Pedir ${nomeP} agora dá quase no mesmo que não pedir. ${conta}`;
      } else if (p >= 0.5) {
        truco = 'nao';
        linhaTruco = `Não peça ${nomeP} agora: eles só aceitariam quando estão na frente. ${conta}`;
      } else {
        truco = 'nao';
        linhaTruco = t.ganho > 0.05
          ? `Pedir ${nomeP} seria blefe (chance ${pct(p)}): a conta até fecha, mas é arriscado — se lerem o blefe, a mão vale ${t.novo}. ${conta}`
          : p < 0.2 ? `Não peça ${nomeP} agora (chance ${pct(p)}).` : `Não peça ${nomeP} agora (chance ${pct(p)}). ${conta}`;
      }
      if (p >= 0.2 || t.ganho > 0.05) linhaTruco += ` Saldo de pedir: ${t.ganho >= 0 ? '+' : ''}${t.ganho.toFixed(2).replace('.', ',')} ponto por mão.`;
      linhas.push(linhaTruco);
    }
    const unica = vista.cartas.length === 1;
    const resumo = (unica ? `Última carta (${pct(melhor.p)})` : `Jogue ${cartaHtml(melhor.carta)} (${pct(melhor.p)})`) + (truco === 'pedir' ? ` · peça ${R.NOMES_PEDIDO[vista.nivel + 1].toLowerCase()}` : '');
    return { tipo: 'vez', analise: an, vira: vista.vira, nivelPedido: vista.nivel + 1, carta: melhor.carta, truco, linhas, resumo, p: an.p };
  }

  // ------------------------------------------------- pediram truco
  function resposta(vista, nivel, opts) {
    const an = IA.analisar(vista, { amostras: (opts && opts.amostras) || 400, perfis: opts && opts.perfis });
    const p = an.p;
    const vale = R.VALORES[nivel - 1], novo = R.VALORES[nivel];
    const min = R.minimoParaAceitar(vale, novo, vista.nos, vista.eles);
    const simples = R.minimoParaAceitar(vale, novo);
    let rec;
    if (nivel < 4 && p >= 0.72) rec = 'aumentar';
    else if (p >= min) rec = 'aceitar';
    else rec = 'correr';
    const linhas = [];
    const prox = nivel < 4 ? R.NOMES_PEDIDO[nivel + 1].toLowerCase() : null;
    linhas.push(rec === 'aumentar' ? `<b>Peça ${prox}!</b> Sua chance de ganhar a mão é ${pct(p)}.`
      : rec === 'aceitar' ? `<b>Aceite.</b> Sua chance de ganhar a mão é ${pct(p)} e você precisa de ${pct(min)}.`
        : `<b>Corra.</b> Sua chance de ganhar a mão é ${pct(p)} e você precisaria de ${pct(min)}.`);
    linhas.push(`Correr: eles ganham ${pontos(vale)}. Aceitar: a mão passa a valer ${novo}. Você arrisca ${novo} para não entregar ${vale}: precisa ganhar (${novo} − ${vale}) ÷ (2 × ${novo}) = ${pct(simples)} das vezes.`);
    if (Math.abs(min - simples) >= 0.03) {
      let porque;
      if (vista.eles + novo >= R.PONTOS_PARTIDA) porque = `se perder valendo ${novo}, eles ganham a partida`;
      else if (vista.nos + novo >= R.PONTOS_PARTIDA) porque = `se ganhar valendo ${novo}, vocês fecham a partida`;
      else if (vista.nos > vista.eles) porque = `vocês estão na frente: perder ${novo} de uma vez atrapalha mais do que ganhar ${novo} ajuda`;
      else if (vista.nos < vista.eles) porque = `vocês estão atrás: ganhar ${novo} de uma vez ajuda mais do que perder atrapalha`;
      else porque = 'cada ponto pesa diferente conforme o placar';
      linhas.push(`Com o placar ${vista.nos} a ${vista.eles} a conta muda (${porque}): o mínimo vira ${pct(min)}.`);
    }
    linhas.push('Quem pede truco costuma ter mão boa — a sua chance já leva isso em conta.');
    if (rec === 'aumentar') linhas.push(`Aumentando, você aceita os ${novo} e pede ${R.VALORES[nivel + 1]}: se correrem, vocês levam ${novo}.`);
    const sinal = linhaSinal(vista);
    if (sinal) linhas.push(sinal);
    const resumo = (rec === 'aumentar' ? `Peça ${prox}` : rec === 'aceitar' ? 'Aceite' : 'Corra') + ` (${pct(p)}; precisa de ${pct(min)})`;
    return { tipo: 'resposta', analise: an, nivel, p, min, recomendacao: rec, linhas, resumo };
  }

  // --------------------------------------------------------- mão de 11
  function onze(vista, opts) {
    const an = IA.analisar(vista, { amostras: (opts && opts.amostras) || 400, perfis: opts && opts.perfis });
    const p = an.p;
    const jogar = p * R.chancePartida(vista.nos + 3, vista.eles) + (1 - p) * R.chancePartida(vista.nos, vista.eles + 3);
    const correr = R.chancePartida(vista.nos, vista.eles + 1);
    const rec = jogar >= correr ? 'jogar' : 'correr';
    const linhas = [
      rec === 'jogar' ? `<b>Jogue a mão de 11.</b>` : `<b>Corra da mão de 11.</b>`,
      `Jogando, a mão vale 3; correndo, eles ganham 1 ponto. Sua chance de ganhar a mão: ${pct(p)}.`,
      `Chance de ganhar a partida: jogando ${pct(jogar)}, correndo ${pct(correr)}.`
    ];
    if (vista.cartasParceiro) linhas.push('Na mão de 11 você vê as cartas do seu parceiro — elas já entraram na conta.');
    const resumo = (rec === 'jogar' ? '<b>Jogue</b> a mão de 11' : '<b>Corra</b> da mão de 11') + ` · chance de ganhar a partida: jogando ${pct(jogar)}, correndo ${pct(correr)}`;
    return { tipo: 'onze', analise: an, p, jogar, correr, recomendacao: rec, linhas, resumo };
  }

  // ------------------------------------------------------------- notas
  const ROTULOS = { otima: 'Ótima', boa: 'Boa', imprecisa: 'Imprecisa', erro: 'Erro', blefe: 'Blefe' };

  /**
   * Nota da sua decisão. conselho: o que vez/resposta/onze devolveu naquele
   * momento; acao: { tipo: 'carta', carta, coberta } | { tipo: 'truco' } | 'aceitar' | 'correr' | 'aumentar' | 'jogar'.
   * Devolve { nota, rotulo, texto, perda } (perda: quanto a decisão custou, em chance).
   */
  function avaliar(conselho, acao) {
    if (!conselho || conselho.cegas) return null;
    let nota, texto, perda = 0;
    if (conselho.tipo === 'vez' && acao && acao.tipo === 'truco') {
      const p = conselho.p, t = conselho.analise && conselho.analise.truco;
      const g = t ? t.ganho : (p - 0.5);
      const saldo = t ? ` (saldo ${g >= 0 ? '+' : ''}${g.toFixed(2).replace('.', ',')} ponto)` : '';
      perda = Math.max(0, -g);
      if (g >= 0.05 && p < 0.5) { nota = 'blefe'; texto = `Blefe que compensa: com ${pct(p)} de chance, eles correm ~${pct(t.correm)} das vezes${saldo}.`; }
      else if (g >= 0.05) { nota = 'otima'; texto = `Pedido certo: ${pct(p)} de chance${saldo}.`; }
      else if (g >= -0.05) { nota = 'boa'; texto = `Pedido no limite: dá quase no mesmo que não pedir${saldo}.`; }
      else if (g >= -0.2) { nota = 'imprecisa'; texto = `Pedido caro: eles aceitam quando estão na frente${saldo}.`; }
      else { nota = 'erro'; texto = `Pedido ruim: ${pct(p)} de chance e eles só aceitam ganhando${saldo}.`; }
    } else if (conselho.tipo === 'vez' && acao && acao.tipo === 'carta') {
      const an = conselho.analise;
      const achada = an.cartas.find(x => x.valor === R.valor(acao.carta, conselho.vira));
      const melhor = an.cartas[0];
      if (!achada) return null;
      // carta coberta: vale menos que qualquer outra; só não custa nada se ela não mudava a rodada
      const esc = acao.coberta && achada.coberta ? achada.coberta : achada;
      perda = (melhor.pGanhar - melhor.pPerder) - (esc.pGanhar - esc.pPerder);
      if (acao.coberta) texto = perda <= 0.02 ? 'Cobrir aqui não custou nada e escondeu a carta.' : 'Coberta, a carta perde para qualquer outra.';
      if (perda <= 0.02) { nota = 'otima'; texto = (texto ? texto + ' ' : '') + 'Melhor carta para a situação.'; }
      else if (perda <= 0.06) { nota = 'boa'; texto = (texto ? texto + ' ' : '') + `Quase igual à melhor (${cartaHtml(melhor.carta)} ganhava ${pct(melhor.p)}).`; }
      else if (perda <= 0.15) { nota = 'imprecisa'; texto = (texto ? texto + ' ' : '') + `${cartaHtml(melhor.carta)} era melhor: ${pct(melhor.p)} contra ${pct(esc.p)}.`; }
      else { nota = 'erro'; texto = (texto ? texto + ' ' : '') + `Essa carta derrubou sua chance: ${pct(esc.p)}, contra ${pct(melhor.p)} com ${cartaHtml(melhor.carta)}.`; }
    } else if (conselho.tipo === 'resposta') {
      const { p, min } = conselho;
      const d = p - min;
      if (acao === 'aceitar') {
        if (d >= 0.03) { nota = 'otima'; texto = `Aceite certo: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else if (d >= -0.03) { nota = 'boa'; texto = `Decisão no limite: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else if (d >= -0.1) { nota = 'imprecisa'; texto = `Aceite um pouco caro: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else { nota = 'erro'; texto = `Aceite caro demais: ${pct(p)} de chance, precisava de ${pct(min)}. Correr era melhor.`; }
        perda = Math.max(0, -d);
      } else if (acao === 'correr') {
        if (d <= -0.03) { nota = 'otima'; texto = `Correu certo: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else if (d <= 0.03) { nota = 'boa'; texto = `Decisão no limite: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else if (d <= 0.1) { nota = 'imprecisa'; texto = `Dava para aceitar: ${pct(p)} de chance, precisava de ${pct(min)}.`; }
        else { nota = 'erro'; texto = `Correu com mão boa: ${pct(p)} de chance, só precisava de ${pct(min)}.`; }
        perda = Math.max(0, d);
      } else if (acao === 'aumentar') {
        if (p >= 0.7) { nota = 'otima'; texto = `Aumento certo: ${pct(p)} de chance.`; }
        else if (p >= 0.55) { nota = 'boa'; texto = `Aumento razoável: ${pct(p)} de chance.`; }
        else if (p >= min) { nota = 'blefe'; texto = `Aumento arriscado (${pct(p)}): bom só se eles correrem muito.`; }
        else { nota = 'erro'; texto = `Aumentou com ${pct(p)} de chance — nem para aceitar dava (precisava de ${pct(min)}).`; perda = min - p; }
      }
    } else if (conselho.tipo === 'onze') {
      const { jogar, correr } = conselho;
      const escolhido = acao === 'jogar' ? jogar : correr, melhor = Math.max(jogar, correr);
      perda = melhor - escolhido;
      if (perda <= 0.005) { nota = 'otima'; texto = `Decisão certa: ${pct(escolhido)} de chance de ganhar a partida.`; }
      else if (perda <= 0.02) { nota = 'boa'; texto = `Quase igual: ${pct(escolhido)} contra ${pct(melhor)}.`; }
      else if (perda <= 0.05) { nota = 'imprecisa'; texto = `A outra opção era melhor: ${pct(melhor)} contra ${pct(escolhido)}.`; }
      else { nota = 'erro'; texto = `Decisão cara: ${pct(escolhido)} de chance de ganhar a partida, contra ${pct(melhor)}.`; }
    }
    if (!nota) return null;
    return { nota, rotulo: ROTULOS[nota], texto, perda };
  }

  // -------------------------------------------------------------- sinais
  // Os sinais desta mesa (combinados entre parceiros; cada região tem os seus)
  const SINAIS = {
    zap: { rosto: '😉', gesto: 'piscou' },
    copas: { rosto: '🤨', gesto: 'levantou a sobrancelha' },
    espadilha: { rosto: '😏', gesto: 'entortou a boca' },
    picafumo: { rosto: '😛', gesto: 'mostrou a língua' },
    tres: { rosto: '😬', gesto: 'mordeu o lábio' },
    dois: { rosto: '😗', gesto: 'fez biquinho' },
    nada: { rosto: '😐', gesto: 'ficou sério' }
  };
  /** Qual sinal corresponde a uma carta (ou null = "nada"). */
  function sinalDaCarta(c, vira) {
    if (c === null || c === undefined) return Object.assign({ chave: 'nada', significa: 'sem manilha, 3 ou 2' }, SINAIS.nada);
    if (R.ehManilha(c, vira)) {
      const ch = ['espadilha', 'copas', 'picafumo', 'zap'][c & 3];
      return Object.assign({ chave: ch, significa: R.nome(c, vira) }, SINAIS[ch]);
    }
    const ch = R.rankDe(c) === 1 ? 'tres' : 'dois';
    return Object.assign({ chave: ch, significa: ch === 'tres' ? 'um 3' : 'um 2' }, SINAIS[ch]);
  }

  T.Coach = { vez, resposta, onze, avaliar, mesaAgora, sinalDaCarta, SINAIS, ROTULOS, cartaHtml, cartaNome, pct };
})(window.Poker = window.Poker || {});
