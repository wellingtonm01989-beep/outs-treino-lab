/* ==========================================================================
   OUTS · Treino Lab — testes/testes-damas.js
   Testes das damas (regras brasileiras): geração de lances (perft), a pedra
   que come para trás, captura obrigatória e lei da maioria (contando peças,
   não valor), dama voadora, peças comidas que só saem no fim do lance,
   coroação (só parando na última fila), fim e empates, notação, a busca
   (golpe e ganho forçado), os bots no Web Worker e o coach.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Testes.teste;
  const D = P.Damas, DC = D.Coach, IA = D.IA;
  const G = 'Damas: regras', GB = 'Damas: busca, bots e coach';

  /** Posição montada: 'c3 Dd4' (D = dama), brancas e pretas, e quem joga (1 brancas, -1 pretas). */
  function montar(brancas, pretas, lado) {
    const t = new Int8Array(64);
    const por = (lista, cor) => (lista ? lista.split(' ') : []).forEach(x => { const dama = x[0] === 'D'; t[D.casaDe(dama ? x.slice(1) : x)] = (dama ? 2 : 1) * cor; });
    por(brancas, 1); por(pretas, -1);
    return new D.Posicao(t, lado || D.BRANCO);
  }
  const textos = pos => pos.legais().map(D.texto).sort();
  const jogar = (pos, lances) => lances.split(' ').forEach(u => { const m = pos.lanceDe(u); if (!m) throw new Error('lance inválido: ' + u); pos.fazer(m); });
  /** Um lance sem captura, que não deixa peça para ser comida e não repete posição (para testar os empates). */
  function lanceTranquilo(pos) {
    for (const m of pos.legais()) {
      if (m.capt.length) continue;
      pos.fazer(m);
      const ok = !pos.temCaptura() && (pos.vistas.get(pos.hash) || 0) === 1;
      pos.desfazer();
      if (ok) return m;
    }
    return null;
  }

  T(G, 'Perft: número exato de lances possíveis a partir da posição inicial', a => {
    const pos = new D.Posicao();
    const h = pos.hash, t = Array.from(pos.t).join('');
    a.igualJSON([1, 2, 3, 4, 5, 6].map(d => D.contarLances(pos, d)), [7, 49, 302, 1469, 7473, 37628]);
    a.igual(pos.hash, h, 'fazer/desfazer volta ao mesmo hash');
    a.igual(Array.from(pos.t).join(''), t, 'e ao mesmo tabuleiro');
    a.igualJSON(textos(pos), ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4'], 'os 7 primeiros lances');
    return '7 · 49 · 302 · 1.469 · 7.473 · 37.628 (os números conhecidos das damas brasileiras/russas)';
  });

  T(G, 'A pedra anda só para frente, mas come para frente e para trás', a => {
    a.igualJSON(textos(montar('c1 e1', 'h8')), ['c1-b2', 'c1-d2', 'e1-d2', 'e1-f2'], 'brancas sobem');
    a.igualJSON(textos(montar('a1', 'd6', D.PRETO)), ['d6-c5', 'd6-e5'], 'pretas descem');
    a.igualJSON(textos(montar('e3', 'd2 h8')), ['e3xc1'], 'come para trás');
    a.igualJSON(textos(montar('d4', 'e5 h8')), ['d4xf6'], 'come para frente');
  });

  T(G, 'Captura obrigatória e lei da maioria (conta peças: pedra e dama valem igual)', a => {
    let pos = montar('c3 h2', 'd4 b4 b6 h8');
    a.igualJSON(textos(pos), ['c3xa5xc7'], 'come 2 pedras em vez de 1 — e a outra pedra não pode andar');
    // comer a dama (1 peça) não vale mais que comer duas pedras
    pos = montar('c3', 'Dd4 b4 b6 h8');
    a.igualJSON(textos(pos), ['c3xa5xc7'], 'duas pedras > uma dama');
    // duas peças de um jeito (dama + pedra) ou duas de outro (2 pedras): pode escolher
    pos = montar('c3', 'Dd4 f6 b4 b6');
    a.igualJSON(textos(pos), ['c3xa5xc7', 'c3xe5xg7'], 'empate de quantidade: as duas valem');
  });

  T(G, 'Dama voadora: anda e come à distância, parando em qualquer casa depois', a => {
    a.igual(montar('Da1', 'h2').legais().length, 7, 'a grande diagonal inteira');
    a.igualJSON(textos(montar('Da1', 'c3')), ['a1xd4', 'a1xe5', 'a1xf6', 'a1xg7', 'a1xh8'], 'cai em qualquer casa livre depois da peça');
    a.igualJSON(textos(montar('Da1', 'd4 f6 h8')), ['a1xe5xg7'], 'come duas à distância (a terceira está na borda)');
    a.igualJSON(textos(montar('Da1', 'c3 d4 h8')), ['a1-b2'], 'duas peças coladas na diagonal não podem ser comidas');
  });

  T(G, 'As peças comidas só saem no fim do lance: cada salto pula exatamente uma, sem repetir', a => {
    // confere todas as capturas de partidas sorteadas contra o tabuleiro de antes do lance
    let capturas = 0, multiplas = 0;
    for (let jogo = 0; jogo < 25; jogo++) {
      const pos = new D.Posicao();
      for (let ply = 0; ply < 120 && !pos.situacao().fim; ply++) {
        const ms = pos.legais();
        ms.forEach(m => {
          if (!m.capt.length) return;
          capturas++; if (m.capt.length > 1) multiplas++;
          a.igual(new Set(m.capt).size, m.capt.length, 'pulou a mesma peça duas vezes: ' + D.texto(m));
          a.igual(m.cam.length, m.capt.length + 1, 'um salto por peça comida');
          for (let i = 0; i + 1 < m.cam.length; i++) {
            const de = m.cam[i], para = m.cam[i + 1];
            const dr = Math.sign((para >> 3) - (de >> 3)), dc = Math.sign((para & 7) - (de & 7));
            const passo = Math.abs((para >> 3) - (de >> 3));
            a.igual(Math.abs((para & 7) - (de & 7)), passo, 'salto na diagonal');
            const entre = [];
            for (let k = 1; k < passo; k++) { const s = de + k * (8 * dr + dc); if (pos.t[s] && s !== m.de) entre.push(s); }
            a.igualJSON(entre, [m.capt[i]], 'exatamente a peça comida no caminho de ' + D.texto(m));
            a.verdadeiro(pos.t[m.capt[i]] * pos.lado < 0, 'come peça do adversário');
            a.verdadeiro(!pos.t[para] || para === m.de, 'cai em casa vazia');
          }
        });
        pos.fazer(P.RNG.escolher(ms));
      }
    }
    a.maior(multiplas, 5, 'capturas múltiplas no sorteio');
    return `${capturas} capturas conferidas (${multiplas} de várias peças)`;
  });

  T(G, 'Vira dama só parando na última fila; passando por ela no meio da captura, segue pedra', a => {
    let pos = montar('g7', 'a3');
    const ms = pos.legais();
    a.igualJSON(ms.map(m => D.texto(m) + (m.promove ? '=D' : '')).sort(), ['g7-f8=D', 'g7-h8=D']);
    pos.fazer(pos.lanceDe('g7-h8'));
    a.igual(pos.t[D.casaDe('h8')], 2, 'dama em h8');
    // b6 come c7 (chega na 8ª fila) e continua comendo e7 para trás: termina em f6 como pedra
    pos = montar('b6', 'c7 e7 h2');
    a.igualJSON(textos(pos), ['b6xd8xf6']);
    const m = pos.lanceDe('b6xd8xf6');
    a.verdadeiro(!m.promove, 'não promove');
    pos.fazer(m);
    a.igual(pos.t[D.casaDe('f6')], 1, 'continua pedra em f6');
    // a captura que termina na última fila promove
    pos = montar('d6', 'e7 h2');
    a.verdadeiro(pos.lanceDe('d6xf8').promove, 'd6xf8 vira dama');
    // desfazer volta a pedra
    pos.fazer(pos.lanceDe('d6xf8')); pos.desfazer();
    a.igual(pos.t[D.casaDe('d6')], 1, 'desfazer devolve a pedra');
  });

  T(G, 'Fim da partida: sem peças, sem lance e os empates (20 lances de damas, finais em 5 lances, repetição)', a => {
    let pos = montar('c3', 'd4');
    jogar(pos, 'c3xe5');
    a.igualJSON(pos.situacao(), { fim: true, vencedor: 1, motivo: 'sem peças' });
    pos = montar('a1 c1 h2', 'b2', D.PRETO);
    a.igualJSON(pos.situacao(), { fim: true, vencedor: 1, motivo: 'bloqueado' }, 'pedra preta presa em b2');
    // 1 dama contra 1 dama: empate em 5 lances (10 meios-lances)
    pos = montar('Da1', 'Dh2');
    for (let i = 0; i < 9; i++) { const m = lanceTranquilo(pos); a.verdadeiro(!!m, 'lance tranquilo'); pos.fazer(m); }
    a.igual(pos.situacao().fim, false, 'ainda não no 9º meio-lance');
    pos.fazer(lanceTranquilo(pos));
    a.igual(pos.situacao().motivo, 'final de damas (5 lances)');
    // 3 damas contra 3 (não é final especial): 20 lances de cada lado
    pos = montar('Da1 Dc1 De1', 'Dd8 Df8 Dh8');
    for (let i = 0; i < 39; i++) { const m = lanceTranquilo(pos); a.verdadeiro(!!m, 'lance tranquilo ' + i); pos.fazer(m); }
    a.igual(pos.situacao().fim, false, 'ainda não no 39º');
    pos.fazer(lanceTranquilo(pos));
    a.igual(pos.situacao().motivo, '20 lances de damas');
    // uma pedra que anda zera a contagem
    pos = montar('Da1 Dc1 e3', 'Dd8 Df8 h6');
    jogar(pos, 'a1-b2 d8-c7');
    a.igual(pos.semCaptura, 2, 'dois lances de dama');
    jogar(pos, 'e3-f4');
    a.igual(pos.semCaptura, 0, 'pedra andou');
    // repetição: a mesma posição pela 3ª vez
    pos = montar('Da1 Dc1 De1', 'Dd8 Df8 Dh8');
    jogar(pos, 'c1-d2 f8-e7 d2-c1 e7-f8 c1-d2 f8-e7 d2-c1');
    a.igual(pos.situacao().fim, false);
    jogar(pos, 'e7-f8');
    a.igual(pos.situacao().motivo, 'repetição');
  });

  T(G, 'Notação: casas, lances com "-" e capturas com "x"', a => {
    a.igual(D.nomeCasa(D.casaDe('e3')), 'e3');
    a.igual(D.casaDe('a1'), 0); a.igual(D.casaDe('h8'), 63);
    a.verdadeiro(D.escura(D.casaDe('a1')) && !D.escura(D.casaDe('b1')), 'a1 é escura (a grande diagonal fica à esquerda)');
    const pos = montar('c3', 'd4 b4 b6 h8');
    const m = pos.legais()[0];
    a.igual(D.texto(m), 'c3xa5xc7');
    a.igualJSON(m.capt.map(D.nomeCasa), ['b4', 'b6']);
    a.verdadeiro(pos.lanceDe('c3-d4') === null, 'lance ilegal não existe');
  });

  // ================================================================== busca
  T(GB, 'Busca: entrega a pedra que vira dama para ganhar a partida (golpe forçado)', a => {
    // g7-f8! vira dama, a preta é obrigada a comer (e5xg7) e a dama come duas (f8xh6xd2)
    const pos = montar('a1 c1 f6 g7', 'e3 d4 e5 d6');
    const r = D.buscar(pos, { profundidade: 9, tempo: 20000 });
    a.igual(r.lance, 'g7-f8');
    a.maior(r.valor, D.MATE - 500, 'ganho forçado');
    a.igualJSON(r.pv.slice(0, 3), ['g7-f8', 'e5xg7', 'f8xh6xd2']);
    const raso = D.buscar(pos, { profundidade: 1, tempo: 2000 });
    a.verdadeiro(raso.lance !== 'g7-f8', 'olhando um lance só, não vê');
    const pior = r.raiz[r.raiz.length - 1];
    a.verdadeiro(pior.valor < 0, 'há lance que perde: ' + pior.lance);
    return `${r.lance} ganha à força (${r.pv.slice(0, 3).join(' ')}); com 1 lance de busca o bot jogaria ${raso.lance}`;
  });

  T(GB, 'Busca: lance único sai na hora e ainda vem com a avaliação da posição', a => {
    const pos = montar('c3 a1', 'd4 h8');
    const r = D.buscar(pos, { tempo: 400 });
    a.verdadeiro(r.unico, 'único');
    a.igual(r.lance, 'c3xe5');
    a.maior(r.valor, 50, 'depois de comer, as brancas estão melhor');
    a.maior(r.profundidade, 1);
    // com margem na raiz, o melhor lance é o mesmo da busca completa
    const p2 = montar('a1 c1 f6 g7', 'e3 d4 e5 d6');
    a.igual(D.buscar(p2, { profundidade: 9, tempo: 20000, margemRaiz: 0 }).lance, 'g7-f8');
  });

  T(GB, 'Coach: explica a captura obrigatória e o golpe, e dá nota ao lance', a => {
    // captura obrigatória pela lei da maioria
    let pos = montar('c3 h2', 'd4 b4 b6 h8');
    let r = D.buscar(pos, { tempo: 500 });
    let an = { melhor: r.lance, valor: r.valor, profundidade: r.profundidade, raiz: r.raiz, pv: r.pv, brancas: r.valor, lado: 1, unico: !!r.unico };
    // o coach aceita a posição montada no lugar da lista de lances
    {
      let c = DC.explicar(pos, an);
      a.verdadeiro(c.linhas[0].indexOf('captura obrigatória') >= 0 && c.linhas[0].indexOf('lei da maioria') >= 0, c.linhas[0]);
      // o golpe
      pos = montar('a1 c1 f6 g7', 'e3 d4 e5 d6');
      r = D.buscar(pos, { profundidade: 9, tempo: 20000 });
      an = { melhor: r.lance, valor: r.valor, profundidade: r.profundidade, raiz: r.raiz, pv: r.pv, brancas: r.valor, lado: 1 };
      c = DC.explicar(pos, an);
      a.verdadeiro(c.linhas[0].indexOf('golpe') >= 0, c.linhas[0]);
      a.igual(DC.avaliar([], an, 'g7-f8').nota, 'otima');
      const pior = r.raiz[r.raiz.length - 1].lance;
      const nota = DC.avaliar([], an, pior);
      a.verdadeiro(nota.nota === 'grave' || nota.nota === 'erro', pior + ': ' + nota.nota);
      return c.linhas[0].replace(/<[^>]+>/g, '');
    }
  });

  T(GB, 'Bots: a busca roda no Web Worker e cada nível devolve um lance legal', async a => {
    const canal = IA.criarCanal();
    try {
      a.verdadeiro(canal.temWorker(), 'worker criado');
      const lances = ['c3-d4', 'f6-g5', 'g3-f4'];
      const pos = new D.Posicao(); jogar(pos, lances.join(' '));
      const r = await canal.buscar(lances, { tempo: 300 });
      a.verdadeiro(!!pos.lanceDe(r.lance), 'lance legal do worker: ' + r.lance);
      a.maior(r.raiz.length, 1);
      const feitos = [];
      for (const nv of [1, 2, 3]) {
        const b = await IA.lanceDoBot(canal, lances, nv);
        a.verdadeiro(!!pos.lanceDe(b.lance), 'nível ' + nv + ': ' + b.lance);
        feitos.push(IA.nivel(nv).nome + ' ' + b.lance);
      }
      a.igualJSON(IA.NIVEIS.map(n => n.id), [1, 2, 3, 4, 5]);
      return feitos.join(' · ');
    } finally { canal.encerrar(); }
  });
})(window.Poker = window.Poker || {});
