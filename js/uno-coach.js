/* ==========================================================================
   OUTS · Treino Lab — uno-coach.js
   Coach do "Última!": para cada decisão sua mostra a chance de ganhar a mão
   com cada jogada (a mesma simulação dos bots, com mais sorteios), recomenda
   a melhor e explica o porquê em português simples: quem está perto de sair,
   qual cor os outros parecem não ter, quando guardar o coringa, quando vale
   desafiar o +4. Depois da sua jogada, dá a nota.
   ========================================================================== */
(function (P) {
  'use strict';

  const U = P.Uno, R = U.Regras, IA = U.IA;
  const C = R.CARTAS;
  const pct = x => Math.round(x * 100) + '%';
  const NOME_COR_MIN = ['vermelho', 'amarelo', 'verde', 'azul'];

  /** Mini carta em HTML para os textos do coach. */
  function cartaHtml(id) {
    const c = C[id];
    const cor = c.coringa ? 'coringa' : R.CORES[c.cor];
    return `<span class="un-mini ${cor}">${R.simbolo(id)}</span>`;
  }
  function corHtml(cor) { return `<span class="un-cor-txt ${R.CORES[cor]}">${NOME_COR_MIN[cor]}</span>`; }
  const junta = o => !!(o && o.cartas && o.cartas.length > 1);
  function descreve(o) {
    if (junta(o)) return o.cartas.map(cartaHtml).join('');
    if (o.tipo === 'carta') return cartaHtml(o.carta) + (C[o.carta].coringa ? ' → ' + corHtml(o.cor) : '');
    return { comprar: 'comprar', passar: 'passar (guardar a comprada)', desafiar: 'desafiar o +4' }[o.tipo];
  }
  function rotulo(o) {
    if (junta(o)) return 'Jogue juntas ' + o.cartas.map(id => R.nome(id)).join(' + ');
    if (o.tipo === 'carta') return 'Jogue ' + R.nome(o.carta) + (C[o.carta].coringa ? ' (' + NOME_COR_MIN[o.cor] + ')' : '');
    return { comprar: 'Compre', passar: 'Passe', desafiar: 'Desafie' }[o.tipo];
  }

  /**
   * Conselho para a decisão em aberto (sua vez, depois de comprar, ou ao
   * receber +2/+4). opts: { amostras, modelos, nomes (de cada lugar) }.
   * Devolve { opcoes, melhor, linhas, resumo, p, blefe? }.
   */
  function conselho(vista, opts) {
    opts = opts || {};
    const nomes = opts.nomes || vista.nCartas.map((_, j) => 'Lugar ' + (j + 1));
    const av = IA.avaliar(vista, { amostras: opts.amostras || 160, modelos: opts.modelos });
    const melhor = av[0];
    const linhas = [];
    const alvo = R.proximo(vista.eu, vista.sentido, vista.n);
    const nAlvo = vista.nCartas[alvo];
    const inf = IA.inferir(vista);
    let blefe = null;

    if (melhor.unica) {
      const o = melhor;
      linhas.push(o.tipo === 'comprar' && vista.pendente
        ? `Sem como responder: compre ${vista.pendente.qtd} cartas.`
        : o.tipo === 'comprar' && vista.fase === 'depoisDeComprar' ? 'A carta que você comprou não serve: na regra de comprar até poder jogar, compre outra.'
          : o.tipo === 'comprar' ? 'Nenhuma carta sua serve: compre uma.'
            : o.tipo === 'passar' ? 'A carta que você comprou não serve: passe a vez.' : `Só há uma jogada: ${descreve(o)}.`);
      return { opcoes: av, melhor, linhas, resumo: linhas[0], p: null, tipo: vista.fase };
    }
    linhas.push(`<b>${rotulo(melhor)}</b> — você ganha a mão ${pct(melhor.p)} das vezes com ela.`);

    // por quê
    if (vista.podeDesafiar) {
      blefe = IA.chanceBlefe(vista, { amostras: 240, modelos: opts.modelos });
      const quem = nomes[vista.pendente.de];
      linhas.push(`${quem} jogou +4 com a mesa em ${corHtml(vista.pendente.corAntes)}. Chance de ter sido blefe (ele tinha ${NOME_COR_MIN[vista.pendente.corAntes]}): <b>${pct(blefe.pBlefe)}</b>. Desafiar compensa a partir de uns 20%: se era blefe, ele compra 4 e você joga; se não era, você compra 6.`);
    } else if (vista.pendente) {
      linhas.push(`Pediram para você comprar ${vista.pendente.qtd}. Na regra de acumular, dá para passar adiante com outro ${vista.pendente.tipo === 'mais2' ? '+2 ou +4' : '+4'}.`);
    }
    if (junta(melhor)) {
      const ult = C[melhor.cartas[melhor.cartas.length - 1]];
      linhas.push(`Jogue os ${melhor.cartas.length} ${C[melhor.carta].num} juntos: você se livra de ${melhor.cartas.length} cartas numa vez só, e a última (${corHtml(ult.cor)}) fica por cima — escolha terminar na cor de que você tem mais cartas.`);
    }
    if (melhor.tipo === 'carta') {
      const c = C[melhor.carta];
      if ((c.tipo === 'mais2' || c.tipo === 'pular' || c.tipo === 'mais4' || (c.tipo === 'inverter' && vista.n === 2)) && nAlvo <= 3) {
        linhas.push(`${nomes[alvo]} (o próximo) tem só ${nAlvo} ${nAlvo === 1 ? 'carta' : 'cartas'}: ${c.tipo === 'pular' || c.tipo === 'inverter' ? 'fazer ele perder a vez' : 'fazer ele comprar'} atrasa a saída dele.`);
      }
      if (c.coringa) {
        const tenho = vista.mao.filter(id => id !== melhor.carta && !C[id].coringa && C[id].cor === melhor.cor).length;
        let txt = `Cor ${corHtml(melhor.cor)}: você fica com ${tenho} ${tenho === 1 ? 'carta' : 'cartas'} dessa cor`;
        if (inf[alvo].falta[melhor.cor] >= 0.6) txt += `, e ${nomes[alvo]} parece não ter ${NOME_COR_MIN[melhor.cor]} (comprou quando a mesa estava nessa cor)`;
        linhas.push(txt + '.');
        if (melhor.blefe) linhas.push('Atenção: você tem carta da cor da mesa, então este +4 é <b>blefe</b> — se desafiarem, você compra 4.');
      } else {
        const coringaJogavel = av.some(o => o.tipo === 'carta' && C[o.carta].coringa);
        if (coringaJogavel) linhas.push('Guarde o coringa: ele salva você quando não houver jogada, e quase sempre vale mais no fim.');
        if (inf[alvo].falta[c.cor] >= 0.6) linhas.push(`${nomes[alvo]} comprou quando a mesa estava em ${corHtml(c.cor)} — provavelmente está sem essa cor.`);
      }
      const restam = vista.mao.length - (junta(melhor) ? melhor.cartas.length : 1);
      if (restam === 1) linhas.push('Depois desta sobra uma carta: aperte <b>Última!</b> antes de jogar (se esquecer e pegarem, você compra 2).');
    } else if (melhor.tipo === 'comprar' && !vista.pendente) {
      linhas.push('Comprar aqui é melhor do que gastar as cartas que você tem: elas valem mais numa hora em que o próximo estiver perto de sair.');
    } else if (melhor.tipo === 'passar') {
      linhas.push('Guarde a carta que comprou: jogá-la agora ajuda menos do que tê-la depois.');
    }
    const quaseSaindo = vista.nCartas.map((k, j) => [k, j]).filter(([k, j]) => j !== vista.eu && k <= 2);
    if (quaseSaindo.length && !linhas.some(l => l.indexOf('atrasa') >= 0)) {
      linhas.push(quaseSaindo.map(([k, j]) => `${nomes[j]} está com ${k}`).join(', ') + ' — se ele sair, as cartas que estão na sua mão viram pontos para ele.');
    }
    // as outras jogadas
    const outras = av.slice(1, 5).map(o => `${descreve(o)} ${pct(o.p)}`).join(' · ');
    if (outras) linhas.push('Outras jogadas: ' + outras + '.');
    const resumo = `${rotulo(melhor)} (${pct(melhor.p)})`;
    return { opcoes: av, melhor, linhas, resumo, p: melhor.p, blefe, tipo: vista.fase };
  }

  /** Mesma jogada? (cartas iguais contam como iguais) */
  function igual(o, a) {
    if (o.tipo !== a.tipo) return false;
    if (o.tipo !== 'carta') return true;
    if (junta(o) || junta(a)) {
      if (!junta(o) || !junta(a) || o.cartas.length !== a.cartas.length) return false;
      const sigs = x => x.cartas.map(id => C[id].sig).sort((p, q) => p - q).join(',');
      return sigs(o) === sigs(a) && C[o.cartas[o.cartas.length - 1]].sig === C[a.cartas[a.cartas.length - 1]].sig;
    }
    if (C[o.carta].sig !== C[a.carta].sig) return false;
    return !C[o.carta].coringa || o.cor === a.cor;
  }

  /** Nota da sua jogada comparada à melhor. */
  function avaliarJogada(cons, acao) {
    if (!cons || !cons.opcoes || cons.melhor.unica) return null;
    const minha = cons.opcoes.find(o => igual(o, acao));
    if (!minha) return null;
    const perda = Math.max(0, cons.melhor.p - minha.p);
    let nota, rot;
    if (perda <= 0.02) { nota = 'otima'; rot = 'Ótima'; }
    else if (perda <= 0.05) { nota = 'boa'; rot = 'Boa'; }
    else if (perda <= 0.12) { nota = 'imprecisa'; rot = 'Imprecisa'; }
    else { nota = 'erro'; rot = 'Erro'; }
    const texto = nota === 'otima' ? `${descreve(minha)}: a melhor jogada (${pct(minha.p)}).`
      : `${descreve(minha)} ganha ${pct(minha.p)}; ${descreve(cons.melhor)} ganharia ${pct(cons.melhor.p)}.`;
    return { nota, rotulo: rot, texto, perda };
  }

  U.Coach = { conselho, avaliar: avaliarJogada, cartaHtml, corHtml, descreve, pct, igual, junta };
})(window.Poker = window.Poker || {});
