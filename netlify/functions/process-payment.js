const { handler, rpc, httpError, isUuid, str, num, sendEmail } = require('./_lib');
const METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'];

exports.handler = handler(['admin', 'cashier'], async ({ db, user, body }) => {
  if (!isUuid(body.order_id)) throw httpError(400, 'Invalid order');
  if (!METHODS.includes(body.method)) throw httpError(400, 'Invalid payment method');
  const amount = num(body.amount, { min: 0.01, max: 1e8, label: 'Amount' });
  const tendered = body.tendered === '' || body.tendered == null ? null : num(body.tendered, { min: 0, max: 1e8, label: 'Cash tendered' });
  const result = await rpc(db, 'record_payment', {
    p_order: body.order_id, p_amount: amount, p_tendered: tendered, p_method: body.method, p_reference: str(body.reference, 100), p_user: user.id
  });
  const { data: order } = await db.from('orders').select('order_no, total, amount_paid, balance, payment_status, customers(email, name)').eq('id', body.order_id).single();
  if (order && order.customers && order.customers.email) {
    await sendEmail(order.customers.email, `Payment received for ${order.order_no}`,
      `<p>Hi ${order.customers.name}, we received PHP ${amount.toFixed(2)} for order <b>${order.order_no}</b>. Remaining balance: PHP ${Number(order.balance).toFixed(2)}.</p>`);
  }
  return { ...result, order };
});
