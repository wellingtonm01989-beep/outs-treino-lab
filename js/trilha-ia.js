/* ==========================================================================
   OUTS · Treino Lab — trilha-ia.js
   Os adversários da trilha: a busca roda num Web Worker (a tela não trava);
   se o navegador não deixar criar o worker, roda na própria página.
   Níveis do Iniciante (olha dois lances e erra bastante) ao Mestre (busca
   completa por alguns segundos); nos primeiros lances até os fortes variam
   entre as casas boas, para nenhuma partida sair igual.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Trilha;
  const RNG = P.RNG;

  let proximoId = 1;
  /** Canal de busca; opcoes = as regras da partida (voar). */
  function criarCanal(opcoes) {
    let w = null;
    const pendentes = new Map();
    try {
      const url = URL.createObjectURL(new Blob(['(' + T.fonteNucleo.toString() + ')({}, true);'], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = e => { const p = pendentes.get(e.data.id); if (!p) return; pendentes.delete(e.data.id); if (e.data.ok) p.res(e.data.r); else p.rej(new Error(e.data.erro)); };
      w.onerror = () => { w = null; pendentes.forEach(p => p.rej(new Error('worker'))); pendentes.clear(); };
    } catch (e) { w = null; }
    return {
      /** Busca na posição depois dos lances (texto) a partir do início. */
      buscar(lances, opts) {
        if (w) {
          const id = proximoId++;
          return new Promise((res, rej) => { pendentes.set(id, { res, rej }); w.postMessage({ id, lances, opts, opcoes }); })
            .catch(() => buscarAqui(lances, opts));
        }
        return new Promise(res => setTimeout(() => res(buscarAqui(lances, opts)), 20));
      },
      encerrar() { if (w) w.terminate(); w = null; pendentes.clear(); },
      temWorker: () => !!w
    };
    function buscarAqui(lances, opts) {
      const pos = new T.Posicao(null, T.BRANCO, null, opcoes);
      (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
      return T.buscar(pos, Object.assign({}, opts, { tempo: Math.min(opts.tempo || 800, 900) }));
    }
  }

  const NIVEIS = [
    { id: 1, nome: 'Iniciante', descricao: 'Olha só dois lances à frente e deixa trilhas abertas: bom para aprender.', tempo: 250, profundidade: 2, margem: 90, erro: 0.3 },
    { id: 2, nome: 'Casual', descricao: 'Fecha as trilhas que vê e tapa as suas, mas cai em trilha dupla.', tempo: 400, profundidade: 3, margem: 45, erro: 0.12 },
    { id: 3, nome: 'Clube', descricao: 'Joga como um bom jogador: raramente deixa você fechar trilha de graça.', tempo: 700, profundidade: 5, margem: 18, erro: 0.03 },
    { id: 4, nome: 'Forte', descricao: 'Calcula vários lances à frente e arma trilhas duplas; é preciso jogar bem.', tempo: 1300, profundidade: 64, margem: 6, erro: 0 },
    { id: 5, nome: 'Mestre', descricao: 'Busca completa por alguns segundos em cada lance. O mais forte.', tempo: 2600, profundidade: 64, margem: 0, erro: 0 }
  ];
  const nivel = id => NIVEIS.find(n => n.id === +id) || NIVEIS[2];

  /** O lance do bot: busca e escolhe entre os que ficam perto do melhor (margem do nível). */
  async function lanceDoBot(canal, lances, idNivel) {
    const nv = nivel(idNivel);
    const abertura = lances.length < 6;
    const margem = nv.margem + (abertura ? 10 : 0);
    const r = await canal.buscar(lances, { tempo: nv.tempo, profundidade: nv.profundidade, margemRaiz: margem * (nv.erro > 0 ? 3 : 1) });
    if (!r || !r.lance) return r;
    let opcoes = (r.raiz || []).filter(o => o.valor >= r.valor - margem);
    if (RNG.chance(nv.erro) && r.raiz && r.raiz.length > 1) opcoes = r.raiz.filter(o => o.valor >= r.valor - margem * 3);
    if (opcoes.length <= 1 || Math.abs(r.valor) > T.MATE - 500) return r;
    const pesos = opcoes.map(o => Math.exp(-(r.valor - o.valor) / Math.max(5, margem / 2)));
    let x = RNG.real() * pesos.reduce((s, p) => s + p, 0);
    for (let i = 0; i < opcoes.length; i++) { x -= pesos[i]; if (x <= 0) return Object.assign({}, r, { lance: opcoes[i].lance, valorEscolhido: opcoes[i].valor }); }
    return r;
  }

  const NOMES = ['Seu Moinho', 'Dona Trilhada', 'Tonho da Venda', 'Vó Nena', 'Zé Pedrinha', 'Mestre Arlindo', 'Cida do Largo', 'Professor Juca', 'Tio Bastião', 'Lurdinha'];

  T.IA = { criarCanal, NIVEIS, nivel, lanceDoBot, NOMES };
})(window.Poker = window.Poker || {});
