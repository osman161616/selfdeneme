import { state, saveStudents, deleteStudents, subeList } from '../db.js';
import { esc, $, $$, normNo, cmpTr, trLower, debounce, pickFiles, readText, toCSV, downloadFile, stamp } from '../util.js';
import { modal, confirmDlg, toast, emptyState, guard, sortableTable, alertDlg, optionList } from '../ui.js';
import { parseStudentRows } from '../importers.js';
import { go } from '../app.js';

let view = { q: '', sube: '' };

function examCount(no) { let n = 0; for (const e of state.exams.values()) if (e.sonuclar[no]) n++; return n; }

export async function render(host) {
  const subeler = subeList();
  host.innerHTML = `
  <div class="page-head"><div><h1>Öğrenciler</h1><p>Öğrenci numarası her şeyin anahtarıdır: optik formdaki numara bu listeyle eşleşir, ödev geçmişi numaraya göre tutulur.</p></div>
    <div class="row gap"><button class="btn" id="s-export">Listeyi indir</button><button class="btn" id="s-bulk">Toplu ekle</button><button class="btn primary" id="s-add">Öğrenci ekle</button></div></div>
  <div class="card">
    <div class="row gap" style="margin-bottom:12px">
      <input id="s-q" placeholder="Ad ya da numara ara" value="${esc(view.q)}" style="flex:1;min-width:180px">
      <select id="s-sube" style="width:auto">${optionList(subeler, view.sube, { empty: 'Tüm şubeler' })}</select>
    </div>
    <div id="s-table"></div>
  </div>`;
  $('#s-add', host).addEventListener('click', guard(async () => { await editStudent(null); render(host); }));
  $('#s-bulk', host).addEventListener('click', guard(async () => { await bulkAdd(); render(host); }));
  $('#s-export', host).addEventListener('click', guard(async () => {
    const rows = [['Numara', 'Ad Soyad', 'Şube', 'Görülen soru']].concat([...state.students.values()].sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.no, b.no)).map(s => [s.no, s.isim, s.sube, Object.keys(s.gorulen || {}).length]));
    await downloadFile(`ogrenciler_${stamp()}.csv`, toCSV(rows), 'text/csv');
  }));
  $('#s-q', host).addEventListener('input', debounce(e => { view.q = e.target.value; drawTable(host); }, 200));
  $('#s-sube', host).addEventListener('change', e => { view.sube = e.target.value; drawTable(host); });
  drawTable(host);
}

function drawTable(host) {
  const outer = $('#s-table', host);
  outer.innerHTML = '';
  const box = document.createElement('div');
  outer.appendChild(box);
  if (!state.students.size) {
    box.innerHTML = emptyState('Henüz öğrenci yok', 'Excel ya da e-Okul listesinden numara, ad soyad ve şube sütunlarını kopyalayıp <b>Toplu ekle</b> penceresine yapıştırabilirsiniz. Sınav okuttuğunuzda formdaki numaralar da otomatik eklenir.', '<button class="btn primary" id="e-bulk">Toplu ekle</button>');
    $('#e-bulk', box).addEventListener('click', guard(async () => { await bulkAdd(); render(host); }));
    return;
  }
  const q = trLower(view.q);
  const rows = [...state.students.values()].filter(s => (!view.sube || s.sube === view.sube) && (!q || trLower(s.isim).includes(q) || s.no.includes(q)))
    .map(s => ({ ...s, gor: Object.keys(s.gorulen || {}).length, sin: examCount(s.no), _s: s }));
  sortableTable(box, [
    { key: 'no', label: 'Numara', num: true, sortVal: r => Number(r.no) || 0 },
    { key: 'isim', label: 'Ad soyad' },
    { key: 'sube', label: 'Şube' },
    { key: 'gor', label: 'Gördüğü soru', num: true },
    { key: 'not', label: 'Not', nosort: true, html: r => [r.dinMuaf ? '<span class="pill">Din muaf</span>' : '', r.dilMuaf ? '<span class="pill">Dil muaf</span>' : '', r.diploma ? `<span class="pill">Diploma ${esc(r.diploma)}</span>` : ''].join(' ') },
    { key: 'sin', label: 'Sınav', num: true },
    { key: 'act', label: '', nosort: true, html: r => `<div class="row gap-s end"><button class="btn sm" data-an="${esc(r.no)}">Analiz</button><button class="btn sm" data-ed="${esc(r.no)}">Düzenle</button></div>` },
  ], rows, { sortKey: 'sube' });
  box.addEventListener('click', guard(async e => {
    const ed = e.target.closest('[data-ed]'); const an = e.target.closest('[data-an]');
    if (ed) { await editStudent(state.students.get(ed.dataset.ed)); render(host); }
    if (an) go('analiz', { tip: 'ogrenci', deger: an.dataset.an });
  }));
  const p = document.createElement('p'); p.className = 'small muted'; p.style.marginTop = '8px'; p.textContent = `${rows.length} öğrenci`; outer.appendChild(p);
}

async function editStudent(s) {
  const isNew = !s;
  const subeler = subeList();
  const res = await modal({
    title: isNew ? 'Öğrenci ekle' : 'Öğrenciyi düzenle',
    content: `<div class="stack">
      <label class="fld"><span>Numara</span><input id="st-no" inputmode="numeric" value="${esc(s ? s.no : '')}" ${isNew ? '' : 'disabled'}></label>
      <label class="fld"><span>Ad soyad</span><input id="st-i" value="${esc(s ? s.isim : '')}"></label>
      <label class="fld"><span>Şube</span><input id="st-s" list="st-sl" value="${esc(s ? s.sube : '')}" placeholder="ör. 8A"><datalist id="st-sl">${subeler.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <div class="form-grid">
        <label class="check"><input type="checkbox" id="st-dm" ${s && s.dinMuaf ? 'checked' : ''}> Din Kültürü dersinden muaf</label>
        ${state.settings.kurumTuru !== 'lise' ? `<label class="check"><input type="checkbox" id="st-ym" ${s && s.dilMuaf ? 'checked' : ''}> Yabancı dilden muaf (LGS)</label>` : ''}
      </div>
      <p class="small muted" style="margin:0">Din Kültürü muafı öğrenci LGS'de bu testten puanlanmaz (puanı diğer testlerden orantılanır); TYT ve AYT'de onun yerine ek Felsefe sorularını cevaplar.</p>
      ${state.settings.kurumTuru !== 'ortaokul' ? `<div class="form-grid"><label class="fld"><span>Diploma notu <small>(50–100, isteğe bağlı)</small></span><input id="st-dn" type="number" min="50" max="100" step="0.01" value="${esc(s && s.diploma ? s.diploma : '')}"></label>
        <label class="check" style="align-self:end"><input type="checkbox" id="st-oy" ${s && s.oncekiYerlesti ? 'checked' : ''}> Geçen yıl bir programa yerleşti (OBP × 0,06)</label></div>
      <p class="small muted" style="margin:0">Diploma notu girilirse YKS sonuçlarında yerleştirme puanı (OBP × 0,12) de gösterilir.</p>` : ''}
      ${!isNew ? `<p class="small muted">${Object.keys(s.gorulen || {}).length} soru görmüş. Geçmişi silerseniz program bu soruları öğrenciye yeniden verebilir.</p>` : ''}
    </div>`,
    buttons: isNew ? [{ label: 'Vazgeç', value: null }, { label: 'Kaydet', value: m => ({ no: $('#st-no', m).value, isim: $('#st-i', m).value.trim(), sube: $('#st-s', m).value.trim().toLocaleUpperCase('tr-TR'), dinMuaf: !!($('#st-dm', m) && $('#st-dm', m).checked), dilMuaf: !!($('#st-ym', m) && $('#st-ym', m).checked), diploma: $('#st-dn', m) ? (parseFloat(String($('#st-dn', m).value).replace(',', '.')) || null) : (s ? s.diploma || null : null), oncekiYerlesti: !!($('#st-oy', m) && $('#st-oy', m).checked) }) }]
      : [{ label: 'Sil', value: 'del', cls: 'danger' }, { label: 'Geçmişi sıfırla', value: 'reset', cls: '' }, { label: 'Vazgeç', value: null, cls: '' }, { label: 'Kaydet', value: m => ({ no: s.no, isim: $('#st-i', m).value.trim(), sube: $('#st-s', m).value.trim().toLocaleUpperCase('tr-TR'), dinMuaf: !!($('#st-dm', m) && $('#st-dm', m).checked), dilMuaf: !!($('#st-ym', m) && $('#st-ym', m).checked), diploma: $('#st-dn', m) ? (parseFloat(String($('#st-dn', m).value).replace(',', '.')) || null) : (s ? s.diploma || null : null), oncekiYerlesti: !!($('#st-oy', m) && $('#st-oy', m).checked) }) }],
  });
  if (!res) return;
  if (res === 'del') {
    if (!await confirmDlg(`${s.no} · ${s.isim} silinecek. Sınav sonuçları korunur ama ödev geçmişi silinir.`, { ok: 'Sil', danger: true })) return;
    await deleteStudents([s.no]); toast('Öğrenci silindi.'); return;
  }
  if (res === 'reset') {
    if (!await confirmDlg('Öğrencinin gördüğü soru geçmişi silinecek.', { ok: 'Sıfırla', danger: true })) return;
    s.gorulen = {}; await saveStudents([s]); toast('Geçmiş sıfırlandı.'); return;
  }
  const no = normNo(res.no);
  if (!no || !/^\d+$/.test(no)) { await alertDlg('Numara yalnızca rakamlardan oluşmalı.'); return; }
  if (isNew && state.students.has(no)) { await alertDlg(`${no} numaralı öğrenci zaten kayıtlı (${state.students.get(no).isim}).`); return; }
  if (res.diploma !== null && (res.diploma < 50 || res.diploma > 100)) { await alertDlg('Diploma notu 50 ile 100 arasında olmalı.'); return; }
  const extra = { dinMuaf: res.dinMuaf, dilMuaf: res.dilMuaf, diploma: res.diploma, oncekiYerlesti: res.oncekiYerlesti };
  const rec = isNew ? { no, isim: res.isim, sube: res.sube, gorulen: {}, ...extra } : Object.assign(s, { isim: res.isim, sube: res.sube, ...extra });
  await saveStudents([rec]);
  toast('Öğrenci kaydedildi.');
}

async function bulkAdd() {
  let parsed = [];
  const res = await modal({
    title: 'Toplu öğrenci ekle', wide: true,
    content: `<p class="muted" style="margin-top:0">Her satıra bir öğrenci: <b>numara</b>, <b>ad soyad</b> ve <b>şube</b> (sıra önemli değil; sekme, noktalı virgül ya da virgülle ayrılmış). Excel'den sütunları seçip yapıştırmanız yeterli.</p>
      <div class="grid g2"><div><textarea id="bk-t" style="min-height:240px;font-family:ui-monospace,monospace;font-size:13px" placeholder="1203	Ayşe Yılmaz	8A&#10;1207	Mehmet Kaya	8B"></textarea>
      <button class="btn sm" id="bk-file" style="margin-top:8px">CSV / TXT dosyasından al</button></div>
      <div><div id="bk-prev" class="tbl-box" style="max-height:290px"><p class="muted" style="padding:12px">Önizleme burada görünür.</p></div><p class="small muted" id="bk-sum"></p></div></div>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="bk-up" checked> Kayıtlı öğrencilerin ad ve şubesini güncelle</label>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Ekle', value: m => ({ up: $('#bk-up', m).checked }), validate: async () => { if (!parsed.length) { toast('Geçerli satır bulunamadı.', 'err'); return false; } return true; } }],
    onMount: m => {
      const t = $('#bk-t', m);
      const upd = () => {
        parsed = parseStudentRows(t.value);
        $('#bk-prev', m).innerHTML = parsed.length ? `<table class="tbl"><thead><tr><th>No</th><th>Ad soyad</th><th>Şube</th><th></th></tr></thead><tbody>${parsed.map(r => `<tr><td class="num">${esc(r.no)}</td><td>${esc(r.isim)}</td><td>${esc(r.sube)}</td><td>${state.students.has(r.no) ? '<span class="pill">kayıtlı</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:12px">Önizleme burada görünür.</p>';
        $('#bk-sum', m).textContent = parsed.length ? `${parsed.length} satır okundu, ${parsed.filter(r => !state.students.has(r.no)).length} yeni öğrenci.` : '';
      };
      t.addEventListener('input', debounce(upd, 200));
      $('#bk-file', m).addEventListener('click', async () => { const f = await pickFiles({ accept: '.csv,.txt,text/*' }); if (f.length) { t.value = await readText(f[0]); upd(); } });
    },
  });
  if (!res) return;
  const list = [];
  const seen = new Set();
  for (const r of parsed) {
    if (seen.has(r.no)) continue; seen.add(r.no);
    const ex = state.students.get(r.no);
    if (ex) { if (res.up) { ex.isim = r.isim || ex.isim; ex.sube = r.sube || ex.sube; list.push(ex); } }
    else list.push({ no: r.no, isim: r.isim, sube: r.sube, gorulen: {} });
  }
  await saveStudents(list);
  toast(`${list.length} öğrenci kaydedildi.`);
}
