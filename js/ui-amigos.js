/* ==========================================================================
   OUTS · Treino Lab — ui-amigos.js
   Aba "Mesa com amigos": o anfitrião monta a mesa e recebe um link único;
   quem abre o link digita só o nome e senta num lugar livre; a sala de
   espera mostra em tempo real quem está na mesa e quem está conectado.
   Dinheiro de verdade fica fora do app (Pix com o organizador).
   A conexão fica em rede.js; o servidor em servidor/ (Cloudflare).
   ========================================================================== */
(function (P) {
  'use strict';

  const { el } = P.UI;
  const F = P.Formato, E = P.Estruturas, R = P.Rede;

  const FICHAS = [1500, 3000, 5000];
  const st = {
    form: Object.assign({ lugares: 6, fichas: E.SNG_STACK, velocidade: 'regular' }, P.Armazenamento.ler('amigos.form', {})),
    codigo: null,          // mesa aberta nesta aba
    conexao: null,
    conexaoEstado: 'fechada',
    sala: null,            // última mensagem "sala" do servidor
    eu: null,              // { lugar, token, anfitriao } depois de sentar
    fim: null,             // { motivo, texto }: mesa que não existe, foi encerrada ou abriu em outra aba
    aviso: null,           // erro ao criar ou ao sentar (nome repetido, mesa cheia…)
    ocupado: false,        // criando a mesa ou esperando a resposta do "entrar"
    voltando: false,       // tem token nesta aba: está voltando sozinho para o lugar
    desenhada: null        // vista que está na tela (para só atualizar as partes que mudam)
  };
  let campoNomeAtual = null;   // campo "Seu nome" da tela atual
  let desenhando = false;

  const nomeSalvo = () => P.Armazenamento.ler('amigos.nome', '') || (P.Config.get('nome') !== 'Você' ? P.Config.get('nome') : '');
  const raiz = () => document.getElementById('tela-amigos');

  // --------------------------------------------------------- conexão
  function abrirMesa(codigo) {
    if (st.codigo === codigo && (st.conexao || st.fim)) return;
    fecharConexao();
    Object.assign(st, { codigo, sala: null, eu: null, fim: null, aviso: null, ocupado: false, voltando: !!R.lerToken(codigo) });
    st.conexao = R.conectar(codigo, { estado: aoEstado, mensagem: aoMensagem });
  }

  function fecharConexao() {
    if (st.conexao) st.conexao.fechar();
    st.conexao = null;
    st.conexaoEstado = 'fechada';
  }

  function aoEstado(nome, info) {
    st.conexaoEstado = nome;
    if (nome === 'aberta') {
      // já sentou nesta aba (ou acabou de criar a mesa): volta para o mesmo lugar
      const token = R.lerToken(st.codigo);
      if (token) { st.ocupado = true; st.conexao.enviar({ tipo: 'entrar', token, nome: nomeSalvo() }); }
    } else if (nome === 'fechada') {
      st.conexao = null;
      if (!st.fim) st.fim = fimPorCodigo(info && info.codigo);
    }
    atualizar();
  }

  function fimPorCodigo(codigo) {
    if (codigo === 4404) return { motivo: 'inexistente', texto: 'Essa mesa não existe ou já terminou.' };
    if (codigo === 4410) return { motivo: 'encerrada', texto: 'A mesa foi encerrada.' };
    if (codigo === 4001) return { motivo: 'outra-aba', texto: 'Essa mesa foi aberta em outra aba.' };
    return { motivo: 'erro', texto: 'O servidor encerrou a conexão.' };
  }

  function aoMensagem(m) {
    if (m.tipo === 'sala') st.sala = m;
    else if (m.tipo === 'voce') {
      Object.assign(st, { eu: m, aviso: null, ocupado: false });
      R.gravarToken(st.codigo, m.token);
    } else if (m.tipo === 'erro') {
      Object.assign(st, { ocupado: false, voltando: false });
      if (m.motivo === 'inexistente' || m.motivo === 'outra-aba') st.fim = { motivo: m.motivo, texto: m.texto };
      else st.aviso = m.texto;
    } else if (m.tipo === 'encerrada') {
      st.fim = { motivo: 'encerrada', texto: m.texto };
      R.apagarToken(st.codigo);
    }
    atualizar();
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

  async function criar() {
    if (st.ocupado || !nomeDigitado()) return;
    Object.assign(st, { ocupado: true, aviso: null });
    atualizar();
    try {
      const r = await R.criarMesa({ lugares: st.form.lugares, fichas: st.form.fichas, velocidade: st.form.velocidade });
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
    // o token vai junto: o anfitrião que errou o nome continua anfitrião
    if (!st.conexao || !st.conexao.enviar({ tipo: 'entrar', nome, token: R.lerToken(st.codigo) || undefined })) { st.aviso = 'Sem conexão com a mesa. Tentando de novo…'; atualizar(); return; }
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
    fecharConexao();
    Object.assign(st, { codigo: null, sala: null, eu: null, fim: null, aviso: null, ocupado: false });
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
    if (st.fim) return 'fim';
    if (!st.codigo) return 'criar';
    if (st.eu) return 'sala';
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
    const desenhar = { 'sem-internet': telaSemInternet, 'sem-servidor': telaSemServidor, fim: telaFim, criar: telaCriar, voltando: telaVoltando, entrar: telaEntrar, sala: telaSala }[v];
    r.appendChild(el('div', { class: 'conteudo amigos' },
      el('div', { class: 'titulo-tela' }, el('h1', { text: 'Mesa com amigos' }),
        el('p', { text: 'Sit & Go pela internet: crie a mesa, mande o link e jogue com quem entrar.' })),
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
    const titulo = { inexistente: 'Mesa não encontrada', encerrada: 'Mesa encerrada', 'outra-aba': 'Mesa aberta em outra aba' }[f.motivo] || 'Conexão encerrada';
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
    const escolher = (k, v) => {
      st.form[k] = v;
      P.Armazenamento.gravar('amigos.form', st.form);
      const nome = campoNomeAtual.value;
      render();
      campoNomeAtual.value = nome;   // não perde o que já foi digitado
    };
    const dur = E.SNG_DURACAO;
    const form = el('section', { class: 'painel amigos-form' },
      el('h3', { text: 'Nova mesa' }),
      campoNome(criar),
      el('div', { class: 'campo' }, el('span', { text: 'Lugares na mesa' }),
        opcoes([2, 3, 4, 5, 6, 7, 8, 9].map(n => [n, String(n)]), st.form.lugares, v => escolher('lugares', v))),
      el('div', { class: 'campo' }, el('span', { text: 'Fichas iniciais (iguais para todos)' }),
        opcoes(FICHAS.map(f => [f, F.fichas(f)]), st.form.fichas, v => escolher('fichas', v))),
      el('div', { class: 'campo' }, el('span', { text: 'Velocidade dos níveis' }),
        opcoes([['regular', `Regular (${dur.regular / 60} min)`], ['turbo', `Turbo (${dur.turbo / 60} min)`]], st.form.velocidade, v => escolher('velocidade', v))),
      parte('aviso'),
      parte('botao-criar'));
    return el('div', { class: 'amigos-grade' }, form, comoFunciona());
  }

  function comoFunciona() {
    return el('aside', { class: 'painel amigos-lado' },
      el('h3', { text: 'Como funciona' }),
      el('ol', {},
        el('li', { text: 'Você cria a mesa e recebe um link.' }),
        el('li', { text: 'Manda o link no WhatsApp. Quem abrir digita só o nome e já senta. Sem cadastro.' }),
        el('li', { text: 'Sit & Go: todos começam com as mesmas fichas, os blinds sobem e quem perde tudo sai. O último que sobrar vence.' }),
        el('li', { text: 'Quando a partida termina, a mesa é apagada e o link para de funcionar.' })),
      el('div', { class: 'amigos-pix', html: '<b>Dinheiro de verdade fica fora do app.</b> Cada um paga a inscrição por Pix ao organizador, e o organizador paga os prêmios. O app não cobra taxa e não mexe com pagamento.' }));
  }

  function telaVoltando() {
    return caixa(
      el('div', { class: 'amigos-cab' }, el('h2', { text: 'Abrindo a mesa ' + st.codigo }), parte('conexao', 'span')),
      nota('Voltando para o seu lugar…'));
  }

  function telaEntrar() {
    return caixa(
      el('div', { class: 'amigos-cab' }, el('h2', { text: 'Você foi convidado para uma mesa' }), parte('conexao', 'span')),
      parte('resumo'),
      parte('lugares', 'div', 'lugares-amigos'),
      campoNome(sentar),
      parte('aviso'),
      parte('botao-sentar'),
      nota('Dinheiro de verdade fica fora do app: a inscrição e os prêmios são combinados com quem organizou.'));
  }

  function telaSala() {
    const link = R.linkDaMesa(st.codigo);
    const campoLink = el('input', { class: 'entrada', type: 'text', readonly: true, value: link, onfocus: e => e.target.select() });
    const convite = `Bora jogar poker? Entra na minha mesa: ${link}`;
    const lado = el('aside', { class: 'painel amigos-lado' },
      el('h3', { text: 'Convide pelo link' }),
      el('div', { class: 'link-mesa' }, campoLink, el('button', { class: 'btn', text: 'Copiar', onclick: () => copiarLink(campoLink) })),
      el('div', { class: 'amigos-acoes' },
        el('a', { class: 'btn btn-whats', href: 'https://wa.me/?text=' + encodeURIComponent(convite), target: '_blank', rel: 'noopener', text: 'Enviar no WhatsApp' }),
        navigator.share ? el('button', { class: 'btn', text: 'Compartilhar', onclick: () => navigator.share({ title: 'Mesa de poker', text: convite }).catch(() => {}) }) : null),
      nota('O link vale só para esta partida. Quem abrir digita o nome e senta no primeiro lugar livre.'),
      parte('resumo'),
      parte('acoes', 'div', 'amigos-acoes-sala'));
    const principal = el('section', { class: 'painel amigos-form' },
      el('div', { class: 'amigos-cab' }, el('h3', { text: 'Sala de espera' }), el('span', { class: 'selo info', text: 'Mesa ' + st.codigo }), parte('conexao', 'span')),
      parte('lugares', 'div', 'lugares-amigos'),
      el('div', { class: 'amigos-pix', html: '<b>Dinheiro de verdade fica fora do app.</b> Cada um paga a inscrição por Pix ao organizador, e o organizador paga os prêmios.' }));
    return el('div', { class: 'amigos-grade' }, principal, lado);
  }

  // ------------------------------------------------- partes que mudam ao vivo
  const PARTES = {
    aviso: () => st.aviso ? el('p', { class: 'amigos-erro', text: st.aviso }) : null,

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
      const cheia = st.sala && st.sala.jogadores.length >= st.sala.config.lugares;
      return el('button', {
        class: 'btn btn-ouro btn-sentar', disabled: !pronta || cheia || st.ocupado ? true : null, onclick: sentar,
        text: !pronta ? 'Conectando à mesa…' : cheia ? 'Mesa cheia' : st.ocupado ? 'Sentando…' : 'Sentar à mesa'
      });
    },

    resumo: () => {
      const s = st.sala;
      if (!s) return nota('Buscando a mesa…');
      const anf = s.jogadores.find(j => j.anfitriao);
      const linha = (a, b) => el('div', {}, el('span', { text: a }), el('b', { text: b }));
      return el('div', { class: 'resumo-mesa' },
        anf ? linha('Anfitrião', anf.nome) : null,
        linha('Jogadores', `${s.jogadores.length} de ${s.config.lugares}`),
        linha('Fichas iniciais', F.fichas(s.config.fichas)),
        linha('Níveis', `${E.SNG_DURACAO[s.config.velocidade] / 60} min (${s.config.velocidade})`));
    },

    lugares: () => {
      const s = st.sala;
      if (!s) return null;
      const porLugar = {};
      s.jogadores.forEach(j => { porLugar[j.lugar] = j; });
      const lista = [];
      for (let l = 0; l < s.config.lugares; l++) {
        const j = porLugar[l];
        if (!j) {
          lista.push(el('div', { class: 'lugar-amigo livre' }, el('span', { class: 'num', text: l + 1 }),
            el('span', { class: 'quem' }, el('b', { text: 'Lugar livre' }), el('small', { text: l === 0 ? 'guardado para o anfitrião' : 'esperando alguém' }))));
          continue;
        }
        const souEu = st.eu && st.eu.lugar === l;
        // a bolinha já mostra a conexão: no texto só entra quando caiu
        const marcas = [j.anfitriao ? 'anfitrião' : null, souEu ? 'você' : null, j.conectado ? null : 'desconectado'].filter(Boolean).join(' · ') || 'conectado';
        lista.push(el('div', { class: 'lugar-amigo' + (souEu ? ' voce' : '') + (j.conectado ? '' : ' fora'), title: j.conectado ? 'Conectado' : 'Desconectado' },
          el('span', { class: 'num', text: l + 1 }),
          el('span', { class: 'quem' }, el('b', { text: j.nome }), el('small', { text: marcas })),
          el('i', { class: 'ponto' })));
      }
      return lista;
    },

    acoes: () => {
      if (st.eu && st.eu.anfitriao) {
        const sozinho = !st.sala || st.sala.jogadores.length < 2;
        return [
          el('button', { class: 'btn btn-ouro btn-sentar', disabled: true, text: 'Começar partida' }),
          nota(sozinho ? 'Espere pelo menos mais um jogador entrar.' : 'O jogo em rede ainda está sendo construído: por enquanto dá para montar a sala e ver quem entrou.'),
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
