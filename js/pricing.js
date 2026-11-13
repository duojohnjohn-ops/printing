(function () {
  const P = window.PSMS;
  const COLOR = { any: 'Any', bw: 'Black & White', color: 'Colored' }, SIDED = { any: 'Any', single: 'Single-sided', double: 'Double-sided' };
  P.register('pricing', {
    title: 'Pricing', icon: '💲',
    async render(el) {
      const services = P.ck(await P.sb.from('services').select('id,name').order('name'));
      if (!services.length) { el.innerHTML = P.empty('Add a service first.'); return; }
      el.innerHTML = `<div class="toolbar"><h2>Pricing Management</h2><div class="tools"><select class="inp" id="svsel">${services.map(s => `<option value="${s.id}">${P.esc(s.name)}</option>`).join('')}</select></div></div><div id="pr"></div><div id="qd" style="margin-top:20px"></div>`;
      const sel = el.querySelector('#svsel'); let prApi;
      const PF = [{ name: 'paper_size', label: 'Paper size', help: 'Leave blank = applies to any size' }, { name: 'paper_type', label: 'Paper type', help: 'Leave blank = any type' },
        { name: 'color_mode', label: 'Color', type: 'select', required: true, options: [{ v: 'any', l: 'Any' }, { v: 'bw', l: 'Black & White' }, { v: 'color', l: 'Colored' }] },
        { name: 'sided', label: 'Sides', type: 'select', required: true, options: [{ v: 'any', l: 'Any' }, { v: 'single', l: 'Single-sided' }, { v: 'double', l: 'Double-sided' }] },
        { name: 'unit_price', label: 'Price per unit (₱)', type: 'number', min: 0, step: '0.01', required: true }, { name: 'active', label: 'Active', type: 'checkbox' }];
      const rowOut = v => ({ paper_size: v.paper_size || null, paper_type: v.paper_type || null, color_mode: v.color_mode, sided: v.sided, unit_price: v.unit_price, active: v.active });
      const draw = () => {
        prApi = P.listView(el.querySelector('#pr'), {
          title: 'Prices for selected service', addLabel: '+ Add price', empty: 'No prices set — this service cannot be ordered yet.',
          load: async () => P.ck(await P.sb.from('service_pricing').select('*').eq('service_id', sel.value).order('paper_size')),
          cols: [{ label: 'Paper size', fmt: r => P.esc(r.paper_size || 'Any') }, { label: 'Paper type', fmt: r => P.esc(r.paper_type || 'Any') }, { label: 'Color', fmt: r => COLOR[r.color_mode] }, { label: 'Sides', fmt: r => SIDED[r.sided] }, { label: 'Unit price', k: 'unit_price', cls: 'r', fmt: r => P.money(r.unit_price), sort: r => +r.unit_price }, { label: 'Active', fmt: r => r.active ? 'Yes' : 'No' }, { label: '', fmt: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm" data-act="del">Delete</button>' }],
          onAdd: api => P.form('Add price', PF, { color_mode: 'any', sided: 'any', active: true }, async (v, m) => { P.ck(await P.sb.from('service_pricing').insert({ ...rowOut(v), service_id: sel.value })); P._cat = null; m.close(); api.reload(); }),
          onAction: async (a, r, api) => {
            if (a === 'edit') P.form('Edit price', PF, r, async (v, m) => { P.ck(await P.sb.from('service_pricing').update(rowOut(v)).eq('id', r.id)); P._cat = null; m.close(); api.reload(); });
            if (a === 'del' && await P.confirm('Delete this price row?', 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('service_pricing').delete().eq('id', r.id)); P._cat = null; api.reload(); });
          }
        });
      };
      sel.onchange = draw; draw();
      const QF = [{ name: 'service_id', label: 'Applies to', type: 'select', options: services.map(s => ({ v: s.id, l: s.name })), help: 'Blank = all services' }, { name: 'min_qty', label: 'Minimum quantity (pages × copies)', type: 'number', min: 1, required: true }, { name: 'discount_percent', label: 'Discount (%)', type: 'number', min: 0, max: 100, step: '0.01', required: true }, { name: 'active', label: 'Active', type: 'checkbox' }];
      const nm = id => (services.find(s => s.id === id) || {}).name || 'All services';
      P.listView(el.querySelector('#qd'), {
        title: 'Quantity discounts', addLabel: '+ Add discount', empty: 'No quantity discounts.',
        load: async () => P.ck(await P.sb.from('quantity_discounts').select('*').order('min_qty')),
        cols: [{ label: 'Service', fmt: r => P.esc(nm(r.service_id)) }, { label: 'From quantity', k: 'min_qty', cls: 'r' }, { label: 'Discount', cls: 'r', fmt: r => r.discount_percent + '%' }, { label: 'Active', fmt: r => r.active ? 'Yes' : 'No' }, { label: '', fmt: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm" data-act="del">Delete</button>' }],
        onAdd: api => P.form('Add quantity discount', QF, { active: true }, async (v, m) => { P.ck(await P.sb.from('quantity_discounts').insert({ ...v, service_id: v.service_id || null })); P._cat = null; m.close(); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'edit') P.form('Edit discount', QF, r, async (v, m) => { P.ck(await P.sb.from('quantity_discounts').update({ ...v, service_id: v.service_id || null }).eq('id', r.id)); P._cat = null; m.close(); api.reload(); });
          if (a === 'del' && await P.confirm('Delete this discount?', 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('quantity_discounts').delete().eq('id', r.id)); P._cat = null; api.reload(); });
        }
      });
    }
  });
  P.register('pricelist', {
    title: 'Services & Prices', icon: '💲',
    async render(el) {
      const c = await P.catalog(true);
      el.innerHTML = `<div class="toolbar"><h2>Available Services & Prices</h2></div>` + (c.services.map(s => {
        const rows = c.pricing.filter(p => p.service_id === s.id), disc = c.discounts.filter(d => !d.service_id || d.service_id === s.id);
        return `<div class="price-card"><h3>${P.esc(s.name)}</h3><p class="muted">${P.esc(s.description || '')}</p>${rows.length ? `<table class="tbl"><thead><tr><th>Size</th><th>Type</th><th>Color</th><th>Sides</th><th class="r">Price</th></tr></thead><tbody>${rows.map(r => `<tr><td>${P.esc(r.paper_size || '—')}</td><td>${P.esc(r.paper_type || '—')}</td><td>${COLOR[r.color_mode]}</td><td>${SIDED[r.sided]}</td><td class="r">${P.money(r.unit_price)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Price on request.</p>'}<p class="small muted">Turnaround ~${s.turnaround_days} day(s)${+s.rush_fee_percent ? ` · Rush +${s.rush_fee_percent}%` : ''}${+s.additional_charge ? ` · ${P.esc(s.additional_charge_label || 'Extra charge')} ${P.money(s.additional_charge)}` : ''}${disc.length ? ' · Volume discounts: ' + disc.sort((a, b) => a.min_qty - b.min_qty).map(d => `${d.min_qty}+ → ${d.discount_percent}%`).join(', ') : ''}</p></div>`;
      }).join('') || P.empty('No services available.'));
    }
  });
})();
