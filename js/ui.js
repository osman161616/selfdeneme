// Arayüz yardımcıları: bildirim, pencere, onay, ilerleme
import { esc, $ } from './util.js';

export function toast(msg, type = 'ok', ms = 3800) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

/**
 * Pencere aç. content: HTML string. buttons: [{label, value, cls}]
 * onMount(el, close) ile içerik bağlanabilir. Promise: seçilen value (Esc/kapat => null)
 */
export function modal({ title = '', content = '', buttons = [{ label: 'Kapat', value: null }], wide = false, onMount = null, dismissable = true } = {}) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3>${dismissable ? '<button class="icon-btn" data-x aria-label="Kapat">✕</button>' : ''}</div>
      <div class="modal-body">${content}</div>
      <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || (i === buttons.length - 1 ? 'primary' : '')}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
    document.body.appendChild(back);
    const prevFocus = document.activeElement;
    let closed = false;
    const close = v => {
      if (closed) return; closed = true;
      back.remove(); document.removeEventListener('keydown', onKey);
      try { prevFocus && prevFocus.focus(); } catch { /* */ }
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape' && dismissable) close(null); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', async e => {
      if (e.target === back && dismissable) close(null);
      if (e.target.closest('[data-x]')) close(null);
      const b = e.target.closest('.modal-foot [data-i]');
      if (b) {
        const def = buttons[+b.dataset.i];
        if (def.validate) { const ok = await def.validate(back.querySelector('.modal')); if (!ok) return; }
        close(typeof def.value === 'function' ? def.value(back.querySelector('.modal')) : def.value);
      }
    });
    const m = back.querySelector('.modal');
    if (onMount) onMount(m, close);
    const f = m.querySelector('input,select,textarea,.modal-foot .primary');
    if (f) setTimeout(() => f.focus(), 30);
  });
}

export function confirmDlg(message, { title = 'Emin misiniz?', ok = 'Evet', cancel = 'Vazgeç', danger = false } = {}) {
  return modal({ title, content: `<p>${esc(message)}</p>`, buttons: [{ label: cancel, value: false }, { label: ok, value: true, cls: danger ? 'danger' : 'primary' }] }).then(v => v === true);
}

export function alertDlg(message, title = 'Bilgi') {
  return modal({ title, content: `<p style="white-space:pre-wrap">${esc(message)}</p>`, buttons: [{ label: 'Tamam', value: true }] });
}

export function promptDlg(label, value = '', title = '') {
  return modal({
    title: title || label,
    content: `<label class="fld"><span>${esc(label)}</span><input id="pd-inp" value="${esc(value)}"></label>`,
    buttons: [{ label: 'Vazgeç', value: null }, { label: 'Tamam', value: m => m.querySelector('#pd-inp').value.trim() }],
    onMount: (m, close) => m.querySelector('#pd-inp').addEventListener('keydown', e => { if (e.key === 'Enter') close(m.querySelector('#pd-inp').value.trim()); }),
  });
}

/** Uzun işlemler için ilerleme katmanı */
export function progress(title = 'İşleniyor…') {
  const back = document.createElement('div');
  back.className = 'modal-back progress-back';
  back.innerHTML = `<div class="modal small"><div class="modal-body"><p class="pg-title">${esc(title)}</p><div class="bar"><i style="width:0%"></i></div><p class="pg-msg muted"></p></div></div>`;
  document.body.appendChild(back);
  const bar = back.querySelector('.bar i'), msg = back.querySelector('.pg-msg');
  return {
    set(frac, text) { bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; if (text !== undefined) msg.textContent = text; },
    close() { back.remove(); },
  };
}

export function emptyState(title, text, actionsHtml = '') {
  return `<div class="empty"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="6" width="44" height="52" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/>${[0, 1, 2, 3].map(i => `<circle cx="22" cy="${18 + i * 10}" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="${18 + i * 10}" r="3.2" ${i === 1 ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="2"/><circle cx="42" cy="${18 + i * 10}" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>`).join('')}</svg><h3>${esc(title)}</h3><p>${text}</p><div class="row gap center">${actionsHtml}</div></div>`;
}

/** Basit sıralanabilir tablo. cols: [{key,label,num,fmt,cls,html}] */
export function sortableTable(host, cols, rows, { sortKey = null, desc = false, onRow = null, rowCls = null, id = '' } = {}) {
  let sk = sortKey, sd = desc;
  const render = () => {
    const data = rows.slice();
    if (sk) {
      const col = cols.find(c => c.key === sk);
      data.sort((a, b) => {
        const va = col && col.sortVal ? col.sortVal(a) : a[sk], vb = col && col.sortVal ? col.sortVal(b) : b[sk];
        let r;
        if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
        else r = String(va ?? '').localeCompare(String(vb ?? ''), 'tr', { numeric: true });
        return sd ? -r : r;
      });
    }
    host.innerHTML = `<div class="scroll"><table class="tbl" ${id ? `id="${id}"` : ''}><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.nosort ? '' : 'sortable'}" data-k="${esc(c.key)}" ${c.nosort ? '' : 'tabindex="0"'}>${esc(c.label)}${sk === c.key ? (sd ? ' ▾' : ' ▴') : ''}</th>`).join('')}</tr></thead><tbody>${data.map((r, i) => `<tr data-i="${rows.indexOf(r)}" class="${rowCls ? rowCls(r) : ''} ${onRow ? 'clickable' : ''}">${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls ? (typeof c.cls === 'function' ? c.cls(r) : c.cls) : ''}">${c.html ? c.html(r, i) : esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  host.onclick = e => {
    const th = e.target.closest('th.sortable');
    if (th) { const k = th.dataset.k; if (sk === k) sd = !sd; else { sk = k; sd = false; } render(); return; }
    const tr = e.target.closest('tbody tr');
    if (tr && onRow && !e.target.closest('button,input,select,a')) onRow(rows[+tr.dataset.i], tr);
  };
  host.onkeydown = e => { if (e.key === 'Enter') { const th = e.target.closest('th.sortable'); if (th) th.click(); } };
  render();
  return { render, setRows(r) { rows = r; render(); } };
}

export function optionList(values, selected, { empty = null } = {}) {
  return (empty !== null ? `<option value="">${esc(empty)}</option>` : '') + values.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

export function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.txt = btn.textContent; btn.disabled = true; if (text) btn.textContent = text; }
  else { btn.disabled = false; if (btn.dataset.txt) btn.textContent = btn.dataset.txt; }
}

/** Hata yakalayan işleyici sarmalayıcı */
export function guard(fn) {
  return async (...a) => {
    try { return await fn(...a); }
    catch (e) { console.error(e); alertDlg((e && e.message) || String(e), 'Bir sorun oluştu'); }
  };
}
