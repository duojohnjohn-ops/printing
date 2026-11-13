// Shared helpers for Netlify Functions. Secrets come ONLY from environment variables.
const { createClient } = require('@supabase/supabase-js');

const adminClient = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw httpError(500, 'Server is not configured. Set the Supabase environment variables in Netlify.');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
function num(v, { min = 0, max = 1e9, label = 'Value' } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} must be a number between ${min} and ${max}`);
  return n;
}
const intIn = (v, o) => { const n = num(v, o); if (!Number.isInteger(n)) throw httpError(400, `${o.label || 'Value'} must be a whole number`); return n; };

async function authenticate(event, roles) {
  if (event.httpMethod !== 'POST') throw httpError(405, 'Method not allowed');
  const db = adminClient();
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'Please sign in again');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw httpError(401, 'Your session has expired. Please sign in again');
  const { data: profile } = await db.from('profiles').select('id, role, active, full_name').eq('id', data.user.id).single();
  if (!profile || !profile.active) throw httpError(403, 'Account is inactive');
  if (roles && !roles.includes(profile.role)) throw httpError(403, 'You do not have permission to do this');
  return { db, user: data.user, profile };
}

function handler(roles, fn) {
  return async (event) => {
    try {
      const ctx = await authenticate(event, roles);
      let body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { throw httpError(400, 'Invalid request body'); }
      if (typeof body !== 'object' || body === null) throw httpError(400, 'Invalid request body');
      return json(200, await fn({ ...ctx, body }));
    } catch (e) {
      if (e.status) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

// Calls a Postgres function; business-rule errors (RAISE EXCEPTION, code P0001) are safe to show.
async function rpc(db, fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (error.code === 'P0001') throw httpError(400, error.message);
    console.error(fn, error);
    throw httpError(500, 'Database error. Please try again.');
  }
  return data;
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html })
    });
    return res.ok;
  } catch (e) { console.error('email failed', e.message); return false; }
}

module.exports = { adminClient, httpError, json, handler, rpc, isUuid, str, num, intIn, sendEmail };
