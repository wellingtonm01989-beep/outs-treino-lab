/* ==========================================================================
   OUTS · Treino Lab — uno-regras.js
   "Última!": o jogo das cartas coloridas (no estilo do Uno). Regras e cartas.

   Baralho de 108 cartas: em cada uma das 4 cores (vermelho, amarelo, verde,
   azul) um 0, dois de cada número de 1 a 9, dois Pular, dois Inverter e dois
   +2; mais 4 Coringas e 4 Coringas +4.

   Na sua vez, jogue uma carta da mesma cor, do mesmo número ou do mesmo
   símbolo da carta de cima da pilha — ou um coringa, que escolhe a cor.
   Sem jogada (ou se preferir), compre uma carta; se ela servir, pode jogá-la.
   Pular: o próximo perde a vez. Inverter: o sentido muda (com 2 jogadores,
   vale como Pular). +2: o próximo compra 2 e perde a vez. Coringa +4: o
   próximo compra 4 e perde a vez — e só pode ser jogado quando você não tem
   carta da cor da mesa (o jogo não deixa jogar com a cor na mão).
   O desafio do +4 da regra oficial (quem recebe desconfia de blefe) ficou só
   no motor, para os testes: a mesa joga sem ele (opção desafio, padrão false).
   Ao ficar com uma carta, diga "Última!" (aperte o botão antes de jogar a
   penúltima). Se esquecer e alguém pegar antes do próximo jogar, compre 2.
   Quem zera a mão ganha a mão e marca os pontos das cartas dos outros
   (número = o valor; Pular, Inverter e +2 = 20; coringas = 50).

   +2 e +4 passam adiante (regra fixa da mesa): quem recebe pode jogar outro +2
   ou +4 em cima — vale +2 sobre +4 e +4 sobre +2 — e o próximo compra tudo.

   Regras da casa (opcionais): comprar até poder jogar; jogar
   cartas iguais juntas (cartas de número: a primeira combina com a mesa, as
   outras têm o mesmo número; a última fica por cima e vale a cor dela).
   ========================================================================== */
(function (P) {
  'use strict';

  const U = P.Uno = P.Uno || {};

  const CORES = ['vermelho', 'amarelo', 'verde', 'azul'];
  const NOMES_COR = ['Vermelho', 'Amarelo', 'Verde', 'Azul'];
  const HEX_COR = ['#e5484d', '#f2c230', '#2fbf71', '#3d8ef0'];
  const CORINGA = -1;
  const TIPOS = ['num', 'pular', 'inverter', 'mais2', 'coringa', 'mais4'];
  const NOME_TIPO = { pular: 'Pular', inverter: 'Inverter', mais2: '+2', coringa: 'Coringa', mais4: 'Coringa +4' };

  // ---------------------------------------------------------------- cartas
  const CARTAS = [];
  (function montar() {
    for (let cor = 0; cor < 4; cor++) {
      CARTAS.push({ cor, tipo: 'num', num: 0 });
      for (let num = 1; num <= 9; num++) { CARTAS.push({ cor, tipo: 'num', num }); CARTAS.push({ cor, tipo: 'num', num }); }
      ['pular', 'inverter', 'mais2'].forEach(tipo => { CARTAS.push({ cor, tipo, num: null }); CARTAS.push({ cor, tipo, num: null }); });
    }
    for (let k = 0; k < 4; k++) CARTAS.push({ cor: CORINGA, tipo: 'coringa', num: null });
    for (let k = 0; k < 4; k++) CARTAS.push({ cor: CORINGA, tipo: 'mais4', num: null });
    CARTAS.forEach((c, id) => {
      c.id = id;
      c.pontos = c.tipo === 'num' ? c.num : c.cor === CORINGA ? 50 : 20;
      c.coringa = c.cor === CORINGA;
      c.acao = c.tipo !== 'num';
      // "assinatura": duas cartas iguais (ex.: os dois 7 verdes) valem o mesmo
      c.sig = c.coringa ? c.tipo : c.tipo === 'num' ? c.cor * 100 + c.num : c.cor * 100 + 10 + TIPOS.indexOf(c.tipo);
    });
    Object.freeze(CARTAS);
  })();
  const TOTAL = CARTAS.length;    // 108
  const carta = id => CARTAS[id];

  /** Nome por extenso: "7 Verde", "+2 Azul", "Coringa +4". */
  function nome(id) {
    const c = CARTAS[id];
    if (c.coringa) return NOME_TIPO[c.tipo];
    return (c.tipo === 'num' ? String(c.num) : NOME_TIPO[c.tipo]) + ' ' + NOMES_COR[c.cor];
  }
  /** Símbolo curto do meio da carta: "7", "+2", "⊘", "⇄", "+4", "★". */
  function simbolo(id) {
    const c = CARTAS[id];
    return c.tipo === 'num' ? String(c.num) : { pular: '⊘', inverter: '⇄', mais2: '+2', coringa: '★', mais4: '+4' }[c.tipo];
  }

  // ---------------------------------------------------------------- opções
  const OPCOES_PADRAO = { acumular: true, comprarAtePoder: false, desafio: false, juntas: false, ate: 200 };
  function opcoes(o) { return Object.assign({}, OPCOES_PADRAO, o || {}); }

  // ------------------------------------------------------------- jogadas
  /** A carta casa com a mesa (cor da vez, número ou símbolo)? Coringas sempre casam. */
  function casa(id, topo, cor) {
    const c = CARTAS[id], t = CARTAS[topo];
    if (c.coringa) return true;
    if (c.cor === cor) return true;
    if (t.coringa) return false;
    if (c.tipo === 'num') return t.tipo === 'num' && t.num === c.num;
    return c.tipo === t.tipo;
  }
  /** Tem alguma carta da cor? (o +4 só é limpo sem a cor da mesa) */
  const temCor = (mao, cor) => mao.some(id => CARTAS[id].cor === cor);

  /**
   * Cartas que podem ser jogadas agora.
   * pendente: { qtd, tipo } quando há compra acumulada esperando (regra acumular):
   * aí só vale responder com +2 ou +4 (qualquer um, sobre qualquer um).
   */
  function jogaveis(mao, topo, cor, op, pendente) {
    const o = op || OPCOES_PADRAO;
    if (pendente) {
      if (!o.acumular) return [];
      return mao.filter(id => { const c = CARTAS[id]; return c.tipo === 'mais4' || c.tipo === 'mais2'; });
    }
    const semCor = !temCor(mao, cor);
    return mao.filter(id => {
      if (!casa(id, topo, cor)) return false;
      if (CARTAS[id].tipo === 'mais4' && !o.desafio && !semCor) return false;   // sem desafio: o +4 só vale sem a cor
      return true;
    });
  }
  /** O +4 jogado agora seria blefe (há carta da cor da mesa na mão)? */
  function mais4Blefe(mao, idMais4, cor) { return mao.some(id => id !== idMais4 && CARTAS[id].cor === cor); }

  /**
   * Várias cartas de uma vez (regra "jogar cartas iguais juntas"): todas de
   * número, com o mesmo número, todas na mão; a primeira combina com a mesa.
   * Uma carta só segue a regra normal (jogaveis).
   */
  function grupoValido(mao, cartas, topo, cor, op, pendente) {
    if (!Array.isArray(cartas) || !cartas.length) return false;
    if (new Set(cartas).size !== cartas.length || cartas.some(id => mao.indexOf(id) < 0)) return false;
    if (cartas.length === 1) return jogaveis(mao, topo, cor, op, pendente).indexOf(cartas[0]) >= 0;
    const o = op || OPCOES_PADRAO;
    if (!o.juntas || pendente) return false;
    const c0 = CARTAS[cartas[0]];
    if (c0.tipo !== 'num' || cartas.some(id => CARTAS[id].tipo !== 'num' || CARTAS[id].num !== c0.num)) return false;
    return casa(cartas[0], topo, cor);
  }
  /** As outras cartas de número com o mesmo número de id (para jogar juntas). */
  const iguais = (mao, id) => (CARTAS[id].tipo !== 'num' ? [] : mao.filter(x => x !== id && CARTAS[x].tipo === 'num' && CARTAS[x].num === CARTAS[id].num));

  const pontosDaMao = mao => mao.reduce((s, id) => s + CARTAS[id].pontos, 0);

  /** Próximo lugar no sentido (1 = horário). */
  const proximo = (j, sentido, n, passos) => ((j + sentido * (passos || 1)) % n + n * 4) % n;

  U.Regras = {
    CORES, NOMES_COR, HEX_COR, CORINGA, TIPOS, NOME_TIPO, CARTAS, TOTAL, OPCOES_PADRAO,
    carta, nome, simbolo, opcoes, casa, temCor, jogaveis, grupoValido, iguais, mais4Blefe, pontosDaMao, proximo
  };
})(window.Poker = window.Poker || {});
