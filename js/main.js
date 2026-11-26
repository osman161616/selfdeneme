import { initDB, state } from './db.js';
import { $, esc } from './util.js';
import { bus } from './app.js';
import { alertDlg } from './ui.js';

const ICON = {
  panel: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  banka: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
  kirp: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
  ogrenciler: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.6c2.6.2 4.6 1.8 5.3 4.4"/>',
  hazirla: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  sinavlar: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="9" cy="9" r="1.8"/><circle cx="15" cy="9" r="1.8"/><circle cx="9" cy="15" r="1.8"/><circle cx="15" cy="15" r="1.8" fill="currentColor"/>',
  analiz: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ayarlar: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  rehber: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
};

const ROUTES = [
  { id: 'panel', label: 'Panel', mod: () => import('./pages/panel.js') },
  { id: 'banka', label: 'Soru Bankası', mod: () => import('./pages/bank.js') },
  { id: 'kirp', label: 'Soru Kırp', mod: () => import('./pages/crop.js') },
  { id: 'ogrenciler', label: 'Öğrenciler', mod: () => import('./pages/students.js') },
  { sep: true },
  { id: 'hazirla', label: 'Ödev ve Deneme', mod: () => import('./pages/homework.js') },
  { id: 'sinavlar', label: 'Sınavlar ve Optik', mod: () => import('./pages/exams.js') },
  { id: 'analiz', label: 'Seviye Analizi', mod: () => import('./pages/analysis.js') },
  { sep: true },
  { id: 'ayarlar', label: 'Ayarlar ve Yedek', mod: () => import('./pages/settings.js') },
  { id: 'rehber', label: 'Rehber', mod: () => import('./pages/guide.js') },
];

function renderNav(cur) {
  $('#nav').innerHTML = ROUTES.map(r => r.sep ? '<div class="sep"></div>' : `<a href="#${r.id}" class="${r.id === cur ? 'on' : ''}" ${r.id === cur ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[r.id]}</svg>${esc(r.label)}</a>`).join('');
}

function renderFoot() {
  const p = state.persistent;
  $('#side-foot').innerHTML = `<div class="store"><span class="dot ${p ? '' : 'warn'}"></span>${p ? 'Veriler bu tarayıcıda saklanıyor' : 'Geçici mod: veriler kaydedilmiyor'}</div>
  <div style="margin-top:6px">${state.questions.size} soru · ${state.students.size} öğrenci · ${state.exams.size} sınav</div>`;
}

window.addEventListener('sd:data', () => renderFoot());
let current = null, renderToken = 0;
async function route() {
  const id = (location.hash || '#panel').slice(1).split('?')[0] || 'panel';
  const r = ROUTES.find(x => x.id === id) || ROUTES[0];
  renderNav(r.id); renderFoot();
  $('#side').classList.remove('open');
  const main = $('#main');
  const token = ++renderToken;
  try {
    if (current && current.leave) { try { current.leave(); } catch { /* */ } }
    const mod = await r.mod();
    if (token !== renderToken) return;
    current = mod;
    main.innerHTML = '';
    await mod.render(main);
    if (token === renderToken) { document.title = `${r.label} · selfdeneme`; }
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><h3>Sayfa açılamadı</h3><p class="muted">${esc(e.message || e)}</p><p><a href="#panel">Panele dön</a></p></div>`;
  }
  renderFoot();
}

bus.rerender = () => route();
bus.foot = renderFoot;

window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
$('#menu-btn').addEventListener('click', () => $('#side').classList.toggle('open'));
document.addEventListener('click', e => { if (window.innerWidth <= 900 && !e.target.closest('#side') && !e.target.closest('#menu-btn')) $('#side').classList.remove('open'); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });

(async () => {
  try { await initDB(); }
  catch (e) { await alertDlg('Yerel veritabanı açılamadı: ' + e.message); }
  if (!state.persistent) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = '<span><b>Geçici mod.</b> Tarayıcınız yerel depolamaya izin vermiyor (gizli pencere ya da gömülü görünüm olabilir). Çalışabilirsiniz ama sayfa kapanınca veriler silinir; işiniz bitince <a href="#ayarlar">yedek alın</a>.</span>';
    $('#main').before(b);
    b.style.margin = '12px clamp(16px,3.2vw,44px) 0';
  }
  route();
})();
