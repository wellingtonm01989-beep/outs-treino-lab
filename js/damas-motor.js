/* ==========================================================================
   OUTS · Treino Lab — damas-motor.js
   Damas brasileiras (regras da Confederação Brasileira de Damas):
   - tabuleiro de 64 casas, 12 pedras para cada um nas casas escuras; a
     grande diagonal (escura) fica à esquerda de cada jogador; as brancas
     começam;
   - a pedra anda uma casa na diagonal, só para frente; captura para frente
     e para trás;
   - a captura é obrigatória e vale a lei da maioria: entre as capturas
     possíveis, é obrigatório fazer a que come mais peças (pedra e dama valem
     o mesmo); as peças comidas só saem no fim do lance e não podem ser
     saltadas duas vezes;
   - a pedra que chega à última fila vira dama — se só passar por ela no
     meio de uma captura e continuar comendo, segue como pedra;
   - a dama anda e captura em qualquer distância na diagonal (para frente e
     para trás) e, depois de comer, pode parar em qualquer casa livre depois
     da peça comida;
   - perde quem fica sem peças ou sem lance; empate depois de 20 lances
     seguidos de damas (de cada lado) sem captura nem movimento de pedra, em
     5 lances nos finais de 2 damas × 2 damas, 2 × 1, 2 × 1 + pedra, 1 × 1 e
     1 × 1 + pedra, e na repetição da mesma posição 3 vezes.

   O núcleo (regras + busca) fica numa função que também roda dentro de um
   Web Worker (o bot pensa sem travar a tela): D.fonteNucleo.
   Casas: índice r*8 + c (r = 0 é a fileira de baixo, a das brancas; c = 0 é a
   coluna a). Peça: 1 pedra branca, 2 dama branca, -1 pedra preta, -2 dama preta.
   Lance: { de, para, cam (casas por onde passa, da origem ao destino), capt
   (casas das peças comidas), promove }; em texto, "c3-d4" ou "c3xe5xg7".
   ========================================================================== */
(function (P) {
  'use strict';

  function nucleo(D, emWorker) {
    const BRANCO = 1, PRETO = -1;
    const DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const nomeCasa = s => 'abcdefgh'[s & 7] + ((s >> 3) + 1);
    const casaDe = t => (t.charCodeAt(1) - 49) * 8 + (t.charCodeAt(0) - 97);
    const escura = s => (((s >> 3) + (s & 7)) & 1) === 0;
    // raios: as casas em cada diagonal a partir de s
    const RAIO = [];
    for (let s = 0; s < 64; s++) {
      RAIO[s] = DIRS.map(([dr, dc]) => {
        const l = [];
        let r = (s >> 3) + dr, c = (s & 7) + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) { l.push(r * 8 + c); r += dr; c += dc; }
        return l;
      });
    }
    // as 32 casas escuras e, para cada uma, a vizinha e a casa logo depois em cada diagonal (-1 = fora)
    const ESC = [];
    for (let s = 0; s < 64; s++) if (escura(s)) ESC.push(s);
    const VIZ = new Int8Array(256).fill(-1), VIZ2 = new Int8Array(256).fill(-1);
    for (let s = 0; s < 64; s++) for (let d = 0; d < 4; d++) { const r = RAIO[s][d]; if (r.length) VIZ[s * 4 + d] = r[0]; if (r.length > 1) VIZ2[s * 4 + d] = r[1]; }
    // Zobrist (sorteio fixo: o mesmo na página e no worker)
    let semente = 0x9e3779b9;
    const aleat = () => { semente ^= semente << 13; semente ^= semente >>> 17; semente ^= semente << 5; return semente >>> 0; };
    const Z = {};
    [1, 2, -1, -2].forEach(v => { Z[v] = new Uint32Array(64); for (let s = 0; s < 64; s++) Z[v][s] = aleat(); });
    const Z_LADO = aleat();

    function inicial() {
      const t = new Int8Array(64);
      for (let s = 0; s < 64; s++) {
        if (!escura(s)) continue;
        const r = s >> 3;
        if (r <= 2) t[s] = 1; else if (r >= 5) t[s] = -1;
      }
      return t;
    }

    class Posicao {
      constructor(t, lado) {
        this.t = t ? Int8Array.from(t) : inicial();
        this.lado = lado || BRANCO;
        this.semCaptura = 0;      // meios-lances seguidos só de damas, sem captura
        this.noFinal = 0;         // meios-lances num dos finais de empate em 5 lances
        this.pilha = [];
        this.n = { 1: 0, 2: 0, '-1': 0, '-2': 0 };
        for (let s = 0; s < 64; s++) if (this.t[s]) this.n[this.t[s]]++;
        this.hash = this.calcHash();
        this.vistas = new Map([[this.hash, 1]]);
      }
      calcHash() { let h = this.lado === BRANCO ? 0 : Z_LADO; for (let s = 0; s < 64; s++) if (this.t[s]) h ^= Z[this.t[s]][s]; return h >>> 0; }
      clone() {
        const p = new Posicao(this.t, this.lado);
        p.semCaptura = this.semCaptura; p.noFinal = this.noFinal; p.vistas = new Map(this.vistas); p.hash = this.hash;
        p.n = Object.assign({}, this.n);
        return p;
      }
      /** Capturas de cada peça do lado; só as que comem o máximo (lei da maioria). */
      capturas() {
        const t = this.t, cor = this.lado;
        let todas = [];
        for (const s of ESC) if (t[s] * cor > 0) capturasDe(t, s, cor, todas);
        if (!todas.length) return todas;
        let max = 0;
        todas.forEach(m => { if (m.capt.length > max) max = m.capt.length; });
        todas = todas.filter(m => m.capt.length === max);
        // a mesma captura por caminhos diferentes (mesma origem, destino e peças comidas) conta uma vez
        const vistos = new Set();
        return todas.filter(m => { const k = m.de + '>' + m.para + ':' + m.capt.slice().sort((a, b) => a - b).join(','); if (vistos.has(k)) return false; vistos.add(k); return true; });
      }
      legais() {
        const cap = this.temCaptura() ? this.capturas() : [];
        const t = this.t, cor = this.lado;
        const fim = cor === BRANCO ? 7 : 0;
        if (cap.length) { cap.forEach(m => { m.promove = Math.abs(t[m.de]) === 1 && (m.para >> 3) === fim; }); return cap; }
        const out = [];
        for (const s of ESC) {
          const v = t[s];
          if (v * cor <= 0) continue;
          if (Math.abs(v) === 1) {
            const dirs = cor === BRANCO ? [0, 1] : [2, 3];
            for (const d of dirs) { const q = RAIO[s][d][0]; if (q !== undefined && !t[q]) out.push({ de: s, para: q, cam: [s, q], capt: [], promove: (q >> 3) === fim }); }
          } else {
            for (let d = 0; d < 4; d++) for (const q of RAIO[s][d]) { if (t[q]) break; out.push({ de: s, para: q, cam: [s, q], capt: [], promove: false }); }
          }
        }
        return out;
      }
      temCaptura() {
        const t = this.t, cor = this.lado;
        for (let i = 0; i < 32; i++) {
          const s = ESC[i], v = t[s];
          if (v * cor <= 0) continue;
          if (v === cor) {
            for (let d = 0; d < 4; d++) { const q = VIZ2[s * 4 + d]; if (q >= 0 && !t[q] && t[VIZ[s * 4 + d]] * cor < 0) return true; }
          } else {
            for (let d = 0; d < 4; d++) {
              let q = VIZ[s * 4 + d];
              while (q >= 0 && !t[q]) q = VIZ[q * 4 + d];
              if (q >= 0 && t[q] * cor < 0) { const w = VIZ[q * 4 + d]; if (w >= 0 && !t[w]) return true; }
            }
          }
        }
        return false;
      }
      fazer(m) {
        const t = this.t;
        const v = t[m.de];
        const comidas = m.capt.map(s => t[s]);
        const desfazer = { m, v, comidas, semCaptura: this.semCaptura, noFinal: this.noFinal, hash: this.hash };
        this.pilha.push(desfazer);
        let h = this.hash ^ Z[v][m.de];
        t[m.de] = 0;
        const n = this.n;
        for (let i = 0; i < m.capt.length; i++) { const s = m.capt[i]; h ^= Z[comidas[i]][s]; n[comidas[i]]--; t[s] = 0; }
        const nv = m.promove ? 2 * Math.sign(v) : v;
        if (nv !== v) { n[v]--; n[nv]++; }
        t[m.para] = nv;
        h ^= Z[nv][m.para];
        h ^= Z_LADO;
        this.hash = h >>> 0;
        this.lado = -this.lado;
        // empates: lances só de damas sem captura; finais de 5 lances
        this.semCaptura = m.capt.length || Math.abs(v) === 1 ? 0 : this.semCaptura + 1;
        this.noFinal = finalDeEmpate(n) ? this.noFinal + 1 : 0;
        this.vistas.set(this.hash, (this.vistas.get(this.hash) || 0) + 1);
      }
      desfazer() {
        const u = this.pilha.pop();
        if (!u) return;
        const t = this.t, m = u.m;
        const c = this.vistas.get(this.hash);
        if (c > 1) this.vistas.set(this.hash, c - 1); else this.vistas.delete(this.hash);
        const n = this.n;
        if (t[m.para] !== u.v) { n[t[m.para]]--; n[u.v]++; }
        t[m.para] = 0;
        t[m.de] = u.v;
        for (let i = 0; i < m.capt.length; i++) { t[m.capt[i]] = u.comidas[i]; n[u.comidas[i]]++; }
        this.lado = -this.lado;
        this.semCaptura = u.semCaptura; this.noFinal = u.noFinal; this.hash = u.hash;
      }
      /** { fim, vencedor (1/-1/0), motivo } */
      situacao() {
        if (!this.legais().length) return { fim: true, vencedor: -this.lado, motivo: contar(this.t, this.lado) ? 'bloqueado' : 'sem peças' };
        if (this.semCaptura >= 40) return { fim: true, vencedor: 0, motivo: '20 lances de damas' };
        if (this.noFinal >= 10) return { fim: true, vencedor: 0, motivo: 'final de damas (5 lances)' };
        if ((this.vistas.get(this.hash) || 0) >= 3) return { fim: true, vencedor: 0, motivo: 'repetição' };
        return { fim: false };
      }
      lanceDe(txt) { return this.legais().find(m => texto(m) === txt) || null; }
    }
    const contar = (t, cor) => { let n = 0; for (let s = 0; s < 64; s++) if (t[s] * cor > 0) n++; return n; };
    /** Os finais que viram empate em 5 lances: só damas de um lado (1 ou 2) contra 1 ou 2 damas (+ no máximo 1 pedra). */
    function finalDeEmpate(n) {
      if (n[1] + n[2] + n[-1] + n[-2] > 4) return false;
      const ok = (dA, pA, dB, pB) => pA === 0 && ((dA === 2 && dB === 2 && pB === 0) || (dA === 2 && dB === 1 && pB <= 1) || (dA === 1 && dB === 1 && pB <= 1));
      return ok(n[2], n[1], n[-2], n[-1]) || ok(n[-2], n[-1], n[2], n[1]);
    }
    /** Capturas a partir de s (em profundidade): as peças comidas continuam no tabuleiro (bloqueiam) até o fim do lance. */
    const marcado = new Uint8Array(64);   // peças já comidas no lance (a busca desmarca ao voltar)
    function capturasDe(t, s, cor, out) {
      const v = t[s];
      const dama = Math.abs(v) === 2;
      const capt = [], cam = [s];
      t[s] = 0;
      const dfs = pos => {
        let seguiu = false;
        for (let d = 0; d < 4; d++) {
          const raio = RAIO[pos][d];
          if (dama) {
            let i = 0;
            while (i < raio.length && !t[raio[i]]) i++;
            if (i + 1 >= raio.length) continue;
            const alvo = raio[i];
            if (marcado[alvo] || t[alvo] * cor > 0 || t[raio[i + 1]]) continue;
            marcado[alvo] = 1; capt.push(alvo);
            for (let k = i + 1; k < raio.length && !t[raio[k]]; k++) { cam.push(raio[k]); seguiu = true; dfs(raio[k]); cam.pop(); }
            capt.pop(); marcado[alvo] = 0;
          } else {
            if (raio.length < 2) continue;
            const alvo = raio[0], dest = raio[1];
            if (t[alvo] * cor < 0 && !marcado[alvo] && !t[dest]) {
              marcado[alvo] = 1; capt.push(alvo); cam.push(dest); seguiu = true;
              dfs(dest);
              cam.pop(); capt.pop(); marcado[alvo] = 0;
            }
          }
        }
        if (!seguiu && capt.length) out.push({ de: s, para: pos, cam: cam.slice(), capt: capt.slice() });
      };
      dfs(s);
      t[s] = v;
    }
    const texto = m => m.cam.map(nomeCasa).join(m.capt.length ? 'x' : '-');

    // ================================================================ avaliação
    // pontos: pedra 100, dama 330; pedras avançadas valem mais; segurar a última fila
    // (enquanto o outro tem pedras) e o centro; dama na grande diagonal (a1-h8)
    const AVANCO = [0, 2, 5, 9, 14, 21, 30, 0];
    const CENTRO = new Int8Array(64);
    [27, 28, 35, 36].forEach(s => { CENTRO[s] = 6; });
    [18, 20, 21, 26, 29, 34, 37, 42, 43, 45].forEach(s => { CENTRO[s] = 3; });
    const GRANDE = new Uint8Array(64);
    for (let k = 0; k < 8; k++) GRANDE[k * 9] = 1;
    function avaliar(pos) {
      const t = pos.t;
      let v = 0, pb = 0, pp = 0, db = 0, dp = 0;
      for (let i = 0; i < 32; i++) {
        const s = ESC[i], x = t[s];
        if (!x) continue;
        const r = s >> 3;
        if (x === 1) { pb++; v += 100 + AVANCO[r] + CENTRO[s]; if (r === 0) v += 5; }
        else if (x === -1) { pp++; v -= 100 + AVANCO[7 - r] + CENTRO[s]; if (r === 7) v -= 5; }
        else if (x === 2) { db++; v += 330 + (GRANDE[s] ? 18 : 0); }
        else { dp++; v -= 330 + (GRANDE[s] ? 18 : 0); }
      }
      // sem pedras do outro, segurar a última fila não vale mais
      if (!pp) for (const s of [0, 2, 4, 6]) if (t[s] === 1) v -= 5;
      if (!pb) for (const s of [57, 59, 61, 63]) if (t[s] === -1) v += 5;
      // trocar quando está na frente: menos peças, mais vantagem
      const total = pb + pp + db + dp;
      const mat = (pb - pp) * 100 + (db - dp) * 330;
      if (mat > 0) v += Math.round(mat * (24 - total) / 60);
      else if (mat < 0) v += Math.round(mat * (24 - total) / 60);
      return pos.lado === BRANCO ? v : -v;
    }

    // ================================================================ busca
    const MATE = 30000;
    /**
     * Busca alfa-beta com aprofundamento iterativo. opts: { tempo (ms), profundidade, nos, margemRaiz }.
     * Devolve { lance (texto), valor (do lado que joga), profundidade, nos, ms, pv, raiz: [{ lance, valor }] }.
     * Sem margemRaiz, todos os lances da raiz têm o valor exato (o coach dá nota a qualquer lance); com
     * ela, os que ficam abaixo de (melhor − margem) só são provados piores (o valor é um teto) — mais rápido.
     */
    function buscar(pos, opts) {
      opts = opts || {};
      const t0 = Date.now(), limite = opts.tempo || 1000, profMax = opts.profundidade || 64, nosMax = opts.nos || Infinity;
      const tt = new Map();
      const historia = new Int32Array(64 * 64);
      let nos = 0, parar = false;
      const raiz = pos.legais();
      if (!raiz.length) return { lance: null, valor: -MATE, profundidade: 0, nos: 0, ms: 0, pv: [], raiz: [] };
      if (raiz.length === 1 && !opts.dentroDoUnico) {
        // lance único: não há o que escolher, mas avalia a posição depois dele (para o coach e a barra)
        const u = texto(raiz[0]);
        pos.fazer(raiz[0]);
        const sit = pos.legais().length ? null : -MATE + 1;
        const f = sit === null ? buscar(pos, Object.assign({}, opts, { tempo: Math.max(60, limite * 0.35), dentroDoUnico: true })) : null;
        pos.desfazer();
        const valor = f ? -f.valor : -sit;
        return { lance: u, valor, profundidade: f ? f.profundidade + 1 : 1, nos: f ? f.nos : 1, ms: Date.now() - t0, pv: [u].concat(f ? f.pv : []), raiz: [{ lance: u, valor }], unico: true };
      }
      const chaveL = m => m.de | (m.para << 6) | (m.capt.length << 12);
      const ordenar = (ms, melhorTT) => {
        ms.forEach(m => { m._o = (chaveL(m) === melhorTT ? 1e7 : 0) + m.capt.length * 1000 + (m.promove ? 900 : 0) + historia[m.de * 64 + m.para]; });
        ms.sort((a, b) => b._o - a._o);
      };
      function ab(prof, alfa, beta, ply) {
        if ((++nos & 1023) === 0 && (Date.now() - t0 > limite || nos > nosMax)) parar = true;
        if (parar) return 0;
        // empates
        if (ply && (pos.semCaptura >= 40 || pos.noFinal >= 10 || (pos.vistas.get(pos.hash) || 0) >= 2)) return 0;
        // captura obrigatória: não para de olhar no meio de uma troca
        if (prof <= 0 && (ply > 40 || !pos.temCaptura())) return avaliar(pos);
        const ms = pos.legais();
        if (!ms.length) return -MATE + ply;
        const chave = pos.hash;
        const e = tt.get(chave);
        if (e && e.prof >= prof && ply) {
          if (e.tipo === 0) return e.valor;
          if (e.tipo === 1 && e.valor >= beta) return e.valor;
          if (e.tipo === 2 && e.valor <= alfa) return e.valor;
        }
        ordenar(ms, e && e.melhor);
        let melhor = -Infinity, melhorLance = null;
        const alfa0 = alfa;
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i];
          pos.fazer(m);
          // lance único (capturas forçadas) não gasta profundidade
          const v = -ab(ms.length === 1 ? prof : prof - 1, -beta, -alfa, ply + 1);
          pos.desfazer();
          if (parar) return 0;
          if (v > melhor) { melhor = v; melhorLance = m; }
          if (v > alfa) alfa = v;
          if (alfa >= beta) { if (!m.capt.length) historia[m.de * 64 + m.para] += prof * prof; break; }
        }
        if (tt.size > 400000) tt.clear();
        tt.set(chave, { prof, valor: melhor, tipo: melhor <= alfa0 ? 2 : melhor >= beta ? 1 : 0, melhor: melhorLance ? chaveL(melhorLance) : -1, m: melhorLance });
        return melhor;
      }
      let resultado = null, notas = raiz.map(m => ({ lance: texto(m), valor: 0, m }));
      const margem = opts.margemRaiz === undefined ? Infinity : opts.margemRaiz;
      for (let prof = 1; prof <= profMax; prof++) {
        const novas = [];
        let melhorAqui = -Infinity;
        for (const n of notas) {
          pos.fazer(n.m);
          const piso = melhorAqui > -Infinity && margem < Infinity ? melhorAqui - margem - 1 : -MATE - 1;
          const v = -ab(prof - 1, -MATE - 1, -piso, 1);
          if (v > melhorAqui) melhorAqui = v;
          pos.desfazer();
          if (parar) break;
          novas.push({ lance: n.lance, valor: v, m: n.m });
        }
        if (parar && novas.length < notas.length) {
          // a profundidade não terminou: aproveita só se o melhor já mudou
          if (novas.length && resultado && novas.some(x => x.valor > resultado.valor + 30)) {
            const m = novas.reduce((a, b) => (b.valor > a.valor ? b : a));
            resultado = Object.assign({}, resultado, { lance: m.lance, valor: m.valor });
          }
          break;
        }
        novas.sort((a, b) => b.valor - a.valor);
        notas = novas;
        resultado = { lance: notas[0].lance, valor: notas[0].valor, profundidade: prof };
        if (Math.abs(notas[0].valor) > MATE - 200) break;
        if (Date.now() - t0 > limite * 0.55) break;
      }
      // a linha principal (pela tabela)
      const pv = [];
      const p2 = pos.clone();
      for (let k = 0; k < 10; k++) {
        const e = tt.get(p2.hash);
        const lance = k === 0 ? resultado.lance : e && e.m && texto(e.m);
        const m = lance && p2.lanceDe(lance);
        if (!m) break;
        pv.push(lance);
        p2.fazer(m);
      }
      return { lance: resultado.lance, valor: resultado.valor, profundidade: resultado.profundidade, nos, ms: Date.now() - t0, pv, raiz: notas.map(n => ({ lance: n.lance, valor: n.valor })) };
    }

    /** Conta os lances até a profundidade (para testar o gerador). */
    function contarLances(pos, prof) {
      if (prof === 0) return 1;
      let n = 0;
      for (const m of pos.legais()) { pos.fazer(m); n += contarLances(pos, prof - 1); pos.desfazer(); }
      return n;
    }

    Object.assign(D, { BRANCO, PRETO, Posicao, buscar, avaliar, texto, nomeCasa, casaDe, escura, contarLances, MATE, inicial });

    if (emWorker) {
      self.onmessage = e => {
        const { id, lances, opts, tabuleiro, lado } = e.data;
        try {
          const pos = new Posicao(tabuleiro || null, lado || BRANCO);
          (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
          self.postMessage({ id, ok: true, r: buscar(pos, opts) });
        } catch (err) { self.postMessage({ id, ok: false, erro: String(err && err.message || err) }); }
      };
    }
    return D;
  }

  const D = P.Damas = P.Damas || {};
  nucleo(D, false);
  D.fonteNucleo = nucleo;
})(window.Poker = window.Poker || {});
