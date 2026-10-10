/* ==========================================================================
   OUTS · servidor — janela.js
   Os arquivos do núcleo (js/*.js) são IIFEs que usam window.Poker. No Worker
   não existe window: aqui ele vira o próprio globalThis. Precisa ser um
   módulo separado e importado ANTES do núcleo, porque os import são içados.
   ========================================================================== */
globalThis.window = globalThis;
