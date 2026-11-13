// Customer self-registration WITHOUT email verification (accounts are created already confirmed).
// Always creates a 'customer' role; staff/admin accounts can only be created by the admin.
const { adminClient, httpError, json, str } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw httpError(405, 'Method not allowed');
    const db = adminClient();
    const { data: hasOwner } = await db.rpc('owner_exists');
    if (!hasOwner) throw httpError(403, 'The shop has not been set up yet.');
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { throw httpError(400, 'Invalid request body'); }
    const full_name = str(body.full_name, 120), phone = str(body.phone, 40), email = str(body.email, 200).toLowerCase(), password = String(body.password || '');
    if (!full_name) throw httpError(400, 'Full name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone } });
    if (error) throw httpError(400, /already|registered|exists/i.test(error.message) ? 'That email is already registered. Please sign in.' : error.message);
    return json(200, { ok: true });
  } catch (e) {
    if (e.status) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
