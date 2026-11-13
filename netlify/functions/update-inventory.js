const { handler, rpc, httpError, isUuid, str, num } = require('./_lib');

exports.handler = handler(['admin'], async ({ db, user, body }) => {
  if (!isUuid(body.inventory_id)) throw httpError(400, 'Invalid inventory item');
  if (!['purchase', 'usage', 'adjustment'].includes(body.type)) throw httpError(400, 'Invalid movement type');
  const qty = num(body.quantity, { min: 0, max: 1e9, label: 'Quantity' });
  const cost = body.unit_cost === '' || body.unit_cost == null ? null : num(body.unit_cost, { min: 0, max: 1e8, label: 'Unit cost' });
  return await rpc(db, 'inventory_move', {
    p_inventory: body.inventory_id, p_type: body.type, p_qty: qty, p_unit_cost: cost, p_notes: str(body.notes, 300), p_user: user.id
  });
});
