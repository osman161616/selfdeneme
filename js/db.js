// Yerel veritabanı (IndexedDB) + bellek önbelleği
import { cmpTr, normNo, sinifOf, trLower } from './util.js';

const DB_NAME = 'selfdeneme';
const DB_VER = 1;
const STORES = ['questions', 'students', 'exams', 'docs', 'meta'];

import { LISE_DERSLER, ORTAOKUL_DERSLER } from './sinavlar.js';
export const DEFAULT_DERSLER = ORTAOKUL_DERSLER.slice();
export function derslerFor(tur) { return tur === 'lise' ? LISE_DERSLER.slice() : tur === 'karma' ? [...new Set([...ORTAOKUL_DERSLER, ...LISE_DERSLER])] : ORTAOKUL_DERSLER.slice(); }

export const DEFAULT_SETTINGS = {
  kurum: '',
  kurumTuru: '',            // 'ortaokul' | 'lise' | 'karma' ('' = henüz seçilmedi)
  logo: null,               // dataURL
  dersSirasi: DEFAULT_DERSLER.slice(),
  taban: 230,
  katsayilar: { 'Türkçe': 4, 'T.C. İnkılap Tarihi ve Atatürkçülük': 1, 'Din Kültürü ve Ahlak Bilgisi': 1, 'İngilizce': 1, 'Sosyal Bilgiler': 1, 'Matematik': 4, 'Fen Bilimleri': 4 },
  yanlisOrani: 1 / 3,       // her yanlış kaç doğruyu götürür
  cokluIsaret: 'yanlis',    // 'yanlis' | 'bos'
  dpi: 200,
  kenar: 10,                // mm
  soruArasi: 6,             // mm
  baslikPunto: 15,
  soruNoPunto: 12,
  sayfaNoPunto: 10,
  dersYeniSayfa: true,
  soruBoyut: 'orijinal',
  ogrenciAdiYaz: true,
  secenekSayisi: 4,
  noHane: 6,
  sonYedek: 0,
  onlineApi: '',
  onlineKey: '',
};

export const state = {
  questions: new Map(),
  students: new Map(),
  exams: new Map(),
  docs: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  persistent: true,
  ready: false,
  stuVer: 0,
};

let db = null;

function openDB() {
  return new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('questions')) d.createObjectStore('questions', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('students')) d.createObjectStore('students', { keyPath: 'no' });
      if (!d.objectStoreNames.contains('exams')) d.createObjectStore('exams', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('Veritabanı başka bir sekmede kilitli. Diğer sekmeleri kapatın.'));
  });
}

function tx(store, mode, fn) {
  if (!db) return Promise.resolve(fn ? fn(null) : undefined);
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && out.result !== undefined && out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error || new Error('Veritabanı hatası'));
    t.onabort = () => rej(t.error || new Error('Veritabanı işlemi iptal edildi (depolama alanı dolmuş olabilir).'));
  });
}

function getAll(store) {
  if (!db) return Promise.resolve([]);
  return new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function initDB() {
  try {
    db = await openDB();
    state.persistent = true;
  } catch (e) {
    console.warn('IndexedDB kullanılamıyor, bellek modunda çalışılıyor', e);
    db = null;
    state.persistent = false;
  }
  if (db) {
    const [qs, ss, es, ds, ms] = await Promise.all(STORES.map(getAll));
    qs.forEach(q => state.questions.set(q.id, q));
    ss.forEach(s => state.students.set(s.no, s));
    es.forEach(e => state.exams.set(e.id, e));
    ds.forEach(d => state.docs.set(d.id, d));
    const st = ms.find(m => m.key === 'settings');
    if (st) state.settings = { ...DEFAULT_SETTINGS, ...st.value };
  }
  state.ready = true;
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* yok say */ }
}

// ---------- Genel yazma ----------
async function putMany(store, items) {
  if (!items.length) return;
  await tx(store, 'readwrite', s => { if (s) for (const it of items) s.put(it); });
}
async function delMany(store, keys) {
  if (!keys.length) return;
  await tx(store, 'readwrite', s => { if (s) for (const k of keys) s.delete(k); });
}
async function clearStore(store) { await tx(store, 'readwrite', s => { if (s) s.clear(); }); }

// ---------- Ayarlar ----------
export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await putMany('meta', [{ key: 'settings', value: state.settings }]);
}

// ---------- Sorular ----------
export function qKey(ders, konu, ad) { return trLower(ders) + '|' + trLower(konu) + '|' + trLower(ad); }

export function findQuestionByName(ders, konu, ad) {
  const k = qKey(ders, konu, ad);
  for (const q of state.questions.values()) if (qKey(q.ders, q.konu, q.ad) === k) return q;
  return null;
}

/** Aynı ders/konu içinde benzersiz bir soru adı üret */
export function uniqueName(ders, konu, ad, exceptId = null) {
  const used = new Set();
  for (const q of state.questions.values()) {
    if (q.id !== exceptId && trLower(q.ders) === trLower(ders) && trLower(q.konu) === trLower(konu)) used.add(trLower(q.ad));
  }
  if (!used.has(trLower(ad))) return ad;
  const m = /^(.*?)(\.[a-z0-9]+)?$/i.exec(ad);
  const base = m[1], ext = m[2] || '';
  for (let i = 2; i < 100000; i++) {
    const cand = `${base}-${i}${ext}`;
    if (!used.has(trLower(cand))) return cand;
  }
  return ad + '-' + Date.now();
}

export async function saveQuestions(list) {
  list.forEach(q => state.questions.set(q.id, q));
  await putMany('questions', list);
  changed();
}
export async function deleteQuestions(ids) {
  ids.forEach(id => state.questions.delete(id));
  await delMany('questions', ids);
  changed();
}

/** Kenar çubuğundaki sayaçlar vb. için veri değişti sinyali */
function changed() { try { globalThis.dispatchEvent && globalThis.dispatchEvent(new Event('sd:data')); } catch { /* */ } }

export function dersList() {
  const set = new Set(state.settings.dersSirasi);
  for (const q of state.questions.values()) set.add(q.ders);
  for (const e of state.exams.values()) for (const s of e.sorular) set.add(s.ders);
  return sortDersler([...set]);
}
export function dersIndex(d) {
  const i = state.settings.dersSirasi.indexOf(d);
  return i < 0 ? 1000 : i;
}
export function sortDersler(arr) {
  return arr.slice().sort((a, b) => (dersIndex(a) - dersIndex(b)) || cmpTr(a, b));
}
export function konuList(ders) {
  const set = new Set();
  for (const q of state.questions.values()) if (!ders || q.ders === ders) set.add(q.konu);
  for (const e of state.exams.values()) for (const s of e.sorular) if (!ders || s.ders === ders) set.add(s.konu);
  return [...set].sort(cmpTr);
}

// ---------- Öğrenciler ----------
export async function saveStudents(list) {
  state.stuVer++;
  list.forEach(s => { s.no = normNo(s.no); state.students.set(s.no, s); });
  await putMany('students', list);
}
export async function deleteStudents(nos) {
  state.stuVer++;
  nos.forEach(n => state.students.delete(n));
  await delMany('students', nos);
}
export function getStudent(no) { return state.students.get(normNo(no)) || null; }
export function ensureStudent(no, isim, sube) {
  no = normNo(no);
  let s = state.students.get(no);
  if (!s) { s = { no, isim: isim || '', sube: sube || '', gorulen: {} }; return { s, created: true }; }
  let changed = false;
  if (!s.isim && isim) { s.isim = isim; changed = true; }
  if (!s.sube && sube) { s.sube = sube; changed = true; }
  return { s, created: changed };
}
export function subeList() {
  const set = new Set();
  for (const s of state.students.values()) if (s.sube) set.add(s.sube);
  for (const e of state.exams.values()) for (const r of Object.values(e.sonuclar)) if (r.sube) set.add(r.sube);
  return [...set].sort(cmpTr);
}
export function sinifList() {
  return [...new Set(subeList().map(sinifOf))].sort(cmpTr);
}

// ---------- Sınavlar ----------
export async function saveExam(e) { state.exams.set(e.id, e); await putMany('exams', [e]); }
export async function deleteExam(id) { state.exams.delete(id); await delMany('exams', [id]); }
export function examsSorted() {
  return [...state.exams.values()].sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '') || (a.created || 0) - (b.created || 0));
}

// ---------- Belgeler (oluşturulan deneme/ödev kayıtları) ----------
export async function saveDoc(d) { state.docs.set(d.id, d); await putMany('docs', [d]); }
export async function deleteDoc(id) { state.docs.delete(id); await delMany('docs', [id]); }

// ---------- Toplu ----------
export async function wipeAll() {
  for (const s of STORES) await clearStore(s);
  state.questions.clear(); state.students.clear(); state.exams.clear(); state.docs.clear();
  state.settings = { ...DEFAULT_SETTINGS };
}

export async function removeSample() {
  const q = [...state.questions.values()].filter(x => x.ornek).map(x => x.id);
  const s = [...state.students.values()].filter(x => x.ornek).map(x => x.no);
  const e = [...state.exams.values()].filter(x => x.ornek).map(x => x.id);
  const d = [...state.docs.values()].filter(x => x.ornek).map(x => x.id);
  await deleteQuestions(q); await deleteStudents(s);
  for (const id of e) await deleteExam(id);
  for (const id of d) await deleteDoc(id);
}
export function hasSample() {
  for (const m of [state.questions, state.students, state.exams]) for (const v of m.values()) if (v.ornek) return true;
  return false;
}

export async function storageEstimate() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch { /* */ }
  return null;
}

/** Öğrencinin gördüğü soru kayıtlarını ekle (yalnızca başarılı belge üretiminden sonra çağrılır) */
export async function markSeen(studentNos, qids) {
  const now = Date.now();
  const changed = [];
  for (const no of studentNos) {
    const s = state.students.get(normNo(no));
    if (!s) continue;
    s.gorulen = s.gorulen || {};
    for (const id of qids) s.gorulen[id] = now;
    changed.push(s);
  }
  await putMany('students', changed);
}
