const { handler, httpError, isUuid, str } = require('./_lib');
const ROLES = ['admin', 'cashier', 'staff', 'customer'];
const log = (db, uid, action, entity_id, details) => db.from('activity_logs').insert({ user_id: uid, action, entity: 'user', entity_id, details }).then(() => {}, () => {});

exports.handler = handler(['admin'], async ({ db, user, body }) => {
  const action = body.action;
  if (action === 'create') {
    const email = str(body.email, 200).toLowerCase(), password = String(body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    if (!['admin', 'cashier', 'staff'].includes(body.role)) throw httpError(400, 'Invalid role');
    const full_name = str(body.full_name, 120);
    if (!full_name) throw httpError(400, 'Full name is required');
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone: str(body.phone, 40) } });
    if (error) throw httpError(400, error.message);
    const id = data.user.id;
    await db.from('customers').delete().eq('user_id', id); // auto-created by the signup trigger; staff are not customers
    const { error: e2 } = await db.from('profiles').update({ role: body.role, full_name, phone: str(body.phone, 40) || null }).eq('id', id);
    if (e2) throw httpError(500, 'User created but role could not be set');
    await log(db, user.id, 'create_user', id, { email, role: body.role });
    return { id };
  }
  if (!isUuid(body.user_id)) throw httpError(400, 'Invalid user');
  const id = body.user_id;
  if (action === 'update') {
    const patch = {};
    if (body.role !== undefined) { if (!ROLES.includes(body.role)) throw httpError(400, 'Invalid role'); patch.role = body.role; }
    if (body.active !== undefined) patch.active = !!body.active;
    if (body.full_name !== undefined) patch.full_name = str(body.full_name, 120);
    if (id === user.id && ((patch.role && patch.role !== 'admin') || patch.active === false)) throw httpError(400, 'You cannot demote or deactivate your own account');
    const { error } = await db.from('profiles').update(patch).eq('id', id);
    if (error) throw httpError(400, 'Could not update user');
    if (patch.active !== undefined) await db.auth.admin.updateUserById(id, { ban_duration: patch.active ? 'none' : '876000h' });
    await log(db, user.id, 'update_user', id, patch);
    return { ok: true };
  }
  if (action === 'reset_password') {
    const password = String(body.password || '');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw httpError(400, error.message);
    await log(db, user.id, 'reset_password', id, null);
    return { ok: true };
  }
  throw httpError(400, 'Unknown action');
});
