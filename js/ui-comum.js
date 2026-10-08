/* ==========================================================================
   OUTS · Treino Lab — ui-comum.js
   Peças visuais compartilhadas: formatação de valores, cartas, fichas,
   avatares e bandeiras (SVG gerado), modais e avisos.
   ========================================================================== */
(function (P) {
  'use strict';

  // ------------------------------------------------------------ formatação
  const Formato = {
    dinheiro(centavos) {
      const v = centavos / 100;
      const inteiro = Math.abs(centavos) >= 100000 && centavos % 100 === 0;
      return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 });
    },
    fichas(n) { return Math.round(n).toLocaleString('pt-BR'); },
    bb(valor, bb) {
      const x = valor / bb;
      const s = (Math.round(x * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      return s + ' bb';
    },
    pct(x, casas = 1) { return (x * 100).toFixed(casas).replace('.', ',') + '%'; },
    num(x, casas = 1) { return x.toFixed(casas).replace('.', ','); },
    tempo(ms) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    /** Formata segundo o modo da mesa e a unidade escolhida ($/fichas ou bb). */
    valor(v, contexto) {
      if (!contexto) return Formato.fichas(v);
      if (P.Config.get('unidade') === 'bb' && contexto.bb) return Formato.bb(v, contexto.bb);
      return contexto.modo === 'cash' ? Formato.dinheiro(v) : Formato.fichas(v);
    },
    sinal(v, f) { return (v > 0 ? '+' : '') + f(v); }
  };
  P.Formato = Formato;

  // --------------------------------------------------------------- DOM
  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        // variáveis CSS (--x) só funcionam via setProperty
        for (const p in v) { if (p.startsWith('--')) e.style.setProperty(p, v[p]); else e.style[p] = v[p]; }
      }
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    filhos.flat().forEach(f => { if (f !== null && f !== undefined && f !== false) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // -------------------------------------------------------------- cartas
  /** Carta em CSS. opts: { fechada, classe } — c = null cria só o verso. */
  function carta(c, opts = {}) {
    const C = P.Cartas;
    const fechada = opts.fechada || c === null || c === undefined;
    const div = el('div', { class: 'carta' + (c !== null && c !== undefined ? ' n-' + (c & 3) : '') + (fechada ? ' fechada' : '') + (opts.classe ? ' ' + opts.classe : '') });
    if (c !== null && c !== undefined) div.dataset.carta = c;
    const face = el('div', { class: 'lado face' });
    if (c !== null && c !== undefined) {
      const s = C.SIMBOLOS[c & 3];
      face.appendChild(el('span', { class: 'c-rank', text: C.ROTULO_RANK[c >> 2] }));
      face.appendChild(el('span', { class: 'c-np', text: s }));
      face.appendChild(el('span', { class: 'c-ng', text: s }));
    }
    div.appendChild(face);
    div.appendChild(el('div', { class: 'lado verso' }));
    return div;
  }

  /** Revela uma carta que estava fechada (com virada 3D). */
  function revelar(div, c) {
    const C = P.Cartas;
    if (c !== undefined && c !== null && !div.dataset.carta) {
      const face = div.querySelector('.face');
      face.innerHTML = '';
      const s = C.SIMBOLOS[c & 3];
      face.appendChild(el('span', { class: 'c-rank', text: C.ROTULO_RANK[c >> 2] }));
      face.appendChild(el('span', { class: 'c-np', text: s }));
      face.appendChild(el('span', { class: 'c-ng', text: s }));
      div.classList.add('n-' + (c & 3));
      div.dataset.carta = c;
    }
    void div.offsetWidth;
    div.classList.remove('fechada');
  }

  /** Carta em texto curto ("A♠") com cor do naipe. */
  function cartaTxt(c, classe) {
    return `<span class="carta-txt n-${c & 3}${classe ? ' ' + classe : ''}">${P.Cartas.bonito(c)}</span>`;
  }

  // -------------------------------------------------------------- fichas
  // Cores de cassino por valor: [valor, cor do corpo, cor das listras da borda, cor do miolo]
  const DENOMINACOES = [
    [1000000, '#7a4a2a', '#f3d27a', '#f6eedb'],   // marrom com listras douradas
    [100000, '#1f2d6b', '#f3d27a', '#f6eedb'],    // azul-marinho
    [25000, '#0b84c6', '#f6f3ea', '#f6eedb'],     // azul-claro
    [5000, '#e8711a', '#f6f3ea', '#f6eedb'],      // laranja
    [1000, '#e3b51d', '#20242a', '#f6eedb'],      // amarela com listras pretas
    [500, '#6b2595', '#f6f3ea', '#f6eedb'],       // roxa
    [100, '#1c1d20', '#f6f3ea', '#eceae2'],       // preta
    [25, '#1f7a3e', '#f6f3ea', '#f6eedb'],        // verde
    [5, '#c62828', '#f6f3ea', '#f6eedb'],         // vermelha
    [1, '#ecebe4', '#2f6db5', '#ffffff']          // branca com listras azuis
  ];

  /**
   * Pilhas de fichas para um valor (na menor unidade). Cada ficha tem a face
   * de cima (borda listrada, anel e miolo) e a lateral em 3D; empilhadas
   * formam cilindros, como na mesa de verdade.
   */
  function pilhaFichas(valor, tamanho = 20) {
    const esp = Math.max(2, Math.round(tamanho * 0.17));          // espessura de cada ficha
    const box = el('div', { class: 'pilhas', style: { '--f': tamanho + 'px', '--esp': esp + 'px' } });
    let resto = Math.max(0, Math.round(valor));
    const pilhas = [];
    for (const [d, cor, listra, miolo] of DENOMINACOES) {
      if (resto >= d) {
        const n = Math.floor(resto / d);
        resto -= n * d;
        pilhas.push({ n: Math.min(n, 10), cor, listra, miolo });
      }
      if (pilhas.length >= 3) break;
    }
    pilhas.forEach(p => {
      const pilha = el('div', { class: 'pilha', style: { height: (tamanho * 0.5 + esp * p.n) + 'px' } });
      for (let i = 0; i < p.n; i++) {
        pilha.appendChild(el('i', { class: 'ficha', style: { bottom: (i * esp) + 'px', '--c': p.cor, '--l': p.listra, '--m': p.miolo } }));
      }
      box.appendChild(pilha);
    });
    return box;
  }

  // ------------------------------------------------------------- avatares
  /** Avatar em SVG a partir dos traços sorteados para o bot. */
  function avatarSVG(a, heroi) {
    if (!a) a = { fundo: 40, pele: '#e0ac69', cabelo: '#2b1b0e', estilo: 0, oculos: false, barba: false, bone: false, roupa: 210 };
    const f1 = `hsl(${a.fundo},45%,34%)`, f2 = `hsl(${(a.fundo + 30) % 360},50%,20%)`;
    const roupa = `hsl(${a.roupa},45%,42%)`;
    let cabelo = '';
    switch (a.estilo) {
      case 0: cabelo = `<path d="M18 27c0-9 6-15 14-15s14 6 14 15c-3-4-8-6-14-6s-11 2-14 6z" fill="${a.cabelo}"/>`; break;
      case 1: cabelo = `<path d="M16 30c0-11 7-18 16-18s16 7 16 18v14c-2 0-4-2-4-5V29c-3-3-7-5-12-5s-9 2-12 5v10c0 3-2 5-4 5z" fill="${a.cabelo}"/>`; break;
      case 2: cabelo = ''; break;
      case 3: cabelo = `<g fill="${a.cabelo}"><circle cx="21" cy="21" r="6"/><circle cx="28" cy="16" r="6"/><circle cx="36" cy="16" r="6"/><circle cx="43" cy="21" r="6"/><circle cx="18" cy="28" r="4"/><circle cx="46" cy="28" r="4"/></g>`; break;
      case 4: cabelo = `<path d="M18 27c0-9 6-15 14-15s14 6 14 15c-3-4-8-6-14-6s-11 2-14 6z" fill="${a.cabelo}"/><circle cx="32" cy="10" r="5" fill="${a.cabelo}"/>`; break;
      default: cabelo = `<path d="M26 22l3-12 3 9 3-10 3 13c-4-2-8-2-12 0z" fill="${a.cabelo}"/>`;
    }
    const bone = a.bone ? `<path d="M17 26c0-9 7-14 15-14s15 5 15 14z" fill="hsl(${(a.roupa + 180) % 360},55%,45%)"/><path d="M30 24h22c0 3-3 4-8 4H30z" fill="hsl(${(a.roupa + 180) % 360},55%,35%)"/>` : '';
    const oculos = a.oculos ? `<g fill="none" stroke="#111" stroke-width="1.6"><circle cx="26.5" cy="31" r="4"/><circle cx="37.5" cy="31" r="4"/><path d="M30.5 31h3"/></g>` : '';
    const barba = a.barba ? `<path d="M21 34c1 9 6 13 11 13s10-4 11-13c-2 4-6 6-11 6s-9-2-11-6z" fill="${a.cabelo}" opacity=".9"/>` : '';
    const anel = heroi ? `<circle cx="32" cy="32" r="30.5" fill="none" stroke="#e8c672" stroke-width="3"/>` : '';
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g${a.fundo}${a.roupa}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></linearGradient></defs>` +
      `<rect width="64" height="64" fill="url(#g${a.fundo}${a.roupa})"/>` +
      `<path d="M10 64c2-12 11-18 22-18s20 6 22 18z" fill="${roupa}"/><rect x="28" y="38" width="8" height="9" rx="3" fill="${a.pele}"/>` +
      `<ellipse cx="32" cy="30" rx="12" ry="13.5" fill="${a.pele}"/>` + cabelo + bone + barba +
      `<circle cx="27.5" cy="31" r="1.4" fill="#1a1a1a"/><circle cx="36.5" cy="31" r="1.4" fill="#1a1a1a"/>` +
      `<path d="M28 37.5c2 1.6 6 1.6 8 0" stroke="#5a2e1a" stroke-width="1.4" fill="none" stroke-linecap="round"/>` + oculos + anel + `</svg>`;
  }

  function bandeiraSVG(p) {
    if (!p) return '';
    const c = p.cores;
    const faixas = p.tipo === 'v'
      ? `<rect width="6" height="12" fill="${c[0]}"/><rect x="6" width="6" height="12" fill="${c[1]}"/><rect x="12" width="6" height="12" fill="${c[2]}"/>`
      : `<rect width="18" height="4" fill="${c[0]}"/><rect y="4" width="18" height="4" fill="${c[1]}"/><rect y="8" width="18" height="4" fill="${c[2]}"/>`;
    const circ = p.circulo ? `<circle cx="9" cy="6" r="2.6" fill="${p.circulo}"/>` : '';
    return `<span class="bandeira" title="${esc(p.nome)}"><svg viewBox="0 0 18 12">${faixas}${circ}</svg></span>`;
  }

  const LOGO_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="logo-ouro-app" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d892"/><stop offset="1" stop-color="#b8913d"/></linearGradient></defs><circle cx="20" cy="20" r="17" fill="none" stroke="#2a3646" stroke-width="3"/><circle cx="20" cy="20" r="17" fill="none" stroke="url(#logo-ouro-app)" stroke-width="3" stroke-linecap="round" stroke-dasharray="80 107" transform="rotate(-90 20 20)"/><path transform="translate(9.8 9.8) scale(0.85)" fill="url(#logo-ouro-app)" d="M12 2.5c-.6.7-8 7.2-8 11.6 0 2.5 1.9 4.3 4.2 4.3 1.3 0 2.4-.6 3.1-1.5-.2 1.9-1 3.4-2.6 4.6h6.6c-1.6-1.2-2.4-2.7-2.6-4.6.7.9 1.8 1.5 3.1 1.5 2.3 0 4.2-1.8 4.2-4.3 0-4.4-7.4-10.9-8-11.6z"/></svg>`;

  // --------------------------------------------------------- modais/avisos
  /**
   * Abre um modal. opts: { titulo, conteudo (HTML ou nó), botoes: [{texto, classe, valor}], largo, aoAbrir(corpo) }
   * Retorna Promise com o "valor" do botão (ou null ao fechar).
   */
  function modal(opts) {
    return new Promise(resolve => {
      const fundo = el('div', { class: 'modal-fundo' });
      const caixa = el('div', { class: 'modal' + (opts.largo ? ' largo' : ''), role: 'dialog' });
      const fechar = v => { document.removeEventListener('keydown', tecla, true); fundo.remove(); resolve(v); };
      const cab = el('div', { class: 'modal-cab' }, el('h2', { text: opts.titulo || '' }));
      if (opts.fechavel !== false) cab.appendChild(el('button', { class: 'fechar', title: 'Fechar', onclick: () => fechar(null), html: '&times;' }));
      const corpo = el('div', { class: 'modal-corpo' });
      if (typeof opts.conteudo === 'string') corpo.innerHTML = opts.conteudo; else if (opts.conteudo) corpo.appendChild(opts.conteudo);
      caixa.appendChild(cab);
      caixa.appendChild(corpo);
      if (opts.botoes && opts.botoes.length) {
        const rod = el('div', { class: 'modal-rodape' });
        opts.botoes.forEach(b => rod.appendChild(el('button', { class: 'btn ' + (b.classe || ''), text: b.texto, onclick: () => fechar(b.valor) })));
        caixa.appendChild(rod);
      }
      fundo.appendChild(caixa);
      if (opts.fechavel !== false) fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(null); });
      function tecla(e) { if (e.key === 'Escape' && opts.fechavel !== false) { e.stopPropagation(); fechar(null); } }
      document.addEventListener('keydown', tecla, true);
      document.body.appendChild(fundo);
      if (opts.aoAbrir) opts.aoAbrir(corpo, fechar);
    });
  }

  function confirmar(titulo, texto, sim = 'Confirmar', nao = 'Cancelar') {
    return modal({ titulo, conteudo: `<p>${texto}</p>`, botoes: [{ texto: nao, valor: false }, { texto: sim, classe: 'btn-ouro', valor: true }] }).then(v => v === true);
  }

  function aviso(texto, tipo = '') {
    let box = $('.avisos');
    if (!box) { box = el('div', { class: 'avisos' }); document.body.appendChild(box); }
    const a = el('div', { class: 'aviso ' + tipo, html: texto });
    box.appendChild(a);
    setTimeout(() => { a.style.transition = 'opacity 300ms'; a.style.opacity = '0'; setTimeout(() => a.remove(), 320); }, 3200);
  }

  P.UI = { el, $, $$, esc, carta, revelar, cartaTxt, pilhaFichas, avatarSVG, bandeiraSVG, LOGO_SVG, modal, confirmar, aviso };
})(window.Poker = window.Poker || {});
