/* ==========================================================================
   OUTS · servidor — mesa.js
   Durable Object "Mesa": uma instância por link. Nesta etapa cuida da sala de
   espera: quem está sentado, em que lugar, quem é o anfitrião e quem está
   conectado agora.

   Regras para caber no plano grátis (docs/plano-multiplayer.md):
   - WebSocket pela Hibernation API (ctx.acceptWebSocket); pings respondidos
     por setWebSocketAutoResponse, sem acordar o objeto.
   - Nada de setTimeout: o que espera tempo usa o alarme (um só por mesa).
   - O estado fica numa linha só ("estado"), gravada quando a sala muda.
     Conectado/desconectado não grava nada: sai das próprias conexões.

   Mensagens do cliente:  entrar {nome, token?} · sair
   Mensagens do servidor: sala {...} · voce {lugar, token, anfitriao}
                          erro {motivo, texto} · encerrada {motivo, texto}
   ========================================================================== */
import { DurableObject } from 'cloudflare:workers';
import { tokenNovo } from './nucleo.js';

const ABANDONO_MS = 30 * 60 * 1000;          // sala sem ninguém conectado é apagada depois disso
const VIDA_ESPERA_MS = 12 * 60 * 60 * 1000;  // sala de espera que nunca começa é apagada depois disso
const MAX_MENSAGEM = 1024;                   // caracteres por mensagem
const MAX_MSGS = 20, JANELA_MSGS_MS = 10000; // no máximo 20 mensagens a cada 10 s por conexão
const TAM_NOME = 18;

// códigos de fechamento da conexão (4000–4999 são livres para o app)
const FECHA = { OUTRA_ABA: 4001, EXCESSO: 4008, INEXISTENTE: 4404, ENCERRADA: 4410 };
const ABERTA = 1;   // WebSocket.readyState

const TEXTO_FIM = {
  cancelada: 'O anfitrião cancelou a mesa.',
  abandonada: 'A mesa ficou vazia e foi apagada.',
  expirada: 'A mesa ficou tempo demais esperando e foi apagada.'
};

function enviar(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* conexão já caiu */ } }
function fechar(ws, codigo, motivo) { try { ws.close(codigo, motivo); } catch (e) { /* já fechada */ } }
const tokenDe = ws => (ws.deserializeAttachment() || {}).token || null;

/** Nome limpo (sem caracteres de controle/invisíveis, espaços simples) ou null se inválido. */
function limparNome(bruto) {
  if (typeof bruto !== 'string') return null;
  const s = bruto.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, '')
    .replace(/\s+/g, ' ').trim();
  const n = Array.from(s).length;
  return n >= 1 && n <= TAM_NOME ? s : null;
}

export class Mesa extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // { codigo, config, status, criadaEm, tokenAnfitriao, jogadores: [{ token, nome, lugar, anfitriao }] }
    this.estado = null;
    this.ritmo = new Map();   // ws → { inicio, n }: contagem de mensagens (só em memória)
    this.abandonoMs = +env.ABANDONO_MS || ABANDONO_MS;   // os testes encurtam pelo wrangler dev --var
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.estado = (await ctx.storage.get('estado')) || null; });
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
    return this.erro(ws, 'tipo', 'Mensagem desconhecida.');
  }

  async webSocketClose(ws) {
    this.ritmo.delete(ws);
    fechar(ws, 1000, 'tchau');   // completa o fechamento do lado do servidor
    if (!this.estado) return;
    if (tokenDe(ws)) this.transmitirSala(ws);
    // ficou sem ninguém conectado: se ninguém voltar, o alarme apaga a mesa
    if (!this.abertos(ws).length) await this.ctx.storage.setAlarm(Date.now() + this.abandonoMs);
  }

  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    if (!this.estado) return;
    if (!this.abertos().length) return this.encerrar('abandonada');
    if (this.estado.status === 'espera') {
      const limite = this.estado.criadaEm + VIDA_ESPERA_MS;
      if (Date.now() >= limite) return this.encerrar('expirada');
      await this.ctx.storage.setAlarm(limite);
    }
  }

  // ------------------------------------------------------------- ações
  async entrar(ws, msg) {
    const e = this.estado;
    // esta conexão já está sentada: só repete quem ela é
    const atual = tokenDe(ws) && e.jogadores.find(x => x.token === tokenDe(ws));
    if (atual) return enviar(ws, this.voce(atual));

    const token = typeof msg.token === 'string' ? msg.token : '';
    let j = token ? e.jogadores.find(x => x.token === token) : null;
    if (!j) {
      if (e.status !== 'espera') return this.erro(ws, 'comecou', 'A partida já começou.');
      const nome = limparNome(msg.nome);
      if (!nome) return this.erro(ws, 'nome', `Digite um nome de 1 a ${TAM_NOME} caracteres.`);
      const chave = nome.toLocaleLowerCase('pt-BR');
      if (e.jogadores.some(x => x.nome.toLocaleLowerCase('pt-BR') === chave)) return this.erro(ws, 'nome-repetido', 'Já tem alguém com esse nome na mesa.');
      // o lugar 0 fica guardado para o anfitrião
      const anfitriao = !!token && token === e.tokenAnfitriao;
      const lugar = anfitriao ? 0 : this.lugarLivre();
      if (lugar < 0) return this.erro(ws, 'cheia', 'A mesa está cheia.');
      j = { token: anfitriao ? token : tokenNovo(), nome, lugar, anfitriao };
      e.jogadores.push(j);
      await this.salvar();
    }
    // o mesmo jogador aberto em outra aba: fica valendo a conexão nova
    for (const outro of this.ctx.getWebSockets()) {
      if (outro !== ws && tokenDe(outro) === j.token) {
        outro.serializeAttachment({ token: null });
        enviar(outro, { tipo: 'erro', motivo: 'outra-aba', texto: 'Essa mesa foi aberta em outra aba.' });
        fechar(outro, FECHA.OUTRA_ABA, 'aberta em outra aba');
      }
    }
    ws.serializeAttachment({ token: j.token });
    enviar(ws, this.voce(j));
    this.transmitirSala();
  }

  async sair(ws) {
    const j = this.estado.jogadores.find(x => x.token === tokenDe(ws));
    if (!j) return fechar(ws, 1000, 'saiu');
    if (j.anfitriao) return this.encerrar('cancelada');
    this.estado.jogadores = this.estado.jogadores.filter(x => x !== j);
    await this.salvar();
    ws.serializeAttachment({ token: null });
    fechar(ws, 1000, 'saiu');
    this.transmitirSala(ws);
  }

  /** Fim da mesa: avisa todo mundo, fecha as conexões e apaga tudo (o link deixa de funcionar). */
  async encerrar(motivo) {
    for (const ws of this.ctx.getWebSockets()) {
      enviar(ws, { tipo: 'encerrada', motivo, texto: TEXTO_FIM[motivo] });
      fechar(ws, FECHA.ENCERRADA, motivo);
    }
    this.estado = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ------------------------------------------------------------ auxiliares
  erro(ws, motivo, texto) { enviar(ws, { tipo: 'erro', motivo, texto }); }

  voce(j) { return { tipo: 'voce', lugar: j.lugar, token: j.token, anfitriao: j.anfitriao }; }

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
    const conectados = new Set(this.abertos(excluir).map(tokenDe).filter(Boolean));
    return {
      tipo: 'sala', codigo: e.codigo, status: e.status,
      config: { lugares: e.config.lugares, fichas: e.config.fichas, velocidade: e.config.velocidade },
      jogadores: e.jogadores.slice().sort((a, b) => a.lugar - b.lugar)
        .map(j => ({ lugar: j.lugar, nome: j.nome, anfitriao: j.anfitriao, conectado: conectados.has(j.token) }))
    };
  }

  transmitirSala(excluir) {
    const m = this.sala(excluir);
    this.abertos(excluir).forEach(ws => enviar(ws, m));
  }
}
