// A4 sayfa çizici (tablo, metin, sayfa sonu) -> PDF
import { makeCanvas, canvasToBlob } from './util.js';
import { state } from './db.js';

export const A4W = 210, A4H = 297;
export const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const FONT_HEAD = '"Archivo", "Inter", "Segoe UI", Arial, sans-serif';
export const BRAND = '#c8264f';

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('600 20px "Inter"'), document.fonts.load('400 20px "Inter"'),
      document.fonts.load('700 20px "Archivo"'),
    ]);
  } catch { /* yedek fontlar kullanılır */ }
}

export function getPDFLib() {
  if (!window.PDFLib) throw new Error('PDF kütüphanesi yüklenemedi. Sayfayı yenileyin.');
  return window.PDFLib;
}

/** JPEG/PNG sayfa görsellerinden PDF üret */
export async function imagesToPdf(blobs) {
  const { PDFDocument } = getPDFLib();
  const pdf = await PDFDocument.create();
  for (const b of blobs) {
    const bytes = new Uint8Array(await b.arrayBuffer());
    const img = b.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  pdf.setProducer('selfdeneme.com'); pdf.setCreator('selfdeneme.com');
  return await pdf.save();
}

export async function mergePdfs(list) {
  const { PDFDocument } = getPDFLib();
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return await out.save();
}

export class DocWriter {
  constructor({ dpi = 170, margin = 12, title = '', subtitle = '', showHeader = true } = {}) {
    this.dpi = dpi; this.k = dpi / 25.4; this.m = margin;
    this.title = title; this.subtitle = subtitle; this.showHeader = showHeader;
    this.blobs = []; this.pageNo = 0; this.canvas = null; this.ctx = null;
    this.logo = null;
  }
  async init() {
    await fontsReady();
    if (state.settings.logo) {
      try { this.logo = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = state.settings.logo; }); } catch { this.logo = null; }
    }
    this.newPage();
    return this;
  }
  get W() { return A4W - 2 * this.m; }
  get bottom() { return A4H - this.m - 8; }
  px(mm) { return mm * this.k; }
  async flush() {
    if (!this.canvas) return;
    this.footer();
    this.blobs.push(await canvasToBlob(this.canvas, 'image/jpeg', 0.92));
    this.canvas.width = 1; this.canvas = null; this.ctx = null;
  }
  newPage() {
    if (this.canvas) this._pending = (this._pending || Promise.resolve()).then(() => null);
    this.pageNo++;
    const c = makeCanvas(A4W * this.k, A4H * this.k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    this.canvas = c; this.ctx = ctx;
    this.y = this.m;
    if (this.showHeader) this.header();
  }
  async pageBreak() { await this.flush(); this.newPage(); }
  async ensure(h) { if (this.y + h > this.bottom) await this.pageBreak(); }
  font(size, weight = 400, head = false) { this.ctx.font = `${weight} ${size * this.k * 0.3528}px ${head ? FONT_HEAD : FONT}`; }
  header() {
    const ctx = this.ctx, k = this.k, m = this.m;
    let x = m;
    if (this.logo) {
      const h = 11, w = Math.min(30, h * this.logo.width / this.logo.height);
      ctx.drawImage(this.logo, m * k, m * k, w * k, h * k); x = m + w + 3;
    }
    ctx.fillStyle = BRAND;
    this.font(8.5, 600);
    ctx.textBaseline = 'top';
    ctx.fillText((state.settings.kurum || 'selfdeneme').toLocaleUpperCase('tr-TR'), x * k, m * k);
    ctx.fillStyle = '#111';
    this.font(14, 700, true);
    ctx.fillText(this.title, x * k, (m + 3.8) * k);
    if (this.subtitle) {
      ctx.fillStyle = '#555'; this.font(8.5, 400);
      ctx.textAlign = 'right';
      ctx.fillText(this.subtitle, (A4W - m) * k, (m + 1) * k);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = BRAND;
    ctx.fillRect(m * k, (m + 12.5) * k, (A4W - 2 * m) * k, 0.6 * k);
    this.y = m + 16;
  }
  footer() {
    const ctx = this.ctx, k = this.k;
    ctx.fillStyle = '#888'; this.font(7.5, 400);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.pageNo), (A4W / 2) * k, (A4H - this.m + 2) * k);
    ctx.textAlign = 'right';
    ctx.fillText('selfdeneme.com', (A4W - this.m) * k, (A4H - this.m + 2) * k);
    ctx.textAlign = 'left';
  }
  /** Metin yaz; wrap için genişlik verilebilir. Döndürür: kullanılan yükseklik (mm) */
  text(str, { x = this.m, w = null, size = 10, weight = 400, color = '#111', align = 'left', head = false, lh = 1.35, dry = false } = {}) {
    const ctx = this.ctx, k = this.k;
    this.font(size, weight, head);
    const lines = w ? wrapLines(ctx, String(str), w * k) : [String(str)];
    const lineH = size * 0.3528 * lh;
    if (!dry) {
      ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align;
      const ax = align === 'center' ? x + (w || 0) / 2 : align === 'right' ? x + (w || 0) : x;
      lines.forEach((l, i) => ctx.fillText(l, ax * k, (this.y + i * lineH) * k));
      ctx.textAlign = 'left';
    }
    return lines.length * lineH;
  }
  async para(str, opts = {}) {
    const h = this.text(str, { ...opts, w: opts.w || this.W, dry: true });
    await this.ensure(h);
    this.text(str, { ...opts, w: opts.w || this.W });
    this.y += h + (opts.after ?? 2);
  }
  async heading(str, sub = '') {
    await this.ensure(14);
    const ctx = this.ctx, k = this.k;
    this.y += 2;
    ctx.fillStyle = BRAND; ctx.fillRect(this.m * k, this.y * k, 1.2 * k, 5.2 * k);
    this.text(str, { x: this.m + 3, size: 11.5, weight: 700, head: true });
    if (sub) this.text(sub, { x: this.m + 3, w: this.W - 3, size: 8, color: '#666', align: 'right' });
    this.y += 7.5;
  }
  /**
   * Tablo. cols: [{label, w (mm), align}], rows: [[...]], style(ri, ci, val) => {fill,color,weight}
   */
  async table(cols, rows, { size = 8.5, rowH = 6, headFill = '#f6dbe3', style = null, zebra = true } = {}) {
    const ctx = this.ctx;
    const totalW = cols.reduce((a, c) => a + c.w, 0);
    const scale = totalW > this.W ? this.W / totalW : 1;
    const cs = cols.map(c => ({ ...c, w: c.w * scale }));
    const drawHead = () => {
      const k = this.k;
      this.ctx.fillStyle = headFill;
      this.ctx.fillRect(this.m * k, this.y * k, this.W * k, rowH * k);
      let x = this.m;
      cs.forEach(c => { this.cell(c.label, x, c.w, rowH, { size: size - 0.5, weight: 600, align: c.align, color: '#3a0f1c' }); x += c.w; });
      this.y += rowH;
    };
    await this.ensure(rowH * 2);
    drawHead();
    for (let ri = 0; ri < rows.length; ri++) {
      if (this.y + rowH > this.bottom) { await this.pageBreak(); drawHead(); }
      const k = this.k;
      if (zebra && ri % 2 === 1) { this.ctx.fillStyle = '#f7f7f8'; this.ctx.fillRect(this.m * k, this.y * k, this.W * k, rowH * k); }
      let x = this.m;
      rows[ri].forEach((v, ci) => {
        const st = style ? (style(ri, ci, v) || {}) : {};
        if (st.fill) { this.ctx.fillStyle = st.fill; this.ctx.fillRect(x * k, this.y * k, cs[ci].w * k, rowH * k); }
        this.cell(v, x, cs[ci].w, rowH, { size, align: cs[ci].align, color: st.color || '#111', weight: st.weight || 400 });
        x += cs[ci].w;
      });
      this.ctx.fillStyle = '#e2e2e6';
      this.ctx.fillRect(this.m * k, (this.y + rowH) * k - 1, this.W * k, 1);
      this.y += rowH;
    }
    this.y += 3;
    void ctx;
  }
  cell(v, x, w, h, { size = 8.5, weight = 400, align = 'left', color = '#111' } = {}) {
    const ctx = this.ctx, k = this.k;
    this.font(size, weight);
    ctx.fillStyle = color; ctx.textBaseline = 'middle';
    let s = v === null || v === undefined ? '' : String(v);
    const maxW = (w - 2.4) * k;
    if (ctx.measureText(s).width > maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      s += '…';
    }
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
    const ax = align === 'right' ? x + w - 1.2 : align === 'center' ? x + w / 2 : x + 1.2;
    ctx.fillText(s, ax * k, (this.y + h / 2 + 0.2) * k);
    ctx.textAlign = 'left';
  }
  /** Bilgi kutucukları satırı: [{label, value}] */
  async stats(items, { h = 15 } = {}) {
    await this.ensure(h + 3);
    const ctx = this.ctx, k = this.k;
    const gap = 3, w = (this.W - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const x = this.m + i * (w + gap);
      ctx.fillStyle = i === 0 ? BRAND : '#f4f4f6';
      roundRect(ctx, x * k, this.y * k, w * k, h * k, 1.6 * k); ctx.fill();
      const save = this.y;
      this.y = save + 2.2;
      this.text(it.label, { x: x + 2.5, w: w - 5, size: 7.2, color: i === 0 ? '#ffe3ea' : '#666' });
      this.y = save + 6.2;
      this.text(it.value, { x: x + 2.5, w: w - 5, size: 13, weight: 700, head: true, color: i === 0 ? '#fff' : '#111' });
      this.y = save;
    });
    this.y += h + 4;
  }
  /** Basit çizgi grafik: points [{label, value}] */
  async lineChart(points, { h = 52, label = '' } = {}) {
    await this.ensure(h + 8);
    const ctx = this.ctx, k = this.k;
    const x0 = this.m + 10, x1 = this.m + this.W - 4, y0 = this.y + 4, y1 = this.y + h - 10;
    const vals = points.map(p => p.value);
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1) { mx += 1; mn -= 1; }
    const pad = (mx - mn) * 0.15; mn -= pad; mx += pad;
    ctx.strokeStyle = '#e4e4e8'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const yy = y0 + (y1 - y0) * i / 3;
      ctx.beginPath(); ctx.moveTo(x0 * k, yy * k); ctx.lineTo(x1 * k, yy * k); ctx.stroke();
      this.font(6.5); ctx.fillStyle = '#888'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((mx - (mx - mn) * i / 3).toFixed(0), (x0 - 1.5) * k, yy * k);
    }
    const n = points.length;
    const px = i => n === 1 ? (x0 + x1) / 2 : x0 + 4 + (x1 - x0 - 8) * i / (n - 1);
    const py = v => y1 - (v - mn) / (mx - mn) * (y1 - y0);
    ctx.strokeStyle = BRAND; ctx.lineWidth = 0.7 * k; ctx.beginPath();
    points.forEach((p, i) => { const X = px(i) * k, Y = py(p.value) * k; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.stroke();
    points.forEach((p, i) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = BRAND; ctx.lineWidth = 0.5 * k;
      ctx.beginPath(); ctx.arc(px(i) * k, py(p.value) * k, 1.3 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      this.font(6.8, 600); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.valueLabel ?? String(p.value), px(i) * k, (py(p.value) - 2) * k);
      this.font(6.2); ctx.fillStyle = '#666'; ctx.textBaseline = 'top';
      let l = p.label; while (l.length > 3 && ctx.measureText(l).width > ((x1 - x0) / Math.max(1, n) - 1) * k) l = l.slice(0, -2) + '…';
      ctx.fillText(l, px(i) * k, (y1 + 2) * k);
    });
    ctx.textAlign = 'left';
    if (label) { this.font(6.8); ctx.fillStyle = '#666'; ctx.textBaseline = 'top'; ctx.fillText(label, this.m * k, (this.y) * k); }
    this.y += h;
  }
  /** Yatay oran çubukları: [{label, frac, text}] */
  async bars(items, { rowH = 6.2 } = {}) {
    for (const it of items) {
      await this.ensure(rowH);
      const ctx = this.ctx, k = this.k;
      const lw = 52, bw = this.W - lw - 22;
      this.cell(it.label, this.m, lw, rowH, { size: 8 });
      ctx.fillStyle = '#efeff2'; roundRect(ctx, (this.m + lw) * k, (this.y + 1.4) * k, bw * k, (rowH - 2.8) * k, 1 * k); ctx.fill();
      ctx.fillStyle = it.color || BRAND; roundRect(ctx, (this.m + lw) * k, (this.y + 1.4) * k, Math.max(0.5, bw * Math.max(0, Math.min(1, it.frac))) * k, (rowH - 2.8) * k, 1 * k); ctx.fill();
      this.cell(it.text, this.m + lw + bw, 22, rowH, { size: 8, weight: 600, align: 'right' });
      this.y += rowH;
    }
    this.y += 2;
  }
  async finish() { await this.flush(); return await imagesToPdf(this.blobs); }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
