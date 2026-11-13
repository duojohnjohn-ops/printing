(function () {
  const P = window.PSMS;
  P.register('dashboard', {
    title: 'Dashboard', icon: '📊',
    async render(el) {
      await P.sb.rpc('refresh_alerts'); if (P.refreshBell) P.refreshBell();
      const [st, d, w, m, rec, pay, inv] = await Promise.all([
        P.sb.rpc('dashboard_stats'), P.sb.rpc('sales_series', { p_gran: 'day', p_count: 14 }), P.sb.rpc('sales_series', { p_gran: 'week', p_count: 8 }), P.sb.rpc('sales_series', { p_gran: 'month', p_count: 12 }),
        P.sb.from('orders').select('id,order_no,status,total,order_date,customers(name)').order('order_date', { ascending: false }).limit(8),
        P.sb.from('payments').select('id,receipt_no,amount,method,paid_at,orders(order_no)').order('paid_at', { ascending: false }).limit(8),
        P.sb.from('inventory').select('name,quantity,min_stock,unit').eq('active', true)
      ]);
      [st, d, w, m, rec, pay, inv].forEach(r => { if (r.error) throw r.error; });
      const s = st.data, low = inv.data.filter(i => +i.quantity <= +i.min_stock);
      const card = (label, val, cls) => `<div class="stat ${cls || ''}"><small>${label}</small><strong>${val}</strong></div>`;
      const profit = s.collected_month - s.expenses_month;
      el.innerHTML = `<div class="stats">
        ${card('Total Sales Today (gross)', P.money(s.sales_today))}${card('Payments Received Today', P.money(s.collected_today), 'good')}
        ${card('Total Sales This Month (gross)', P.money(s.sales_month))}${card('Payments Received This Month', P.money(s.collected_month), 'good')}
        ${card('Total Orders', s.total_orders)}${card('Pending Orders', s.pending, 'warn')}${card('Orders In Production', s.in_production, 'warn')}${card('Completed Orders', s.completed, 'good')}
        ${card('Expenses This Month', P.money(s.expenses_month))}${card('Estimated Net Profit (month)', P.money(profit), profit < 0 ? 'bad' : 'good')}
        ${card('Unpaid Balances', P.money(s.unpaid), 'bad')}${card('Low Stock Items', low.length, low.length ? 'bad' : '')}</div>
        <p class="muted small">Gross sales = value of orders placed. Payments received = cash actually collected. Estimated net profit = payments received − expenses recorded this month.</p>
        <div class="charts"><div class="card"><h3>Daily sales (14 days)</h3><canvas id="c1"></canvas></div><div class="card"><h3>Weekly sales (8 weeks)</h3><canvas id="c2"></canvas></div><div class="card"><h3>Monthly revenue (12 months)</h3><canvas id="c3"></canvas></div>
        <div class="card"><h3>Popular printing services</h3>${s.popular.length ? `<canvas id="c4"></canvas>` : P.empty('No orders yet')}</div></div>
        <div class="two"><div class="card"><h3>Recent orders</h3>${rec.data.length ? `<table class="tbl"><tbody>${rec.data.map(o => `<tr><td>${P.esc(o.order_no)}<div class="muted small">${P.esc(o.customers && o.customers.name)}</div></td><td>${P.badge(o.status)}</td><td class="r">${P.money(o.total)}</td></tr>`).join('')}</tbody></table>` : P.empty('No orders yet')}</div>
        <div class="card"><h3>Recent transactions</h3>${pay.data.length ? `<table class="tbl"><tbody>${pay.data.map(p => `<tr><td>${P.esc(p.receipt_no)}<div class="muted small">${P.esc(p.orders && p.orders.order_no)} · ${P.date(p.paid_at, true)}</div></td><td>${P.esc(p.method)}</td><td class="r">${P.money(p.amount)}</td></tr>`).join('')}</tbody></table>` : P.empty('No payments yet')}</div></div>
        <div class="card"><h3>Inventory alerts</h3>${low.length ? `<table class="tbl"><tbody>${low.map(i => `<tr><td>${P.esc(i.name)}</td><td>${P.esc(i.quantity)} ${P.esc(i.unit)} left</td><td><span class="badge st-low">Min ${P.esc(i.min_stock)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">All stock levels are healthy.</p>'}</div>`;
      const lab = (rows, f) => rows.map(r => new Date(r.period + 'T00:00:00').toLocaleDateString('en-PH', f));
      const series = rows => [{ label: 'Gross sales', data: rows.map(r => +r.sales), backgroundColor: '#1e4f9c', borderColor: '#1e4f9c' }, { label: 'Payments received', data: rows.map(r => +r.collected), backgroundColor: '#e8710a', borderColor: '#e8710a' }];
      const mk = (id, type, labels, datasets) => P.charts.push(new Chart(el.querySelector('#' + id), { type, data: { labels, datasets }, options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } } }));
      mk('c1', 'bar', lab(d.data, { month: 'short', day: 'numeric' }), series(d.data));
      mk('c2', 'line', lab(w.data, { month: 'short', day: 'numeric' }), series(w.data));
      mk('c3', 'bar', lab(m.data, { month: 'short', year: '2-digit' }), series(m.data));
      if (s.popular.length) P.charts.push(new Chart(el.querySelector('#c4'), { type: 'doughnut', data: { labels: s.popular.map(p => p.name), datasets: [{ data: s.popular.map(p => +p.qty), backgroundColor: ['#1e4f9c', '#e8710a', '#1a8f4c', '#7c3aed', '#0891b2', '#b7791f'] }] }, options: { plugins: { legend: { position: 'bottom' } } } }));
    }
  });
})();
