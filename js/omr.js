// Optik form: üretim (çizim) ve görüntüden okuma (OMR)
import { makeCanvas, canvasToBlob, LETTERS, normNo } from './util.js';
import { A4W, A4H, FONT, FONT_HEAD, BRAND, fontsReady, imagesToPdf } from './pdfdoc.js';
import { state } from './db.js';

// ---------------- Geometri ----------------
export const FID = { size: 8, pts: [[14, 14], [196, 14], [196, 283], [14, 283]] }; // TL, TR, BR, BL merkezleri
const BAR = { x: 22, y: 12, w: 22, h: 4 }; // yön çubuğu (sol üst)
const ROW = 4.8, OPT = 5.2, R = 1.85, NUMW = 6.5;
const AREA = { x0: 14, x1: 196, y0: 88, y1: 277 };
const NO = { pitchX: 5.4, y0: 37, pitchY: 4.6, right: 193 };

/** Sınav sorularından form tanımı üret (ardışık aynı ders = bir blok) */
export function formSpecFromQuestions(isim, sorular, secenek = 5, noHane = 6) {
  const blocks = [];
  const counter = {};
  sorular.forEach((s, i) => {
    const k = s.test || s.ders;
    const last = blocks[blocks.length - 1];
    if (last && last.k === k) last.n++;
    else blocks.push({ k, ders: s.testKisa || s.testAd || s.ders, start: i, n: 1, firstNo: (counter[k] || 0) + 1 });
    counter[k] = (counter[k] || 0) + 1;
  });
  return { isim, blocks, N: sorular.length, secenek: Number(secenek) === 4 ? 4 : 5, noHane: Math.max(3, Math.min(10, Number(noHane) || 6)) };
}

/** Formdaki tüm kabarcıkların konumları (mm) */
export function formGeometry(spec) {
  const k = spec.secenek;
  const colW = NUMW + k * OPT + 1;
  const width = AREA.x1 - AREA.x0;
  const gap = 3;
  const ncol = Math.max(1, Math.min(6, Math.floor((width + gap) / (colW + gap))));
  const colX = c => ncol === 1 ? AREA.x0 : AREA.x0 + c * (width - colW) / (ncol - 1);
  const HEAD = 5.6;
  const questions = new Array(spec.N);
  const heads = [];
  let col = 0, y = AREA.y0;
  for (const b of spec.blocks) {
    let i = 0, cont = false;
    while (i < b.n) {
      if (y + HEAD + ROW > AREA.y1) { col++; y = AREA.y0; }
      if (col >= ncol) throw new Error(`Bu sınav forma sığmıyor (en fazla yaklaşık ${ncol * 36} soru). Sınavı ikiye bölün.`);
      heads.push({ x: colX(col), y, w: colW, ders: b.ders + (cont ? ' (devam)' : '') });
      y += HEAD;
      while (i < b.n && y + ROW <= AREA.y1) {
        const gi = b.start + i;
        const x = colX(col);
        questions[gi] = { no: b.firstNo + i, x, y, opts: Array.from({ length: k }, (_, o) => [x + NUMW + OPT / 2 + o * OPT, y + ROW / 2]) };
        y += ROW; i++;
      }
      if (i < b.n) { col++; y = AREA.y0; cont = true; }
    }
    y += 1.6;
  }
  const D = spec.noHane;
  const noCols = Array.from({ length: D }, (_, c) => {
    const x = NO.right - (D - 1 - c) * NO.pitchX;
    return { x, digits: Array.from({ length: 10 }, (_, d) => [x, NO.y0 + d * NO.pitchY]) };
  });
  return { questions, heads, noCols, colW };
}

// ---------------- Çizim ----------------
export function drawForm(ctx, spec, k, person = null) {
  const geo = formGeometry(spec);
  const pt = v => v * k * 0.3528;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, A4W * k, A4H * k);
  // Köşe işaretleri
  ctx.fillStyle = '#000';
  for (const [x, y] of FID.pts) ctx.fillRect((x - FID.size / 2) * k, (y - FID.size / 2) * k, FID.size * k, FID.size * k);
  ctx.fillRect(BAR.x * k, BAR.y * k, BAR.w * k, BAR.h * k);
  // Başlık
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BRAND; ctx.font = `700 ${pt(7)}px ${FONT}`;
  ctx.fillText('OPTİK CEVAP FORMU · selfdeneme.com', 48 * k, 13.6 * k);
  ctx.fillStyle = '#111'; ctx.font = `700 ${pt(13)}px ${FONT_HEAD}`;
  ctx.fillText(clip(ctx, spec.isim || 'Deneme', 140 * k), 48 * k, 19.5 * k);
  if (state.settings.kurum) { ctx.fillStyle = '#555'; ctx.font = `400 ${pt(7.5)}px ${FONT}`; ctx.fillText(clip(ctx, state.settings.kurum, 135 * k), 48 * k, 23.5 * k); }
  // Bilgi kutusu
  const bx = 14, by = 28, bw = 132, bh = 52;
  ctx.strokeStyle = BRAND; ctx.lineWidth = Math.max(1, 0.3 * k);
  ctx.strokeRect(bx * k, by * k, bw * k, bh * k);
  ctx.fillStyle = '#3a0f1c'; ctx.font = `600 ${pt(7)}px ${FONT}`;
  ctx.fillText('ADI SOYADI', (bx + 3) * k, (by + 5) * k);
  ctx.fillText('ŞUBESİ', (bx + 3) * k, (by + 15) * k);
  ctx.fillText('İMZA', (bx + 70) * k, (by + 15) * k);
  ctx.strokeStyle = '#d7a6b4'; ctx.lineWidth = Math.max(1, 0.2 * k);
  line(ctx, k, bx + 3, by + 11, bx + bw - 3, by + 11);
  line(ctx, k, bx + 3, by + 21, bx + 60, by + 21);
  line(ctx, k, bx + 70, by + 21, bx + bw - 3, by + 21);
  if (person) {
    ctx.fillStyle = '#111'; ctx.font = `600 ${pt(11)}px ${FONT}`;
    ctx.fillText(clip(ctx, person.isim || '', (bw - 8) * k), (bx + 3) * k, (by + 10.2) * k);
    ctx.fillText(clip(ctx, person.sube || '', 55 * k), (bx + 3) * k, (by + 20.2) * k);
  }
  // Yönerge
  ctx.fillStyle = '#333'; ctx.font = `400 ${pt(6.6)}px ${FONT}`;
  const tips = ['• Koyu kurşun kalem (2B) kullanın; daireyi tamamen doldurun.', '• Her soru için yalnızca bir şık işaretleyin.', '• Değiştirmek istediğinizde iz kalmayacak şekilde silin.', '• Öğrenci numaranızı sağa yaslı yazıp kodlayın.', '• Formu katlamayın; köşelerdeki siyah kareleri kapatmayın.'];
  tips.forEach((t, i) => ctx.fillText(t, (bx + 3) * k, (by + 27 + i * 3.6) * k));
  // Doğru/yanlış örnek
  ctx.font = `600 ${pt(6.4)}px ${FONT}`; ctx.fillStyle = '#3a0f1c';
  ctx.fillText('DOĞRU', (bx + 96) * k, (by + 28) * k); ctx.fillText('YANLIŞ', (bx + 96) * k, (by + 38) * k);
  bubble(ctx, k, bx + 113, by + 27, '', true);
  ['✓', '✕', '•'].forEach((m, i) => { bubble(ctx, k, bx + 113 + i * 5.5, by + 37, ''); ctx.fillStyle = '#111'; ctx.font = `700 ${pt(6.5)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m, (bx + 113 + i * 5.5) * k, (by + 37.2) * k); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; });
  // Öğrenci no
  const D = spec.noHane;
  const nx0 = NO.right - (D - 1) * NO.pitchX - NO.pitchX / 2;
  ctx.fillStyle = '#3a0f1c'; ctx.font = `600 ${pt(7)}px ${FONT}`;
  ctx.fillText('ÖĞRENCİ NUMARASI', nx0 * k, 27 * k);
  ctx.strokeStyle = BRAND; ctx.lineWidth = Math.max(1, 0.3 * k);
  ctx.strokeRect(nx0 * k, 28.5 * k, D * NO.pitchX * k, 5.2 * k);
  for (let c = 1; c < D; c++) line(ctx, k, nx0 + c * NO.pitchX, 28.5, nx0 + c * NO.pitchX, 33.7);
  const digits = person && person.no ? String(person.no).replace(/\D/g, '').slice(-D).padStart(D, ' ') : null;
  geo.noCols.forEach((col, c) => {
    const ch = digits ? digits[c] : ' ';
    if (ch !== ' ') { ctx.fillStyle = '#111'; ctx.font = `700 ${pt(9)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(ch, col.x * k, 32.6 * k); ctx.textAlign = 'left'; }
    col.digits.forEach(([x, y], d) => bubble(ctx, k, x, y, String(d), ch !== ' ' && Number(ch) === d));
  });
  // Cevap alanı
  ctx.strokeStyle = BRAND; ctx.lineWidth = Math.max(1, 0.3 * k);
  line(ctx, k, AREA.x0, AREA.y0 - 2.5, AREA.x1, AREA.y0 - 2.5);
  for (const h of geo.heads) {
    ctx.fillStyle = '#fbe0e8'; ctx.fillRect(h.x * k, h.y * k, h.w * k, 4.6 * k);
    ctx.fillStyle = '#3a0f1c'; ctx.font = `700 ${pt(6.4)}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillText(clip(ctx, h.ders.toLocaleUpperCase('tr-TR'), (h.w - 2) * k), (h.x + 1) * k, (h.y + 2.4) * k);
    ctx.textBaseline = 'alphabetic';
  }
  for (const q of geo.questions) {
    if (!q) continue;
    ctx.fillStyle = '#111'; ctx.font = `600 ${pt(7)}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(q.no), (q.x + NUMW - 0.8) * k, (q.y + ROW / 2 + 0.1) * k);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    q.opts.forEach(([x, y], o) => bubble(ctx, k, x, y, LETTERS[o]));
  }
  // Alt bilgi
  ctx.fillStyle = '#999'; ctx.font = `400 ${pt(6)}px ${FONT}`;
  ctx.fillText(`${spec.N} soru · ${spec.secenek} şık · Bu form selfdeneme.com ile okunur`, 24 * k, 288.6 * k);
  return geo;
}

function bubble(ctx, k, x, y, label, filled = false) {
  ctx.beginPath(); ctx.arc(x * k, y * k, R * k, 0, Math.PI * 2);
  if (filled) { ctx.fillStyle = '#111'; ctx.fill(); return; }
  ctx.strokeStyle = '#d0587a'; ctx.lineWidth = Math.max(1, 0.22 * k); ctx.stroke();
  if (label) {
    ctx.fillStyle = '#e59ab0'; ctx.font = `600 ${2.3 * k}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x * k, (y + 0.15) * k); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}
function line(ctx, k, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke(); }
function clip(ctx, s, maxW) { s = String(s || ''); if (ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }

/** Form PDF'i: people boşsa tek boş form, doluysa kişiye özel formlar (+ istenirse boş form) */
export async function buildFormsPdf(spec, people = [], blankCount = 0, onProgress = null) {
  await fontsReady();
  formGeometry(spec); // sığma kontrolü
  const k = 200 / 25.4;
  const list = [...people.map(p => p), ...Array.from({ length: blankCount }, () => null)];
  if (!list.length) list.push(null);
  const blobs = [];
  for (let i = 0; i < list.length; i++) {
    onProgress && onProgress(i / list.length, `Form ${i + 1}/${list.length}`);
    const c = makeCanvas(A4W * k, A4H * k);
    drawForm(c.getContext('2d'), spec, k, list[i]);
    blobs.push(await canvasToBlob(c, 'image/png'));
    c.width = 1;
  }
  return await imagesToPdf(blobs);
}

// ---------------- Okuma ----------------
function toGray(canvas, maxSide) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * s)), h = Math.max(1, Math.round(canvas.height * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return { g, w, h, scale: s };
}

function findBlobs(gray) {
  const { g, w, h } = gray;
  // Bradley uyarlamalı eşik
  const S = Math.max(15, Math.round(Math.max(w, h) / 10));
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const mask = new Uint8Array(w * h);
  const hs = S >> 1;
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - hs), yb = Math.min(h - 1, y + hs);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - hs), xb = Math.min(w - 1, x + hs);
      const cnt = (xb - xa + 1) * (yb - ya + 1);
      const sum = I[(yb + 1) * (w + 1) + xb + 1] - I[ya * (w + 1) + xb + 1] - I[(yb + 1) * (w + 1) + xa] + I[ya * (w + 1) + xa];
      const v = g[y * w + x];
      if (v * cnt < sum * 0.72 && v < 150) mask[y * w + x] = 1;
    }
  }
  // Bağlı bileşenler
  const lab = new Int32Array(w * h);
  const blobs = [];
  const stack = new Int32Array(w * h);
  let id = 0;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || lab[p]) continue;
    id++;
    let sp = 0; stack[sp++] = p; lab[p] = id;
    let n = 0, sx = 0, sy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    while (sp) {
      const q = stack[--sp];
      const x = q % w, y = (q / w) | 0;
      n++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0) { const r = q - 1; if (mask[r] && !lab[r]) { lab[r] = id; stack[sp++] = r; } }
      if (x < w - 1) { const r = q + 1; if (mask[r] && !lab[r]) { lab[r] = id; stack[sp++] = r; } }
      if (y > 0) { const r = q - w; if (mask[r] && !lab[r]) { lab[r] = id; stack[sp++] = r; } }
      if (y < h - 1) { const r = q + w; if (mask[r] && !lab[r]) { lab[r] = id; stack[sp++] = r; } }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (bw < 5 || bh < 5) continue;
    const asp = bw / bh;
    const fill = n / (bw * bh);
    if (asp < 0.55 || asp > 1.8 || fill < 0.62) continue;
    if (bw > w / 5 || bh > h / 5) continue;
    blobs.push({ n, cx: sx / n, cy: sy / n, bw, bh });
  }
  return blobs;
}

function orderQuad(pts) {
  const cx = pts.reduce((a, p) => a + p.cx, 0) / 4, cy = pts.reduce((a, p) => a + p.cy, 0) / 4;
  return pts.slice().sort((a, b) => Math.atan2(a.cy - cy, a.cx - cx) - Math.atan2(b.cy - cy, b.cx - cx));
}
function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.cx * n.cy - n.cx * p.cy; }
  return Math.abs(a) / 2;
}
function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.cx - a.cx) * (c.cy - b.cy) - (b.cy - a.cy) * (c.cx - b.cx);
    const s = Math.sign(cr);
    if (s === 0) return false;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}
const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

function pickFiducials(blobs) {
  const cand = blobs.slice().sort((a, b) => b.n - a.n).slice(0, 14);
  const expect = (FID.pts[1][0] - FID.pts[0][0]) / (FID.pts[3][1] - FID.pts[0][1]);
  let best = null, bestScore = 0;
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) for (let c = b + 1; c < cand.length; c++) for (let d = c + 1; d < cand.length; d++) {
    const set = [cand[a], cand[b], cand[c], cand[d]];
    const ns = set.map(s => s.n);
    const sim = Math.min(...ns) / Math.max(...ns);
    if (sim < 0.3) continue;
    const q = orderQuad(set);
    if (!isConvex(q)) continue;
    const s0 = dist(q[0], q[1]), s1 = dist(q[1], q[2]), s2 = dist(q[2], q[3]), s3 = dist(q[3], q[0]);
    let r = (s0 + s2) / (s1 + s3);
    if (r > 1) r = 1 / r;
    const ratioErr = Math.abs(r - expect) / expect;
    if (ratioErr > 0.35) continue;
    // kenarlar birbirine yakın olmalı (aşırı perspektif yok)
    if (Math.min(s0, s2) / Math.max(s0, s2) < 0.6 || Math.min(s1, s3) / Math.max(s1, s3) < 0.6) continue;
    const size = Math.sqrt(ns.reduce((x, y) => x + y, 0) / 4);
    const area = quadArea(q);
    // kare boyutu ile dörtgen boyutu orantılı olmalı (8mm / ~220mm köşegen)
    const diag = (dist(q[0], q[2]) + dist(q[1], q[3])) / 2;
    const relSize = size / diag;
    if (relSize < 0.012 || relSize > 0.09) continue;
    const score = area * sim * (1 - ratioErr);
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return best;
}

// Homografi: form (mm) -> görüntü (px)
export function homography(src, dst) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('Köşe noktaları geçersiz');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  const h = B.map((b, i) => b / A[i][i]);
  return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
}

function sampler(gray) {
  const { g, w, h } = gray;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy) + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  };
}

/** Bir kabarcığın içindeki ortalama parlaklık */
function bubbleMean(S, H, x, y, r) {
  let sum = 0, n = 0;
  const steps = 5;
  for (let i = -steps; i <= steps; i++) for (let j = -steps; j <= steps; j++) {
    const dx = i / steps, dy = j / steps;
    if (dx * dx + dy * dy > 1) continue;
    const [u, v] = H(x + dx * r, y + dy * r);
    sum += S(u, v); n++;
  }
  return sum / n;
}

const T_FILL = 0.42, T_LIGHT = 0.24;

function decide(fills, allowBlank = true) {
  const idx = fills.map((f, i) => [f, i]).sort((a, b) => b[0] - a[0]);
  const [m1, i1] = idx[0], m2 = idx[1] ? idx[1][0] : 0;
  if (m1 < T_LIGHT) return { ch: ' ', flag: false };
  if (m1 >= T_FILL) {
    if (m2 >= T_FILL && m2 > m1 * 0.72) return { ch: '*', flag: true, reason: 'Birden fazla işaret' };
    if (m2 >= T_LIGHT && m1 - m2 < 0.3) return { ch: String(i1), flag: true, reason: 'Silinmiş işaret olabilir' };
    return { ch: String(i1), flag: false };
  }
  // zayıf işaret
  if (m2 >= T_LIGHT && m1 - m2 < 0.12) return { ch: '*', flag: true, reason: 'Belirsiz işaretler' };
  return { ch: String(i1), flag: true, reason: 'Silik işaret' };
  void allowBlank;
}

/**
 * Bir sayfa görüntüsünü oku.
 * Döndürür: {ok, error, no, noFlag, answers (string), flags: Map(qi->reason), fills, rectBlob}
 */
export async function readSheet(canvas, spec) {
  const geo = formGeometry(spec);
  const small = toGray(canvas, 1000);
  const blobs = findBlobs(small);
  const quad = pickFiducials(blobs);
  if (!quad) return { ok: false, error: 'Köşe işaretleri bulunamadı. Formun dört köşesindeki siyah kareler görünür ve net olmalı.' };
  const big = toGray(canvas, 2200);
  const f = big.scale / small.scale;
  const pts = quad.map(p => ({ cx: p.cx * f, cy: p.cy * f }));
  const S = sampler(big);
  // Dört olası döndürmeyi dene; yön çubuğu en koyu olanı seç
  let H = null, bestBar = 1e9;
  for (let sft = 0; sft < 4; sft++) {
    const dst = [0, 1, 2, 3].map(i => { const p = pts[(i + sft) % 4]; return [p.cx, p.cy]; });
    let Hc;
    try { Hc = homography(FID.pts, dst); } catch { continue; }
    let bar = 0, n = 0;
    for (let i = 1; i < 8; i++) for (let j = 1; j < 4; j++) { const [u, v] = Hc(BAR.x + BAR.w * i / 8, BAR.y + BAR.h * j / 4); bar += S(u, v); n++; }
    bar /= n;
    // ayna konumlar beyaz olmalı (karşılaştırma için)
    if (bar < bestBar) { bestBar = bar; H = Hc; }
  }
  // Mürekkep ve kâğıt referansı
  const inks = [];
  for (const [x, y] of FID.pts) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const [u, v] = H(x + i * 0.9, y + j * 0.9); inks.push(S(u, v)); }
  inks.sort((a, b) => a - b);
  const ink = inks[inks.length >> 1];
  const paperSamples = [];
  for (let x = 20; x < 190; x += 6) for (const y of [82.6, 84]) { const [u, v] = H(x, y); paperSamples.push(S(u, v)); }
  paperSamples.sort((a, b) => a - b);
  const paperGlobal = paperSamples[Math.floor(paperSamples.length * 0.7)];
  if (paperGlobal - ink < 40) return { ok: false, error: 'Görüntü çok karanlık ya da kontrastı düşük. Daha aydınlık bir ortamda yeniden tarayın.' };
  const rr = R * 0.62;
  const fillOf = (x, y, paper) => {
    const m = bubbleMean(S, H, x, y, rr);
    return Math.max(0, (paper - m) / Math.max(30, paper - ink));
  };
  const localPaper = (samplePts) => {
    const s = [];
    for (const [x, y] of samplePts) { const [u, v] = H(x, y); s.push(S(u, v)); }
    s.sort((a, b) => a - b);
    const p = s[Math.floor(s.length * 0.75)];
    return Math.max(p, ink + 40);
  };
  const rowPaperPts = opts => {
    const out = [];
    for (let i = 0; i < opts.length - 1; i++) {
      const mx = (opts[i][0] + opts[i + 1][0]) / 2, my = opts[i][1];
      for (const dy of [-0.6, 0, 0.6]) out.push([mx, my + dy]);
    }
    const last = opts[opts.length - 1];
    out.push([last[0] + OPT * 0.62, last[1]]);
    return out;
  };
  // Soru kabarcıkları
  const raw = geo.questions.map(q => { const p = localPaper(rowPaperPts(q.opts)); return q.opts.map(([x, y]) => fillOf(x, y, p)); });
  const noRaw = geo.noCols.map(c => { const p = localPaper(c.digits.flatMap(([x, y]) => [[x + NO.pitchX / 2, y], [x - NO.pitchX / 2, y]])); return c.digits.map(([x, y]) => fillOf(x, y, p)); });
  // Boş kabarcık taban düzeyi (harf baskısı vb.)
  const all = raw.flat().concat(noRaw.flat()).sort((a, b) => a - b);
  const base = all[Math.floor(all.length * 0.3)] || 0;
  const adj = v => Math.max(0, v - base);
  let answers = '';
  const flags = new Map();
  raw.forEach((fs, qi) => {
    const d = decide(fs.map(adj));
    const ch = d.ch === ' ' || d.ch === '*' ? d.ch : LETTERS[+d.ch];
    answers += ch;
    if (d.flag) flags.set(qi, d.reason);
  });
  let no = '', noFlag = '';
  const noChars = noRaw.map(fs => {
    // Sütundaki tüm kabarcıklar için: komşu kabarcıkların arası kâğıttır
    const d = decide(fs.map(adj));
    if (d.flag) noFlag = 'Numara okunurken belirsiz işaret';
    return d.ch === ' ' ? ' ' : d.ch === '*' ? '?' : d.ch;
  });
  const noStr = noChars.join('').trim();
  if (/\s/.test(noStr)) noFlag = 'Numarada boş hane var';
  if (noStr.includes('?')) noFlag = 'Numarada birden fazla işaretli hane var';
  no = noStr.replace(/\s/g, '');
  if (!no) noFlag = noFlag || 'Numara kodlanmamış';
  // Düzeltilmiş görüntü (inceleme için) — 5 px/mm
  const rect = rectify(big, H, 5);
  const rectBlob = await canvasToBlob(rect, 'image/jpeg', 0.85);
  rect.width = 1;
  return { ok: true, no: no.includes('?') ? no : normNo(no), noFlag, answers, flags, fills: raw.map(fs => fs.map(adj)), rectBlob };
}

function rectify(gray, H, ppm) {
  const W = Math.round(A4W * ppm), Hh = Math.round(A4H * ppm);
  const c = makeCanvas(W, Hh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, Hh);
  const S = sampler(gray);
  const d = img.data;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const [u, v] = H(x / ppm, y / ppm);
    const val = S(u, v);
    const i = (y * W + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = val; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** İnceleme için düzeltilmiş görüntüden bir sorunun satırını kes */
export function rowCropRect(spec, qi) {
  const geo = formGeometry(spec);
  const q = geo.questions[qi];
  return { x: q.x - 0.5, y: q.y - 0.6, w: geo.colW + 1, h: ROW + 1.2 };
}
export function noCropRect(spec) {
  const D = spec.noHane;
  const x0 = NO.right - (D - 1) * NO.pitchX - NO.pitchX / 2 - 1;
  return { x: x0, y: 27.5, w: D * NO.pitchX + 2, h: NO.y0 + 9 * NO.pitchY + 3 - 27.5 };
}

// ---------------- Kaynak dosyaları sayfalara çevir ----------------
let pdfjsPromise = null;
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    }).catch(e => { pdfjsPromise = null; throw new Error('PDF okuyucu yüklenemedi: ' + e.message); });
  }
  return pdfjsPromise;
}

/** PDF'in her sayfasını canvas olarak döndür (generator) */
export async function* pdfPages(file, targetWidth = 1700) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = targetWidth / vp0.width;
      const vp = page.getViewport({ scale });
      const c = makeCanvas(vp.width, vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      yield { canvas: c, page: i, total: doc.numPages };
    }
  } finally { doc.destroy(); }
}

export async function imageFileToCanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const c = makeCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return c;
}

export { ROW, OPT, R };
