(function () {
  const P = window.PSMS;
  const fields = [{ name: 'name', label: 'Name', required: true, maxlength: 120 }, { name: 'phone', label: 'Contact number', maxlength: 40 }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', full: true }];
  P.register('customers', {
    title: 'Customers', icon: '👥',
    render(el) {
      const isAdmin = P.profile.role === 'admin';
      P.listView(el, {
        title: 'Customers', addLabel: '+ Add customer', empty: 'No customers yet.',
        load: async () => P.ck(await P.sb.from('customers').select('*, orders(total,amount_paid,balance,status)').order('name')).map(c => {
          const o = c.orders.filter(x => x.status !== 'Cancelled'); return { ...c, n: o.length, spent: o.reduce((a, x) => a + +x.total, 0), owed: o.reduce((a, x) => a + +x.balance, 0), orders: undefined, _orders: c.orders.length };
        }),
        cols: [{ label: 'ID', k: 'customer_no' }, { label: 'Name', k: 'name', fmt: r => `<b>${P.esc(r.name)}</b>` }, { label: 'Contact', k: 'phone' }, { label: 'Email', k: 'email' }, { label: 'Orders', k: 'n', cls: 'r' }, { label: 'Total purchases', k: 'spent', cls: 'r', fmt: r => P.money(r.spent) }, { label: 'Outstanding', k: 'owed', cls: 'r', fmt: r => `<span style="color:${r.owed > 0 ? 'var(--err)' : 'inherit'}">${P.money(r.owed)}</span>` },
          { label: '', fmt: r => `<button class="btn sm" data-act="edit">Edit</button>${isAdmin ? ' <button class="btn sm" data-act="del">Delete</button>' : ''}` }],
        onAdd: api => P.form('Add customer', fields, {}, async (v, m) => { P.ck(await P.sb.from('customers').insert({ name: v.name, phone: v.phone || null, email: v.email || null, address: v.address || null })); m.close(); P.toast('Customer added'); api.reload(); }),
        onAction: async (a, r, api) => {
          if (a === 'edit') P.form('Edit customer', fields, r, async (v, m) => { P.ck(await P.sb.from('customers').update({ name: v.name, phone: v.phone || null, email: v.email || null, address: v.address || null }).eq('id', r.id)); m.close(); P.toast('Saved'); api.reload(); });
          if (a === 'del') {
            if (r._orders > 0) return P.toast('This customer has order history and cannot be deleted.', 'err');
            if (r.user_id) return P.toast('This customer has an online account. Deactivate it under Users instead.', 'err');
            if (await P.confirm(`Delete ${r.name}? This cannot be undone.`, 'Delete')) { await P.run(null, async () => { P.ck(await P.sb.from('customers').delete().eq('id', r.id)); P.log('delete_customer', 'customer', r.id, { name: r.name }); api.reload(); }); }
          }
        },
        onRow: async r => {
          const m = P.modal(r.name, '<div class="loading"><span class="spin"></span></div>', { wide: true });
          const orders = P.ck(await P.sb.from('orders').select('id,order_no,order_date,status,total,balance,payments(receipt_no,amount,method,paid_at)').eq('customer_id', r.id).order('order_date', { ascending: false }));
          const pays = orders.flatMap(o => o.payments.map(p => ({ ...p, order_no: o.order_no }))).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
          m.el.innerHTML = `<div class="kv"><div><small>Customer ID</small>${P.esc(r.customer_no)}</div><div><small>Contact</small>${P.esc(r.phone || '—')}</div><div><small>Email</small>${P.esc(r.email || '—')}</div><div><small>Address</small>${P.esc(r.address || '—')}</div><div><small>Total purchases</small>${P.money(r.spent)}</div><div><small>Outstanding</small>${P.money(r.owed)}</div></div>
            <h4>Order history</h4>${orders.length ? `<table class="tbl"><tbody>${orders.map(o => `<tr class="click" data-o="${o.id}"><td>${P.esc(o.order_no)}</td><td>${P.date(o.order_date)}</td><td>${P.badge(o.status)}</td><td class="r">${P.money(o.total)}</td><td class="r">${P.money(o.balance)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No orders.</p>'}
            <h4>Payment history</h4>${pays.length ? `<table class="tbl"><tbody>${pays.map(p => `<tr><td>${P.esc(p.receipt_no)}</td><td>${P.esc(p.order_no)}</td><td>${P.date(p.paid_at, true)}</td><td>${P.esc(p.method)}</td><td class="r">${P.money(p.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No payments.</p>'}`;
          m.el.querySelectorAll('[data-o]').forEach(t => t.onclick = () => P.orderDetail(t.dataset.o));
        }
      });
    }
  });
})();
