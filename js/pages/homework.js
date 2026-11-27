import { state, dersList, subeList, sortDersler, deleteDoc, markSeen, saveDoc } from '../db.js';
import { esc, $, $$, cmpTr, trLower, debounce, fmtDate, fmtPct, todayISO, safeFile, stamp, LETTERS } from '../util.js';
import { modal, confirmDlg, toast, progress, emptyState, guard, optionList, alertDlg } from '../ui.js';
import { publishDialog } from '../online.js';
import { poolFor, availableCount, selectQuestions, autoPlan, selectAuto, makeBooklet, resultsDialog, pdfFile, csvFile, zipFiles, recordDoc, mergePdfs, buildAnswerKeyPdf, keyToCsvRows } from '../generate.js';
import { formSpecFromQuestions, buildFormsPdf } from '../omr.js';
import { SABLONLAR, sablon, sablonlarFor } from '../sinavlar.js';
import { makeTemplateSections } from '../layout.js';
import { takeParams, go } from '../app.js';

const hv = {
  mode: 'manuel', students: new Set(), q: '', sube: '',
  rows: [], autoRows: [], add: { ders: '', konu: '', zorluk: '' },
  tur: 'odev', ayri: true, filtre: 'hepsi', byKonu: true, byZorluk: false, tries: 3, title: '', tamamla: false, bosForm: 5, kisiselForm: true,
  sablon: undefined, slotRows: {}, testSec: {}, kismi: false, kSec: {}, kilit: true, titleAuto: true,
};

export async function render(host) {
  const p = takeParams('hazirla');
  if (p.students) { hv.students = new Set(p.students); }
  if (p.rows) { hv.rows = p.rows; hv.mode = 'manuel'; }
  if (p.tur) hv.tur = p.tur;
  if (p.mode) hv.mode = p.mode;
  if (p.title) hv.title = p.title;
  host.innerHTML = `
  <div class="page-head"><div><h1>Ödev ve Deneme</h1><p>Program, seçtiğiniz öğrencilerin daha önce görmediği soruları seçer; başka öğrencilerin görüp bu öğrencilerin görmediği sorulara öncelik vererek bankayı verimli kullanır.</p></div></div>
  <div class="tabs">
    <button data-m="manuel" class="${hv.mode === 'manuel' ? 'on' : ''}">Elle seçim</button>
    <button data-m="otomatik" class="${hv.mode === 'otomatik' ? 'on' : ''}">Otomatik ödev (zayıf konular)</button>
    <button data-m="belgeler" class="${hv.mode === 'belgeler' ? 'on' : ''}">Hazırlanan belgeler <span class="pill">${state.docs.size}</span></button>
  </div>
  <div id="h-body"></div>`;
  $$('.tabs button', host).forEach(b => b.addEventListener('click', () => { hv.mode = b.dataset.m; render(host); }));
  const body = $('#h-body', host);
  if (hv.mode === 'belgeler') return renderDocs(body, host);
  if (!state.questions.size) {
    body.innerHTML = `<div class="card">${emptyState('Önce soru bankası gerekli', 'Ödev ve deneme, soru bankanızdaki sorulardan hazırlanır.', '<a class="btn primary" href="#kirp">Soru ekle</a><a class="btn" href="#rehber">Rehber</a>')}</div>`;
    return;
  }
  body.innerHTML = `<div class="split"><aside class="card" id="h-stu"></aside><section id="h-main"></section></div>`;
  renderStudents($('#h-stu', body), host);
  if (hv.mode === 'manuel') renderManual($('#h-main', body), host); else renderAuto($('#h-main', body), host);
}

// ---------------- Öğrenci seçimi ----------------
function renderStudents(box, host) {
  const subeler = subeList();
  const q = trLower(hv.q);
  const list = [...state.students.values()].filter(s => (!hv.sube || s.sube === hv.sube) && (!q || trLower(s.isim).includes(q) || s.no.includes(q))).sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.isim, b.isim));
  box.innerHTML = `<div class="row between"><h3>Öğrenciler</h3><span class="pill">${hv.students.size} seçili</span></div>
    ${!state.students.size ? `<p class="small muted">Kayıtlı öğrenci yok. Öğrenci seçmeden de belge hazırlayabilirsiniz; bu durumda görülen soru takibi yapılmaz. <a href="#ogrenciler">Öğrenci ekle</a></p>` : `
    <input id="hs-q" placeholder="Ara" value="${esc(hv.q)}" style="margin:6px 0 8px">
    <div class="chips" style="margin-bottom:8px">${subeler.map(s => `<button class="btn sm" data-sb="${esc(s)}">${esc(s)}</button>`).join('')}<button class="btn sm ghost" id="hs-none">Temizle</button></div>
    <div class="list" style="max-height:420px">${list.map(s => `<label class="it ${hv.students.has(s.no) ? 'on' : ''}"><input type="checkbox" data-no="${esc(s.no)}" ${hv.students.has(s.no) ? 'checked' : ''}><span class="grow">${esc(s.isim || '(adsız)')}<br><span class="small muted">${esc(s.no)} · ${esc(s.sube || '-')}</span></span><span class="small muted" title="Gördüğü soru">${Object.keys(s.gorulen || {}).length}</span></label>`).join('') || '<p class="muted small" style="padding:10px">Eşleşen öğrenci yok.</p>'}</div>
    <p class="small muted" style="margin-top:8px">Şube düğmesi o şubenin tamamını seçer ya da seçimi kaldırır.</p>`}`;
  const qi = $('#hs-q', box);
  if (qi) qi.addEventListener('input', debounce(e => { hv.q = e.target.value; renderStudents(box, host); const n = $('#hs-q', box); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
  $$('[data-sb]', box).forEach(b => b.addEventListener('click', () => {
    const nos = [...state.students.values()].filter(s => s.sube === b.dataset.sb).map(s => s.no);
    const all = nos.every(n => hv.students.has(n));
    nos.forEach(n => all ? hv.students.delete(n) : hv.students.add(n));
    render(host);
  }));
  const none = $('#hs-none', box); if (none) none.addEventListener('click', () => { hv.students.clear(); render(host); });
  $$('input[data-no]', box).forEach(c => c.addEventListener('change', () => { if (c.checked) hv.students.add(c.dataset.no); else hv.students.delete(c.dataset.no); render(host); }));
}

// ---------------- Elle seçim ----------------
function renderManual(main, host) {
  const nos = [...hv.students];
  const separate = hv.tur === 'odev' && hv.ayri && nos.length > 1;
  const dl = sortDersler([...new Set([...state.questions.values()].map(q => q.ders))]);
  if (!hv.add.ders || !dl.includes(hv.add.ders)) hv.add.ders = dl[0] || '';
  const kl = [...new Set(poolFor(hv.add.ders, '', '').map(q => q.konu))].sort(cmpTr);
  if (hv.add.konu && !kl.includes(hv.add.konu)) hv.add.konu = '';
  const addPool = poolFor(hv.add.ders, hv.add.konu, hv.add.zorluk, hv.filtre).length;
  if (hv.sablon === undefined) hv.sablon = state.settings.kurumTuru === 'lise' ? 'TYT' : 'LGS';
  const total = useTpl() ? tplTotal() : hv.rows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  if (useTpl() && hv.titleAuto !== false) hv.title = tplAutoTitle();
  if (!hv.title) hv.title = hv.tur === 'deneme' ? (useTpl() ? `${hv.sablon} Denemesi` : 'Deneme Sınavı') : `Ödev ${fmtDate(todayISO())}`;
  main.innerHTML = `
  <div class="card">
    <div class="row between gap"><div class="seg" id="h-tur"><button data-t="odev" class="${hv.tur === 'odev' ? 'on' : ''}">Ödev</button><button data-t="deneme" class="${hv.tur === 'deneme' ? 'on' : ''}">Deneme sınavı</button></div>
    <label class="fld" style="flex:1;min-width:200px"><span>Belge başlığı</span><input id="h-title" value="${esc(hv.title)}"></label></div>
    ${hv.tur === 'deneme' ? `<label class="fld" style="margin-top:12px;max-width:420px"><span>Sınav türü</span><select id="h-sab"><option value="">Serbest dağılım (ders ve soru sayısını siz belirlersiniz)</option>${sablonlarFor(state.settings.kurumTuru || 'karma').map(t => `<option value="${t.id}" ${hv.sablon === t.id ? 'selected' : ''}>${esc(t.uzun)}</option>`).join('')}</select></label>` : ''}
    <p class="small muted" style="margin:10px 0 0">${hv.tur === 'odev' ? 'Ödevde sorular konu başlıklarıyla gruplanır; cevap anahtarı ayrı dosya olarak verilir.' : useTpl() ? 'Soru sayıları, test sırası, şık sayısı ve puanlama resmî sınavla birebir aynıdır. Her testteki soruların hangi konulardan geleceğini aşağıdan seçin.' : 'Denemede herkes aynı kitapçığı alır. Kişiye özel optik formlar ve cevap anahtarı birlikte üretilir; sonra formları okutup sınavı değerlendirebilirsiniz.'}</p>
  </div>
  ${useTpl() ? tplCard(nos) : `<div class="card">
    <h3>Soru dağılımı</h3>
    <div class="row gap" style="align-items:flex-end">
      <label class="fld" style="flex:1;min-width:150px"><span>Ders</span><select id="a-d">${optionList(dl, hv.add.ders)}</select></label>
      <label class="fld" style="flex:1.4;min-width:170px"><span>Konu</span><select id="a-k">${optionList(kl, hv.add.konu, { empty: 'Tüm konular' })}</select></label>
      <label class="fld" style="width:130px"><span>Zorluk</span><select id="a-z"><option value="">Tümü</option>${[1, 2, 3, 4, 5].map(z => `<option ${String(z) === hv.add.zorluk ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <button class="btn" id="a-add">Ekle <span class="muted small">(${addPool})</span></button>
    </div>
    ${hv.rows.length ? `<div class="scroll" style="margin-top:12px"><table class="tbl"><thead><tr><th>Ders</th><th>Konu</th><th>Zorluk</th><th class="num">Yanlış</th><th class="num" title="Seçili öğrencilerin görmediği soru sayısı">Kullanılabilir</th><th class="num">Verilecek</th><th></th></tr></thead><tbody>
      ${hv.rows.map((r, i) => { const av = availableCount(r, nos, hv.filtre, separate); return `<tr><td>${esc(r.ders)}</td><td>${esc(r.konu || 'Tüm konular')}</td><td>${esc(r.zorluk || 'Tümü')}</td><td class="num">${r.yanlis ?? '-'}</td><td class="num ${av < (Number(r.count) || 0) ? 'lv1' : ''}">${av}</td><td class="num"><input type="number" min="0" data-c="${i}" value="${esc(r.count)}"></td><td><button class="icon-btn" data-rm="${i}" aria-label="Satırı sil">✕</button></td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="5" class="num"><b>Toplam</b></td><td class="num"><b>${total}</b></td><td></td></tr></tfoot></table></div>
      <div class="row gap" style="margin-top:8px"><button class="btn sm ghost" id="r-clear">Tabloyu temizle</button></div>` : `<p class="muted small" style="margin-top:12px">Ders, konu ve zorluk seçip satır ekleyin. Seviye Analizi sayfasından "Bu analizden ödev hazırla" derseniz tablo öğrencinin yanlışlarına göre dolar.</p>`}
  </div>`}
  <div class="card">
    <h3>Seçenekler</h3>
    <div class="form-grid">
      <label class="fld"><span>Soru havuzu</span><select id="o-f"><option value="hepsi" ${hv.filtre === 'hepsi' ? 'selected' : ''}>Bütün sorular</option><option value="analiz" ${hv.filtre === 'analiz' ? 'selected' : ''}>Yalnızca zorluğu analiz edilenler</option><option value="analizsiz" ${hv.filtre === 'analizsiz' ? 'selected' : ''}>Yalnızca analiz edilmeyenler</option></select></label>
      <label class="fld ${useTpl() ? 'hide' : ''}"><span>Bölümleme</span><select id="o-b"><option value="ders" ${!hv.byKonu ? 'selected' : ''}>Derse göre</option><option value="konu" ${hv.byKonu && !hv.byZorluk ? 'selected' : ''}>Ders › konu</option><option value="zorluk" ${hv.byZorluk ? 'selected' : ''}>Ders › konu › zorluk</option></select></label>
      <label class="fld"><span>Sayfa optimizasyonu <small>(deneme sayısı)</small></span><input id="o-t" type="number" min="1" max="20" value="${hv.tries}"></label>
    </div>
    <div class="stack" style="margin-top:12px">
      ${hv.tur === 'odev' ? `<label class="check"><input type="checkbox" id="o-a" ${hv.ayri ? 'checked' : ''}> Her öğrenciye ayrı ödev hazırla (her biri kendi görmediği sorulardan)</label>` : `
      <label class="check"><input type="checkbox" id="o-kf" ${hv.kisiselForm ? 'checked' : ''}> Seçili öğrencilere adı ve numarası basılı optik form üret</label>
      <label class="row gap-s small">Ek boş form sayısı <input id="o-bf" type="number" min="0" max="200" value="${hv.bosForm}" style="width:90px"></label>`}
      <label class="check"><input type="checkbox" id="o-tm" ${hv.tamamla ? 'checked' : ''}> Yeterli yeni soru yoksa daha önce görülen sorularla tamamla</label>
    </div>
    <div class="row between gap" style="margin-top:16px">
      <span class="small muted">${nos.length ? `${nos.length} öğrenci seçili${separate ? ' · her birine ayrı belge' : ''}` : 'Öğrenci seçilmedi: görülen soru takibi yapılmayacak'}</span>
      <button class="btn primary" id="h-go" ${total ? '' : 'disabled'}>${hv.tur === 'deneme' ? 'Denemeyi hazırla' : 'Ödevi hazırla'}</button>
    </div>
  </div>`;
  $$('#h-tur button', main).forEach(b => b.addEventListener('click', () => { const old = hv.tur; hv.tur = b.dataset.t; if (hv.title === (old === 'deneme' ? 'Deneme Sınavı' : `Ödev ${fmtDate(todayISO())}`)) hv.title = ''; render(host); }));
  $('#h-title', main).addEventListener('input', e => { hv.title = e.target.value; hv.titleAuto = false; });
  const sab = $('#h-sab', main); if (sab) sab.addEventListener('change', () => { hv.sablon = sab.value; hv.titleAuto = true; if (!hv.sablon) hv.title = 'Deneme Sınavı'; render(host); });
  if (useTpl()) bindTpl(main, host);
  else {
  $('#a-d', main).addEventListener('change', e => { hv.add.ders = e.target.value; hv.add.konu = ''; render(host); });
  $('#a-k', main).addEventListener('change', e => { hv.add.konu = e.target.value; render(host); });
  $('#a-z', main).addEventListener('change', e => { hv.add.zorluk = e.target.value; render(host); });
  $('#a-add', main).addEventListener('click', () => {
    const r = { ders: hv.add.ders, konu: hv.add.konu, zorluk: hv.add.zorluk };
    if (hv.rows.some(x => x.ders === r.ders && x.konu === r.konu && x.zorluk === r.zorluk)) { toast('Bu satır zaten tabloda.', 'warn'); return; }
    r.count = Math.min(5, availableCount(r, nos, hv.filtre, separate)) || 0;
    hv.rows.push(r); render(host);
  });
  $$('input[data-c]', main).forEach(i => i.addEventListener('change', () => { hv.rows[+i.dataset.c].count = Math.max(0, +i.value || 0); render(host); }));
  $$('[data-rm]', main).forEach(b => b.addEventListener('click', () => { hv.rows.splice(+b.dataset.rm, 1); render(host); }));
  const rc = $('#r-clear', main); if (rc) rc.addEventListener('click', () => { hv.rows = []; render(host); });
  }
  $('#o-f', main).addEventListener('change', e => { hv.filtre = e.target.value; render(host); });
  $('#o-b', main).addEventListener('change', e => { hv.byKonu = e.target.value !== 'ders'; hv.byZorluk = e.target.value === 'zorluk'; });
  $('#o-t', main).addEventListener('change', e => { hv.tries = Math.max(1, Math.min(20, +e.target.value || 1)); });
  const oa = $('#o-a', main); if (oa) oa.addEventListener('change', e => { hv.ayri = e.target.checked; render(host); });
  const kf = $('#o-kf', main); if (kf) kf.addEventListener('change', e => { hv.kisiselForm = e.target.checked; });
  const bf = $('#o-bf', main); if (bf) bf.addEventListener('change', e => { hv.bosForm = Math.max(0, +e.target.value || 0); });
  $('#o-tm', main).addEventListener('change', e => { hv.tamamla = e.target.checked; });
  $('#h-go', main).addEventListener('click', guard(() => generateManual(host)));
}

function stuLabel(no) { const s = state.students.get(no); return s ? `${s.isim || ''} · ${s.no}${s.sube ? ' · ' + s.sube : ''}` : no; }

async function confirmShortage(eksik) {
  if (!eksik.length) return true;
  return await confirmDlg(`Bazı satırlarda yeterli soru yok:\n${eksik.slice(0, 8).map(e => `• ${e.row.ders} › ${e.row.konu || 'tüm konular'}${e.row.zorluk ? ' › Z' + e.row.zorluk : ''}: ${e.istenen} istendi, ${e.bulunan} bulundu`).join('\n')}${eksik.length > 8 ? `\n… ve ${eksik.length - 8} satır daha` : ''}\n\nBulunan sorularla devam edilsin mi?`, { title: 'Soru sayısı yetersiz', ok: 'Devam et' });
}

async function generateManual(host) {
  if (useTpl()) return generateTemplate(host);
  const nos = [...hv.students];
  const rows = hv.rows.filter(r => Number(r.count) > 0);
  const title = (hv.title || '').trim() || (hv.tur === 'deneme' ? 'Deneme Sınavı' : 'Ödev');
  const separate = hv.tur === 'odev' && hv.ayri && nos.length > 1;
  const opts = { byKonu: hv.byKonu, byZorluk: hv.byZorluk, tries: hv.tries };
  if (separate) {
    const plans = nos.map(no => ({ no, ...selectQuestions(rows, [no], { filtre: hv.filtre, tamamla: hv.tamamla }) }));
    const eksik = plans.flatMap(p => p.eksik.map(e => ({ ...e, row: { ...e.row, ders: `${stuLabel(p.no)}: ${e.row.ders}` } })));
    if (!await confirmShortage(eksik)) return;
    if (plans.every(p => !p.picked.length)) { await alertDlg('Seçilebilecek soru bulunamadı.'); return; }
    const pg = progress('Ödevler hazırlanıyor');
    const pdfs = [], keys = [], zipE = [];
    try {
      for (let i = 0; i < plans.length; i++) {
        const p = plans[i];
        if (!p.picked.length) continue;
        const lbl = stuLabel(p.no);
        const r = await makeBooklet({ questions: p.picked, title, ogrenci: lbl, ...opts, onProgress: (f, t) => pg.set((i + f) / plans.length, `${lbl} · ${t}`) });
        const kp = await buildAnswerKeyPdf(title, r.key, { ogrenci: lbl });
        pdfs.push(r.pdf); keys.push(kp);
        const fn = safeFile(`${title}_${state.students.get(p.no)?.isim || p.no}_${p.no}`);
        zipE.push({ name: fn + '.pdf', data: r.pdf }, { name: fn + '_cevap_anahtari.pdf', data: kp });
        await markSeen([p.no], p.picked.map(q => q.id));
        await recordDoc({ tur: 'odev', isim: title, sorular: r.key, ogrenciler: [p.no] });
      }
      pg.set(1, 'Dosyalar birleştiriliyor');
      const all = await mergePdfs(pdfs), allKeys = await mergePdfs(keys), zip = await zipFiles(zipE);
      pg.close();
      await resultsDialog(`${pdfs.length} ödev hazır`, [
        pdfFile('Tüm ödevler (tek PDF, yazdırmak için)', `${title}_tum_ogrenciler`, all),
        pdfFile('Tüm cevap anahtarları', `${title}_cevap_anahtarlari`, allKeys),
        { label: 'Her öğrenci ayrı dosya (ZIP)', filename: safeFile(title) + '_ayri.zip', data: zip, mime: 'application/zip' },
      ], `<p class="muted" style="margin-top:0">Sorular öğrencilerin geçmişine eklendi; bir sonraki ödevde tekrar verilmeyecek.</p>`);
    } finally { pg.close(); }
    render(host);
    return;
  }
  const { picked, eksik } = selectQuestions(rows, nos, { filtre: hv.filtre, tamamla: hv.tamamla });
  if (!picked.length) { await alertDlg('Seçilebilecek soru bulunamadı. Öğrenciler bu soruların hepsini görmüş olabilir; "daha önce görülenlerle tamamla" seçeneğini deneyin.'); return; }
  if (!await confirmShortage(eksik)) return;
  if (hv.tur === 'deneme') {
    const noCevap = picked.filter(q => !q.cevap).length;
    if (noCevap && !await confirmDlg(`${noCevap} sorunun doğru cevabı tanımlı değil. Bu sorular cevap anahtarında "?" olur ve değerlendirmede herkes için yanlış sayılır. Devam edilsin mi?`, { ok: 'Devam et' })) return;
  }
  const pg = progress(hv.tur === 'deneme' ? 'Deneme hazırlanıyor' : 'Ödev hazırlanıyor');
  try {
    const ogr = nos.length === 1 ? stuLabel(nos[0]) : '';
    const r = await makeBooklet({ questions: picked, title, ogrenci: ogr, ...opts, onProgress: (f, t) => pg.set(f * 0.75, t) });
    pg.set(0.8, 'Cevap anahtarı');
    const kp = await buildAnswerKeyPdf(title, r.key, { ogrenci: ogr });
    const files = [pdfFile(hv.tur === 'deneme' ? 'Soru kitapçığı' : 'Ödev', title, r.pdf, `${r.pages} sayfa, ${r.key.length} soru`), pdfFile('Cevap anahtarı', `${title}_cevap_anahtari`, kp), csvFile('Cevap anahtarı (CSV, Excel)', `${title}_cevap_anahtari`, keyToCsvRows(r.key))];
    let docExtra = {};
    if (hv.tur === 'deneme') {
      pg.set(0.88, 'Optik formlar');
      const spec = formSpecFromQuestions(title, r.key, state.settings.secenekSayisi, state.settings.noHane);
      const people = hv.kisiselForm ? nos.map(no => { const s = state.students.get(no); return { isim: s?.isim || '', no, sube: s?.sube || '' }; }) : [];
      const forms = await buildFormsPdf(spec, people, hv.bosForm || (people.length ? 0 : 1));
      files.push(pdfFile('Optik formlar', `${title}_optik_formlar`, forms, `${people.length} kişiye özel + ${hv.bosForm || (people.length ? 0 : 1)} boş`));
      docExtra = { form: spec, pdf: new Blob([r.pdf], { type: 'application/pdf' }) };
    }
    if (nos.length) await markSeen(nos, picked.map(q => q.id));
    const doc = await recordDoc({ tur: hv.tur, isim: title, sorular: r.key, ogrenciler: nos, ...docExtra });
    pg.close();
    const extra = (hv.tur === 'deneme' ? `<div class="banner" style="border-left-color:var(--brand);margin-top:0"><span>Sınavdan sonra formları tarayın ya da fotoğraflayın; <b>Sınavlar ve Optik</b> sayfasında bu denemeyi seçip okutun.</span><button class="btn sm" id="go-eval">Değerlendirmeye git</button></div>` : '') + `<div class="banner" style="border-left-color:var(--ok);margin-top:0"><span><b>Online da çözülebilir.</b> Yayınlarsanız öğrenciler linkten telefonda ya da bilgisayarda çözer, sonuçlar buraya gelir.</span><button class="btn sm" id="go-online">Online yayınla</button></div>`;
    let wantOnline = false;
    const p = resultsDialog(hv.tur === 'deneme' ? 'Deneme hazır' : 'Ödev hazır', files, extra);
    setTimeout(() => {
      const b = document.getElementById('go-eval'); if (b) b.addEventListener('click', () => { document.querySelector('.modal-back [data-x]')?.click(); go('sinavlar', { yeniDoc: doc.id }); });
      const o = document.getElementById('go-online'); if (o) o.addEventListener('click', () => { wantOnline = true; document.querySelector('.modal-back [data-x]')?.click(); });
    }, 50);
    await p;
    if (wantOnline) await publishDialog(doc);
  } finally { pg.close(); }
  render(host);
}

// ---------------- Sınav şablonu (LGS, TYT, AYT, YDT) ----------------
function useTpl() { return hv.tur === 'deneme' && !!sablon(hv.sablon); }
function tplObj() { return sablon(hv.sablon); }
function kismi() { return !!hv.kismi; }
function testOn(t, test) { const k = t.id + '/' + test.id; if (hv.testSec[k] === undefined) hv.testSec[k] = true; return !t.testSecilebilir || hv.testSec[k]; }
function kKey(t, test, s) { return t.id + '/' + test.id + '/' + s.id; }
function slotOn(t, test, s) {
  if (!kismi()) return testOn(t, test);
  if (s.secmeli === 'ekfel') { const din = test.slots.find(x => x.secmeli === 'din'); return din ? !!hv.kSec[kKey(t, test, din)] : false; }
  return !!hv.kSec[kKey(t, test, s)];
}
function testAny(t, test) { return test.slots.some(s => slotOn(t, test, s)); }
function bankDersler() { return sortDersler([...new Set([...state.questions.values()].map(q => q.ders))]); }
function slotKey(test, s) { return hv.sablon + ':' + test.id + '/' + s.id; }
function rowsFor(test, s) {
  const k = slotKey(test, s);
  if (!hv.slotRows[k]) {
    const bd = bankDersler();
    const ders = s.dersler.find(d => bd.includes(d)) || s.dersler[0];
    hv.slotRows[k] = [{ ders, konu: '', zorluk: '', count: s.n }];
  }
  return hv.slotRows[k];
}
function slotSum(test, s) { return rowsFor(test, s).reduce((a, r) => a + (Number(r.count) || 0), 0); }
function tplTotal() {
  const t = tplObj(); let n = 0;
  for (const test of t.testler) for (const s of test.slots) if (slotOn(t, test, s)) n += slotSum(test, s);
  return n;
}
function tamMi() {
  const t = tplObj();
  if (!kismi()) return t.testler.every(test => testOn(t, test));
  return hv.kilit !== false && t.testler.every(test => test.slots.every(s => slotOn(t, test, s)));
}
function tplAutoTitle() {
  const t = tplObj();
  if (!kismi()) return `${t.ad} Denemesi`;
  const on = []; for (const test of t.testler) for (const s of test.slots) if (s.secmeli !== 'ekfel' && slotOn(t, test, s)) on.push({ test, s });
  if (!on.length) return `${t.ad} Branş Denemesi`;
  if (on.length === 1) return `${t.ad} ${on[0].s.ad} Denemesi`;
  const tests = [...new Set(on.map(x => x.test))];
  if (tests.length === 1 && tests[0].slots.filter(s => s.secmeli !== 'ekfel').every(s => slotOn(t, tests[0], s))) return `${t.ad} ${tests[0].ad} Denemesi`;
  if (t.id === 'LGS' && tests.every(x => x.oturum === tests[0].oturum) && t.testler.filter(x => x.oturum === tests[0].oturum).every(x => tests.includes(x))) return `LGS ${tests[0].oturum} Oturum Denemesi`;
  return `${t.ad} Branş Denemesi`;
}
function tplCard(nos) {
  const t = tplObj();
  const bd = bankDersler();
  const kil = hv.kilit !== false;
  const dersOpts = (s, sel) => { const pri = s.dersler.filter(d => bd.includes(d)); const rest = bd.filter(d => !pri.includes(d)); const miss = s.dersler.filter(d => !bd.includes(d)); return `${pri.map(d => `<option ${d === sel ? 'selected' : ''}>${esc(d)}</option>`).join('')}${miss.map(d => `<option ${d === sel ? 'selected' : ''}>${esc(d)} (bankada yok)</option>`).join('')}${rest.length ? `<optgroup label="Diğer dersler">${rest.map(d => `<option ${d === sel ? 'selected' : ''}>${esc(d)}</option>`).join('')}</optgroup>` : ''}`; };
  let html = `<div class="card"><div class="row between gap"><h3 style="margin:0">${esc(t.uzun)}</h3><span class="pill">${t.secenek} şık · ${t.yanlisOrani === 0.25 ? '4' : '3'} yanlış 1 doğruyu götürür</span></div>
  <div class="row gap" style="margin-top:12px"><div class="seg" id="k-mod"><button data-k="tam" class="${kismi() ? '' : 'on'}">Tam sınav</button><button data-k="kismi" class="${kismi() ? 'on' : ''}">Branş / kısmi deneme</button></div>
  ${kismi() ? `<label class="check"><input type="checkbox" id="k-kil" ${kil ? 'checked' : ''}> Soru sayıları resmî sayıda kalsın</label>` : ''}</div>
  ${kismi() ? `<p class="small muted">İstediğiniz testleri ya da yalnızca bazı dersleri işaretleyin. Şık sayısı, yanlış kuralı ve numaralandırma ${esc(t.ad)} ile aynı olur. Tahmini puan yalnızca puanın gerçekten hesaplanabildiği durumlarda (örneğin AYT'de SAY'ın bütün testleri ya da LGS'nin tamamı) gösterilir; diğer durumlarda sonuçlar net ve doğru oranıyla sıralanır.</p>` : t.testSecilebilir ? `<p class="small muted">Adaylar puan türüne göre testleri seçer. Denemede yer alacak testleri işaretleyin (SAY için Matematik + Fen; EA için Matematik + TDE-Sosyal-1; SÖZ için TDE-Sosyal-1 + Sosyal-2).</p>` : ''}`;
  for (const test of t.testler) {
    const any = testAny(t, test);
    const testN = test.slots.reduce((a, s) => a + s.n, 0);
    const main = test.slots.filter(s => s.secmeli !== 'ekfel');
    const head = kismi()
      ? `<label class="check"><input type="checkbox" data-ktest="${test.id}" ${main.every(s => slotOn(t, test, s)) ? 'checked' : ''}> <b>${esc(test.ad)}</b></label>`
      : t.testSecilebilir ? `<label class="check"><input type="checkbox" data-tsec="${test.id}" ${any ? 'checked' : ''}> <b>${esc(test.ad)}</b></label>` : `<b>${esc(test.ad)}</b>`;
    html += `<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row between gap">${head}<span class="small muted">${test.oturum ? esc(test.oturum) + ' oturum · ' : ''}${testN} soru</span></div>`;
    if (kismi() && main.length > 1) html += `<div class="chips" style="margin-top:6px">${main.map(s => `<label class="check pill" style="padding:5px 10px"><input type="checkbox" data-kslot="${esc(kKey(t, test, s))}" ${slotOn(t, test, s) ? 'checked' : ''}> ${esc(s.ad)} <span class="muted">${s.n}</span></label>`).join('')}</div>`;
    if (any) {
      html += `<div class="scroll"><table class="tbl tpl" style="margin-top:6px"><thead><tr><th style="width:22%">Bölüm</th><th>Ders</th><th>Konu</th><th style="width:76px">Zorluk</th><th class="num" title="Seçili öğrencilerin görmediği soru sayısı">Var</th><th class="num" style="width:70px">Soru</th><th style="width:72px"></th></tr></thead><tbody>`;
      for (const s of test.slots) {
        if (!slotOn(t, test, s)) continue;
        const rows = rowsFor(test, s);
        const sum = slotSum(test, s);
        const okSum = kil ? sum === s.n : sum > 0;
        rows.forEach((r, ri) => {
          const kl = [...new Set(poolFor(r.ders, '', '').map(q => q.konu))].sort(cmpTr);
          const av = availableCount(r, nos, hv.filtre, false);
          const k = slotKey(test, s);
          html += `<tr>${ri === 0 ? `<td rowspan="${rows.length}" style="vertical-align:top"><b>${esc(s.ad)}</b><br><span class="small ${okSum ? '' : 'pill bad'}" style="${okSum ? 'color:var(--ok)' : ''}">${kil ? `${sum}/${s.n}` : `${sum} soru`}</span>${s.secmeli === 'ekfel' ? '<br><span class="small muted">Din muafları cevaplar</span>' : ''}</td>` : ''}
            <td><select data-sk="${esc(k)}" data-ri="${ri}" data-f="ders">${dersOpts(s, r.ders)}</select></td>
            <td><select data-sk="${esc(k)}" data-ri="${ri}" data-f="konu">${optionList(kl, r.konu, { empty: 'Tüm konular' })}</select></td>
            <td><select data-sk="${esc(k)}" data-ri="${ri}" data-f="zorluk"><option value="">Tümü</option>${[1, 2, 3, 4, 5].map(z => `<option ${String(z) === r.zorluk ? 'selected' : ''}>${z}</option>`).join('')}</select></td>
            <td class="num ${av < (Number(r.count) || 0) ? 'lv1' : ''}">${av}</td>
            <td class="num"><input type="number" min="0" max="${kil ? s.n : 200}" data-sk="${esc(k)}" data-ri="${ri}" data-f="count" value="${esc(r.count)}" style="width:62px"></td>
            <td><div class="row gap-s">${ri === rows.length - 1 ? `<button class="icon-btn" data-add="${esc(k)}" title="Bu bölüme başka konu/zorluk satırı ekle" aria-label="Satır ekle">+</button>` : ''}${rows.length > 1 ? `<button class="icon-btn" data-del="${esc(k)}" data-ri="${ri}" aria-label="Satırı sil">✕</button>` : ''}</div></td></tr>`;
        });
      }
      html += `</tbody></table></div>`;
    }
    html += `</div>`;
  }
  const bad = tplProblems();
  html += `<div class="row between gap" style="margin-top:14px"><span class="small ${bad.length ? '' : 'muted'}" style="${bad.length ? 'color:var(--bad)' : ''}">${bad.length ? bad.slice(0, 3).map(esc).join(' · ') + (bad.length > 3 ? ` · +${bad.length - 3}` : '') : kismi() ? (tamMi() ? 'Bütün testler seçili: bu tam sınavla aynı.' : 'Branş / kısmi deneme hazır.') : 'Bütün bölümlerin soru sayısı resmî dağılımla aynı.'}</span><span class="pill">${tplTotal()} soru</span></div></div>`;
  return html;
}
function tplProblems() {
  const t = tplObj(); const out = [];
  const kil = !kismi() || hv.kilit !== false;
  let any = false;
  for (const test of t.testler) for (const s of test.slots) {
    if (!slotOn(t, test, s)) continue; any = true;
    const sum = slotSum(test, s);
    if (kil && sum !== s.n) out.push(`${test.ad} › ${s.ad}: ${sum}/${s.n}`);
    if (!kil && sum < 1) out.push(`${test.ad} › ${s.ad}: en az 1 soru`);
  }
  if (!any) out.push(kismi() ? 'En az bir test ya da ders seçin' : 'En az bir test seçin');
  return out;
}
function bindTpl(main, host) {
  $$('[data-tsec]', main).forEach(c => c.addEventListener('change', () => { hv.testSec[hv.sablon + '/' + c.dataset.tsec] = c.checked; render(host); }));
  $$('#k-mod button', main).forEach(b => b.addEventListener('click', () => { hv.kismi = b.dataset.k === 'kismi'; hv.titleAuto = true; render(host); }));
  const kl = $('#k-kil', main); if (kl) kl.addEventListener('change', () => { hv.kilit = kl.checked; if (kl.checked) { const t = tplObj(); for (const test of t.testler) for (const s of test.slots) if (slotOn(t, test, s) && rowsFor(test, s).length === 1) rowsFor(test, s)[0].count = s.n; } render(host); });
  $$('[data-ktest]', main).forEach(c => c.addEventListener('change', () => { const t = tplObj(); const test = t.testler.find(x => x.id === c.dataset.ktest); test.slots.forEach(s => { if (s.secmeli !== 'ekfel') hv.kSec[kKey(t, test, s)] = c.checked; }); hv.titleAuto = hv.titleAuto !== false; render(host); }));
  $$('[data-kslot]', main).forEach(c => c.addEventListener('change', () => { hv.kSec[c.dataset.kslot] = c.checked; render(host); }));
  $$('[data-sk][data-f]', main).forEach(el => el.addEventListener('change', () => {
    const r = hv.slotRows[el.dataset.sk][+el.dataset.ri];
    if (el.dataset.f === 'ders') { r.ders = el.value.replace(/ \(bankada yok\)$/, ''); r.konu = ''; }
    else if (el.dataset.f === 'count') r.count = Math.max(0, +el.value || 0);
    else r[el.dataset.f] = el.value;
    render(host);
  }));
  $$('[data-add]', main).forEach(b => b.addEventListener('click', () => { const rows = hv.slotRows[b.dataset.add]; const last = rows[rows.length - 1]; rows.push({ ders: last.ders, konu: '', zorluk: '', count: 0 }); render(host); }));
  $$('[data-del]', main).forEach(b => b.addEventListener('click', () => { hv.slotRows[b.dataset.del].splice(+b.dataset.ri, 1); render(host); }));
}

async function generateTemplate(host) {
  const t = tplObj();
  const bad = tplProblems();
  if (bad.length) { await alertDlg((kismi() && hv.kilit === false ? 'Dağılımı tamamlayın:\n' : 'Soru sayıları resmî dağılımla aynı olmalı:\n') + bad.join('\n'), 'Dağılım eksik'); return; }
  const nos = [...hv.students];
  const title = (hv.title || '').trim() || `${t.ad} Denemesi`;
  // Tüm satırlar tek seferde seçilir (aynı soru iki bölüme düşmesin)
  const flat = [];
  for (const test of t.testler) for (const s of test.slots) if (slotOn(t, test, s)) for (const r of rowsFor(test, s)) flat.push({ ...r, _k: test.id + '/' + s.id });
  const { perRow, eksik } = selectQuestions(flat, nos, { filtre: hv.filtre, tamamla: hv.tamamla });
  if (eksik.length) {
    await alertDlg(`Resmî dağılımı tutturmak için bazı bölümlerde yeterli soru yok:\n${eksik.slice(0, 10).map(e => `• ${e.row.ders} › ${e.row.konu || 'tüm konular'}${e.row.zorluk ? ' › Z' + e.row.zorluk : ''}: ${e.istenen} gerekli, ${e.bulunan} var`).join('\n')}\n\nBankaya soru ekleyin, konu ya da zorluğu "Tümü" yapın veya "daha önce görülenlerle tamamla" seçeneğini açın.`, 'Soru yetersiz');
    return;
  }
  const perSlot = {};
  flat.forEach((r, i) => { (perSlot[r._k] = perSlot[r._k] || []).push(...perRow[i]); });
  const picked = Object.values(perSlot).flat();
  const noCevap = picked.filter(q => !q.cevap).length;
  if (noCevap && !await confirmDlg(`${noCevap} sorunun doğru cevabı tanımlı değil. Bu sorular cevap anahtarında "?" olur ve değerlendirmede herkes için yanlış sayılır. Devam edilsin mi?`, { ok: 'Devam et' })) return;
  const pg = progress(`${t.ad} denemesi hazırlanıyor`);
  try {
    const ogr = nos.length === 1 ? stuLabel(nos[0]) : '';
    const sections = makeTemplateSections(t, perSlot);
    const r = await makeBooklet({ sections, title, ogrenci: ogr, tries: hv.tries, forceNewPage: true, onProgress: (f, x) => pg.set(f * 0.75, x) });
    pg.set(0.8, 'Cevap anahtarı');
    const kp = await buildAnswerKeyPdf(title, r.key, { ogrenci: ogr });
    const spec = formSpecFromQuestions(title, r.key, t.secenek, state.settings.noHane);
    pg.set(0.88, 'Optik formlar');
    const people = hv.kisiselForm ? nos.map(no => { const s = state.students.get(no); return { isim: s?.isim || '', no, sube: s?.sube || '' }; }) : [];
    const blank = hv.bosForm || (people.length ? 0 : 1);
    const forms = await buildFormsPdf(spec, people, blank);
    if (nos.length) await markSeen(nos, picked.map(q => q.id));
    const doc = await recordDoc({ tur: 'deneme', sablon: t.id, kismi: !tamMi(), isim: title, sorular: r.key, ogrenciler: nos, form: spec, pdf: new Blob([r.pdf], { type: 'application/pdf' }) });
    pg.close();
    const files = [pdfFile('Soru kitapçığı', title, r.pdf, `${r.pages} sayfa, ${r.key.length} soru`), pdfFile('Cevap anahtarı', `${title}_cevap_anahtari`, kp), csvFile('Cevap anahtarı (CSV)', `${title}_cevap_anahtari`, keyToCsvRows(r.key)), pdfFile('Optik formlar', `${title}_optik_formlar`, forms, `${people.length} kişiye özel + ${blank} boş`)];
    const extra = `<div class="banner" style="border-left-color:var(--brand);margin-top:0"><span>Sınavdan sonra formları okutmak için <b>Sınavlar ve Optik</b> sayfasında bu denemeyi seçin.${t.tytGerekli ? ' AYT/YDT puanları için öğrencilerin TYT denemesiyle eşleştirme yapılır.' : ''}</span><button class="btn sm" id="go-eval">Değerlendirmeye git</button></div><div class="banner" style="border-left-color:var(--ok);margin-top:0"><span><b>Online da çözülebilir.</b> Yayınlarsanız öğrenciler linkten telefonda ya da bilgisayarda çözer, sonuçlar buraya gelir.</span><button class="btn sm" id="go-online">Online yayınla</button></div>`;
    let wantOnline = false;
    const pr = resultsDialog(`${title} hazır`, files, extra);
    setTimeout(() => {
      const b = document.getElementById('go-eval'); if (b) b.addEventListener('click', () => { document.querySelector('.modal-back [data-x]')?.click(); go('sinavlar', { yeniDoc: doc.id }); });
      const o = document.getElementById('go-online'); if (o) o.addEventListener('click', () => { wantOnline = true; document.querySelector('.modal-back [data-x]')?.click(); });
    }, 50);
    await pr;
    if (wantOnline) await publishDialog(doc);
  } finally { pg.close(); }
  render(host);
}

// ---------------- Otomatik ----------------
function renderAuto(main, host) {
  const dl = sortDersler([...new Set([...state.questions.values()].map(q => q.ders))]);
  if (!hv.autoRows.length) hv.autoRows = dl.slice(0, 3).map(d => ({ ders: d, konuSayisi: 2, soruSayisi: 6 }));
  const nos = [...hv.students];
  const hasExams = state.exams.size > 0;
  main.innerHTML = `<div class="card">
    <h3>Zayıf konulara göre kişisel ödev</h3>
    <p class="muted small" style="margin-top:0">Her öğrenci için tüm sınavlarındaki sonuçlar incelenir; her derste doğru oranı en düşük konular seçilir. Soru zorluğu öğrencinin o konudaki seviyesine göre belirlenir, o zorlukta soru yoksa en yakın zorluklardan tamamlanır.</p>
    ${!hasExams ? '<div class="banner"><span>Otomatik ödev için önce en az bir sınav değerlendirilmiş olmalı.</span><a class="btn sm" href="#sinavlar">Sınavlar</a></div>' : ''}
    <div class="scroll"><table class="tbl"><thead><tr><th>Ders</th><th class="num">Konu sayısı</th><th class="num">Soru sayısı</th><th></th></tr></thead><tbody>
    ${hv.autoRows.map((r, i) => `<tr><td><select data-ad="${i}">${optionList(dl, r.ders)}</select></td><td class="num"><input type="number" min="1" data-ak="${i}" value="${r.konuSayisi}"></td><td class="num"><input type="number" min="0" data-as="${i}" value="${r.soruSayisi}"></td><td><button class="icon-btn" data-arm="${i}" aria-label="Sil">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row gap" style="margin-top:10px"><button class="btn sm" id="au-add">Ders ekle</button></div>
    <div class="form-grid" style="margin-top:14px">
      <label class="fld"><span>Belge başlığı</span><input id="au-t" value="${esc(hv.title && !hv.title.startsWith('Deneme') ? hv.title : 'Kişisel Ödev')}"></label>
      <label class="fld"><span>Soru havuzu</span><select id="au-f"><option value="hepsi">Bütün sorular</option><option value="analiz" ${hv.filtre === 'analiz' ? 'selected' : ''}>Yalnızca analiz edilenler</option><option value="analizsiz" ${hv.filtre === 'analizsiz' ? 'selected' : ''}>Yalnızca analiz edilmeyenler</option></select></label>
    </div>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="au-tm" ${hv.tamamla ? 'checked' : ''}> Yeterli yeni soru yoksa daha önce görülen sorularla tamamla</label>
    <div class="row between gap" style="margin-top:16px"><span class="small muted">${nos.length} öğrenci seçili · her birine ayrı ödev</span><button class="btn primary" id="au-go" ${nos.length && hasExams ? '' : 'disabled'}>Ödevleri hazırla</button></div>
  </div>`;
  $$('[data-ad]', main).forEach(s => s.addEventListener('change', () => { hv.autoRows[+s.dataset.ad].ders = s.value; }));
  $$('[data-ak]', main).forEach(s => s.addEventListener('change', () => { hv.autoRows[+s.dataset.ak].konuSayisi = Math.max(1, +s.value || 1); }));
  $$('[data-as]', main).forEach(s => s.addEventListener('change', () => { hv.autoRows[+s.dataset.as].soruSayisi = Math.max(0, +s.value || 0); }));
  $$('[data-arm]', main).forEach(b => b.addEventListener('click', () => { hv.autoRows.splice(+b.dataset.arm, 1); render(host); }));
  $('#au-add', main).addEventListener('click', () => { const used = new Set(hv.autoRows.map(r => r.ders)); const d = dl.find(x => !used.has(x)); if (!d) { toast('Bütün dersler eklendi.', 'warn'); return; } hv.autoRows.push({ ders: d, konuSayisi: 2, soruSayisi: 6 }); render(host); });
  $('#au-f', main).addEventListener('change', e => { hv.filtre = e.target.value; });
  $('#au-tm', main).addEventListener('change', e => { hv.tamamla = e.target.checked; });
  $('#au-go', main).addEventListener('click', guard(async () => {
    const title = $('#au-t', main).value.trim() || 'Kişisel Ödev';
    const plans = nos.map(no => { const plan = autoPlan(no, hv.autoRows, { filtre: hv.filtre }); return { no, plan, sel: selectAuto(no, plan.rows, { filtre: hv.filtre, tamamla: hv.tamamla }) }; });
    const uyar = plans.flatMap(p => [...p.plan.uyarilar.map(u => `${stuLabel(p.no)}: ${u}`), ...p.sel.eksik.map(e => `${stuLabel(p.no)}: ${e.row.ders} › ${e.row.konu} için ${e.istenen} soru istendi, ${e.bulunan} bulundu`)]);
    if (uyar.length && !await confirmDlg(uyar.slice(0, 12).join('\n') + (uyar.length > 12 ? `\n… ve ${uyar.length - 12} uyarı daha` : '') + '\n\nDevam edilsin mi?', { title: 'Uyarılar', ok: 'Devam et' })) return;
    const ok = plans.filter(p => p.sel.picked.length);
    if (!ok.length) { await alertDlg('Hiçbir öğrenci için soru seçilemedi.'); return; }
    const pg = progress('Kişisel ödevler hazırlanıyor');
    const pdfs = [], keys = [], zipE = [], ozet = [['Numara', 'Ad soyad', 'Şube', 'Ders', 'Konu', 'Doğru oranı', 'Seviye', 'Hedef zorluk', 'Soru']];
    try {
      for (let i = 0; i < ok.length; i++) {
        const p = ok[i]; const lbl = stuLabel(p.no); const s = state.students.get(p.no);
        const r = await makeBooklet({ questions: p.sel.picked, title, ogrenci: lbl, byKonu: true, tries: 2, onProgress: (f, t) => pg.set((i + f) / ok.length, `${lbl} · ${t}`) });
        const kp = await buildAnswerKeyPdf(title, r.key, { ogrenci: lbl });
        pdfs.push(r.pdf); keys.push(kp);
        const fn = safeFile(`${title}_${s?.isim || p.no}_${p.no}`);
        zipE.push({ name: fn + '.pdf', data: r.pdf }, { name: fn + '_cevap_anahtari.pdf', data: kp });
        p.plan.notlar.forEach(n => ozet.push([p.no, s?.isim || '', s?.sube || '', n.ders, n.konu, Math.round(n.oran * 1000) / 10, n.seviye, n.hedef, n.count]));
        await markSeen([p.no], p.sel.picked.map(q => q.id));
        await recordDoc({ tur: 'otomatik', isim: title, sorular: r.key, ogrenciler: [p.no] });
      }
      pg.set(1, 'Birleştiriliyor');
      const all = await mergePdfs(pdfs), allKeys = await mergePdfs(keys), zip = await zipFiles(zipE);
      pg.close();
      await resultsDialog(`${ok.length} kişisel ödev hazır`, [
        pdfFile('Tüm ödevler (tek PDF)', `${title}_tum_ogrenciler`, all),
        pdfFile('Tüm cevap anahtarları', `${title}_cevap_anahtarlari`, allKeys),
        { label: 'Her öğrenci ayrı dosya (ZIP)', filename: safeFile(title) + '_ayri.zip', data: zip, mime: 'application/zip' },
        csvFile('Ödev özeti (hangi konudan neden verildi)', `${title}_ozet`, ozet),
      ]);
    } finally { pg.close(); }
    render(host);
  }));
}

// ---------------- Belgeler ----------------
const TUR = { odev: 'Ödev', deneme: 'Deneme', otomatik: 'Otomatik ödev', hata: 'Hata testi' };
function renderDocs(body, host) {
  const docs = [...state.docs.values()].sort((a, b) => b.created - a.created);
  if (!docs.length) { body.innerHTML = `<div class="card">${emptyState('Henüz belge hazırlanmadı', 'Hazırladığınız ödev ve denemeler burada listelenir; cevap anahtarını ve optik formları buradan yeniden indirebilirsiniz.')}</div>`; return; }
  body.innerHTML = `<div class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Tarih</th><th>Tür</th><th>Başlık</th><th class="num">Soru</th><th>Öğrenci</th><th></th></tr></thead><tbody>
    ${docs.map(d => `<tr><td>${fmtDate(d.tarih)}</td><td><span class="pill">${esc((d.sablon ? d.sablon + ' ' : '') + (TUR[d.tur] || d.tur))}</span></td><td>${esc(d.isim)}</td><td class="num">${d.sorular.length}</td><td class="small">${d.ogrenciler.length === 1 ? esc(stuLabel(d.ogrenciler[0])) : d.ogrenciler.length ? d.ogrenciler.length + ' öğrenci' : '-'}</td>
    <td><div class="row gap-s end">${d.tur === 'deneme' ? `<button class="btn sm primary" data-ev="${esc(d.id)}">Değerlendir</button><button class="btn sm" data-fm="${esc(d.id)}">Optik form</button>` : ''}${d.pdf ? `<button class="btn sm" data-pdf="${esc(d.id)}">Kitapçık</button>` : ''}<button class="btn sm ${d.online ? 'primary' : ''}" data-onl="${esc(d.id)}">${d.online ? 'Online ●' : 'Online yayınla'}</button><button class="btn sm" data-key="${esc(d.id)}">Cevap anahtarı</button><button class="icon-btn" data-del="${esc(d.id)}" aria-label="Kaydı sil">✕</button></div></td></tr>`).join('')}
  </tbody></table></div><p class="small muted">Kayıt silmek öğrencilerin görülen soru geçmişini değiştirmez.</p></div>`;
  $$('[data-ev]', body).forEach(b => b.addEventListener('click', () => go('sinavlar', { yeniDoc: b.dataset.ev })));
  $$('[data-pdf]', body).forEach(b => b.addEventListener('click', guard(async () => { const d = state.docs.get(b.dataset.pdf); await resultsDialog('Soru kitapçığı', [{ label: 'Soru kitapçığı', filename: safeFile(d.isim) + '.pdf', data: d.pdf, mime: 'application/pdf' }]); })));
  $$('[data-key]', body).forEach(b => b.addEventListener('click', guard(async () => {
    const d = state.docs.get(b.dataset.key);
    const kp = await buildAnswerKeyPdf(d.isim, d.sorular, { ogrenci: d.ogrenciler.length === 1 ? stuLabel(d.ogrenciler[0]) : '' });
    await resultsDialog('Cevap anahtarı', [pdfFile('Cevap anahtarı', `${d.isim}_cevap_anahtari`, kp), csvFile('Cevap anahtarı (CSV)', `${d.isim}_cevap_anahtari`, keyToCsvRows(d.sorular))]);
  })));
  $$('[data-fm]', body).forEach(b => b.addEventListener('click', guard(async () => { await formDialog(state.docs.get(b.dataset.fm)); })));
  $$('[data-onl]', body).forEach(b => b.addEventListener('click', guard(async () => { await publishDialog(state.docs.get(b.dataset.onl)); render(host); })));
  $$('[data-del]', body).forEach(b => b.addEventListener('click', guard(async () => {
    const dd = state.docs.get(b.dataset.del);
    if (!await confirmDlg(`Belge kaydı silinsin mi? (Sınav sonuçları ve öğrenci geçmişi etkilenmez.)${dd && dd.online ? ' Bu belge online yayında; yayın da sunucudan kaldırılır ve aktarılmamış gönderimler kaybolur.' : ''}`, { ok: 'Sil', danger: true })) return;
    if (dd && dd.online) { try { const { api } = await import('../onlinepkg.js'); await api(dd.online.api, `/e/${dd.online.id}`, { method: 'DELETE', token: dd.online.token }); } catch { /* sunucuda kendiliğinden silinir */ } }
    await deleteDoc(b.dataset.del); render(host);
  })));
}

export async function formDialog(d) {
  const subeler = subeList();
  const res = await modal({
    title: 'Optik form yazdır',
    content: `<p class="muted" style="margin-top:0">${esc(d.isim)} · ${d.sorular.length} soru</p>
      <div class="stack"><label class="fld"><span>Kişiye özel formlar</span><select id="fd-s"><option value="">Kişiye özel form yok</option><option value="__sec">Bu belgenin öğrencileri (${d.ogrenciler.length})</option>${subeler.map(s => `<option value="${esc(s)}">${esc(s)} şubesi</option>`).join('')}<option value="__all">Tüm öğrenciler</option></select></label>
      <label class="fld"><span>Boş form sayısı</span><input id="fd-b" type="number" min="0" max="300" value="${d.ogrenciler.length ? 0 : 30}"></label></div>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Formları üret', value: m => ({ s: $('#fd-s', m).value, b: Math.max(0, +$('#fd-b', m).value || 0) }) }],
  });
  if (!res) return;
  let nos = [];
  if (res.s === '__sec') nos = d.ogrenciler; else if (res.s === '__all') nos = [...state.students.keys()]; else if (res.s) nos = [...state.students.values()].filter(s => s.sube === res.s).map(s => s.no);
  const people = nos.map(no => { const s = state.students.get(no); return { isim: s?.isim || '', no, sube: s?.sube || '' }; }).sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.isim, b.isim));
  const spec = d.form || formSpecFromQuestions(d.isim, d.sorular, state.settings.secenekSayisi, state.settings.noHane);
  if (!d.form) { d.form = spec; await saveDoc(d); }
  const pg = progress('Formlar üretiliyor');
  let pdf;
  try { pdf = await buildFormsPdf(spec, people, res.b || (people.length ? 0 : 1), (f, t) => pg.set(f, t)); }
  finally { pg.close(); }
  await resultsDialog('Optik formlar hazır', [pdfFile('Optik formlar', `${d.isim}_optik_formlar_${stamp()}`, pdf, `${people.length} kişiye özel, ${res.b} boş`)]);
}

export { fmtPct, LETTERS };
