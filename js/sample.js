// "Örnek verilerle dene": sentetik soru bankası, öğrenciler ve iki deneme sınavı
import { state, saveQuestions, saveStudents, saveExam, saveDoc } from './db.js';
import { uid, makeCanvas, canvasToBlob, LETTERS, todayISO } from './util.js';
import { puanlamaSnapshot } from './scoring.js';
import { formSpecFromQuestions } from './omr.js';
import { SABLONLAR, slotlar } from './sinavlar.js';

const BANK = {
  'Türkçe': ['Fiilimsiler', 'Cümlenin Ögeleri', 'Paragrafta Anlam', 'Yazım Kuralları'],
  'Matematik': ['Çarpanlar ve Katlar', 'Üslü İfadeler', 'Kareköklü İfadeler', 'Veri Analizi'],
  'Fen Bilimleri': ['Mevsimler ve İklim', 'DNA ve Genetik Kod', 'Basınç', 'Madde ve Endüstri'],
  'T.C. İnkılap Tarihi ve Atatürkçülük': ['Bir Kahraman Doğuyor', 'Millî Uyanış'],
  'Din Kültürü ve Ahlak Bilgisi': ['Kader İnancı', 'Zekât ve Sadaka'],
  'İngilizce': ['Friendship', 'Teen Life'],
};
const STEMS = [
  'Aşağıdakilerden hangisi verilen bilgiyle çelişir?', 'Buna göre aşağıdaki yargılardan hangisine ulaşılabilir?',
  'Yukarıdaki tabloya göre hangisi doğrudur?', 'Verilen ifadenin sonucu kaçtır?', 'Bu durumun temel nedeni aşağıdakilerden hangisidir?',
  'Altı çizili sözcüklerden hangisi farklı bir görevde kullanılmıştır?', 'Grafikteki değişim için hangisi söylenebilir?',
];
const NAMES = ['Ayşe Yılmaz', 'Mehmet Kaya', 'Zeynep Demir', 'Mustafa Çelik', 'Elif Şahin', 'Ahmet Yıldız', 'Fatma Öztürk', 'Emre Aydın', 'Merve Arslan', 'Burak Doğan', 'Esra Kılıç', 'Can Aslan', 'Selin Koç', 'Yusuf Kurt', 'Büşra Özdemir', 'Kerem Polat', 'Ece Şimşek', 'Ömer Erdoğan', 'Derya Güneş', 'Hakan Aksoy', 'İrem Bulut', 'Onur Çetin', 'Gizem Kara', 'Serkan Tekin'];

async function drawQuestion(ders, konu, z, idx, yatay, nOpt = 5) {
  const w = yatay ? 1500 : 760;
  const lines = [];
  const stem = STEMS[(idx + z) % STEMS.length];
  lines.push(`${konu} — örnek soru ${idx + 1} (zorluk ${z})`);
  for (let i = 0; i < (yatay ? 2 : 3 + (z % 2)); i++) lines.push(yatay ? 'Bu bir örnek soru metnidir. Kendi sorularınızı eklediğinizde yerini onlar alır.' : ['Bu bir örnek soru metnidir.', 'Kendi sorularınızı eklediğinizde', 'yerini onlar alır.', 'Örnek veriler tek tıkla silinir.'][i]);
  lines.push(stem);
  const h = 70 + lines.length * 34 + (yatay ? 60 : nOpt * 38) + 20;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#222'; ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText(lines[0], 16, 40);
  ctx.font = '400 22px Inter, Arial, sans-serif';
  lines.slice(1).forEach((l, i) => wrapText(ctx, l, 16, 80 + i * 34, w - 32));
  const top = 80 + (lines.length - 1) * 34 + 18;
  ctx.font = '500 22px Inter, Arial, sans-serif';
  const opts = ['Birinci seçenek', 'İkinci seçenek', 'Üçüncü seçenek', 'Dördüncü seçenek', 'Beşinci seçenek'];
  const LL = LETTERS.slice(0, nOpt);
  if (yatay) LL.forEach((L, i) => ctx.fillText(`${L}) ${opts[i].split(' ')[0]}`, 16 + i * (w - 32) / nOpt, top + 30));
  else LL.forEach((L, i) => ctx.fillText(`${L}) ${opts[i]}`, 26, top + 26 + i * 38));
  return { blob: await canvasToBlob(c, 'image/png'), w, h };
}
function wrapText(ctx, text, x, y, maxW) {
  let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += 26; } else line = t; }
  ctx.fillText(line, x, y);
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export async function loadSample(onProgress) {
  if (state.settings.kurumTuru === 'lise') return loadSampleLise(onProgress);
  const r = rng(42);
  const qs = [];
  const total = Object.values(BANK).reduce((a, k) => a + k.length * 5 * 2, 0);
  let n = 0;
  for (const [ders, konular] of Object.entries(BANK)) for (const konu of konular) for (let z = 1; z <= 5; z++) for (let i = 0; i < 2; i++) {
    const yatay = (i === 1 && z % 2 === 0);
    const { blob, w, h } = await drawQuestion(ders, konu, z, i, yatay, 4);
    const cevap = LETTERS[Math.floor(r() * 4)];
    qs.push({ id: uid('q'), ders, konu, zorluk: String(z), ad: `ornek_${konu.slice(0, 6)}_${z}_${i + 1}_${cevap.toLowerCase()}.png`, cevap, yatay, img: blob, w, h, created: Date.now(), kaynak: 'örnek', analiz: false, ornek: true });
    onProgress && onProgress(++n / total * 0.8, 'Örnek sorular çiziliyor');
  }
  await saveQuestions(qs);
  const subeler = ['8A', '8B', '8C'];
  const studs = NAMES.map((isim, i) => ({ no: String(101 + i), isim, sube: subeler[i % 3], gorulen: {}, ornek: true, dinMuaf: i === 9, _ab: 0.35 + r() * 0.55 }));
  // İki LGS denemesi (resmî düzen: 90 soru, 4 şık)
  const mkExam = (isim, tarih, seed) => {
    const rr = rng(seed); const used = new Set(); const picked = []; const cnt = {};
    for (const sl of slotlar(SABLONLAR.LGS)) {
      const pool = qs.filter(q => sl.dersler.includes(q.ders) && !used.has(q.id)).sort(() => rr() - 0.5).slice(0, sl.n);
      pool.forEach(q => { used.add(q.id); cnt[sl.test] = (cnt[sl.test] || 0) + 1; picked.push({ qid: q.id, ders: q.ders, konu: q.konu, zorluk: q.zorluk, cevap: q.cevap, ad: q.ad, alan: sl.alan, test: sl.test, testAd: sl.testAd, testKisa: '', slot: sl.id, no: cnt[sl.test] }); });
    }
    const sonuclar = {};
    for (const s of studs) {
      let ans = '';
      for (const q of picked) {
        const p = s._ab * (1.25 - Number(q.zorluk) * 0.12);
        const t = rr();
        if (t < p) ans += q.cevap;
        else if (t < p + 0.12) ans += ' ';
        else ans += LETTERS.slice(0, 4).filter(L => L !== q.cevap)[Math.floor(rr() * 3)];
      }
      sonuclar[s.no] = { isim: s.isim, sube: s.sube, cevaplar: ans };
    }
    return { id: uid('e'), tur: 'LGS', isim, tarih, secenek: 4, sorular: picked, sonuclar, puanlama: puanlamaSnapshot(), kaynak: 'örnek', created: Date.now(), ornek: true };
  };
  const d = new Date(); const iso = off => { const x = new Date(d.getTime() - off * 86400000); return x.toISOString().slice(0, 10); };
  const e1 = mkExam('Örnek LGS Denemesi 1', iso(28), 7);
  const e2 = mkExam('Örnek LGS Denemesi 2', iso(7), 9);
  studs.forEach(s => { delete s._ab; });
  await saveStudents(studs);
  await saveExam(e1); await saveExam(e2);
  for (const e of [e1, e2]) {
    await saveDoc({ id: uid('d'), tur: 'deneme', sablon: 'LGS', isim: e.isim, tarih: e.tarih, sorular: e.sorular, form: formSpecFromQuestions(e.isim, e.sorular, 4, state.settings.noHane), ogrenciler: [], created: Date.now(), ornek: true });
  }
  onProgress && onProgress(1, 'Tamamlandı');
  return { soru: qs.length, ogrenci: studs.length, sinav: 2 };
}

const LISE_BANK = {
  'Türkçe': [['Sözcükte Anlam', 3], ['Cümlede Anlam', 3], ['Paragraf', 3], ['Dil Bilgisi', 3]],
  'Tarih': [['İlk Türk Devletleri', 1], ['Osmanlı Kuruluş', 1]],
  'Coğrafya': [['Harita Bilgisi', 1], ['İklim', 1]],
  'Felsefe': [['Bilgi Felsefesi', 2], ['Ahlak Felsefesi', 2]],
  'Din Kültürü ve Ahlak Bilgisi': [['İnanç', 1], ['İbadet', 1]],
  'Matematik': [['Temel Kavramlar', 2], ['Sayı Basamakları', 2], ['Problemler', 2], ['Fonksiyonlar', 2]],
  'Geometri': [['Üçgenler', 1], ['Çember', 1]],
  'Fizik': [['Kuvvet ve Hareket', 1], ['Elektrik', 1]],
  'Kimya': [['Atom', 1], ['Mol', 1]],
  'Biyoloji': [['Hücre', 1], ['Kalıtım', 1]],
};
const LISE_NAMES = ['Zeynep Aksoy', 'Arda Yıldırım', 'Elif Kaplan', 'Mert Özkan', 'Defne Kılıç', 'Emir Şahin', 'Ecrin Aydın', 'Kaan Demir', 'Nehir Çelik', 'Yiğit Arslan', 'Azra Doğan', 'Berk Koç', 'Duru Kurt', 'Efe Polat', 'Ela Güneş', 'Alp Erdem', 'Lina Bulut', 'Kerem Tunç', 'Asya Yalçın', 'Deniz Avcı', 'Meryem Uçar', 'Ozan Keskin', 'İpek Sarı', 'Batu Ateş'];

async function loadSampleLise(onProgress) {
  const r = rng(77);
  const qs = [];
  const total = Object.values(LISE_BANK).reduce((a, k) => a + k.reduce((x, [, c]) => x + c * 5, 0), 0);
  let n = 0;
  for (const [ders, konular] of Object.entries(LISE_BANK)) for (const [konu, per] of konular) for (let z = 1; z <= 5; z++) for (let i = 0; i < per; i++) {
    const yatay = ders === 'Türkçe' && i === 2 && z % 2 === 1;
    const { blob, w, h } = await drawQuestion(ders, konu, z, i, yatay);
    const cevap = LETTERS[Math.floor(r() * 5)];
    qs.push({ id: uid('q'), ders, konu, zorluk: String(z), ad: `ornek_${konu.slice(0, 6)}_${z}_${i + 1}_${cevap.toLowerCase()}.png`, cevap, yatay, img: blob, w, h, created: Date.now(), kaynak: 'örnek', analiz: false, ornek: true });
    onProgress && onProgress(++n / total * 0.8, 'Örnek sorular çiziliyor');
  }
  await saveQuestions(qs);
  const subeler = ['12A', '12B', '12C'];
  const studs = LISE_NAMES.map((isim, i) => ({ no: String(1201 + i), isim, sube: subeler[i % 3], gorulen: {}, ornek: true, dinMuaf: i % 11 === 5, diploma: Math.round((72 + r() * 27) * 100) / 100, _ab: 0.3 + r() * 0.6 }));
  // TYT anahtarı: bankadan şablon sırasıyla
  const T = SABLONLAR.TYT;
  const tytKey = (seed) => {
    const rr = rng(seed); const used = new Set(); const key = []; const cnt = {};
    for (const s of slotlar(T)) {
      const pool = qs.filter(q => s.dersler.includes(q.ders) && !used.has(q.id)).sort(() => rr() - 0.5).slice(0, s.n);
      pool.forEach(q => { used.add(q.id); cnt[s.test] = (cnt[s.test] || 0) + 1; key.push({ qid: q.id, ders: q.ders, konu: q.konu, zorluk: q.zorluk, cevap: q.cevap, ad: q.ad, alan: s.alan, test: s.test, testAd: s.testAd, testKisa: '', slot: s.id, no: cnt[s.test], ...(s.secmeli ? { secmeli: s.secmeli } : {}) }); });
    }
    return key;
  };
  const aytKey = () => {
    const A = SABLONLAR.AYT; const key = []; const cnt = {}; const rr = rng(5);
    for (const s of slotlar(A)) if (s.test === 'MAT' || s.test === 'FEN') for (let i = 0; i < s.n; i++) { cnt[s.test] = (cnt[s.test] || 0) + 1; key.push({ qid: null, ders: s.dersler[0], konu: s.ad, zorluk: String(1 + Math.floor(rr() * 5)), cevap: LETTERS[Math.floor(rr() * 5)], ad: '', alan: s.alan, test: s.test, testAd: s.testAd, testKisa: '', slot: s.id, no: cnt[s.test] }); }
    return key;
  };
  const simulate = (key, seed, ab = 1) => {
    const rr = rng(seed); const out = {};
    for (const s of studs) {
      let a = '';
      for (const q of key) {
        if ((q.secmeli === 'din' && s.dinMuaf) || (q.secmeli === 'ekfel' && !s.dinMuaf)) { a += ' '; continue; }
        const p = s._ab * ab * (1.3 - Number(q.zorluk) * 0.13); const t = rr();
        a += t < p ? q.cevap : t < p + 0.15 ? ' ' : LETTERS.filter(L => L !== q.cevap)[Math.floor(rr() * 4)];
      }
      out[s.no] = { isim: s.isim, sube: s.sube, cevaplar: a };
    }
    return out;
  };
  const iso = off => new Date(Date.now() - off * 86400000).toISOString().slice(0, 10);
  const k1 = tytKey(11), k2 = tytKey(12), k3 = aytKey();
  const e1 = { id: uid('e'), tur: 'TYT', isim: 'Örnek TYT Denemesi 1', tarih: iso(30), secenek: 5, sorular: k1, sonuclar: simulate(k1, 21), puanlama: puanlamaSnapshot(), kaynak: 'örnek', created: Date.now(), ornek: true };
  const e2 = { id: uid('e'), tur: 'TYT', isim: 'Örnek TYT Denemesi 2', tarih: iso(9), secenek: 5, sorular: k2, sonuclar: simulate(k2, 22), puanlama: puanlamaSnapshot(), kaynak: 'örnek', created: Date.now(), ornek: true };
  const e3 = { id: uid('e'), tur: 'AYT', tytExamId: e2.id, isim: 'Örnek AYT Denemesi (Sayısal)', tarih: iso(8), secenek: 5, sorular: k3, sonuclar: simulate(k3, 23, 0.8), puanlama: puanlamaSnapshot(), kaynak: 'örnek', created: Date.now(), ornek: true };
  studs.forEach(s => { delete s._ab; });
  await saveStudents(studs);
  for (const e of [e1, e2, e3]) await saveExam(e);
  for (const e of [e1, e2]) await saveDoc({ id: uid('d'), tur: 'deneme', sablon: 'TYT', isim: e.isim, tarih: e.tarih, sorular: e.sorular, form: formSpecFromQuestions(e.isim, e.sorular, 5, state.settings.noHane), ogrenciler: [], created: Date.now(), ornek: true });
  onProgress && onProgress(1, 'Tamamlandı');
  return { soru: qs.length, ogrenci: studs.length, sinav: 3 };
}

export function numberByDers(list) {
  const c = {};
  return list.map(s => { c[s.ders] = (c[s.ders] || 0) + 1; return { ...s, no: c[s.ders] }; });
}

export { todayISO };
