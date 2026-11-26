// İçe/dışa aktarma: eski program klasörü, toplu görsel, yedek (zip)
import { state, saveQuestions, saveStudents, saveExam, saveDoc, saveSettings, uniqueName, findQuestionByName, wipeAll, DEFAULT_SETTINGS } from './db.js';
import { uid, normNo, trDateToISO, makeCanvas, canvasToBlob, readText, LETTERS, todayISO } from './util.js';
import { puanlamaSnapshot } from './scoring.js';

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** Görseli ölç; çok büyükse küçült. Döndürür {blob, w, h} */
export async function normalizeImage(blob, maxW = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(blob); }
  catch { throw new Error('Görsel okunamadı'); }
  let { width: w, height: h } = bmp;
  if (w > maxW || !/^image\/(png|jpeg)$/.test(blob.type)) {
    const s = Math.min(1, maxW / w);
    const c = makeCanvas(w * s, h * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    blob = await canvasToBlob(c, 'image/png');
    w = c.width; h = c.height; c.width = 1;
  }
  if (bmp.close) bmp.close();
  return { blob, w, h };
}

/** Orijinal programın dosya adı kuralı: son harf cevap, 'y' ile başlayan yatay */
export function parseName(fname) {
  const base = fname.replace(/\.[^.]+$/, '');
  const last = base.slice(-1).toUpperCase();
  return { cevap: LETTERS.includes(last) ? last : '', yatayByName: fname.startsWith('y') };
}

export function newQuestion({ ders, konu, zorluk, ad, cevap, yatay, blob, w, h, kaynak = '' }) {
  return { id: uid('q'), ders: ders.trim(), konu: konu.trim(), zorluk: String(zorluk), ad: uniqueName(ders.trim(), konu.trim(), ad), cevap: cevap || '', yatay: !!yatay, img: blob, w, h, created: Date.now(), kaynak, analiz: false };
}

/** Dosyaları (File ya da {path, blob}) yollarıyla birlikte normalize et */
function entries(files) {
  return files.map(f => f instanceof File ? { path: (f.webkitRelativePath || f.name).replace(/\\/g, '/'), blob: f, name: f.name } : f);
}

export async function filesFromZip(file) {
  if (!window.JSZip) throw new Error('ZIP kütüphanesi yüklenemedi');
  const zip = await window.JSZip.loadAsync(file);
  const out = [];
  for (const [path, e] of Object.entries(zip.files)) {
    if (e.dir) continue;
    const blob = await e.async('blob');
    out.push({ path, blob: new Blob([blob], { type: IMG_RE.test(path) ? (path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg') : 'application/octet-stream' }), name: path.split('/').pop() });
  }
  return out;
}

/**
 * Eski "Ödev Programı" banka klasörünü içe aktar.
 * Döndürür özet.
 */
export async function importLegacy(rawFiles, onProgress) {
  const files = entries(rawFiles);
  const sum = { soru: 0, atlanan: 0, ogrenci: 0, sinav: 0, hatalar: [] };
  const qImgs = [], studentsJ = [], examsJ = []; let analizJ = null;
  for (const f of files) {
    const seg = f.path.split('/').filter(Boolean);
    const lower = seg.map(s => s.toLowerCase());
    const si = lower.lastIndexOf('sorular');
    if (IMG_RE.test(f.name)) {
      let ders, konu, zorluk;
      if (si >= 0 && seg.length - si === 5) { [ders, konu, zorluk] = seg.slice(si + 1, si + 4); }
      else if (seg.length >= 4 && /^[1-5]$/.test(seg[seg.length - 2])) { [ders, konu, zorluk] = seg.slice(-4, -1); }
      if (ders && /^[1-5]$/.test(zorluk)) qImgs.push({ f, ders, konu, zorluk });
      else sum.atlanan++;
    } else if (f.name.toLowerCase().endsWith('.json')) {
      if (lower.includes('ogrenciler')) studentsJ.push(f);
      else if (lower.includes('sinavlar')) examsJ.push(f);
      else if (f.name.toLowerCase() === 'soru_analiz_gecmisi.json') analizJ = f;
    }
  }
  const total = qImgs.length + studentsJ.length + examsJ.length || 1;
  let done = 0;
  // Sorular
  const batch = [];
  for (const { f, ders, konu, zorluk } of qImgs) {
    try {
      if (findQuestionByName(ders, konu, f.name)) { sum.atlanan++; continue; }
      const { blob, w, h } = await normalizeImage(f.blob);
      const p = parseName(f.name);
      const q = newQuestion({ ders, konu, zorluk, ad: f.name, cevap: p.cevap, yatay: p.yatayByName, blob, w, h, kaynak: 'eski program' });
      state.questions.set(q.id, q); // benzersiz ad kontrolü için hemen ekle
      batch.push(q); sum.soru++;
      if (batch.length >= 40) { await saveQuestions(batch.splice(0)); }
    } catch (e) { sum.hatalar.push(`${f.path}: ${e.message}`); }
    onProgress && onProgress(++done / total, f.name);
  }
  await saveQuestions(batch);
  // Analiz geçmişi
  if (analizJ) {
    try {
      const j = JSON.parse(await readText(analizJ.blob));
      const ch = [];
      for (const [d, konular] of Object.entries(j)) for (const [k, list] of Object.entries(konular)) for (const ad of list) {
        const q = findQuestionByName(d, k, ad); if (q && !q.analiz) { q.analiz = true; ch.push(q); }
      }
      await saveQuestions(ch);
    } catch (e) { sum.hatalar.push('soru_analiz_gecmisi.json: ' + e.message); }
  }
  // Öğrenciler
  const studs = [];
  for (const f of studentsJ) {
    try {
      const j = JSON.parse(await readText(f.blob));
      const no = normNo(f.name.replace(/\.json$/i, ''));
      if (!no) continue;
      const prev = state.students.get(no);
      const s = prev || { no, isim: '', sube: '', gorulen: {} };
      s.isim = s.isim || j.Isim || ''; s.sube = s.sube || String(j.Sinif || '');
      s.gorulen = s.gorulen || {};
      const sor = j.Sorular || {};
      for (const [d, konular] of Object.entries(sor)) for (const [k, zs] of Object.entries(konular)) for (const list of Object.values(zs)) for (const ad of list) {
        const q = findQuestionByName(d, k, ad);
        if (q) s.gorulen[q.id] = s.gorulen[q.id] || Date.now();
      }
      studs.push(s); sum.ogrenci++;
    } catch (e) { sum.hatalar.push(`${f.path}: ${e.message}`); }
    onProgress && onProgress(++done / total, f.name);
  }
  await saveStudents(studs);
  // Sınavlar
  for (const f of examsJ) {
    try {
      const j = JSON.parse(await readText(f.blob));
      const ex = legacyExamToExam(j, f.name.replace(/\.json$/i, ''));
      if (ex) { await saveExam(ex); sum.sinav++; }
    } catch (e) { sum.hatalar.push(`${f.path}: ${e.message}`); }
    onProgress && onProgress(++done / total, f.name);
  }
  return sum;
}

export function legacyExamToExam(j, fallbackName) {
  const sonuclar = j.sonuclar || j;
  const nos = Object.keys(sonuclar);
  if (!nos.length) return null;
  const first = sonuclar[nos[0]];
  if (!first || !Array.isArray(first.Cevaplar)) throw new Error('Sınav biçimi tanınmadı');
  const sorular = first.Cevaplar.map(c => {
    const ad = c.Soru_ismi || '';
    const q = ad ? findQuestionByName(c.Ders, c.Konu, ad) : null;
    return { qid: q ? q.id : null, ders: c.Ders, konu: c.Konu, zorluk: String(c.Zorluk), cevap: String(c.Dogru_cevap || '').toUpperCase(), ad: q ? q.ad : ad };
  });
  const out = {};
  const studs = [];
  for (const no of nos) {
    const r = sonuclar[no];
    const n = normNo(no);
    const ans = (r.Cevaplar || []).map(c => { const v = String(c.Cevap || ' ').trim().toUpperCase(); return v && LETTERS.includes(v) ? v : ' '; }).join('');
    out[n] = { isim: r.Isim || '', sube: String(r.Sinif || ''), cevaplar: ans };
    if (!state.students.has(n)) studs.push({ no: n, isim: r.Isim || '', sube: String(r.Sinif || ''), gorulen: {} });
  }
  if (studs.length) saveStudents(studs);
  const p = puanlamaSnapshot();
  return { id: uid('e'), isim: j.SinavIsmi || fallbackName || 'Sınav', tarih: trDateToISO(j.Tarih), secenek: 5, sorular, sonuclar: out, puanlama: p, kaynak: 'eski program', created: Date.now() };
}

// ---------------- Yedek ----------------
export async function exportBackup(onProgress) {
  if (!window.JSZip) throw new Error('ZIP kütüphanesi yüklenemedi');
  const zip = new window.JSZip();
  const qs = [...state.questions.values()];
  const meta = qs.map(({ img, ...rest }) => ({ ...rest, file: `sorular/${rest.id}.${img && img.type === 'image/jpeg' ? 'jpg' : 'png'}` }));
  qs.forEach((q, i) => { if (q.img) zip.file(meta[i].file, q.img); });
  const data = {
    app: 'selfdeneme', surum: 1, tarih: new Date().toISOString(),
    settings: state.settings, questions: meta,
    students: [...state.students.values()], exams: [...state.exams.values()].map(({ _v, ...e }) => e), docs: [...state.docs.values()],
  };
  zip.file('selfdeneme.json', JSON.stringify(data));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, m => onProgress && onProgress(m.percent / 100));
  return blob;
}

export async function importBackup(file, { replace = false } = {}, onProgress) {
  if (!window.JSZip) throw new Error('ZIP kütüphanesi yüklenemedi');
  const zip = await window.JSZip.loadAsync(file);
  const jf = zip.file('selfdeneme.json');
  if (!jf) throw new Error('Bu dosya bir selfdeneme yedeği değil (selfdeneme.json bulunamadı).');
  const data = JSON.parse(await jf.async('string'));
  if (data.app !== 'selfdeneme') throw new Error('Yedek dosyası tanınmadı.');
  if (replace) await wipeAll();
  const qs = [];
  let i = 0;
  for (const m of data.questions || []) {
    onProgress && onProgress(i++ / Math.max(1, data.questions.length));
    if (!replace && state.questions.has(m.id)) continue;
    const f = zip.file(m.file);
    if (!f) continue;
    const raw = await f.async('blob');
    const img = new Blob([raw], { type: m.file.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
    const { file: _f, ...rest } = m;
    qs.push({ ...rest, img });
    if (qs.length >= 50) await saveQuestions(qs.splice(0));
  }
  await saveQuestions(qs);
  const studs = (data.students || []).filter(s => replace || !state.students.has(s.no));
  await saveStudents(studs);
  for (const e of data.exams || []) if (replace || !state.exams.has(e.id)) await saveExam(e);
  for (const d of data.docs || []) if (replace || !state.docs.has(d.id)) await saveDoc(d);
  if (replace && data.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  return { soru: data.questions?.length || 0, ogrenci: data.students?.length || 0, sinav: data.exams?.length || 0 };
}

// ---------------- Öğrenci listesi ----------------
/** "no;isim;şube" satırları (CSV ya da yapıştırılmış metin) */
export function parseStudentRows(text) {
  const rows = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\t|;|,/).map(s => s.trim());
    if (parts.length < 2) continue;
    // numara hangi sütunda?
    let noIdx = parts.findIndex(p => /^\d+$/.test(p));
    if (noIdx < 0) continue;
    const no = normNo(parts[noIdx]);
    const rest = parts.filter((_, i) => i !== noIdx);
    let sube = '', isim = '';
    const subeIdx = rest.findIndex(p => /^\d{1,2}\s*[-/]?\s*[A-Za-zÇĞİÖŞÜçğıöşü]{1,2}$/.test(p) || /^[A-Za-zÇĞİÖŞÜ]$/.test(p));
    if (subeIdx >= 0) { sube = rest[subeIdx].replace(/\s+/g, '').toLocaleUpperCase('tr-TR'); rest.splice(subeIdx, 1); }
    isim = rest.join(' ').trim();
    rows.push({ no, isim, sube });
  }
  return rows;
}

export { todayISO };
