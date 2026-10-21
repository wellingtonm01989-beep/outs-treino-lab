/* ==========================================================================
   OUTS · Treino Lab — cacheta-ia.js
   A cabeça dos bots (e do coach) da cacheta.

   1) Contar cartas: ninguém vê a mão dos outros, mas o lixo, a vira e o que
      cada um pegou do lixo são públicos. Cada carta tem 2 cópias; o que não
      se viu está no monte ou na mão de alguém.
   2) Quanto falta: para cada descarte possível, quantas cartas faltam para
      bater e quantas cartas (das que ainda podem vir) diminuem essa conta.
      Isso vira uma chance de ganhar a mão (modelo ajustado em milhares de
      mãos simuladas entre bots).
   3) Perigo: sorteia as mãos dos adversários de acordo com o que eles
      mostraram (as cartas que pegaram do lixo ficam com eles; o resto sai
      do que não se viu, "jogado" pelo número de vezes que cada um já jogou,
      guardando o que se liga e descartando o que não se liga) e vê com que
      frequência a carta que eu descartaria fecha a batida do próximo.
      Medido em 1.545 descartes entre bots: só ~2% dos descartes dão a batida
      e a estimativa separa pouco as cartas — usar o perigo na escolha deixava
      o bot mais fraco (perdia 10 pontos de mãos ganhas). Por isso ele entra
      só como aviso do coach (e um pouco no estilo Cauteloso).
   4) Bater com 9 ou esperar a de 10: compara o que se ganha (cada um perde
      2 em vez de 1) com o risco de alguém bater antes.
   ========================================================================== */
(function (P) {
  'use strict';

  const K = P.Cacheta, R = K.Regras, RNG = P.RNG;

  // ------------------------------------------------------------ o que se sabe
  /**
   * disp[t]: cópias do tipo t que podem estar no monte ou na mão de alguém
   * (2 menos as que eu vejo: minha mão, o lixo, a vira e as que os outros
   * pegaram do lixo e ainda têm). naMao[j]: cartas que j pegou do lixo e não
   * descartou. vezes[j]: quantas vezes j já jogou na mão. descartou[j], pegou[j].
   */
  function conhecimento(vista) {
    const conhec = new Int8Array(R.TIPOS);
    vista.mao.forEach(id => { conhec[id % 52]++; });
    vista.lixo.forEach(id => { conhec[id % 52]++; });
    if (vista.vira !== null && vista.vira !== undefined) conhec[vista.vira % 52]++;
    const n = vista.n;
    const naMao = Array.from({ length: n }, () => []);
    const vezes = new Array(n).fill(0), descartou = Array.from({ length: n }, () => []), pegou = Array.from({ length: n }, () => []);
    vista.historico.forEach(h => {
      if (h.j === undefined) return;
      if (h.acao === 'lixo' || h.acao === 'furou') { naMao[h.j].push(h.carta); pegou[h.j].push(h.carta); }
      else if (h.acao === 'descarte') {
        vezes[h.j]++;
        descartou[h.j].push(h.carta);
        const k = naMao[h.j].indexOf(h.carta);
        if (k >= 0) naMao[h.j].splice(k, 1);
      }
    });
    naMao[vista.eu] = [];
    naMao.forEach((l, j) => { if (j !== vista.eu) l.forEach(id => { conhec[id % 52]++; }); });
    const disp = new Int8Array(R.TIPOS);
    let total = 0;
    for (let t = 0; t < R.TIPOS; t++) { disp[t] = Math.max(0, 2 - conhec[t]); total += disp[t]; }
    return { disp, total, naMao, vezes, descartou, pegou };
  }

  /** Tipos que podem fazer diferença para a mão: mesmo valor, mesmo naipe até 2 de distância, curingas. */
  function relevantes(ids, cur) {
    const marca = new Uint8Array(R.TIPOS);
    ids.forEach(id => {
      const t = id % 52, v = t % 13 + 1, s = (t / 13) | 0;
      for (let s2 = 0; s2 < 4; s2++) marca[s2 * 13 + v - 1] = 1;
      const posicoes = v === 1 ? [1, 14] : [v];
      posicoes.forEach(p => {
        for (let dv = -2; dv <= 2; dv++) {
          const q = p + dv;
          if (q < 1 || q > 14) continue;
          marca[s * 13 + (q === 14 ? 1 : q) - 1] = 1;
        }
      });
    });
    if (cur) cur.tipos.forEach(t => { marca[t] = 1; });
    return marca;
  }

  /**
   * Para as 9 cartas S (depois do descarte): d = quantas faltam para bater com 9;
   * U = quantas cartas, das que podem vir, diminuem essa conta (e quais).
   * Com d = 0 (as 9 já fecham), U10 = quantas fecham a batida de 10.
   */
  function ajudam(S, cur, disp) {
    const d = R.faltam(S, cur, 9);
    const marca = relevantes(S, cur);
    const tipos = [];
    let U = 0;
    for (let t = 0; t < R.TIPOS; t++) {
      if (!marca[t] || !disp[t]) continue;
      const mais = S.concat([t]);
      const melhora = d > 0 ? R.faltam(mais, cur, 9, false, d - 1) < d : R.faltam(mais, cur, 10, false, 0) === 0;
      if (melhora) { U += disp[t]; tipos.push(t); }
    }
    return { d, U, tipos };
  }

  // ------------------------------------------------- chance de ganhar a mão
  /**
   * Modelo logístico ajustado em mãos simuladas entre bots (ver testes):
   * a chance de quem acabou de descartar ganhar a mão, pelo que falta (d), pelas
   * cartas que ajudam (U), por quantos adversários há e pela altura da mão.
   */
  // ajuste em 4.539 descartes de 200 mãos entre bots médios (2 a 6 jogadores, as três regras de curinga):
  // faltando 1, ganha 40% das vezes; faltando 2, 23%; faltando 3, 16% — e cai a cada volta que passa
  const MODELO = { base: [2.2, 0.52, -0.81, -1.61, -2.2, -2.8, -3.4, -4.0], u: 0.39, opp: -0.45, vez: -0.138 };
  function chance(d, U, nOpp, vez) {
    const b = MODELO.base[Math.min(d, MODELO.base.length - 1)];
    const z = b + MODELO.u * Math.log1p(U) + MODELO.opp * (nOpp - 1) + MODELO.vez * Math.min(vez || 0, 15);
    return 1 / (1 + Math.exp(-z));
  }

  // ---------------------------------------------------------- o que os outros têm
  /** Quanto uma carta se liga às outras da mão (para "jogar" as mãos sorteadas e descartar o que não serve). */
  function ligacao(id, mao, cur) {
    if (R.ehCuringa(id, cur)) return 50;
    const t = id % 52, v = t % 13 + 1, s = (t / 13) | 0;
    let x = 0;
    for (const o of mao) {
      if (o === id) continue;
      if (R.ehCuringa(o, cur)) { x += 1; continue; }
      const t2 = o % 52, v2 = t2 % 13 + 1, s2 = (t2 / 13) | 0;
      if (v2 === v && s2 !== s) x += 3;
      else if (s2 === s && t2 !== t) {
        let dist = Math.abs(v2 - v);
        if (v === 1 || v2 === 1) dist = Math.min(dist, Math.abs((v === 1 ? 14 : v) - (v2 === 1 ? 14 : v2)));
        if (dist === 1) x += 3; else if (dist === 2) x += 1.5;
      }
    }
    return x;
  }
  /** As cartas que eu não vejo (uma por cópia), para sortear. */
  function poolDe(conh) {
    const pool = [];
    for (let t = 0; t < R.TIPOS; t++) for (let k = 0; k < conh.disp[t]; k++) pool.push(t + 52 * k);
    return pool;
  }
  /**
   * Sorteia a mão de j: as que ele pegou do lixo + o resto sorteado do que não se vê;
   * depois "joga" as vezes que ele já jogou (compra uma, descarta a que menos se liga).
   */
  function sortearMao(j, vista, conh, pool, cur) {
    const fixas = conh.naMao[j].slice();
    const nj = vista.nCartas[j];
    const p = pool.slice();
    const tirar = () => { if (!p.length) return null; const i = RNG.inteiroAbaixo(p.length); const x = p[i]; p[i] = p[p.length - 1]; p.pop(); return x; };
    const mao = fixas.slice();
    while (mao.length < nj) { const x = tirar(); if (x === null) break; mao.push(x); }
    const passos = Math.min(conh.vezes[j], 9);
    for (let k = 0; k < passos; k++) {
      const x = tirar();
      if (x === null) break;
      mao.push(x);
      let pior = -1, nota = Infinity;
      for (let i = 0; i < mao.length; i++) {
        if (fixas.indexOf(mao[i]) >= 0) continue;
        const l = ligacao(mao[i], mao, cur) + RNG.real() * 0.5;
        if (l < nota) { nota = l; pior = i; }
      }
      if (pior >= 0) { p.push(mao[pior]); mao.splice(pior, 1); } else mao.pop();
    }
    return mao;
  }
  /**
   * Perigo de cada carta: em quantas das mãos sorteadas de quem pode pegá-la
   * (o próximo; com "furar a fila", todos) ela fecha a batida. Só importa quem
   * está a 1 carta de bater. Devolve { perigo: Map(tipo → chance), naBoa (do próximo) }.
   */
  function perigos(vista, conh, candidatos, amostras) {
    const cur = vista.curinga;
    const quem = [];
    const prox = R.proximoVivo(vista.eu, vista.vivos, vista.n);
    if (vista.opcoes.furar) { for (let j = 0; j < vista.n; j++) if (j !== vista.eu && vista.vivos[j]) quem.push(j); }
    else quem.push(prox);
    const pool = poolDe(conh);
    const conta = {};
    candidatos.forEach(x => { conta[x % 52] = 0; });
    let naBoa = 0;
    for (let a = 0; a < amostras; a++) {
      const fechou = new Set();
      for (const j of quem) {
        const mao = sortearMao(j, vista, conh, pool, cur);
        if (R.faltam(mao, cur, 9) !== 1) continue;         // só quem está a uma carta (exato: quem já fecha bate de qualquer jeito)
        if (j === prox) naBoa++;
        for (const x of candidatos) {
          const t = x % 52;
          if (fechou.has(t)) continue;
          if (R.faltam(mao.concat([x]), cur, 9, false, 0) === 0) fechou.add(t);
        }
      }
      fechou.forEach(t => { conta[t]++; });
    }
    const perigo = {};
    Object.keys(conta).forEach(t => { perigo[t] = conta[t] / amostras; });
    return { perigo, naBoa: naBoa / amostras };
  }

  // ------------------------------------------------------------------ perfis
  /**
   * Estilos (todos fazem a conta; mudam no tempero):
   *   calculista: a melhor conta, sem firula;
   *   arrojado: pega mais do lixo e espera mais a batida de 10;
   *   cauteloso: segura carta perigosa e bate assim que dá.
   */
  const PERFIS = {
    calculista: { nome: 'Calculista', sigla: 'CAL', cor: '#b794f4', descricao: 'Faz a conta de cada descarte: quantas cartas faltam, quantas das que ainda podem vir ajudam, e espera a batida de 10 quando compensa.', perigo: 0, espera: 1, lixo: 0 },
    arrojado: { nome: 'Arrojado', sigla: 'ARR', cor: '#e5484d', descricao: 'Também faz a conta, mas arrisca: pega mais do lixo e espera a batida de 10 mais vezes.', perigo: 0, espera: 1.5, lixo: 0.02 },
    cauteloso: { nome: 'Cauteloso', sigla: 'CAU', cor: '#4c9aff', descricao: 'Faz a conta e, na dúvida, segura a carta que pode servir para o próximo. Bate assim que pode.', perigo: 0.4, espera: 0.4, lixo: -0.01 }
  };
  const LISTA_PERFIS = Object.keys(PERFIS);
  /** Níveis do lobby. amostras: mãos sorteadas para o perigo; erro: chance de jogar sem pensar. */
  const NIVEIS = {
    mestre: { nome: 'Mestre', amostras: 48, conta: true, erro: 0 },
    medio: { nome: 'Médio', amostras: 0, conta: true, erro: 0.1 },
    facil: { nome: 'Fácil', amostras: 0, conta: false, erro: 0.3 }
  };
  const NOMES = ['Zé Baralho', 'Dona Neusa', 'Toninho', 'Cida', 'Seu Lauro', 'Bete', 'Juvenal', 'Marlene', 'Tião', 'Gorete', 'Valdir', 'Nena', 'Dito', 'Lurdes', 'Pedrão', 'Cotinha', 'Nonô', 'Zuleide'];

  // ======================================================= as decisões
  const vivosMenosEu = v => v.vivos.filter((x, j) => x && j !== v.eu).length;
  const minhasVezes = (v, conh) => conh.vezes[v.eu];

  /**
   * Avalia cada descarte da mão de 10 cartas. opts: { amostras (perigo), perfil, conh, perigoPeso }.
   * Devolve [{ carta, d, U, tipos, perigo, valor, p }] do melhor para o pior.
   */
  function avaliarDescartes(vista, opts) {
    opts = opts || {};
    const cur = vista.curinga, mao = vista.mao;
    const conh = opts.conh || conhecimento(vista);
    const nOpp = Math.max(1, vivosMenosEu(vista));
    const vez = minhasVezes(vista, conh) + 1;
    const vistos = new Set();
    const cands = [];
    mao.forEach(x => {
      if (x === vista.doLixo) return;
      const chave = R.ehCuringa(x, cur) ? 'c' : x % 52;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      cands.push(x);
    });
    const res = cands.map(x => {
      const S = mao.filter(y => y !== x);
      const a = ajudam(S, cur, conh.disp);
      return { carta: x, d: a.d, U: a.U, tipos: a.tipos, perigo: 0, p: chance(a.d, a.U, nOpp, vez) };
    });
    // perigo só onde a escolha está em jogo (os melhores pela conta)
    const amostras = opts.amostras || 0;
    let naBoa = 0;
    if (amostras > 0) {
      res.sort((a, b) => b.p - a.p);
      const topo = res.filter(r => r.p >= res[0].p - 0.2).slice(0, 7);
      const pg = perigos(vista, conh, topo.map(r => r.carta), amostras);
      naBoa = pg.naBoa;
      topo.forEach(r => { r.perigo = pg.perigo[r.carta % 52] || 0; });
    }
    const peso = opts.perigoPeso !== undefined ? opts.perigoPeso : 0;
    res.forEach(r => {
      // dar a batida: perco a mão (e uma ou duas vidas); senão sigo com a minha chance
      r.valor = r.p * (1 - Math.min(1, r.perigo * peso)) - r.perigo * peso * 0.35;
    });
    res.sort((a, b) => (b.valor - a.valor) || (a.d - b.d) || (b.U - a.U) || (ligacaoNaMao(a.carta, mao, cur) - ligacaoNaMao(b.carta, mao, cur)));
    res.naBoa = naBoa;
    return res;
  }
  const ligacaoNaMao = (x, mao, cur) => ligacao(x, mao, cur);

  /**
   * Comprar do monte ou do lixo. Do lixo, só se a carta melhora a mão de verdade
   * (o que se ganha com ela é maior do que a chance de a do monte ajudar).
   * Devolve { de, ganho, comLixo (avaliação), semLixo }.
   */
  function decidirCompra(vista, opts) {
    opts = opts || {};
    const cur = vista.curinga, topo = vista.topo;
    if (topo === null) return { de: 'monte' };
    const conh = opts.conh || conhecimento(vista);
    const nOpp = Math.max(1, vivosMenosEu(vista));
    const vez = minhasVezes(vista, conh) + 1;
    const agora = ajudam(vista.mao, cur, conh.disp);
    // com a do lixo: a melhor das 9 que sobram (sem devolver a que pegou)
    const com = vista.mao.concat([topo]);
    let melhor = null;
    const vistos = new Set();
    com.forEach(x => {
      if (x === topo) return;
      const chave = R.ehCuringa(x, cur) ? 'c' : x % 52;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      const S = com.filter(y => y !== x);
      const d = R.faltam(S, cur, 9);
      if (melhor && d > melhor.d) return;
      const a = ajudam(S, cur, conh.disp);
      const p = chance(a.d, a.U, nOpp, vez);
      if (!melhor || p > melhor.p) melhor = { carta: x, d: a.d, U: a.U, p };
    });
    // do monte: com chance U/total a carta melhora (uma a menos), senão fica como está
    const q = conh.total ? agora.U / conh.total : 0;
    const pIgual = chance(agora.d, agora.U, nOpp, vez);
    const pMelhor = agora.d > 0 ? chance(agora.d - 1, Math.max(4, agora.U * 0.8), nOpp, vez) : pIgual;
    const pMonte = (1 - q) * pIgual + q * pMelhor;
    // pegar do lixo mostra a todos o que você junta: um pequeno custo
    const ganho = melhor ? melhor.p - pMonte - 0.012 + (opts.lixo || 0) : -1;
    return { de: ganho > 0 ? 'lixo' : 'monte', ganho, comLixo: melhor, agora, pMonte };
  }

  /**
   * Com 9 já fechadas (dá para bater com 9 agora): bate ou espera a de 10?
   * ganho em vidas: cada adversário perde 1 agora; esperando, perde 2 se vier uma "ponta"
   * antes que alguém bata. Quem já está com pouca vida pesa mais (é eliminação).
   */
  function vale10(vista, conh, U10, espera) {
    const nOpp = Math.max(1, vivosMenosEu(vista));
    const total = Math.max(1, conh.total);
    const p10 = Math.min(0.9, U10 / total * 1.15);          // a do monte ou a do lixo de alguém
    const vez = minhasVezes(vista, conh) + 1;
    const risco = Math.min(0.85, 1 - Math.pow(1 - Math.min(0.5, 0.03 + 0.012 * vez), nOpp));   // alguém bate antes da minha próxima vez
    let valorAgora = 0, valor10 = 0;
    vista.vidas.forEach((vv, j) => {
      if (j === vista.eu || !(vv > 0)) return;
      valorAgora += vv <= 1 ? 2.2 : 1;                         // eliminar vale mais
      valor10 += vv <= 2 ? 2.2 + (vv === 2 ? 1.2 : 0) : 2;
    });
    const minhas = vista.vidas[vista.eu];
    const perdaMinha = minhas <= 2 ? 3 : 1.2;
    const esperar = (1 - risco) * (p10 * valor10 + (1 - p10) * valorAgora) - risco * perdaMinha;
    return { esperar: esperar * (espera || 1) > valorAgora, p10, risco, valorAgora, valor10: esperar };
  }

  /**
   * A jogada depois de comprar: bater (com 10, com 9 ou esperando a de 10) ou descartar.
   * Devolve { tipo, carta?, com?, descarte?, analise }.
   */
  function decidirJogada(vista, opts) {
    opts = opts || {};
    const cur = vista.curinga;
    const conh = opts.conh || conhecimento(vista);
    const b = R.batidas(vista.mao, cur);
    if (b.com10) return { tipo: 'bater', com: 10, jogos: b.com10 };
    const com9 = b.com9.filter(o => o.descarte !== vista.doLixo);
    if (com9.length) {
      // as 9 já fecham: bater agora ou guardar a melhor ponta e esperar a de 10?
      let melhor = null;
      com9.forEach(o => {
        const S = vista.mao.filter(y => y !== o.descarte);
        const a = ajudam(S, cur, conh.disp);
        if (!melhor || a.U > melhor.U10) melhor = { descarte: o.descarte, U10: a.U, tipos: a.tipos, jogos: o.jogos };
      });
      if (opts.esperar10 !== false) {
        const v = vale10(vista, conh, melhor.U10, opts.espera);
        if (v.esperar) {
          // espera: descarta a sobra (a que não entra nos jogos), mas olha o perigo
          return { tipo: 'descartar', carta: melhor.descarte, esperando10: true, analise: Object.assign({ U10: melhor.U10, tipos: melhor.tipos }, v), jogos: melhor.jogos };
        }
      }
      return { tipo: 'bater', com: 9, descarte: melhor.descarte, jogos: melhor.jogos, U10: melhor.U10 };
    }
    const av = avaliarDescartes(vista, Object.assign({}, opts, { conh }));
    return { tipo: 'descartar', carta: av[0].carta, analise: av };
  }

  // -------------------------------------------------------------------- bots
  function criarBot(perfil, ajustes) {
    const cfg = PERFIS[perfil] || PERFIS.calculista;
    const nivel = NIVEIS[(ajustes && ajustes.nivel) || 'mestre'] || NIVEIS.mestre;
    const amostras = ajustes && ajustes.amostras !== undefined ? ajustes.amostras : nivel.amostras;

    function semPensar(vista) {
      // o fácil (ou um erro do médio): descarta a que parece pior, sem contar as cartas
      const cur = vista.curinga;
      const ops = vista.mao.filter(x => x !== vista.doLixo && !R.ehCuringa(x, cur));
      const lista = ops.length ? ops : vista.mao.filter(x => x !== vista.doLixo);
      if (RNG.chance(0.5)) return lista[RNG.inteiroAbaixo(lista.length)];
      let pior = lista[0], nota = Infinity;
      lista.forEach(x => { const l = ligacao(x, vista.mao, cur) + RNG.real(); if (l < nota) { nota = l; pior = x; } });
      return pior;
    }

    return {
      bot: true, perfil,
      comprar(vista) {
        if (vista.topo === null) return 'monte';
        if (!nivel.conta) {
          // o fácil pega do lixo quando a carta forma par com alguma da mão (às vezes)
          const d0 = R.faltam(vista.mao, vista.curinga, 9), d1 = R.faltam(vista.mao.concat([vista.topo]), vista.curinga, 9);
          return d1 < d0 && RNG.chance(0.7) ? 'lixo' : 'monte';
        }
        return decidirCompra(vista, { lixo: cfg.lixo }).de;
      },
      jogar(vista) {
        const b = R.batidas(vista.mao, vista.curinga);
        if (b.com10) return { tipo: 'bater', com: 10 };
        const com9 = b.com9.filter(o => o.descarte !== vista.doLixo);
        if (!nivel.conta) {
          if (com9.length && RNG.chance(0.9)) return { tipo: 'bater', com: 9, descarte: com9[0].descarte };
          if (RNG.chance(nivel.erro)) return { tipo: 'descartar', carta: semPensar(vista) };
          const av = avaliarDescartes(vista, { amostras: 0 });
          return { tipo: 'descartar', carta: av[0].carta };
        }
        if (!com9.length && RNG.chance(ajustes && ajustes.semErro ? 0 : nivel.erro)) return { tipo: 'descartar', carta: semPensar(vista) };
        const semPerigo = ajustes && ajustes.semPerigo, semEspera = ajustes && ajustes.semEspera;
        const comPerigo = !semPerigo && cfg.perigo > 0 && amostras > 0;     // só o estilo Cauteloso olha o perigo (ver o topo do arquivo)
        const d = decidirJogada(vista, { amostras: comPerigo ? amostras : 0, espera: cfg.espera, perigoPeso: comPerigo ? cfg.perigo : 0, esperar10: amostras > 0 && !semEspera });
        if (d.tipo === 'bater') return d.com === 10 ? { tipo: 'bater', com: 10 } : { tipo: 'bater', com: 9, descarte: d.descarte };
        return { tipo: 'descartar', carta: d.carta };
      },
      furar() { return true; },
      observar() {}
    };
  }

  K.IA = { PERFIS, LISTA_PERFIS, NIVEIS, NOMES, MODELO, conhecimento, relevantes, ajudam, chance, ligacao, sortearMao, perigos, avaliarDescartes, decidirCompra, decidirJogada, vale10, criarBot };
})(window.Poker = window.Poker || {});
