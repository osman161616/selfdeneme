// Soru kitapçığı dizgisi: yatay (tam genişlik) ve dikey (yarım genişlik) soruları A4 sayfalara yerleştirir
import { state, sortDersler } from './db.js';
import { makeCanvas, canvasToBlob, shuffle, LETTERS } from './util.js';
import { A4W, A4H, FONT, FONT_HEAD, BRAND, fontsReady, imagesToPdf, DocWriter } from './pdfdoc.js';

const GUTTER = 7;   // soru numarası alanı (mm)
const COLGAP = 6;   // sütun arası (mm)

function geom() {
  const s = state.settings;
  const m = Math.max(5, Math.min(25, Number(s.kenar) || 10));
  const headH = 11, footH = 8;
  const x0 = m, x1 = A4W - m, y0 = m + headH, y1 = A4H - m - footH;
  const W = x1 - x0;
  const colW = (W - COLGAP) / 2;
  return { m, x0, x1, y0, y1, W, colW, gap: Math.max(2, Number(s.soruArasi) || 6), headH };
}

/** Soru görselinin yerleşim boyutu (mm) */
function itemSize(q, g) {
  const maxH = g.y1 - g.y0 - 12;
  const w = q.yatay ? g.W - GUTTER : g.colW - GUTTER;
  let h = w * (q.h / q.w);
  let ww = w;
  if (h > maxH) { ww = w * maxH / h; h = maxH; }
  return { w: ww, h };
}

/**
 * Bölümleri sayfalara yerleştir.
 * sections: [{title, ders, questions:[{id,w,h,yatay,...}]}]
 * Döndürür: pages: [[{type:'q'|'head'|'sep', ...}]]
 */
function layoutOnce(sections, g, forceNewPage = false) {
  const pages = [];
  let page = null, y = 0, region = null; // region: {top, colY:[a,b], col}
  const newPage = () => { page = []; pages.push(page); y = g.y0; region = null; };
  const closeRegion = () => {
    if (region) {
      const bottom = Math.max(region.colY[0], region.colY[1]);
      if (region.colY[1] > region.top) page.push({ type: 'sep', x: g.x0 + g.colW + COLGAP / 2, y0: region.top, y1: bottom - g.gap });
      y = bottom; region = null;
    }
  };
  newPage();
  let prevDers = null;
  const headH = 9;
  const colX = col => g.x0 + col * (g.colW + COLGAP);
  for (const sec of sections) {
    const yat = sec.questions.filter(q => q.yatay).map(q => ({ q, sz: itemSize(q, g) }));
    const dik = sec.questions.filter(q => !q.yatay).map(q => ({ q, sz: itemSize(q, g) }));
    const queue = [...yat, ...dik];
    if (!queue.length) continue;
    if ((forceNewPage || state.settings.dersYeniSayfa) && prevDers !== null && prevDers !== sec.ders && page.length > 0) { closeRegion(); newPage(); }
    prevDers = sec.ders;
    const firstH = queue[0].sz.h;
    if (!yat.length) {
      // Yalnızca dikey sorular: başlık da sütun akışında
      if (!region) region = { top: y, colY: [y, y], col: 0 };
      for (;;) {
        const cy = region.colY[region.col];
        if (cy + headH + firstH <= g.y1) {
          page.push({ type: 'head', x: colX(region.col), y: cy, w: g.colW, h: headH - 2, title: sec.title });
          region.colY[region.col] = cy + headH;
          break;
        }
        if (region.col === 0) { region.col = 1; continue; }
        closeRegion(); newPage(); region = { top: y, colY: [y, y], col: 0 };
      }
    } else {
      closeRegion();
      if (y + headH + firstH > g.y1 && page.length > 0) newPage();
      page.push({ type: 'head', x: g.x0, y, w: g.W, h: headH - 2, title: sec.title });
      y += headH;
    }
    while (queue.length) {
      const it = queue[0];
      if (it.q.yatay) {
        closeRegion();
        if (y + it.sz.h <= g.y1) {
          page.push({ type: 'q', q: it.q, x: g.x0 + GUTTER, y, w: it.sz.w, h: it.sz.h, numX: g.x0, ders: sec.ders });
          y += it.sz.h + g.gap; queue.shift();
        } else {
          const j = queue.findIndex(o => o.q.yatay && y + o.sz.h <= g.y1);
          if (j > 0) { const [o] = queue.splice(j, 1); queue.unshift(o); continue; }
          newPage();
        }
      } else {
        if (!region) region = { top: y, colY: [y, y], col: 0 };
        const tryPlace = (o, col) => {
          const cy = region.colY[col];
          if (cy + o.sz.h <= g.y1) {
            page.push({ type: 'q', q: o.q, x: colX(col) + GUTTER, y: cy, w: o.sz.w, h: o.sz.h, numX: colX(col), ders: sec.ders });
            region.colY[col] = cy + o.sz.h + g.gap;
            return true;
          }
          return false;
        };
        if (tryPlace(it, region.col)) { queue.shift(); continue; }
        const j = queue.findIndex(o => !o.q.yatay && region.colY[region.col] + o.sz.h <= g.y1);
        if (j > 0) { const [o] = queue.splice(j, 1); tryPlace(o, region.col); continue; }
        if (region.col === 0) { region.col = 1; continue; }
        closeRegion();
        newPage();
      }
    }
    if (yat.length) closeRegion();
  }
  closeRegion();
  if (pages.length && pages[pages.length - 1].length === 0) pages.pop();
  return pages;
}

/** En az sayfayı veren dizilimi bul (orijinaldeki optimizasyon sayısı) */
function bestLayout(sections, g, tries = 3, fnp = false) {
  let best = layoutOnce(sections, g, fnp);
  for (let t = 1; t < tries; t++) {
    const sh = sections.map(s => ({ ...s, questions: shuffle(s.questions) }));
    const p = layoutOnce(sh, g, fnp);
    if (p.length < best.length) best = p;
  }
  return best;
}

/** Soruları ders/konu/zorluk sırasına göre bölümlere ayır */
export function makeSections(questions, { byKonu = true, byZorluk = false } = {}) {
  const dersler = sortDersler([...new Set(questions.map(q => q.ders))]);
  const sections = [];
  for (const d of dersler) {
    const dq = questions.filter(q => q.ders === d);
    if (!byKonu) { sections.push({ ders: d, title: d, questions: dq }); continue; }
    const konular = [...new Set(dq.map(q => q.konu))];
    for (const k of konular) {
      const kq = dq.filter(q => q.konu === k);
      if (!byZorluk) { sections.push({ ders: d, title: `${d} · ${k}`, questions: kq }); continue; }
      const zs = [...new Set(kq.map(q => String(q.zorluk)))].sort();
      for (const z of zs) sections.push({ ders: d, title: `${d} · ${k} · Zorluk ${z}`, questions: kq.filter(q => String(q.zorluk) === z) });
    }
  }
  return sections;
}

async function bitmapOf(q) {
  if (!q.img) throw new Error(`"${q.ad}" sorusunun görseli bulunamadı`);
  try { return await createImageBitmap(q.img); }
  catch {
    const url = URL.createObjectURL(q.img);
    try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`"${q.ad}" görseli açılamadı`)); i.src = url; }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

/**
 * Soru kitapçığı PDF'i üret.
 * opts: {title, ogrenci, sections, tries, onProgress}
 * Döndürür: {pdf: Uint8Array, key: [{no, ders, konu, zorluk, cevap, ad, qid}], pages}
 */
export async function buildBooklet({ title, ogrenci = '', sections, tries = 3, onProgress = null, forceNewPage = false }) {
  await fontsReady();
  const s = state.settings;
  const g = geom();
  const dpi = Math.max(100, Math.min(300, Number(s.dpi) || 200));
  const k = dpi / 25.4;
  const pages = bestLayout(sections, g, Math.max(1, Math.min(20, tries)), forceNewPage);
  if (!pages.length) throw new Error('Belgeye eklenecek soru bulunamadı.');
  // Numaralandırma (her ders kendi içinde 1'den başlar)
  const counters = {}; const key = [];
  for (const p of pages) for (const it of p) if (it.type === 'q') {
    counters[it.ders] = (counters[it.ders] || 0) + 1;
    it.no = counters[it.ders];
    const m = it.q._m || {};
    key.push({ no: it.no, ders: it.q.ders, konu: it.q.konu, zorluk: String(it.q.zorluk), cevap: it.q.cevap || '', ad: it.q.ad, qid: it.q.id, ...(m.alan ? { alan: m.alan, test: m.test, testAd: m.testAd, testKisa: m.testKisa || '', slot: m.slot, slotAd: m.slotAd || '', ...(m.secmeli ? { secmeli: m.secmeli } : {}) } : {}) });
  }
  let logo = null;
  if (s.logo) { try { logo = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s.logo; }); } catch { logo = null; } }
  const blobs = [];
  for (let pi = 0; pi < pages.length; pi++) {
    onProgress && onProgress(pi / pages.length, `Sayfa ${pi + 1}/${pages.length}`);
    const c = makeCanvas(A4W * k, A4H * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    // Sayfa başlığı
    const pt = v => v * k * 0.3528;
    ctx.textBaseline = 'alphabetic';
    let hx = g.m;
    if (logo) { const lh = 7, lw = Math.min(22, lh * logo.width / logo.height); ctx.drawImage(logo, g.m * k, (g.m - 0.5) * k, lw * k, lh * k); hx = g.m + lw + 2.5; }
    ctx.fillStyle = '#111'; ctx.font = `700 ${pt(10)}px ${FONT_HEAD}`;
    ctx.fillText(fit(ctx, title || '', (A4W / 2 - hx) * k), hx * k, (g.m + 4.2) * k);
    if (s.kurum) { ctx.fillStyle = '#666'; ctx.font = `400 ${pt(7.5)}px ${FONT}`; ctx.fillText(fit(ctx, s.kurum, (A4W / 2 - hx) * k), hx * k, (g.m + 7.6) * k); }
    if (ogrenci && s.ogrenciAdiYaz !== false) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#111'; ctx.font = `600 ${pt(9.5)}px ${FONT}`;
      ctx.fillText(fit(ctx, ogrenci, (A4W / 2 - g.m) * k), (A4W - g.m) * k, (g.m + 4.2) * k);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = BRAND; ctx.fillRect(g.m * k, (g.m + 9.2) * k, (A4W - 2 * g.m) * k, Math.max(1, 0.35 * k));
    for (const it of pages[pi]) {
      if (it.type === 'head') {
        ctx.fillStyle = '#fbe7ed';
        ctx.fillRect(it.x * k, it.y * k, it.w * k, it.h * k);
        ctx.fillStyle = BRAND; ctx.fillRect(it.x * k, it.y * k, 1.1 * k, it.h * k);
        ctx.fillStyle = '#3a0f1c'; ctx.font = `700 ${pt(Number(s.baslikPunto) || 15) * 0.72}px ${FONT_HEAD}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(fit(ctx, it.title, (it.w - 6) * k), (it.x + 3) * k, (it.y + it.h / 2 + 0.2) * k);
        ctx.textBaseline = 'alphabetic';
      } else if (it.type === 'sep') {
        ctx.fillStyle = '#d9d9de';
        ctx.fillRect(it.x * k - 0.5, it.y * k, Math.max(1, 0.25 * k), Math.max(0, (it.y1 - it.y)) * k);
      } else if (it.type === 'q') {
        const bmp = await bitmapOf(it.q);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, it.x * k, it.y * k, it.w * k, it.h * k);
        if (bmp.close) bmp.close();
        ctx.fillStyle = '#111'; ctx.font = `700 ${pt(Number(s.soruNoPunto) || 12)}px ${FONT_HEAD}`;
        ctx.textBaseline = 'top';
        ctx.fillText(it.no + '.', (it.numX + 0.3) * k, (it.y + 0.6) * k);
        ctx.textBaseline = 'alphabetic';
      }
    }
    // Sayfa numarası
    ctx.fillStyle = '#444'; ctx.font = `600 ${pt(Number(s.sayfaNoPunto) || 10)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(pi + 1), (A4W / 2) * k, (A4H - g.m - 1) * k);
    ctx.textAlign = 'left';
    blobs.push(await canvasToBlob(c, 'image/jpeg', 0.9));
    c.width = 1;
  }
  onProgress && onProgress(1, 'PDF birleştiriliyor');
  const pdf = await imagesToPdf(blobs);
  return { pdf, key, pages: pages.length };
}

function fit(ctx, s, maxW) {
  s = String(s || '');
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/** Cevap anahtarı PDF'i */
export async function buildAnswerKeyPdf(title, key, { ogrenci = '' } = {}) {
  const doc = await new DocWriter({ title: 'Cevap Anahtarı', subtitle: [title, ogrenci].filter(Boolean).join(' · ') }).init();
  const dersler = sortDersler([...new Set(key.map(x => x.ders))]);
  for (const d of dersler) {
    const list = key.filter(x => x.ders === d);
    await doc.heading(d, `${list.length} soru`);
    // Kompakt ızgara: 10'lu satırlar
    const per = 10;
    const rows = [];
    for (let i = 0; i < list.length; i += per) {
      const chunk = list.slice(i, i + per);
      rows.push(chunk.map(x => `${x.no}) ${x.cevap || '?'}`).concat(Array(per - chunk.length).fill('')));
    }
    await doc.table(Array.from({ length: per }, () => ({ label: '', w: doc.W / per, align: 'left' })), rows, { size: 10, rowH: 7, headFill: '#fff', zebra: true });
  }
  await doc.heading('Ayrıntılı liste');
  await doc.table(
    [{ label: 'No', w: 12, align: 'right' }, { label: 'Ders', w: 40 }, { label: 'Konu', w: 72 }, { label: 'Zorluk', w: 16, align: 'center' }, { label: 'Cevap', w: 16, align: 'center' }, { label: 'Soru adı', w: 30 }],
    key.map(x => [x.no, x.ders, x.konu, x.zorluk, x.cevap || '?', x.ad]),
    { size: 7.8, rowH: 5.4 }
  );
  return await doc.finish();
}

/** Orijinal programla uyumlu cevap anahtarı CSV satırları */
/** Şablon bölümleri: test sırasıyla, her slot bir bölüm; numaralar test içinde sürer */
export function makeTemplateSections(tpl, perSlot) {
  const sections = [];
  for (const test of tpl.testler) {
    for (const s of test.slots) {
      const qs = perSlot[test.id + '/' + s.id];
      if (!qs || !qs.length) continue;
      const title = test.slots.length === 1 ? test.ad : `${test.ad} · ${s.ad}`;
      const sorted = qs.slice().sort((a, b) => String(a.konu).localeCompare(String(b.konu), 'tr') || String(a.zorluk).localeCompare(String(b.zorluk)));
      sections.push({ ders: test.id, title, questions: sorted.map(q => ({ ...q, _m: { alan: s.alan, test: test.id, testAd: test.ad, testKisa: test.kisa || '', slot: s.id, slotAd: s.ad, secmeli: s.secmeli || '' } })) });
    }
  }
  return sections;
}

export function keyToCsvRows(key) {
  return [['Ders', 'Konu', 'Zorluk', 'Cevap', 'Soru'], ...key.map(x => [x.ders, x.konu, x.zorluk, (x.cevap || '').toLowerCase(), x.ad])];
}

export { LETTERS };
