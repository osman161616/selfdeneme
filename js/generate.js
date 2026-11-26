// Soru seçimi, otomatik ödev planı ve belge üretimi (ortak)
import { state, saveDoc, markSeen, sortDersler, examsSorted } from './db.js';
import { esc, sample, shuffle, uid, todayISO, downloadFile, safeFile, toCSV, $$, round } from './util.js';
import { modal, toast } from './ui.js';
import { buildBooklet, buildAnswerKeyPdf, makeSections, keyToCsvRows } from './layout.js';
import { studentKonuStats } from './scoring.js';
import { mergePdfs } from './pdfdoc.js';

/** Havuz filtresi: 'hepsi' | 'analiz' | 'analizsiz' */
export function poolFor(ders, konu, zorluk, filtre = 'hepsi') {
  return [...state.questions.values()].filter(q => q.ders === ders && (!konu || q.konu === konu) && (!zorluk || q.zorluk === String(zorluk)) &&
    (filtre === 'hepsi' || (filtre === 'analiz' ? q.analiz : !q.analiz)));
}

export function seenBy(nos) {
  const set = new Set();
  for (const no of nos) { const s = state.students.get(no); if (s && s.gorulen) for (const id of Object.keys(s.gorulen)) set.add(id); }
  return set;
}
export function seenByOthers(nos) {
  const sel = new Set(nos); const set = new Set();
  for (const s of state.students.values()) if (!sel.has(s.no) && s.gorulen) for (const id of Object.keys(s.gorulen)) set.add(id);
  return set;
}

/** Satır için kullanılabilir soru sayısı */
export function availableCount(row, nos, filtre, separate) {
  const pool = poolFor(row.ders, row.konu, row.zorluk, filtre);
  if (!nos.length) return pool.length;
  if (separate) return Math.min(...nos.map(no => { const s = seenBy([no]); return pool.filter(q => !s.has(q.id)).length; }));
  const s = seenBy(nos);
  return pool.filter(q => !s.has(q.id)).length;
}

/**
 * Satırlara göre soru seç. rows: [{ders, konu, zorluk, count}]
 * Döndürür {picked: Question[], eksik: [{row, istenen, bulunan}]}
 */
export function selectQuestions(rows, nos, { filtre = 'hepsi', tamamla = false } = {}) {
  const seen = seenBy(nos), others = seenByOthers(nos);
  const used = new Set(); const picked = []; const eksik = []; const perRow = [];
  for (const r of rows) {
    const n = Math.max(0, Math.floor(Number(r.count) || 0));
    if (!n) { perRow.push([]); continue; }
    const pool = poolFor(r.ders, r.konu, r.zorluk, filtre).filter(q => !used.has(q.id));
    const fresh = pool.filter(q => !seen.has(q.id));
    const pref = fresh.filter(q => others.has(q.id));
    const rest = fresh.filter(q => !others.has(q.id));
    let got = sample(pref, n);
    if (got.length < n) got = got.concat(sample(rest, n - got.length));
    if (got.length < n && tamamla) {
      // en eski görülenlerden tamamla
      const old = pool.filter(q => seen.has(q.id) && !got.includes(q)).sort((a, b) => lastSeen(a.id, nos) - lastSeen(b.id, nos));
      got = got.concat(old.slice(0, n - got.length));
    }
    if (got.length < n) eksik.push({ row: r, istenen: n, bulunan: got.length });
    got.forEach(q => used.add(q.id));
    picked.push(...got); perRow.push(got);
  }
  return { picked, eksik, perRow };
}
function lastSeen(id, nos) { let t = 0; for (const no of nos) { const s = state.students.get(no); if (s && s.gorulen && s.gorulen[id]) t = Math.max(t, s.gorulen[id]); } return t; }

/**
 * Otomatik plan: öğrencinin en düşük doğru oranlı konuları.
 * dersRows: [{ders, konuSayisi, soruSayisi}]
 */
export function autoPlan(no, dersRows, { filtre = 'hepsi' } = {}) {
  const stats = studentKonuStats(no, examsSorted());
  const rows = []; const notlar = []; const uyarilar = [];
  for (const dr of dersRows) {
    const ks = Math.max(1, Number(dr.konuSayisi) || 1), ss = Math.max(0, Number(dr.soruSayisi) || 0);
    if (!ss) continue;
    const list = [...stats.values()].filter(g => g.ders === dr.ders).sort((a, b) => a.oran - b.oran || a.seviye - b.seviye);
    if (!list.length) { uyarilar.push(`${dr.ders}: öğrencinin bu dersten sınav sonucu yok`); continue; }
    // bankada sorusu olan konuları tercih et
    const withBank = list.filter(g => poolFor(g.ders, g.konu, '', filtre).length);
    const chosen = (withBank.length ? withBank : list).slice(0, ks);
    if (chosen.length < ks) uyarilar.push(`${dr.ders}: ${ks} konu istendi, ${chosen.length} konu bulundu`);
    const base = Math.floor(ss / chosen.length), extra = ss % chosen.length;
    chosen.forEach((g, i) => {
      const count = base + (i < extra ? 1 : 0);
      if (!count) return;
      const hedef = Math.min(5, Math.max(1, Math.round(g.seviye) || 1));
      rows.push({ ders: g.ders, konu: g.konu, hedef, count, oran: g.oran });
      notlar.push({ ders: g.ders, konu: g.konu, oran: g.oran, seviye: g.seviye, count, hedef });
    });
  }
  return { rows, notlar, uyarilar };
}

/** Otomatik plan satırlarından soru seç (hedef zorlukta yoksa en yakın zorluklar) */
export function selectAuto(no, rows, { filtre = 'hepsi', tamamla = false } = {}) {
  const seen = seenBy([no]), others = seenByOthers([no]);
  const used = new Set(); const picked = []; const eksik = [];
  for (const r of rows) {
    let need = r.count; const got = [];
    const order = [0, 1, -1, 2, -2, 3, -3, 4, -4].map(d => r.hedef + d).filter(z => z >= 1 && z <= 5);
    for (const z of order) {
      if (need <= 0) break;
      const pool = poolFor(r.ders, r.konu, z, filtre).filter(q => !used.has(q.id) && !seen.has(q.id));
      const pref = shuffle(pool.filter(q => others.has(q.id))), rest = shuffle(pool.filter(q => !others.has(q.id)));
      const take = pref.concat(rest).slice(0, need);
      got.push(...take); need -= take.length;
    }
    if (need > 0 && tamamla) {
      const old = poolFor(r.ders, r.konu, '', filtre).filter(q => !used.has(q.id) && seen.has(q.id) && !got.includes(q)).slice(0, need);
      got.push(...old); need -= old.length;
    }
    if (need > 0) eksik.push({ row: r, istenen: r.count, bulunan: r.count - need });
    got.forEach(q => used.add(q.id)); picked.push(...got);
  }
  return { picked, eksik };
}

/** Tek kitapçık üret */
export async function makeBooklet({ questions, title, ogrenci = '', byKonu = true, byZorluk = false, tries = 3, onProgress, sections = null, forceNewPage = false }) {
  if (!sections) sections = makeSections(questions, { byKonu, byZorluk });
  if (forceNewPage) return await buildBooklet({ title, ogrenci, sections, tries, onProgress, forceNewPage });
  return await buildBooklet({ title, ogrenci, sections, tries, onProgress });
}

export function keyLines(key) {
  const out = [];
  for (const d of sortDersler([...new Set(key.map(k => k.ders))])) out.push(`${d}: ` + key.filter(k => k.ders === d).map(k => `${k.no}) ${k.cevap || '?'}`).join('  '));
  return out.join('\n');
}

/** Sonuç penceresi: indirilecek dosyalar */
export async function resultsDialog(title, files, extraHtml = '') {
  await modal({
    title, wide: files.length > 3,
    content: `${extraHtml}<div class="stack">${files.map((f, i) => `<div class="row between gap" style="padding:10px 12px;border:1px solid var(--line);border-radius:10px"><div><b>${esc(f.label)}</b><div class="small muted">${esc(f.filename)}${f.note ? ' · ' + esc(f.note) : ''}</div></div><button class="btn ${i === 0 ? 'primary' : ''} sm" data-f="${i}">İndir</button></div>`).join('')}</div>`,
    buttons: [{ label: 'Kapat', value: null }],
    onMount: m => $$('[data-f]', m).forEach(b => b.addEventListener('click', async () => {
      const f = files[+b.dataset.f];
      b.disabled = true;
      try { const ok = await downloadFile(f.filename, f.data, f.mime); if (ok) { b.textContent = 'İndirildi ✓'; } else b.disabled = false; }
      catch (e) { toast(e.message, 'err'); b.disabled = false; }
    })),
  });
}

export const pdfFile = (label, filename, data, note = '') => ({ label, filename: safeFile(filename) + '.pdf', data: new Blob([data], { type: 'application/pdf' }), mime: 'application/pdf', note });
export const csvFile = (label, filename, rows, note = '') => ({ label, filename: safeFile(filename) + '.csv', data: new Blob([toCSV(rows)], { type: 'text/csv' }), mime: 'text/csv', note });

export async function zipFiles(entries) {
  const zip = new window.JSZip();
  entries.forEach(e => zip.file(e.name, e.data));
  return await zip.generateAsync({ type: 'blob' });
}

/** Bir belge kaydı oluştur */
export async function recordDoc(d) {
  const doc = { id: uid('d'), created: Date.now(), tarih: todayISO(), ...d };
  await saveDoc(doc);
  return doc;
}

export { markSeen, mergePdfs, buildAnswerKeyPdf, keyToCsvRows, round };
