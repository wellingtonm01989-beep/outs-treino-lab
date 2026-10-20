/* ==========================================================================
   OUTS · Treino Lab — ui-truco-torneio.js
   A tela do torneio de truco: em que fase você está, o próximo adversário,
   o botão para jogar (ou continuar o jogo salvo), o andamento dos outros
   jogos (simulados entre bots enquanto você olha a chave) e a chave inteira,
   fase por fase. No fim, campeão, vice ou em que fase você caiu.
   A lógica do torneio fica em truco-torneio.js; o jogo, em ui-truco-mesa.js.
   ========================================================================== */
(function (P) {
  'use strict';

  const { el, esc } = P.UI;
  const T = P.Truco, TT = T.Torneio, IA = T.IA, D = T.Dados;

  let faseVista = null;        // fase mostrada na chave (null = a atual)
  let simToken = 0;            // simulação em andamento (muda para cancelar)
  let simulando = false;

  // ------------------------------------------------------------ apoio
  const tagPerfil = m => {
    if (!m || !m.perfil) return null;
    const pf = IA.PERFIS[m.perfil];
    return el('span', { class: 'tag-perfil', style: { '--cor-perfil': pf.cor }, title: `${pf.nome}: ${pf.descricao}`, text: pf.sigla });
  };
  const nomeRegras = t => (t.regras === 'paranaense' ? 'paranaense' : 'paulista');
  const unidade = (t, x) => (t.n === 4 ? (x === 1 ? 'dupla' : 'duplas') : (x === 1 ? 'jogador' : 'jogadores'));
  const resumoTorneio = t => `Torneio ${nomeRegras(t)} · ${t.participantes.length} ${unidade(t, t.participantes.length)} · ${t.melhorDe === 3 ? 'melhor de 3' : 'uma partida por confronto'}`;
  const outroLado = l => (l === 'a' ? 'b' : 'a');

  /** Conta o torneio nas estatísticas quando ele acaba para você (uma vez só). */
  function contabilizar(t) {
    if (t.contabilizado) return;
    const acabou = t.campeao !== null || t.eliminadoNa !== null;
    if (!acabou) return;
    t.contabilizado = true;
    const final = t.campeao === 0 || t.eliminadoNa === t.rodadas.length - 1;
    D.alterarEstat(e => { e.torneios.jogados++; if (t.campeao === 0) e.torneios.titulos++; if (final) e.torneios.finais++; });
  }

  // ------------------------------------------------------- resultado
  /**
   * Fim de um jogo seu (chamado pela mesa). ref: o que foi passado ao iniciar;
   * venceu: você (sua dupla) ganhou; placar: [vocês, eles]. Devolve um resumo em HTML.
   */
  function registrarPartida(ref, venceu, placar) {
    const t = D.torneio();
    if (!t || t.criadoEm !== ref.id) return null;
    const c = t.rodadas[ref.r] && t.rodadas[ref.r][ref.i];
    if (!c || c.vencedor || (c.a !== 0 && c.b !== 0)) return null;
    const lado = c.a === 0 ? 'a' : 'b';
    const placarAB = lado === 'a' ? [placar[0], placar[1]] : [placar[1], placar[0]];
    TT.registrarJogo(t, ref.r, ref.i, venceu ? lado : outroLado(lado), placarAB);
    contabilizar(t);
    D.salvarTorneio(t);
    faseVista = null;
    const fase = TT.nomeRodada(t, ref.r);
    const [va, vb] = TT.placarConfronto(c);
    const meu = lado === 'a' ? va : vb, dele = lado === 'a' ? vb : va;
    if (!c.vencedor) return `<b>${esc(fase)}:</b> confronto ${meu} × ${dele}. Vem o jogo ${c.jogos.length + 1}.`;
    if (t.campeao === 0) return '<b>Campeão do torneio!</b>';
    if (c.vencedor === lado) {
      const prox = TT.nomeRodada(t, ref.r + 1);
      return `<b>Classificado!</b> Você vai para ${TT.naFase(prox).replace(/^n/, '')}.`;
    }
    return `<b>Eliminado ${TT.naFase(fase)}.</b>`;
  }

  /** Abandonar: conta como torneio jogado (sem título). */
  function abandonar(t) {
    simToken++;
    if (t && !t.contabilizado && t.campeao === null) {
      t.eliminadoNa = TT.rodadaAtual(t);
      contabilizar(t);
    }
    const s = D.salva();
    if (s && s.cfg.torneio) D.descartar();
    D.descartarTorneio();
  }

  // ---------------------------------------------------------------- tela
  function render(raiz) {
    raiz = raiz || document.getElementById('tela-truco');
    const t = D.torneio();
    if (!t) { P.UITruco.abrirEntrada(); return; }
    raiz.innerHTML = '';
    const pag = el('div', { class: 'truco tr-torneio' });
    pag.appendChild(cabecalho(t));
    const meu = TT.meuConfronto(t);
    pag.appendChild(meu ? cartaoProximo(t, meu) : cartaoFim(t));
    pag.appendChild(chave(t));
    raiz.appendChild(pag);
    // os outros jogos: até a fase do seu próximo confronto (ou até o fim, se você pediu para ver)
    const ate = meu ? meu.r : (t.verResto ? undefined : -1);
    if (ate !== -1 && TT.simulaveis(t, ate).length && !simulando) simularAgora(t, ate);
  }

  function cabecalho(t) {
    const camp = TT.campanha(t);
    const jg = TT.seusJogos(t);
    return el('section', { class: 'tr-t-cab' },
      el('div', { class: 'tr-t-tit' },
        el('small', { text: resumoTorneio(t) }),
        el('h1', { text: camp.texto }),
        el('span', { class: 'tr-t-jogos', html: `Seus jogos: <b>${jg.vitorias}</b> ${jg.vitorias === 1 ? 'vitória' : 'vitórias'} · <b>${jg.derrotas}</b> ${jg.derrotas === 1 ? 'derrota' : 'derrotas'}` })),
      el('div', { class: 'tr-t-acoes' },
        el('button', { class: 'btn', text: 'Voltar', onclick: () => { simToken++; P.UITruco.abrirEntrada(); } }),
        t.campeao === null && t.eliminadoNa === null ? el('button', { class: 'btn btn-sair-t', text: 'Abandonar', onclick: async () => {
          if (!(await P.UI.confirmar('Abandonar o torneio?', 'Você sai do torneio e ele conta como jogado, sem título.', 'Abandonar', 'Continuar no torneio'))) return;
          abandonar(t);
          P.UITruco.abrirEntrada();
        } }) : null));
  }

  /** Você (e o parceiro) contra o próximo adversário. */
  function lado(p, voce) {
    const box = el('div', { class: 'tr-t-lado' + (voce ? ' voce' : '') });
    const av = el('div', { class: 'tr-t-avatares' });
    p.membros.forEach((m, k) => av.appendChild(el('div', { class: 'avatar', html: P.UI.avatarSVG(m.avatar, voce && k === 0) })));
    box.appendChild(av);
    const nomes = el('div', { class: 'tr-t-nomes' });
    p.membros.forEach((m, k) => nomes.appendChild(el('div', { class: 'tr-t-nome' },
      el('span', { text: voce && k === 0 ? 'Você' : m.nome }), tagPerfil(m))));
    box.appendChild(nomes);
    return box;
  }

  function cartaoProximo(t, meu) {
    const c = meu.c, ladoMeu = meu.lado;
    const adv = t.participantes[ladoMeu === 'a' ? c.b : c.a];
    const eu = t.participantes[0];
    const fase = TT.nomeRodada(t, meu.r);
    const k = c.jogos.length + 1;
    const [va, vb] = TT.placarConfronto(c);
    const meuPlacar = ladoMeu === 'a' ? va : vb, delePlacar = ladoMeu === 'a' ? vb : va;
    const box = el('section', { class: 'painel tr-t-proximo' });
    box.appendChild(el('div', { class: 'tr-t-rot', text: `Seu próximo jogo · ${fase}` + (t.melhorDe === 3 ? ` · jogo ${k} de 3` : '') }));
    if (!adv) {
      box.appendChild(el('p', { class: 'tr-t-espera', text: 'Esperando o adversário sair dos outros jogos da chave…' }));
      box.appendChild(progresso());
      return box;
    }
    box.appendChild(el('div', { class: 'tr-t-versus' },
      lado(eu, true),
      el('div', { class: 'tr-t-x' }, t.melhorDe === 3 ? el('b', { text: `${meuPlacar} × ${delePlacar}` }) : el('span', { text: '×' })),
      lado(adv, false)));
    const salva = D.salva();
    const ref = { id: t.criadoEm, r: meu.r, i: meu.i, jogo: k };
    const emAndamento = salva && salva.cfg.torneio && salva.cfg.torneio.id === ref.id && salva.cfg.torneio.r === ref.r && salva.cfg.torneio.i === ref.i && salva.cfg.torneio.jogo === ref.jogo;
    box.appendChild(el('button', {
      class: 'btn btn-ouro btn-sentar', id: 'tr-t-jogar',
      text: emAndamento ? `Continuar o jogo (${salva.estado.placar[0]} × ${salva.estado.placar[1]})` : t.melhorDe === 3 && k > 1 ? `Jogar o jogo ${k}` : 'Jogar',
      onclick: () => jogar(t, meu, emAndamento ? salva : null)
    }));
    box.appendChild(progresso());
    return box;
  }

  function cartaoFim(t) {
    const camp = TT.campanha(t);
    const box = el('section', { class: 'painel tr-t-fim' + (camp.campeao ? ' campeao' : '') });
    if (camp.campeao) box.appendChild(el('div', { class: 'tr-t-trofeu', 'aria-hidden': 'true', html: TROFEU }));
    // o cabeçalho já diz onde você parou; aqui, o que vem agora
    box.appendChild(el('h2', { text: camp.campeao ? 'Você é o campeão!' : t.campeao !== null ? 'Fim do torneio' : 'Seu torneio acabou' }));
    if (t.campeao !== null && t.campeao !== 0) {
      const p = t.participantes[t.campeao];
      box.appendChild(el('p', { html: `Campeão: <b>${esc(p.nome)}</b>` }));
    } else if (t.campeao === null) {
      box.appendChild(el('p', { text: 'Dá para ver como termina: os jogos que faltam são jogados agora entre os bots.' }));
    }
    const linha = el('div', { class: 'tr-t-botoes' });
    if (t.campeao === null) {
      linha.appendChild(el('button', { class: 'btn btn-ouro', text: 'Ver o resto do torneio', onclick: () => { t.verResto = true; D.salvarTorneio(t); render(); } }));
    }
    linha.appendChild(el('button', { class: 'btn' + (t.campeao !== null ? ' btn-ouro' : ''), text: 'Novo torneio', onclick: () => {
      simToken++;
      D.descartarTorneio();
      const cfg = D.config(); cfg.aba = 'torneio'; D.salvarConfig(cfg);
      P.UITruco.abrirEntrada();
    } }));
    box.appendChild(linha);
    box.appendChild(progresso());
    return box;
  }

  const TROFEU = '<svg viewBox="0 0 64 64"><path d="M20 8h24v14c0 9-5 16-12 16s-12-7-12-16z" fill="var(--ouro)"/><path d="M20 12H10c0 9 4 14 11 15M44 12h10c0 9-4 14-11 15" fill="none" stroke="var(--ouro)" stroke-width="4"/><rect x="28" y="38" width="8" height="10" fill="var(--ouro-escuro)"/><rect x="18" y="48" width="28" height="8" rx="2" fill="var(--ouro)"/></svg>';

  /** Linha de andamento dos jogos simulados. */
  function progresso() {
    return el('div', { class: 'tr-t-sim oculto', id: 'tr-t-sim' },
      el('span', { id: 'tr-t-sim-txt', text: 'Jogando os outros confrontos…' }),
      el('div', { class: 'progresso' }, el('i', { id: 'tr-t-sim-barra' })));
  }

  /** A chave: abas por fase e os confrontos daquela fase. */
  function chave(t) {
    const atual = TT.meuConfronto(t) ? TT.meuConfronto(t).r : TT.rodadaAtual(t);
    const fase = faseVista === null || faseVista >= t.rodadas.length ? atual : faseVista;
    const box = el('section', { class: 'painel tr-t-chave' });
    box.appendChild(el('h3', { text: 'Chave' }));
    const abas = el('div', { class: 'tr-t-fases', role: 'tablist' });
    t.rodadas.forEach((rod, r) => {
      const feitos = rod.filter(c => c.vencedor).length;
      abas.appendChild(el('button', {
        class: 'opcao' + (r === fase ? ' ativo' : ''), role: 'tab', 'aria-selected': r === fase ? 'true' : 'false',
        html: `${esc(TT.nomeRodada(t, r))} <small>${feitos}/${rod.length}</small>`,
        onclick: () => { faseVista = r; render(); }
      }));
    });
    box.appendChild(abas);
    // no celular as abas rolam de lado: a da fase mostrada fica à vista
    requestAnimationFrame(() => {
      const ativa = abas.querySelector('.ativo');
      if (ativa) abas.scrollLeft = Math.max(0, ativa.offsetLeft - abas.offsetLeft - 8);
    });
    const lista = el('div', { class: 'tr-t-lista' });
    t.rodadas[fase].forEach(c => lista.appendChild(confronto(t, c)));
    box.appendChild(lista);
    return box;
  }

  function confronto(t, c) {
    const meu = c.a === 0 || c.b === 0;
    const [va, vb] = TT.placarConfronto(c);
    const ultimo = c.jogos[c.jogos.length - 1];
    const placarDe = l => {
      if (c.bye || !c.jogos.length) return '';
      if (t.melhorDe === 3) return String(l === 'a' ? va : vb);
      return ultimo && ultimo.placar ? String(l === 'a' ? ultimo.placar[0] : ultimo.placar[1]) : '';
    };
    const linha = l => {
      const idx = l === 'a' ? c.a : c.b;
      if (idx === null) return el('div', { class: 'tr-t-c-lado vazio' }, el('span', { class: 'nm', text: c.bye ? 'passa direto' : 'a definir' }), el('b', { text: '' }));
      const p = t.participantes[idx];
      const cls = 'tr-t-c-lado' + (c.vencedor === l ? ' venceu' : c.vencedor ? ' perdeu' : '') + (idx === 0 ? ' voce' : '');
      const tags = el('span', { class: 'tags' }, p.membros.map(tagPerfil).filter(Boolean));
      return el('div', { class: cls }, el('span', { class: 'nm', text: p.nome }), tags, el('b', { text: placarDe(l) }));
    };
    return el('div', { class: 'tr-t-conf' + (meu ? ' meu' : '') + (c.vencedor ? ' decidido' : '') },
      linha('a'), c.bye ? null : linha('b'),
      c.bye ? el('small', { class: 'tr-t-c-info', text: 'Passou direto (sorteio)' }) : t.melhorDe === 3 && c.jogos.length ? el('small', { class: 'tr-t-c-info', text: c.jogos.map(j => j.placar ? `${j.placar[0]}×${j.placar[1]}` : '').join(' · ') }) : null);
  }

  // ------------------------------------------------------------- ações
  function jogar(t, meu, salva) {
    simToken++;                                      // para a simulação (continua quando você voltar)
    if (salva) { P.UITrucoMesa.iniciar({ retomar: salva }); return; }
    const outra = D.salva();
    if (outra) D.descartar();                        // uma partida avulsa (ou de outro jogo) salva dá lugar a esta
    const c = meu.c;
    const adv = t.participantes[meu.lado === 'a' ? c.b : c.a];
    const eu = t.participantes[0];
    const voce = { nome: P.Config.get('nome') || 'Você', avatar: null };
    const jogadores = t.n === 4 ? [voce, adv.membros[0], eu.membros[1], adv.membros[1]] : [voce, adv.membros[0]];
    const fase = TT.nomeRodada(t, meu.r), k = c.jogos.length + 1;
    const curtoFase = fase.replace(' de final', '');
    const torneio = {
      id: t.criadoEm, r: meu.r, i: meu.i, jogo: k,
      rotulo: `${fase}${t.melhorDe === 3 ? ` · jogo ${k} de 3` : ''} · contra ${adv.nome}`,
      curto: curtoFase + (t.melhorDe === 3 ? ` · jogo ${k}/3` : '')
    };
    P.UITrucoMesa.iniciar({ n: t.n, regras: t.regras, jogadores, torneio });
  }

  async function simularAgora(t, ate) {
    const meuToken = ++simToken;
    simulando = true;
    const caixa = document.getElementById('tr-t-sim');
    const txt = document.getElementById('tr-t-sim-txt'), barra = document.getElementById('tr-t-sim-barra');
    if (caixa) caixa.classList.remove('oculto');
    try {
      await TT.simular(t, ate, (feitos, total) => {
        if (meuToken !== simToken) return;
        D.salvarTorneio(t);                          // cada confronto que termina fica salvo
        if (txt) txt.textContent = `Jogando os outros confrontos: ${feitos} de ${total}`;
        if (barra) barra.style.width = Math.round(feitos / total * 100) + '%';
      }, true, () => meuToken !== simToken);
    } catch (e) {
      console.error(e);
      P.UI.aviso('Erro ao simular o torneio: ' + esc(e.message), 'erro');
    }
    simulando = false;
    if (meuToken !== simToken) return;
    D.salvarTorneio(t);
    // a tela ainda é a do torneio? mostra o resultado dos jogos
    if (document.querySelector('.tr-torneio') && !(P.UITrucoMesa && P.UITrucoMesa.emJogo())) render();
  }

  P.UITrucoTorneio = { render, registrarPartida, abandonar, _simulando: () => simulando };
})(window.Poker = window.Poker || {});
