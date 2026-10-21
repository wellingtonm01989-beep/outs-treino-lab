/* ==========================================================================
   OUTS · Treino Lab — cacheta-regras.js
   Cacheta: as cartas, as regras e a conta dos jogos (separar a mão em trincas
   e sequências — e, quando ainda não fecha, quantas cartas faltam).

   Baralho: dois baralhos comuns de 52 cartas, sem os coringas de figura
   (104 cartas). Cada um recebe 9; depois vira-se a carta de cima do monte (a
   "vira"): o curinga é a carta logo acima dela (vira 5♥ → curinga 6♥; vira
   K → curinga Ás). Opções: curinga do mesmo naipe (as 2 cópias, o clássico),
   da mesma cor (4 cartas) ou sem curinga.
   Na vez: compre a de cima do monte ou a do lixo (a última descartada) e
   descarte uma — não vale devolver ao lixo a carta que acabou de pegar dele.
   Jogos: trinca = 3 ou 4 cartas do mesmo valor, de naipes diferentes;
   sequência = 3 ou mais cartas do mesmo naipe em seguida (o Ás vale antes do
   2 ou depois do K, mas não no meio: K-A-2 não vale). O curinga entra no
   lugar de qualquer carta, no máximo um por jogo (e também pode valer como
   ele mesmo).
   Bater: depois de comprar, com as 10 cartas em jogos ("bate com 10") ou com
   9 em jogos e a outra descartada ("bate com 9"). Bateu com 9: cada um dos
   outros perde 1 vida; com 10: perde 2. Quem chega a 0 sai; ganha o último
   que sobrar na mesa.
   Opção "furar a fila": quem bate com a carta que alguém acabou de descartar
   pode pegá-la fora da vez (vale primeiro quem bate com 10; empate, quem está
   mais perto de quem descartou).

   Cartas: número de 0 a 103. tipo = id % 52 (as duas cópias têm o mesmo
   tipo); naipe = tipo / 13 (0 ♠, 1 ♥, 2 ♦, 3 ♣ — como no poker); valor =
   tipo % 13 + 1 (1 = Ás ... 13 = Rei).
   ========================================================================== */
(function (P) {
  'use strict';

  const K = P.Cacheta = P.Cacheta || {};

  const TOTAL = 104, TIPOS = 52, POR_MAO = 9;
  const NAIPES = ['♠', '♥', '♦', '♣'];
  const NOMES_NAIPE = ['espadas', 'copas', 'ouros', 'paus'];
  const ROTULO = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const NOME_VALOR = [null, 'Ás', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Valete', 'Dama', 'Rei'];
  const ORDEM_NAIPE = [0, 1, 3, 2];          // para arrumar a mão: ♠ ♥ ♣ ♦ (cores alternadas)

  const tipo = id => id % 52;
  const naipe = id => ((id % 52) / 13) | 0;
  const valor = id => (id % 52) % 13 + 1;
  const tipoDe = (v, n) => n * 13 + v - 1;
  const vermelho = n => n === 1 || n === 2;
  const parDaCor = n => [3, 2, 1, 0][n];      // ♠↔♣, ♥↔♦
  const nome = id => ROTULO[valor(id)] + NAIPES[naipe(id)];
  const nomeTipo = t => ROTULO[t % 13 + 1] + NAIPES[(t / 13) | 0];
  /** O número da carta no desenho do poker (P.UI.carta): rank 0 = 2 ... 12 = Ás, vezes 4, mais o naipe. */
  function pokerId(id) { const v = valor(id); return (v === 1 ? 12 : v - 2) * 4 + naipe(id); }

  // ---------------------------------------------------------------- opções
  const OPCOES_PADRAO = { curinga: 'naipe', vidas: 7, furar: false };
  function opcoes(o) {
    const x = Object.assign({}, OPCOES_PADRAO, o || {});
    if (['naipe', 'cor', 'sem'].indexOf(x.curinga) < 0) x.curinga = 'naipe';
    x.vidas = Math.max(1, Math.min(15, Math.round(+x.vidas || 7)));
    x.furar = !!x.furar;
    return x;
  }

  // --------------------------------------------------------------- curinga
  /** O curinga da mão a partir da vira: { v, n, modo, tipos } (ou null, sem curinga). */
  function curingaDe(vira, modo) {
    if (modo === 'sem' || vira === null || vira === undefined) return null;
    const v = valor(vira) % 13 + 1, n = naipe(vira);
    const tipos = modo === 'cor' ? [tipoDe(v, n), tipoDe(v, parDaCor(n))] : [tipoDe(v, n)];
    return { v, n, modo, tipos };
  }
  const ehCuringa = (id, cur) => !!cur && cur.tipos.indexOf(id % 52) >= 0;
  /** "6♥" ou "6 vermelho" (na mesma cor; curto: "6♥♦"). */
  function nomeCuringa(cur, curto) {
    if (!cur) return 'sem curinga';
    if (cur.modo !== 'cor') return ROTULO[cur.v] + NAIPES[cur.n];
    return curto ? ROTULO[cur.v] + NAIPES[cur.n] + NAIPES[parDaCor(cur.n)] : `${ROTULO[cur.v]} ${vermelho(cur.n) ? 'vermelho' : 'preto'}`;
  }

  // ===================================================== jogos que fecham
  /**
   * Separa exatamente as naturais (contagem por tipo em cnt) e w curingas soltos
   * em jogos. Pega sempre a menor carta que sobrou: todo jogo que a contém só
   * tem cartas maiores (as menores já foram usadas). Devolve true e deixa os
   * jogos em grupos. cnt volta como estava.
   */
  function exato(cnt, w, grupos) {
    let t = 0;
    while (t < TIPOS && !cnt[t]) t++;
    if (t === TIPOS) return w === 0;
    const v = t % 13 + 1, s = (t / 13) | 0;
    cnt[t]--;
    let ok = false;
    // trincas: as do mesmo valor, de naipes acima (todos diferentes)
    const outros = [];
    for (let s2 = s + 1; s2 < 4; s2++) if (cnt[s2 * 13 + v - 1]) outros.push(s2 * 13 + v - 1);
    for (let mask = 0; mask < (1 << outros.length) && !ok; mask++) {
      const sel = [];
      for (let i = 0; i < outros.length; i++) if ((mask >> i) & 1) sel.push(outros[i]);
      const k = 1 + sel.length;
      for (let uw = 0; uw <= (w > 0 ? 1 : 0) && !ok; uw++) {
        if (k + uw < 3 || k + uw > 4) continue;
        sel.forEach(x => { cnt[x]--; });
        grupos.push({ tipo: 'trinca', nat: [t].concat(sel), w: uw, v });
        ok = exato(cnt, w - uw, grupos);
        if (!ok) grupos.pop();
        sel.forEach(x => { cnt[x]++; });
      }
    }
    // sequências no naipe de t, com t como a menor natural (o Ás também por cima, depois do K)
    if (!ok) ok = sequenciasExatas(cnt, w, grupos, t, v, s, 1);
    if (!ok && v === 1) ok = sequenciasExatas(cnt, w, grupos, t, v, s, -1);
    cnt[t]++;
    return ok;
  }
  /** sentido 1: de v para cima (até o K); -1: o Ás no alto (posição 14) e o resto descendo a partir do K. */
  function sequenciasExatas(cnt, w, grupos, t, v, s, sentido) {
    const base = sentido > 0 ? v : 14;
    const usados = [];
    let falta = 0, ok = false;
    for (let p = base + sentido; sentido > 0 ? p <= 13 : p >= 2; p += sentido) {
      const tp = s * 13 + p - 1;
      if (cnt[tp] > 0) {
        cnt[tp]--; usados.push(tp);
        const r = 1 + usados.length;
        const de = Math.min(base, p), ate = Math.max(base, p);
        const tenta = uw => {
          grupos.push({ tipo: 'seq', nat: [t].concat(usados), w: uw, naipe: s, de, ate, falta });
          if (exato(cnt, w - uw, grupos)) return true;
          grupos.pop();
          return false;
        };
        if (falta) { if (w > 0 && tenta(1)) { ok = true; break; } }
        else {
          if (r >= 3 && tenta(0)) { ok = true; break; }
          if (w > 0 && r >= 2 && tenta(1)) { ok = true; break; }   // o curinga numa das pontas
        }
      } else {
        if (falta || w === 0) break;
        falta = p;
      }
    }
    usados.forEach(x => { cnt[x]++; });
    return ok;
  }

  /** Divide os curingas da mão em "soltos" (bit 1) ou "como eles mesmos" (bit 0). */
  function separar(ids, cur) {
    const W = [], N = [];
    ids.forEach(id => (ehCuringa(id, cur) ? W : N).push(id));
    return { W, N };
  }

  /**
   * As cartas fecham em jogos (todas)? Devolve os jogos com as cartas de
   * verdade, na ordem de mostrar, ou null.
   */
  function arranjar(ids, cur) {
    if (ids.length < 3) return null;
    const { W, N } = separar(ids, cur);
    for (let mask = 0; mask < (1 << W.length); mask++) {
      const cnt = new Int8Array(TIPOS);
      let w = 0;
      N.forEach(id => { cnt[id % 52]++; });
      W.forEach((id, i) => { if ((mask >> i) & 1) w++; else cnt[id % 52]++; });
      const grupos = [];
      if (exato(cnt, w, grupos)) return montarGrupos(grupos, N, W, mask);
    }
    return null;
  }

  /** Troca os tipos dos jogos pelas cartas da mão e põe cada jogo na ordem de mostrar. */
  function montarGrupos(grupos, N, W, mask) {
    const porTipo = {};
    const pegar = t => { const l = porTipo[t]; return l && l.length ? l.shift() : null; };
    N.concat(W.filter((_, i) => !((mask >> i) & 1))).forEach(id => { (porTipo[id % 52] = porTipo[id % 52] || []).push(id); });
    const soltos = W.filter((_, i) => (mask >> i) & 1);
    return grupos.map(g => {
      const nat = g.nat.map(pegar);
      const cor = g.w ? soltos.shift() : null;
      let cartas;
      if (g.tipo === 'trinca') {
        cartas = nat.slice().sort((a, b) => ORDEM_NAIPE.indexOf(naipe(a)) - ORDEM_NAIPE.indexOf(naipe(b)));
        if (cor !== null) cartas.push(cor);
      } else {
        // posições de "de" até "ate" (14 = Ás no alto); o curinga no buraco, ou numa ponta
        const pos = p => (p === 14 ? 1 : p);
        const porPos = {};
        nat.forEach(id => { const v = valor(id); porPos[v === 1 && g.de > 1 ? 14 : v] = id; });
        cartas = [];
        for (let p = g.de; p <= g.ate; p++) cartas.push(porPos[p] !== undefined ? porPos[p] : cor);
        if (cor !== null && !g.falta) { if (g.ate < 14) cartas.push(cor); else cartas.unshift(cor); }
        void pos;
      }
      return { tipo: g.tipo, cartas, curinga: cor };
    });
  }

  // ================================================ quanto falta para bater
  /**
   * Quantas cartas faltam para as cartas (9 ou 10) virarem uma batida com
   * "alvo" cartas: maior número de cartas da mão que cabem em jogos completos
   * ou incompletos (o que falta conta como carta a comprar), com o tamanho
   * total dos jogos até o alvo. Os curingas tapam um buraco por jogo,
   * aumentam um jogo pronto ou abrem um jogo novo.
   * comGrupos: devolve também a melhor arrumação { faltam, grupos, soltas }.
   * meta (opcional, sem comGrupos): só interessa saber se faltam no máximo "meta" —
   * a busca para assim que acha e corta o que não chega lá (devolve meta ou mais).
   */
  function faltam(ids, cur, alvo, comGrupos, meta) {
    alvo = alvo || POR_MAO;
    const { W, N } = separar(ids, cur);
    let melhor = -1, melhorChave = -1, melhorPlano = null;
    const nW = W.length;
    const precisa = meta !== undefined && !comGrupos ? alvo - meta : Infinity;     // cartas aproveitadas que bastam
    // com 3 ou 4 curingas, tentar todas as combinações custa caro e quase nunca muda a conta: só "todos soltos" e "um como ele mesmo"
    const mascaras = [];
    for (let mask = (1 << nW) - 1; mask >= 0; mask--) if (nW <= 2 || nW - popcount(mask) <= 1) mascaras.push(mask);
    for (const mask of mascaras) {
      const cnt = new Int8Array(TIPOS);
      let w = 0, resto = 0;
      N.forEach(id => { cnt[id % 52]++; resto++; });
      W.forEach((id, i) => { if ((mask >> i) & 1) w++; else { cnt[id % 52]++; resto++; } });
      const pilha = [];
      const dfs = (t0, tam, kept, abertos, ext, completos) => {
        let t = t0;
        while (t < TIPOS && !cnt[t]) t++;
        if (t === TIPOS) {
          // os curingas: tapam buracos, aumentam jogos prontos, abrem jogos novos
          let k = kept, ta = tam, wl = w, comp = completos;
          const a = Math.min(wl, abertos); k += a; wl -= a;
          const b = Math.min(wl, ext, alvo - ta); k += b; ta += b; wl -= b;
          const c = Math.min(wl, Math.floor((alvo - ta) / 3)); k += c; ta += 3 * c; wl -= c;
          const chave = k * 1000 + comp * 10 - ta / 100;
          if (k > melhor || (comGrupos && k === melhor && chave > melhorChave)) {
            melhor = k; melhorChave = chave;
            if (comGrupos) melhorPlano = { grupos: pilha.map(g => Object.assign({}, g)), mask, w };
          }
          return;
        }
        if (melhor >= precisa) return;
        const teto = Math.min(alvo, kept + resto + w);
        if (teto <= melhor && !comGrupos) return;
        if (teto < melhor || teto < precisa && precisa !== Infinity) return;
        cnt[t]--; resto--;
        const v = t % 13 + 1, s = (t / 13) | 0;
        // 3) trincas (incompletas ou prontas) com t
        const outros = [];
        for (let s2 = s + 1; s2 < 4; s2++) if (cnt[s2 * 13 + v - 1]) outros.push(s2 * 13 + v - 1);
        for (let mask2 = (1 << outros.length) - 1; mask2 >= 1; mask2--) {
          const sel = [];
          for (let i = 0; i < outros.length; i++) if ((mask2 >> i) & 1) sel.push(outros[i]);
          const k = 1 + sel.length, tamG = Math.max(3, k), ph = tamG - k;
          if (tam + tamG > alvo) continue;
          sel.forEach(x => { cnt[x]--; }); resto -= sel.length;
          pilha.push({ tipo: 'trinca', nat: [t].concat(sel), ph });
          dfs(t, tam + tamG, kept + k, abertos + (ph > 0 ? 1 : 0), ext + (ph === 0 && k === 3 ? 1 : 0), completos + (ph === 0 ? 1 : 0));
          pilha.pop();
          sel.forEach(x => { cnt[x]++; }); resto += sel.length;
        }
        // 4) sequências (incompletas ou prontas) com t como a menor natural; até 2 buracos
        const seqDe = (base, sentido) => {
          const escolhidos = [];
          const ext2 = (ultimo, buracos) => {
            for (let p = ultimo + sentido, pulo = 0; sentido > 0 ? p <= 13 : p >= 2; p += sentido, pulo++) {
              if (pulo > buracos) break;
              const tp = s * 13 + p - 1;
              if (!cnt[tp]) continue;
              const restoBuracos = buracos - pulo;
              cnt[tp]--; resto--; escolhidos.push(tp);
              const span = Math.abs(p - base) + 1, k = 1 + escolhidos.length;
              const tamG = Math.max(3, span), ph = tamG - k;
              if (tam + tamG <= alvo) {
                pilha.push({ tipo: 'seq', nat: [t].concat(escolhidos), ph, naipe: s, de: Math.min(base, p), ate: Math.max(base, p) });
                dfs(t, tam + tamG, kept + k, abertos + (ph > 0 ? 1 : 0), ext + (ph === 0 ? 1 : 0), completos + (ph === 0 ? 1 : 0));
                pilha.pop();
                ext2(p, restoBuracos);
              }
              escolhidos.pop(); cnt[tp]++; resto++;
            }
          };
          ext2(base, 2);
        };
        seqDe(v, 1);
        if (v === 1) seqDe(14, -1);
        // por último (os jogos primeiro: acham logo uma boa arrumação e o resto da busca é cortado)
        // 2) t sozinha, esperando duas cartas
        if (tam + 3 <= alvo) { pilha.push({ tipo: 'solta', nat: [t], ph: 2 }); dfs(t, tam + 3, kept + 1, abertos + 1, ext, completos); pilha.pop(); }
        // 1) deixar t de fora (vai ser trocada)
        dfs(t, tam, kept, abertos, ext, completos);
        cnt[t]++; resto++;
      };
      dfs(0, 0, 0, 0, 0, 0);
      if ((melhor >= alvo || melhor >= precisa) && !comGrupos) break;
    }
    const f = Math.max(0, alvo - melhor);
    if (!comGrupos) return f;
    return Object.assign({ faltam: f }, planoComCartas(melhorPlano, N, W, ids));
  }
  const popcount = x => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

  /** A arrumação para mostrar: jogos (prontos ou faltando), com as cartas de verdade, e as soltas. */
  function planoComCartas(plano, N, W, ids) {
    if (!plano) return { grupos: [], soltas: ids.slice() };
    const porTipo = {};
    N.concat(W.filter((_, i) => !((plano.mask >> i) & 1))).forEach(id => { (porTipo[id % 52] = porTipo[id % 52] || []).push(id); });
    const soltosW = W.filter((_, i) => (plano.mask >> i) & 1);
    const usados = new Set();
    const grupos = plano.grupos.filter(g => g.tipo !== 'solta' || true).map(g => {
      const cartas = g.nat.map(t => { const id = porTipo[t].shift(); usados.add(id); return id; });
      return { tipo: g.tipo === 'solta' ? 'solta' : g.tipo, cartas, faltam: g.ph, naipe: g.naipe, de: g.de, ate: g.ate };
    });
    // os curingas vão primeiro para os jogos que faltam carta, depois aumentam um pronto
    grupos.filter(g => g.faltam > 0 && g.tipo !== 'solta').concat(grupos.filter(g => g.tipo === 'solta'), grupos.filter(g => !g.faltam))
      .forEach(g => { if (soltosW.length && !g.comCuringa) { const id = soltosW.shift(); g.cartas.push(id); usados.add(id); g.comCuringa = true; g.faltam = Math.max(0, g.faltam - 1); } });
    soltosW.forEach(id => { grupos.push({ tipo: 'solta', cartas: [id], faltam: 2, comCuringa: true }); usados.add(id); });
    grupos.forEach(g => {
      if (g.tipo === 'trinca') g.cartas.sort((a, b) => (ehCuringaGrupo(b, g) - ehCuringaGrupo(a, g)) || ORDEM_NAIPE.indexOf(naipe(a)) - ORDEM_NAIPE.indexOf(naipe(b)));
      if (g.tipo === 'seq') g.cartas.sort((a, b) => ordemSeq(a, g) - ordemSeq(b, g));
    });
    const soltas = ids.filter(id => !usados.has(id));
    // jogos prontos primeiro, depois os que faltam pouco
    grupos.sort((a, b) => (a.faltam - b.faltam) || (b.cartas.length - a.cartas.length));
    return { grupos, soltas };
  }
  // dentro do desenho: o curinga solto fica no fim do jogo (as naturais em ordem)
  const ehCuringaGrupo = (id, g) => (g.comCuringa && g.cartas[g.cartas.length - 1] === id ? -1 : 0);
  function ordemSeq(id, g) {
    if (g.comCuringa && g.cartas[g.cartas.length - 1] === id && (id % 52 !== ((g.naipe * 13) + valor(id) - 1) || false)) return 99;
    const v = valor(id);
    return v === 1 && g.de > 1 ? 14 : v;
  }

  // ======================================================== bater
  /**
   * Batidas possíveis com as 10 cartas (depois de comprar):
   * { com10: jogos | null, com9: [{ descarte, jogos }] } — com9 traz uma por carta diferente.
   */
  function batidas(mao10, cur) {
    const out = { com10: null, com9: [] };
    if (faltam(mao10, cur, 10) === 0) out.com10 = arranjar(mao10, cur);
    if (faltam(mao10, cur, 9) === 0) {
      const vistos = new Set();
      mao10.forEach(x => {
        const chave = ehCuringa(x, cur) ? 'c' : x % 52;
        if (vistos.has(chave)) return;
        vistos.add(chave);
        const resto = mao10.filter(y => y !== x);
        const j = arranjar(resto, cur);
        if (j) out.com9.push({ descarte: x, jogos: j });
      });
    }
    return out;
  }
  /** Bate com essa batida? (o motor confere) com: 10 | 9 */
  function confere(mao, cur, com, descarte) {
    if (com === 10) return mao.length === 10 && !!arranjar(mao, cur);
    if (mao.length !== 10 || mao.indexOf(descarte) < 0) return false;
    return !!arranjar(mao.filter(x => x !== descarte), cur);
  }

  /** Arruma a mão para mostrar: 'jogos' (os jogos juntos e as soltas no fim), 'naipe' ou 'valor'. */
  function ordenar(ids, cur, modo) {
    const porNaipe = (a, b) => (ehCuringa(b, cur) - ehCuringa(a, cur)) || (ORDEM_NAIPE.indexOf(naipe(a)) - ORDEM_NAIPE.indexOf(naipe(b))) || (valor(a) - valor(b)) || a - b;
    const porValor = (a, b) => (ehCuringa(b, cur) - ehCuringa(a, cur)) || (valor(a) - valor(b)) || (ORDEM_NAIPE.indexOf(naipe(a)) - ORDEM_NAIPE.indexOf(naipe(b))) || a - b;
    if (modo === 'valor') return [ids.slice().sort(porValor)];
    if (modo === 'naipe') return [ids.slice().sort(porNaipe)];
    const pl = faltam(ids, cur, Math.max(POR_MAO, Math.min(10, ids.length)), true);
    const blocos = pl.grupos.filter(g => g.cartas.length > 1).map(g => g.cartas);
    const soltas = pl.soltas.concat(...pl.grupos.filter(g => g.cartas.length <= 1).map(g => g.cartas)).sort(porNaipe);
    if (soltas.length) blocos.push(soltas);
    return blocos;
  }

  /** Próximo vivo depois de j (pula quem já saiu). */
  function proximoVivo(j, vivos, n) {
    for (let k = 1; k <= n; k++) { const x = (j + k) % n; if (vivos[x]) return x; }
    return j;
  }

  K.Regras = {
    TOTAL, TIPOS, POR_MAO, NAIPES, NOMES_NAIPE, ROTULO, NOME_VALOR, ORDEM_NAIPE, OPCOES_PADRAO,
    tipo, naipe, valor, tipoDe, vermelho, nome, nomeTipo, pokerId, opcoes,
    curingaDe, ehCuringa, nomeCuringa, arranjar, faltam, batidas, confere, ordenar, proximoVivo
  };
})(window.Poker = window.Poker || {});
