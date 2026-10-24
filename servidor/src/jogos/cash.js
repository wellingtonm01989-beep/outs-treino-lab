/* ==========================================================================
   OUTS · servidor — jogos/cash.js
   Cash game de poker na mesa com amigos. A mão é a mesma do Sit & Go
   (poker.js + motor.js do app); muda o que acontece entre as mãos:
   - blinds fixos; cada um senta com o buy-in combinado (em centavos de R$,
     só para o acerto entre vocês: o app não mexe com dinheiro);
   - dá para entrar com a partida em andamento (lugar livre) e sair a
     qualquer hora: quem sai fica "fora" com as fichas e não recebe cartas
     até voltar;
   - prazo esgotado: passa (check) se der, senão larga, e o jogador fica
     "fora" (a mesa não espera por ele a cada mão);
   - sem fichas: recompra (mais um buy-in);
   - a sessão acaba quando o anfitrião encerra (no fim da mão em andamento):
     todos veem quanto cada um comprou, com quanto saiu e o resultado.
   Só recebe cartas quem está conectado, sem estar fora e com fichas; com
   menos de 2 assim, a mesa espera.

   Cliente → servidor: acao {numero, acao} · recompra · encerrar (anfitrião)
   Servidor → cliente: jogo (modo: 'cash') · mao · fim {modo: 'cash', classificacao}
   ========================================================================== */
import { P } from '../nucleo.js';
import * as Jogo from '../jogo.js';
import { enviar, tokenDe } from '../comum.js';
import { PokerSNG } from './poker.js';

export const BLINDS = [[25, 50], [50, 100], [100, 200], [200, 500]];
export const BUYIN_BB = [50, 100, 200];
const MAX_PASSOS = 300;

export function validarConfig(c) {
  const lugares = c.lugares;
  if (!Number.isInteger(lugares) || lugares < 2 || lugares > 9) return { erro: 'A mesa precisa ter de 2 a 9 lugares.' };
  const b = BLINDS.find(x => x[0] === c.sb && x[1] === c.bb);
  if (!b) return { erro: 'Blinds inválidos.' };
  if (BUYIN_BB.indexOf(c.buyinBB) < 0) return { erro: 'Buy-in inválido.' };
  return { config: { jogo: 'poker', modo: 'cash', lugares, sb: b[0], bb: b[1], buyin: b[1] * c.buyinBB } };
}

export class PokerCash extends PokerSNG {
  configPublica(c) { return { jogo: 'poker', modo: 'cash', lugares: c.lugares, sb: c.sb, bb: c.bb, buyin: c.buyin }; }
  aceitaNovos() { return true; }

  async comecar() {
    const e = this.estado, c = e.config;
    e.jogo = {
      modo: 'cash', lugares: c.lugares, sb: c.sb, bb: c.bb, buyin: c.buyin, inicio: Date.now(),
      botao: -1, numero: 0, mao: null, encerrar: false,
      jogadores: []
    };
    e.jogadores.forEach(j => this.sentar(j));
    await this.mesa.salvar();
    this.mesa.transmitirSala();
    await this.avancar();
    this.transmitirJogo();
  }

  /** Jogador da sala entra no jogo (no lugar dele, com um buy-in). */
  sentar(j) {
    const jogo = this.estado.jogo;
    jogo.jogadores.push({ assento: j.lugar, token: j.token, nome: j.nome, fichas: jogo.buyin, comprado: jogo.buyin, fora: false });
    jogo.jogadores.sort((a, b) => a.assento - b.assento);
  }

  async novoJogador(j) {
    this.sentar(j);
    this.transmitirJogo();
    if (!this.mao) await this.avancar();
  }

  /** Quem recebe cartas na próxima mão. */
  prontos() {
    const con = this.mesa.conectados();
    return this.estado.jogo.jogadores.filter(j => j.fichas > 0 && !j.fora && con.has(j.token));
  }
  alguemPresente() { return this.prontos().length >= 2; }

  iniciarMao() {
    const jogo = this.estado.jogo;
    const ativos = this.prontos().map(j => j.assento);
    jogo.botao = jogo.botao < 0 ? P.RNG.escolher(ativos) : (ativos.find(a => a > jogo.botao) ?? ativos[0]);
    jogo.numero++;
    const porAssento = a => jogo.jogadores.find(j => j.assento === a);
    jogo.mao = {
      numero: jogo.numero, nivel: 0,
      cfg: {
        lugares: jogo.lugares, botao: jogo.botao, numero: jogo.numero, sb: jogo.sb, bb: jogo.bb, ante: 0, anteBB: false,
        jogadores: ativos.map(a => ({ assento: a, id: a, nome: porAssento(a).nome, fichas: porAssento(a).fichas }))
      },
      baralho: P.Baralho.embaralhar(P.Baralho.novoOrdenado()),
      prazo: null
    };
    this.mao = Jogo.motorDaMao(jogo.mao, []);
    this.prazo = Date.now() + this.mesa.tempoAcao + this.mesa.folgas.mao;
    jogo.mao.prazo = this.prazo;
    this.acoes = { numero: jogo.numero, lista: [], prazo: this.prazo };
    this.enviados = 0;
  }

  /** Prazo esgotado: passa se der, senão larga; e o jogador fica fora até voltar. */
  async alarme() {
    if (this.mao && !this.mao.terminada() && this.prazo && Date.now() >= this.prazo - 250) {
      const vez = this.mao.vez();
      const j = this.estado.jogo.jogadores.find(x => x.assento === vez);
      if (j && !j.fora) { j.fora = true; this.transmitirJogo(); }
      await this.registrarAcao(vez, this.mao.acoesValidas().podeCheck ? 'check' : 'fold');
    }
    await this.avancar();
  }

  async mensagem(ws, msg) {
    if (msg.tipo === 'acao') return this.acao(ws, msg);
    if (msg.tipo === 'recompra') return this.recompra(ws);
    if (msg.tipo === 'encerrar') return this.pedirEncerrar(ws);
    return this.mesa.erro(ws, 'tipo', 'Mensagem desconhecida.');
  }

  async recompra(ws) {
    const j = this.estado.status === 'jogando' && this.jogadorDoJogo(tokenDe(ws));
    if (!j) return this.mesa.erro(ws, 'recompra', 'Você não está nesta mesa.');
    if (j.fichas > 0) return this.mesa.erro(ws, 'recompra', 'A recompra é só para quem ficou sem fichas.');
    const jogo = this.estado.jogo;
    j.fichas += jogo.buyin;
    j.comprado += jogo.buyin;
    j.fora = false;
    await this.mesa.salvar();
    this.transmitirJogo();
    if (!this.mao) await this.avancar();
  }

  async pedirEncerrar(ws) {
    const eu = this.estado.jogadores.find(x => x.token === tokenDe(ws));
    if (!eu || !eu.anfitriao) return this.mesa.erro(ws, 'encerrar', 'Só o anfitrião encerra a mesa.');
    if (this.estado.status !== 'jogando') return;
    this.estado.jogo.encerrar = true;
    await this.mesa.salvar();
    if (!this.mao) return this.terminar();
    this.transmitirJogo();   // "a mesa termina no fim desta mão"
  }

  /** Sair: fica fora com as fichas (se estiver na mão, larga quando chegar a vez). */
  async sair(ws, j) {
    const jj = this.estado.status === 'jogando' && this.jogadorDoJogo(j.token);
    if (!jj) return this.mesa.fecharConexao(ws, 1000, 'saiu');
    if (!jj.fora) {
      jj.fora = true;
      await this.mesa.salvar();
      this.transmitirJogo();
      await this.avancar();
    }
  }

  async aoDesconectar() { if (this.estado.status === 'jogando') this.transmitirJogo(); }

  async avancar() {
    const e = this.estado;
    for (let passo = 0; passo < MAX_PASSOS && e.status === 'jogando'; passo++) {
      if (!this.mao) {
        if (e.jogo.encerrar) return this.terminar();
        if (!this.alguemPresente()) { this.transmitirJogo(); return; }   // espera 2 prontos
        this.iniciarMao();
        await this.mesa.salvar();
        this.transmitirJogo();
        continue;
      }
      if (!this.mao.terminada()) {
        const vez = this.mao.vez();
        const j = e.jogo.jogadores.find(x => x.assento === vez);
        // quem saiu da mesa larga na hora (passa, se puder)
        if (j && j.fora) { await this.registrarAcao(vez, this.mao.acoesValidas().podeCheck ? 'check' : 'fold'); continue; }
        this.transmitirMao();
        await this.mesa.agendarAlarme(this.prazo);
        return;
      }
      // fim da mão: as fichas de cada um e a próxima (ou o fim da sessão)
      this.transmitirMao();
      const r = this.mao.resultado();
      Object.keys(r.fichasFinais).forEach(a => { const j = e.jogo.jogadores.find(x => x.assento === +a); if (j) j.fichas = r.fichasFinais[a]; });
      e.jogo.mao = null;
      this.mao = null;
      await this.mesa.salvar();
      this.transmitirJogo();
    }
    if (e.status === 'jogando') await this.mesa.agendarAlarme(Date.now() + 1000);
  }

  async terminar() {
    const e = this.estado;
    e.classificacao = e.jogo.jogadores.map(j => ({ assento: j.assento, nome: j.nome, comprado: j.comprado, fichas: j.fichas, resultado: j.fichas - j.comprado }))
      .sort((a, b) => b.resultado - a.resultado);
    this.mao = null;
    await this.mesa.terminar();
    this.transmitirJogo();
    const fim = this.msgFim();
    this.mesa.abertos().forEach(ws => enviar(ws, fim));
    this.mesa.transmitirSala();
  }

  msgJogo(assento) {
    const jogo = this.estado.jogo, con = this.mesa.conectados();
    return {
      tipo: 'jogo', modo: 'cash', codigo: this.estado.codigo, meuAssento: assento, lugares: jogo.lugares,
      sb: jogo.sb, bb: jogo.bb, buyin: jogo.buyin, numero: jogo.numero, inicio: jogo.inicio, agora: Date.now(),
      pausada: this.estado.status === 'jogando' && !this.mao, encerrando: !!jogo.encerrar,
      terminada: this.estado.status === 'fim',
      jogadores: jogo.jogadores.map(j => ({ assento: j.assento, nome: j.nome, fichas: j.fichas, comprado: j.comprado, fora: !!j.fora, conectado: con.has(j.token), posicao: null }))
    };
  }

  msgFim() { return { tipo: 'fim', modo: 'cash', classificacao: this.estado.classificacao }; }
}
