import { state, saveQuestions, deleteQuestions, dersList, konuList } from '../db.js';
import { esc, $, $$, pickFiles, makeCanvas, trimCanvas, canvasToBlob, LETTERS } from '../util.js';
import { toast, progress, guard, alertDlg, confirmDlg, modal } from '../ui.js';
import { normalizeItems, pageImages, detectQuestions, matchDers, parseKeyText, renderPage, detectWatermark, cropQuestion, removeWatermark, stackStem } from '../autocrop.js';
import { LISE_DERSLER, ORTAOKUL_DERSLER } from '../sinavlar.js';
import { attachKeyOcr } from '../keyocrui.js';
import { loadPdfJs, imageFileToCanvas } from '../omr.js';
import { newQuestion } from '../importers.js';

const S = {
  sources: [],     // [{type:'pdf', doc, name, pages} | {type:'img', file, name}]
  pages: [],       // [{src, index}]
  cur: 0, canvas: null, sel: null, saved: [],
  ders: '', konu: '', zorluk: '3', cevap: '', yatay: false, yatayManual: false,
  zoom: 1,
  auto: null,      // otomatik kesim sonucu (inceleme ekranı)
  autoView: false, filigran: true,
};
let keyHandler = null;
export function leave() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; }

export async function render(host) {
  leave();
  if (!S.ders) S.ders = state.settings.dersSirasi[0] || '';
  host.innerHTML = `
  <div class="page-head"><div><h1>Soru Kırp</h1><p>Bir test kitabının PDF'ini, kendi hazırladığınız sayfaları ya da telefon fotoğrafını açın; her sorunun etrafına bir dikdörtgen çizip ders, konu, zorluk ve cevabını seçin.</p></div>
    <div class="row gap"><button class="btn" id="c-open-img">Görsel aç</button><button class="btn primary" id="c-open-pdf">PDF aç</button></div></div>
  <div id="c-body"></div>`;
  $('#c-open-pdf', host).addEventListener('click', guard(() => openFiles(host, 'application/pdf,.pdf')));
  $('#c-open-img', host).addEventListener('click', guard(() => openFiles(host, 'image/*')));
  if (!S.pages.length) {
    $('#c-body', host).innerHTML = `<div class="card"><div class="drop" id="c-drop" tabindex="0" style="padding:48px 20px">
      <h3>PDF ya da sayfa görsellerini buraya bırakın</h3><p class="muted">Dosyalar bilgisayarınızdan çıkmaz; tüm işlem tarayıcıda yapılır.</p></div>
      <div class="grid g3" style="margin-top:18px">
        <div><b>1. Dikdörtgen çizin</b><p class="small muted">Soru numarası dahil ya da hariç, soru kökünden son şıkka kadar.</p></div>
        <div><b>2. Bilgileri seçin</b><p class="small muted">Kısayollar: <span class="kbd">A</span>–<span class="kbd">E</span> cevap, <span class="kbd">1</span>–<span class="kbd">5</span> zorluk.</p></div>
        <div><b>3. Kaydedin</b><p class="small muted"><span class="kbd">Enter</span> ile kaydedin. Ders, konu ve zorluk bir sonraki soru için hatırlanır.</p></div>
      </div>
      <div class="note" style="margin-top:16px"><b>Otomatik kesme:</b> Bilgisayarda hazırlanmış (taranmamış) PDF'lerde — MEB/ÖSYM çıkmış soruları, yayınevi denemeleri — PDF'i açtıktan sonra <b>Otomatik kes</b> düğmesine basın. Program soru numaralarını bulur, tüm soruları tek seferde keser, testleri derslere ayırır ve kitapçıkta varsa cevap anahtarını da okur. Siz yalnızca kontrol edip konu yazarsınız.</div>
      </div>`;
    const drop = $('#c-drop', host);
    drop.addEventListener('click', guard(() => openFiles(host, 'application/pdf,.pdf,image/*')));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', guard(async e => { e.preventDefault(); drop.classList.remove('over'); await addFiles(host, Array.from(e.dataTransfer.files || [])); }));
    return;
  }
  if (S.auto && S.autoView) renderAuto(host); else renderWork(host);
}

async function openFiles(host, accept) {
  const files = await pickFiles({ accept, multiple: true });
  if (files.length) await addFiles(host, files);
}

async function addFiles(host, files) {
  const pg = progress('Dosyalar açılıyor');
  try {
    for (const f of files) {
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
        const src = { type: 'pdf', doc, name: f.name };
        S.sources.push(src);
        for (let i = 1; i <= doc.numPages; i++) S.pages.push({ src, index: i });
      } else if (/^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)) {
        const src = { type: 'img', file: f, name: f.name };
        S.sources.push(src); S.pages.push({ src, index: 1 });
      }
    }
  } finally { pg.close(); }
  if (!S.pages.length) { await alertDlg('Açılabilir bir PDF ya da görsel bulunamadı.'); return; }
  await showPage(host, Math.min(S.cur, S.pages.length - 1));
}

async function pageCanvas(p) {
  if (p.src.type === 'img') {
    const c = await imageFileToCanvas(p.src.file);
    if (c.width > 2400) { const s = 2400 / c.width; const d = makeCanvas(c.width * s, c.height * s); d.getContext('2d').drawImage(c, 0, 0, d.width, d.height); return d; }
    return c;
  }
  const page = await p.src.doc.getPage(p.index);
  const vp0 = page.getViewport({ scale: 1 });
  p.ptW = vp0.width;
  const scale = 2000 / vp0.width;
  const vp = page.getViewport({ scale });
  const c = makeCanvas(vp.width, vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c;
}

async function showPage(host, i) {
  S.cur = Math.max(0, Math.min(S.pages.length - 1, i));
  S.sel = null;
  const pg = progress('Sayfa hazırlanıyor');
  try { S.canvas = await pageCanvas(S.pages[S.cur]); }
  finally { pg.close(); }
  renderWork(host);
}

function renderWork(host) {
  leave();
  const body = $('#c-body', host);
  const p = S.pages[S.cur];
  const dl = dersList();
  body.innerHTML = `<div class="crop-wrap">
    <div>
      <div class="row gap" style="margin-bottom:10px">
        <button class="btn sm" id="c-prev" ${S.cur === 0 ? 'disabled' : ''}>‹ Önceki</button>
        <span class="small"><b>${esc(p.src.name)}</b> · sayfa ${p.index}${p.src.type === 'pdf' ? '/' + p.src.doc.numPages : ''} <span class="muted">(${S.cur + 1}/${S.pages.length})</span></span>
        <button class="btn sm" id="c-next" ${S.cur >= S.pages.length - 1 ? 'disabled' : ''}>Sonraki ›</button>
        <span class="grow" style="flex:1"></span>
        <div class="seg" id="c-zoom"><button data-z="1" class="${S.zoom === 1 ? 'on' : ''}">Sığdır</button><button data-z="1.6" class="${S.zoom === 1.6 ? 'on' : ''}">Büyük</button></div>
        ${p.src.type === 'pdf' ? `<button class="btn sm primary" id="c-auto">${S.auto && S.auto.src === p.src ? 'Otomatik kesim listesi' : 'Otomatik kes'}</button>` : ''}
        <button class="btn sm ghost" id="c-close">Dosyaları kapat</button>
      </div>
      <div class="crop-stage" id="c-stage"></div>
      <p class="small muted" style="margin-top:8px">Fareyle ya da parmağınızla sürükleyerek seçin. Yeşil kutular bu oturumda kaydedilen sorulardır.</p>
    </div>
    <aside class="crop-side card">
      <div class="crop-prev" id="c-prev-img"><span class="muted small">Seçim yapınca soru burada görünür</span></div>
      <div class="stack">
        <label class="fld"><span>Ders</span><input id="c-d" list="c-dl" value="${esc(S.ders)}"><datalist id="c-dl">${dl.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <label class="fld"><span>Konu</span><input id="c-k" list="c-kl" value="${esc(S.konu)}" placeholder="ör. Üslü İfadeler"><datalist id="c-kl">${konuList(S.ders).map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <div class="fld"><span>Zorluk <small>(1 kolay · 5 zor)</small></span><div class="seg" id="c-z">${[1, 2, 3, 4, 5].map(z => `<button type="button" data-z="${z}" class="${String(z) === S.zorluk ? 'on' : ''}">${z}</button>`).join('')}</div></div>
        <div class="fld"><span>Doğru cevap</span><div class="ansbtns" id="c-c">${LETTERS.map(L => `<button type="button" data-c="${L}" class="${L === S.cevap ? 'on' : ''}">${L}</button>`).join('')}</div></div>
        <label class="check"><input type="checkbox" id="c-y" ${S.yatay ? 'checked' : ''}> Yatay (sayfa genişliğinde) yerleştir</label>
        <button class="btn primary" id="c-save" disabled>Soruyu kaydet <span class="kbd" style="color:inherit;background:transparent;border-color:rgb(255 255 255/.5)">Enter</span></button>
        <div class="row between small"><span class="muted">Bu oturumda ${S.saved.length} soru kaydedildi</span>${S.saved.length ? '<button class="btn sm ghost" id="c-undo">Sonuncuyu geri al</button>' : ''}</div>
      </div>
    </aside></div>`;
  const stage = $('#c-stage', body);
  const cv = S.canvas;
  const view = makeCanvas(cv.width, cv.height);
  view.getContext('2d').drawImage(cv, 0, 0);
  view.style.width = (S.zoom === 1 ? '100%' : (S.zoom * 100) + '%');
  view.style.maxWidth = S.zoom === 1 ? '100%' : 'none';
  stage.appendChild(view);
  const boxes = document.createElement('div'); boxes.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  stage.style.position = 'relative';
  stage.appendChild(boxes);

  const toScreen = r => {
    const s = view.clientWidth / cv.width;
    const off = view.offsetLeft;
    return { left: off + r.x * s, top: view.offsetTop + r.y * s, width: r.w * s, height: r.h * s };
  };
  const drawBoxes = () => {
    const page = S.pages[S.cur];
    boxes.innerHTML = S.saved.filter(x => x.page === page).map(x => { const b = toScreen(x.r); return `<div class="crop-box saved" data-l="${esc(x.label)}" style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px"></div>`; }).join('') +
      (S.sel ? (() => { const b = toScreen(S.sel); return `<div class="crop-box" style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px"></div>`; })() : '');
  };
  const ro = new ResizeObserver(drawBoxes); ro.observe(view);

  let start = null;
  const pos = e => { const rc = view.getBoundingClientRect(); const s = cv.width / rc.width; return { x: Math.max(0, Math.min(cv.width, (e.clientX - rc.left) * s)), y: Math.max(0, Math.min(cv.height, (e.clientY - rc.top) * s)) }; };
  view.addEventListener('pointerdown', e => { e.preventDefault(); view.setPointerCapture(e.pointerId); start = pos(e); S.sel = { x: start.x, y: start.y, w: 0, h: 0 }; drawBoxes(); });
  view.addEventListener('pointermove', e => { if (!start) return; const p2 = pos(e); S.sel = { x: Math.min(start.x, p2.x), y: Math.min(start.y, p2.y), w: Math.abs(p2.x - start.x), h: Math.abs(p2.y - start.y) }; drawBoxes(); });
  view.addEventListener('pointerup', () => {
    if (!start) return; start = null;
    if (!S.sel || S.sel.w < 20 || S.sel.h < 20) { S.sel = null; drawBoxes(); updatePreview(body); return; }
    if (!S.yatayManual) { S.yatay = S.sel.w / cv.width > 0.62; $('#c-y', body).checked = S.yatay; }
    drawBoxes(); updatePreview(body);
  });

  $('#c-prev', body).addEventListener('click', guard(() => showPage(host, S.cur - 1)));
  $('#c-next', body).addEventListener('click', guard(() => showPage(host, S.cur + 1)));
  $('#c-close', body).addEventListener('click', () => closeAll(host));
  const ab = $('#c-auto', body);
  if (ab) ab.addEventListener('click', guard(async () => { if (S.auto && S.auto.src === p.src) { S.autoView = true; renderAuto(host); } else await runAuto(host, p.src); }));
  $$('#c-zoom button', body).forEach(b => b.addEventListener('click', () => { S.zoom = +b.dataset.z; renderWork(host); }));
  $('#c-d', body).addEventListener('input', e => { S.ders = e.target.value; });
  $('#c-d', body).addEventListener('change', e => { S.ders = e.target.value.trim(); $('#c-kl', body).innerHTML = konuList(S.ders).map(d => `<option value="${esc(d)}">`).join(''); });
  $('#c-k', body).addEventListener('input', e => { S.konu = e.target.value; });
  $$('#c-z button', body).forEach(b => b.addEventListener('click', () => { S.zorluk = b.dataset.z; $$('#c-z button', body).forEach(x => x.classList.toggle('on', x === b)); }));
  $$('#c-c button', body).forEach(b => b.addEventListener('click', () => { S.cevap = S.cevap === b.dataset.c ? '' : b.dataset.c; $$('#c-c button', body).forEach(x => x.classList.toggle('on', x.dataset.c === S.cevap)); }));
  $('#c-y', body).addEventListener('change', e => { S.yatay = e.target.checked; S.yatayManual = true; });
  $('#c-save', body).addEventListener('click', guard(() => saveSel(host)));
  const undo = $('#c-undo', body);
  if (undo) undo.addEventListener('click', guard(async () => { const last = S.saved.pop(); if (last) { await deleteQuestions([last.id]); toast('Son soru silindi.'); } renderWork(host); }));

  keyHandler = e => {
    if (!document.body.contains(body)) return;
    if (document.querySelector('.modal-back')) return;
    const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'checkbox';
    if (e.key === 'Enter' && S.sel) { e.preventDefault(); $('#c-save', body).click(); return; }
    if (inField) return;
    const k = e.key.toUpperCase();
    if (LETTERS.includes(k)) { const b = $(`#c-c [data-c="${k}"]`, body); b && b.click(); }
    else if (/^[1-5]$/.test(e.key)) { const b = $(`#c-z [data-z="${e.key}"]`, body); b && b.click(); }
    else if (e.key === 'Escape') { S.sel = null; drawBoxes(); updatePreview(body); }
    else if (e.key === 'PageDown' || e.key === 'ArrowRight') { if (S.cur < S.pages.length - 1) showPage(host, S.cur + 1); }
    else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { if (S.cur > 0) showPage(host, S.cur - 1); }
  };
  document.addEventListener('keydown', keyHandler);
  updatePreview(body);
}

function closeAll(host) {
  freeAuto();
  S.sources.forEach(s => s.doc && s.doc.destroy()); S.sources = []; S.pages = []; S.canvas = null; S.sel = null; S.cur = 0;
  render(host);
}

function selCanvas() {
  if (!S.sel) return null;
  const c = makeCanvas(S.sel.w, S.sel.h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(S.canvas, S.sel.x, S.sel.y, S.sel.w, S.sel.h, 0, 0, c.width, c.height);
  const p = S.pages[S.cur];
  if (S.filigran && S.auto && S.auto.wm && p && S.auto.src === p.src) removeWatermark(c, S.auto.wm);
  return trimCanvas(c, 8);
}

function updatePreview(body) {
  const box = $('#c-prev-img', body), btn = $('#c-save', body);
  if (!box) return;
  const c = selCanvas();
  if (!c) { box.innerHTML = '<span class="muted small">Seçim yapınca soru burada görünür</span>'; btn.disabled = true; return; }
  box.innerHTML = ''; c.style.maxWidth = '100%'; c.style.height = 'auto'; box.appendChild(c); btn.disabled = false;
}

async function saveSel(host) {
  const body = $('#c-body', host);
  S.ders = $('#c-d', body).value.trim(); S.konu = $('#c-k', body).value.trim();
  if (!S.sel) return;
  if (!S.ders || !S.konu) { toast('Ders ve konu girin.', 'err'); ($('#c-k', body).value ? $('#c-d', body) : $('#c-k', body)).focus(); return; }
  const c = selCanvas();
  const blob = await canvasToBlob(c, 'image/png');
  const p = S.pages[S.cur];
  const base = p.src.name.replace(/\.[^.]+$/, '').slice(0, 30);
  const mmw = p.src.type === 'pdf' && p.ptW ? +(c.width * (p.ptW / S.canvas.width) * 25.4 / 72).toFixed(2) : undefined;
  const q = newQuestion({ ders: S.ders, konu: S.konu, zorluk: S.zorluk, ad: `${base}_s${p.index}_${(S.saved.length + 1)}${S.cevap ? '_' + S.cevap.toLowerCase() : ''}.png`, cevap: S.cevap, yatay: S.yatay, blob, w: c.width, h: c.height, mmw, kaynak: p.src.name });
  await saveQuestions([q]);
  S.saved.push({ id: q.id, page: p, r: { ...S.sel }, label: `${S.saved.length + 1}${S.cevap ? ' · ' + S.cevap : ''}` });
  toast(`Kaydedildi: ${S.ders} › ${S.konu} · Z${S.zorluk}${S.cevap ? ' · ' + S.cevap : ' · cevapsız'}`);
  S.sel = null; S.cevap = ''; S.yatayManual = false;
  renderWork(host);
}

// ======================= Otomatik kesme =======================

function freeAuto() {
  if (S.auto) S.auto.items.forEach(it => it.url && URL.revokeObjectURL(it.url));
  S.auto = null; S.autoView = false;
}

function knownDersler() {
  return [...new Set([...dersList(), ...(state.settings.dersSirasi || []), ...ORTAOKUL_DERSLER, ...LISE_DERSLER])];
}

async function runAuto(host, src) {
  const pg = progress('Sorular aranıyor');
  try {
    const doc = src.doc;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [x0, y0, x1, y1] = page.view;
      const w = x1 - x0, h = y1 - y0;
      const tc = await page.getTextContent();
      const items = normalizeItems(tc.items.map(it => ({ ...it, transform: [it.transform[0], it.transform[1], it.transform[2], it.transform[3], it.transform[4] - x0, it.transform[5] - y0] })), w, h);
      const imgs = await pageImages(page, (await loadPdfJs()).OPS);
      pages.push({ w, h, items, imgs });
      pg.set(i / doc.numPages * 0.25, `Sayfa ${i}/${doc.numPages} okunuyor`);
    }
    const res = detectQuestions(pages);
    if (!res.questions.length) {
      pg.close();
      await alertDlg(res.noText
        ? 'Bu PDF taranmış (fotoğraf/tarama) bir belge; içinde metin katmanı yok. Otomatik kesme yalnızca bilgisayarda hazırlanmış PDF\'lerde çalışır. Bu dosyadaki soruları elle kesebilirsiniz.'
        : 'Bu PDF\'te düzenli soru numarası ("1.", "2." …) bulunamadı. Soruları elle kesebilirsiniz.', 'Otomatik kesme yapılamadı');
      return;
    }
    const scale = 2000 / pages[0].w;
    // Her sayfayı bir kez çiz, sorularını kes, belleği bırak
    const byPage = new Map();
    res.questions.forEach(q => { if (!byPage.has(q.page)) byPage.set(q.page, []); byPage.get(q.page).push(q); });
    let wm = null;
    if (S.filigran) {
      // Filigran rengini birkaç sorunun ham görüntüsünden bul
      const pick = [...byPage.keys()].filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 8)) === 0).slice(0, 8);
      const raws = [];
      for (const pi of pick) {
        const c = await renderPage(await doc.getPage(pi + 1), scale);
        // Sayfanın soru alanının tamamı (başlık ve alt bilgi hariç): filigran sayfa başına bir kez, farklı yerde durabilir
        const qs = byPage.get(pi), x0 = Math.min(...qs.map(q => q.rect.x)), y0 = Math.min(...qs.map(q => q.rect.y));
        const x1 = Math.max(...qs.map(q => q.rect.x + q.rect.w)), y1 = Math.max(...qs.map(q => q.rect.y + q.rect.h));
        raws.push(cropQuestion(c, { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }, scale, { raw: true }));
      }
      wm = detectWatermark(raws);
    }
    const crops = new Map(), stemC = new Map();
    const stems = res.stems || [];
    const allPages = [...new Set([...byPage.keys(), ...stems.map(st => st.page)])].sort((a, b) => a - b);
    let k = 0;
    for (const pi of allPages) {
      const c = await renderPage(await doc.getPage(pi + 1), scale);
      stems.forEach((st, si) => { if (st.page === pi) stemC.set(si, cropQuestion(c, st, scale, { watermark: wm, trim: trimCanvas })); });
      for (const q of byPage.get(pi) || []) {
        let cv = cropQuestion(c, q, scale, { watermark: wm, trim: trimCanvas });
        if (q.stem >= 0 && stemC.has(q.stem)) cv = stackStem(stemC.get(q.stem), cv, Math.round(8 * scale));
        const blob = await canvasToBlob(cv, 'image/png');
        crops.set(q, { blob, w: cv.width, h: cv.height, mmw: +(cv.width / scale * 25.4 / 72).toFixed(2) });
      }
      k++; pg.set(0.25 + 0.75 * k / allPages.length, `Sorular kesiliyor (${k}/${allPages.length} sayfa)`);
    }
    const dersler = knownDersler();
    const old = S.auto && S.auto.src === src ? S.auto : null;
    freeAuto();
    // Şık sayısı önce sorulardan ("E)" var mı), yoksa anahtardan, o da yoksa ayarlardan
    const soruTest = res.tests.filter(t => t.tur !== 'cozum');
    const tespit = soruTest.filter(t => t.secenek);
    const secenek = tespit.some(t => t.secenek === 5) || res.tests.some(t => /E/.test(t.anahtar || '')) ? 5
      : tespit.length ? 4 : state.settings.secenekSayisi === 5 ? 5 : 4;
    S.auto = {
      src, scale, wm, secenek, warnings: res.warnings, anahtarSayfa: res.anahtarSayfa,
      tests: res.tests.map((t, i) => ({
        baslik: t.baslik || `${i + 1}. test`,
        ders: (old && old.tests[i] && old.tests[i].ders) || matchDers(t.baslik, dersler) || '',
        konu: (old && old.tests[i] && old.tests[i].konu) || '',
        zorluk: (old && old.tests[i] && old.tests[i].zorluk) || '3',
        anahtar: t.anahtar || '',
        anahtarKaynak: t.anahtarKaynak || '',
        bolumler: t.bolumler ? t.bolumler.map((b, k) => ({ ...b, ders: (old && old.tests[i] && old.tests[i].bolumler && old.tests[i].bolumler[k] && old.tests[i].bolumler[k].ders) || matchDers(b.ad, dersler) || '' })) : null,
        tur: t.tur || 'soru', cozumOf: t.cozumOf ?? -1, goster: false,
        pages: [...new Set(t.questions.map(q => q.page + 1))],
      })),
      items: res.questions.map(q => {
        const c = crops.get(q);
        const t = res.tests[q.test];
        const L0 = (t.anahtar || '')[t.questions.indexOf(q)] || '';
        const L = /^[A-E]$/.test(L0) ? L0 : '';
        return { q, pw: pages[q.page].w, test: q.test, n: q.n, blob: c.blob, w: c.w, h: c.h, mmw: c.mmw, stem: q.stem >= 0, url: URL.createObjectURL(c.blob), cevap: L, yatay: q.full && c.w / (q.contentW * scale) > 0.62, include: t.tur !== 'cozum', konu: '', saved: false };
      }),
    };
    S.autoView = true;
  } finally { pg.close(); }
  renderAuto(host);
}

/** Sorunun dersi: test bölümlere ayrılmışsa (ör. AYT: Edebiyat 1-24, Tarih-1 25-34) bölümün dersi */
function itemDers(t, it) {
  const b = t.bolumler && t.bolumler.find(x => it.n >= x.from && it.n <= x.to);
  return (b && b.ders) || t.ders || '';
}

function testLabel(t, i) {
  const A = S.auto;
  if (t.tur === 'cozum') return `Çözüm bölümü${t.baslik ? ' · ' + t.baslik : ''}`;
  const no = A ? A.tests.slice(0, i + 1).filter(x => x.tur !== 'cozum').length : i + 1;
  return `${no}. test${t.baslik ? ' · ' + t.baslik : ''}`;
}

function renderAuto(host) {
  leave();
  const A = S.auto;
  const body = $('#c-body', host);
  const letters = LETTERS.slice(0, A.secenek);
  const isSol = it => A.tests[it.test].tur === 'cozum';
  const qTests = A.tests.filter(t => t.tur !== 'cozum'), solTests = A.tests.filter(t => t.tur === 'cozum');
  const total = A.items.filter(i => !isSol(i)).length, inc = A.items.filter(i => i.include && !i.saved).length, saved = A.items.filter(i => i.saved).length;
  const noAns = A.items.filter(i => i.include && !i.saved && !i.cevap).length;
  body.innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <div class="row between wrap gap">
      <div>
        <h3 style="margin:0 0 4px">${total} soru bulundu · ${qTests.length} test${solTests.length ? ` <span class="muted small">· ${solTests.length} çözüm bölümü ayrıldı</span>` : ''}</h3>
        <p class="small muted" style="margin:0"><b>${esc(A.src.name)}</b> · ${A.anahtarSayfa ? `Cevap anahtarı ${A.anahtarSayfa}. sayfadan okundu.` : A.tests.some(t => t.anahtarKaynak === 'cozum') ? 'Cevaplar çözüm bölümlerindeki "Cevap: …" satırlarından alındı; anahtarı olmayan testleri siz doldurun.' : 'Kitapçıkta cevap anahtarı bulunamadı; her testin anahtarını aşağıya yapıştırabilir ya da tek tek işaretleyebilirsiniz.'}${A.wm ? ' Arka plandaki filigran temizlendi.' : ''}${saved ? ` · <b style="color:var(--ok)">${saved} soru bankaya kaydedildi</b>` : ''}</p>
        ${A.warnings.length ? `<p class="small" style="color:var(--bad);margin:6px 0 0">${A.warnings.map(esc).join('<br>')} Eksik soruları <b>Elle kesmeye dön</b> ile kesebilirsiniz.</p>` : ''}
      </div>
      <div class="row gap wrap">
        <label class="check small"><input type="checkbox" id="a-wm" ${S.filigran ? 'checked' : ''}> Filigranı temizle</label>
        <button class="btn sm" id="a-manual">Elle kesmeye dön</button>
        <button class="btn primary" id="a-save" ${inc ? '' : 'disabled'}>Seçilenleri bankaya kaydet (${inc})</button>
      </div>
    </div>
    <p class="small muted" style="margin:10px 0 0">Kontrol edin: her test için <b>ders</b> ve <b>konu</b> yazın (konu soru bazında da değiştirilebilir). Yanlış kesilmiş bir soru varsa <b>Elle düzelt</b>'e basın; sayfa açılır ve kutuyu siz ayarlarsınız. <b id="a-noans" style="color:var(--bad)">${noAns ? `${noAns} sorunun cevabı boş.` : ''}</b></p>
  </div>
  ${A.tests.map((t, ti) => {
    const its = A.items.filter(i => i.test === ti);
    const turSeg = `<div class="seg" data-tur="${ti}"><button type="button" data-v="soru" class="${t.tur !== 'cozum' ? 'on' : ''}">Soru testi</button><button type="button" data-v="cozum" class="${t.tur === 'cozum' ? 'on' : ''}">Çözüm bölümü</button></div>`;
    if (t.tur === 'cozum') {
      const hedef = t.cozumOf >= 0 ? A.tests[t.cozumOf] : null;
      const hi = t.cozumOf;
      return `<div class="card atest sol" data-t="${ti}" style="margin-bottom:16px">
        <div class="row between wrap gap">
          <div><h3 style="margin:0">${esc(testLabel(t, ti))} <span class="muted small">· ${its.length} çözüm · sayfa ${t.pages[0]}${t.pages.length > 1 ? '–' + t.pages[t.pages.length - 1] : ''}</span></h3>
          <p class="small muted" style="margin:4px 0 0">Çözüm bölümü olarak algılandı; bankaya <b>eklenmeyecek</b>.${hedef ? ` Ait olduğu test: <b>${esc(testLabel(hedef, hi))}</b>.${hedef.anahtarKaynak === 'cozum' ? ' Cevaplar buradan o teste aktarıldı.' : ''}` : ''} Yanlışsa "Soru testi"ni seçin.</p></div>
          <div class="row gap">${turSeg}<button class="btn sm ghost" data-gos="${ti}">${t.goster ? 'Gizle' : 'Göster'}</button></div>
        </div>
        ${t.goster ? `<div class="agrid" style="margin-top:12px">${its.map(it => `<div class="acard off"><div class="im" data-zoom2="${A.items.indexOf(it)}"><img src="${it.url}" alt="${it.n}. çözüm"></div><div class="ah"><b>${it.n}.</b></div></div>`).join('')}</div>` : ''}
      </div>`;
    }
    return `<div class="card atest" data-t="${ti}" style="margin-bottom:16px">
      <div class="row between wrap gap" style="margin-bottom:10px">
        <h3 style="margin:0">${esc(testLabel(t, ti))} <span class="muted small">· ${its.length} soru · sayfa ${t.pages[0]}${t.pages.length > 1 ? '–' + t.pages[t.pages.length - 1] : ''}</span></h3>
        <div class="row gap wrap">${turSeg}<button class="btn sm ghost" data-all="${ti}">${its.every(i => i.include || i.saved) ? 'Hiçbirini seçme' : 'Tümünü seç'}</button></div>
      </div>
      <div class="grid g4" style="align-items:end">
        ${t.bolumler ? `<div class="fld"><span>Ders</span><div class="small muted" style="padding:9px 0">${t.bolumler.length} bölüm, dersleri aşağıda</div></div>` : `<label class="fld"><span>Ders</span><input data-td="${ti}" list="a-dl" value="${esc(t.ders)}" placeholder="ör. Türkçe"></label>`}
        <label class="fld"><span>Konu <small>(bu testin tüm soruları)</small></span><input data-tk="${ti}" list="a-kl-${ti}" value="${esc(t.konu)}" placeholder="ör. LGS 2026 Çıkmış"><datalist id="a-kl-${ti}">${konuList(t.ders).map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <div class="fld"><span>Zorluk</span><div class="seg" data-tz="${ti}">${[1, 2, 3, 4, 5].map(z => `<button type="button" data-z="${z}" class="${String(z) === t.zorluk ? 'on' : ''}">${z}</button>`).join('')}</div></div>
        <label class="fld"><span>Cevap anahtarı <small>(ör. ABDAC…)</small></span><input data-ta="${ti}" value="${esc(its.map(i => i.cevap || '-').join(''))}" style="font-family:ui-monospace,monospace;letter-spacing:1px" spellcheck="false"></label>
      </div>
      ${t.bolumler ? `<div class="abol"><span class="small muted">Bu test birden çok dersten oluşuyor. Her bölümün dersini kontrol edin:</span><div class="abol-g">${t.bolumler.map((b, k) => `<label class="fld"><span>${esc(b.ad)} <small>(${b.from}–${b.to})</small></span><input data-tb="${ti}:${k}" list="a-dl" value="${esc(b.ders)}" placeholder="Ders seçin"></label>`).join('')}</div></div>` : ''}
      <div class="agrid" style="margin-top:12px">${its.map(it => acard(it, A.items.indexOf(it), letters)).join('')}</div>
    </div>`;
  }).join('')}
  <datalist id="a-dl">${knownDersler().map(d => `<option value="${esc(d)}">`).join('')}</datalist>`;
  bindAuto(host, body);
}

function acard(it, idx, letters) {
  return `<div class="acard ${it.include ? '' : 'off'} ${it.saved ? 'saved' : ''}" data-i="${idx}">
    <div class="im" data-zoom="${idx}" title="Büyütmek için tıklayın"><img src="${it.url}" alt="${it.n}. soru"></div>
    <div class="ah"><b>${it.n}.</b>${it.saved ? '<span class="pill ok">Kaydedildi</span>' : `<label class="check small"><input type="checkbox" data-inc ${it.include ? 'checked' : ''}> Ekle</label>`}</div>
    <div class="amini">${letters.map(L => `<button type="button" data-l="${L}" class="${it.cevap === L ? 'on' : ''}" ${it.saved ? 'disabled' : ''}>${L}</button>`).join('')}</div>
    <input class="akonu" data-konu value="${esc(it.konu)}" placeholder="Konu (boşsa testinki)" ${it.saved ? 'disabled' : ''}>
    <div class="row between small"><label class="check small"><input type="checkbox" data-yat ${it.yatay ? 'checked' : ''} ${it.saved ? 'disabled' : ''}> Yatay</label>${it.saved ? '' : '<button class="btn sm ghost" data-fix>Elle düzelt</button>'}</div>
  </div>`;
}

function bindAuto(host, body) {
  const A = S.auto;
  const itemOf = el => A.items[+el.closest('[data-i]').dataset.i];
  const refreshHead = () => {
    const inc = A.items.filter(i => i.include && !i.saved).length;
    const b = $('#a-save', body); b.disabled = !inc; b.textContent = `Seçilenleri bankaya kaydet (${inc})`;
  };
  const syncKey = ti => {
    const inp = $(`[data-ta="${ti}"]`, body); if (inp) inp.value = A.items.filter(i => i.test === ti).map(i => i.cevap || '-').join('');
    const na = A.items.filter(i => i.include && !i.saved && !i.cevap).length, el = $('#a-noans', body);
    if (el) el.textContent = na ? `${na} sorunun cevabı boş.` : '';
  };
  $('#a-wm', body).addEventListener('change', guard(async e => { S.filigran = e.target.checked; const saved = A.items.filter(i => i.saved).map(i => i.n + '/' + i.test); await runAuto(host, A.src); S.auto.items.forEach(i => { if (saved.includes(i.n + '/' + i.test)) { i.saved = true; i.include = false; } }); renderAuto(host); }));
  $('#a-manual', body).addEventListener('click', () => { S.autoView = false; renderWork(host); });
  $('#a-save', body).addEventListener('click', guard(() => saveAuto(host)));
  $$('[data-td]', body).forEach(inp => inp.addEventListener('change', () => { const t = A.tests[+inp.dataset.td]; t.ders = inp.value.trim(); $(`#a-kl-${inp.dataset.td}`, body).innerHTML = konuList(t.ders).map(d => `<option value="${esc(d)}">`).join(''); }));
  $$('[data-tb]', body).forEach(inp => inp.addEventListener('change', () => { const [ti, k] = inp.dataset.tb.split(':').map(Number); A.tests[ti].bolumler[k].ders = inp.value.trim(); }));
  $$('[data-tk]', body).forEach(inp => inp.addEventListener('input', () => { A.tests[+inp.dataset.tk].konu = inp.value; }));
  $$('[data-tz]', body).forEach(seg => $$('button', seg).forEach(b => b.addEventListener('click', () => { A.tests[+seg.dataset.tz].zorluk = b.dataset.z; $$('button', seg).forEach(x => x.classList.toggle('on', x === b)); })));
  $$('[data-ta]', body).forEach(inp => attachKeyOcr(inp, {
    expected: () => A.items.filter(i => i.test === +inp.dataset.ta).length,
    secenek: A.secenek,
    apply: k => { inp.value = k; inp.dispatchEvent(new Event('change')); },
    onFive: k => { A.secenek = 5; inp.value = k; inp.dispatchEvent(new Event('change')); renderAuto(host); toast('Şık sayısı 5 yapıldı.'); },
  }));
  $$('[data-ta]', body).forEach(inp => inp.addEventListener('change', () => {
    const ti = +inp.dataset.ta;
    const raw = inp.value.toUpperCase();
    // "-" ya da "?" boş demek; harf dizisi
    const seq = /^[A-E\-?_ ]+$/.test(raw.trim()) ? raw.replace(/\s+/g, '').split('') : parseKeyText(raw).split('');
    const its = A.items.filter(i => i.test === ti);
    its.forEach((it, k) => { if (it.saved) return; const L = seq[k]; it.cevap = L && /[A-E]/.test(L) && LETTERS.slice(0, A.secenek).includes(L) ? L : ''; });
    if (seq.filter(x => /[A-E]/.test(x)).length !== its.length) toast(`Anahtarda ${seq.filter(x => /[A-E]/.test(x)).length} harf var, testte ${its.length} soru var. Eksik kalanlar boş bırakıldı.`, 'err');
    $$(`.atest[data-t="${ti}"] .acard[data-i]`, body).forEach(card => { const it = itemOf(card); $$('[data-l]', card).forEach(b => b.classList.toggle('on', b.dataset.l === it.cevap)); });
    syncKey(ti);
  }));
  $$('[data-tur]', body).forEach(seg => $$('button', seg).forEach(b => b.addEventListener('click', () => {
    const ti = +seg.dataset.tur, t = A.tests[ti];
    if (t.tur === b.dataset.v) return;
    t.tur = b.dataset.v;
    A.items.filter(i => i.test === ti && !i.saved).forEach(i => { i.include = t.tur !== 'cozum'; });
    renderAuto(host);
  })));
  $$('[data-gos]', body).forEach(b => b.addEventListener('click', () => { const t = A.tests[+b.dataset.gos]; t.goster = !t.goster; renderAuto(host); }));
  $$('[data-zoom2]', body).forEach(el => el.addEventListener('click', () => { const it = A.items[+el.dataset.zoom2]; modal({ title: `${it.n}. çözüm`, wide: true, content: `<div style="text-align:center;background:#fff;padding:8px;border-radius:8px"><img src="${it.url}" style="max-width:100%;height:auto"></div>` }); }));
  $$('[data-all]', body).forEach(b => b.addEventListener('click', () => {
    const ti = +b.dataset.all; const its = A.items.filter(i => i.test === ti && !i.saved);
    const on = !its.every(i => i.include); its.forEach(i => { i.include = on; }); renderAuto(host);
  }));
  $$('.acard[data-i]', body).forEach(card => {
    const it = itemOf(card);
    const inc = $('[data-inc]', card);
    if (inc) inc.addEventListener('change', () => { it.include = inc.checked; card.classList.toggle('off', !it.include); refreshHead(); });
    $$('[data-l]', card).forEach(b => b.addEventListener('click', () => { it.cevap = it.cevap === b.dataset.l ? '' : b.dataset.l; $$('[data-l]', card).forEach(x => x.classList.toggle('on', x.dataset.l === it.cevap)); syncKey(it.test); }));
    const kk = $('[data-konu]', card); kk.addEventListener('input', () => { it.konu = kk.value; });
    kk.setAttribute('list', `a-kl-${it.test}`);
    $('[data-yat]', card).addEventListener('change', e => { it.yatay = e.target.checked; });
    $('[data-zoom]', card).addEventListener('click', () => modal({ title: `${testLabel(A.tests[it.test], it.test)} · ${it.n}. soru`, wide: true, content: `<div style="text-align:center;background:#fff;padding:8px;border-radius:8px"><img src="${it.url}" style="max-width:100%;height:auto"></div><p class="small muted">${it.w}×${it.h} piksel${it.cevap ? ' · cevap ' + it.cevap : ''}</p>` }));
    const fix = $('[data-fix]', card);
    if (fix) fix.addEventListener('click', guard(async () => {
      it.include = false;
      const t = A.tests[it.test];
      const idx = S.pages.findIndex(p => p.src === A.src && p.index === it.q.page + 1);
      S.ders = itemDers(t, it) || S.ders; S.konu = it.konu || t.konu || S.konu; S.zorluk = t.zorluk; S.cevap = it.cevap; S.yatay = it.yatay; S.yatayManual = true;
      S.autoView = false;
      await showPage(host, idx);
      const r = it.q.rect, k = S.canvas.width / it.pw;
      S.sel = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
      renderWork(host);
      toast('Kutuyu sürükleyerek yeniden çizebilir, sonra Enter ile kaydedebilirsiniz. Bu soru otomatik listeden çıkarıldı.');
    }));
  });
}

async function saveAuto(host) {
  const A = S.auto;
  const list = A.items.filter(i => i.include && !i.saved);
  if (!list.length) return;
  for (const [ti, t] of A.tests.entries()) {
    if (!list.some(i => i.test === ti)) continue;
    const dersiz = list.find(i => i.test === ti && !itemDers(t, i));
    if (dersiz) {
      const bk = t.bolumler ? t.bolumler.findIndex(b => dersiz.n >= b.from && dersiz.n <= b.to) : -1;
      toast(`${testLabel(t, ti)}: ${bk >= 0 ? `"${t.bolumler[bk].ad}" bölümünün dersini seçin.` : 'ders seçin.'}`, 'err');
      const el = $(bk >= 0 ? `[data-tb="${ti}:${bk}"]` : `[data-td="${ti}"]`, host); el && el.focus(); return;
    }
    const eksik = list.filter(i => i.test === ti && !(i.konu.trim() || t.konu.trim()));
    if (eksik.length) { toast(`${testLabel(t, ti)}: konu yazın (testin geneli için ya da soru bazında).`, 'err'); const el = $(`[data-tk="${ti}"]`, host); el && el.focus(); return; }
  }
  const noAns = list.filter(i => !i.cevap).length;
  if (noAns && !(await confirmDlg(`${noAns} sorunun cevabı boş. Cevapsız sorular ödev/denemede kullanılabilir ama otomatik puanlamaya katılmaz. Yine de kaydedilsin mi?`, { ok: 'Kaydet' }))) return;
  const base = A.src.name.replace(/\.[^.]+$/, '').replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, '_').slice(0, 24);
  const qs = list.map(it => {
    const t = A.tests[it.test];
    const ders = itemDers(t, it);
    const kisa = ((ders || 'test').split(/\s+/).map(w => w.replace(/[^\wçğıöşüÇĞİÖŞÜ]/g, '')).find(w => w.length > 2) || 'test').slice(0, 10);
    return { it, q: newQuestion({ ders, konu: (it.konu.trim() || t.konu.trim()), zorluk: t.zorluk, ad: `${base}_${kisa}_${String(it.n).padStart(2, '0')}${it.cevap ? '_' + it.cevap.toLowerCase() : ''}.png`, cevap: it.cevap, yatay: it.yatay, blob: it.blob, w: it.w, h: it.h, mmw: it.mmw, kaynak: A.src.name }) };
  });
  // Aynı oturumda isim çakışmasını önlemek için tek tek kaydet (uniqueName kayıtlı soruları görür)
  const pg = progress('Bankaya kaydediliyor');
  try {
    for (let k = 0; k < qs.length; k++) { await saveQuestions([qs[k].q]); qs[k].it.saved = true; qs[k].it.include = false; pg.set((k + 1) / qs.length); }
  } finally { pg.close(); }
  toast(`${qs.length} soru bankaya kaydedildi.`);
  renderAuto(host);
}
