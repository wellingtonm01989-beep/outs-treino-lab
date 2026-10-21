/* ==========================================================================
   OUTS · servidor — jogos/truco.js
   O truco na mesa com amigos (paulista ou paranaense; 1 contra 1 ou em
   dupla). A partida é o truco-motor.js do app; aqui ficam as opções da mesa,
   quem decide cada pedido, a jogada de quem deixa o prazo acabar e o que
   cada lugar pode ver.

   Lugares: os do motor seguem a ordem dos lugares da sala; na dupla, os
   lugares 1 e 3 da sala (0 e 2 no motor) jogam juntos contra o 2 e o 4.
   Cada jogador recebe tudo "girado" para ele ser o lugar 0 (como na mesa
   contra os bots); se o lugar dele é ímpar, as equipes também trocam de
   número (a dele é sempre a 0, "nós").
   O que ninguém mais vê: a carta jogada coberta e, no fim da mão, as cartas
   que cada um não chegou a mostrar.
   ========================================================================== */
import { P } from '../nucleo.js';

const T = P.Truco, R = T.Regras;

const giro = (s, n) => x => (typeof x === 'number' && x >= 0 && x < n ? (x - s + n) % n : x);
const giroEq = s => e => (s % 2 && (e === 0 || e === 1) ? 1 - e : e);
const porLugar = (a, s, n) => (Array.isArray(a) ? a.map((_, k) => a[(k + s) % n]) : a);
const porEquipe = (a, s) => (Array.isArray(a) && s % 2 ? [a[1], a[0]] : a);

export const truco = {
  tipo: 'truco',
  metodos: ['decidir', 'responder', 'onze'],

  validarConfig(c) {
    if (c.lugares !== 2 && c.lugares !== 4) return { erro: 'O truco é 1 contra 1 (2 lugares) ou em dupla (4 lugares).' };
    if (c.regras !== 'paulista' && c.regras !== 'paranaense') return { erro: 'Regras do truco inválidas.' };
    return { config: { jogo: 'truco', lugares: c.lugares, regras: c.regras } };
  },
  configPublica(c) { return { jogo: 'truco', lugares: c.lugares, regras: c.regras }; },
  podeComecar(jogadores, config) {
    if (jogadores.length === config.lugares) return null;
    return config.lugares === 2 ? 'O truco 1 contra 1 precisa dos 2 jogadores sentados.' : 'O truco em dupla precisa dos 4 jogadores sentados.';
  },

  cfgMotor(config) { return { regras: config.regras }; },
  cfgPublica(cfg) { return { regras: cfg.regras }; },
  estadoInicial(n) { return { placar: [0, 0], dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 }; },
  /** O "salvar" do truco já devolve o estado para recomeçar a mão (dador e número da mão de antes). */
  estadoParaRefazer(est) { return { placar: est.placar.slice(), dador: est.dador, maoNumero: est.maoNumero }; },
  criarMotor(estado, cfg, n, agentes, ganchos) {
    return T.Motor.criar(Object.assign({ n, regras: cfg.regras }, estado), agentes, ganchos);
  },

  /** Na dupla, responder ao truco e decidir a mão de 11 vale para qualquer um dos dois parceiros. */
  quemDecide(metodo, assento, n) {
    if (n === 4 && (metodo === 'responder' || metodo === 'onze')) return [assento, (assento + 2) % 4];
    return [assento];
  },
  /** O motor quer saber também quem respondeu (balão, e quem pede o próximo nível). */
  valorParaMotor(metodo, v, quem) {
    if (metodo === 'decidir') return v;
    return Object.assign({}, typeof v === 'object' && v ? v : { resposta: v }, { j: quem });
  },

  /** Jogada recebida do jogador s (no giro dele), conferida com a vista dele; null se não vale. */
  limpar(metodo, valor, vista, s, n) {
    if (metodo === 'decidir') {
      if (!valor || typeof valor !== 'object') return null;
      if (valor.tipo === 'truco') return vista.podeTrucar ? { tipo: 'truco' } : null;
      if (valor.tipo !== 'carta' || !vista.cartas) return null;
      if (vista.cegas) return Number.isInteger(valor.indice) && valor.indice >= 0 && valor.indice < vista.cartas.length ? { tipo: 'carta', indice: valor.indice, coberta: false } : null;
      if (!Number.isInteger(valor.carta) || vista.cartas.indexOf(valor.carta) < 0) return null;
      return { tipo: 'carta', carta: valor.carta, coberta: !!valor.coberta && !!vista.podeCobrir };
    }
    if (metodo === 'responder') {
      if (valor === 'aceitar' || valor === 'correr') return valor;
      if (valor === 'aumentar') return vista.podeAumentar ? valor : null;
      return null;
    }
    if (metodo === 'onze') {
      if (valor === 'jogar' || valor === 'correr') return valor;
      // paranaense: troca de cartas entre os parceiros (no giro de quem manda: 0 = ele, 2 = o parceiro)
      if (!valor || typeof valor !== 'object' || valor.resposta !== 'jogar' || !vista.trocaPermitida || !valor.troca) return null;
      const eu = valor.troca[0], ele = valor.troca[2];
      if (!Array.isArray(eu) || !Array.isArray(ele) || eu.length !== 3 || ele.length !== 3) return null;
      const antes = vista.cartas.concat(vista.cartasParceiro).slice().sort((a, b) => a - b).join();
      if (eu.concat(ele).every(Number.isInteger) === false || eu.concat(ele).slice().sort((a, b) => a - b).join() !== antes) return null;
      const troca = {};
      troca[s] = eu.slice();
      troca[(s + 2) % 4] = ele.slice();
      return { resposta: 'jogar', troca };
    }
    return null;
  },

  /** Acabou o prazo: joga a carta mais fraca; num pedido (ou na mão de 11), corre. */
  automatica(metodo, vista) {
    if (metodo === 'decidir') {
      if (vista.cegas) return { tipo: 'carta', indice: 0, coberta: false };
      let pior = vista.cartas[0];
      vista.cartas.forEach(c => { if (R.valor(c, vista.vira) < R.valor(pior, vista.vira)) pior = c; });
      return { tipo: 'carta', carta: pior, coberta: false };
    }
    return 'correr';
  },

  resultado(r, jogo) {
    const nomes = eq => jogo.jogadores.filter(j => j.assento % 2 === eq).map(j => j.nome);
    return { vencedor: r.vencedor, placar: r.placar, maos: r.maos, equipes: [nomes(0), nomes(1)] };
  },

  // ------------------------------------------- o que o lugar s vê, girado
  vistaPara(v, s, n) {
    const g = giro(s, n), ge = giroEq(s);
    const o = Object.assign({}, v);
    o.eu = g(v.eu); o.equipe = ge(v.equipe); o.parceiro = v.parceiro === null ? null : g(v.parceiro);
    o.placar = porEquipe(v.placar, s);
    o.dador = g(v.dador);
    if ('inicio' in v) o.inicio = g(v.inicio);
    if (v.nCartas) o.nCartas = porLugar(v.nCartas, s, n);
    if (v.jogadas) o.jogadas = v.jogadas.map(r => r.map(x => ({ j: g(x.j), carta: x.carta, coberta: x.coberta })));
    if (v.resultados) o.resultados = v.resultados.map(ge);
    if (v.vencedoresRodada) o.vencedoresRodada = v.vencedoresRodada.map(x => (x === null ? null : g(x)));
    if ('vez' in v) o.vez = g(v.vez);
    if ('ultimoAumento' in v) o.ultimoAumento = ge(v.ultimoAumento);
    if ('equipeOnze' in v) o.equipeOnze = ge(v.equipeOnze);
    if (v.pedido) o.pedido = Object.assign({}, v.pedido, { equipe: ge(v.pedido.equipe), j: g(v.pedido.j) });
    if (v.historicoPedidos) o.historicoPedidos = v.historicoPedidos.map(x => Object.assign({}, x, { equipe: ge(x.equipe), j: g(x.j), jResposta: x.jResposta === undefined ? undefined : g(x.jResposta) }));
    if ('empateTriplo' in v) o.empateTriplo = ge(v.empateTriplo);
    return o;
  },

  eventoPara(ev, s, n, vista) {
    const g = giro(s, n), ge = giroEq(s);
    const o = Object.assign({}, ev);
    if ('j' in ev) o.j = g(ev.j);
    if ('dador' in ev) o.dador = g(ev.dador);
    if ('inicio' in ev) o.inicio = g(ev.inicio);
    if ('quem' in ev) o.quem = g(ev.quem);
    if ('equipe' in ev) o.equipe = ge(ev.equipe);
    if ('equipeOnze' in ev) o.equipeOnze = ge(ev.equipeOnze);
    if ('vencedor' in ev) o.vencedor = ge(ev.vencedor);
    if (ev.placar) o.placar = porEquipe(ev.placar, s);
    // a carta coberta dos outros não aparece
    if (ev.tipo === 'jogada' && ev.coberta && ev.j !== s) o.carta = null;
    // fim da mão: dos outros, só as cartas que eles mostraram na mesa
    if (ev.tipo === 'fimMao' && ev.iniciais) {
      const mostradas = k => (vista && vista.jogadas ? [].concat(...vista.jogadas).filter(x => x.j === k && x.carta !== null && !x.coberta).map(x => x.carta) : []);
      o.iniciais = porLugar(ev.iniciais.map((c, k) => (k === s ? c.slice() : mostradas(k))), s, n);
    }
    return o;
  },

  pedidoPara(p, s, n) {
    const g = giro(s, n);
    return { id: p.id, metodo: p.metodo, extra: p.extra, comigo: p.quem.indexOf(s) >= 0, quem: p.quem.map(g) };
  }
};
