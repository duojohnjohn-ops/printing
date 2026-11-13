(function () {
  const P = window.PSMS;
  const F = [{ name: 'name', label: 'Item name', required: true, maxlength: 100 }, { name: 'category', label: 'Category', type: 'select', options: ['Bond Paper', 'Photo Paper', 'Ink', 'Toner', 'Laminating Film', 'Binding Materials', 'Tarpaulin Materials', 'Other Supplies'], required: true },
    { name: 'unit', label: 'Unit (reams, pcs…)', required: true, maxlength: 20 }, { name: 'quantity', label: 'Opening stock', type: 'number', min: 0, step: '0.01', required: true }, { name: 'min_stock', label: 'Minimum stock alert', type: 'number', min: 0, step: '0.01', required: true }, { name: 'unit_cost', label: 'Unit cost (₱)', type: 'number', min: 0, step: '0.01', required: true }, { name: 'active', label: 'Active', type: 'checkbox' }];
  P.register('inventory', {
    title: 'Inventory', icon: '📦',
    render(el) {
      const move = (r, type, api) => P.form({ purchase: 'Record stock purchase', usage: 'Record stock usage', adjustment: 'Adjust stock (set counted quantity)' }[type] + ' — ' + r.name, [
        { name: 'quantity', label: type === 'adjustment' ? 'Counted quantity (' + r.unit + ')' : 'Quantity (' + r.unit + ')', type: 'number', min: 0, step: '0.01', required: true },
        ...(type === 'purchase' ? [{ name: 'unit_cost', label: 'Unit cost (₱)', type: 'number', min: 0, step: '0.01' }] : []), { name: 'notes', label: 'Notes', full: true, maxlength: 300 }],
        { unit_cost: r.unit_cost }, async (v, m) => { await P.api('update-inventory', { inventory_id: r.id, type, quantity: v.quantity, unit_cost: v.unit_cost, notes: v.notes }); m.close(); P.toast('Stock updated'); api.reload(); });
      P.listView(el, {
        title: 'Inventory', addLabel: '+ Add item', empty: 'No inventory items.',
        extra: '<button class="btn" id="rules">Usage rules</button>',
        header: '<div id="invsum" class="muted" style="margin-bottom:10px"></div>',
        onLoad: (rows, root) => { const v = rows.reduce((a, r) => a + r.quantity * r.unit_cost, 0); root.querySelector('#invsum').innerHTML = `Total inventory cost: <b>${P.money(v)}</b> · Low stock: <b>${rows.filter(r => +r.quantity <= +r.min_stock && r.active).length}</b>`; },
        load: async () => P.ck(await P.sb.from('inventory').select('*').order('category').order('name')),
        filters: [{ label: 'Stock', options: ['Low', 'OK'], test: (r, v) => (+r.quantity <= +r.min_stock) === (v === 'Low') }],
        cols: [{ label: 'Item', k: 'name', fmt: r => `<b>${P.esc(r.name)}</b>` }, { label: 'Category', k: 'category' }, { label: 'In stock', k: 'quantity', cls: 'r', fmt: r => `${P.esc(r.quantity)} ${P.esc(r.unit)} ${+r.quantity <= +r.min_stock ? '<span class="badge st-low">LOW</span>' : ''}`, sort: r => +r.quantity }, { label: 'Min', k: 'min_stock', cls: 'r' }, { label: 'Unit cost', cls: 'r', fmt: r => P.money(r.unit_cost) }, { label: 'Value', cls: 'r', fmt: r => P.money(r.quantity * r.unit_cost), sort: r => r.quantity * r.unit_cost },
          { label: '', fmt: () => '<button class="btn sm" data-act="purchase">+ Purchase</button> <button class="btn sm" data-act="usage">Usage</button> <button class="btn sm" data-act="adjustment">Adjust</button> <button class="btn sm" data-act="history">History</button> <button class="btn sm" data-act="edit">Edit</button>' }],
        onAdd: api => P.form('Add inventory item', F, { active: true, quantity: 0, min_stock: 0, unit_cost: 0 }, async (v, m) => { P.ck(await P.sb.from('inventory').insert(v)); m.close(); P.toast('Item added'); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'edit') return P.form('Edit item', F.filter(f => f.name !== 'quantity'), r, async (v, m) => { P.ck(await P.sb.from('inventory').update(v).eq('id', r.id)); m.close(); api.reload(); });
          if (a === 'history') {
            const m = P.modal('History — ' + r.name, '<div class="loading"><span class="spin"></span></div>', { wide: true });
            const tx = P.ck(await P.sb.from('inventory_transactions').select('*').eq('inventory_id', r.id).order('created_at', { ascending: false }).limit(200));
            m.el.innerHTML = tx.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Type</th><th class="r">Change</th><th class="r">Balance</th><th>Notes</th></tr></thead><tbody>${tx.map(t => `<tr><td>${P.date(t.created_at, true)}</td><td>${P.esc(t.type.replace('_', ' '))}</td><td class="r">${t.quantity > 0 ? '+' : ''}${P.esc(t.quantity)}</td><td class="r">${P.esc(t.balance_after ?? '')}</td><td>${P.esc(t.notes || '')}</td></tr>`).join('')}</tbody></table>` : P.empty('No movements yet.');
            return;
          }
          move(r, a, api);
        }
      });
      el.querySelector('#rules').onclick = rules;
    }
  });
  async function rules() {
    const [sv, iv] = await Promise.all([P.sb.from('services').select('id,name').order('name'), P.sb.from('inventory').select('id,name,unit').order('name')]);
    const S = P.ck(sv), I = P.ck(iv);
    const m = P.modal('Material usage rules', '<p class="muted small">Stock is deducted automatically — once per order — when an order is marked Completed. Quantity = amount used per unit (pages × copies). Services without a rule deduct nothing.</p><div id="ru"></div>', { wide: true });
    const f = [{ name: 'service_id', label: 'Service', type: 'select', required: true, options: S.map(s => ({ v: s.id, l: s.name })) }, { name: 'inventory_id', label: 'Material', type: 'select', required: true, options: I.map(s => ({ v: s.id, l: s.name })) }, { name: 'qty_per_unit', label: 'Quantity used per unit', type: 'number', min: 0.0001, step: '0.0001', required: true, help: 'e.g. 0.002 reams per page' }, { name: 'active', label: 'Active', type: 'checkbox' }];
    P.listView(m.el.querySelector('#ru'), {
      title: 'Rules', addLabel: '+ Add rule', empty: 'No rules configured — nothing is auto-deducted.',
      load: async () => P.ck(await P.sb.from('material_usage_rules').select('*, services(name), inventory(name,unit)')),
      cols: [{ label: 'Service', fmt: r => P.esc(r.services.name) }, { label: 'Material', fmt: r => P.esc(r.inventory.name) }, { label: 'Per unit', fmt: r => `${r.qty_per_unit} ${P.esc(r.inventory.unit)}` }, { label: 'Active', fmt: r => r.active ? 'Yes' : 'No' }, { label: '', fmt: () => '<button class="btn sm" data-act="del">Delete</button>' }],
      onAdd: api => P.form('Add rule', f, { active: true }, async (v, mm) => { P.ck(await P.sb.from('material_usage_rules').insert(v)); mm.close(); api.reload(); }),
      onAction: async (a, r, api) => { if (await P.confirm('Delete this rule?', 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('material_usage_rules').delete().eq('id', r.id)); api.reload(); }); }
    });
  }
})();
