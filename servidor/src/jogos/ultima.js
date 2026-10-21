/* ==========================================================================
   OUTS · servidor — jogos/ultima.js
   O Última! (cartas coloridas, no estilo do Uno) na mesa com amigos, de 2 a 6
   jogadores. A partida é o uno-motor.js do app, com as regras de sempre da
   mesa contra os bots: sem o desafio do +4, e +2/+4 sempre passam adiante;
   "comprar até poder jogar" e "jogar cartas iguais juntas" são opções.
   Cada carta comprada é um toque (como na mesa contra os bots).

   "Última!": quem fica com uma carta sem dizer abre uma janela curta em que
   qualquer um aperta: os outros, "Pegou!" (quem esqueceu compra 2); quem
   esqueceu, "Última!" (a tempo). Vale o primeiro que chegar ao servidor.

   Acabou o prazo: compra (e passa); a cor do coringa é a que mais aparece na
   mão. Depois de um prazo estourado, as compras e o passar daquela mesma vez
   vão sozinhos (não espera de novo a cada carta).
   O que ninguém mais vê: as cartas que os outros compram.
   ========================================================================== */
import { P } from '../nucleo.js';

const U = P.Uno, R = U.Regras, C = R.CARTAS;
const ATE = [0, 200, 500];

const giro = (s, n) => x => (typeof x === 'number' && x >= 0 && x < n ? (x - s + n) % n : x);
const porLugar = (a, s, n) => (Array.isArray(a) ? a.map((_, k) => a[(k + s) % n]) : a);

function opcoesMotor(cfg) {
  return R.opcoes({ ate: cfg.ate, comprarAtePoder: cfg.comprarAtePoder, juntas: cfg.juntas, desafio: false, acumular: true });
}

export const ultima = {
  tipo: 'ultima',
  metodos: ['jogar', 'depoisDeComprar', 'antesDeComprar', 'escolherCor'],
  agenteExtra: { manual: true, pegar: () => null },
  janela: true,
  automaticaEmSeguida: ['depoisDeComprar', 'antesDeComprar', 'escolherCor'],

  validarConfig(c) {
    if (!Number.isInteger(c.lugares) || c.lugares < 2 || c.lugares > 6) return { erro: 'O Última! é de 2 a 6 jogadores.' };
    if (ATE.indexOf(c.ate) < 0) return { erro: 'Duração da partida inválida.' };
    return { config: { jogo: 'ultima', lugares: c.lugares, ate: c.ate, comprarAtePoder: c.comprarAtePoder === true, juntas: c.juntas === true } };
  },
  configPublica(c) { return { jogo: 'ultima', lugares: c.lugares, ate: c.ate, comprarAtePoder: c.comprarAtePoder, juntas: c.juntas }; },
  podeComecar(jogadores) { return jogadores.length < 2 ? 'Precisa de pelo menos 2 jogadores sentados.' : null; },

  cfgMotor(config) { return { ate: config.ate, comprarAtePoder: config.comprarAtePoder, juntas: config.juntas }; },
  cfgPublica(cfg) { return Object.assign({}, cfg); },
  estadoInicial(n) { return { placar: new Array(n).fill(0), dador: P.RNG.inteiroAbaixo(n), maoNumero: 0 }; },
  /** O "salvar" do Última! vem com o número da mão já contado: para recomeçá-la, volta um. */
  estadoParaRefazer(est) { return { placar: est.placar.slice(), dador: est.dador, maoNumero: Math.max(0, est.maoNumero - 1) }; },
  criarMotor(estado, cfg, n, agentes, ganchos) {
    return U.Motor.criar(Object.assign({ n, opcoes: opcoesMotor(cfg) }, estado), agentes, ganchos);
  },

  quemDecide(metodo, assento) { return [assento]; },
  valorParaMotor(metodo, v) { return metodo === 'antesDeComprar' ? undefined : v; },

  limpar(metodo, valor, vista) {
    const op = vista.opcoes;
    if (metodo === 'antesDeComprar') return true;
    if (metodo === 'escolherCor') return Number.isInteger(valor) && valor >= 0 && valor <= 3 ? valor : null;
    if (!valor || typeof valor !== 'object') return null;
    const cor = Number.isInteger(valor.cor) && valor.cor >= 0 && valor.cor <= 3 ? valor.cor : undefined;
    const ultima = valor.ultima === true;
    if (metodo === 'jogar') {
      if (valor.tipo === 'comprar') return { tipo: 'comprar' };
      if (valor.tipo !== 'carta') return null;
      if (Array.isArray(valor.cartas) && valor.cartas.length > 1) {
        if (vista.fase === 'responder' || !op.juntas || !valor.cartas.every(Number.isInteger)) return null;
        if (new Set(valor.cartas).size !== valor.cartas.length) return null;
        if (!R.grupoValido(vista.mao, valor.cartas, vista.topo, vista.cor, op, null)) return null;
        return { tipo: 'carta', carta: valor.cartas[0], cartas: valor.cartas.slice(), ultima };
      }
      if (!Number.isInteger(valor.carta) || vista.jogaveis.indexOf(valor.carta) < 0) return null;
      if (C[valor.carta].coringa && cor === undefined) return null;
      return { tipo: 'carta', carta: valor.carta, cor, ultima };
    }
    if (metodo === 'depoisDeComprar') {
      if (valor.tipo === 'passar' || valor.tipo === 'comprar') return { tipo: valor.tipo };
      if (valor.tipo !== 'carta' || valor.carta !== vista.comprada || vista.jogaveis.indexOf(valor.carta) < 0) return null;
      if (C[valor.carta].coringa && cor === undefined) return null;
      return { tipo: 'carta', carta: valor.carta, cor, ultima };
    }
    return null;
  },

  automatica(metodo) {
    if (metodo === 'jogar') return { tipo: 'comprar' };
    if (metodo === 'depoisDeComprar') return { tipo: 'passar' };
    if (metodo === 'escolherCor') return -1;     // o motor escolhe a cor que mais aparece na mão
    return true;                                 // antesDeComprar: compra
  },

  resultado(r, jogo) {
    return { vencedor: r.vencedor, placar: r.placar, maos: r.maos, nomes: jogo.jogadores.map(j => j.nome) };
  },

  // ------------------------------------------- o que o lugar s vê, girado
  vistaPara(v, s, n) {
    const g = giro(s, n);
    const o = Object.assign({}, v);
    delete o.historico;    // só o coach usa (e ele fica desligado na mesa com amigos)
    o.eu = g(v.eu); o.dador = g(v.dador); o.vez = g(v.vez);
    o.nCartas = porLugar(v.nCartas, s, n);
    o.placar = porLugar(v.placar, s, n);
    o.ultima = porLugar(v.ultima, s, n);
    if (v.pendente) o.pendente = Object.assign({}, v.pendente, { de: g(v.pendente.de) });
    return o;
  },

  eventoPara(ev, s, n) {
    const g = giro(s, n);
    const o = Object.assign({}, ev);
    ['j', 'dador', 'vez', 'alvo', 'por', 'contra', 'vencedor'].forEach(k => { if (k in ev) o[k] = g(ev[k]); });
    if (ev.nCartas && Array.isArray(ev.nCartas)) o.nCartas = porLugar(ev.nCartas, s, n);
    if (ev.placar) o.placar = porLugar(ev.placar, s, n);
    if (ev.maos) o.maos = porLugar(ev.maos, s, n);
    if (ev.mais4) o.mais4 = ev.mais4.map(x => Object.assign({}, x, { j: g(x.j) }));
    // as cartas que os outros compram não aparecem
    if (ev.tipo === 'compra' && ev.j !== s) o.cartas = [];
    return o;
  },

  pedidoPara(p, s, n) {
    const g = giro(s, n);
    const extra = p.metodo === 'janela' ? { j: g(p.extra.j) } : p.extra;
    return { id: p.id, metodo: p.metodo, extra, comigo: p.quem.indexOf(s) >= 0, quem: p.quem.map(g) };
  }
};
