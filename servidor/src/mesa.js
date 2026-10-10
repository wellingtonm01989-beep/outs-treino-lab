/* ==========================================================================
   OUTS · servidor — mesa.js
   Durable Object "Mesa": uma instância por link. Cuida da sala de espera
   (quem está sentado, quem é o anfitrião, quem está conectado) e da partida:
   embaralha, guarda o baralho, manda a cada jogador só a própria vista,
   valida as jogadas, controla o prazo de cada vez e termina com a premiação.
   As regras entre as mãos ficam em jogo.js; a mão em si é o motor.js do app.

   Regras para caber no plano grátis (docs/plano-multiplayer.md):
   - WebSocket pela Hibernation API (ctx.acceptWebSocket); pings respondidos
     por setWebSocketAutoResponse, sem acordar o objeto.
   - Nada de setTimeout: o que espera tempo usa o alarme (um só por mesa,
     remarcado só quando ele toca; ver agendarAlarme).
   - "estado" (uma linha) é gravado quando a sala muda e uma vez por mão (com
     o baralho da mão); "acoes" (uma linha pequena) a cada jogada. Com as
     duas, a mão em andamento é refeita igualzinha quando o objeto acorda.
   - Blinds pelo relógio no começo de cada mão; animações e pausas no cliente.

   Cliente → servidor: entrar {nome, token?, voltar?} · sair · comecar (anfitrião)
                       acao {numero, acao}
   Depois que a partida começa, ninguém novo senta, mas quem estava nela volta
   pelo token ou pelo mesmo nome. "sair" no meio da partida deixa o jogador
   fora da mesa (jogadas automáticas) até ele pedir para voltar (voltar: true).
   Servidor → cliente: sala · voce · erro {motivo, texto} · encerrada
                       jogo (placar da partida, por jogador) · mao (eventos
                       novos + a vista de quem recebe) · fim {classificacao}
   ========================================================================== */
import { DurableObject } from 'cloudflare:workers';
import { tokenNovo } from './nucleo.js';
import * as Jogo from './jogo.js';

const ABANDONO_MS = 30 * 60 * 1000;          // mesa sem ninguém conectado é apagada depois disso
const VIDA_ESPERA_MS = 12 * 60 * 60 * 1000;  // sala de espera que nunca começa é apagada depois disso
const FIM_MS = 10 * 60 * 1000;               // depois do fim, o resultado fica disponível por 10 min
const TEMPO_ACAO_MS = 30000;                 // prazo de cada jogada
const FOLGA_MAO_MS = 8000;                   // + animação do fim da mão anterior e da distribuição
const FOLGA_ACAO_MS = 3000;                  // + animação da jogada anterior
const MAX_PASSOS = 300;                      // trava do laço de jogadas automáticas
const MAX_MENSAGEM = 1024;                   // caracteres por mensagem
const MAX_MSGS = 20, JANELA_MSGS_MS = 10000; // no máximo 20 mensagens a cada 10 s por conexão
const TAM_NOME = 18;

// códigos de fechamento da conexão (4000–4999 são livres para o app)
const FECHA = { OUTRA_ABA: 4001, EXCESSO: 4008, INEXISTENTE: 4404, ENCERRADA: 4410 };
const ABERTA = 1;   // WebSocket.readyState

const TEXTO_FIM = {
  cancelada: 'O anfitrião cancelou a mesa.',
  abandonada: 'A mesa ficou vazia e foi apagada.',
  expirada: 'A mesa ficou tempo demais esperando e foi apagada.',
  terminada: 'A partida terminou e a mesa foi apagada.'
};

function enviar(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* conexão já caiu */ } }
function fechar(ws, codigo, motivo) { try { ws.close(codigo, motivo); } catch (e) { /* já fechada */ } }
const tokenDe = ws => (ws.deserializeAttachment() || {}).token || null;

/** Nome limpo (sem caracteres de controle/invisíveis, espaços simples) ou null se inválido. */
function limparNome(bruto) {
  if (typeof bruto !== 'string') return null;
  const s = bruto.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  const n = Array.from(s).length;
  return n >= 1 && n <= TAM_NOME ? s : null;
}

export class Mesa extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // { codigo, config, status: espera|jogando|fim, criadaEm, tokenAnfitriao,
    //   jogadores: [{ token, nome, lugar, anfitriao }], jogo (jogo.js), classificacao }
    this.estado = null;
    this.mao = null;          // mão em andamento no motor (refeita ao acordar)
    this.acoes = null;        // { numero, lista: [{assento, acao}], prazo }
    this.prazo = null;        // quando acaba a vez de quem está jogando agora
    this.enviados = 0;        // eventos da mão já transmitidos
    this.ausentes = new Set();// assentos que caíram e perderam a vez: jogam no automático até voltar
    this.ritmo = new Map();   // ws → { inicio, n }: contagem de mensagens (só em memória)
    // os testes encurtam os tempos pelo wrangler dev --var
    this.abandonoMs = +env.ABANDONO_MS || ABANDONO_MS;
    this.tempoAcao = +env.TEMPO_ACAO_MS || TEMPO_ACAO_MS;
    this.folgas = env.TEMPO_ACAO_MS ? { mao: 0, acao: 0 } : { mao: FOLGA_MAO_MS, acao: FOLGA_ACAO_MS };
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const salvo = await ctx.storage.get(['estado', 'acoes']);
      this.estado = salvo.get('estado') || null;
      this.refazerMao(salvo.get('acoes'));
    });
  }

  /** Acordou: refaz a mão em andamento a partir do baralho guardado e das jogadas. */
  refazerMao(acoes) {
    const jogo = this.estado && this.estado.status === 'jogando' && this.estado.jogo;
    if (!jogo || !jogo.mao) return;
    const desta = acoes && acoes.numero === jogo.mao.numero;
    this.acoes = desta ? acoes : { numero: jogo.mao.numero, lista: [], prazo: null };
    this.mao = Jogo.motorDaMao(jogo.mao, this.acoes.lista);
    this.prazo = desta && this.acoes.lista.length ? this.acoes.prazo : jogo.mao.prazo;
    this.enviados = this.mao.totalEventos();
  }

  async salvar() { await this.ctx.storage.put('estado', this.estado); }

  // ------------------------------------------------------- chamado pelo Worker
  /** Cria a mesa. Devolve o token do anfitrião, ou null se o código já está em uso. */
  async criar(codigo, config) {
    if (this.estado) return null;
    this.estado = { codigo, config, status: 'espera', criadaEm: Date.now(), tokenAnfitriao: tokenNovo(), jogadores: [] };
    await this.salvar();
    await this.ctx.storage.setAlarm(Date.now() + this.abandonoMs);   // se ninguém entrar, a mesa some
    return this.estado.tokenAnfitriao;
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Esperado WebSocket.', { status: 426 });
    const [cliente, ws] = Object.values(new WebSocketPair());
    if (!this.estado) {
      // O navegador não vê o status HTTP de um WebSocket recusado: aceita, explica e fecha.
      // Conexão comum (sem hibernação): ela morre aqui mesmo e não fica presa ao objeto.
      ws.accept();
      enviar(ws, { tipo: 'erro', motivo: 'inexistente', texto: 'Essa mesa não existe ou já terminou.' });
      fechar(ws, FECHA.INEXISTENTE, 'mesa inexistente');
      return new Response(null, { status: 101, webSocket: cliente });
    }
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ token: null });
    enviar(ws, this.sala());   // quem abre o link já vê quem está na mesa antes de entrar
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // ------------------------------------------------------------ WebSocket
  async webSocketMessage(ws, dados) {
    if (typeof dados !== 'string' || dados.length > MAX_MENSAGEM) return fechar(ws, 1009, 'mensagem grande demais');
    if (this.excesso(ws)) return fechar(ws, FECHA.EXCESSO, 'mensagens demais');
    if (!this.estado) return fechar(ws, FECHA.INEXISTENTE, 'mesa inexistente');
    let msg = null;
    try { msg = JSON.parse(dados); } catch (e) { /* abaixo */ }
    if (!msg || typeof msg !== 'object') return this.erro(ws, 'formato', 'Mensagem inválida.');
    if (msg.tipo === 'entrar') return this.entrar(ws, msg);
    if (msg.tipo === 'sair') return this.sair(ws);
    if (msg.tipo === 'comecar') return this.comecar(ws);
    if (msg.tipo === 'acao') return this.acao(ws, msg);
    return this.erro(ws, 'tipo', 'Mensagem desconhecida.');
  }

  async webSocketClose(ws) {
    this.ritmo.delete(ws);
    fechar(ws, 1000, 'tchau');   // completa o fechamento do lado do servidor
    if (!this.estado) return;
    if (tokenDe(ws)) this.transmitirSala(ws);
    // ficou sem ninguém conectado: se ninguém voltar, o alarme apaga a mesa
    // (no fim da partida o alarme do fim já está marcado)
    if (this.estado.status !== 'fim' && !this.abertos(ws).length) await this.ctx.storage.setAlarm(Date.now() + this.abandonoMs);
  }

  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    const e = this.estado;
    if (!e) return;
    if (e.status === 'fim') return this.encerrar('terminada');
    if (!this.abertos().length) return this.encerrar('abandonada');
    if (e.status === 'espera') {
      const limite = e.criadaEm + VIDA_ESPERA_MS;
      if (Date.now() >= limite) return this.encerrar('expirada');
      return this.ctx.storage.setAlarm(limite);
    }
    // jogando: acabou o prazo de quem está na vez?
    if (this.mao && !this.mao.terminada() && this.prazo && Date.now() >= this.prazo - 250) {
      const vez = this.mao.vez();
      // caiu a conexão: as próximas vezes dele são automáticas até ele voltar
      if (!this.conectados().has(e.jogo.jogadores[vez].token)) this.ausentes.add(vez);
      await this.registrarAcao(vez, Jogo.acaoAutomatica(this.mao));
    }
    await this.avancar();
  }

  // ------------------------------------------------------- sala de espera
  async entrar(ws, msg) {
    const e = this.estado;
    // esta conexão já está sentada: só repete quem ela é (e o estado da partida)
    const atual = tokenDe(ws) && e.jogadores.find(x => x.token === tokenDe(ws));
    if (atual) { enviar(ws, this.voce(atual)); return this.colocarNaPartida(ws, atual, msg.voltar === true); }

    const token = typeof msg.token === 'string' ? msg.token : '';
    let j = token ? e.jogadores.find(x => x.token === token) : null;
    if (!j) {
      const nome = limparNome(msg.nome);
      if (!nome) return this.erro(ws, 'nome', `Digite um nome de 1 a ${TAM_NOME} caracteres.`);
      const chave = nome.toLocaleLowerCase('pt-BR');
      const mesmoNome = e.jogadores.find(x => x.nome.toLocaleLowerCase('pt-BR') === chave);
      if (e.status !== 'espera') {
        // partida começada: quem já estava nela volta para o mesmo lugar pelo nome
        // (fechou a aba, trocou de aparelho…), desde que não esteja conectado agora
        if (!mesmoNome) return this.erro(ws, 'comecou', 'A partida já começou e ninguém nela tem esse nome. Para voltar ao seu lugar, digite o mesmo nome com que você entrou.');
        if (this.conectados().has(mesmoNome.token)) return this.erro(ws, 'conectado', `${mesmoNome.nome} está na mesa agora, em outra aba ou aparelho. Se for você, feche a outra e tente de novo.`);
        return this.sentarComo(ws, mesmoNome, msg);
      }
      if (mesmoNome) return this.erro(ws, 'nome-repetido', 'Já tem alguém com esse nome na mesa.');
      // o lugar 0 fica guardado para o anfitrião
      const anfitriao = !!token && token === e.tokenAnfitriao;
      const lugar = anfitriao ? 0 : this.lugarLivre();
      if (lugar < 0) return this.erro(ws, 'cheia', 'A mesa está cheia.');
      j = { token: anfitriao ? token : tokenNovo(), nome, lugar, anfitriao };
      e.jogadores.push(j);
      await this.salvar();
    }
    return this.sentarComo(ws, j, msg);
  }

  /** Esta conexão passa a ser o jogador j (novo, voltando pelo token ou pelo nome). */
  async sentarComo(ws, j, msg) {
    // o mesmo jogador aberto em outra aba: fica valendo a conexão nova
    for (const outro of this.ctx.getWebSockets()) {
      if (outro !== ws && tokenDe(outro) === j.token) {
        outro.serializeAttachment({ token: null });
        enviar(outro, { tipo: 'erro', motivo: 'outra-aba', texto: 'Essa mesa foi aberta em outra aba ou aparelho.' });
        fechar(outro, FECHA.OUTRA_ABA, 'aberta em outra aba');
      }
    }
    ws.serializeAttachment({ token: j.token });
    enviar(ws, this.voce(j));
    this.transmitirSala();
    await this.colocarNaPartida(ws, j, msg.voltar === true);
  }

  async sair(ws) {
    const e = this.estado;
    const j = e.jogadores.find(x => x.token === tokenDe(ws));
    if (!j) return fechar(ws, 1000, 'saiu');
    if (e.status === 'espera') {
      if (j.anfitriao) return this.encerrar('cancelada');
      e.jogadores = e.jogadores.filter(x => x !== j);
      await this.salvar();
      ws.serializeAttachment({ token: null });
      fechar(ws, 1000, 'saiu');
      return this.transmitirSala(ws);
    }
    // durante a partida, sair não é desistir: o jogador fica "fora" (a mesa passa ou larga
    // por ele na hora, em todas as mãos) e volta quando quiser enquanto a partida não
    // terminar. A conexão continua aberta (ele segue vendo a sala e pode voltar por ela).
    const jj = e.status === 'jogando' && this.jogadorDoJogo(j.token);
    if (!jj) return fechar(ws, 1000, 'saiu');
    if (jj.posicao === null && !jj.fora) {
      jj.fora = true;
      await this.salvar();
      this.transmitirJogo();
      await this.avancar();
    }
  }

  // --------------------------------------------------------------- partida
  async comecar(ws) {
    const e = this.estado;
    const eu = e.jogadores.find(x => x.token === tokenDe(ws));
    if (!eu || !eu.anfitriao) return this.erro(ws, 'comecar', 'Só o anfitrião começa a partida.');
    if (e.status !== 'espera') return this.erro(ws, 'comecar', 'A partida já começou.');
    if (e.jogadores.length < 2) return this.erro(ws, 'comecar', 'Precisa de pelo menos 2 jogadores sentados.');
    e.status = 'jogando';
    e.jogo = Jogo.criarJogo(e.config, e.jogadores, Date.now());
    this.ausentes = new Set();
    this.iniciarMao();
    await this.salvar();
    this.transmitirSala();
    this.transmitirJogo();
    await this.avancar();
  }

  async acao(ws, msg) {
    const e = this.estado;
    const j = e.status === 'jogando' && this.jogadorDoJogo(tokenDe(ws));
    if (!j) return this.erro(ws, 'acao', 'Você não está jogando esta partida.');
    this.ausentes.delete(j.assento);
    const m = this.mao;
    const acao = Jogo.acaoLimpa(msg.acao);
    if (!m || m.terminada() || msg.numero !== m.numero || m.vez() !== j.assento || !acao) {
      this.erro(ws, 'acao', 'Não é a sua vez.');
      return this.enviarMao(ws, j.assento, this.enviados, []);
    }
    try {
      await this.registrarAcao(j.assento, acao);
    } catch (err) {
      if (!err.doMotor) throw err;
      this.erro(ws, 'acao', 'Jogada inválida: ' + err.message);
      return this.enviarMao(ws, j.assento, this.enviados, []);
    }
    await this.avancar();
  }

  /** Aplica a jogada no motor e grava (uma linha pequena) junto com o prazo da próxima vez. */
  async registrarAcao(assento, acao) {
    this.mao.agir(assento, acao);
    this.acoes.lista.push({ assento, acao });
    this.prazo = this.mao.terminada() ? null : Date.now() + this.tempoAcao + this.folgas.acao;
    this.acoes.prazo = this.prazo;
    await this.ctx.storage.put('acoes', this.acoes);
  }

  /** Começa a próxima mão (quem chama grava o estado: o baralho vai junto). */
  iniciarMao() {
    const jogo = this.estado.jogo;
    this.mao = Jogo.novaMao(jogo, Date.now());
    this.prazo = Date.now() + this.tempoAcao + this.folgas.mao;
    jogo.mao.prazo = this.prazo;
    this.acoes = { numero: jogo.mao.numero, lista: [], prazo: this.prazo };
    this.enviados = 0;
  }

  /**
   * Faz o jogo andar até precisar de alguém: jogadas automáticas de quem
   * desistiu ou caiu, fim de mão, eliminação, próxima mão. Para (pausa) se
   * não houver ninguém jogando conectado, para não rodar mãos sozinho.
   */
  async avancar() {
    const e = this.estado;
    for (let passo = 0; passo < MAX_PASSOS && e.status === 'jogando'; passo++) {
      if (!this.mao) {   // pausada entre mãos: volta quando alguém estiver presente
        if (!this.alguemPresente()) return;
        this.iniciarMao();
        await this.salvar();
        this.transmitirJogo();
        continue;
      }
      if (!this.mao.terminada()) {
        const vez = this.mao.vez();
        const j = e.jogo.jogadores[vez];
        // saiu da mesa, ou caiu e perdeu a vez (até reconectar)
        const fora = j.fora || (this.ausentes.has(vez) && !this.conectados().has(j.token));
        if (j.desistiu || fora) {
          await this.registrarAcao(vez, j.desistiu ? 'fold' : Jogo.acaoAutomatica(this.mao));
          continue;
        }
        this.transmitirMao();
        await this.agendarAlarme(this.prazo);
        return;
      }
      // fim da mão: últimos eventos, eliminações e a próxima mão (ou o fim)
      this.transmitirMao();
      const r = Jogo.concluirMao(e.jogo, this.mao);
      r.eliminados.forEach(j => this.ausentes.delete(j.assento));
      this.mao = null;
      if (r.fim) return this.terminar();
      if (!this.alguemPresente()) {
        await this.salvar();
        this.transmitirJogo();
        return;
      }
      this.iniciarMao();
      await this.salvar();
      this.transmitirJogo();
    }
    // muitas jogadas automáticas seguidas: continua daqui a pouco pelo alarme
    if (e.status === 'jogando') await this.agendarAlarme(Date.now() + 1000);
  }

  async terminar() {
    const e = this.estado;
    e.status = 'fim';
    e.classificacao = Jogo.classificacao(e.jogo);
    this.mao = null;
    await this.salvar();
    await this.ctx.storage.setAlarm(Date.now() + FIM_MS);
    this.transmitirJogo();
    const fim = this.msgFim();
    this.abertos().forEach(ws => enviar(ws, fim));
    this.transmitirSala();
  }

  /**
   * Um único alarme: só marca se não houver nenhum ou se o marcado for depois.
   * Quando ele toca e a vez ainda não acabou, é remarcado para o prazo atual.
   */
  async agendarAlarme(quando) {
    if (!quando) return;
    const atual = await this.ctx.storage.getAlarm();
    if (atual === null || atual > quando) await this.ctx.storage.setAlarm(quando);
  }

  /**
   * Jogador sentado que (re)conecta: recebe a partida como ela está e, se estava pausada, ela volta.
   * voltar: ele pediu para voltar à mesa (botão); a reconexão automática não tira ninguém de "fora".
   */
  async colocarNaPartida(ws, j, voltar) {
    const e = this.estado;
    if (e.status === 'espera') return;
    const jj = this.jogadorDoJogo(j.token);
    if (!jj) return;
    if (voltar && jj.fora && e.status === 'jogando') {
      jj.fora = false;
      await this.salvar();
      this.transmitirJogo();
    }
    enviar(ws, this.msgJogo(jj.assento));
    if (e.status === 'fim') return enviar(ws, this.msgFim());
    this.ausentes.delete(jj.assento);
    if (this.mao) this.enviarMao(ws, jj.assento, 0, this.mao.eventos());
    else await this.avancar();
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
    for (const ws of this.abertos()) {
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
    for (const ws of this.abertos()) {
      const j = this.jogadorDoJogo(tokenDe(ws));
      if (j) enviar(ws, this.msgJogo(j.assento));
    }
  }

  /** Placar da partida visto por um jogador (nada de cartas aqui). */
  msgJogo(assento) {
    const jogo = this.estado.jogo, con = this.conectados();
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

  // ------------------------------------------------------------ comuns
  /** Fim da mesa: avisa todo mundo, fecha as conexões e apaga tudo (o link deixa de funcionar). */
  async encerrar(motivo) {
    for (const ws of this.ctx.getWebSockets()) {
      enviar(ws, { tipo: 'encerrada', motivo, texto: TEXTO_FIM[motivo] });
      fechar(ws, FECHA.ENCERRADA, motivo);
    }
    this.estado = null;
    this.mao = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  erro(ws, motivo, texto) { enviar(ws, { tipo: 'erro', motivo, texto }); }

  voce(j) { return { tipo: 'voce', lugar: j.lugar, token: j.token, anfitriao: j.anfitriao }; }

  jogadorDoJogo(token) {
    const jogo = this.estado && this.estado.jogo;
    return token && jogo ? jogo.jogadores.find(j => j.token === token) || null : null;
  }

  /** Tokens com conexão aberta agora. */
  conectados(excluir) { return new Set(this.abertos(excluir).map(tokenDe).filter(Boolean)); }

  /** Alguém que ainda está no jogo está sentado à mesa (conectado e sem ter saído)? */
  alguemPresente() {
    const con = this.conectados();
    return Jogo.restantes(this.estado.jogo).some(j => !j.desistiu && !j.fora && con.has(j.token));
  }

  excesso(ws) {
    const agora = Date.now();
    let r = this.ritmo.get(ws);
    if (!r || agora - r.inicio > JANELA_MSGS_MS) { r = { inicio: agora, n: 0 }; this.ritmo.set(ws, r); }
    return ++r.n > MAX_MSGS;
  }

  lugarLivre() {
    const ocupados = new Set(this.estado.jogadores.map(j => j.lugar));
    for (let l = 1; l < this.estado.config.lugares; l++) if (!ocupados.has(l)) return l;
    return -1;
  }

  /** Conexões abertas (menos a que está fechando agora, se houver). */
  abertos(excluir) {
    return this.ctx.getWebSockets().filter(w => w !== excluir && w.readyState === ABERTA);
  }

  /** O que todos veem da sala. Nunca inclui os tokens. */
  sala(excluir) {
    const e = this.estado;
    const conectados = this.conectados(excluir);
    return {
      tipo: 'sala', codigo: e.codigo, status: e.status,
      config: { lugares: e.config.lugares, fichas: e.config.fichas, velocidade: e.config.velocidade, premio: e.config.premio || 0 },
      jogadores: e.jogadores.slice().sort((a, b) => a.lugar - b.lugar)
        .map(j => ({ lugar: j.lugar, nome: j.nome, anfitriao: j.anfitriao, conectado: conectados.has(j.token) }))
    };
  }

  transmitirSala(excluir) {
    const m = this.sala(excluir);
    this.abertos(excluir).forEach(ws => enviar(ws, m));
  }
}
