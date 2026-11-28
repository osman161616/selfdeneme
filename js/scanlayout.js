// Metin katmanı olmayan (taranmış ya da yazısı resme/çizgiye dönüştürülmüş) PDF sayfaları için yerleşim çıkarımı.
// Sayfa görüntüsündeki mürekkep parçalarından kelime kutuları üretilir; satır başındaki kısa kelimeler
// (soru numarası "12.", şık "A)", sayfa numarası) karakter tanıyıcıyla okunur. Çıktı, PDF'in metin katmanıyla
// aynı biçimdedir: detectQuestions bu öğelerle çalışır.
import { classifyGlyph } from './keyocr.js';

/**
 * canvas: sayfanın scale (px/pt) ölçeğinde çizilmiş görüntüsü
 * Dönüş: { items: [{str,x,y,r,b,size,base,rot:false}], imgs: [{x,y,r,b,w,h}] } (pt)
 */
export function scanPage(canvas, scale) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const ink = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) ink[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) < 165 ? 1 : 0;

  // Bağlı parçalar (8 komşuluk)
  const lab = new Int32Array(w * h), stack = new Int32Array(w * h), comps = [];
  for (let s0 = 0; s0 < ink.length; s0++) {
    if (!ink[s0] || lab[s0]) continue;
    const id = comps.length + 1;
    let sp = 0; stack[sp++] = s0; lab[s0] = id;
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
  if (!comps.length) return { items: [], imgs: [] };

  // Yazı yüksekliği: harf boyutundaki parçaların ortanca yüksekliği
  const hs = comps.filter(c => c.h >= 4 && c.h <= 80 && c.w <= 80 && c.w >= 2).map(c => c.h).sort((a, b) => a - b);
  const ch = hs.length ? hs[Math.floor(hs.length * 0.6)] : 12;
  const big = c => c.h > ch * 3.2 || c.w > ch * 6;
  const imgs = [], chars = [];
  for (const c of comps) {
    if (big(c)) { if (c.w > 4 && c.h > 4) imgs.push({ x: c.x0 / scale, y: c.y0 / scale, r: (c.x1 + 1) / scale, b: (c.y1 + 1) / scale, w: c.w / scale, h: c.h / scale }); }
    else if (c.n >= 2) chars.push(c);
  }

  // Kelimeler: aynı satırda (dikey örtüşme) ve aralarında küçük boşluk olan parçalar; noktalar/şapkalar en yakın harfe
  const par = chars.map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  const order = chars.map((c, i) => i).sort((a, b) => chars[a].x0 - chars[b].x0);
  const small = c => c.h < ch * 0.42 && c.w < ch * 0.6;
  const gapMax = ch * 0.42;
  for (let oi = 0; oi < order.length; oi++) {
    const a = chars[order[oi]];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const b = chars[order[oj]];
      if (b.x0 - a.x1 > ch * 1.2) break;
      const gap = b.x0 - a.x1;
      const vo = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (small(a) || small(b)) {
        // Nokta/virgül/şapka: yatayda çakışan ya da çok yakın, dikeyde bitişik
        const s = small(a) ? a : b, o = small(a) ? b : a;
        if (small(o)) continue;
        const hx = Math.min(s.x1, o.x1) - Math.max(s.x0, o.x0);
        const vgap = Math.max(o.y0 - s.y1, s.y0 - o.y1);
        // Nokta/virgül soldaki harfe aittir: sağındaki kelimeye bağlanmaz
        const after = s.x0 >= o.x1 - 1;
        if ((hx > ch * 0.05 && vgap < ch * 0.45) || (after && vo > 0 && s.x0 - o.x1 < ch * 0.8)) uni(order[oi], order[oj]);
        continue;
      }
      if (vo > Math.min(a.h, b.h) * 0.35 && gap < gapMax) uni(order[oi], order[oj]);
    }
  }
  const groups = new Map();
  chars.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });

  const words = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.x0 - b.x0);
    const main = g.filter(c => !small(c));
    if (!main.length) continue;
    const x0 = Math.min(...g.map(c => c.x0)), x1 = Math.max(...g.map(c => c.x1)), y0 = Math.min(...g.map(c => c.y0)), y1 = Math.max(...g.map(c => c.y1));
    const bots = main.map(c => c.y1).sort((a, b) => a - b);
    const base = bots[Math.floor(bots.length / 2)] + 1;
    const capH = Math.max(...main.map(c => c.h));
    words.push({ g, main, x0, x1, y0, y1, base, capH });
  }

  // Kalın yazılarda "1" ile yanındaki rakam arasında geniş boşluk olur ("1 0."): dar tek parçalı kelimeyi sağındaki kısa kelimeyle birleştir
  words.sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < words.length; i++) {
    const a = words[i];
    if (!a || a.main.length > 2 || a.x1 - a.x0 > ch * 0.9) continue;
    const bi = words.findIndex(o => o && o !== a && o.x0 > a.x1 && o.x0 - a.x1 < ch * 0.95 && Math.abs(o.base - a.base) < ch * 0.3 && o.main.length <= 3 && o.x1 - o.x0 < ch * 2.6);
    if (bi < 0) continue;
    const b = words[bi];
    const g = a.g.concat(b.g), main = a.main.concat(b.main);
    words[i] = { g, main, x0: a.x0, x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), base: Math.max(a.base, b.base), capH: Math.max(a.capH, b.capH) };
    words[bi] = null;
    i--;
  }
  for (let i = words.length - 1; i >= 0; i--) if (!words[i]) words.splice(i, 1);

  // Dikey yazılar (sütun arasındaki "… Yayınları" gibi): tek parçalı kelimeler aynı hizada, aralıksız alt alta dizilir
  {
    const singles = words.filter(wd => wd.main.length === 1).sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
    const used = new Set();
    for (const a of singles) {
      if (used.has(a)) continue;
      const col = singles.filter(o => Math.abs(o.x0 - a.x0) <= 3 && Math.abs(o.x1 - a.x1) <= 6).sort((p, q) => p.y0 - q.y0);
      let run = [col[0]];
      const flush = () => { if (run.length >= 5) run.forEach(r => { r.vert = true; used.add(r); }); };
      for (let k = 1; k < col.length; k++) {
        if (col[k].y0 - run[run.length - 1].y1 < ch * 0.9) run.push(col[k]); else { flush(); run = [col[k]]; }
      }
      flush();
    }
  }

  // Satır başı mı? (aynı satırda hemen solunda kelime yok)
  const leftFree = wd => !words.some(o => o !== wd && !o.vert && o.x1 < wd.x0 && wd.x0 - o.x1 < ch * 1.6 && Math.abs(o.base - wd.base) < ch * 0.6);
  const get = id => (x, y) => (x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id ? 1 : 0);
  const read = c => classifyGlyph(get(c.id), c.x0, c.y0, c.w, c.h);

  const items = [];
  for (const wd of words) {
    let str = '';
    const short = wd.main.length <= 4 && wd.x1 - wd.x0 < ch * 3.2;
    if (short && (leftFree(wd) || wd.main.length <= 2)) {
      // Son parça nokta mı? (taban çizgisinde, küçük)
      wd.g.sort((a, b) => a.x0 - b.x0); wd.main.sort((a, b) => a.x0 - b.x0);
      const last = wd.g[wd.g.length - 1];
      const dot = small(last) && last.y1 >= wd.base - ch * 0.3 && last.x0 >= wd.main[wd.main.length - 1].x1 - 1;
      const glyphs = wd.main.filter(c => c !== last || !dot);
      const rs = glyphs.map(read);
      const ok = rs.every(r => r.d < 0.55);
      if (ok) {
        const t = rs.map(r => r.ch).join('');
        if (/^\d{1,3}$/.test(t) && dot) str = t + '.';
        else if (/^\d{1,3}\)$/.test(t)) str = t;
        else if (/^[A-E]\)$/.test(t)) str = t;
        else if (/^[A-E]$/.test(t) && dot) str = t + '.';
        else if (/^\d{1,4}$/.test(t)) str = t;
      }
    }
    if (!str) str = 'w'.repeat(Math.max(2, wd.main.length));
    const size = Math.max(4, wd.capH / scale / 0.72);
    const base = wd.base / scale;
    items.push({ str, x: wd.x0 / scale, r: (wd.x1 + 1) / scale, y: wd.y0 / scale, b: wd.y1 / scale + 0.5, size, base, rot: !!wd.vert, scan: true });
  }
  return { items, imgs };
}
