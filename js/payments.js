(function () {
  const P = window.PSMS;
  function view(el, cust) {
    const mgr = !cust;
    P.listView(el, {
      title: cust ? 'My Payments' : 'Payments', empty: 'No payments recorded yet.',
      addLabel: '+ Receive payment', onAdd: mgr ? async api => {
        const orders = P.ck(await P.sb.from('orders').select('id,order_no,balance,customers(name)').gt('balance', 0).neq('status', 'Cancelled').order('order_date', { ascending: false }));
        if (!orders.length) return P.toast('No orders with an outstanding balance.');
        P.form('Select order', [{ name: 'order', label: 'Order with balance', type: 'select', required: true, options: orders.map(o => ({ v: o.id, l: `${o.order_no} — ${o.customers.name} — ${P.money(o.balance)}` })) }], {}, async (v, m) => { m.close(); P.paymentForm(orders.find(o => o.id === v.order), api.reload); }, { submitLabel: 'Continue' });
      } : null,
      filters: [{ label: 'Method', options: ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'], test: (r, v) => r.method === v }],
      load: async () => P.ck(await P.sb.from('payments').select('*, orders(order_no, customers(name))').order('paid_at', { ascending: false }).limit(2000)),
      cols: [{ label: 'Receipt', k: 'receipt_no' }, { label: 'Date', k: 'paid_at', fmt: r => P.date(r.paid_at, true), sort: r => r.paid_at }, { label: 'Order', fmt: r => P.esc(r.orders && r.orders.order_no) }, ...(mgr ? [{ label: 'Customer', fmt: r => P.esc(r.orders && r.orders.customers && r.orders.customers.name) }] : []), { label: 'Method', k: 'method' }, { label: 'Reference', k: 'reference' }, { label: 'Amount', cls: 'r', fmt: r => P.money(r.amount), sort: r => +r.amount }, { label: '', fmt: () => '<button class="btn sm" data-act="rc">Receipt</button>' }],
      onAction: (a, r) => P.receipt.show(r.id)
    });
  }
  P.register('payments', { title: 'Payments', icon: '💳', render: el => view(el, false) });
  P.register('mypayments', { title: 'My Payments', icon: '💳', render: el => view(el, true) });
})();
