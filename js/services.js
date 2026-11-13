(function () {
  const P = window.PSMS;
  const F = [{ name: 'name', label: 'Service name', required: true, maxlength: 100 }, { name: 'category', label: 'Category', maxlength: 60 },
    { name: 'description', label: 'Description', type: 'textarea', full: true }, { name: 'turnaround_days', label: 'Turnaround (days)', type: 'number', min: 0, required: true },
    { name: 'rush_fee_percent', label: 'Rush-order fee (%)', type: 'number', min: 0, max: 500, step: '0.01', required: true },
    { name: 'additional_charge', label: 'Additional flat charge (₱)', type: 'number', min: 0, step: '0.01', required: true, help: 'Added once per order line (e.g. setup fee)' },
    { name: 'additional_charge_label', label: 'Charge label', maxlength: 60 }, { name: 'active', label: 'Available', type: 'checkbox', checkLabel: 'Active (visible in POS and customer portal)' }];
  P.register('services', {
    title: 'Products & Services', icon: '🖨',
    render(el) {
      P.listView(el, {
        title: 'Products & Services', addLabel: '+ Add service', empty: 'No services yet.',
        load: async () => P.ck(await P.sb.from('services').select('*').order('name')),
        cols: [{ label: 'Service', k: 'name', fmt: r => `<b>${P.esc(r.name)}</b><div class="muted small">${P.esc(r.description || '')}</div>` }, { label: 'Category', k: 'category' }, { label: 'Turnaround', k: 'turnaround_days', fmt: r => r.turnaround_days + ' day(s)' }, { label: 'Rush fee', k: 'rush_fee_percent', fmt: r => r.rush_fee_percent + '%' }, { label: 'Extra charge', k: 'additional_charge', fmt: r => P.money(r.additional_charge) }, { label: 'Status', k: 'active', fmt: r => r.active ? P.badge('Active').replace('st-active', 'st-ok') : '<span class="badge">Inactive</span>' },
          { label: '', fmt: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm" data-act="del">Delete</button>' }],
        onAdd: api => P.form('Add service', F, { turnaround_days: 1, rush_fee_percent: 0, additional_charge: 0, active: true }, async (v, m) => { P.ck(await P.sb.from('services').insert(clean(v))); P._cat = null; m.close(); P.toast('Service added'); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'edit') P.form('Edit service', F, r, async (v, m) => { P.ck(await P.sb.from('services').update(clean(v)).eq('id', r.id)); P._cat = null; m.close(); P.toast('Saved'); api.reload(); });
          if (a === 'del' && await P.confirm(`Delete “${r.name}” and all of its prices?`, 'Delete')) await P.run(null, async () => {
            const { error } = await P.sb.from('services').delete().eq('id', r.id);
            if (error) throw new Error(error.code === '23503' ? 'This service is used by existing orders. Mark it inactive instead.' : error.message);
            P._cat = null; P.log('delete_service', 'service', r.id, { name: r.name }); api.reload();
          });
        }
      });
    }
  });
  const clean = v => ({ ...v, category: v.category || null, description: v.description || null, additional_charge_label: v.additional_charge_label || null });
})();
