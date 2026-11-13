(function () {
  const P = (window.PSMS = window.PSMS || { modules: {} });
  const TZ = 'Asia/Manila';
  P.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.money = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  P.date = (v, time) => v ? new Date(v).toLocaleString('en-PH', Object.assign({ timeZone: TZ }, time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })) : '—';
  P.today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  P.err = e => (e && e.message) ? e.message : String(e);
  P.STATUSES = ['Pending', 'Approved', 'Designing', 'Printing', 'Finishing', 'Ready for Pickup', 'Completed', 'Cancelled'];
  P.badge = s => `<span class="badge st-${String(s).toLowerCase().replace(/[^a-z]+/g, '-')}">${P.esc(s)}</span>`;
  P.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  P.empty = (msg, icon = '📭') => `<div class="empty"><div class="big">${icon}</div><p>${P.esc(msg)}</p></div>`;
  P.loading = el => { el.innerHTML = '<div class="loading"><span class="spin"></span> Loading…</div>'; };
  P.formData = f => Object.fromEntries(new FormData(f).entries());

  P.toast = (msg, type) => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast' + (type === 'err' ? ' err' : ''); t.textContent = msg;
    box.appendChild(t); setTimeout(() => t.remove(), type === 'err' ? 6000 : 3000);
  };
  P.run = async (btn, fn) => {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { P.toast(P.err(e), 'err'); } finally { if (btn) btn.disabled = false; }
  };
  P.modal = (title, body, opts = {}) => {
    const wrap = document.createElement('div'); wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${P.esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">✕</button></div><div class="modal-b"></div></div>`;
    const b = wrap.querySelector('.modal-b');
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('[data-x]').onclick = close;
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    return { el: b, close, setTitle: t => (wrap.querySelector('h3').textContent = t) };
  };
  P.confirm = (msg, okLabel) => new Promise(res => {
    const m = P.modal('Please confirm', `<p>${P.esc(msg)}</p><div class="actions"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes>${P.esc(okLabel || 'Confirm')}</button></div>`);
    m.el.querySelector('[data-no]').onclick = () => { m.close(); res(false); };
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); res(true); };
  });

  // Generic modal form. fields: [{name,label,type,options,required,step,min,max,help,full,checkLabel}]
  P.form = function (title, fields, values, onSubmit, opts = {}) {
    values = values || {};
    const html = `<form class="form grid2">${fields.map(f => {
      const v = values[f.name] == null ? '' : values[f.name];
      const a = `name="${f.name}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}`;
      let inp;
      if (f.type === 'select') inp = `<select class="inp" ${a}>${f.required ? '' : '<option value=""></option>'}${(f.options || []).map(o => { const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return `<option value="${P.esc(ov)}" ${String(v) === String(ov) ? 'selected' : ''}>${P.esc(ol)}</option>`; }).join('')}</select>`;
      else if (f.type === 'textarea') inp = `<textarea class="inp" rows="3" ${a}>${P.esc(v)}</textarea>`;
      else if (f.type === 'checkbox') inp = `<label class="chk"><input type="checkbox" name="${f.name}" ${values[f.name] ? 'checked' : ''}> ${P.esc(f.checkLabel || 'Yes')}</label>`;
      else if (f.type === 'file') inp = `<input class="inp" type="file" ${a} ${f.accept ? `accept="${f.accept}"` : ''}>`;
      else inp = `<input class="inp" type="${f.type || 'text'}" ${a} value="${P.esc(v)}" ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>`;
      return `<div class="fld ${f.full ? 'full' : ''}"><label>${P.esc(f.label)}${f.required ? ' *' : ''}</label>${inp}${f.help ? `<small class="muted">${P.esc(f.help)}</small>` : ''}</div>`;
    }).join('')}<div class="actions full"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit">${P.esc(opts.submitLabel || 'Save')}</button></div></form>`;
    const m = P.modal(title, html, { wide: opts.wide });
    const form = m.el.querySelector('form');
    m.el.querySelector('[data-cancel]').onclick = m.close;
    form.onsubmit = async e => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => {
        const el = form.elements[f.name];
        if (f.type === 'checkbox') out[f.name] = el.checked;
        else if (f.type === 'file') out[f.name] = el.files[0] || null;
        else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
        else out[f.name] = el.value.trim();
      });
      await P.run(form.querySelector('[type=submit]'), async () => { await onSubmit(out, m); });
    };
    return m;
  };

  // Generic searchable / sortable / filterable list
  P.listView = function (el, o) {
    el.innerHTML = `<div class="toolbar"><h2>${P.esc(o.title)}</h2><div class="tools"><input type="search" class="inp" placeholder="Search…" data-q>${(o.filters || []).map((f, i) => `<select class="inp" data-f="${i}"><option value="">${P.esc(f.label)}: All</option>${f.options.map(x => `<option>${P.esc(x)}</option>`).join('')}</select>`).join('')}${o.extra || ''}${o.onAdd ? `<button class="btn primary" data-add>${P.esc(o.addLabel || 'Add')}</button>` : ''}</div></div>${o.header || ''}<div class="card" data-body></div>`;
    const body = el.querySelector('[data-body]'); let rows = [], sortKey = null, asc = true;
    const draw = () => {
      const q = el.querySelector('[data-q]').value.trim().toLowerCase();
      let list = rows.filter(r => (!q || JSON.stringify(Object.values(r)).toLowerCase().includes(q)) &&
        (o.filters || []).every((f, i) => { const v = el.querySelector(`[data-f="${i}"]`).value; return !v || f.test(r, v); }));
      if (sortKey) { const c = o.cols.find(c => c.label === sortKey); const g = c.sort || (r => r[c.k]); list = [...list].sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); }); }
      if (!list.length) { body.innerHTML = P.empty(o.empty || 'Nothing here yet.'); return; }
      body.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${o.cols.map(c => `<th data-s="${P.esc(c.label)}" class="${c.cls || ''}">${P.esc(c.label)}</th>`).join('')}</tr></thead><tbody>${list.map((r, i) => `<tr data-i="${i}" class="${o.onRow ? 'click' : ''}">${o.cols.map(c => `<td class="${c.cls || ''}">${c.fmt ? c.fmt(r) : P.esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="muted small" style="margin-top:8px">${list.length} record(s)</div>`;
      body.querySelectorAll('th').forEach(th => th.onclick = () => { asc = sortKey === th.dataset.s ? !asc : true; sortKey = th.dataset.s; draw(); });
      if (o.onRow) body.querySelectorAll('tbody tr').forEach(tr => tr.onclick = e => { if (e.target.closest('button,a')) return; o.onRow(list[tr.dataset.i], api); });
      body.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); o.onAction && o.onAction(b.dataset.act, list[b.closest('tr').dataset.i], api); });
    };
    const api = {
      reload: async () => {
        P.loading(body);
        try { rows = await o.load(); } catch (e) { body.innerHTML = `<div class="error">${P.esc(P.err(e))}</div>`; return; }
        if (o.onLoad) o.onLoad(rows, el);
        draw();
      }, rows: () => rows, el
    };
    el.querySelector('[data-q]').oninput = P.debounce(draw, 150);
    el.querySelectorAll('[data-f]').forEach(s => s.onchange = draw);
    if (o.onAdd) el.querySelector('[data-add]').onclick = () => o.onAdd(api);
    api.reload();
    return api;
  };

  P.signed = async (bucket, path, download) => {
    const { data, error } = await P.sb.storage.from(bucket).createSignedUrl(path, 120, download ? { download } : undefined);
    if (error) throw error; return data.signedUrl;
  };
  P.save = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  P.PRINT_CSS = 'body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:16px}table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;text-align:left;border-bottom:1px solid #ddd}.r,td.r{text-align:right}img{max-height:60px}.doc-head{display:flex;gap:12px;align-items:center}.doc-title{text-align:center}.doc.narrow{max-width:380px;margin:0 auto}.doc-meta th{width:34%;border:0}.doc-meta td{border:0}.doc-tot{margin-left:auto;max-width:280px}.doc-tot th,.doc-tot td{border:0}.doc-tot td{text-align:right}.doc-foot{text-align:center}';
  P.printHtml = (html, title) => {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + P.esc(title || 'Print') + '</title><style>' + P.PRINT_CSS + '</style></head><body>' + html + '</body></html>'); d.close();
    Promise.all([...d.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => {
      f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 3000);
    });
  };
})();
