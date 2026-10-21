/* ==========================================================================
   OUTS · servidor — jogos/poker.js
   A partida de poker de uma mesa (Sit & Go). A sala (link, entrar, sair,
   reconexão, limpeza) fica em mesa.js; aqui fica o que é do poker: dar as
   mãos, validar as jogadas, o prazo de cada vez, sair e voltar à mesa,
   eliminação e premiação. As regras entre as mãos ficam em jogo.js e a mão
   em si é o motor.js do app.

   Gravação (regras do plano grátis, docs/plano-multiplayer.md): "estado"
   (a sala e o jogo) uma vez por mão, com o baralho da mão, e "acoes" (uma
   linha pequena) a cada jogada. Com as duas, a mão em andamento é refeita
   igualzinha quando o objeto acorda.

   Cliente → servidor: acao {numero, acao}
   Servidor → cliente: jogo (placar da partida, por jogador) · mao (eventos
                       novos + a vista de quem recebe) · fim {classificacao}
   ========================================================================== */
import * as Jogo from '../jogo.js';
import { enviar, tokenDe } from '../comum.js';

const MAX_PASSOS = 300;                      // trava do laço de jogadas automáticas

/** Valida as opções da mesa de poker; devolve { config } ou { erro }. */
export function validarConfig(c, MAX_PREMIO) {
  const lugares = c.lugares, fichas = c.fichas;
  if (!Number.isInteger(lugares) || lugares < 2 || lugares > 9) return { erro: 'A mesa precisa ter de 2 a 9 lugares.' };
  if (!Number.isInteger(fichas) || fichas < 500 || fichas > 100000) return { erro: 'Fichas iniciais inválidas.' };
  if (c.velocidade !== 'regular' && c.velocidade !== 'turbo') return { erro: 'Velocidade inválida.' };
  // prêmio total fixo em centavos, combinado pelo anfitrião (0 = sem premiação)
  const premio = c.premio === undefined ? 0 : c.premio;
  if (!Number.isInteger(premio) || premio < 0 || premio > MAX_PREMIO) return { erro: 'Premiação inválida (de R$ 0 a R$ 10.000).' };
  return { config: { jogo: 'poker', lugares, fichas, velocidade: c.velocidade, premio, bots: c.bots === true } };
}

export class PokerSNG {
  constructor(mesa) {
    this.mesa = mesa;
    this.mao = null;          // mão em andamento no motor (refeita ao acordar)
    this.acoes = null;        // { numero, lista: [{assento, acao}], prazo }
    this.prazo = null;        // quando acaba a vez de quem está jogando agora
    this.enviados = 0;        // eventos da mão já transmitidos
  }

  get estado() { return this.mesa.estado; }

  /** O que a sala mostra das opções (nada de segredos). */
  configPublica(c) { return { jogo: 'poker', modo: 'sng', lugares: c.lugares, fichas: c.fichas, velocidade: c.velocidade, premio: c.premio || 0 }; }

  /** Pode começar? Devolve o texto do erro, ou null. */
  podeComecar(jogadores) { return jogadores.length < 2 ? 'Precisa de pelo menos 2 jogadores sentados.' : null; }

  /** Depois de começar, entra gente nova? (só no cash game) */
  aceitaNovos() { return false; }

  /** Acordou: refaz a mão em andamento a partir do baralho guardado e das jogadas. */
  acordar(salvo) {
    const acoes = salvo.get('acoes');
    const jogo = this.estado && this.estado.status === 'jogando' && this.estado.jogo;
    if (!jogo || !jogo.mao) return;
    const desta = acoes && acoes.numero === jogo.mao.numero;
    this.acoes = desta ? acoes : { numero: jogo.mao.numero, lista: [], prazo: null };
    this.mao = Jogo.motorDaMao(jogo.mao, this.acoes.lista);
    this.prazo = desta && this.acoes.lista.length ? this.acoes.prazo : jogo.mao.prazo;
    this.enviados = this.mao.totalEventos();
  }

  async comecar() {
    const e = this.estado;
    e.jogo = Jogo.criarJogo(e.config, e.jogadores, Date.now());
    this.iniciarMao();
    await this.mesa.salvar();
    this.mesa.transmitirSala();
    this.transmitirJogo();
    await this.avancar();
  }

  /** O alarme tocou com a partida em andamento: acabou o prazo de quem está na vez? */
  async alarme() {
    if (this.mao && !this.mao.terminada() && this.prazo && Date.now() >= this.prazo - 250) {
      const vez = this.mao.vez();
      await this.registrarAcao(vez, Jogo.acaoSemResposta(this.mao, vez));
    }
    await this.avancar();
  }

  async mensagem(ws, msg) {
    if (msg.tipo === 'acao') return this.acao(ws, msg);
    return this.mesa.erro(ws, 'tipo', 'Mensagem desconhecida.');
  }

  /**
   * Durante a partida, sair não é desistir: o jogador fica "fora" (a mesa passa ou larga
   * por ele na hora, em todas as mãos) e volta quando quiser enquanto a partida não
   * terminar. A conexão continua aberta (ele segue vendo a sala e pode voltar por ela).
   */
  async sair(ws, j) {
    const jj = this.estado.status === 'jogando' && this.jogadorDoJogo(j.token);
    if (!jj) return this.mesa.fecharConexao(ws, 1000, 'saiu');
    if (jj.posicao === null && !jj.fora) {
      jj.fora = true;
      await this.mesa.salvar();
      this.transmitirJogo();
      await this.avancar();
    }
  }

  async acao(ws, msg) {
    const e = this.estado;
    const j = e.status === 'jogando' && this.jogadorDoJogo(tokenDe(ws));
    if (!j) return this.mesa.erro(ws, 'acao', 'Você não está jogando esta partida.');
    const m = this.mao;
    const acao = Jogo.acaoLimpa(msg.acao);
    if (!m || m.terminada() || msg.numero !== m.numero || m.vez() !== j.assento || !acao) {
      this.mesa.erro(ws, 'acao', 'Não é a sua vez.');
      return this.enviarMao(ws, j.assento, this.enviados, []);
    }
    try {
      await this.registrarAcao(j.assento, acao);
    } catch (err) {
      if (!err.doMotor) throw err;
      this.mesa.erro(ws, 'acao', 'Jogada inválida: ' + err.message);
      return this.enviarMao(ws, j.assento, this.enviados, []);
    }
    await this.avancar();
  }

  /** Aplica a jogada no motor e grava (uma linha pequena) junto com o prazo da próxima vez. */
  async registrarAcao(assento, acao) {
    this.mao.agir(assento, acao);
    this.acoes.lista.push({ assento, acao });
    this.prazo = this.mao.terminada() ? null : Date.now() + this.mesa.tempoAcao + this.mesa.folgas.acao;
    this.acoes.prazo = this.prazo;
    await this.mesa.ctx.storage.put('acoes', this.acoes);
  }

  /** Começa a próxima mão (quem chama grava o estado: o baralho vai junto). */
  iniciarMao() {
    const jogo = this.estado.jogo;
    this.mao = Jogo.novaMao(jogo, Date.now());
    this.prazo = Date.now() + this.mesa.tempoAcao + this.mesa.folgas.mao;
    jogo.mao.prazo = this.prazo;
    this.acoes = { numero: jogo.mao.numero, lista: [], prazo: this.prazo };
    this.enviados = 0;
  }

  /**
   * Faz o jogo andar até precisar de alguém: jogadas automáticas de quem
   * desistiu, fim de mão, eliminação, próxima mão. Para (pausa) se
   * não houver ninguém jogando conectado, para não rodar mãos sozinho.
   */
  async avancar() {
    const e = this.estado;
    for (let passo = 0; passo < MAX_PASSOS && e.status === 'jogando'; passo++) {
      if (!this.mao) {   // pausada entre mãos: volta quando alguém estiver presente
        if (!this.alguemPresente()) return;
        this.iniciarMao();
        await this.mesa.salvar();
        this.transmitirJogo();
        continue;
      }
      if (!this.mao.terminada()) {
        const vez = this.mao.vez();
        // Todo mundo tem o mesmo prazo, inclusive quem saiu da mesa ou caiu: a mesa espera
        // o tempo acabar e só então joga por ele (fold, ou all-in com 1 BB ou menos; ver alarme)
        if (e.jogo.jogadores[vez].desistiu) { await this.registrarAcao(vez, 'fold'); continue; }
        this.transmitirMao();
        await this.mesa.agendarAlarme(this.prazo);
        return;
      }
      // fim da mão: últimos eventos, eliminações e a próxima mão (ou o fim)
      this.transmitirMao();
      const r = Jogo.concluirMao(e.jogo, this.mao);
      this.mao = null;
      if (r.fim) return this.terminar();
      if (!this.alguemPresente()) {
        await this.mesa.salvar();
        this.transmitirJogo();
        return;
      }
      this.iniciarMao();
      await this.mesa.salvar();
      this.transmitirJogo();
    }
    // muitas jogadas automáticas seguidas: continua daqui a pouco pelo alarme
    if (e.status === 'jogando') await this.mesa.agendarAlarme(Date.now() + 1000);
  }

  async terminar() {
    const e = this.estado;
    e.classificacao = Jogo.classificacao(e.jogo);
    this.mao = null;
    await this.mesa.terminar();
    this.transmitirJogo();
    const fim = this.msgFim();
    this.mesa.abertos().forEach(ws => enviar(ws, fim));
    this.mesa.transmitirSala();
  }

  /**
   * Jogador sentado que (re)conecta: recebe a partida como ela está e, se estava pausada, ela volta.
   * voltar: ele pediu para voltar à mesa (botão); a reconexão automática não tira ninguém de "fora".
   */
  async colocar(ws, j, voltar) {
    const e = this.estado;
    const jj = this.jogadorDoJogo(j.token);
    if (!jj) return;
    if (voltar && jj.fora && e.status === 'jogando') {
      jj.fora = false;
      await this.mesa.salvar();
      this.transmitirJogo();
    }
    enviar(ws, this.msgJogo(jj.assento));
    if (e.status === 'fim') return enviar(ws, this.msgFim());
    if (this.mao) {
      this.enviarMao(ws, jj.assento, 0, this.mao.eventos());
      // se todos tinham saído, o alarme do abandono tomou o lugar do prazo da vez: volta o prazo
      await this.mesa.agendarAlarme(this.prazo);
    } else await this.avancar();
  }

  // ------------------------------------------------------- mensagens do jogo
  /** Eventos novos da mão para cada jogador conectado, com a vista dele. */
  transmitirMao() {
    const m = this.mao;
    if (!m) return;
    const evs = m.eventos();
    if (evs.length === this.enviados) return;
    const desde = this.enviados, novos = evs.slice(desde);
    this.enviados = evs.length;
    for (const ws of this.mesa.abertos()) {
      const j = this.jogadorDoJogo(tokenDe(ws));
      if (j) this.enviarMao(ws, j.assento, desde, novos);
    }
  }

  enviarMao(ws, assento, desde, eventos) {
    const m = this.mao;
    if (!m) return;
    const vista = m.vista(assento);
    delete vista.eventos;          // os eventos vão à parte, só os novos
    enviar(ws, { tipo: 'mao', numero: m.numero, desde, eventos, vista, prazo: !m.terminada() && this.prazo ? Math.max(0, this.prazo - Date.now()) : null });
  }

  transmitirJogo() {
    for (const ws of this.mesa.abertos()) {
      const j = this.jogadorDoJogo(tokenDe(ws));
      if (j) enviar(ws, this.msgJogo(j.assento));
    }
  }

  /** Placar da partida visto por um jogador (nada de cartas aqui). */
  msgJogo(assento) {
    const jogo = this.estado.jogo, con = this.mesa.conectados();
    return {
      tipo: 'jogo', codigo: this.estado.codigo, meuAssento: assento, lugares: jogo.lugares,
      inicio: jogo.inicio, agora: Date.now(), duracaoNivel: jogo.duracaoNivel, velocidade: this.estado.config.velocidade,
      fichasIniciais: jogo.fichasIniciais, premio: jogo.premio, premios: jogo.premios, numero: jogo.numero,
      pausada: this.estado.status === 'jogando' && !this.mao,
      terminada: this.estado.status === 'fim',
      jogadores: jogo.jogadores.map(j => ({ assento: j.assento, nome: j.nome, fichas: j.fichas, posicao: j.posicao, desistiu: j.desistiu, fora: !!j.fora, conectado: con.has(j.token) }))
    };
  }

  msgFim() { return { tipo: 'fim', classificacao: this.estado.classificacao, premio: this.estado.config.premio || 0 }; }

  jogadorDoJogo(token) {
    const jogo = this.estado && this.estado.jogo;
    return token && jogo ? jogo.jogadores.find(j => j.token === token) || null : null;
  }

  /** Alguém que ainda está no jogo está sentado à mesa (conectado e sem ter saído)? */
  alguemPresente() {
    const con = this.mesa.conectados();
    return Jogo.restantes(this.estado.jogo).some(j => !j.desistiu && !j.fora && con.has(j.token));
  }
}
