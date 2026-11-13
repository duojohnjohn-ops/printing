(function () {
  const P = window.PSMS;
  const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  P.register('expenses', {
    title: 'Expenses', icon: '🧮',
    async render(el) {
      let cats = P.ck(await P.sb.from('expense_categories').select('*').order('name'));
      const fields = () => [{ name: 'category_id', label: 'Category', type: 'select', required: true, options: cats.map(c => ({ v: c.id, l: c.name })) }, { name: 'amount', label: 'Amount (₱)', type: 'number', min: 0.01, step: '0.01', required: true }, { name: 'expense_date', label: 'Date', type: 'date', required: true }, { name: 'payment_method', label: 'Payment method', type: 'select', options: ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'] }, { name: 'description', label: 'Description', full: true, maxlength: 300 }, { name: 'file', label: 'Receipt attachment (PDF/JPG/PNG, max 10 MB)', type: 'file', accept: '.pdf,.jpg,.jpeg,.png', full: true }];
      async function save(v, id) {
        const rec = { category_id: v.category_id, amount: v.amount, expense_date: v.expense_date, payment_method: v.payment_method || null, description: v.description || null };
        if (v.file) {
          const ext = v.file.name.split('.').pop().toLowerCase();
          if (!MIME[ext]) throw new Error('Receipt must be PDF, JPG or PNG'); if (v.file.size > 10485760) throw new Error('Receipt is larger than 10 MB');
          const path = `${crypto.randomUUID()}-${v.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
          const { error } = await P.sb.storage.from('expense-receipts').upload(path, v.file, { contentType: MIME[ext] }); if (error) throw error; rec.receipt_path = path;
        }
        if (id) P.ck(await P.sb.from('expenses').update(rec).eq('id', id)); else P.ck(await P.sb.from('expenses').insert({ ...rec, created_by: P.user.id }));
      }
      P.listView(el, {
        title: 'Expenses', addLabel: '+ Add expense', empty: 'No expenses recorded.', extra: '<button class="btn" id="cats">Categories</button>',
        header: '<div id="exsum" class="muted" style="margin-bottom:10px"></div>',
        onLoad: (rows, root) => { root.querySelector('#exsum').innerHTML = `Total listed: <b>${P.money(rows.reduce((a, r) => a + +r.amount, 0))}</b>`; },
        filters: [{ label: 'Category', options: cats.map(c => c.name), test: (r, v) => r.expense_categories && r.expense_categories.name === v }],
        load: async () => P.ck(await P.sb.from('expenses').select('*, expense_categories(name)').order('expense_date', { ascending: false }).limit(2000)),
        cols: [{ label: 'Date', k: 'expense_date', fmt: r => P.date(r.expense_date) }, { label: 'Category', fmt: r => P.esc(r.expense_categories && r.expense_categories.name) }, { label: 'Description', k: 'description' }, { label: 'Method', k: 'payment_method' }, { label: 'Amount', cls: 'r', fmt: r => P.money(r.amount), sort: r => +r.amount }, { label: '', fmt: r => `${r.receipt_path ? '<button class="btn sm" data-act="rc">Receipt</button> ' : ''}<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm" data-act="del">Delete</button>` }],
        onAdd: api => P.form('Add expense', fields(), { expense_date: P.today() }, async (v, m) => { await save(v); m.close(); P.toast('Expense saved'); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'rc') return P.run(null, async () => window.open(await P.signed('expense-receipts', r.receipt_path), '_blank', 'noopener'));
          if (a === 'edit') P.form('Edit expense', fields(), r, async (v, m) => { await save(v, r.id); m.close(); api.reload(); });
          if (a === 'del' && await P.confirm('Delete this expense?', 'Delete')) await P.run(null, async () => { P.ck(await P.sb.from('expenses').delete().eq('id', r.id)); P.log('delete_expense', 'expense', r.id, { amount: r.amount }); api.reload(); });
        }
      });
      el.querySelector('#cats').onclick = () => {
        const m = P.modal('Expense categories', `<ul>${cats.map(c => `<li>${P.esc(c.name)}</li>`).join('')}</ul><form class="row"><input class="inp" name="n" placeholder="New category" required maxlength="60"><button class="btn primary">Add</button></form>`);
        m.el.querySelector('form').onsubmit = e => { e.preventDefault(); P.run(null, async () => { P.ck(await P.sb.from('expense_categories').insert({ name: e.target.n.value.trim() })); m.close(); P.toast('Category added — reopen Expenses to use it'); }); };
      };
    }
  });
})();
