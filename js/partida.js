/* ==========================================================================
   OUTS · Treino Lab — partida.js
   Controlador de uma partida (cash, Sit & Go ou torneio): senta jogadores,
   roda as mãos, chama os bots com tempo de decisão, pede a ação do herói,
   aciona o coach, avalia decisões, atualiza estatísticas e histórico, sobe
   os blinds pelo relógio e simula o field do torneio.

   Não desenha nada: conversa com a interface por callbacks (ui.*), todos
   opcionais e podendo devolver Promise (para esperar animações).
   ========================================================================== */
(function (P) {
  'use strict';

  const E = P.Estruturas;
  const HEROI = 0;
  const FATOR_VELOCIDADE = { lenta: 1.5, normal: 1, rapida: 0.55, turbo: 0.25 };

  function esperar(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }
  async function chamar(ui, nome, ...args) {
    if (ui && typeof ui[nome] === 'function') return ui[nome](...args);
    return undefined;
  }

  /**
   * cfg: { modo, nivel, lugares, heroi: {nome, mostraPerdedoras},
   *        cash: limite {nome,sb,bb}, buyinBB, recompraAuto
   *        sng/torneio: buyin {total, premio}, velocidade, field
   *        autoHeroi, instantaneo, maosPorNivel (testes), iteracoesCoach }
   */
  function criar(cfg, ui) {
    const modo = cfg.modo, lugares = cfg.lugares;
    const nomesUsados = () => mesa.assentos().filter(Boolean).map(j => j.nome);
    let ativo = true, rodando = false, fim = null;
    let mesa, campo = null, premios = [], pool = 0;
    let nivelIdx = 0, inicioNivel = 0, pausadoEm = null, pausaAcumulada = 0, maosNoNivel = 0;
    let maosJogadas = 0, resultadoSessao = 0, investidoHeroi = 0;
    const eliminados = [];          // [{nome, posicao, premio}]
    const avisos = {};              // bolha / premiação / mesa final já anunciados
    const decisoesMao = [];
    const registro = { maos: [], decisoes: [], inicio: Date.now() };   // para a análise de fim de partida
    let maoAtual = null;

    const rotulo = modo === 'cash' ? cfg.limite.nome :
      modo === 'sng' ? `Sit & Go ${P.Formato ? P.Formato.dinheiro(cfg.buyin.total) : cfg.buyin.total}` :
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

    // --------------------------------------------------------- montagem
    function montar() {
      const b = blindsAtuais();
      mesa = P.Motor.criarMesa({ lugares, sb: b.sb, bb: b.bb, ante: b.ante, anteBB: b.anteBB });
      const heroi = { id: 'heroi', nome: cfg.heroi.nome || 'Você', heroi: true, mostraPerdedoras: !!cfg.heroi.mostraPerdedoras, perfil: 'tag' };
      if (modo === 'cash') {
        heroi.fichas = Math.round(cfg.buyinBB * cfg.limite.bb);
        investidoHeroi = heroi.fichas;
        if (!cfg.semBanca) P.Banca.ajustar(-heroi.fichas);
      } else {
        heroi.fichas = modo === 'sng' ? E.SNG_STACK : E.TORNEIO_STACK;
        investidoHeroi = cfg.buyin.total;
        if (!cfg.semBanca) P.Banca.ajustar(-cfg.buyin.total);
      }
      mesa.sentar(HEROI, heroi);
      for (let s = 1; s < lugares; s++) mesa.sentar(s, novoBot(heroi.fichas));
      if (modo === 'sng') {
        pool = cfg.buyin.premio * lugares;
        premios = E.valoresPremios(pool, E.percentuaisSNG(lugares));
      } else if (modo === 'torneio') {
        pool = cfg.buyin.premio * cfg.field;
        premios = E.valoresPremios(pool, E.percentuaisTorneio(cfg.field));
        campo = P.Torneio.criarCampo({ field: cfg.field, lugares, stackInicial: E.TORNEIO_STACK, naMesa: lugares, premios });
      }
      inicioNivel = agora();
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
      const ativos = mesa.ativos();
      const stacksMesa = ativos.map(s => mesa.jogador(s).fichas);
      const restantes = modo === 'sng' ? ativos.length : campo.restantes();
      const totalFichas = modo === 'sng' ? E.SNG_STACK * lugares : campo.totalFichas;
      const meu = heroi ? heroi.fichas : 0;
      let posicao = 1 + stacksMesa.filter(x => x > meu).length;
      if (campo) {
        const p = campo.pool();
        if (p.jogadores > 0) posicao += Math.round(p.jogadores * Math.exp(-meu / (p.fichas / p.jogadores)));
      }
      const pagos = premios.length;
      const falta = restantes - pagos;
      return Object.assign(base, {
        nivel: nivelIdx + 1, proximo: prox, restanteMs, maosNoNivel, maosPorNivel: cfg.maosPorNivel || null,
        restantes, field: modo === 'sng' ? lugares : cfg.field,
        stackMedio: totalFichas / Math.max(1, restantes), stack: meu, posicao,
        pagos, premios, pool, itm: falta <= 0, bolha: falta > 0 && falta <= Math.max(1, Math.ceil(pagos * 0.15)),
        proximoPremio: falta > 0 ? premios[pagos - 1] : premios[Math.min(pagos, restantes) - 1],
        eliminados: eliminados.slice(-5)
      });
    }

    /** Contexto de torneio para o coach (ICM). */
    function ctxTorneio() {
      if (modo === 'cash') return null;
      const restantes = modo === 'sng' ? mesa.ativos().length : campo.restantes();
      return {
        premios: premios.slice(0, Math.min(premios.length, restantes)),
        stacksFora: campo ? campo.stacksFora() : [],
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
      // relógio de nível
      if (modo !== 'cash') {
        const subir = cfg.maosPorNivel ? maosNoNivel >= cfg.maosPorNivel : decorridoNivel() >= duracaoNivel();
        if (subir) {
          nivelIdx++;
          maosNoNivel = 0;
          inicioNivel = agora();
          pausaAcumulada = 0;
          if (pausadoEm !== null) pausadoEm = agora();
          const b = blindsAtuais();
          await chamar(ui, 'aoMensagem', `Nível ${nivelIdx + 1}: blinds ${fmt(b.sb)}/${fmt(b.bb)}` + (b.ante ? ` · ${b.anteBB ? 'BB ante' : 'ante'} ${fmt(b.ante)}` : ''), 'nivel');
        }
        mesa.definirBlinds(blindsAtuais());
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
        const restantes = modo === 'sng' ? mesa.ativos().length : campo.restantes();
        const pagos = premios.length;
        if (pagos >= 2 && !avisos.bolha && restantes === pagos + 1) {
          avisos.bolha = true;
          await chamar(ui, 'aoMensagem', 'Bolha! O próximo eliminado sai sem prêmio.', 'nivel');
        }
        if (!avisos.itm && restantes <= pagos && restantes > 1) {
          avisos.itm = true;
          await chamar(ui, 'aoMensagem', `Todos na premiação! Prêmio mínimo garantido: ${P.Formato ? P.Formato.dinheiro(premios[Math.min(pagos, restantes) - 1]) : ''}`, 'nivel');
        }
        if (modo === 'torneio' && !avisos.mesaFinal && restantes <= lugares && restantes > 1) {
          avisos.mesaFinal = true;
          await chamar(ui, 'aoMensagem', `Mesa final! Restam ${restantes} jogadores.`, 'nivel');
        }
      }
      // torneio: as outras mesas jogam e os lugares vazios são preenchidos
      if (modo === 'torneio') {
        for (let s = 0; s < lugares; s++) {
          if (!mesa.jogador(s)) {
            const st = campo.sentarNovo(blindsAtuais().bb);
            if (st === null) break;
            const bot = novoBot(st);
            mesa.sentar(s, bot);
            await chamar(ui, 'aoMensagem', `${bot.nome} chega de outra mesa com ${fmt(st)}`, 'entrada');
          }
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
      const mao = mesa.proximaMao();
      maoAtual = mao;
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

      // eliminações (menor stack inicial cai primeiro => pior colocação)
      const quebrados = h.jogadores.filter(j => r.fichasFinais[j.assento] === 0).sort((a, b) => a.fichasIniciais - b.fichasIniciais);
      for (const j of quebrados) {
        const jog = mesa.jogador(j.assento);
        if (modo === 'cash') {
          if (j.assento === HEROI) continue;
          mesa.levantar(j.assento);
          await chamar(ui, 'aoMensagem', `${jog.nome} quebrou e saiu da mesa`, 'saida');
        } else {
          const posicao = modo === 'sng' ? mesa.ativos().length + quebrados.length - quebrados.indexOf(j) : campo.eliminarDaMesa();
          const premio = posicao <= premios.length ? premios[posicao - 1] : 0;
          eliminados.push({ nome: jog.nome, posicao, premio });
          if (j.assento === HEROI) { fimTorneio(posicao, premio); continue; }
          mesa.levantar(j.assento);
          await chamar(ui, 'aoMensagem', `${jog.nome} foi eliminado em ${posicao}º` + (premio ? ` (${P.Formato ? P.Formato.dinheiro(premio) : premio})` : ''), 'saida');
        }
      }
      if (modo === 'torneio' && !fim) campo.simularMaoFora(blindsDaMao.bb);

      // fim do SNG/torneio com vitória
      if (!fim && modo !== 'cash') {
        const restantes = modo === 'sng' ? mesa.ativos().length : campo.restantes();
        if (restantes === 1 && mesa.jogador(HEROI) && mesa.jogador(HEROI).fichas > 0) fimTorneio(1, premios[0]);
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
      P.Estatisticas.registrarTorneio(modo === 'sng' ? 'sng' : 'torneio', cfg.buyin.total, premio, posicao, modo === 'sng' ? lugares : cfg.field);
      fim = { modo, motivo: posicao === 1 ? 'campeao' : 'eliminado', posicao, premio, buyin: cfg.buyin.total, maos: maosJogadas, field: modo === 'sng' ? lugares : cfg.field, nivel: nivelIdx + 1 };
    }

    // -------------------------------------------------------------- laço
    async function rodar() {
      if (rodando) return;
      rodando = true;
      montar();
      await chamar(ui, 'aoIniciar', api);
      await chamar(ui, 'aoInfo', info());
      while (ativo && !fim) {
        await prepararMao();
        if (!ativo || fim) break;
        if (mesa.ativos().length < 2) { fim = fim || { modo, motivo: 'sem_jogadores', maos: maosJogadas }; break; }
        await jogarMao();
        if (cfg.limiteMaos && maosJogadas >= cfg.limiteMaos) break;
      }
      rodando = false;
      if (fim && ativo) await chamar(ui, 'aoFimDaPartida', fim);
      return fim;
    }

    /** Sair da mesa. No cash devolve o stack (atrás) para a banca. */
    function sair() {
      if (!ativo) return null;
      ativo = false;
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
      fmt
    };
    return api;
  }

  P.Partida = { criar, HEROI, FATOR_VELOCIDADE };
})(window.Poker = window.Poker || {});
