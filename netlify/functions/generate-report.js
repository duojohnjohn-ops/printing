const { handler, httpError } = require('./_lib');
const TZ = 'Asia/Manila';
const day = ts => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
const monday = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
async function all(build) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000 || from > 50000) break;
    from += 1000;
  }
  return out;
}
const M = 'money', I = 'int', T = 'text', D = 'date';

exports.handler = handler(['admin'], async ({ db, body }) => {
  const { type, from, to } = body;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from || '') || !re.test(to || '') || from > to) throw httpError(400, 'Choose a valid date range');
  const f = from + 'T00:00:00+08:00', t = to + 'T23:59:59.999+08:00';
  const sum = (rows, k) => r2(rows.reduce((a, r) => a + Number(r[k] || 0), 0));
  const range = `${from} to ${to}`;

  if (type.startsWith('sales_') || type === 'profit') {
    const key = { sales_daily: d => d, sales_weekly: monday, sales_monthly: d => d.slice(0, 7), sales_annual: d => d.slice(0, 4), profit: d => d.slice(0, 7) }[type];
    if (!key) throw httpError(400, 'Unknown report');
    const orders = await all(() => db.from('orders').select('order_date,total,discount').neq('status', 'Cancelled').gte('order_date', f).lte('order_date', t));
    const pays = await all(() => db.from('payments').select('paid_at,amount').gte('paid_at', f).lte('paid_at', t));
    const exps = type === 'profit' ? await all(() => db.from('expenses').select('expense_date,amount').gte('expense_date', from).lte('expense_date', to)) : [];
    const b = {};
    const get = p => (b[p] = b[p] || { period: type === 'sales_weekly' ? 'Week of ' + p : p, orders: 0, gross: 0, discount: 0, collected: 0, expenses: 0 });
    orders.forEach(o => { const x = get(key(day(o.order_date))); x.orders++; x.gross += Number(o.total); x.discount += Number(o.discount); });
    pays.forEach(p => { get(key(day(p.paid_at))).collected += Number(p.amount); });
    exps.forEach(e => { get(key(e.expense_date)).expenses += Number(e.amount); });
    const rows = Object.keys(b).sort().map(k => { const x = b[k]; x.profit = x.collected - x.expenses; Object.keys(x).forEach(h => typeof x[h] === 'number' && (x[h] = r2(x[h]))); return x; });
    if (type === 'profit') return {
      title: 'Profit Report', range,
      columns: [{ key: 'period', label: 'Month', type: T }, { key: 'gross', label: 'Gross Sales', type: M }, { key: 'collected', label: 'Payments Received', type: M }, { key: 'expenses', label: 'Expenses', type: M }, { key: 'profit', label: 'Est. Profit', type: M }],
      rows, summary: [['Gross sales', sum(rows, 'gross'), M], ['Payments received', sum(rows, 'collected'), M], ['Expenses', sum(rows, 'expenses'), M], ['Estimated profit (payments received - expenses)', sum(rows, 'profit'), M]]
    };
    const label = { sales_daily: 'Daily', sales_weekly: 'Weekly', sales_monthly: 'Monthly', sales_annual: 'Annual' }[type];
    return {
      title: label + ' Sales Report', range,
      columns: [{ key: 'period', label: 'Period', type: T }, { key: 'orders', label: 'Orders', type: I }, { key: 'gross', label: 'Gross Sales', type: M }, { key: 'discount', label: 'Discounts', type: M }, { key: 'collected', label: 'Payments Received', type: M }],
      rows, summary: [['Orders', sum(rows, 'orders'), I], ['Gross sales', sum(rows, 'gross'), M], ['Payments received', sum(rows, 'collected'), M]]
    };
  }

  if (type === 'orders' || type === 'unpaid') {
    let q = () => db.from('orders').select('order_no,order_date,status,payment_status,total,amount_paid,balance,expected_date,customers(name),profiles(full_name)').gte('order_date', f).lte('order_date', t).order('order_date', { ascending: false });
    const data = await all(type === 'unpaid' ? () => q().neq('status', 'Cancelled').gt('balance', 0) : q);
    const rows = data.map(o => ({ order_no: o.order_no, date: day(o.order_date), customer: o.customers && o.customers.name, status: o.status, payment: o.payment_status, total: Number(o.total), paid: Number(o.amount_paid), balance: Number(o.balance), due: o.expected_date, staff: o.profiles && o.profiles.full_name }));
    const cols = [{ key: 'order_no', label: 'Order No', type: T }, { key: 'date', label: 'Date', type: D }, { key: 'customer', label: 'Customer', type: T }, { key: 'status', label: 'Status', type: T }, { key: 'total', label: 'Total', type: M }, { key: 'paid', label: 'Paid', type: M }, { key: 'balance', label: 'Balance', type: M }];
    return type === 'unpaid'
      ? { title: 'Unpaid Balance Report', range, columns: cols, rows, summary: [['Orders with balance', rows.length, I], ['Total outstanding', sum(rows, 'balance'), M]] }
      : { title: 'Order Report', range, columns: cols.slice(0, 4).concat([{ key: 'payment', label: 'Payment', type: T }, { key: 'due', label: 'Due', type: D }], cols.slice(4), [{ key: 'staff', label: 'Assigned', type: T }]), rows, summary: [['Orders', rows.length, I], ['Total value', sum(rows, 'total'), M], ['Collected', sum(rows, 'paid'), M]] };
  }

  if (type === 'customers') {
    const custs = await all(() => db.from('customers').select('id,customer_no,name,phone,email').order('name'));
    const orders = await all(() => db.from('orders').select('customer_id,total,amount_paid,balance').neq('status', 'Cancelled').gte('order_date', f).lte('order_date', t));
    const agg = {}; orders.forEach(o => { const a = (agg[o.customer_id] = agg[o.customer_id] || { n: 0, total: 0, paid: 0, bal: 0 }); a.n++; a.total += +o.total; a.paid += +o.amount_paid; a.bal += +o.balance; });
    const rows = custs.map(c => { const a = agg[c.id] || { n: 0, total: 0, paid: 0, bal: 0 }; return { no: c.customer_no, name: c.name, phone: c.phone, email: c.email, orders: a.n, total: r2(a.total), paid: r2(a.paid), balance: r2(a.bal) }; });
    return { title: 'Customer Report', range, columns: [{ key: 'no', label: 'Customer No', type: T }, { key: 'name', label: 'Name', type: T }, { key: 'phone', label: 'Phone', type: T }, { key: 'email', label: 'Email', type: T }, { key: 'orders', label: 'Orders', type: I }, { key: 'total', label: 'Total Purchases', type: M }, { key: 'paid', label: 'Paid', type: M }, { key: 'balance', label: 'Outstanding', type: M }], rows, summary: [['Customers', rows.length, I], ['Total purchases', sum(rows, 'total'), M]] };
  }

  if (type === 'inventory') {
    const inv = await all(() => db.from('inventory').select('*').order('name'));
    const rows = inv.map(i => ({ name: i.name, category: i.category, unit: i.unit, qty: +i.quantity, min: +i.min_stock, cost: +i.unit_cost, value: r2(i.quantity * i.unit_cost), status: i.quantity <= i.min_stock ? 'LOW' : 'OK' }));
    return { title: 'Inventory Report (current stock)', range: 'as of today', columns: [{ key: 'name', label: 'Item', type: T }, { key: 'category', label: 'Category', type: T }, { key: 'unit', label: 'Unit', type: T }, { key: 'qty', label: 'In Stock', type: I }, { key: 'min', label: 'Minimum', type: I }, { key: 'cost', label: 'Unit Cost', type: M }, { key: 'value', label: 'Stock Value', type: M }, { key: 'status', label: 'Status', type: T }], rows, summary: [['Items', rows.length, I], ['Total inventory value', sum(rows, 'value'), M], ['Low stock items', rows.filter(r => r.status === 'LOW').length, I]] };
  }

  if (type === 'expenses') {
    const ex = await all(() => db.from('expenses').select('expense_date,description,amount,payment_method,expense_categories(name)').gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }));
    const rows = ex.map(e => ({ date: e.expense_date, category: e.expense_categories && e.expense_categories.name, description: e.description, method: e.payment_method, amount: +e.amount }));
    return { title: 'Expense Report', range, columns: [{ key: 'date', label: 'Date', type: D }, { key: 'category', label: 'Category', type: T }, { key: 'description', label: 'Description', type: T }, { key: 'method', label: 'Method', type: T }, { key: 'amount', label: 'Amount', type: M }], rows, summary: [['Total expenses', sum(rows, 'amount'), M]] };
  }

  if (type === 'employees') {
    const staff = await all(() => db.from('profiles').select('id,full_name,role').in('role', ['staff', 'cashier', 'admin']).eq('active', true));
    const orders = await all(() => db.from('orders').select('assigned_to,status,expected_date,completed_at').not('assigned_to', 'is', null).gte('order_date', f).lte('order_date', t));
    const rows = staff.map(s => {
      const mine = orders.filter(o => o.assigned_to === s.id), done = mine.filter(o => o.status === 'Completed');
      const onTime = done.filter(o => o.completed_at && o.expected_date && day(o.completed_at) <= o.expected_date).length;
      return { name: s.full_name, role: s.role, assigned: mine.length, completed: done.length, ontime: onTime, rate: done.length ? Math.round(onTime * 100 / done.length) : 0, active: mine.filter(o => !['Completed', 'Cancelled'].includes(o.status)).length };
    }).filter(r => r.assigned > 0);
    return { title: 'Employee Performance Report', range, columns: [{ key: 'name', label: 'Employee', type: T }, { key: 'role', label: 'Role', type: T }, { key: 'assigned', label: 'Jobs Assigned', type: I }, { key: 'completed', label: 'Completed', type: I }, { key: 'ontime', label: 'On Time', type: I }, { key: 'rate', label: 'On-time %', type: I }, { key: 'active', label: 'In Progress', type: I }], rows, summary: [['Jobs assigned', sum(rows, 'assigned'), I], ['Jobs completed', sum(rows, 'completed'), I]] };
  }
  throw httpError(400, 'Unknown report type');
});
