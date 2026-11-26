// Deneme analiz karnesi, genel analiz karnesi, sıralı liste
import { state, sortDersler, getStudent, dersIndex } from './db.js';
import { fmtNum, fmtDate, round, sinifOf, cmpTr } from './util.js';
import { evaluateExam, seviyeHesapla, seviyeToStr, statsBy, collectItems, inScope, dogruOrani } from './scoring.js';
import { DocWriter, mergePdfs } from './pdfdoc.js';
import { PUAN_TURLERI } from './sinavlar.js';
const ptAd = pt => (PUAN_TURLERI[pt] ? PUAN_TURLERI[pt].ad : pt);
const nn = v => (v === null || v === undefined ? -1e9 : v);

const pct = v => '%' + fmtNum(v * 100, 1);
const LVFILL = s => s < 2 ? '#fde2e2' : s < 3 ? '#fff0d6' : s < 4 ? '#dcf3ee' : '#dff2e3';

/** Öğrencinin ödevlerde gördüğü soru sayıları: {ders: n, 'ders\0konu': n} */
export function seenCounts(no) {
  const out = {};
  const s = getStudent(no);
  if (!s || !s.gorulen) return out;
  for (const id of Object.keys(s.gorulen)) {
    const q = state.questions.get(id); if (!q) continue;
    out[q.ders] = (out[q.ders] || 0) + 1;
    const k = q.ders + '\u0000' + q.konu; out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export const KARNE_OPTS = [
  ['puan', 'Puan ve sıralamalar'], ['ders', 'Ders sonuçları tablosu'], ['seviye', 'Ders seviye analizi'],
  ['soru', 'Soru soru cevaplar'], ['konu', 'Konu analizi'], ['madde', 'Sınavın en zor soruları (madde analizi)'],
];

async function denemeKarnesiOne(exam, ev, no, opts) {
  const o = ev.ogr.get(no);
  const doc = await new DocWriter({ title: 'Deneme Analiz Karnesi', subtitle: `${exam.isim} · ${fmtDate(exam.tarih)}` }).init();
  const subeN = [...ev.ogr.values()].filter(x => (x.sube || '') === (o.sube || '')).length;
  await doc.para(`${o.isim || '(adsız)'}`, { size: 15, weight: 700, head: true, after: 0.5 });
  await doc.para(`Numara ${o.no}${o.sube ? ' · Şube ' + o.sube : ''}`, { size: 9, color: '#555', after: 4 });
  if (opts.puan) {
    const ana = ev.tpl && ev.puanTurleri.length ? (exam.siralama && ev.puanTurleri.includes(exam.siralama) ? exam.siralama : ev.puanTurleri[0]) : null;
    const dyb = o.items.filter(it => it.durum !== 'X'); const dOran = dyb.length ? dyb.filter(it => it.durum === 'D').length / dyb.length : 0;
    await doc.stats([
      ev.netSiralama ? { label: 'Toplam net', value: fmtNum(o.net, 2) } : { label: ev.tpl ? `${ptAd(ana)} puanı (tahmini)` : 'Puan', value: fmtNum(o.puan, 2) },
      ev.netSiralama ? { label: 'Doğru oranı', value: pct(dOran) } : { label: 'Toplam net', value: fmtNum(o.net, 2) },
      { label: 'Kurum sırası', value: `${o.rank.kurum.genel ?? '–'} / ${ev.ogr.size}` },
      { label: 'Şube sırası', value: o.sube ? `${o.rank.sube.genel ?? '–'} / ${subeN}` : '-' },
    ]);
    if (ev.tpl && ev.puanTurleri.length) {
      const yks = ev.tpl.id !== 'LGS';
      await doc.table([{ label: 'Puan türü', w: 34 }, { label: 'Tahmini puan', w: 30, align: 'right' }, ...(yks ? [{ label: 'Yerleştirme (OBP)', w: 34, align: 'right' }] : []), { label: 'Kurum ort.', w: 26, align: 'right' }, { label: 'Kurum sırası', w: 28, align: 'right' }, { label: 'Şube sırası', w: 26, align: 'right' }],
        ev.puanTurleri.map(pt => [PUAN_TURLERI[pt].uzun || ptAd(pt), o.puanlar[pt] === null ? (o.puanAciklama[pt] || '–') : fmtNum(o.puanlar[pt], 3), ...(yks ? [fmtNum(o.yPuanlar[pt], 3)] : []), fmtNum(ev.kurum.ptOrt[pt], 2), o.rank.pt.kurum[pt] ?? '–', o.rank.pt.sube[pt] ?? '–']),
        { style: (ri, ci) => ci === 1 ? { weight: 700 } : null });
      await doc.para(`Puanlar ${ev.tpl.id === 'LGS' ? 'MEB' : 'ÖSYM'} ağırlıklarıyla hesaplanmış tahmini puanlardır; resmî puan, sınava girenlerin ortalamasına göre standartlaştırılır.`, { size: 7.2, color: '#777', after: 3 });
    }
  }
  if (opts.ders) {
    await doc.heading('Ders sonuçları');
    const subeOrt = ev.subeOrt[o.sube || ''] || { dersNetOrt: {} };
    await doc.table(
      [{ label: 'Ders', w: 46 }, { label: 'Soru', w: 12, align: 'right' }, { label: 'D', w: 10, align: 'right' }, { label: 'Y', w: 10, align: 'right' }, { label: 'B', w: 10, align: 'right' }, { label: 'Net', w: 15, align: 'right' }, { label: 'Şube ort.', w: 18, align: 'right' }, { label: 'Kurum ort.', w: 19, align: 'right' }, { label: 'Şube sıra', w: 17, align: 'right' }, { label: 'Kurum sıra', w: 19, align: 'right' }],
      ev.dersler.map(d => { const s = o.ders[d]; return [d, s.soru, s.D, s.Y, s.B, fmtNum(s.Net, 2), fmtNum(subeOrt.dersNetOrt[d], 2), fmtNum(ev.kurum.dersNetOrt[d], 2), o.sube ? o.rank.sube[d] : '-', o.rank.kurum[d]]; }),
      { style: (ri, ci) => ci === 5 ? { weight: 700 } : null }
    );
  }
  if (opts.seviye) {
    await doc.heading('Ders seviye analizi', '1 geliştirilmeli … 5 çok iyi');
    const seen = seenCounts(no);
    const rows = ev.dersler.map(d => { const items = o.items.filter(it => it.grup === d); const sv = seviyeHesapla(items); const s = o.ders[d]; return [d, fmtNum(sv, 2), pct(dogruOrani(s.D, s.Y, s.B)), seviyeToStr(sv), seen[d] || 0, sv]; });
    await doc.table([{ label: 'Ders', w: 60 }, { label: 'Seviye', w: 22, align: 'right' }, { label: 'Doğru oranı', w: 28, align: 'right' }, { label: 'Durum', w: 40 }, { label: 'Ödevde çözülen', w: 36, align: 'right' }], rows.map(r => r.slice(0, 5)), { style: (ri, ci) => ci === 3 ? { fill: LVFILL(rows[ri][5]) } : null });
  }
  if (opts.soru) {
    await doc.heading('Soru soru cevaplar', 'yeşil doğru · kırmızı yanlış · gri boş');
    for (const d of ev.dersler) {
      const items = o.items.filter(it => it.grup === d);
      const per = 20;
      for (let i = 0; i < items.length; i += per) {
        const chunk = items.slice(i, i + per);
        const cols = [{ label: i === 0 ? d.slice(0, 16) : '', w: 30 }, ...chunk.map(it => ({ label: String(ev.soruIst[it.i].dersNo), w: 7.8, align: 'center' }))];
        await doc.table(cols, [['Anahtar', ...chunk.map(it => it.durum === 'X' ? '·' : (it.dogru || '?'))], ['Öğrenci', ...chunk.map(it => it.durum === 'X' ? '·' : (it.cevap || '–'))]], {
          size: 8, rowH: 5.6, zebra: false,
          style: (ri, ci) => { if (ri !== 1 || ci === 0) return null; const it = chunk[ci - 1]; return { fill: it.durum === 'D' ? '#d8f0df' : it.durum === 'Y' ? '#fbd5d5' : it.durum === 'X' ? '#fff' : '#ececef', weight: 700 }; },
        });
      }
    }
  }
  if (opts.konu) {
    await doc.heading('Konu analizi');
    const seen = seenCounts(no);
    const g = [...statsBy(o.items.filter(it => it.durum !== 'X'), it => it.ders + '\u0000' + it.konu).values()].sort((a, b) => dersIndex(a.ders) - dersIndex(b.ders) || cmpTr(a.ders, b.ders) || a.oran - b.oran);
    await doc.table([{ label: 'Konu', w: 64 }, { label: 'Ders', w: 30 }, { label: 'Soru', w: 12, align: 'right' }, { label: 'D', w: 9, align: 'right' }, { label: 'Y', w: 9, align: 'right' }, { label: 'B', w: 9, align: 'right' }, { label: 'Doğru oranı', w: 22, align: 'right' }, { label: 'Seviye', w: 16, align: 'right' }, { label: 'Ödev', w: 14, align: 'right' }],
      g.map(x => [x.konu, x.ders, x.soru, x.D, x.Y, x.B, pct(x.oran), fmtNum(x.seviye, 2), seen[x.ders + '\u0000' + x.konu] || 0]),
      { size: 8, rowH: 5.6, style: (ri, ci) => ci === 7 ? { fill: LVFILL(g[ri].seviye) } : null });
  }
  if (opts.madde) {
    await doc.heading('Sınavın en zor 10 sorusu', 'tüm katılımcıların sonuçlarına göre');
    const hard = ev.soruIst.filter(s => !s.iptal && s.D + s.Y + s.B > 0).sort((a, b) => a.oran - b.oran).slice(0, 10);
    await doc.table([{ label: 'Soru', w: 50 }, { label: 'Konu', w: 64 }, { label: 'Doğru oranı', w: 26, align: 'right' }, { label: 'Doğru cevap', w: 24, align: 'center' }, { label: 'Senin cevabın', w: 26, align: 'center' }],
      hard.map(s => { const it = o.items[s.i]; return [s.etiket, s.konu, pct(s.oran), s.cevap || '?', it.cevap || '–']; }),
      { style: (ri, ci) => { if (ci !== 4) return null; const it = o.items[hard[ri].i]; return { fill: it.durum === 'D' ? '#d8f0df' : it.durum === 'Y' ? '#fbd5d5' : '#ececef' }; } });
  }
  return await doc.finish();
}

export async function denemeKarneleri(exam, nos, opts, onProgress) {
  const ev = evaluateExam(exam);
  const list = nos.filter(no => ev.ogr.has(no)).sort((a, b) => cmpTr(ev.ogr.get(a).sube, ev.ogr.get(b).sube) || (ev.ogr.get(a).rank.kurum.genel ?? 1e9) - (ev.ogr.get(b).rank.kurum.genel ?? 1e9));
  const pdfs = [];
  for (let i = 0; i < list.length; i++) {
    onProgress && onProgress(i / list.length, `${ev.ogr.get(list[i]).isim || list[i]}`);
    pdfs.push(await denemeKarnesiOne(exam, ev, list[i], opts));
  }
  onProgress && onProgress(1, 'Birleştiriliyor');
  return pdfs.length === 1 ? pdfs[0] : await mergePdfs(pdfs);
}

export function scopeLabel(scope) {
  if (scope.tip === 'ogrenci') { const s = getStudent(scope.deger); return s ? `${s.isim} · ${s.no}${s.sube ? ' · ' + s.sube : ''}` : scope.deger; }
  if (scope.tip === 'sube') return `${scope.deger} şubesi`;
  if (scope.tip === 'sinif') return `${scope.deger}. sınıflar`;
  return state.settings.kurum || 'Kurum geneli';
}

/** Genel analiz karnesi (birden çok sınav) */
export async function genelKarne(scope, exams) {
  const sorted = exams.slice().sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));
  const items = collectItems(sorted, scope);
  if (!items.length) throw new Error('Seçilen sınavlarda bu kapsama ait sonuç yok.');
  const doc = await new DocWriter({ title: 'Genel Analiz Karnesi', subtitle: `${sorted.length} sınav · ${fmtDate(new Date().toISOString().slice(0, 10))}` }).init();
  await doc.para(scopeLabel(scope), { size: 15, weight: 700, head: true, after: 4 });
  // Puan gidişatı
  const pts = [];
  const rows = [];
  for (const e of sorted) {
    const ev = evaluateExam(e);
    const os = [...ev.ogr.values()].filter(o => inScope(o, scope));
    if (!os.length) continue;
    const op = os.filter(o => o.puan !== null);
    const puan = op.length ? op.reduce((a, o) => a + o.puan, 0) / op.length : null, net = os.reduce((a, o) => a + o.net, 0) / os.length;
    if (puan !== null) pts.push({ label: fmtDate(e.tarih).slice(0, 5), value: round(puan, 1), valueLabel: fmtNum(puan, 1) });
    rows.push([e.isim + (ev.tpl ? ` (${ev.tpl.ad})` : ''), fmtDate(e.tarih), fmtNum(puan, 2), fmtNum(net, 2), scope.tip === 'ogrenci' ? `${os[0].rank.kurum.genel ?? '–'}/${ev.ogr.size}` : `${os.length} öğrenci`, fmtNum(ev.kurum.puanOrt, 2)]);
  }
  const all = statsBy(items, () => 'x').get('x');
  await doc.stats([
    { label: 'Sınav', value: String(rows.length) },
    { label: 'Cevaplanan soru', value: fmtNum(items.length, 0) },
    { label: 'Doğru oranı', value: pct(all.oran) },
    { label: 'Genel seviye', value: `${fmtNum(all.seviye, 2)} · ${seviyeToStr(all.seviye)}` },
  ]);
  if (pts.length > 1) { await doc.heading(scope.tip === 'ogrenci' ? 'Puan gidişatı' : 'Ortalama puan gidişatı'); await doc.lineChart(pts.slice(-12)); }
  await doc.heading('Sınavlar');
  await doc.table([{ label: 'Sınav', w: 62 }, { label: 'Tarih', w: 22 }, { label: scope.tip === 'ogrenci' ? 'Puan' : 'Ort. puan', w: 22, align: 'right' }, { label: scope.tip === 'ogrenci' ? 'Net' : 'Ort. net', w: 20, align: 'right' }, { label: scope.tip === 'ogrenci' ? 'Kurum sırası' : 'Katılım', w: 28, align: 'right' }, { label: 'Kurum ort.', w: 22, align: 'right' }], rows);
  // Dersler
  await doc.heading('Ders seviyeleri', '1 geliştirilmeli … 5 çok iyi');
  const seen = scope.tip === 'ogrenci' ? seenCounts(scope.deger) : {};
  const dg = [...statsBy(items, it => it.ders).values()].sort((a, b) => dersIndex(a.ders) - dersIndex(b.ders) || cmpTr(a.ders, b.ders));
  await doc.table([{ label: 'Ders', w: 56 }, { label: 'Soru', w: 16, align: 'right' }, { label: 'Doğru oranı', w: 26, align: 'right' }, { label: 'Seviye', w: 18, align: 'right' }, { label: 'Durum', w: 36 }, { label: scope.tip === 'ogrenci' ? 'Ödevde çözülen' : '', w: 34, align: 'right' }],
    dg.map(g => [g.ders, g.soru, pct(g.oran), fmtNum(g.seviye, 2), seviyeToStr(g.seviye), scope.tip === 'ogrenci' ? (seen[g.ders] || 0) : '']), { style: (ri, ci) => ci === 4 ? { fill: LVFILL(dg[ri].seviye) } : null });
  await doc.bars(dg.map(g => ({ label: g.ders, frac: g.oran, text: pct(g.oran) })));
  // Öncelikli konular
  const kg = [...statsBy(items, it => it.ders + '\u0000' + it.konu).values()];
  const pri = kg.filter(g => g.soru >= 2).sort((a, b) => a.oran - b.oran || a.seviye - b.seviye).slice(0, 8);
  if (pri.length) {
    await doc.heading('Öncelikli çalışılacak konular', 'en düşük doğru oranı');
    await doc.bars(pri.map(g => ({ label: `${g.konu} (${g.ders.slice(0, 3)})`, frac: g.oran, text: pct(g.oran), color: g.oran < 0.4 ? '#c42d2d' : g.oran < 0.6 ? '#d98a00' : '#c8264f' })));
  }
  await doc.heading('Konu analizi');
  const ks = kg.sort((a, b) => dersIndex(a.ders) - dersIndex(b.ders) || cmpTr(a.ders, b.ders) || a.oran - b.oran);
  await doc.table([{ label: 'Konu', w: 70 }, { label: 'Ders', w: 32 }, { label: 'Soru', w: 14, align: 'right' }, { label: 'D', w: 10, align: 'right' }, { label: 'Y', w: 10, align: 'right' }, { label: 'B', w: 10, align: 'right' }, { label: 'Doğru oranı', w: 22, align: 'right' }, { label: 'Seviye', w: 18, align: 'right' }],
    ks.map(g => [g.konu, g.ders, g.soru, g.D, g.Y, g.B, pct(g.oran), fmtNum(g.seviye, 2)]), { size: 8, rowH: 5.6, style: (ri, ci) => ci === 7 ? { fill: LVFILL(ks[ri].seviye) } : null });
  return await doc.finish();
}

/** Orijinal programla aynı başlıklı sıralı liste satırları */
export function siraliListeRows(exam, sube = null) {
  const ev = evaluateExam(exam);
  let list = [...ev.ogr.values()];
  if (sube !== null) list = list.filter(o => (o.sube || '') === sube);
  list.sort((a, b) => nn(b.puan) - nn(a.puan));
  const pts = ev.puanTurleri || [];
  const yks = ev.tpl && ev.tpl.id !== 'LGS';
  const head = ['Sıra', 'Numara', 'İsim', 'Şube', 'Net', 'Kurum neti', ev.netSiralama ? 'Sıralama (net)' : 'Puan', ev.netSiralama ? 'Kurum ortalaması (net)' : 'Kurum puanı', 'Şube sırası', 'Kurum sırası'];
  pts.forEach(pt => head.push(`${ptAd(pt)} puanı`, ...(yks ? [`Y-${ptAd(pt)}`] : []), `${ptAd(pt)} kurum sırası`));
  ev.dersler.forEach(d => head.push(`${d} Neti`, `${d} Kurum Neti`, `${d} Şube Neti`, `${d} Şube Sırası`, `${d} Kurum Sırası`));
  const rows = [head];
  list.forEach((o, i) => {
    const so = ev.subeOrt[o.sube || ''] || { dersNetOrt: {} };
    const r = [o.puan === null ? '' : i + 1, o.no, o.isim, o.sube, round(o.net, 2), round(ev.kurum.netOrt, 2), o.puan === null ? '' : round(o.puan, 3), ev.kurum.puanOrt === null ? '' : round(ev.kurum.puanOrt, 3), o.rank.sube.genel ?? '', o.rank.kurum.genel ?? ''];
    pts.forEach(pt => r.push(o.puanlar[pt] === null ? '' : round(o.puanlar[pt], 3), ...(yks ? [o.yPuanlar[pt] === null ? '' : round(o.yPuanlar[pt], 3)] : []), o.rank.pt.kurum[pt] ?? ''));
    ev.dersler.forEach(d => r.push(round(o.ders[d].Net, 2), round(ev.kurum.dersNetOrt[d], 2), round(so.dersNetOrt[d], 2), o.rank.sube[d], o.rank.kurum[d]));
    rows.push(r);
  });
  return rows;
}

export async function siraliListePdf(exam, sube = null) {
  const ev = evaluateExam(exam);
  let list = [...ev.ogr.values()];
  if (sube !== null) list = list.filter(o => (o.sube || '') === sube);
  list.sort((a, b) => nn(b.puan) - nn(a.puan));
  const pts = ev.puanTurleri || [];
  const doc = await new DocWriter({ title: sube !== null ? `Sıralı Liste · ${sube || 'Şubesiz'}` : 'Sıralı Liste · Kurum', subtitle: `${exam.isim} · ${fmtDate(exam.tarih)}` }).init();
  const pcols = pts.length ? pts : ev.netSiralama ? [] : ['_'];
  const dw = Math.max(8, Math.min(16, (doc.W - 80 - 14 - pcols.length * 15) / Math.max(1, ev.dersler.length)));
  await doc.table([{ label: 'Sıra', w: 10, align: 'right' }, { label: 'No', w: 14, align: 'right' }, { label: 'Ad soyad', w: 42 }, { label: 'Şube', w: 12 }, ...ev.dersler.map(d => ({ label: d.slice(0, 7), w: dw, align: 'right' })), { label: 'Net', w: 14, align: 'right' }, ...pcols.map(pt => ({ label: pt === '_' ? 'Puan' : ptAd(pt), w: 15, align: 'right' }))],
    list.map((o, i) => [o.puan === null ? '–' : (o.rank.kurum.genel ?? i + 1), o.no, o.isim, o.sube, ...ev.dersler.map(d => fmtNum(o.ders[d].Net, 2)), fmtNum(o.net, 2), ...pcols.map(pt => fmtNum(pt === '_' ? o.puan : o.puanlar[pt], 2))]), { size: 7.4, rowH: 5.4, style: (ri, ci) => ci >= 4 + ev.dersler.length + (pcols.length ? 1 : 0) ? { weight: 700 } : null });
  await doc.para(`Kurum ortalaması: puan ${fmtNum(ev.kurum.puanOrt, 2)}, net ${fmtNum(ev.kurum.netOrt, 2)} · ${ev.ogr.size} öğrenci`, { size: 8, color: '#555' });
  return await doc.finish();
}

export { sortDersler, sinifOf };
