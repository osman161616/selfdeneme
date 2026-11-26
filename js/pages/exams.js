import { state, saveExam, deleteExam, examsSorted, getStudent, subeList, saveStudents } from '../db.js';
import { esc, $, $$, fmtDate, fmtNum, fmtPct, safeFile, pickFiles, readText, LETTERS, cmpTr, normNo, stamp, toCSV } from '../util.js';
import { modal, confirmDlg, toast, progress, emptyState, guard, alertDlg, sortableTable, optionList } from '../ui.js';
import { evaluateExam, touch, puanlamaSnapshot } from '../scoring.js';
import { denemeKarneleri, KARNE_OPTS, siraliListeRows, siraliListePdf } from '../reports.js';
import { resultsDialog, pdfFile, csvFile, zipFiles } from '../generate.js';
import { legacyExamToExam } from '../importers.js';
import { wz, startWizard, renderWizard } from './evaluate.js';
import { formDialog } from './homework.js';
import { takeParams, go } from '../app.js';
import { PUAN_TURLERI, sablon } from '../sinavlar.js';
const ptAd = pt => (PUAN_TURLERI[pt] ? PUAN_TURLERI[pt].ad : pt);

let ev = { open: null, tab: 'sonuc', sube: '', karne: { puan: true, ders: true, seviye: true, soru: true, konu: true, madde: true } };

export async function render(host) {
  const p = takeParams('sinavlar');
  if (p.open) { ev.open = p.open; ev.tab = 'sonuc'; }
  if (p.yeniDoc) { startWizard({ docId: p.yeniDoc }); }
  if (wz.active) return renderWizard(host, id => { if (id) { ev.open = id; ev.tab = 'sonuc'; } render(host); });
  if (ev.open && state.exams.has(ev.open)) return renderDetail(host, state.exams.get(ev.open));
  ev.open = null;
  renderList(host);
}

function renderList(host) {
  const exams = examsSorted().reverse();
  const denemeler = [...state.docs.values()].filter(d => d.tur === 'deneme');
  host.innerHTML = `
  <div class="page-head"><div><h1>Sınavlar ve Optik</h1><p>Optik formları yazdırın, taranmış ya da fotoğraflanmış formları okutun, sonuçları ve karneleri buradan alın.</p></div>
    <div class="row gap"><button class="btn" id="x-form">Optik form yazdır</button><button class="btn" id="x-imp">Eski sınav dosyası</button><button class="btn primary" id="x-new">Sınav değerlendir</button></div></div>
  ${exams.length ? `<div class="card"><div id="x-tbl"></div></div>` : `<div class="card">${emptyState('Henüz değerlendirilmiş sınav yok', 'Bir deneme hazırladıysanız formları okutmaya başlayın. Dışarıdan bir yayının denemesini de cevap anahtarını girerek değerlendirebilirsiniz.', '<button class="btn primary" id="e-new">Sınav değerlendir</button><a class="btn" href="#hazirla">Deneme hazırla</a>')}</div>`}
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h3>1 · Formu yazdırın</h3><p class="small muted">Formlar normal yazıcıda, A4 kâğıda basılır. Kişiye özel formlarda öğrencinin adı ve numarası basılı gelir; öğrenci yalnızca cevaplarını işaretler.</p></div>
    <div class="card"><h3>2 · Tarayın ya da çekin</h3><p class="small muted">Fotokopi makinesinde formları PDF olarak tarayın ya da telefonla fotoğraflayın. Dört köşedeki siyah kareler görünür olmalı.</p></div>
    <div class="card"><h3>3 · Kontrol edin</h3><p class="small muted">Program emin olamadığı işaretleri (silinti, çift işaret, silik kalem) gösterir; tek tıkla düzeltirsiniz.</p></div>
  </div>`;
  const nb = $('#x-new', host), eb = $('#e-new', host);
  [nb, eb].forEach(b => b && b.addEventListener('click', () => { startWizard(); render(host); }));
  $('#x-form', host).addEventListener('click', guard(async () => {
    if (!denemeler.length) { await alertDlg('Optik form, bir deneme için üretilir. Önce "Ödev ve Deneme" sayfasında deneme hazırlayın ya da "Sınav değerlendir" ile dışarıdan bir cevap anahtarı tanımlayıp oradan form yazdırın.'); return; }
    const id = await modal({ title: 'Hangi deneme?', content: `<div class="list">${denemeler.sort((a, b) => b.created - a.created).map(d => `<div class="it" data-d="${esc(d.id)}"><span class="grow"><b>${esc(d.isim)}</b><br><span class="small muted">${fmtDate(d.tarih)} · ${d.sorular.length} soru</span></span></div>`).join('')}</div>`, buttons: [{ label: 'Vazgeç', value: null }], onMount: (m, close) => $$('[data-d]', m).forEach(el => el.addEventListener('click', () => close(el.dataset.d))) });
    if (id) await formDialog(state.docs.get(id));
  }));
  $('#x-imp', host).addEventListener('click', guard(async () => {
    const files = await pickFiles({ accept: '.json,application/json', multiple: true });
    let n = 0; const errs = [];
    for (const f of files) {
      try { const e = legacyExamToExam(JSON.parse(await readText(f)), f.name.replace(/\.json$/i, '')); if (e) { await saveExam(e); n++; } }
      catch (e) { errs.push(`${f.name}: ${e.message}`); }
    }
    if (n) toast(`${n} sınav aktarıldı.`);
    if (errs.length) await alertDlg(errs.join('\n'), 'Bazı dosyalar aktarılamadı');
    render(host);
  }));
  if (exams.length) {
    const rows = exams.map(e => { const r = evaluateExam(e); return { id: e.id, isim: e.isim, tur: (e.tur || 'Serbest') + (e.kismi ? ' · branş' : ''), tarih: e.tarih, n: r.ogr.size, soru: e.sorular.length, puan: r.kurum.puanOrt, net: r.kurum.netOrt, kaynak: e.kaynak || '' }; });
    sortableTable($('#x-tbl', host), [
      { key: 'tarih', label: 'Tarih', fmt: v => fmtDate(v) }, { key: 'isim', label: 'Sınav' }, { key: 'tur', label: 'Tür' }, { key: 'n', label: 'Öğrenci', num: true }, { key: 'soru', label: 'Soru', num: true },
      { key: 'net', label: 'Ort. net', num: true, fmt: v => fmtNum(v) }, { key: 'puan', label: 'Ort. puan', num: true, fmt: v => fmtNum(v) }, { key: 'kaynak', label: 'Kaynak' },
    ], rows, { sortKey: 'tarih', desc: true, onRow: r => { ev.open = r.id; ev.tab = 'sonuc'; render(host); } });
  }
}

function renderDetail(host, exam) {
  const r = evaluateExam(exam);
  const subeler = [...new Set([...r.ogr.values()].map(o => o.sube || ''))].sort(cmpTr);
  host.innerHTML = `
  <div class="page-head"><div><a href="#sinavlar" id="d-back" class="small">‹ Tüm sınavlar</a><h1 style="margin-top:6px">${esc(exam.isim)}</h1><p>${r.tpl ? `<span class="pill">${esc(r.tpl.ad)}${r.kismi ? ' · branş/kısmi' : ''}</span> ` : ''}${fmtDate(exam.tarih)} · ${r.ogr.size} öğrenci · ${exam.sorular.length} soru${r.tpl && r.tpl.tytGerekli ? (r.tytExam ? ` · TYT eşleşmesi: ${esc(r.tytExam.isim)}` : ' · <b style="color:var(--bad)">TYT eşleşmesi yok</b>') : ''}</p></div>
    <div class="row gap"><button class="btn" id="d-add">Sonuç ekle</button><button class="btn primary" id="d-karne">Karneler ve listeler</button></div></div>
  <div class="grid g4">
    <div class="stat brand"><div class="v">${fmtNum(r.kurum.puanOrt, 1)}</div><div class="l">kurum ortalaması · ${puanEtiket(exam, r)}</div></div>
    <div class="stat"><div class="v">${fmtNum(r.kurum.netOrt, 2)}</div><div class="l">ortalama net</div></div>
    <div class="stat"><div class="v">${fmtNum(maxPuan(r), 1)}</div><div class="l">en yüksek ${r.netSiralama ? 'net' : 'puan'}</div></div>
    <div class="stat"><div class="v">${fmtPct(r.soruIst.reduce((a, s) => a + s.oran, 0) / Math.max(1, r.soruIst.length))}</div><div class="l">ortalama doğru oranı</div></div>
  </div>
  <div class="tabs" style="margin-top:18px">
    <button data-t="sonuc" class="${ev.tab === 'sonuc' ? 'on' : ''}">Sonuçlar</button>
    <button data-t="ders" class="${ev.tab === 'ders' ? 'on' : ''}">Ders ve şube</button>
    <button data-t="madde" class="${ev.tab === 'madde' ? 'on' : ''}">Soru analizi</button>
    <button data-t="duzen" class="${ev.tab === 'duzen' ? 'on' : ''}">Cevap anahtarı ve ayarlar</button>
  </div>
  <div id="d-body"></div>`;
  $('#d-back', host).addEventListener('click', e => { e.preventDefault(); ev.open = null; render(host); });
  $$('.tabs button', host).forEach(b => b.addEventListener('click', () => { ev.tab = b.dataset.t; render(host); }));
  $('#d-add', host).addEventListener('click', () => { startWizard({ addTo: exam.id }); render(host); });
  $('#d-karne', host).addEventListener('click', guard(() => karneDialog(exam, subeler)));
  const body = $('#d-body', host);
  if (ev.tab === 'sonuc') tabResults(body, exam, r, subeler, host);
  else if (ev.tab === 'ders') tabDers(body, exam, r);
  else if (ev.tab === 'madde') tabMadde(body, exam, r);
  else tabEdit(body, exam, r, host);
}

function anaPt(exam, r) { return r.tpl && r.puanTurleri.length ? (exam.siralama && r.puanTurleri.includes(exam.siralama) ? exam.siralama : r.puanTurleri[0]) : null; }
function puanEtiket(exam, r) { return r.netSiralama ? 'toplam net' : r.tpl ? ptAd(anaPt(exam, r)) + ' (tahmini)' : 'puan'; }
function maxPuan(r) { const v = [...r.ogr.values()].map(o => o.puan).filter(x => x !== null && x !== undefined); return v.length ? Math.max(...v) : null; }

function tabResults(body, exam, r, subeler, host) {
  body.innerHTML = `<div class="card"><div class="row gap" style="margin-bottom:10px"><select id="r-sube" style="width:auto">${optionList(subeler.map(s => s || '(şubesiz)'), ev.sube === '' ? '' : ev.sube || '(şubesiz)', { empty: 'Tüm şubeler' })}</select><span class="small muted">Satıra tıklayınca öğrencinin ayrıntısı açılır.</span></div><div id="r-tbl"></div></div>`;
  const sel = $('#r-sube', body);
  sel.addEventListener('change', () => { ev.sube = sel.value; render(host); });
  const list = [...r.ogr.values()].filter(o => !ev.sube || (o.sube || '(şubesiz)') === ev.sube);
  const pts = r.puanTurleri || [];
  const hasY = pts.length && r.tpl.id !== 'LGS' && list.some(o => Object.values(o.yPuanlar).some(v => v !== null));
  const big = v => (v === null || v === undefined ? -1e9 : v);
  const rows = list.map(o => ({ o, no: o.no, isim: o.isim, sube: o.sube, net: o.net, puan: o.puan, sira: o.rank.kurum.genel, ssira: o.rank.sube.genel, ...Object.fromEntries(r.dersler.map(d => ['d_' + d, o.ders[d].Net])), ...Object.fromEntries(pts.map(pt => ['p_' + pt, o.puanlar[pt]])), ...Object.fromEntries(pts.map(pt => ['y_' + pt, o.yPuanlar[pt]])) }));
  const pcols = pts.length ? pts.flatMap(pt => [{ key: 'p_' + pt, label: ptAd(pt), num: true, sortVal: x => big(x['p_' + pt]), html: x => x['p_' + pt] === null || x['p_' + pt] === undefined ? `<span class="muted" title="${esc(x.o.puanAciklama[pt] || '')}">–</span>` : `<b>${fmtNum(x['p_' + pt], 2)}</b>` }, ...(hasY ? [{ key: 'y_' + pt, label: 'Y-' + ptAd(pt), num: true, sortVal: x => big(x['y_' + pt]), fmt: v => fmtNum(v, 2) }] : [])])
    : r.netSiralama ? [] : [{ key: 'puan', label: 'Puan', num: true, fmt: v => fmtNum(v, 2) }];
  sortableTable($('#r-tbl', body), [
    { key: 'sira', label: 'Sıra', num: true, sortVal: x => x.sira ?? 1e9, fmt: v => v ?? '–' }, { key: 'no', label: 'No', num: true, sortVal: x => Number(x.no) || 0 }, { key: 'isim', label: 'Ad soyad' }, { key: 'sube', label: 'Şube' },
    ...r.dersler.map(d => ({ key: 'd_' + d, label: d.length > 12 ? d.slice(0, 11) + '…' : d, num: true, fmt: v => fmtNum(v, 2) })),
    { key: 'net', label: 'Net', num: true, fmt: v => fmtNum(v, 2) }, ...pcols, { key: 'ssira', label: 'Şube sıra', num: true, sortVal: x => x.ssira ?? 1e9, fmt: v => v ?? '–' },
  ], rows, { sortKey: 'sira', onRow: x => studentDetail(exam, r, x.o, host) });
  if (r.netSiralama) { const p = document.createElement('p'); p.className = 'small muted'; p.style.marginTop = '10px'; p.textContent = 'Branş / kısmi deneme: tahmini puan hesaplanmaz (resmî puan için ilgili testlerin tamamı gerekir); sıralama toplam nete göredir.'; body.querySelector('.card').appendChild(p); }
  if (pts.length) { const p = document.createElement('p'); p.className = 'small muted'; p.style.marginTop = '10px'; p.textContent = `Puanlar resmî ağırlıklarla hesaplanmış tahmini puanlardır; sıralama ${ptAd(anaPt(exam, r))} puanına göredir.${hasY ? ' Y- ile başlayan sütunlar diploma notuyla (OBP × 0,12) yerleştirme puanıdır.' : ''} "–" olan puanların nedeni için imleci üzerine getirin.`; body.querySelector('.card').appendChild(p); }
}

async function studentDetail(exam, r, o, host) {
  const letters = LETTERS.slice(0, exam.secenek || 5);
  const res = await modal({
    title: `${o.isim || o.no} · ${exam.isim}`, wide: true,
    content: `<div class="grid g4"><div class="stat brand"><div class="v">${fmtNum(o.puan, 2)}</div><div class="l">${puanEtiket(exam, r)}</div></div><div class="stat"><div class="v">${fmtNum(o.net, 2)}</div><div class="l">net</div></div><div class="stat"><div class="v">${o.rank.kurum.genel ?? '–'}/${r.ogr.size}</div><div class="l">kurum sırası</div></div><div class="stat"><div class="v">${o.rank.sube.genel ?? '–'}</div><div class="l">şube sırası</div></div></div>
      ${(r.puanTurleri || []).length ? `<div class="scroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>Puan türü</th><th class="num">Tahmini puan</th>${r.tpl.id !== 'LGS' ? '<th class="num">Yerleştirme (OBP ile)</th>' : ''}<th class="num">Kurum sırası</th><th class="num">Şube sırası</th><th></th></tr></thead><tbody>${r.puanTurleri.map(pt => `<tr><td><b>${esc(ptAd(pt))}</b></td><td class="num">${fmtNum(o.puanlar[pt], 3)}</td>${r.tpl.id !== 'LGS' ? `<td class="num">${fmtNum(o.yPuanlar[pt], 3)}</td>` : ''}<td class="num">${o.rank.pt.kurum[pt] ?? '–'}</td><td class="num">${o.rank.pt.sube[pt] ?? '–'}</td><td class="small muted">${esc(o.puanAciklama[pt] || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="scroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>Ders</th><th class="num">D</th><th class="num">Y</th><th class="num">B</th><th class="num">Net</th><th class="num">Kurum ort.</th></tr></thead><tbody>${r.dersler.map(d => `<tr><td>${esc(d)}</td><td class="num">${o.ders[d].D}</td><td class="num">${o.ders[d].Y}</td><td class="num">${o.ders[d].B}</td><td class="num"><b>${fmtNum(o.ders[d].Net, 2)}</b></td><td class="num">${fmtNum(r.kurum.dersNetOrt[d], 2)}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:16px">Cevaplar <span class="small muted">(düzeltmek için seçin)</span></h3>
      ${r.dersler.map(d => `<div style="margin:6px 0"><b class="small">${esc(d)}</b><div class="row gap-s" style="margin-top:4px">${o.items.filter(it => it.grup === d).map(it => `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 4px;border-radius:6px;background:${it.durum === 'D' ? 'var(--lv4)' : it.durum === 'Y' ? 'var(--lv1)' : it.durum === 'X' ? 'transparent;opacity:.45' : 'var(--panel2)'}"><span class="small muted" style="width:18px;text-align:right">${r.soruIst[it.i].dersNo}</span><select data-i="${it.i}" style="width:52px;min-height:28px;padding:1px 4px;font-size:13px">${[' ', ...letters, '*'].map(L => `<option value="${L}" ${(exam.sonuclar[o.no].cevaplar[it.i] || ' ') === L ? 'selected' : ''}>${L === ' ' ? '–' : L === '*' ? '✱' : L}</option>`).join('')}</select></span>`).join('')}</div></div>`).join('')}`,
    buttons: [{ label: 'Sonucu sil', value: 'del', cls: 'danger' }, { label: 'Analiz', value: 'an', cls: '' }, { label: 'Karne', value: 'karne', cls: '' }, { label: 'Kapat', value: null }],
    onMount: m => $$('select[data-i]', m).forEach(s => s.addEventListener('change', async () => {
      const rec = exam.sonuclar[o.no]; const i = +s.dataset.i; const a = (rec.cevaplar || '').padEnd(exam.sorular.length, ' ');
      rec.cevaplar = a.slice(0, i) + s.value + a.slice(i + 1); touch(exam); await saveExam(exam); toast('Cevap güncellendi.');
    })),
  });
  if (res === 'del') {
    if (!await confirmDlg(`${o.isim || o.no} bu sınavdan çıkarılacak.`, { ok: 'Çıkar', danger: true })) return;
    delete exam.sonuclar[o.no]; touch(exam); await saveExam(exam); toast('Sonuç silindi.');
  } else if (res === 'an') { go('analiz', { tip: 'ogrenci', deger: o.no }); return; }
  else if (res === 'karne') {
    const pg = progress('Karne hazırlanıyor');
    let pdf; try { pdf = await denemeKarneleri(exam, [o.no], ev.karne); } finally { pg.close(); }
    await resultsDialog('Karne hazır', [pdfFile('Deneme analiz karnesi', `${exam.isim}_${o.isim || o.no}_karne`, pdf)]);
  }
  render(host);
}

function tabDers(body, exam, r) {
  const subeler = Object.keys(r.subeOrt).sort(cmpTr);
  body.innerHTML = `<div class="card"><h3>Ders ortalamaları (net)</h3><div class="scroll"><table class="tbl"><thead><tr><th>Ders</th><th class="num">Soru</th><th class="num">Kurum</th>${subeler.map(s => `<th class="num">${esc(s || 'Şubesiz')}</th>`).join('')}</tr></thead><tbody>
    ${r.dersler.map(d => `<tr><td>${esc(d)}</td><td class="num">${exam.sorular.filter(s => s.ders === d).length}</td><td class="num"><b>${fmtNum(r.kurum.dersNetOrt[d], 2)}</b></td>${subeler.map(s => `<td class="num">${fmtNum(r.subeOrt[s].dersNetOrt[d], 2)}</td>`).join('')}</tr>`).join('')}
    <tr><td><b>Toplam net</b></td><td class="num">${exam.sorular.length}</td><td class="num"><b>${fmtNum(r.kurum.netOrt, 2)}</b></td>${subeler.map(s => `<td class="num">${fmtNum(r.subeOrt[s].netOrt, 2)}</td>`).join('')}</tr>
    <tr><td><b>Ortalama puan</b></td><td></td><td class="num"><b>${fmtNum(r.kurum.puanOrt, 2)}</b></td>${subeler.map(s => `<td class="num">${fmtNum(r.subeOrt[s].puanOrt, 2)}</td>`).join('')}</tr>
    <tr><td class="muted">Öğrenci</td><td></td><td class="num">${r.ogr.size}</td>${subeler.map(s => `<td class="num">${r.subeOrt[s].n}</td>`).join('')}</tr>
    </tbody></table></div></div>`;
}

function tabMadde(body, exam, r) {
  const letters = LETTERS.slice(0, exam.secenek || 5);
  const dist = r.soruIst.map(s => { const c = {}; for (const o of r.ogr.values()) { const a = o.items[s.i].cevap || '-'; c[a] = (c[a] || 0) + 1; } return c; });
  body.innerHTML = `<div class="card"><p class="muted small" style="margin-top:0">Her sorunun doğru oranı ve şıkların dağılımı. Doğru oranı çok düşük ve tek bir yanlış şıkta toplanmış sorular, cevap anahtarı hatası olabilir.</p>
  <div class="tbl-box"><table class="tbl"><thead><tr><th>Soru</th><th>Konu</th><th class="num">Zorluk</th><th class="num">Cevap</th><th class="num">D</th><th class="num">Y</th><th class="num">B</th><th class="num">Doğru oranı</th>${letters.map(L => `<th class="num">${L}</th>`).join('')}<th></th></tr></thead><tbody>
  ${r.soruIst.map((s, i) => { const n = r.ogr.size || 1; const top = letters.filter(L => L !== s.cevap).sort((a, b) => (dist[i][b] || 0) - (dist[i][a] || 0))[0]; const susp = s.oran < 0.25 && (dist[i][top] || 0) / n > 0.45; return `<tr class="${susp ? 'lv2' : ''}"><td>${esc(s.etiket)}</td><td>${esc(s.konu)}</td><td class="num">${esc(s.zorluk)}</td><td class="num"><b>${s.iptal ? 'iptal' : esc(s.cevap || '?')}</b></td><td class="num">${s.D}</td><td class="num">${s.Y}</td><td class="num">${s.B}</td><td class="num">${fmtPct(s.oran)}</td>${letters.map(L => `<td class="num" style="${L === s.cevap ? 'font-weight:700;color:var(--ok)' : ''}">${dist[i][L] || 0}</td>`).join('')}<td>${susp ? '<span class="pill warn" title="Cevap anahtarını kontrol edin">kontrol</span>' : ''}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}

function tplInfo(exam, r) {
  const t = r.tpl;
  return `<div class="banner" style="border-left-color:var(--brand);display:block"><b>${esc(t.uzun)}</b><br><span class="small">${t.secenek} şık · ${t.yanlisOrani === 0.25 ? '4' : '3'} yanlış 1 doğruyu götürür · puanlar ${t.id === 'LGS' ? 'MEB' : 'ÖSYM'} ağırlıklarıyla hesaplanan tahmini puandır. Ağırlıklar <a href="#ayarlar">Ayarlar</a> sayfasında listelenir.</span></div>
    ${t.tytGerekli ? `<label class="fld"><span>TYT eşleştirmesi <small>(${t.id === 'YDT' ? 'DİL' : 'SAY, EA, SÖZ'} puanının %40'ı TYT netlerinden gelir)</small></span><select id="e-tyt"><option value="">Eşleştirme yok</option>${[...state.exams.values()].filter(e => e.tur === 'TYT').sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(e => `<option value="${esc(e.id)}" ${exam.tytExamId === e.id ? 'selected' : ''}>${esc(e.isim)} · ${fmtDate(e.tarih)}</option>`).join('')}</select></label>` : ''}
    ${r.kismi ? `<p class="small muted" style="margin:0">Bu bir branş / kısmi deneme. ${r.netSiralama ? 'Puan için gereken testlerin tamamı olmadığından sonuçlar nete göre sıralanır.' : 'Yalnızca bütün testleri bulunan puan türleri hesaplanır.'}</p>` : ''}
    ${r.puanTurleri.length > 1 ? `<label class="fld"><span>Sıralama puan türü</span><select id="e-sira">${r.puanTurleri.map(pt => `<option value="${pt}" ${anaPt(exam, r) === pt ? 'selected' : ''}>${esc(PUAN_TURLERI[pt].uzun || pt)}</option>`).join('')}</select></label>` : ''}`;
}

function tabEdit(body, exam, r, host) {
  const p = exam.puanlama || puanlamaSnapshot();
  const letters = LETTERS.slice(0, exam.secenek || 5);
  body.innerHTML = `<div class="grid g2">
    <div class="card"><h3>Sınav bilgileri</h3><div class="stack">
      <label class="fld"><span>Sınav adı</span><input id="e-n" value="${esc(exam.isim)}"></label>
      <label class="fld"><span>Tarih</span><input id="e-t" type="date" value="${esc(exam.tarih)}"></label>
      ${r.tpl ? tplInfo(exam, r) : ''}
      <div class="form-grid ${r.tpl ? 'hide' : ''}"><label class="fld"><span>Taban puan</span><input id="e-tb" type="number" value="${p.taban}"></label>
      <label class="fld"><span>Yanlış götürme</span><select id="e-yo"><option value="0.3333333333333333" ${Math.abs(p.yanlisOrani - 1 / 3) < 1e-6 ? 'selected' : ''}>3 yanlış 1 doğru</option><option value="0.25" ${p.yanlisOrani === 0.25 ? 'selected' : ''}>4 yanlış 1 doğru</option><option value="0" ${p.yanlisOrani === 0 ? 'selected' : ''}>Götürmez</option></select></label>
      </div>
      <label class="fld"><span>Birden fazla işaretlenen soru</span><select id="e-ci"><option value="yanlis" ${p.cokluIsaret === 'yanlis' ? 'selected' : ''}>Yanlış sayılır</option><option value="bos" ${p.cokluIsaret === 'bos' ? 'selected' : ''}>Boş sayılır</option></select></label>
      <div class="fld ${r.tpl ? 'hide' : ''}"><span>Ders katsayıları</span><div class="form-grid">${r.dersler.map(d => `<label class="fld"><small>${esc(d)}</small><input type="number" step="0.1" data-k="${esc(d)}" value="${p.katsayilar[d] ?? 1}"></label>`).join('')}</div></div>
      <div class="row gap"><button class="btn primary" id="e-save">Kaydet ve yeniden hesapla</button><button class="btn danger" id="e-del">Sınavı sil</button></div>
    </div></div>
    <div class="card"><h3>Cevap anahtarı</h3><p class="small muted" style="margin-top:0">Anahtarı değiştirince tüm sonuçlar yeniden hesaplanır. ÖSYM ve MEB kuralı gereği iptal edilen soru <b>değerlendirme dışı</b> bırakılır; test kalan sorular üzerinden puanlanır.</p>
      <div class="tbl-box"><table class="tbl"><thead><tr><th>Soru</th><th>Konu</th><th>Cevap</th><th>İptal</th></tr></thead><tbody>
      ${exam.sorular.map((s, i) => `<tr><td>${esc(r.soruIst[i].etiket)}</td><td class="small">${esc(s.konu)}</td><td><select data-c="${i}" style="width:70px">${['', ...letters].map(L => `<option value="${L}" ${String(s.cevap || '').toUpperCase() === L ? 'selected' : ''}>${L || '?'}</option>`).join('')}</select></td><td><input type="checkbox" data-ip="${i}" ${s.iptal ? 'checked' : ''} aria-label="İptal"></td></tr>`).join('')}
      </tbody></table></div></div></div>`;
  $$('select[data-c]', body).forEach(s => s.addEventListener('change', guard(async () => { exam.sorular[+s.dataset.c].cevap = s.value; touch(exam); await saveExam(exam); toast('Cevap anahtarı güncellendi.'); })));
  $$('input[data-ip]', body).forEach(c => c.addEventListener('change', guard(async () => { exam.sorular[+c.dataset.ip].iptal = c.checked; touch(exam); await saveExam(exam); toast(c.checked ? 'Soru değerlendirme dışı bırakıldı.' : 'İptal kaldırıldı.'); })));
  $('#e-save', body).addEventListener('click', guard(async () => {
    exam.isim = $('#e-n', body).value.trim() || exam.isim; exam.tarih = $('#e-t', body).value || exam.tarih;
    const kat = { ...p.katsayilar }; $$('[data-k]', body).forEach(i => { kat[i.dataset.k] = Number(i.value); });
    exam.puanlama = { taban: Number($('#e-tb', body).value) || 0, yanlisOrani: Number($('#e-yo', body).value), cokluIsaret: $('#e-ci', body).value, katsayilar: kat };
    const ty = $('#e-tyt', body); if (ty) exam.tytExamId = ty.value || null;
    const sr = $('#e-sira', body); if (sr) exam.siralama = sr.value;
    touch(exam); await saveExam(exam); toast('Sınav güncellendi.'); render(host);
  }));
  $('#e-del', body).addEventListener('click', guard(async () => {
    if (!await confirmDlg(`"${exam.isim}" ve ${Object.keys(exam.sonuclar).length} öğrencinin sonucu silinecek. Geri alınamaz.`, { ok: 'Sınavı sil', danger: true })) return;
    await deleteExam(exam.id); ev.open = null; toast('Sınav silindi.'); render(host);
  }));
}

async function karneDialog(exam, subeler) {
  const r = evaluateExam(exam);
  const res = await modal({
    title: 'Karneler ve listeler', wide: true,
    content: `<div class="grid g2"><div><h3>Deneme analiz karnesi</h3>
      <label class="fld"><span>Kimler için?</span><select id="k-s"><option value="__all">Tüm öğrenciler (${r.ogr.size})</option>${subeler.map(s => `<option value="${esc(s)}">${esc(s || 'Şubesiz')} (${[...r.ogr.values()].filter(o => (o.sube || '') === s).length})</option>`).join('')}</select></label>
      <div class="stack" style="margin-top:10px">${KARNE_OPTS.map(([k, l]) => `<label class="check"><input type="checkbox" data-o="${k}" ${ev.karne[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
      <div><h3>Sıralı listeler</h3><p class="small muted">Kurum listesi ve her şubenin listesi; Excel için CSV ve yazdırmak için PDF. Başlıklar eski programla aynıdır.</p>
      <div class="stack"><button class="btn" id="k-list">Sıralı listeleri hazırla</button></div></div></div>`,
    buttons: [{ label: 'Kapat', value: null }, { label: 'Karneleri hazırla', value: m => { $$('[data-o]', m).forEach(c => { ev.karne[c.dataset.o] = c.checked; }); return { s: $('#k-s', m).value }; } }],
    onMount: (m, close) => $('#k-list', m).addEventListener('click', guard(async () => {
      close(null);
      const pg = progress('Listeler hazırlanıyor');
      try {
        const files = [csvFile('Kurum sıralı liste (CSV)', `${exam.isim}_kurum_sirali_liste`, siraliListeRows(exam)), pdfFile('Kurum sıralı liste (PDF)', `${exam.isim}_kurum_sirali_liste`, await siraliListePdf(exam))];
        const zipE = [];
        for (const s of subeler) {
          zipE.push({ name: safeFile(`${s || 'subesiz'}_${exam.isim}`) + '.csv', data: new Blob([toCsvText(siraliListeRows(exam, s))]) });
          zipE.push({ name: safeFile(`${s || 'subesiz'}_${exam.isim}`) + '.pdf', data: await siraliListePdf(exam, s) });
        }
        files.push({ label: 'Şube listeleri (ZIP: CSV + PDF)', filename: safeFile(exam.isim) + '_sube_listeleri.zip', data: await zipFiles(zipE), mime: 'application/zip' });
        pg.close();
        await resultsDialog('Sıralı listeler hazır', files);
      } finally { pg.close(); }
    })),
  });
  if (!res) return;
  const nos = [...r.ogr.values()].filter(o => res.s === '__all' || (o.sube || '') === res.s).map(o => o.no);
  if (!Object.values(ev.karne).some(Boolean)) { await alertDlg('En az bir bölüm seçin.'); return; }
  const pg = progress('Karneler hazırlanıyor');
  let pdf;
  try { pdf = await denemeKarneleri(exam, nos, ev.karne, (f, t) => pg.set(f, t)); } finally { pg.close(); }
  await resultsDialog('Karneler hazır', [pdfFile(`${nos.length} öğrencinin karnesi (tek PDF)`, `${exam.isim}_${res.s === '__all' ? 'tum' : res.s}_karneler_${stamp()}`, pdf)]);
}

function toCsvText(rows) { return toCSV(rows); }

export { getStudent, subeList, saveStudents, normNo };
