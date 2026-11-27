// Online sınav: soru paketi biçimi ve sunucu istemcisi (öğretmen ve öğrenci sayfaları ortak)
//
// Paket (SDP1):  "SDP1" | uint32 LE başlık uzunluğu | başlık JSON (UTF-8) | görsel baytları
// Başlık: { v: 1, items: [{ off, len, type, w, h, mm }] }  (soru sırasıyla)

export const MAGIC = 'SDP1';

export function packPackage(items) {
  // items: [{ bytes: Uint8Array, type, w, h, mm }]
  let off = 0;
  const head = { v: 1, items: items.map(it => { const o = { off, len: it.bytes.length, type: it.type, w: it.w, h: it.h, mm: it.mm || 0 }; off += it.bytes.length; return o; }) };
  const hj = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(8 + hj.length + off);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, hj.length, true);
  out.set(hj, 8);
  let p = 8 + hj.length;
  for (const it of items) { out.set(it.bytes, p); p += it.bytes.length; }
  return out;
}

export function unpackPackage(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length < 8 || String.fromCharCode(u[0], u[1], u[2], u[3]) !== MAGIC) throw new Error('Soru paketi bozuk.');
  const hl = new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(4, true);
  if (8 + hl > u.length) throw new Error('Soru paketi eksik indi.');
  const head = JSON.parse(new TextDecoder().decode(u.subarray(8, 8 + hl)));
  const base = 8 + hl;
  return head.items.map(it => {
    if (base + it.off + it.len > u.length) throw new Error('Soru paketi eksik indi.');
    return { blob: new Blob([u.subarray(base + it.off, base + it.off + it.len)], { type: it.type }), w: it.w, h: it.h, mm: it.mm };
  });
}

export class ApiError extends Error {
  constructor(msg, status = 0, code = '') { super(msg); this.status = status; this.code = code; }
}

export function cleanBase(b) { return String(b || '').trim().replace(/\/+$/, ''); }

/** JSON istek. Ağ hatalarında anlaşılır Türkçe mesaj verir. */
export async function api(base, path, { method = 'GET', body = null, token = '', publishKey = '', timeout = 30000 } = {}) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  const headers = {};
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (publishKey) headers['X-Publish-Key'] = publishKey;
  let res;
  try {
    res = await fetch(cleanBase(base) + path, { method, headers, body: body !== null ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store' });
  } catch (e) {
    throw new ApiError(e && e.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi. İnternet bağlantınızı kontrol edip tekrar deneyin.' : 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.', 0, 'ag');
  } finally { clearTimeout(tm); }
  let data = null;
  try { data = await res.json(); } catch { /* */ }
  if (!res.ok || !data || data.ok === false) throw new ApiError((data && data.error) || `Sunucu hatası (${res.status}).`, res.status, (data && data.code) || '');
  return data;
}

/** İlerleme bildirimli indirme */
export async function download(url, onProgress, expected = 0) {
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch { throw new ApiError('Sorular indirilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.', 0, 'ag'); }
  if (!res.ok) {
    let d = null; try { d = await res.json(); } catch { /* */ }
    throw new ApiError((d && d.error) || `Sorular indirilemedi (${res.status}).`, res.status, (d && d.code) || '');
  }
  const total = Number(res.headers.get('Content-Length')) || expected || 0;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onProgress && onProgress(1); return b; }
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (onProgress && total) onProgress(Math.min(1, got / total));
    }
  } catch { throw new ApiError('İndirme yarıda kesildi. Bağlantınızı kontrol edip tekrar deneyin.', 0, 'ag'); }
  if (expected && got !== expected) throw new ApiError('Sorular eksik indi. Tekrar deneyin.', 0, 'eksik');
  const out = new Uint8Array(got); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** İlerleme bildirimli yükleme (XHR) */
export function upload(url, bytes, token, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.timeout = 10 * 60 * 1000;
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let d = null; try { d = JSON.parse(x.responseText); } catch { /* */ }
      if (x.status >= 200 && x.status < 300 && d && d.ok) resolve(d);
      else reject(new ApiError((d && d.error) || `Sorular yüklenemedi (${x.status}).`, x.status, (d && d.code) || ''));
    };
    x.onerror = () => reject(new ApiError('Sorular yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.', 0, 'ag'));
    x.ontimeout = () => reject(new ApiError('Yükleme çok uzun sürdü. Bağlantınızı kontrol edip tekrar deneyin.', 0, 'ag'));
    x.send(bytes);
  });
}

/** Sınav linki: varsayılan sunucu değilse sunucu adresi linke eklenir */
export function solveUrl(siteBase, id, apiBase, apiDefault) {
  const b = cleanBase(apiBase);
  const extra = b && b !== cleanBase(apiDefault) ? '@' + btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
  return siteBase + '#' + id + extra;
}
export function parseSolveHash(hash, apiDefault) {
  const h = String(hash || '').replace(/^#/, '').trim();
  const [idRaw, enc] = h.split('@');
  const id = (idRaw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  let base = apiDefault;
  if (enc) { try { base = atob(enc.replace(/-/g, '+').replace(/_/g, '/')); } catch { /* */ } }
  return { id, base: cleanBase(base) };
}

/** Öğrenci adını gizle: "Ali Yılmaz" -> "Ali Y." */
export function maskName(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  if (p.length === 1) return p[0];
  return p.slice(0, -1).join(' ') + ' ' + p[p.length - 1].charAt(0).toLocaleUpperCase('tr-TR') + '.';
}
