/* ==========================================================================
   OUTS · Treino Lab — cartas-remotas.js
   Partida de truco ou de Última! da mesa com amigos vista daqui. Faz o papel
   do motor local (T.Motor / U.Motor) para a mesa de sempre (ui-truco-mesa.js,
   ui-uno-mesa.js): rodar(), vistaPara(0), parar()… Quem joga de verdade é o
   motor no servidor (servidor/src/jogos/cartas.js), que manda os "passos"
   em ordem — cada acontecimento com a vista deste lugar naquele momento, e
   cada pedido de decisão — já girados para este jogador ser o lugar 0.

   Os passos são tratados em fila, no ritmo das animações da mesa. Quando
   chega um pedido para este lugar, a mesa pergunta à pessoa pelo mesmo
   agente de sempre (agenteHumano) e a resposta vai para o servidor. Se o
   pedido deixar de valer antes da resposta (o prazo acabou, o parceiro
   respondeu, outro apertou "Pegou!" primeiro), a mesa recolhe os botões
   (cancelar). Atrasado (a aba ficou escondida, a sua vez já está na fila
   ou voltou de uma queda), a mesa anda sem animação até alcançar.
   ========================================================================== */
(function (P) {
  'use strict';

  let atual = null;   // partida em andamento nesta aba

  /**
   * op: { n, enviar(obj) → bool, cancelar() (a mesa recolhe o pedido em aberto),
   *       relogio(info|null) (o prazo do pedido em aberto: { ms, meu }) }
   */
  function criar(op) {
    const n = op.n;
    const fila = [];
    let ultimo = { mao: -1, i: -1 };   // último passo tratado
    let aberto = null;                 // { id, ate } o pedido em aberto no servidor
    let vista = null;
    let parado = false;
    let acordar = null;
    let resolverRodar = null;
    let agentes = null, ganchos = null;
    let respondendo = null;            // { id }: a pessoa está decidindo este pedido
    let timerRelogio = null;

    const esperarPasso = () => new Promise(r => { acordar = r; });
    function cutucar() { const a = acordar; acordar = null; if (a) a(); }

    /** Mensagens do servidor que são da partida. */
    function receber(m) {
      if (parado) return;
      if (m.tipo === 'passos') {
        aberto = m.aberto ? { id: m.aberto.id, ate: Date.now() + m.aberto.ms } : null;
        for (const p of m.passos) {
          if (p.mao < ultimo.mao || (p.mao === ultimo.mao && p.i <= ultimo.i)) continue;
          if (fila.some(x => x.mao === p.mao && x.i === p.i)) continue;
          fila.push(p);
        }
        fila.sort((a, b) => a.mao - b.mao || a.i - b.i);
        atualizarRelogio();
        cutucar();
      } else if (m.tipo === 'erro' && m.motivo === 'acao' && m.repetir && respondendo === null && ultimoPedido && ultimoPedido.pedido.id === m.id) {
        // a jogada não valeu: pergunta de novo
        fila.unshift(Object.assign({}, ultimoPedido, { repetir: true }));
        cutucar();
      }
    }
    let ultimoPedido = null;

    /** Atrasado: a mesa anda sem animação até alcançar o servidor. */
    function atrasado() {
      if (document.hidden) return true;
      if (fila.length > 6) return true;
      return fila.some(p => p.pedido && p.pedido.comigo && aberto && p.pedido.id === aberto.id);
    }

    function atualizarRelogio() {
      clearInterval(timerRelogio);
      timerRelogio = null;
      if (!op.relogio) return;
      if (!aberto) { op.relogio(null); return; }
      const tick = () => {
        if (!aberto || parado) { op.relogio(null); clearInterval(timerRelogio); return; }
        op.relogio({ ms: Math.max(0, aberto.ate - Date.now()), meu: !!(respondendo && respondendo.id === aberto.id) });
      };
      tick();
      timerRelogio = setInterval(tick, 250);
    }

    async function laco() {
      await ganchos.evento({ tipo: 'inicioPartida', placar: op.placarInicial ? op.placarInicial.slice() : null, n });
      while (!parado) {
        if (!fila.length) { await esperarPasso(); continue; }
        const p = fila.shift();
        if (!p.repetir) ultimo = { mao: p.mao, i: p.i };
        if (p.vista) vista = p.vista;
        if (p.ev) {
          if (p.ev.tipo === 'fimPartida') {
            parado = true;
            atualizarRelogio();
            if (resolverRodar) resolverRodar({ vencedor: p.ev.vencedor, placar: p.ev.placar.slice(), maos: p.ev.maos });
            return;
          }
          try { await ganchos.evento(p.ev); } catch (e) { console.error(e); }
          continue;
        }
        const ped = p.pedido;
        ultimoPedido = p;
        // já respondido (há passos depois dele), não é com este lugar, ou não está mais em aberto
        if (fila.length || !ped.comigo || !aberto || aberto.id !== ped.id) continue;
        await responder(ped, p.vista);
      }
    }

    async function responder(ped, v) {
      respondendo = { id: ped.id };
      atualizarRelogio();
      let tarefa;
      if (ped.metodo === 'janela') {
        // quem esqueceu o "Última!" (ped.extra.j): aqui não há bots, as reações são todas de gente
        const outros = [];
        for (let k = 1; k < n; k++) outros.push((ped.extra.j + k) % n);
        tarefa = Promise.resolve(ganchos.janelaUltima(ped.extra.j, outros, outros.map(() => null)));
      } else tarefa = Promise.resolve(agentes[0][ped.metodo](v, ped.extra));
      const r = await Promise.race([tarefa.then(valor => ({ valor })), esperarPasso().then(() => null)]);
      respondendo = null;
      if (parado) return;
      if (!r) {
        // chegou passo novo antes da resposta: o pedido foi resolvido sem ela
        if (op.cancelar) op.cancelar(ped.metodo);
        atualizarRelogio();
        return;
      }
      let valor = r.valor;
      if (ped.metodo === 'janela') valor = valor === 0;
      else if (ped.metodo === 'antesDeComprar') valor = true;
      op.enviar({ tipo: 'decisao', id: ped.id, valor: valor === undefined ? null : valor });
      atualizarRelogio();
    }

    const motor = {
      rodar() { return new Promise(res => { resolverRodar = res; laco(); }); },
      vistaPara() { return vista; },
      parar() { parado = true; clearInterval(timerRelogio); cutucar(); if (atual === controle) atual = null; },
      placar: () => (vista && vista.placar ? vista.placar.slice() : []),
      fim: () => parado,
      maoNumero: () => (vista ? vista.maoNumero : 0),
      estado: () => ({ placar: vista && vista.placar ? vista.placar.slice() : [], dador: vista ? vista.dador : 0, maoNumero: vista ? vista.maoNumero : 0 }),
      equipe: j => j % 2,
      parceiro: j => (n === 4 ? (j + 2) % 4 : null),
      n
    };

    const controle = {
      /** O "motor" para a mesa: os mesmos agentes e ganchos que ela passaria ao motor local. */
      motor(ag, gs) { agentes = ag; ganchos = gs; return motor; },
      receber, atrasado,
      desligar() { motor.parar(); },
      ativo: () => !parado
    };
    atual = controle;
    return controle;
  }

  P.CartasRemotas = { criar, atual: () => atual };
})(window.Poker = window.Poker || {});
