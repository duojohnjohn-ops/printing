// One-time owner setup. Works ONLY while no owner exists; afterwards it always refuses.
// Not behind login (nobody has an account yet), so every check happens here and in claim_owner().
const { adminClient, httpError, json, str } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw httpError(405, 'Method not allowed');
    const db = adminClient();

    const { data: exists, error: chk } = await db.rpc('owner_exists');
    if (chk) {
      console.error('owner_exists', chk);
      throw httpError(500, 'The database is not set up yet. Run the SQL files in supabase/ first (see docs/SETUP-GUIDE.md).');
    }
    if (exists) throw httpError(403, 'The owner account has already been set up. Please sign in.');

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { throw httpError(400, 'Invalid request body'); }
    const full_name = str(body.full_name, 120), phone = str(body.phone, 40), business = str(body.business_name, 120);
    const email = str(body.email, 200).toLowerCase(), password = String(body.password || '');
    if (!full_name) throw httpError(400, 'Full name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email address');
    if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');

    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone } });
    if (error) throw httpError(400, error.message);
    const id = data.user.id;

    const { error: claimErr } = await db.rpc('claim_owner', { p_user: id, p_name: full_name, p_phone: phone });
    if (claimErr) {
      await db.auth.admin.deleteUser(id).catch(() => {}); // roll back so the email is not left half-registered
      if (claimErr.code === 'P0001') throw httpError(403, claimErr.message);
      console.error('claim_owner', claimErr);
      throw httpError(500, 'Could not finish setup. Please try again.');
    }

    if (business) await db.from('business_settings').upsert({ key: 'business_name', value: business }, { onConflict: 'key' });
    return json(200, { ok: true });
  } catch (e) {
    if (e.status) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
};
