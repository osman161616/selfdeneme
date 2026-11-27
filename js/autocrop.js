/**
 * Otomatik soru kesme — metin katmanı olan PDF'ler için.
 *
 * Fikir: Soru numaraları ("1.", "2." …) metin katmanında ayrı ayrı bulunur ve
 * her sayfada aynı sol kenar hizasındadır (sütun başları). Bu hizaları bulup
 * numaraları okuma sırasına koyunca her sorunun başladığı yer kesinleşir; soru,
 * bir sonraki numaraya (ya da sütun/sayfa sonuna) kadar sürer. Grafikler ve
 * resimler metin olmasa da bu dikdörtgenin içinde kaldığı için birlikte kesilir.
 *
 * Bu dosyanın tespit kısmı DOM kullanmaz (Node'da da test edilebilir).
 */

const NUM_ONLY = /^(\d{1,3})[.)]$/;
const NUM_LEAD = /^(\d{1,3})[.)]\s+\S/;
// Ortak köklü sorular: "6. ve 7. soruları …", "6 - 9. soruları …", "Aşağıdaki bilgilere göre 3 ve 4. soruları cevaplayınız."
const INTRO_LEAD = /^\d{1,3}\s*\.?\s*(?:ve|ile|,|-|–|—)\s*\d{1,3}\s*\.?\s*sorular/i;
const INTRO_EN = /questions?\s*\(?\s*\d{1,3}\s*(?:-|–|—|and|&)\s*\d{1,3}\s*\)?\s*(?:according|based|using|on)/i;
const INTRO_ANY = /(\d{1,3})\s*\.?\s*(?:ve|ile|,|-|–|—)\s*(\d{1,3})\s*\.?\s*sorular[ıi]n?[ıi]?|sorular[ıi]\s+(?:aşağıdaki|yukarıdaki)|(?:bilgilere|metne|tabloya|grafiğe|metinlere|görsele|şekle)\s+göre\s+cevaplay[ıi]n[ıi]z/i;
const INTRO_END = /(cevaplay[ıi]n[ıi]z|yan[ıi]tlay[ıi]n[ıi]z|below|above)\s*[.:]?\s*$/i;
const STOPPER_UP = /(TEST[İI]?\s*B[İI]TT[İI]|TESTİNE\s+GEÇ|SINAV\s+B[İI]TT[İI]|D[İI]ĞER\s+SAYFAYA\s+GEÇ)/i;

/** pdf.js textContent → sayfa koordinatlarında (sol üst köken, pt) öğeler */
export function normalizeItems(items, W, H) {
  const out = [];
  for (const it of items) {
    const str = (it.str || '').replace(/\s+/g, ' ').trim();
    if (!str) continue;
    const [a, b, c, d, e, f] = it.transform;
    const rot = Math.abs(b) > 0.01 || Math.abs(c) > 0.01;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || 10;
    if (!rot) {
      const base = H - f;
      const sz = Math.abs(d) || size;
      const prev = out[out.length - 1];
      // Ayrı parçalara bölünmüş soru numarası: "2" + "." → "2."
      if (prev && !prev.rot && /^\d{1,2}$/.test(prev.str) && /^\d{0,2}[.)]/.test(str) && (prev.str + str).match(/^\d{1,3}[.)]/) && Math.abs(prev.base - base) < 0.8 && e - prev.r > -1 && e - prev.r < 1.6 && Math.abs(prev.size - sz) < 0.6) {
        prev.str = prev.str + str; prev.r = e + (it.width || 0); continue;
      }
      out.push({ str, x: e, y: base - sz * 0.8, r: e + (it.width || 0), b: base + sz * 0.22, size: sz, base, rot: false });
    } else {
      const ul = Math.hypot(a, b) || 1, vl = Math.hypot(c, d) || 1;
      const u = [a / ul, b / ul], v = [c / vl, d / vl];
      const w = it.width || 0, h = vl;
      const pts = [[e, f], [e + u[0] * w, f + u[1] * w]];
      const add = (p, k) => [p[0] + v[0] * h * k, p[1] + v[1] * h * k];
      pts.push(add(pts[0], 0.85), add(pts[1], 0.85), add(pts[0], -0.25), add(pts[1], -0.25));
      const xs = pts.map(p => p[0]), ys = pts.map(p => H - p[1]);
      out.push({ str, x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys), size, base: H - f, rot: true });
    }
  }
  return out;
}

/** Sayfadaki resimlerin yerleri (sol üst köken, pt). Resimler metin katmanında görünmez; kesim sınırları ve filigran temizliği için gerekir. */
export async function pageImages(page, OPS) {
  const out = [];
  try {
    const ol = await page.getOperatorList();
    const [vx0, vy0, vx1, vy1] = page.view, W = vx1 - vx0, H = vy1 - vy0;
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    let ctm = [1, 0, 0, 1, 0, 0];
    const st = [];
    const IMG = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(v => v !== undefined));
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.save) st.push(ctm);
      else if (fn === OPS.restore) ctm = st.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, a);
      else if (fn === OPS.paintFormXObjectBegin) { st.push(ctm); const m = a && a[0]; if (m && m.length === 6) ctm = mul(ctm, m); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = st.pop() || ctm;
      else if (IMG.has(fn)) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
        const xs = pts.map(p => p[0] - vx0), ys = pts.map(p => H - (p[1] - vy0));
        const r = { x: Math.max(0, Math.min(...xs)), y: Math.max(0, Math.min(...ys)), r: Math.min(W, Math.max(...xs)), b: Math.min(H, Math.max(...ys)) };
        const area = (r.r - r.x) * (r.b - r.y);
        // Sayfa arka planı / tam sayfa filigran resimleri ve minik süsler sayılmaz
        const edge = ((r.x < 12 || r.r > W - 12) && r.r - r.x < W * 0.25)   // sayfa kenarındaki sekme/şerit
          || (r.r - r.x > W * 0.8 && r.b - r.y < 40);                      // sayfa boyu yatay şerit (üst/alt bilgi süsü)
        if (!edge && area > 60 && area < W * H * 0.35 && r.r - r.x > 6 && r.b - r.y > 6) out.push(r);
      }
    }
  } catch { /* operatör listesi okunamazsa resimsiz devam */ }
  return out;
}

function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

/**
 * pages: [{ w, h, items: normalizeItems(...) }]  (index 0 = 1. sayfa)
 * opts: { from, to } (1 tabanlı sayfa aralığı, isteğe bağlı)
 */
export function detectQuestions(pages, opts = {}) {
  const from = Math.max(1, opts.from || 1), to = Math.min(pages.length, opts.to || pages.length);
  const warnings = [];
  const textPages = pages.filter(p => p.items.length > 5).length;
  if (!textPages) return { tests: [], questions: [], warnings: ['Bu PDF\'te metin katmanı yok (taranmış belge). Otomatik kesme yapılamaz; soruları elle kesebilirsiniz.'], noText: true };

  // Gövde yazı boyutu
  const sizes = [];
  pages.forEach(p => p.items.forEach(i => { if (!i.rot && i.str.length > 3) sizes.push(Math.round(i.size * 2) / 2); }));
  const body = median(sizes) || 10;

  // Her sayfada aynı yerde, aynı boyda duran resimler (arka plan amblemi, filigran, süs) içerik sayılmaz
  const imgKey = im => [im.x, im.y, im.r, im.b].map(v => Math.round(v / 6)).join(',');
  const imgRep = new Map();
  pages.forEach(p => { const seen = new Set(); (p.imgs || []).forEach(im => { const k = imgKey(im); if (!seen.has(k)) { seen.add(k); imgRep.set(k, (imgRep.get(k) || 0) + 1); } }); });
  pages.forEach(p => { if (p.imgs) p.imgs = p.imgs.filter(im => (imgRep.get(imgKey(im)) || 0) < 3); });

  // 1) Aday numaralar
  const cands = [];
  for (let pi = from - 1; pi < to; pi++) {
    const p = pages[pi];
    for (const it of p.items) {
      if (it.rot) continue;
      let m = it.str.match(NUM_ONLY), numW;
      if (m) numW = it.r - it.x;
      else if ((m = it.str.match(NUM_LEAD))) numW = (it.r - it.x) * (m[1].length + 1.6) / it.str.length;
      else continue;
      const n = +m[1];
      if (n < 1 || n > 200) continue;
      // Satırın başında mı? (hemen solunda aynı satırda yazı olmamalı)
      const leftBusy = p.items.some(o => o !== it && !o.rot && Math.abs(o.base - it.base) < 2 && o.r <= it.x + 0.5 && o.r > it.x - 6);
      if (leftBusy) continue;
      // "6. ve 7. soruları aşağıdaki bilgilere göre…" gibi ortak kök cümlesi soru numarası değildir
      const line = p.items.filter(o => !o.rot && Math.abs(o.base - it.base) < 2 && o.x >= it.x - 0.5 && o.x < it.x + p.w * 0.5).sort((a, b) => a.x - b.x).map(o => o.str).join(' ');
      if (INTRO_LEAD.test(line)) continue;
      // Cevap anahtarı satırı ("1. A", "1-A 11-C 21-B") soru değildir
      if (/^\d{1,3}\s*[.)\-:]?\s*[A-E]\s*(?:\s+\d{1,3}\s*[.)\-:]?\s*[A-E]\s*)*$/.test(line)) continue;
      // Ardından metin ya da şekil gelmeli; tek başına "1." satırı (liste/tablo) da olabilir — sırayla elenir.
      cands.push({ page: pi, n, x: it.x, y: it.y, b: it.b, numR: it.x + numW, cx: it.x + numW / 2, size: it.size, it });
    }
  }
  if (!cands.length) return { tests: [], questions: [], warnings: ['Soru numarası bulunamadı.'], noText: false };

  // 2) Numara imzası. Her sayfada aynı yerde tekrar eden "numaralar" (ör. sayfa başlığındaki "8. Sınıf") soru değildir.
  const repC = new Map();
  const rk = c => c.it.str + '@' + Math.round(c.x / 4) + ',' + Math.round(c.y / 4);
  cands.forEach(c => { const k = rk(c); if (!repC.has(k)) repC.set(k, new Set()); repC.get(k).add(c.page); });
  // (Yalnızca numaradan sonra yazı da içeren öğeler: tek başına "1." her testin ilk sorusunda aynı yerde durabilir.)
  const repLim = Math.max(3, Math.ceil(textPages * 0.4));
  const cand2 = cands.filter(c => !(NUM_LEAD.test(c.it.str) && repC.get(rk(c)).size >= repLim) && !/^\d+\s*[.)]\s*s[ıi]n[ıi]f/i.test(c.it.str));
  if (!cand2.length) return { tests: [], questions: [], warnings: ['Soru numarası bulunamadı.'], noText: false };
  // Aynı hizada en çok sayfada görülen numaralar soru numaralarının yazı boyutunu ve biçimini ("1." mi "1)" mi) verir
  const clusters = [];
  for (const c of cand2) {
    let cl = clusters.find(k => Math.abs(k.x - c.x) <= 3);
    if (!cl) { cl = { x: c.x, pages: new Set(), items: [] }; clusters.push(cl); }
    cl.items.push(c); cl.pages.add(c.page);
  }
  clusters.forEach(k => { k.x = median(k.items.map(i => i.x)); k.cx = median(k.items.map(i => i.cx)); k.r = median(k.items.map(i => i.numR)); k.score = k.pages.size + k.items.length * 0.01; });
  clusters.sort((a, b) => b.score - a.score);
  const punct = c => (c.it.str.match(/^\d+\s*([.)])/) || [])[1] || '.';
  const top = clusters[0];
  const anchorSize = median(top.items.map(i => i.size));
  const pc = new Map(); top.items.forEach(i => pc.set(punct(i), (pc.get(punct(i)) || 0) + 1));
  const anchorPunct = [...pc].sort((a, b) => b[1] - a[1])[0][0];
  // Soru numaraları belge boyunca aynı boyuttadır; kapak/uyarı listelerinin numaraları genelde bir punto küçüktür
  const sig = c => Math.abs(c.size - anchorSize) <= Math.max(0.5, anchorSize * 0.06) && punct(c) === anchorPunct;
  // Hizalı mı? Birden çok sayfada görülen bir hizada ya da aynı sayfada başka bir numarayla aynı hizada.
  // (Kutu içinde ortalanmış numaralarda "9." ile "10." farklı x'te başlar: orta ya da sağ hiza da sayılır.)
  const near = (m, c) => Math.abs(m.x - c.x) <= 3 || Math.abs(m.cx - c.cx) <= 1.5 || Math.abs(m.r - c.numR) <= 1.5;
  const strong = clusters.filter(k => k.pages.size >= 2);
  const seq = cand2.filter(sig);
  seq.forEach(c => {
    c.col = c.x < pages[c.page].w * 0.4 ? 0 : 1;
    c.aligned = strong.some(k => near(k, c)) || seq.some(o => o !== c && o.page === c.page && near(o, c));
  });

  // 3) Okuma sırası + numara sırası: en uzun tutarlı zincir (her adım n+1, ya da yeni test: 1)
  seq.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y);
  const N = seq.length, best = new Array(N).fill(1), prev = new Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const bi = seq[i], w = bi.aligned ? 1 : 0.25;
    for (let j = Math.max(0, i - 60); j < i; j++) {
      const a = seq[j];
      let g;
      if (bi.n === a.n + 1) g = w;
      else if (bi.n === 1 && a.n >= 2) g = w;
      else if (bi.n === a.n + 2 || bi.n === a.n + 3) g = 0.1;
      else continue;
      if (best[j] + g > best[i]) { best[i] = best[j] + g; prev[i] = j; }
    }
    if (!bi.aligned && prev[i] < 0) best[i] = 0.25;
  }
  let end = 0; for (let i = 1; i < N; i++) if (best[i] > best[end]) end = i;
  const chain = []; for (let i = end; i >= 0; i = prev[i]) { chain.unshift(seq[i]); if (prev[i] < 0) break; }

  // 4) Testlere böl
  const tests = [];
  let cur = null;
  chain.forEach((c, i) => {
    if (!cur || c.n <= chain[i - 1].n) { cur = { questions: [] }; tests.push(cur); }
    const p = chain[i - 1];
    if (p && c.n > p.n + 1) (cur.eksik = cur.eksik || []).push(`${p.n + 1}${c.n - 1 > p.n + 1 ? '–' + (c.n - 1) : ''}`);
    cur.questions.push(c);
  });

  // 5) Sayfa geometrisi. Sütunlar her sayfada ayrı hesaplanır: aynı kitapta sütun genişliği sayfadan sayfaya değişebilir,
  //    bir sayfada üstte sayfa genişliğinde bir soru, altında iki sütun olabilir.
  const repKey = it => it.str;
  const repCount = new Map();
  pages.forEach(p => { const seen = new Set(); p.items.forEach(it => { if (it.rot) { const k = repKey(it); if (!seen.has(k)) { seen.add(k); repCount.set(k, (repCount.get(k) || 0) + 1); } } }); });
  const repMin = Math.max(2, Math.ceil(textPages * 0.25));
  // Alt bilgi: sayfanın alt kısmında her sayfada tekrar eden yazılar (yayınevi adı, "Diğer sayfaya geçiniz") ve sayfa numarası.
  // Sorunun kendisi sayfanın en altına kadar inebilir; o yüzden yalnızca bunlar alt sınır sayılır.
  const footRep = new Map();
  pages.forEach((p, pi) => p.items.forEach(i => { if (!i.rot && i.y > p.h * 0.85 && i.str.length >= 3 && !/^[A-E]\s*[).]/.test(i.str)) { const k = i.str; if (!footRep.has(k)) footRep.set(k, []); footRep.get(k).push([pi, i.y, i.x]); } }));
  const aloneOnLine = (p, i) => !p.items.some(o => o !== i && !o.rot && Math.abs(o.base - i.base) < 2 && Math.abs((o.x + o.r) / 2 - (i.x + i.r) / 2) < p.w * 0.3);
  const isFooter = (p, i) => !i.rot && i.y > p.h * 0.85 && ((/^\d{1,4}$/.test(i.str) && aloneOnLine(p, i)) || /^Diğer sayfaya|^DİĞER SAYFAYA/i.test(i.str) || (new Set((footRep.get(i.str) || []).filter(([, y, x]) => Math.abs(y - i.y) < 8 && Math.abs(x - i.x) < 12).map(([pg]) => pg)).size >= 3));
  const footerOf = p => Math.min(p.h - 8, ...p.items.filter(i => isFooter(p, i)).map(i => i.y));
  const footYs = [];
  for (const pi of new Set(chain.map(c => c.page))) { const p = pages[pi]; const f = footerOf(p); if (f < p.h - 8) footYs.push(f / p.h); }
  // Alt dörttebirlik: tek/çift sayfalarda alt bilgi farklıysa ("Diğer sayfaya geçiniz" yalnız tek sayfalarda) yüksekte olanı esas al
  const globalFooter = footYs.length >= 3 ? [...footYs].sort((a, b) => a - b)[Math.floor(footYs.length * 0.25)] * pages[from - 1].h : Infinity;

  const pageInfo = new Map();
  const infoFor = pi => {
    if (pageInfo.has(pi)) return pageInfo.get(pi);
    const p = pages[pi];
    const anchors = chain.filter(c => c.page === pi);
    const leftA = anchors.filter(a => a.col === 0).sort((a, b) => a.y - b.y), rightA = anchors.filter(a => a.col === 1).sort((a, b) => a.y - b.y);
    const ownFoot = footerOf(p);
    // Ortak alt bilgi sınırı ancak o sayfada içerik daha aşağı inmiyorsa kullanılır
    const lowest = Math.max(0, ...p.items.filter(i => !i.rot && !isFooter(p, i) && i.y < ownFoot).map(i => i.b));
    const footerTop = Math.min(ownFoot, lowest < globalFooter ? globalFooter : ownFoot);
    const bandTop = (anchors.length ? Math.min(...anchors.map(a => a.y)) : 0) - 2;
    const L = leftA.length ? Math.min(...leftA.map(a => a.x)) : (rightA.length ? Math.min(...p.items.filter(i => !i.rot && i.y > bandTop && i.y < footerTop).map(i => i.x)) : 0);
    const R = rightA.length ? Math.min(...rightA.map(a => a.x)) : null;
    const imgs = (p.imgs || []).filter(im => im.b > bandTop && im.y < footerTop);
    const body = p.items.filter(it => !it.rot && it.y >= bandTop && it.y < footerTop && it.x >= L - 14).concat(imgs.map(im => ({ ...im, img: true, str: '' })));
    const pageRight = Math.max(L + 50, ...body.map(it => Math.min(it.r, p.w - 4)));
    // Sol sütundaki bir soru sayfa genişliğinde mi? Sağ sütunda o yükseklikte numara yoksa ve
    // satırlar sütun arasını geçiyorsa (ya da sağ sütun henüz başlamamışken sağ yarıda yazı varsa) evet.
    const fullAt = (y, endY) => {
      if (R === null) return true;
      if (rightA.some(r => r.y > y - 5 && r.y < endY - 2)) return false;
      const inR = body.filter(it => it.y >= y - 1 && it.b <= endY + 2);
      const crossing = inR.some(it => it.x < R - 8 && it.r > R + 2);
      const rightHalf = inR.some(it => it.x >= R - 3);
      return crossing || (rightHalf && !rightA.some(r => r.y < y));
    };
    leftA.forEach((a, k) => {
      const nx = leftA[k + 1];
      a.full = fullAt(a.y, nx ? nx.y : footerTop);
    });
    rightA.forEach(a => { a.full = false; });
    const fullRanges = leftA.filter(a => a.full).map((a, k, arr) => {
      const nxt = anchors.filter(o => o.y > a.y + 2).map(o => o.y);
      return [a.y - 3, Math.min(footerTop, ...nxt)];
    });
    const inFull = it => fullRanges.some(([y0, y1]) => it.y >= y0 && it.b <= y1 + 2);
    let lr = 0;
    if (R !== null) for (const it of body) if (it.r <= R - 4 && !inFull(it)) lr = Math.max(lr, it.r);
    const leftRight = R === null ? pageRight : (lr ? Math.min(lr + 2, R - 5) : R - 8);
    const stoppers = p.items.filter(i => !i.rot && (STOPPER_UP.test(i.str) || /^Diğer sayfaya/i.test(i.str)));
    const noise = p.items.filter(i => i.rot && (repCount.get(repKey(i)) || 0) >= repMin);
    // İki sütunlu bölgede sütun arasındaki kısa yazılar (kitapçık harfi, yayınevi kodu) gürültüdür
    if (R !== null) p.items.forEach(i => { const cx = (i.x + i.r) / 2; if (cx > leftRight - 2 && cx < R && (i.rot || i.str.length <= 10) && !inFull(i)) noise.push(i); });
    // Ortak kök girişleri ("6. ve 7. soruları … cevaplayınız.")
    const ci = x => (R !== null && x >= R - 6 ? 1 : 0);
    const lines = [];
    for (const it of p.items) { if (it.rot) continue; const c = ci(it.x); let Ln = lines.find(l => Math.abs(l.base - it.base) < 2 && l.col === c); if (!Ln) { Ln = { base: it.base, col: c, items: [] }; lines.push(Ln); } Ln.items.push(it); }
    lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.str).join(' '); l.x = l.items[0].x; l.y = Math.min(...l.items.map(i => i.y)); l.b = Math.max(...l.items.map(i => i.b)); });
    lines.sort((a, b) => a.col - b.col || a.y - b.y);
    const intros = [];
    lines.forEach((l, li) => {
      if (!(INTRO_ANY.test(l.text) || INTRO_EN.test(l.text)) || anchors.some(a => Math.abs(a.it.base - l.base) < 2 && a.x <= l.x + 1)) return;
      const parts = [l];
      for (let k = li + 1; k < lines.length && parts.length < 4 && !INTRO_END.test(parts[parts.length - 1].text); k++) {
        if (lines[k].col !== l.col || lines[k].y - parts[parts.length - 1].b > 8) break;
        parts.push(lines[k]);
      }
      if (!INTRO_END.test(parts[parts.length - 1].text) && !INTRO_LEAD.test(l.text.replace(/^[^\d]*/, ''))) return;
      const m = l.text.match(/(\d{1,3})\s*\.?\s*(?:ve|ile|,|-|–|—|and|&)\s*(\d{1,3})/);
      const nextL = leftA.find(a => a.y > l.y + 2);
      const full = l.col === 0 && fullAt(l.y, nextL ? nextL.y : footerTop);
      intros.push({ y: l.y, x: l.x, col: l.col, full, from: m ? +m[1] : 0, to: m ? +m[2] : 0, erase: parts.flatMap(pp => pp.items) });
    });
    const inf = { anchors, footerTop, stoppers, noise, twoCol: R !== null, L, R, leftRight, pageRight, intros };
    pageInfo.set(pi, inf);
    return inf;
  };

  // Bir dikdörtgenin içinde başlayan yazılar kesilmesin: sağ sınırı yazının bittiği yere kadar aç
  const regionText = (p, x0, x1, y0, y1, skip) => p.items.filter(it => !it.rot && it !== skip && it.x >= x0 - 1 && it.x < x1 && it.y >= y0 - 1 && it.b <= y1 + 2);
  const growRight = (p, inf, col, full, x0, x1, y0, y1) => {
    const cap = (!full && col === 0 && inf.R !== null) ? inf.R - 6 : p.w - 2;
    let r = Math.min(x1, cap);
    for (const it of regionText(p, x0, r, y0, y1)) if (!inf.noise.includes(it)) r = Math.max(r, Math.min(it.r + 1.5, cap));
    // Bölgede başlayan resimler de kesilmesin (ör. sağdaki son şıkkın resmi)
    for (const im of regionImgs(p, x0, r, y0, y1)) r = Math.max(r, Math.min(im.r + 1.5, cap));
    return r;
  };
  // Resim bölgeye ait sayılır: bölgede başlıyor ve yüksekliğinin çoğu bölgenin içinde (alt bilgi süsü gibi sınırdan sarkanlar sayılmaz)
  const vIn = (im, y0, y1) => (Math.min(im.b, y1) - Math.max(im.y, y0)) / Math.max(1, im.b - im.y);
  const regionImgs = (p, x0, x1, y0, y1) => (p.imgs || []).filter(im => im.x >= x0 - 2 && im.x < x1 && im.y >= y0 - 2 && im.y < y1 && vIn(im, y0, y1) >= 0.6);
  const overlapImgs = (p, x0, x1, y0, y1) => (p.imgs || []).filter(im => im.r > x0 && im.x < x1 && im.b > y0 && im.y < y1 && vIn(im, y0, y1) >= 0.5);
  const textBox = (p, inf, x0, x1, y0, y1, skip, erase = []) => {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const im of regionImgs(p, x0, x1, y0, y1)) { bx0 = Math.min(bx0, im.x); by0 = Math.min(by0, im.y); bx1 = Math.max(bx1, Math.min(im.r, x1)); by1 = Math.max(by1, Math.min(im.b, y1)); }
    for (const it of regionText(p, x0, x1, y0, y1, skip)) {
      if (inf.noise.includes(it) || erase.includes(it)) continue;
      bx0 = Math.min(bx0, it.x); by0 = Math.min(by0, it.y); bx1 = Math.max(bx1, it.r); by1 = Math.max(by1, it.b);
    }
    return bx0 < Infinity ? { x: bx0, y: by0, r: bx1, b: by1 } : null;
  };
  // Bir bölgenin alt sınırı: aynı sütundaki sonraki numara/giriş; sayfa genişliğindeki numaralar her sütunu keser
  const bottomOf = (inf, y, col, full, self) => {
    const below = inf.anchors.filter(a => a !== self && a.y > y + 2 && (full || a.full || a.col === col)).map(a => a.y);
    const intro = inf.intros.filter(o => o.y > y + 2 && (full || o.full || o.col === col)).map(o => o.y);
    return Math.min(inf.footerTop, ...below, ...intro);
  };

  const questions = [], stems = [];
  tests.forEach((t, ti) => {
    t.index = ti;
    t.questions = t.questions.map(c => {
      const p = pages[c.page], inf = infoFor(c.page);
      const full = !!c.full || !inf.twoCol;
      let x0 = c.numR + 1.5;
      let x1 = (full || c.col === 1 ? inf.pageRight + 2 : inf.leftRight);
      const y0 = c.y - 3;
      const stop = inf.stoppers.filter(s => s.y > c.b && s.r > x0 && s.x < x1).map(s => s.y);
      const y1 = Math.min(bottomOf(inf, c.y, c.col, full, c), ...stop) - 3;
      // Soru metni numaranın bittiği yerden önce başlıyorsa (asılı girinti yoksa) sol sınırı metne göre al
      let minX = Infinity;
      for (const it of p.items) {
        if (it.rot || it === c.it || it.x <= c.x + 1 || it.x >= x1 || it.y < y0 || it.b > y1 + 2) continue;
        if (it.x < minX) minX = it.x;
      }
      if (minX < x0) x0 = Math.max(c.x + 2, minX - 1);
      x1 = growRight(p, inf, c.col, full, x0, x1, y0, y1);
      const q = { test: ti, n: c.n, page: c.page, col: full ? 0 : c.col, rect: { x: x0, y: y0, w: Math.max(10, x1 - x0), h: Math.max(10, y1 - y0) }, full, contentW: inf.pageRight - inf.L, noise: inf.noise, text: (tb => tb && { ...tb, y: Math.min(tb.y, c.y) })(textBox(p, inf, x0, x1, y0, y1, c.it)), stem: -1, imgs: overlapImgs(p, x0, x1, y0, y1) };
      questions.push(q);
      return q;
    });
  });

  // Ortak kökler: giriş cümlesinden ilgili ilk sorunun numarasına kadar olan bölüm, gruptaki her soruya eklenir
  for (const pi of new Set(chain.map(c => c.page))) {
    const p = pages[pi], inf = infoFor(pi);
    for (const o of inf.intros) {
      const full = o.full || !inf.twoCol;
      const colX = o.col === 1 ? inf.R : inf.L;
      const prevR = (!full && o.col === 1) ? inf.leftRight + 1 : 0;
      let x0 = Math.max(Math.min(colX, o.x) - 1.5, prevR);
      let x1 = (full || o.col === 1) ? inf.pageRight + 2 : inf.leftRight;
      const y0 = o.y - 3;
      const y1 = bottomOf(inf, o.y, o.col, full, null) - 3;
      if (y1 - y0 < 6) continue;
      for (const it of regionText(p, x0 - 12, x1, y0, y1)) if (!inf.noise.includes(it) && it.x < x0 + 1 && it.x > prevR) x0 = it.x - 1.5;
      x1 = growRight(p, inf, o.col, full, x0, x1, y0, y1);
      const si = stems.length;
      stems.push({ page: pi, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, erase: o.erase, noise: inf.noise, text: textBox(p, inf, x0, x1, y0, y1, null, o.erase), imgs: overlapImgs(p, x0, x1, y0, y1) });
      // Hangi sorular? Numaralar verildiyse onlar; verilmediyse girişten sonraki ilk iki soru
      const after = questions.filter(q => q.page > pi || (q.page === pi && (q.col > o.col || (q.col === o.col && q.rect.y > o.y) || (o.full && q.rect.y > o.y))));
      let grp = [];
      if (o.from && o.to >= o.from && o.to - o.from < 12) {
        const firstAfter = after[0];
        grp = firstAfter ? after.filter(q => q.test === firstAfter.test && q.n >= o.from && q.n <= o.to) : [];
      }
      if (!grp.length) grp = after.slice(0, 2);
      grp.forEach(q => { if (q.stem < 0) q.stem = si; });
    }
  }

  // 6) Test adları (sayfa üstü başlıklar)
  tests.forEach(t => {
    const pgs = [...new Set(t.questions.map(q => q.page))];
    const heads = new Map();
    for (const pi of pgs) {
      const p = pages[pi], inf = infoFor(pi);
      const top = Math.min(...inf.anchors.map(a => a.y));
      const its = p.items.filter(i => !i.rot && i.b < top - 1 && !/^[A-E]$/.test(i.str) && !/^\d+$/.test(i.str) && !/^\d+\.\s/.test(i.str) && !/(EĞİTİM|ÖĞRETİM|YILI|SINAVLA|SINAVI|MERKEZ)/i.test(i.str) && i.size >= body * 0.95);
      its.sort((a, b) => a.y - b.y || a.x - b.x);
      const s = its.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (s && s.length < 80) heads.set(s, (heads.get(s) || 0) + 1);
    }
    let name = '', bc = 0;
    heads.forEach((v, k) => { if (v > bc || (v === bc && k.length < name.length)) { bc = v; name = k; } });
    t.baslik = name;
    // ÖSYM/MEB düzeni: ilk sayfada "… TESTİ" adı, "1. DENEME" ve "Bu testte sırasıyla, Tarih-1 (25-34), …" yönergesi
    const q0 = t.questions[0];
    if (!q0) return;
    const firstTxt = [q0.page - 1, q0.page].filter(pi => pi >= 0).map(pi => pages[pi].items.filter(i => !i.rot).map(i => i.str).join(' ')).join(' ').replace(/\s+/g, ' ');
    const pageTxt = pages[q0.page].items.filter(i => !i.rot).map(i => i.str).join(' ').replace(/\s+/g, ' ');
    const tm = [...pageTxt.matchAll(/([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9\- ]{3,80}?TEST[İI])(?![A-ZÇĞİÖŞÜa-zçğıöşü])/g)].map(m => m[1].trim()).filter(x => !/^BU TEST/.test(x));
    const dm = pageTxt.match(/(?:^|\s)(\d{1,2})\.\s*DENEME\b/);
    if (tm.length) {
      const nice = tm[0].toLocaleLowerCase('tr-TR').replace(/(^|[\s\-])(\S)/g, (m, a, b) => a + b.toLocaleUpperCase('tr-TR')).replace(/ Ve /g, ' ve ');
      t.baslik = (dm ? `${dm[1]}. Deneme · ` : '') + nice;
    } else if (dm && t.baslik && !/DENEME/i.test(t.baslik)) t.baslik = `${dm[1]}. Deneme · ${t.baslik}`;
    const im = firstTxt.match(/Bu testte(?: sırasıyla)?,?\s*(.{5,600}?)\s*(?:alanlarına|derslerine|alanına)?\s*ait/i);
    if (im) {
      const bol = [];
      for (const m of im[1].matchAll(/([^()]{2,160}?)\s*\(\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*\)/g)) {
        let ad = m[1].split(',').pop().trim();
        if (/ için /.test(ad)) ad = ad.split(/ için /).pop().trim();
        ad = ad.replace(/^(ve|ile)\s+/i, '').trim();
        if (ad && ad.length <= 60) bol.push({ ad, from: +m[2], to: +m[3] });
      }
      const lastN = t.questions[t.questions.length - 1].n;
      const ok = bol.length >= 2 && bol[0].from === 1 && bol.every((b, k) => b.to >= b.from && (k === 0 || b.from === bol[k - 1].to + 1)) && bol[bol.length - 1].to >= lastN;
      if (ok) t.bolumler = bol;
    }
  });

  // 7) Soru testi mi, çözüm bölümü mü?
  //    Soru: şıkları (A) B) C) …) vardır. Çözüm: şık yoktur ya da "Cevap: B" gibi bir satır vardır;
  //    çoğu zaman ilk sayfasında "ÇÖZÜMLER" benzeri bir başlık bulunur.
  const OPT = /^([A-E])\s*[).]/;
  const ANS = /(?:do[ğg]ru\s+)?(?:cevap|yan[ıi]t)(?:\s+anahtar[ıi])?\s*[:：\-–=]?\s*\(?\s*([A-E])\s*\)?(?![A-Za-zÇĞİÖŞÜçğıöşü])/i;
  const SOL_HEAD = /(Ç[ÖO]Z[ÜU]M|AÇIKLAMALI|CEVAPLARI\s+VE|ÇÖZÜMLER)/i;
  const regionItems = q => {
    const p = pages[q.page], r = q.rect;
    return p.items.filter(i => !i.rot && i.x >= r.x - 30 && i.x < r.x + r.w && i.y >= r.y - 1 && i.b <= r.y + r.h + 2).sort((a, b) => a.y - b.y || a.x - b.x);
  };
  const firstTop = t => {
    const q0 = t.questions[0]; if (!q0) return '';
    return pages[q0.page].items.filter(i => !i.rot && i.b < q0.rect.y + 2).map(i => i.str).join(' ');
  };
  tests.forEach(t => {
    let withOpt = 0, withAns = 0, withE = 0;
    t.cozumCevap = t.questions.map(q => {
      const its = regionItems(q);
      const letters = new Set();
      its.forEach(i => { const m = i.str.match(OPT); if (m) letters.add(m[1].toUpperCase()); });
      if (letters.size >= 3) { withOpt++; if (letters.has('E')) withE++; }
      const m = its.map(i => i.str).join(' ').match(ANS);
      if (m) withAns++;
      return m ? m[1].toUpperCase() : '';
    });
    const n = t.questions.length || 1;
    t.secenekOrani = withOpt / n; t.cevapOrani = withAns / n;
    // Şık sayısı: soruların en az %30'unda "E)" görülüyorsa 5, şıklar var ama E yoksa 4
    t.secenek = withOpt ? (withE >= Math.max(1, 0.3 * withOpt) ? 5 : 4) : 0;
    t.ustYazi = firstTop(t);
  });
  tests.forEach((t, i) => {
    // Sayfa başlığı tüm kitapçıkta aynıysa (ör. "Cevaplı ve Çözümlü Deneme") ipucu sayılmaz
    const headHere = SOL_HEAD.test(t.ustYazi) && !tests.some((o, k) => k !== i && o.secenekOrani >= 0.7 && SOL_HEAD.test(o.ustYazi));
    t.tur = (t.secenekOrani < 0.4 || t.cevapOrani >= 0.5 || (headHere && t.secenekOrani < 0.7)) ? 'cozum' : 'soru';
  });
  // Hepsi "çözüm" göründüyse (ör. şıksız/klasik sorular) hiçbirini çözüm sayma
  if (tests.length && tests.every(t => t.tur === 'cozum') && tests.every(t => t.cevapOrani < 0.5)) tests.forEach(t => { t.tur = 'soru'; });
  linkSolutions(tests);

  // 8) Cevap anahtarı (soru bulunmayan sayfalarda "1. A" çiftleri) — yalnızca soru testleri için
  const qTests = tests.filter(t => t.tur === 'soru');
  const qPages = new Set(qTests.flatMap(t => t.questions.map(q => q.page)));
  const key = findAnswerKey(pages, qPages, qTests.map(t => t.questions.length ? t.questions[t.questions.length - 1].n : 0));
  if (key) qTests.forEach((t, i) => {
    const col = key.cols[i] || '';
    // Harfleri soru numarasına göre yerleştir (arada bulunamayan soru varsa kayma olmasın)
    t.anahtar = col.length >= t.questions[t.questions.length - 1].n ? t.questions.map(q => col[q.n - 1] || '-').join('') : col;
    t.anahtarKaynak = 'anahtar';
  });
  fillFromSolutions(tests);

  // Soru testi olmayan bölümleri (içindekiler, açıklama sayfası, cevap anahtarı) listeden çıkar
  const keyPages = new Set(key ? key.pages : []);
  const isJunk = t => t.tur === 'cozum' && t.cozumOf < 0 && !tests.some(o => o.cozumOf === tests.indexOf(t)) && t.cevapOrani < 0.5 && t.secenekOrani < 0.2
    && (qTests.length > 0) && (t.questions.length < 3 || t.questions.every(q => keyPages.has(q.page)) || /İÇİNDEK|AÇIKLAMA|CEVAP ANAHTAR/i.test((t.baslik || '') + ' ' + (t.ustYazi || '')));
  const keep = tests.filter(t => !isJunk(t));
  let outTests = tests, outQ = questions;
  if (keep.length !== tests.length && keep.length) {
    const map = new Map(tests.map((t, i) => [i, keep.indexOf(t)]));
    keep.forEach(t => { if (t.cozumOf >= 0) t.cozumOf = map.get(t.cozumOf); });
    outQ = questions.filter(q => map.get(q.test) >= 0);
    outQ.forEach(q => { q.test = map.get(q.test); });
    outTests = keep;
  }
  outTests.forEach((t, i) => { if (t.tur === 'soru' && t.eksik) warnings.push(`${t.baslik ? t.baslik : (i + 1) + '. test'}: ${t.eksik.join(', ')}. soru bulunamadı.`); });

  return { tests: outTests, questions: outQ, stems, warnings, anahtarSayfa: key ? key.page + 1 : 0, anahtarSayfalar: key ? key.pages.map(p => p + 1) : [], body };
}

/** Her çözüm bölümünü, aynı sayıda sorusu olan (tercihen önceki) soru testine bağla */
export function linkSolutions(tests) {
  const used = new Set();
  tests.forEach((t, i) => {
    t.cozumOf = -1;
    if (t.tur !== 'cozum') return;
    const n = t.questions.length;
    const fits = k => tests[k].tur === 'soru' && !used.has(k) && tests[k].questions.length === n;
    let k = -1;
    for (let j = 0; j < i; j++) if (fits(j)) { k = j; break; }          // önceki testlerden ilk eşleşmeyen
    if (k < 0) for (let j = i + 1; j < tests.length; j++) if (fits(j)) { k = j; break; }
    if (k >= 0) { used.add(k); t.cozumOf = k; }
  });
}

/** Anahtarı olmayan soru testine, bağlı çözüm bölümündeki "Cevap: X" harflerini aktar */
export function fillFromSolutions(tests) {
  tests.forEach(t => {
    if (t.tur !== 'cozum' || t.cozumOf < 0) return;
    const hedef = tests[t.cozumOf];
    const harf = t.cozumCevap || [];
    if (hedef.anahtar || !harf.some(Boolean)) return;
    hedef.anahtar = hedef.questions.map((_, k) => harf[k] || '-').join('');
    hedef.anahtarKaynak = 'cozum';
  });
}

function findAnswerKey(pages, qPages, counts) {
  const want = counts.filter(Boolean);
  const perPage = [];
  for (let pi = 0; pi < pages.length; pi++) {
    if (qPages.has(pi)) continue;
    const cols = keyColsOf(pages[pi]);
    if (cols && cols.length) perPage.push({ pi, cols });
  }
  // Tek sayfada bütün testlerin anahtarı
  for (let k = perPage.length - 1; k >= 0; k--) {
    const { pi, cols } = perPage[k];
    const lens = cols.map(c => c.length);
    if (want.length && lens.length === want.length && lens.every((l, i) => l === want[i])) return { page: pi, pages: [pi], cols };
    if (want.length === 1 && lens.reduce((s, l) => s + l, 0) === want[0]) return { page: pi, pages: [pi], cols: [cols.join('')] };
  }
  // Birden çok sayfaya dağılmış anahtar (ör. her deneme için ayrı anahtar sayfası): sırayla birleştir
  if (want.length > 1 && perPage.length > 1) {
    const all = perPage.flatMap(p => p.cols.map(c => ({ c, pi: p.pi })));
    if (all.length === want.length) {
      const hit = all.filter((x, i) => x.c.length === want[i] || x.c.length === counts[i]).length;
      if (hit >= Math.ceil(want.length * 0.7)) return { page: all[0].pi, pages: [...new Set(all.map(x => x.pi))], cols: all.map(x => x.c) };
    }
  }
  return null;
}

function keyColsOf(page) {
  {
    const its = page.items.filter(i => !i.rot);
    const pairs = [];
    for (const it of its) {
      let m = it.str.match(/^(\d{1,3})[.)\-]?\s*([A-E])$/);
      if (m) { pairs.push({ n: +m[1], L: m[2], x: it.r, y: it.base }); continue; }
      m = it.str.match(/^(\d{1,3})[.)\-]?$/);
      if (!m) continue;
      const L = its.filter(o => o !== it && Math.abs(o.base - it.base) < 2.5 && o.x >= it.r - 1 && o.x - it.r < 45 && /^[A-E]$/.test(o.str)).sort((a, b) => a.x - b.x)[0];
      if (L) pairs.push({ n: +m[1], L: L.str, x: L.x, y: it.base });
    }
    if (pairs.length < 5) return null;
    const kc = [];
    for (const p of pairs) { let k = kc.find(c => Math.abs(c.x - p.x) < 8); if (!k) { k = { x: p.x, ps: [] }; kc.push(k); } k.ps.push(p); }
    kc.sort((a, b) => a.x - b.x);
    const cols = [];
    for (const k of kc) {
      k.ps.sort((a, b) => a.y - b.y);
      // Sütun içinde 1'den başlayan ardışık diziler (aynı sütunda birden çok test olabilir)
      let curS = '', last = 0;
      for (const p of k.ps) {
        if (p.n === 1 && curS) { cols.push(curS); curS = ''; last = 0; }
        if (p.n !== last + 1) { curS = null; break; }
        curS += p.L; last = p.n;
      }
      if (curS) cols.push(curS);
    }
    return cols;
  }
}

/** Metindeki ders adını programın ders listesindeki ada eşle */
export function matchDers(baslik, dersler) {
  const norm = s => (s || '').toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşüâîû0-9 ]+/g, ' ').split(/\s+/).filter(w => w && w !== 've' && w.length > 1);
  const h = new Set(norm(baslik));
  if (!h.size) return '';
  let best = '', bs = 0;
  for (const d of dersler) {
    const t = norm(d);
    if (!t.length) continue;
    const hit = t.filter(w => h.has(w) || [...h].some(x => x.length > 4 && (x.startsWith(w) || w.startsWith(x)))).length;
    const s = hit / t.length + hit * 0.01;
    if (hit && s > bs) { bs = s; best = d; }
  }
  return bs >= 0.5 ? best : '';
}

/** "ABDA…", "1-A 2-B", "1.A,2.B" gibi yazımlardan harf dizisi */
export function parseKeyText(s) {
  return (s || '').toUpperCase().replace(/\d+\s*[.)\-:]?/g, ' ').replace(/[^A-E]/g, '');
}

// ---------------- Tarayıcı tarafı ----------------

/** Sayfayı sabit ölçekte çiz (canvas) */
export async function renderPage(page, scale) {
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

/**
 * Filigran rengini bul: sayfalarda geniş alan kaplayan açık, tek renkli ton
 * (ör. pembe MEB logosu). Bulunamazsa null.
 */
export function detectWatermark(canvases) {
  // Filigran: açık renkli tonlar (pembe amblem, açık gri yazı, açık yeşil yaprak…); soruların çoğunda geniş alan kaplar.
  // En çok üç ton döner. Gri tonlar için daha yüksek kapsama aranır (yazı kenarlarındaki gri pikseller filigran sanılmasın).
  // 16'lık kutular: filigranın yumuşak geçişli kenarları tek kutuda toplansın; kutunun rengi = içindeki piksellerin ortalaması
  const pagesHas = new Map(), totals = new Map(), sums = new Map();
  for (const c of canvases) {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    const hist = new Map(); let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      n++;
      const mn = Math.min(r, g, b);
      if (mn < 190 || mn > 246) continue;
      const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
      hist.set(k, (hist.get(k) || 0) + 1);
      let sm = sums.get(k); if (!sm) { sm = [0, 0, 0, 0]; sums.set(k, sm); } sm[0] += r; sm[1] += g; sm[2] += b; sm[3]++;
    }
    hist.forEach((v, k) => {
      const sm = sums.get(k), r = sm[0] / sm[3], g = sm[1] / sm[3], b = sm[2] / sm[3];
      const gray = Math.max(r, g, b) - Math.min(r, g, b) < 14;
      totals.set(k, (totals.get(k) || 0) + v / n);
      if (v / n >= (gray ? 0.012 : 0.003)) pagesHas.set(k, (pagesHas.get(k) || 0) + (gray ? 1 : 1.6));
    });
  }
  const need = Math.max(1, Math.ceil(canvases.length * 0.4));
  const cand = [...pagesHas].filter(([, pc]) => pc >= need).map(([k, pc]) => ({ k, s: pc + totals.get(k) })).sort((a, b) => b.s - a.s);
  const out = [];
  for (const { k } of cand) {
    const sm = sums.get(k), col = [Math.round(sm[0] / sm[3]), Math.round(sm[1] / sm[3]), Math.round(sm[2] / sm[3])];
    // Aynı tonun komşu kutuları tek renk sayılır
    if (out.some(o => Math.abs(o[0] - col[0]) + Math.abs(o[1] - col[1]) + Math.abs(o[2] - col[2]) < 24)) continue;
    out.push(col);
    if (out.length >= 3) break;
  }
  return out.length ? out : null;
}

/** Beyaz ile filigran rengi arasındaki tonları beyaza çevir */
export function removeWatermark(canvas, wm) {
  if (!wm) return canvas;
  const cols = Array.isArray(wm[0]) ? wm : [wm];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = im.data;
  // Filigranın koyu yerleri (harf ortaları) bulunan ortalama tondan biraz daha koyu olabilir: gri tonda %50, renklide %30 pay
  const vs = cols.map(c => { const dv = [255 - c[0], 255 - c[1], 255 - c[2]]; const gray = Math.max(...c) - Math.min(...c) < 14; return { dv, tmax: gray ? 1.5 : 1.3, len2: dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2] || 1 }; });
  for (let i = 0; i < d.length; i += 4) {
    const p0 = 255 - d[i], p1 = 255 - d[i + 1], p2 = 255 - d[i + 2];
    if (p0 + p1 + p2 < 6) continue;
    for (const { dv, len2, tmax } of vs) {
      const t = (p0 * dv[0] + p1 * dv[1] + p2 * dv[2]) / len2;          // beyazdan filigrana doğru izdüşüm
      if (t < 0 || t > tmax) continue;
      const e0 = p0 - t * dv[0], e1 = p1 - t * dv[1], e2 = p2 - t * dv[2];
      if (e0 * e0 + e1 * e1 + e2 * e2 < 22 * 22) { d[i] = d[i + 1] = d[i + 2] = 255; break; }
    }
  }
  ctx.putImageData(im, 0, 0);
  return canvas;
}

/** Kenara yapışık ince süs/çizgi bloklarını at (sütun çizgisi, alt bilgi süsü) */
function sweepEdges(c, scale) {
  const w = c.width, h = c.height;
  if (w < 4 || h < 4) return c;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const ink = (x, y) => { const i = (y * w + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 235; };
  const rowInk = y => { for (let x = 0; x < w; x++) if (ink(x, y)) return true; return false; };
  const colInk = x => { for (let y = 0; y < h; y++) if (ink(x, y)) return true; return false; };
  const maxBlock = Math.round(4.5 * scale), gap = Math.max(2, Math.round(2.5 * scale));
  const cut = (n, has) => {
    // Kenardan başlayan mürekkep bloğu (≤maxBlock) + ardından beyaz boşluk (≥gap) varsa kes
    let i = n - 1;
    while (i >= 0 && !has(i)) i--;
    const blockEnd = i;
    if (blockEnd < n - 1 - gap) return n;           // kenara dokunmuyor
    while (i >= 0 && has(i)) i--;
    if (blockEnd - i > maxBlock) return n;
    let g = 0; const blockStart = i;
    while (i >= 0 && !has(i)) { i--; g++; }
    if (g < gap || i < 0) return n;
    return blockStart + 1;
  };
  let nh = h, nw = w;
  for (let k = 0; k < 2; k++) { const r = cut(nh, rowInk); if (r === nh) break; nh = r; }
  // Dikey çizgi: sütunun en az %40'ı boyunca uzanmalı (tek bir harf değil)
  const colLine = x => { let n = 0; for (let y = 0; y < nh; y++) if (ink(x, y)) n++; return n > nh * 0.4; };
  const colAny = x => { for (let y = 0; y < nh; y++) if (ink(x, y)) return true; return false; };
  {
    let i = nw - 1;
    while (i >= 0 && !colAny(i)) i--;
    const e = i;
    if (e >= nw - 1 - gap) {
      while (i >= 0 && colLine(i)) i--;
      if (e - i >= 1 && e - i <= maxBlock) {
        let g = 0;
        while (i >= 0 && !colAny(i)) { i--; g++; }
        if (g >= gap && i >= 0) nw = i + 2;
      }
    }
  }
  if (nh === h && nw === w) return c;
  const o = document.createElement('canvas'); o.width = nw; o.height = nh;
  o.getContext('2d').drawImage(c, 0, 0);
  return o;
}

/**
 * Bir soruyu sayfa görüntüsünden kes.
 * pageCanvas: renderPage(page, scale) çıktısı; q: detectQuestions sorusu
 * opts: { watermark: [r,g,b]|null, trim: fn(canvas,pad) }
 */
export function cropQuestion(pageCanvas, q, scale, opts = {}) {
  const r = q.rect;
  const x = Math.max(0, Math.floor(r.x * scale)), y = Math.max(0, Math.floor(r.y * scale));
  const w = Math.min(pageCanvas.width - x, Math.ceil(r.w * scale)), h = Math.min(pageCanvas.height - y, Math.ceil(r.h * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(pageCanvas, x, y, w, h, 0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (const n of q.noise || []) ctx.fillRect(n.x * scale - x - 2, n.y * scale - y - 2, (n.r - n.x) * scale + 4, (n.b - n.y) * scale + 4);
  for (const n of q.erase || []) ctx.fillRect(n.x * scale - x - 2, n.y * scale - y - 2, (n.r - n.x) * scale + 4, (n.b - n.y) * scale + 4);
  if (opts.watermark) {
    // Fotoğrafların açık renkli yerleri filigran sanılıp silinmesin: resim alanları korunur
    // (Yalnızca kesimin tamamen içinde kalan resimler: kırpma yoluyla gösterilen büyük resimlerin gerçek sınırı bilinemez)
    const inside = im => im.x >= r.x - 2 && im.r <= r.x + r.w + 2 && im.y >= r.y - 2 && im.b <= r.y + r.h + 2;
    const keep = (q.imgs || []).filter(inside).map(im => {
      const ix = Math.max(0, Math.floor(im.x * scale - x)), iy = Math.max(0, Math.floor(im.y * scale - y));
      const iw = Math.min(w, Math.ceil(im.r * scale - x)) - ix, ih = Math.min(h, Math.ceil(im.b * scale - y)) - iy;
      return iw > 2 && ih > 2 ? { ix, iy, data: ctx.getImageData(ix, iy, iw, ih) } : null;
    }).filter(Boolean);
    removeWatermark(c, opts.watermark);
    keep.forEach(k => ctx.putImageData(k.data, k.ix, k.iy));
  }
  if (q.text && !opts.raw) dropStrays(c, { x: q.text.x * scale - x, y: q.text.y * scale - y, r: q.text.r * scale - x, b: q.text.b * scale - y }, scale);
  let out = opts.trim ? opts.trim(c, 2) : c;
  if (!opts.raw) out = sweepEdges(out, scale);
  return opts.trim ? opts.trim(out, Math.round(3 * scale)) : out;
}

/**
 * Kesim kenarına değen ve sorunun yazı alanının (numaradan son şıkka kadar) neredeyse tamamen dışında kalan
 * mürekkep parçalarını sil:
 * sayfa süsleri, yan sekmeler, numara kutusunun kalan parçası, komşu sorudan taşan çizgiler.
 * Yazı alanının içinde ya da ona değen şekiller (grafik, tablo, resim) korunur.
 */
export function dropStrays(c, box, scale) {
  const w = c.width, h = c.height;
  if (w < 8 || h < 8) return c;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const f = 2, W2 = Math.ceil(w / f), H2 = Math.ceil(h / f);
  const mask = new Uint8Array(W2 * H2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 242) mask[(y / f | 0) * W2 + (x / f | 0)] = 1;
  }
  const lab = new Int32Array(W2 * H2), stack = new Int32Array(W2 * H2);
  const mg = 3 * scale;
  const bx0 = box.x - mg, by0 = box.y - mg, bx1 = box.r + mg, by1 = box.b + mg;
  let id = 0, changed = false;
  for (let s0 = 0; s0 < mask.length; s0++) {
    if (!mask[s0] || lab[s0]) continue;
    id++;
    let sp = 0, n = 0; stack[sp++] = s0; lab[s0] = id;
    let x0 = W2, y0 = H2, x1 = -1, y1 = -1;
    const cells = [];
    while (sp) {
      const k = stack[--sp]; cells.push(k); n++;
      const cx = k % W2, cy = (k / W2) | 0;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2) continue;
        const nk = ny * W2 + nx;
        if (mask[nk] && !lab[nk]) { lab[nk] = id; stack[sp++] = nk; }
      }
    }
    // Yalnızca kesim kenarına değen parçalar aday: kenara değmeyen şekiller (şık resimleri, grafikler) her zaman korunur
    const touches = x0 === 0 || y0 === 0 || x1 === W2 - 1 || y1 === H2 - 1;
    const px0 = x0 * f, py0 = y0 * f, px1 = (x1 + 1) * f, py1 = (y1 + 1) * f;
    if (!touches) {
      // Kenara değmeyen ince süs (kıvrık çizgi, dikey ayraç): yazı alanının tamamen yanındaysa sil
      const thin = Math.min(px1 - px0, py1 - py0) <= 10 * scale && Math.max(px1 - px0, py1 - py0) <= 120 * scale;
      const beside = px0 >= box.r - 2 * scale || px1 <= box.x + 2 * scale;
      if (!(thin && beside)) continue;
      changed = true;
      for (const k of cells) { const cx = (k % W2) * f, cy = ((k / W2) | 0) * f; for (let yy = cy; yy < Math.min(h, cy + f); yy++) for (let xx = cx; xx < Math.min(w, cx + f); xx++) { const i = (yy * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 255; } }
      continue;
    }
    const meets = px1 >= bx0 && px0 <= bx1 && py1 >= by0 && py0 <= by1;
    if (meets) {
      // Çoğu yazı alanının dışında kalan parçalar (ör. sütun çizgisine yapışık süs) de silinir
      let inside = 0;
      for (const k of cells) { const cx = (k % W2) * f, cy = ((k / W2) | 0) * f; if (cx >= bx0 && cx <= bx1 && cy >= by0 && cy <= by1) inside++; }
      if (inside > cells.length * 0.1) continue;
    }
    changed = true;
    for (const k of cells) {
      const cx = (k % W2) * f, cy = ((k / W2) | 0) * f;
      for (let yy = cy; yy < Math.min(h, cy + f); yy++) for (let xx = cx; xx < Math.min(w, cx + f); xx++) {
        const i = (yy * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 255;
      }
    }
  }
  if (changed) ctx.putImageData(im, 0, 0);
  return c;
}

/** Ortak kök görüntüsünü sorunun üstüne ekle (sola hizalı, arada boşluk) */
export function stackStem(stem, qc, gap) {
  const o = document.createElement('canvas');
  o.width = Math.max(stem.width, qc.width); o.height = stem.height + gap + qc.height;
  const ctx = o.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, o.width, o.height);
  ctx.drawImage(stem, 0, 0); ctx.drawImage(qc, 0, stem.height + gap);
  return o;
}
