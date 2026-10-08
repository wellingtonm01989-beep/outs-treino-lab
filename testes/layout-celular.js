/* ==========================================================================
   OUTS · Treino Lab — testes/layout-celular.js
   Verificação automática de layout (carregado só com index.html?roteiro=layout):
   procura conteúdo cortado na lateral em todas as telas e, na mesa, assentos
   sobrepostos, assentos cobrindo o board e botões fora da tela. Usado para
   testar tamanhos de celular (em pé e deitado). Resultado em atributos do
   <html>: data-layout ("ok"/"falha") e data-layout-log.
   Parâmetros: &lugares=N (mesa, padrão 9) &modo=cash|sng
   ========================================================================== */
(function (P) {
  'use strict';

  const raiz = document.documentElement;
  const problemas = [];
  const log = [];
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const param = n => { const m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; };
  const nome = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const visivel = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };

  function gravar() {
    raiz.setAttribute('data-layout-log', log.join(' | ') + (problemas.length ? ' || PROBLEMAS: ' + problemas.join(' ; ') : ''));
  }

  /** Elementos que passam da borda direita/esquerda da janela (só o primeiro de cada cadeia). */
  function cortados(escopo) {
    const W = window.innerWidth;
    const lista = [];
    escopo.querySelectorAll('*').forEach(e => {
      if (!visivel(e)) return;
      const r = e.getBoundingClientRect();
      if (r.right <= W + 1 && r.left >= -1) return;
      // ignora o que está dentro de uma área com rolagem horizontal própria
      for (let p = e.parentElement; p && p !== escopo; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { const rp = p.getBoundingClientRect(); if (rp.right <= W + 1 && rp.left >= -1) return; }
      }
      const pr = e.parentElement && e.parentElement.getBoundingClientRect();
      if (pr && (pr.right > W + 1 || pr.left < -1) && e.parentElement !== escopo) return;   // o pai já foi listado
      lista.push(nome(e) + ' (' + Math.round(r.left) + '→' + Math.round(r.right) + ')');
    });
    return lista;
  }

  function sobrepoe(a, b, folga = 2) {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > folga && y > folga ? Math.round(x) + 'x' + Math.round(y) : null;
  }

  async function telas() {
    for (const t of ['lobby', 'treino', 'estatisticas', 'historico', 'auditoria']) {
      P.App.irPara(t);
      await dormir(400);
      const c = cortados($('#tela-' + t)).concat(cortados($('.topo')));
      if ($('#nav') && visivel($('#nav'))) cortados($('#nav')).forEach(x => c.push(x));
      if (c.length) problemas.push(t + ': ' + c.slice(0, 6).join(', '));
      log.push(t + (c.length ? ' cortado' : ' ok'));
      gravar();
    }
  }

  async function mesa() {
    const lugares = +param('lugares') || 9;
    const modo = param('modo') || 'cash';
    const E = P.Estruturas;
    const cfg = { modo, nivel: 'pequeno', lugares, semBanca: true };
    if (modo === 'cash') Object.assign(cfg, { limite: E.CASH.micro[2], buyinBB: 100, recompraAuto: true });
    else Object.assign(cfg, { buyin: E.SNG.micro[1], velocidade: 'turbo', field: lugares });
    P.App.iniciarPartida(cfg);
    const t0 = Date.now();
    while (($('.btn-fold') || {}).disabled !== false && Date.now() - t0 < 60000) await dormir(100);
    await dormir(300);
    const W = window.innerWidth, H = window.innerHeight;
    const palco = $('.mesa-palco').getBoundingClientRect();
    const assentos = $$('.assento').map(a => ({ a, r: a.querySelector('.corpo').getBoundingClientRect() }));
    assentos.forEach(({ a, r }) => {
      if (r.left < palco.left - 1 || r.right > palco.right + 1 || r.top < palco.top - 1 || r.bottom > palco.bottom + 1) {
        problemas.push('assento ' + a.dataset.s + ' fora do palco (' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ')');
      }
    });
    for (let i = 0; i < assentos.length; i++) {
      for (let j = i + 1; j < assentos.length; j++) {
        const s = sobrepoe(assentos[i].r, assentos[j].r);
        if (s) problemas.push(`assentos ${i} e ${j} sobrepostos ${s}`);
      }
    }
    const board = $('.board').getBoundingClientRect();
    assentos.forEach(({ a, r }) => { const s = sobrepoe(board, r); if (s) problemas.push(`assento ${a.dataset.s} cobre o board ${s}`); });
    const pote = $('.pote').getBoundingClientRect();
    assentos.forEach(({ a, r }) => { const s = pote.width && sobrepoe(pote, r); if (s) problemas.push(`assento ${a.dataset.s} cobre o pote ${s}`); });
    const heroiCartas = $('.assento.heroi .cartas').getBoundingClientRect();
    const s0 = sobrepoe(heroiCartas, board);
    if (s0) problemas.push('cartas do herói cobrem o board ' + s0);
    assentos.forEach(({ a, r }) => { if (a.dataset.s !== '0') { const s = sobrepoe(heroiCartas, r); if (s) problemas.push(`cartas do herói cobrem o assento ${a.dataset.s} ${s}`); } });
    $$('.aposta:not(.oculto)').forEach(b => { const r = b.getBoundingClientRect(); const s = sobrepoe(r, board); if (s) problemas.push('aposta cobre o board ' + s); });
    $$('.btn-acao, .tamanhos button, .linha-slider > *').forEach(b => {
      const r = b.getBoundingClientRect();
      if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1) problemas.push(nome(b) + ' fora da tela (' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ')');
    });
    $$('.mesa-barra > *').forEach(b => { if (!visivel(b)) return; const r = b.getBoundingClientRect(); if (r.right > W + 1) problemas.push(nome(b) + ' cortado na barra'); });
    const cortes = cortados($('#tela-mesa'));
    if (cortes.length) problemas.push('mesa: ' + cortes.slice(0, 6).join(', '));
    log.push(`mesa ${lugares} lugares (${W}x${H}, palco ${Math.round(palco.width)}x${Math.round(palco.height)}, carta ${getComputedStyle($('.mesa-palco')).getPropertyValue('--carta-l').trim()})`);
    gravar();
  }

  /** &estado=coach|menu|config|relatorio: deixa a tela nesse estado no fim (para fotos). */
  async function deixarEstado(qual) {
    if (qual === 'coach') { P.UICoach.alternar(true); await dormir(400); }
    else if (qual === 'menu') { $('#mb-menu').click(); await dormir(300); }
    else if (qual === 'config') { $('#btn-config').click(); await dormir(300); }
    else if (qual === 'relatorio') {
      for (let k = 0; k < 5; k++) {   // algumas mãos para o relatório ter conteúdo
        const t0 = Date.now();
        while (($('.btn-fold') || {}).disabled !== false && Date.now() - t0 < 30000) await dormir(100);
        (k % 2 ? $('.btn-call') : $('.btn-fold')).click();
        await dormir(400);
      }
      await dormir(3000);
      $('#mb-menu').click(); await dormir(200);
      Array.prototype.slice.call(document.querySelectorAll('.menu-mesa button')).pop().click();
      await dormir(800);
    }
  }

  async function rodar() {
    P.Config.set('velocidade', 'turbo');
    P.Config.set('som', false);
    P.Config.set('modoCoach', param('coach') || 'sempre');
    if (param('mesa') !== 'so') await telas();
    if (param('mesa') !== 'nao') await mesa();
    if (param('estado')) await deixarEstado(param('estado'));
  }

  // dentro do simulador (testes/celular.html) o resultado também vai para a página de fora
  function avisarFora() {
    if (window.parent === window) return;
    window.parent.postMessage({ tipo: 'layout', estado: raiz.getAttribute('data-layout'), log: raiz.getAttribute('data-layout-log') }, '*');
  }

  rodar().then(() => { raiz.setAttribute('data-layout', problemas.length ? 'falha' : 'ok'); gravar(); avisarFora(); })
    .catch(e => { raiz.setAttribute('data-layout', 'erro'); log.push('ERRO: ' + e.message); gravar(); avisarFora(); });
})(window.Poker = window.Poker || {});
