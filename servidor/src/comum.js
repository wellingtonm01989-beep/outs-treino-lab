/* ==========================================================================
   OUTS · servidor — comum.js
   Pedaços usados pela sala (mesa.js) e pelas partidas (jogos/*.js).
   ========================================================================== */

export const TAM_NOME = 18;

export function enviar(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* conexão já caiu */ } }
export function fechar(ws, codigo, motivo) { try { ws.close(codigo, motivo); } catch (e) { /* já fechada */ } }
export const tokenDe = ws => (ws.deserializeAttachment() || {}).token || null;

/** Nome limpo (sem caracteres de controle/invisíveis, espaços simples) ou null se inválido. */
export function limparNome(bruto) {
  if (typeof bruto !== 'string') return null;
  const s = bruto.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\s+/g, ' ').trim();
  const n = Array.from(s).length;
  return n >= 1 && n <= TAM_NOME ? s : null;
}
