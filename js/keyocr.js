/**
 * Cevap anahtarını görselden okuma — tamamen tarayıcıda, internete hiçbir şey gönderilmeden.
 *
 * Cevap anahtarlarında yalnızca rakamlar, A–E harfleri ve birkaç işaret (. - ) bulunur. Genel amaçlı
 * bir OCR yerine bu küçük harf kümesi için özel bir tanıyıcı kullanılır:
 *  1. Görsel büyütülür, zemin ayrılır; koyu zeminli hücrelerdeki açık yazı da bulunur.
 *  2. Tablo çizgileri, çerçeveler ve dolu renk kutuları atılır.
 *  3. Kalan her mürekkep parçası bir karakterdir. İki görüşle tanınır: yüzlerce yazı tipiyle eğitilmiş küçük
 *     bir sinir ağı (keymodel.js) ve tarayıcının yazı tipleriyle çizilmiş örneklere benzerlik. Başlık
 *     kelimelerinin harfleri ("TEST", "TÜRKÇE") ve tanınmayan şekiller atılır.
 *  4. Karakterler kelimelere toplanır ("12.", "1.A", "B"), yerlerine bakılarak anahtar çıkarılır.
 */

import { MODEL } from './keymodel.js';

// ---------------- Karakter tanıma ----------------

const CHARS = '0123456789ABCDE';
const G = 16;                                   // karşılaştırma ızgarası


function glyphFeature(get, x0, y0, w, h) {
  const f = new Float32Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const xa = x0 + gx * w / G, xb = x0 + (gx + 1) * w / G, ya = y0 + gy * h / G, yb = y0 + (gy + 1) * h / G;
    let s = 0, n = 0;
    for (let y = Math.floor(ya); y < Math.max(Math.floor(ya) + 1, Math.ceil(yb)); y++)
      for (let x = Math.floor(xa); x < Math.max(Math.floor(xa) + 1, Math.ceil(xb)); x++) { s += get(x, y); n++; }
    f[gy * G + gx] = n ? s / n : 0;
  }
  return f;
}

function holes(get, x0, y0, w, h) {
  // Karakterin içindeki kapalı boşluk sayısı (A,D,0,4,6,9: 1; B,8: 2)
  const W = w + 2, H = h + 2, seen = new Uint8Array(W * H);
  const bg = (x, y) => (x < 1 || y < 1 || x > w || y > h) ? true : !get(x0 + x - 1, y0 + y - 1);
  let count = 0;
  const st = [];
  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    const k = sy * W + sx;
    if (seen[k] || !bg(sx, sy)) continue;
    let n = 0, edge = false;
    st.push(k); seen[k] = 1;
    while (st.length) {
      const q = st.pop(); n++;
      const x = q % W, y = (q / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      if (x + 1 < W) { const nk = q + 1; if (!seen[nk] && bg(x + 1, y)) { seen[nk] = 1; st.push(nk); } }
      if (x > 0) { const nk = q - 1; if (!seen[nk] && bg(x - 1, y)) { seen[nk] = 1; st.push(nk); } }
      if (y + 1 < H) { const nk = q + W; if (!seen[nk] && bg(x, y + 1)) { seen[nk] = 1; st.push(nk); } }
      if (y > 0) { const nk = q - W; if (!seen[nk] && bg(x, y - 1)) { seen[nk] = 1; st.push(nk); } }
    }
    if (!edge && n > Math.max(2, w * h * 0.01)) count++;
  }
  return Math.min(2, count);
}

function leftStraight(get, x0, y0, w, h) {
  // Satırların en soldaki mürekkebi ne kadar aynı hizada? B, D, E'de ~1; 8, 0, 3'te düşük
  const lefts = [];
  for (let yy = Math.floor(h * 0.1); yy < Math.ceil(h * 0.9); yy++) { const y = y0 + yy; for (let x = x0; x < x0 + w; x++) if (get(x, y)) { lefts.push(x - x0); break; } }
  if (!lefts.length) return 0;
  const mn = Math.min(...lefts);
  return lefts.filter(v => v - mn <= Math.max(1, w * 0.1)).length / lefts.length;
}

let TEMPLATES = null;
function buildTemplates() {
  if (TEMPLATES) return TEMPLATES;
  const fonts = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Segoe UI', 'Roboto', 'Calibri', 'Times New Roman', 'Georgia', 'Cambria',
    'Courier New', 'DejaVu Sans', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Open Sans', 'Trebuchet MS', 'Century Gothic', 'Rockwell',
    'Franklin Gothic Medium', 'Palatino Linotype', 'Book Antiqua', 'Garamond', 'Candara', 'Constantia', 'Corbel', 'Lucida Sans Unicode', 'Gill Sans MT',
    'Montserrat', 'Lato', 'Source Sans Pro', 'Ubuntu', 'Archivo', 'Inter', 'sans-serif', 'serif'];
  const S = 64;
  const c = document.createElement('canvas'); c.width = S * 2; c.height = S * 2;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const out = [], seen = new Set();
  for (const fam of fonts) for (const wt of ['400', '700']) for (const ch of CHARS) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000'; ctx.font = `${wt} ${S}px "${fam}"`; ctx.textBaseline = 'middle';
    ctx.fillText(ch, S * 0.4, S);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const on = (x, y) => (x < 0 || y < 0 || x >= c.width || y >= c.height) ? 0 : (d[(y * c.width + x) * 4] < 128 ? 1 : 0);
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (on(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) continue;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const f = glyphFeature(on, x0, y0, w, h);
    const key = ch + Array.from(f, v => Math.round(v * 4)).join('');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ch, f, ar: w / h, holes: holes(on, x0, y0, w, h), ls: leftStraight(on, x0, y0, w, h) });
  }
  TEMPLATES = out;
  return out;
}
/** Tarayıcının yazı tipleriyle çizilmiş örneklere uzaklık: her karakter için en yakın örnek */
function templateDist(f, ar, ho, ls) {
  const best = new Map();
  for (const t of buildTemplates()) {
    let s = 0;
    for (let i = 0; i < f.length; i++) s += Math.abs(f[i] - t.f[i]);
    s = s / f.length + Math.abs(Math.log(ar / t.ar)) * 0.25 + (ho !== t.holes ? 0.08 : 0) + Math.abs(ls - t.ls) * 0.12;
    if (!best.has(t.ch) || s < best.get(t.ch)) best.set(t.ch, s);
  }
  return best;
}

let NET = null;
function net() {
  if (NET) return NET;
  const dec = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
  NET = { D: MODEL.D, H: MODEL.H, C: MODEL.C, W1: dec(MODEL.W1), b1: dec(MODEL.b1), W2: dec(MODEL.W2), b2: dec(MODEL.b2) };
  return NET;
}
const CLS = CHARS + ')?';

/** Karakteri tanı: { ch, d } — d = 1 - olasılık; başka bir karakterse ch = '?' */
function classify(get, x0, y0, w, h) {
  const N = net();
  const g = glyphFeature(get, x0, y0, w, h);
  const ho = holes(get, x0, y0, w, h);
  const x = new Float32Array(N.D);
  x.set(g, 0);
  x[256] = Math.log(w / h); x[257] = ho === 0 ? 1 : 0; x[258] = ho === 1 ? 1 : 0; x[259] = ho === 2 ? 1 : 0; x[260] = leftStraight(get, x0, y0, w, h);
  const hdn = new Float32Array(N.H);
  for (let j = 0; j < N.H; j++) { let s = N.b1[j]; for (let i = 0; i < N.D; i++) s += x[i] * N.W1[i * N.H + j]; hdn[j] = s > 0 ? s : 0; }
  const z = new Float32Array(N.C); let mx = -Infinity;
  for (let k = 0; k < N.C; k++) { let s = N.b2[k]; for (let j = 0; j < N.H; j++) s += hdn[j] * N.W2[j * N.C + k]; z[k] = s; if (s > mx) mx = s; }
  let sum = 0; for (let k = 0; k < N.C; k++) { z[k] = Math.exp(z[k] - mx); sum += z[k]; }
  for (let k = 0; k < N.C; k++) z[k] /= sum;
  // İki görüşü birleştir: sinir ağı olasılığı × örnek benzerliği (örneklere uzaklıktan olasılık)
  const td = templateDist(g, w / h, ho, x[260]);
  const tp = new Float32Array(N.C); let ts = 0;
  for (let k = 0; k < CHARS.length; k++) { const dd = td.get(CHARS[k]); tp[k] = dd === undefined ? 0 : Math.exp(-dd / 0.04); ts += tp[k]; }
  const comb = new Float32Array(N.C);
  for (let k = 0; k < N.C; k++) comb[k] = k < CHARS.length && ts > 0 ? Math.sqrt(z[k] * (tp[k] / ts)) : z[k] * 0.7;
  let cs = 0; for (let k = 0; k < N.C; k++) cs += comb[k];
  let best = 0; for (let k = 1; k < N.C; k++) if (comb[k] > comb[best]) best = k;
  const p = comb[best] / cs;
  const ch = CLS[best];
  // Tarayıcıdaki örneklere çok benzemeyen ve ağın da emin olmadığı şekiller reddedilir
  const tmin = Math.min(...td.values());
  return { ch, d: ch === '?' ? 1 : (tmin > 0.32 && z[best] < 0.8 ? 1 : 1 - p) };
}

// ---------------- Görsel hazırlama ----------------

function loadImage(src) {
  if (!(src instanceof Blob)) return Promise.resolve(src);
  const url = URL.createObjectURL(src);
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    i.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Görsel açılamadı.')); };
    i.src = url;
  });
}

/** Mürekkep haritası: 1 = yazı. Her bölgenin zemini ayrı bulunur; koyu zeminde açık yazı da yazı sayılır. */
function inkMap(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.max(1, Math.min(4, 1600 / Math.max(w0, h0)));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) L[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  // Zemin: her bloğun en yaygın parlaklığı (komşu bloklarla yumuşatılır). Her pikselin zeminden farkı
  // (koyu zeminde açık yazı da olur) tek bir eşikle (Otsu) ayrılır: açık mavi, pembe yazılar ve renkli hücreler de doğru çıkar.
  const B = Math.max(6, Math.round(Math.min(w, h) / 24)), bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const H64 = new Uint32Array(bw * bh * 64);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H64[((((y / B) | 0) * bw + ((x / B) | 0)) << 6) + (L[y * w + x] >> 2)]++;
  const bgA = new Float32Array(bw * bh), acc = new Uint32Array(64), R = 2;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    acc.fill(0);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const o = (ny * bw + nx) << 6; for (let i = 0; i < 64; i++) acc[i] += H64[o + i];
    }
    let m = 0; for (let i = 1; i < 64; i++) if (acc[i] > acc[m]) m = i;
    bgA[by * bw + bx] = m * 4 + 2;
  }
  const C = new Float32Array(w * h), ch = new Uint32Array(256);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const bgv = bgA[((y / B) | 0) * bw + ((x / B) | 0)], v = L[y * w + x];
    const c = bgv >= 110 ? bgv - v : v - bgv;
    C[y * w + x] = c;
    if (c > 12) ch[Math.min(255, Math.round(c))]++;
  }
  // Otsu
  let tot = 0, sum = 0; for (let i = 0; i < 256; i++) { tot += ch[i]; sum += i * ch[i]; }
  let wB = 0, sB = 0, best = 0, thr = 60;
  for (let i = 0; i < 256; i++) {
    wB += ch[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break;
    sB += i * ch[i];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = i; }
  }
  // İki eşik: cömert olanla (ince yazıların gövdesi kopmasın) parçalar bulunur; tanırken ikisi de denenir
  const t1 = Math.max(35, Math.min(thr, 110)), t2 = Math.max(30, Math.min(thr * 0.72, 100));
  const ink = new Uint8Array(w * h), inkS = new Uint8Array(w * h);
  for (let j = 0; j < w * h; j++) { ink[j] = C[j] > t2 ? 1 : 0; inkS[j] = C[j] > t1 ? 1 : 0; }
  return { ink, inkS, w, h };
}

function eraseRuns(ink, w, h, hmax, vmax, mh) {
  // Uzun koşular çizgidir. Daha kısa ama ince (üstü ve altı boş) koşular da çizgidir: dar tablolardaki ayraçlar.
  const kill = new Uint8Array(w * h);
  const t = Math.max(2, Math.round(mh * 0.14));
  const thinH = (y, x0, x1) => { let e = 0; for (let x = x0; x < x1; x++) { if ((y - t >= 0 && ink[(y - t) * w + x]) || (y + t < h && ink[(y + t) * w + x])) e++; } return e < (x1 - x0) * 0.25; };
  const thinV = (x, y0, y1) => { let e = 0; for (let y = y0; y < y1; y++) { if ((x - t >= 0 && ink[y * w + x - t]) || (x + t < w && ink[y * w + x + t])) e++; } return e < (y1 - y0) * 0.25; };
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!ink[y * w + x]) { x++; continue; }
      let e = x; while (e < w && ink[y * w + e]) e++;
      if (e - x > hmax || (e - x > mh * 1.25 && thinH(y, x, e))) for (let k = x; k < e; k++) kill[y * w + k] = 1;
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!ink[y * w + x]) { y++; continue; }
      let e = y; while (e < h && ink[e * w + x]) e++;
      if (e - y > vmax || (e - y > mh * 1.35 && thinV(x, y, e))) for (let k = y; k < e; k++) kill[k * w + x] = 1;
      y = e;
    }
  }
  for (let j = 0; j < w * h; j++) if (kill[j]) ink[j] = 0;
}

function components(ink, w, h) {
  const lab = new Int32Array(w * h), stack = new Int32Array(w * h), comps = [];
  let id = 0;
  for (let s0 = 0; s0 < ink.length; s0++) {
    if (!ink[s0] || lab[s0]) continue;
    id++; let sp = 0; stack[sp++] = s0; lab[s0] = id;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    while (sp) {
      const q = stack[--sp]; n++;
      const x = q % w, y = (q / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (ink[nk] && !lab[nk]) { lab[nk] = id; stack[sp++] = nk; }
      }
    }
    comps.push({ id, x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { comps, lab };
}

/** Birbirine değen 2-3 karakteri ayır; her parça iyi tanınıyorsa parçaları döndür */
function splitGlyph(get, c, mh) {
  const prof = [];
  for (let x = c.x0; x <= c.x1; x++) { let n = 0; for (let y = c.y0; y <= c.y1; y++) n += get(x, y); prof.push(n); }
  const tryCuts = cuts => {
    const xs = [c.x0, ...cuts.map(k => c.x0 + k), c.x1 + 1];
    const out = [];
    let worst = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      // Parçanın gerçek kutusu
      let x0 = xs[i], x1 = xs[i + 1] - 1, y0 = c.y1, y1 = c.y0;
      for (let x = x0; x <= x1; x++) for (let y = c.y0; y <= c.y1; y++) if (get(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (y1 < y0 || x1 - x0 < 2) return null;
      const h = y1 - y0 + 1, w = x1 - x0 + 1;
      if (h < mh * 0.3 && w < mh * 0.5 && w < h * 2) { out.push({ x0, y0, x1, y1, w, h, ch: '.', p: true }); continue; }
      if (h < mh * 0.3 && w >= mh * 0.2) { out.push({ x0, y0, x1, y1, w, h, ch: '-', p: true }); continue; }
      if (w < mh * 0.3 && h > mh * 0.7) { out.push({ x0, y0, x1, y1, w, h, ch: '1' }); continue; }
      const r = classify(get, x0, y0, w, h);
      worst = Math.max(worst, r.d);
      out.push({ x0, y0, x1, y1, w, h, ch: r.ch, d: r.d });
    }
    return { out, worst };
  };
  const minima = [];
  for (let i = 2; i < prof.length - 2; i++) if (prof[i] <= prof[i - 1] && prof[i] <= prof[i + 1]) minima.push(i);
  let best = null;
  for (const m of minima) { const r = tryCuts([m]); if (r && (!best || r.worst < best.worst)) best = r; }
  if (c.w > mh * 1.3) for (let a = 0; a < minima.length; a++) for (let b = a + 1; b < minima.length; b++) {
    if (minima[b] - minima[a] < mh * 0.25) continue;
    const r = tryCuts([minima[a], minima[b]]); if (r && (!best || r.worst < best.worst)) best = r;
  }
  return best && best.worst <= 0.35 ? best.out : null;
}


// ---------------- Okuma ----------------

/**
 * Görselden anahtar oku. src: File/Blob/HTMLImageElement/canvas.
 * Dönüş: { groups: ["ACBD…", …], mode, tokens }
 */
export async function readKeyImage(src) {
  const img = await loadImage(src);
  const { ink, inkS, w, h } = inkMap(img);
  const estH = cs => {
    const hs = cs.filter(c => c.n > 25 && c.h >= 8 && c.w <= c.h * 1.6 && c.h < h * 0.6 && c.n / (c.w * c.h) > 0.12).map(c => c.h).sort((a, b) => a - b);
    return hs.length ? hs[Math.floor(hs.length * 0.5)] : 20;
  };
  // Harflere değen tablo çizgilerini sil: karakter boyundan çok uzun yatay/dikey mürekkep koşuları
  const mh0 = estH(components(ink, w, h).comps);
  const ink0 = ink.slice();
  eraseRuns(ink, w, h, Math.round(mh0 * 2.2), Math.round(mh0 * 1.7), mh0);
  const { comps, lab } = components(ink, w, h);
  const mh = estH(comps);
  const get = id => (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : (lab[y * w + x] === id ? 1 : 0);
  const glyphs = [], rejected = [];
  for (const c of comps) {
    const fill = c.n / (c.w * c.h);
    if (c.n < Math.max(4, mh * mh * 0.006)) continue;                        // toz
    if (c.w > mh * 2.5 && c.h < mh * 0.45) continue;                         // yatay çizgi
    if (c.h > mh * 1.7 && c.w < mh * 0.4) continue;                          // dikey çizgi / ayraç
    if ((c.w > mh * 2.2 || c.h > mh * 1.9) && fill < 0.2) continue;          // çerçeve
    if (c.w > mh * 2 && c.h > mh * 1.4) continue;                            // büyük kutu / resim
    if (c.h < mh * 0.35 && c.w < mh * 0.45) { glyphs.push({ ...c, ch: '.', p: true }); continue; }     // nokta
    if (c.h < mh * 0.3 && c.w >= mh * 0.3 && c.w < mh * 1.2) { glyphs.push({ ...c, ch: '-', p: true }); continue; }   // tire
    if (c.h < mh * 0.6 || c.h > mh * 1.45) continue;                         // başlık / dipnot boyutu
    if (c.w < mh * 0.3 && c.h > mh * 0.75) {                                // "1", "|" ya da ")"
      const rt = classify(get(c.id), c.x0, c.y0, c.w, c.h);
      if (rt.ch === ')' && rt.d < 0.5) { glyphs.push({ ...c, ch: ')', p: true }); continue; }
      glyphs.push({ ...c, ch: '1?', thin: true }); continue;
    }
    const g0 = get(c.id);
    let r = classify(g0, c.x0, c.y0, c.w, c.h);
    {
      // Sıkı eşikle (daha ince çizgilerle) aynı karakter
      const gS = (x, y) => (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) ? 0 : (lab[y * w + x] === c.id && inkS[y * w + x] ? 1 : 0);
      let x0 = c.x1, y0 = c.y1, x1 = c.x0, y1 = c.y0;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (gS(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (r.d > 0.35 && x1 > x0 && y1 - y0 > c.h * 0.8) { const rS = classify(gS, x0, y0, x1 - x0 + 1, y1 - y0 + 1); if (rS.d < r.d - 0.1) r = rS; }
    }
    if (r.d > 0.5) {
      // Çizgi silinirken harfin bir parçası da gitmiş olabilir (çizgiye değen D'nin alt kenarı): silinmemiş hâliyle dene
      const ya = Math.max(0, c.y0 - Math.round(mh * 0.12)), yb = Math.min(h - 1, c.y1 + Math.round(mh * 0.15));
      const g1 = (x, y) => (x < c.x0 || x > c.x1 || y < ya || y > yb) ? 0 : ink0[y * w + x];
      let y0 = yb, y1 = ya; for (let y = ya; y <= yb; y++) for (let x = c.x0; x <= c.x1; x++) if (ink0[y * w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (y1 > y0) { const r2 = classify(g1, c.x0, y0, c.w, y1 - y0 + 1); if (r2.d < r.d) r = r2; }
    }
    if (r.d <= 0.5) { glyphs.push({ ...c, ch: r.ch, d: r.d }); continue; }
    rejected.push(c);
    // Bitişik basılmış karakterler ("20", "1.A"): dikey izdüşümün en ince yerlerinden bölmeyi dene
    if (c.w > mh * 0.75) {
      const parts = splitGlyph(g0, c, mh);
      if (parts) { parts.forEach(pp => glyphs.push(pp)); continue; }
    }
    rejected.push(c);
  }
  const sameRow = (a, b) => Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) < mh * 0.4;
  // Kelime içindeki harfler (başlıktaki "TEST", "TÜRKÇE"…): bitişik karakter kümelerinde tanınmayan harf
  // çoğunluktaysa (en az 2 tane ve kümenin %40'ı) kümedeki A–E/rakamlar da başlığa aittir, atılır.
  {
    const word = rejected.filter(r => r.h >= mh * 0.6 && r.h <= mh * 1.5 && r.w <= mh * 1.6).map(r => ({ ...r, rej: true }));
    const all = glyphs.filter(g => !g.p).concat(word);
    const adj = (a, b) => sameRow(a, b) && Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < mh * 0.4;
    const seen = new Set(), drop = new Set();
    for (const st of all) {
      if (seen.has(st)) continue;
      const cl = [st]; seen.add(st);
      for (let i = 0; i < cl.length; i++) for (const o of all) if (!seen.has(o) && adj(cl[i], o)) { seen.add(o); cl.push(o); }
      const nr = cl.filter(o => o.rej).length;
      if (nr >= 2 && nr >= cl.length * 0.4) cl.forEach(o => { if (!o.rej) drop.add(o); });
    }
    for (let i = glyphs.length - 1; i >= 0; i--) if (drop.has(glyphs[i])) glyphs.splice(i, 1);
  }
  // İnce dikey parçalar: rakam/nokta/harf komşusu varsa "1", yalnızsa ayraç sayılıp atılır
  glyphs.forEach(g => {
    if (g.ch !== '1?') return;
    const near = glyphs.some(o => o !== g && o.ch !== '1?' && ((o.p && o.x0 > g.x1 && o.x0 - g.x1 < mh * 0.5 && Math.abs(o.y1 - g.y1) < mh * 0.35)
      || (!o.p && sameRow(o, g) && ((o.x0 > g.x1 && o.x0 - g.x1 < mh * 0.8 && /[0-9]/.test(o.ch)) || (g.x0 > o.x1 && g.x0 - o.x1 < mh * 0.6 && /[0-9]/.test(o.ch))))));
    g.ch = near ? '1' : '';
  });
  const gl = glyphs.filter(g => g.ch);

  // Kelimelere topla: aynı satırda, aralarında karakter yüksekliğinin ~yarısından az boşluk olanlar
  gl.sort((a, b) => a.x0 - b.x0);
  const words = [];
  for (const g of gl) {
    const cy = (g.y0 + g.y1) / 2;
    let best = null, bd = Infinity;
    for (const wd of words) {
      const gap = g.x0 - wd.x1;
      const lastCh = wd.items[wd.items.length - 1].ch;
      if (gap > mh * (lastCh === '1' ? 0.7 : 0.5) || gap < -mh * 0.2) continue;
      const ok = g.p ? (g.y1 <= wd.yb + mh * 0.25 && g.y0 >= wd.yt - mh * 0.2) : Math.abs(cy - wd.cy) < mh * 0.45;
      if (ok && gap < bd) { bd = gap; best = wd; }
    }
    if (best) { best.items.push(g); best.x1 = Math.max(best.x1, g.x1); if (!g.p) { best.yt = Math.min(best.yt, g.y0); best.yb = Math.max(best.yb, g.y1); best.cy = (best.yt + best.yb) / 2; } }
    else if (!g.p) words.push({ items: [g], x0: g.x0, x1: g.x1, yt: g.y0, yb: g.y1, cy });
  }
  const tokens = words.map(wd => ({ text: wd.items.map(i => i.ch).join(''), x0: wd.x0, y0: wd.yt, x1: wd.x1, y1: wd.yb }));
  const res = parseKeyTokens(tokens);
  return { ...res, tokens: tokens.map(t => t.text) };
}

// ---------------- Ayrıştırma (DOM yok) ----------------

/**
 * words: [{ text, x0, y0, x1, y1 }] → { groups: [anahtar dizgeleri], mode }
 */
export function parseKeyTokens(words) {
  const nums = [], lets = [], pairs = [], amb = [];
  for (const wd of words) {
    const t = String(wd.text).toUpperCase().replace(/[—–_]/g, '-').replace(/\s+/g, '');
    if (!t) continue;
    const box = { x0: wd.x0, y0: wd.y0, x1: wd.x1, y1: wd.y1, cx: (wd.x0 + wd.x1) / 2, cy: (wd.y0 + wd.y1) / 2, h: Math.max(1, wd.y1 - wd.y0), w: Math.max(1, wd.x1 - wd.x0) };
    let m;
    // "1D." (0 yerine D), "1.8" (B yerine 8) gibi karışıklıklar: noktadan önce rakam, sonra harf olmalı
    const fixNum = x => x.replace(/D/g, '0').replace(/B/g, '8');
    const fixLet = x => x === '8' ? 'B' : x === '0' ? 'D' : x;
    if ((m = t.match(/^([0-9BD]{1,3})[.)\-:]+([A-E08])[.)]?$/)) && /\d/.test(m[1][0])) { pairs.push({ n: +fixNum(m[1]), L: fixLet(m[2]), ...box }); continue; }
    if ((m = t.match(/^([0-9BD]{1,3})[.)\-:]+$/)) && /\d/.test(m[1][0])) { nums.push({ n: +fixNum(m[1]), ...box }); continue; }
    if ((m = t.match(/^(\d{1,3})[.)\-:]*([A-E])[.)]?$/))) { pairs.push({ n: +m[1], L: m[2], ...box }); continue; }
    if ((m = t.match(/^(\d{1,3})[.)\-:]*$/))) { nums.push({ n: +m[1], ...box }); continue; }
    if ((m = t.match(/^[(-]?([A-E])[.)\-]?$/))) { lets.push({ L: m[1], ...box }); continue; }
    // Tek başına "8"/"0": numara da olabilir, B/D harfi de (yazı tipine göre benzerler)
    if (t === '8' || t === '0') amb.push({ L: t === '8' ? 'B' : 'D', n: +t, ...box });
    // "1.A2.D" gibi bitişik okunmuş diziler
    const all = [...t.matchAll(/(\d{1,3})[.)\-:]+([A-E])[.)]?/g)];
    if (all.length >= 2 && all.map(a => a[0]).join('') === t) {
      const step = box.w / all.length;
      all.forEach((a, i) => pairs.push({ n: +a[1], L: a[2], ...box, x0: box.x0 + i * step, x1: box.x0 + (i + 1) * step, cx: box.x0 + (i + 0.5) * step }));
    }
  }

  const used = new Set();
  const found = [...pairs];
  // Ayrı numara ve harfleri eşle: sağdaki ya da alttaki en yakın harf (hangisi daha çok eşleşme veriyorsa)
  if (nums.length && lets.length) {
    const tryMode = mode => {
      const cand = [];
      nums.forEach((nu, ni) => lets.forEach((le, li) => {
        let dist;
        if (mode === 'right') {
          const vo = Math.min(nu.y1, le.y1) - Math.max(nu.y0, le.y0);
          if (vo < Math.min(nu.h, le.h) * 0.4 || le.cx <= nu.cx) return;
          const gap = le.x0 - nu.x1;
          if (gap > Math.max(nu.h, le.h) * 6) return;
          dist = Math.max(0, gap);
        } else {
          if (Math.abs(nu.cx - le.cx) > Math.max(nu.w, le.w, nu.h) * 0.9) return;
          if (le.cy <= nu.cy) return;
          const gap = le.y0 - nu.y1;
          if (gap > Math.max(nu.h, le.h) * 4) return;
          dist = Math.max(0, gap) + Math.abs(nu.cx - le.cx) * 0.5;
        }
        cand.push({ ni, li, dist });
      }));
      cand.sort((a, b) => a.dist - b.dist);
      const nUsed = new Set(), lUsed = new Set(), res = [];
      for (const c of cand) {
        if (nUsed.has(c.ni) || lUsed.has(c.li)) continue;
        nUsed.add(c.ni); lUsed.add(c.li);
        res.push({ ...nums[c.ni], L: lets[c.li].L, li: c.li });
      }
      return res;
    };
    const r = tryMode('right'), b = tryMode('below');
    const pick = b.length > r.length ? b : r;
    pick.forEach(p => { used.add(p.li); found.push(p); });
  }

  const restLets = lets.filter((_, i) => !used.has(i));
  if (found.length >= 3 && found.length >= restLets.length) {
    const g = splitRuns(found);
    // Numaralar kısmen okunduysa ama harflerin sayısı soru sayısına tam uyuyorsa harfleri sırayla almak daha güvenli
    if (g.length === 1 && g[0].includes('-') && !pairs.length && lets.length === g[0].length) {
      const seq = readingOrder(lets).map(l => l.L).join('');
      return { groups: [seq], mode: 'sira' };
    }
    return { groups: g, mode: 'numara' };
  }
  if (!lets.length) return { groups: found.length ? splitRuns(found) : [], mode: found.length ? 'numara' : 'yok' };
  // Numara yok (ya da çok az): harfleri okuma sırasıyla al; tek başına "8"/"0" burada B/D'dir
  const seqL = lets.concat(amb.filter(a => {
    // Harf dizisinin satır/sütun hizasında duruyorsa harf say
    return lets.some(l => Math.abs(l.cx - a.cx) < l.w * 0.8 || Math.abs(l.cy - a.cy) < l.h * 0.5);
  }));
  return { groups: [readingOrder(seqL).map(l => l.L).join('')], mode: 'sira' };
}

/** Numaralı eşleşmeleri testlere ayır (aynı görselde 1'den yeniden başlayan birden çok test olabilir) */
/** Okuma sırasında numaraları artarak giden en uzun alt dizi (başlıktaki ya da yanlış okunmuş sayıları ayıklar) */
function lis(arr) {
  const n = arr.length, len = new Array(n).fill(1), prev = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (arr[j].n < arr[i].n && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
  let e = 0; for (let i = 1; i < n; i++) if (len[i] > len[e]) e = i;
  const out = []; for (let i = e; i >= 0; i = prev[i]) { out.unshift(arr[i]); if (prev[i] < 0) break; }
  return n ? out : [];
}

function splitRuns(found) {
  const build = g => {
    // Başlıktaki sayılar gibi uç değerler: 1..N aralığının en az %60'ı dolu olacak en büyük N alınır
    const have = new Set(g.map(f => f.n));
    let max = 0;
    for (let N = 1; N <= 200; N++) { let k = 0; for (let i = 1; i <= N; i++) if (have.has(i)) k++; if (have.has(N) && k >= N * 0.6) max = N; }
    if (!max) return null;
    const arr = new Array(max).fill('-');
    g.forEach(f => { if (f.n >= 1 && f.n <= max && arr[f.n - 1] === '-') arr[f.n - 1] = f.L; });
    return arr.join('');
  };
  // Aynı numaradan birkaç tane varsa ya gerçekten birden çok test vardır ya da bir numara yanlış okunmuştur.
  // Tekrarlar azsa tek test sayılır; okuma sırasında ilk görülen geçerli olur.
  const distinct = new Set(found.map(f => f.n)).size;
  if (found.filter(f => f.n === 1).length <= 1 || (found.length - distinct) < distinct * 0.3) {
    // Aynı numaradan birden çoksa, kalabalık satırdaki (asıl anahtar tablosu) tutulur
    const rowsOf = new Map();
    found.forEach(f => { const k = Math.round(f.cy / (f.h * 0.8)); rowsOf.set(k, (rowsOf.get(k) || 0) + 1); });
    const pop = f => rowsOf.get(Math.round(f.cy / (f.h * 0.8))) || 0;
    const byN = new Map();
    for (const f of readingOrder(found, true)) { const o = byN.get(f.n); if (!o || pop(f) > pop(o)) byN.set(f.n, f); }
    const uniq = [...byN.values()];
    // Satır satır ya da sütun sütun okunduğunda artarak giden en uzun dizi
    const rowOrder = lis(readingOrder(uniq, true));
    const colOrder = lis([...uniq].sort((a, b) => a.cx - b.cx || a.cy - b.cy));
    const keep = colOrder.length > rowOrder.length ? colOrder : rowOrder;
    return [build(keep.length >= uniq.length * 0.6 ? keep : uniq)].filter(Boolean);
  }
  const ordered = readingOrder(found, true);
  const groups = [];
  let cur = null;
  for (const f of ordered) { if (f.n === 1 || !cur) { cur = []; groups.push(cur); } cur.push(f); }
  // Tek harflik ya da çoğu boş gruplar (başlıktaki "1." gibi) atılır
  return groups.map(build).filter(g => g && g.length >= 2 && g.replace(/-/g, '').length >= g.length * 0.6);
}

/**
 * Okuma sırası. Kutular satırlara toplanır. Satır sayısı sütun sayısından çok fazlaysa
 * (yan yana dikey listeler) sütun sütun, değilse satır satır okunur.
 */
function readingOrder(items, numbered = false) {
  const its = [...items].sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const it of its) {
    const r = rows.find(r => Math.abs(r.cy - it.cy) < Math.max(r.h, it.h) * 0.6);
    if (r) { r.items.push(it); r.cy = (r.cy * (r.items.length - 1) + it.cy) / r.items.length; } else rows.push({ cy: it.cy, h: it.h, items: [it] });
  }
  rows.sort((a, b) => a.cy - b.cy);
  rows.forEach(r => r.items.sort((a, b) => a.cx - b.cx));
  const maxCols = Math.max(...rows.map(r => r.items.length));
  if (!numbered && rows.length >= 3 && maxCols > 1 && rows.length > maxCols * 2) {
    const cols = [];
    for (const it of [...items].sort((a, b) => a.cx - b.cx)) {
      const c = cols.find(c => Math.abs(c.cx - it.cx) < Math.max(c.w, it.w) * 1.2);
      if (c) c.items.push(it); else cols.push({ cx: it.cx, w: it.w, items: [it] });
    }
    return cols.flatMap(c => c.items.sort((a, b) => a.cy - b.cy));
  }
  return rows.flatMap(r => r.items);
}
