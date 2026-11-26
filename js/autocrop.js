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
      // Ardından metin ya da şekil gelmeli; tek başına "1." satırı (liste/tablo) da olabilir — sırayla elenir.
      cands.push({ page: pi, n, x: it.x, y: it.y, b: it.b, numR: it.x + numW, size: it.size, it });
    }
  }
  if (!cands.length) return { tests: [], questions: [], warnings: ['Soru numarası bulunamadı.'], noText: false };

  // 2) Sütun başı hizaları: aynı x'te en çok sayfada görülen numaralar
  const clusters = [];
  for (const c of cands) {
    let cl = clusters.find(k => Math.abs(k.x - c.x) <= 3);
    if (!cl) { cl = { x: c.x, pages: new Set(), items: [] }; clusters.push(cl); }
    cl.items.push(c); cl.pages.add(c.page);
  }
  clusters.forEach(k => { k.x = median(k.items.map(i => i.x)); k.score = k.pages.size + k.items.length * 0.01; });
  clusters.sort((a, b) => b.score - a.score);
  const W = pages[from - 1].w;
  const minPages = Math.max(1, Math.min(3, Math.ceil((to - from + 1) * 0.15)));
  const cols = [];
  for (const k of clusters) {
    if (k.pages.size < minPages && cols.length) continue;
    if (cols.some(c => Math.abs(c.x - k.x) < W * 0.25)) continue;
    // Aynı hizadaki numaraların yazı boyutu tutarlı olmalı
    cols.push(k);
    if (cols.length >= 3) break;
  }
  cols.sort((a, b) => a.x - b.x);
  const anchorSize = median(cols.flatMap(c => c.items.map(i => i.size)));
  const colOf = c => cols.findIndex(k => Math.abs(k.x - c.x) <= 3);

  // 3) Okuma sırası + numara sırası kontrolü
  let seq = cands.filter(c => colOf(c) >= 0 && Math.abs(c.size - anchorSize) <= Math.max(1, anchorSize * 0.15));
  seq.forEach(c => { c.col = colOf(c); });
  seq.sort((a, b) => a.page - b.page || a.col - b.col || a.y - b.y);
  // En uzun tutarlı zincir (her adım n+1, ya da yeni test: 1)
  const N = seq.length, best = new Array(N).fill(1), prev = new Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    for (let j = Math.max(0, i - 40); j < i; j++) {
      const a = seq[j], b = seq[i];
      const ok = b.n === a.n + 1 || (b.n === 1 && a.n >= 2) || (b.n === a.n + 2) || (b.n === a.n + 3);
      if (!ok) continue;
      const gain = best[j] + (b.n === a.n + 1 || b.n === 1 ? 1 : 0.4);
      if (gain > best[i]) { best[i] = gain; prev[i] = j; }
    }
  }
  let end = 0; for (let i = 1; i < N; i++) if (best[i] > best[end]) end = i;
  const chain = []; for (let i = end; i >= 0; i = prev[i]) { chain.unshift(seq[i]); if (prev[i] < 0) break; }

  // 4) Testlere böl
  const tests = [];
  let cur = null;
  chain.forEach((c, i) => {
    if (!cur || c.n <= chain[i - 1].n) { cur = { questions: [] }; tests.push(cur); }
    const p = chain[i - 1];
    if (p && c.n > p.n + 1) warnings.push(`${tests.length}. testte ${p.n + 1}${c.n - 1 > p.n + 1 ? '–' + (c.n - 1) : ''}. soru bulunamadı.`);
    cur.questions.push(c);
  });

  // 5) Geometri: sütun sınırları
  const leftX = cols[0].x;
  let rightMax = 0;
  for (let pi = from - 1; pi < to; pi++) for (const it of pages[pi].items) {
    if (!it.rot && it.x >= leftX - 2 && it.size <= body * 1.6 && it.b < pages[pi].h * 0.9) rightMax = Math.max(rightMax, it.r);
  }
  const colRight = cols.map((c, ci) => {
    const next = cols[ci + 1];
    if (!next) return rightMax + 2;
    let m = 0;
    // Yalnızca gerçekten iki sütunlu sayfalara bak (tam genişlikteki sayfaların satırları sütun arasını geçer)
    const twoPages = new Set(chain.filter(a => a.col > ci).map(a => a.page));
    for (const pi of twoPages) {
      const top = Math.min(...chain.filter(a => a.page === pi).map(a => a.y)) - 2;
      for (const it of pages[pi].items) {
      if (it.rot || it.x < c.x - 1 || it.r > next.x - 4) continue;
      if (it.y < top || it.y > pages[pi].h * 0.9) continue;
      if (it.size > body * 1.6) continue;
      m = Math.max(m, it.r);
      }
    }
    return m ? Math.min(m + 2, next.x - 5) : next.x - 8;
  });

  // Tekrarlanan (her sayfada aynı yerde) döndürülmüş yazılar → filigran/kod; temizlenecek
  const repKey = it => it.str;
  const repCount = new Map();
  pages.forEach(p => { const seen = new Set(); p.items.forEach(it => { if (it.rot) { const k = repKey(it); if (!seen.has(k)) { seen.add(k); repCount.set(k, (repCount.get(k) || 0) + 1); } } }); });
  const repMin = Math.max(2, Math.ceil(textPages * 0.25));

  // Alt bilgi bandı: soru sayfalarında alt %10'daki yazıların en üstü (tüm belge için ortak)
  const footYs = [];
  for (const pi of new Set(chain.map(c => c.page))) { const p = pages[pi]; const ys = p.items.filter(i => i.y > p.h * 0.9).map(i => i.y / p.h); if (ys.length) footYs.push(Math.min(...ys)); }
  const globalFooter = footYs.length >= 3 ? median(footYs) * pages[from - 1].h : Infinity;
  const pageInfo = new Map();
  const infoFor = pi => {
    if (pageInfo.has(pi)) return pageInfo.get(pi);
    const p = pages[pi];
    const anchors = chain.filter(c => c.page === pi);
    const footerTop = Math.min(p.h - 8, globalFooter, ...p.items.filter(i => i.y > p.h * 0.9).map(i => i.y));
    const stoppers = p.items.filter(i => !i.rot && STOPPER_UP.test(i.str) || (!i.rot && /^Diğer sayfaya/i.test(i.str)));
    const noise = p.items.filter(i => i.rot && (repCount.get(repKey(i)) || 0) >= repMin);
    const twoCol = cols.length > 1 && anchors.some(a => a.col > 0);
    // İki sütunlu sayfada sütun arasındaki kısa yazılar (kitapçık harfi, kod) da gürültüdür
    if (twoCol) p.items.forEach(i => { const cx = (i.x + i.r) / 2; if (cx > colRight[0] - 2 && cx < cols[1].x && (i.rot || i.str.length <= 10)) noise.push(i); });
    const inf = { anchors, footerTop, stoppers, noise, twoCol };
    pageInfo.set(pi, inf);
    return inf;
  };

  const questions = [];
  tests.forEach((t, ti) => {
    t.index = ti;
    t.questions = t.questions.map(c => {
      const p = pages[c.page], inf = infoFor(c.page);
      const full = !inf.twoCol;
      let x0 = c.numR + 1.5;
      const x1 = full ? rightMax + 2 : colRight[c.col];
      const y0 = c.y - 3;
      // Sonraki numara: aynı sütunda altta (tam genişlikte: herhangi sütunda altta)
      const below = inf.anchors.filter(a => a !== c && a.y > c.y + 2 && (full || a.col === c.col)).map(a => a.y);
      const stop = inf.stoppers.filter(s => s.y > c.b && s.r > x0 && s.x < x1).map(s => s.y);
      const y1 = Math.min(inf.footerTop, ...below, ...stop) - 3;
      // Soru metni numaranın bittiği yerden önce başlıyorsa (asılı girinti yoksa) sol sınırı metne göre al
      let minX = Infinity;
      for (const it of p.items) {
        if (it.rot || it === c.it || it.x <= c.x + 1 || it.x >= x1 || it.y < y0 || it.b > y1 + 2) continue;
        if (it.x < minX) minX = it.x;
      }
      if (minX < x0) x0 = Math.max(c.x + 2, minX - 1);
      const q = { test: ti, n: c.n, page: c.page, rect: { x: x0, y: y0, w: Math.max(10, x1 - x0), h: Math.max(10, y1 - y0) }, full, contentW: rightMax - leftX, noise: inf.noise };
      questions.push(q);
      return q;
    });
  });

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
    let withOpt = 0, withAns = 0;
    t.cozumCevap = t.questions.map(q => {
      const its = regionItems(q);
      const letters = new Set();
      its.forEach(i => { const m = i.str.match(OPT); if (m) letters.add(m[1].toUpperCase()); });
      if (letters.size >= 3) withOpt++;
      const m = its.map(i => i.str).join(' ').match(ANS);
      if (m) withAns++;
      return m ? m[1].toUpperCase() : '';
    });
    const n = t.questions.length || 1;
    t.secenekOrani = withOpt / n; t.cevapOrani = withAns / n;
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
  const key = findAnswerKey(pages, new Set(chain.map(c => c.page)), qTests.map(t => t.questions.length ? t.questions[t.questions.length - 1].n : 0));
  if (key) qTests.forEach((t, i) => { t.anahtar = key.cols[i] || ''; t.anahtarKaynak = 'anahtar'; });
  fillFromSolutions(tests);

  return { colRight, tests, questions, warnings, anahtarSayfa: key ? key.page + 1 : 0, body, cols: cols.map(c => c.x) };
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
  for (let pi = pages.length - 1; pi >= 0; pi--) {
    if (qPages.has(pi)) continue;
    const its = pages[pi].items.filter(i => !i.rot);
    const pairs = [];
    for (const it of its) {
      let m = it.str.match(/^(\d{1,3})[.)\-]?\s*([A-E])$/);
      if (m) { pairs.push({ n: +m[1], L: m[2], x: it.r, y: it.base }); continue; }
      m = it.str.match(/^(\d{1,3})[.)\-]?$/);
      if (!m) continue;
      const L = its.filter(o => o !== it && Math.abs(o.base - it.base) < 2.5 && o.x >= it.r - 1 && o.x - it.r < 45 && /^[A-E]$/.test(o.str)).sort((a, b) => a.x - b.x)[0];
      if (L) pairs.push({ n: +m[1], L: L.str, x: L.x, y: it.base });
    }
    if (pairs.length < 5) continue;
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
    if (!cols.length) continue;
    // Test sayılarıyla eşleşiyorsa kabul et
    const want = counts.filter(Boolean);
    const lens = cols.map(c => c.length);
    if (want.length && lens.length === want.length && lens.every((l, i) => l === want[i])) return { page: pi, cols };
    if (want.length === 1 && lens.reduce((s, l) => s + l, 0) === want[0]) return { page: pi, cols: [cols.join('')] };
  }
  return null;
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
  // Filigran: açık, doygun olmayan tek bir ton; sayfaların çoğunda geniş alan kaplar.
  const pagesHas = new Map(), totals = new Map();
  for (const c of canvases) {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    const hist = new Map(); let n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      n++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mn < 150 || mx - mn < 18) continue;
      const k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
    hist.forEach((v, k) => {
      totals.set(k, (totals.get(k) || 0) + v / n);
      if (v / n >= 0.004) pagesHas.set(k, (pagesHas.get(k) || 0) + 1);
    });
  }
  let bk = -1, bs = 0;
  const need = Math.max(1, Math.ceil(canvases.length * 0.4));
  pagesHas.forEach((pc, k) => { if (pc < need) return; const s = pc + totals.get(k); if (s > bs) { bs = s; bk = k; } });
  if (bk < 0) return null;
  return [((bk >> 10) & 31) * 8 + 4, ((bk >> 5) & 31) * 8 + 4, (bk & 31) * 8 + 4];
}

/** Beyaz ile filigran rengi arasındaki tonları beyaza çevir */
export function removeWatermark(canvas, wm) {
  if (!wm) return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = im.data;
  const dv = [255 - wm[0], 255 - wm[1], 255 - wm[2]];
  const len2 = dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2];
  for (let i = 0; i < d.length; i += 4) {
    const p0 = 255 - d[i], p1 = 255 - d[i + 1], p2 = 255 - d[i + 2];
    if (p0 + p1 + p2 < 6) continue;
    const t = (p0 * dv[0] + p1 * dv[1] + p2 * dv[2]) / len2;          // beyazdan filigrana doğru izdüşüm
    if (t < 0 || t > 1.25) continue;
    const e0 = p0 - t * dv[0], e1 = p1 - t * dv[1], e2 = p2 - t * dv[2];
    if (e0 * e0 + e1 * e1 + e2 * e2 < 22 * 22) { d[i] = d[i + 1] = d[i + 2] = 255; }
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
  if (opts.watermark) removeWatermark(c, opts.watermark);
  let out = opts.trim ? opts.trim(c, 2) : c;
  out = sweepEdges(out, scale);
  return opts.trim ? opts.trim(out, Math.round(3 * scale)) : out;
}
