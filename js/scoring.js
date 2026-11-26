// Puanlama, sıralama ve seviye hesapları (orijinal programın mantığı, hataları düzeltilmiş)
import { state, getStudent, sortDersler } from './db.js';
import { sablon, alanAd, soruGecerli, puanHesapla, yerlestirme, ALANLAR } from './sinavlar.js';
import { sinifOf, round } from './util.js';

export function puanlamaSnapshot() {
  const s = state.settings;
  return { taban: Number(s.taban) || 0, katsayilar: { ...s.katsayilar }, yanlisOrani: Number(s.yanlisOrani) || 0, cokluIsaret: s.cokluIsaret || 'yanlis' };
}

/** Orijinal seviye_hesapla: 1 (kötü) .. 5 (süper) */
export function seviyeHesapla(sorular) {
  sorular = sorular.filter(s => s.durum !== 'X');
  const o = { sumZorluk: 0, max: 0, min: 10, fullSum: 0, yanlisSum: 0 };
  if (!sorular.length) return 0;
  for (const s of sorular) {
    const z = Math.min(5, Math.max(1, parseInt(s.zorluk, 10) || 1));
    if (s.net <= 0) { o.sumZorluk += 6 - z; o.yanlisSum += z; }
    o.max = Math.max(z, o.max); o.min = Math.min(z, o.min); o.fullSum += z;
  }
  if (o.fullSum === o.yanlisSum) return 1;
  if (o.sumZorluk >= o.fullSum) return o.min;
  if (o.sumZorluk === 0) return o.max;
  return round(o.max - ((o.max - o.min) * (o.sumZorluk / o.fullSum)), 2);
}

export function seviyeToStr(s) {
  if (s >= 1 && s < 2) return 'Geliştirilmeli';
  if (s >= 2 && s < 3) return 'Orta';
  if (s >= 3 && s < 4) return 'İyi';
  if (s >= 4 && s <= 5) return 'Çok iyi';
  return '-';
}
export function seviyeClass(s) {
  if (s < 2) return 'lv1'; if (s < 3) return 'lv2'; if (s < 4) return 'lv3'; return 'lv4';
}

export function dogruOrani(d, y, b) { const t = d + y + b; return t ? d / t : 0; }

/** Doğru oranından soru zorluğu (1 kolay .. 5 zor) */
export function dogruOranindanZorluk(oran) {
  if (oran <= 0.2) return 5; if (oran <= 0.4) return 4; if (oran <= 0.6) return 3; if (oran <= 0.8) return 2; return 1;
}

const cache = new WeakMap();
export function invalidate(exam) { cache.delete(exam); }

function rankMap(entries) {
  // entries: [no, value]; yarışma sıralaması (eşitler aynı sırayı alır)
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const m = new Map();
  let prev = null, prevRank = 0;
  sorted.forEach(([no, v], i) => {
    if (prev === null || Math.abs(v - prev) > 1e-9) { prevRank = i + 1; prev = v; }
    m.set(no, prevRank);
  });
  return m;
}

export function evaluateExam(exam) {
  const tpl = sablon(exam.tur);
  const tytExam = tpl && tpl.tytGerekli && exam.tytExamId ? state.exams.get(exam.tytExamId) : null;
  const tytEv = tytExam && tytExam !== exam ? evaluateExam(tytExam) : null;
  const key = `${exam._v || 0}|${state.stuVer || 0}|${tytExam ? (tytExam._v || 0) + ':' + tytExam.id : '-'}`;
  const c = cache.get(exam);
  if (c && c.v === key) return c.r;
  const p = exam.puanlama || puanlamaSnapshot();
  const r = tpl ? tpl.yanlisOrani : p.yanlisOrani;
  const coklu = p.cokluIsaret || 'yanlis';
  const N = exam.sorular.length;
  // Gruplama: şablonlu sınavda puan alanı, serbest sınavda ders
  const kismi = !!(tpl && exam.kismi);
  const grupOf = s => (!tpl || !s.alan ? s.ders : kismi ? (s.secmeli ? 'Din Kültürü / Ek Felsefe' : (s.slotAd || alanAd(s.alan))) : alanAd(s.alan));
  const alanSay = {};
  exam.sorular.forEach(s => { if (s.alan && s.secmeli !== 'ekfel') alanSay[s.alan] = (alanSay[s.alan] || 0) + 1; });
  const alanTam = a => ALANLAR[a] && alanSay[a] === ALANLAR[a].n;
  const dersler = tpl ? [...new Set(exam.sorular.map(grupOf))] : sortDersler([...new Set(exam.sorular.map(s => s.ders))]);
  const examAlanlar = new Set(exam.sorular.filter(s => s.alan).map(s => s.alan));
  const soruIst = exam.sorular.map((s, i) => ({ i, ...s, D: 0, Y: 0, B: 0, oran: 0, dersNo: 0, etiket: '' }));
  const counters = {};
  soruIst.forEach(s => {
    const k = s.test || s.ders; counters[k] = (counters[k] || 0) + 1;
    s.dersNo = s.no || counters[k];
    s.etiket = `${s.testKisa || s.testAd || s.ders} ${s.dersNo}`;
  });
  const ogr = new Map();
  for (const [no, rec] of Object.entries(exam.sonuclar)) {
    const st = getStudent(no);
    const isim = (st && st.isim) || rec.isim || '';
    const sube = (st && st.sube) || rec.sube || '';
    const muaf = { din: !!(st && st.dinMuaf), dil: !!(st && st.dilMuaf) };
    const ans = (rec.cevaplar || '').padEnd(N, ' ');
    const items = [];
    const dstat = {};
    dersler.forEach(d => { dstat[d] = { D: 0, Y: 0, B: 0, Net: 0, soru: 0 }; });
    const alanNet = {};
    let puan = p.taban;
    for (let i = 0; i < N; i++) {
      const s = exam.sorular[i];
      const g = ans[i].toUpperCase();
      let net = 0, durum;
      let gecerli = soruGecerli(s, tpl, muaf);
      if (tpl && tpl.id === 'LGS' && ((muaf.din && s.alan === 'LGS_DIN') || (muaf.dil && s.alan === 'LGS_DIL'))) gecerli = false;
      if (!gecerli) durum = 'X';
      else if (g === ' ' || g === '' || (g === '*' && coklu === 'bos')) { durum = 'B'; net = 0; }
      else if (g === String(s.cevap || '').toUpperCase()) { durum = 'D'; net = 1; }
      else { durum = 'Y'; net = -r; }
      if (durum !== 'X') {
        const ds = dstat[grupOf(s)];
        ds.soru++; ds[durum]++; ds.Net += net;
        soruIst[i][durum]++;
        if (tpl && s.alan) { const an = alanNet[s.alan] || (alanNet[s.alan] = { net: 0, nGecerli: 0 }); an.net += net; an.nGecerli++; }
        if (!tpl) { const k = p.katsayilar[s.ders]; puan += net * (k === undefined || k === null || k === '' ? 1 : Number(k)); }
      }
      items.push({ i, grup: grupOf(s), ders: s.ders, konu: s.konu, zorluk: String(s.zorluk), cevap: g === ' ' ? '' : g, dogru: String(s.cevap || '').toUpperCase(), net, durum, qid: s.qid || null, ad: s.ad || '' });
    }
    let net = 0;
    for (const d of dersler) { dstat[d].Net = round(dstat[d].Net, 4); net += dstat[d].Net; }
    const o = { no, isim, sube, sinif: sinifOf(sube), items, ders: dstat, net: round(net, 4), puan: null, puanlar: {}, puanAciklama: {}, yPuanlar: {}, alanNet, muaf, rank: { kurum: {}, sube: {}, pt: { kurum: {}, sube: {} } } };
    if (tpl) {
      const tytO = tytEv ? tytEv.ogr.get(no) : null;
      const { puanlar, aciklama } = puanHesapla(tpl, alanNet, { tytAlanNet: tytO ? tytO.alanNet : null, tytTamam: !!(tytO && tytO.puanlar && tytO.puanlar.TYT !== null && tytO.puanlar.TYT !== undefined), muaf, examAlanlar, alanTam });
      for (const k of Object.keys(puanlar)) puanlar[k] = puanlar[k] === null ? null : round(puanlar[k], 5);
      o.puanlar = puanlar; o.puanAciklama = aciklama;
      if (tpl.id !== 'LGS') for (const [k, v] of Object.entries(puanlar)) o.yPuanlar[k] = yerlestirme(v, st && st.diploma, st && st.oncekiYerlesti);
    } else o.puan = round(puan, 4);
    ogr.set(no, o);
  }
  // Kısmi denemede hiç kimse için hesaplanamayan puan türleri gösterilmez; hiçbiri yoksa sıralama nete göre
  let pts = tpl ? tpl.puanTurleri.slice() : [];
  if (kismi) pts = pts.filter(pt => [...ogr.values()].some(o => o.puanlar[pt] !== null && o.puanlar[pt] !== undefined));
  const netSiralama = !!tpl && pts.length === 0;
  if (tpl) for (const o of ogr.values()) {
    if (netSiralama) { o.puan = o.net; continue; }
    const ana = exam.siralama && pts.includes(exam.siralama) ? exam.siralama : pts[0];
    o.puan = o.puanlar[ana];
  }
  soruIst.forEach(s => { s.oran = dogruOrani(s.D, s.Y, s.B); });

  // Sıralamalar (puanı hesaplanamayanlar sıralamaya girmez)
  const all = [...ogr.values()];
  const ranked = list => rankMap(list.filter(o => o.puan !== null).map(o => [o.no, o.puan]));
  const rk = ranked(all);
  all.forEach(o => { o.rank.kurum.genel = rk.get(o.no) ?? null; });
  for (const pt of pts) {
    const m = rankMap(all.filter(o => o.puanlar[pt] !== null && o.puanlar[pt] !== undefined).map(o => [o.no, o.puanlar[pt]]));
    all.forEach(o => { o.rank.pt.kurum[pt] = m.get(o.no) ?? null; });
  }
  for (const d of dersler) {
    const m = rankMap(all.map(o => [o.no, o.ders[d].Net]));
    all.forEach(o => { o.rank.kurum[d] = m.get(o.no); });
  }
  const bySube = new Map();
  all.forEach(o => { const k = o.sube || ''; if (!bySube.has(k)) bySube.set(k, []); bySube.get(k).push(o); });
  for (const [, list] of bySube) {
    const m = ranked(list);
    list.forEach(o => { o.rank.sube.genel = m.get(o.no) ?? null; });
    for (const pt of pts) {
      const mp = rankMap(list.filter(o => o.puanlar[pt] !== null && o.puanlar[pt] !== undefined).map(o => [o.no, o.puanlar[pt]]));
      list.forEach(o => { o.rank.pt.sube[pt] = mp.get(o.no) ?? null; });
    }
    for (const d of dersler) {
      const md = rankMap(list.map(o => [o.no, o.ders[d].Net]));
      list.forEach(o => { o.rank.sube[d] = md.get(o.no); });
    }
  }
  const avg = list => {
    const n = list.length || 1;
    const withP = list.filter(x => x.puan !== null);
    const o = { n: list.length, puanOrt: withP.length ? round(withP.reduce((a, x) => a + x.puan, 0) / withP.length, 4) : null, netOrt: round(list.reduce((a, x) => a + x.net, 0) / n, 4), dersNetOrt: {}, ptOrt: {} };
    for (const d of dersler) o.dersNetOrt[d] = round(list.reduce((a, x) => a + x.ders[d].Net, 0) / n, 4);
    for (const pt of pts) { const v = list.filter(x => x.puanlar[pt] !== null && x.puanlar[pt] !== undefined); o.ptOrt[pt] = v.length ? round(v.reduce((a, x) => a + x.puanlar[pt], 0) / v.length, 4) : null; }
    return o;
  };
  const kurum = avg(all);
  const subeOrt = {};
  for (const [k, list] of bySube) subeOrt[k] = avg(list);

  const res = { dersler, ogr, soruIst, kurum, subeOrt, N, tpl, puanTurleri: pts, tytExam, kismi, netSiralama };
  cache.set(exam, { v: key, r: res });
  return res;
}

export function touch(exam) { exam._v = (exam._v || 0) + 1; }

/**
 * Seçilen sınavlardaki cevap maddelerini topla.
 * scope: {tip:'ogrenci'|'sube'|'sinif'|'kurum', deger}
 */
export function collectItems(exams, scope) {
  const out = [];
  for (const e of exams) {
    const ev = evaluateExam(e);
    for (const o of ev.ogr.values()) {
      if (!inScope(o, scope)) continue;
      for (const it of o.items) if (it.durum !== 'X') out.push({ ...it, examId: e.id, no: o.no });
    }
  }
  return out;
}
export function inScope(o, scope) {
  if (!scope || scope.tip === 'kurum') return true;
  if (scope.tip === 'ogrenci') return o.no === scope.deger;
  if (scope.tip === 'sube') return (o.sube || '') === scope.deger;
  if (scope.tip === 'sinif') return sinifOf(o.sube) === scope.deger;
  return true;
}

/** Maddeleri anahtara göre grupla: D/Y/B, oran, seviye */
export function statsBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!m.has(k)) m.set(k, { key: k, items: [], D: 0, Y: 0, B: 0 });
    const g = m.get(k); g.items.push(it); g[it.durum]++;
  }
  for (const g of m.values()) {
    g.soru = g.items.length;
    g.oran = dogruOrani(g.D, g.Y, g.B);
    g.seviye = seviyeHesapla(g.items);
    g.ders = g.items[0].ders; g.konu = g.items[0].konu;
  }
  return m;
}

/** Bir öğrencinin tüm sınavlarına göre konu istatistikleri (otomatik ödev için) */
export function studentKonuStats(no, exams) {
  const items = collectItems(exams, { tip: 'ogrenci', deger: no });
  return statsBy(items, it => it.ders + '\u0000' + it.konu);
}
