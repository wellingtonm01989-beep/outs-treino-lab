/* ==========================================================================
   OUTS · Treino Lab — testes/pagina.js
   Controla testes.html: roda os testes automáticos e, em seguida, a
   auditoria do embaralhamento (1.000.000 de baralhos).
   Parâmetros de URL opcionais:
     ?n=200000      muda a quantidade de embaralhamentos da auditoria
     ?auditoria=0   não roda a auditoria automaticamente
   ========================================================================== */
(function (P) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function pct(x, casas) { return (x * 100).toFixed(casas).replace('.', ',') + '%'; }
  function milhar(n) { return Math.round(n).toLocaleString('pt-BR'); }
  function dec(x, casas) { return x.toFixed(casas).replace('.', ','); }

  function parametro(nome) {
    var m = new RegExp('[?&]' + nome + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function mostrarErrosGlobais() {
    var erros = window.__errosGlobais || [];
    if (!erros.length) return false;
    var caixa = $('erros');
    caixa.classList.remove('oculto');
    caixa.innerHTML = '<strong>Erros de JavaScript na página:</strong>';
    erros.forEach(function (e) {
      var d = document.createElement('div');
      d.className = 'mono';
      d.textContent = e;
      caixa.appendChild(d);
    });
    return true;
  }

  // ------------------------------------------------------------- testes
  function rodarTestes() {
    var selo = $('selo-testes');
    selo.className = 'selo info';
    selo.textContent = 'Rodando…';
    document.body.setAttribute('data-testes', 'rodando');
    return P.Testes.rodar($('lista-testes'), function (feitos, total, passou, falhou) {
      $('barra-testes').style.width = (feitos / total * 100) + '%';
      selo.textContent = feitos + ' / ' + total + (falhou ? ' · ' + falhou + ' falha(s)' : '');
    }).then(function (r) {
      var erroGlobal = mostrarErrosGlobais();
      var ok = r.falhou === 0 && !erroGlobal;
      selo.className = 'selo ' + (ok ? 'ok' : 'erro');
      selo.textContent = ok ? 'Todos os ' + r.total + ' testes passaram' : r.falhou + ' de ' + r.total + ' testes falharam';
      document.body.setAttribute('data-testes', ok ? 'ok' : 'falha');
      document.body.setAttribute('data-placar', r.passou + '/' + r.total);
      atualizarTitulo();
      return r;
    });
  }

  // ---------------------------------------------------------- auditoria
  var controle = null;

  function rodarAuditoria() {
    if (controle) controle.cancelar();
    var n = parseInt(parametro('n'), 10) || 1000000;
    var selo = $('selo-aud');
    selo.className = 'selo info';
    selo.textContent = 'Embaralhando…';
    $('btn-aud').disabled = true;
    $('aud-resultados').classList.add('oculto');
    document.body.setAttribute('data-auditoria', 'rodando');
    var t0 = performance.now();
    controle = P.Auditoria.rodar({
      embaralhamentos: n,
      aoProgresso: function (f) {
        $('barra-aud').style.width = (f * 100) + '%';
        $('aud-status').textContent = milhar(f * n) + ' de ' + milhar(n) + ' baralhos · ' + dec((performance.now() - t0) / 1000, 1) + ' s';
      },
      aoTerminar: function (res) {
        controle = null;
        $('btn-aud').disabled = false;
        mostrarAuditoria(res);
      }
    });
  }

  function linha(tbody, celulas) {
    var tr = document.createElement('tr');
    celulas.forEach(function (c) {
      var td = document.createElement('td');
      if (c && typeof c === 'object') { td.textContent = c.t; if (c.cls) td.className = c.cls; }
      else td.textContent = c;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  function mostrarAuditoria(res) {
    var C = P.Cartas;
    $('aud-status').textContent = milhar(res.embaralhamentos) + ' baralhos em ' + dec(res.ms / 1000, 1) + ' s (' +
      milhar(res.porSegundo) + ' por segundo)';

    var extremos = 0;
    for (var i = 0; i < res.z.length; i++) if (Math.abs(res.z[i]) > 3) extremos++;

    var tb = $('aud-metricas');
    tb.innerHTML = '';
    linha(tb, ['Qui-quadrado carta × posição', { t: dec(res.x2, 1) + ' (gl ' + milhar(res.gl) + ')', cls: 'dir num' }]);
    linha(tb, ['p-valor', { t: dec(res.p, 4), cls: 'dir num ' + (res.p > res.criterios.limiteP ? 'txt-ok' : 'txt-erro') }]);
    linha(tb, ['Esperado por célula', { t: milhar(res.embaralhamentos / 52), cls: 'dir num' }]);
    linha(tb, ['Maior desvio (z)', { t: dec(res.maxZ, 2) + ' — ' + C.bonito(res.celulaMax.carta) + ' na posição ' + (res.celulaMax.posicao + 1), cls: 'dir num' }]);
    linha(tb, ['Células com |z| > 3', { t: extremos + ' (esperado ≈ ' + Math.round(res.z.length * 0.0027) + ')', cls: 'dir num' }]);

    var tf = $('aud-freq');
    tf.innerHTML = '';
    res.frequencias.forEach(function (f) {
      linha(tf, [
        f.nome,
        { t: pct(f.observada, 3), cls: 'dir num' },
        { t: pct(f.teorica, 3), cls: 'dir num' },
        { t: (f.z >= 0 ? '+' : '') + dec(f.z, 2), cls: 'dir num' },
        { t: f.aprovado ? 'OK' : 'Fora', cls: 'dir ' + (f.aprovado ? 'txt-ok' : 'txt-erro') }
      ]);
    });

    desenharMapa(res.z);
    $('aud-resultados').classList.remove('oculto');

    var selo = $('selo-aud');
    selo.className = 'selo ' + (res.aprovado ? 'ok' : 'erro');
    selo.textContent = res.aprovado ? 'Sem viés detectado' : 'Desvio estatístico detectado';
    document.body.setAttribute('data-auditoria', res.aprovado ? 'ok' : 'falha');
    document.body.setAttribute('data-auditoria-p', res.p.toFixed(4));
    atualizarTitulo();
  }

  /** Mapa de calor 52 × 52 dos desvios (z): azul = abaixo do esperado, vermelho = acima. */
  function desenharMapa(z) {
    var cv = $('aud-canvas');
    var ctx = cv.getContext('2d');
    var lado = 6;
    var base = [27, 36, 48], quente = [239, 83, 80], frio = [76, 154, 255];
    for (var carta = 0; carta < 52; carta++) {
      for (var pos = 0; pos < 52; pos++) {
        var v = z[carta * 52 + pos];
        var t = Math.min(Math.abs(v) / 4, 1);
        var alvo = v >= 0 ? quente : frio;
        var r = Math.round(base[0] + (alvo[0] - base[0]) * t);
        var g = Math.round(base[1] + (alvo[1] - base[1]) * t);
        var b = Math.round(base[2] + (alvo[2] - base[2]) * t);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(pos * lado, carta * lado, lado, lado);
      }
    }
  }

  function atualizarTitulo() {
    var t = document.body.getAttribute('data-testes');
    var a = document.body.getAttribute('data-auditoria');
    var simbolo = (t === 'falha' || a === 'falha') ? '✗' : (t === 'ok' && a === 'ok') ? '✓' : '…';
    document.title = simbolo + ' Testes · OUTS Treino Lab';
  }

  // ------------------------------------------------------ mão de exemplo
  var NOMES_EXEMPLO = ['Você', 'Lúcia', 'Bruno', 'Tiago', 'Marina', 'Rafa'];

  function jogarExemplo() {
    var forcarAllin = $('exemplo-allin').checked;
    var R = P.RNG;
    var jogadores = NOMES_EXEMPLO.map(function (nome, s) {
      // com all-ins forçados, stacks bem diferentes para gerar side pots
      var fichas = forcarAllin ? R.inteiroEntre(4, 60) * 50 : 2000;
      return { assento: s, nome: nome, fichas: fichas, mostraPerdedoras: s === 0 };
    });
    var m = P.Motor.novaMao({ jogadores: jogadores, botao: R.inteiroAbaixo(6), sb: 10, bb: 20, lugares: 6 });
    var guarda = 0;
    while (!m.terminada() && guarda++ < 300) {
      var v = m.acoesValidas(), acao;
      var x = R.real();
      if (forcarAllin && v.podeApostar && x < 0.35) acao = 'allin';
      else if (x < 0.18 && !v.podeCheck) acao = 'fold';
      else if (v.podeApostar && x > 0.82) acao = { tipo: v.tipoAposta, ate: Math.min(v.maxAte, Math.max(v.minAte, Math.round(v.pote * 0.66) + v.apostaAtual)) };
      else acao = v.podeCheck ? 'check' : 'call';
      m.agir(v.assento, acao);
    }
    $('exemplo-texto').textContent = P.Historico.texto(m.historicoCompleto(), {
      titulo: 'Exemplo',
      formatar: function (v) { return v.toLocaleString('pt-BR'); }
    });
  }

  $('btn-exemplo').addEventListener('click', jogarExemplo);
  try { jogarExemplo(); } catch (e) { (window.__errosGlobais = window.__errosGlobais || []).push('Mão de exemplo: ' + e.message); }

  $('btn-aud').addEventListener('click', rodarAuditoria);
  $('btn-testes').addEventListener('click', function () { rodarTestes(); });

  rodarTestes().then(function () {
    if (parametro('auditoria') !== '0') rodarAuditoria();
  });
})(window.Poker = window.Poker || {});
