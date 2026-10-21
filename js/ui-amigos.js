/* ==========================================================================
   OUTS · Treino Lab — ui-amigos.js
   Aba "Mesa com amigos": o anfitrião escolhe o jogo (poker, truco ou
   Última!), monta a mesa e recebe um link único; quem abre o link digita só
   o nome e senta num lugar livre (na sala de espera dá para trocar de lugar:
   no truco em dupla é assim que se escolhe o parceiro); a sala mostra em
   tempo real quem está na mesa e quem está conectado; o anfitrião começa a
   partida e ela abre na mesa de sempre daquele jogo:
     poker: ui-mesa.js + partida-remota.js
     truco e Última!: ui-truco-mesa.js / ui-uno-mesa.js + cartas-remotas.js
   Sem bots e sem coach. No fim, a classificação (e, no poker, os prêmios).
   Dinheiro de verdade fica fora do app (Pix com o organizador).
   A conexão fica em rede.js; o servidor em servidor/ (Cloudflare).
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const F = P.Formato, E = P.Estruturas, R = P.Rede;

  const FICHAS = [1500, 3000, 5000];
  const FICHAS_MIN = 500, FICHAS_MAX = 100000, PREMIO_MAX = 1000000;   // limites do servidor (premio em centavos)
  const JOGOS = [['poker', 'Poker'], ['truco', 'Truco'], ['ultima', 'Última!']];
  const NOME_JOGO = { poker: 'poker', truco: 'truco', ultima: 'Última!' };
  const FORM_PADRAO = {
    jogo: 'poker', lugares: 6, fichas: E.SNG_STACK, velocidade: 'regular', premio: 0,
    truco: { lugares: 4, regras: 'paulista' },
    ultima: { lugares: 6, ate: 200, comprarAtePoder: false, juntas: false }
  };
  function lerForm() {
    const f = Object.assign({}, FORM_PADRAO, P.Armazenamento.ler('amigos.form', {}));
    f.truco = Object.assign({}, FORM_PADRAO.truco, f.truco);
    f.ultima = Object.assign({}, FORM_PADRAO.ultima, f.ultima);
    return f;
  }
  const st = {
    // premio: prêmio total fixo em centavos, combinado pelo anfitrião (0 = sem premiação)
    form: lerForm(),
    premioTexto: null,     // o que está digitado no campo de premiação
    codigo: null,          // mesa aberta nesta aba
    conexao: null,
    conexaoEstado: 'fechada',
    sala: null,            // última mensagem "sala" do servidor
    eu: null,              // { lugar, token, anfitriao } depois de sentar
    fim: null,             // { motivo, texto }: mesa que não existe, foi encerrada ou abriu em outra aba
    aviso: null,           // erro ao criar ou ao sentar (nome repetido, mesa cheia…)
    ocupado: false,        // criando a mesa ou esperando a resposta do "entrar"
    voltando: false,       // tem token nesta aba: está voltando sozinho para o lugar
    jogo: null,            // poker: último placar da partida (mensagem "jogo")
    partida: null,         // truco e Última!: última mensagem "partida"
    cartas: null,          // truco e Última!: a partida aberta na mesa (cartas-remotas.js)
    resultado: null,       // classificação final (mensagem "fim")
    foraDaMesa: false,     // saiu da mesa (ou fechou a mesa): não reabre sozinha
    comecando: false,      // o anfitrião apertou "Começar" e espera o servidor
    desenhada: null        // vista que está na tela (para só atualizar as partes que mudam)
  };
  let campoNomeAtual = null;   // campo "Seu nome" da tela atual
  let desenhando = false;

  const nomeSalvo = () => P.Armazenamento.ler('amigos.nome', '') || (P.Config.get('nome') !== 'Você' ? P.Config.get('nome') : '');
  const raiz = () => document.getElementById('tela-amigos');
  /** O jogo da mesa aberta (pela sala), ou o escolhido no formulário. */
  const jogoDaMesa = () => (st.sala && st.sala.config && st.sala.config.jogo) || 'poker';
  const ehCartas = jogo => jogo === 'truco' || jogo === 'ultima';

  // ------------------------------------------------------- premiação (R$)
  const reais = c => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (st.premioTexto === null) st.premioTexto = st.form.premio ? reais(st.form.premio).slice(3) : '';

  /** "20", "20,50", "20.50", "R$ 1.234,56" → centavos; vazio → 0; inválido → null. */
  function lerReais(texto) {
    const s = String(texto || '').replace(/R\$|\s/g, '');
    if (!s) return 0;
    let numero;
    if (/^\d+(,\d{1,2})?$/.test(s)) numero = s.replace(',', '.');                                     // 20 · 20,50
    else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) numero = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
    else if (/^\d+\.\d{1,2}$/.test(s)) numero = s;                                                     // 20.50
    else return null;
    const c = Math.round(parseFloat(numero) * 100);
    return c <= PREMIO_MAX ? c : null;
  }

  /** Divisão automática do prêmio pelo número de jogadores (regra do Sit & Go do app). */
  function divisao(premio, jogadores) {
    return E.valoresPremios(premio, E.percentuaisSNG(Math.max(2, jogadores)))
      .map((v, i) => `${i + 1}º ${reais(v)}`).join(' · ');
  }

  // --------------------------------------------------------- conexão
  function abrirMesa(codigo) {
    if (st.codigo === codigo && (st.conexao || st.fim)) return;
    fecharConexao();
    Object.assign(st, { codigo, sala: null, eu: null, fim: null, aviso: null, ocupado: false, voltando: !!R.lerToken(codigo), jogo: null, partida: null, resultado: null, foraDaMesa: false, comecando: false });
    st.conexao = R.conectar(codigo, { estado: aoEstado, mensagem: aoMensagem });
  }

  function fecharConexao() {
    if (st.conexao) st.conexao.fechar();
    st.conexao = null;
    st.conexaoEstado = 'fechada';
  }

  function aoEstado(nome, info) {
    st.conexaoEstado = nome;
    const partida = P.PartidaRemota.atual();
    if (partida) partida.conexao(nome);
    if (nome === 'aberta') {
      // já sentou nesta aba (ou acabou de criar a mesa): volta para o mesmo lugar
      const token = R.lerToken(st.codigo);
      if (token) { st.ocupado = true; st.conexao.enviar({ tipo: 'entrar', token, nome: nomeSalvo() }); }
    } else if (nome === 'fechada') {
      st.conexao = null;
      if (!st.fim) st.fim = fimPorCodigo(info && info.codigo);
      fecharMesaDoJogo();
    }
    atualizar();
  }

  function fimPorCodigo(codigo) {
    if (codigo === 4404) return { motivo: 'inexistente', texto: 'Essa mesa não existe ou já terminou.' };
    if (codigo === 4410) return { motivo: 'encerrada', texto: 'A mesa foi encerrada.' };
    if (codigo === 4001) return { motivo: 'outra-aba', texto: 'Essa mesa foi aberta em outra aba ou aparelho.' };
    return { motivo: 'erro', texto: 'O servidor encerrou a conexão.' };
  }

  function aoMensagem(m) {
    if (m.tipo === 'partida' || m.tipo === 'passos' || (m.tipo === 'fim' && m.jogo) || (m.tipo === 'erro' && m.motivo === 'acao' && ehCartas(jogoDaMesa()))) { tratarCartas(m); return; }
    if (m.tipo === 'jogo' || m.tipo === 'mao' || m.tipo === 'fim' || (m.tipo === 'erro' && m.motivo === 'acao')) { tratarPartida(m); return; }
    if (m.tipo === 'sala') { st.sala = m; if (m.status !== 'espera') st.comecando = false; }
    else if (m.tipo === 'voce') {
      Object.assign(st, { eu: m, aviso: null, ocupado: false });
      R.gravarToken(st.codigo, m.token);
    } else if (m.tipo === 'erro') {
      Object.assign(st, { ocupado: false, voltando: false, comecando: false });
      if (m.motivo === 'inexistente' || m.motivo === 'outra-aba') st.fim = { motivo: m.motivo, texto: m.texto };
      else st.aviso = m.texto;
    } else if (m.tipo === 'encerrada') {
      st.fim = { motivo: 'encerrada', texto: m.texto };
      R.apagarToken(st.codigo);
      fecharMesaDoJogo();
    }
    atualizar();
  }

  // ---------------------------------------------------------- poker
  /** Mensagens do jogo vão para a mesa aberta; sem mesa, a primeira notícia da partida abre a mesa. */
  function tratarPartida(m) {
    if (m.tipo === 'jogo') st.jogo = m;
    if (m.tipo === 'fim') st.resultado = m;
    const partida = P.PartidaRemota.atual();
    if (partida) partida.receber(m);
    else if (m.tipo === 'jogo' && !m.terminada && !st.foraDaMesa && !meuFora(m)) abrirMesaDoJogo(m);
    atualizar();
  }

  /** O servidor diz que eu saí da mesa (a mesa joga por mim até eu voltar). */
  const meuFora = jogo => !!(jogo && jogo.jogadores[jogo.meuAssento] && jogo.jogadores[jogo.meuAssento].fora);

  function abrirMesaDoJogo(m) {
    st.foraDaMesa = false;
    P.App.iniciarPartida({
      modo: 'sng', remota: true, lugares: m.lugares, velocidade: m.velocidade,
      semBanca: true, semSalvar: true, buyin: { total: 0, premio: 0 },
      jogo: m, criarPartida: P.PartidaRemota.criar,
      enviar: obj => !!(st.conexao && st.conexao.enviar(obj)),
      // saiu pelo botão: fica na aba da mesa com amigos, com o botão para voltar
      // (se ainda estava jogando, na vez dele a mesa espera o tempo e dá fold, até ele voltar)
      aoSair: () => { st.foraDaMesa = true; render(); },
      aoTerminar: () => { P.UIMesa.encerrar(false); P.App.irPara('amigos'); }
    });
  }

  // ------------------------------------------------- truco e Última!
  const uiDe = jogo => (jogo === 'truco' ? P.UITrucoMesa : P.UIUnoMesa);
  const telaDe = jogo => (jogo === 'truco' ? 'truco' : 'uno');

  function tratarCartas(m) {
    if (m.tipo === 'partida') st.partida = m;
    if (m.tipo === 'fim') st.resultado = m;
    if (st.cartas && st.cartas.ativo()) st.cartas.receber(m);
    else if (m.tipo === 'partida' && !m.terminada && !st.foraDaMesa && !meuFora(m)) abrirMesaCartas(m);
    else if (m.tipo === 'passos' && st.cartas === null && st.partida && !st.partida.terminada && !st.foraDaMesa && !meuFora(st.partida)) {
      abrirMesaCartas(st.partida);
      st.cartas.receber(m);
    }
    atualizar();
  }

  function abrirMesaCartas(m) {
    st.foraDaMesa = false;
    const n = m.n, eu = m.meuAssento, jogo = m.jogo, UI = uiDe(jogo);
    // a mesa sempre mostra você no lugar 0: os outros vêm na ordem da mesa a partir de você
    const jogadores = [];
    for (let k = 0; k < n; k++) {
      const j = m.jogadores[(k + eu) % n];
      jogadores.push({ nome: j.nome, avatar: P.PartidaRemota.avatarDe(j.nome) });
    }
    const controle = P.CartasRemotas.criar({
      n, placarInicial: jogo === 'truco' ? [0, 0] : new Array(n).fill(0),
      enviar: obj => !!(st.conexao && st.conexao.enviar(obj)),
      cancelar: metodo => UI.cancelarPendente(metodo),
      relogio: info => UI.relogio(info)
    });
    st.cartas = controle;
    P.App.irPara(telaDe(jogo));
    UI.iniciar({
      remota: {
        controle, n, regras: m.cfg.regras, cfg: m.cfg, jogadores,
        // saiu pelo menu: fica "fora" (a mesa joga por ele quando o prazo acaba) até voltar
        aoSair: () => { st.foraDaMesa = true; if (st.conexao) st.conexao.enviar({ tipo: 'sair' }); },
        aoTerminar: () => P.App.irPara('amigos'),
        // a mesa saiu da tela (fim, sair ou outra aba do app): a conexão continua aqui
        aoFechar: () => { controle.desligar(); if (st.cartas === controle) st.cartas = null; if (!st.resultado) st.foraDaMesa = true; atualizar(); }
      }
    });
  }

  /** A mesa fechou por fora (mesa apagada, outra aba): para a partida aqui sem desistir. */
  function fecharMesaDoJogo() {
    const partida = P.PartidaRemota.atual();
    if (partida) {
      partida.desligar();
      P.UIMesa.encerrar(false);
      P.App.irPara('amigos');
    }
    if (st.cartas) {
      const jogo = st.partida ? st.partida.jogo : jogoDaMesa();
      st.cartas.desligar();
      st.cartas = null;
      const UI = uiDe(jogo);
      if (UI.emJogo() && UI.remota()) { UI.encerrar(); P.App.irPara('amigos'); }
    }
  }

  /** Voltar para a mesa (jogar de novo ou, se já foi eliminado, assistir): o servidor manda a partida de novo. */
  function voltarParaMesa() {
    st.foraDaMesa = false;
    if (st.conexao) st.conexao.enviar({ tipo: 'entrar', token: R.lerToken(st.codigo), voltar: true });
  }

  function comecar() {
    if (st.comecando || !st.conexao) return;
    st.comecando = st.conexao.enviar({ tipo: 'comecar' });
    atualizar();
  }

  function trocarLugar(lugar) {
    if (st.conexao) st.conexao.enviar({ tipo: 'lugar', lugar });
  }

  // ----------------------------------------------------------- ações
  function nomeDigitado() {
    const nome = campoNomeAtual && R.limparNome(campoNomeAtual.value);
    if (!nome) {
      st.aviso = `Digite seu nome (até ${R.TAM_NOME} caracteres).`;
      atualizar();
      if (campoNomeAtual) campoNomeAtual.focus();
      return null;
    }
    P.Armazenamento.gravar('amigos.nome', nome);
    return nome;
  }

  /** As opções da mesa que vão para o servidor, conforme o jogo escolhido. */
  function pedidoDaMesa() {
    const f = st.form;
    if (f.jogo === 'truco') return { jogo: 'truco', lugares: f.truco.lugares, regras: f.truco.regras };
    if (f.jogo === 'ultima') return { jogo: 'ultima', lugares: f.ultima.lugares, ate: f.ultima.ate, comprarAtePoder: !!f.ultima.comprarAtePoder, juntas: !!f.ultima.juntas };
    return { lugares: f.lugares, fichas: f.fichas, velocidade: f.velocidade, premio: f.premio };
  }

  async function criar() {
    if (st.ocupado || !nomeDigitado()) return;
    if (st.form.jogo === 'poker') {
      const premio = lerReais(st.premioTexto);
      if (premio === null) { st.aviso = 'Premiação inválida: use só números, como 20 ou 20,50 (até R$ 10.000).'; atualizar(); return; }
      st.form.premio = premio;
    }
    P.Armazenamento.gravar('amigos.form', st.form);
    Object.assign(st, { ocupado: true, aviso: null });
    atualizar();
    try {
      const r = await R.criarMesa(pedidoDaMesa());
      R.gravarToken(r.codigo, r.tokenAnfitriao);
      history.replaceState(null, '', '#mesa=' + r.codigo);
      abrirMesa(r.codigo);
    } catch (e) {
      Object.assign(st, { aviso: e.message, ocupado: false });
    }
    atualizar();
  }

  function sentar() {
    if (st.ocupado) return;
    const nome = nomeDigitado();
    if (!nome) return;
    // o token vai junto: o anfitrião que errou o nome continua anfitrião.
    // Com a partida começada, o nome leva de volta ao lugar de quem já estava nela.
    st.foraDaMesa = false;
    if (!st.conexao || !st.conexao.enviar({ tipo: 'entrar', nome, token: R.lerToken(st.codigo) || undefined, voltar: true })) { st.aviso = 'Sem conexão com a mesa. Tentando de novo…'; atualizar(); return; }
    Object.assign(st, { ocupado: true, aviso: null });
    atualizar();
  }

  async function sair() {
    if (st.eu && st.eu.anfitriao && !(await P.UI.confirmar('Cancelar a mesa',
      'Todos que estão na sala vão sair e o link deixa de funcionar.', 'Cancelar a mesa', 'Voltar'))) return;
    if (st.conexao && st.eu) st.conexao.enviar({ tipo: 'sair' });
    voltarAoInicio();
  }

  /** Larga a mesa desta aba e volta para "criar mesa". */
  function voltarAoInicio() {
    if (st.codigo) R.apagarToken(st.codigo);
    fecharMesaDoJogo();
    fecharConexao();
    Object.assign(st, { codigo: null, sala: null, eu: null, fim: null, aviso: null, ocupado: false, jogo: null, partida: null, resultado: null, foraDaMesa: false, comecando: false });
    if (R.temMesaNoLink()) history.replaceState(null, '', location.pathname + location.search);
    render();
  }

  /** "Usar nesta aba": a mesa tinha sido aberta em outra aba. */
  function retomarAqui() {
    const codigo = st.codigo;
    st.codigo = null;
    abrirMesa(codigo);
    render();
  }

  function copiarLink(campo) {
    const feito = () => P.UI.aviso('Link copiado. Agora é só colar no WhatsApp.', 'ok');
    const manual = () => { campo.select(); P.UI.aviso('Selecione o link e copie.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(campo.value).then(feito, manual);
    else { campo.select(); try { document.execCommand('copy'); feito(); } catch (e) { manual(); } }
  }

  // -------------------------------------------------------------- telas
  function vista() {
    if (!R.online()) return 'sem-internet';
    if (!R.servidor()) return 'sem-servidor';
    if (st.resultado) return 'resultado';
    if (st.fim) return 'fim';
    if (!st.codigo) return 'criar';
    if (st.eu) return st.sala && st.sala.status !== 'espera' ? 'em-jogo' : 'sala';
    // tem token nesta aba (acabou de criar a mesa ou recarregou): volta sozinho para o lugar
    return st.voltando ? 'voltando' : 'entrar';
  }

  /** Acompanha o link: abrir um #mesa=CODIGO nesta aba leva para aquela mesa. */
  function sincronizarComLink() {
    if (!R.disponivel()) return;
    const codigo = R.codigoDoLink();
    if (codigo && codigo !== st.codigo) abrirMesa(codigo);
    else if (!codigo && R.temMesaNoLink() && !st.codigo) st.fim = { motivo: 'inexistente', texto: 'Esse link de mesa não é válido. Confira se ele foi copiado inteiro.' };
  }

  function render() {
    const r = raiz();
    if (!r) return;
    desenhando = true;
    sincronizarComLink();
    const v = vista();
    st.desenhada = v;
    campoNomeAtual = null;
    r.innerHTML = '';
    const desenhar = { 'sem-internet': telaSemInternet, 'sem-servidor': telaSemServidor, fim: telaFim, criar: telaCriar, voltando: telaVoltando, entrar: telaEntrar, sala: telaSala, 'em-jogo': telaEmJogo, resultado: telaResultado }[v];
    r.appendChild(el('div', { class: 'conteudo amigos' },
      el('div', { class: 'titulo-tela' }, el('h1', { text: 'Mesa com amigos' }),
        el('p', { text: 'Poker, truco e Última! pela internet: crie a mesa, mande o link e jogue com quem entrar.' })),
      desenhar()));
    desenhando = false;
    atualizarPartes();
  }

  /** Mudou alguma coisa: troca a tela se mudou a vista; senão só as partes vivas (sem perder o que está sendo digitado). */
  function atualizar() {
    if (desenhando) return;
    if (vista() !== st.desenhada) render();
    else atualizarPartes();
  }
  function atualizarPartes() {
    const r = raiz();
    if (!r) return;
    r.querySelectorAll('[data-parte]').forEach(p => {
      p.innerHTML = '';
      [].concat(PARTES[p.dataset.parte]()).forEach(c => { if (c) p.appendChild(c); });
    });
  }
  const parte = (nome, tag, classe) => el(tag || 'div', { 'data-parte': nome, class: classe || null });
  const caixa = (...filhos) => el('section', { class: 'painel amigos-centro amigos-caixa' }, ...filhos);
  const nota = texto => el('small', { class: 'amigos-nota', text: texto });

  function telaSemInternet() {
    const codigo = R.codigoDoLink();
    return caixa(
      el('h2', { text: 'Precisa abrir pelo site' }),
      el('p', { text: 'Você abriu o jogo pelo arquivo do computador, que funciona sem internet. A mesa com amigos acontece num servidor na internet, então ela só funciona pelo site.' }),
      el('div', { class: 'amigos-acoes' }, el('a', { class: 'btn btn-ouro', href: R.SITE + (codigo ? '#mesa=' + codigo : ''), target: '_blank', rel: 'noopener', text: 'Abrir o site' })),
      nota('O resto do app (mesas contra bots, treino, estatísticas) continua funcionando offline.'));
  }

  function telaSemServidor() {
    return caixa(
      el('h2', { text: 'Em breve' }),
      el('p', { text: 'O servidor das mesas com amigos ainda não foi publicado.' }),
      nota('Depois do primeiro deploy (pasta servidor/), o endereço do servidor entra em js/rede.js.'));
  }

  function telaFim() {
    const f = st.fim;
    const titulo = { inexistente: 'Mesa não encontrada', encerrada: 'Mesa encerrada', 'outra-aba': 'Mesa aberta em outra aba ou aparelho' }[f.motivo] || 'Conexão encerrada';
    const outraAba = f.motivo === 'outra-aba';
    return caixa(
      el('h2', { text: titulo }),
      el('p', { text: f.texto }),
      f.motivo === 'inexistente' ? nota('Cada link vale para uma partida só: quando a partida termina (ou a sala fica vazia por um tempo), a mesa é apagada. Peça um link novo para quem organizou.') : null,
      el('div', { class: 'amigos-acoes' },
        outraAba ? el('button', { class: 'btn btn-ouro', text: 'Usar nesta aba', onclick: retomarAqui }) : null,
        el('button', { class: 'btn' + (outraAba ? '' : ' btn-ouro'), text: 'Criar uma mesa nova', onclick: voltarAoInicio })));
  }

  function campoNome(aoEnter) {
    campoNomeAtual = el('input', { class: 'entrada', type: 'text', maxlength: R.TAM_NOME, value: nomeSalvo(), placeholder: 'Como você quer aparecer na mesa', autocomplete: 'nickname', enterkeyhint: 'go' });
    campoNomeAtual.addEventListener('keydown', e => { if (e.key === 'Enter') aoEnter(); });
    return el('label', { class: 'campo' }, el('span', { text: 'Seu nome' }), campoNomeAtual);
  }

  function opcoes(itens, atual, aoEscolher) {
    return el('div', { class: 'opcoes-linha' },
      itens.map(([valor, texto]) => el('button', { class: 'opcao' + (atual === valor ? ' ativo' : ''), text: texto, onclick: () => aoEscolher(valor) })));
  }

  function telaCriar() {
    const f = st.form;
    // escolher(caminho, valor): "lugares" ou "truco.regras"
    const escolher = (k, v) => {
      const [a, b] = k.split('.');
      if (b) f[a][b] = v; else f[a] = v;
      P.Armazenamento.gravar('amigos.form', f);
      const nome = campoNomeAtual.value;
      render();
      campoNomeAtual.value = nome;   // não perde o que já foi digitado
    };
    const campos = { poker: camposPoker, truco: camposTruco, ultima: camposUltima }[f.jogo](escolher);
    const form = el('section', { class: 'painel amigos-form' },
      el('h3', { text: 'Nova mesa' }),
      campoNome(criar),
      el('div', { class: 'campo' }, el('span', { text: 'Jogo' }), opcoes(JOGOS, f.jogo, v => escolher('jogo', v))),
      ...campos,
      parte('aviso'),
      parte('botao-criar'));
    return el('div', { class: 'amigos-grade' }, form, comoFunciona());
  }

  function camposPoker(escolher) {
    const f = st.form, dur = E.SNG_DURACAO;
    // fichas: os valores prontos ou qualquer outro
    const fichas = opcoes(FICHAS.map(x => [x, F.fichas(x)]), f.fichas, v => escolher('fichas', v));
    const outras = el('input', { class: 'entrada entrada-fichas' + (FICHAS.indexOf(f.fichas) < 0 ? ' ativo' : ''), type: 'number', min: FICHAS_MIN, max: FICHAS_MAX, step: 100, value: f.fichas, inputmode: 'numeric', title: 'Outro valor de fichas' });
    outras.addEventListener('change', () => escolher('fichas', Math.max(FICHAS_MIN, Math.min(FICHAS_MAX, Math.round(+outras.value) || E.SNG_STACK))));
    fichas.appendChild(outras);
    // premiação: valor total fixo, digitado em reais
    const premio = el('input', { class: 'entrada entrada-premio', type: 'text', inputmode: 'decimal', value: st.premioTexto, placeholder: 'Ex.: 20,00', maxlength: 12 });
    premio.addEventListener('input', () => { st.premioTexto = premio.value; atualizarPartes(); });
    premio.addEventListener('keydown', e => { if (e.key === 'Enter') criar(); });
    return [
      el('div', { class: 'campo' }, el('span', { text: 'Lugares na mesa (no máximo)' }),
        opcoes([2, 3, 4, 5, 6, 7, 8, 9].map(n => [n, String(n)]), f.lugares, v => escolher('lugares', v)),
        nota('Não precisa encher: a partida começa com 2 ou mais jogadores, quando você quiser.')),
      el('div', { class: 'campo' }, el('span', { text: 'Fichas iniciais (iguais para todos)' }), fichas),
      el('div', { class: 'campo' }, el('span', { text: 'Velocidade dos níveis' }),
        opcoes([['regular', `Regular (${dur.regular / 60} min)`], ['turbo', `Turbo (${dur.turbo / 60} min)`]], f.velocidade, v => escolher('velocidade', v))),
      el('label', { class: 'campo' }, el('span', { text: 'Premiação total (R$)' }),
        el('div', { class: 'linha-premio' }, el('b', { text: 'R$' }), premio)),
      parte('divisao', 'div', 'amigos-divisao')
    ];
  }

  function camposTruco(escolher) {
    const t = st.form.truco;
    return [
      el('div', { class: 'campo' }, el('span', { text: 'Formato' }),
        opcoes([[4, 'Em dupla (4 jogadores)'], [2, '1 contra 1']], t.lugares, v => escolher('truco.lugares', v)),
        nota(t.lugares === 4 ? 'Lugares 1 e 3 contra 2 e 4: na sala de espera, cada um toca no lugar que quiser para escolher o parceiro.' : 'Você contra um amigo.')),
      el('div', { class: 'campo' }, el('span', { text: 'Regras' }),
        opcoes([['paulista', 'Paulista'], ['paranaense', 'Paranaense']], t.regras, v => escolher('truco.regras', v)),
        nota(t.regras === 'paulista' ? 'Com vira (a manilha muda a cada mão), truco, seis, nove e doze.' : 'Com vira, truco (3) e retruco (6); na mão de 11 os parceiros podem trocar cartas.'))
    ];
  }

  function camposUltima(escolher) {
    const u = st.form.ultima;
    const liga = (k, txt, ajuda) => el('label', { class: 'campo-check' },
      el('input', { type: 'checkbox', checked: u[k] ? true : null, onchange: e => escolher('ultima.' + k, e.target.checked) }),
      el('span', {}, el('b', { text: txt }), el('small', { text: ajuda })));
    return [
      el('div', { class: 'campo' }, el('span', { text: 'Lugares na mesa (no máximo)' }),
        opcoes([2, 3, 4, 5, 6].map(n => [n, String(n)]), u.lugares, v => escolher('ultima.lugares', v)),
        nota('Não precisa encher: a partida começa com 2 ou mais jogadores, quando você quiser.')),
      el('div', { class: 'campo' }, el('span', { text: 'Partida' }),
        opcoes([[0, 'Uma mão'], [200, '200 pontos'], [500, '500 pontos']], u.ate, v => escolher('ultima.ate', v))),
      el('div', { class: 'campo' }, el('span', { text: 'Regras da casa' }),
        liga('comprarAtePoder', 'Comprar até poder jogar', 'Quem não tem carta que sirva compra até sair uma.'),
        liga('juntas', 'Jogar cartas iguais juntas', 'Vários números iguais de uma vez.'),
        nota('+2 e +4 sempre passam adiante (vale +2 em cima do +4), e cada carta comprada é um toque.'))
    ];
  }

  function comoFunciona() {
    const jogo = st.form.jogo;
    const formato = {
      poker: 'Sit & Go: todos começam com as mesmas fichas, os blinds sobem e quem perde tudo sai. O último que sobrar vence.',
      truco: 'Partida até 12 pontos. No truco em dupla, a partida só começa com os 4 sentados.',
      ultima: 'Ganha quem zerar as cartas (ou, por pontos, quem chegar primeiro ao total).'
    }[jogo];
    return el('aside', { class: 'painel amigos-lado' },
      el('h3', { text: 'Como funciona' }),
      el('ol', {},
        el('li', { text: 'Você cria a mesa e recebe um link.' }),
        el('li', { text: 'Manda o link no WhatsApp. Quem abrir digita só o nome e já senta. Sem cadastro.' }),
        el('li', { text: jogo === 'truco' ? 'Você começa a partida quando todos estiverem sentados.' : 'Você começa a partida quando quiser, com 2 ou mais jogadores, sem esperar a mesa encher.' }),
        el('li', { text: formato }),
        el('li', { text: 'Sem bots e sem coach: é só entre vocês. Cada jogada tem um prazo; se ele acabar, a mesa joga por você.' }),
        el('li', { text: 'Quando a partida termina, a mesa é apagada e o link para de funcionar.' })),
      jogo === 'poker' ? el('div', { class: 'amigos-pix', html: '<b>Dinheiro de verdade fica fora do app.</b> A premiação que você define aqui aparece para todos e é dividida pelo número de jogadores, mas o acerto é por Pix, entre vocês. O app não cobra taxa e não mexe com pagamento.' }) : null);
  }

  function telaVoltando() {
    return caixa(
      el('div', { class: 'amigos-cab' }, el('h2', { text: 'Abrindo a mesa ' + st.codigo }), parte('conexao', 'span')),
      nota('Voltando para o seu lugar…'));
  }

  function telaEntrar() {
    return caixa(
      el('div', { class: 'amigos-cab' }, parte('titulo-entrar', 'h2'), parte('conexao', 'span')),
      parte('resumo'),
      parte('lugares', 'div', 'lugares-amigos'),
      campoNome(sentar),
      parte('aviso'),
      parte('botao-sentar'),
      jogoDaMesa() === 'poker' ? nota('Dinheiro de verdade fica fora do app: o acerto da premiação é por Pix, com quem organizou.') : null);
  }

  function convite(link) {
    const c = st.sala && st.sala.config;
    if (c && c.jogo === 'truco') return `Bora jogar truco${c.lugares === 4 ? ' em dupla' : ''}? Entra na minha mesa: ${link}`;
    if (c && c.jogo === 'ultima') return `Bora jogar Última!? Entra na minha mesa: ${link}`;
    const premio = c && c.premio;
    return `Bora jogar poker?${premio ? ` Premiação de ${reais(premio)}.` : ''} Entra na minha mesa: ${link}`;
  }

  function telaSala() {
    const link = R.linkDaMesa(st.codigo);
    const campoLink = el('input', { class: 'entrada', type: 'text', readonly: true, value: link, onfocus: e => e.target.select() });
    const texto = convite(link);
    const jogo = jogoDaMesa();
    const lado = el('aside', { class: 'painel amigos-lado' },
      el('h3', { text: 'Convide pelo link' }),
      el('div', { class: 'link-mesa' }, campoLink, el('button', { class: 'btn', text: 'Copiar', onclick: () => copiarLink(campoLink) })),
      el('div', { class: 'amigos-acoes' },
        el('a', { class: 'btn btn-whats', href: 'https://wa.me/?text=' + encodeURIComponent(texto), target: '_blank', rel: 'noopener', text: 'Enviar no WhatsApp' }),
        navigator.share ? el('button', { class: 'btn', text: 'Compartilhar', onclick: () => navigator.share({ title: 'Mesa de ' + NOME_JOGO[jogo], text: texto }).catch(() => {}) }) : null),
      nota('O link vale só para esta partida. Quem abrir digita o nome e senta no primeiro lugar livre.'),
      parte('resumo'),
      parte('acoes', 'div', 'amigos-acoes-sala'));
    const principal = el('section', { class: 'painel amigos-form' },
      el('div', { class: 'amigos-cab' }, el('h3', { text: 'Sala de espera' }), el('span', { class: 'selo info', text: 'Mesa ' + st.codigo }), parte('conexao', 'span')),
      parte('lugares', 'div', 'lugares-amigos'),
      jogo === 'poker' ? el('div', { class: 'amigos-pix', html: '<b>Dinheiro de verdade fica fora do app.</b> A premiação é dividida conforme quantos começarem a partida, e o acerto é por Pix, entre vocês.' })
        : nota('Toque num lugar livre para trocar de lugar.' + (jogo === 'truco' && st.sala && st.sala.config.lugares === 4 ? ' Os lugares 1 e 3 jogam juntos contra o 2 e o 4.' : '')));
    return el('div', { class: 'amigos-grade' }, principal, lado);
  }

  function telaEmJogo() {
    return caixa(
      el('div', { class: 'amigos-cab' }, el('h2', { text: 'Partida em andamento' }), el('span', { class: 'selo info', text: 'Mesa ' + st.codigo }), parte('conexao', 'span')),
      parte('situacao', 'p'),
      el('div', { class: 'amigos-acoes' },
        el('button', { class: 'btn btn-ouro', text: 'Voltar para a mesa', onclick: voltarParaMesa }),
        el('button', { class: 'btn', text: 'Largar esta mesa', onclick: voltarAoInicio })));
  }

  function telaResultado() {
    const m = st.resultado;
    const tabela = m.jogo ? tabelaCartas(m) : P.PartidaRemota.tabelaResultado(m, st.jogo ? st.jogo.meuAssento : -1);
    return caixa(
      el('div', { class: 'amigos-cab' }, el('h2', { text: 'Fim da partida' }), el('span', { class: 'selo info', text: 'Mesa ' + st.codigo })),
      tabela,
      nota('A mesa é apagada alguns minutos depois do fim. Para jogar de novo, crie uma mesa nova e mande o link.'),
      el('div', { class: 'amigos-acoes' }, el('button', { class: 'btn btn-ouro', text: 'Criar uma mesa nova', onclick: voltarAoInicio })));
  }

  /** Resultado do truco (equipes e placar) ou do Última! (pontos de cada um). */
  function tabelaCartas(m) {
    const r = m.resultado || {};
    if (r.erro) return el('p', { class: 'amigos-erro', text: 'A partida foi interrompida por um erro no servidor.' });
    const eu = st.partida ? st.partida.meuAssento : -1;
    if (m.jogo === 'truco') {
      const linha = eq => el('tr', { class: (eu >= 0 && eu % 2 === eq) ? 'voce' : null },
        el('td', { text: r.vencedor === eq ? 'Venceu' : '' }), el('td', { text: (r.equipes[eq] || []).join(' e ') }), el('td', { class: 'dir', text: String(r.placar[eq]) }));
      return el('div', { class: 'resultado-amigos' },
        el('p', { text: `Truco · ${r.maos} mãos jogadas.` }),
        el('table', { class: 'tabela' },
          el('thead', {}, el('tr', {}, el('th', { text: '' }), el('th', { text: r.equipes[0].length > 1 ? 'Dupla' : 'Jogador' }), el('th', { class: 'dir', text: 'Pontos' }))),
          el('tbody', {}, [r.vencedor, 1 - r.vencedor].map(linha))));
    }
    const ordem = r.placar.map((p, j) => [p, j]).sort((a, b) => (b[1] === r.vencedor) - (a[1] === r.vencedor) || b[0] - a[0]);
    return el('div', { class: 'resultado-amigos' },
      el('p', { text: `Última! · ${r.maos} ${r.maos === 1 ? 'mão' : 'mãos'}.` }),
      el('table', { class: 'tabela' },
        el('thead', {}, el('tr', {}, el('th', { text: '' }), el('th', { text: 'Jogador' }), el('th', { class: 'dir', text: 'Pontos' }))),
        el('tbody', {}, ordem.map(([p, j]) => el('tr', { class: j === eu ? 'voce' : null },
          el('td', { text: j === r.vencedor ? 'Venceu' : '' }),
          el('td', { text: r.nomes[j] + (j === eu ? ' (você)' : '') }),
          el('td', { class: 'dir', text: String(p) }))))));
  }

  // ------------------------------------------------- partes que mudam ao vivo
  /** No truco em dupla: de que lado é o lugar (1 e 3 contra 2 e 4). */
  const ladoTruco = l => (l % 2 === 0 ? 'dupla A' : 'dupla B');

  const PARTES = {
    aviso: () => st.aviso ? el('p', { class: 'amigos-erro', text: st.aviso }) : null,

    'titulo-entrar': () => document.createTextNode(!st.sala || st.sala.status === 'espera' ? 'Você foi convidado para uma mesa' + (st.sala ? ' de ' + NOME_JOGO[jogoDaMesa()] : '')
      : st.sala.status === 'jogando' ? 'A partida desta mesa já começou' : 'A partida desta mesa terminou'),

    /** Fora da mesa durante a partida: eliminado, saiu (a mesa joga por ele) ou ainda abrindo. */
    situacao: () => {
      if (ehCartas(jogoDaMesa())) {
        const p = st.partida, eu = p && p.jogadores[p.meuAssento];
        if (eu && eu.fora) return document.createTextNode('Você saiu da mesa. Enquanto estiver fora, na sua vez a mesa espera o tempo acabar e joga por você. Volte quando quiser, enquanto a partida não terminar.');
        return document.createTextNode('A partida desta mesa está acontecendo agora.');
      }
      const eu = st.jogo && st.jogo.jogadores[st.jogo.meuAssento];
      if (eu && eu.posicao) return document.createTextNode(`Você saiu em ${eu.posicao}º lugar. Dá para continuar assistindo até o fim.`);
      if (eu && eu.fora) return document.createTextNode('Você saiu da mesa. Enquanto estiver fora, na sua vez a mesa espera o tempo acabar e dá fold por você (com 1 big blind ou menos, vai all-in). Volte quando quiser, enquanto a partida não terminar.');
      return document.createTextNode('A partida desta mesa está acontecendo agora.');
    },

    conexao: () => {
      const s = st.conexaoEstado;
      if (s === 'aberta') return el('span', { class: 'selo ok', text: 'Conectado' });
      if (s === 'reconectando') return el('span', { class: 'selo aviso', text: 'Reconectando…' });
      return el('span', { class: 'selo', text: 'Conectando…' });
    },

    'botao-criar': () => el('button', {
      class: 'btn btn-ouro btn-sentar', disabled: st.ocupado ? true : null, onclick: criar,
      text: st.ocupado ? 'Criando a mesa…' : 'Criar mesa e gerar link'
    }),

    'botao-sentar': () => {
      const pronta = st.sala && st.conexaoEstado === 'aberta';
      const status = st.sala ? st.sala.status : 'espera';
      // partida em andamento: quem já estava nela volta para o mesmo lugar pelo nome
      if (status === 'jogando') {
        return [el('p', { class: 'amigos-nota', text: 'Se você estava jogando, digite o mesmo nome com que entrou e volte para o seu lugar.' }),
          el('button', { class: 'btn btn-ouro btn-sentar', disabled: !pronta || st.ocupado ? true : null, onclick: sentar,
            text: !pronta ? 'Conectando à mesa…' : st.ocupado ? 'Voltando…' : 'Voltar para a mesa' })];
      }
      const cheia = st.sala && st.sala.jogadores.length >= st.sala.config.lugares;
      const terminou = status === 'fim';
      return el('button', {
        class: 'btn btn-ouro btn-sentar', disabled: !pronta || cheia || terminou || st.ocupado ? true : null, onclick: sentar,
        text: !pronta ? 'Conectando à mesa…' : terminou ? 'A partida já terminou' : cheia ? 'Mesa cheia' : st.ocupado ? 'Sentando…' : 'Sentar à mesa'
      });
    },

    resumo: () => {
      const s = st.sala;
      if (!s) return nota('Buscando a mesa…');
      const c = s.config;
      const anf = s.jogadores.find(j => j.anfitriao);
      const linha = (a, b) => el('div', {}, el('span', { text: a }), el('b', { text: b }));
      if (c.jogo === 'truco') {
        return el('div', { class: 'resumo-mesa' },
          linha('Jogo', 'Truco ' + (c.regras === 'paranaense' ? 'paranaense' : 'paulista')),
          anf ? linha('Anfitrião', anf.nome) : null,
          linha('Formato', c.lugares === 4 ? 'em dupla' : '1 contra 1'),
          linha('Jogadores', `${s.jogadores.length} de ${c.lugares}`),
          linha('Partida', 'até 12 pontos'));
      }
      if (c.jogo === 'ultima') {
        const casa = [c.comprarAtePoder ? 'comprar até poder jogar' : null, c.juntas ? 'cartas iguais juntas' : null].filter(Boolean);
        return el('div', { class: 'resumo-mesa' },
          linha('Jogo', 'Última!'),
          anf ? linha('Anfitrião', anf.nome) : null,
          linha('Jogadores', `${s.jogadores.length} de ${c.lugares}`),
          linha('Partida', c.ate ? `até ${c.ate} pontos` : 'uma mão'),
          linha('Regras da casa', casa.length ? casa.join(' · ') : 'nenhuma'));
      }
      const premio = c.premio || 0;
      const n = Math.max(2, s.jogadores.length);
      return el('div', { class: 'resumo-mesa' },
        anf ? linha('Anfitrião', anf.nome) : null,
        linha('Jogadores', `${s.jogadores.length} de ${c.lugares}`),
        linha('Fichas iniciais', F.fichas(c.fichas)),
        linha('Níveis', `${E.SNG_DURACAO[c.velocidade] / 60} min (${c.velocidade})`),
        linha('Premiação', premio ? reais(premio) : 'sem premiação'),
        // a divisão segue quantos estão sentados agora; vale a de quando a partida começar
        premio ? linha(`Divisão com ${n} jogadores`, divisao(premio, n)) : null);
    },

    /** Prévia da divisão na tela de criar mesa. */
    divisao: () => {
      const premio = lerReais(st.premioTexto);
      if (premio === null) return el('p', { class: 'amigos-erro', text: 'Valor inválido: use só números, como 20 ou 20,50 (até R$ 10.000).' });
      if (!premio) return nota('Deixe vazio para jogar sem premiação.');
      // faixas da divisão automática (2 · 3 a 6 · 7 a 9) que cabem no número de lugares escolhido
      const faixas = [[2, 2, '2 jogadores'], [3, 6, '3 a 6 jogadores'], [7, 9, '7 a 9 jogadores']].filter(f => f[0] <= st.form.lugares);
      return [nota('Dividida automaticamente pelo número de jogadores que começarem:')].concat(
        faixas.map(([de, , rotulo]) => el('div', {}, el('span', { text: rotulo }), el('b', { text: divisao(premio, de) }))));
    },

    lugares: () => {
      const s = st.sala;
      if (!s) return null;
      const dupla = s.config.jogo === 'truco' && s.config.lugares === 4;
      // na sala de espera, quem já sentou troca de lugar tocando num lugar livre
      const podeTrocar = s.status === 'espera' && !!st.eu;
      const porLugar = {};
      s.jogadores.forEach(j => { porLugar[j.lugar] = j; });
      const lista = [];
      for (let l = 0; l < s.config.lugares; l++) {
        const j = porLugar[l];
        const lado = dupla ? ' · ' + ladoTruco(l) : '';
        if (!j) {
          const livre = el(podeTrocar ? 'button' : 'div', { class: 'lugar-amigo livre' + (podeTrocar ? ' trocar' : ''), title: podeTrocar ? 'Sentar neste lugar' : null, onclick: podeTrocar ? () => trocarLugar(l) : null },
            el('span', { class: 'num', text: l + 1 }),
            el('span', { class: 'quem' }, el('b', { text: podeTrocar ? 'Sentar aqui' : 'Lugar livre' }),
              el('small', { text: (podeTrocar ? 'toque para trocar de lugar' : l === 0 && !s.jogadores.some(x => x.anfitriao) ? 'guardado para o anfitrião' : 'esperando alguém') + lado })));
          lista.push(livre);
          continue;
        }
        const souEu = st.eu && st.eu.lugar === l;
        // a bolinha já mostra a conexão: no texto só entra quando caiu
        const marcas = [j.anfitriao ? 'anfitrião' : null, souEu ? 'você' : null, j.conectado ? null : 'desconectado'].filter(Boolean).join(' · ') || 'conectado';
        lista.push(el('div', { class: 'lugar-amigo' + (souEu ? ' voce' : '') + (j.conectado ? '' : ' fora') + (dupla ? ' ' + (l % 2 === 0 ? 'lado-a' : 'lado-b') : ''), title: j.conectado ? 'Conectado' : 'Desconectado' },
          el('span', { class: 'num', text: l + 1 }),
          el('span', { class: 'quem' }, el('b', { text: j.nome }), el('small', { text: marcas + lado })),
          el('i', { class: 'ponto' })));
      }
      return lista;
    },

    acoes: () => {
      if (st.eu && st.eu.anfitriao) {
        const s = st.sala, n = s ? s.jogadores.length : 0, c = s ? s.config : {};
        // truco: só com todos sentados; os outros jogos: com 2 ou mais
        const precisa = c.jogo === 'truco' ? c.lugares : 2;
        const pronto = n >= precisa;
        return [
          el('button', {
            class: 'btn btn-ouro btn-sentar', disabled: !pronto || st.comecando ? true : null, onclick: comecar,
            text: st.comecando ? 'Começando…' : !pronto ? 'Começar partida' : `Começar partida (${n} jogadores)`
          }),
          nota(c.jogo === 'truco' ? (pronto ? 'Todos sentados: é só começar.' : `O truco ${c.lugares === 4 ? 'em dupla' : '1 contra 1'} começa com ${c.lugares} jogadores (faltam ${precisa - n}).`)
            : n < 2 ? 'Com mais um jogador já dá para começar: não precisa esperar a mesa encher.'
              : 'Não precisa esperar a mesa encher. Depois de começar, ninguém novo entra.'),
          el('button', { class: 'btn', text: 'Cancelar mesa', onclick: sair })
        ];
      }
      return [
        nota('Aguardando o anfitrião começar a partida.'),
        el('button', { class: 'btn', text: 'Sair da mesa', onclick: sair })
      ];
    }
  };

  P.UIAmigos = { render };
})(window.Poker = window.Poker || {});
