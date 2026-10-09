/* ==========================================================================
   OUTS · Treino Lab — multimesa.js
   Sit & Go e torneio com várias mesas de verdade: todas as mesas jogam mão a
   mão ao mesmo tempo, com o mesmo motor, o mesmo embaralhamento e os mesmos
   bots. A sua mesa é conduzida pela partida (animações e coach); as outras
   jogam "ao fundo", no mesmo ritmo, e podem ser assistidas ao vivo.

   Também cuida de:
   - eliminações e colocação final de cada jogador;
   - balanceamento: quando uma mesa fica 2 ou mais jogadores maior que outra,
     um jogador muda de mesa (entre as mãos das duas mesas);
   - desfazer mesas quando os jogadores restantes cabem nas outras, até
     sobrar a mesa final.
   Simplificação: você nunca troca de mesa — as outras se juntam à sua.

   Modo "instantâneo" (testes e partidas automáticas): sem esperas; as outras
   mesas jogam uma mão cada vez que a sua mesa joga uma (rodadaInstantanea).
   ========================================================================== */
(function (P) {
  'use strict';

  /**
   * o: { participantes, lugares, stack, nivel, modo, heroi (jogador), pagos,
   *      premios (valores, para o ICM dos bots), leitura (P.Leitura da partida),
   *      blinds() → blinds atuais, fator() → multiplicador de tempo,
   *      pausado() → true com o relógio parado, instantaneo,
   *      fmt(v) → texto de fichas,
   *      aoEliminar(jogador, posicao, mesaId), aoMensagem(texto, tipo) }
   */
  function criar(o) {
    const lugares = o.lugares;
    const T = Math.max(1, Math.ceil(o.participantes / lugares));
    const mesas = [];
    const todos = [];                 // todos os jogadores do torneio
    const saindo = new Map();         // jogador → mesa de destino (ou null = decidir na hora)
    const transito = [];              // [{ jogador, destino, origem }]
    const eliminados = [];            // [{ nome, posicao, mesa }]
    const ouvintes = new Set();
    let restantes = o.participantes;
    let ativo = true;
    const fmt = v => (o.fmt ? o.fmt(v) : String(v));

    // ------------------------------------------------------------ montagem
    const b0 = o.blinds();
    const novaMesa = (id, extra) => ({
      id, heroi: id === 1,
      mesa: P.Motor.criarMesa(Object.assign({ lugares, sb: b0.sb, bb: b0.bb, ante: b0.ante, anteBB: b0.anteBB }, extra)),
      quebrando: false, quebrada: false, mao: null, vez: null, ultimas: {}, resultado: null, maos: 0
    });
    const pendentes = [];             // retomada: quem estava quebrado numa mão já encerrada
    if (o.restaurar) {
      // partida salva: mesmas mesas, lugares, fichas, botão e mudanças em andamento
      const s = o.restaurar;
      s.jogadores.forEach(j => todos.push(j.heroi ? Object.assign(o.heroi, j) : j));
      restantes = s.restantes;
      s.eliminados.forEach(e => eliminados.push(e));
      s.mesas.forEach(sm => {
        const m = novaMesa(sm.id, { botaoInicial: sm.botao, numeroInicial: sm.numero, continuar: true });
        Object.assign(m, { quebrando: sm.quebrando, quebrada: sm.quebrada, maos: sm.maos });
        sm.assentos.forEach((k, q) => { if (k >= 0) m.mesa.sentar(q, todos[k]); });
        mesas.push(m);
      });
      s.saindo.forEach(([k, d]) => saindo.set(todos[k], d ? mesas[d - 1] : null));
      s.transito.forEach(x => transito.push({ jogador: todos[x.j], destino: x.destino ? mesas[x.destino - 1] : null, origem: mesas[x.origem - 1] }));
    } else {
      const base = Math.floor(o.participantes / T), extra = o.participantes % T;
      for (let t = 0; t < T; t++) mesas.push(novaMesa(t + 1));
      const nomes = [o.heroi.nome];
      const novoBot = () => {
        const bot = P.Bots.criar(o.nivel, nomes);
        nomes.push(bot.nome);
        bot.fichas = o.stack;
        return bot;
      };
      mesas.forEach((m, t) => {
        const n = base + (t < extra ? 1 : 0);
        for (let s = 0; s < n; s++) {
          const j = m.heroi && s === 0 ? o.heroi : novoBot();
          j.mesaId = m.id;
          m.mesa.sentar(s, j);
          todos.push(j);
        }
      });
    }

    // ------------------------------------------------------------ consultas
    const abertas = () => mesas.filter(m => !m.quebrada && !m.quebrando);
    const aberta = m => !!m && !m.quebrada && !m.quebrando;
    const ocupantes = m => m.mesa.assentos().filter(Boolean);
    /** Quantos vão ficar na mesa: sentados com fichas, menos os de saída, mais os a caminho. */
    function contagem(m) {
      return ocupantes(m).filter(j => j.fichas > 0 && !saindo.has(j)).length + transito.filter(x => x.destino === m).length;
    }
    const vivos = () => todos.filter(j => j.fichas > 0);

    function notificar(id) { ouvintes.forEach(fn => { try { fn(id); } catch (e) { /* interface fechada */ } }); }

    /** Espera "ms" de tempo de torneio (parado enquanto o relógio estiver pausado). */
    async function esperar(ms) {
      if (o.instantaneo || ms <= 0) return;
      let resta = ms, ultimo = performance.now();
      while (resta > 0 && ativo) {
        await new Promise(r => setTimeout(r, Math.min(100, resta)));
        const agora = performance.now();
        if (!o.pausado()) resta -= agora - ultimo;
        ultimo = agora;
      }
    }

    // ------------------------------------------- balanceamento e mudanças
    function reequilibrar() {
      let ab = abertas();
      // desfaz a menor mesa (nunca a sua) quando todos cabem nas outras
      while (ab.length > 1) {
        // a sua mesa só é desfeita se você já tiver sido eliminado
        const cabemSem = alvo => ab.reduce((s, m) => s + (m === alvo ? 0 : capacidade(m)), 0);
        const alvo = ab.filter(m => !m.heroi || o.heroi.fichas <= 0)
          .sort((a, b) => contagem(a) - contagem(b) || b.id - a.id)
          .find(m => restantes <= cabemSem(m));
        if (!alvo) break;
        alvo.quebrando = true;
        ocupantes(alvo).forEach(j => { if (j.fichas > 0) saindo.set(j, null); });
        // quem ia para essa mesa (já a caminho ou ainda esperando sair) ganha outro destino
        transito.forEach(x => { if (x.destino === alvo) x.destino = null; });
        saindo.forEach((d, j) => { if (d === alvo) saindo.set(j, null); });
        const sobram = ab.length - 1;
        o.aoMensagem(sobram === 1 ? `Mesa ${alvo.id} desfeita: todos para a mesa final!` : `Mesa ${alvo.id} desfeita (restam ${sobram} mesas)`, sobram === 1 ? 'nivel' : 'info');
        notificar(alvo.id);
        ab = abertas();
      }
      // destinos ainda indefinidos (ou que deixaram de existir)
      transito.forEach(x => { if (!aberta(x.destino)) x.destino = escolherDestino(x.origem); });
      // diferença de 2 ou mais: um jogador da mais cheia vai para a mais vazia
      for (let guarda = 0; guarda < 40; guarda++) {
        ab = abertas().sort((a, b) => contagem(b) - contagem(a));
        if (ab.length < 2) break;
        const maior = ab[0], menor = ab[ab.length - 1];
        if (contagem(maior) - contagem(menor) < 2) break;
        const cand = ocupantes(maior).filter(j => j.fichas > 0 && !j.heroi && !saindo.has(j));
        if (!cand.length) break;
        saindo.set(P.RNG.escolher(cand), menor);
      }
    }

    // o lugar 0 da sua mesa é sempre seu (mesmo sem fichas)
    const capacidade = m => (m.heroi && o.heroi.fichas <= 0 ? lugares - 1 : lugares);
    function escolherDestino(origem) {
      let ab = abertas().filter(m => m !== origem && contagem(m) < capacidade(m));
      if (!ab.length) ab = abertas().filter(m => contagem(m) < capacidade(m));   // só sobrou a mesa de origem: volta para ela
      if (!ab.length) return null;
      ab.sort((a, b) => contagem(a) - contagem(b) || (a.heroi ? -1 : 0));
      return ab[0];
    }

    /** Entre as mãos de uma mesa: saem os marcados e sentam os que chegam. */
    function entreMaos(m) {
      const msgs = [];
      if (m.quebrando) ocupantes(m).forEach(j => { if (j.fichas > 0 && !saindo.has(j)) saindo.set(j, null); });
      ocupantes(m).forEach(j => {
        if (!saindo.has(j)) return;
        const destino = aberta(saindo.get(j)) ? saindo.get(j) : escolherDestino(m);
        saindo.delete(j);
        const s = m.mesa.assentos().indexOf(j);
        m.mesa.levantar(s);
        transito.push({ jogador: j, destino, origem: m });
        if (m.heroi) msgs.push([`${j.nome} foi para a mesa ${destino ? destino.id : '?'}`, 'saida']);
      });
      reequilibrar();
      // quem está a caminho desta mesa senta num lugar livre
      for (let i = 0; i < transito.length; i++) {
        const x = transito[i];
        if (x.destino !== m) continue;
        if (!aberta(m)) { x.destino = escolherDestino(x.origem); continue; }
        const livres = [];
        m.mesa.assentos().forEach((j, s) => { if (!j && !(m.heroi && s === 0)) livres.push(s); });
        if (!livres.length) { x.destino = null; continue; }
        const s = P.RNG.escolher(livres);
        x.jogador.mesaId = m.id;
        m.mesa.sentar(s, x.jogador);
        transito.splice(i--, 1);
        if (m.heroi) msgs.push([`${x.jogador.nome} chega da mesa ${x.origem.id} com ${fmt(x.jogador.fichas)}`, 'entrada']);
      }
      if (m.quebrando && !ocupantes(m).some(j => j.fichas > 0)) {
        ocupantes(m).forEach((j, k) => m.mesa.levantar(m.mesa.assentos().indexOf(j)));
        m.quebrada = true;
      }
      notificar(m.id);
      return msgs;
    }

    /** Fim de uma mão numa mesa: tira quem quebrou e devolve as colocações. */
    function fimDeMao(m, r, h) {
      m.maos++;
      const quebrados = h.jogadores.filter(j => r.fichasFinais[j.assento] === 0).sort((a, b) => a.fichasIniciais - b.fichasIniciais);
      const out = [];
      quebrados.forEach(q => {
        const j = m.mesa.jogador(q.assento);
        const posicao = restantes;
        restantes--;
        eliminados.push({ nome: j.nome, posicao, mesa: m.id, heroi: !!j.heroi });
        saindo.delete(j);
        if (!j.heroi) m.mesa.levantar(q.assento);
        out.push({ jogador: j, posicao, assento: q.assento });
      });
      if (out.length) reequilibrar();
      notificar(m.id);
      return out;
    }

    // --------------------------------------------------- mesas ao fundo
    /** Premiação e stacks das outras mesas, para o ICM dos bots da mesa "m". */
    function ctxTorneioDe(m) {
      if (!o.premios || !o.premios.length) return null;
      return {
        premios: o.premios.slice(0, Math.min(o.premios.length, restantes)),
        stacksFora: vivos().filter(j => j.mesaId !== m.id || transito.some(x => x.jogador === j)).map(j => j.fichas),
        restantes, pagos: o.premios.length
      };
    }

    function decidirBot(mao, s, m) {
      const bot = m.mesa.jogador(s);
      let bolha = 1, agress = 1;
      if (o.pagos && restantes > o.pagos && restantes - o.pagos <= 2) {
        const maior = Math.max.apply(null, m.mesa.ativos().map(q => m.mesa.jogador(q).fichas));
        if (bot.fichas >= maior) agress = 1.3; else bolha = 0.6;
      }
      return P.Bots.decidir(mao.vista(s), s, {
        perfil: bot.perfil, nivel: o.nivel, modo: o.modo, bolha, agressividade: agress,
        leitura: o.leitura || null, torneio: ctxTorneioDe(m), estilo: bot.estilo
      });
    }

    function textoAcao(reg) {
      if (reg.acao === 'fold') return 'fold';
      if (reg.acao === 'check') return 'check';
      if (reg.acao === 'call') return 'paga ' + fmt(reg.valor) + (reg.allin ? ' (all-in)' : '');
      return (reg.acao === 'bet' ? 'aposta ' : 'aumenta para ') + fmt(reg.ate) + (reg.allin ? ' (all-in)' : '');
    }

    async function jogarMaoFundo(m) {
      m.mesa.definirBlinds(o.blinds());
      const mao = m.mesa.proximaMao();
      m.mao = mao; m.ultimas = {}; m.resultado = null; m.vez = null;
      notificar(m.id);
      await esperar(1000 * o.fator());                        // distribuição
      let rua = mao.rua();
      while (!mao.terminada() && ativo) {
        const s = mao.vez();
        const d = decidirBot(mao, s, m);
        m.vez = s;
        notificar(m.id);
        await esperar(d.ms * o.fator());
        if (!ativo) return;
        let reg;
        try { reg = mao.agir(s, d.acao); }
        catch (e) { const v = mao.acoesValidas(); reg = mao.agir(s, v.podeCheck ? 'check' : 'fold'); }
        m.ultimas[s] = textoAcao(reg);
        m.vez = null;
        if (mao.rua() !== rua && !mao.terminada()) {
          rua = mao.rua();
          Object.keys(m.ultimas).forEach(k => { if (m.ultimas[k] !== 'fold') delete m.ultimas[k]; });
          notificar(m.id);
          await esperar(700 * o.fator());
        } else notificar(m.id);
      }
      if (!ativo) return;
      const r = m.mesa.concluirMao();
      const h = mao.historicoCompleto();
      if (o.leitura) o.leitura.registrar(mao.vista(null));
      m.resultado = mao.eventos().filter(e => e.tipo === 'pote').map(e => e.vencedores.map(v => `${m.mesa.jogador(v.assento) ? m.mesa.jogador(v.assento).nome : '?'} ganha ${fmt(v.valor)}`).join(', ') + (e.descricao ? ' com ' + e.descricao : '')).join(' · ');
      notificar(m.id);
      await esperar((r.semShowdown ? 1500 : 3200) * o.fator());
      fimDeMao(m, r, h).forEach(e => o.aoEliminar(e.jogador, e.posicao, m.id));
    }

    /** Uma volta de uma mesa ao fundo: mudanças de lugar e, se der, uma mão. Devolve false se a mesa acabou. */
    async function voltaFundo(m) {
      entreMaos(m);
      if (m.quebrada) return false;
      if (m.mesa.ativos().length < 2 || restantes < 2) return true;   // esperando jogadores de outras mesas
      await jogarMaoFundo(m);
      return true;
    }

    async function loopFundo(m) {
      while (ativo && !m.quebrada && restantes > 1) {
        const jogou = m.mesa.ativos().length >= 2;
        if (!(await voltaFundo(m))) break;
        await esperar(jogou ? 1500 * o.fator() : 600);
      }
      m.mao = null;
      notificar(m.id);
    }

    // retomada: quem tinha ficado sem fichas numa mão encerrada pouco antes de salvar é eliminado agora
    if (o.restaurar) {
      mesas.forEach(m => ocupantes(m).forEach(j => { if (!j.heroi && j.fichas <= 0) pendentes.push([m, j]); }));
      pendentes.forEach(([m, j]) => {
        const posicao = restantes--;
        eliminados.push({ nome: j.nome, posicao, mesa: m.id, heroi: false });
        saindo.delete(j);
        m.mesa.levantar(m.mesa.assentos().indexOf(j));
        o.aoEliminar(j, posicao, m.id);
      });
    }

    /** Estado completo para salvar (as mãos em andamento nas outras mesas são anuladas ao retomar). */
    function exportar() {
      const idx = j => todos.indexOf(j);
      return {
        restantes, eliminados: eliminados.slice(),
        jogadores: todos.map(j => Object.assign({}, j)),
        mesas: mesas.map(m => ({
          id: m.id, quebrando: m.quebrando, quebrada: m.quebrada, maos: m.maos, botao: m.mesa.botao(), numero: m.mesa.numero(),
          assentos: m.mesa.assentos().map(j => (j ? idx(j) : -1))
        })),
        saindo: Array.from(saindo.entries()).map(([j, d]) => [idx(j), d ? d.id : null]),
        transito: transito.map(x => ({ j: idx(x.jogador), destino: x.destino ? x.destino.id : null, origem: x.origem.id }))
      };
    }

    // ------------------------------------------------------------- API
    return {
      exportar,
      mesas: () => mesas.length,
      mesaHeroi: () => mesas[0].mesa,
      mesasAbertas: () => mesas.filter(m => !m.quebrada).length,
      restantes: () => restantes,
      totalFichas: o.participantes * o.stack,
      eliminados: () => eliminados.slice(),

      /** Entre as mãos da sua mesa (chamado pela partida). Devolve mensagens [texto, tipo]. */
      entreMaosHeroi: () => entreMaos(mesas[0]),
      /** Fim de uma mão da sua mesa: colocações de quem quebrou. */
      fimDeMaoHeroi: (r, h) => fimDeMao(mesas[0], r, h),
      definirMaoHeroi: mao => { mesas[0].mao = mao; mesas[0].ultimas = {}; mesas[0].resultado = null; notificar(1); },
      acaoHeroi: (assento, reg) => { if (reg) mesas[0].ultimas[assento] = textoAcao(reg); notificar(1); },

      /** Liga as outras mesas em tempo real. */
      iniciarFundo: () => { mesas.forEach(m => { if (!m.heroi) loopFundo(m); }); },
      /** Modo instantâneo: cada outra mesa joga uma mão. */
      rodadaInstantanea: async () => { for (const m of mesas) if (!m.heroi && !m.quebrada && ativo) await voltaFundo(m); },
      parar: () => { ativo = false; },

      /** Stacks de quem não está na sua mesa (para o ICM do coach). */
      stacksFora: () => vivos().filter(j => j.mesaId !== 1 || transito.some(x => x.jogador === j)).map(j => j.fichas),
      /** Colocação pelo tamanho do stack. */
      posicaoDe: j => 1 + vivos().filter(x => x !== j && x.fichas > j.fichas).length,
      classificacao: () => vivos().sort((a, b) => b.fichas - a.fichas).map(j => ({
        nome: j.nome, fichas: j.fichas, heroi: !!j.heroi, perfil: j.perfil,
        mesa: transito.some(x => x.jogador === j) ? null : j.mesaId
      })),

      /** Resumo de cada mesa para a lista. */
      resumo: () => mesas.map(m => {
        const js = ocupantes(m).filter(j => j.fichas > 0 || (m.mao && !m.mao.terminada()));
        const lider = js.slice().sort((a, b) => b.fichas - a.fichas)[0];
        return {
          id: m.id, heroi: m.heroi, quebrada: m.quebrada, quebrando: m.quebrando,
          jogadores: js.length, maos: m.maos, rua: m.mao && !m.mao.terminada() ? m.mao.rua() : null,
          lider: lider ? { nome: lider.nome, fichas: lider.fichas } : null,
          media: js.length ? js.reduce((s, j) => s + j.fichas, 0) / js.length : 0
        };
      }),

      /** O que um espectador vê de uma mesa (sem cartas fechadas). */
      vistaMesa: id => {
        const m = mesas[id - 1];
        if (!m) return null;
        const v = m.mao ? m.mao.vista(null) : null;
        let apostas = 0;
        const assentos = m.mesa.assentos().map((j, s) => {
          if (!j) return null;
          const jv = v ? v.jogadores.find(x => x.assento === s) : null;
          if (jv) apostas += jv.apostaRua;
          return {
            assento: s, nome: j.nome, heroi: !!j.heroi, perfil: j.perfil,
            fichas: jv ? jv.fichas : j.fichas, aposta: jv ? jv.apostaRua : 0,
            naMao: !!jv, foldou: jv ? jv.foldou : false, allin: jv ? jv.allin : false,
            cartas: jv && jv.cartas ? jv.cartas : null, botao: jv ? jv.botao : false,
            ult: m.ultimas[s] || '', vez: m.vez === s || (v && v.vez === s && m.heroi), saindo: saindo.has(j)
          };
        });
        return {
          id: m.id, heroi: m.heroi, lugares, quebrada: m.quebrada, quebrando: m.quebrando, assentos,
          board: v ? v.board : [], pote: v ? v.pote : 0, apostas, rua: v ? v.rua : null,
          numero: v ? v.numero : m.maos, blinds: v ? v.blinds : o.blinds(), resultado: m.resultado
        };
      },
      ouvir: fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); },

      /** Conferência (testes): fichas conservadas e mesas equilibradas. */
      diagnostico: () => ({
        restantes, vivos: vivos().length, fichas: vivos().reduce((s, j) => s + j.fichas, 0),
        mesas: abertas().map(m => contagem(m)), transito: transito.length,
        posicoes: eliminados.map(e => e.posicao)
      })
    };
  }

  P.MultiMesa = { criar };
})(window.Poker = window.Poker || {});
