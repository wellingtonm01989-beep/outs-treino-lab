/* ==========================================================================
   OUTS · Treino Lab — testes/executor.js
   Mini executor de testes que roda no próprio navegador (sem Node).
   Cada teste recebe "afirmar" e pode devolver:
     - nada              -> passou
     - uma string        -> passou, com detalhe exibido ao lado
     - uma Promise       -> aguarda; o valor resolvido vira o detalhe
   Qualquer exceção (ou Promise rejeitada) reprova o teste.
   ========================================================================== */
(function (P) {
  'use strict';

  var testes = [];

  function FalhaAfirmacao(msg) { this.name = 'FalhaAfirmacao'; this.message = msg; }
  FalhaAfirmacao.prototype = Object.create(Error.prototype);

  function fmt(v) {
    try { return typeof v === 'string' ? '"' + v + '"' : JSON.stringify(v); } catch (e) { return String(v); }
  }

  var afirmar = {
    verdadeiro: function (cond, msg) { if (!cond) throw new FalhaAfirmacao(msg || 'esperava verdadeiro'); },
    igual: function (obtido, esperado, msg) {
      if (obtido !== esperado) throw new FalhaAfirmacao((msg ? msg + ': ' : '') + 'obtido ' + fmt(obtido) + ', esperado ' + fmt(esperado));
    },
    igualJSON: function (obtido, esperado, msg) {
      var a = JSON.stringify(obtido), b = JSON.stringify(esperado);
      if (a !== b) throw new FalhaAfirmacao((msg ? msg + ': ' : '') + 'obtido ' + a + ', esperado ' + b);
    },
    proximo: function (obtido, esperado, tolerancia, msg) {
      if (!(Math.abs(obtido - esperado) <= tolerancia)) {
        throw new FalhaAfirmacao((msg ? msg + ': ' : '') + 'obtido ' + obtido + ', esperado ' + esperado + ' ± ' + tolerancia);
      }
    },
    maior: function (a, b, msg) { if (!(a > b)) throw new FalhaAfirmacao((msg ? msg + ': ' : '') + fmt(a) + ' deveria ser maior que ' + fmt(b)); },
    lanca: function (fn, msg) {
      var lancou = false;
      try { fn(); } catch (e) { lancou = true; }
      if (!lancou) throw new FalhaAfirmacao(msg || 'esperava uma exceção');
    }
  };

  function teste(grupo, nome, fn) { testes.push({ grupo: grupo, nome: nome, fn: fn }); }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  /**
   * Roda todos os testes em sequência, cedendo a tela entre eles.
   * @param {HTMLElement} alvo onde desenhar a lista
   * @param {function} aoProgresso (feitos, total, passou, falhou)
   * @returns {Promise<{total, passou, falhou}>}
   */
  function rodar(alvo, aoProgresso) {
    alvo.innerHTML = '';
    var grupos = {};
    var linhas = testes.map(function (t) {
      if (!grupos[t.grupo]) {
        var g = el('section', 'grupo');
        var cab = el('div', 'grupo-cab');
        cab.appendChild(el('h3', '', t.grupo));
        var cont = el('span', 'grupo-cont num', '');
        cab.appendChild(cont);
        g.appendChild(cab);
        var ul = el('ul', 'grupo-lista');
        g.appendChild(ul);
        alvo.appendChild(g);
        grupos[t.grupo] = { ul: ul, cont: cont, passou: 0, total: 0 };
      }
      var gr = grupos[t.grupo];
      gr.total++;
      var li = el('li', 'teste pendente');
      li.appendChild(el('span', 'teste-icone', '•'));
      var corpo = el('div', 'teste-corpo');
      corpo.appendChild(el('div', 'teste-nome', t.nome));
      var det = el('div', 'teste-detalhe', '');
      corpo.appendChild(det);
      li.appendChild(corpo);
      var tempo = el('span', 'teste-tempo num', '');
      li.appendChild(tempo);
      gr.ul.appendChild(li);
      return { li: li, det: det, tempo: tempo, grupo: gr };
    });

    var passou = 0, falhou = 0;

    return new Promise(function (resolver) {
      var i = 0;
      function proximo() {
        if (i >= testes.length) {
          resolver({ total: testes.length, passou: passou, falhou: falhou });
          return;
        }
        var t = testes[i], linha = linhas[i];
        linha.li.className = 'teste rodando';
        var t0 = performance.now();

        function concluir(ok, detalhe) {
          var ms = performance.now() - t0;
          linha.li.className = 'teste ' + (ok ? 'ok' : 'falha');
          linha.li.firstChild.textContent = ok ? '✓' : '✗';
          linha.det.textContent = detalhe || '';
          linha.tempo.textContent = ms < 1 ? '<1 ms' : Math.round(ms) + ' ms';
          if (ok) { passou++; linha.grupo.passou++; } else falhou++;
          linha.grupo.cont.textContent = linha.grupo.passou + '/' + linha.grupo.total;
          linha.grupo.cont.className = 'grupo-cont num ' + (linha.grupo.passou === linha.grupo.total ? 'ok' : '');
          i++;
          if (aoProgresso) aoProgresso(i, testes.length, passou, falhou);
          setTimeout(proximo, 0);
        }

        try {
          var r = t.fn(afirmar);
          if (r && typeof r.then === 'function') {
            r.then(function (v) { concluir(true, v); }, function (e) { concluir(false, mensagem(e)); });
          } else {
            concluir(true, r);
          }
        } catch (e) {
          concluir(false, mensagem(e));
        }
      }
      setTimeout(proximo, 0);
    });
  }

  function mensagem(e) {
    if (!e) return 'falhou';
    return (e.name === 'FalhaAfirmacao' ? '' : (e.name || 'Erro') + ': ') + (e.message || String(e));
  }

  P.Testes = { teste: teste, rodar: rodar, afirmar: afirmar, lista: testes };
})(window.Poker = window.Poker || {});
