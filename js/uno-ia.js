/* ==========================================================================
   OUTS · Treino Lab — uno-ia.js
   A cabeça dos bots (e do coach) do "Última!".

   1) Leitura das mãos: ninguém vê as cartas dos outros, mas a mesa conta
      muito. Quem comprou quando a cor era azul quase certamente não tinha
      azul (nem coringa); quem escolheu verde no coringa costuma ter verde;
      quem foi desafiado no +4 e não blefou não tinha a cor. Com isso, cada
      carta que não se vê ganha um peso para estar na mão de cada um.
   2) Simulação (Monte Carlo): sorteia várias vezes as mãos dos outros e o
      resto do baralho, de acordo com esses pesos, e joga a mão até o fim
      para cada jogada possível agora (cada carta, cada cor do coringa,
      comprar, desafiar), com todos jogando de um jeito sensato. A jogada que
      ganha a mão mais vezes é a escolhida.
   3) Leitor: aprende quanto cada jogador blefa no +4 e quanto desafia
      (no fim de cada mão todo mundo vê as cartas), e os bots lembram disso
      de uma partida para outra.
   ========================================================================== */
(function (P) {
  'use strict';

  const U = P.Uno, R = U.Regras, RNG = P.RNG;
  const C = R.CARTAS;
  const QUAL_MAIS4 = id => C[id].tipo === 'mais4';

  // ---------------------------------------------------------- leitura das mãos
  /**
   * Pesos de cada adversário: falta[cor] (0 = nada indica; 1 = certeza de que
   * não tem), faltaCoringa, gosta[cor] (escolheu essa cor num coringa).
   * Refeito a partir do histórico público da mão.
   */
  function inferir(vista) {
    const n = vista.n;
    const inf = Array.from({ length: n }, () => ({ falta: [0, 0, 0, 0], faltaCoringa: 0, gosta: [0, 0, 0, 0] }));
    const tam = new Array(n).fill(7);
    const encolher = (k, q) => {       // comprou q cartas: o que se sabia vale menos
      const f = Math.max(0, 1 - q / Math.max(1, tam[k]));
      const x = inf[k];
      for (let c = 0; c < 4; c++) { x.falta[c] *= f; x.gosta[c] *= f; }
      x.faltaCoringa *= f;
    };
    vista.historico.forEach(h => {
      if (h.j === undefined) return;
      const x = inf[h.j];
      if (h.acao === 'comprou') {
        if (h.motivo === 'vez' && h.corMesa >= 0) {
          // comprou na própria vez: quase sempre é porque não tinha a cor (nem coringa)
          tam[h.j] += h.qtd;
          encolher(h.j, h.qtd);
          x.falta[h.corMesa] = Math.max(x.falta[h.corMesa], 0.9);
          x.faltaCoringa = Math.max(x.faltaCoringa, 0.7);
        } else { tam[h.j] += h.qtd; encolher(h.j, h.qtd); }
      } else if (h.acao === 'jogou') {
        tam[h.j] = Math.max(0, tam[h.j] - 1);
        const c = C[h.carta];
        if (c.coringa) {
          x.gosta[h.cor] = 1; x.falta[h.cor] = 0;
          if (c.tipo === 'coringa' && h.corAntes >= 0) x.falta[h.corAntes] = Math.max(x.falta[h.corAntes], 0.45);   // gastou o coringa: talvez sem a cor
        }
      } else if (h.acao === 'desafiou') {
        const y = inf[h.contra];
        const jog = vista.historico.slice().reverse().find(z => z.acao === 'jogou' && z.j === h.contra && QUAL_MAIS4(z.carta));
        if (jog) y.falta[jog.corAntes] = h.culpado ? 0 : 1;
      }
    });
    return inf;
  }

  /** Cartas que eu não vejo (nem na minha mão nem na pilha de descarte). */
  function naoVistas(vista) {
    const vistas = new Uint8Array(R.TOTAL);
    vista.mao.forEach(id => { vistas[id] = 1; });
    vista.descarte.forEach(id => { vistas[id] = 1; });
    const out = [];
    for (let id = 0; id < R.TOTAL; id++) if (!vistas[id]) out.push(id);
    return out;
  }

  /** Peso de a carta id estar na mão de quem tem a leitura x. */
  function peso(id, x) {
    const c = C[id];
    if (c.coringa) return Math.max(0.03, 1 - x.faltaCoringa);
    return Math.max(0.03, 1 - x.falta[c.cor]) * (1 + 0.6 * x.gosta[c.cor]);
  }

  /** Sorteia as mãos dos outros (pelos pesos) e a ordem da compra. */
  function sortearMundo(vista, inf) {
    const pool = naoVistas(vista);
    const maos = vista.nCartas.map(() => []);
    maos[vista.eu] = vista.mao.slice();
    const vivos = pool.slice();
    for (let k = 0; k < vista.n; k++) {
      if (k === vista.eu) continue;
      for (let t = 0; t < vista.nCartas[k] && vivos.length; t++) {
        let soma = 0;
        for (let i = 0; i < vivos.length; i++) soma += peso(vivos[i], inf[k]);
        let r = RNG.real() * soma, i = 0;
        for (; i < vivos.length - 1; i++) { r -= peso(vivos[i], inf[k]); if (r <= 0) break; }
        maos[k].push(vivos[i]);
        vivos.splice(i, 1);
      }
    }
    return { maos, compra: P.Baralho.embaralhar(vivos) };
  }

  // ------------------------------------------------------------- simulação
  /**
   * Estado leve da simulação: mãos, compra, topo, cor, sentido, vez, pendente,
   * descarte (só a contagem e as cartas para reembaralhar).
   */
  function estadoDe(vista, mundo) {
    return {
      n: vista.n, op: vista.opcoes, maos: mundo.maos, compra: mundo.compra, descarte: vista.descarte.slice(0, -1),
      topo: vista.topo, cor: vista.cor, sentido: vista.sentido, vez: vista.vez,
      pendente: vista.pendente ? Object.assign({}, vista.pendente) : null
    };
  }
  function clonar(s) {
    return { n: s.n, op: s.op, maos: s.maos.map(x => x.slice()), compra: s.compra.slice(), descarte: s.descarte.slice(), topo: s.topo, cor: s.cor, sentido: s.sentido, vez: s.vez, pendente: s.pendente ? Object.assign({}, s.pendente) : null };
  }
  const proxS = (s, j, p) => R.proximo(j, s.sentido, s.n, p);
  function tirarS(s) {
    if (!s.compra.length) {
      if (!s.descarte.length) return null;
      s.compra = P.Baralho.embaralhar(s.descarte);
      s.descarte = [];
    }
    return s.compra.pop();
  }
  function comprarS(s, j, q) { for (let k = 0; k < q; k++) { const c = tirarS(s); if (c === null) return; s.maos[j].push(c); } }
  /** Joga a carta id (o lugar j tem a carta). Devolve o vencedor se a mão acabou. desafiado: quem recebe o +4 desafia. */
  function jogarS(s, j, id, cor, desafiado) {
    const c = C[id], mao = s.maos[j];
    mao.splice(mao.indexOf(id), 1);
    const corAntes = s.cor;
    s.descarte.push(s.topo);
    s.topo = id;
    s.cor = c.coringa ? cor : c.cor;
    const alvo = proxS(s, j);
    const ganhou = mao.length === 0;
    if (c.tipo === 'pular') s.vez = proxS(s, j, 2);
    else if (c.tipo === 'inverter') { if (s.n === 2) s.vez = j; else { s.sentido = -s.sentido; s.vez = proxS(s, j); } }
    else if (c.tipo === 'mais2' || c.tipo === 'mais4') {
      const qtd = (s.pendente ? s.pendente.qtd : 0) + (c.tipo === 'mais2' ? 2 : 4);
      if (s.op.acumular && !ganhou) { s.pendente = { qtd, tipo: c.tipo }; s.vez = alvo; }
      else if (c.tipo === 'mais4' && desafiado && s.op.desafio && !s.pendente && !ganhou) {
        const blefe = R.temCor(mao, corAntes);
        if (blefe) { comprarS(s, j, 4); s.vez = alvo; } else { comprarS(s, alvo, 6); s.vez = proxS(s, j, 2); }
      } else { s.pendente = null; comprarS(s, alvo, qtd); s.vez = proxS(s, j, 2); }
    } else s.vez = alvo;
    return ganhou ? j : null;
  }

  /** Várias cartas de número iguais de uma vez (a última fica por cima). */
  function jogarVariasS(s, j, ids) {
    const mao = s.maos[j];
    ids.forEach(id => { mao.splice(mao.indexOf(id), 1); s.descarte.push(s.topo); s.topo = id; s.cor = C[id].cor; });
    s.vez = proxS(s, j);
    return mao.length === 0 ? j : null;
  }
  /** Para jogar juntas: id primeiro, as iguais no meio e por último a da cor que mais sobra na mão. */
  function ordemJuntas(mao, id) {
    const g = R.iguais(mao, id);
    if (!g.length) return null;
    const resto = mao.filter(x => x !== id && g.indexOf(x) < 0);
    const porCor = [0, 0, 0, 0];
    resto.forEach(x => { if (!C[x].coringa) porCor[C[x].cor]++; });
    g.sort((a, b) => porCor[C[a].cor] - porCor[C[b].cor]);
    return [id].concat(g);
  }

  /** Cor para um coringa: a que mais aparece na mão (o próprio coringa não conta). */
  function melhorCor(mao, sem) {
    const cont = [0, 0, 0, 0];
    mao.forEach(id => { if (id !== sem && !C[id].coringa) cont[C[id].cor] += 1 + (C[id].acao ? 0.5 : 0); });
    let b = RNG.inteiroAbaixo(4);
    for (let c = 0; c < 4; c++) if (cont[c] > cont[b]) b = c;
    return b;
  }

  /**
   * Jeito "sensato" de jogar usado nas simulações (por todos): ataca quem
   * está quase saindo, guarda os coringas, segue a cor que tem mais cartas,
   * solta as cartas de mais pontos.
   */
  function politica(s, j) {
    const mao = s.maos[j];
    if (s.pendente) {
      const resp = R.jogaveis(mao, s.topo, s.cor, s.op, s.pendente);
      if (resp.length) { const id = resp[0]; return jogarS(s, j, id, melhorCor(mao, id)); }
      comprarS(s, j, s.pendente.qtd); s.pendente = null; s.vez = proxS(s, j); return null;
    }
    const leg = R.jogaveis(mao, s.topo, s.cor, s.op, null);
    if (!leg.length) {
      let c = null;
      for (let g = 0; g < 108; g++) {
        c = tirarS(s); if (c === null) break;
        mao.push(c);
        if (!s.op.comprarAtePoder || R.casa(c, s.topo, s.cor)) break;
      }
      if (c !== null && R.casa(c, s.topo, s.cor) && !(C[c].tipo === 'mais4' && !s.op.desafio && R.temCor(mao, s.cor) && mao.length > 1)) return jogarS(s, j, c, melhorCor(mao, c));
      s.vez = proxS(s, j); return null;
    }
    const alvo = proxS(s, j), nAlvo = s.maos[alvo].length;
    const porCor = [0, 0, 0, 0];
    mao.forEach(id => { if (!C[id].coringa) porCor[C[id].cor]++; });
    let melhor = null, nota = -1e9;
    for (let i = 0; i < leg.length; i++) {
      const id = leg[i], c = C[id];
      let v = RNG.real() * 0.5;
      if (c.coringa) {
        v -= mao.length > 2 ? 8 : 0;
        if (c.tipo === 'mais4') { v += nAlvo <= 2 ? 12 : -4; if (R.temCor(mao, s.cor)) v -= 20; }
      } else {
        v += porCor[c.cor] * 1.5;
        if (c.tipo === 'mais2' || c.tipo === 'pular') v += nAlvo <= 2 ? 10 : 1;
        if (c.tipo === 'num') v += c.num * 0.15;
        else v += 0.8;
      }
      if (v > nota) { nota = v; melhor = id; }
    }
    if (s.op.juntas && C[melhor].tipo === 'num') { const ids = ordemJuntas(mao, melhor); if (ids) return jogarVariasS(s, j, ids); }
    return jogarS(s, j, melhor, melhorCor(mao, melhor));
  }

  /** Joga até alguém zerar a mão. Devolve o vencedor (ou -1 se passar do limite). */
  function ateOFim(s) {
    for (let k = 0; k < 600; k++) {
      const v = politica(s, s.vez);
      if (v !== null) return v;
    }
    return -1;
  }

  // ------------------------------------------------------- jogadas possíveis
  /**
   * As jogadas de agora: cada carta diferente (os dois 7 verdes contam uma vez),
   * cada cor para os coringas, comprar, passar, desafiar.
   * Devolve [{ tipo, carta, cor, blefe }].
   */
  function opcoesDe(vista) {
    const out = [];
    const vistos = new Set();
    const cores = [0, 1, 2, 3];
    vista.jogaveis.forEach(id => {
      const c = C[id];
      if (vistos.has(c.sig)) return;
      vistos.add(c.sig);
      if (c.coringa) cores.forEach(cor => out.push({ tipo: 'carta', carta: id, cor, blefe: c.tipo === 'mais4' && !vista.pendente && R.temCor(vista.mao.filter(x => x !== id), vista.cor) }));
      else out.push({ tipo: 'carta', carta: id });
    });
    // regra "jogar cartas iguais juntas": todas as de um número, terminando em cada cor possível
    if (vista.opcoes && vista.opcoes.juntas && !vista.pendente && vista.fase !== 'depoisDeComprar') {
      const porNum = {};
      vista.mao.forEach(id => { const c = C[id]; if (c.tipo === 'num') (porNum[c.num] = porNum[c.num] || []).push(id); });
      Object.keys(porNum).forEach(k => {
        const g = porNum[k];
        if (g.length < 2) return;
        const primeiras = g.filter(id => vista.jogaveis.indexOf(id) >= 0);
        if (!primeiras.length) return;
        const ultimas = new Set();
        g.forEach(ult => {
          if (ultimas.has(C[ult].sig)) return;
          const f = primeiras.find(x => x !== ult);
          if (f === undefined) return;
          ultimas.add(C[ult].sig);
          out.push({ tipo: 'carta', carta: f, cartas: [f].concat(g.filter(x => x !== f && x !== ult), [ult]) });
        });
      });
    }
    if (vista.fase === 'depoisDeComprar') out.push(vista.opcoes && vista.opcoes.comprarAtePoder && !vista.jogaveis.length ? { tipo: 'comprar' } : { tipo: 'passar' });
    else {
      out.push({ tipo: 'comprar' });
      if (vista.podeDesafiar) out.push({ tipo: 'desafiar' });
    }
    return out;
  }

  /** Aplica uma jogada minha no estado simulado. Devolve o vencedor se a mão acabou. */
  function aplicar(s, eu, o, desafio) {
    if (o.tipo === 'carta' && o.cartas && o.cartas.length > 1) return jogarVariasS(s, eu, o.cartas);
    if (o.tipo === 'carta') return jogarS(s, eu, o.carta, o.cor, desafio);
    if (o.tipo === 'passar') { s.vez = proxS(s, eu); return null; }
    if (o.tipo === 'desafiar') {
      const p = s.pendente; s.pendente = null;
      const ofensor = p.de;
      if (R.temCor(s.maos[ofensor], p.corAntes)) { comprarS(s, ofensor, 4); s.vez = eu; return politica(s, eu); }
      comprarS(s, eu, 6); s.vez = proxS(s, eu); return null;
    }
    // comprar
    if (s.pendente) { comprarS(s, eu, s.pendente.qtd); s.pendente = null; s.vez = proxS(s, eu); return null; }
    return politica(s, eu);   // comprar (pela política: compra porque escolheu não jogar? — aqui: força a compra)
  }

  /** Nota da jogada pelo jeito "sensato" (usada para desempatar jogadas que a simulação acha iguais). */
  function notaSensata(vista, o) {
    if (o.tipo !== 'carta') return o.tipo === 'desafiar' ? 0 : -6;
    const c = C[o.carta], mao = vista.mao;
    if (o.cartas && o.cartas.length > 1) {
      const ult = C[o.cartas[o.cartas.length - 1]];
      return 2 * o.cartas.length + mao.filter(id => o.cartas.indexOf(id) < 0 && !C[id].coringa && C[id].cor === ult.cor).length * 1.5 + c.num * 0.15;
    }
    const alvo = R.proximo(vista.eu, vista.sentido, vista.n), nAlvo = vista.nCartas[alvo];
    let v = 0;
    if (c.coringa) {
      v -= mao.length > 2 ? 8 : 0;
      if (c.tipo === 'mais4') v += nAlvo <= 2 ? 12 : -4;
      if (o.blefe) v -= 6;
      const porCor = mao.filter(id => id !== o.carta && !C[id].coringa && C[id].cor === o.cor).length;
      v += porCor * 1.5;
    } else {
      v += mao.filter(id => !C[id].coringa && C[id].cor === c.cor).length * 1.5;
      if (c.tipo === 'mais2' || c.tipo === 'pular') v += nAlvo <= 2 ? 10 : 1;
      if (c.tipo === 'num') v += c.num * 0.15; else v += 0.8;
    }
    return v;
  }

  /**
   * Avalia cada jogada possível: chance de ganhar a mão (e pontos esperados).
   * As simulações vão em rodadas: depois de cada uma, as jogadas claramente
   * piores saem e as boas ganham mais sorteios (a conta fica precisa onde importa).
   * opts: { amostras (sorteios por jogada na 1ª rodada; o total é ~4×), modelos (leitura de cada lugar: { blefe, desafio }) }
   * Devolve [{ ...opcao, p, pts, n (sorteios), ep (erro padrão) }] do melhor para o pior.
   */
  function avaliar(vista, opts) {
    opts = opts || {};
    const N0 = Math.max(8, Math.round((opts.amostras || 60) / 2));
    const ops = opcoesDe(vista);
    if (ops.length === 1) return [Object.assign({ p: NaN, pts: 0, unica: true }, ops[0])];
    const inf = inferir(vista);
    const eu = vista.eu;
    const res = ops.map(() => ({ w: 0, w2: 0, ganha: 0, pts: 0, n: 0 }));
    const alvo = R.proximo(eu, vista.sentido, vista.n);
    const desafioDe = j => { const m = opts.modelos && opts.modelos[j]; return m ? m.desafio : 0.3; };
    const blefeDe = j => { const m = opts.modelos && opts.modelos[j]; return m ? m.blefe : 0.3; };
    const pDe = k => (res[k].w ? res[k].ganha / res[k].w : 0);
    function rodada(ativos, N) {
      for (let a = 0; a < N; a++) {
        const mundo = sortearMundo(vista, inf);
        const base = estadoDe(vista, mundo);
        // desafio: quanto este mundo combina com o +4 que recebemos (blefe tem a chance de quem jogou blefar)
        let w = 1;
        if (vista.podeDesafiar && vista.pendente) w = R.temCor(mundo.maos[vista.pendente.de], vista.pendente.corAntes) ? blefeDe(vista.pendente.de) : 1;
        const desafiaMeu = RNG.real() < desafioDe(alvo);
        for (const k of ativos) {
          const s = clonar(base);
          s.vez = eu;
          let v;
          if (ops[k].tipo === 'comprar' && !s.pendente) {
            // comprar na vez: 1 carta (ou até poder) e a política decide se joga a comprada
            const mao = s.maos[eu];
            let c = null;
            for (let g = 0; g < 108; g++) { c = tirarS(s); if (c === null) break; mao.push(c); if (!s.op.comprarAtePoder || R.casa(c, s.topo, s.cor)) break; }
            if (c !== null && R.casa(c, s.topo, s.cor) && !(C[c].tipo === 'mais4' && R.temCor(mao, s.cor))) v = jogarS(s, eu, c, melhorCor(mao, c));
            else { s.vez = proxS(s, eu); v = null; }
          } else v = aplicar(s, eu, ops[k], desafiaMeu);
          if (v === null) v = ateOFim(s);
          const r = res[k];
          r.w += w; r.w2 += w * w; r.n++;
          if (v === eu) {
            r.ganha += w;
            let pts = 0; s.maos.forEach((x, j) => { if (j !== eu) pts += R.pontosDaMao(x); });
            r.pts += w * pts;
          }
        }
      }
    }
    let ativos = ops.map((_, k) => k);
    const tamanhos = [N0, N0, 2 * N0, 4 * N0];
    for (let r = 0; r < tamanhos.length && ativos.length > 1; r++) {
      rodada(ativos, tamanhos[r]);
      if (r === tamanhos.length - 1) break;
      // fica a metade de cima e quem ainda está perto do melhor (dentro de ~2 erros padrão)
      ativos.sort((a, b) => pDe(b) - pDe(a));
      const best = pDe(ativos[0]);
      const ep = k => { const p = pDe(k), nEf = res[k].w * res[k].w / Math.max(1e-9, res[k].w2); return Math.sqrt(Math.max(p * (1 - p), 0.02) / Math.max(1, nEf)); };
      const meio = Math.max(2, Math.ceil(ativos.length / 2));
      ativos = ativos.filter((k, i) => i < meio || best - pDe(k) < 2 * Math.hypot(ep(k), ep(ativos[0])));
    }
    const out = ops.map((o, k) => {
      const r = res[k], p = pDe(k), nEf = r.w ? r.w * r.w / Math.max(1e-9, r.w2) : 0;
      return Object.assign({}, o, { p, pts: r.w ? r.pts / r.w : 0, n: r.n, ep: nEf ? Math.sqrt(Math.max(p * (1 - p), 0.01) / nEf) : 1, sensata: notaSensata(vista, o) });
    });
    // melhor primeiro; entre jogadas que a simulação não separa (dentro do erro), a "sensata"
    out.sort((x, y) => y.p - x.p);
    const topo = out[0];
    const empatadas = out.filter(o => o.n >= topo.n * 0.5 && topo.p - o.p < Math.max(0.012, 0.8 * Math.hypot(o.ep, topo.ep)));
    if (empatadas.length > 1) {
      empatadas.sort((x, y) => y.sensata - x.sensata);
      const escolhida = empatadas[0];
      out.splice(out.indexOf(escolhida), 1);
      out.unshift(escolhida);
    }
    return out;
  }

  /** Chance de o +4 que recebi ser blefe (para o coach explicar o desafio). */
  function chanceBlefe(vista, opts) {
    if (!vista.pendente || vista.pendente.tipo !== 'mais4') return null;
    const inf = inferir(vista), N = (opts && opts.amostras) || 200;
    const m = opts && opts.modelos && opts.modelos[vista.pendente.de];
    const b = m ? m.blefe : 0.3;
    let tem = 0;
    for (let a = 0; a < N; a++) { const mundo = sortearMundo(vista, inf); if (R.temCor(mundo.maos[vista.pendente.de], vista.pendente.corAntes)) tem++; }
    const pTem = tem / N;
    return { pTemCor: pTem, pBlefe: pTem * b / (pTem * b + (1 - pTem)) };
  }

  // ------------------------------------------------------------------ leitor
  /**
   * Aprende de cada lugar: quanto blefa no +4 (no fim da mão todos veem as
   * cartas, então dá para saber se o +4 foi limpo) e quanto desafia quando
   * recebe um +4. modelo(j) mistura o visto com um padrão.
   */
  const PADRAO_LEITURA = { blefe: [0.25, 4], desafio: [0.3, 4] };
  function criarLeitor() {
    const contas = {};
    const de = j => contas[j] || (contas[j] = { blefe: [0, 0], desafio: [0, 0] });
    let esperando = null;      // quem recebeu um +4 e ainda vai decidir
    function observar(ev) {
      if (ev.tipo === 'efeito' && ev.efeito === 'mais4') esperando = ev.alvo;
      else if (ev.tipo === 'desafio') { const x = de(ev.j); x.desafio[0]++; x.desafio[1]++; esperando = null; }
      else if (ev.tipo === 'compra' && ev.motivo === 'mais4' && esperando === ev.j) { de(ev.j).desafio[1]++; esperando = null; }
      else if (ev.tipo === 'fimMao' && ev.mais4) ev.mais4.forEach(x => { const y = de(x.j); y.blefe[1]++; if (x.blefe) y.blefe[0]++; });
    }
    function modelo(j) {
      const x = contas[j], out = {};
      ['blefe', 'desafio'].forEach(k => { const [p, w] = PADRAO_LEITURA[k]; out[k] = x ? (p * w + x[k][0]) / (w + x[k][1]) : p; });
      return out;
    }
    function exportar(j) { return JSON.parse(JSON.stringify(de(j))); }
    function somar(j, c) {
      if (!c) return;
      const x = de(j);
      ['blefe', 'desafio'].forEach(k => { if (Array.isArray(c[k]) && c[k].length === 2) { x[k][0] += +c[k][0] || 0; x[k][1] += +c[k][1] || 0; } });
    }
    return { observar, modelo, exportar, somar };
  }
  function juntarLeituras(a, b, limite) {
    const L = limite || 60, out = {};
    ['blefe', 'desafio'].forEach(k => {
      const x = (a && a[k]) || [0, 0], y = (b && b[k]) || [0, 0];
      let f = (+x[0] || 0) + (+y[0] || 0), t = (+x[1] || 0) + (+y[1] || 0);
      if (t > L) { f = f * L / t; t = L; }
      out[k] = [Math.round(f * 100) / 100, Math.round(t * 100) / 100];
    });
    return out;
  }

  // -------------------------------------------------------------------- bots
  /**
   * Estilos (todos fazem a conta; mudam no tempero):
   *   estrategista: o que ganha mais vezes, sem firula;
   *   atacante: na dúvida, ataca (+2, Pular, +4) e blefa mais no +4;
   *   paciente: na dúvida, guarda coringas e cartas de ação; quase não blefa.
   * margem: quanto de chance aceita perder por causa do estilo.
   */
  const PERFIS = {
    estrategista: { nome: 'Estrategista', sigla: 'EST', cor: '#b794f4', descricao: 'Faz a conta de cada jogada e lê o que os outros têm pelo que compram e pelas cores que escolhem.', amostras: 70, margem: 0, ataque: 0, guarda: 0, blefe: 1, esquece: 0, reacao: [600, 1300] },
    atacante: { nome: 'Atacante', sigla: 'ATA', cor: '#e5484d', descricao: 'Também faz a conta, mas na dúvida ataca: +2, Pular e +4 em quem está perto de sair.', amostras: 55, margem: 0.03, ataque: 1, guarda: 0, blefe: 1.6, esquece: 0.04, reacao: [800, 1700] },
    paciente: { nome: 'Paciente', sigla: 'PAC', cor: '#4c9aff', descricao: 'Faz a conta e, na dúvida, guarda coringas e cartas de ação para o fim.', amostras: 55, margem: 0.03, ataque: 0, guarda: 1, blefe: 0.4, esquece: 0.02, reacao: [900, 2000] }
  };
  const LISTA_PERFIS = Object.keys(PERFIS);
  /** Níveis do lobby: no Mestre todos fazem a conta inteira. */
  const NIVEIS = {
    mestre: { nome: 'Mestre', amostras: 1, erro: 0 },
    medio: { nome: 'Médio', amostras: 0.3, erro: 0.12 },
    facil: { nome: 'Fácil', amostras: 0, erro: 0.3 }
  };
  const NOMES = ['Dani', 'Rafa', 'Teca', 'Juca', 'Mila', 'Beto', 'Lia', 'Nino', 'Zuzu', 'Cacá', 'Duda', 'Gui', 'Bel', 'Tato', 'Nana', 'Lelo', 'Fifi', 'Vavá'];

  function criarBot(perfil, ajustes) {
    const cfg = PERFIS[perfil] || PERFIS.estrategista;
    const nivel = NIVEIS[(ajustes && ajustes.nivel) || 'mestre'] || NIVEIS.mestre;
    const leitor = criarLeitor();
    if (ajustes && ajustes.memoria) Object.keys(ajustes.memoria).forEach(j => leitor.somar(+j, ajustes.memoria[j]));
    const amostras = Math.round(((ajustes && ajustes.amostras) || cfg.amostras) * nivel.amostras);

    function modelos(vista) { const m = []; for (let j = 0; j < vista.n; j++) m.push(j === vista.eu ? null : leitor.modelo(j)); return m; }

    /** Tempero do estilo: entre jogadas quase iguais, a do jeito dele. */
    function gosto(o) {
      if (o.tipo !== 'carta') return 0;
      const c = C[o.carta];
      let g = 0;
      if (cfg.ataque && (c.tipo === 'mais2' || c.tipo === 'pular' || c.tipo === 'mais4')) g += 0.02 * cfg.ataque;
      if (cfg.guarda && (c.coringa || c.acao)) g -= 0.02 * cfg.guarda;
      if (o.blefe) g += (cfg.blefe - 1) * 0.02;
      return g;
    }

    function escolher(vista) {
      const ops = opcoesDe(vista);
      if (ops.length === 1) return ops[0];
      // fácil (ou um erro do médio): a política simples
      if (!amostras || RNG.chance(nivel.erro)) {
        const cartas = ops.filter(o => o.tipo === 'carta' && !o.blefe);
        if (vista.podeDesafiar) return RNG.chance(0.3) ? { tipo: 'desafiar' } : { tipo: 'comprar' };
        if (!cartas.length) return ops.find(o => o.tipo === 'passar') || { tipo: 'comprar' };
        const o = cartas[RNG.inteiroAbaixo(cartas.length)];
        if (o.cartas) return o;
        const id = o.carta;
        return { tipo: 'carta', carta: id, cor: C[id].coringa ? melhorCor(vista.mao, id) : undefined };
      }
      const av = avaliar(vista, { amostras, modelos: modelos(vista) });
      if (av[0].unica) return av[0];
      const melhor = av[0].p;
      const perto = av.filter(o => melhor - o.p <= cfg.margem + 0.012);
      perto.sort((a, b) => (b.p + gosto(b)) - (a.p + gosto(a)));
      return perto[0];
    }

    function comUltima(vista, o) {
      if (o.tipo !== 'carta') return o;
      const restam = vista.fase === 'depoisDeComprar' ? vista.mao.length : vista.mao.length - (o.cartas ? o.cartas.length : 1);
      return Object.assign({}, o, { ultima: restam === 1 && !RNG.chance(cfg.esquece) });
    }

    return {
      bot: true, perfil, leitor,
      jogar(vista) { return comUltima(vista, escolher(vista)); },
      depoisDeComprar(vista) { return comUltima(vista, escolher(vista)); },
      escolherCor(vista) { return melhorCor(vista.mao, -1); },
      pegar() { return RNG.chance(0.93) ? cfg.reacao[0] + RNG.real() * (cfg.reacao[1] - cfg.reacao[0]) : null; },
      observar(ev) { leitor.observar(ev); }
    };
  }

  U.IA = { PERFIS, LISTA_PERFIS, NIVEIS, NOMES, inferir, naoVistas, sortearMundo, opcoesDe, avaliar, chanceBlefe, politica, ateOFim, estadoDe, clonar, melhorCor, criarLeitor, juntarLeituras, criarBot, ordemJuntas };
})(window.Poker = window.Poker || {});
