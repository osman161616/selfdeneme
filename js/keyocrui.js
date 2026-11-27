// Cevap anahtarı kutularına "Görselden oku" düğmesi, yapıştırma (Ctrl+V) ve sürükle-bırak desteği
import { readKeyImage } from './keyocr.js';
import { pickFiles, esc } from './util.js';

/**
 * input: cevap anahtarı metin kutusu
 * expected(): beklenen soru sayısı (bilinmiyorsa 0)
 * apply(str): okunan anahtarı kutuya yazar ("-" = okunamadı/boş)
 */
export function attachKeyOcr(input, { expected = () => 0, apply, secenek = 5, onFive = null } = {}) {
  if (!input || input.dataset.kocr) return;
  input.dataset.kocr = '1';
  const row = document.createElement('div');
  row.className = 'kocr-row';
  row.innerHTML = `<button type="button" class="btn sm ghost kocr-btn">Görselden oku</button><span class="small muted">ya da anahtarın ekran görüntüsünü kutuya yapıştırın (Ctrl+V) / sürükleyin</span>`;
  const box = document.createElement('div');
  box.className = 'kocr-res'; box.hidden = true;
  input.insertAdjacentElement('afterend', row);
  row.insertAdjacentElement('afterend', box);
  let url = null;

  const run = async file => {
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    box.hidden = false;
    box.innerHTML = `<img src="${url}" alt=""><div class="small muted">Görsel okunuyor…</div>`;
    let res;
    try { res = await readKeyImage(file); } catch (e) { box.innerHTML = `<div class="small" style="color:var(--bad)">${esc(e.message || 'Görsel okunamadı.')}</div>`; return; }
    const groups = res.groups.filter(g => g && g.replace(/-/g, '').length);
    if (!groups.length) {
      box.innerHTML = `<img src="${url}" alt=""><div class="small" style="color:var(--bad)">Görselde cevap bulunamadı. Daha büyük ya da daha net bir görüntü deneyin; olmazsa cevapları yazın.</div>`;
      return;
    }
    const exp = +expected() || 0;
    let idx = exp ? groups.findIndex(g => g.length === exp) : -1;
    if (idx < 0) idx = 0;
    const show = i => {
      const g = groups[i];
      apply(g);
      const bos = (g.match(/-/g) || []).length;
      const fazla = secenek === 4 && /E/.test(g);
      const uyum = !exp ? '' : g.length === exp ? `<span style="color:var(--ok)">✓ ${exp} sorunun hepsi</span>` : `<span style="color:var(--bad)">Testte ${exp} soru var, görselde ${g.length} cevap okundu.</span>`;
      box.innerHTML = `<img src="${url}" alt="">
        <div class="small"><b>Okunan:</b> <code class="kocr-key">${esc(g)}</code> (${g.length} cevap${bos ? `, ${bos} tanesi okunamadı: "-"` : ''}) ${uyum}
        ${fazla ? (onFive ? '<br><span style="color:var(--bad)">Anahtarda E var ama sorular 4 şıklı görünüyor.</span> <button type="button" class="btn sm" data-five>Sorular 5 şıklı, E\'yi kabul et</button>' : '<br><span style="color:var(--bad)">Bu sınavda E şıkkı yok; görseli kontrol edin.</span>') : ''}
        ${groups.length > 1 ? `<br>Görselde ${groups.length} test var: ${groups.map((x, j) => `<button type="button" class="btn sm ${j === i ? '' : 'ghost'}" data-g="${j}">${j + 1}. (${x.length})</button>`).join(' ')}` : ''}
        <br><span class="muted">Görselle karşılaştırın; yanlış okunan harfi kutuda düzeltebilirsiniz.</span></div>`;
      box.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => show(+b.dataset.g)));
      const fv = box.querySelector('[data-five]'); if (fv) fv.addEventListener('click', () => onFive(g));
    };
    show(idx);
  };

  row.querySelector('.kocr-btn').addEventListener('click', async e => {
    e.preventDefault();
    const [f] = await pickFiles({ accept: 'image/*' });
    run(f);
  });
  input.addEventListener('paste', e => {
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it) { e.preventDefault(); run(it.getAsFile()); }
  });
  input.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.type.startsWith('image/'))) e.preventDefault(); });
  input.addEventListener('drop', e => {
    const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); run(f); }
  });
}
