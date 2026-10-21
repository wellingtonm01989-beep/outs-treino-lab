/* ==========================================================================
   OUTS · servidor — jogos/cartas.js
   Partida de um jogo de cartas por "agentes" (truco, Última!) com o próprio
   motor do app rodando aqui. O motor pergunta a cada lugar o que fazer
   (agente.decidir, agente.jogar…) e avisa cada acontecimento (evento); aqui
   cada pergunta vira um pedido para o jogador daquele lugar, e cada resposta
   volta para o motor. Sem bots e sem coach: só gente.

   Como cabe no plano grátis: o objeto dorme entre as jogadas e perde a
   memória. Por isso tudo o que o motor sorteia (cada embaralhada, por
   cfg.embaralhar) e cada decisão ficam gravados numa linha pequena ("log")
   desde o começo da mão; no começo de cada mão o motor entrega o estado
   para recomeçá-la (ganchos.salvar), que vai na linha "estado". Ao acordar,
   um motor novo refaz a mão com as mesmas embaralhadas e as mesmas
   decisões e para exatamente no pedido em aberto (os eventos saem iguais).

   Cada jogador recebe só o que o lugar dele vê (as regras de cada jogo, em
   truco.js e ultima.js, filtram e "giram" os lugares: quem recebe é sempre o
   lugar 0, como na mesa contra os bots).

   Cliente → servidor: decisao {id, valor}
   Servidor → cliente: partida (quem joga, placar, opções) · passos (os
                       acontecimentos e os pedidos, na ordem, cada um com a
                       vista de quem recebe) · fim {resultado}
   ========================================================================== */
import { P } from '../nucleo.js';
import { enviar, tokenDe } from '../comum.js';

const FOLGA_MAO_MS = 8000;      // o primeiro pedido da mão tem mais tempo: o resumo da mão anterior e a distribuição
const TEMPO_JANELA_MS = 3000;   // janela para pegar quem esqueceu de dizer "Última!"

function adiado() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

export class PartidaCartas {
  /** regras: o jogo (truco.js, ultima.js) */
  constructor(mesa, regras) {
    this.mesa = mesa;
    this.R = regras;
    this.motor = null;
    this.passos = [];        // passos da mão atual: { ev } ou { pedido }, com a vista de cada lugar naquele momento
    this.novos = [];         // passos ainda não transmitidos (podem atravessar o fim de uma mão)
    this.pedido = null;      // decisão em aberto: { id, metodo, assento, quem, extra, resolve, respostas }
    this.prazo = null;
    this.log = null;         // { mao, decisoes: [{ p, a, m, v }], emb: [[...]], auto: {} }
    this.refazendo = null;   // ao acordar: { d, e } (próxima decisão e próxima embaralhada do log)
    this.dentroDaMao = false;
    this.embAntes = [];      // embaralhadas antes do "salvar" da mão (vão para o log da mão nova)
    this.parada = null;
    this.fim = null;         // { r } ou { erro }
    this.estadoMudou = false;
  }

  get estado() { return this.mesa.estado; }
  get jogo() { return this.estado.jogo; }

  configPublica(c) { return this.R.configPublica(c); }
  podeComecar(jogadores) { return this.R.podeComecar(jogadores, this.estado.config); }
  aceitaNovos() { return false; }

  // ------------------------------------------------------------- motor
  /** Liga um motor a partir de um estado (começo da partida ou começo da mão a refazer). */
  ligarMotor(estadoMotor) {
    const n = this.jogo.n;
    const agentes = [];
    for (let a = 0; a < n; a++) {
      const ag = Object.assign({ bot: false }, this.R.agenteExtra || {});
      this.R.metodos.forEach(m => { ag[m] = (vista, extra) => this.pedir(a, m, vista, extra); });
      agentes.push(ag);
    }
    const ganchos = {
      evento: ev => this.aoEvento(ev),
      salvar: est => this.aoSalvar(est)
    };
    if (this.R.janela) ganchos.janelaUltima = j => this.pedir(-1, 'janela', null, { j });
    this.motor = this.R.criarMotor(Object.assign({}, estadoMotor, { embaralhar: arr => this.embaralhar(arr) }), this.jogo.cfg, n, agentes, ganchos);
    this.fim = null;
    this.motor.rodar().then(r => { this.fim = { r }; this.sinalizar(); },
      e => { console.error('cartas: erro no motor', e && e.stack || e); this.fim = { erro: String(e && e.message || e) }; this.sinalizar(); });
  }

  /** Embaralhada pedida pelo motor: ao refazer, a mesma de antes; senão, uma nova (crypto) e guardada. */
  embaralhar(arr) {
    const r = this.refazendo;
    if (r && r.e < this.log.emb.length) return this.log.emb[r.e++].slice();
    const ordem = P.Baralho.embaralhar(arr);
    if (this.dentroDaMao) this.log.emb.push(ordem.slice()); else this.embAntes.push(ordem.slice());
    if (r) r.e++;
    return ordem;
  }

  aoSalvar(est) {
    this.dentroDaMao = true;
    this.passos = [];
    // refazendo: é o começo da mesma mão que está no log
    if (this.refazendo) { this.embAntes = []; return; }
    this.jogo.inicioMao = this.R.estadoParaRefazer(est);
    this.jogo.maoId++;
    this.log = { mao: this.jogo.maoId, decisoes: [], emb: this.embAntes, auto: {} };
    this.embAntes = [];
    this.estadoMudou = true;
  }

  aoEvento(ev) {
    if (ev.tipo === 'inicioPartida') return;   // o cliente monta a partida pela mensagem "partida"
    if (ev.tipo === 'vez' && this.log) delete this.log.auto[ev.j];
    this.empurrar({ ev });
    if (ev.tipo === 'fimMao') this.dentroDaMao = false;
  }

  empurrar(passo) {
    passo.i = this.passos.length;
    passo.mao = this.jogo.maoId;
    passo.vistas = this.vistas();
    this.passos.push(passo);
    if (!this.refazendo) this.novos.push(passo);
  }

  vistas() {
    const v = [];
    for (let a = 0; a < this.jogo.n; a++) {
      let x = null;
      try { x = this.motor.vistaPara(a); } catch (e) { /* sem mão em andamento */ }
      v.push(x);
    }
    return v;
  }

  /** O motor quer uma decisão do lugar "assento" (-1: a janela do "Última!", aberta para todos). */
  pedir(assento, metodo, vista, extra) {
    const r = this.refazendo;
    const n = this.jogo.n;
    const quem = metodo === 'janela' ? Array.from({ length: n }, (_, k) => k) : this.R.quemDecide(metodo, assento, n);
    if (r && r.d < this.log.decisoes.length) {
      const id = r.d;
      const d = this.log.decisoes[r.d++];
      if (d.p !== assento || d.m !== metodo) {
        console.error('cartas: o log não bate com o motor', JSON.stringify({ d, assento, metodo }));
        throw new Error('A partida não pôde ser refeita');
      }
      // o pedido também tinha ido para a tela (os passos saem iguais aos de antes de dormir)
      if (d.q) this.empurrar({ pedido: { id, metodo, quem, extra: extra === undefined ? null : extra } });
      return Promise.resolve(this.R.valorParaMotor(metodo, d.v, d.a));
    }
    if (r) this.refazendo = null;   // acabou o log: daqui em diante é a partida ao vivo
    // quem saiu do prazo nesta vez: o resto dos pedidos encadeados (compras, passar) vai sozinho
    if (assento >= 0 && this.log.auto[assento] && this.R.automaticaEmSeguida && this.R.automaticaEmSeguida.indexOf(metodo) >= 0) {
      const v = this.R.automatica(metodo, this.motor.vistaPara(assento), extra);
      this.log.decisoes.push({ p: assento, a: assento, m: metodo, v });
      return Promise.resolve(this.R.valorParaMotor(metodo, v, assento));
    }
    return new Promise(resolve => {
      const primeiroDaMao = !this.passos.some(p => p.pedido);
      this.pedido = { id: this.log.decisoes.length, metodo, assento, quem, extra: extra === undefined ? null : extra, resolve, respostas: {} };
      const t = metodo === 'janela' ? TEMPO_JANELA_MS : this.mesa.tempoAcao + this.mesa.folgas.acao + (primeiroDaMao && this.mesa.folgas.mao ? FOLGA_MAO_MS : 0);
      this.prazo = Date.now() + t;
      this.empurrar({ pedido: { id: this.pedido.id, metodo, quem, extra: this.pedido.extra } });
      this.sinalizar();
    });
  }

  /** O motor parou: pedido em aberto, fim da partida ou erro. */
  sinalizar() {
    if (!this.parada) return;
    const p = this.parada;
    this.parada = null;
    p.resolve();
  }

  /** Resolve o pedido em aberto e espera o motor parar de novo. */
  async decidir(quemDecidiu, valor) {
    const p = this.pedido;
    this.pedido = null;
    this.prazo = null;
    this.log.decisoes.push({ p: p.assento, a: quemDecidiu, m: p.metodo, v: valor, q: 1 });
    const parou = adiado();
    this.parada = parou;
    p.resolve(this.R.valorParaMotor(p.metodo, valor, quemDecidiu));
    if (!this.pedido && !this.fim) await parou.promise;
    await this.depoisDeAndar();
  }

  /** Grava, transmite e marca o prazo do próximo pedido (ou termina). */
  async depoisDeAndar() {
    const st = this.mesa.ctx.storage;
    if (this.fim) return this.terminar();
    this.log.prazo = this.prazo;
    const linhas = { log: this.log };
    if (this.estadoMudou) { linhas.estado = this.estado; this.estadoMudou = false; }
    await st.put(linhas);
    // mão nova: o placar da partida vai junto (quem está conectado, quem saiu)
    if (this.maoTransmitida !== this.jogo.maoId) { this.maoTransmitida = this.jogo.maoId; this.transmitirPartida(); }
    this.transmitirPassos();
    if (this.prazo) await this.mesa.agendarAlarme(this.prazo);
  }

  // ------------------------------------------------------------- partida
  async comecar() {
    const e = this.estado;
    const ordem = e.jogadores.slice().sort((a, b) => a.lugar - b.lugar);
    const n = ordem.length;
    e.jogo = {
      tipo: this.R.tipo, n, cfg: this.R.cfgMotor(e.config, n),
      jogadores: ordem.map((j, assento) => ({ assento, token: j.token, nome: j.nome, fora: false })),
      inicio: Date.now(), maoId: 0, inicioMao: null, resultado: null
    };
    this.log = { mao: 0, decisoes: [], emb: [], auto: {} };
    const parou = adiado();
    this.parada = parou;
    this.ligarMotor(this.R.estadoInicial(n, e.config));
    if (!this.pedido && !this.fim) await parou.promise;
    this.estadoMudou = true;
    this.mesa.transmitirSala();
    await this.depoisDeAndar();
  }

  /** Acordou: refaz a mão em andamento até o pedido em aberto. */
  async acordar(salvo) {
    const jogo = this.estado && this.estado.status === 'jogando' && this.estado.jogo;
    if (!jogo || !jogo.inicioMao) return;
    const log = salvo.get('log');
    this.log = log && log.mao === jogo.maoId ? log : { mao: jogo.maoId, decisoes: [], emb: [], auto: {} };
    this.refazendo = { d: 0, e: 0 };
    const parou = adiado();
    this.parada = parou;
    this.ligarMotor(jogo.inicioMao);
    if (!this.pedido && !this.fim) await parou.promise;
    this.refazendo = null;
    this.novos = [];
    // o prazo do pedido em aberto continua de onde estava
    if (this.pedido && this.log.prazo) this.prazo = this.log.prazo;
    if (this.fim) await this.terminar();
  }

  async alarme() {
    if (!this.pedido || !this.prazo) return;
    if (Date.now() < this.prazo - 250) return this.mesa.agendarAlarme(this.prazo);
    const p = this.pedido;
    if (p.metodo === 'janela') return this.decidir(-1, null);
    const v = this.R.automatica(p.metodo, this.motor.vistaPara(p.assento), p.extra);
    if (this.R.automaticaEmSeguida) this.log.auto[p.assento] = true;
    await this.decidir(p.assento, v);
  }

  async mensagem(ws, msg) {
    if (msg.tipo !== 'decisao') return this.mesa.erro(ws, 'tipo', 'Mensagem desconhecida.');
    const j = this.estado.status === 'jogando' && this.jogadorDoJogo(tokenDe(ws));
    if (!j) return this.mesa.erro(ws, 'acao', 'Você não está jogando esta partida.');
    const p = this.pedido;
    if (!p || msg.id !== p.id || p.quem.indexOf(j.assento) < 0) return enviar(ws, { tipo: 'erro', motivo: 'acao', texto: 'Não é a sua vez.', id: msg.id });
    if (p.metodo === 'janela') {
      if (msg.valor === true) return this.decidir(-1, j.assento);
      p.respostas[j.assento] = false;
      if (p.quem.every(k => p.respostas[k] === false)) return this.decidir(-1, null);
      return;
    }
    const valor = this.R.limpar(p.metodo, msg.valor, this.motor.vistaPara(j.assento), j.assento, this.jogo.n, p.extra);
    if (valor === null || valor === undefined) return enviar(ws, { tipo: 'erro', motivo: 'acao', texto: 'Jogada inválida.', id: p.id, repetir: true });
    delete this.log.auto[j.assento];
    await this.decidir(j.assento, valor);
  }

  async sair(ws, j) {
    const jj = this.estado.status === 'jogando' && this.jogadorDoJogo(j.token);
    if (!jj) return this.mesa.fecharConexao(ws, 1000, 'saiu');
    if (!jj.fora) {
      jj.fora = true;
      await this.mesa.salvar();
      this.transmitirPartida();
    }
  }

  async colocar(ws, j, voltar) {
    const jj = this.jogadorDoJogo(j.token);
    if (!jj) return;
    if (voltar && jj.fora && this.estado.status === 'jogando') {
      jj.fora = false;
      await this.mesa.salvar();
      this.transmitirPartida();
    } else enviar(ws, this.msgPartida(jj.assento));
    if (this.estado.status === 'fim') return enviar(ws, this.msgFim());
    this.enviarPassos(ws, jj.assento, this.passos);
    // se todos tinham saído, o alarme do abandono tomou o lugar do prazo: volta o prazo
    if (this.prazo) await this.mesa.agendarAlarme(this.prazo);
  }

  async aoDesconectar() { if (this.estado.status === 'jogando') this.transmitirPartida(); }

  async terminar() {
    const jogo = this.jogo;
    this.transmitirPassos();
    jogo.resultado = this.fim.erro ? { erro: this.fim.erro } : this.R.resultado(this.fim.r, jogo);
    this.pedido = null;
    this.prazo = null;
    await this.mesa.terminar();
    this.transmitirPartida();
    const fim = this.msgFim();
    this.mesa.abertos().forEach(ws => { if (this.jogadorDoJogo(tokenDe(ws))) enviar(ws, fim); });
    this.mesa.transmitirSala();
  }

  // ------------------------------------------------------- mensagens
  msgPartida(assento) {
    const jogo = this.jogo, con = this.mesa.conectados();
    return {
      tipo: 'partida', jogo: jogo.tipo, n: jogo.n, meuAssento: assento, cfg: this.R.cfgPublica(jogo.cfg), maoId: jogo.maoId,
      terminada: this.estado.status === 'fim',
      jogadores: jogo.jogadores.map(j => ({ assento: j.assento, nome: j.nome, fora: !!j.fora, conectado: con.has(j.token) }))
    };
  }

  msgFim() { return { tipo: 'fim', jogo: this.jogo.tipo, resultado: this.jogo.resultado }; }

  transmitirPartida() {
    for (const ws of this.mesa.abertos()) {
      const j = this.jogadorDoJogo(tokenDe(ws));
      if (j) enviar(ws, this.msgPartida(j.assento));
    }
  }

  transmitirPassos() {
    const novos = this.novos;
    this.novos = [];
    if (!novos.length) return;
    for (const ws of this.mesa.abertos()) {
      const j = this.jogadorDoJogo(tokenDe(ws));
      if (j) this.enviarPassos(ws, j.assento, novos);
    }
  }

  /** Os passos vistos do lugar "assento" (filtrados e girados), com o prazo do pedido em aberto. */
  enviarPassos(ws, assento, passos) {
    const n = this.jogo.n;
    const lista = passos.map(p => {
      const o = { mao: p.mao, i: p.i, vista: p.vistas[assento] ? this.R.vistaPara(p.vistas[assento], assento, n) : null };
      if (p.ev) o.ev = this.R.eventoPara(p.ev, assento, n, p.vistas[assento]);
      else o.pedido = this.R.pedidoPara(p.pedido, assento, n);
      return o;
    });
    const aberto = this.pedido ? { id: this.pedido.id, ms: Math.max(0, this.prazo - Date.now()) } : null;
    enviar(ws, { tipo: 'passos', passos: lista, aberto });
  }

  jogadorDoJogo(token) {
    const jogo = this.estado && this.estado.jogo;
    return token && jogo && jogo.jogadores ? jogo.jogadores.find(j => j.token === token) || null : null;
  }
}
