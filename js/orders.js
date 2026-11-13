(function () {
  const P = window.PSMS;
  const FLOW = ['Pending', 'Approved', 'Designing', 'Printing', 'Finishing', 'Ready for Pickup', 'Completed'];
  const tracker = s => s === 'Cancelled' ? '<div class="banner err">This order was cancelled.</div>' :
    `<ol class="tracker">${FLOW.map((x, i) => { const k = FLOW.indexOf(s); return `<li class="${i < k ? 'done' : i === k ? 'now' : ''}"><span>${i < k ? '✓' : i + 1}</span><em>${x}</em></li>`; }).join('')}</ol>`;
  const spec = i => [i.paper_size, i.paper_type, i.color_mode === 'bw' ? 'B&W' : 'Color', i.sided === 'double' ? 'Double-sided' : 'Single-sided'].filter(Boolean).join(' · ');
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  // Shared payment dialog (orders + payments modules)
  P.paymentForm = function (order, done) {
    P.form('Receive payment — ' + order.order_no, [
      { name: 'amount', label: 'Amount to pay (balance ' + P.money(order.balance) + ')', type: 'number', step: '0.01', min: 0.01, required: true },
      { name: 'method', label: 'Payment method', type: 'select', options: ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'], required: true },
      { name: 'tendered', label: 'Cash tendered', type: 'number', step: '0.01', min: 0, help: 'Cash only — used to compute change' },
      { name: 'reference', label: 'Reference no. (e-wallet / bank)', maxlength: 100 }
    ], { amount: order.balance, tendered: order.balance }, async (v, m) => {
      const r = await P.api('process-payment', { order_id: order.id, amount: v.amount, method: v.method, tendered: v.tendered, reference: v.reference });
      m.close(); P.toast('Payment recorded' + (r.change > 0 ? ' — change ' + P.money(r.change) : ''));
      P.receipt.show(r.payment_id); if (done) done();
    }, { submitLabel: 'Record payment' });
  };

  P.orderDetail = async function (id, onChange) {
    const m = P.modal('Order', '<div class="loading"><span class="spin"></span></div>', { wide: true });
    const role = P.profile.role, mgr = role === 'admin' || role === 'cashier', money = role !== 'staff';
    async function draw() {
      const { data: o, error } = await P.sb.from('orders').select('*, customers(*), profiles(full_name), order_items(*), order_files(*), payments(*)').eq('id', id).single();
      if (error) { m.el.innerHTML = `<div class="error">${P.esc(P.err(error))}</div>`; return; }
      let staff = [];
      if (mgr) staff = P.ck(await P.sb.from('profiles').select('id,full_name').eq('role', 'staff').eq('active', true).order('full_name')) || [];
      m.setTitle('Order ' + o.order_no);
      const items = o.order_items;
      m.el.innerHTML = `${tracker(o.status)}
        <div class="kv"><div><small>Customer</small>${P.esc(o.customers.name)}<br><span class="muted small">${P.esc(o.customers.phone || '')}</span></div><div><small>Status</small>${P.badge(o.status)}</div><div><small>Ordered</small>${P.date(o.order_date, true)}</div><div><small>Expected</small>${P.date(o.expected_date)}</div>${money ? `<div><small>Payment</small>${P.badge(o.payment_status)}</div>` : ''}<div><small>Assigned to</small>${P.esc(o.profiles ? o.profiles.full_name : 'Unassigned')}</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Service</th><th>Specification</th><th class="r">Pages × Copies</th>${money ? '<th class="r">Unit</th><th class="r">Total</th>' : ''}</tr></thead><tbody>${items.map(i => `<tr><td>${P.esc(i.service_name)}${i.rush ? ' <span class="badge st-pending">RUSH</span>' : ''}${i.instructions ? `<div class="muted small">${P.esc(i.instructions)}</div>` : ''}</td><td>${P.esc(spec(i))}</td><td class="r">${i.pages} × ${i.copies}</td>${money ? `<td class="r">${P.money(i.unit_price)}</td><td class="r">${P.money(i.total)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${o.special_instructions ? `<p><b>Instructions:</b> ${P.esc(o.special_instructions)}</p>` : ''}
        ${money ? `<div class="totals"><div><span>Subtotal</span><span>${P.money(o.subtotal)}</span></div>${+o.discount ? `<div><span>Discount</span><span>−${P.money(o.discount)}</span></div>` : ''}${+o.rush_fee ? `<div><span>Rush fee</span><span>${P.money(o.rush_fee)}</span></div>` : ''}<div class="grand"><span>Total</span><span>${P.money(o.total)}</span></div><div><span>Paid</span><span>${P.money(o.amount_paid)}</span></div><div><b>Balance</b><b>${P.money(o.balance)}</b></div></div>` : ''}
        <h4>Files</h4>${o.order_files.length ? o.order_files.map(f => `<div class="row" style="margin:4px 0"><span style="flex:1">📎 ${P.esc(f.file_name)} <span class="muted small">${kb(f.file_size || 0)}</span></span><button class="btn sm" data-view="${f.id}">Preview</button><button class="btn sm" data-dl="${f.id}">Download</button></div>`).join('') : '<p class="muted">No files uploaded.</p>'}
        ${money ? `<h4>Payments</h4>${o.payments.length ? `<table class="tbl"><tbody>${o.payments.map(p => `<tr><td>${P.esc(p.receipt_no)}</td><td>${P.date(p.paid_at, true)}</td><td>${P.esc(p.method)}</td><td class="r">${P.money(p.amount)}</td><td class="r"><button class="btn sm" data-rc="${p.id}">Receipt</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No payments yet.</p>'}` : ''}
        ${role === 'staff' ? `<h4>Production</h4><textarea class="inp" id="pn" rows="3" placeholder="Production notes…">${P.esc(o.production_notes || '')}</textarea><div class="actions" id="sa">${['Designing', 'Printing', 'Finishing', 'Ready for Pickup', 'Completed'].filter(s => s !== o.status).map(s => `<button class="btn sm" data-st="${s}">Mark ${s}</button>`).join('')}<button class="btn primary" id="sn">Save notes</button></div>` : ''}
        ${mgr ? `<h4>Manage</h4><div class="grid3"><div class="fld"><label>Status</label><select class="inp" id="ms">${P.STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="fld"><label>Assigned staff</label><select class="inp" id="ma"><option value="">Unassigned</option>${staff.map(s => `<option value="${s.id}" ${s.id === o.assigned_to ? 'selected' : ''}>${P.esc(s.full_name)}</option>`).join('')}</select></div><div class="fld"><label>Expected date</label><input class="inp" type="date" id="me" value="${o.expected_date || ''}"></div></div>
        <div class="actions"><button class="btn" id="jo">Job order slip</button><button class="btn" id="iv">Invoice</button>${+o.balance > 0 && o.status !== 'Cancelled' ? '<button class="btn" id="pm">Receive payment</button>' : ''}${o.status !== 'Cancelled' ? '<button class="btn danger" id="cx">Cancel order</button>' : ''}<button class="btn primary" id="sv">Save changes</button></div>` : ''}
        ${!mgr && role === 'customer' ? `<div class="actions"><button class="btn" id="iv">View invoice</button></div>` : ''}`;
      const q = s => m.el.querySelector(s), after = async () => { if (onChange) onChange(); await draw(); };
      const file = id2 => o.order_files.find(f => f.id === id2);
      m.el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => P.run(b, async () => window.open(await P.signed('order-files', file(b.dataset.view).storage_path), '_blank', 'noopener')));
      m.el.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => P.run(b, async () => { const f = file(b.dataset.dl); window.location.href = await P.signed('order-files', f.storage_path, f.file_name); }));
      m.el.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => P.receipt.show(b.dataset.rc));
      if (q('#iv')) q('#iv').onclick = () => P.receipt.invoice(id);
      if (role === 'staff') {
        m.el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => P.run(b, async () => { P.ck(await P.sb.rpc('staff_update_job', { p_order: id, p_status: b.dataset.st, p_notes: q('#pn').value })); P.toast('Status updated'); await after(); }));
        q('#sn').onclick = e => P.run(e.target, async () => { P.ck(await P.sb.rpc('staff_update_job', { p_order: id, p_status: null, p_notes: q('#pn').value })); P.toast('Notes saved'); });
      }
      if (mgr) {
        q('#jo').onclick = () => P.receipt.jobOrder(id);
        if (q('#pm')) q('#pm').onclick = () => P.paymentForm(o, after);
        q('#sv').onclick = e => P.run(e.target, async () => {
          P.ck(await P.sb.from('orders').update({ status: q('#ms').value, assigned_to: q('#ma').value || null, expected_date: q('#me').value || null }).eq('id', id));
          P.log('update_order', 'order', id, { status: q('#ms').value }); P.toast('Order updated'); await after();
        });
        if (q('#cx')) q('#cx').onclick = async () => {
          if (!(await P.confirm(+o.amount_paid > 0 ? `Order ${o.order_no} already has ${P.money(o.amount_paid)} in payments. Cancel anyway? Refunds must be handled manually.` : `Cancel order ${o.order_no}?`, 'Cancel order'))) return;
          await P.run(null, async () => { P.ck(await P.sb.from('orders').update({ status: 'Cancelled' }).eq('id', id)); P.toast('Order cancelled'); await after(); });
        };
      }
    }
    draw();
  };

  function list(el, variant) {
    const mgr = variant === 'mgr', cust = variant === 'customer';
    const cols = [{ label: 'Order No', k: 'order_no', fmt: r => `<b>${P.esc(r.order_no)}</b>` }];
    if (!cust) cols.push({ label: 'Customer', k: 'cn', fmt: r => P.esc(r.customers && r.customers.name), sort: r => r.customers && r.customers.name });
    cols.push({ label: 'Date', k: 'order_date', fmt: r => P.date(r.order_date), sort: r => r.order_date }, { label: 'Due', k: 'expected_date', fmt: r => P.date(r.expected_date) }, { label: 'Status', k: 'status', fmt: r => P.badge(r.status) });
    if (variant !== 'staff') cols.push({ label: 'Total', k: 'total', cls: 'r', fmt: r => P.money(r.total), sort: r => +r.total }, { label: 'Balance', k: 'balance', cls: 'r', fmt: r => P.money(r.balance), sort: r => +r.balance });
    if (mgr) cols.push({ label: 'Assigned', k: 'as', fmt: r => P.esc(r.profiles ? r.profiles.full_name : '—') });
    const filters = [{ label: 'Status', options: P.STATUSES, test: (r, v) => r.status === v }];
    if (variant !== 'staff') filters.push({ label: 'Payment', options: ['Unpaid', 'Partial', 'Paid'], test: (r, v) => r.payment_status === v });
    return P.listView(el, {
      title: variant === 'staff' ? 'My Assigned Jobs' : cust ? 'My Orders' : 'Orders', filters, cols, empty: 'No orders found.',
      addLabel: '+ New order', onAdd: variant === 'staff' ? null : () => { location.hash = cust ? '#/neworder' : '#/pos'; },
      load: async () => P.ck(await P.sb.from('orders').select(cust ? '*, customers(name)' : '*, customers(name,customer_no), profiles(full_name)').order('order_date', { ascending: false }).limit(2000)),
      onRow: (r, api) => P.orderDetail(r.id, api.reload)
    });
  }
  P.register('orders', { title: 'Orders', icon: '🧾', render: el => { list(el, 'mgr'); } });
  P.register('jobs', { title: 'My Jobs', icon: '🛠', render: el => { list(el, 'staff'); } });
  P.register('myorders', { title: 'My Orders', icon: '🧾', render: el => { list(el, 'customer'); } });
})();
