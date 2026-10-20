/* ==========================================================================
   OUTS · Treino Lab — xadrez-motor.js
   Motor de xadrez: regras completas e a busca do melhor lance.

   Regras: lances legais (xeque, roque com todas as condições, en passant,
   promoção), xeque-mate, afogamento, empate por 50 lances, repetição tripla
   e material insuficiente; FEN e notação algébrica em português (R rei,
   D dama, T torre, B bispo, C cavalo).

   Busca: alfa-beta (negamax com janela nula), aprofundamento iterativo,
   tabela de transposição (Zobrist), busca de capturas no fim (quiescência),
   ordenação por captura (MVV-LVA), lances assassinos e histórico, poda do
   lance nulo, redução de lances tardios e extensão de xeque. Avaliação por
   tabelas peça-casa com transição meio-jogo → final (valores do PeSTO).

   Tudo fica dentro de nucleo(): a mesma função roda na página e num Web
   Worker (criado a partir do texto dela), para pensar sem travar a tela.
   ========================================================================== */
(function (P) {
  'use strict';

  function nucleo(X, emWorker) {
    // --------------------------------------------------------- peças e casas
    // 0x88: casa = 16*linha + coluna (linha 0 = 1ª fileira, das brancas)
    const VAZIO = 0, PEAO = 1, CAVALO = 2, BISPO = 3, TORRE = 4, DAMA = 5, REI = 6;
    const BRANCO = 0, PRETO = 8;
    const tipo = p => p & 7, corDe = p => p & 8;
    const LETRA_PT = ['', '', 'C', 'B', 'T', 'D', 'R'];
    const LETRA_FEN = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
    const VALOR = [0, 100, 320, 330, 500, 900, 20000];
    const nomeCasa = s => 'abcdefgh'[s & 7] + (1 + (s >> 4));
    const casaDe = t => (t.charCodeAt(1) - 49) * 16 + (t.charCodeAt(0) - 97);
    const fora = s => (s & 0x88) !== 0;

    const DIR_C = [33, 31, 18, 14, -33, -31, -18, -14];
    const DIR_B = [17, 15, -17, -15];
    const DIR_T = [16, 1, -16, -1];
    const DIR_R = [17, 15, -17, -15, 16, 1, -16, -1];

    // ---------------------------------------------------------- Zobrist
    let semente = 0x9e3779b9;
    function aleat32() { semente ^= semente << 13; semente ^= semente >>> 17; semente ^= semente << 5; return semente >>> 0; }
    const ZP = [], ZP2 = [];
    for (let p = 0; p < 16; p++) { ZP.push(new Uint32Array(128)); ZP2.push(new Uint32Array(128)); for (let s = 0; s < 128; s++) { ZP[p][s] = aleat32(); ZP2[p][s] = aleat32(); } }
    const ZLADO = aleat32(), ZLADO2 = aleat32();
    const ZROQUE = new Uint32Array(16), ZROQUE2 = new Uint32Array(16);
    for (let i = 0; i < 16; i++) { ZROQUE[i] = aleat32(); ZROQUE2[i] = aleat32(); }
    const ZEP = new Uint32Array(8), ZEP2 = new Uint32Array(8);
    for (let i = 0; i < 8; i++) { ZEP[i] = aleat32(); ZEP2[i] = aleat32(); }

    // --------------------------------------------------- lance (inteiro)
    // de (7 bits) | para (7) << 7 | promoção (3) << 14 | marcas << 17
    const M_CAPT = 1, M_EP = 2, M_ROQUE = 4, M_DUPLO = 8;
    const lance = (de, para, promo, marcas) => de | (para << 7) | ((promo || 0) << 14) | ((marcas || 0) << 17);
    const deL = m => m & 127, paraL = m => (m >> 7) & 127, promoL = m => (m >> 14) & 7, marcasL = m => m >> 17;

    // ------------------------------------------------------- posição
    const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // roque: 1 = brancas pequeno, 2 = brancas grande, 4 = pretas pequeno, 8 = pretas grande
    const MASCARA_ROQUE = new Uint8Array(128).fill(15);
    MASCARA_ROQUE[casaDe('e1')] = 15 & ~3; MASCARA_ROQUE[casaDe('h1')] = 15 & ~1; MASCARA_ROQUE[casaDe('a1')] = 15 & ~2;
    MASCARA_ROQUE[casaDe('e8')] = 15 & ~12; MASCARA_ROQUE[casaDe('h8')] = 15 & ~4; MASCARA_ROQUE[casaDe('a8')] = 15 & ~8;

    function Posicao(fen) {
      this.t = new Uint8Array(128);
      this.lado = BRANCO; this.roque = 0; this.ep = -1; this.meio = 0; this.numero = 1;
      this.reis = [0, 0];
      this.h1 = 0; this.h2 = 0;
      this.hist = [];          // desfazer: [lance, capturada, roque, ep, meio, h1, h2]
      this.chaves = [];        // hashes das posições anteriores (repetição)
      this.carregar(fen || FEN_INICIAL);
    }
    Posicao.prototype.carregar = function (fen) {
      const [pos, lado, roque, ep, meio, num] = fen.trim().split(/\s+/);
      this.t.fill(0);
      let lin = 7, col = 0;
      for (const ch of pos) {
        if (ch === '/') { lin--; col = 0; continue; }
        if (ch >= '1' && ch <= '8') { col += +ch; continue; }
        const lower = ch.toLowerCase();
        const p = LETRA_FEN.indexOf(lower) | (ch === lower ? PRETO : BRANCO);
        this.t[lin * 16 + col] = p;
        if (tipo(p) === REI) this.reis[p === REI ? 0 : 1] = lin * 16 + col;
        col++;
      }
      this.lado = lado === 'b' ? PRETO : BRANCO;
      this.roque = (roque || '-').split('').reduce((r, c) => r | ({ K: 1, Q: 2, k: 4, q: 8 }[c] || 0), 0);
      this.ep = ep && ep !== '-' ? casaDe(ep) : -1;
      this.meio = +meio || 0; this.numero = +num || 1;
      this.hist = []; this.chaves = [];
      this.calcularHash();
    };
    Posicao.prototype.calcularHash = function () {
      let a = 0, b = 0;
      for (let s = 0; s < 128; s++) { if (fora(s)) { s += 7; continue; } const p = this.t[s]; if (p) { a ^= ZP[p][s]; b ^= ZP2[p][s]; } }
      if (this.lado === PRETO) { a ^= ZLADO; b ^= ZLADO2; }
      a ^= ZROQUE[this.roque]; b ^= ZROQUE2[this.roque];
      if (this.ep >= 0) { a ^= ZEP[this.ep & 7]; b ^= ZEP2[this.ep & 7]; }
      this.h1 = a >>> 0; this.h2 = b >>> 0;
    };
    Posicao.prototype.fen = function () {
      let out = '';
      for (let lin = 7; lin >= 0; lin--) {
        let vazias = 0;
        for (let col = 0; col < 8; col++) {
          const p = this.t[lin * 16 + col];
          if (!p) { vazias++; continue; }
          if (vazias) { out += vazias; vazias = 0; }
          const l = LETRA_FEN[tipo(p)];
          out += corDe(p) === BRANCO ? l.toUpperCase() : l;
        }
        if (vazias) out += vazias;
        if (lin) out += '/';
      }
      const r = (this.roque & 1 ? 'K' : '') + (this.roque & 2 ? 'Q' : '') + (this.roque & 4 ? 'k' : '') + (this.roque & 8 ? 'q' : '');
      return `${out} ${this.lado === BRANCO ? 'w' : 'b'} ${r || '-'} ${this.ep >= 0 ? nomeCasa(this.ep) : '-'} ${this.meio} ${this.numero}`;
    };

    /** A casa s é atacada por peças da cor "por"? */
    Posicao.prototype.atacada = function (s, por) {
      const t = this.t;
      // peões
      if (por === BRANCO) { if (!fora(s - 15) && t[s - 15] === PEAO) return true; if (!fora(s - 17) && t[s - 17] === PEAO) return true; }
      else { if (!fora(s + 15) && t[s + 15] === (PEAO | PRETO)) return true; if (!fora(s + 17) && t[s + 17] === (PEAO | PRETO)) return true; }
      const c = CAVALO | por, r = REI | por, b = BISPO | por, tt = TORRE | por, d = DAMA | por;
      for (let i = 0; i < 8; i++) { const x = s + DIR_C[i]; if (!fora(x) && t[x] === c) return true; }
      for (let i = 0; i < 8; i++) { const x = s + DIR_R[i]; if (!fora(x) && t[x] === r) return true; }
      for (let i = 0; i < 4; i++) {
        const dd = DIR_B[i];
        for (let x = s + dd; !fora(x); x += dd) { const p = t[x]; if (p) { if (p === b || p === d) return true; break; } }
      }
      for (let i = 0; i < 4; i++) {
        const dd = DIR_T[i];
        for (let x = s + dd; !fora(x); x += dd) { const p = t[x]; if (p) { if (p === tt || p === d) return true; break; } }
      }
      return false;
    };
    Posicao.prototype.emXeque = function (cor) { const c = cor === undefined ? this.lado : cor; return this.atacada(this.reis[c ? 1 : 0], c ^ 8); };

    /** Lances pseudo-legais (sem conferir se o rei fica em xeque). soCapturas: só capturas e promoções. */
    Posicao.prototype.gerar = function (lista, soCapturas) {
      const t = this.t, eu = this.lado, ele = eu ^ 8;
      lista.length = 0;
      for (let s = 0; s < 128; s++) {
        if (fora(s)) { s += 7; continue; }
        const p = t[s];
        if (!p || corDe(p) !== eu) continue;
        const k = tipo(p);
        if (k === PEAO) {
          const frente = eu === BRANCO ? 16 : -16, lin = s >> 4;
          const ultima = eu === BRANCO ? 6 : 1, inicio = eu === BRANCO ? 1 : 6;
          const um = s + frente;
          if (!fora(um) && !t[um]) {
            if (lin === ultima) { for (const pr of [DAMA, CAVALO, TORRE, BISPO]) lista.push(lance(s, um, pr, 0)); }
            else if (!soCapturas) {
              lista.push(lance(s, um, 0, 0));
              const dois = um + frente;
              if (lin === inicio && !t[dois]) lista.push(lance(s, dois, 0, M_DUPLO));
            }
          }
          for (const lado of [frente - 1, frente + 1]) {
            const x = s + lado;
            if (fora(x)) continue;
            if (t[x] && corDe(t[x]) === ele) {
              if (lin === ultima) { for (const pr of [DAMA, CAVALO, TORRE, BISPO]) lista.push(lance(s, x, pr, M_CAPT)); }
              else lista.push(lance(s, x, 0, M_CAPT));
            } else if (x === this.ep) lista.push(lance(s, x, 0, M_CAPT | M_EP));
          }
          continue;
        }
        if (k === CAVALO || k === REI) {
          const dirs = k === CAVALO ? DIR_C : DIR_R;
          for (let i = 0; i < 8; i++) {
            const x = s + dirs[i];
            if (fora(x)) continue;
            const q = t[x];
            if (!q) { if (!soCapturas) lista.push(lance(s, x, 0, 0)); }
            else if (corDe(q) === ele) lista.push(lance(s, x, 0, M_CAPT));
          }
          if (k === REI && !soCapturas) {
            // roque: casas livres, rei fora de xeque e sem passar por casa atacada
            if (eu === BRANCO && s === 4) {
              if ((this.roque & 1) && !t[5] && !t[6] && t[7] === TORRE && !this.atacada(4, ele) && !this.atacada(5, ele) && !this.atacada(6, ele)) lista.push(lance(4, 6, 0, M_ROQUE));
              if ((this.roque & 2) && !t[3] && !t[2] && !t[1] && t[0] === TORRE && !this.atacada(4, ele) && !this.atacada(3, ele) && !this.atacada(2, ele)) lista.push(lance(4, 2, 0, M_ROQUE));
            } else if (eu === PRETO && s === 116) {
              if ((this.roque & 4) && !t[117] && !t[118] && t[119] === (TORRE | PRETO) && !this.atacada(116, ele) && !this.atacada(117, ele) && !this.atacada(118, ele)) lista.push(lance(116, 118, 0, M_ROQUE));
              if ((this.roque & 8) && !t[115] && !t[114] && !t[113] && t[112] === (TORRE | PRETO) && !this.atacada(116, ele) && !this.atacada(115, ele) && !this.atacada(114, ele)) lista.push(lance(116, 114, 0, M_ROQUE));
            }
          }
          continue;
        }
        const dirs = k === BISPO ? DIR_B : k === TORRE ? DIR_T : DIR_R;
        for (let i = 0; i < dirs.length; i++) {
          const dd = dirs[i];
          for (let x = s + dd; !fora(x); x += dd) {
            const q = t[x];
            if (!q) { if (!soCapturas) lista.push(lance(s, x, 0, 0)); continue; }
            if (corDe(q) === ele) lista.push(lance(s, x, 0, M_CAPT));
            break;
          }
        }
      }
      return lista;
    };

    /** Faz o lance (sem conferir legalidade). Devolve false se deixou o próprio rei em xeque (e desfaz). */
    Posicao.prototype.fazer = function (m) {
      const t = this.t, de = deL(m), para = paraL(m), pr = promoL(m), mk = marcasL(m);
      const p = t[de], eu = this.lado;
      let capt = t[para], casaCapt = para;
      if (mk & M_EP) { casaCapt = eu === BRANCO ? para - 16 : para + 16; capt = t[casaCapt]; }
      this.hist.push([m, capt, this.roque, this.ep, this.meio, this.h1, this.h2]);
      this.chaves.push(this.h1);
      let a = this.h1, b = this.h2;
      // tira o en passant e o roque antigos do hash
      if (this.ep >= 0) { a ^= ZEP[this.ep & 7]; b ^= ZEP2[this.ep & 7]; }
      a ^= ZROQUE[this.roque]; b ^= ZROQUE2[this.roque];
      // move a peça
      if (capt) { t[casaCapt] = 0; a ^= ZP[capt][casaCapt]; b ^= ZP2[capt][casaCapt]; }
      t[de] = 0; a ^= ZP[p][de]; b ^= ZP2[p][de];
      const nova = pr ? (pr | eu) : p;
      t[para] = nova; a ^= ZP[nova][para]; b ^= ZP2[nova][para];
      if (mk & M_ROQUE) {
        const [tde, tpara] = para === de + 2 ? [de + 3, de + 1] : [de - 4, de - 1];
        const tor = t[tde];
        t[tde] = 0; t[tpara] = tor;
        a ^= ZP[tor][tde] ^ ZP[tor][tpara]; b ^= ZP2[tor][tde] ^ ZP2[tor][tpara];
      }
      if (tipo(p) === REI) this.reis[eu ? 1 : 0] = para;
      this.roque &= MASCARA_ROQUE[de] & MASCARA_ROQUE[para];
      this.ep = mk & M_DUPLO ? (de + para) >> 1 : -1;
      this.meio = capt || tipo(p) === PEAO ? 0 : this.meio + 1;
      if (eu === PRETO) this.numero++;
      this.lado = eu ^ 8;
      a ^= ZROQUE[this.roque]; b ^= ZROQUE2[this.roque];
      if (this.ep >= 0) { a ^= ZEP[this.ep & 7]; b ^= ZEP2[this.ep & 7]; }
      a ^= ZLADO; b ^= ZLADO2;
      this.h1 = a >>> 0; this.h2 = b >>> 0;
      if (this.atacada(this.reis[eu ? 1 : 0], this.lado)) { this.desfazer(); return false; }
      return true;
    };
    Posicao.prototype.desfazer = function () {
      const [m, capt, roque, ep, meio, h1, h2] = this.hist.pop();
      this.chaves.pop();
      const t = this.t, de = deL(m), para = paraL(m), pr = promoL(m), mk = marcasL(m);
      this.lado ^= 8;
      const eu = this.lado;
      if (eu === PRETO) this.numero--;
      const p = pr ? (PEAO | eu) : t[para];
      t[de] = p; t[para] = 0;
      if (mk & M_EP) t[eu === BRANCO ? para - 16 : para + 16] = capt;
      else if (capt) t[para] = capt;
      if (mk & M_ROQUE) {
        const [tde, tpara] = para === de + 2 ? [de + 3, de + 1] : [de - 4, de - 1];
        t[tde] = t[tpara]; t[tpara] = 0;
      }
      if (tipo(p) === REI) this.reis[eu ? 1 : 0] = de;
      this.roque = roque; this.ep = ep; this.meio = meio; this.h1 = h1; this.h2 = h2;
    };
    Posicao.prototype.fazerNulo = function () {
      this.hist.push([0, 0, this.roque, this.ep, this.meio, this.h1, this.h2]);
      this.chaves.push(this.h1);
      let a = this.h1, b = this.h2;
      if (this.ep >= 0) { a ^= ZEP[this.ep & 7]; b ^= ZEP2[this.ep & 7]; }
      this.ep = -1; this.lado ^= 8;
      a ^= ZLADO; b ^= ZLADO2;
      this.h1 = a >>> 0; this.h2 = b >>> 0;
    };
    Posicao.prototype.desfazerNulo = function () {
      const h = this.hist.pop(); this.chaves.pop();
      this.lado ^= 8; this.ep = h[3]; this.h1 = h[5]; this.h2 = h[6];
    };

    /** Lances legais. */
    Posicao.prototype.legais = function () {
      const pseudo = this.gerar([]), out = [];
      for (const m of pseudo) if (this.fazer(m)) { this.desfazer(); out.push(m); }
      return out;
    };
    /** Repetições desta posição no histórico (desde o último lance irreversível). */
    Posicao.prototype.repeticoes = function () {
      let n = 0;
      const lim = Math.max(0, this.chaves.length - this.meio);
      for (let i = this.chaves.length - 2; i >= lim; i -= 2) if (this.chaves[i] === this.h1) n++;
      return n;
    };
    Posicao.prototype.materialInsuficiente = function () {
      const t = this.t; const menores = [0, 0]; let outros = 0; const bispos = [];
      for (let s = 0; s < 128; s++) {
        if (fora(s)) { s += 7; continue; }
        const p = t[s]; if (!p) continue;
        const k = tipo(p);
        if (k === REI) continue;
        if (k === CAVALO || k === BISPO) { menores[corDe(p) ? 1 : 0]++; if (k === BISPO) bispos.push(((s >> 4) + (s & 7)) & 1); }
        else outros++;
      }
      if (outros) return false;
      const tot = menores[0] + menores[1];
      if (tot <= 1) return true;
      // só bispos, todos na mesma cor de casa
      if (bispos.length === tot && bispos.every(x => x === bispos[0])) return true;
      return false;
    };
    /** Situação: { fim, resultado ('1-0','0-1','1/2-1/2'), motivo } */
    Posicao.prototype.situacao = function () {
      const leg = this.legais();
      if (!leg.length) {
        if (this.emXeque()) return { fim: true, resultado: this.lado === BRANCO ? '0-1' : '1-0', motivo: 'mate' };
        return { fim: true, resultado: '1/2-1/2', motivo: 'afogamento' };
      }
      if (this.meio >= 100) return { fim: true, resultado: '1/2-1/2', motivo: '50lances' };
      if (this.repeticoes() >= 2) return { fim: true, resultado: '1/2-1/2', motivo: 'repeticao' };
      if (this.materialInsuficiente()) return { fim: true, resultado: '1/2-1/2', motivo: 'material' };
      return { fim: false, legais: leg };
    };

    // --------------------------------------------------------- notação
    /** Notação algébrica em português (R, D, T, B, C; O-O; =D; + e #). */
    Posicao.prototype.san = function (m, legais) {
      const de = deL(m), para = paraL(m), mk = marcasL(m), p = this.t[de], k = tipo(p);
      let s;
      if (mk & M_ROQUE) s = para > de ? 'O-O' : 'O-O-O';
      else {
        s = LETRA_PT[k];
        if (k === PEAO) { if (mk & M_CAPT) s = 'abcdefgh'[de & 7]; }
        else {
          const outros = (legais || this.legais()).filter(x => x !== m && paraL(x) === para && this.t[deL(x)] === p);
          if (outros.length) {
            const mesmaCol = outros.some(x => (deL(x) & 7) === (de & 7)), mesmaLin = outros.some(x => (deL(x) >> 4) === (de >> 4));
            if (!mesmaCol) s += 'abcdefgh'[de & 7];
            else if (!mesmaLin) s += (1 + (de >> 4));
            else s += nomeCasa(de);
          }
        }
        if (mk & M_CAPT) s += 'x';
        s += nomeCasa(para);
        if (promoL(m)) s += '=' + LETRA_PT[promoL(m)];
      }
      if (this.fazer(m)) {
        if (this.emXeque()) s += this.legais().length ? '+' : '#';
        this.desfazer();
      }
      return s;
    };
    /** Lance a partir do texto ('e2e4', 'e7e8q', ou a notação em português ou inglês: 'Cf3', 'Nf3', 'exd5', 'O-O', 'e8=D'). */
    /** Lance em texto UCI ('e2e4', 'e7e8q'). */
    const uci = m => nomeCasa(deL(m)) + nomeCasa(paraL(m)) + (promoL(m) ? 'nbrq'[promoL(m) - 2] : '');
    Posicao.prototype.lanceDe = function (txt) {
      const leg = this.legais();
      const uci = /^([a-h][1-8])([a-h][1-8])([qrbnQRBN])?$/.exec(txt);
      if (uci) {
        const de = casaDe(uci[1]), para = casaDe(uci[2]);
        const pr = uci[3] ? 'nbrq'.indexOf(uci[3].toLowerCase()) + 2 : 0;
        return leg.find(m => deL(m) === de && paraL(m) === para && promoL(m) === pr) || null;
      }
      const limpo = s => s.replace(/[+#!?]/g, '').replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
      const ingles = s => s.replace(/^N/, 'C').replace(/^Q/, 'D').replace(/^K/, 'R').replace(/^R(?=[a-h1-8x]*[a-h][1-8])/, 'T').replace(/=Q$/, '=D').replace(/=N$/, '=C').replace(/=R$/, '=T');
      const alvo = limpo(txt);
      for (const m of leg) { const s = limpo(this.san(m, leg)); if (s === alvo) return m; }
      const alvoEn = limpo(ingles(txt));
      for (const m of leg) { const s = limpo(this.san(m, leg)); if (s === alvoEn) return m; }
      return null;
    };

    // ---------------------------------------------------------- avaliação
    // PeSTO (Ronald Friederich): tabelas peça-casa de meio-jogo e final, do ponto de vista das brancas (a8..h1)
    const MG_VAL = [0, 82, 337, 365, 477, 1025, 0], EG_VAL = [0, 94, 281, 297, 512, 936, 0];
    const MG = [null,
      [0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14, 13, 6, 21, 23, 12, 17, -23, -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12, -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0],
      [-167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22, -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23],
      [-29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2, -4, 5, 19, 50, 37, 37, 7, -2, -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21],
      [32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16, -24, -11, 7, 26, 24, 35, -8, -20, -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26],
      [-28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57, -27, -27, -16, -16, -1, 17, -2, 1, -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50],
      [-65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22, -17, -20, -12, -27, -30, -25, -14, -36, -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14]];
    const EG = [null,
      [0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84, 32, 24, 13, 5, -2, 4, 17, 17, 13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0],
      [-58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18, -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64],
      [-14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4, -3, 9, 12, 9, 14, 10, 3, 2, -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15, -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17],
      [13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13, 1, 2, 1, -1, 2, 3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20],
      [-9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9, 3, 22, 24, 45, 57, 40, 57, 36, -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5, -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41],
      [-74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13, -8, 22, 24, 27, 26, 33, 26, 3, -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43]];
    const FASE = [0, 0, 1, 1, 2, 4, 0];
    // índice nas tabelas: brancas olham a casa espelhada (a8 = 0); pretas, direto
    const idxB = s => (7 - (s >> 4)) * 8 + (s & 7), idxP = s => (s >> 4) * 8 + (s & 7);
    const TAB_MG = [], TAB_EG = [];
    for (let p = 0; p < 16; p++) {
      TAB_MG.push(new Int16Array(128)); TAB_EG.push(new Int16Array(128));
      const k = tipo(p);
      if (!k || k > 6) continue;
      for (let s = 0; s < 128; s++) {
        if (fora(s)) continue;
        const i = corDe(p) === BRANCO ? idxB(s) : idxP(s);
        TAB_MG[p][s] = MG_VAL[k] + MG[k][i];
        TAB_EG[p][s] = EG_VAL[k] + EG[k][i];
      }
    }
    /** Avaliação estática do ponto de vista de quem joga (centipeões). */
    Posicao.prototype.avaliar = function () {
      const t = this.t;
      let mg = 0, eg = 0, fase = 0, bispos0 = 0, bispos1 = 0;
      for (let s = 0; s < 128; s++) {
        if (fora(s)) { s += 7; continue; }
        const p = t[s]; if (!p) continue;
        const k = tipo(p);
        fase += FASE[k];
        if (corDe(p) === BRANCO) { mg += TAB_MG[p][s]; eg += TAB_EG[p][s]; if (k === BISPO) bispos0++; }
        else { mg -= TAB_MG[p][s]; eg -= TAB_EG[p][s]; if (k === BISPO) bispos1++; }
      }
      if (bispos0 >= 2) { mg += 30; eg += 50; }
      if (bispos1 >= 2) { mg -= 30; eg -= 50; }
      const f = Math.min(24, fase);
      let v = (mg * f + eg * (24 - f)) / 24;
      v = this.lado === BRANCO ? v : -v;
      return Math.round(v) + 10;   // um pouco por ter a vez
    };

    // --------------------------------------------------------------- busca
    const MATE = 30000, INF = 32000;
    const TT_BITS = 20, TT_TAM = 1 << TT_BITS, TT_MASC = TT_TAM - 1;
    let ttChave = null, ttLance, ttValor, ttProf, ttTipo;   // tipo: 1 exato, 2 inferior (beta), 3 superior (alfa)
    function ttCriar() {
      if (ttChave) return;
      ttChave = new Uint32Array(TT_TAM); ttLance = new Int32Array(TT_TAM); ttValor = new Int16Array(TT_TAM); ttProf = new Int8Array(TT_TAM); ttTipo = new Uint8Array(TT_TAM);
    }
    function ttLimpar() { if (ttChave) { ttChave.fill(0); ttTipo.fill(0); } }

    /**
     * Busca o melhor lance. opts: { tempo (ms), profundidade (máx), nos (máx), multi (avaliar todos os lances da raiz), aoProgresso }
     * Devolve { lance, valor (cp, de quem joga), profundidade, nos, pv: [lances], raiz: [{lance, valor}] (com multi), mate (em lances, + ganha / − perde) }.
     */
    function buscar(pos, opts) {
      opts = opts || {};
      ttCriar();
      const inicio = Date.now();
      const limiteT = opts.tempo || 1000, limiteP = opts.profundidade || 64, limiteN = opts.nos || Infinity;
      let nos = 0, parar = false;
      const assassinos = []; for (let i = 0; i < 128; i++) assassinos.push([0, 0]);
      const historico = new Int32Array(16 * 128);
      const listas = []; for (let i = 0; i < 128; i++) listas.push([]);
      const notas = []; for (let i = 0; i < 128; i++) notas.push([]);

      function tempoAcabou() { return (nos & 2047) === 0 && (Date.now() - inicio > limiteT || nos > limiteN); }

      function ordenar(lista, nota, ply, ttM) {
        const t = pos.t;
        for (let i = 0; i < lista.length; i++) {
          const m = lista[i];
          let v;
          if (m === ttM) v = 1e9;
          else if (marcasL(m) & M_CAPT) {
            const vit = marcasL(m) & M_EP ? PEAO : tipo(t[paraL(m)]);
            v = 1e6 + VALOR[vit] * 10 - VALOR[tipo(t[deL(m)])] / 10;
          } else if (promoL(m)) v = 9e5 + promoL(m);
          else if (m === assassinos[ply][0]) v = 8e5;
          else if (m === assassinos[ply][1]) v = 7e5;
          else v = historico[t[deL(m)] * 128 + paraL(m)];
          nota[i] = v;
        }
        // ordenação por seleção feita sob demanda em pegar()
      }
      function pegar(lista, nota, i) {
        let b = i;
        for (let j = i + 1; j < lista.length; j++) if (nota[j] > nota[b]) b = j;
        if (b !== i) { const m = lista[i]; lista[i] = lista[b]; lista[b] = m; const v = nota[i]; nota[i] = nota[b]; nota[b] = v; }
        return lista[i];
      }

      function quiesce(alfa, beta, ply) {
        nos++;
        if (tempoAcabou()) parar = true;
        if (parar) return 0;
        const parado = pos.avaliar();
        if (parado >= beta) return parado;
        if (parado > alfa) alfa = parado;
        if (ply >= 120) return parado;
        const lista = pos.gerar(listas[ply], true), nota = notas[ply];
        ordenar(lista, nota, ply, 0);
        for (let i = 0; i < lista.length; i++) {
          const m = pegar(lista, nota, i);
          // poda delta: nem ganhando a peça chega no alfa
          if (!promoL(m)) {
            const vit = marcasL(m) & M_EP ? PEAO : tipo(pos.t[paraL(m)]);
            if (parado + VALOR[vit] + 200 < alfa) continue;
          }
          if (!pos.fazer(m)) continue;
          const v = -quiesce(-beta, -alfa, ply + 1);
          pos.desfazer();
          if (parar) return 0;
          if (v >= beta) return v;
          if (v > alfa) alfa = v;
        }
        return alfa;
      }

      function busca(prof, alfa, beta, ply, nuloOk) {
        if (ply > 0) {
          if (pos.meio >= 100 || pos.repeticoes() >= 1 || pos.materialInsuficiente()) return 0;
          // distância do mate: não adianta procurar além
          alfa = Math.max(alfa, -MATE + ply); beta = Math.min(beta, MATE - ply - 1);
          if (alfa >= beta) return alfa;
        }
        const xeque = pos.emXeque();
        if (xeque) prof++;
        if (prof <= 0) return quiesce(alfa, beta, ply);
        nos++;
        if (tempoAcabou()) parar = true;
        if (parar) return 0;
        const pv = beta - alfa > 1;
        const idx = pos.h1 & TT_MASC;
        let ttM = 0;
        if (ttChave[idx] === pos.h2 && ttTipo[idx]) {
          ttM = ttLance[idx];
          if (ply > 0 && !pv && ttProf[idx] >= prof) {
            let v = ttValor[idx];
            if (v > MATE - 200) v -= ply; else if (v < -MATE + 200) v += ply;
            if (ttTipo[idx] === 1 || (ttTipo[idx] === 2 && v >= beta) || (ttTipo[idx] === 3 && v <= alfa)) return v;
          }
        }
        // lance nulo: se passar a vez ainda passa do beta, poda
        if (nuloOk && !pv && !xeque && prof >= 3 && ply > 0) {
          let material = 0;
          for (let s = 0; s < 128; s++) { if (fora(s)) { s += 7; continue; } const p = pos.t[s]; if (p && corDe(p) === pos.lado && tipo(p) !== PEAO && tipo(p) !== REI) material++; }
          if (material > 0 && pos.avaliar() >= beta) {
            pos.fazerNulo();
            const v = -busca(prof - 3, -beta, -beta + 1, ply + 1, false);
            pos.desfazerNulo();
            if (parar) return 0;
            if (v >= beta) return v >= MATE - 200 ? beta : v;
          }
        }
        const lista = pos.gerar(listas[ply], false), nota = notas[ply];
        ordenar(lista, nota, ply, ttM);
        let melhor = -INF, melhorM = 0, legais = 0;
        const alfaOrig = alfa;
        for (let i = 0; i < lista.length; i++) {
          const m = pegar(lista, nota, i);
          if (!pos.fazer(m)) continue;
          legais++;
          let v;
          const quieto = !(marcasL(m) & M_CAPT) && !promoL(m);
          if (legais === 1) v = -busca(prof - 1, -beta, -alfa, ply + 1, true);
          else {
            // redução de lances tardios (quietos, sem xeque)
            let r = 0;
            if (quieto && !xeque && prof >= 3 && legais > 3 && !pos.emXeque()) r = legais > 8 ? 2 : 1;
            v = -busca(prof - 1 - r, -alfa - 1, -alfa, ply + 1, true);
            if (v > alfa && r) v = -busca(prof - 1, -alfa - 1, -alfa, ply + 1, true);
            if (v > alfa && v < beta) v = -busca(prof - 1, -beta, -alfa, ply + 1, true);
          }
          pos.desfazer();
          if (parar) return 0;
          if (v > melhor) { melhor = v; melhorM = m; }
          if (v > alfa) {
            alfa = v;
            if (v >= beta) {
              if (quieto) {
                if (assassinos[ply][0] !== m) { assassinos[ply][1] = assassinos[ply][0]; assassinos[ply][0] = m; }
                historico[pos.t[deL(m)] * 128 + paraL(m)] += prof * prof;
              }
              break;
            }
          }
        }
        if (!legais) return xeque ? -MATE + ply : 0;
        // guarda na tabela
        let vg = melhor;
        if (vg > MATE - 200) vg += ply; else if (vg < -MATE + 200) vg -= ply;
        ttChave[idx] = pos.h2; ttLance[idx] = melhorM; ttValor[idx] = vg; ttProf[idx] = prof;
        ttTipo[idx] = melhor >= beta ? 2 : melhor > alfaOrig ? 1 : 3;
        return melhor;
      }

      // raiz: aprofundamento iterativo
      const raiz = pos.legais();
      if (!raiz.length) return { lance: 0, valor: pos.emXeque() ? -MATE : 0, profundidade: 0, nos: 0, pv: [], raiz: [] };
      let melhorLance = raiz[0], melhorValor = 0, profFeita = 0;
      const valoresRaiz = new Map();
      for (let prof = 1; prof <= limiteP; prof++) {
        let alfa = -INF, beta = INF;
        // ordena a raiz pelo resultado anterior
        raiz.sort((a, b) => (valoresRaiz.get(b) ?? -INF) - (valoresRaiz.get(a) ?? -INF) || (b === melhorLance) - (a === melhorLance));
        let melhorAqui = -INF, lanceAqui = raiz[0];
        const novos = new Map();
        for (let i = 0; i < raiz.length; i++) {
          const m = raiz[i];
          pos.fazer(m);
          let v;
          if (opts.multi) v = -busca(prof - 1, -INF, INF, 1, true);
          else if (i === 0) v = -busca(prof - 1, -beta, -alfa, 1, true);
          else {
            v = -busca(prof - 1, -alfa - 1, -alfa, 1, true);
            if (v > alfa && !parar) v = -busca(prof - 1, -beta, -alfa, 1, true);
          }
          pos.desfazer();
          if (parar) break;
          novos.set(m, v);
          if (v > melhorAqui) { melhorAqui = v; lanceAqui = m; }
          if (v > alfa) alfa = v;
        }
        if (parar && prof > 1) {
          // iteração incompleta: o lance anterior foi o primeiro a ser visto; se outro já passou dele, fica o novo
          if (novos.has(melhorLance) && lanceAqui !== melhorLance && melhorAqui > novos.get(melhorLance)) { melhorLance = lanceAqui; melhorValor = melhorAqui; }
          break;
        }
        novos.forEach((v, m) => valoresRaiz.set(m, v));
        melhorLance = lanceAqui; melhorValor = melhorAqui; profFeita = prof;
        if (opts.aoProgresso) opts.aoProgresso({ profundidade: prof, valor: melhorValor, lance: melhorLance, nos, ms: Date.now() - inicio });
        if (Math.abs(melhorValor) > MATE - 200 && prof > (MATE - Math.abs(melhorValor)) + 2) break;   // mate achado com folga
        if (Date.now() - inicio > limiteT * 0.55) break;   // a próxima iteração não termina a tempo
        if (nos > limiteN) break;
      }
      // variação principal pela tabela
      const pv = [];
      let n = 0;
      for (let m = melhorLance; m && n < 12; n++) {
        if (!pos.legais().includes(m)) break;
        pv.push(m); pos.fazer(m);
        const idx = pos.h1 & TT_MASC;
        m = ttChave[idx] === pos.h2 ? ttLance[idx] : 0;
      }
      for (let i = 0; i < pv.length; i++) pos.desfazer();
      const mate = Math.abs(melhorValor) > MATE - 200 ? Math.sign(melhorValor) * Math.ceil((MATE - Math.abs(melhorValor)) / 2) : 0;
      return {
        lance: melhorLance, valor: melhorValor, profundidade: profFeita, nos, ms: Date.now() - inicio, pv, mate,
        raiz: Array.from(valoresRaiz.entries()).map(([lance, valor]) => ({ lance, valor })).sort((a, b) => b.valor - a.valor)
      };
    }

    // ------------------------------------------------------------- perft
    function perft(pos, prof) {
      if (prof === 0) return 1;
      const lista = pos.gerar([]);
      let n = 0;
      for (const m of lista) { if (!pos.fazer(m)) continue; n += prof === 1 ? 1 : perft(pos, prof - 1); pos.desfazer(); }
      return n;
    }

    Object.assign(X, {
      VAZIO, PEAO, CAVALO, BISPO, TORRE, DAMA, REI, BRANCO, PRETO, VALOR, LETRA_PT, FEN_INICIAL, MATE,
      M_CAPT, M_EP, M_ROQUE, M_DUPLO,
      tipo, corDe, nomeCasa, casaDe, fora, deL, paraL, promoL, marcasL, lance, uci,
      Posicao, buscar, perft, ttLimpar, novaPosicao: fen => new Posicao(fen)
    });

    // -------------------------------------------------------------- worker
    if (emWorker) {
      self.onmessage = e => {
        const d = e.data;
        try {
          if (d.tipo === 'limpar') { ttLimpar(); self.postMessage({ id: d.id, ok: true }); return; }
          const pos = new Posicao(d.fen);
          (d.lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
          const r = buscar(pos, Object.assign({}, d.opts, { aoProgresso: null }));
          self.postMessage({ id: d.id, ok: true, r });
        } catch (err) { self.postMessage({ id: d.id, ok: false, erro: String(err && err.stack || err) }); }
      };
    }
    return X;
  }

  const X = P.Xadrez = P.Xadrez || {};
  nucleo(X, false);
  X.fonteNucleo = nucleo;
})(window.Poker = window.Poker || {});
