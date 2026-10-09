/* ==========================================================================
   OUTS · Treino Lab — partida.js
   Controlador de uma partida (cash, Sit & Go ou torneio): senta jogadores,
   roda as mãos, chama os bots com tempo de decisão, pede a ação do herói,
   aciona o coach, avalia decisões, atualiza estatísticas e histórico e sobe
   os blinds pelo relógio. No Sit & Go e no torneio as outras mesas jogam de
   verdade ao mesmo tempo (multimesa.js).

   Não desenha nada: conversa com a interface por callbacks (ui.*), todos
   opcionais e podendo devolver Promise (para esperar animações).
   ========================================================================== */
(function (P) {
  'use strict';

  const E = P.Estruturas;
  const HEROI = 0;
  const CHAVE_SALVA = 'partidaAtiva';
  // multiplicador do tempo de "pensamento" dos bots (normal = 1,4: ritmo mais calmo)
  const FATOR_VELOCIDADE = { lenta: 2, normal: 1.4, rapida: 1, turbo: 0.25 };

  function esperar(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }
  async function chamar(ui, nome, ...args) {
    if (ui && typeof ui[nome] === 'function') return ui[nome](...args);
    return undefined;
  }

  /**
   * cfg: { modo, nivel, lugares, heroi: {nome, mostraPerdedoras},
   *        cash: limite {nome,sb,bb}, buyinBB, recompraAuto
   *        sng: buyin {total, premio}, velocidade, participantes (várias mesas se > lugares)
   *        torneio: buyin, velocidade, field
   *        autoHeroi, instantaneo, maosPorNivel (testes), iteracoesCoach }
   */
  function criar(cfg, ui) {
    const modo = cfg.modo, lugares = cfg.lugares;
    const participantes = modo === 'sng' ? Math.max(lugares, cfg.participantes || lugares) : modo === 'torneio' ? cfg.field : lugares;
    const nomesUsados = () => mesa.assentos().filter(Boolean).map(j => j.nome);
    let ativo = true, rodando = false, fim = null;
    let mesa, torneio = null, premios = [], pool = 0;
    let nivelIdx = 0, inicioNivel = 0, pausadoEm = null, pausaAcumulada = 0, maosNoNivel = 0;
    let maosJogadas = 0, resultadoSessao = 0, investidoHeroi = 0;
    const eliminados = [];          // [{nome, posicao, premio}]
    const avisos = {};              // bolha / premiação / mesa final já anunciados
    const decisoesMao = [];
    const registro = { maos: [], decisoes: [], inicio: Date.now() };   // para a análise de fim de partida
    let maoAtual = null;

    const rotulo = modo === 'cash' ? cfg.limite.nome :
      modo === 'sng' ? `Sit & Go ${P.Formato ? P.Formato.dinheiro(cfg.buyin.total) : cfg.buyin.total}` + (participantes > lugares ? ` · ${participantes} jogadores` : '') :
        `Torneio ${P.Formato ? P.Formato.dinheiro(cfg.buyin.total) : cfg.buyin.total} · ${cfg.field} jogadores`;

    function blindsAtuais() {
      if (modo === 'cash') return { sb: cfg.limite.sb, bb: cfg.limite.bb, ante: 0, anteBB: false };
      return modo === 'sng' ? E.nivelSNG(nivelIdx) : E.nivelTorneio(nivelIdx);
    }
    function duracaoNivel() {
      const d = modo === 'sng' ? E.SNG_DURACAO : E.TORNEIO_DURACAO;
      return (d[cfg.velocidade] || d.regular) * 1000;
    }
    function agora() { return performance.now(); }
    function decorridoNivel() {
      const ref = pausadoEm !== null ? pausadoEm : agora();
      return ref - inicioNivel - pausaAcumulada;
    }

    /** Sobe o nível quando o tempo (ou, nos testes, o número de mãos) acabou. Vale para todas as mesas. */
    function atualizarNivel(porMao) {
      if (modo === 'cash') return;
      const subir = cfg.maosPorNivel ? porMao && maosNoNivel >= cfg.maosPorNivel : decorridoNivel() >= duracaoNivel();
      if (!subir) return;
      nivelIdx++;
      maosNoNivel = 0;
      inicioNivel = agora();
      pausaAcumulada = 0;
      if (pausadoEm !== null) pausadoEm = agora();
      const b = blindsAtuais();
      chamar(ui, 'aoMensagem', `Nível ${nivelIdx + 1}: blinds ${fmt(b.sb)}/${fmt(b.bb)}` + (b.ante ? ` · ${b.anteBB ? 'BB ante' : 'ante'} ${fmt(b.ante)}` : ''), 'nivel');
    }

    // --------------------------------------------------- salvar e retomar
    // A cada mão o estado da partida é salvo. Se o app fechar (o celular encerra apps em segundo
    // plano para economizar memória), ao abrir de novo a partida continua do começo da mão que
    // estava em andamento (essa mão é anulada: as fichas voltam ao que eram antes dela).
    const salvavel = !cfg.instantaneo && !cfg.autoHeroi && !cfg.semSalvar;

    function salvarEstado() {
      if (!salvavel || fim || !ativo) return;
      const cfgLimpo = Object.assign({}, cfg);
      delete cfgLimpo.retomar;
      P.Armazenamento.gravar(CHAVE_SALVA, {
        versao: 1, salvoEm: Date.now(), rotulo, modo, retomadas: 0,
        cfg: cfgLimpo,
        nivelIdx, decorrido: modo === 'cash' ? 0 : decorridoNivel(), maosNoNivel, maosJogadas, resultadoSessao, investidoHeroi,
        eliminados: eliminados.slice(), avisos: Object.assign({}, avisos),
        registro: { ids: registro.maos.map(r => r.id), inicio: registro.inicio },
        mesa: modo === 'cash' ? { botao: mesa.botao(), numero: mesa.numero(), assentos: mesa.assentos().map(j => (j ? Object.assign({}, j) : null)) } : null,
        torneio: torneio ? torneio.exportar() : null,
        heroiFichas: mesa.jogador(HEROI) ? mesa.jogador(HEROI).fichas : 0
      });
    }
    function apagarEstado() { if (salvavel) P.Armazenamento.remover(CHAVE_SALVA); }

    function restaurar(s) {
      nivelIdx = s.nivelIdx; maosNoNivel = s.maosNoNivel; maosJogadas = s.maosJogadas;
      inicioNivel = agora() - (s.decorrido || 0);   // o relógio continua de onde parou
      resultadoSessao = s.resultadoSessao; investidoHeroi = s.investidoHeroi;
      s.eliminados.forEach(e => eliminados.push(e));
      Object.assign(avisos, s.avisos);
      registro.inicio = s.registro.inicio;
      s.registro.ids.forEach(id => {
        const r = P.HistoricoMaos.porId(id);
        if (r) { registro.maos.push(r); registro.decisoes.push(...(r.decisoes || [])); }
      });
      const b = blindsAtuais();
      if (modo === 'cash') {
        mesa = P.Motor.criarMesa({ lugares, sb: b.sb, bb: b.bb, ante: b.ante, anteBB: b.anteBB, botaoInicial: s.mesa.botao, numeroInicial: s.mesa.numero, continuar: true });
        s.mesa.assentos.forEach((j, q) => { if (j) mesa.sentar(q, j); });
      } else {
        pool = cfg.buyin.premio * participantes;
        premios = E.valoresPremios(pool, modo === 'sng' ? E.percentuaisSNG(participantes) : E.percentuaisTorneio(participantes));
        const heroi = { id: 'heroi', heroi: true, mostraPerdedoras: !!cfg.heroi.mostraPerdedoras, perfil: 'tag' };
        torneio = criarTorneio(heroi, s.torneio);
        mesa = torneio.mesaHeroi();
      }
    }

    function criarTorneio(heroi, restaurarDe) {
      return P.MultiMesa.criar({
        participantes, lugares, stack: modo === 'sng' ? E.SNG_STACK : E.TORNEIO_STACK, nivel: cfg.nivel, modo, heroi, pagos: premios.length,
        blinds: () => { atualizarNivel(false); return blindsAtuais(); },
        fator: () => FATOR_VELOCIDADE[P.Config.get('velocidade')] || 1,
        pausado: () => pausadoEm !== null,
        instantaneo: !!cfg.instantaneo, fmt, restaurar: restaurarDe || null,
        aoEliminar: eliminadoEmOutraMesa,
        aoMensagem: (t, tipo) => chamar(ui, 'aoMensagem', t, tipo)
      });
    }

    // --------------------------------------------------------- montagem
    function montar() {
      if (cfg.retomar) { restaurar(cfg.retomar); return; }
      inicioNivel = agora();
      const b = blindsAtuais();
      const heroi = { id: 'heroi', nome: cfg.heroi.nome || 'Você', heroi: true, mostraPerdedoras: !!cfg.heroi.mostraPerdedoras, perfil: 'tag' };
      if (modo === 'cash') {
        mesa = P.Motor.criarMesa({ lugares, sb: b.sb, bb: b.bb, ante: b.ante, anteBB: b.anteBB });
        heroi.fichas = Math.round(cfg.buyinBB * cfg.limite.bb);
        investidoHeroi = heroi.fichas;
        if (!cfg.semBanca) P.Banca.ajustar(-heroi.fichas);
        mesa.sentar(HEROI, heroi);
        for (let s = 1; s < lugares; s++) mesa.sentar(s, novoBot(heroi.fichas));
      } else {
        heroi.fichas = modo === 'sng' ? E.SNG_STACK : E.TORNEIO_STACK;
        investidoHeroi = cfg.buyin.total;
        if (!cfg.semBanca) P.Banca.ajustar(-cfg.buyin.total);
        pool = cfg.buyin.premio * participantes;
        premios = E.valoresPremios(pool, modo === 'sng' ? E.percentuaisSNG(participantes) : E.percentuaisTorneio(participantes));
        // todas as mesas do torneio (a sua é a mesa 1)
        torneio = criarTorneio(heroi);
        mesa = torneio.mesaHeroi();
      }
      inicioNivel = agora();
    }

    /** Alguém caiu em outra mesa: entra na lista de eliminados (e avisa na reta final). */
    function eliminadoEmOutraMesa(jogador, posicao, mesaId) {
      const premio = posicao <= premios.length ? premios[posicao - 1] : 0;
      eliminados.push({ nome: jogador.nome, posicao, premio });
      if (premio > 0 || posicao <= lugares + 1) {
        chamar(ui, 'aoMensagem', `${jogador.nome} (mesa ${mesaId}) eliminado em ${posicao}º` + (premio ? ` (${P.Formato ? P.Formato.dinheiro(premio) : premio})` : ''), 'saida');
      }
    }

    function novoBot(stackPadrao) {
      const bot = P.Bots.criar(cfg.nivel, mesa ? nomesUsados() : []);
      if (modo === 'cash') {
        const bb = cfg.limite.bb;
        const bbs = bot.perfil === 'station' ? 40 + P.RNG.inteiroAbaixo(70) : bot.perfil === 'nit' ? 100 : 60 + P.RNG.inteiroAbaixo(90);
        bot.fichas = Math.round(bbs * bb);
      } else bot.fichas = stackPadrao;
      return bot;
    }

    // ------------------------------------------------------- informação
    function info() {
      const b = blindsAtuais();
      const base = { modo, rotulo, nivelMesa: cfg.nivel, lugares, blinds: b, maos: maosJogadas };
      const heroi = mesa.jogador(HEROI);
      if (modo === 'cash') {
        return Object.assign(base, {
          stack: heroi ? heroi.fichas : 0, resultado: resultadoSessao,
          bb100: maosJogadas ? resultadoSessao / b.bb / maosJogadas * 100 : 0
        });
      }
      const prox = modo === 'sng' ? E.nivelSNG(nivelIdx + 1) : E.nivelTorneio(nivelIdx + 1);
      const restanteMs = cfg.maosPorNivel ? null : Math.max(0, duracaoNivel() - decorridoNivel());
      const restantes = torneio.restantes();
      const meu = heroi ? heroi.fichas : 0;
      const posicao = heroi ? torneio.posicaoDe(heroi) : restantes;
      const pagos = premios.length;
      const falta = restantes - pagos;
      return Object.assign(base, {
        nivel: nivelIdx + 1, proximo: prox, restanteMs, maosNoNivel, maosPorNivel: cfg.maosPorNivel || null,
        restantes, field: participantes, mesas: torneio.mesasAbertas(),
        stackMedio: torneio.totalFichas / Math.max(1, restantes), stack: meu, posicao,
        pagos, premios, pool, itm: falta <= 0, bolha: falta > 0 && falta <= Math.max(1, Math.ceil(pagos * 0.15)),
        proximoPremio: falta > 0 ? premios[pagos - 1] : premios[Math.min(pagos, restantes) - 1],
        eliminados: eliminados.slice(-5)
      });
    }

    /** Contexto de torneio para o coach (ICM). */
    function ctxTorneio() {
      if (modo === 'cash') return null;
      const restantes = torneio.restantes();
      return {
        premios: premios.slice(0, Math.min(premios.length, restantes)),
        stacksFora: torneio.stacksFora(),
        restantes, pagos: premios.length
      };
    }

    function perfis() {
      const out = {};
      mesa.assentos().forEach((j, s) => { if (j && !j.heroi) out[s] = j.perfil; });
      return out;
    }

    // --------------------------------------------------- antes de cada mão
    async function prepararMao() {
      // relógio de nível e mudanças de mesa (quem sai para equilibrar, quem chega)
      if (modo !== 'cash') {
        atualizarNivel(true);
        mesa.definirBlinds(blindsAtuais());
        for (const [texto, tipo] of torneio.entreMaosHeroi()) await chamar(ui, 'aoMensagem', texto, tipo);
      }
      // cash: lugares vazios recebem novos jogadores
      if (modo === 'cash') {
        for (let s = 1; s < lugares; s++) {
          if (!mesa.jogador(s) && (cfg.instantaneo || P.RNG.chance(0.7))) {
            const bot = novoBot();
            mesa.sentar(s, bot);
            await chamar(ui, 'aoMensagem', `${bot.nome} (${bot.pais.nome}) sentou na mesa`, 'entrada');
          }
        }
        const heroi = mesa.jogador(HEROI);
        const alvo = Math.round(cfg.buyinBB * cfg.limite.bb);
        if (cfg.recompraAuto && heroi.fichas > 0 && heroi.fichas < alvo * 0.5) {
          const falta = alvo - heroi.fichas;
          if (cfg.semBanca || P.Banca.saldo() >= falta) {
            heroi.fichas += falta;
            investidoHeroi += falta;
            if (!cfg.semBanca) P.Banca.ajustar(-falta);
            await chamar(ui, 'aoMensagem', `Recompra automática: stack completado para ${fmt(alvo)}`, 'recompra');
          }
        }
      }
      // avisos de bolha, premiação e mesa final
      if (modo !== 'cash') {
        const restantes = torneio.restantes();
        const pagos = premios.length;
        if (pagos >= 2 && !avisos.bolha && restantes === pagos + 1) {
          avisos.bolha = true;
          await chamar(ui, 'aoMensagem', 'Bolha! O próximo eliminado sai sem prêmio.', 'nivel');
        }
        if (!avisos.itm && restantes <= pagos && restantes > 1) {
          avisos.itm = true;
          await chamar(ui, 'aoMensagem', `Todos na premiação! Prêmio mínimo garantido: ${P.Formato ? P.Formato.dinheiro(premios[Math.min(pagos, restantes) - 1]) : ''}`, 'nivel');
        }
        if (torneio.mesas() > 1 && !avisos.mesaFinal && torneio.mesasAbertas() === 1 && restantes > 1) {
          avisos.mesaFinal = true;
          await chamar(ui, 'aoMensagem', `Mesa final! Restam ${restantes} jogadores.`, 'nivel');
        }
      }
    }

    function fmt(v) {
      if (P.Formato) return modo === 'cash' ? P.Formato.dinheiro(v) : P.Formato.fichas(v);
      return String(v);
    }

    // ------------------------------------------------------------ uma mão
    async function jogarMao() {
      if (cfg.instantaneo) await esperar(0);     // cede a tela entre as mãos
      const b = blindsAtuais();
      salvarEstado();                             // ponto de retomada se o app fechar durante a mão
      const mao = mesa.proximaMao();
      maoAtual = mao;
      if (torneio) torneio.definirMaoHeroi(mao);
      decisoesMao.length = 0;
      let lidos = 0;
      await chamar(ui, 'aoNovaMao', mao.vista(HEROI), info());
      lidos = await emitir(mao, lidos);
      while (!mao.terminada()) {
        if (!ativo) return null;
        const vez = mao.vez();
        if (vez === HEROI) await turnoHeroi(mao);
        else await turnoBot(mao, vez);
        if (!ativo) return null;
        lidos = await emitir(mao, lidos);
      }
      return concluir(mao, b);
    }

    async function emitir(mao, lidos) {
      const evs = mao.eventos();
      if (evs.length > lidos) await chamar(ui, 'aoEventos', evs.slice(lidos), mao.vista(HEROI));
      return evs.length;
    }

    async function turnoBot(mao, assento) {
      const bot = mesa.jogador(assento);
      const vistaBot = mao.vista(assento);
      const inf = ctxTorneio();
      let bolha = 1, agress = 1;
      if (inf && inf.restantes > inf.pagos && inf.restantes - inf.pagos <= 2) {
        const ativos = mesa.ativos().map(s => mesa.jogador(s).fichas);
        const maior = Math.max.apply(null, ativos);
        if (bot.fichas >= maior) agress = 1.3; else bolha = 0.6;
      }
      const d = P.Bots.decidir(vistaBot, assento, { perfil: bot.perfil, nivel: cfg.nivel, modo, bolha, agressividade: agress });
      const fator = FATOR_VELOCIDADE[P.Config.get('velocidade')] || 1;
      await chamar(ui, 'aoVezDoBot', assento, cfg.instantaneo ? 0 : d.ms * fator);
      if (!ativo) return;
      try { mao.agir(assento, d.acao); }
      catch (e) { const v = mao.acoesValidas(); mao.agir(assento, v.podeCheck ? 'check' : 'fold'); }
    }

    async function turnoHeroi(mao) {
      const vista = mao.vista(HEROI);
      const ctx = {
        perfis: perfis(), modo, nivel: cfg.nivel, torneio: ctxTorneio(),
        iteracoes: cfg.iteracoesCoach || 10000,
        fmt, fmtBB: v => (P.Formato ? P.Formato.bb(v, vista.blinds.bb) : (v / vista.blinds.bb).toFixed(1) + ' bb')
      };
      let promAnalise = null;
      if (!cfg.autoHeroi || cfg.autoCoach) {
        promAnalise = P.Coach.analisar(vista, HEROI, ctx, parcial => chamar(ui, 'aoAnaliseParcial', parcial));
      }
      let acao;
      if (cfg.autoHeroiPreflop && vista.rua === 'preflop') {
        // só para testes visuais: paga o pré-flop sozinho para chegar ao flop
        acao = vista.acoes.podeCheck ? 'check' : 'call';
        if (promAnalise) { await promAnalise; P.Coach.cancelar(); }
        promAnalise = null;
      } else if (cfg.autoHeroi) {
        acao = P.Bots.decidir(vista, HEROI, { perfil: cfg.perfilAutoHeroi || 'tag', nivel: cfg.nivel, modo }).acao;
      } else {
        acao = await chamar(ui, 'pedirAcao', vista, { analise: promAnalise, ctx });
      }
      if (!ativo) return;
      let reg;
      const indiceEvento = mao.totalEventos();     // o evento da ação do herói entra nessa posição
      try { reg = mao.agir(HEROI, acao); }
      catch (e) {
        await chamar(ui, 'aoMensagem', 'Ação inválida: ' + e.message, 'erro');
        const v = mao.acoesValidas();
        reg = mao.agir(HEROI, v.podeCheck ? 'check' : 'fold');
      }
      if (promAnalise) {
        const an = await promAnalise;
        const nota = P.Coach.avaliarDecisao(an, { tipo: reg.acao === 'raise' || reg.acao === 'bet' ? (reg.allin ? 'allin' : reg.acao) : reg.acao, ate: reg.ate });
        if (nota) {
          P.Estatisticas.registrarDecisao(nota);
          decisoesMao.push({
            numeroMao: mao.numero, cartas: an.cartas.slice(), board: an.board.slice(), pote: an.pote, paraPagar: an.paraPagar, bb: an.bb,
            evento: indiceEvento, rua: an.rua, nota, recomendacao: an.recomendacao,
            passos: an.passos.slice(),
            equity: an.equity ? an.equity.valor : null,
            potOdds: an.posflop && an.posflop.potOdds ? an.posflop.potOdds.necessaria : null,
            outs: an.posflop ? { limpos: an.posflop.outs.limpos, sujos: an.posflop.outs.sujos, draws: an.posflop.outs.draws } : null,
            mao: an.posflop ? an.posflop.mao.rotulo : an.classe + ' · ' + an.categoria
          });
          await chamar(ui, 'aoDecisaoAvaliada', nota, an);
        }
      }
    }

    // ------------------------------------------------------- depois da mão
    async function concluir(mao, blindsDaMao) {
      const r = mesa.concluirMao();
      const h = mao.historicoCompleto();
      maosJogadas++;
      maosNoNivel++;
      const ganho = r.ganhos[HEROI] || 0;
      if (modo === 'cash') resultadoSessao += ganho;
      P.Estatisticas.registrarMao(h, HEROI, modo);
      const regMao = { modo, rotulo, unidade: modo === 'cash' ? 'dinheiro' : 'fichas', heroi: HEROI, hist: h, decisoes: decisoesMao.slice(), ganho };
      if (P.HistoricoMaos) P.HistoricoMaos.adicionar(regMao);
      decisoesMao.forEach(d => { d.maoId = regMao.id; });
      registro.maos.push(regMao);
      registro.decisoes.push(...decisoesMao);

      if (modo === 'cash') {
        // quem quebrou sai da mesa (o herói decide a recompra mais abaixo)
        for (const j of h.jogadores.filter(x => r.fichasFinais[x.assento] === 0 && x.assento !== HEROI)) {
          const jog = mesa.levantar(j.assento);
          await chamar(ui, 'aoMensagem', `${jog.nome} quebrou e saiu da mesa`, 'saida');
        }
      } else {
        // eliminações (menor stack no início da mão cai primeiro => pior colocação)
        for (const e of torneio.fimDeMaoHeroi(r, h)) {
          const premio = e.posicao <= premios.length ? premios[e.posicao - 1] : 0;
          eliminados.push({ nome: e.jogador.nome, posicao: e.posicao, premio });
          if (e.jogador.heroi) { fimTorneio(e.posicao, premio); continue; }
          await chamar(ui, 'aoMensagem', `${e.jogador.nome} foi eliminado em ${e.posicao}º` + (premio ? ` (${P.Formato ? P.Formato.dinheiro(premio) : premio})` : ''), 'saida');
        }
        // fim com vitória
        if (!fim && torneio.restantes() === 1 && mesa.jogador(HEROI) && mesa.jogador(HEROI).fichas > 0) fimTorneio(1, premios[0]);
        // partidas automáticas: as outras mesas jogam uma mão junto com a sua
        if (!fim && cfg.instantaneo) await torneio.rodadaInstantanea();
      }
      // cash: herói quebrou
      if (modo === 'cash' && mesa.jogador(HEROI).fichas === 0) {
        const buyin = Math.round(cfg.buyinBB * cfg.limite.bb);
        let recomprar = false;
        if (cfg.semBanca || P.Banca.saldo() >= buyin) {
          recomprar = cfg.recompraAuto || cfg.autoHeroi ? true : await chamar(ui, 'perguntarRecompra', buyin);
        }
        if (recomprar) {
          mesa.jogador(HEROI).fichas = buyin;
          investidoHeroi += buyin;
          if (!cfg.semBanca) P.Banca.ajustar(-buyin);
          await chamar(ui, 'aoMensagem', `Recompra de ${fmt(buyin)}`, 'recompra');
        } else {
          fim = { modo, motivo: 'quebrou', resultado: resultadoSessao, maos: maosJogadas };
        }
      }
      const resumo = { resultado: r, historico: h, ganho, info: info(), decisoes: decisoesMao.slice() };
      await chamar(ui, 'aoFimDaMao', resumo);
      await chamar(ui, 'aoInfo', info());
      return resumo;
    }

    function fimTorneio(posicao, premio) {
      if (fim) return;
      if (premio > 0 && !cfg.semBanca) P.Banca.ajustar(premio);
      P.Estatisticas.registrarTorneio(modo === 'sng' ? 'sng' : 'torneio', cfg.buyin.total, premio, posicao, participantes);
      fim = { modo, motivo: posicao === 1 ? 'campeao' : 'eliminado', posicao, premio, buyin: cfg.buyin.total, maos: maosJogadas, field: participantes, nivel: nivelIdx + 1 };
      if (torneio) torneio.parar();
    }

    // -------------------------------------------------------------- laço
    async function rodar() {
      if (rodando) return;
      rodando = true;
      montar();
      await chamar(ui, 'aoIniciar', api);
      await chamar(ui, 'aoInfo', info());
      if (torneio && !cfg.instantaneo) torneio.iniciarFundo();
      let esperando = 0;
      while (ativo && !fim) {
        await prepararMao();
        if (!ativo || fim) break;
        if (mesa.ativos().length < 2) {
          // torneio: a sua mesa ficou vazia — espera jogadores das outras mesas
          if (torneio && torneio.restantes() > 1 && esperando < 2000) {
            if (!esperando++) await chamar(ui, 'aoMensagem', 'Aguardando jogadores de outras mesas…', 'info');
            if (cfg.instantaneo) await torneio.rodadaInstantanea(); else await esperar(400);
            continue;
          }
          fim = fim || { modo, motivo: 'sem_jogadores', maos: maosJogadas };
          break;
        }
        esperando = 0;
        await jogarMao();
        if (cfg.limiteMaos && maosJogadas >= cfg.limiteMaos) break;
      }
      rodando = false;
      if (torneio) torneio.parar();
      if (fim) apagarEstado();
      if (fim && ativo) await chamar(ui, 'aoFimDaPartida', fim);
      return fim;
    }

    /** Sair da mesa. No cash devolve o stack (atrás) para a banca. */
    function sair() {
      if (!ativo) return null;
      apagarEstado();
      ativo = false;
      if (torneio) torneio.parar();
      P.Coach.cancelar();
      let devolvido = 0;
      if (modo === 'cash' && mesa && mesa.jogador(HEROI)) {
        const m = maoAtual && !maoAtual.terminada() ? maoAtual.vista(HEROI).jogadores.find(j => j.assento === HEROI) : null;
        devolvido = m ? m.fichas : mesa.jogador(HEROI).fichas;
        if (!cfg.semBanca) P.Banca.ajustar(devolvido);
      }
      return { devolvido, resultado: modo === 'cash' ? devolvido - investidoHeroi : null };
    }

    function pausarRelogio(p) {
      if (p && pausadoEm === null) pausadoEm = agora();
      else if (!p && pausadoEm !== null) { pausaAcumulada += agora() - pausadoEm; pausadoEm = null; }
    }

    /** Análise de desempenho desta partida (usada no fim ou ao sair da mesa). */
    function relatorio(extra = {}) {
      if (!P.Relatorio) return null;
      return P.Relatorio.gerar({
        modo, rotulo, lugares, maos: registro.maos, decisoes: registro.decisoes, inicio: registro.inicio,
        fim, resultadoCash: modo === 'cash' ? (extra.resultadoCash !== undefined ? extra.resultadoCash : resultadoSessao) : null,
        bb: modo === 'cash' ? cfg.limite.bb : blindsAtuais().bb, abandonou: !!extra.abandonou
      });
    }

    const api = {
      cfg, modo, rotulo, HEROI,
      rodar, sair, info, pausarRelogio, relatorio,
      mesa: () => mesa,
      maoAtual: () => maoAtual,
      perfis,
      ativo: () => ativo,
      fim: () => fim,
      premios: () => premios.slice(),
      torneio: () => torneio,
      eliminados: () => eliminados.slice(),
      fmt
    };
    return api;
  }

  /** Partida salva (interrompida) ou null. */
  function salva() {
    const s = P.Armazenamento.ler(CHAVE_SALVA, null);
    return s && s.versao === 1 && s.cfg ? s : null;
  }
  /** Desiste da partida salva: no cash o stack volta para a banca; no SNG/torneio conta como abandono. */
  function descartarSalva() {
    const s = salva();
    P.Armazenamento.remover(CHAVE_SALVA);
    if (!s) return;
    if (s.modo === 'cash') { if (!s.cfg.semBanca) P.Banca.ajustar(s.heroiFichas || 0); }
    else {
      const n = s.modo === 'sng' ? Math.max(s.cfg.lugares, s.cfg.participantes || s.cfg.lugares) : s.cfg.field;
      P.Estatisticas.registrarTorneio(s.modo, s.cfg.buyin.total, 0, n, n);
    }
  }
  function marcarRetomada(s) { s.retomadas = (s.retomadas || 0) + 1; P.Armazenamento.gravar(CHAVE_SALVA, s); }

  P.Partida = { criar, HEROI, FATOR_VELOCIDADE, salva, descartarSalva, marcarRetomada };
})(window.Poker = window.Poker || {});
