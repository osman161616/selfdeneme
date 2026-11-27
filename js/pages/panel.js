import { state, examsSorted, hasSample, removeSample, saveSettings, derslerFor } from '../db.js';
import { esc, fmtDate, fmtNum, $ } from '../util.js';
import { evaluateExam } from '../scoring.js';
import { progress, toast, guard, confirmDlg } from '../ui.js';
import { refresh, go } from '../app.js';

function sheetPicture() {
  const rows = [[0, 2, 1, 3], [1, 0, 4, 2], [3, 1, 0, 2], [2, 4, 1, 0], [4, 2, 3, 1]];
  let d = 0;
  const col = (title, start) => `<div><div class="h">${title}</div>${rows.map((r, i) => `<div class="r"><em>${start + i}</em>${[0, 1, 2, 3, 4].map(o => `<i class="${o === r[start % 4] ? 'f' : ''}" style="--d:${d++}"></i>`).join('')}</div>`).join('')}</div>`;
  return `<div class="sheet" aria-hidden="true">
    <span class="fid" style="left:-1px;top:-1px"></span><span class="fid" style="right:-1px;top:-1px"></span>
    <div style="font:700 9px Inter,sans-serif;color:#c8264f;margin:0 0 2px 24px;letter-spacing:.04em">OPTİK CEVAP FORMU</div>
    <div style="font:800 17px Archivo,sans-serif;color:#111;margin-left:24px">8. Sınıf Deneme 3</div>
    <div class="cols">${col('TÜRKÇE', 1)}${col('MATEMATİK', 1 + 1)}</div>
    <span class="fid" style="left:-1px;bottom:-1px"></span><span class="fid" style="right:-1px;bottom:-1px"></span>
  </div>`;
}

export async function render(host) {
  const nQ = state.questions.size, nS = state.students.size, nE = state.exams.size, nD = state.docs.size;
  const empty = nQ === 0 && nS === 0 && nE === 0;
  const steps = [
    { done: !!state.settings.kurum, t: 'Kurum bilgilerini girin', d: 'Belgelerin üstünde kurum adınız ve logonuz yer alsın.', href: '#ayarlar', b: 'Ayarlar' },
    { done: nQ > 0, t: 'Soru bankanızı oluşturun', d: 'Soruları PDF ya da görselden kırpın, toplu yükleyin veya eski programın klasörünü aktarın.', href: '#kirp', b: 'Soru kırp' },
    { done: nS > 0, t: 'Öğrencilerinizi ekleyin', d: 'Listeyi Excel\'den yapıştırabilirsiniz; numara, ad soyad ve şube yeterli.', href: '#ogrenciler', b: 'Öğrenciler' },
    { done: nD > 0, t: 'İlk ödev ya da denemeyi hazırlayın', d: 'Program öğrencinin daha önce görmediği soruları seçer, PDF ve cevap anahtarını üretir.', href: '#hazirla', b: 'Hazırla' },
    { done: nE > 0, t: 'Optik formları okutun', d: 'Formları fotokopi makinesinde PDF olarak tarayın ya da telefonla fotoğraflayın.', href: '#sinavlar', b: 'Sınavlar' },
    { done: state.settings.sonYedek > 0, t: 'Yedek alın', d: 'Verileriniz bu tarayıcıda durur. Düzenli yedek, bilgisayar değişse de işinizi korur.', href: '#ayarlar', b: 'Yedekle' },
  ];
  const doneCount = steps.filter(s => s.done).length;
  const exams = examsSorted().reverse().slice(0, 5);
  const backupAge = state.settings.sonYedek ? Math.floor((Date.now() - state.settings.sonYedek) / 86400000) : null;

  const turSec = !state.settings.kurumTuru ? `<section class="card" style="margin-bottom:18px;border-left:4px solid var(--brand)"><div class="row between gap"><div><h3 style="margin:0 0 4px">Kurumunuz hangi sınava hazırlanıyor?</h3><p class="small muted" style="margin:0">Ders listesi ve deneme şablonları buna göre ayarlanır. Sonradan Ayarlar'dan değiştirebilirsiniz.</p></div>
    <div class="seg" id="p-tur"><button data-k="ortaokul">Ortaokul · LGS</button><button data-k="lise">Lise · YKS</button><button data-k="karma">İkisi de</button></div></div></section>` : '';
  host.innerHTML = `${turSec}
  ${empty ? `
  <section class="hero">
    <div>
      <h1>Kendi soru bankanızdan <span>ödev ve deneme</span> hazırlayın.</h1>
      <p>LGS, TYT, AYT ve YDT düzeninde denemeler; öğrenciye daha önce görmediği sorular; fotokopi makinesi ya da telefonla optik okuma; konu konu seviye analizi. Kurulum yok, üyelik yok; tüm veriler kendi bilgisayarınızda kalır.</p>
      <div class="row gap" style="margin-top:18px">
        <a class="btn primary" href="#rehber">Rehberle başla</a>
        <button class="btn" id="btn-sample">Örnek verilerle dene</button>
      </div>
      <p class="small muted" style="margin-top:12px">Örnek veriler istediğiniz zaman tek tıkla silinir.</p>
    </div>
    <div>${sheetPicture()}</div>
  </section>` : `
  <div class="page-head"><div><h1>Panel</h1><p>${esc(state.settings.kurum || 'Hoş geldiniz')} · ${fmtDate(new Date().toISOString().slice(0, 10))}</p></div>
    <div class="row gap"><a class="btn" href="#hazirla">Ödev / deneme hazırla</a><a class="btn primary" href="#sinavlar">Optik oku</a></div></div>
  <div class="grid g4">
    <div class="stat brand"><div class="v">${fmtNum(nQ, 0)}</div><div class="l">soru bankada</div></div>
    <div class="stat"><div class="v">${fmtNum(nS, 0)}</div><div class="l">öğrenci</div></div>
    <div class="stat"><div class="v">${fmtNum(nE, 0)}</div><div class="l">değerlendirilmiş sınav</div></div>
    <div class="stat"><div class="v">${fmtNum(nD, 0)}</div><div class="l">hazırlanan belge</div></div>
  </div>`}
  ${!empty && backupAge !== null && backupAge >= 7 ? `<div class="banner" style="margin-top:16px"><span>Son yedeğin üzerinden <b>${backupAge} gün</b> geçti. Verileriniz yalnızca bu tarayıcıda duruyor.</span><a class="btn sm" href="#ayarlar">Şimdi yedekle</a></div>` : ''}
  ${!empty && backupAge === null && nQ > 20 ? `<div class="banner" style="margin-top:16px"><span>Henüz hiç yedek almadınız. Tarayıcı verileri silinirse soru bankanız da gider.</span><a class="btn sm" href="#ayarlar">Yedek al</a></div>` : ''}
  <div class="grid g2" style="margin-top:18px">
    <section class="card">
      <div class="row between"><h3>Başlangıç adımları</h3><span class="pill">${doneCount}/${steps.length}</span></div>
      <div class="steps">${steps.map((s, i) => `<div class="step ${s.done ? 'done' : ''}"><span class="ck">${s.done ? '✓' : i + 1}</span><div class="grow"><b>${esc(s.t)}</b><span class="small muted">${esc(s.d)}</span></div><a class="btn sm" href="${s.href}">${esc(s.b)}</a></div>`).join('')}</div>
    </section>
    <section class="card">
      <h3>Son sınavlar</h3>
      ${exams.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Sınav</th><th>Tarih</th><th class="num">Öğrenci</th><th class="num">Kurum ort. net</th></tr></thead><tbody>
      ${exams.map(e => { const ev = evaluateExam(e); return `<tr class="clickable" data-e="${esc(e.id)}"><td>${esc(e.isim)}</td><td>${fmtDate(e.tarih)}</td><td class="num">${ev.ogr.size}</td><td class="num">${fmtNum(ev.kurum.netOrt)}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<p class="muted">Henüz değerlendirilmiş sınav yok. Bir deneme hazırlayıp optik formları okuttuğunuzda burada görünür.</p>`}
      ${hasSample() ? `<div class="banner" style="margin-top:16px;border-left-color:var(--brand)"><span>Örnek veriler yüklü. Kendi verilerinize geçmeden önce silebilirsiniz.</span><button class="btn sm" id="btn-del-sample">Örnekleri sil</button></div>` : ''}
    </section>
  </div>`;

  host.querySelectorAll('#p-tur button').forEach(b => b.addEventListener('click', guard(async () => { await saveSettings({ kurumTuru: b.dataset.k, dersSirasi: derslerFor(b.dataset.k) }); toast('Kaydedildi. Ders listesi ve şablonlar ayarlandı.'); refresh(); })));
  host.querySelectorAll('tr[data-e]').forEach(tr => tr.addEventListener('click', () => go('sinavlar', { open: tr.dataset.e })));
  const bs = $('#btn-sample', host);
  if (bs) bs.addEventListener('click', guard(async () => {
    const { loadSample } = await import('../sample.js');
    const pg = progress('Örnek veriler hazırlanıyor');
    try { const r = await loadSample((f, t) => pg.set(f, t)); toast(`${r.soru} örnek soru, ${r.ogrenci} öğrenci ve ${r.sinav} sınav eklendi.`); }
    finally { pg.close(); }
    refresh();
  }));
  const bd = $('#btn-del-sample', host);
  if (bd) bd.addEventListener('click', guard(async () => {
    if (!await confirmDlg('Örnek sorular, öğrenciler, sınavlar ve belgeler silinecek. Kendi eklediğiniz veriler korunur.', { ok: 'Örnekleri sil', danger: true })) return;
    await removeSample(); toast('Örnek veriler silindi.'); refresh();
  }));
}
