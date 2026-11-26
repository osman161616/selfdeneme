import { state, examsSorted, subeList, sinifList, getStudent, dersIndex, findQuestionByName } from '../db.js';
import { esc, $, $$, fmtDate, fmtNum, fmtPct, cmpTr, trLower, debounce, sinifOf, safeFile, stamp } from '../util.js';
import { toast, progress, emptyState, guard, alertDlg, sortableTable, confirmDlg } from '../ui.js';
import { evaluateExam, collectItems, statsBy, inScope, seviyeToStr, seviyeClass } from '../scoring.js';
import { genelKarne, scopeLabel } from '../reports.js';
import { makeBooklet, resultsDialog, pdfFile, recordDoc, buildAnswerKeyPdf } from '../generate.js';
import { takeParams, go } from '../app.js';

const av = { tip: 'ogrenci', deger: '', q: '', exams: null, tab: 'ozet' };

function entities(tip) {
  if (tip === 'ogrenci') {
    const nos = new Set(); for (const e of state.exams.values()) Object.keys(e.sonuclar).forEach(n => nos.add(n));
    return [...nos].map(no => { const s = getStudent(no); const any = [...state.exams.values()].find(e => e.sonuclar[no]); return { id: no, label: (s && s.isim) || any?.sonuclar[no]?.isim || no, sub: `${no} · ${(s && s.sube) || any?.sonuclar[no]?.sube || '-'}`, sube: (s && s.sube) || '' }; }).sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.label, b.label));
  }
  if (tip === 'sube') return subeList().map(s => ({ id: s, label: s, sub: 'şube' }));
  if (tip === 'sinif') return sinifList().map(s => ({ id: s, label: `${s}. sınıf`, sub: 'tüm şubeler' }));
  return [{ id: 'kurum', label: state.settings.kurum || 'Kurum geneli', sub: 'tüm öğrenciler' }];
}

export async function render(host) {
  const p = takeParams('analiz');
  if (p.tip) { av.tip = p.tip; av.deger = p.deger; av.exams = null; }
  host.innerHTML = `<div class="page-head"><div><h1>Seviye Analizi</h1><p>Seçtiğiniz sınavlara göre öğrencinin, şubenin ya da kurumun ders ve konu seviyeleri. Seviye 1 (geliştirilmeli) ile 5 (çok iyi) arasındadır ve yanlış yapılan soruların zorluğuna göre hesaplanır.</p></div></div>
  <div id="a-body"></div>`;
  const body = $('#a-body', host);
  if (!state.exams.size) { body.innerHTML = `<div class="card">${emptyState('Analiz için sınav sonucu gerekli', 'Bir sınav değerlendirdiğinizde öğrencilerin ders ve konu seviyeleri burada görünür.', '<a class="btn primary" href="#sinavlar">Sınav değerlendir</a>')}</div>`; return; }
  const ents = entities(av.tip);
  if (av.tip === 'kurum') av.deger = 'kurum';
  if (!ents.some(e => e.id === av.deger)) { av.deger = ents[0]?.id || ''; av.exams = null; }
  const q = trLower(av.q);
  const shown = ents.filter(e => !q || trLower(e.label).includes(q) || trLower(e.sub).includes(q));
  body.innerHTML = `<div class="split">
    <aside class="card">
      <div class="seg" id="a-tip" style="width:100%">${[['ogrenci', 'Öğrenci'], ['sube', 'Şube'], ['sinif', 'Sınıf'], ['kurum', 'Kurum']].map(([k, l]) => `<button data-t="${k}" class="${av.tip === k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div>
      ${av.tip !== 'kurum' ? `<input id="a-q" placeholder="Ara" value="${esc(av.q)}" style="margin:10px 0 8px">` : '<div style="height:10px"></div>'}
      <div class="list" style="max-height:62vh">${shown.map(e => `<div class="it ${e.id === av.deger ? 'on' : ''}" data-e="${esc(e.id)}"><span class="grow">${esc(e.label)}<br><span class="small muted">${esc(e.sub)}</span></span></div>`).join('') || '<p class="muted small" style="padding:10px">Kayıt yok.</p>'}</div>
    </aside>
    <section id="a-main"></section></div>`;
  $$('#a-tip button', body).forEach(b => b.addEventListener('click', () => { av.tip = b.dataset.t; av.deger = ''; av.exams = null; av.q = ''; render(host); }));
  const qi = $('#a-q', body);
  if (qi) qi.addEventListener('input', debounce(e => { av.q = e.target.value; render(host); const n = $('#a-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250));
  $$('[data-e]', body).forEach(el => el.addEventListener('click', () => { av.deger = el.dataset.e; av.exams = null; render(host); }));
  if (av.deger) renderMain($('#a-main', body), host);
}

function scope() { return { tip: av.tip, deger: av.deger }; }

function renderMain(main, host) {
  const sc = scope();
  const examsAll = examsSorted().filter(e => [...evaluateExam(e).ogr.values()].some(o => inScope(o, sc)));
  if (!av.exams) av.exams = new Set(examsAll.map(e => e.id));
  const exams = examsAll.filter(e => av.exams.has(e.id));
  const items = collectItems(exams, sc);
  const isStu = av.tip === 'ogrenci';
  main.innerHTML = `<div class="card">
    <div class="row between gap"><div><h2>${esc(scopeLabel(sc))}</h2><p class="small muted" style="margin:4px 0 0">${exams.length}/${examsAll.length} sınav seçili · ${items.length} cevap</p></div>
    <div class="row gap"><button class="btn" id="a-karne">Genel analiz karnesi</button>${isStu ? '<button class="btn" id="a-hata">Hata testi</button>' : ''}<button class="btn primary" id="a-odev">Bu analizden ödev hazırla</button></div></div>
    <details style="margin-top:12px" ${examsAll.length <= 6 ? 'open' : ''}><summary class="small"><b>Sınavlar</b> (analize katılanları seçin)</summary>
      <div class="chips" style="margin-top:8px">${examsAll.map(e => `<label class="check pill" style="padding:6px 10px"><input type="checkbox" data-x="${esc(e.id)}" ${av.exams.has(e.id) ? 'checked' : ''}> ${esc(e.isim)} <span class="muted">${fmtDate(e.tarih)}</span></label>`).join('')}</div></details>
  </div>
  <div class="tabs" style="margin-top:16px">${[['ozet', 'Özet'], ['ders', 'Ders seviyeleri'], ['konu', 'Konu seviyeleri'], ['yanlis', 'Yanlış ve boşlar']].map(([k, l]) => `<button data-t="${k}" class="${av.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="a-tab"></div>`;
  $$('[data-x]', main).forEach(c => c.addEventListener('change', () => { if (c.checked) av.exams.add(c.dataset.x); else av.exams.delete(c.dataset.x); render(host); }));
  $$('.tabs button', main).forEach(b => b.addEventListener('click', () => { av.tab = b.dataset.t; render(host); }));
  $('#a-karne', main).addEventListener('click', guard(async () => {
    if (!exams.length) { toast('En az bir sınav seçin.', 'warn'); return; }
    const pg = progress('Karne hazırlanıyor');
    let pdf; try { pdf = await genelKarne(sc, exams); } finally { pg.close(); }
    await resultsDialog('Genel analiz karnesi hazır', [pdfFile('Genel analiz karnesi', `genel_analiz_${scopeLabel(sc)}_${stamp()}`, pdf)]);
  }));
  const hb = $('#a-hata', main); if (hb) hb.addEventListener('click', guard(() => hataTesti(items)));
  $('#a-odev', main).addEventListener('click', () => {
    const wrong = items.filter(it => it.net <= 0);
    const g = new Map();
    for (const it of wrong) { const k = it.ders + '|' + it.konu + '|' + it.zorluk; if (!g.has(k)) g.set(k, { ders: it.ders, konu: it.konu, zorluk: it.zorluk, yanlis: 0 }); g.get(k).yanlis++; }
    const rows = [...g.values()].filter(r => [...state.questions.values()].some(q => q.ders === r.ders && q.konu === r.konu)).sort((a, b) => dersIndex(a.ders) - dersIndex(b.ders) || b.yanlis - a.yanlis).map(r => ({ ...r, count: Math.min(r.yanlis, 10) }));
    const nos = isStu ? [av.deger] : [...new Set(items.map(i => i.no))];
    if (!rows.length) { alertDlg('Yanlış yapılan konulardan bankada soru bulunamadı.'); return; }
    go('hazirla', { students: nos, rows, tur: 'odev', mode: 'manuel', title: isStu ? `Ödev · ${scopeLabel(sc)}` : `Ödev · ${scopeLabel(sc)}` });
  });
  const tab = $('#a-tab', main);
  if (!items.length) { tab.innerHTML = '<div class="card"><p class="muted">Seçili sınavlarda sonuç yok.</p></div>'; return; }
  if (av.tab === 'ozet') tabOzet(tab, exams, items, sc);
  else if (av.tab === 'ders') tabLevels(tab, items, 'ders');
  else if (av.tab === 'konu') tabLevels(tab, items, 'konu');
  else tabYanlis(tab, items);
}

function trendSvg(points) {
  if (points.length < 2) return '<p class="small muted">Gidişat grafiği için en az iki sınav gerekir.</p>';
  return '<div class="fig" id="trend"></div>';
}
function drawTrend(el, points) {
  if (!el) return;
  const draw = () => {
    const W = el.clientWidth, H = el.clientHeight; if (!W) return;
    const narrow = W < 420;
    const pl = 40, pr = 30, pt = 26, pb = 30;
    const vals = points.map(p => p.v); let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1) { mx += 1; mn -= 1; } const pad = (mx - mn) * 0.18; mn -= pad; mx += pad;
    const x = i => pl + (W - pl - pr) * i / (points.length - 1), y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
    const grid = [0, 1, 2, 3].map(i => { const v = mn + (mx - mn) * i / 3; return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${v.toFixed(0)}</text>`; }).join('');
    const every = Math.max(1, Math.ceil(points.length / (narrow ? 4 : 8)));
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Puan gidişatı">${grid}
    <polyline fill="none" stroke="var(--brand)" stroke-width="2.5" points="${points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4.5" fill="var(--panel)" stroke="var(--brand)" stroke-width="2"/>${i % every === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${y(p.v) - 10}" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--ink)">${fmtNum(p.v, 1)}</text><text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="12" fill="var(--muted)">${esc(p.l)}</text>` : ''}`).join('')}</svg>`;
  };
  const trendObserver = new ResizeObserver(draw); trendObserver.observe(el); draw();
}

function tabOzet(tab, exams, items, sc) {
  const all = statsBy(items, () => 'x').get('x');
  const pts = exams.map(e => { const os = [...evaluateExam(e).ogr.values()].filter(o => inScope(o, sc) && o.puan !== null); return os.length ? { l: fmtDate(e.tarih).slice(0, 5), v: os.reduce((a, o) => a + o.puan, 0) / os.length } : null; }).filter(Boolean);
  const dg = [...statsBy(items, it => it.ders).values()].sort((a, b) => dersIndex(a.ders) - dersIndex(b.ders) || cmpTr(a.ders, b.ders));
  const kg = [...statsBy(items, it => it.ders + '\u0000' + it.konu).values()].filter(g => g.soru >= 2).sort((a, b) => a.oran - b.oran).slice(0, 6);
  tab.innerHTML = `<div class="grid g4"><div class="stat brand"><div class="v">${fmtNum(all.seviye, 2)}</div><div class="l">genel seviye · ${seviyeToStr(all.seviye)}</div></div><div class="stat"><div class="v">${fmtPct(all.oran)}</div><div class="l">doğru oranı</div></div><div class="stat"><div class="v">${all.D}/${all.Y}/${all.B}</div><div class="l">doğru / yanlış / boş</div></div><div class="stat"><div class="v">${pts.length ? fmtNum(pts[pts.length - 1].v, 1) : '-'}</div><div class="l">son sınav ${sc.tip === 'ogrenci' ? 'puanı' : 'ortalaması'}</div></div></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h3>${sc.tip === 'ogrenci' ? 'Puan' : 'Ortalama puan'} gidişatı</h3>${trendSvg(pts)}</div>
    <div class="card"><h3>Derslere göre doğru oranı</h3>${dg.map(g => `<div style="margin:9px 0"><div class="row between small"><span>${esc(g.ders)}</span><span><b>${fmtPct(g.oran)}</b> · seviye ${fmtNum(g.seviye, 2)}</span></div><div class="bar" style="margin:4px 0"><i style="width:${Math.round(g.oran * 100)}%"></i></div></div>`).join('')}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Öncelikli konular</h3>${kg.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Konu</th><th>Ders</th><th class="num">Soru</th><th class="num">Doğru oranı</th><th class="num">Seviye</th></tr></thead><tbody>${kg.map(g => `<tr class="${seviyeClass(g.seviye)}"><td>${esc(g.konu)}</td><td>${esc(g.ders)}</td><td class="num">${g.soru}</td><td class="num">${fmtPct(g.oran)}</td><td class="num">${fmtNum(g.seviye, 2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">En az iki sorusu olan konu yok.</p>'}</div>`;
  if (pts.length > 1) drawTrend(tab.querySelector('#trend'), pts);
}

function tabLevels(tab, items, by) {
  const g = [...statsBy(items, it => by === 'ders' ? it.ders : it.ders + '\u0000' + it.konu).values()];
  const rows = g.map(x => ({ ders: x.ders, konu: x.konu, soru: x.soru, D: x.D, Y: x.Y, B: x.B, oran: x.oran, seviye: x.seviye, durum: seviyeToStr(x.seviye) }));
  tab.innerHTML = '<div class="card"><div id="lv"></div><p class="small muted" style="margin-top:10px">Renkler: kırmızı 1–2, sarı 2–3, turkuaz 3–4, yeşil 4–5.</p></div>';
  sortableTable($('#lv', tab), [
    { key: 'ders', label: 'Ders', sortVal: r => dersIndex(r.ders) * 1000 + 0 },
    ...(by === 'konu' ? [{ key: 'konu', label: 'Konu' }] : []),
    { key: 'soru', label: 'Soru', num: true }, { key: 'D', label: 'D', num: true }, { key: 'Y', label: 'Y', num: true }, { key: 'B', label: 'B', num: true },
    { key: 'oran', label: 'Doğru oranı', num: true, fmt: v => fmtPct(v) }, { key: 'seviye', label: 'Seviye', num: true, fmt: v => fmtNum(v, 2) }, { key: 'durum', label: 'Durum', sortVal: r => r.seviye },
  ], rows, { sortKey: by === 'konu' ? 'oran' : 'ders', rowCls: r => seviyeClass(r.seviye) });
}

function tabYanlis(tab, items) {
  const m = new Map();
  for (const it of items) {
    if (it.net > 0) continue;
    const k = it.qid || `${it.ders}|${it.konu}|${it.ad || it.i}`;
    if (!m.has(k)) m.set(k, { ...it, kez: 0, bos: 0 });
    const r = m.get(k); r.kez++; if (it.durum === 'B') r.bos++;
  }
  const rows = [...m.values()].map(r => ({ ders: r.ders, konu: r.konu, zorluk: r.zorluk, ad: r.ad || '-', kez: r.kez, bos: r.bos, banka: (r.qid && state.questions.has(r.qid)) || (r.ad && findQuestionByName(r.ders, r.konu, r.ad)) ? 'var' : 'yok' }));
  tab.innerHTML = `<div class="card"><p class="small muted" style="margin-top:0">${rows.length} farklı soru yanlış ya da boş bırakılmış. Bankada bulunanlar hata testine girebilir.</p><div id="yl"></div></div>`;
  sortableTable($('#yl', tab), [
    { key: 'ders', label: 'Ders', sortVal: r => dersIndex(r.ders) }, { key: 'konu', label: 'Konu' }, { key: 'zorluk', label: 'Zorluk', num: true }, { key: 'ad', label: 'Soru' },
    { key: 'kez', label: 'Yanlış/boş', num: true }, { key: 'bos', label: 'Boş', num: true }, { key: 'banka', label: 'Bankada' },
  ], rows, { sortKey: 'ders', rowCls: r => r.zorluk <= 2 ? 'lv1' : '' });
}

async function hataTesti(items) {
  const no = av.deger;
  const wrong = items.filter(it => it.net <= 0);
  const qs = []; const missing = [];
  const seen = new Set();
  for (const it of wrong) {
    let q = it.qid ? state.questions.get(it.qid) : null;
    if (!q && it.ad) q = findQuestionByName(it.ders, it.konu, it.ad);
    if (q) { if (!seen.has(q.id)) { seen.add(q.id); qs.push(q); } }
    else missing.push(`${it.ders} / ${it.konu} / ${it.ad || 'adsız soru'}`);
  }
  if (!qs.length) { await alertDlg('Öğrencinin yanlış yaptığı sorular soru bankasında bulunamadı. Hata testi yalnızca selfdeneme ile hazırlanan ya da soru adları bankayla eşleşen sınavlarda üretilebilir.'); return; }
  if (missing.length && !await confirmDlg(`${missing.length} yanlış soru bankada bulunamadığı için teste girmeyecek. ${qs.length} soruyla devam edilsin mi?`, { ok: 'Devam et' })) return;
  const s = getStudent(no); const lbl = s ? `${s.isim} · ${s.no}${s.sube ? ' · ' + s.sube : ''}` : no;
  const title = 'Hata Testi';
  const pg = progress('Hata testi hazırlanıyor');
  try {
    const r = await makeBooklet({ questions: qs, title, ogrenci: lbl, byKonu: true, tries: 3, onProgress: (f, t) => pg.set(f * 0.85, t) });
    const kp = await buildAnswerKeyPdf(title, r.key, { ogrenci: lbl });
    await recordDoc({ tur: 'hata', isim: `${title} · ${s?.isim || no}`, sorular: r.key, ogrenciler: [no] });
    pg.close();
    await resultsDialog('Hata testi hazır', [pdfFile('Hata testi', `hata_testi_${s?.isim || no}_${no}`, r.pdf, `${r.key.length} soru`), pdfFile('Cevap anahtarı', `hata_testi_${s?.isim || no}_${no}_cevap_anahtari`, kp)]);
  } finally { pg.close(); }
}

export { sinifOf, safeFile };
