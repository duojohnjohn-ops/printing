(function () {
  const P = window.PSMS;
  P.register('employees', {
    title: 'Employees', icon: '🧑‍💼',
    async render(el) {
      const prof = P.ck(await P.sb.from('profiles').select('id,full_name,role').neq('role', 'customer').order('full_name'));
      const F = [{ name: 'full_name', label: 'Full name', required: true, maxlength: 120 }, { name: 'position', label: 'Position', maxlength: 80 }, { name: 'phone', label: 'Phone', maxlength: 40 }, { name: 'monthly_salary', label: 'Monthly salary (₱)', type: 'number', min: 0, step: '0.01', required: true }, { name: 'hired_on', label: 'Date hired', type: 'date' }, { name: 'profile_id', label: 'Linked system account', type: 'select', options: prof.map(p => ({ v: p.id, l: `${p.full_name} (${p.role})` })) }, { name: 'active', label: 'Active', type: 'checkbox' }];
      const out = v => ({ ...v, position: v.position || null, phone: v.phone || null, hired_on: v.hired_on || null, profile_id: v.profile_id || null });
      P.listView(el, {
        title: 'Employees', addLabel: '+ Add employee', empty: 'No employees recorded.',
        load: async () => P.ck(await P.sb.from('employees').select('*, profiles(role)').order('full_name')),
        cols: [{ label: 'Name', k: 'full_name', fmt: r => `<b>${P.esc(r.full_name)}</b>` }, { label: 'Position', k: 'position' }, { label: 'Phone', k: 'phone' }, { label: 'Hired', fmt: r => P.date(r.hired_on) }, { label: 'Salary', cls: 'r', fmt: r => P.money(r.monthly_salary), sort: r => +r.monthly_salary }, { label: 'Status', fmt: r => r.active ? 'Active' : 'Inactive' }, { label: '', fmt: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm" data-act="del">Delete</button>' }],
        onAdd: api => P.form('Add employee', F, { active: true, monthly_salary: 0 }, async (v, m) => { P.ck(await P.sb.from('employees').insert(out(v))); m.close(); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'edit') P.form('Edit employee', F, r, async (v, m) => { P.ck(await P.sb.from('employees').update(out(v)).eq('id', r.id)); m.close(); api.reload(); });
          if (a === 'del' && await P.confirm(`Delete ${r.full_name}?`, 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('employees').delete().eq('id', r.id)); api.reload(); });
        }
      });
    }
  });
})();
