/* ==========================================================================
   OUTS · servidor — nucleo.js
   Reaproveita no servidor os mesmos arquivos do app (sem cópia): aleatoriedade
   (crypto), baralho, avaliador de mãos, motor de apostas e as estruturas de
   blinds e premiação. A ordem importa: cada arquivo usa os anteriores.
   ========================================================================== */
import './janela.js';
import '../../js/rng.js';
import '../../js/baralho.js';
import '../../js/avaliador.js';
import '../../js/motor.js';
import '../../js/torneio.js';

export const P = globalThis.window.Poker;

// sem I, L, O, 0 e 1: fácil de ler e de digitar
const LETRAS_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RE_CODIGO = /^[A-HJKMNP-Z2-9]{6}$/;

/** Código curto da mesa, usado no link (#mesa=CODIGO). */
export function codigoNovo() {
  let s = '';
  for (let i = 0; i < 6; i++) s += LETRAS_CODIGO[P.RNG.inteiroAbaixo(LETRAS_CODIGO.length)];
  return s;
}

/** Token secreto de 128 bits (identidade do jogador para reconectar). */
export function tokenNovo() {
  let s = '';
  for (let i = 0; i < 4; i++) s += P.RNG.uint32().toString(16).padStart(8, '0');
  return s;
}
