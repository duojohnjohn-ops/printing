const { handler, rpc, httpError, isUuid, str, intIn, num, sendEmail } = require('./_lib');

exports.handler = handler(['admin', 'cashier', 'customer'], async ({ db, user, profile, body }) => {
  const staffSide = profile.role !== 'customer';
  let customerId = body.customer_id;
  if (!staffSide) {
    const { data: c } = await db.from('customers').select('id').eq('user_id', user.id).single();
    if (!c) throw httpError(400, 'Customer profile not found');
    customerId = c.id;
  } else if (!isUuid(customerId)) throw httpError(400, 'Please select a customer');

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) throw httpError(400, 'Add between 1 and 50 items');
  const items = body.items.map((it, i) => {
    if (!isUuid(it.service_id)) throw httpError(400, `Item ${i + 1}: invalid service`);
    if (!['bw', 'color'].includes(it.color_mode)) throw httpError(400, `Item ${i + 1}: invalid color mode`);
    if (!['single', 'double'].includes(it.sided)) throw httpError(400, `Item ${i + 1}: invalid sides`);
    return {
      service_id: it.service_id, paper_size: str(it.paper_size, 60), paper_type: str(it.paper_type, 60),
      color_mode: it.color_mode, sided: it.sided,
      pages: intIn(it.pages, { min: 1, max: 100000, label: 'Pages' }), copies: intIn(it.copies, { min: 1, max: 100000, label: 'Copies' }),
      rush: !!it.rush, instructions: str(it.instructions, 500)
    };
  });
  let expected = null;
  if (body.expected_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expected_date)) throw httpError(400, 'Invalid expected date');
    expected = body.expected_date;
  }
  const extra = staffSide ? num(body.extra_discount || 0, { min: 0, max: 1e7, label: 'Discount' }) : 0;
  const assigned = staffSide && isUuid(body.assigned_to) ? body.assigned_to : null;

  const id = await rpc(db, 'create_order', {
    p_customer: customerId, p_items: items, p_source: staffSide ? 'walk-in' : 'online', p_expected: expected,
    p_instructions: str(body.instructions, 1000) || null, p_user: user.id, p_extra_discount: extra, p_assigned: assigned
  });
  const { data: order } = await db.from('orders').select('id, order_no, total, expected_date').eq('id', id).single();
  if (!staffSide) await sendEmail(process.env.NOTIFY_EMAIL, `New online order ${order.order_no}`, `<p>A customer submitted order <b>${order.order_no}</b> (total PHP ${order.total}).</p>`);
  return { order };
});
