// Sınav değerlendirme sihirbazı: cevap anahtarı -> cevaplar (optik/txt/elle) -> kontrol -> kaydet
import { state, saveExam, saveStudents, dersList, sortDersler, findQuestionByName, getStudent } from '../db.js';
import { esc, $, $$, uid, normNo, todayISO, fmtDate, pickFiles, readText, parseCSV, LETTERS, loadImage, makeCanvas, cmpTr } from '../util.js';
import { modal, confirmDlg, toast, progress, guard, alertDlg, optionList } from '../ui.js';
import { formSpecFromQuestions, readSheet, pdfPages, imageFileToCanvas, rowCropRect, noCropRect, formGeometry } from '../omr.js';
import { puanlamaSnapshot, touch } from '../scoring.js';
import { formDialog } from './homework.js';
import { SABLONLAR, sablon, sablonlarFor, alanAd } from '../sinavlar.js';

export const wz = { active: false };
function reset() { Object.keys(wz).forEach(k => delete wz[k]); wz.active = false; }

export function startWizard({ docId = null, addTo = null } = {}) {
  reset();
  Object.assign(wz, { active: true, step: 1, key: null, isim: '', tarih: todayISO(), secenek: state.settings.secenekSayisi, method: 'optik', sheets: [], sel: 0, addTo, docId });
  if (addTo) {
    const e = state.exams.get(addTo);
    wz.key = e.sorular.map(s => ({ ...s })); wz.isim = e.isim; wz.tarih = e.tarih; wz.secenek = e.secenek || 5; wz.step = 2; wz.tur = e.tur || null; wz.kismi = !!e.kismi; wz.tytExamId = e.tytExamId || null;
    wz.form = e.form || formSpecFromQuestions(e.isim, e.sorular, wz.secenek, state.settings.noHane);
  }
  if (docId) {
    const d = state.docs.get(docId);
    if (d) { useDoc(d); wz.step = 2; }
  }
}
function useDoc(d) {
  wz.key = d.sorular.map(s => ({ ...s, qid: s.qid || null, zorluk: String(s.zorluk), cevap: (s.cevap || '').toUpperCase(), ad: s.ad || '' }));
  wz.isim = d.isim; wz.docId = d.id; wz.tur = d.sablon || null; wz.kismi = !!d.kismi;
  const t = sablon(wz.tur);
  wz.form = d.form || formSpecFromQuestions(d.isim, d.sorular, t ? t.secenek : state.settings.secenekSayisi, state.settings.noHane);
  wz.secenek = wz.form.secenek;
}

export async function renderWizard(host, onDone) {
  const steps = ['Cevap anahtarı', 'Cevaplar', 'Kontrol ve kayıt'];
  host.innerHTML = `
  <div class="page-head"><div><h1>${wz.addTo ? 'Sınava sonuç ekle' : 'Sınav değerlendir'}</h1><p>${wz.key ? `${esc(wz.isim || 'Adsız sınav')} · ${wz.key.length} soru` : 'Önce hangi sınavı değerlendirdiğinizi seçin.'}</p></div>
    <button class="btn ghost" id="wz-cancel">Vazgeç</button></div>
  <div class="row gap" style="margin-bottom:16px">${steps.map((s, i) => `<span class="pill ${wz.step === i + 1 ? '' : 'ok'}" style="${wz.step === i + 1 ? 'background:var(--brand);color:#fff' : wz.step < i + 1 ? 'opacity:.55;background:var(--panel2);color:var(--muted)' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
  <div id="wz-body"></div>`;
  $('#wz-cancel', host).addEventListener('click', guard(async () => {
    if (wz.sheets && wz.sheets.length && !await confirmDlg('Okunan formlar kaydedilmeden silinecek.', { ok: 'Vazgeç ve sil', danger: true })) return;
    reset(); onDone();
  }));
  const body = $('#wz-body', host);
  if (wz.step === 1) return stepKey(body, host, onDone);
  if (wz.step === 2) return stepAnswers(body, host, onDone);
  return stepReview(body, host, onDone);
}

// ---------------- 1. Cevap anahtarı ----------------
function stepKey(body, host, onDone) {
  const docs = [...state.docs.values()].filter(d => d.tur === 'deneme').sort((a, b) => b.created - a.created);
  body.innerHTML = `<div class="grid g2">
    <section class="card"><h3>selfdeneme'de hazırlanan deneme</h3>
      ${docs.length ? `<div class="list">${docs.map(d => `<div class="it" data-doc="${esc(d.id)}"><span class="grow"><b>${esc(d.isim)}</b><br><span class="small muted">${fmtDate(d.tarih)} · ${d.sorular.length} soru</span></span><span class="btn sm">Seç</span></div>`).join('')}</div>` : '<p class="muted">Henüz deneme hazırlamadınız. <a href="#hazirla">Ödev ve Deneme</a> sayfasından bir deneme hazırlarsanız cevap anahtarı ve form otomatik gelir.</p>'}
    </section>
    <section class="card"><h3>Dışarıdan cevap anahtarı</h3>
      <p class="muted small" style="margin-top:0">Başka bir yayının denemesini de değerlendirebilirsiniz. Cevap anahtarını CSV olarak yükleyin ya da ders ders yazın.</p>
      <div class="stack"><button class="btn primary" id="k-tpl">LGS / TYT / AYT / YDT cevap anahtarı gir</button><button class="btn" id="k-man">Serbest anahtar (ders ders)</button><button class="btn" id="k-csv">CSV yükle (Ders;Konu;Zorluk;Cevap;Soru)</button></div>
      <p class="small muted" style="margin-top:12px">CSV, eski Ödev Programı'nın ürettiği cevap anahtarı biçimiyle aynıdır. İlk satır başlık olabilir.</p>
    </section></div>`;
  $$('[data-doc]', body).forEach(el => el.addEventListener('click', () => { useDoc(state.docs.get(el.dataset.doc)); wz.step = 2; renderWizard(host, onDone); }));
  $('#k-csv', body).addEventListener('click', guard(async () => {
    const f = await pickFiles({ accept: '.csv,.txt,text/*' });
    if (!f.length) return;
    const rows = parseCSV(await readText(f[0]));
    const key = [];
    for (const r of rows) {
      let cols = r;
      if (cols.length === 1 && cols[0].includes(';')) cols = cols[0].split(';');
      const [ders, konu, zorluk, cevap, ad] = cols.map(x => (x || '').trim());
      if (!ders || /^ders$/i.test(ders)) continue;
      const c = (cevap || '').toUpperCase();
      const q = ad ? findQuestionByName(ders, konu, ad) : null;
      key.push({ qid: q ? q.id : null, ders, konu: konu || 'Genel', zorluk: /^[1-5]$/.test(zorluk) ? zorluk : '3', cevap: LETTERS.includes(c) ? c : '', ad: q ? q.ad : (ad || '') });
    }
    if (!key.length) { await alertDlg('CSV dosyasında cevap anahtarı satırı bulunamadı.'); return; }
    const sorted = sortKeyByDers(key);
    wz.key = sorted; wz.isim = f[0].name.replace(/\.[^.]+$/, '').replace(/_cevap_anahtari$/i, ''); wz.docId = null; wz.tur = null;
    wz.form = formSpecFromQuestions(wz.isim, sorted, state.settings.secenekSayisi, state.settings.noHane); wz.secenek = wz.form.secenek;
    wz.step = 2; renderWizard(host, onDone);
  }));
  $('#k-man', body).addEventListener('click', guard(async () => { if (await manualKey()) { wz.step = 2; renderWizard(host, onDone); } }));
  $('#k-tpl', body).addEventListener('click', guard(async () => { if (await templateKey()) { wz.step = 2; renderWizard(host, onDone); } }));
}

function sortKeyByDers(key) {
  // Ardışık olmayan dersleri sırasını koruyarak grupla (form blokları için)
  const order = []; key.forEach(k => { if (!order.includes(k.ders)) order.push(k.ders); });
  return order.flatMap(d => key.filter(k => k.ders === d));
}

async function manualKey() {
  const dl = dersList();
  let rows = wz.manualRows || [{ ders: dl[0] || 'Türkçe', konular: '', cevaplar: '' }];
  const res = await modal({
    title: 'Cevap anahtarını tanımla', wide: true,
    content: `<label class="fld"><span>Sınav adı</span><input id="mk-n" value="${esc(wz.isim || 'Deneme Sınavı')}"></label>
      <p class="small muted">Her ders için cevapları art arda yazın (ör. <code>ABCDA BDCEA</code>; boşluklar yok sayılır). Konu analizi istiyorsanız konuları da her soru için virgülle ya da her satıra bir konu gelecek şekilde yazın; yazmazsanız "Genel" kabul edilir.</p>
      <div id="mk-rows" class="stack"></div><button class="btn sm" id="mk-add" style="margin-top:10px">Ders ekle</button>
      <label class="fld" style="margin-top:12px;width:180px"><span>Şık sayısı</span><select id="mk-s"><option value="5" ${wz.secenek == 5 ? 'selected' : ''}>5 (A–E)</option><option value="4" ${wz.secenek == 4 ? 'selected' : ''}>4 (A–D)</option></select></label>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Devam', value: m => ({ isim: $('#mk-n', m).value.trim() || 'Deneme Sınavı', sec: +$('#mk-s', m).value }) }],
    onMount: m => {
      const draw = () => {
        $('#mk-rows', m).innerHTML = rows.map((r, i) => `<div class="card" style="padding:12px"><div class="row gap" style="align-items:flex-end">
          <label class="fld" style="flex:1;min-width:150px"><span>Ders</span><input data-r="${i}" data-f="ders" list="mk-dl" value="${esc(r.ders)}"></label>
          <label class="fld" style="flex:2;min-width:200px"><span>Cevaplar <small data-cnt="${i}">${r.cevaplar.replace(/[^A-Ea-e]/g, '').length} soru</small></span><input data-r="${i}" data-f="cevaplar" value="${esc(r.cevaplar)}" style="font-family:ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase"></label>
          <button class="icon-btn" data-rm="${i}" aria-label="Sil">✕</button></div>
          <label class="fld" style="margin-top:8px"><span>Konular (isteğe bağlı)</span><textarea data-r="${i}" data-f="konular" style="min-height:44px" placeholder="Fiilimsiler, Fiilimsiler, Cümlenin Ögeleri, …">${esc(r.konular)}</textarea></label></div>`).join('') + `<datalist id="mk-dl">${dl.map(d => `<option value="${esc(d)}">`).join('')}</datalist>`;
        $$('[data-r]', m).forEach(inp => inp.addEventListener('input', () => { rows[+inp.dataset.r][inp.dataset.f] = inp.value; if (inp.dataset.f === 'cevaplar') { const c = $(`[data-cnt="${inp.dataset.r}"]`, m); c.textContent = inp.value.replace(/[^A-Ea-e]/g, '').length + ' soru'; } }));
        $$('[data-rm]', m).forEach(b => b.addEventListener('click', () => { rows.splice(+b.dataset.rm, 1); draw(); }));
      };
      draw();
      $('#mk-add', m).addEventListener('click', () => { rows.push({ ders: dl.find(d => !rows.some(r => r.ders === d)) || '', konular: '', cevaplar: '' }); draw(); });
    },
  });
  wz.manualRows = rows;
  if (!res) return false;
  const key = [];
  for (const r of rows) {
    const ans = r.cevaplar.toUpperCase().replace(/[^A-E]/g, '');
    if (!r.ders.trim() || !ans.length) continue;
    const konular = r.konular.split(/[,\n;]/).map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < ans.length; i++) key.push({ qid: null, ders: r.ders.trim(), konu: konular[i] || konular[konular.length - 1] || 'Genel', zorluk: '3', cevap: ans[i], ad: '' });
  }
  if (!key.length) { await alertDlg('En az bir ders için cevap girin.'); return false; }
  if (res.sec === 4 && key.some(k => k.cevap === 'E')) { await alertDlg('4 şıklı sınavda E cevabı olamaz.'); return false; }
  wz.key = sortKeyByDers(key); wz.isim = res.isim; wz.secenek = res.sec; wz.docId = null; wz.tur = null; wz.kismi = false;
  wz.form = formSpecFromQuestions(res.isim, wz.key, res.sec, state.settings.noHane);
  return true;
}

async function templateKey() {
  const tpls = sablonlarFor(state.settings.kurumTuru || 'karma');
  let tid = wz.tplDraft?.tid && SABLONLAR[wz.tplDraft.tid] ? wz.tplDraft.tid : tpls[0].id;
  const draft = wz.tplDraft || { tid, isim: '', ans: {}, kon: {}, mod: 'test', bSlot: '', bAns: '', bKon: '' };
  draft.mod = draft.mod || 'test';
  const slotList = t => t.testler.flatMap(test => test.slots.filter(x => x.secmeli !== 'ekfel').map(x => ({ v: test.id + '/' + x.id, l: test.slots.length > 1 ? `${test.ad} › ${x.ad}` : test.ad })));
  const res = await modal({
    title: 'Resmî sınav cevap anahtarı', wide: true,
    content: `<div class="form-grid"><label class="fld"><span>Sınav türü</span><select id="tk-t">${tpls.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${esc(t.uzun)}</option>`).join('')}</select></label>
      <label class="fld"><span>Sınav adı</span><input id="tk-n" value="${esc(draft.isim || wz.isim || '')}" placeholder="ör. X Yayınları TYT-3"></label></div>
      <div class="seg" id="tk-m" style="margin-top:12px"><button type="button" data-m="test" class="${draft.mod === 'test' ? 'on' : ''}">Test test (tam ya da kısmi)</button><button type="button" data-m="brans" class="${draft.mod === 'brans' ? 'on' : ''}">Tek ders (branş denemesi)</button></div>
      <div id="tk-rows" class="stack" style="margin-top:12px"></div>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Devam', value: m => ({ tid: $('#tk-t', m).value, isim: $('#tk-n', m).value.trim() }) }],
    onMount: m => {
      const draw = () => {
        const t = SABLONLAR[tid];
        if (draft.mod === 'brans') {
          const sl = slotList(t);
          if (!sl.some(x => x.v === draft.bSlot)) draft.bSlot = sl[0].v;
          const cnt = draft.bAns.replace(/[^A-Ea-e]/g, '').length;
          $('#tk-rows', m).innerHTML = `<p class="small muted" style="margin:0">Yayının branş denemesi için dersi seçin ve cevapları sırayla yazın. Soru sayısı serbesttir; şık sayısı (${t.secenek}) ve yanlış kuralı (${t.yanlisOrani === 0.25 ? '4' : '3'} yanlış 1 doğru) ${esc(t.ad)} ile aynıdır. Sonuçlar nete göre sıralanır.</p>
            <label class="fld"><span>Ders / bölüm</span><select id="tk-bs">${sl.map(x => `<option value="${x.v}" ${x.v === draft.bSlot ? 'selected' : ''}>${esc(x.l)}</option>`).join('')}</select></label>
            <label class="fld"><span>Cevaplar <small id="tk-bc">${cnt} soru</small></span><input id="tk-ba" value="${esc(draft.bAns)}" style="font-family:ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase" autocomplete="off"></label>
            <details><summary class="small">Konular (isteğe bağlı)</summary><textarea id="tk-bk" style="min-height:50px;margin-top:6px" placeholder="Her soru için bir konu: virgülle ya da satır satır">${esc(draft.bKon)}</textarea></details>`;
          $('#tk-bs', m).addEventListener('change', e => { draft.bSlot = e.target.value; });
          $('#tk-ba', m).addEventListener('input', e => { draft.bAns = e.target.value; $('#tk-bc', m).textContent = e.target.value.replace(/[^A-Ea-e]/g, '').length + ' soru'; });
          $('#tk-bk', m).addEventListener('input', e => { draft.bKon = e.target.value; });
          return;
        }
        $('#tk-rows', m).innerHTML = `<p class="small muted" style="margin:0">Her testin cevaplarını kitapçıktaki sırayla art arda yazın (boşluk ve tireler yok sayılır). Uygulamadığınız testleri boş bırakın; bu durumda deneme kısmi sayılır ve yalnızca testleri tam olan puan türleri hesaplanır.</p>` + t.testler.map(test => {
          const n = test.slots.reduce((a, x) => a + x.n, 0);
          const k = tid + '/' + test.id; const v = draft.ans[k] || '';
          const cnt = v.replace(/[^A-Ea-e]/g, '').length;
          return `<div class="card" style="padding:12px"><div class="row between gap"><b>${esc(test.ad)}</b><span class="small" data-cnt="${k}" style="color:${cnt === n ? 'var(--ok)' : cnt ? 'var(--bad)' : 'var(--muted)'}">${cnt}/${n}</span></div>
            <p class="small muted" style="margin:4px 0 6px">${test.slots.map(x => `${esc(x.ad)} ${x.n}`).join(' · ')}</p>
            <input data-a="${k}" data-n="${n}" value="${esc(v)}" style="font-family:ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase" autocomplete="off">
            <details style="margin-top:6px"><summary class="small">Konular (isteğe bağlı)</summary><textarea data-k="${k}" style="min-height:50px;margin-top:6px" placeholder="Her soru için bir konu: virgülle ya da satır satır">${esc(draft.kon[k] || '')}</textarea></details></div>`;
        }).join('');
        $$('[data-a]', m).forEach(inp => inp.addEventListener('input', () => { draft.ans[inp.dataset.a] = inp.value; const c = inp.value.replace(/[^A-Ea-e]/g, '').length, n = +inp.dataset.n; const el = $(`[data-cnt="${inp.dataset.a}"]`, m); el.textContent = `${c}/${n}`; el.style.color = c === n ? 'var(--ok)' : c ? 'var(--bad)' : 'var(--muted)'; }));
        $$('[data-k]', m).forEach(inp => inp.addEventListener('input', () => { draft.kon[inp.dataset.k] = inp.value; }));
      };
      draw();
      $('#tk-t', m).addEventListener('change', e => { tid = e.target.value; draw(); });
      $$('#tk-m button', m).forEach(b => b.addEventListener('click', () => { draft.mod = b.dataset.m; $$('#tk-m button', m).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
    },
  });
  draft.tid = tid; wz.tplDraft = draft;
  if (!res) return false;
  const t = SABLONLAR[res.tid];
  const key = []; const errs = []; let atlandi = false;
  const kv = (sl, test, i, cevap, konu) => ({ qid: null, ders: sl.dersler[0], konu: konu || sl.ad, zorluk: '3', cevap, ad: '', alan: sl.alan, test: test.id, testAd: test.ad, testKisa: test.kisa || '', slot: sl.id, slotAd: sl.ad, no: i + 1, ...(sl.secmeli ? { secmeli: sl.secmeli } : {}) });
  if (draft.mod === 'brans') {
    const [tidT, sid] = draft.bSlot.split('/');
    const test = t.testler.find(x => x.id === tidT); const sl = test && test.slots.find(x => x.id === sid);
    if (!sl) { await alertDlg('Ders seçin.'); return false; }
    const ans = draft.bAns.toUpperCase().replace(/[^A-E]/g, '');
    if (!ans.length) { await alertDlg('Cevapları yazın.'); return false; }
    if (t.secenek === 4 && /E/.test(ans)) { await alertDlg(`${t.ad} sorularında E şıkkı yoktur.`); return false; }
    const konular = draft.bKon.split(/[,\n;]/).map(x => x.trim()).filter(Boolean);
    for (let i = 0; i < ans.length; i++) key.push(kv(sl, test, i, ans[i], konular[i]));
    wz.key = key; wz.isim = res.isim || `${t.ad} ${sl.ad} Branş Denemesi`; wz.secenek = t.secenek; wz.docId = null; wz.tur = t.id; wz.kismi = true;
    wz.form = formSpecFromQuestions(wz.isim, key, t.secenek, state.settings.noHane);
    return true;
  }
  for (const test of t.testler) {
    const k = t.id + '/' + test.id;
    const ans = (draft.ans[k] || '').toUpperCase().replace(/[^A-E]/g, '');
    const n = test.slots.reduce((a, x) => a + x.n, 0);
    if (!ans.length) { atlandi = true; continue; }
    if (ans.length !== n) { errs.push(`${test.ad}: ${ans.length} cevap yazıldı, ${n} olmalı`); continue; }
    if (t.secenek === 4 && /E/.test(ans)) { errs.push(`${test.ad}: ${t.ad} sorularında E şıkkı yoktur`); continue; }
    const konular = (draft.kon[k] || '').split(/[,\n;]/).map(x => x.trim()).filter(Boolean);
    let i = 0;
    for (const sl of test.slots) for (let j = 0; j < sl.n; j++, i++) key.push(kv(sl, test, i, ans[i], konular[i]));
  }
  if (errs.length) { await alertDlg(errs.join('\n'), 'Cevap sayıları tutmuyor'); return false; }
  if (!key.length) { await alertDlg('En az bir testin cevaplarını girin.'); return false; }
  wz.key = key; wz.isim = res.isim || `${t.ad} Denemesi`; wz.secenek = t.secenek; wz.docId = null; wz.tur = t.id; wz.kismi = atlandi;
  wz.form = formSpecFromQuestions(wz.isim, key, t.secenek, state.settings.noHane);
  return true;
}

// ---------------- 2. Cevaplar ----------------
function stepAnswers(body, host, onDone) {
  const N = wz.key.length;
  body.innerHTML = `
  <div class="card">
    <div class="row between gap"><div><h3 style="margin:0">${esc(wz.isim)}</h3><p class="small muted" style="margin:4px 0 0">${wz.tur ? `<span class="pill">${esc(wz.tur)}</span> ` : ''}${N} soru · ${wz.tur ? [...new Set(wz.key.map(k => k.testAd))].map(d => `${d} ${wz.key.filter(k => k.testAd === d).length}`).join(' · ') : sortDersler([...new Set(wz.key.map(k => k.ders))]).map(d => `${d} ${wz.key.filter(k => k.ders === d).length}`).join(' · ')}</p></div>
    <div class="row gap">${!wz.addTo ? '<button class="btn sm ghost" id="w-back">Anahtarı değiştir</button>' : ''}<button class="btn sm" id="w-form">Optik form yazdır</button></div></div>
  </div>
  <div class="tabs" style="margin-top:12px">
    <button data-m="optik" class="${wz.method === 'optik' ? 'on' : ''}">Tarama / fotoğraf</button>
    <button data-m="txt" class="${wz.method === 'txt' ? 'on' : ''}">Optik okuyucu dosyası</button>
    <button data-m="elle" class="${wz.method === 'elle' ? 'on' : ''}">Elle giriş</button>
  </div>
  <div id="w-m"></div>
  ${wz.sheets.length ? `<div class="card" style="margin-top:16px"><div class="row between gap"><span><b>${wz.sheets.length} form</b> eklendi · ${wz.sheets.filter(s => s.flags.size || s.noFlag || !s.ok).length} tanesi kontrol bekliyor</span><button class="btn primary" id="w-next">Kontrole geç</button></div></div>` : ''}`;
  $$('.tabs button', body).forEach(b => b.addEventListener('click', () => { wz.method = b.dataset.m; renderWizard(host, onDone); }));
  const back = $('#w-back', body); if (back) back.addEventListener('click', () => { if (wz.sheets.length) { toast('Önce eklenen formları kaldırın ya da vazgeçin.', 'warn'); return; } wz.step = 1; renderWizard(host, onDone); });
  $('#w-form', body).addEventListener('click', guard(async () => {
    const d = (wz.docId && state.docs.get(wz.docId)) || { isim: wz.isim, sorular: wz.key, ogrenciler: [], form: wz.form, id: null };
    if (!d.id) { await formDialogTemp(d); } else await formDialog(d);
  }));
  const nx = $('#w-next', body); if (nx) nx.addEventListener('click', () => { wz.step = 3; wz.sel = 0; renderWizard(host, onDone); });
  const m = $('#w-m', body);
  if (wz.method === 'optik') methodOptik(m, host, onDone);
  else if (wz.method === 'txt') methodTxt(m, host, onDone);
  else methodManual(m, host, onDone);
}

async function formDialogTemp(d) {
  // Kaydedilmemiş anahtar için de form üretilebilsin
  const tmp = { ...d, id: 'tmp', ogrenciler: [] };
  const { buildFormsPdf } = await import('../omr.js');
  const { resultsDialog, pdfFile } = await import('../generate.js');
  const res = await modal({ title: 'Optik form yazdır', content: `<label class="fld"><span>Boş form sayısı</span><input id="ft-b" type="number" min="1" value="30"></label><p class="small muted">Kişiye özel formlar için sınavı önce kaydedin ya da denemeyi selfdeneme'de hazırlayın.</p>`, buttons: [{ label: 'Vazgeç', value: null }, { label: 'Üret', value: m => Math.max(1, +$('#ft-b', m).value || 1) }] });
  if (!res) return;
  const pg = progress('Formlar üretiliyor');
  let pdf; try { pdf = await buildFormsPdf(tmp.form, [], res, (f, t) => pg.set(f, t)); } finally { pg.close(); }
  await resultsDialog('Optik formlar hazır', [pdfFile('Boş optik formlar', `${tmp.isim}_optik_form`, pdf)]);
}

function methodOptik(m, host, onDone) {
  m.innerHTML = `<div class="card">
    <div class="drop" id="o-drop" tabindex="0" style="padding:36px 16px"><h3>Taranmış PDF'leri ya da fotoğrafları buraya bırakın</h3><p class="muted">Fotokopi makinesinde "PDF'e tara" ile tek dosyada onlarca form olabilir. Telefonla çekilen fotoğraflar da olur.</p></div>
    <div class="grid g3" style="margin-top:16px">
      <div><b>Tarayıcı / fotokopi</b><p class="small muted">200–300 DPI, siyah-beyaz ya da gri. Belge besleyiciye tüm formları koyun.</p></div>
      <div><b>Telefon</b><p class="small muted">Formu düz bir zemine koyun, dört köşedeki siyah kareler kadrajda olsun, gölge düşürmeyin.</p></div>
      <div><b>Kontrol</b><p class="small muted">Program emin olamadığı işaretleri bir sonraki adımda size gösterir.</p></div>
    </div></div>`;
  const drop = $('#o-drop', m);
  const go = guard(async files => { if (files.length) { await readFiles(files); renderWizard(host, onDone); } });
  drop.addEventListener('click', async () => go(await pickFiles({ accept: 'application/pdf,.pdf,image/*', multiple: true })));
  drop.addEventListener('keydown', async e => { if (e.key === 'Enter') go(await pickFiles({ accept: 'application/pdf,.pdf,image/*', multiple: true })); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); go(Array.from(e.dataTransfer.files || [])); });
}

async function readFiles(files) {
  const pg = progress('Formlar okunuyor');
  let n = 0, fail = 0;
  try {
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const handle = async (canvas, label) => {
        pg.set((fi + 0.5) / files.length, `${label} okunuyor`);
        let r;
        try { r = await readSheet(canvas, wz.form); } catch (e) { r = { ok: false, error: e.message }; }
        // önizleme için küçük görüntü (okunamayanlar)
        let thumb = null;
        if (!r.ok) { const s = 900 / Math.max(canvas.width, canvas.height); const c = makeCanvas(canvas.width * s, canvas.height * s); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); thumb = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.8)); }
        wz.sheets.push({ id: uid('s'), label, ok: r.ok, error: r.error || '', no: r.no || '', noFlag: r.noFlag || (r.ok ? '' : 'Okunamadı'), answers: r.ok ? r.answers : ' '.repeat(wz.key.length), flags: r.flags || new Map(), rectBlob: r.rectBlob || null, thumb, isim: '', sube: '', kaynak: 'optik' });
        n++; if (!r.ok) fail++;
      };
      if (isPdf) {
        for await (const p of pdfPages(f, 1800)) { await handle(p.canvas, `${f.name} · s.${p.page}`); p.canvas.width = 1; }
      } else if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|heic)$/i.test(f.name)) {
        const c = await imageFileToCanvas(f); await handle(c, f.name); c.width = 1;
      }
    }
  } finally { pg.close(); }
  toast(`${n} form okundu${fail ? `, ${fail} tanesi okunamadı` : ''}.`, fail ? 'warn' : 'ok');
}

function methodTxt(m, host, onDone) {
  const N = wz.key.length;
  m.innerHTML = `<div class="card">
    <p class="muted" style="margin-top:0">Optik okuyucu cihazının ürettiği sabit genişlikli metin dosyası. Her satır bir öğrencidir. Maske, satırdaki her karakterin ne olduğunu söyler: <code>i</code> isim, <code>n</code> numara, <code>c</code> şube, <code>s</code> soru, diğer karakterler yok sayılır.</p>
    <label class="fld"><span>Maske <small>(${N} tane <code>s</code> olmalı)</small></span><input id="t-mask" value="${esc(wz.mask || '')}" style="font-family:ui-monospace,monospace" placeholder="iiiiiiiiiiiiiiiiiiiinnnnnccxssssssss…"></label>
    <div class="row gap" style="margin-top:12px"><button class="btn primary" id="t-file">Dosyayı seç ve oku</button><span class="small muted" id="t-info"></span></div>
    <div id="t-prev" style="margin-top:12px"></div></div>`;
  const mask = $('#t-mask', m);
  const info = () => { const s = (mask.value.match(/s/gi) || []).length; $('#t-info', m).textContent = `${s} soru alanı`; $('#t-info', m).style.color = s === N ? 'var(--ok)' : 'var(--bad)'; };
  mask.addEventListener('input', () => { wz.mask = mask.value; info(); }); info();
  $('#t-file', m).addEventListener('click', guard(async () => {
    const mk = mask.value;
    const pos = ch => [...mk].map((c, i) => c.toLowerCase() === ch ? i : -1).filter(i => i >= 0);
    const S = pos('s'), I = pos('i'), Nn = pos('n'), C = pos('c');
    if (S.length !== N) { await alertDlg(`Maskede ${S.length} soru alanı var, cevap anahtarında ${N} soru var. Eşit olmalı.`); return; }
    if (!Nn.length) { await alertDlg('Maskede numara alanı (n) olmalı.'); return; }
    const f = await pickFiles({ accept: '.txt,.dat,text/*' }); if (!f.length) return;
    const text = await readText(f[0]);
    let added = 0; const bad = [];
    text.replace(/\r/g, '').split('\n').forEach((line, li) => {
      if (!line.trim()) return;
      const get = arr => arr.map(i => line[i] || ' ').join('');
      const no = normNo(get(Nn).trim());
      const ans = get(S).toUpperCase().split('').map(c => LETTERS.slice(0, wz.secenek).includes(c) ? c : (c === ' ' ? ' ' : '*')).join('');
      if (!no) { bad.push(`Satır ${li + 1}: numara yok`); return; }
      wz.sheets.push({ id: uid('s'), label: `${f[0].name} · satır ${li + 1}`, ok: true, no, noFlag: '', answers: ans, flags: new Map([...ans].map((c, i) => c === '*' ? [i, 'Birden fazla işaret'] : null).filter(Boolean)), isim: get(I).trim().replace(/\s+/g, ' '), sube: get(C).trim().toLocaleUpperCase('tr-TR'), kaynak: 'txt' });
      added++;
    });
    toast(`${added} öğrenci okundu.`);
    if (bad.length) await alertDlg(bad.slice(0, 20).join('\n'), 'Atlanan satırlar');
    renderWizard(host, onDone);
  }));
}

function methodManual(m, host, onDone) {
  const N = wz.key.length;
  const studs = [...state.students.values()].sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.isim, b.isim));
  m.innerHTML = `<div class="card">
    <p class="muted" style="margin-top:0">Her öğrenci için numarayı seçin ve cevaplarını soru sırasıyla yazın. Boş bıraktığı soru için boşluk ya da <code>-</code> kullanın. Birden fazla satırı <code>numara[TAB]cevaplar</code> biçiminde yapıştırabilirsiniz.</p>
    <div class="row gap" style="align-items:flex-end">
      <label class="fld" style="width:200px"><span>Öğrenci</span><input id="mn-no" list="mn-sl" placeholder="Numara"><datalist id="mn-sl">${studs.map(s => `<option value="${esc(s.no)}">${esc(s.isim)} · ${esc(s.sube)}</option>`).join('')}</datalist></label>
      <label class="fld" style="flex:1;min-width:240px"><span>Cevaplar <small id="mn-c">0/${N}</small></span><input id="mn-a" style="font-family:ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase" autocomplete="off"></label>
      <button class="btn primary" id="mn-add">Ekle</button>
    </div>
    <details style="margin-top:12px"><summary class="small">Toplu yapıştır</summary><textarea id="mn-bulk" style="margin-top:8px;font-family:ui-monospace,monospace" placeholder="1203	ABCDA-BCDAE…"></textarea><button class="btn sm" id="mn-bulk-add" style="margin-top:6px">Satırları ekle</button></details>
  </div>`;
  const a = $('#mn-a', m);
  const norm = s => s.toUpperCase().replace(/[-_.]/g, ' ').replace(/[^A-E ]/g, '').slice(0, N);
  a.addEventListener('input', () => { $('#mn-c', m).textContent = `${a.value.length}/${N}`; });
  const add = (no, ans) => {
    no = normNo(no); ans = norm(ans).padEnd(N, ' ');
    if (!no) return 'Numara girin';
    wz.sheets.push({ id: uid('s'), label: 'Elle giriş', ok: true, no, noFlag: '', answers: ans, flags: new Map(), isim: '', sube: '', kaynak: 'elle' });
    return '';
  };
  $('#mn-add', m).addEventListener('click', () => { const e = add($('#mn-no', m).value, a.value); if (e) { toast(e, 'err'); return; } toast('Eklendi.'); renderWizard(host, onDone); });
  a.addEventListener('keydown', e => { if (e.key === 'Enter') $('#mn-add', m).click(); });
  $('#mn-bulk-add', m).addEventListener('click', () => {
    let n = 0;
    $('#mn-bulk', m).value.replace(/\r/g, '').split('\n').forEach(l => { const mm = /^\s*(\d+)[\t;, ]+(.*)$/.exec(l); if (mm && !add(mm[1], mm[2])) n++; });
    toast(`${n} satır eklendi.`); renderWizard(host, onDone);
  });
}

// ---------------- 3. Kontrol ----------------
function sheetIssues(s, dupNos) {
  const out = [];
  if (!s.ok) out.push(s.error || 'Okunamadı');
  if (s.noFlag) out.push(s.noFlag);
  if (s.no && dupNos.has(s.no)) out.push('Bu numara birden fazla formda var');
  if (s.no && !getStudent(s.no) && !s.isim) out.push('Numara kayıtlı değil');
  if (s.flags.size) out.push(`${s.flags.size} soruda belirsiz işaret`);
  return out;
}

async function stepReview(body, host, onDone) {
  const counts = {}; wz.sheets.forEach(s => { if (s.no) counts[s.no] = (counts[s.no] || 0) + 1; });
  const dupNos = new Set(Object.keys(counts).filter(k => counts[k] > 1));
  if (wz.addTo) { const e = state.exams.get(wz.addTo); Object.keys(e.sonuclar).forEach(no => { if (wz.sheets.some(s => s.no === no)) dupNos.add(no); }); }
  const issues = wz.sheets.map(s => sheetIssues(s, dupNos));
  const open = issues.filter(x => x.length).length;
  if (wz.sel >= wz.sheets.length) wz.sel = Math.max(0, wz.sheets.length - 1);
  body.innerHTML = `<div class="sheets">
    <aside class="card" style="padding:10px">
      <div class="row between" style="padding:4px 6px 8px"><b>${wz.sheets.length} form</b><span class="pill ${open ? 'warn' : 'ok'}">${open ? open + ' kontrol' : 'hepsi hazır'}</span></div>
      <div class="list" style="max-height:60vh">${wz.sheets.map((s, i) => { const st = getStudent(s.no); return `<div class="it ${i === wz.sel ? 'on' : ''}" data-i="${i}"><span class="grow"><b>${esc(s.no || '—')}</b> ${esc(st?.isim || s.isim || '')}<br><span class="small muted">${esc(s.label)}</span></span>${issues[i].length ? '<span class="pill warn">!</span>' : '<span class="pill ok">✓</span>'}</div>`; }).join('')}</div>
      <div class="row gap" style="margin-top:10px"><button class="btn sm" id="r-more">Form ekle</button><button class="btn sm ghost" id="r-next-issue" ${open ? '' : 'disabled'}>Sonraki sorunlu ›</button></div>
    </aside>
    <section id="r-detail"></section></div>
    <div class="card" style="margin-top:16px">
      <div class="form-grid">
        <label class="fld"><span>Sınav adı</span><input id="r-n" value="${esc(wz.isim)}" ${wz.addTo ? 'disabled' : ''}></label>
        <label class="fld"><span>Tarih</span><input id="r-t" type="date" value="${esc(wz.tarih)}" ${wz.addTo ? 'disabled' : ''}></label>
        ${sablon(wz.tur) && sablon(wz.tur).tytGerekli ? `<label class="fld"><span>TYT eşleştirmesi <small>(${wz.tur === 'YDT' ? 'DİL' : 'SAY, EA, SÖZ'} puanı için)</small></span><select id="r-tyt"><option value="">Eşleştirme yok (puan hesaplanmaz)</option>${[...state.exams.values()].filter(e => e.tur === 'TYT').sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(e => `<option value="${esc(e.id)}" ${wz.tytExamId === e.id ? 'selected' : ''}>${esc(e.isim)} · ${fmtDate(e.tarih)}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="row between gap" style="margin-top:14px"><span class="small muted">${open ? `${open} formda çözülmemiş uyarı var. Uyarılarla da kaydedebilirsiniz: belirsiz işaretler program kararıyla değerlendirilir.` : 'Tüm formlar hazır.'}</span>
      <button class="btn primary" id="r-save" ${wz.sheets.length ? '' : 'disabled'}>${wz.addTo ? 'Sonuçları sınava ekle' : 'Sınavı kaydet'}</button></div>
    </div>`;
  $$('[data-i]', body).forEach(el => el.addEventListener('click', () => { wz.sel = +el.dataset.i; stepReview(body, host, onDone); }));
  $('#r-more', body).addEventListener('click', () => { wz.step = 2; renderWizard(host, onDone); });
  const ni = $('#r-next-issue', body); if (ni) ni.addEventListener('click', () => { const n = wz.sheets.findIndex((s, i) => i > wz.sel && issues[i].length); wz.sel = n >= 0 ? n : issues.findIndex(x => x.length); stepReview(body, host, onDone); });
  const nm = $('#r-n', body); nm.addEventListener('input', () => { wz.isim = nm.value; });
  const tt = $('#r-t', body); tt.addEventListener('change', () => { wz.tarih = tt.value || todayISO(); });
  const ty = $('#r-tyt', body); if (ty) ty.addEventListener('change', () => { wz.tytExamId = ty.value || null; });
  $('#r-save', body).addEventListener('click', guard(() => saveAll(onDone, dupNos)));
  if (wz.sheets.length) await renderSheet($('#r-detail', body), wz.sheets[wz.sel], issues[wz.sel], () => stepReview(body, host, onDone));
}

async function renderSheet(box, s, iss, rerender) {
  const N = wz.key.length;
  const st = getStudent(s.no);
  let img = null;
  if (s.rectBlob) img = await loadImage(s.rectBlob);
  else if (s.thumb) img = await loadImage(s.thumb);
  const flagged = [...s.flags.keys()].sort((a, b) => a - b);
  box.innerHTML = `<div class="card">
    <div class="row between gap"><h3 style="margin:0">${esc(s.label)}</h3><button class="btn sm danger" id="sh-del">Formu çıkar</button></div>
    ${iss.length ? `<div class="banner" style="margin:12px 0">${iss.map(esc).join(' · ')}</div>` : '<p class="small" style="color:var(--ok)">Sorun yok.</p>'}
    ${!s.ok ? `<p class="muted">${s.thumb ? 'Formun köşeleri bulunamadı. Görüntüyü kontrol edin; dilerseniz cevapları aşağıya elle yazabilirsiniz.' : ''}</p>${img ? `<img src="${img.src}" alt="" style="max-width:100%;max-height:340px;border:1px solid var(--line);border-radius:8px">` : ''}` : ''}
    <div class="grid g2" style="margin-top:8px">
      <div class="stack">
        <label class="fld"><span>Öğrenci numarası</span><input id="sh-no" value="${esc(s.no)}" inputmode="numeric"></label>
        ${st ? `<p class="small"><b>${esc(st.isim)}</b> · ${esc(st.sube || 'şube yok')}</p>` : `<div class="form-grid"><label class="fld"><span>Ad soyad <small>(yeni öğrenci)</small></span><input id="sh-i" value="${esc(s.isim)}"></label><label class="fld"><span>Şube</span><input id="sh-s" value="${esc(s.sube)}"></label></div>`}
      </div>
      <div id="sh-nocrop"></div>
    </div>
    ${flagged.length ? `<h3 style="margin-top:16px">Kontrol edilecek sorular</h3><div id="sh-flags"></div>` : ''}
    <h3 style="margin-top:16px">Tüm cevaplar</h3>
    <div id="sh-all" class="tbl-box" style="max-height:340px;padding:4px 8px"></div>
  </div>`;
  const noInp = $('#sh-no', box);
  noInp.addEventListener('change', () => { s.no = normNo(noInp.value); s.noFlag = ''; rerender(); });
  const si = $('#sh-i', box), ss = $('#sh-s', box);
  if (si) si.addEventListener('input', () => { s.isim = si.value.trim(); });
  if (ss) ss.addEventListener('input', () => { s.sube = ss.value.trim().toLocaleUpperCase('tr-TR'); });
  $('#sh-del', box).addEventListener('click', () => { wz.sheets.splice(wz.sheets.indexOf(s), 1); rerender(); });
  const crop = (r, scale = 5) => {
    if (!img || !s.rectBlob) return null;
    const c = makeCanvas(r.w * scale * 2, r.h * scale * 2);
    c.getContext('2d').drawImage(img, r.x * 5, r.y * 5, r.w * 5, r.h * 5, 0, 0, c.width, c.height);
    return c;
  };
  if (s.ok && s.rectBlob) {
    const nc = crop(noCropRect(wz.form)); if (nc) { nc.style.maxWidth = '180px'; $('#sh-nocrop', box).appendChild(nc); }
  }
  const letters = LETTERS.slice(0, wz.secenek);
  const bubblesFor = i => `<span class="bubbles" data-q="${i}">${letters.map(L => `<b class="${s.answers[i] === L ? 'on' : ''} ${wz.key[i].cevap === L ? 'right' : ''}" data-l="${L}" title="${L}">${L}</b>`).join('')}<b data-l=" " title="Boş" class="${s.answers[i] === ' ' ? 'on' : ''}" style="border-style:dashed">–</b></span>`;
  const geo = formGeometry(wz.form);
  if (flagged.length) {
    const fb = $('#sh-flags', box);
    flagged.forEach(i => {
      const row = document.createElement('div'); row.className = 'flagrow';
      const k = wz.key[i];
      row.innerHTML = `<div><b>${esc(k.testKisa || k.testAd || k.ders)} ${geo.questions[i].no}</b><br><span class="small muted">${esc(s.flags.get(i))}</span></div><div class="cropc"></div><div>${bubblesFor(i)}</div>`;
      const c = crop(rowCropRect(wz.form, i)); if (c) { c.style.maxWidth = '260px'; row.querySelector('.cropc').appendChild(c); }
      fb.appendChild(row);
    });
  }
  const all = $('#sh-all', box);
  const grp = k => k.testAd || k.ders;
  const dersler = [...new Set(wz.key.map(grp))];
  all.innerHTML = dersler.map(d => `<div style="margin:8px 0"><b class="small">${esc(d)}</b><div class="row gap-s" style="margin-top:4px">${wz.key.map((k, i) => grp(k) === d ? `<span title="${esc(k.ders)} ${geo.questions[i].no} · doğru: ${k.cevap || '?'}" style="display:inline-flex;align-items:center;gap:3px;padding:2px 4px;border-radius:6px;${s.flags.has(i) ? 'background:var(--lv2)' : ''}"><span class="small muted" style="width:20px;text-align:right">${geo.questions[i].no}</span><select data-sel="${i}" style="width:54px;min-height:30px;padding:2px 4px;font-size:13px">${[' ', ...letters, '*'].map(L => `<option value="${L}" ${s.answers[i] === L ? 'selected' : ''}>${L === ' ' ? '–' : L === '*' ? '✱' : L}</option>`).join('')}</select></span>` : '').join('')}</div></div>`).join('') + '<p class="small muted">– boş, ✱ birden fazla işaret</p>';
  const setAns = (i, L) => { s.answers = s.answers.slice(0, i) + L + s.answers.slice(i + 1); s.flags.delete(i); };
  $$('.bubbles b', box).forEach(b => b.addEventListener('click', () => { const i = +b.parentElement.dataset.q; setAns(i, b.dataset.l); rerender(); }));
  $$('[data-sel]', box).forEach(sel => sel.addEventListener('change', () => { setAns(+sel.dataset.sel, sel.value); rerender(); }));
  void N;
}

async function saveAll(onDone, dupNos) {
  const sheets = wz.sheets.filter(s => s.no);
  const noNo = wz.sheets.length - sheets.length;
  if (!sheets.length) { await alertDlg('Kaydedilecek, numarası olan form yok.'); return; }
  if (dupNos.size && !await confirmDlg(`Şu numaralar birden fazla kez geçiyor: ${[...dupNos].join(', ')}. Son okunan form geçerli sayılacak. Devam edilsin mi?`, { ok: 'Devam et' })) return;
  if (noNo && !await confirmDlg(`${noNo} formun numarası yok; bu formlar kaydedilmeyecek.`, { ok: 'Devam et' })) return;
  const unreadable = sheets.filter(s => !s.ok && !s.answers.trim()).length;
  if (unreadable && !await confirmDlg(`${unreadable} form okunamadı ve cevap girilmedi; bu öğrenciler tüm soruları boş bırakmış sayılacak.`, { ok: 'Devam et' })) return;
  // Öğrenci kayıtları
  const newStuds = [];
  for (const s of sheets) {
    const ex = getStudent(s.no);
    if (!ex) newStuds.push({ no: s.no, isim: s.isim || '', sube: s.sube || '', gorulen: {} });
    else if ((!ex.isim && s.isim) || (!ex.sube && s.sube)) { ex.isim = ex.isim || s.isim; ex.sube = ex.sube || s.sube; newStuds.push(ex); }
  }
  await saveStudents(newStuds);
  const sonuclar = {};
  for (const s of sheets) { const st = getStudent(s.no); sonuclar[s.no] = { isim: st?.isim || s.isim || '', sube: st?.sube || s.sube || '', cevaplar: s.answers }; }
  let exam;
  if (wz.addTo) {
    exam = state.exams.get(wz.addTo);
    Object.assign(exam.sonuclar, sonuclar);
    if (wz.tytExamId !== undefined) exam.tytExamId = wz.tytExamId || null;
    touch(exam);
  } else {
    exam = { id: uid('e'), tur: wz.tur || null, kismi: !!(wz.tur && wz.kismi), tytExamId: wz.tytExamId || null, isim: (wz.isim || 'Sınav').trim(), tarih: wz.tarih || todayISO(), secenek: wz.secenek, sorular: wz.key.map(k => ({ ...k })), sonuclar, puanlama: puanlamaSnapshot(), form: wz.form, docId: wz.docId || null, kaynak: [...new Set(sheets.map(s => s.kaynak))].join(', '), created: Date.now() };
  }
  await saveExam(exam);
  const id = exam.id;
  toast(`${Object.keys(sonuclar).length} öğrencinin sonucu kaydedildi${newStuds.length ? `, ${newStuds.length} öğrenci kaydı eklendi ya da güncellendi` : ''}.`);
  reset();
  onDone(id);
}
