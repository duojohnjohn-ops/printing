// Called by the database (supabase/push.sql) whenever a notification row is created.
// Finds the phones of the people the notification is for and sends a Firebase (FCM) push.
// Protected by the shared secret PUSH_WEBHOOK_SECRET. Needs FCM_SERVICE_ACCOUNT (Firebase service-account JSON).
const crypto = require('crypto');
const { adminClient, json } = require('./_lib');

let cached = null;
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

function serviceAccount() {
  let raw = (process.env.FCM_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  if (raw[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(raw);
  return sa.client_email && sa.private_key && sa.project_id ? sa : null;
}

async function accessToken(sa) {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) throw new Error('Google sign-in failed: ' + (out.error_description || out.error || res.status));
  cached = { token: out.access_token, exp: Date.now() + (out.expires_in || 3600) * 1000 };
  return cached.token;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    const secret = process.env.PUSH_WEBHOOK_SECRET;
    const got = event.headers['x-webhook-secret'] || '';
    if (!secret || !crypto.timingSafeEqual(sha(secret), sha(got))) return json(401, { error: 'Unauthorized' });

    const sa = serviceAccount();
    if (!sa) return json(500, { error: 'FCM_SERVICE_ACCOUNT is not set in Netlify.' });

    let rec;
    try { rec = JSON.parse(event.body || '{}').record; } catch (e) { rec = null; }
    if (!rec || !rec.id || !rec.title) return json(400, { error: 'Invalid notification' });

    const db = adminClient();
    const ids = new Set();
    if (rec.target_user) ids.add(rec.target_user);
    const roles = Array.isArray(rec.target_roles) ? rec.target_roles : [];
    if (roles.length) {
      const { data } = await db.from('profiles').select('id').in('role', roles).eq('active', true);
      (data || []).forEach(p => ids.add(p.id));
    }
    if (!ids.size) return json(200, { sent: 0 });
    const { data: rows } = await db.from('device_tokens').select('token').in('user_id', [...ids]);
    const tokens = (rows || []).map(r => r.token);
    if (!tokens.length) return json(200, { sent: 0 });

    const bearer = await accessToken(sa);
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    let sent = 0; const dead = [];
    await Promise.all(tokens.map(async token => {
      const res = await fetch(url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token,
          notification: { title: String(rec.title).slice(0, 100), body: String(rec.message || '').slice(0, 300) },
          data: { notification_id: String(rec.id), order_id: String(rec.order_id || ''), type: String(rec.type || '') },
          android: { priority: 'HIGH', notification: { channel_id: 'orders', sound: 'default' } }
        } })
      });
      if (res.ok) { sent++; return; }
      const err = await res.json().catch(() => ({}));
      const text = JSON.stringify(err);
      if (res.status === 404 || /UNREGISTERED/.test(text)) dead.push(token); else console.error('FCM error', res.status, text);
    }));
    if (dead.length) await db.from('device_tokens').delete().in('token', dead);
    return json(200, { sent, removed: dead.length });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Push failed' });
  }
};
