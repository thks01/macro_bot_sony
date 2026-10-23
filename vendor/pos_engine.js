/* S&T(RP북) 명세부 → 보유 분석·매도/매수/교체 추천 (브라우저 안에서만 계산, 파일은 어디에도 보내지 않음).
   입력: SheetJS 로 읽은 'S&T' 시트 행 배열, 총수익 계산기 시장 자료(CM), 계산 함수(cEval·cInterp), 종목 목록(ISSUES).
   대시보드 템플릿과 node 테스트가 같은 파일을 쓴다. */
(function (root) {
  var KTB = '1001001', MSB = '3001002', IRS = '9001011';
  var SUF = {'AAA': '011', 'AA+': '021', 'AA': '031', 'AA0': '031', 'AA-': '041', 'A+': '051', 'A': '061', 'A0': '061', 'A-': '071',
             'BBB+': '081', 'BBB': '091', 'BBB0': '091', 'BBB-': '101'};
  var RANK = {'AAA': 1, 'AA+': 2, 'AA': 3, 'AA0': 3, 'AA-': 4, 'A+': 5, 'A': 6, 'A0': 6, 'A-': 7, 'BBB+': 8, 'BBB': 9, 'BBB0': 9, 'BBB-': 10};
  var RATING_OF = {'011': 'AAA', '021': 'AA+', '031': 'AA', '041': 'AA-', '051': 'A+', '061': 'A', '071': 'A-', '081': 'BBB+', '091': 'BBB', '101': 'BBB-'};
  var SPECIAL = ['산업은행', '수출입은행', '중소기업은행', '기업은행', '산업금융', '중소기업금융', '수출입금융'];
  var SECTIONS = ['특수채', '은행채', '여전채', '회사채', 'CP/전단채'];

  function serialToISO(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return new Date(v.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
    var m = String(v).match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : null;
  }
  function num(v) { var x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : null; }
  function issuerOf(name) {
    var s = String(name || '').replace(/\s+/g, '');
    var m = s.match(/^[^\d(]+/); s = m ? m[0] : s;
    return s.replace(/(채권|증권|공사채권)$/, '').replace(/신종자본$|후순위$/, '') || name;
  }
  function famOf(section, name) {
    if (section === '국고/통안') return /통화안정|통안/.test(name) ? MSB : KTB;
    if (SPECIAL.some(function (b) { return name.indexOf(b) >= 0; })) return 'SPECIAL';
    if (section === '특수채') return '3001';
    if (section === '은행채') return '5001';
    if (section === '여전채') return name.indexOf('카드') >= 0 ? '6001' : '7001';
    if (section === '회사채') return '8001';
    return null;
  }
  function curveFor(fam, rating, curves) {
    if (fam === KTB || fam === MSB) return curves[fam] ? fam : KTB;
    if (fam === 'SPECIAL') return curves['4001011'] ? '4001011' : (curves['5001011'] ? '5001011' : null);
    if (!fam) return null;
    var r = String(rating || '').toUpperCase().replace(/\s/g, ''), suf = SUF[r];
    if (suf && curves[fam + suf]) return fam + suf;
    var want = RANK[r] || 4, best = null, bd = 99;                        // 같은 섹터에서 가장 가까운 등급 커브
    Object.keys(curves).forEach(function (c) { if (c.slice(0, 4) !== fam) return; var rr = RANK[RATING_OF[c.slice(4)]];
      if (rr && Math.abs(rr - want) < bd) { bd = Math.abs(rr - want); best = c; } });
    return best;
  }

  /* 'S&T' 시트 → {date, holdings[], afs_count, notes[]} — 단기매매증권 구간(국고/통안·특수채·은행채·여전채·회사채·CP)만 */
  function parseSheet(rows) {
    var out = {date: null, holdings: [], skipped: 0, notes: []}, sec = '국고/통안', inTrading = true;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || [], a = r[0], b = r[1];
      if (!out.date) { for (var j = 2; j < Math.min(r.length, 20); j++) { var d = serialToISO(r[j]); if (d && /^20\d\d/.test(d) && typeof r[j] !== 'string') { out.date = d; break; } } }
      if (typeof b === 'string' && /단기매매증권\s*합계/.test(b)) { inTrading = false; continue; }
      if (!inTrading) continue;
      if ((a == null || a === '') && typeof b === 'string') {
        var t = b.trim(); if (SECTIONS.indexOf(t) >= 0) sec = t; continue;
      }
      if (typeof a === 'string' && /^KR[0-9A-Z]{10}$/.test(a.trim())) {
        var qty = num(r[17]); if (qty == null) qty = num(r[3]);
        if (!qty) { out.skipped++; continue; }
        out.holdings.push({code: a.trim(), name: String(b || '').trim(), rating: String(r[2] || '').trim(), section: sec,
          qty: qty, mat: serialToISO(r[6]), md: num(r[7]), dv01: num(r[8]), yld: num(r[9]), chg_bp: num(r[10]),
          buy_yld: num(r[11]), pnl: num(r[12]), cpn: num(r[13]), pledged: (num(r[18]) || 0) + (num(r[19]) || 0) + (num(r[20]) || 0) + (num(r[21]) || 0),
          free: num(r[22])});
      }
    }
    return out;
  }

  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5); }
  function wavg(xs, ws) { var s = 0, w = 0; xs.forEach(function (x, i) { if (x != null && isFinite(x) && ws[i]) { s += x * ws[i]; w += ws[i]; } }); return w ? s / w : null; }

  /* 분석 + 추천. opt: {h_days, minRating, maxT, minT, nSell, nBuy, mk(시장 가정)} */
  function analyze(parsed, CM, cEval, cInterp, ISSUES, opt) {
    opt = opt || {};
    var D = CM.date, curves = CM.curves, mk = opt.mk, ktb = curves[KTB];
    var gap = parsed.date ? Math.abs(daysBetween(parsed.date, D)) : 999, useSpread = gap <= (opt.spreadDays || 5);
    var notes = [];
    if (!useSpread) notes.push('명세부 기준일(' + (parsed.date || '?') + ')과 시장 자료(' + D + ')가 ' + gap + '일 차이 — 종목별 민평 대비 스프레드는 빼고 섹터·등급 커브 금리로 계산');
    function mrGap(code, T) {                                               // 지금 섹터 스프레드 − 1년 평균 (bp, +면 넓음 = 쌈)
      var m = (CM.mr || {})[code]; if (!m || !ktb || !curves[code]) return null;
      return (cInterp(curves[code], T) - cInterp(ktb, T)) * 100 - cInterp(m, T);
    }
    function evalPos(p) {
      var o = cEval(p, mk), sw = (p.curve !== KTB && p.curve !== MSB) ? cEval(Object.assign({}, p, {kind: 'bondswap'}), mk) : null;
      return {o: o, sw: sw};
    }
    var H = parsed.holdings.map(function (h) {
      var x = Object.assign({}, h);
      x.T = h.mat ? daysBetween(D, h.mat) / 365.25 : null;
      x.fam = famOf(h.section, h.name); x.curve = curveFor(x.fam, h.rating, curves); x.issuer = issuerOf(h.name);
      x.credit = h.section !== '국고/통안' && h.section !== 'CP/전단채';
      if (!(x.T > 0.02)) { x.status = '만기 도래'; return x; }
      if (!x.curve) { x.status = '커브 없음'; return x; }
      var yc = cInterp(curves[x.curve], x.T);
      x.yc = yc; x.issue_bp = (useSpread && h.yld != null) ? (h.yld - yc) * 100 : null;
      if (x.issue_bp != null && Math.abs(x.issue_bp) > 60) x.issue_bp = null;      // 이상치는 버림
      var y0 = yc + (x.issue_bp || 0) / 100;
      var e = evalPos({kind: 'bond', curve: x.curve, T: x.T, coupon: h.cpn, y0: y0, notional: h.qty});
      if (e.o.error) { x.status = e.o.error; return x; }
      x.y0 = y0; x.exp_bp = e.o.total_bp; x.cr_bp = e.o.carry_bp + e.o.roll_bp; x.ann = e.o.ann_pct; x.run = e.o.running; x.be = e.o.be_bp;
      x.exp_mn = e.o.total_mn; x.asw = e.sw && !e.sw.error ? e.sw.asw : null;
      x.hann = e.sw && !e.sw.error ? e.sw.ann_pct : x.ann;                 // 금리 헤지(본스) 기준 연환산 — 크레딧 고유 수익
      x.mr = mrGap(x.curve, x.T);
      x.score = (x.hann != null ? x.hann * 100 : 0) + 0.5 * (x.issue_bp || 0) + 0.3 * (x.mr || 0);   // 연 bp 기준
      return x;
    });
    var credit = H.filter(function (x) { return x.credit && x.score != null; });
    // ---- 요약 ----
    var tot = H.reduce(function (s, x) { return s + (x.qty || 0); }, 0), cq = credit.reduce(function (s, x) { return s + x.qty; }, 0);
    var bySec = {}; H.forEach(function (x) { var s = bySec[x.section] = bySec[x.section] || {qty: 0, dv01: 0, n: 0, yw: [], w: []};
      s.qty += x.qty || 0; s.dv01 += x.dv01 || 0; s.n++; s.yw.push(x.yld); s.w.push(x.qty); });
    Object.keys(bySec).forEach(function (k) { var s = bySec[k]; s.yld = wavg(s.yw, s.w); delete s.yw; delete s.w; });
    var byIss = {}; credit.forEach(function (x) { byIss[x.issuer] = (byIss[x.issuer] || 0) + x.qty; });
    var issTop = Object.keys(byIss).map(function (k) { return {issuer: k, qty: byIss[k], pct: cq ? byIss[k] / cq * 100 : 0}; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 12);
    var byRt = {}; credit.forEach(function (x) { var r = x.rating || '-'; byRt[r] = (byRt[r] || 0) + x.qty; });
    var buckets = [[0, 0.25, '~3M'], [0.25, 0.5, '3~6M'], [0.5, 1, '6M~1Y'], [1, 1.5, '1~1.5Y'], [1.5, 2, '1.5~2Y'], [2, 3, '2~3Y'], [3, 5, '3~5Y'], [5, 99, '5Y~']];
    var ladder = buckets.map(function (b) { var xs = H.filter(function (x) { return x.T > b[0] && x.T <= b[1]; });
      return {bucket: b[2], qty: xs.reduce(function (s, x) { return s + x.qty; }, 0), credit: xs.filter(function (x) { return x.credit; }).reduce(function (s, x) { return s + x.qty; }, 0),
              dv01: xs.reduce(function (s, x) { return s + (x.dv01 || 0); }, 0)}; });
    var summary = {total_qty: tot, credit_qty: cq, dv01: H.reduce(function (s, x) { return s + (x.dv01 || 0); }, 0),
      credit_dv01: credit.reduce(function (s, x) { return s + (x.dv01 || 0); }, 0),
      yld: wavg(H.map(function (x) { return x.yld; }), H.map(function (x) { return x.qty; })),
      credit_ann: wavg(credit.map(function (x) { return x.ann; }), credit.map(function (x) { return x.qty; })),
      credit_run: wavg(credit.map(function (x) { return x.run; }), credit.map(function (x) { return x.qty; })),
      credit_exp_mn: credit.reduce(function (s, x) { return s + (x.exp_mn || 0); }, 0),
      wam: wavg(H.map(function (x) { return x.T; }), H.map(function (x) { return x.qty; })),
      by_section: bySec, by_rating: byRt, issuers: issTop, ladder: ladder, n: H.length};
    // ---- 매수 후보 (섹터·등급 × 만기) ----
    var minR = RANK[opt.minRating || 'AA-'] || 4, tenors = (opt.tenors || [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3]).filter(function (t) { return t <= (opt.maxT || 3) + 1e-9; });
    var uni = [];
    Object.keys(curves).forEach(function (c) {
      if (c === KTB || c === MSB || c === IRS) return;
      var rt = c === '4001011' ? 'AAA' : RATING_OF[c.slice(4)]; if (!rt || (RANK[rt] || 99) > minR) return;
      tenors.forEach(function (T) {
        var e = evalPos({kind: 'bond', curve: c, T: T, notional: 100}); if (e.o.error) return;
        var mr = mrGap(c, T), hann = e.sw && !e.sw.error ? e.sw.ann_pct : e.o.ann_pct, sc = hann * 100 + 0.3 * (mr || 0);
        uni.push({curve: c, name: (CM.names || {})[c] || c, rating: rt, T: T, y0: e.o.y0, ann: e.o.ann_pct, hann: hann, exp_bp: e.o.total_bp,
                  cr_bp: e.o.carry_bp + e.o.roll_bp, run: e.o.running, be: e.o.be_bp, mr: mr, asw: e.sw && !e.sw.error ? e.sw.asw : null, score: sc});
      });
    });
    uni.sort(function (a, b) { return b.score - a.score; });
    var held = {}; credit.forEach(function (x) { held[x.issuer] = true; });
    function examples(c, T) {
      if (!ISSUES || !ISSUES.rows) return [];
      return ISSUES.rows.filter(function (r) { if (r[5] !== c) return false; var t = daysBetween(D, r[2]) / 365.25; return Math.abs(t - T) <= 0.3; })
        .sort(function (a, b) { return (b[8] || 0) - (a[8] || 0); }).slice(0, 3)
        .map(function (r) { return {name: r[1], mat: r[2], cpn: r[3], bal: r[8]}; });
    }
    var buys = [], seen = {};
    uni.forEach(function (u) { var k = u.curve; if (buys.length >= (opt.nBuy || 10) || (seen[k] || 0) >= 2) return; seen[k] = (seen[k] || 0) + 1;
      u.examples = examples(u.curve, u.T); buys.push(u); });
    // ---- 매도 후보 ----
    var sells = credit.filter(function (x) { return x.T > (opt.minT || 0.25); }).slice()
      .sort(function (a, b) { return a.score - b.score; }).slice(0, opt.nSell || 12);
    sells.forEach(function (x) {
      var why = [];
      if (x.run != null && x.run < 0) why.push('조달 대비 러닝 ' + x.run.toFixed(0) + 'bp(연)');
      if (x.issue_bp != null && x.issue_bp < -2) why.push('섹터 민평보다 ' + (-x.issue_bp).toFixed(1) + 'bp 낮게 평가(리치)');
      if (x.mr != null && x.mr < -3) why.push('섹터 스프레드가 1년 평균보다 ' + (-x.mr).toFixed(1) + 'bp 좁음');
      if (x.hann != null) why.push('금리 헤지 기준 연환산 ' + (x.hann * 100).toFixed(0) + 'bp (아웃라이트 ' + x.ann.toFixed(2) + '%)');
      if (x.pledged > 0) why.push('담보 사용 ' + x.pledged + '억 — 매도 전 담보 교체 필요');
      x.why = why;
    });
    // ---- 교체(스위치) ----
    var switches = [];
    sells.forEach(function (x) {
      var cands = uni.filter(function (u) { return Math.abs(u.T - x.T) <= 0.5 && (RANK[u.rating] || 99) <= (RANK[x.rating] || 4) && u.curve !== x.curve; });
      var best = cands[0]; if (!best) return;
      var gain = (best.hann - x.hann) * 100;
      if (gain >= (opt.minSwitchBp || 5)) switches.push({sell: x, buy: best, gain_bp: gain, examples: examples(best.curve, best.T)});
    });
    switches.sort(function (a, b) { return b.gain_bp - a.gain_bp; });
    return {date: parsed.date, mkt_date: D, notes: notes, holdings: H, summary: summary, sells: sells, buys: buys,
            switches: switches.slice(0, 10), universe: uni};
  }

  root.MBPos = {parseSheet: parseSheet, analyze: analyze, issuerOf: issuerOf, curveFor: curveFor, famOf: famOf};
})(typeof window !== 'undefined' ? window : module.exports);
