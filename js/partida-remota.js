/* ==========================================================================
   OUTS · Treino Lab — partida-remota.js
   A partida da mesa com amigos vista deste navegador. Conversa com a mesa
   (ui-mesa.js) pelos mesmos callbacks da partida local (partida.js), mas
   quem embaralha, distribui e confere as jogadas é o servidor: aqui só
   chegam os eventos e a vista deste jogador, e daqui só sai a jogada.

   Cada um se vê embaixo: os assentos do servidor giram para que o seu fique
   na posição 0 da tela (a do "herói" em ui-mesa.js).

   As mensagens chegam por ui-amigos.js (dona da conexão) e são tratadas em
   fila, uma de cada vez, no ritmo das animações.
   ========================================================================== */
(function (P) {
  'use strict';

  const E = P.Estruturas;
  const TONS_PELE = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#f8d9c0'];
  const CORES_CABELO = ['#2b1b0e', '#5a3a1a', '#a0522d', '#d4a017', '#1a1a1a', '#9e9e9e', '#c0392b'];
  let atual = null;   // partida em andamento nesta aba

  const reais = c => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Avatar fixo a partir do nome: todo mundo vê a mesma cara para cada amigo. */
  const avatares = {};
  function avatarDe(nome) {
    if (avatares[nome]) return avatares[nome];
    let h = 2166136261;
    for (const ch of nome) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const tirar = n => { const v = h % n; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v; };
    avatares[nome] = {
      fundo: tirar(360), pele: TONS_PELE[tirar(TONS_PELE.length)], cabelo: CORES_CABELO[tirar(CORES_CABELO.length)],
      estilo: tirar(6), oculos: tirar(4) === 0, barba: tirar(4) === 0, bone: tirar(7) === 0, roupa: tirar(360)
    };
    return avatares[nome];
  }

  /** Tabela da classificação final (usada no fim da mesa e na aba Mesa com amigos). */
  function tabelaResultado(fim, meuAssento) {
    const { el } = P.UI;
    return el('div', { class: 'resultado-amigos' },
      el('p', { text: fim.premio ? `Premiação de ${reais(fim.premio)}: o acerto é por Pix, entre vocês.` : 'Partida sem premiação.' }),
      el('table', { class: 'tabela' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Posição' }), el('th', { text: 'Jogador' }), el('th', { class: 'dir', text: 'Prêmio' }))),
        el('tbody', {}, fim.classificacao.map(c => el('tr', { class: c.assento === meuAssento ? 'voce' : null },
          el('td', { text: c.posicao + 'º' }),
          el('td', { text: c.nome + (c.assento === meuAssento ? ' (você)' : '') + (c.desistiu ? ' · desistiu' : '') }),
          el('td', { class: 'dir', text: c.premio ? reais(c.premio) : '—' }))))));
  }

  /**
   * cfg: { jogo (primeira mensagem "jogo"), enviar(obj) → bool,
   *        aoSair({desistiu}), aoTerminar(fim) } + o resto da config da mesa.
   */
  function criar(cfg, ui) {
    let jogo = cfg.jogo;                      // última mensagem "jogo" (placar)
    let offset = jogo.agora - Date.now();     // relógio do servidor menos o daqui
    const n = jogo.lugares, eu = jogo.meuAssento;
    let ativo = true, fim = null, numero = 0, processados = 0, vista = null, pedido = null, blindsAntes = null, caiu = false;
    const fila = [];
    let processando = false, terminou, pronto;
    const fimDaPartida = new Promise(r => { terminou = r; });
    const iniciada = new Promise(r => { pronto = r; });
    const posicoes = {};                      // colocações já anunciadas
    jogo.jogadores.forEach(j => { if (j.posicao !== null) posicoes[j.assento] = j.posicao; });
    const fmt = v => P.Formato.fichas(v);

    // ------------------------------------------------- assentos girados
    const tela = s => (s === null || s === undefined ? s : (s - eu + n) % n);
    const telaLista = l => (l || []).map(tela);
    const telaChaves = o => { const r = {}; Object.keys(o || {}).forEach(k => { r[tela(+k)] = o[k]; }); return r; };
    const telaVencedores = vs => vs && vs.map(v => Object.assign({}, v, { assento: tela(v.assento) }));
    const telaPotes = ps => (ps || []).map(p => Object.assign({}, p, { elegiveis: telaLista(p.elegiveis), vencedores: telaVencedores(p.vencedores) }));

    function telaVista(v) {
      const r = v.resultado;
      return Object.assign({}, v, {
        botao: tela(v.botao), assentoSB: tela(v.assentoSB), assentoBB: tela(v.assentoBB), vez: tela(v.vez),
        jogadores: v.jogadores.map(j => Object.assign({}, j, { assento: tela(j.assento) })),
        potes: telaPotes(v.potes),
        acoes: v.acoes ? Object.assign({}, v.acoes, { assento: tela(v.acoes.assento) }) : null,
        resultado: r ? Object.assign({}, r, {
          fichasFinais: telaChaves(r.fichasFinais), ganhos: telaChaves(r.ganhos), potes: telaPotes(r.potes),
          showdown: (r.showdown || []).map(s => Object.assign({}, s, { assento: tela(s.assento) }))
        }) : null
      });
    }

    function telaEvento(e) {
      const o = Object.assign({}, e);
      if (e.assento !== undefined) o.assento = tela(e.assento);
      if (e.tipo === 'inicio') Object.assign(o, { botao: tela(e.botao), sb: tela(e.sb), bb: tela(e.bb), jogadores: e.jogadores.map(j => Object.assign({}, j, { assento: tela(j.assento) })) });
      else if (e.tipo === 'distribuicao') o.ordem = telaLista(e.ordem);
      else if (e.tipo === 'recolher') o.potes = telaPotes(e.potes);
      else if (e.tipo === 'pote') o.vencedores = telaVencedores(e.vencedores);
      else if (e.tipo === 'fim') o.ganhos = telaChaves(e.ganhos);
      return o;
    }

    // jogadores para desenhar os assentos (nome, avatar, fichas entre as mãos)
    const mesa = {
      jogador(s) {
        const j = jogo.jogadores.find(x => tela(x.assento) === s);
        if (!j) return null;
        return { id: 'amigo' + j.assento, nome: j.nome, heroi: s === 0, avatar: avatarDe(j.nome), fichas: j.fichas, perfil: null, pais: null };
      }
    };

    // --------------------------------------------------------- placar
    const agoraServidor = () => Date.now() + offset;
    const vivos = () => jogo.jogadores.filter(j => j.posicao === null);

    function info() {
      const dur = jogo.duracaoNivel;
      const decorrido = Math.max(0, agoraServidor() - jogo.inicio);
      const nivel = Math.floor(decorrido / dur);
      const restam = vivos(), meu = jogo.jogadores[eu];
      const pagos = jogo.premios.length;
      return {
        modo: 'sng', rotulo: 'Mesa com amigos · ' + jogo.codigo, lugares: n, maos: numero,
        blinds: vista ? vista.blinds : E.nivelSNGProporcional(nivel, jogo.fichasIniciais),
        nivel: nivel + 1, proximo: E.nivelSNGProporcional(nivel + 1, jogo.fichasIniciais),
        restanteMs: dur - (decorrido % dur), maosNoNivel: 0, maosPorNivel: null,
        restantes: restam.length, field: n, mesas: 1,
        stackMedio: restam.reduce((s, j) => s + j.fichas, 0) / Math.max(1, restam.length),
        stack: meu.fichas,
        posicao: meu.posicao !== null ? meu.posicao : 1 + restam.filter(j => j.fichas > meu.fichas).length,
        pagos, premios: jogo.premios, pool: jogo.premio,
        itm: pagos > 0 && restam.length <= pagos, bolha: pagos > 0 && restam.length === pagos + 1,
        eliminados: [], fmtPremio: reais
      };
    }

    // ------------------------------------------------- mensagens em fila
    function receber(m) {
      if (!ativo) return;
      m.recebidaEm = Date.now();
      // a mão andou sem a sua jogada (tempo esgotado) ou chegou a vista de novo: o pedido antigo cai
      if (pedido && (m.tipo === 'mao' || m.tipo === 'fim')) cancelarPedido();
      fila.push(m);
      processar();
    }

    async function processar() {
      if (processando) return;
      processando = true;
      await iniciada;
      try {
        while (fila.length && ativo) {
          const m = fila.shift();
          // aba escondida (o navegador freia os timers) ou atraso de mais de uma mão: aplica sem animar.
          // (O normal é a próxima mão chegar enquanto o showdown ainda anima: isso não acelera.)
          const adiante = new Set(fila.filter(x => x.tipo === 'mao' && x.numero > numero).map(x => x.numero)).size;
          // a sua vez já chegou e a mesa daqui está atrasada: corre até ela (o prazo corre no servidor)
          const suaVez = fila.some(x => x.tipo === 'mao' && x.vista.vez === eu && x.vista.acoes);
          const atrasada = Date.now() - m.recebidaEm > 1500;
          ui.acelerar(document.hidden || adiante >= 2 || fila.length > 8 || (suaVez && atrasada));
          try {
            if (m.tipo === 'jogo') await placar(m);
            else if (m.tipo === 'mao') await mao(m);
            else if (m.tipo === 'fim') await terminar(m);
            else if (m.tipo === 'erro') await ui.aoMensagem(m.texto, 'erro');
          } catch (e) {
            (window.__errosGlobais = window.__errosGlobais || []).push('Mesa com amigos: ' + (e.stack || e.message));
            console.error(e);
          }
        }
      } finally { processando = false; ui.acelerar(false); }
    }

    async function placar(m) {
      jogo = m;
      offset = m.agora - Date.now();
      for (const j of m.jogadores) {
        if (j.posicao === null || posicoes[j.assento]) continue;
        posicoes[j.assento] = j.posicao;
        if (j.posicao === 1) continue;
        const premio = m.premios[j.posicao - 1];
        const lugar = `${j.posicao}º lugar` + (premio ? ` (${reais(premio)})` : '');
        if (j.assento === eu) await ui.aoMensagem(`Você ${j.desistiu ? 'desistiu' : 'saiu'} em ${lugar}. Pode continuar assistindo ou sair da mesa.`, 'nivel');
        else await ui.aoMensagem(`${j.nome} ${j.desistiu ? 'desistiu' : 'saiu'} em ${lugar}`, 'saida');
      }
      if (m.pausada) await ui.aoMensagem('Partida parada: ninguém que está jogando está na mesa agora.', 'info');
      await ui.aoInfo(info());
    }

    async function mao(m) {
      const v = telaVista(m.vista);
      if (m.numero !== numero) {
        if (m.desde !== 0) return;     // pedaço de uma mão que não começou aqui (ao reconectar o servidor manda tudo)
        numero = m.numero;
        processados = 0;
        vista = v;
        await ui.aoNovaMao(v, info());
        if (blindsAntes && v.blinds.bb !== blindsAntes.bb) {
          await ui.aoMensagem(`Blinds subiram: ${fmt(v.blinds.sb)}/${fmt(v.blinds.bb)}` + (v.blinds.ante ? ` · ante ${fmt(v.blinds.ante)}` : ''), 'nivel');
        }
        blindsAntes = v.blinds;
      }
      const novos = m.eventos.slice(Math.max(0, processados - m.desde)).map(telaEvento);
      processados = Math.max(processados, m.desde + m.eventos.length);
      vista = v;
      await ui.aoEventos(novos, v);
      if (v.terminada) {
        if (novos.some(e => e.tipo === 'fim')) {
          const r = v.resultado || {};
          await ui.aoFimDaMao({ resultado: r, ganho: (r.ganhos && r.ganhos[0]) || 0 });
        }
        return;
      }
      if (v.vez === null || v.vez === undefined) return;
      // o prazo vem em ms no envio; desconta o tempo que a mensagem esperou na fila (animações)
      const resta = m.prazo === null ? null : Math.max(0, m.prazo - (Date.now() - m.recebidaEm));
      if (v.vez === 0 && v.acoes) pedirAcao(v, resta);
      else if (resta !== null) ui.marcarVez(v.vez, resta);
    }

    function pedirAcao(v, resta) {
      const meu = { numero };
      pedido = meu;
      const p = ui.pedirAcao(v, { analise: null, ctx: null });
      if (resta !== null) ui.marcarVez(0, resta);
      Promise.resolve(p).then(acao => {
        if (pedido === meu) pedido = null;
        if (!acao || meu.cancelado || !ativo) return;
        if (!cfg.enviar({ tipo: 'acao', numero: meu.numero, acao })) ui.aoMensagem('Sem conexão: a jogada não foi enviada. Reconectando…', 'erro');
      });
    }

    function cancelarPedido() {
      if (!pedido) return;
      pedido.cancelado = true;
      pedido = null;
      ui.cancelarPedido();
    }

    async function terminar(m) {
      fim = m;
      cancelarPedido();
      await P.UI.modal({ titulo: 'Fim da partida', conteudo: tabelaResultado(m, eu), botoes: [{ texto: 'Voltar para a sala', classe: 'btn-ouro', valor: 'ok' }] });
      desligar();
      if (cfg.aoTerminar) cfg.aoTerminar(m);
    }

    // ------------------------------------------------------- ciclo
    async function rodar() {
      atual = api;
      await ui.aoIniciar(api);
      await placar(jogo);
      pronto();
      processar();
      return fimDaPartida;
    }

    /** Para de atender a partida aqui, sem avisar o servidor (fim, outra aba, mesa apagada). */
    function desligar() {
      if (!ativo) return;
      ativo = false;
      cancelarPedido();
      if (atual === api) atual = null;
      terminou(fim);
    }

    /** Saiu da mesa pelo botão: se ainda estava jogando, fica "fora" (a mesa joga por ele) e pode voltar. */
    function sair() {
      if (!ativo) return null;
      const saiu = jogando();
      if (saiu) cfg.enviar({ tipo: 'sair' });
      desligar();
      if (cfg.aoSair) cfg.aoSair({ saiu });
      return null;
    }

    const jogando = () => ativo && !fim && jogo.jogadores[eu].posicao === null;

    /** Avisos da conexão (ui-amigos.js reconecta sozinha). */
    function conexao(estado) {
      if (!ativo) return;
      if (estado === 'reconectando' && !caiu) { caiu = true; ui.aoMensagem('A conexão caiu. Reconectando…', 'erro'); }
      else if (estado === 'aberta' && caiu) { caiu = false; ui.aoMensagem('Conectado de novo.', 'info'); }
    }

    const api = {
      cfg, modo: 'sng', rotulo: 'Mesa com amigos', HEROI: 0, remota: true,
      rodar, sair, desligar, info, receber, conexao, jogando,
      pausarRelogio() {}, relatorio() { return null; },
      mesa: () => mesa, maoAtual: () => null, perfis: () => ({}),
      ativo: () => ativo, fim: () => fim, premios: () => jogo.premios.slice(),
      eliminados: () => [], fmt
    };
    return api;
  }

  P.PartidaRemota = { criar, atual: () => atual, tabelaResultado, reais };
})(window.Poker = window.Poker || {});
