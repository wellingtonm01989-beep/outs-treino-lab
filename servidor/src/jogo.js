/* ==========================================================================
   OUTS · servidor — jogo.js
   Regras do Sit & Go da mesa com amigos que ficam entre as mãos: montar o
   jogo, blinds pelo relógio, começar cada mão, refazer a mão a partir das
   jogadas gravadas, eliminação, fim e premiação. A mão em si é o motor.js
   do app. Fica fora do Durable Object para ser testado direto no Node.

   O objeto "jogo" é JSON puro e vai inteiro na linha "estado" do servidor.
   Cada mão guarda o baralho já embaralhado (crypto, no começo da mão): com
   ele e a lista de jogadas, o motor refaz a mão exatamente igual depois que
   o servidor dorme (hibernação) e acorda sem nada na memória.
   ========================================================================== */
import { P } from './nucleo.js';

const E = P.Estruturas;

/** sentados: [{ token, nome, lugar }] da sala de espera. O assento no motor segue a ordem dos lugares. */
export function criarJogo(config, sentados, agora) {
  const ordem = sentados.slice().sort((a, b) => a.lugar - b.lugar);
  return {
    inicio: agora,
    duracaoNivel: E.SNG_DURACAO[config.velocidade] * 1000,
    fichasIniciais: config.fichas,
    premio: config.premio || 0,
    // divisão congelada pelo número de jogadores que começaram
    premios: config.premio ? E.valoresPremios(config.premio, E.percentuaisSNG(ordem.length)) : [],
    lugares: ordem.length,
    jogadores: ordem.map((j, assento) => ({ assento, token: j.token, nome: j.nome, fichas: config.fichas, posicao: null, desistiu: false })),
    botao: -1,
    numero: 0,
    mao: null            // { numero, nivel, cfg (do motor), baralho, prazo }
  };
}

export function nivelNoTempo(jogo, agora) {
  return Math.max(0, Math.floor((agora - jogo.inicio) / jogo.duracaoNivel));
}

/** Quem ainda está no jogo (sem colocação). */
export const restantes = jogo => jogo.jogadores.filter(j => j.posicao === null);

/** Começa a próxima mão: o botão anda, os blinds saem do relógio e o baralho é embaralhado agora. */
export function novaMao(jogo, agora) {
  const ativos = restantes(jogo).filter(j => j.fichas > 0).map(j => j.assento);
  if (ativos.length < 2) throw new Error('A mão precisa de pelo menos 2 jogadores com fichas');
  jogo.botao = jogo.botao < 0 ? P.RNG.escolher(ativos) : (ativos.find(a => a > jogo.botao) ?? ativos[0]);
  jogo.numero++;
  const nivel = nivelNoTempo(jogo, agora);
  const b = E.nivelSNGProporcional(nivel, jogo.fichasIniciais);
  jogo.mao = {
    numero: jogo.numero,
    nivel,
    cfg: {
      lugares: jogo.lugares, botao: jogo.botao, numero: jogo.numero,
      sb: b.sb, bb: b.bb, ante: b.ante, anteBB: b.anteBB,
      jogadores: ativos.map(a => ({ assento: a, id: a, nome: jogo.jogadores[a].nome, fichas: jogo.jogadores[a].fichas }))
    },
    baralho: P.Baralho.embaralhar(P.Baralho.novoOrdenado()),
    prazo: null
  };
  return motorDaMao(jogo.mao, []);
}

/**
 * Cria a mão no motor com o baralho guardado e refaz as jogadas, na ordem.
 * O motor não sorteia nada além do baralho, então o resultado é idêntico.
 * (O motor chama a ordem fixa de "baralhoDeTeste"; aqui ela é o baralho real da mão.)
 */
export function motorDaMao(mao, acoes) {
  const m = P.Motor.novaMao(Object.assign({}, mao.cfg, { baralhoDeTeste: mao.baralho }));
  acoes.forEach(a => m.agir(a.assento, a.acao));
  return m;
}

/**
 * Jogada automática de quem não responde (saiu da mesa, caiu ou estourou o prazo): fold.
 * Exceção: quem começou a mão com 1 big blind ou menos, na vez dele no small ou no big
 * blind, põe tudo (all-in) em vez de deixar as últimas fichas irem embora nos blinds.
 */
export function acaoSemResposta(m, assento) {
  const v = m.vista(assento);
  const eu = v.jogadores.find(j => j.assento === assento);
  const naBlind = assento === v.assentoSB || assento === v.assentoBB;
  if (!eu || !naBlind || eu.fichasIniciais > v.blinds.bb) return 'fold';
  const a = m.acoesValidas();
  if (a.podeApostar) return 'allin';
  return a.podeCheck ? 'check' : 'call';   // curto assim, pagar já é pôr tudo
}

/** Jogada recebida do cliente, só com o que o motor entende (ou null). */
export function acaoLimpa(a) {
  if (a === 'fold' || a === 'check' || a === 'call' || a === 'allin') return a;
  if (a && typeof a === 'object' && (a.tipo === 'bet' || a.tipo === 'raise') && Number.isInteger(a.ate) && a.ate > 0) return { tipo: a.tipo, ate: a.ate };
  return null;
}

/**
 * Fim da mão: aplica as fichas finais e tira quem saiu. Quem desistiu fica
 * com a pior colocação; entre os que ficaram sem fichas, quem começou a mão
 * com menos cai primeiro. Devolve { eliminados, fim }.
 */
export function concluirMao(jogo, m) {
  const r = m.resultado();
  Object.keys(r.fichasFinais).forEach(a => { jogo.jogadores[+a].fichas = r.fichasFinais[a]; });
  const inicial = {};
  jogo.mao.cfg.jogadores.forEach(j => { inicial[j.assento] = j.fichas; });
  const vivos = restantes(jogo);
  const saem = vivos.filter(j => j.desistiu || j.fichas === 0)
    .sort((a, b) => (b.desistiu - a.desistiu) || (inicial[a.assento] || 0) - (inicial[b.assento] || 0));
  if (saem.length === vivos.length) saem.pop();            // sempre sobra alguém para vencer
  let posicao = vivos.length;
  saem.forEach(j => { j.posicao = posicao--; j.fichas = 0; });
  jogo.mao = null;
  const fim = restantes(jogo).length === 1;
  if (fim) restantes(jogo)[0].posicao = 1;
  return { eliminados: saem, fim };
}

/** Classificação final com o prêmio de cada posição (em centavos). */
export function classificacao(jogo) {
  return jogo.jogadores.filter(j => j.posicao !== null).sort((a, b) => a.posicao - b.posicao)
    .map(j => ({ posicao: j.posicao, assento: j.assento, nome: j.nome, premio: jogo.premios[j.posicao - 1] || 0, desistiu: j.desistiu }));
}
