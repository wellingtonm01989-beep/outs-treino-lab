/* ==========================================================================
   OUTS · Treino Lab — damas-ia.js
   Os adversários das damas: a busca roda num Web Worker (a tela não trava);
   se o navegador não deixar criar o worker, roda na própria página.

   Níveis: do Iniciante (olha pouco e erra bastante) ao Mestre (busca
   completa por alguns segundos). Nos de baixo o bot escolhe entre os lances
   quase tão bons quanto o melhor, com uma margem de erro; nos de cima joga o
   melhor. Na abertura os bots variam entre os lances bons, para nenhuma
   partida sair igual.
   ========================================================================== */
(function (P) {
  'use strict';

  const D = P.Damas;
  const RNG = P.RNG;

  let proximoId = 1;
  function criarCanal() {
    let w = null;
    const pendentes = new Map();
    try {
      const url = URL.createObjectURL(new Blob(['(' + D.fonteNucleo.toString() + ')({}, true);'], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = e => { const p = pendentes.get(e.data.id); if (!p) return; pendentes.delete(e.data.id); if (e.data.ok) p.res(e.data.r); else p.rej(new Error(e.data.erro)); };
      w.onerror = () => { w = null; pendentes.forEach(p => p.rej(new Error('worker'))); pendentes.clear(); };
    } catch (e) { w = null; }
    return {
      /** Busca na posição depois dos lances (texto) a partir do início. */
      buscar(lances, opts) {
        if (w) {
          const id = proximoId++;
          return new Promise((res, rej) => { pendentes.set(id, { res, rej }); w.postMessage({ id, lances, opts }); })
            .catch(() => buscarAqui(lances, opts));
        }
        return new Promise(res => setTimeout(() => res(buscarAqui(lances, opts)), 20));
      },
      encerrar() { if (w) w.terminate(); w = null; pendentes.clear(); },
      temWorker: () => !!w
    };
  }
  function buscarAqui(lances, opts) {
    const pos = new D.Posicao();
    (lances || []).forEach(u => { const m = pos.lanceDe(u); if (m) pos.fazer(m); });
    return D.buscar(pos, Object.assign({}, opts, { tempo: Math.min(opts.tempo || 800, 900) }));
  }

  const NIVEIS = [
    { id: 1, nome: 'Iniciante', descricao: 'Olha só dois lances à frente e erra bastante: bom para aprender as capturas obrigatórias.', tempo: 250, profundidade: 2, margem: 160, erro: 0.3 },
    { id: 2, nome: 'Casual', descricao: 'Vê as capturas simples, mas cai em golpes de duas ou três peças.', tempo: 400, profundidade: 3, margem: 70, erro: 0.12 },
    { id: 3, nome: 'Clube', descricao: 'Joga como um bom jogador de clube: raramente entrega pedra de graça.', tempo: 700, profundidade: 6, margem: 25, erro: 0.03 },
    { id: 4, nome: 'Forte', descricao: 'Calcula vários lances à frente e arma golpes; é preciso jogar bem para ganhar.', tempo: 1300, profundidade: 64, margem: 8, erro: 0 },
    { id: 5, nome: 'Mestre', descricao: 'Busca completa por alguns segundos em cada lance. O mais forte.', tempo: 2600, profundidade: 64, margem: 0, erro: 0 }
  ];
  const nivel = id => NIVEIS.find(n => n.id === +id) || NIVEIS[3];

  /**
   * O lance do bot: busca e escolhe entre os que ficam perto do melhor (margem do nível);
   * nos primeiros lances, até os fortes variam entre os lances bons.
   */
  async function lanceDoBot(canal, lances, idNivel) {
    const nv = nivel(idNivel);
    const abertura = lances.length < 8;
    const margem = nv.margem + (abertura ? 12 : 0);
    // a busca só precisa do valor exato dos lances que o bot pode escolher
    const r = await canal.buscar(lances, { tempo: nv.tempo, profundidade: nv.profundidade, margemRaiz: margem * (nv.erro > 0 ? 3 : 1) });
    if (!r || !r.lance) return r;
    let opcoes = (r.raiz || []).filter(o => o.valor >= r.valor - margem);
    if (RNG.chance(nv.erro) && r.raiz && r.raiz.length > 1) opcoes = r.raiz.filter(o => o.valor >= r.valor - margem * 3);
    if (opcoes.length <= 1 || Math.abs(r.valor) > D.MATE - 500) return r;
    // os melhores pesam mais
    const pesos = opcoes.map(o => Math.exp(-(r.valor - o.valor) / Math.max(6, margem / 2)));
    let x = RNG.real() * pesos.reduce((s, p) => s + p, 0);
    for (let i = 0; i < opcoes.length; i++) { x -= pesos[i]; if (x <= 0) return Object.assign({}, r, { lance: opcoes[i].lance, valorEscolhido: opcoes[i].valor }); }
    return r;
  }

  const NOMES = ['Seu Damião', 'Dona Pedrina', 'Zé da Praça', 'Tia Dama', 'Capitão Lino', 'Vó Cotinha', 'Mestre Bento', 'Rita do Coreto', 'Professor Elias', 'Juca Soprador'];

  D.IA = { criarCanal, NIVEIS, nivel, lanceDoBot, NOMES };
})(window.Poker = window.Poker || {});
