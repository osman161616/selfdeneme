// Merkezî sınav şablonları ve puan hesabı
// Kaynaklar: ÖSYM 2026-YKS Kılavuzu (Tablo 1A, 1B, 1C, 1D, 1E; OBP 0,12; iptal sorular 3.10.1)
//            MEB 2026 LGS Başvuru ve Uygulama Kılavuzu (ağırlık katsayıları, muafiyet, iptal)
// Gerçek puanlar ülke geneli ortalama ve standart sapmayla standartlaştırılır; burada resmî
// ağırlıklarla ham netten TAHMİNİ puan hesaplanır: 100 + 400 × Σ ağırlık × (net / soru sayısı).

const DIN = 'Din Kültürü ve Ahlak Bilgisi';
const DILLER = ['İngilizce', 'Almanca', 'Arapça', 'Fransızca', 'Rusça', 'Yabancı Dil'];
const FEL_GRUBU = ['Felsefe', 'Psikoloji', 'Sosyoloji', 'Mantık'];

export const LISE_DERSLER = ['Türkçe', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya', 'Felsefe', 'Psikoloji', 'Sosyoloji', 'Mantık', DIN, 'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji', 'İngilizce'];
export const ORTAOKUL_DERSLER = ['Türkçe', 'T.C. İnkılap Tarihi ve Atatürkçülük', DIN, 'İngilizce', 'Sosyal Bilgiler', 'Matematik', 'Fen Bilimleri'];

/** Alan = puan hesabındaki en küçük birim (resmî soru sayısıyla) */
export const ALANLAR = {
  LGS_TUR: { ad: 'Türkçe', n: 20 }, LGS_INK: { ad: 'İnkılap Tarihi', n: 10 }, LGS_DIN: { ad: 'Din Kültürü', n: 10 }, LGS_DIL: { ad: 'Yabancı Dil', n: 10 },
  LGS_MAT: { ad: 'Matematik', n: 20 }, LGS_FEN: { ad: 'Fen Bilimleri', n: 20 },
  TYT_TUR: { ad: 'Türkçe', n: 40 }, TYT_SOS: { ad: 'Sosyal Bilimler', n: 20 }, TYT_MAT: { ad: 'Temel Matematik', n: 40 }, TYT_FEN: { ad: 'Fen Bilimleri', n: 20 },
  AYT_EDB: { ad: 'Edebiyat', n: 24 }, AYT_TAR1: { ad: 'Tarih-1', n: 10 }, AYT_COG1: { ad: 'Coğrafya-1', n: 6 },
  AYT_TAR2: { ad: 'Tarih-2', n: 11 }, AYT_COG2: { ad: 'Coğrafya-2', n: 11 }, AYT_FEL: { ad: 'Felsefe Grubu', n: 12 }, AYT_DIN: { ad: 'Din Kült. / Ek Felsefe', n: 6 },
  AYT_MAT: { ad: 'Matematik', n: 40 }, AYT_FIZ: { ad: 'Fizik', n: 14 }, AYT_KIM: { ad: 'Kimya', n: 13 }, AYT_BIY: { ad: 'Biyoloji', n: 13 },
  YDT: { ad: 'Yabancı Dil', n: 80 },
};

const slot = (id, ad, dersler, n, alan, extra = {}) => ({ id, ad, dersler, n, alan, ...extra });

export const SABLONLAR = {
  LGS: {
    id: 'LGS', ad: 'LGS', uzun: 'LGS · Liselere Geçiş Sistemi merkezî sınavı', seviye: 'ortaokul', secenek: 4, yanlisOrani: 1 / 3, puanTurleri: ['LGS'],
    testler: [
      { id: 'TUR', ad: 'Türkçe', oturum: 'Sözel', slots: [slot('TUR', 'Türkçe', ['Türkçe'], 20, 'LGS_TUR')] },
      { id: 'INK', ad: 'T.C. İnkılap Tarihi ve Atatürkçülük', oturum: 'Sözel', slots: [slot('INK', 'T.C. İnkılap Tarihi ve Atatürkçülük', ['T.C. İnkılap Tarihi ve Atatürkçülük'], 10, 'LGS_INK')] },
      { id: 'DIN', ad: DIN, oturum: 'Sözel', slots: [slot('DIN', DIN, [DIN], 10, 'LGS_DIN', { muafiyet: 'din' })] },
      { id: 'DIL', ad: 'Yabancı Dil', oturum: 'Sözel', slots: [slot('DIL', 'Yabancı Dil', DILLER, 10, 'LGS_DIL', { muafiyet: 'dil' })] },
      { id: 'MAT', ad: 'Matematik', oturum: 'Sayısal', slots: [slot('MAT', 'Matematik', ['Matematik'], 20, 'LGS_MAT')] },
      { id: 'FEN', ad: 'Fen Bilimleri', oturum: 'Sayısal', slots: [slot('FEN', 'Fen Bilimleri', ['Fen Bilimleri'], 20, 'LGS_FEN')] },
    ],
  },
  TYT: {
    id: 'TYT', ad: 'TYT', uzun: 'TYT · Temel Yeterlilik Testi', seviye: 'lise', secenek: 5, yanlisOrani: 1 / 4, puanTurleri: ['TYT'],
    testler: [
      { id: 'TUR', ad: 'Türkçe', slots: [slot('TUR', 'Türkçe', ['Türkçe'], 40, 'TYT_TUR')] },
      {
        id: 'SOS', ad: 'Sosyal Bilimler', slots: [
          slot('TAR', 'Tarih', ['Tarih'], 5, 'TYT_SOS'), slot('COG', 'Coğrafya', ['Coğrafya'], 5, 'TYT_SOS'), slot('FEL', 'Felsefe', ['Felsefe'], 5, 'TYT_SOS'),
          slot('DIN', DIN, [DIN], 5, 'TYT_SOS', { secmeli: 'din' }), slot('EKF', 'Felsefe (Din Kültürü yerine)', ['Felsefe'], 5, 'TYT_SOS', { secmeli: 'ekfel' }),
        ],
      },
      { id: 'MAT', ad: 'Temel Matematik', slots: [slot('MAT', 'Temel Matematik', ['Matematik', 'Geometri'], 40, 'TYT_MAT')] },
      { id: 'FEN', ad: 'Fen Bilimleri', slots: [slot('FIZ', 'Fizik', ['Fizik'], 7, 'TYT_FEN'), slot('KIM', 'Kimya', ['Kimya'], 7, 'TYT_FEN'), slot('BIY', 'Biyoloji', ['Biyoloji'], 6, 'TYT_FEN')] },
    ],
  },
  AYT: {
    id: 'AYT', ad: 'AYT', uzun: 'AYT · Alan Yeterlilik Testleri', seviye: 'lise', secenek: 5, yanlisOrani: 1 / 4, puanTurleri: ['SAY', 'EA', 'SOZ'], tytGerekli: true, testSecilebilir: true,
    testler: [
      { id: 'TDE', ad: 'Türk Dili ve Edebiyatı-Sosyal Bilimler-1', kisa: 'TDE-Sosyal-1', slots: [slot('EDB', 'Türk Dili ve Edebiyatı', ['Türk Dili ve Edebiyatı'], 24, 'AYT_EDB'), slot('TAR1', 'Tarih-1', ['Tarih'], 10, 'AYT_TAR1'), slot('COG1', 'Coğrafya-1', ['Coğrafya'], 6, 'AYT_COG1')] },
      {
        id: 'SB2', ad: 'Sosyal Bilimler-2', kisa: 'Sosyal-2', slots: [
          slot('TAR2', 'Tarih-2', ['Tarih'], 11, 'AYT_TAR2'), slot('COG2', 'Coğrafya-2', ['Coğrafya'], 11, 'AYT_COG2'), slot('FEL', 'Felsefe Grubu', FEL_GRUBU, 12, 'AYT_FEL'),
          slot('DIN', DIN, [DIN], 6, 'AYT_DIN', { secmeli: 'din' }), slot('EKF', 'Felsefe Grubu (Din Kültürü yerine)', FEL_GRUBU, 6, 'AYT_DIN', { secmeli: 'ekfel' }),
        ],
      },
      { id: 'MAT', ad: 'Matematik', slots: [slot('MAT', 'Matematik', ['Matematik', 'Geometri'], 40, 'AYT_MAT')] },
      { id: 'FEN', ad: 'Fen Bilimleri', slots: [slot('FIZ', 'Fizik', ['Fizik'], 14, 'AYT_FIZ'), slot('KIM', 'Kimya', ['Kimya'], 13, 'AYT_KIM'), slot('BIY', 'Biyoloji', ['Biyoloji'], 13, 'AYT_BIY')] },
    ],
  },
  YDT: {
    id: 'YDT', ad: 'YDT', uzun: 'YDT · Yabancı Dil Testi', seviye: 'lise', secenek: 5, yanlisOrani: 1 / 4, puanTurleri: ['DIL'], tytGerekli: true,
    testler: [{ id: 'YDT', ad: 'Yabancı Dil Testi', slots: [slot('YDT', 'Yabancı Dil', DILLER, 80, 'YDT')] }],
  },
};

const TYT_W = { TYT_TUR: 0.33, TYT_SOS: 0.17, TYT_MAT: 0.33, TYT_FEN: 0.17 }; // Tablo 1C
const tyt40 = () => Object.fromEntries(Object.entries(TYT_W).map(([k, v]) => [k, v * 0.4]));

/** Puan türleri. w: ağırlık (toplam 1); sart: "testlerin en az birinden 0,5 ham puan" grupları (Tablo 1D) */
export const PUAN_TURLERI = {
  TYT: { ad: 'TYT', w: TYT_W, sart: [['TYT_TUR'], ['TYT_MAT']] },
  SAY: { ad: 'SAY', uzun: 'Sayısal', w: { ...tyt40(), AYT_MAT: 0.30, AYT_FIZ: 0.10, AYT_KIM: 0.10, AYT_BIY: 0.10 }, sart: [['AYT_MAT'], ['AYT_FIZ', 'AYT_KIM', 'AYT_BIY']], tyt: true },
  EA: { ad: 'EA', uzun: 'Eşit Ağırlık', w: { ...tyt40(), AYT_MAT: 0.30, AYT_EDB: 0.18, AYT_TAR1: 0.07, AYT_COG1: 0.05 }, sart: [['AYT_MAT'], ['AYT_EDB', 'AYT_TAR1', 'AYT_COG1']], tyt: true },
  SOZ: { ad: 'SÖZ', uzun: 'Sözel', w: { ...tyt40(), AYT_EDB: 0.18, AYT_TAR1: 0.07, AYT_COG1: 0.05, AYT_TAR2: 0.08, AYT_COG2: 0.08, AYT_FEL: 0.09, AYT_DIN: 0.05 }, sart: [['AYT_EDB', 'AYT_TAR1', 'AYT_COG1'], ['AYT_TAR2', 'AYT_COG2', 'AYT_FEL', 'AYT_DIN']], tyt: true },
  DIL: { ad: 'DİL', uzun: 'Yabancı Dil', w: { ...tyt40(), YDT: 0.60 }, sart: [['YDT']], tyt: true },
  LGS: { ad: 'LGS', uzun: 'LGS Merkezî Sınav Puanı', k: { LGS_TUR: 4, LGS_MAT: 4, LGS_FEN: 4, LGS_INK: 1, LGS_DIN: 1, LGS_DIL: 1 } },
};
export const OBP_KATSAYI = 0.12, OBP_KATSAYI_ONCEKI = 0.06;

/** Bir puan türünde bir netin değeri (resmî soru sayısıyla) — bilgi tablosu için */
export function katsayi(pt, alan) {
  const P = PUAN_TURLERI[pt];
  if (P.k) { const tot = Object.entries(P.k).reduce((a, [k, v]) => a + v * ALANLAR[k].n, 0); return 400 * P.k[alan] / tot; }
  return P.w[alan] ? 400 * P.w[alan] / ALANLAR[alan].n : 0;
}

export function sablon(id) { return id ? SABLONLAR[id] || null : null; }
export function slotlar(t) { return t.testler.flatMap(test => test.slots.map(s => ({ ...s, test: test.id, testAd: test.ad, oturum: test.oturum }))); }
export function alanAd(a) { return ALANLAR[a] ? ALANLAR[a].ad : a; }
export function sablonlarFor(seviye) {
  return Object.values(SABLONLAR).filter(t => seviye === 'karma' || t.seviye === seviye);
}

/** Öğrenci için bir sorunun değerlendirmeye girip girmediği */
export function soruGecerli(s, tpl, muaf) {
  if (s.iptal) return false;
  if (!tpl) return true;
  if (s.secmeli === 'din') return !muaf.din;
  if (s.secmeli === 'ekfel') return !!muaf.din;
  return true;
}

/**
 * Puanları hesapla.
 * alanNet: {alan: {net, nGecerli}}  (bu sınav)
 * tytAlanNet: eşleştirilmiş TYT sınavından aynı yapı (AYT/YDT için)
 * Döndürür {puanlar: {pt: number|null}, aciklama: {pt: string}}
 */
export function puanHesapla(tpl, alanNet, { tytAlanNet = null, tytTamam = true, muaf = {}, examAlanlar = new Set(), alanTam = null } = {}) {
  const tam = alanTam || (a => examAlanlar.has(a));
  const puanlar = {}, aciklama = {};
  const pay = (a, src) => { const x = src[a]; return x && x.nGecerli > 0 ? x.net / x.nGecerli : 0; };
  const net = (a, src) => (src[a] ? src[a].net : 0);
  const sartOk = (P, src) => P.sart.some(g => g.reduce((s, a) => s + net(a, src), 0) >= 0.5);
  for (const pt of tpl.puanTurleri) {
    const P = PUAN_TURLERI[pt];
    const gerekli = P.k ? Object.keys(P.k) : pt === 'TYT' ? Object.keys(P.w) : Object.keys(P.w).filter(a => !a.startsWith('TYT_'));
    if (gerekli.some(a => !tam(a))) { puanlar[pt] = null; aciklama[pt] = 'Bu denemede puan için gereken testler resmî sayıda değil'; continue; }
    if (P.k) {
      // LGS: muaf olunan testin payı diğer testlerin başarısıyla orantılanır
      const W = Object.fromEntries(Object.entries(P.k).map(([a, k]) => [a, k * ALANLAR[a].n]));
      const tot = Object.values(W).reduce((x, y) => x + y, 0);
      const muafAlan = new Set([muaf.din ? 'LGS_DIN' : null, muaf.dil ? 'LGS_DIL' : null].filter(Boolean));
      let s = 0, sDiger = 0, wDiger = 0;
      for (const [a, w] of Object.entries(W)) { if (muafAlan.has(a)) continue; const v = w * pay(a, alanNet); s += v; sDiger += v; wDiger += w; }
      for (const a of muafAlan) s += W[a] * (wDiger ? sDiger / wDiger : 0);
      puanlar[pt] = 100 + 400 * s / tot;
      continue;
    }
    let tytSrc = null;
    if (pt === 'TYT') tytSrc = alanNet;
    else if (P.tyt) {
      if (!tytAlanNet) { puanlar[pt] = null; aciklama[pt] = 'TYT sonucu eşleşmedi'; continue; }
      if (!tytTamam) { puanlar[pt] = null; aciklama[pt] = 'Eşleştirilen TYT denemesinden TYT puanı hesaplanamıyor'; continue; }
      tytSrc = tytAlanNet;
    }
    if (tytSrc && !sartOk(PUAN_TURLERI.TYT, tytSrc)) { puanlar[pt] = null; aciklama[pt] = 'TYT Türkçe ya da Temel Matematikten en az 0,5 net gerekir'; continue; }
    if (pt !== 'TYT' && !sartOk(P, alanNet)) { puanlar[pt] = null; aciklama[pt] = 'İlgili testlerden en az 0,5 net gerekir'; continue; }
    let s = 0;
    for (const [a, w] of Object.entries(P.w)) s += w * pay(a, a.startsWith('TYT_') ? tytSrc : alanNet);
    puanlar[pt] = 100 + 400 * s;
  }
  return { puanlar, aciklama };
}

/** Yerleştirme puanı: ham puan + OBP × 0,12 (OBP = diploma notu × 5) */
export function yerlestirme(ham, diploma, onceki = false) {
  if (ham === null || ham === undefined) return null;
  const d = Number(diploma);
  if (!d || d < 50 || d > 100) return null;
  return ham + d * 5 * (onceki ? OBP_KATSAYI_ONCEKI : OBP_KATSAYI);
}

export const PT_SIRA = ['LGS', 'TYT', 'SAY', 'EA', 'SOZ', 'DIL'];
