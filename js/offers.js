// Owner's catalogue: add / edit / hide / delete offers (a service + its price options) in one place.
(function () {
  const P = window.PSMS;
  const COLOR = { any: 'Any color', bw: 'Black & white', color: 'Colored' }, SIDED = { any: 'Any sides', single: 'Single-sided', double: 'Double-sided' };
  const COLOR_OPTS = [{ v: 'any', l: 'Any color' }, { v: 'bw', l: 'Black & white' }, { v: 'color', l: 'Colored' }];
  const SIDED_OPTS = [{ v: 'any', l: 'Any sides' }, { v: 'single', l: 'Single-sided' }, { v: 'double', l: 'Double-sided' }];

  const DETAILS = [
    { name: 'name', label: 'Offer name', required: true, maxlength: 100, full: true },
    { name: 'category', label: 'Category', maxlength: 60, help: 'e.g. Printing, Photo, Finishing' },
    { name: 'turnaround_days', label: 'Turnaround (days)', type: 'number', min: 0, required: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'rush_fee_percent', label: 'Rush-order fee (%)', type: 'number', min: 0, max: 500, step: '0.01', required: true },
    { name: 'additional_charge', label: 'Extra flat charge (₱)', type: 'number', min: 0, step: '0.01', required: true, help: 'Added once per order line (e.g. setup fee)' },
    { name: 'additional_charge_label', label: 'Extra charge label', maxlength: 60 },
    { name: 'active', label: 'Availability', type: 'checkbox', checkLabel: 'Available to customers and in POS' }
  ];
  const PRICE = [
    { name: 'unit_price', label: 'Price per unit (₱)', type: 'number', min: 0, step: '0.01', required: true, help: 'Per page/piece. Quantity = pages × copies.' },
    { name: 'color_mode', label: 'Color', type: 'select', required: true, options: COLOR_OPTS },
    { name: 'sided', label: 'Sides', type: 'select', required: true, options: SIDED_OPTS },
    { name: 'paper_size', label: 'Paper size', help: 'Blank = any size' },
    { name: 'paper_type', label: 'Paper type', help: 'Blank = any type' }
  ];
  const cleanS = v => ({ name: v.name, category: v.category || null, description: v.description || null, turnaround_days: v.turnaround_days ?? 1, rush_fee_percent: v.rush_fee_percent ?? 0, additional_charge: v.additional_charge ?? 0, additional_charge_label: v.additional_charge_label || null, active: v.active });
  const cleanP = v => ({ unit_price: v.unit_price, color_mode: v.color_mode, sided: v.sided, paper_size: v.paper_size || null, paper_type: v.paper_type || null });
  const optLabel = r => [r.paper_size, r.paper_type, COLOR[r.color_mode], SIDED[r.sided]].filter(Boolean).join(' · ');

  P.register('offers', {
    title: 'My Offers', icon: '🏷',
    async render(el) {
      el.innerHTML = `<div class="toolbar"><h2>My Offers</h2><div class="tools"><input type="search" class="inp" placeholder="Search offers…" id="q"><button class="btn primary" id="add">+ Add offer</button></div></div><p class="muted" style="margin-top:-6px">Everything you add here appears in the POS and customer portal. Hidden offers stay saved but can't be ordered.</p><div id="grid"></div>`;
      const grid = el.querySelector('#grid'); let services = [], pricing = [];
      const refresh = async () => { P._cat = null; await load(); };
      const load = async () => {
        [services, pricing] = await Promise.all([P.sb.from('services').select('*').order('name'), P.sb.from('service_pricing').select('*').order('unit_price')]).then(r => r.map(P.ck));
        draw();
      };
      const draw = () => {
        const q = el.querySelector('#q').value.trim().toLowerCase();
        const list = services.filter(s => !q || (s.name + ' ' + (s.category || '') + ' ' + (s.description || '')).toLowerCase().includes(q));
        if (!list.length) { grid.innerHTML = P.empty(services.length ? 'No offers match your search.' : 'No offers yet. Click “+ Add offer” to create your first one.', '🏷'); return; }
        grid.innerHTML = `<div class="offer-grid">${list.map(s => {
          const rows = pricing.filter(p => p.service_id === s.id), act = rows.filter(r => r.active), low = act.length ? Math.min(...act.map(r => +r.unit_price)) : null;
          return `<div class="offer ${s.active ? '' : 'off'}" data-id="${s.id}">
            <div class="offer-top">${s.category ? `<span class="chip">${P.esc(s.category)}</span>` : '<span></span>'}${s.active ? P.badge('Active').replace('st-active', 'st-ok').replace('Active', 'Available') : '<span class="badge">Hidden</span>'}</div>
            <h3>${P.esc(s.name)}</h3>${s.description ? `<p class="muted small">${P.esc(s.description)}</p>` : ''}
            <div class="offer-price">${low == null ? '<b>No price yet</b>' : `from <b>${P.money(low)}</b>`}</div>
            <ul class="opts">${rows.map(r => `<li data-pid="${r.id}"><span>${P.esc(optLabel(r))}${r.active ? '' : ' <em class="muted">(off)</em>'}</span><b>${P.money(r.unit_price)}</b><button class="icon-btn" data-act="pedit" title="Edit price">✎</button><button class="icon-btn" data-act="pdel" title="Delete price">✕</button></li>`).join('') || '<li><span class="muted">Add a price option so customers can order this.</span></li>'}</ul>
            <div class="offer-foot small muted">~${s.turnaround_days} day(s)${+s.rush_fee_percent ? ` · Rush +${s.rush_fee_percent}%` : ''}${+s.additional_charge ? ` · ${P.esc(s.additional_charge_label || 'Extra')} ${P.money(s.additional_charge)}` : ''}</div>
            <div class="offer-actions"><button class="btn sm" data-act="padd">+ Price option</button><button class="btn sm" data-act="edit">Edit</button><button class="btn sm" data-act="toggle">${s.active ? 'Hide' : 'Show'}</button><button class="btn sm" data-act="del">Delete</button></div></div>`;
        }).join('')}</div>`;
      };
      el.querySelector('#q').oninput = P.debounce(draw, 150);

      el.querySelector('#add').onclick = () => P.form('Add offer', [DETAILS[0], PRICE[0], PRICE[1], PRICE[2], PRICE[3], PRICE[4], ...DETAILS.slice(1)],
        { turnaround_days: 1, rush_fee_percent: 0, additional_charge: 0, color_mode: 'any', sided: 'any', active: true },
        async (v, m) => {
          const s = P.ck(await P.sb.from('services').insert(cleanS(v)).select('id').single());
          const { error } = await P.sb.from('service_pricing').insert({ ...cleanP(v), service_id: s.id, active: true });
          if (error) { await P.sb.from('services').delete().eq('id', s.id); throw error; }
          P.log('add_offer', 'service', s.id, { name: v.name }); m.close(); P.toast('Offer added'); await refresh();
        }, { submitLabel: 'Add offer' });

      grid.onclick = async e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const card = b.closest('.offer'), s = services.find(x => x.id === card.dataset.id), li = b.closest('li'), pr = li && pricing.find(x => x.id === li.dataset.pid);
        const act = b.dataset.act;
        if (act === 'edit') P.form('Edit offer', DETAILS, s, async (v, m) => { P.ck(await P.sb.from('services').update(cleanS(v)).eq('id', s.id)); m.close(); P.toast('Saved'); await refresh(); });
        if (act === 'toggle') await P.run(b, async () => { P.ck(await P.sb.from('services').update({ active: !s.active }).eq('id', s.id)); P.toast(s.active ? 'Offer hidden' : 'Offer is now available'); await refresh(); });
        if (act === 'padd') P.form('Add price option — ' + s.name, PRICE, { color_mode: 'any', sided: 'any' }, async (v, m) => { P.ck(await P.sb.from('service_pricing').insert({ ...cleanP(v), service_id: s.id, active: true })); m.close(); P.toast('Price added'); await refresh(); });
        if (act === 'pedit') P.form('Edit price', [...PRICE, { name: 'active', label: 'Active', type: 'checkbox', checkLabel: 'Use this price' }], pr, async (v, m) => { P.ck(await P.sb.from('service_pricing').update({ ...cleanP(v), active: v.active }).eq('id', pr.id)); m.close(); P.toast('Saved'); await refresh(); });
        if (act === 'pdel' && await P.confirm('Delete this price option?', 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('service_pricing').delete().eq('id', pr.id)); await refresh(); });
        if (act === 'del' && await P.confirm(`Delete “${s.name}” and all of its prices?`, 'Delete')) await P.run(null, async () => {
          const { error } = await P.sb.from('services').delete().eq('id', s.id);
          if (error) throw new Error(error.code === '23503' ? 'This offer is used by existing orders. Use “Hide” instead.' : error.message);
          P.log('delete_offer', 'service', s.id, { name: s.name }); P.toast('Deleted'); await refresh();
        });
      };
      await load();
    }
  });
})();
