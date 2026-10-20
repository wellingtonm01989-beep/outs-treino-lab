/* ==========================================================================
   OUTS · Treino Lab — truco-ia.js
   A matemática do truco, usada pelo coach e pelos bots, sempre a partir da
   vista de um jogador (as cartas dele e o que está na mesa — nunca as cartas
   escondidas dos outros):

   1. Amostragem: sorteia muitos jeitos de as cartas que você não vê estarem
      com os outros jogadores, respeitando o que você sabe (o sinal do parceiro,
      as cartas do parceiro na mão de 11). Quem pediu truco tende a ter mão
      boa: cada sorteio ganha um peso maior quando a mão sorteada combina com
      os pedidos que já aconteceram.
   2. Em cada sorteio, todas as cartas ficam abertas e a mão é jogada até o
      fim do melhor jeito para os dois lados (minimax com poda alfa-beta).
   3. A média dá a chance de ganhar a mão — e a chance com cada carta que
      você pode jogar agora.

   Também ficam aqui os bots do truco (Cauteloso, Esperto e Trucador).
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Truco = P.Truco || {};
  const R = T.Regras;
  const RNG = P.RNG;

  /**
   * Leitura dos pedidos de truco. Quem pede quase sempre está ganhando a mão
   * naquele momento (com as cartas que tem e o que já está na mesa); às vezes
   * é blefe. Para cada estilo, a chance de cada decisão quando, com as cartas
   * abertas dali em diante, ele ganharia (g) ou perderia (p) a mão:
   *   truco   pedir truco na própria vez
   *   alto    pedir seis, nove ou doze na própria vez (bem mais seletivo)
   *   aumento responder a um pedido aumentando (o mais seletivo de todos)
   *   aceite  não correr (aceitar ou aumentar)
   * O Cauteloso quase só pede ganhando (o pedido dele diz muito); o Trucador
   * pede bem mais perdendo (diz menos). "geral" vale para quem não se conhece
   * (você, para os bots). Medido em milhares de mãos entre os bots.
   */
  const MODELOS = {
    geral: { truco: { g: 0.58, p: 0.17 }, alto: { g: 0.35, p: 0.05 }, aceite: { g: 0.7, p: 0.27 }, aumento: { g: 0.29, p: 0.03 } },
    cauteloso: { truco: { g: 0.49, p: 0.067 }, alto: { g: 0.25, p: 0.023 }, aceite: { g: 0.6, p: 0.17 }, aumento: { g: 0.15, p: 0.004 } },
    esperto: { truco: { g: 0.56, p: 0.167 }, alto: { g: 0.33, p: 0.031 }, aceite: { g: 0.69, p: 0.24 }, aumento: { g: 0.28, p: 0.016 } },
    trucador: { truco: { g: 0.7, p: 0.277 }, alto: { g: 0.47, p: 0.096 }, aceite: { g: 0.86, p: 0.42 }, aumento: { g: 0.43, p: 0.035 } }
  };
  /** Chance de a decisão acontecer dado o resultado da mão com as cartas abertas (1 ganha, 0 empata, -1 perde). */
  const chanceDado = (t, val) => (val === 1 ? t.g : val === -1 ? t.p : (t.g + t.p) / 2);

  /** Termômetro simples da força de uma mão de 3 cartas (0 a ~1,6), usado nos testes e na calibragem. */
  const PESO_VALOR = [0, 0.02, 0.04, 0.07, 0.1, 0.14, 0.19, 0.26, 0.38, 0.52, 0.72, 0.8, 0.88, 1];
  function forcaMao(cartas, vira) {
    const v = cartas.map(c => PESO_VALOR[R.valor(c, vira)]).sort((a, b) => b - a);
    return (v[0] || 0) + 0.45 * (v[1] || 0) + 0.15 * (v[2] || 0);
  }

  // ------------------------------------------------------------ amostragem
  /**
   * Prepara a amostragem a partir de uma vista: o que é conhecido, o que é
   * sorteado, e as restrições de cada jogador.
   */
  function prepararAmostragem(vista) {
    const n = vista.n, eu = vista.eu, vira = vista.vira;
    const conhecidas = new Set([vira]);
    const jogadasPor = Array.from({ length: n }, () => []);   // cartas abertas já jogadas por cada um
    vista.jogadas.forEach(r => r.forEach(x => {
      if (x.carta !== null && x.carta !== undefined) { conhecidas.add(x.carta); if (!x.coberta) jogadasPor[x.j].push(x.carta); }
    }));
    const minhas = vista.cegas ? null : vista.cartas.slice();
    if (minhas) minhas.forEach(c => conhecidas.add(c));
    let parceiroFixo = null;
    if (vista.cartasParceiro) { parceiroFixo = vista.cartasParceiro.slice(); parceiroFixo.forEach(c => conhecidas.add(c)); }
    const pool = R.BARALHO.filter(c => !conhecidas.has(c));

    // restrição do sinal do parceiro: a melhor carta dele (se manilha, 3 ou 2) ou "nada disso"
    let restricaoParceiro = null;
    const pj = vista.parceiro;
    if (pj !== null && pj !== undefined && !parceiroFixo && vista.sinalParceiro !== undefined && vista.nCartas[pj] > 0) {
      const s = vista.sinalParceiro;
      if (s === null) restricaoParceiro = { obrigatoria: null, rank: null, max: R.FORCA_RANK[0] - 1 };   // nada de 2, 3 ou manilha
      else if (R.ehManilha(s, vira)) {
        // manilha: o sinal diz qual é
        const jaJogou = jogadasPor[pj].indexOf(s) >= 0;
        restricaoParceiro = { obrigatoria: jaJogou ? null : s, rank: null, max: R.valor(s, vira) };
      } else {
        // um 3 ou um 2: o sinal diz o número, não o naipe
        const jaJogou = jogadasPor[pj].some(x => R.rankDe(x) === R.rankDe(s));
        restricaoParceiro = { obrigatoria: null, rank: jaJogou ? null : R.rankDe(s), max: R.valor(s, vira) };
      }
    }
    // cada pedido de truco: a mesa naquele momento e as cartas que cada um jogou depois
    const pedidos = (vista.historicoPedidos || []).map(x => {
      const r = x.rodada, rod = vista.jogadas[r] || [];
      let k = rod.findIndex(y => y.j === x.j);
      if (k < 0) k = rod.length;
      const vDe = y => (y.coberta ? R.VALOR_COBERTA : R.valor(y.carta, vira));
      const atuais = rod.slice(0, k).map(y => ({ j: y.j, v: vDe(y) }));
      // o que foi jogado depois do pedido ainda estava na mão (coberta de outro: valor desconhecido, conta como -1)
      const depois = Array.from({ length: n }, () => []);
      rod.slice(k).forEach(y => depois[y.j].push(y.carta !== null && y.carta !== undefined ? R.valor(y.carta, vira) : R.VALOR_COBERTA));
      vista.jogadas.slice(r + 1).forEach(rr => rr.forEach(y => depois[y.j].push(y.carta !== null && y.carta !== undefined ? R.valor(y.carta, vira) : R.VALOR_COBERTA)));
      return Object.assign({}, x, { atuais, resultados: vista.resultados.slice(0, r), depois });
    });
    return { n, eu, vira, pool, minhas, parceiroFixo, restricaoParceiro, jogadasPor, pedidos };
  }

  /** Embaralha só os k primeiros (Fisher-Yates parcial) e devolve o array. */
  function sortearK(arr, k) {
    for (let i = 0; i < k && i < arr.length - 1; i++) {
      const j = i + RNG.inteiroAbaixo(arr.length - i);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Um sorteio das mãos que restam com cada jogador (cartas, não valores). */
  function sortear(prep, vista) {
    const { n, eu, vira, pool, minhas, parceiroFixo, restricaoParceiro } = prep;
    const maos = new Array(n);
    let livres = pool.slice();
    if (minhas) maos[eu] = minhas.slice();
    const pj = vista.parceiro;
    if (parceiroFixo) maos[pj] = parceiroFixo.slice();
    else if (restricaoParceiro) {
      const k = vista.nCartas[pj];
      const mao = [];
      if (restricaoParceiro.obrigatoria !== null) {
        mao.push(restricaoParceiro.obrigatoria);
        livres = livres.filter(c => c !== restricaoParceiro.obrigatoria);
      } else if (restricaoParceiro.rank !== null && k > 0) {
        const doRank = livres.filter(c => R.rankDe(c) === restricaoParceiro.rank);
        if (doRank.length) {
          const escolhida = doRank[RNG.inteiroAbaixo(doRank.length)];
          mao.push(escolhida);
          livres = livres.filter(c => c !== escolhida);
        }
      }
      const falta = k - mao.length;
      const ok = livres.filter(c => R.valor(c, vira) <= restricaoParceiro.max && c !== restricaoParceiro.obrigatoria);
      if (ok.length >= falta) {
        sortearK(ok, falta);
        for (let i = 0; i < falta; i++) mao.push(ok[i]);
        const usadas = new Set(mao);
        livres = livres.filter(c => !usadas.has(c));
      } else {   // sinal impossível com o que sobrou (não deveria acontecer): ignora a restrição
        sortearK(livres, falta);
        for (let i = 0; i < falta; i++) mao.push(livres[i]);
        livres = livres.slice(falta);
      }
      maos[pj] = mao;
    }
    sortearK(livres, livres.length);
    let p = 0;
    for (let j = 0; j < n; j++) {
      if (maos[j]) continue;
      const k = vista.nCartas[j];
      maos[j] = livres.slice(p, p + k);
      p += k;
    }
    return maos;
  }

  /**
   * Peso de um sorteio: quão bem as mãos sorteadas explicam os pedidos de
   * truco e as respostas. Para cada pedido, a mão é resolvida com as cartas
   * abertas a partir daquele momento: se quem pediu ganharia, o pedido
   * "combina" com o sorteio; se perderia, só se explica por blefe (peso menor).
   * perfis[j]: o estilo de quem está no lugar j, se for conhecido (o estilo dos
   * bots aparece na mesa); senão, o modelo geral.
   */
  function pesoSorteio(maos, prep, vista, perfis) {
    const ped = prep.pedidos;
    if (!ped || !ped.length) return 1;
    const conhecido = j => j === vista.eu || (prep.parceiroFixo && j === vista.parceiro);
    const modelo = j => MODELOS[(perfis && perfis[j]) || 'geral'] || MODELOS.geral;
    const solver = solverDe(prep.n);
    let w = 1;
    for (let i = 0; i < ped.length; i++) {
      const x = ped[i];
      // um aumento (seis em resposta ao truco...) aparece como pedido de quem aumentou: lido com a tabela "aumento"
      const ehAumento = i > 0 && ped[i - 1].resposta === 'aumentar' && ped[i - 1].jResposta === x.j;
      const lerPedido = !conhecido(x.j);
      const temResp = !!x.resposta && x.jResposta !== null && x.jResposta !== undefined;
      const lerResposta = temResp && x.resposta !== 'aumentar' && !conhecido(x.jResposta);   // o aumento é lido no pedido seguinte
      if (!lerPedido && !lerResposta) continue;
      const valores = maos.map((m, j) => m.map(c => R.valor(c, prep.vira)).concat(x.depois[j]));
      const val = solver.resolver(valores, x.atuais, x.resultados, x.j, x.j % 2, false).valor;   // do ponto de vista de quem pediu
      if (lerPedido) {
        const md = modelo(x.j);
        w *= chanceDado(ehAumento ? md.aumento : x.nivel >= 2 ? md.alto : md.truco, val);
      }
      if (lerResposta) {
        const m = modelo(x.jResposta), vr = -val;
        const naoCorre = chanceDado(m.aceite, vr), aumenta = x.nivel < (vista.maxNivel || 4) ? chanceDado(m.aumento, vr) : 0;
        w *= x.resposta === 'aceitar' ? Math.max(0.01, naoCorre - aumenta) : Math.max(0.01, 1 - naoCorre);
      }
    }
    return w;
  }

  // ---------------------------------------------------------------- solver
  /**
   * Joga o resto da mão com todas as cartas abertas, do melhor jeito para os
   * dois lados. hv: valores das cartas que restam com cada jogador. Devolve
   * +1 (a equipe "eq" ganha a mão), 0 (ninguém marca) ou -1.
   * raiz: se for a vez de "eq", devolve o resultado de cada carta possível.
   */
  function criarSolver(n) {
    const hv = Array.from({ length: n }, () => [0, 0, 0]);
    const tam = new Array(n).fill(0);
    const usado = new Array(n).fill(0);
    const rodV = [new Array(n), new Array(n), new Array(n)];
    const rodJ = [new Array(n), new Array(n), new Array(n)];
    const cnt = [0, 0, 0];
    const res = [];
    let eq = 0;
    let empEq = null;                            // três empates: de quem é a mão (null = ninguém marca)

    function decidir() {
      const k = res.length;
      if (k < 2) return 2;                      // 2 = ainda não acabou
      const r1 = res[0], r2 = res[1];
      if (k === 2) {
        if (r1 !== 2 && (r2 === r1 || r2 === 2)) return r1 === eq ? 1 : -1;   // 2 aqui = empate (E)
        if (r1 === 2 && r2 !== 2) return r2 === eq ? 1 : -1;
        return 2;
      }
      const r3 = res[2];
      if (r3 !== 2) return r3 === eq ? 1 : -1;
      if (r1 !== 2) return r1 === eq ? 1 : -1;
      return empEq === null ? 0 : empEq === eq ? 1 : -1;
    }
    // res guarda 0/1 (equipe que ganhou a rodada) ou 2 (empate). decidir() devolve 2 se a mão segue.

    function buscar(vez, alfa, beta) {
      const r = res.length;
      if (cnt[r] === n) {
        // fecha a rodada
        let maior = -9, quem = -1, eqTopo = -1, empate = false;
        for (let i = 0; i < n; i++) {
          const v = rodV[r][i], j = rodJ[r][i];
          if (v > maior) { maior = v; quem = j; eqTopo = j & 1; empate = false; }
          else if (v === maior && (j & 1) !== eqTopo) empate = true;
        }
        res.push(empate ? 2 : eqTopo);
        const d = decidir();
        const val = d !== 2 ? d : buscar(quem, alfa, beta);
        res.pop();
        return val;
      }
      const maximiza = (vez & 1) === eq;
      let melhor = maximiza ? -2 : 2;
      const h = hv[vez], t = tam[vez];
      let tentados = 0;                          // máscara dos valores já tentados (cartas iguais dão o mesmo resultado)
      for (let i = 0; i < t; i++) {
        if (usado[vez] & (1 << i)) continue;
        const v = h[i];
        if (tentados & (1 << (v + 1))) continue;
        tentados |= 1 << (v + 1);
        usado[vez] |= 1 << i;
        rodV[r][cnt[r]] = v; rodJ[r][cnt[r]] = vez; cnt[r]++;
        const val = buscar((vez + 1) % n, alfa, beta);
        cnt[r]--; usado[vez] &= ~(1 << i);
        if (maximiza) { if (val > melhor) melhor = val; if (melhor > alfa) alfa = melhor; }
        else { if (val < melhor) melhor = val; if (melhor < beta) beta = melhor; }
        if (alfa >= beta || melhor === (maximiza ? 1 : -1)) break;
      }
      return melhor;
    }

    /**
     * Carrega a posição e resolve. jogadasAtuais: [{ j, v }] da rodada em
     * andamento; resultados: rodadas já fechadas (0, 1 ou 'E').
     * Devolve { valor } ou, com raiz = true, { porValor: Map(valorDaCarta → resultado) }
     * e, com cobrir = true, também { porValorCoberta } (a mesma carta jogada virada).
     * empate: equipe que leva a mão se as três rodadas empatarem (regra paranaense), ou null.
     */
    function resolver(maosValores, jogadasAtuais, resultados, vez, equipe, raiz, cobrir, empate) {
      eq = equipe;
      empEq = empate === undefined ? null : empate;
      res.length = 0;
      resultados.forEach(x => res.push(x === 'E' ? 2 : x));
      for (let j = 0; j < n; j++) {
        const m = maosValores[j];
        tam[j] = m.length;
        for (let i = 0; i < m.length; i++) hv[j][i] = m[i];
        usado[j] = 0;
      }
      const r = res.length;
      cnt[0] = cnt[1] = cnt[2] = 0;
      jogadasAtuais.forEach((x, i) => { rodV[r][i] = x.v; rodJ[r][i] = x.j; });
      cnt[r] = jogadasAtuais.length;
      if (!raiz) return { valor: buscar(vez, -2, 2) };
      const porValor = new Map(), porValorCoberta = cobrir ? new Map() : null;
      for (let i = 0; i < tam[vez]; i++) {
        const v = hv[vez][i];
        if (porValor.has(v)) continue;
        usado[vez] |= 1 << i;
        rodV[r][cnt[r]] = v; rodJ[r][cnt[r]] = vez; cnt[r]++;
        porValor.set(v, buscar((vez + 1) % n, -2, 2));
        if (cobrir) { rodV[r][cnt[r] - 1] = R.VALOR_COBERTA; porValorCoberta.set(v, buscar((vez + 1) % n, -2, 2)); }
        cnt[r]--; usado[vez] &= ~(1 << i);
      }
      return { porValor, porValorCoberta };
    }
    return { resolver };
  }
  const solvers = {};
  const solverDe = n => solvers[n] || (solvers[n] = criarSolver(n));

  // --------------------------------------------------------------- análise
  /**
   * Chance de a equipe de "vista.eu" ganhar a mão a partir de agora.
   * Se for a vez de vista.eu jogar (e ele vê as cartas), também a chance com
   * cada carta da mão. opts: { amostras, perfis (estilo de cada lugar, se conhecido),
   * leitura (0 a 1: quanto acreditar nos pedidos de truco; o coach usa 1, os bots menos) }.
   * Devolve { pGanhar, pPerder, pNinguem, p (= ganhar + metade dos empates),
   *           cartas: [{ carta, valor, pGanhar, pPerder, pNinguem, p }] (melhor primeiro),
   *           amostras, pesoEfetivo }
   */
  function analisar(vista, opts) {
    opts = opts || {};
    const N = opts.amostras || 300;
    const n = vista.n, vira = vista.vira, eq = vista.equipe;
    const prep = prepararAmostragem(vista);
    const solver = solverDe(n);
    const rodada = vista.rodada;
    const atuais = (vista.jogadas[rodada] || []).map(x => ({ j: x.j, v: x.coberta ? R.VALOR_COBERTA : R.valor(x.carta, vira) }));
    const minhaVez = vista.vez === vista.eu && !vista.cegas && !vista.pedido;
    const empate = vista.empateTriplo === undefined ? null : vista.empateTriplo;
    const minhasPorValor = new Map();
    if (minhaVez) vista.cartas.forEach(c => { const v = R.valor(c, vira); if (!minhasPorValor.has(v)) minhasPorValor.set(v, c); });
    const cobrir = minhaVez && !!vista.podeCobrir;
    const acum = new Map(), acumCob = new Map();   // valor → [ganhar, perder, ninguém] ponderados (aberta / coberta)
    minhasPorValor.forEach((c, v) => { acum.set(v, [0, 0, 0]); acumCob.set(v, [0, 0, 0]); });
    const geral = [0, 0, 0];
    // para a conta do truco: o resultado de cada carta em cada sorteio (e o peso)
    const registros = minhaVez && vista.podeTrucar ? [] : null;
    let somaW = 0, somaW2 = 0;
    for (let s = 0; s < N; s++) {
      const maos = sortear(prep, vista);
      const w0 = pesoSorteio(maos, prep, vista, opts.perfis);
      const w = opts.leitura !== undefined && opts.leitura !== 1 ? Math.pow(w0, opts.leitura) : w0;
      if (w <= 0) continue;
      somaW += w; somaW2 += w * w;
      const valores = maos.map(m => m.map(c => R.valor(c, vira)));
      if (minhaVez) {
        const { porValor, porValorCoberta } = solver.resolver(valores, atuais, vista.resultados, vista.vez, eq, true, cobrir, empate);
        let melhor = -2;
        porValor.forEach((val, v) => {
          const a = acum.get(v);
          a[val === 1 ? 0 : val === -1 ? 1 : 2] += w;
          if (val > melhor) melhor = val;
        });
        if (cobrir) porValorCoberta.forEach((val, v) => { acumCob.get(v)[val === 1 ? 0 : val === -1 ? 1 : 2] += w; });
        geral[melhor === 1 ? 0 : melhor === -1 ? 1 : 2] += w;
        if (registros) registros.push({ w, res: new Map(porValor) });
      } else {
        const { valor } = solver.resolver(valores, atuais, vista.resultados, vista.vez, eq, false, false, empate);
        geral[valor === 1 ? 0 : valor === -1 ? 1 : 2] += w;
      }
    }
    const tot = somaW || 1;
    const fmt = a => ({ pGanhar: a[0] / tot, pPerder: a[1] / tot, pNinguem: a[2] / tot, p: (a[0] + a[2] / 2) / tot });
    const out = Object.assign(fmt(geral), { amostras: N, pesoEfetivo: somaW2 ? (somaW * somaW) / somaW2 : 0, cartas: [] });
    if (minhaVez) {
      minhasPorValor.forEach((c, v) => out.cartas.push(Object.assign({ carta: c, valor: v }, fmt(acum.get(v)), cobrir ? { coberta: fmt(acumCob.get(v)) } : {})));
      // melhor primeiro; no empate de chances, guardar a carta mais forte (jogar a menor)
      out.cartas.sort((a, b) => (b.pGanhar - b.pPerder) - (a.pGanhar - a.pPerder) || a.valor - b.valor);
      // a chance "geral" é a da melhor carta (a mesma régua da lista)
      Object.assign(out, { pGanhar: out.cartas[0].pGanhar, pPerder: out.cartas[0].pPerder, pNinguem: out.cartas[0].pNinguem, p: out.cartas[0].p });
    }
    if (registros && registros.length) out.truco = contaDoTruco(vista, registros, out.cartas[0].valor, opts.perfis);
    return out;
  }

  /**
   * Vale pedir truco (ou o próximo nível) agora? Em cada sorteio: com que
   * chance o outro lado aceitaria, olhando a situação dele (o modelo de cada
   * estilo); se correr, vocês levam o que a mão vale agora; se aceitar, a mão
   * passa a valer o próximo valor e vale o resultado daquele sorteio.
   * Compara com não pedir (jogar a mão valendo o que vale).
   * Devolve { correm, pAceito (chance de ganhar quando aceitam), ganho (pontos por mão), vale, novo }.
   */
  function contaDoTruco(vista, registros, valorCarta, perfis) {
    const valores = vista.valores || R.VALORES;
    const V = valores[vista.nivel], V2 = valores[vista.nivel + 1];
    const modelos = [];
    for (let j = 0; j < vista.n; j++) if (j % 2 !== vista.equipe) modelos.push(MODELOS[(perfis && perfis[j]) || 'geral'] || MODELOS.geral);
    let sW = 0, corre = 0, aceitoW = 0, ganhaAceito = 0, dif = 0;
    registros.forEach(({ w, res }) => {
      const val = res.get(valorCarta);
      // na dupla, basta um dos dois querer aceitar
      const naoCorre = 1 - modelos.reduce((acc, m) => acc * (1 - chanceDado(m.aceite, -val)), 1);
      sW += w; corre += w * (1 - naoCorre); aceitoW += w * naoCorre;
      if (val === 1) ganhaAceito += w * naoCorre;
      dif += w * ((1 - naoCorre) * V + naoCorre * V2 * val - V * val);
    });
    return { correm: sW ? corre / sW : 0, pAceito: aceitoW ? ganhaAceito / aceitoW : 0, ganho: sW ? dif / sW : 0, vale: V, novo: V2 };
  }

  /**
   * Paranaense, mão de 11 em dupla: das 20 maneiras de dividir as 6 cartas da
   * dupla (3 para cada), qual dá mais chance de ganhar a mão?
   * Devolve { troca: { [eu]: [...], [parceiro]: [...] }, p, pAtual, mudaram, saem, entram }.
   */
  function melhorTroca(vista, opts) {
    const minhas = vista.cartas.slice(), dele = vista.cartasParceiro.slice(), todas = minhas.concat(dele);
    const chave = arr => arr.slice().sort((a, b) => a - b).join();
    const vistos = new Map();                    // assinatura (valores das duas mãos) → chance
    const assinatura = (eu, ele) => eu.map(x => R.valor(x, vista.vira)).sort((x, y) => x - y).join() + '|' + ele.map(x => R.valor(x, vista.vira)).sort((x, y) => x - y).join();
    let melhor = null, pAtual = null;
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) {
      const eu = [todas[a], todas[b], todas[c]], ele = todas.filter((_, i) => i !== a && i !== b && i !== c);
      // mesma divisão em valores (cartas iguais) dá o mesmo resultado: conta uma vez
      const k = assinatura(eu, ele);
      const atual = chave(eu) === chave(minhas);
      if (vistos.has(k) && !atual) continue;
      const p = analisar(Object.assign({}, vista, { cartas: eu, cartasParceiro: ele }), opts).p;
      if (!vistos.has(k)) vistos.set(k, p);
      if (atual) pAtual = p;
      if (!melhor || p > melhor.p + 1e-9) melhor = { eu, ele, p };
    }
    if (pAtual !== null && melhor.p - pAtual < 0.02) melhor = { eu: minhas, ele: dele, p: pAtual };   // diferença pequena: não mexe
    const troca = {};
    troca[vista.eu] = melhor.eu; troca[vista.parceiro] = melhor.ele;
    return {
      troca, p: melhor.p, pAtual, mudaram: melhor.eu.filter(x => minhas.indexOf(x) < 0).length,
      saem: minhas.filter(x => melhor.eu.indexOf(x) < 0), entram: melhor.eu.filter(x => minhas.indexOf(x) < 0),
      /** Chance com qualquer divisão (para avaliar a troca que você fizer). */
      pDe: (eu, ele) => vistos.get(assinatura(eu, ele))
    };
  }

  // ------------------------------------------------------------------ bots
  const PERFIS = {
    cauteloso: {
      nome: 'Cauteloso', sigla: 'CAU', cor: '#4c9aff',
      descricao: 'Só pede truco com mão boa e corre fácil. Quando ele truca, acredite.',
      amostras: 140, trucoValor: 0.74, espera: 0.15, blefe: 0.03, margemAceitar: 0.07, aumentar: 0.87, margemOnze: 0.04, erro: 0.04, leitura: 0.6
    },
    esperto: {
      nome: 'Esperto', sigla: 'ESP', cor: '#2fbf71',
      descricao: 'Faz as contas, blefa na hora certa e repara se você corre muito.',
      amostras: 220, trucoValor: 0.64, espera: 0.3, blefe: 0.1, margemAceitar: 0, aumentar: 0.8, margemOnze: 0, erro: 0, adapta: true, leitura: 0.6
    },
    trucador: {
      nome: 'Trucador', sigla: 'TRU', cor: '#e8711a',
      descricao: 'Pede truco toda hora, blefa muito e aceita quase tudo.',
      amostras: 140, trucoValor: 0.56, espera: 0.05, blefe: 0.24, margemAceitar: -0.06, aumentar: 0.7, margemOnze: -0.04, erro: 0.06, leitura: 0.35
    }
  };
  const LISTA_PERFIS = Object.keys(PERFIS);

  /**
   * Um bot de truco. Ele só decide com a vista do lugar dele.
   * memoria: o que ele observou do adversário (para o Esperto se adaptar).
   */
  function criarBot(perfil, perfisMesa, ajustes) {
    const cfg = PERFIS[perfil] || PERFIS.esperto;
    // os bots leem os pedidos de truco com menos certeza que o coach (como gente: desconfiam, mas pagam para ver)
    // ajustes.amostras: menos simulações (partidas de torneio que ninguém está vendo)
    const op = { amostras: (ajustes && ajustes.amostras) || cfg.amostras, perfis: perfisMesa || null, leitura: cfg.leitura };
    const memoria = { pedidosNossos: 0, correramDeNos: 0 };
    let ultima = null;   // última análise (para os testes e o diagnóstico)

    /** Chance de blefar agora: mais na 2ª/3ª rodada depois de ganhar a 1ª, menos com o adversário que paga tudo. */
    function chanceBlefe(vista, p) {
      let b = cfg.blefe;
      if (p > 0.45) return 0;
      if (vista.rodada > 0 && vista.resultados[0] === vista.equipe) b *= 1.6;
      if (vista.rodada === 0 && vista.jogadas[0].length === 0) b *= 0.6;
      if (cfg.adapta && memoria.pedidosNossos >= 3) {
        const taxa = memoria.correramDeNos / memoria.pedidosNossos;   // quanto o adversário corre
        b *= 0.4 + taxa * 1.8;
      }
      if (p < 0.12) b *= 0.5;                       // sem nenhuma chance, blefar só às vezes
      return Math.min(0.35, b);
    }

    function decidir(vista) {
      if (vista.cegas) return { tipo: 'carta', indice: RNG.inteiroAbaixo(vista.cartas.length) };
      const a = ultima = analisar(vista, op);
      const p = a.p;
      if (vista.podeTrucar) {
        let pede = false;
        const nivel = vista.nivel + 1;      // 1 = truco; seis, nove e doze só com mão muito boa (e sem blefe)
        const exige = nivel === 1 ? cfg.trucoValor : Math.min(0.97, cfg.aumentar + 0.05 * (nivel - 2));
        if (p >= exige) {
          // mão muito forte no começo: às vezes espera para deixar o outro trucar
          const esperar = vista.rodada === 0 && p >= 0.85 && RNG.chance(cfg.espera);
          pede = !esperar;
        } else if (nivel === 1 && RNG.chance(chanceBlefe(vista, p))) pede = true;
        if (pede) return { tipo: 'truco', p };
      }
      let escolha = a.cartas[0];
      if (cfg.erro && a.cartas.length > 1 && RNG.chance(cfg.erro)) escolha = RNG.escolher(a.cartas.slice(1));
      // cobrir uma carta quando isso não muda o resultado (esconde o que tinha)
      let coberta = false;
      if (escolha.coberta) {
        const perda = (escolha.pGanhar - escolha.pPerder) - (escolha.coberta.pGanhar - escolha.coberta.pPerder);
        if (perda < 0.01 && RNG.chance(0.45)) coberta = true;
      }
      return { tipo: 'carta', carta: escolha.carta, coberta, p };
    }

    function responder(vista, nivel) {
      const a = ultima = analisar(vista, op);
      const p = a.p;
      const valores = vista.valores || R.VALORES;
      const min = R.minimoParaAceitar(valores[nivel - 1], valores[nivel], vista.nos, vista.eles);
      // aumentar fica mais exigente a cada nível (nove e doze são raros)
      const exige = Math.min(0.97, cfg.aumentar + 0.05 * Math.max(0, nivel - 1));
      const podeAumentar = vista.podeAumentar !== undefined ? vista.podeAumentar : nivel < 4;
      if (podeAumentar && (p >= exige || (nivel === 1 && p < 0.35 && p >= min && RNG.chance(cfg.blefe * 0.3)))) return { resposta: 'aumentar', p };
      if (p >= min + cfg.margemAceitar) return { resposta: 'aceitar', p };
      return { resposta: 'correr', p };
    }

    function onze(vista) {
      // paranaense: antes de decidir, a dupla arruma as 6 cartas do melhor jeito
      const t = vista.trocaPermitida ? melhorTroca(vista, op) : null;
      const p = t ? t.p : (ultima = analisar(vista, op)).p;
      const jogar = p * R.chancePartida(vista.nos + 3, vista.eles) + (1 - p) * R.chancePartida(vista.nos, vista.eles + 3);
      const correr = R.chancePartida(vista.nos, vista.eles + 1);
      const resposta = jogar >= correr + cfg.margemOnze ? 'jogar' : 'correr';
      return { resposta, p, troca: resposta === 'jogar' && t && t.mudaram ? t.troca : undefined };
    }

    /** Eventos da mesa (para o Esperto aprender se o adversário corre muito). */
    function observar(ev, minhaEquipe) {
      if (ev.tipo === 'resposta' && ev.equipe !== minhaEquipe) {
        memoria.pedidosNossos++;
        if (ev.resposta === 'correr') memoria.correramDeNos++;
      }
    }

    return { bot: true, perfil, decidir, responder, onze, observar, memoria, ultimaAnalise: () => ultima };
  }

  // nomes dos bots do truco (fictícios)
  const NOMES = ['Tião', 'Dona Cida', 'Seu Juca', 'Toninho', 'Lurdinha', 'Marcão', 'Nena', 'Tonhão', 'Chico Preá', 'Bia',
    'Zé Galinha', 'Dito', 'Cleide', 'Juvenal', 'Fia', 'Bastião', 'Neguinho', 'Rosinha', 'Valdo', 'Cotinha', 'Pedrinho', 'Lazinho'];

  T.IA = {
    PERFIS, LISTA_PERFIS, NOMES, MODELOS,
    forcaMao, chanceDado, prepararAmostragem, melhorTroca, sortear, pesoSorteio, analisar, criarBot, criarSolver
  };
})(window.Poker = window.Poker || {});
