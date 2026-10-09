/* ==========================================================================
   OUTS · Treino Lab — armazenamento.js
   localStorage SEMPRE dentro de try/catch: se o navegador bloquear o
   armazenamento (modo privado, file:// restrito, cota cheia), o app segue
   funcionando só com a memória da sessão.
   ========================================================================== */
(function (P) {
  'use strict';

  // testes.html define window.__OUTS_PREFIXO para não misturar dados de teste com os seus
  var PREFIXO = window.__OUTS_PREFIXO || 'outs.treino.';
  var memoria = {};          // espelho em memória (usado quando o storage falha)
  var disponivel = (function () {
    try {
      var k = PREFIXO + '__teste';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function ler(chave, padrao) {
    if (Object.prototype.hasOwnProperty.call(memoria, chave)) return clonar(memoria[chave]);
    try {
      var bruto = window.localStorage.getItem(PREFIXO + chave);
      if (bruto !== null) {
        var v = JSON.parse(bruto);
        memoria[chave] = v;
        return clonar(v);
      }
    } catch (e) { /* storage indisponível ou dado corrompido: usa o padrão */ }
    return clonar(padrao);
  }

  function gravar(chave, valor) {
    memoria[chave] = clonar(valor);
    try {
      window.localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remover(chave) {
    delete memoria[chave];
    try { window.localStorage.removeItem(PREFIXO + chave); } catch (e) { /* ignora */ }
  }

  /** Grava um JSON já pronto (para dados grandes: evita copiar o objeto várias vezes). */
  function gravarTexto(chave, texto) {
    delete memoria[chave];
    try {
      window.localStorage.setItem(PREFIXO + chave, texto);
      return true;
    } catch (e) {
      memoria[chave] = JSON.parse(texto);
      return false;
    }
  }

  function clonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  P.Armazenamento = { ler: ler, gravar: gravar, gravarTexto: gravarTexto, remover: remover, disponivel: function () { return disponivel; } };

  // ---------------------------------------------------------- configurações
  var PADRAO_CONFIG = {
    nome: 'Você',
    tema: 'verde',              // verde | azul | vermelho | preto
    quatroCores: false,
    velocidade: 'normal',       // lenta | normal | rapida | turbo
    som: true,
    mostrarPerdedoras: false,
    modoCoach: 'sempre',        // sempre | pedido | quiz
    coachAberto: true,
    unidade: 'dinheiro',        // dinheiro | bb
    ultimoLobby: null
  };

  var config = (function () {
    var c = ler('config', {});
    var out = {};
    for (var k in PADRAO_CONFIG) out[k] = c && c[k] !== undefined ? c[k] : PADRAO_CONFIG[k];
    return out;
  })();
  var ouvintes = [];

  P.Config = {
    get: function (k) { return config[k]; },
    todas: function () { return clonar(config); },
    set: function (k, v) {
      config[k] = v;
      gravar('config', config);
      ouvintes.forEach(function (f) { try { f(k, v); } catch (e) { /* ouvinte com erro não derruba o app */ } });
    },
    aoMudar: function (f) { ouvintes.push(f); }
  };

  // ------------------------------------------------------- banca fictícia
  var BANCA_INICIAL = 2500000;   // $25.000,00 em centavos
  P.Banca = {
    INICIAL: BANCA_INICIAL,
    saldo: function () { return ler('banca', BANCA_INICIAL); },
    ajustar: function (delta) {
      var s = Math.max(0, Math.round(P.Banca.saldo() + delta));
      gravar('banca', s);
      return s;
    },
    reiniciar: function () { gravar('banca', BANCA_INICIAL); return BANCA_INICIAL; }
  };
})(window.Poker = window.Poker || {});
