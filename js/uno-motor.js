/* ==========================================================================
   OUTS · Treino Lab — uno-motor.js
   Motor de uma partida de "Última!" (cartas coloridas): distribui, controla a
   vez, os efeitos (Pular, Inverter, +2, +4, coringas), as compras, o desafio
   do +4, o "Última!" esquecido, a pontuação e o fim da partida. Não toca no
   DOM: cada lugar é um "agente" que recebe só a vista dele.

   agentes[j] (todos podem ser assíncronos):
     jogar(vista)            → { tipo: 'carta', carta, cartas?, cor?, ultima? } | { tipo: 'comprar' } | { tipo: 'desafiar' }
                               (cartas: várias de uma vez, na regra "jogar cartas iguais juntas"; a última fica por cima)
     depoisDeComprar(vista)  → { tipo: 'carta', carta, cor?, ultima? } | { tipo: 'passar' } | { tipo: 'comprar' }
     escolherCor(vista)      → 0..3   (a primeira carta da pilha é um coringa)
     pegar(vista, j)         → ms (tempo para perceber que j não disse "Última!") ou null
     manual (opcional)       → true para a pessoa: cada carta comprada é um toque (antesDeComprar) e,
                               depois de comprar na vez, ela sempre decide (jogar a comprada, passar ou,
                               na regra "comprar até poder jogar", comprar outra) — nada é automático.
     antesDeComprar(vista, { faltam, total, motivo }) → resolve quando a pessoa toca em Comprar
   ganchos: { evento(ev) (pode ser assíncrono), salvar(estado), janelaUltima(j, outros, reacoes) → quem pegou | j (disse a tempo) | null }

   Eventos: inicioPartida, inicioMao, vez, jogada, efeito, compra, passou,
   desafio, esqueceu, pegou, ultima, reembaralhou, fimMao, fimPartida.
   ========================================================================== */
(function (P) {
  'use strict';

  const U = P.Uno, R = U.Regras, RNG = P.RNG;
  const C = R.CARTAS;
  const LIMITE_VEZES = 4000;       // segurança: uma mão nunca passa disso

  /**
   * cfg: { n (2 a 6), opcoes, placar, dador, maoNumero,
   *        baralhos (testes: lista de ordens das 108 cartas, uma por mão; a 1ª carta vai para quem está à esquerda do dador),
   *        embaralhar (opcional: o servidor da mesa com amigos embaralha e guarda cada ordem para refazer a mão) }
   */
  function criar(cfg, agentes, ganchos) {
    ganchos = ganchos || {};
    const embaralhar = cfg.embaralhar || (arr => P.Baralho.embaralhar(arr));
    const n = cfg.n;
    if (!(n >= 2 && n <= 6) || agentes.length !== n) throw new Error('Última: de 2 a 6 jogadores');
    const op = R.opcoes(cfg.opcoes);
    const est = {
      placar: cfg.placar ? cfg.placar.slice() : new Array(n).fill(0),
      dador: cfg.dador !== undefined ? cfg.dador : RNG.inteiroAbaixo(n),
      maoNumero: cfg.maoNumero || 0, parado: false, mao: null
    };
    const baralhosTeste = cfg.baralhos ? cfg.baralhos.slice() : null;

    async function emitir(ev) { if (ganchos.evento) await ganchos.evento(ev); }
    const prox = (j, passos) => R.proximo(j, est.mao.sentido, n, passos);

    // --------------------------------------------------------------- vista
    function vistaPara(j) {
      const m = est.mao;
      const v = {
        eu: j, n, opcoes: op, placar: est.placar.slice(), maoNumero: est.maoNumero, dador: m.dador,
        mao: m.maos[j].slice(), topo: m.descarte[m.descarte.length - 1], cor: m.cor, sentido: m.sentido, vez: m.vez,
        nCartas: m.maos.map(x => x.length), compra: m.compra.length, descarte: m.descarte.slice(),
        pendente: m.pendente ? { qtd: m.pendente.qtd, tipo: m.pendente.tipo, de: m.pendente.de, corAntes: m.pendente.corAntes } : null,
        fase: m.fase, comprada: m.fase === 'depoisDeComprar' ? m.comprada : null,
        ultima: m.ultima.slice(), historico: m.historico.slice(), vezes: m.vezes
      };
      v.jogaveis = m.fase === 'depoisDeComprar' ? (R.jogaveis([m.comprada], v.topo, m.cor, op, null).length ? [m.comprada] : [])
        : R.jogaveis(v.mao, v.topo, m.cor, op, m.pendente);
      v.podeDesafiar = !!(m.pendente && op.desafio && m.pendente.tipo === 'mais4' && m.pendente.unico && m.vez === j);
      return v;
    }

    // ------------------------------------------------------------- baralho
    function novaOrdem() {
      if (baralhosTeste && baralhosTeste.length) {
        const d = baralhosTeste.shift().slice();
        if (d.length !== R.TOTAL || new Set(d).size !== R.TOTAL) throw new Error('Última: baralho de teste inválido');
        return d;
      }
      return embaralhar(Array.from({ length: R.TOTAL }, (_, i) => i));
    }
    /** Tira uma carta da compra (reembaralha a pilha de descarte, menos a de cima, quando acaba). */
    async function tirar() {
      const m = est.mao;
      if (!m.compra.length) {
        if (m.descarte.length <= 1) return null;
        const topo = m.descarte.pop();
        m.compra = embaralhar(m.descarte);
        m.descarte = [topo];
        m.historico.push({ acao: 'reembaralhou' });
        await emitir({ tipo: 'reembaralhou', compra: m.compra.length });
      }
      return m.compra.pop();
    }
    /**
     * j compra qtd cartas. Para a pessoa (agente manual) cada carta espera um toque em Comprar;
     * jaConfirmadas: quantas já foram "tocadas" (o próprio toque que escolheu comprar vale pela primeira).
     */
    async function comprar(j, qtd, motivo, jaConfirmadas) {
      const m = est.mao, cartas = [];
      const ag = agentes[j];
      const porToque = !!(ag.manual && ag.antesDeComprar);
      const corMesa = m.cor, topoMesa = m.descarte[m.descarte.length - 1];
      for (let k = 0; k < qtd; k++) {
        if (porToque && k >= (jaConfirmadas || 0)) {
          await ag.antesDeComprar(vistaPara(j), { faltam: qtd - k, total: qtd, motivo });
          if (est.parado) break;
        }
        const c = await tirar();
        if (c === null) break;
        m.maos[j].push(c); cartas.push(c);
        if (m.maos[j].length > 1) m.ultima[j] = false;
        // a pessoa vê cada carta chegar; para os bots, um aviso só
        if (porToque) await emitir({ tipo: 'compra', j, qtd: 1, motivo, nCartas: m.maos[j].length, cartas: [c], parte: k + 1, total: qtd });
      }
      if (m.maos[j].length > 1) m.ultima[j] = false;
      m.historico.push({ j, acao: 'comprou', qtd: cartas.length, motivo, corMesa, topoMesa });
      if (!porToque) await emitir({ tipo: 'compra', j, qtd: cartas.length, motivo, nCartas: m.maos[j].length, cartas });   // "cartas": a UI só mostra as suas
      return cartas;
    }

    // ---------------------------------------------------------------- mão
    async function rodarMao() {
      const d = novaOrdem();
      const m = est.mao = {
        dador: est.dador, maos: Array.from({ length: n }, () => []), compra: d.slice().reverse(), descarte: [],
        cor: 0, sentido: 1, vez: 0, pendente: null, ultima: new Array(n).fill(false), historico: [], fase: 'jogar', comprada: null, vezes: 0,
        mais4: []
      };
      // 7 cartas para cada um, uma por vez, começando à esquerda de quem dá
      for (let volta = 0; volta < 7; volta++) for (let k = 1; k <= n; k++) m.maos[(est.dador + k) % n].push(m.compra.pop());
      // a primeira da pilha: um +4 volta para o baralho
      let topo = m.compra.pop();
      while (C[topo].tipo === 'mais4') {
        if (baralhosTeste) m.compra.unshift(topo);
        else { m.compra.push(topo); m.compra = embaralhar(m.compra); }
        topo = m.compra.pop();
      }
      m.descarte.push(topo);
      m.cor = C[topo].cor;
      m.vez = (est.dador + 1) % n;
      if (ganchos.salvar) ganchos.salvar({ placar: est.placar.slice(), dador: est.dador, maoNumero: est.maoNumero });
      await emitir({ tipo: 'inicioMao', maoNumero: est.maoNumero, dador: est.dador, topo, cor: m.cor, vez: m.vez, nCartas: m.maos.map(x => x.length), placar: est.placar.slice(), n });
      if (est.parado) return null;
      // efeito da primeira carta
      const t = C[topo];
      if (t.coringa) {
        const j = m.vez;
        let cor = agentes[j].escolherCor ? await agentes[j].escolherCor(vistaPara(j)) : corMaisComum(m.maos[j]);
        if (!(cor >= 0 && cor <= 3)) cor = corMaisComum(m.maos[j]);
        m.cor = cor;
        await emitir({ tipo: 'efeito', efeito: 'corInicial', j, cor });
      } else if (t.tipo === 'pular') {
        await emitir({ tipo: 'efeito', efeito: 'pular', alvo: m.vez });
        m.vez = prox(m.vez);
      } else if (t.tipo === 'inverter') {
        if (n === 2) { await emitir({ tipo: 'efeito', efeito: 'pular', alvo: m.vez }); m.vez = prox(m.vez); }
        else { m.sentido = -1; m.vez = est.dador; await emitir({ tipo: 'efeito', efeito: 'inverter', sentido: m.sentido }); }
      } else if (t.tipo === 'mais2') {
        const alvo = m.vez;
        await emitir({ tipo: 'efeito', efeito: 'mais2', alvo });
        await comprar(alvo, 2, 'mais2');
        m.vez = prox(alvo);
      }
      while (!est.parado) {
        if (++m.vezes > LIMITE_VEZES) {   // nunca deve acontecer: fecha a mão com quem tem menos pontos na mão
          const v = m.maos.map((x, j) => [R.pontosDaMao(x), j]).sort((a, b) => a[0] - b[0])[0][1];
          return fecharMao(v);
        }
        const fim = await turno(m.vez);
        if (fim !== null && fim !== undefined) return fecharMao(fim);
      }
      return null;
    }

    function corMaisComum(mao) {
      const cont = [0, 0, 0, 0];
      mao.forEach(id => { if (!C[id].coringa) cont[C[id].cor] += 1 + C[id].pontos / 100; });
      let melhor = 0;
      for (let c = 1; c < 4; c++) if (cont[c] > cont[melhor]) melhor = c;
      return melhor;
    }

    /** A vez de j. Devolve o vencedor quando a mão acaba. */
    async function turno(j) {
      const m = est.mao;
      await emitir({ tipo: 'vez', j, pendente: m.pendente ? { qtd: m.pendente.qtd, tipo: m.pendente.tipo } : null });
      if (est.parado) return null;
      if (m.pendente) {
        m.fase = 'responder';
        const v = vistaPara(j);
        const a = await agentes[j].jogar(v);
        if (est.parado) return null;
        if (a && a.tipo === 'carta') {
          if (v.jogaveis.indexOf(a.carta) < 0) throw new Error('Última: carta inválida para responder (lugar ' + j + ')');
          return jogarCarta(j, a.carta, a.cor, !!a.ultima);
        }
        const p = m.pendente;
        if (a && a.tipo === 'desafiar' && v.podeDesafiar) {
          m.pendente = null;
          m.historico.push({ j, acao: 'desafiou', contra: p.de, culpado: p.blefe });
          await emitir({ tipo: 'desafio', j, contra: p.de, culpado: p.blefe, corAntes: p.corAntes });
          if (p.blefe) {
            await comprar(p.de, 4, 'desafio');      // era blefe: quem jogou compra 4, e quem desafiou joga normalmente
            m.vez = j;
          } else {
            await comprar(j, 6, 'desafio');         // não era: quem desafiou compra 6 e perde a vez
            m.vez = prox(j);
          }
          return null;
        }
        m.pendente = null;
        await comprar(j, p.qtd, p.tipo === 'mais4' ? 'mais4' : 'mais2', 1);
        m.vez = prox(j);
        return null;
      }
      m.fase = 'jogar';
      const v = vistaPara(j);
      const a = await agentes[j].jogar(v);
      if (est.parado) return null;
      if (a && a.tipo === 'carta') {
        if (Array.isArray(a.cartas) && a.cartas.length > 1) {
          if (!R.grupoValido(m.maos[j], a.cartas, v.topo, m.cor, op, null)) throw new Error('Última: cartas inválidas para jogar juntas (lugar ' + j + ')');
          return jogarVarias(j, a.cartas.slice(), !!a.ultima);
        }
        if (v.jogaveis.indexOf(a.carta) < 0) throw new Error('Última: carta inválida (lugar ' + j + ': ' + R.nome(a.carta) + ')');
        return jogarCarta(j, a.carta, a.cor, !!a.ultima);
      }
      // comprar (uma, ou até poder jogar na regra da casa)
      const topo = m.descarte[m.descarte.length - 1];
      if (agentes[j].manual) return comprarNaMao(j, topo);
      let ultimaComprada = null, total = 0;
      for (let guarda = 0; guarda < R.TOTAL; guarda++) {
        const cs = await comprar(j, 1, 'vez');
        if (!cs.length) break;
        total++;
        ultimaComprada = cs[0];
        if (!op.comprarAtePoder || R.jogaveis([ultimaComprada], topo, m.cor, op, null).length) break;
      }
      if (ultimaComprada !== null && R.jogaveis([ultimaComprada], topo, m.cor, op, null).length) {
        m.fase = 'depoisDeComprar'; m.comprada = ultimaComprada;
        const a2 = agentes[j].depoisDeComprar ? await agentes[j].depoisDeComprar(vistaPara(j)) : { tipo: 'passar' };
        m.fase = 'jogar'; m.comprada = null;
        if (est.parado) return null;
        if (a2 && a2.tipo === 'carta' && a2.carta === ultimaComprada) return jogarCarta(j, ultimaComprada, a2.cor, !!a2.ultima);
      }
      m.historico.push({ j, acao: 'passou' });
      await emitir({ tipo: 'passou', j, comprou: total });
      m.vez = prox(j);
      return null;
    }

    /**
     * A pessoa comprou na vez: uma carta por toque e, depois de cada uma, ela decide —
     * jogar a comprada (se servir), passar ou (na regra "comprar até poder jogar", enquanto a
     * comprada não serve) comprar outra. Passar sem poder, nessa regra, não vale: espera outro toque.
     */
    async function comprarNaMao(j, topo) {
      const m = est.mao;
      let confirmadas = 1, total = 0;
      for (let guarda = 0; guarda < R.TOTAL; guarda++) {
        const cs = await comprar(j, 1, 'vez', confirmadas);
        if (est.parado) return null;
        if (!cs.length) break;               // não há mais o que comprar
        total++;
        const comprada = cs[0];
        const serve = R.jogaveis([comprada], topo, m.cor, op, null).length > 0;
        m.fase = 'depoisDeComprar'; m.comprada = comprada;
        const a2 = await agentes[j].depoisDeComprar(vistaPara(j));
        m.fase = 'jogar'; m.comprada = null;
        if (est.parado) return null;
        if (a2 && a2.tipo === 'carta' && a2.carta === comprada && serve) return jogarCarta(j, comprada, a2.cor, !!a2.ultima);
        const temMais = m.compra.length > 0 || m.descarte.length > 1;
        if (op.comprarAtePoder && !serve && temMais) { confirmadas = a2 && a2.tipo === 'comprar' ? 1 : 0; continue; }
        break;
      }
      m.historico.push({ j, acao: 'passou' });
      await emitir({ tipo: 'passou', j, comprou: total });
      m.vez = prox(j);
      return null;
    }

    /** Várias cartas de número iguais de uma vez (a última fica por cima e vale a cor dela). */
    async function jogarVarias(j, ids, declarou) {
      const m = est.mao, mao = m.maos[j];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        mao.splice(mao.indexOf(id), 1);
        const corAntes = m.cor, topoAntes = m.descarte[m.descarte.length - 1];
        m.descarte.push(id);
        m.cor = C[id].cor;
        m.historico.push({ j, acao: 'jogou', carta: id, cor: m.cor, corAntes, topoAntes, junto: i > 0 });
        const ultimaCarta = i === ids.length - 1;
        await emitir({ tipo: 'jogada', j, carta: id, cor: m.cor, corAntes, ultima: ultimaCarta && declarou && mao.length === 1, nCartas: mao.length, parte: i + 1, de: ids.length });
        if (est.parado) return null;
      }
      if (mao.length === 1) {
        if (declarou) { m.ultima[j] = true; await emitir({ tipo: 'ultima', j }); }
        else await janelaUltima(j);
      }
      m.vez = prox(j);
      return mao.length === 0 ? j : null;
    }

    async function jogarCarta(j, id, corEscolhida, declarou) {
      const m = est.mao;
      const c = C[id];
      const mao = m.maos[j];
      mao.splice(mao.indexOf(id), 1);
      const corAntes = m.cor, topoAntes = m.descarte[m.descarte.length - 1];
      m.descarte.push(id);
      if (c.coringa) m.cor = corEscolhida >= 0 && corEscolhida <= 3 ? corEscolhida : corMaisComum(mao);
      else m.cor = c.cor;
      const blefe = c.tipo === 'mais4' ? R.temCor(mao, corAntes) : false;
      if (c.tipo === 'mais4') m.mais4.push({ j, blefe, corAntes });
      m.historico.push({ j, acao: 'jogou', carta: id, cor: m.cor, corAntes, topoAntes });
      await emitir({ tipo: 'jogada', j, carta: id, cor: m.cor, corAntes, ultima: declarou && mao.length === 1, nCartas: mao.length });
      if (est.parado) return null;
      // "Última!": dito junto com a jogada, ou esquecido (e alguém pode pegar)
      if (mao.length === 1) {
        if (declarou) { m.ultima[j] = true; await emitir({ tipo: 'ultima', j }); }
        else await janelaUltima(j);
      }
      // efeitos
      const alvo = prox(j);
      let vencedor = mao.length === 0 ? j : null;
      if (c.tipo === 'pular') {
        await emitir({ tipo: 'efeito', efeito: 'pular', alvo });
        m.vez = prox(j, 2);
      } else if (c.tipo === 'inverter') {
        if (n === 2) { await emitir({ tipo: 'efeito', efeito: 'pular', alvo }); m.vez = j; }
        else { m.sentido = -m.sentido; await emitir({ tipo: 'efeito', efeito: 'inverter', sentido: m.sentido }); m.vez = prox(j); }
      } else if (c.tipo === 'mais2' || c.tipo === 'mais4') {
        const qtd = (m.pendente ? m.pendente.qtd : 0) + (c.tipo === 'mais2' ? 2 : 4);
        const unico = !m.pendente;
        await emitir({ tipo: 'efeito', efeito: c.tipo, alvo, qtd });
        const responde = op.acumular || (c.tipo === 'mais4' && op.desafio && unico);
        if (responde && vencedor === null) {
          m.pendente = { qtd, tipo: c.tipo, de: j, corAntes, blefe, unico };
          m.vez = alvo;
        } else {
          m.pendente = null;
          await comprar(alvo, qtd, c.tipo);
          m.vez = prox(j, 2);
        }
      } else {
        m.vez = alvo;
      }
      return vencedor;
    }

    /** j ficou com uma carta sem dizer "Última!": quem perceber primeiro (antes da próxima jogada) pega. */
    async function janelaUltima(j) {
      const m = est.mao;
      await emitir({ tipo: 'esqueceu', j });
      const outros = [];
      for (let k = 1; k < n; k++) outros.push((j + k) % n);
      const reacoes = await Promise.all(outros.map(k => (agentes[k].pegar ? agentes[k].pegar(vistaPara(k), j) : null)));
      let quem = null;
      if (ganchos.janelaUltima) quem = await ganchos.janelaUltima(j, outros, reacoes);
      else {
        let melhor = Infinity;
        reacoes.forEach((ms, i) => { if (ms !== null && ms !== undefined && ms < melhor) { melhor = ms; quem = outros[i]; } });
      }
      if (est.parado) return;
      if (quem === j) { m.ultima[j] = true; await emitir({ tipo: 'ultima', j, atrasada: true }); return; }
      if (quem !== null && quem !== undefined) {
        m.historico.push({ j, acao: 'pego', por: quem });
        await emitir({ tipo: 'pegou', j, por: quem });
        await comprar(j, 2, 'pegou');
      }
    }

    async function fecharMao(vencedor) {
      const m = est.mao;
      let pontos = 0;
      m.maos.forEach((x, j) => { if (j !== vencedor) pontos += R.pontosDaMao(x); });
      est.placar[vencedor] += pontos;
      await emitir({ tipo: 'fimMao', vencedor, pontos, maos: m.maos.map(x => x.slice()), placar: est.placar.slice(), mais4: m.mais4.slice(), maoNumero: est.maoNumero });
      return { vencedor, pontos };
    }

    async function rodar() {
      await emitir({ tipo: 'inicioPartida', n, placar: est.placar.slice(), opcoes: op });
      let maos = 0;
      while (!est.parado) {
        est.maoNumero++;
        const r = await rodarMao();
        if (!r || est.parado) return null;
        maos++;
        const fim = op.ate <= 0 || est.placar[r.vencedor] >= op.ate;
        if (fim) {
          const vencedor = op.ate <= 0 ? r.vencedor : est.placar.indexOf(Math.max.apply(null, est.placar));
          await emitir({ tipo: 'fimPartida', vencedor, placar: est.placar.slice(), maos });
          return { vencedor, placar: est.placar.slice(), maos };
        }
        est.dador = (est.dador + 1) % n;
      }
      return null;
    }

    return {
      rodar, vistaPara,
      parar() { est.parado = true; },
      maoNumero: () => est.maoNumero,
      estado: () => ({ placar: est.placar.slice(), dador: est.dador, maoNumero: est.maoNumero }),
      _mao: () => est.mao
    };
  }

  U.Motor = { criar };
})(window.Poker = window.Poker || {});
