import { state, saveQuestions, deleteQuestions, dersList, konuList, sortDersler, uniqueName, saveExam, examsSorted } from '../db.js';
import { esc, $, $$, cmpTr, fmtDate, fmtPct, pickFiles, LETTERS, trLower, debounce } from '../util.js';
import { modal, confirmDlg, toast, progress, emptyState, guard, optionList, alertDlg, promptDlg } from '../ui.js';
import { normalizeImage, parseName, newQuestion, importLegacy, filesFromZip } from '../importers.js';
import { evaluateExam, dogruOranindanZorluk, touch } from '../scoring.js';

let view = { tab: 'sorular', ders: '', konu: '', zorluk: '', cevap: '', q: '', limit: 60, picked: new Set(), pickMode: false };
let urls = [];
function freeUrls() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
function imgUrl(q) { const u = URL.createObjectURL(q.img); urls.push(u); return u; }
export function leave() { freeUrls(); }

export async function render(host) {
  freeUrls();
  const missing = [...state.questions.values()].filter(q => !q.cevap).length;
  host.innerHTML = `
  <div class="page-head"><div><h1>Soru Bankası</h1><p>Sorular ders › konu › zorluk (1 kolay … 5 zor) düzeninde tutulur. Ödev ve denemeler bu bankadan hazırlanır.</p></div>
    <div class="row gap"><a class="btn" href="#kirp">✂ Soru kırp</a><button class="btn" id="b-bulk">Toplu görsel ekle</button><button class="btn primary" id="b-legacy">İçe aktar</button></div></div>
  ${missing ? `<div class="banner"><span><b>${missing} sorunun cevabı tanımlı değil.</b> Bu sorular ödevde kullanılabilir ama cevap anahtarında "?" görünür ve sınav değerlendirmesine giremez.</span><button class="btn sm" id="b-missing">Cevapsızları göster</button></div>` : ''}
  <div class="tabs" role="tablist">
    <button data-t="sorular" class="${view.tab === 'sorular' ? 'on' : ''}">Sorular</button>
    <button data-t="analiz" class="${view.tab === 'analiz' ? 'on' : ''}">Zorluk analizi</button>
  </div>
  <div id="tab-body"></div>`;
  $$('.tabs button', host).forEach(b => b.addEventListener('click', () => { view.tab = b.dataset.t; render(host); }));
  $('#b-bulk', host).addEventListener('click', guard(() => bulkAdd(host)));
  $('#b-legacy', host).addEventListener('click', guard(() => legacyImport(host)));
  const bm = $('#b-missing', host);
  if (bm) bm.addEventListener('click', () => { view = { ...view, tab: 'sorular', ders: '', konu: '', zorluk: '', cevap: 'yok' }; render(host); });
  if (view.tab === 'sorular') renderQuestions($('#tab-body', host), host);
  else renderAnalysis($('#tab-body', host), host);
}

// ---------------- Sorular ----------------
function tree() {
  const t = new Map();
  for (const q of state.questions.values()) {
    if (!t.has(q.ders)) t.set(q.ders, new Map());
    const m = t.get(q.ders); m.set(q.konu, (m.get(q.konu) || 0) + 1);
  }
  return sortDersler([...t.keys()]).map(d => ({ ders: d, konular: [...t.get(d).entries()].sort((a, b) => cmpTr(a[0], b[0])), n: [...t.get(d).values()].reduce((a, b) => a + b, 0) }));
}

function filtered() {
  const s = trLower(view.q);
  return [...state.questions.values()].filter(q =>
    (!view.ders || q.ders === view.ders) && (!view.konu || q.konu === view.konu) && (!view.zorluk || q.zorluk === view.zorluk) &&
    (!view.cevap || (view.cevap === 'yok' ? !q.cevap : view.cevap === 'yatay' ? q.yatay : view.cevap === 'dikey' ? !q.yatay : true)) &&
    (!s || trLower(q.ad).includes(s) || trLower(q.konu).includes(s))
  ).sort((a, b) => cmpTr(a.ders, b.ders) || cmpTr(a.konu, b.konu) || a.zorluk.localeCompare(b.zorluk) || cmpTr(a.ad, b.ad));
}

function renderQuestions(body, host) {
  if (!state.questions.size) {
    body.innerHTML = `<div class="card">${emptyState('Soru bankanız boş', 'Başlamak için bir PDF ya da sayfa görüntüsünden soru kırpın, hazır soru görsellerini toplu yükleyin ya da eski Ödev Programı klasörünüzü içe aktarın. Ayrıntılar <a href="#rehber">rehberde</a>.', '<a class="btn primary" href="#kirp">Soru kırpmaya başla</a><button class="btn" id="e-bulk">Toplu görsel ekle</button>')}</div>`;
    const eb = $('#e-bulk', body); if (eb) eb.addEventListener('click', guard(() => bulkAdd(host)));
    return;
  }
  const tr = tree();
  const list = filtered();
  const shown = list.slice(0, view.limit);
  const zc = [1, 2, 3, 4, 5].map(z => list.filter(q => q.zorluk === String(z)).length);
  body.innerHTML = `<div class="split">
    <aside class="card" style="padding:0">
      <div class="list tree" style="border:0;max-height:none">
        <div class="leaf ${!view.ders ? 'on' : ''}" data-d="" data-k="" style="padding-left:12px"><span>Tüm sorular</span><span class="muted">${state.questions.size}</span></div>
        ${tr.map(d => `<details ${view.ders === d.ders ? 'open' : ''}><summary><span>${esc(d.ders)}</span><span class="row gap-s"><span class="muted small">${d.n}</span><button class="icon-btn" style="width:28px;height:28px;font-size:13px" data-ren-d="${esc(d.ders)}" title="Dersi yeniden adlandır" aria-label="Dersi yeniden adlandır">✎</button></span></summary>
          <div class="leaf ${view.ders === d.ders && !view.konu ? 'on' : ''}" data-d="${esc(d.ders)}" data-k=""><span>Tüm konular</span><span class="muted">${d.n}</span></div>
          ${d.konular.map(([k, n]) => `<div class="leaf ${view.ders === d.ders && view.konu === k ? 'on' : ''}" data-d="${esc(d.ders)}" data-k="${esc(k)}"><span>${esc(k)}</span><span class="row gap-s"><span class="muted">${n}</span><button class="icon-btn" style="width:26px;height:26px;font-size:12px" data-ren-k="${esc(k)}" data-ren-kd="${esc(d.ders)}" title="Konuyu yeniden adlandır" aria-label="Konuyu yeniden adlandır">✎</button></span></div>`).join('')}
        </details>`).join('')}
      </div>
    </aside>
    <section>
      <div class="card" style="padding:12px 14px">
        <div class="row gap">
          <select id="f-z" style="width:auto">${optionList(['1', '2', '3', '4', '5'], view.zorluk, { empty: 'Tüm zorluklar' }).replace(/>(\d)</g, '>Zorluk $1<')}</select>
          <select id="f-c" style="width:auto"><option value="">Tüm sorular</option><option value="yok" ${view.cevap === 'yok' ? 'selected' : ''}>Cevabı eksik</option><option value="yatay" ${view.cevap === 'yatay' ? 'selected' : ''}>Yatay (tam genişlik)</option><option value="dikey" ${view.cevap === 'dikey' ? 'selected' : ''}>Dikey (yarım genişlik)</option></select>
          <input id="f-q" placeholder="Soru adı ya da konu ara" value="${esc(view.q)}" style="flex:1;min-width:160px">
          <label class="check"><input type="checkbox" id="f-pick" ${view.pickMode ? 'checked' : ''}> Çoklu seçim</label>
        </div>
        <div class="row gap-s small muted" style="margin-top:10px">${list.length} soru · ${zc.map((n, i) => `Z${i + 1}: ${n}`).join(' · ')}</div>
        ${view.pickMode ? `<div class="row gap" style="margin-top:10px"><span class="pill">${view.picked.size} seçili</span><button class="btn sm" id="p-all">Listelenenleri seç</button><button class="btn sm" id="p-none">Seçimi temizle</button><button class="btn sm" id="p-move" ${view.picked.size ? '' : 'disabled'}>Taşı / zorluk değiştir</button><button class="btn sm danger" id="p-del" ${view.picked.size ? '' : 'disabled'}>Sil</button></div>` : ''}
      </div>
      <div class="qgrid" style="margin-top:14px">${shown.map(q => `<div class="qcard ${view.picked.has(q.id) ? 'picked' : ''}" data-q="${esc(q.id)}" tabindex="0" role="button" aria-label="${esc(q.ad)}">
        <div class="im"><img loading="lazy" alt="" src="${imgUrl(q)}"></div>
        <span class="ans ${q.cevap ? '' : 'none'}">${esc(q.cevap || '?')}</span>
        <span class="zr pill">Z${esc(q.zorluk)}${q.yatay ? ' · yatay' : ''}</span>
        ${view.pickMode ? `<input type="checkbox" class="sel" ${view.picked.has(q.id) ? 'checked' : ''} aria-label="Seç">` : ''}
        <div class="meta"><span title="${esc(q.konu)}">${esc(q.konu)}</span><span class="muted" title="${esc(q.ad)}">${esc(q.ad)}</span></div></div>`).join('')}</div>
      ${list.length > shown.length ? `<div class="row center" style="margin-top:16px"><button class="btn" id="more">${list.length - shown.length} soru daha göster</button></div>` : ''}
      ${!list.length ? `<div class="card" style="margin-top:14px"><p class="muted">Bu filtrelere uyan soru yok.</p></div>` : ''}
    </section></div>`;

  $$('.leaf[data-d]', body).forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    view.ders = el.dataset.d; view.konu = el.dataset.k; view.limit = 60; render(host);
  }));
  $$('[data-ren-d]', body).forEach(b => b.addEventListener('click', guard(async e => { e.preventDefault(); e.stopPropagation(); await renameDers(b.dataset.renD); render(host); })));
  $$('[data-ren-k]', body).forEach(b => b.addEventListener('click', guard(async e => { e.stopPropagation(); await renameKonu(b.dataset.renKd, b.dataset.renK); render(host); })));
  $('#f-z', body).addEventListener('change', e => { view.zorluk = e.target.value; render(host); });
  $('#f-c', body).addEventListener('change', e => { view.cevap = e.target.value; render(host); });
  $('#f-q', body).addEventListener('input', debounce(e => { view.q = e.target.value; render(host); setTimeout(() => { const i = $('#f-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 300));
  $('#f-pick', body).addEventListener('change', e => { view.pickMode = e.target.checked; if (!view.pickMode) view.picked.clear(); render(host); });
  const more = $('#more', body); if (more) more.addEventListener('click', () => { view.limit += 120; render(host); });
  if (view.pickMode) {
    $('#p-all', body).addEventListener('click', () => { list.forEach(q => view.picked.add(q.id)); render(host); });
    $('#p-none', body).addEventListener('click', () => { view.picked.clear(); render(host); });
    $('#p-move', body).addEventListener('click', guard(async () => { await bulkMove([...view.picked]); render(host); }));
    $('#p-del', body).addEventListener('click', guard(async () => {
      if (!await confirmDlg(`${view.picked.size} soru kalıcı olarak silinecek. Bu işlem geri alınamaz.`, { ok: 'Sil', danger: true })) return;
      await deleteQuestions([...view.picked]); toast(`${view.picked.size} soru silindi.`); view.picked.clear(); render(host);
    }));
  }
  $$('.qcard', body).forEach(c => {
    const open = guard(async e => {
      const id = c.dataset.q;
      if (view.pickMode) { if (view.picked.has(id)) view.picked.delete(id); else view.picked.add(id); render(host); return; }
      void e; await editQuestion(id); render(host);
    });
    c.addEventListener('click', open);
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
  });
}

function questionUsage(q) {
  let seen = 0;
  for (const s of state.students.values()) if (s.gorulen && s.gorulen[q.id]) seen++;
  let D = 0, Y = 0, B = 0, sinav = 0;
  for (const e of state.exams.values()) {
    const ev = evaluateExam(e);
    for (const si of ev.soruIst) if (si.qid === q.id || (!si.qid && trLower(si.ders) === trLower(q.ders) && trLower(si.konu) === trLower(q.konu) && trLower(si.ad) === trLower(q.ad))) { D += si.D; Y += si.Y; B += si.B; sinav++; }
  }
  return { seen, D, Y, B, sinav };
}

export async function editQuestion(id) {
  const q = state.questions.get(id);
  if (!q) return;
  const u = questionUsage(q);
  const url = URL.createObjectURL(q.img);
  const dl = dersList(), kl = konuList(q.ders);
  let cevap = q.cevap, zorluk = q.zorluk;
  const res = await modal({
    title: 'Soruyu düzenle', wide: true,
    content: `<div class="grid g2"><div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px;display:flex;align-items:center;justify-content:center;min-height:240px"><img src="${url}" alt="" style="max-width:100%;max-height:60vh"></div>
      <div class="stack">
        <label class="fld"><span>Ders</span><input id="e-d" list="e-dl" value="${esc(q.ders)}"><datalist id="e-dl">${dl.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <label class="fld"><span>Konu</span><input id="e-k" list="e-kl" value="${esc(q.konu)}"><datalist id="e-kl">${kl.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <div class="fld"><span>Zorluk</span><div class="seg" id="e-z">${[1, 2, 3, 4, 5].map(z => `<button type="button" data-z="${z}" class="${String(z) === zorluk ? 'on' : ''}">${z}</button>`).join('')}</div></div>
        <div class="fld"><span>Doğru cevap</span><div class="ansbtns" id="e-c">${LETTERS.map(L => `<button type="button" data-c="${L}" class="${L === cevap ? 'on' : ''}">${L}</button>`).join('')}</div></div>
        <label class="check"><input type="checkbox" id="e-y" ${q.yatay ? 'checked' : ''}> Yatay (sayfa genişliğinde) yerleştir</label>
        <label class="fld"><span>Soru adı</span><input id="e-a" value="${esc(q.ad)}"><small>Aynı konuda iki soru aynı adı taşıyamaz.</small></label>
        <p class="small muted">${u.seen} öğrenci bu soruyu gördü · ${u.sinav ? `${u.sinav} sınavda soruldu, doğru oranı ${fmtPct(u.D / Math.max(1, u.D + u.Y + u.B))}` : 'henüz sınavda sorulmadı'}${q.analiz ? ' · zorluğu analizle güncellendi' : ''} · ${fmtDate(new Date(q.created).toISOString().slice(0, 10))}</p>
      </div></div>`,
    buttons: [{ label: 'Sil', value: 'del', cls: 'danger' }, { label: 'Vazgeç', value: null, cls: '' }, { label: 'Kaydet', value: m => ({ ders: $('#e-d', m).value.trim(), konu: $('#e-k', m).value.trim(), ad: $('#e-a', m).value.trim(), yatay: $('#e-y', m).checked }) }],
    onMount: m => {
      $$('#e-z button', m).forEach(b => b.addEventListener('click', () => { zorluk = b.dataset.z; $$('#e-z button', m).forEach(x => x.classList.toggle('on', x === b)); }));
      $$('#e-c button', m).forEach(b => b.addEventListener('click', () => { cevap = cevap === b.dataset.c ? '' : b.dataset.c; $$('#e-c button', m).forEach(x => x.classList.toggle('on', x.dataset.c === cevap)); }));
      m.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return; const k = e.key.toUpperCase(); if (LETTERS.includes(k)) { const b = $(`#e-c [data-c="${k}"]`, m); b && b.click(); } if (/^[1-5]$/.test(e.key)) { const b = $(`#e-z [data-z="${e.key}"]`, m); b && b.click(); } });
    },
  });
  URL.revokeObjectURL(url);
  if (res === 'del') {
    if (u.seen || u.sinav) { if (!await confirmDlg(`Bu soru ${u.seen} öğrencinin geçmişinde ve ${u.sinav} sınav kaydında geçiyor. Silinirse sınav sonuçları korunur ama hata testlerinde kullanılamaz.`, { ok: 'Yine de sil', danger: true })) return; }
    await deleteQuestions([id]); toast('Soru silindi.'); return;
  }
  if (!res || typeof res !== 'object') return;
  const v = res;
  if (!v.ders || !v.konu) { await alertDlg('Ders ve konu boş bırakılamaz.'); return; }
  q.ders = v.ders; q.konu = v.konu; q.zorluk = zorluk; q.cevap = cevap; q.yatay = v.yatay;
  q.ad = uniqueName(q.ders, q.konu, v.ad || q.ad, q.id);
  await saveQuestions([q]);
  toast('Soru kaydedildi.');
}

async function bulkMove(ids) {
  const dl = dersList();
  const res = await modal({
    title: `${ids.length} soruyu taşı`,
    content: `<p class="muted small">Boş bıraktığınız alanlar değişmez.</p><div class="stack">
      <label class="fld"><span>Ders</span><input id="m-d" list="m-dl"><datalist id="m-dl">${dl.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      <label class="fld"><span>Konu</span><input id="m-k" list="m-kl"><datalist id="m-kl">${konuList('').map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      <label class="fld"><span>Zorluk</span><select id="m-z"><option value="">Değiştirme</option>${[1, 2, 3, 4, 5].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label class="fld"><span>Yerleşim</span><select id="m-y"><option value="">Değiştirme</option><option value="1">Yatay</option><option value="0">Dikey</option></select></label></div>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Uygula', value: m => ({ d: $('#m-d', m).value.trim(), k: $('#m-k', m).value.trim(), z: $('#m-z', m).value, y: $('#m-y', m).value }) }],
  });
  if (!res) return;
  const list = ids.map(id => state.questions.get(id)).filter(Boolean);
  for (const q of list) {
    if (res.d) q.ders = res.d; if (res.k) q.konu = res.k; if (res.z) q.zorluk = res.z; if (res.y !== '') q.yatay = res.y === '1';
    q.ad = uniqueName(q.ders, q.konu, q.ad, q.id);
  }
  await saveQuestions(list);
  toast(`${list.length} soru güncellendi.`);
}

async function renameEverywhere(match, apply) {
  const qs = [...state.questions.values()].filter(match);
  qs.forEach(apply);
  await saveQuestions(qs);
  for (const e of state.exams.values()) {
    let ch = false;
    for (const s of e.sorular) if (match(s)) { apply(s); ch = true; }
    if (ch) { touch(e); await saveExam(e); }
  }
  return qs.length;
}
async function renameDers(d) {
  const n = await promptDlg('Yeni ders adı', d, 'Dersi yeniden adlandır');
  if (!n || n === d) return;
  const c = await renameEverywhere(x => x.ders === d, x => { x.ders = n; });
  const ds = state.settings.dersSirasi; const i = ds.indexOf(d); if (i >= 0) ds[i] = n;
  toast(`${c} soru ve sınav kayıtları güncellendi.`);
}
async function renameKonu(d, k) {
  const n = await promptDlg('Yeni konu adı', k, 'Konuyu yeniden adlandır');
  if (!n || n === k) return;
  const c = await renameEverywhere(x => x.ders === d && x.konu === k, x => { x.konu = n; });
  toast(`${c} soru ve sınav kayıtları güncellendi.`);
}

// ---------------- Toplu görsel ekleme ----------------
async function bulkAdd(host) {
  let files = [];
  const dl = dersList();
  const res = await modal({
    title: 'Toplu görsel ekle', wide: true,
    content: `<div class="grid g3">
      <label class="fld"><span>Ders</span><input id="b-d" list="b-dl" value="${esc(view.ders)}"><datalist id="b-dl">${dl.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      <label class="fld"><span>Konu</span><input id="b-k" list="b-kl" value="${esc(view.konu)}"><datalist id="b-kl">${konuList(view.ders).map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      <label class="fld"><span>Zorluk</span><select id="b-z">${[1, 2, 3, 4, 5].map(z => `<option ${String(z) === (view.zorluk || '3') ? 'selected' : ''}>${z}</option>`).join('')}</select></label></div>
      <div class="grid g2" style="margin-top:12px">
      <label class="fld"><span>Yerleşim</span><select id="b-y"><option value="auto">Otomatik (en/boy oranına göre)</option><option value="name">Dosya adına göre ("y" ile başlayan yatay)</option><option value="0">Hepsi dikey (yarım genişlik)</option><option value="1">Hepsi yatay (tam genişlik)</option></select></label>
      <div class="fld"><span>Cevaplar</span><small>Dosya adının son harfi cevap kabul edilir: <code>soru12_c.png</code> → C. Aşağıdaki listeden değiştirebilirsiniz.</small></div></div>
      <div class="drop" id="b-drop" tabindex="0" style="margin-top:12px"><b>Görselleri buraya sürükleyin</b><br><span class="muted small">ya da tıklayıp seçin · PNG, JPG</span></div>
      <div id="b-list" style="margin-top:12px"></div>`,
    buttons: [{ label: 'Vazgeç', value: null }, {
      label: 'Bankaya ekle', value: m => ({ d: $('#b-d', m).value.trim(), k: $('#b-k', m).value.trim(), z: $('#b-z', m).value, y: $('#b-y', m).value, answers: $$('#b-list select', m).map(s => s.value) }),
      validate: async m => { if (!$('#b-d', m).value.trim() || !$('#b-k', m).value.trim()) { toast('Ders ve konu girin.', 'err'); return false; } if (!files.length) { toast('Önce görsel seçin.', 'err'); return false; } return true; },
    }],
    onMount: m => {
      const drop = $('#b-drop', m), list = $('#b-list', m);
      const show = () => {
        list.innerHTML = files.length ? `<div class="tbl-box" style="max-height:300px"><table class="tbl"><thead><tr><th>Dosya</th><th>Cevap</th></tr></thead><tbody>${files.map((f, i) => { const p = parseName(f.name); return `<tr><td>${esc(f.name)}</td><td><select data-i="${i}" style="width:90px"><option value="">?</option>${LETTERS.map(L => `<option ${L === p.cevap ? 'selected' : ''}>${L}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></div><p class="small muted">${files.length} görsel</p>` : '';
      };
      const add = fl => { files = files.concat(fl.filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name))); show(); };
      drop.addEventListener('click', async () => add(await pickFiles({ accept: 'image/*', multiple: true })));
      drop.addEventListener('keydown', async e => { if (e.key === 'Enter') add(await pickFiles({ accept: 'image/*', multiple: true })); });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add(Array.from(e.dataTransfer.files || [])); });
      $('#b-d', m).addEventListener('change', () => { $('#b-kl', m).innerHTML = konuList($('#b-d', m).value).map(d => `<option value="${esc(d)}">`).join(''); });
    },
  });
  if (!res) return;
  const pg = progress('Görseller ekleniyor');
  const out = []; const errs = [];
  try {
    for (let i = 0; i < files.length; i++) {
      pg.set(i / files.length, files[i].name);
      try {
        const { blob, w, h } = await normalizeImage(files[i]);
        const p = parseName(files[i].name);
        const yatay = res.y === 'auto' ? (w / h > 1.9) : res.y === 'name' ? p.yatayByName : res.y === '1';
        const q = newQuestion({ ders: res.d, konu: res.k, zorluk: res.z, ad: files[i].name, cevap: res.answers[i] || '', yatay, blob, w, h, kaynak: 'toplu ekleme' });
        state.questions.set(q.id, q); out.push(q);
      } catch (e) { errs.push(files[i].name + ': ' + e.message); }
    }
    await saveQuestions(out);
  } finally { pg.close(); }
  toast(`${out.length} soru eklendi.`);
  if (errs.length) await alertDlg('Bazı dosyalar eklenemedi:\n' + errs.join('\n'));
  view.ders = res.d; view.konu = res.k;
  render(host);
}

// ---------------- Eski program içe aktarma ----------------
async function legacyImport(host) {
  const how = await modal({
    title: 'Soru bankası içe aktar',
    content: `<p>Eski <b>Ödev Programı</b> kullanıyorsanız <code>banka</code> klasörünüzü olduğu gibi aktarabilirsiniz. Sorular, öğrenci geçmişleri ve sınav sonuçları birlikte gelir.</p>
      <pre style="background:var(--panel2);padding:10px;border-radius:8px;font-size:12.5px;overflow:auto">banka/
  sorular/Ders/Konu/Zorluk(1-5)/soru_adi_c.png
  ogrenciler/1234.json
  sinavlar/Deneme 1.json</pre>
      <p class="small muted">Aynı yapıdaki herhangi bir klasör de olur (yalnızca <code>sorular</code> klasörü bile yeterli). Klasör seçimi desteklenmiyorsa klasörü ZIP olarak sıkıştırıp seçin.</p>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'ZIP dosyası seç', value: 'zip', cls: '' }, { label: 'Klasör seç', value: 'dir' }],
  });
  if (!how) return;
  let files;
  if (how === 'dir') files = await pickFiles({ directory: true, multiple: true });
  else { const z = await pickFiles({ accept: '.zip,application/zip' }); if (!z.length) return; files = await filesFromZip(z[0]); }
  if (!files || !files.length) return;
  const pg = progress('İçe aktarılıyor');
  let sum;
  try { sum = await importLegacy(files, (f, t) => pg.set(f, t)); }
  finally { pg.close(); }
  await alertDlg(`${sum.soru} soru, ${sum.ogrenci} öğrenci ve ${sum.sinav} sınav aktarıldı.${sum.atlanan ? `\n${sum.atlanan} dosya atlandı (zaten bankada ya da yapıya uymuyor).` : ''}${sum.hatalar.length ? '\n\nHatalar:\n' + sum.hatalar.slice(0, 20).join('\n') : ''}`, 'İçe aktarma tamamlandı');
  render(host);
}

// ---------------- Zorluk analizi ----------------
let anView = { all: false, min: 10, picked: new Set() };
function analysisRows() {
  const m = new Map();
  for (const e of examsSorted()) {
    const ev = evaluateExam(e);
    for (const s of ev.soruIst) {
      let q = s.qid ? state.questions.get(s.qid) : null;
      if (!q && s.ad) q = [...state.questions.values()].find(x => trLower(x.ders) === trLower(s.ders) && trLower(x.konu) === trLower(s.konu) && trLower(x.ad) === trLower(s.ad)) || null;
      const key = q ? q.id : `${s.ders}|${s.konu}|${s.ad}`;
      if (!m.has(key)) m.set(key, { key, q, ders: s.ders, konu: s.konu, ad: q ? q.ad : (s.ad || '(adsız)'), D: 0, Y: 0, B: 0 });
      const r = m.get(key); r.D += s.D; r.Y += s.Y; r.B += s.B;
    }
  }
  return [...m.values()].map(r => { const n = r.D + r.Y + r.B; r.n = n; r.oran = n ? r.D / n : 0; r.guncel = r.q ? r.q.zorluk : '-'; r.oneri = String(dogruOranindanZorluk(r.oran)); return r; });
}

function renderAnalysis(body, host) {
  const rows = analysisRows();
  const vis = rows.filter(r => r.n >= anView.min && (anView.all || (r.q && r.guncel !== r.oneri)));
  body.innerHTML = `<div class="card">
    <p class="muted" style="margin-top:0">Sınavlardaki doğru oranına göre her sorunun gerçek zorluğu hesaplanır: %0–20 → 5, %21–40 → 4, %41–60 → 3, %61–80 → 2, %81–100 → 1. Onayladığınız soruların zorluğu bankada güncellenir ve "analiz edildi" olarak işaretlenir.</p>
    <div class="row gap" style="margin:12px 0">
      <label class="check"><input type="checkbox" id="a-all" ${anView.all ? 'checked' : ''}> Zorluğu değişmeyecek soruları da göster</label>
      <label class="row gap-s small">En az <input id="a-min" type="number" min="1" value="${anView.min}" style="width:80px"> cevap</label>
      <span class="grow"></span>
      <button class="btn sm" id="a-sel">Listelenenleri seç</button><button class="btn sm" id="a-none">Seçimi kaldır</button>
      <button class="btn primary sm" id="a-apply">Seçilenleri uygula (${[...anView.picked].filter(k => vis.some(r => r.key === k)).length})</button>
    </div>
    ${!rows.length ? '<p class="muted">Analiz için önce sınav değerlendirmelisiniz.</p>' : !vis.length ? '<p class="muted">Bu ölçütlere uyan soru yok. Cevap eşiğini düşürmeyi deneyin.</p>' : `<div class="tbl-box"><table class="tbl"><thead><tr><th></th><th>Ders</th><th>Konu</th><th>Soru</th><th class="num">D</th><th class="num">Y</th><th class="num">B</th><th class="num">Doğru oranı</th><th class="num">Güncel</th><th class="num">Önerilen</th></tr></thead><tbody>
    ${vis.map(r => `<tr><td>${r.q ? `<input type="checkbox" data-k="${esc(r.key)}" ${anView.picked.has(r.key) ? 'checked' : ''} aria-label="Seç">` : '<span class="pill warn" title="Soru bankada bulunamadı">yok</span>'}</td><td>${esc(r.ders)}</td><td>${esc(r.konu)}</td><td>${esc(r.ad)}</td><td class="num">${r.D}</td><td class="num">${r.Y}</td><td class="num">${r.B}</td><td class="num">${fmtPct(r.oran)}</td><td class="num">${esc(r.guncel)}</td><td class="num"><b>${esc(r.oneri)}</b></td></tr>`).join('')}
    </tbody></table></div>`}
  </div>`;
  $('#a-all', body).addEventListener('change', e => { anView.all = e.target.checked; render(host); });
  $('#a-min', body).addEventListener('change', e => { anView.min = Math.max(1, +e.target.value || 1); render(host); });
  $('#a-sel', body).addEventListener('click', () => { vis.forEach(r => r.q && anView.picked.add(r.key)); render(host); });
  $('#a-none', body).addEventListener('click', () => { anView.picked.clear(); render(host); });
  $$('input[data-k]', body).forEach(c => c.addEventListener('change', () => { if (c.checked) anView.picked.add(c.dataset.k); else anView.picked.delete(c.dataset.k); $('#a-apply', body).textContent = `Seçilenleri uygula (${[...anView.picked].filter(k => vis.some(r => r.key === k)).length})`; }));
  $('#a-apply', body).addEventListener('click', guard(async () => {
    const sel = vis.filter(r => r.q && anView.picked.has(r.key));
    if (!sel.length) { toast('Önce soru seçin.', 'warn'); return; }
    if (!await confirmDlg(`${sel.length} sorunun zorluğu önerilen değere göre güncellenecek.`, { ok: 'Uygula' })) return;
    sel.forEach(r => { r.q.zorluk = r.oneri; r.q.analiz = true; });
    await saveQuestions(sel.map(r => r.q));
    anView.picked.clear();
    toast(`${sel.length} sorunun zorluğu güncellendi.`);
    render(host);
  }));
}
