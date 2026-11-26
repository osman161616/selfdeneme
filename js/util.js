// Genel yardımcılar
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = '') {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

export const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
export const cmpTr = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

export function trUpper(s) { return String(s ?? '').toLocaleUpperCase('tr-TR'); }
export function trLower(s) { return String(s ?? '').toLocaleLowerCase('tr-TR'); }

export function fmtNum(v, d = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
export function fmtPct(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return '%' + Number(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: d });
}
export function round(v, d = 2) { const m = 10 ** d; return Math.round((v + Number.EPSILON) * m) / m; }

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtDate(iso) {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
/** "6.11.2023" ya da "06.11.2023" -> "2023-11-06" */
export function trDateToISO(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
  if (!m) return todayISO();
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
export function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Öğrenci numarasını normalleştir: boşlukları ve baştaki sıfırları at */
export function normNo(no) {
  const s = String(no ?? '').replace(/\s+/g, '');
  const t = s.replace(/^0+/, '');
  return t === '' && s !== '' ? '0' : t;
}

/** Şube -> sınıf düzeyi: "8A" -> "8", "10-B" -> "10", "Hazırlık" -> "Hazırlık" */
export function sinifOf(sube) {
  const s = String(sube ?? '').trim();
  if (!s) return '';
  const m = /^(\d+)/.exec(s);
  return m ? m[1] : s;
}

export function safeFile(name) {
  return String(name || 'belge').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'belge';
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function sample(arr, n) { return shuffle(arr).slice(0, Math.max(0, n)); }

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

// ---------- Dosya / metin ----------
export function readAsArrayBuffer(file) { return file.arrayBuffer(); }

/** Metin dosyasını UTF-8, olmazsa Windows-1254 (Türkçe ANSI) olarak çöz */
export async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1254').decode(buf); }
}

export function parseCSV(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const first = lines[0];
  const delim = (first.split(';').length >= first.split(',').length) ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = [];
  for (const line of lines) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    rows.push(out.map(s => s.trim()));
  }
  return rows;
}

export function toCSV(rows) {
  const cell = v => {
    const s = v === null || v === undefined ? '' : (typeof v === 'number' ? String(v).replace('.', ',') : String(v));
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}

// ---------- Görsel ----------
export function loadImage(src) {
  return new Promise((res, rej) => {
    const url = src instanceof Blob ? URL.createObjectURL(src) : src;
    const img = new Image();
    img.onload = () => { res(img); if (src instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 0); };
    img.onerror = () => { if (src instanceof Blob) URL.revokeObjectURL(url); rej(new Error('Görsel açılamadı')); };
    img.src = url;
  });
}

export function canvasToBlob(canvas, type = 'image/png', q = 0.92) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Görsel oluşturulamadı')), type, q));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/** Görselin beyaz kenarlarını kırp; kenarlara az boşluk bırak */
export function trimCanvas(src, pad = 6, thr = 235) {
  const w = src.width, h = src.height;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      const v = a < 20 ? 255 : (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      if (v < thr) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
    }
  }
  if (right < 0) return src;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
  const out = makeCanvas(right - left + 1, bottom - top + 1);
  const o = out.getContext('2d');
  o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(src, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------- İndirme ----------
let dlCapPromise = null;
function downloadsCap() {
  if (!dlCapPromise) {
    dlCapPromise = (async () => {
      try {
        if (window.claude && typeof window.claude.use === 'function') {
          return await Promise.race([window.claude.use('downloads'), sleep(4000).then(() => null)]);
        }
      } catch { /* yok */ }
      return null;
    })();
  }
  return dlCapPromise;
}
export function inSandboxFrame() {
  try { return window.self !== window.top; } catch { return true; }
}

/** Dosyayı kullanıcıya indir. Sonuç: true (indirildi), false (vazgeçildi) */
export async function downloadFile(filename, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const cap = await downloadsCap();
  if (cap) {
    try { await cap.save({ filename, data: blob }); return true; }
    catch (e) {
      if (e && e.code === 'declined') return false;
      if (e && e.code === 'rate_limited') throw new Error('Önceki indirme onayı bekleniyor. Lütfen onu tamamlayıp tekrar deneyin.');
      // diğer durumlarda klasik yönteme düş
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export function pickFiles({ accept = '', multiple = false, directory = false } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    if (directory) { inp.webkitdirectory = true; inp.setAttribute('webkitdirectory', ''); }
    inp.style.display = 'none';
    document.body.appendChild(inp);
    let done = false;
    inp.addEventListener('change', () => { done = true; resolve(Array.from(inp.files || [])); inp.remove(); });
    inp.addEventListener('cancel', () => { if (!done) { resolve([]); inp.remove(); } });
    inp.click();
  });
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E'];
