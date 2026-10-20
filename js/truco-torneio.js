/* ==========================================================================
   OUTS · Treino Lab — truco-torneio.js
   Torneio de truco mata-mata contra bots (lógica, sem tela).

   Você escolhe quantos participantes entram (jogadores no 1 contra 1, duplas
   no jogo em dupla), as regras (paulista ou paranaense) e se cada confronto
   é uma partida só ou melhor de 3. A chave é sorteada; quando o número não
   é potência de 2, alguns passam direto da 1ª fase (bye). Você joga os seus
   confrontos na mesa; os outros são partidas de verdade entre bots, jogadas
   pelo mesmo motor, só que sem animação (simular).

   O torneio é um objeto simples (JSON), para ficar salvo e voltar depois:
     { versao, regras, n, melhorDe, participantes: [{ nome, membros: [...], voce }],
       rodadas: [[{ a, b, vencedor: 'a'|'b'|null, jogos: [{ vencedor, placar }], bye }]],
       eliminadoNa, campeao }
   a e b são índices em participantes (0 é você); null = vaga ainda vazia.
   ========================================================================== */
(function (P) {
  'use strict';

  const T = P.Truco = P.Truco || {};
  const R = T.Regras, IA = T.IA, RNG = P.RNG;

  const MIN_PARTICIPANTES = 2, MAX_PARTICIPANTES = 64;

  // apelidos dos bots do torneio (fictícios); com muita gente, recebem um "Jr.", "II"...
  const APELIDOS = ['Tião', 'Dona Cida', 'Seu Juca', 'Toninho', 'Lurdinha', 'Marcão', 'Nena', 'Tonhão', 'Chico Preá', 'Bia',
    'Zé Galinha', 'Dito', 'Cleide', 'Juvenal', 'Fia', 'Bastião', 'Neguinho', 'Rosinha', 'Valdo', 'Cotinha', 'Pedrinho', 'Lazinho',
    'Jurema', 'Bené', 'Zica', 'Dorival', 'Celinha', 'Paçoca', 'Zé Mané', 'Quinzinho', 'Nhô Bento', 'Tata', 'Lindomar', 'Bebeto',
    'Dedé', 'Joca', 'Maricota', 'Nonô', 'Pituca', 'Tico-Tico', 'Zuzu', 'Biro', 'Cacá', 'Dudu', 'Fafá', 'Gegê', 'Jajá', 'Lelo',
    'Mimi', 'Nando', 'Pepe', 'Quim', 'Rubão', 'Serginho', 'Tuca', 'Vavá', 'Xandão', 'Zinho', 'Alemão', 'Baiano', 'Capixaba',
    'Gaúcho', 'Mineirinho', 'Paraná', 'Polaco', 'Japa', 'Cabeça', 'Magrelo', 'Batata', 'Pirulito', 'Torresmo', 'Pinhão',
    'Barreado', 'Cuca', 'Chimarrão', 'Quirera', 'Pamonha', 'Rapadura', 'Jabuti', 'Tatu', 'Gralha', 'Curió', 'Sabiá', 'Bem-te-vi',
    'Tucano', 'Lambari', 'Dourado', 'Pintado', 'Traíra', 'Muçum', 'Carijó', 'Garnisé', 'Peão', 'Tropeiro', 'Boiadeiro',
    'Carroceiro', 'Ferreiro', 'Sapateiro', 'Barbeiro', 'Padeiro', 'Doutor', 'Professor', 'Sargento', 'Delegado', 'Prefeito',
    'Vereador', 'Padre Zé', 'Madrinha', 'Vó Lola', 'Tia Nice', 'Seu Lauro', 'Dona Neusa', 'Seu Osvaldo', 'Dona Zefa', 'Seu Bené'];

  /** Nomes sem repetir, sorteados. */
  function sortearNomes(qtd, evitar) {
    const usados = new Set(evitar || []);
    const base = P.Baralho.embaralhar(APELIDOS.filter(x => !usados.has(x)));
    const out = [];
    const sufixos = ['', ' Jr.', ' II', ' Neto', ' III'];
    for (let s = 0; out.length < qtd && s < sufixos.length; s++) {
      for (const nome of base) { if (out.length >= qtd) break; const x = nome + sufixos[s]; if (!usados.has(x)) { usados.add(x); out.push(x); } }
    }
    for (let i = 1; out.length < qtd; i++) out.push('Jogador ' + i);
    return out;
  }

  const potencia2 = x => { let p = 1; while (p < x) p *= 2; return p; };
  const vitoriasPara = t => (t.melhorDe === 3 ? 2 : 1);

  /**
   * Novo torneio. cfg: { regras, n (2 ou 4), participantes, melhorDe (1 ou 3), nome (o seu) }.
   */
  function criar(cfg) {
    const n = cfg.n === 2 ? 2 : 4;
    const N = Math.max(MIN_PARTICIPANTES, Math.min(MAX_PARTICIPANTES, Math.round(cfg.participantes) || 8));
    const porEquipe = n === 4 ? 2 : 1;
    const nomes = sortearNomes(N * porEquipe - 1, [cfg.nome]);
    const bot = () => ({ nome: nomes.pop(), perfil: RNG.escolher(IA.LISTA_PERFIS), avatar: P.Bots && P.Bots.sortearAvatar ? P.Bots.sortearAvatar() : null });
    const participantes = [];
    for (let i = 0; i < N; i++) {
      const membros = i === 0 ? [{ nome: cfg.nome || 'Você', voce: true, avatar: null }] : [bot()];
      if (porEquipe === 2) membros.push(bot());
      participantes.push({ membros, voce: i === 0, nome: nomeEquipe(membros, i === 0) });
    }
    // chave: ordem sorteada; os byes ficam espalhados pela 1ª fase
    const tam = potencia2(N), jogos1 = tam / 2, byes = tam - N;
    const ordem = P.Baralho.embaralhar(participantes.map((_, i) => i));
    const ehBye = new Array(jogos1).fill(false);
    for (let k = 0; k < byes; k++) ehBye[Math.floor(k * jogos1 / byes)] = true;
    const rodadas = [];
    let pos = 0;
    rodadas.push(ehBye.map(bye => {
      const a = ordem[pos++], b = bye ? null : ordem[pos++];
      return { a, b, vencedor: bye ? 'a' : null, jogos: [], bye };
    }));
    for (let m = jogos1 / 2; m >= 1; m /= 2) rodadas.push(Array.from({ length: m }, () => ({ a: null, b: null, vencedor: null, jogos: [], bye: false })));
    const t = { versao: 1, regras: R.variante(cfg.regras).id, n, melhorDe: cfg.melhorDe === 3 ? 3 : 1, participantes, rodadas, eliminadoNa: null, campeao: null, criadoEm: Date.now() };
    // quem passou direto já vai para a 2ª fase
    rodadas[0].forEach((c, i) => { if (c.bye) levarAdiante(t, 0, i); });
    if (rodadas.length === 1 && rodadas[0][0].bye) t.campeao = rodadas[0][0].a;
    return t;
  }

  function nomeEquipe(membros, voce) {
    if (membros.length === 1) return voce ? 'Você' : membros[0].nome;
    return voce ? `Você e ${membros[1].nome}` : `${membros[0].nome} e ${membros[1].nome}`;
  }

  /** O vencedor do confronto (rodada r, índice i) entra na vaga dele na rodada seguinte. */
  function levarAdiante(t, r, i) {
    const c = t.rodadas[r][i];
    const venc = c.vencedor === 'a' ? c.a : c.b;
    if (r + 1 >= t.rodadas.length) { t.campeao = venc; return; }
    const prox = t.rodadas[r + 1][Math.floor(i / 2)];
    if (i % 2 === 0) prox.a = venc; else prox.b = venc;
  }

  /** Nome da fase pelo número de confrontos que ela tem (a 1ª, se tiver byes, é a "Primeira fase"). */
  function nomeRodada(t, r) {
    const m = t.rodadas[r].length;
    if (r === 0 && m > 1 && t.rodadas[0].some(c => c.bye)) return 'Primeira fase';
    if (m === 1) return 'Final';
    if (m === 2) return 'Semifinal';
    if (m === 4) return 'Quartas de final';
    if (m === 8) return 'Oitavas de final';
    return `Rodada de ${m * 2}`;
  }

  /** Placar do confronto em partidas: [vitórias de a, vitórias de b]. */
  function placarConfronto(c) {
    return [c.jogos.filter(j => j.vencedor === 'a').length, c.jogos.filter(j => j.vencedor === 'b').length];
  }

  /** Registra uma partida do confronto (rodada r, índice i). vencedor: 'a' | 'b'. */
  function registrarJogo(t, r, i, vencedor, placar) {
    const c = t.rodadas[r][i];
    if (c.vencedor) throw new Error('Torneio: confronto já decidido');
    if (c.a === null || c.b === null) throw new Error('Torneio: confronto sem os dois lados');
    c.jogos.push({ vencedor, placar: placar ? placar.slice() : null });
    const [va, vb] = placarConfronto(c);
    const precisa = vitoriasPara(t);
    if (va >= precisa || vb >= precisa) {
      c.vencedor = va >= precisa ? 'a' : 'b';
      const perdedor = c.vencedor === 'a' ? c.b : c.a;
      if (perdedor === 0) t.eliminadoNa = r;
      levarAdiante(t, r, i);
    }
    return c;
  }

  /** O seu confronto ainda em aberto: { r, i, c, lado } ou null. */
  function meuConfronto(t) {
    if (t.eliminadoNa !== null || t.campeao !== null) return null;
    for (let r = 0; r < t.rodadas.length; r++) {
      for (let i = 0; i < t.rodadas[r].length; i++) {
        const c = t.rodadas[r][i];
        if (!c.vencedor && (c.a === 0 || c.b === 0)) return { r, i, c, lado: c.a === 0 ? 'a' : 'b' };
      }
    }
    return null;
  }

  /** Rodada em andamento: a primeira com confronto sem vencedor. */
  function rodadaAtual(t) {
    for (let r = 0; r < t.rodadas.length; r++) if (t.rodadas[r].some(c => !c.vencedor)) return r;
    return t.rodadas.length - 1;
  }

  /** Confrontos que dá para simular agora (os dois lados definidos, sem você, sem vencedor), até a rodada "ate". */
  function simulaveis(t, ate) {
    const out = [];
    const limite = ate === undefined ? t.rodadas.length - 1 : ate;
    for (let r = 0; r <= limite; r++) t.rodadas[r].forEach((c, i) => {
      if (!c.vencedor && c.a !== null && c.b !== null && c.a !== 0 && c.b !== 0) out.push({ r, i });
    });
    return out;
  }

  /**
   * Uma partida entre dois participantes (bots), jogada de verdade pelo motor,
   * sem animação. rapido: menos simulações por decisão (bem mais rápido; o
   * nível de jogo cai pouco). Devolve { vencedor: 'a'|'b', placar: [a, b] }.
   */
  async function jogarEntreBots(t, a, b, rapido) {
    const pa = t.participantes[a], pb = t.participantes[b];
    const lugares = t.n === 4 ? [pa.membros[0], pb.membros[0], pa.membros[1], pb.membros[1]] : [pa.membros[0], pb.membros[0]];
    const perfis = lugares.map(x => x.perfil || 'esperto');
    const agentes = perfis.map(p => IA.criarBot(p, perfis, rapido ? { amostras: 36 } : null));
    const m = T.Motor.criar({ n: t.n, regras: t.regras, dador: RNG.inteiroAbaixo(t.n) }, agentes, {
      evento: ev => { agentes.forEach((x, j) => x.observar(ev, j % 2)); }
    });
    const r = await m.rodar();
    return { vencedor: r.vencedor === 0 ? 'a' : 'b', placar: r.placar };
  }

  /** Joga um confronto inteiro entre bots (uma partida ou melhor de 3). */
  async function simularConfronto(t, r, i, rapido) {
    const c = t.rodadas[r][i];
    while (!c.vencedor) {
      const res = await jogarEntreBots(t, c.a, c.b, rapido);
      registrarJogo(t, r, i, res.vencedor, res.placar);
    }
    return c;
  }

  /**
   * Simula os confrontos sem você até a rodada "ate" (ou até o fim, se você
   * já saiu). aoProgresso(feitos, total). Cede a tela entre as partidas.
   * parar(): se devolver true, para antes do próximo confronto.
   */
  async function simular(t, ate, aoProgresso, rapido, parar) {
    let feitos = 0;
    for (;;) {
      const lista = simulaveis(t, ate);
      if (!lista.length) break;
      const total = feitos + lista.length;
      for (const { r, i } of lista) {
        if (parar && parar()) return feitos;
        await simularConfronto(t, r, i, rapido !== false);
        feitos++;
        if (aoProgresso) aoProgresso(feitos, total);
        await new Promise(res => setTimeout(res, 0));
      }
    }
    return feitos;
  }

  /** Como foi a sua campanha: { texto, fase, campeao, vice }. */
  function campanha(t) {
    if (t.campeao === 0) return { campeao: true, texto: 'Campeão do torneio!' };
    const ult = t.rodadas.length - 1;
    if (t.eliminadoNa === ult) return { vice: true, texto: 'Vice-campeão: perdeu a final.' };
    if (t.eliminadoNa !== null) return { texto: `Eliminado ${naFase(nomeRodada(t, t.eliminadoNa))}.`, fase: t.eliminadoNa };
    const meu = meuConfronto(t);
    return { texto: meu ? `Você está ${naFase(nomeRodada(t, meu.r))}.` : 'Torneio em andamento.', fase: meu ? meu.r : null };
  }
  /** "na final", "nas quartas de final", "na rodada de 32". */
  function naFase(nome) {
    const min = nome.charAt(0).toLowerCase() + nome.slice(1);
    return (/^(quartas|oitavas)/.test(min) ? 'nas ' : 'na ') + min;
  }

  /** Você ganhou quantas partidas e perdeu quantas no torneio. */
  function seusJogos(t) {
    let v = 0, d = 0;
    t.rodadas.forEach(rod => rod.forEach(c => {
      if (c.bye || (c.a !== 0 && c.b !== 0)) return;
      const lado = c.a === 0 ? 'a' : 'b';
      c.jogos.forEach(j => { if (j.vencedor === lado) v++; else d++; });
    }));
    return { vitorias: v, derrotas: d };
  }

  T.Torneio = {
    MIN_PARTICIPANTES, MAX_PARTICIPANTES, APELIDOS,
    criar, nomeRodada, naFase, placarConfronto, registrarJogo, meuConfronto, rodadaAtual, simulaveis,
    jogarEntreBots, simularConfronto, simular, campanha, seusJogos, vitoriasPara, sortearNomes
  };
})(window.Poker = window.Poker || {});
