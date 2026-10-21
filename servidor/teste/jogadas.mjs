/* ==========================================================================
   OUTS · servidor — teste/jogadas.mjs
   Jogadas válidas sorteadas para os testes das partidas de cartas (o que um
   jogador de verdade poderia mandar), a partir da vista que ele recebeu.
   ========================================================================== */
import { P } from '../src/nucleo.js';

const sorteio = n => P.RNG.inteiroAbaixo(n);
const um = lista => lista[sorteio(lista.length)];

export function jogadaTruco(metodo, v) {
  if (metodo === 'decidir') {
    if (v.podeTrucar && P.RNG.real() < 0.15) return { tipo: 'truco' };
    if (v.cegas) return { tipo: 'carta', indice: sorteio(v.cartas.length) };
    return { tipo: 'carta', carta: um(v.cartas), coberta: v.podeCobrir && P.RNG.real() < 0.2 };
  }
  if (metodo === 'responder') return um(['aceitar', 'aceitar', 'correr'].concat(v.podeAumentar ? ['aumentar'] : []));
  if (metodo === 'onze') {
    if (v.trocaPermitida && P.RNG.real() < 0.5) {
      const eu = v.cartas.slice(), ele = v.cartasParceiro.slice();
      const a = sorteio(3), b = sorteio(3);
      const t = eu[a]; eu[a] = ele[b]; ele[b] = t;
      return { resposta: 'jogar', troca: { 0: eu, 2: ele } };
    }
    return um(['jogar', 'jogar', 'correr']);
  }
  throw new Error('método ' + metodo);
}

export function jogadaUltima(metodo, v) {
  const C = P.Uno.Regras.CARTAS;
  const cor = () => sorteio(4);
  if (metodo === 'antesDeComprar') return true;
  if (metodo === 'escolherCor') return cor();
  if (metodo === 'janela') return P.RNG.real() < 0.5;
  if (metodo === 'jogar') {
    if (!v.jogaveis.length || P.RNG.real() < 0.15) return { tipo: 'comprar' };
    const c = um(v.jogaveis);
    // cartas iguais juntas: junta as de mesmo número
    if (v.opcoes.juntas && v.fase !== 'responder' && C[c].tipo === 'num') {
      const iguais = v.mao.filter(x => x !== c && C[x].tipo === 'num' && C[x].num === C[c].num);
      if (iguais.length && P.RNG.real() < 0.6) { const cartas = [c].concat(iguais); return { tipo: 'carta', carta: c, cartas, ultima: v.mao.length - cartas.length === 1 }; }
    }
    return { tipo: 'carta', carta: c, cor: C[c].coringa ? cor() : undefined, ultima: v.mao.length === 2 && P.RNG.real() < 0.7 };
  }
  if (metodo === 'depoisDeComprar') {
    if (v.jogaveis.length && P.RNG.real() < 0.7) return { tipo: 'carta', carta: v.comprada, cor: C[v.comprada].coringa ? cor() : undefined, ultima: v.mao.length === 2 };
    if (v.opcoes.comprarAtePoder && !v.jogaveis.length) return { tipo: 'comprar' };
    return { tipo: 'passar' };
  }
  throw new Error('método ' + metodo);
}
