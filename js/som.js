/* ==========================================================================
   OUTS · Treino Lab — som.js
   Efeitos sonoros gerados na hora com a Web Audio API (sem arquivos).
   Respeita o botão de mudo (Config "som"). O áudio só liga depois do
   primeiro clique, como exigem os navegadores.
   ========================================================================== */
(function (P) {
  'use strict';

  let ctx = null;
  function contexto() {
    if (!P.Config.get('som')) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  function tom(freq, dur, tipo = 'sine', vol = 0.15, atraso = 0, deslize = 0) {
    const c = contexto();
    if (!c) return;
    const t = c.currentTime + atraso;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (deslize) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + deslize), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function ruido(dur, freq, vol = 0.12, atraso = 0, q = 1) {
    const c = contexto();
    if (!c) return;
    const t = c.currentTime + atraso;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    // ruído branco determinístico (sem Math.random): sequência simples
    let x = 12345;
    for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = (x / 0x7fffffff * 2 - 1) * (1 - i / n); }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t);
  }

  P.Som = {
    carta: () => ruido(0.06, 2800, 0.18, 0, 0.8),
    ficha: () => { tom(2200, 0.05, 'triangle', 0.08); tom(3100, 0.05, 'triangle', 0.06, 0.035); },
    check: () => { tom(140, 0.09, 'sine', 0.25); tom(120, 0.09, 'sine', 0.2, 0.11); },
    fold: () => ruido(0.18, 900, 0.12, 0, 0.6),
    vez: () => { tom(660, 0.12, 'sine', 0.1); tom(990, 0.18, 'sine', 0.08, 0.1); },
    vitoria: () => { [523, 659, 784, 1047].forEach((f, i) => tom(f, 0.22, 'triangle', 0.1, i * 0.09)); },
    alerta: () => { tom(880, 0.12, 'square', 0.05); tom(660, 0.16, 'square', 0.05, 0.14); },
    acerto: () => { tom(784, 0.1, 'sine', 0.1); tom(1175, 0.16, 'sine', 0.09, 0.08); },
    erro: () => tom(220, 0.25, 'sawtooth', 0.05, 0, -80),
    desbloquear: () => contexto()
  };
})(window.Poker = window.Poker || {});
