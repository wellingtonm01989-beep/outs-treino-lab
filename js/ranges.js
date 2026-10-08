/* ==========================================================================
   OUTS · Treino Lab — ranges.js
   Classes de mãos iniciais (169), grade 13x13, combos e parser de ranges
   na notação usual: "QQ+, AKs, ATs+, A5s-A2s, KQo, 77-TT, AJo:0.5".

   Grade 13x13 (linha/coluna 0 = Ás ... 12 = Dois):
     diagonal            -> pares (AA, KK, ...)
     acima da diagonal   -> naipadas (AKs)
     abaixo da diagonal  -> offsuit (AKo)
   As tabelas de abertura por posição entram na Fase 3/4.
   ========================================================================== */
(function (P) {
  'use strict';

  var R = '23456789TJQKA';

  /** Nome da classe a partir de dois ranks (0..12) e se é naipada. */
  function nomeClasse(r1, r2, naipada) {
    if (r1 === r2) return R.charAt(r1) + R.charAt(r2);
    if (r1 < r2) { var t = r1; r1 = r2; r2 = t; }
    return R.charAt(r1) + R.charAt(r2) + (naipada ? 's' : 'o');
  }

  /** Classe de uma mão concreta: (As, Ks) -> "AKs". */
  function classeDaMao(c1, c2) {
    return nomeClasse(c1 >> 2, c2 >> 2, (c1 & 3) === (c2 & 3));
  }

  /** Nome da classe na célula (linha, coluna) da grade. */
  function classeDaCelula(lin, col) {
    var r1 = 12 - lin, r2 = 12 - col;
    if (lin === col) return nomeClasse(r1, r1, false);
    return nomeClasse(r1, r2, lin < col);
  }

  /** Célula da grade de uma classe: "AKs" -> {lin:0, col:1}. */
  function celulaDaClasse(nome) {
    var a = analisar(nome);
    var linA = 12 - a.r1, linB = 12 - a.r2;
    if (a.par) return { lin: linA, col: linA };
    return a.tipo === 's' ? { lin: linA, col: linB } : { lin: linB, col: linA };
  }

  /** Lista das 169 classes na ordem da grade (linha a linha). */
  function todasClasses() {
    var out = [];
    for (var lin = 0; lin < 13; lin++)
      for (var col = 0; col < 13; col++) out.push(classeDaCelula(lin, col));
    return out;
  }

  /** Combos concretos de uma classe: pares 6, naipadas 4, offsuit 12. */
  function combosDaClasse(nome) {
    var a = analisar(nome);
    var out = [], s1, s2;
    if (a.par) {
      for (s1 = 0; s1 < 4; s1++) for (s2 = s1 + 1; s2 < 4; s2++) out.push([a.r1 * 4 + s1, a.r1 * 4 + s2]);
    } else if (a.tipo === 's') {
      for (s1 = 0; s1 < 4; s1++) out.push([a.r1 * 4 + s1, a.r2 * 4 + s1]);
    } else {
      for (s1 = 0; s1 < 4; s1++) for (s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([a.r1 * 4 + s1, a.r2 * 4 + s2]);
    }
    return out;
  }

  function combosPorClasse(nome) {
    var a = analisar(nome);
    return a.par ? 6 : (a.tipo === 's' ? 4 : 12);
  }

  /**
   * Interpreta um token simples: "AK", "AKs", "AKo", "TT".
   * Retorna { r1 (alto), r2 (baixo), par, tipo: 's' | 'o' | null }.
   */
  function analisar(tok) {
    var t = String(tok).trim().replace(/10/g, 'T');
    var c1 = R.indexOf(t.charAt(0).toUpperCase());
    var c2 = R.indexOf(t.charAt(1).toUpperCase());
    var suf = t.charAt(2).toLowerCase();
    if (t.length < 2 || c1 < 0 || c2 < 0 || t.length > 3 || (t.length === 3 && suf !== 's' && suf !== 'o')) {
      throw new Error('Mão inválida no range: "' + tok + '"');
    }
    var r1 = Math.max(c1, c2), r2 = Math.min(c1, c2);
    if (r1 === r2) {
      if (t.length === 3) throw new Error('Par não pode ser naipado/offsuit: "' + tok + '"');
      return { r1: r1, r2: r2, par: true, tipo: null };
    }
    return { r1: r1, r2: r2, par: false, tipo: t.length === 3 ? suf : null };
  }

  function nomesDe(r1, r2, tipo) {
    if (r1 === r2) return [nomeClasse(r1, r1)];
    if (tipo === 's') return [nomeClasse(r1, r2, true)];
    if (tipo === 'o') return [nomeClasse(r1, r2, false)];
    return [nomeClasse(r1, r2, true), nomeClasse(r1, r2, false)];
  }

  /** Expande um token ("ATs+", "77-TT", "A5s-A2s", "KQ") em nomes de classe. */
  function expandir(tok) {
    var out = [], r, a, b;
    if (tok.indexOf('-') > 0) {
      var partes = tok.split('-');
      a = analisar(partes[0]); b = analisar(partes[1]);
      if (a.par && b.par) {
        for (r = Math.min(a.r1, b.r1); r <= Math.max(a.r1, b.r1); r++) out = out.concat(nomesDe(r, r));
        return out;
      }
      if (a.par || b.par || a.r1 !== b.r1 || a.tipo !== b.tipo) {
        throw new Error('Intervalo inválido: "' + tok + '" (use a mesma carta alta, ex.: A5s-A2s)');
      }
      for (r = Math.min(a.r2, b.r2); r <= Math.max(a.r2, b.r2); r++) out = out.concat(nomesDe(a.r1, r, a.tipo));
      return out;
    }
    var mais = tok.charAt(tok.length - 1) === '+';
    a = analisar(mais ? tok.slice(0, -1) : tok);
    if (a.par) {
      if (!mais) return nomesDe(a.r1, a.r1);
      for (r = a.r1; r <= 12; r++) out = out.concat(nomesDe(r, r));
      return out;
    }
    if (!mais) return nomesDe(a.r1, a.r2, a.tipo);
    // "ATs+" = ATs, AJs, AQs, AKs (sobe o kicker até abaixo da carta alta)
    for (r = a.r2; r < a.r1; r++) out = out.concat(nomesDe(a.r1, r, a.tipo));
    return out;
  }

  /**
   * Range em texto -> mapa { classe: peso (0..1) }.
   * Aceita "todas" / "100%" / "aleatória" para as 169 classes.
   * Peso opcional por token: "AJo:0.5" (metade dos combos).
   */
  function parse(texto) {
    var mapa = {};
    var t = String(texto || '').trim();
    if (!t) return mapa;
    if (/^(todas|100%|random|aleat[oó]ria)$/i.test(t)) {
      todasClasses().forEach(function (n) { mapa[n] = 1; });
      return mapa;
    }
    t.split(/[\s,;]+/).forEach(function (tok) {
      if (!tok) return;
      var peso = 1;
      var p = tok.indexOf(':');
      if (p > 0) {
        peso = parseFloat(tok.slice(p + 1).replace(',', '.'));
        tok = tok.slice(0, p);
        if (!(peso >= 0 && peso <= 1)) throw new Error('Peso inválido em "' + tok + '"');
      }
      expandir(tok).forEach(function (n) { mapa[n] = peso; });
    });
    return mapa;
  }

  /** Combos ponderados do range (mapa), descartando cartas marcadas (Uint8Array(52)). */
  function paraCombos(mapa, marcadas) {
    var a = [], b = [], w = [];
    Object.keys(mapa).forEach(function (nome) {
      var peso = mapa[nome];
      if (!(peso > 0)) return;
      combosDaClasse(nome).forEach(function (cb) {
        if (marcadas && (marcadas[cb[0]] || marcadas[cb[1]])) return;
        a.push(cb[0]); b.push(cb[1]); w.push(peso);
      });
    });
    return { a: a, b: b, w: w, n: a.length };
  }

  /** Quantidade (ponderada) de combos do range. */
  function contarCombos(mapa) {
    var total = 0;
    Object.keys(mapa).forEach(function (nome) { total += (mapa[nome] || 0) * combosPorClasse(nome); });
    return total;
  }

  /** Percentual das 1.326 mãos iniciais coberto pelo range. */
  function percentual(mapa) {
    return contarCombos(mapa) / 1326 * 100;
  }

  P.Ranges = {
    nomeClasse: nomeClasse,
    classeDaMao: classeDaMao,
    classeDaCelula: classeDaCelula,
    celulaDaClasse: celulaDaClasse,
    todasClasses: todasClasses,
    combosDaClasse: combosDaClasse,
    combosPorClasse: combosPorClasse,
    analisar: analisar,
    expandir: expandir,
    parse: parse,
    paraCombos: paraCombos,
    contarCombos: contarCombos,
    percentual: percentual
  };
})(window.Poker = window.Poker || {});

/* ==========================================================================
   Tabelas de pré-flop (usadas pelo coach e pelos bots)
   ========================================================================== */
(function (P) {
  'use strict';

  var R = P.Ranges;
  var CLASSES = R.todasClasses();

  /*
   * Equity pré-flop (por mil) de cada classe, na ordem da grade 13x13:
   * EQ1 = contra 1 mão aleatória (80.000 simulações por classe)
   * EQ3 = contra 3 mãos aleatórias (40.000 simulações por classe)
   * Calculadas com o próprio motor de equity deste app.
   */
  var EQ1 = [853,672,661,656,650,629,620,610,599,599,592,581,573,653,824,637,625,618,601,582,575,567,560,548,541,533,646,616,799,603,592,573,561,542,534,528,518,511,506,636,608,582,776,577,556,541,526,506,499,491,485,474,628,598,572,552,748,541,521,506,490,471,465,456,452,607,574,556,533,514,721,508,493,472,457,441,432,425,596,564,537,517,498,481,691,480,464,444,429,408,406,589,552,516,495,481,463,450,663,449,436,419,400,384,579,544,511,482,462,443,432,422,635,433,415,397,377,576,534,501,470,444,425,417,405,399,604,416,396,377,571,521,495,464,434,406,393,387,380,383,570,387,366,561,513,482,451,427,401,375,369,362,363,350,538,359,547,506,473,444,415,390,366,347,343,340,332,320,502];
  var EQ3 = [637,415,399,381,374,348,335,326,315,321,309,301,295,386,582,379,375,360,328,307,297,291,288,279,270,263,366,354,536,355,350,320,299,277,270,261,254,251,241,350,335,328,491,340,314,290,272,253,245,240,234,225,338,323,314,306,451,312,287,270,250,234,229,222,213,306,291,282,280,276,414,286,271,246,233,210,206,202,296,272,261,255,257,253,371,265,252,235,217,200,191,290,264,240,231,229,229,233,345,253,232,215,201,182,277,254,229,212,213,212,212,214,315,239,223,200,186,281,242,225,203,195,192,191,199,198,291,232,209,195,271,233,214,197,190,172,172,176,183,189,263,207,187,263,225,210,194,178,165,157,162,164,174,162,239,182,249,215,202,186,175,158,148,141,148,152,146,139,219];

  var eqPorClasse = {};
  CLASSES.forEach(function (c, i) { eqPorClasse[c] = { vs1: EQ1[i] / 1000, vs3: EQ3[i] / 1000 }; });

  // Ranking de força: mistura equity heads-up e multiway (multiway valoriza
  // pares e naipadas, que jogam melhor contra vários oponentes).
  var ORDEM = CLASSES.slice().sort(function (a, b) {
    var ea = eqPorClasse[a], eb = eqPorClasse[b];
    return (eb.vs1 + 2 * eb.vs3) - (ea.vs1 + 2 * ea.vs3);
  });
  // percentil: % de combos que são tão fortes ou mais (AA ≈ 0,5%)
  var percentil = {};
  (function () {
    var acum = 0;
    ORDEM.forEach(function (c) { acum += R.combosPorClasse(c); percentil[c] = acum / 1326 * 100; });
  })();

  /** Range com as X% mais fortes (o limite pode entrar com peso parcial). */
  function topPercent(pct) {
    var mapa = {}, alvo = Math.max(0, Math.min(100, pct)) / 100 * 1326, acum = 0;
    for (var i = 0; i < ORDEM.length && acum < alvo - 1e-9; i++) {
      var c = ORDEM[i], n = R.combosPorClasse(c);
      var peso = Math.min(1, (alvo - acum) / n);
      mapa[c] = peso >= 0.75 ? 1 : Math.round(peso * 4) / 4 || 0.25;
      acum += n * mapa[c];
    }
    return mapa;
  }

  /**
   * Alarga (fator > 1) ou aperta (fator < 1) um range mantendo as mãos mais
   * fortes primeiro. Usado para os perfis dos bots e para ajustes do coach.
   */
  function ajustarRange(mapa, fator) {
    var atual = R.contarCombos(mapa);
    var alvo = Math.max(0, Math.min(1326, atual * fator));
    var novo = {}, acum = 0, c, i, n;
    if (fator <= 1) {
      for (i = 0; i < ORDEM.length; i++) {
        c = ORDEM[i];
        if (!(mapa[c] > 0)) continue;
        n = R.combosPorClasse(c) * mapa[c];
        if (acum >= alvo) break;
        novo[c] = acum + n <= alvo ? mapa[c] : Math.max(0.25, Math.round((alvo - acum) / R.combosPorClasse(c) * 4) / 4);
        acum += R.combosPorClasse(c) * novo[c];
      }
      return novo;
    }
    for (c in mapa) if (mapa[c] > 0) novo[c] = mapa[c];
    acum = atual;
    for (i = 0; i < ORDEM.length && acum < alvo; i++) {
      c = ORDEM[i];
      var falta = 1 - (novo[c] || 0);
      if (falta <= 0) continue;
      novo[c] = 1;
      acum += falta * R.combosPorClasse(c);
    }
    return novo;
  }

  function uniao() {
    var out = {};
    for (var k = 0; k < arguments.length; k++) {
      var m = arguments[k];
      for (var c in m) if (m[c] > (out[c] || 0)) out[c] = m[c];
    }
    return out;
  }

  /** Remove do range A as classes presentes em B (para "call = faixa que não é 3-bet"). */
  function menos(a, b) {
    var out = {};
    for (var c in a) {
      var w = a[c] - (b[c] || 0);
      if (w > 0) out[c] = w;
    }
    return out;
  }

  /** Categoria didática de uma classe. */
  function categoria(classe) {
    var a = R.analisar(classe);
    var alto = a.r1, baixo = a.r2, gap = alto - baixo;
    if (a.par) return alto >= 10 ? 'Par premium' : alto >= 6 ? 'Par médio' : 'Par baixo';
    if (a.tipo === 's') {
      if (alto === 12 && baixo >= 9) return 'Broadway naipada (Ás)';
      if (alto === 12) return 'Ás naipado';
      if (baixo >= 8) return 'Broadway naipada';
      if (gap === 1) return 'Conectores naipados';
      if (gap <= 3) return 'Naipada com gap';
      return 'Naipada fraca';
    }
    if (alto === 12 && baixo >= 9) return 'Broadway offsuit (Ás)';
    if (baixo >= 8) return 'Broadway offsuit';
    if (alto === 12) return 'Ás offsuit fraco';
    if (gap === 1 && baixo >= 4) return 'Conectores offsuit';
    return 'Mão fraca (offsuit)';
  }

  // ----------------------------------------------------------------------
  // Ranges de abertura (raise first in) pelo número de jogadores que ainda
  // falam depois de você (blinds incluídos). 8 = UTG de mesa cheia,
  // 2 = botão, 1 = small blind contra o big blind.
  // ----------------------------------------------------------------------
  var TXT_ABERTURA = {
    8: '66+, A9s+, A5s-A4s, KTs+, QTs+, JTs, T9s, AJo+, KQo',
    7: '55+, A8s+, A5s-A3s, KTs+, QTs+, JTs, T9s, 98s, ATo+, KJo+',
    6: '44+, A7s+, A5s-A2s, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo',
    5: '33+, A2s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, A9o+, KTo+, QJo',
    4: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, A9o+, KTo+, QTo+, JTo',
    3: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, A5o, KTo+, QTo+, JTo',
    2: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
    1: '22+, A2s+, K3s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A4o+, K9o+, Q9o+, J9o+, T9o',
    hu: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q7o+, J8o+, T8o+, 98o, 87o'
  };

  // Respostas a um raise: grupo do agressor (cedo/meio/tarde) x onde você está
  // (ip = fora dos blinds, depois do agressor; sb; bb).
  var TXT_RESPOSTA = {
    cedo: {
      ip: { tresBet: 'QQ+, AKs, AKo, A5s:0.5', call: 'JJ-22, AQs-ATs, KQs, KJs, QJs, JTs, T9s, 98s, AQo' },
      sb: { tresBet: 'QQ+, AKs, AKo, A5s:0.5', call: 'JJ-77, AQs, AJs, KQs' },
      bb: { tresBet: 'QQ+, AKs, AKo, A5s:0.5', call: 'JJ-22, AQs-A2s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AJo+, KQo' }
    },
    meio: {
      ip: { tresBet: 'JJ+, AQs+, AKo, A5s-A4s, KQs:0.5', call: 'TT-22, AJs-A9s, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, 76s, AQo, AJo, KQo' },
      sb: { tresBet: 'JJ+, AQs+, AKo, A5s-A4s, KQs:0.5', call: 'TT-66, AJs, ATs, KQs:0.5, KJs, QJs, JTs, AQo' },
      bb: { tresBet: 'JJ+, AQs+, AKo, A5s-A4s, KQs:0.5', call: 'TT-22, AJs-A2s, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, ATo+, KJo+, QJo' }
    },
    tarde: {
      ip: { tresBet: 'TT+, AJs+, KQs, AQo+, A5s-A4s, 76s:0.5', call: '99-22, ATs-A6s, KTs+, QTs+, JTs, T9s, 98s, 87s, AJo, KQo' },
      sb: { tresBet: 'TT+, ATs+, KJs+, QJs, AJo+, KQo, A5s-A2s, 76s, 65s', call: '99-55:0.5, A9s:0.5, KTs:0.5, QTs:0.5, JTs:0.5' },
      bb: { tresBet: 'TT+, ATs+, KJs+, QJs:0.5, AJo+, KQo:0.5, A5s-A2s, 76s:0.5, 65s:0.5',
            call: '99-22, A9s-A2s, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o-ATo, K9o+, Q9o+, J9o+, T8o+, 98o, 87o' }
    },
    hu: {
      bb: { tresBet: 'TT+, A8s+, KTs+, QJs, ATo+, KJo+, A5s-A2s, 76s, 65s, 54s',
            call: '99-22, A7s-A6s, K2s-K9s, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 52s+, 42s+, A2o-A9o, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o' }
    }
  };

  // Você abriu e levou 3-bet
  var TXT_VS_3BET = {
    normal: { quatroBet: 'QQ+, AKs, AKo, A5s:0.5', callIP: 'JJ-77, AQs, AJs, ATs, KQs, KJs, QJs, JTs, T9s, AQo', callOOP: 'JJ-99, AQs, AJs, KQs, AQo' },
    largo: { quatroBet: 'JJ+, AQs+, AKo, A5s-A4s', callIP: 'TT-55, AJs-A9s, KQs, KJs, KTs, QJs, JTs, T9s, 98s, AQo, AJo, KQo', callOOP: 'TT-77, AJs, ATs, KQs, KJs, QJs, AQo' }
  };

  // Você deu 3-bet e levou 4-bet
  var TXT_VS_4BET = { allin: 'QQ+, AKs, AKo', call: 'JJ:0.5, AQs:0.5' };

  // Iso-raise contra limpers e o que fazer no BB depois de limps
  var TXT_ISO_EXTRA = 'A2s+, K9s+, QTs+, JTs, ATo+, KJo+';
  var TXT_BB_VS_LIMP = 'TT+, AJs+, KQs, AQo+';

  var cache = {};
  function mapa(txt) {
    if (!cache[txt]) cache[txt] = R.parse(txt);
    return cache[txt];
  }

  /** Range de abertura. atras = jogadores que falam depois; headsUp = mesa de 2. */
  function abertura(atras, headsUp) {
    if (headsUp) return mapa(TXT_ABERTURA.hu);
    return mapa(TXT_ABERTURA[Math.max(1, Math.min(8, atras))]);
  }

  /** Grupo do agressor pelo número de jogadores que falavam depois dele. */
  function grupoAgressor(atrasDoAgressor, headsUp) {
    if (headsUp) return 'hu';
    return atrasDoAgressor >= 5 ? 'cedo' : atrasDoAgressor >= 3 ? 'meio' : 'tarde';
  }

  /** {tresBet, call} contra um raise. lugar = 'ip' | 'sb' | 'bb'. */
  function respostaAoRaise(grupo, lugar) {
    var g = TXT_RESPOSTA[grupo] || TXT_RESPOSTA.meio;
    var t = g[lugar] || g.bb || g.ip;
    return { tresBet: mapa(t.tresBet), call: mapa(t.call) };
  }

  /** {quatroBet, call} depois de abrir e levar 3-bet. */
  function respostaA3bet(tresBettorLargo, emPosicao) {
    var t = tresBettorLargo ? TXT_VS_3BET.largo : TXT_VS_3BET.normal;
    return { quatroBet: mapa(t.quatroBet), call: mapa(emPosicao ? t.callIP : t.callOOP) };
  }

  function respostaA4bet() {
    return { allin: mapa(TXT_VS_4BET.allin), call: mapa(TXT_VS_4BET.call) };
  }

  /** Iso-raise contra limpers: abertura um pouco mais apertada + mãos fortes. */
  function isoRaise(atras, headsUp) {
    return uniao(abertura(Math.min(8, atras + 2), headsUp), mapa(TXT_ISO_EXTRA));
  }

  function bbContraLimp() { return mapa(TXT_BB_VS_LIMP); }

  // ----------------------------------------------------------------------
  // Push/fold (stacks curtos). Aproximação das tabelas de equilíbrio de
  // Nash: % de mãos para all-in com 10 bb por posição, escalada pelo stack.
  // ----------------------------------------------------------------------
  var PUSH_10BB = { 1: 62, 2: 42, 3: 31, 4: 25, 5: 21, 6: 18, 7: 15.5, 8: 13.5 };

  function pctPush(bb, atras, headsUp) {
    var base = headsUp ? 60 : PUSH_10BB[Math.max(1, Math.min(8, atras))];
    return Math.max(base * 0.5, Math.min(100, base * Math.pow(10 / Math.max(bb, 1), 0.75)));
  }

  /** Range para ir all-in primeiro na mão com "bb" big blinds efetivos. */
  function pushRange(bb, atras, headsUp) { return topPercent(pctPush(bb, atras, headsUp)); }

  /** Range para pagar um all-in de quem tinha "atrasDoPusher" jogadores depois. */
  function callShoveRange(bb, atrasDoPusher, headsUp) {
    return topPercent(Math.max(3, pctPush(bb, atrasDoPusher, headsUp) * 0.55));
  }

  R.EQ_PREFLOP = eqPorClasse;
  R.ORDEM_FORCA = ORDEM;
  R.percentilClasse = function (c) { return percentil[c]; };
  R.topPercent = topPercent;
  R.ajustarRange = ajustarRange;
  R.uniao = uniao;
  R.menos = menos;
  R.categoria = categoria;
  R.abertura = abertura;
  R.grupoAgressor = grupoAgressor;
  R.respostaAoRaise = respostaAoRaise;
  R.respostaA3bet = respostaA3bet;
  R.respostaA4bet = respostaA4bet;
  R.isoRaise = isoRaise;
  R.bbContraLimp = bbContraLimp;
  R.pctPush = pctPush;
  R.pushRange = pushRange;
  R.callShoveRange = callShoveRange;
  R.TEXTOS = { abertura: TXT_ABERTURA, resposta: TXT_RESPOSTA, vs3bet: TXT_VS_3BET, vs4bet: TXT_VS_4BET };
})(window.Poker = window.Poker || {});
