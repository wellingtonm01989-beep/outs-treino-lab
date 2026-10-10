/* ==========================================================================
   OUTS · Treino Lab — rede.js
   Conexão com o servidor da mesa com amigos (Cloudflare, pasta servidor/):
   criar a mesa, WebSocket com reconexão automática e a identidade de cada
   aba (token guardado no sessionStorage para voltar ao mesmo lugar depois
   de recarregar a página).
   Só funciona pelo site (https) ou em teste local (http://localhost). Pelo
   duplo clique (file://) a aba "Mesa com amigos" explica que precisa do site.
   O cliente só manda mensagem quando age (cada mensagem recebida gasta cota
   do servidor); o "ping" é respondido pela Cloudflare sem gastar.
   ========================================================================== */
(function (P) {
  'use strict';

  /* Endereço do servidor publicado (npm run deploy dentro de servidor/). Se o
     subdomínio workers.dev mudar no painel da Cloudflare, atualizar aqui. */
  const SERVIDOR_PUBLICADO = 'https://outs-mesas.outs-mesas.workers.dev';
  const SERVIDOR_LOCAL = 'http://localhost:8787';   // npm run dev
  const SITE = 'https://wellingtonm01989-beep.github.io/outs-treino-lab/';
  const RE_CODIGO = /^[A-HJKMNP-Z2-9]{6}$/;
  const TAM_NOME = 18;
  const PING_MS = 25000;       // mantém a conexão viva em redes que derrubam conexões paradas
  const SILENCIO_MS = 60000;   // sem nem o "pong" nesse tempo: conexão morta, reconecta
  // fechamentos definitivos (não adianta reconectar): ver servidor/src/mesa.js
  const FINAIS = [1009, 4001, 4008, 4404, 4410];

  const online = () => /^https?:$/.test(location.protocol);
  const local = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function servidor() { return local() ? SERVIDOR_LOCAL : SERVIDOR_PUBLICADO; }
  /** Dá para usar a mesa com amigos daqui? */
  function disponivel() { return online() && !!servidor(); }

  /** Código da mesa no link (#mesa=CODIGO), ou null. */
  function codigoDoLink(hash) {
    const m = /[#&]mesa=([A-Za-z0-9]+)/.exec(hash === undefined ? location.hash : hash);
    const c = m ? m[1].toUpperCase() : null;
    return c && RE_CODIGO.test(c) ? c : null;
  }
  /** O link tem "#mesa=", válido ou não. */
  function temMesaNoLink(hash) { return /[#&]mesa=/.test(hash === undefined ? location.hash : hash); }
  function linkDaMesa(codigo) { return location.origin + location.pathname + '#mesa=' + codigo; }

  /** Nome como o servidor aceita (sem caracteres invisíveis, espaços simples) ou null. */
  function limparNome(bruto) {
    const s = String(bruto || '').normalize('NFC')
      .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
      .replace(/\s+/g, ' ').trim();
    const n = Array.from(s).length;
    return n >= 1 && n <= TAM_NOME ? s : null;
  }

  // ------------------------------------------ identidade (uma por aba)
  const memoria = {};   // usado se o sessionStorage estiver bloqueado
  const chave = codigo => (window.__OUTS_PREFIXO || 'outs.treino.') + 'mesa.' + codigo;
  function lerToken(codigo) {
    try { return window.sessionStorage.getItem(chave(codigo)) || memoria[codigo] || null; } catch (e) { return memoria[codigo] || null; }
  }
  function gravarToken(codigo, token) {
    memoria[codigo] = token;
    try { window.sessionStorage.setItem(chave(codigo), token); } catch (e) { /* fica só na memória */ }
  }
  function apagarToken(codigo) {
    delete memoria[codigo];
    try { window.sessionStorage.removeItem(chave(codigo)); } catch (e) { /* ignora */ }
  }

  // ------------------------------------------------------- servidor
  /** Cria a mesa. cfg: { lugares, fichas, velocidade }. Devolve { codigo, tokenAnfitriao }. */
  async function criarMesa(cfg) {
    let r;
    try {
      r = await fetch(servidor() + '/mesas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    } catch (e) {
      throw new Error('Sem conexão com o servidor das mesas. Confira a internet (redes de empresa às vezes bloqueiam).');
    }
    let corpo = {};
    try { corpo = await r.json(); } catch (e) { /* resposta sem JSON */ }
    if (!r.ok) throw new Error(corpo.erro || 'O servidor recusou o pedido (erro ' + r.status + ').');
    return corpo;
  }

  /**
   * Conecta à mesa e mantém a conexão: se cair, tenta de novo (1 s, 2 s, 4 s… até 15 s)
   * e na hora em que a internet ou a aba voltam.
   * ao: { estado(nome, info), mensagem(msg) }. Estados: conectando, aberta, reconectando, fechada.
   * Devolve { enviar(obj), fechar() }.
   */
  function conectar(codigo, ao) {
    const url = servidor().replace(/^http/, 'ws') + '/mesas/' + codigo + '/ws';
    let ws = null, tentativas = 0, fim = false, timerPing = null, timerVolta = null, ultimoSinal = 0;

    function abrir() {
      clearTimeout(timerVolta);
      timerVolta = null;
      ao.estado(tentativas ? 'reconectando' : 'conectando', { tentativas });
      try { ws = new WebSocket(url); } catch (e) { ws = null; agendarVolta(); return; }
      const este = ws;
      ws.onopen = () => { tentativas = 0; ultimoSinal = Date.now(); vigiar(); ao.estado('aberta'); };
      ws.onmessage = e => {
        ultimoSinal = Date.now();
        if (e.data === 'pong') return;
        let m;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        ao.mensagem(m);
      };
      ws.onclose = e => {
        if (este !== ws || fim) return;   // conexão antiga, já trocada, ou fechada de propósito
        clearInterval(timerPing);
        if (FINAIS.indexOf(e.code) >= 0) { fim = true; soltar(); ao.estado('fechada', { codigo: e.code }); return; }
        agendarVolta();
      };
    }
    function agendarVolta() {
      tentativas++;
      ao.estado('reconectando', { tentativas });
      timerVolta = setTimeout(abrir, Math.min(15000, 1000 * Math.pow(2, tentativas - 1)));
    }
    /** Larga a conexão atual sem esperar o fechamento (que numa rede morta demora). */
    function descartar() {
      clearInterval(timerPing);
      if (ws) { ws.onclose = ws.onmessage = ws.onopen = null; try { ws.close(); } catch (e) { /* já fechada */ } ws = null; }
    }
    function vigiar() {
      clearInterval(timerPing);
      timerPing = setInterval(() => {
        if (!ws || ws.readyState !== 1) return;
        if (Date.now() - ultimoSinal > SILENCIO_MS) { descartar(); agendarVolta(); return; }
        ws.send('ping');
      }, PING_MS);
    }
    // a internet voltou ou a aba voltou para a frente: não espera o próximo intervalo.
    // Com a conexão "aberta", testa com um ping (não gasta cota) antes de reconectar:
    // em segundo plano o navegador atrasa os pings, e a conexão pode estar boa.
    function voltarJa() {
      if (fim || document.hidden) return;
      if (timerVolta) { abrir(); return; }
      if (!ws || ws.readyState !== 1) return;
      const enviadoEm = Date.now();
      ws.send('ping');
      setTimeout(() => {
        if (!fim && ws && ws.readyState === 1 && ultimoSinal < enviadoEm) { descartar(); agendarVolta(); }
      }, 5000);
    }
    function soltar() {
      window.removeEventListener('online', voltarJa);
      document.removeEventListener('visibilitychange', voltarJa);
    }
    window.addEventListener('online', voltarJa);
    document.addEventListener('visibilitychange', voltarJa);

    abrir();
    return {
      enviar(obj) {
        if (!ws || ws.readyState !== 1) return false;
        ws.send(JSON.stringify(obj));
        return true;
      },
      fechar() {
        fim = true;
        clearTimeout(timerVolta);
        soltar();
        if (ws && ws.readyState === 1) { clearInterval(timerPing); const v = ws; ws = null; v.close(1000); } else descartar();
      }
    };
  }

  P.Rede = {
    SITE, RE_CODIGO, TAM_NOME,
    online, local, servidor, disponivel,
    codigoDoLink, temMesaNoLink, linkDaMesa, limparNome,
    lerToken, gravarToken, apagarToken,
    criarMesa, conectar
  };
})(window.Poker = window.Poker || {});
