/* ==========================================================================
   OUTS · servidor — jogos/index.js
   Os jogos que uma mesa com amigos pode ter (config.jogo) e a validação das
   opções de cada um na criação da mesa (POST /mesas).
   ========================================================================== */
import * as Poker from './poker.js';
import { PartidaCartas } from './cartas.js';
import { truco } from './truco.js';
import { ultima } from './ultima.js';

const CARTAS = { truco, ultima };

/** Valida as opções da mesa; devolve { config } ou { erro }. Sem "jogo", é poker (o app antigo não manda). */
export function validarConfig(c, limites) {
  if (!c || typeof c !== 'object') return { erro: 'Opções da mesa ausentes.' };
  const jogo = c.jogo === undefined ? 'poker' : c.jogo;
  if (jogo === 'poker') return Poker.validarConfig(c, limites.MAX_PREMIO);
  if (CARTAS[jogo]) return CARTAS[jogo].validarConfig(c);
  return { erro: 'Jogo desconhecido.' };
}

/** A partida de uma mesa, conforme o jogo escolhido. */
export function criarPartida(mesa, config) {
  if (CARTAS[config.jogo]) return new PartidaCartas(mesa, CARTAS[config.jogo]);
  return new Poker.PokerSNG(mesa);
}
