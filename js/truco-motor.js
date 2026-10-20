/* ==========================================================================
   OUTS · Treino Lab — truco-motor.js
   Motor de uma partida de truco (2 jogadores, ou 4 em duplas), nas regras
   paulista ou paranaense (cfg.regras; veja truco-regras.js). Embaralha
   (crypto, o mesmo Fisher-Yates do poker), distribui 3 cartas para cada um
   e vira a vira, conduz as rodadas, os pedidos (truco, seis, nove e doze;
   ou truco e retruco), a mão de 11 (com a troca de cartas do paranaense)
   e a mão de ferro, e marca os pontos até 12.

   Lugares: 0 é você; a vez passa para o lugar seguinte (0 → 1 → 2 → 3),
   no sentido anti-horário da mesa. Equipe = lugar % 2 (você e o lugar 2
   jogam juntos na dupla).

   Quem joga é um "agente" por lugar (a interface no seu lugar, os bots nos
   outros), que só recebe a vista daquele lugar (vistaPara): as suas cartas,
   o que já foi jogado na mesa e o sinal do parceiro. Nunca as cartas dos outros.
     agente.decidir(vista)          → { tipo: 'carta', carta | indice, coberta } ou { tipo: 'truco' }
     agente.responder(vista, nivel) → 'aceitar' | 'correr' | 'aumentar' (ou { resposta, p })
     agente.onze(vista)             → 'jogar' | 'correr' (ou { resposta, p, troca })
       troca (paranaense, dupla com 11): { [lugar]: [3 cartas], [parceiro]: [3 cartas] }
   ganchos.evento(ev) recebe cada acontecimento (a interface anima e devolve
   uma Promise); ganchos.salvar(estado) é chamado no começo de cada mão.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Truco = P.Truco || {};
  const R = T.Regras;

  /** Sinal que um jogador faz ao parceiro: a melhor carta, se for manilha, 3 ou 2. */
  function sinalDe(cartas, vira) {
    let melhor = null, v = -1;
    cartas.forEach(c => { const x = R.valor(c, vira); if (x > v) { v = x; melhor = c; } });
    return v >= R.FORCA_RANK[0] ? melhor : null;     // 2 ou mais forte
  }

  function criar(cfg, agentes, ganchos) {
    ganchos = ganchos || {};
    const n = cfg.n === 4 ? 4 : 2;
    const vr = R.variante(cfg.regras);
    if (agentes.length !== n) throw new Error('Truco: precisa de um agente por lugar');
    const equipe = j => j % 2;
    const parceiro = j => (n === 4 ? (j + 2) % 4 : null);
    const prox = j => (j + 1) % n;

    const est = {
      placar: (cfg.placar || [0, 0]).slice(),
      dador: cfg.dador !== undefined ? cfg.dador : n - 1,
      maoNumero: cfg.maoNumero || 0,
      mao: null,
      fim: false,
      vencedor: null,
      parado: false
    };
    const baralhosTeste = cfg.baralhos ? cfg.baralhos.slice() : null;

    async function emitir(ev) {
      if (ganchos.evento) await ganchos.evento(ev);
    }

    // ----------------------------------------------------------- vista
    /** O que o jogador j pode ver agora. */
    function vistaPara(j) {
      const m = est.mao;
      const eq = equipe(j);
      const v = {
        eu: j, n, equipe: eq, parceiro: parceiro(j),
        placar: est.placar.slice(), nos: est.placar[eq], eles: est.placar[1 - eq],
        maoNumero: est.maoNumero, dador: est.dador,
        tipo: m ? m.tipo : 'normal',
        regras: vr.id, valores: vr.VALORES, nomesPedido: vr.NOMES_PEDIDO, maxNivel: vr.maxNivel
      };
      if (!m) return v;
      v.inicio = m.inicio;
      v.vira = m.vira;
      v.manilha = R.manilhaDe(m.vira);
      v.cegas = m.tipo === 'ferro';
      v.cartas = v.cegas ? m.maos[j].map(() => null) : m.maos[j].slice();
      v.nCartas = m.maos.map(x => x.length);
      v.rodada = m.resultados.length;
      v.jogadas = m.jogadas.map(r => r.map(x => ({ j: x.j, carta: x.coberta && x.j !== j ? null : x.carta, coberta: x.coberta })));
      v.resultados = m.resultados.slice();
      v.vencedoresRodada = m.vencedoresRodada.slice();
      v.vez = m.vez;
      v.valor = m.valor;
      v.nivel = m.nivel;
      v.ultimoAumento = m.ultimoAumento;
      v.equipeOnze = m.equipeOnze;
      v.pedido = m.pedido ? Object.assign({}, m.pedido) : null;
      v.historicoPedidos = m.pedidos.map(x => Object.assign({}, x));
      // sinal do parceiro (dupla, mão normal)
      v.sinalParceiro = n === 4 && m.sinais ? m.sinais[parceiro(j)] : undefined;
      // mão de 11: a dupla que está com 11 vê as cartas do parceiro
      v.cartasParceiro = n === 4 && m.tipo === 'onze' && m.equipeOnze === eq ? m.maos[parceiro(j)].slice() : null;
      v.trocaPermitida = !!(v.cartasParceiro && vr.trocaNoOnze && !m.decidiuOnze);
      v.podeTrucar = podeTrucar(j);
      // respondendo a um pedido: dá para aumentar? (paranaense: retruco só até 8 pontos)
      v.podeAumentar = !!m.pedido && m.pedido.equipe !== eq && R.podePedirNivel(vr, m.pedido.nivel + 1, est.placar[eq]);
      // três empates: de quem é a mão (paranaense: mão de 11 e empate depois de truco)
      v.empateTriplo = empateTriplo();
      v.podeCobrir = m.tipo !== 'ferro' && m.resultados.length > 0;
      return v;
    }

    function podeTrucar(j) {
      const m = est.mao;
      return !!m && !m.acabou && m.tipo === 'normal' && R.podePedirNivel(vr, m.nivel + 1, est.placar[equipe(j)]) &&
        m.ultimoAumento !== equipe(j) && !m.pedido;
    }

    /** Se as três rodadas empatarem, quem leva a mão (0, 1) ou null (ninguém marca). */
    function empateTriplo() {
      const m = est.mao;
      if (!m) return null;
      if (m.tipo === 'onze' && vr.empateOnzeParaQuemNaoTem) return 1 - m.equipeOnze;
      if (vr.empateNoEscuro && m.nivel > 0 && m.empateVence !== null) return m.empateVence;
      return null;
    }

    /** Pedido "no escuro": quem pede ainda não viu nenhuma carta aberta do outro lado nesta rodada. */
    function pedidoNoEscuro(jPede) {
      const m = est.mao, rod = m.jogadas[m.resultados.length] || [];
      return !rod.some(x => equipe(x.j) !== equipe(jPede) && !x.coberta);
    }

    // ---------------------------------------------------------- uma mão
    function novoBaralho() {
      if (baralhosTeste) {
        const b = baralhosTeste.shift();
        if (!b) throw new Error('Truco: acabaram os baralhos de teste');
        return b.slice();
      }
      return P.Baralho.embaralhar(R.BARALHO.slice());
    }

    async function decisaoEquipe(eq, metodo, vista0, extra) {
      // na sua equipe quem decide é você; numa equipe só de bots, vale a resposta de quem está mais confiante
      const membros = n === 4 ? [eq, eq + 2] : [eq];
      const humano = membros.find(j => !agentes[j].bot);
      if (humano !== undefined) return Object.assign({ j: humano }, normalizarObj(await agentes[humano][metodo](vistaPara(humano), extra)));
      let melhor = null;
      for (const j of membros) {
        const r = normalizarObj(await agentes[j][metodo](vistaPara(j), extra));
        if (!melhor || (r.p !== undefined && (melhor.p === undefined || r.p > melhor.p))) melhor = Object.assign({ j }, r);
      }
      return melhor;
    }
    const normalizarObj = r => (r && typeof r === 'object' ? r : { resposta: r });

    async function jogarMao() {
      est.maoNumero++;
      est.dador = prox(est.dador);
      const inicio = prox(est.dador);
      const baralho = novoBaralho();
      const maos = Array.from({ length: n }, () => []);
      let topo = 0;
      for (let volta = 0; volta < 3; volta++) for (let k = 0; k < n; k++) maos[(inicio + k) % n].push(baralho[topo++]);
      const vira = baralho[topo++];
      const [a, b] = est.placar;
      const tipo = a === 11 && b === 11 ? 'ferro' : a === 11 || b === 11 ? 'onze' : 'normal';
      const m = est.mao = {
        tipo, vira, maos, iniciais: maos.map(x => x.slice()), inicio,
        jogadas: [], resultados: [], vencedoresRodada: [],
        vez: inicio, valor: 1, nivel: 0, ultimoAumento: null, pedido: null, pedidos: [],
        equipeOnze: tipo === 'onze' ? (a === 11 ? 0 : 1) : null,
        empateVence: null, decidiuOnze: false, sinais: null, acabou: false
      };
      if (n === 4 && tipo === 'normal') m.sinais = maos.map(c => sinalDe(c, vira));
      if (ganchos.salvar) ganchos.salvar(estadoParaSalvar());

      await emitir({ tipo: 'inicioMao', maoNumero: est.maoNumero, dador: est.dador, inicio, tipoMao: tipo, placar: est.placar.slice(), vira, equipeOnze: m.equipeOnze });
      if (est.parado) return;

      if (tipo === 'onze') {
        const d = await decisaoEquipe(m.equipeOnze, 'onze');
        m.decidiuOnze = true;
        const trocadas = d.resposta === 'jogar' ? aplicarTroca(m.equipeOnze, d.troca) : 0;
        await emitir({ tipo: 'onze', equipe: m.equipeOnze, j: d.j, resposta: d.resposta, trocadas });
        if (est.parado) return;
        if (d.resposta === 'correr') return encerrarMao(1 - m.equipeOnze, 1, 'onzeCorreu');
        m.valor = 3;
      }

      let lider = inicio;
      for (let r = 0; r < 3; r++) {
        const rodada = [];
        m.jogadas.push(rodada);
        let j = lider;
        for (let k = 0; k < n; k++) {
          m.vez = j;
          const fimPorCorrida = await vezDe(j, r);
          if (est.parado) return;
          if (fimPorCorrida) return fimPorCorrida();
          j = prox(j);
        }
        const res = R.resultadoRodada(rodada, vira, equipe);
        m.resultados.push(res.vencedor);
        m.vencedoresRodada.push(res.vencedor === 'E' ? null : res.quem);
        // quem fez a maior carta começa a próxima (no empate, quem jogou primeiro a carta mais alta)
        lider = res.quem;
        const d = R.decidirMao(m.resultados);
        await emitir({ tipo: 'fimRodada', rodada: r, vencedor: res.vencedor, quem: res.quem, maior: res.maior, fimMao: d.fim });
        if (est.parado) return;
        if (d.fim) {
          if (d.vencedor === null && empateTriplo() !== null) {
            // paranaense: três empates na mão de 11 ou depois de truco não ficam sem dono
            return encerrarMao(empateTriplo(), m.valor, m.tipo === 'onze' ? 'empateOnze' : 'empateEscuro');
          }
          return encerrarMao(d.vencedor, m.valor, 'jogo');
        }
      }
      throw new Error('Truco: mão terminou sem decisão');
    }

    /** A vez de j: pedidos de truco (quantos houver) e depois a carta. Devolve uma função se a mão acabou numa corrida. */
    async function vezDe(j, r) {
      const m = est.mao;
      for (let tentativa = 0; tentativa < 12; tentativa++) {
        await emitir({ tipo: 'vez', j, rodada: r });
        if (est.parado) return null;
        const acao = await agentes[j].decidir(vistaPara(j));
        if (est.parado) return null;
        if (acao && acao.tipo === 'truco') {
          if (!podeTrucar(j)) throw new Error('Truco: pedido fora de hora (lugar ' + j + ')');
          const fim = await pedir(j);
          if (est.parado) return null;
          if (fim) return fim;
          continue;
        }
        // carta
        const mao = m.maos[j];
        let idx = acao && acao.carta !== undefined && acao.carta !== null ? mao.indexOf(acao.carta) : acao ? acao.indice : -1;
        if (!(idx >= 0 && idx < mao.length)) throw new Error('Truco: carta inválida do lugar ' + j);
        const coberta = !!(acao.coberta && m.tipo !== 'ferro' && r > 0);
        const carta = mao.splice(idx, 1)[0];
        m.jogadas[r].push({ j, carta, coberta });
        await emitir({ tipo: 'jogada', j, carta, coberta, rodada: r });
        return null;
      }
      throw new Error('Truco: pedidos demais na mesma vez');
    }

    /** j pede truco (ou o próximo nível). Devolve uma função que encerra a mão se alguém correu. */
    async function pedir(j) {
      const m = est.mao;
      let quemPede = equipe(j), nivel = m.nivel + 1, jPede = j;
      for (;;) {
        const escuro = pedidoNoEscuro(jPede);
        m.pedido = { nivel, equipe: quemPede, j: jPede, escuro };
        m.pedidos.push({ nivel, equipe: quemPede, j: jPede, rodada: m.resultados.length, escuro });
        await emitir({ tipo: 'pedido', j: jPede, equipe: quemPede, nivel, nome: vr.NOMES_PEDIDO[nivel], valor: vr.VALORES[nivel], escuro });
        if (est.parado) return null;
        const responde = 1 - quemPede;
        const d = await decisaoEquipe(responde, 'responder', null, nivel);
        if (est.parado) return null;
        let resp = d.resposta;
        if (resp === 'aumentar' && !R.podePedirNivel(vr, nivel + 1, est.placar[responde])) resp = 'aceitar';
        const registro = m.pedidos[m.pedidos.length - 1];
        registro.resposta = resp;
        registro.jResposta = d.j;
        await emitir({ tipo: 'resposta', j: d.j, equipe: responde, nivel, resposta: resp, proximo: resp === 'aumentar' ? vr.NOMES_PEDIDO[nivel + 1] : null });
        m.pedido = null;
        if (resp === 'correr') {
          const pontos = vr.VALORES[nivel - 1];
          return () => encerrarMao(quemPede, pontos, 'correu');
        }
        // aceitar (ou aumentar, que aceita o nível pedido e pede o seguinte)
        m.nivel = nivel;
        m.valor = vr.VALORES[nivel];
        m.ultimoAumento = quemPede;
        m.empateVence = escuro ? quemPede : 1 - quemPede;
        if (resp === 'aceitar') return null;
        quemPede = responde;
        jPede = d.j;
        nivel = nivel + 1;
      }
    }

    /**
     * Troca de cartas na mão de 11 (paranaense, dupla): a dupla redistribui as
     * suas 6 cartas, 3 para cada um. Devolve quantas cartas mudaram de mão.
     */
    function aplicarTroca(eq, troca) {
      if (!troca || !vr.trocaNoOnze || n !== 4) return 0;
      const m = est.mao, a = eq, b = parceiro(eq);
      const novaA = troca[a], novaB = troca[b];
      if (!Array.isArray(novaA) || !Array.isArray(novaB) || novaA.length !== 3 || novaB.length !== 3) throw new Error('Truco: troca inválida');
      const antes = m.maos[a].concat(m.maos[b]).slice().sort((x, y) => x - y).join();
      if (novaA.concat(novaB).slice().sort((x, y) => x - y).join() !== antes) throw new Error('Truco: troca com cartas que a dupla não tem');
      const mudaram = novaA.filter(c => m.maos[a].indexOf(c) < 0).length;
      m.maos[a] = novaA.slice(); m.maos[b] = novaB.slice();
      m.iniciais[a] = novaA.slice(); m.iniciais[b] = novaB.slice();
      return mudaram;
    }

    async function encerrarMao(vencedor, pontos, motivo) {
      const m = est.mao;
      m.acabou = true;
      if (vencedor !== null) est.placar[vencedor] = Math.min(R.PONTOS_PARTIDA, est.placar[vencedor] + pontos);
      // no fim da mão todo mundo vê as cartas que cada um recebeu (é um treino)
      await emitir({ tipo: 'fimMao', vencedor, pontos: vencedor === null ? 0 : pontos, motivo, placar: est.placar.slice(), iniciais: m.iniciais.map(x => x.slice()), vira: m.vira, tipoMao: m.tipo, nivel: m.nivel });
      if (est.placar[0] >= R.PONTOS_PARTIDA || est.placar[1] >= R.PONTOS_PARTIDA) {
        est.fim = true;
        est.vencedor = est.placar[0] >= R.PONTOS_PARTIDA ? 0 : 1;
      }
    }

    function estadoParaSalvar() {
      // retomada: volta no começo desta mão (a mão em andamento é anulada)
      return { placar: est.placar.slice(), dador: (est.dador - 1 + n) % n, maoNumero: est.maoNumero - 1 };
    }

    async function rodar() {
      await emitir({ tipo: 'inicioPartida', placar: est.placar.slice(), n });
      while (!est.fim && !est.parado) {
        await jogarMao();
        if (est.parado) return null;
      }
      if (est.parado) return null;
      await emitir({ tipo: 'fimPartida', vencedor: est.vencedor, placar: est.placar.slice(), maos: est.maoNumero });
      return { vencedor: est.vencedor, placar: est.placar.slice(), maos: est.maoNumero };
    }

    return {
      rodar,
      vistaPara,
      parar() { est.parado = true; },
      placar: () => est.placar.slice(),
      fim: () => est.fim,
      maoNumero: () => est.maoNumero,
      equipe, parceiro, n, regras: vr.id
    };
  }

  T.Motor = { criar, sinalDe };
})(window.Poker = window.Poker || {});
