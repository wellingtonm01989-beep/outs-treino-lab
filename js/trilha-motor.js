/* ==========================================================================
   OUTS · Treino Lab — trilha-motor.js
   Trilha (o jogo do moinho, "nove em linha"):
   - tabuleiro de três quadrados, um dentro do outro, ligados pelo meio dos
     lados: 24 casas; cada jogador tem 9 peças; as brancas começam;
   - 1ª fase: cada um coloca uma peça por vez numa casa vazia;
   - 2ª fase (todas colocadas): move uma peça para uma casa vizinha vazia,
     seguindo as linhas;
   - fechar uma trilha (três peças suas numa linha) tira uma peça do
     adversário — que não pode estar numa trilha, a não ser que todas
     estejam; fechar duas de uma vez tira uma só;
   - opção "voar": quem fica com 3 peças pode mover para qualquer casa vazia;
   - perde quem fica com menos de 3 peças ou sem lance; empate depois de
     50 meios-lances seguidos sem ninguém tirar peça (na 2ª fase) ou na
     repetição da mesma posição 3 vezes.

   O núcleo (regras + busca) roda também dentro de um Web Worker: T.fonteNucleo.
   Casas: 0..23 (de cima para baixo, da esquerda para a direita, num
   quadriculado 7×7 com colunas a–g e linhas 7–1). Lance: { de (-1 ao
   colocar), para, tira (-1 se não fecha trilha) }; em texto "d7", "a7-d7",
   com a peça tirada depois do x: "d7xa4", "a7-d7xg4".
   ========================================================================== */
(function (P) {
  'use strict';

  function nucleo(T, emWorker) {
    const BRANCO = 1, PRETO = -1, PECAS = 9, LIMITE_SEM_TIRAR = 50;
    const NOMES = ['a7', 'd7', 'g7', 'b6', 'd6', 'f6', 'c5', 'd5', 'e5', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'c3', 'd3', 'e3', 'b2', 'd2', 'f2', 'a1', 'd1', 'g1'];
    const VIZ = [[1, 9], [0, 2, 4], [1, 14], [4, 10], [1, 3, 5, 7], [4, 13], [7, 11], [4, 6, 8], [7, 12], [0, 10, 21], [3, 9, 11, 18], [6, 10, 15],
      [8, 13, 17], [5, 12, 14, 20], [2, 13, 23], [11, 16], [15, 17, 19], [12, 16], [10, 19], [16, 18, 20, 22], [13, 19], [9, 22], [19, 21, 23], [14, 22]];
    const TRILHAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
      [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]];
    const DA_CASA = NOMES.map((_, s) => TRILHAS.filter(l => l.indexOf(s) >= 0));
    const casaDe = txt => NOMES.indexOf(txt);
    const nomeCasa = s => NOMES[s];

    // Zobrist (sorteio fixo: o mesmo na página e no worker)
    let semente = 0x2545f491;
    const aleat = () => { semente ^= semente << 13; semente ^= semente >>> 17; semente ^= semente << 5; return semente >>> 0; };
    const Z = { 1: [], '-1': [] };
    for (let s = 0; s < 24; s++) { Z[1][s] = aleat(); Z[-1][s] = aleat(); }
    const Z_MAO = { 1: [], '-1': [] };
    for (let k = 0; k <= PECAS; k++) { Z_MAO[1][k] = aleat(); Z_MAO[-1][k] = aleat(); }
    const Z_LADO = aleat();

    /** A casa s (com a peça cor) está numa trilha? */
    function emTrilha(t, s, cor) {
      const ls = DA_CASA[s];
      for (let i = 0; i < ls.length; i++) { const l = ls[i]; if (t[l[0]] === cor && t[l[1]] === cor && t[l[2]] === cor) return true; }
      return false;
    }

    class Posicao {
      constructor(t, lado, mao, opcoes) {
        this.t = t ? Int8Array.from(t) : new Int8Array(24);
        this.lado = lado || BRANCO;
        this.mao = mao ? { 1: mao[1], '-1': mao[-1] } : { 1: PECAS, '-1': PECAS };
        this.opcoes = Object.assign({ voar: true }, opcoes || {});
        this.n = { 1: 0, '-1': 0 };
        for (let s = 0; s < 24; s++) if (this.t[s]) this.n[this.t[s]]++;
        this.semTirar = 0;
        this.pilha = [];
        this.hash = this.calcHash();
        this.vistas = new Map([[this.hash, 1]]);
      }
      calcHash() {
        let h = (this.lado === BRANCO ? 0 : Z_LADO) ^ Z_MAO[1][this.mao[1]] ^ Z_MAO[-1][this.mao[-1]];
        for (let s = 0; s < 24; s++) if (this.t[s]) h ^= Z[this.t[s]][s];
        return h >>> 0;
      }
      clone() {
        const p = new Posicao(this.t, this.lado, this.mao, this.opcoes);
        p.semTirar = this.semTirar; p.vistas = new Map(this.vistas); p.hash = this.hash;
        return p;
      }
      /** Fase de quem joga: 'colocar', 'mover' ou 'voar'. */
      fase(cor) {
        cor = cor || this.lado;
        if (this.mao[cor] > 0) return 'colocar';
        return this.opcoes.voar && this.n[cor] === 3 ? 'voar' : 'mover';
      }
      /** Peças do adversário que podem sair (fora de trilha; se todas estão em trilha, qualquer uma). */
      removiveis(cor) {
        const t = this.t, out = [], todas = [];
        for (let s = 0; s < 24; s++) if (t[s] === cor) { todas.push(s); if (!emTrilha(t, s, cor)) out.push(s); }
        return out.length ? out : todas;
      }
      legais() {
        const t = this.t, cor = this.lado, out = [];
        const fase = this.fase(cor);
        let tiraveis = null;
        const add = (de, para) => {
          if (de >= 0) t[de] = 0;
          t[para] = cor;
          const fecha = emTrilha(t, para, cor);
          t[para] = 0;
          if (de >= 0) t[de] = cor;
          if (!fecha) { out.push({ de, para, tira: -1 }); return; }
          if (!tiraveis) tiraveis = this.removiveis(-cor);
          if (!tiraveis.length) out.push({ de, para, tira: -1, fecha: true });
          else tiraveis.forEach(x => out.push({ de, para, tira: x, fecha: true }));
        };
        if (fase === 'colocar') { for (let s = 0; s < 24; s++) if (!t[s]) add(-1, s); }
        else if (fase === 'voar') { for (let s = 0; s < 24; s++) if (t[s] === cor) for (let q = 0; q < 24; q++) if (!t[q]) add(s, q); }
        else for (let s = 0; s < 24; s++) if (t[s] === cor) { const v = VIZ[s]; for (let i = 0; i < v.length; i++) if (!t[v[i]]) add(s, v[i]); }
        return out;
      }
      fazer(m) {
        const t = this.t, cor = this.lado;
        const u = { m, semTirar: this.semTirar, hash: this.hash };
        this.pilha.push(u);
        let h = this.hash ^ Z_LADO;
        if (m.de >= 0) { t[m.de] = 0; h ^= Z[cor][m.de]; }
        else { h ^= Z_MAO[cor][this.mao[cor]]; this.mao[cor]--; h ^= Z_MAO[cor][this.mao[cor]]; this.n[cor]++; }
        t[m.para] = cor; h ^= Z[cor][m.para];
        if (m.tira >= 0) { t[m.tira] = 0; h ^= Z[-cor][m.tira]; this.n[-cor]--; }
        this.hash = h >>> 0;
        this.lado = -cor;
        const segunda = !this.mao[1] && !this.mao[-1];
        this.semTirar = m.tira >= 0 || !segunda ? 0 : this.semTirar + 1;
        this.vistas.set(this.hash, (this.vistas.get(this.hash) || 0) + 1);
      }
      desfazer() {
        const u = this.pilha.pop();
        if (!u) return;
        const c = this.vistas.get(this.hash);
        if (c > 1) this.vistas.set(this.hash, c - 1); else this.vistas.delete(this.hash);
        const t = this.t, m = u.m, cor = -this.lado;
        if (m.tira >= 0) { t[m.tira] = -cor; this.n[-cor]++; }
        t[m.para] = 0;
        if (m.de >= 0) t[m.de] = cor; else { this.mao[cor]++; this.n[cor]--; }
        this.lado = cor;
        this.semTirar = u.semTirar; this.hash = u.hash;
      }
      total(cor) { return this.n[cor] + this.mao[cor]; }
      /** { fim, vencedor (1/-1/0), motivo } */
      situacao() {
        const cor = this.lado;
        if (this.total(cor) < 3) return { fim: true, vencedor: -cor, motivo: 'poucas peças' };
        if (!this.legais().length) return { fim: true, vencedor: -cor, motivo: 'bloqueado' };
        if (this.semTirar >= LIMITE_SEM_TIRAR) return { fim: true, vencedor: 0, motivo: '50 lances sem tirar peça' };
        if ((this.vistas.get(this.hash) || 0) >= 3) return { fim: true, vencedor: 0, motivo: 'repetição' };
        return { fim: false };
      }
      lanceDe(txt) { return this.legais().find(m => texto(m) === txt) || null; }
    }
    const texto = m => (m.de >= 0 ? NOMES[m.de] + '-' : '') + NOMES[m.para] + (m.tira >= 0 ? 'x' + NOMES[m.tira] : '');

    // ================================================================ avaliação
    // material (peças no tabuleiro e na mão) e o que a busca não enxerga: trilhas fechadas — na
    // 2ª fase, a que tem uma peça com casa livre ao lado abre e fecha de novo (o "moinho") —,
    // trilhas por fechar (duas peças e a casa vazia, se dá para chegar nela), mobilidade e peças
    // presas; quem anda casa a casa e não tem lance está perdido.
    function avaliar(pos) {
      const t = pos.t;
      let v = (pos.total(1) - pos.total(-1)) * 120;
      const fases = { 1: pos.fase(1), '-1': pos.fase(-1) };
      for (let i = 0; i < 16; i++) {
        const l = TRILHAS[i];
        const a = t[l[0]], b = t[l[1]], c = t[l[2]];
        const soma = a + b + c, vazias = (a ? 0 : 1) + (b ? 0 : 1) + (c ? 0 : 1);
        if (soma === 3 || soma === -3) {
          const cor = soma / 3, f = fases[cor];
          v += cor * 30;
          if (f === 'mover') {
            let abre = false;
            for (let k = 0; k < 3 && !abre; k++) { const vz = VIZ[l[k]]; for (let q = 0; q < vz.length; q++) if (!t[vz[q]] && l.indexOf(vz[q]) < 0) { abre = true; break; } }
            if (abre) v += cor * 45;
          } else if (f === 'voar') v += cor * 20;
        } else if (vazias === 1 && (soma === 2 || soma === -2)) {
          const cor = soma / 2, vazia = !a ? l[0] : !b ? l[1] : l[2];
          let alcanca = fases[cor] !== 'mover';
          if (!alcanca) { const vz = VIZ[vazia]; for (let k = 0; k < vz.length; k++) if (t[vz[k]] === cor && l.indexOf(vz[k]) < 0) { alcanca = true; break; } }
          v += cor * (alcanca ? 24 : 8);
        }
      }
      for (const cor of [1, -1]) {
        const f = fases[cor];
        if (f === 'voar') continue;
        let livres = 0, presas = 0;
        for (let s = 0; s < 24; s++) {
          if (t[s] !== cor) continue;
          let k = 0; const vz = VIZ[s];
          for (let i = 0; i < vz.length; i++) if (!t[vz[i]]) k++;
          livres += k; if (!k) presas++;
        }
        if (f === 'colocar') v += cor * (livres - presas * 3);
        else v += cor * (livres * 5 - presas * 8 - (livres ? 0 : 600));
      }
      return pos.lado === BRANCO ? v : -v;
    }

    /** Quem joga consegue fechar trilha agora? (sem gerar os lances: duas peças e a casa vazia ao alcance) */
    function podeFechar(pos) {
      const t = pos.t, cor = pos.lado, f = pos.fase(cor);
      for (let i = 0; i < 16; i++) {
        const l = TRILHAS[i];
        const a = t[l[0]], b = t[l[1]], c = t[l[2]];
        if (a + b + c !== 2 * cor || (a && b && c)) continue;
        if (f !== 'mover') return true;
        const vazia = !a ? l[0] : !b ? l[1] : l[2], vz = VIZ[vazia];
        for (let k = 0; k < vz.length; k++) if (t[vz[k]] === cor && l.indexOf(vz[k]) < 0) return true;
      }
      return false;
    }

    // ================================================================ busca
    const MATE = 30000;
    /**
     * Alfa-beta com aprofundamento iterativo. opts: { tempo (ms), profundidade, nos, margemRaiz }.
     * Devolve { lance (texto), valor (de quem joga), profundidade, nos, ms, pv, raiz: [{ lance, valor }], unico? }.
     * Sem margemRaiz, todos os lances da raiz têm valor exato (o coach dá nota a qualquer lance).
     */
    function buscar(pos, opts) {
      opts = opts || {};
      const t0 = Date.now(), limite = opts.tempo || 1000, profMax = opts.profundidade || 64, nosMax = opts.nos || Infinity;
      const tt = new Map();
      const historia = new Int32Array(25 * 24);
      let nos = 0, parar = false;
      const raiz = pos.legais();
      if (!raiz.length) return { lance: null, valor: -MATE, profundidade: 0, nos: 0, ms: 0, pv: [], raiz: [] };
      if (raiz.length === 1 && !opts.dentroDoUnico) {
        const u = texto(raiz[0]);
        pos.fazer(raiz[0]);
        const sit = pos.situacao();
        const f = sit.fim ? null : buscar(pos, Object.assign({}, opts, { tempo: Math.max(60, limite * 0.35), dentroDoUnico: true }));
        pos.desfazer();
        const valor = f ? -f.valor : sit.vencedor === 0 ? 0 : MATE - 1;
        return { lance: u, valor, profundidade: f ? f.profundidade + 1 : 1, nos: f ? f.nos : 1, ms: Date.now() - t0, pv: [u].concat(f ? f.pv : []), raiz: [{ lance: u, valor }], unico: true };
      }
      const chaveL = m => (m.de + 1) | (m.para << 5) | ((m.tira + 1) << 10);
      const ordenar = (ms, melhorTT) => {
        ms.forEach(m => { m._o = (chaveL(m) === melhorTT ? 1e7 : 0) + (m.tira >= 0 ? 5000 : 0) + historia[(m.de + 1) * 24 + m.para]; });
        ms.sort((a, b) => b._o - a._o);
      };
      function ab(prof, alfa, beta, ply) {
        if ((++nos & 1023) === 0 && (Date.now() - t0 > limite || nos > nosMax)) parar = true;
        if (parar) return 0;
        const cor = pos.lado;
        if (pos.total(cor) < 3) return -MATE + ply;
        if (ply && (pos.semTirar >= LIMITE_SEM_TIRAR || (pos.vistas.get(pos.hash) || 0) >= 2)) return 0;
        if (prof <= 0) return quieto(alfa, beta, ply, 2);
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
          const v = -ab(prof - 1, -beta, -alfa, ply + 1);
          pos.desfazer();
          if (parar) return 0;
          if (v > melhor) { melhor = v; melhorLance = m; }
          if (v > alfa) alfa = v;
          if (alfa >= beta) { if (m.tira < 0) historia[(m.de + 1) * 24 + m.para] += prof * prof; break; }
        }
        if (tt.size > 400000) tt.clear();
        tt.set(chave, { prof, valor: melhor, tipo: melhor <= alfa0 ? 2 : melhor >= beta ? 1 : 0, melhor: melhorLance ? chaveL(melhorLance) : -1, m: melhorLance });
        return melhor;
      }
      /** Na folha: a avaliação, ou fechar uma trilha agora se for melhor (e até 'resta' respostas a isso). */
      function quieto(alfa, beta, ply, resta) {
        const parado = avaliar(pos);
        if (resta <= 0 || ply > 40 || parado >= beta || !podeFechar(pos)) return parado;
        const ms = pos.legais();
        if (!ms.length) return -MATE + ply;
        let melhor = parado;
        if (parado > alfa) alfa = parado;
        for (let i = 0; i < ms.length; i++) {
          const m = ms[i];
          if (!m.fecha) continue;
          pos.fazer(m);
          nos++;
          const v = pos.total(pos.lado) < 3 ? MATE - ply - 1 : -quieto(-beta, -alfa, ply + 1, resta - 1);
          pos.desfazer();
          if (v > melhor) { melhor = v; if (v > alfa) alfa = v; if (alfa >= beta) break; }
        }
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

    function contarLances(pos, prof) {
      if (prof === 0) return 1;
      let n = 0;
      for (const m of pos.legais()) { pos.fazer(m); n += contarLances(pos, prof - 1); pos.desfazer(); }
      return n;
    }

    Object.assign(T, { BRANCO, PRETO, PECAS, LIMITE_SEM_TIRAR, NOMES, VIZ, TRILHAS, Posicao, buscar, avaliar, texto, nomeCasa, casaDe, emTrilha, contarLances, MATE });

    if (emWorker) {
      self.onmessage = e => {
        const { id, lances, opts, opcoes } = e.data;
        try {
          const pos = new Posicao(null, BRANCO, null, opcoes);
          (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
          self.postMessage({ id, ok: true, r: buscar(pos, opts) });
        } catch (err) { self.postMessage({ id, ok: false, erro: String(err && err.message || err) }); }
      };
    }
    return T;
  }

  const T = P.Trilha = P.Trilha || {};
  nucleo(T, false);
  T.fonteNucleo = nucleo;
})(window.Poker = window.Poker || {});
