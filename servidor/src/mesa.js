/* ==========================================================================
   OUTS · servidor — mesa.js
   Durable Object "Mesa": uma instância por link. Cuida da sala (quem está
   sentado, quem é o anfitrião, quem está conectado, entrar, sair, trocar de
   lugar, reconexão e limpeza da mesa abandonada) e entrega a partida ao jogo
   escolhido na criação (config.jogo):
     poker  (jogos/poker.js: Sit & Go; jogos/cash.js: cash game)
     truco, ultima (jogos/cartas.js, com as regras de jogos/truco.js e jogos/ultima.js)

   Regras para caber no plano grátis (docs/plano-multiplayer.md):
   - WebSocket pela Hibernation API (ctx.acceptWebSocket); pings respondidos
     por setWebSocketAutoResponse, sem acordar o objeto.
   - Nada de setTimeout: o que espera tempo usa o alarme (um só por mesa,
     remarcado só quando ele toca; ver agendarAlarme).
   - "estado" (uma linha) é gravado quando a sala muda e no começo de cada
     mão; o jogo grava mais uma linha pequena por jogada. Com elas, a mão em
     andamento é refeita igualzinha quando o objeto acorda.
   - Animações e pausas no cliente.

   Cliente → servidor: entrar {nome, token?, voltar?} · sair · comecar (anfitrião)
                       lugar {lugar} (trocar de lugar na sala de espera)
                       + as mensagens do jogo (acao, decisao…)
   Depois que a partida começa, ninguém novo senta (a não ser no cash game),
   mas quem estava nela volta pelo token ou pelo mesmo nome.
   Servidor → cliente: sala · voce · erro {motivo, texto} · encerrada
                       + as mensagens do jogo
   ========================================================================== */
import { DurableObject } from 'cloudflare:workers';
import { tokenNovo } from './nucleo.js';
import { enviar, fechar, tokenDe, limparNome, TAM_NOME } from './comum.js';
import { criarPartida } from './jogos/index.js';

const ABANDONO_MS = 30 * 60 * 1000;          // mesa sem ninguém conectado é apagada depois disso
const VIDA_ESPERA_MS = 12 * 60 * 60 * 1000;  // sala de espera que nunca começa é apagada depois disso
const FIM_MS = 10 * 60 * 1000;               // depois do fim, o resultado fica disponível por 10 min
const TEMPO_ACAO_MS = 30000;                 // prazo de cada jogada
const GRACA_MS = 5000;                       // + 5 s além do tempo normal (cobre também as animações)
const MAX_MENSAGEM = 1024;                   // caracteres por mensagem
const MAX_MSGS = 30, JANELA_MSGS_MS = 10000; // no máximo 30 mensagens a cada 10 s por conexão

// códigos de fechamento da conexão (4000–4999 são livres para o app)
const FECHA = { OUTRA_ABA: 4001, EXCESSO: 4008, INEXISTENTE: 4404, ENCERRADA: 4410 };
const ABERTA = 1;   // WebSocket.readyState

const TEXTO_FIM = {
  cancelada: 'O anfitrião cancelou a mesa.',
  abandonada: 'A mesa ficou vazia e foi apagada.',
  expirada: 'A mesa ficou tempo demais esperando e foi apagada.',
  terminada: 'A partida terminou e a mesa foi apagada.'
};

export class Mesa extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // { codigo, config, status: espera|jogando|fim, criadaEm, tokenAnfitriao,
    //   jogadores: [{ token, nome, lugar, anfitriao }], jogo (do jogo escolhido), classificacao }
    this.estado = null;
    this.partida = null;      // o jogo desta mesa (jogos/*.js)
    this.ritmo = new Map();   // ws → { inicio, n }: contagem de mensagens (só em memória)
    // os testes encurtam os tempos pelo wrangler dev --var
    this.abandonoMs = +env.ABANDONO_MS || ABANDONO_MS;
    this.tempoAcao = +env.TEMPO_ACAO_MS || TEMPO_ACAO_MS;
    this.folgas = env.TEMPO_ACAO_MS ? { mao: 0, acao: 0 } : { mao: GRACA_MS, acao: GRACA_MS };
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const salvo = await ctx.storage.get(['estado', 'acoes', 'log']);
      this.estado = salvo.get('estado') || null;
      if (this.estado) {
        this.partida = criarPartida(this, this.estado.config);
        await this.partida.acordar(salvo);
      }
    });
  }

  async salvar() { await this.ctx.storage.put('estado', this.estado); }

  // ------------------------------------------------------- chamado pelo Worker
  /** Cria a mesa. Devolve o token do anfitrião, ou null se o código já está em uso. */
  async criar(codigo, config) {
    if (this.estado) return null;
    this.estado = { codigo, config, status: 'espera', criadaEm: Date.now(), tokenAnfitriao: tokenNovo(), jogadores: [] };
    this.partida = criarPartida(this, config);
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
    if (msg.tipo === 'lugar') return this.trocarLugar(ws, msg);
    if (this.estado.status === 'espera') return this.erro(ws, 'tipo', 'Mensagem desconhecida.');
    return this.partida.mensagem(ws, msg);
  }

  async webSocketClose(ws) {
    this.ritmo.delete(ws);
    fechar(ws, 1000, 'tchau');   // completa o fechamento do lado do servidor
    if (!this.estado) return;
    if (tokenDe(ws)) this.transmitirSala(ws);
    if (this.partida.aoDesconectar) await this.partida.aoDesconectar(ws);
    // ficou sem ninguém conectado: se ninguém voltar, o alarme apaga a mesa
    // (no fim da partida o alarme do fim já está marcado)
    if (this.estado && this.estado.status !== 'fim' && !this.abertos(ws).length) await this.ctx.storage.setAlarm(Date.now() + this.abandonoMs);
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
    await this.partida.alarme();
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
      const novosDepois = e.status === 'jogando' && this.partida.aceitaNovos();
      if (e.status !== 'espera' && (mesmoNome || !novosDepois)) {
        // partida começada: quem já estava nela volta para o mesmo lugar pelo nome
        // (fechou a aba, trocou de aparelho…), desde que não esteja conectado agora
        if (!mesmoNome) return this.erro(ws, 'comecou', 'A partida já começou e ninguém nela tem esse nome. Para voltar ao seu lugar, digite o mesmo nome com que você entrou.');
        if (this.conectados().has(mesmoNome.token)) return this.erro(ws, 'conectado', `${mesmoNome.nome} está na mesa agora, em outra aba ou aparelho. Se for você, feche a outra e tente de novo.`);
        return this.sentarComo(ws, mesmoNome, msg);
      }
      if (mesmoNome) return this.erro(ws, 'nome-repetido', 'Já tem alguém com esse nome na mesa.');
      // o lugar 0 fica guardado para o anfitrião
      const anfitriao = !!token && token === e.tokenAnfitriao;
      const lugar = anfitriao && !e.jogadores.some(x => x.lugar === 0) ? 0 : this.lugarLivre();
      if (lugar < 0) return this.erro(ws, 'cheia', 'A mesa está cheia.');
      j = { token: anfitriao ? token : tokenNovo(), nome, lugar, anfitriao };
      e.jogadores.push(j);
      if (novosDepois) await this.partida.novoJogador(j);
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

  /** Na sala de espera, trocar para um lugar livre (no truco em dupla, é assim que se escolhe o parceiro). */
  async trocarLugar(ws, msg) {
    const e = this.estado;
    const j = e.jogadores.find(x => x.token === tokenDe(ws));
    if (!j) return this.erro(ws, 'lugar', 'Sente-se primeiro.');
    if (e.status !== 'espera') return this.erro(ws, 'lugar', 'A partida já começou.');
    const l = msg.lugar;
    if (!Number.isInteger(l) || l < 0 || l >= e.config.lugares) return this.erro(ws, 'lugar', 'Lugar inválido.');
    if (e.jogadores.some(x => x.lugar === l)) return this.erro(ws, 'lugar', 'Esse lugar está ocupado.');
    j.lugar = l;
    await this.salvar();
    this.transmitirSala();
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
    return this.partida.sair(ws, j);
  }

  // --------------------------------------------------------------- partida
  async comecar(ws) {
    const e = this.estado;
    const eu = e.jogadores.find(x => x.token === tokenDe(ws));
    if (!eu || !eu.anfitriao) return this.erro(ws, 'comecar', 'Só o anfitrião começa a partida.');
    if (e.status !== 'espera') return this.erro(ws, 'comecar', 'A partida já começou.');
    const falta = this.partida.podeComecar(e.jogadores);
    if (falta) return this.erro(ws, 'comecar', falta);
    e.status = 'jogando';
    await this.partida.comecar();
  }

  /** Jogador sentado que (re)conecta durante ou depois da partida: o jogo manda como ela está. */
  async colocarNaPartida(ws, j, voltar) {
    if (this.estado.status === 'espera') return;
    await this.partida.colocar(ws, j, voltar);
  }

  /** O jogo terminou: a mesa guarda o resultado por alguns minutos e depois é apagada. */
  async terminar() {
    this.estado.status = 'fim';
    await this.salvar();
    await this.ctx.storage.setAlarm(Date.now() + FIM_MS);
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

  // ------------------------------------------------------------ comuns
  /** Fim da mesa: avisa todo mundo, fecha as conexões e apaga tudo (o link deixa de funcionar). */
  async encerrar(motivo) {
    for (const ws of this.ctx.getWebSockets()) {
      enviar(ws, { tipo: 'encerrada', motivo, texto: TEXTO_FIM[motivo] });
      fechar(ws, FECHA.ENCERRADA, motivo);
    }
    this.estado = null;
    this.partida = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  erro(ws, motivo, texto) { enviar(ws, { tipo: 'erro', motivo, texto }); }
  fecharConexao(ws, codigo, motivo) { fechar(ws, codigo, motivo); }

  voce(j) { return { tipo: 'voce', lugar: j.lugar, token: j.token, anfitriao: j.anfitriao }; }

  /** Tokens com conexão aberta agora. */
  conectados(excluir) { return new Set(this.abertos(excluir).map(tokenDe).filter(Boolean)); }

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
      config: this.partida.configPublica(e.config),
      jogadores: e.jogadores.slice().sort((a, b) => a.lugar - b.lugar)
        .map(j => ({ lugar: j.lugar, nome: j.nome, anfitriao: j.anfitriao, conectado: conectados.has(j.token) }))
    };
  }

  transmitirSala(excluir) {
    const m = this.sala(excluir);
    this.abertos(excluir).forEach(ws => enviar(ws, m));
  }
}
