/* ==========================================================================
   OUTS · Treino Lab — cacheta-motor.js
   Motor de uma partida de cacheta: distribui (9 para cada um), vira a carta
   que define o curinga, controla a vez (comprar do monte ou do lixo,
   descartar ou bater), confere as batidas, tira as vidas, elimina quem
   zerou e termina quando sobra um. Não toca no DOM: cada lugar é um
   "agente" que recebe só a vista dele.

   agentes[j] (todos podem ser assíncronos):
     comprar(vista)           → 'monte' | 'lixo'
     jogar(vista)             → { tipo: 'descartar', carta } | { tipo: 'bater', com: 10 } | { tipo: 'bater', com: 9, descarte }
     furar(vista, carta, de)  → true para pegar fora da vez a carta que "de" descartou e bater
                                (só com a opção "furar a fila", e só perguntado a quem bate com ela)
   ganchos: { evento(ev) (pode ser assíncrono), salvar(estado) }

   Eventos: inicioPartida, inicioMao, vez, compra, descarte, reembaralhou,
   bateu, fimMao, eliminado, fimPartida.
   ========================================================================== */
(function (P) {
  'use strict';

  const K = P.Cacheta, R = K.Regras, RNG = P.RNG;
  const LIMITE_VEZES = 600;          // segurança: depois disso a mão é anulada (ninguém perde)

  function embaralhar(arr) { return P.Baralho.embaralhar(arr); }

  /**
   * cfg: { n (2 a 6), opcoes, vidas (por lugar), dador, maoNumero,
   *        baralhos (testes: lista de ordens das 104 cartas, uma por mão; a 1ª carta vai para quem está à esquerda do dador,
   *                  depois de 9 voltas vem a vira e o resto é o monte, de cima para baixo) }
   */
  function criar(cfg, agentes, ganchos) {
    ganchos = ganchos || {};
    const n = cfg.n;
    if (!(n >= 2 && n <= 6) || agentes.length !== n) throw new Error('Cacheta: de 2 a 6 jogadores');
    const op = R.opcoes(cfg.opcoes);
    const est = {
      vidas: cfg.vidas ? cfg.vidas.slice() : new Array(n).fill(op.vidas),
      dador: cfg.dador !== undefined ? cfg.dador : RNG.inteiroAbaixo(n),
      maoNumero: cfg.maoNumero || 0, parado: false, mao: null, eliminacoes: []
    };
    const baralhosTeste = cfg.baralhos ? cfg.baralhos.slice() : null;
    const vivos = () => est.vidas.map(v => v > 0);
    const proxVivo = j => R.proximoVivo(j, vivos(), n);
    // o dador tem de estar vivo
    if (!(est.vidas[est.dador] > 0)) est.dador = proxVivo(est.dador);

    async function emitir(ev) { if (ganchos.evento) await ganchos.evento(ev); }

    // --------------------------------------------------------------- vista
    function vistaPara(j) {
      const m = est.mao;
      return {
        eu: j, n, opcoes: op, vidas: est.vidas.slice(), vivos: vivos(), maoNumero: est.maoNumero, dador: m.dador,
        mao: m.maos[j].slice(), vira: m.vira, curinga: m.cur, vez: m.vez, fase: m.fase,
        monte: m.monte.length, lixo: m.lixo.slice(), topo: m.lixo.length ? m.lixo[m.lixo.length - 1] : null,
        comprada: m.fase === 'jogar' && m.vez === j ? m.comprada : null, doLixo: m.fase === 'jogar' && m.vez === j ? m.doLixo : null,
        nCartas: m.maos.map(x => x.length), historico: m.historico.slice(), vezes: m.vezes
      };
    }

    // ------------------------------------------------------------- baralho
    function novaOrdem() {
      if (baralhosTeste && baralhosTeste.length) {
        const d = baralhosTeste.shift().slice();
        if (d.length !== R.TOTAL || new Set(d).size !== R.TOTAL) throw new Error('Cacheta: baralho de teste inválido');
        return d;
      }
      return embaralhar(Array.from({ length: R.TOTAL }, (_, i) => i));
    }
    /** A de cima do monte (reembaralha o lixo, menos a de cima, quando acaba). */
    async function tirarDoMonte() {
      const m = est.mao;
      if (!m.monte.length) {
        if (m.lixo.length <= 1) return null;
        const topo = m.lixo.pop();
        m.monte = embaralhar(m.lixo);
        m.lixo = [topo];
        m.historico.push({ acao: 'reembaralhou' });
        await emitir({ tipo: 'reembaralhou', monte: m.monte.length });
      }
      return m.monte.pop();
    }

    // ---------------------------------------------------------------- mão
    async function rodarMao() {
      const d = novaOrdem();
      const vv = vivos();
      const m = est.mao = {
        dador: est.dador, maos: Array.from({ length: n }, () => []), monte: d.slice().reverse(), lixo: [],
        vira: null, cur: null, vez: 0, fase: 'comprar', comprada: null, doLixo: null, historico: [], vezes: 0
      };
      // 9 cartas para cada um que está vivo, uma por vez, começando à esquerda de quem dá
      for (let volta = 0; volta < R.POR_MAO; volta++) {
        for (let k = 1; k <= n; k++) { const j = (est.dador + k) % n; if (vv[j]) m.maos[j].push(m.monte.pop()); }
      }
      m.vira = m.monte.pop();
      m.cur = R.curingaDe(m.vira, op.curinga);
      m.vez = proxVivo(est.dador);
      if (ganchos.salvar) ganchos.salvar({ vidas: est.vidas.slice(), dador: est.dador, maoNumero: est.maoNumero, eliminacoes: est.eliminacoes.slice() });
      await emitir({ tipo: 'inicioMao', maoNumero: est.maoNumero, dador: est.dador, vira: m.vira, curinga: m.cur, vez: m.vez, vidas: est.vidas.slice(), vivos: vv, n, nCartas: m.maos.map(x => x.length) });
      while (!est.parado) {
        if (++m.vezes > LIMITE_VEZES) return anular('limite');
        const fim = await turno(m.vez);
        if (est.parado) return null;
        if (fim === 'anulada') return anular('monte');
        if (fim) return fecharMao(fim);
      }
      return null;
    }

    /** A vez de j: compra, depois descarta ou bate. Devolve a batida (fim da mão), 'anulada' ou null. */
    async function turno(j) {
      const m = est.mao;
      m.fase = 'comprar'; m.comprada = null; m.doLixo = null;
      await emitir({ tipo: 'vez', j });
      if (est.parado) return null;
      // compra
      let de = 'monte';
      if (m.lixo.length) {
        const r = await agentes[j].comprar(vistaPara(j));
        if (est.parado) return null;
        de = r === 'lixo' ? 'lixo' : 'monte';
      }
      let carta;
      if (de === 'lixo') carta = m.lixo.pop();
      else {
        carta = await tirarDoMonte();
        if (carta === null || carta === undefined) {
          if (!m.lixo.length) return 'anulada';
          de = 'lixo'; carta = m.lixo.pop();        // nada no monte: só sobrou a do lixo
        }
      }
      m.maos[j].push(carta);
      m.comprada = carta;
      m.doLixo = de === 'lixo' ? carta : null;
      m.historico.push(de === 'lixo' ? { j, acao: 'lixo', carta } : { j, acao: 'monte' });
      await emitir({ tipo: 'compra', j, de, carta: de === 'lixo' ? carta : null, nCartas: m.maos[j].length, monte: m.monte.length });
      if (est.parado) return null;
      // descarta ou bate
      m.fase = 'jogar';
      const a = await agentes[j].jogar(vistaPara(j));
      if (est.parado) return null;
      const mao = m.maos[j];
      if (a && a.tipo === 'bater') {
        if (!R.confere(mao, m.cur, a.com, a.descarte)) throw new Error('Cacheta: batida que não fecha (lugar ' + j + ')');
        if (a.com === 9 && a.descarte === m.doLixo) throw new Error('Cacheta: não vale descartar a carta que pegou do lixo (lugar ' + j + ')');
        return bater(j, a.com, a.com === 9 ? a.descarte : null, false);
      }
      const x = a && a.carta;
      if (mao.indexOf(x) < 0) throw new Error('Cacheta: descarte de carta que não está na mão (lugar ' + j + ')');
      if (x === m.doLixo) throw new Error('Cacheta: não vale descartar a carta que pegou do lixo (lugar ' + j + ')');
      mao.splice(mao.indexOf(x), 1);
      m.lixo.push(x);
      m.historico.push({ j, acao: 'descarte', carta: x });
      m.fase = 'comprar'; m.comprada = null; m.doLixo = null;
      await emitir({ tipo: 'descarte', j, carta: x, nCartas: mao.length });
      if (est.parado) return null;
      // furar a fila: alguém bate com essa carta?
      if (op.furar) {
        const furou = await furarFila(j, x);
        if (furou) return furou;
      }
      m.vez = proxVivo(j);
      return null;
    }

    /** Quem bate com a carta que j acabou de descartar pode pegá-la fora da vez (10 antes de 9; depois, quem está mais perto). */
    async function furarFila(j, x) {
      const m = est.mao;
      const vv = vivos();
      const cand = [];
      for (let k = 1; k < n; k++) {
        const q = (j + k) % n;
        if (!vv[q]) continue;
        const b = R.batidas(m.maos[q].concat([x]), m.cur);
        const com9 = b.com9.filter(o => o.descarte !== x);
        if (b.com10 || com9.length) cand.push({ q, dist: k, com: b.com10 ? 10 : 9, descarte: b.com10 ? null : com9[0].descarte });
      }
      cand.sort((a, b) => (b.com - a.com) || (a.dist - b.dist));
      for (const c of cand) {
        const quer = agentes[c.q].furar ? await agentes[c.q].furar(vistaPara(c.q), x, j) : false;
        if (est.parado) return null;
        if (!quer) continue;
        m.lixo.pop();
        m.maos[c.q].push(x);
        m.historico.push({ j: c.q, acao: 'furou', carta: x, de: j });
        await emitir({ tipo: 'compra', j: c.q, de: 'lixo', carta: x, furou: true, nCartas: m.maos[c.q].length, monte: m.monte.length });
        return bater(c.q, c.com, c.descarte, true);
      }
      return null;
    }

    async function bater(j, com, descarte, furou) {
      const m = est.mao;
      const mao = m.maos[j];
      let resto = mao;
      if (com === 9) { resto = mao.filter(y => y !== descarte); m.maos[j] = resto; m.lixo.push(descarte); }
      const jogos = R.arranjar(resto, m.cur);
      m.historico.push({ j, acao: 'bateu', com, descarte });
      await emitir({ tipo: 'bateu', j, com, jogos, descarte: com === 9 ? descarte : null, furou: !!furou });
      return { vencedor: j, com, jogos, descarte: com === 9 ? descarte : null, furou: !!furou };
    }

    async function fecharMao(b) {
      const m = est.mao;
      const perda = b.com === 10 ? 2 : 1;
      const vidasAntes = est.vidas.slice();
      const eliminados = [];
      for (let k = 0; k < n; k++) {
        if (k === b.vencedor || !(est.vidas[k] > 0)) continue;
        est.vidas[k] = Math.max(0, est.vidas[k] - perda);
        if (est.vidas[k] === 0) eliminados.push(k);
      }
      if (eliminados.length) est.eliminacoes.push({ mao: est.maoNumero, quem: eliminados.slice() });
      await emitir({ tipo: 'fimMao', vencedor: b.vencedor, com: b.com, jogos: b.jogos, descarte: b.descarte, furou: b.furou, perda,
        maos: m.maos.map(x => x.slice()), vira: m.vira, curinga: m.cur, vidasAntes, vidas: est.vidas.slice(), eliminados, maoNumero: est.maoNumero });
      for (const k of eliminados) await emitir({ tipo: 'eliminado', j: k, maoNumero: est.maoNumero, restam: est.vidas.filter(v => v > 0).length });
      return b;
    }
    async function anular(motivo) {
      const m = est.mao;
      await emitir({ tipo: 'fimMao', vencedor: null, anulada: motivo, perda: 0, maos: m.maos.map(x => x.slice()), vira: m.vira, curinga: m.cur,
        vidasAntes: est.vidas.slice(), vidas: est.vidas.slice(), eliminados: [], maoNumero: est.maoNumero });
      return { vencedor: null };
    }

    async function rodar() {
      await emitir({ tipo: 'inicioPartida', n, vidas: est.vidas.slice(), opcoes: op });
      let maos = 0;
      while (!est.parado) {
        if (est.vidas.filter(v => v > 0).length <= 1) break;
        est.maoNumero++;
        const r = await rodarMao();
        if (!r || est.parado) return null;
        maos++;
        if (est.vidas.filter(v => v > 0).length <= 1) break;
        est.dador = proxVivo(est.dador);
      }
      if (est.parado) return null;
      const vencedor = est.vidas.findIndex(v => v > 0);
      // colocação: o vencedor em 1º; depois quem saiu por último (na mesma mão, empatados)
      const colocacao = new Array(n).fill(0);
      colocacao[vencedor] = 1;
      let lugar = 2;
      est.eliminacoes.slice().reverse().forEach(e => { e.quem.forEach(q => { colocacao[q] = lugar; }); lugar += e.quem.length; });
      await emitir({ tipo: 'fimPartida', vencedor, vidas: est.vidas.slice(), maos, colocacao });
      return { vencedor, vidas: est.vidas.slice(), maos, colocacao };
    }

    return {
      rodar, vistaPara,
      parar() { est.parado = true; },
      maoNumero: () => est.maoNumero,
      estado: () => ({ vidas: est.vidas.slice(), dador: est.dador, maoNumero: est.maoNumero, eliminacoes: est.eliminacoes.slice() }),
      _mao: () => est.mao
    };
  }

  K.Motor = { criar };
})(window.Poker = window.Poker || {});
