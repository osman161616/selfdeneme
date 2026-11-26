import { state, saveSettings, wipeAll, storageEstimate, hasSample, removeSample, dersList, DEFAULT_SETTINGS, derslerFor } from '../db.js';
import { PUAN_TURLERI, ALANLAR, katsayi, PT_SIRA } from '../sinavlar.js';
import { esc, $, $$, pickFiles, makeCanvas, downloadFile, stamp, fmtNum } from '../util.js';
import { modal, confirmDlg, toast, progress, guard, alertDlg } from '../ui.js';
import { exportBackup, importBackup } from '../importers.js';
import { refresh } from '../app.js';

export async function render(host) {
  const s = state.settings;
  const est = await storageEstimate();
  const dersler = s.dersSirasi;
  const all = dersList();
  const extra = all.filter(d => !dersler.includes(d));
  host.innerHTML = `
  <div class="page-head"><div><h1>Ayarlar ve Yedek</h1><p>Değişiklikler anında kaydedilir. Puanlama ayarları yeni değerlendirilecek sınavlara uygulanır; eski sınavları kendi sayfasından yeniden hesaplayabilirsiniz.</p></div></div>
  <div class="grid g2">
    <section class="card"><h3>Kurum</h3><div class="stack">
      <label class="fld"><span>Kurum adı</span><input id="s-kurum" value="${esc(s.kurum)}" placeholder="ör. Bilgi Koleji"></label>
      <div class="fld"><span>Kurum türü</span><div class="seg" id="s-tur">${[['ortaokul', 'Ortaokul (LGS)'], ['lise', 'Lise (YKS)'], ['karma', 'İkisi de']].map(([k, l]) => `<button type="button" data-k="${k}" class="${s.kurumTuru === k ? 'on' : ''}">${l}</button>`).join('')}</div><small>Deneme hazırlarken hangi sınav türlerinin listeleneceğini belirler.</small></div>
      <div class="fld"><span>Logo <small>(belge başlıklarında görünür)</small></span>
        <div class="row gap">${s.logo ? `<img src="${s.logo}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px">` : '<span class="muted small">Logo yok</span>'}
        <button class="btn sm" id="s-logo">Logo seç</button>${s.logo ? '<button class="btn sm ghost" id="s-logo-x">Kaldır</button>' : ''}</div></div>
    </div></section>
    <section class="card"><h3>Serbest denemelerde puanlama</h3><p class="small muted" style="margin-top:0">LGS, TYT, AYT ve YDT denemeleri resmî kurallarla puanlanır; buradaki ayarlar yalnızca serbest dağılımlı denemeler içindir.</p><div class="stack">
      <div class="form-grid">
        <label class="fld"><span>Taban puan</span><input id="s-taban" type="number" value="${s.taban}"></label>
        <label class="fld"><span>Yanlış götürme</span><select id="s-yo"><option value="${1 / 3}" ${Math.abs(s.yanlisOrani - 1 / 3) < 1e-6 ? 'selected' : ''}>3 yanlış 1 doğru</option><option value="0.25" ${s.yanlisOrani === 0.25 ? 'selected' : ''}>4 yanlış 1 doğru</option><option value="0" ${s.yanlisOrani === 0 ? 'selected' : ''}>Götürmez</option></select></label>
        <label class="fld"><span>Birden fazla işaret</span><select id="s-ci"><option value="yanlis" ${s.cokluIsaret === 'yanlis' ? 'selected' : ''}>Yanlış sayılır</option><option value="bos" ${s.cokluIsaret === 'bos' ? 'selected' : ''}>Boş sayılır</option></select></label>
      </div>
      <p class="small muted">Puan = taban + Σ (ders neti × ders katsayısı). Katsayıları aşağıdaki ders listesinden girin.</p>
    </div></section>
  </div>
  <section class="card" style="margin-top:16px"><h3>Merkezî sınav puan ağırlıkları</h3>
    <p class="small muted" style="margin-top:0">ÖSYM 2026-YKS Kılavuzu (Tablo 1C ve 1E) ve MEB 2026 LGS Kılavuzu'ndaki ağırlıklar. Tahmini puan = 100 + 400 × Σ ağırlık × (net ÷ soru sayısı). Tablodaki "net değeri", o testte 1 netin puana katkısıdır. Resmî sonuçta netler önce ülke ortalamasına göre standartlaştırıldığı için gerçek puan bu tahminden birkaç puan farklı olabilir.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Puan türü</th><th>Test</th><th class="num">Soru</th><th class="num">Ağırlık</th><th class="num">1 netin değeri</th></tr></thead><tbody>
    ${PT_SIRA.map(pt => { const P = PUAN_TURLERI[pt]; const list = P.k ? Object.keys(P.k) : Object.keys(P.w); const tot = P.k ? Object.entries(P.k).reduce((a, [k, v]) => a + v * ALANLAR[k].n, 0) : 1; return list.map((a, i) => `<tr>${i === 0 ? `<td rowspan="${list.length}"><b>${esc(P.uzun || P.ad)}</b></td>` : ''}<td>${a.startsWith('TYT_') && pt !== 'TYT' ? 'TYT · ' : ''}${esc(ALANLAR[a].ad)}</td><td class="num">${ALANLAR[a].n}</td><td class="num">${P.k ? 'katsayı ' + P.k[a] : '%' + (P.w[a] * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</td><td class="num">${katsayi(pt, a).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</td></tr>`).join(''); }).join('')}
    </tbody></table></div>
    <p class="small muted">YKS: 4 yanlış 1 doğruyu götürür; puan için ilgili testlerin en az birinden 0,5 net gerekir; yerleştirme puanı = puan + diploma notu × 5 × 0,12. LGS: 3 yanlış 1 doğruyu götürür; Din Kültürü ya da yabancı dilden muaf öğrencinin o testteki puanı diğer testlerdeki başarısıyla orantılanır. İptal edilen soru iki sınavda da değerlendirme dışı bırakılır.</p>
  </section>
  <section class="card" style="margin-top:16px"><h3>Dersler, sıralama ve katsayılar</h3>
    <p class="small muted" style="margin-top:0">Belgelerde, karnelerde ve optik formda dersler bu sırayla yer alır.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Sıra</th><th>Ders</th><th class="num">Katsayı</th><th></th></tr></thead><tbody>
    ${dersler.map((d, i) => `<tr><td class="num">${i + 1}</td><td>${esc(d)}</td><td class="num"><input type="number" step="0.1" data-k="${esc(d)}" value="${s.katsayilar[d] ?? 1}"></td><td><div class="row gap-s end"><button class="icon-btn" data-up="${i}" aria-label="Yukarı" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-dn="${i}" aria-label="Aşağı" ${i === dersler.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-btn" data-rm="${i}" aria-label="Kaldır">✕</button></div></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row gap" style="margin-top:10px"><input id="s-newd" placeholder="Ders adı" list="s-dl" style="max-width:280px"><datalist id="s-dl">${extra.map(d => `<option value="${esc(d)}">`).join('')}</datalist><button class="btn sm" id="s-addd">Ders ekle</button>${extra.length ? `<span class="small muted">Bankada sıralamada olmayan dersler var: ${extra.map(esc).join(', ')}</span>` : ''}</div>
  </section>
  <div class="grid g2" style="margin-top:16px">
    <section class="card"><h3>Sayfa düzeni (ödev ve deneme)</h3><div class="form-grid">
      <label class="fld"><span>Çözünürlük</span><select id="s-dpi">${[150, 200, 300].map(v => `<option value="${v}" ${+s.dpi === v ? 'selected' : ''}>${v} DPI${v === 200 ? ' (önerilen)' : v === 300 ? ' (büyük dosya)' : ''}</option>`).join('')}</select></label>
      <label class="fld"><span>Kenar boşluğu (mm)</span><input id="s-kenar" type="number" min="5" max="25" value="${s.kenar}"></label>
      <label class="fld"><span>Sorular arası (mm)</span><input id="s-ara" type="number" min="2" max="30" value="${s.soruArasi}"></label>
      <label class="fld"><span>Bölüm başlığı (punto)</span><input id="s-bp" type="number" min="8" max="30" value="${s.baslikPunto}"></label>
      <label class="fld"><span>Soru numarası (punto)</span><input id="s-sp" type="number" min="7" max="24" value="${s.soruNoPunto}"></label>
      <label class="fld"><span>Sayfa numarası (punto)</span><input id="s-pp" type="number" min="6" max="20" value="${s.sayfaNoPunto}"></label>
    </div><div class="stack" style="margin-top:12px">
      <label class="check"><input type="checkbox" id="s-dy" ${s.dersYeniSayfa ? 'checked' : ''}> Her ders yeni sayfada başlasın</label>
      <label class="check"><input type="checkbox" id="s-sb" ${s.soruBoyut === 'sutun' ? 'checked' : ''}> Soruları sütun genişliğine büyüt <small class="muted">(kapalıyken PDF'ten kesilen sorular kitaptaki yazı boyutuyla basılır)</small></label>
      <label class="check"><input type="checkbox" id="s-oa" ${s.ogrenciAdiYaz !== false ? 'checked' : ''}> Kişisel belgelerde öğrenci adını sayfa başına yaz</label></div></section>
    <section class="card"><h3>Optik form</h3><div class="form-grid">
      <label class="fld"><span>Şık sayısı <small>(serbest denemeler)</small></span><select id="s-sec"><option value="5" ${+s.secenekSayisi === 5 ? 'selected' : ''}>5 (A–E)</option><option value="4" ${+s.secenekSayisi === 4 ? 'selected' : ''}>4 (A–D)</option></select></label>
      <label class="fld"><span>Numara hane sayısı</span><input id="s-hane" type="number" min="3" max="10" value="${s.noHane}"></label></div>
      <p class="small muted">Yeni üretilen formlara uygulanır. Önceden basılmış formlar kendi ayarıyla okunur.</p></section>
  </div>
  <section class="card" style="margin-top:16px"><h3>Veriler ve yedek</h3>
    <p class="muted" style="margin-top:0">Tüm sorularınız, öğrencileriniz ve sınavlarınız yalnızca bu tarayıcıda saklanır; hiçbir sunucuya gönderilmez. Tarayıcı verilerini temizlerseniz ya da başka bilgisayara geçerseniz yedek dosyanızla geri yükleyebilirsiniz.</p>
    <div class="grid g4" style="margin:12px 0">
      <div class="stat"><div class="v">${fmtNum(state.questions.size, 0)}</div><div class="l">soru</div></div>
      <div class="stat"><div class="v">${fmtNum(state.students.size, 0)}</div><div class="l">öğrenci</div></div>
      <div class="stat"><div class="v">${fmtNum(state.exams.size, 0)}</div><div class="l">sınav</div></div>
      <div class="stat"><div class="v">${est && est.usage ? fmtNum(est.usage / 1048576, 1) + ' MB' : '-'}</div><div class="l">kullanılan alan${est && est.quota ? ` / ${fmtNum(est.quota / 1073741824, 1)} GB` : ''}</div></div>
    </div>
    <p class="small">${s.sonYedek ? `Son yedek: <b>${new Date(s.sonYedek).toLocaleString('tr-TR')}</b>` : '<b>Henüz yedek alınmadı.</b>'}</p>
    <div class="row gap" style="margin-top:10px"><button class="btn primary" id="s-bak">Yedek al (.zip)</button><button class="btn" id="s-res">Yedekten geri yükle</button>
      ${hasSample() ? '<button class="btn" id="s-sx">Örnek verileri sil</button>' : '<button class="btn" id="s-sl">Örnek veri yükle</button>'}
      <button class="btn danger" id="s-wipe">Tüm verileri sil</button></div>
  </section>`;

  const save = guard(async (patch, msg = 'Kaydedildi') => { await saveSettings(patch); toast(msg); });
  const num = (id, key, min, max) => $(id, host).addEventListener('change', e => { let v = Number(e.target.value); if (Number.isNaN(v)) v = DEFAULT_SETTINGS[key]; v = Math.max(min, Math.min(max, v)); e.target.value = v; save({ [key]: v }); });
  $('#s-kurum', host).addEventListener('change', e => save({ kurum: e.target.value.trim() }));
  $$('#s-tur button', host).forEach(b => b.addEventListener('click', guard(async () => {
    const k = b.dataset.k;
    const want = derslerFor(k);
    const add = want.filter(d => !s.dersSirasi.includes(d));
    await saveSettings({ kurumTuru: k, dersSirasi: [...s.dersSirasi.filter(d => want.includes(d) || dersList().includes(d)), ...add] });
    toast('Kurum türü kaydedildi.'); render(host);
  })));
  num('#s-taban', 'taban', -1000, 10000);
  $('#s-yo', host).addEventListener('change', e => save({ yanlisOrani: Number(e.target.value) }));
  $('#s-ci', host).addEventListener('change', e => save({ cokluIsaret: e.target.value }));
  $$('[data-k]', host).forEach(i => i.addEventListener('change', () => { const k = { ...s.katsayilar, [i.dataset.k]: Number(i.value) || 0 }; save({ katsayilar: k }); }));
  const move = async (i, d) => { const a = s.dersSirasi.slice(); const [x] = a.splice(i, 1); a.splice(i + d, 0, x); await saveSettings({ dersSirasi: a }); render(host); };
  $$('[data-up]', host).forEach(b => b.addEventListener('click', () => move(+b.dataset.up, -1)));
  $$('[data-dn]', host).forEach(b => b.addEventListener('click', () => move(+b.dataset.dn, 1)));
  $$('[data-rm]', host).forEach(b => b.addEventListener('click', guard(async () => { const a = s.dersSirasi.slice(); a.splice(+b.dataset.rm, 1); await saveSettings({ dersSirasi: a }); render(host); })));
  $('#s-addd', host).addEventListener('click', guard(async () => {
    const v = $('#s-newd', host).value.trim(); if (!v) return;
    if (s.dersSirasi.includes(v)) { toast('Bu ders zaten listede.', 'warn'); return; }
    await saveSettings({ dersSirasi: [...s.dersSirasi, v], katsayilar: { ...s.katsayilar, [v]: s.katsayilar[v] ?? 1 } }); render(host);
  }));
  $('#s-dpi', host).addEventListener('change', e => save({ dpi: Number(e.target.value) }));
  num('#s-kenar', 'kenar', 5, 25); num('#s-ara', 'soruArasi', 2, 30); num('#s-bp', 'baslikPunto', 8, 30); num('#s-sp', 'soruNoPunto', 7, 24); num('#s-pp', 'sayfaNoPunto', 6, 20);
  $('#s-dy', host).addEventListener('change', e => save({ dersYeniSayfa: e.target.checked }));
  $('#s-sb', host).addEventListener('change', e => save({ soruBoyut: e.target.checked ? 'sutun' : 'orijinal' }));
  $('#s-oa', host).addEventListener('change', e => save({ ogrenciAdiYaz: e.target.checked }));
  $('#s-sec', host).addEventListener('change', e => save({ secenekSayisi: Number(e.target.value) }));
  num('#s-hane', 'noHane', 3, 10);
  $('#s-logo', host).addEventListener('click', guard(async () => {
    const f = await pickFiles({ accept: 'image/*' }); if (!f.length) return;
    const bmp = await createImageBitmap(f[0]);
    const sc = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const c = makeCanvas(bmp.width * sc, bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    await saveSettings({ logo: c.toDataURL('image/png') }); toast('Logo kaydedildi.'); render(host);
  }));
  const lx = $('#s-logo-x', host); if (lx) lx.addEventListener('click', guard(async () => { await saveSettings({ logo: null }); render(host); }));
  $('#s-bak', host).addEventListener('click', guard(async () => {
    const pg = progress('Yedek hazırlanıyor');
    let blob; try { blob = await exportBackup(f => pg.set(f)); } finally { pg.close(); }
    const ok = await downloadFile(`selfdeneme_yedek_${stamp()}.zip`, blob, 'application/zip');
    if (ok) { await saveSettings({ sonYedek: Date.now() }); toast('Yedek indirildi. Dosyayı güvenli bir yerde (USB bellek, bulut klasörü) saklayın.'); render(host); }
  }));
  $('#s-res', host).addEventListener('click', guard(async () => {
    const f = await pickFiles({ accept: '.zip,application/zip' }); if (!f.length) return;
    const mode = await modal({ title: 'Yedekten geri yükle', content: '<p><b>Birleştir:</b> mevcut verilerin korunur, yedekteki eksik kayıtlar eklenir.</p><p><b>Değiştir:</b> bu tarayıcıdaki tüm veriler silinir, yerine yedek yüklenir.</p>', buttons: [{ label: 'Vazgeç', value: null }, { label: 'Değiştir', value: 'replace', cls: 'danger' }, { label: 'Birleştir', value: 'merge' }] });
    if (!mode) return;
    if (mode === 'replace' && !await confirmDlg('Bu tarayıcıdaki tüm veriler silinip yedekle değiştirilecek.', { ok: 'Değiştir', danger: true })) return;
    const pg = progress('Yedek yükleniyor');
    let r; try { r = await importBackup(f[0], { replace: mode === 'replace' }, x => pg.set(x)); } finally { pg.close(); }
    await alertDlg(`Yedek yüklendi: ${r.soru} soru, ${r.ogrenci} öğrenci, ${r.sinav} sınav.`);
    refresh();
  }));
  const sl = $('#s-sl', host); if (sl) sl.addEventListener('click', guard(async () => {
    const { loadSample } = await import('../sample.js');
    const pg = progress('Örnek veriler hazırlanıyor');
    try { await loadSample((f, t) => pg.set(f, t)); } finally { pg.close(); }
    toast('Örnek veriler yüklendi.'); render(host);
  }));
  const sx = $('#s-sx', host); if (sx) sx.addEventListener('click', guard(async () => { if (!await confirmDlg('Örnek veriler silinecek.', { ok: 'Sil', danger: true })) return; await removeSample(); toast('Örnek veriler silindi.'); render(host); }));
  $('#s-wipe', host).addEventListener('click', guard(async () => {
    if (!await confirmDlg('Bu tarayıcıdaki TÜM sorular, öğrenciler, sınavlar ve ayarlar silinecek. Yedeğiniz yoksa geri getirilemez.', { ok: 'Her şeyi sil', danger: true, title: 'Tüm verileri sil' })) return;
    const t = await modal({ title: 'Son onay', content: '<p>Onaylamak için <b>SİL</b> yazın.</p><input id="w-c" autocomplete="off">', buttons: [{ label: 'Vazgeç', value: null }, { label: 'Sil', value: m => $('#w-c', m).value.trim(), cls: 'danger' }] });
    if (!t || t.toLocaleUpperCase('tr-TR') !== 'SİL') { if (t !== null) await alertDlg('Onay metni eşleşmedi; hiçbir şey silinmedi.'); return; }
    await wipeAll(); toast('Tüm veriler silindi.'); refresh();
  }));
}
