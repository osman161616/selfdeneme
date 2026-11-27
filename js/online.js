// Online sınav (öğretmen tarafı): yayınlama, yönetim ve sonuçları sınava aktarma
import { state, saveDoc, saveExam, saveStudents, getStudent, markSeen, subeList } from './db.js';
import { API_DEFAULT, SOLVE_PATH } from './config.js';
import { api, packPackage, upload, solveUrl, maskName, cleanBase, ApiError } from './onlinepkg.js';
import { sablon } from './sinavlar.js';
import { puanlamaSnapshot, touch } from './scoring.js';
import { uid, todayISO, loadImage, makeCanvas, canvasToBlob, esc, $, $$, normNo, cmpTr, LETTERS } from './util.js';
import { modal, toast, progress, confirmDlg, alertDlg } from './ui.js';
import qrcode from '../vendor/qrcode.mjs';

export function apiBase() { return cleanBase(state.settings.onlineApi || API_DEFAULT); }
export function siteSolveBase() { return new URL(SOLVE_PATH, location.href.split('#')[0]).href; }
export function linkOf(doc) { return solveUrl(siteSolveBase(), doc.online.id, doc.online.api, API_DEFAULT); }

const pad = n => String(n).padStart(2, '0');
function toLocalInput(sec) { const d = new Date(sec * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalInput(v) { const t = new Date(v).getTime(); return Number.isFinite(t) ? Math.floor(t / 1000) : NaN; }
export function fmtTime(sec) { return new Date(sec * 1000).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); }
function endOfDay(daysAhead) { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(23, 59, 0, 0); return Math.floor(d.getTime() / 1000); }

/** Belgedeki sorular için şık sayısı */
function docSecenek(d) {
  const t = sablon(d.sablon);
  let n = (d.form && d.form.secenek) || (t && t.secenek) || state.settings.secenekSayisi || 5;
  if (d.sorular.some(s => String(s.cevap || '').toUpperCase() === 'E')) n = 5;
  return n === 4 ? 4 : 5;
}
const RESMI_SURE = { LGS: 155, TYT: 165, AYT: 180, YDT: 180 };

/** Değerlendirme için sınav anahtarı (değerlendirme sihirbazıyla aynı biçim) */
function keyOf(d) {
  return d.sorular.map(s => ({ ...s, qid: s.qid || null, zorluk: String(s.zorluk), cevap: (s.cevap || '').toUpperCase(), ad: s.ad || '' }));
}

/** Soru görselini küçült ve sıkıştır */
async function packImage(q) {
  const img = await loadImage(q.img);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const s = Math.min(1, 1400 / w0);
  const c = makeCanvas(w0 * s, h0 * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const cands = [];
  if (s === 1 && /^image\/(png|jpeg|webp)$/.test(q.img.type)) cands.push(q.img);
  try { const b = await canvasToBlob(c, 'image/webp', 0.9); if (b.type === 'image/webp') cands.push(b); } catch { /* */ }
  if (!cands.length || s < 1) { try { cands.push(await canvasToBlob(c, 'image/png')); } catch { /* */ } }
  if (!cands.length) cands.push(await canvasToBlob(c, 'image/jpeg', 0.92));
  const best = cands.reduce((a, b) => (b.size < a.size ? b : a));
  c.width = 1;
  const mm = q.mmw ? Number(q.mmw) : Math.min(180, w0 / 7.874);
  return { bytes: new Uint8Array(await best.arrayBuffer()), type: best.type, w: Math.round(w0 * s), h: Math.round(h0 * s), mm: Math.round(mm * 10) / 10 };
}

function errMsg(e) { return e instanceof ApiError ? e.message : (e && e.message) || String(e); }

// ------------------------------------------------------------------ Yayınla
export async function publishDialog(d, { onDone } = {}) {
  if (d.online && d.online.id) return manageDialog(d, { onDone });
  const missing = d.sorular.filter(s => !s.qid || !state.questions.get(s.qid));
  if (missing.length) { await alertDlg(`Bu belgedeki ${missing.length} soru artık soru bankasında yok (silinmiş olabilir). Online yayın için soruların görselleri gerekiyor; belgeyi yeniden hazırlayın.`, 'Yayınlanamıyor'); return; }
  const isDeneme = d.tur === 'deneme';
  const t = sablon(d.sablon);
  const subeler = subeList();
  const docN = d.ogrenciler.length;
  const sureDef = isDeneme && t && !d.kismi ? RESMI_SURE[t.id] || 0 : 0;
  const closeDef = isDeneme ? endOfDay(1) : endOfDay(7);
  const noCevap = d.sorular.filter(s => !String(s.cevap || '').trim()).length;
  const res = await modal({
    title: 'Online yayınla',
    wide: true,
    content: `<p class="muted" style="margin-top:0"><b>${esc(d.isim)}</b> · ${d.sorular.length} soru. Öğrenciler linki açıp soruları telefonda ya da bilgisayarda çözer; gönderdikleri cevaplar buraya sınav sonucu olarak gelir.</p>
      ${noCevap ? `<div class="banner"><span>${noCevap} sorunun doğru cevabı tanımlı değil; bu sorular herkes için yanlış sayılır. Önce Soru Bankası'nda cevaplarını girmeniz iyi olur.</span></div>` : ''}
      <div class="form-grid">
        <label class="fld"><span>Başlangıç</span><input type="datetime-local" id="op-a" value="${toLocalInput(Math.floor(Date.now() / 1000))}"><small>Bu saatten önce sorular açılmaz.</small></label>
        <label class="fld"><span>Bitiş</span><input type="datetime-local" id="op-b" value="${toLocalInput(closeDef)}"><small>Bu saatten sonra cevap kabul edilmez.</small></label>
        <label class="fld"><span>Süre (dakika)</span><input type="number" id="op-s" min="0" max="600" value="${sureDef}"><small>0 = süre sınırı yok. Süre, öğrenci başladığı anda işlemeye başlar.</small></label>
        <label class="fld"><span>Öğrenci sonucunu ne zaman görsün?</span><select id="op-r">
          <option value="hemen" ${!isDeneme ? 'selected' : ''}>Gönderir göndermez</option>
          <option value="bitince" ${isDeneme ? 'selected' : ''}>Sınavın bitiş saatinden sonra</option>
          <option value="gizli">Göstermeyin, ben paylaşırım</option></select></label>
      </div>
      <label class="fld" style="margin-top:12px"><span>Kimler çözebilir?</span><select id="op-k">
        ${docN ? `<option value="__doc">Bu belgenin öğrencileri (${docN})</option>` : ''}
        ${state.students.size ? `<option value="__all" ${!docN ? 'selected' : ''}>Kayıtlı bütün öğrenciler (${state.students.size})</option>` : ''}
        ${subeler.map(s => `<option value="s:${esc(s)}">${esc(s)} şubesi</option>`).join('')}
        <option value="__free" ${!docN && !state.students.size ? 'selected' : ''}>Linki alan herkes (numara, ad soyad ve şube yazarak)</option></select>
        <small>Listeden seçerseniz yalnızca o numaralar girebilir ve öğrenci adını yazmak zorunda kalmaz.</small></label>
      <p class="small muted" style="margin-bottom:0">Sunucuya yalnızca bu sınavın soruları, cevap anahtarı ve seçtiğiniz öğrencilerin numarasıyla adının kısaltması ("Ali Y.") gönderilir. Soru bankanız gönderilmez. Her şey bitiş saatinden 30 gün sonra sunucudan kendiliğinden silinir.</p>`,
    buttons: [{ label: 'Vazgeç', value: null }, {
      label: 'Yayınla',
      validate: async m => {
        const a = fromLocalInput($('#op-a', m).value), b = fromLocalInput($('#op-b', m).value);
        if (!Number.isFinite(a) || !Number.isFinite(b)) { toast('Başlangıç ve bitiş saatini seçin.', 'err'); return false; }
        if (b <= Date.now() / 1000 + 300) { toast('Bitiş saati en az 5 dakika sonrası olmalı.', 'err'); return false; }
        if (b <= a) { toast('Bitiş saati başlangıçtan sonra olmalı.', 'err'); return false; }
        if (b - a > 120 * 86400) { toast('Sınav en fazla 120 gün açık kalabilir.', 'err'); return false; }
        const s = +$('#op-s', m).value || 0;
        if (s < 0 || s > 600) { toast('Süre 0 ile 600 dakika arasında olmalı.', 'err'); return false; }
        return true;
      },
      value: m => ({ a: fromLocalInput($('#op-a', m).value), b: fromLocalInput($('#op-b', m).value), s: Math.floor(+$('#op-s', m).value || 0), r: $('#op-r', m).value, k: $('#op-k', m).value }),
    }],
  });
  if (!res) return;
  let nos = null;
  if (res.k === '__doc') nos = d.ogrenciler.slice();
  else if (res.k === '__all') nos = [...state.students.keys()];
  else if (res.k.startsWith('s:')) { const sb = res.k.slice(2); nos = [...state.students.values()].filter(s => s.sube === sb).map(s => s.no); }
  const students = nos ? nos.map(no => { const s = getStudent(no); return { no: normNo(no), ad: maskName(s?.isim), din: !!s?.dinMuaf, dil: !!s?.dilMuaf }; }).filter(s => s.no) : null;
  if (students && !students.length) { await alertDlg('Seçilen listede öğrenci yok.'); return; }
  await doPublish(d, { opensAt: res.a, closesAt: res.b, sure: res.s, sonuc: res.r, students });
  if (d.online) await manageDialog(d, { onDone, fresh: true });
}

async function doPublish(d, opt) {
  const base = apiBase();
  const pg = progress('Online sınav hazırlanıyor');
  let created = null;
  try {
    const secenek = docSecenek(d);
    const items = [];
    for (let i = 0; i < d.sorular.length; i++) {
      pg.set(0.5 * i / d.sorular.length, `Sorular hazırlanıyor (${i + 1}/${d.sorular.length})`);
      items.push(await packImage(state.questions.get(d.sorular[i].qid)));
    }
    const pkg = packPackage(items);
    if (pkg.length > 24 * 1024 * 1024) throw new Error(`Soru paketi çok büyük (${(pkg.length / 1048576).toFixed(1)} MB, en fazla 24 MB). Sınavı ikiye bölün.`);
    pg.set(0.5, 'Sunucuya bağlanılıyor');
    const puanlama = puanlamaSnapshot();
    const body = {
      title: d.isim, kurum: state.settings.kurum || '', tur: d.tur, sablon: d.sablon || '', kismi: !!d.kismi, secenek, puanlama,
      opensAt: opt.opensAt, closesAt: opt.closesAt, sure: opt.sure, sonuc: opt.sonuc, students: opt.students, pkgSize: pkg.length,
      key: d.sorular.map(s => { const c = String(s.cevap || '').toUpperCase(); return LETTERS.includes(c) ? c : '?'; }).join(''),
      questions: d.sorular.map(s => ({ no: s.no, ders: s.ders, konu: s.konu, zorluk: String(s.zorluk), testAd: s.testAd || '', testKisa: s.testKisa || '', test: s.test || '', alan: s.alan || '', slot: s.slot || '', slotAd: s.slotAd || '', secmeli: s.secmeli || '', secenek })),
    };
    created = await api(base, '/e', { method: 'POST', body, publishKey: state.settings.onlineKey || '' });
    pg.set(0.55, `Sorular yükleniyor (${(pkg.length / 1048576).toFixed(1)} MB)`);
    await upload(`${base}/e/${created.id}/pkg`, pkg, created.token, f => pg.set(0.55 + 0.43 * f, `Sorular yükleniyor (${Math.round(f * 100)}%)`));
    d.online = { id: created.id, token: created.token, api: base, opensAt: created.opensAt, closesAt: created.closesAt, sure: opt.sure, sonuc: opt.sonuc, liste: opt.students ? opt.students.length : 0, puanlama, created: Date.now(), examId: null };
    await saveDoc(d);
    pg.close();
    toast('Sınav yayınlandı.');
  } catch (e) {
    pg.close();
    if (created) { try { await api(base, `/e/${created.id}`, { method: 'DELETE', token: created.token }); } catch { /* */ } }
    await alertDlg(errMsg(e) + (e instanceof ApiError && e.code === 'ag' ? `\n\nSunucu adresi: ${base}\nAdres yanlışsa Ayarlar › Online sınav bölümünden düzeltin.` : ''), 'Yayınlanamadı');
  }
}

// ------------------------------------------------------------------ Yönetim
function qrSvg(text, cell = 5) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

export async function manageDialog(d, { onDone, fresh = false } = {}) {
  const o = d.online;
  const url = linkOf(d);
  let info = null, loadErr = '';
  const draw = m => {
    const now = Date.now() / 1000;
    const durum = info ? info.status : (now < o.opensAt ? 'once' : now >= o.closesAt ? 'kapali' : 'acik');
    const subs = info ? info.subs : null;
    const imported = o.examId && state.exams.get(o.examId);
    const newCount = subs && imported ? subs.filter(s => !imported.sonuclar[normNo(s.no)] || imported.sonuclar[normNo(s.no)].cevaplar !== s.a).length : subs ? subs.length : 0;
    $('.op-body', m).innerHTML = `
      ${fresh ? '<div class="banner" style="border-left-color:var(--ok);margin-top:0"><span><b>Sınav yayında.</b> Linki öğrencilerinize gönderin ya da karekodu tahtaya yansıtın.</span></div>' : ''}
      <div class="op-grid">
        <div class="op-qr" title="Karekodu büyüt" role="button" tabindex="0">${qrSvg(url)}</div>
        <div class="stack">
          <label class="fld"><span>Sınav linki</span><div class="row gap-s"><input readonly id="op-url" value="${esc(url)}" style="flex:1;font-family:ui-monospace,monospace;font-size:13px"><button class="btn sm" id="op-copy">Kopyala</button>${navigator.share ? '<button class="btn sm" id="op-share">Paylaş</button>' : ''}</div></label>
          <p class="small" style="margin:0">Sınav kodu: <b class="op-code">${esc(o.id)}</b> <span class="muted">· öğrenciler ${esc(siteSolveBase().replace(/^https?:\/\//, ''))} adresinden bu kodla da girebilir</span></p>
          <p class="small muted" style="margin:0">${durum === 'once' ? `<span class="pill warn">Başlamadı</span> ${fmtTime(o.opensAt)} tarihinde açılacak` : durum === 'acik' ? `<span class="pill ok">Açık</span> ${fmtTime(o.closesAt)} tarihine kadar` : `<span class="pill">Bitti</span> ${fmtTime(o.closesAt)} tarihinde kapandı`}
            ${o.sure ? ` · ${o.sure} dakika` : ''} · ${o.liste ? `${o.liste} kişilik liste` : 'herkese açık'} · sonuç: ${o.sonuc === 'hemen' ? 'hemen' : o.sonuc === 'bitince' ? 'bitişten sonra' : 'öğrenciye gösterilmez'}</p>
        </div>
      </div>
      <div class="op-stat">
        ${loadErr ? `<p class="small" style="color:var(--bad)">${esc(loadErr)}</p>` : subs ? `<p style="margin:0"><b>${subs.length}</b> öğrenci cevaplarını gönderdi${o.liste ? ` (listede ${o.liste} öğrenci var)` : ''}.${imported ? ` Sınava aktarılmamış ya da değişmiş: <b>${newCount}</b>.` : ''}</p>
          ${subs.length ? `<details style="margin-top:6px"><summary class="small">Gönderenleri göster</summary><div class="scroll" style="max-height:220px;margin-top:6px"><table class="tbl"><thead><tr><th>No</th><th>Ad</th><th>Şube</th><th>Gönderim</th><th class="num">Süre</th><th></th></tr></thead><tbody>
          ${subs.slice().sort((a, b) => cmpTr(a.sube, b.sube) || cmpTr(a.no, b.no)).map(s => { const st = getStudent(s.no); return `<tr><td>${esc(s.no)}</td><td>${esc(st?.isim || s.ad)}</td><td>${esc(st?.sube || s.sube)}</td><td class="small">${s.t1 ? new Date(s.t1).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${s.gec ? ' <span class="pill warn">süre aşımı</span>' : ''}</td><td class="num small">${s.t0 && s.t1 ? Math.max(1, Math.round((s.t1 - s.t0) / 60000)) + ' dk' : ''}</td><td><button class="btn sm ghost" data-reset="${esc(s.no)}" title="Bu öğrencinin gönderimini silip yeniden çözmesine izin ver">Yeniden çözsün</button></td></tr>`; }).join('')}
          </tbody></table></div></details>` : ''}` : '<p class="small muted" style="margin:0">Gönderim sayısı yükleniyor…</p>'}
      </div>
      <div class="row gap wrap" style="margin-top:12px">
        <button class="btn primary" id="op-imp" ${subs && subs.length ? '' : 'disabled'}>Sonuçları sınava aktar</button>
        <button class="btn" id="op-ref">Yenile</button>
        ${imported ? '<button class="btn" id="op-open">Sınav sonuçlarını aç</button>' : ''}
        <span class="grow"></span>
        ${durum !== 'kapali' ? '<button class="btn" id="op-end">Şimdi bitir</button>' : ''}
        <button class="btn" id="op-ext">Bitişi değiştir</button>
        <button class="btn ghost" id="op-del" style="color:var(--bad)">Yayını kaldır</button>
      </div>`;
    bind(m);
  };
  const refresh = async m => {
    try { info = await api(o.api, `/e/${o.id}/subs`, { token: o.token }); loadErr = ''; if (info.closesAt && info.closesAt !== o.closesAt) { o.closesAt = info.closesAt; await saveDoc(d); } }
    catch (e) {
      info = null; loadErr = errMsg(e);
      if (e instanceof ApiError && e.code === 'yok') loadErr = 'Sınav sunucuda bulunamadı; süresi dolup silinmiş olabilir. Daha önce aktardığınız sonuçlar bu bilgisayarda duruyor. "Yayını kaldır" ile bu kaydı temizleyebilirsiniz.';
    }
    if (m.isConnected) draw(m);
  };
  const bind = m => {
    const q = s => $(s, m);
    q('#op-copy') && q('#op-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('Link kopyalandı.'); } catch { q('#op-url').select(); document.execCommand && document.execCommand('copy'); toast('Link kopyalandı.'); } });
    q('#op-share') && q('#op-share').addEventListener('click', async () => { try { await navigator.share({ title: d.isim, text: `${d.isim} sınavı`, url }); } catch { /* vazgeçildi */ } });
    const big = () => modal({ title: d.isim, wide: true, content: `<div style="display:grid;place-items:center;gap:14px;text-align:center"><div style="width:min(70vh,520px)">${qrSvg(url, 10)}</div><div style="font:700 clamp(20px,4vw,34px) Archivo,sans-serif">${esc(siteSolveBase().replace(/^https?:\/\//, ''))}</div><div style="font:800 clamp(30px,7vw,60px) ui-monospace,monospace;letter-spacing:.12em">${esc(o.id)}</div></div>`, buttons: [{ label: 'Kapat', value: null }] });
    q('.op-qr').addEventListener('click', big);
    q('.op-qr').addEventListener('keydown', e => { if (e.key === 'Enter') big(); });
    q('#op-ref').addEventListener('click', () => { info = null; draw(m); refresh(m); });
    q('#op-open') && q('#op-open').addEventListener('click', () => { m.closest('.modal-back')?.querySelector('[data-x]')?.click(); import('./app.js').then(a => a.go('sinavlar', { open: o.examId })); });
    q('#op-imp').addEventListener('click', async () => {
      const b = q('#op-imp'); b.disabled = true;
      try { const r = await importResults(d, info.subs); toast(r.msg); draw(m); }
      catch (e) { await alertDlg(errMsg(e), 'Aktarılamadı'); b.disabled = false; }
    });
    q('#op-end') && q('#op-end').addEventListener('click', async () => {
      if (!await confirmDlg('Sınav şimdi bitirilsin mi? Henüz göndermemiş öğrenciler cevaplarını gönderemez (bağlantısı kopanlar için 10 dakika tolerans vardır).', { ok: 'Şimdi bitir', danger: true })) return;
      try { const r = await api(o.api, `/e/${o.id}`, { method: 'PATCH', token: o.token, body: { closesAt: Math.floor(Date.now() / 1000) } }); o.closesAt = r.closesAt; await saveDoc(d); toast('Sınav bitirildi.'); refresh(m); }
      catch (e) { await alertDlg(errMsg(e)); }
    });
    q('#op-ext').addEventListener('click', async () => {
      const v = await modal({ title: 'Bitiş saatini değiştir', content: `<label class="fld"><span>Yeni bitiş</span><input type="datetime-local" id="ex-b" value="${toLocalInput(Math.max(o.closesAt, Math.floor(Date.now() / 1000) + 3600))}"></label>`, buttons: [{ label: 'Vazgeç', value: null }, { label: 'Kaydet', value: mm => fromLocalInput($('#ex-b', mm).value) }] });
      if (!v || !Number.isFinite(v)) return;
      if (v <= Date.now() / 1000) { toast('Bitiş saati ileri bir zaman olmalı.', 'err'); return; }
      try { const r = await api(o.api, `/e/${o.id}`, { method: 'PATCH', token: o.token, body: { closesAt: v } }); o.closesAt = r.closesAt; await saveDoc(d); toast('Bitiş saati güncellendi.'); refresh(m); }
      catch (e) { await alertDlg(errMsg(e)); }
    });
    q('#op-del').addEventListener('click', async () => {
      if (!await confirmDlg('Sınav sunucudan silinsin mi? Link çalışmaz hâle gelir ve aktarılmamış gönderimler kaybolur. Sınava daha önce aktardığınız sonuçlar bu bilgisayarda kalır.', { ok: 'Yayını kaldır', danger: true })) return;
      try { await api(o.api, `/e/${o.id}`, { method: 'DELETE', token: o.token }); }
      catch (e) { if (!(e instanceof ApiError && (e.code === 'yok'))) { if (!await confirmDlg(`Sunucuya ulaşılamadı (${errMsg(e)}). Kayıt yine de bu bilgisayardan kaldırılsın mı? Sınav, bitişinden 30 gün sonra sunucudan kendiliğinden silinir.`, { ok: 'Kaldır' })) return; } }
      const examId = o.examId; delete d.online; if (examId) d.onlineExamId = examId; await saveDoc(d);
      toast('Yayın kaldırıldı.'); m.closest('.modal-back')?.querySelector('[data-x]')?.click();
    });
    $$('[data-reset]', m).forEach(b => b.addEventListener('click', async () => {
      const no = b.dataset.reset;
      if (!await confirmDlg(`${no} numaralı öğrencinin gönderimi sunucudan silinsin mi? Öğrenci linki yeniden açıp baştan çözebilir. (Sınava aktarılmış sonucu, yeni gönderimi aktarana kadar değişmez.)`, { ok: 'Sil, yeniden çözsün' })) return;
      try { await api(o.api, `/e/${o.id}/subs/${encodeURIComponent(no)}`, { method: 'DELETE', token: o.token }); toast('Öğrenci yeniden çözebilir.'); refresh(m); }
      catch (e) { await alertDlg(errMsg(e)); }
    }));
  };
  await modal({
    title: `Online sınav · ${d.isim}`, wide: true,
    content: '<div class="op-body"></div>',
    buttons: [{ label: 'Kapat', value: null }],
    onMount: m => { draw(m); refresh(m); },
  });
  onDone && onDone();
}

// ------------------------------------------------------------------ Sonuçları aktar
export async function importResults(d, subs) {
  const o = d.online;
  const key = keyOf(d);
  const N = key.length;
  const newStuds = [];
  const sonuclar = {};
  for (const s of subs) {
    const no = normNo(s.no);
    if (!no) continue;
    let st = getStudent(no);
    if (!st) { st = { no, isim: o.liste ? '' : (s.ad || ''), sube: s.sube || '', gorulen: {} }; newStuds.push(st); }
    else if (!o.liste && ((!st.isim && s.ad) || (!st.sube && s.sube))) { st.isim = st.isim || s.ad; st.sube = st.sube || s.sube; newStuds.push(st); }
    sonuclar[no] = { isim: st.isim || s.ad || '', sube: st.sube || s.sube || '', cevaplar: String(s.a || '').toUpperCase().replace(/[^A-E ]/g, ' ').padEnd(N, ' ').slice(0, N), online: { t0: s.t0 || null, t1: s.t1 || null, gec: !!s.gec } };
  }
  if (newStuds.length) await saveStudents(newStuds);
  let exam = o.examId ? state.exams.get(o.examId) : null;
  let yeni = 0, degisen = 0;
  if (exam) {
    for (const [no, r] of Object.entries(sonuclar)) {
      const prev = exam.sonuclar[no];
      if (!prev) yeni++; else if (prev.cevaplar !== r.cevaplar) degisen++; else continue;
      exam.sonuclar[no] = r;
    }
    touch(exam);
  } else {
    const t = sablon(d.sablon);
    let form = d.form || null;
    if (!form) { const { formSpecFromQuestions } = await import('./omr.js'); form = formSpecFromQuestions(d.isim, d.sorular, docSecenek(d), state.settings.noHane); }
    exam = { id: uid('e'), tur: d.sablon || null, kismi: !!(d.sablon && d.kismi), tytExamId: null, isim: d.isim, tarih: todayISO(), secenek: t ? t.secenek : docSecenek(d), sorular: key, sonuclar, puanlama: o.puanlama || puanlamaSnapshot(), form, docId: d.id, kaynak: 'online', online: true, odev: d.tur !== 'deneme', created: Date.now() };
    yeni = Object.keys(sonuclar).length;
    o.examId = exam.id;
    await saveDoc(d);
  }
  await saveExam(exam);
  const qids = d.sorular.map(s => s.qid).filter(Boolean);
  if (qids.length) await markSeen(Object.keys(sonuclar), qids);
  const msg = yeni || degisen ? `${yeni} yeni sonuç${degisen ? `, ${degisen} güncellenen sonuç` : ''} "${exam.isim}" sınavına aktarıldı.` : 'Yeni gönderim yok; sınavdaki sonuçlar güncel.';
  return { exam, yeni, degisen, msg };
}

/** Ayarlar sayfası: sunucu bağlantısını sına */
export async function testServer(base, key) {
  const r = await api(base, '/', { timeout: 15000 });
  if (r.service !== 'selfdeneme') throw new Error('Bu adres bir selfdeneme sunucusu değil.');
  return { ...r, keyNeeded: !!r.publishKey && !key };
}
