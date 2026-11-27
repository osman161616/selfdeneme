// Öğrenci çözüm sayfası: linkle gelen ödev/denemeyi çöz, gönder, sonucunu gör
import { API_DEFAULT } from './config.js';
import { api, download, unpackPackage, parseSolveHash, ApiError } from './onlinepkg.js';
import { esc, $, $$, LETTERS } from './util.js';
import { modal, toast, confirmDlg } from './ui.js';

const root = $('#cz');
let S = null;
let timer = null;

// ---------------------------------------------------------------- yardımcılar
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const kRec = no => `sdc:${S.id}:${no}`;
const kLast = () => `sdc:last:${S.id}`;
const now = () => Date.now() + (S ? S.off : 0);
const N = () => S.meta.questions.length;
const fmtDT = ms => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' });
const fmtNet = v => (Math.round(v * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)} gün ${h % 24} sa`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
function randClient() { const b = crypto.getRandomValues(new Uint8Array(12)); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
function errText(e) { return (e && e.message) || String(e); }
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function statusNow() { const t = now(); return t < S.meta.opensAt * 1000 ? 'once' : t >= S.meta.closesAt * 1000 ? 'kapali' : 'acik'; }
function setView(html) { stopTimer(); document.body.classList.remove('cz-solving'); root.innerHTML = html; window.scrollTo(0, 0); }
function rec() { return S.rec; }
function saveRec() { if (S.rec) { S.rec.saved = Date.now(); if (!LS.set(kRec(S.rec.no), S.rec)) S.noStore = true; LS.set(kLast(), S.rec.no); } }
function freeImgs() { if (S && S.imgs) S.imgs.forEach(u => URL.revokeObjectURL(u)); }

function headCard(extra = '') {
  const m = S.meta;
  const sure = m.sure ? `${m.sure} dakika` : 'Süre sınırı yok';
  return `<section class="card cz-intro">
    ${m.kurum ? `<p class="small muted" style="margin:0 0 4px">${esc(m.kurum)}</p>` : ''}
    <h1>${esc(m.title)}</h1>
    <div class="cz-chips"><span class="pill">${m.questions.length} soru</span><span class="pill">${esc(sure)}</span><span class="pill">${m.tur === 'deneme' ? 'Deneme' : 'Ödev'}</span></div>
    <p class="small muted" style="margin-bottom:0">Son gönderim: <b>${esc(fmtDT(m.closesAt * 1000))}</b></p>
    ${extra}
  </section>`;
}

// ---------------------------------------------------------------- açılış
async function boot() {
  if (S) freeImgs();
  stopTimer();
  const { id, base } = parseSolveHash(location.hash, API_DEFAULT);
  S = { id, base, meta: null, off: 0, rec: null, imgs: [], review: false, revIdx: null, sending: false };
  if (!id) return renderCode();
  setView('<div class="card"><p class="muted" style="margin:0">Sınav bilgileri alınıyor…</p></div>');
  try { S.meta = await api(base, `/e/${id}`); }
  catch (e) {
    const yok = e instanceof ApiError && e.code === 'yok';
    return setView(`<section class="card"><h2>${yok ? 'Sınav bulunamadı' : 'Bağlanılamadı'}</h2><p>${esc(yok ? 'Bu kodla bir sınav yok ya da sınavın süresi dolup silinmiş. Linki ya da kodu öğretmeninden tekrar iste.' : errText(e))}</p>
      <div class="row gap" style="margin-top:12px">${yok ? '' : '<button class="btn primary" id="z-retry">Tekrar dene</button>'}<a class="btn" href="./">Başka kod gir</a></div></section>`) || bindRetry();
  }
  S.off = S.meta.now - Date.now();
  if (S.meta.questions.length > 0 && !S.meta.questions.every(q => q)) return setView('<p>Sınav bilgisi bozuk.</p>');
  const last = LS.get(kLast());
  if (last) {
    const r = LS.get(kRec(last));
    if (r && r.no) {
      S.rec = r;
      if (r.done) return renderDone();
      if (statusNow() === 'acik') return renderResume();
      if (statusNow() === 'kapali' && r.ans && r.ans.trim() && now() < S.meta.closesAt * 1000 + 9 * 60000) return renderLate();
    }
  }
  renderStart();
}
function bindRetry() { const b = $('#z-retry'); if (b) b.addEventListener('click', boot); }

function renderCode() {
  setView(`<section class="card cz-intro"><h1>Sınava gir</h1>
    <p class="muted">Öğretmeninin verdiği sınav kodunu yaz.</p>
    <form id="z-cf" class="row gap" style="margin-top:12px;align-items:flex-end">
      <label class="fld" style="flex:1;min-width:200px"><span>Sınav kodu</span><input id="z-code" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font:700 22px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase" placeholder="ör. K7M2QX9P"></label>
      <button class="btn primary" type="submit">Devam</button></form></section>`);
  $('#z-cf').addEventListener('submit', e => { e.preventDefault(); const v = $('#z-code').value.toUpperCase().replace(/[^0-9A-Z]/g, ''); if (v.length < 6) { toast('Kodu eksiksiz yaz.', 'err'); return; } location.hash = v; });
  setTimeout(() => $('#z-code') && $('#z-code').focus(), 50);
}

// ---------------------------------------------------------------- giriş
function renderStart(msg = '') {
  const st = statusNow();
  const m = S.meta;
  if (st === 'once') {
    setView(headCard(`<div class="cz-wait"><p>Sınav <b>${esc(fmtDT(m.opensAt * 1000))}</b> tarihinde açılacak.</p><p class="cz-count" id="z-cd"></p><button class="btn" id="z-rl">Yenile</button></div>`));
    $('#z-rl').addEventListener('click', boot);
    const tick = () => { const left = m.opensAt * 1000 - now(); if (left <= 0) { boot(); return; } const el = $('#z-cd'); if (el) el.textContent = 'Açılmasına ' + fmtLeft(left); };
    tick(); timer = setInterval(tick, 1000);
    return;
  }
  if (st === 'kapali') {
    setView(headCard(`<div class="banner" style="margin:14px 0 0"><span>Bu sınavın süresi doldu; artık cevap gönderilemez.</span></div>`) + (m.sonuc !== 'gizli' ? lookupCard() : ''));
    bindLookup();
    return;
  }
  setView(headCard() + `<section class="card"><h3>Kimsin?</h3>
    ${msg ? `<div class="banner"><span>${esc(msg)}</span></div>` : ''}
    <form id="z-id" class="stack">
      <label class="fld"><span>Okul numaran</span><input id="z-no" inputmode="numeric" autocomplete="off" maxlength="12" style="font-size:20px;max-width:220px"></label>
      ${m.liste ? '' : `<label class="fld"><span>Adın ve soyadın</span><input id="z-ad" autocomplete="name" maxlength="60"></label>
      <label class="fld"><span>Şuben <small>(ör. 8A)</small></span><input id="z-sb" maxlength="12" style="max-width:160px;text-transform:uppercase"></label>`}
      <button class="btn primary" type="submit" style="min-width:160px">Devam</button>
    </form></section>`);
  $('#z-id').addEventListener('submit', async e => {
    e.preventDefault();
    const no = $('#z-no').value.replace(/\D/g, '');
    if (!no) { toast('Okul numaranı yaz.', 'err'); return; }
    let ad = '', sube = '';
    if (!m.liste) {
      ad = $('#z-ad').value.trim().replace(/\s+/g, ' ');
      sube = $('#z-sb').value.trim().toLocaleUpperCase('tr-TR');
      if (ad.split(' ').length < 2) { toast('Adını ve soyadını birlikte yaz.', 'err'); return; }
    }
    const btn = e.submitter || $('#z-id button'); btn.disabled = true;
    try {
      const w = await api(S.base, `/e/${S.id}/who`, { method: 'POST', body: { no } });
      S.off = w.now - Date.now();
      const prev = LS.get(kRec(w.no));
      if (w.submitted) {
        if (prev && prev.done) { S.rec = prev; return renderDone(); }
        setView(headCard(`<div class="banner" style="margin:14px 0 0"><span>${esc(w.no)} numarasıyla bu sınav zaten gönderilmiş. Yeniden çözmen gerekiyorsa öğretmenine söyle.</span></div>`) + (m.sonuc !== 'gizli' ? lookupCard(w.no) : ''));
        bindLookup();
        return;
      }
      const base = prev && !prev.done ? prev : { no: w.no, ans: ' '.repeat(N()), flag: [], cur: 0, client: randClient() };
      Object.assign(base, { no: w.no, ad: m.liste ? w.ad : ad, sube: m.liste ? '' : sube, din: !!w.din, dil: !!w.dil, otherDevice: !!(w.startedAt && !(prev && prev.startedAt)) });
      S.rec = base;
      if (m.liste) return confirmWho(w);
      renderRules();
    } catch (err) { toast(errText(err), 'err', 6000); btn.disabled = false; }
  });
  setTimeout(() => $('#z-no') && $('#z-no').focus(), 50);
}

function confirmWho(w) {
  setView(headCard() + `<section class="card cz-who"><p class="muted" style="margin:0">${esc(w.no)} numaralı öğrenci</p><h2 style="margin:6px 0 14px">${esc(w.ad || 'İsim kayıtlı değil')}</h2>
    <p>Bu sen misin?</p><div class="row gap"><button class="btn primary" id="z-yes">Evet, benim</button><button class="btn" id="z-no2">Hayır, numarayı düzelt</button></div></section>`);
  $('#z-yes').addEventListener('click', renderRules);
  $('#z-no2').addEventListener('click', () => { S.rec = null; renderStart(); });
}

function renderRules() {
  const m = S.meta, r = rec();
  const resumed = r.ans && r.ans.trim().length;
  setView(headCard() + `<section class="card"><h3>Başlamadan önce</h3>
    <ul class="cz-rules">
      <li>Soruları istediğin sırayla çözebilir, cevabını sınav bitene kadar değiştirebilirsin. Bir şıkka tekrar dokunursan cevap silinir.</li>
      <li>Cevapların bu cihazda kaydedilir. Sayfa kapanırsa ya da internet giderse linki yeniden açıp kaldığın yerden devam edersin.</li>
      ${m.sure ? `<li><b>${m.sure} dakika</b> süren var; süre "Başla"ya bastığın anda işlemeye başlar ve sayfayı kapatsan da durmaz. Süre bitince cevapların kendiliğinden gönderilir.</li>` : ''}
      <li>Bitirince <b>Gönder</b>'e basmayı unutma. Gönderdikten sonra cevaplarını değiştiremezsin.</li>
      ${m.sonuc === 'hemen' ? '<li>Gönderir göndermez sonucunu ve yanlışlarını görürsün.</li>' : m.sonuc === 'bitince' ? `<li>Sonucunu sınavın bitişinden (${esc(fmtDT(m.closesAt * 1000))}) sonra bu sayfadan görebilirsin.</li>` : '<li>Sonuçları öğretmenin paylaşacak.</li>'}
    </ul>
    ${r.otherDevice ? '<div class="banner"><span>Bu sınava başka bir cihazda başlamışsın. O cihazda işaretlediğin cevaplar burada görünmez; mümkünse aynı cihazdan devam et.</span></div>' : ''}
    <div class="row gap" style="margin-top:14px"><button class="btn primary" id="z-go" style="min-width:180px">${resumed ? 'Kaldığım yerden devam et' : 'Başla'}</button><button class="btn ghost" id="z-back">Geri</button></div>
    <div id="z-dl" class="cz-dl" hidden><div class="cz-bar-p"><i></i></div><span class="small muted"></span></div></section>`);
  $('#z-back').addEventListener('click', () => { S.rec = null; renderStart(); });
  $('#z-go').addEventListener('click', start);
}

function renderResume() {
  const r = rec();
  const n = r.ans.replace(/ /g, '').length;
  setView(headCard() + `<section class="card"><h3>Kaldığın yerden devam et</h3>
    <p>${esc(r.ad || r.no)} olarak başladığın sınavda <b>${n}</b> soruyu cevaplamışsın. Henüz göndermedin.</p>
    <div class="row gap" style="margin-top:12px"><button class="btn primary" id="z-go">Devam et</button><button class="btn ghost" id="z-oth">Başka numarayla gir</button></div>
    <div id="z-dl" class="cz-dl" hidden><div class="cz-bar-p"><i></i></div><span class="small muted"></span></div></section>`);
  $('#z-go').addEventListener('click', start);
  $('#z-oth').addEventListener('click', () => { LS.del(kLast()); S.rec = null; renderStart(); });
}

function renderLate() {
  const r = rec();
  setView(headCard(`<div class="banner" style="margin:14px 0 0"><span>Sınavın süresi doldu ama cevapların henüz gönderilmedi. Birkaç dakika içinde gönderirsen kabul edilir.</span></div>
    <div class="row gap" style="margin-top:12px"><button class="btn primary" id="z-snd">Cevaplarımı şimdi gönder</button></div>`));
  $('#z-snd').addEventListener('click', () => submit(true));
  void r;
}

async function loadImages(onP) {
  if (S.imgs.length) return;
  const bytes = await download(`${S.base}/e/${S.id}/pkg`, onP, S.meta.pkgSize);
  const items = unpackPackage(bytes);
  if (items.length !== N()) throw new Error('Soru paketi sınavla uyuşmuyor. Öğretmenine haber ver.');
  S.items = items;
  S.imgs = items.map(it => URL.createObjectURL(it.blob));
}

async function start() {
  const btn = $('#z-go'); if (btn) btn.disabled = true;
  const box = $('#z-dl'); if (box) box.hidden = false;
  const setP = (f, t) => { if (!box) return; $('i', box).style.width = Math.round(f * 100) + '%'; $('span', box).textContent = t; };
  try {
    setP(0, 'Sorular indiriliyor…');
    await loadImages(f => setP(f, `Sorular indiriliyor… %${Math.round(f * 100)}`));
    setP(1, 'Hazırlanıyor…');
    const b = await api(S.base, `/e/${S.id}/begin`, { method: 'POST', body: { no: rec().no } });
    S.off = b.now - Date.now();
    const r = rec();
    if (!r.startedAt || S.meta.sure) r.startedAt = b.startedAt;
    if (typeof r.ans !== 'string' || r.ans.length !== N()) r.ans = (r.ans || '').padEnd(N(), ' ').slice(0, N());
    saveRec();
    renderSolve();
  } catch (e) {
    if (btn) btn.disabled = false;
    if (e instanceof ApiError && e.code === 'gonderildi') { toast('Bu numarayla sınav zaten gönderilmiş.', 'err', 6000); return boot(); }
    if (e instanceof ApiError && e.code === 'kapali') { toast('Sınavın süresi doldu.', 'err', 6000); return boot(); }
    setP(0, ''); if (box) box.hidden = true;
    toast(errText(e), 'err', 7000);
  }
}

// ---------------------------------------------------------------- çözüm ekranı
function deadline() {
  const m = S.meta;
  let d = m.closesAt * 1000;
  if (m.sure && rec().startedAt) d = Math.min(d, rec().startedAt + m.sure * 60000);
  return d;
}
function label(i) { const q = S.meta.questions[i]; return `${q.testKisa || q.testAd || q.ders} · ${q.no || i + 1}. soru`; }
function sectionOf(i) { const q = S.meta.questions[i]; return q.testAd || q.ders || 'Sorular'; }
function noteOf(i) {
  const q = S.meta.questions[i], r = rec() || {};
  if (q.secmeli === 'ekfel') return r.din ? 'Din Kültürü dersinden muaf olduğun için bu soruyu cevapla.' : 'Bu soru yalnızca Din Kültürü dersinden muaf öğrenciler içindir; diğer öğrenciler boş bırakır.';
  if (q.secmeli === 'din' || q.alan === 'LGS_DIN') return r.din ? 'Din Kültürü dersinden muaf olduğun için bu soru değerlendirilmez; boş bırakabilirsin.' : '';
  if (q.alan === 'LGS_DIL' && r.dil) return 'Yabancı dilden muaf olduğun için bu soru değerlendirilmez; boş bırakabilirsin.';
  return '';
}

function renderSolve() {
  const m = S.meta;
  S.review = false;
  setView(`<div class="cz-solve">
    <div class="cz-bar">
      <div class="cz-t"><b>${esc(m.title)}</b><span class="small muted" id="z-prog"></span></div>
      <span class="cz-timer" id="z-tm" hidden></span>
      <button class="btn sm" id="z-pal">Sorular</button>
      <button class="btn sm primary" id="z-end">Gönder</button>
    </div>
    ${S.noStore ? '<div class="banner"><span>Tarayıcın cevapları kaydetmeye izin vermiyor (gizli sekme olabilir). Sayfayı kapatmadan bitir ve gönder.</span></div>' : ''}
    <div class="cz-q">
      <div class="cz-qh"><span id="z-sec"></span><button class="cz-flag" id="z-flag" type="button"></button></div>
      <div class="cz-note" id="z-note" hidden></div>
      <div class="cz-img" id="z-imgw"><img id="z-img" alt=""></div>
    </div>
    <div class="cz-dock">
      <div class="cz-opts" id="z-opts"></div>
      <div class="cz-nav"><button class="btn" id="z-prev">‹ Önceki</button><span id="z-pos" class="small muted"></span><button class="btn" id="z-next">Sonraki ›</button></div>
    </div></div>`);
  document.body.classList.add('cz-solving');
  bindSolve();
  showQ(Math.min(Math.max(0, rec().cur || 0), N() - 1));
  const tick = () => {
    const left = deadline() - now();
    const el = $('#z-tm'); if (!el) return;
    const showT = m.sure || left < 6 * 3600 * 1000;
    el.hidden = !showT;
    if (showT) { el.textContent = fmtLeft(left); el.classList.toggle('low', left < 5 * 60000); }
    if (!S.warn5 && left < 5 * 60000 && left > 60000) { S.warn5 = true; toast('Son 5 dakika!', 'warn', 5000); }
    if (!S.warn1 && left < 60000 && left > 0) { S.warn1 = true; toast('Son 1 dakika! Süre bitince cevapların kendiliğinden gönderilecek.', 'warn', 6000); }
    if (left <= 0 && !S.autoSent) { S.autoSent = true; submit(true); }
  };
  tick(); timer = setInterval(tick, 1000);
}

function bindSolve() {
  $('#z-prev').addEventListener('click', () => step(-1));
  $('#z-next').addEventListener('click', () => step(1));
  $('#z-pal').addEventListener('click', palette);
  $('#z-end').addEventListener('click', () => (S.review ? renderDone() : submit(false)));
  $('#z-flag').addEventListener('click', () => {
    if (S.review) return;
    const r = rec(), i = S.cur, f = new Set(r.flag || []);
    f.has(i) ? f.delete(i) : f.add(i); r.flag = [...f]; saveRec(); showQ(i);
  });
  $('#z-img').addEventListener('click', () => $('#z-imgw').classList.toggle('zoom'));
}

function order() {
  if (!S.review || S.revFilter !== 'yanlis') return [...Array(N()).keys()];
  return S.revIdx;
}
function step(d) {
  const ord = order(); const p = ord.indexOf(S.cur);
  const nx = ord[p + d];
  if (nx === undefined) { if (!S.review && d > 0) toast('Son soru. Bitirdiysen "Gönder"e bas.', 'ok', 3000); return; }
  showQ(nx);
}

function showQ(i) {
  S.cur = i;
  const m = S.meta, q = m.questions[i];
  if (!S.review) { rec().cur = i; saveRec(); }
  const img = $('#z-img');
  img.src = S.imgs[i] || '';
  const it = S.items && S.items[i];
  const mm = (it && it.mm) || 120;
  img.style.width = Math.round(mm * 4.6) + 'px';
  img.alt = label(i);
  $('#z-imgw').classList.remove('zoom');
  $('#z-sec').textContent = label(i);
  const note = noteOf(i); const ne = $('#z-note'); ne.hidden = !note; ne.textContent = note;
  const ord = order(); const p = ord.indexOf(i);
  $('#z-pos').textContent = `${p + 1} / ${ord.length}`;
  $('#z-prev').disabled = p <= 0; $('#z-next').disabled = p >= ord.length - 1 && S.review;
  const nOpt = q.secenek || m.secenek || 5;
  const r = rec();
  const mine = (S.review ? S.ans : r.ans)[i];
  const fl = $('#z-flag');
  if (S.review) {
    const k = S.key[i];
    const ok = mine !== ' ' && mine === k, blank = mine === ' ';
    fl.textContent = k === '?' ? 'Cevap anahtarında yok' : blank ? `Boş · doğru cevap ${k}` : ok ? 'Doğru' : `Yanlış · doğru cevap ${k}`;
    fl.className = 'cz-flag ' + (ok ? 'ok' : blank ? '' : 'bad');
    $('#z-opts').innerHTML = LETTERS.slice(0, nOpt).map(L => `<button type="button" class="cz-opt ${L === k ? 'right' : ''} ${L === mine && L !== k ? 'wrong' : ''}" disabled>${L}</button>`).join('');
  } else {
    const flagged = (r.flag || []).includes(i);
    fl.textContent = flagged ? '★ Sonra bakacağım' : '☆ Sonra bak';
    fl.className = 'cz-flag ' + (flagged ? 'on' : '');
    $('#z-opts').innerHTML = LETTERS.slice(0, nOpt).map(L => `<button type="button" class="cz-opt ${L === mine ? 'sel' : ''}" data-l="${L}" aria-pressed="${L === mine}">${L}</button>`).join('');
    $$('.cz-opt', $('#z-opts')).forEach(b => b.addEventListener('click', () => choose(b.dataset.l)));
  }
  const prog = $('#z-prog');
  if (S.review) prog.textContent = 'İnceleme';
  else { const n = r.ans.replace(/ /g, '').length; prog.textContent = `${n} / ${N()} cevaplandı`; }
  window.scrollTo({ top: 0 });
}

function choose(L) {
  const r = rec(), i = S.cur;
  const cur = r.ans[i];
  const v = cur === L ? ' ' : L;
  r.ans = r.ans.slice(0, i) + v + r.ans.slice(i + 1);
  saveRec();
  showQ(i);
}

function palette() {
  const groups = [];
  const ord = order();
  ord.forEach(i => { const s = sectionOf(i); let g = groups.find(x => x.s === s); if (!g) groups.push(g = { s, idx: [] }); g.idx.push(i); });
  const r = rec() || {};
  const cell = i => {
    const q = S.meta.questions[i];
    let cls = '';
    if (S.review) { const a = S.ans[i], k = S.key[i]; cls = a === ' ' ? 'blank' : a === k ? 'right' : 'wrong'; }
    else { cls = r.ans[i] !== ' ' ? 'done' : ''; if ((r.flag || []).includes(i)) cls += ' flag'; }
    return `<button class="cz-cell ${cls} ${i === S.cur ? 'cur' : ''}" data-i="${i}">${q.no || i + 1}${!S.review && r.ans[i] !== ' ' ? `<small>${r.ans[i]}</small>` : ''}</button>`;
  };
  modal({
    title: S.review ? 'Sorular' : 'Sorular ve cevapların', wide: true,
    content: `${S.review ? '<p class="small muted" style="margin-top:0"><span class="cz-lg right"></span> doğru <span class="cz-lg wrong"></span> yanlış <span class="cz-lg blank"></span> boş</p>' : '<p class="small muted" style="margin-top:0"><span class="cz-lg done"></span> cevaplandı <span class="cz-lg flag"></span> sonra bakacağım</p>'}
      ${groups.map(g => `<h4 class="cz-gh">${esc(g.s)}</h4><div class="cz-pal">${g.idx.map(cell).join('')}</div>`).join('')}`,
    buttons: [{ label: 'Kapat', value: null }],
    onMount: (mm, close) => $$('.cz-cell', mm).forEach(b => b.addEventListener('click', () => { close(null); showQ(+b.dataset.i); })),
  });
}

document.addEventListener('keydown', e => {
  if (!S || !S.meta || !document.body.classList.contains('cz-solving') || document.querySelector('.modal-back')) return;
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
  else if (!S.review && /^[a-eA-E]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const L = e.key.toUpperCase(); const q = S.meta.questions[S.cur];
    if (LETTERS.indexOf(L) < (q.secenek || S.meta.secenek || 5)) choose(L);
  }
});
window.addEventListener('beforeunload', e => {
  if (S && S.rec && !S.rec.done && document.body.classList.contains('cz-solving') && !S.review) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------- gönder
async function submit(auto) {
  if (S.sending) return;
  const r = rec();
  if (!auto) {
    const bos = r.ans.split('').filter(c => c === ' ').length;
    const fl = (r.flag || []).filter(i => r.ans[i] !== undefined).length;
    const ok = await modal({
      title: 'Cevaplar gönderilsin mi?',
      content: `<p><b>${N() - bos}</b> soruyu cevapladın${bos ? `, <b>${bos}</b> soru boş` : ''}.${fl ? ` "Sonra bakacağım" diye işaretlediğin <b>${fl}</b> soru var.` : ''}</p><p class="muted">Gönderdikten sonra cevaplarını değiştiremezsin.</p>`,
      buttons: [{ label: 'Sorulara dön', value: false }, { label: 'Gönder', value: true }],
    });
    if (ok !== true) return;
  }
  S.sending = true;
  const ov = document.createElement('div'); ov.className = 'modal-back'; ov.innerHTML = '<div class="modal" style="max-width:360px"><div class="modal-body"><p style="margin:0"><b>Cevapların gönderiliyor…</b></p></div></div>'; document.body.appendChild(ov);
  try {
    const res = await api(S.base, `/e/${S.id}/submit`, { method: 'POST', body: { no: r.no, ad: r.ad || '', sube: r.sube || '', answers: r.ans, startedAt: r.startedAt || 0, client: r.client }, timeout: 45000 });
    r.done = { receipt: res.receipt, key: res.key || null, answers: res.answers || r.ans, sonuc: res.sonuc, closesAt: res.closesAt || S.meta.closesAt, t: Date.now() };
    saveRec();
    ov.remove(); S.sending = false;
    renderDone();
  } catch (e) {
    ov.remove(); S.sending = false;
    if (e instanceof ApiError && e.code === 'gonderildi') {
      setView(headCard(`<div class="banner" style="margin:14px 0 0"><span>${esc(r.no)} numarasıyla bu sınav zaten gönderilmiş (başka bir cihazdan olabilir). Bir sorun olduğunu düşünüyorsan öğretmenine söyle.</span></div>`));
      return;
    }
    if (e instanceof ApiError && e.code === 'kapali') {
      setView(headCard(`<div class="banner" style="margin:14px 0 0"><span>Sınavın süresi dolduğu için cevapların kabul edilmedi. Öğretmenine haber ver; işaretlediğin cevaplar bu cihazda duruyor.</span></div>`));
      return;
    }
    const again = await modal({
      title: 'Gönderilemedi',
      content: `<p>${esc(errText(e))}</p><p class="muted">Cevapların bu cihazda kayıtlı, kaybolmadı. İnternete bağlanınca tekrar dene.</p>`,
      buttons: [{ label: 'Sorulara dön', value: false }, { label: 'Tekrar dene', value: true }],
      dismissable: !auto,
    });
    if (again) return submit(true);
    if (auto) S.autoSent = false;
  }
}

// ---------------------------------------------------------------- sonuç
function lookupCard(no = '') {
  return `<section class="card"><h3>Sonucuna bak</h3><p class="small muted" style="margin-top:0">Gönderdiğin cihaz bu değilse numaranı ve gönderdikten sonra gördüğün sonuç kodunu yaz.</p>
    <form id="z-lk" class="row gap" style="align-items:flex-end">
      <label class="fld"><span>Okul numaran</span><input id="z-lno" inputmode="numeric" value="${esc(no)}" style="max-width:180px"></label>
      <label class="fld"><span>Sonuç kodu</span><input id="z-lrc" autocomplete="off" spellcheck="false" style="font-family:ui-monospace,monospace;max-width:240px"></label>
      <button class="btn" type="submit">Göster</button></form></section>`;
}
function bindLookup() {
  const f = $('#z-lk'); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const no = $('#z-lno').value.replace(/\D/g, ''), receipt = $('#z-lrc').value.trim();
    if (!no || !receipt) { toast('Numaranı ve sonuç kodunu yaz.', 'err'); return; }
    try {
      const r = await api(S.base, `/e/${S.id}/result`, { method: 'POST', body: { no, receipt } });
      S.rec = { no: r.no, ad: r.ad, sube: r.sube, din: !!r.din, dil: !!r.dil, ans: r.answers || '', flag: [], done: { receipt, key: r.key || null, answers: r.answers || '', sonuc: r.sonuc, closesAt: r.closesAt || S.meta.closesAt, t: r.t1 } };
      saveRec(); renderDone();
    } catch (err) { toast(errText(err), 'err', 6000); }
  });
}

async function renderDone() {
  const r = rec(), d = r.done, m = S.meta;
  if (!d.key && d.sonuc === 'bitince' && now() >= m.closesAt * 1000) {
    try {
      const x = await api(S.base, `/e/${S.id}/result`, { method: 'POST', body: { no: r.no, receipt: d.receipt } });
      if (x.key) { d.key = x.key; d.answers = x.answers || d.answers; saveRec(); }
    } catch { /* sonra tekrar denenir */ }
  }
  const sent = `<div class="cz-sent"><span class="cz-ok">✓</span><div><b>Cevapların gönderildi.</b><div class="small muted">${d.t ? esc(new Date(d.t).toLocaleString('tr-TR')) : ''} · ${esc(r.ad || '')} (${esc(r.no)})</div></div></div>
    <p class="small" style="margin:10px 0 0">Sonuç kodun: <b class="cz-rc">${esc(d.receipt)}</b> <span class="muted">· başka bir cihazdan sonucuna bakmak için bu kodu sakla.</span></p>
    <p class="small" style="margin:6px 0 0"><button class="btn sm ghost" id="z-other" style="padding-left:0">Bu cihazda başka bir öğrenci olarak gir</button></p>`;
  const other = () => { const b = $('#z-other'); if (b) b.addEventListener('click', () => { LS.del(kLast()); S.rec = null; S.imgs.forEach(u => URL.revokeObjectURL(u)); S.imgs = []; renderStart(); }); };
  if (!d.key) {
    setView(headCard(sent + (d.sonuc === 'bitince' ? `<div class="banner" style="margin:14px 0 0"><span>Sonucun <b>${esc(fmtDT(m.closesAt * 1000))}</b> tarihinden sonra bu sayfada görünecek. O zaman linki yeniden aç.</span></div>` : '<div class="banner" style="margin:14px 0 0"><span>Sonuçları öğretmenin paylaşacak.</span></div>')));
    other();
    return;
  }
  S.key = d.key; S.ans = (d.answers || r.ans || '').padEnd(N(), ' ').slice(0, N());
  const res = await computeResult();
  setView(headCard(sent) + resultHtml(res));
  bindResult(res);
  other();
}

async function computeResult() {
  const [{ evaluateExam }, { state }, sn] = await Promise.all([import('./scoring.js'), import('./db.js'), import('./sinavlar.js')]);
  const r = rec(), m = S.meta;
  state.students.clear();
  state.students.set(r.no, { no: r.no, isim: r.ad || '', sube: r.sube || '', dinMuaf: !!r.din, dilMuaf: !!r.dil, gorulen: {} });
  const exam = { id: 'coz-' + S.id, tur: m.sablon || null, kismi: !!m.kismi, sorular: m.questions.map((q, i) => ({ ...q, cevap: S.key[i] === '?' ? '' : S.key[i] })), sonuclar: { [r.no]: { cevaplar: S.ans } }, puanlama: m.puanlama || undefined };
  const ev = evaluateExam(exam);
  return { ev, o: ev.ogr.get(r.no), sn };
}

function resultHtml({ ev, o, sn }) {
  const m = S.meta;
  const items = o.items.filter(it => it.durum !== 'X');
  const D = items.filter(it => it.durum === 'D').length, Y = items.filter(it => it.durum === 'Y').length, B = items.filter(it => it.durum === 'B').length;
  const puanlar = ev.tpl ? Object.entries(o.puanlar || {}).filter(([, v]) => v !== null && v !== undefined) : [];
  const tiles = [['Doğru', D, 'ok'], ['Yanlış', Y, 'bad'], ['Boş', B, ''], ['Net', fmtNet(o.net), 'brand']];
  const konular = new Map();
  for (const it of items) { const k = it.ders + '\u0000' + it.konu; if (!konular.has(k)) konular.set(k, { ders: it.ders, konu: it.konu, D: 0, Y: 0, B: 0 }); konular.get(k)[it.durum]++; }
  const kl = [...konular.values()].map(k => ({ ...k, n: k.D + k.Y + k.B, oran: k.D / Math.max(1, k.D + k.Y + k.B) })).sort((a, b) => a.oran - b.oran || b.n - a.n);
  const tag = o => (o < 0.5 ? '<span class="pill bad">Tekrar et</span>' : o < 0.8 ? '<span class="pill warn">Pekiştir</span>' : '<span class="pill ok">İyi</span>');
  const wrongs = S.revAll = [...Array(N()).keys()].filter(i => o.items[i].durum === 'Y' || o.items[i].durum === 'B');
  return `<section class="card"><h2>Sonucun</h2>
    <div class="cz-tiles">${tiles.map(([l, v, c]) => `<div class="cz-tile ${c}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${puanlar.length ? `<div class="cz-puan">${puanlar.map(([k, v]) => `<div><span class="muted small">${esc((sn.PUAN_TURLERI[k] && sn.PUAN_TURLERI[k].ad) || k)} tahmini puan</span><b>${fmtNet(v)}</b></div>`).join('')}</div>`
      : !ev.tpl && m.tur === 'deneme' && o.puan !== null ? `<div class="cz-puan"><div><span class="muted small">Puan</span><b>${fmtNet(o.puan)}</b></div></div>` : ''}
    <div class="scroll" style="margin-top:14px"><table class="tbl"><thead><tr><th>${ev.tpl ? 'Test' : 'Ders'}</th><th class="num">Soru</th><th class="num">D</th><th class="num">Y</th><th class="num">B</th><th class="num">Net</th></tr></thead><tbody>
      ${ev.dersler.map(dd => { const x = o.ders[dd]; return x && x.soru ? `<tr><td>${esc(dd)}</td><td class="num">${x.soru}</td><td class="num">${x.D}</td><td class="num">${x.Y}</td><td class="num">${x.B}</td><td class="num"><b>${fmtNet(x.Net)}</b></td></tr>` : ''; }).join('')}
    </tbody></table></div>
    <div class="row gap" style="margin-top:14px">${wrongs.length ? `<button class="btn primary" id="z-rw">Yanlış ve boşlarımı incele (${wrongs.length})</button>` : ''}<button class="btn" id="z-ra">Bütün soruları incele</button></div>
  </section>
  <section class="card"><h3>Konu konu durumun</h3><p class="small muted" style="margin-top:0">En çok zorlandığın konular üstte.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Konu</th><th class="num">D</th><th class="num">Y</th><th class="num">B</th><th class="num">Başarı</th><th></th></tr></thead><tbody>
    ${kl.map(k => `<tr><td>${esc(k.konu || '-')}<div class="small muted">${esc(k.ders)}</div></td><td class="num">${k.D}</td><td class="num">${k.Y}</td><td class="num">${k.B}</td><td class="num">%${Math.round(k.oran * 100)}</td><td>${tag(k.oran)}</td></tr>`).join('')}
    </tbody></table></div></section>
  <section class="card"><h3>Cevapların</h3><div class="cz-pal">${o.items.map((it, i) => `<button class="cz-cell ${it.durum === 'D' ? 'right' : it.durum === 'Y' ? 'wrong' : it.durum === 'X' ? 'off' : 'blank'}" data-i="${i}" title="${esc(label(i))}">${S.meta.questions[i].no || i + 1}<small>${esc(it.cevap || '–')}${it.durum === 'Y' || it.durum === 'B' ? '→' + esc(it.dogru) : ''}</small></button>`).join('')}</div></section>`;
}

function bindResult() {
  const go = async (filter, i) => {
    try {
      if (!S.imgs.length) { toast('Sorular yükleniyor…'); await loadImages(); }
    } catch (e) {
      toast(e instanceof ApiError && e.status === 404 ? 'Soruların süresi dolduğu için artık görüntülenemiyor.' : errText(e), 'err', 6000); return;
    }
    S.revFilter = filter; S.revIdx = filter === 'yanlis' ? S.revAll : null;
    renderReview(i !== undefined ? i : (filter === 'yanlis' ? S.revAll[0] : 0));
  };
  const rw = $('#z-rw'); if (rw) rw.addEventListener('click', () => go('yanlis'));
  $('#z-ra').addEventListener('click', () => go('hepsi'));
  $$('.cz-pal .cz-cell').forEach(b => b.addEventListener('click', () => go('hepsi', +b.dataset.i)));
}

function renderReview(i) {
  const m = S.meta;
  setView(`<div class="cz-solve">
    <div class="cz-bar"><div class="cz-t"><b>${esc(m.title)}</b><span class="small muted" id="z-prog"></span></div><span class="cz-timer" id="z-tm" hidden></span>
      <button class="btn sm" id="z-pal">Sorular</button><button class="btn sm primary" id="z-end">Sonuca dön</button></div>
    <div class="cz-q"><div class="cz-qh"><span id="z-sec"></span><span class="cz-flag" id="z-flag"></span></div><div class="cz-note" id="z-note" hidden></div><div class="cz-img" id="z-imgw"><img id="z-img" alt=""></div></div>
    <div class="cz-dock"><div class="cz-opts" id="z-opts"></div><div class="cz-nav"><button class="btn" id="z-prev">‹ Önceki</button><span id="z-pos" class="small muted"></span><button class="btn" id="z-next">Sonraki ›</button></div></div></div>`);
  S.review = true;
  document.body.classList.add('cz-solving');
  bindSolve();
  showQ(i);
}

window.addEventListener('hashchange', boot);
boot();
