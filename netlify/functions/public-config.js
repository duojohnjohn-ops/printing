// Exposes ONLY the public Supabase URL and anon key (both are designed to be public; RLS protects data).
exports.handler = async () => {
  const url = process.env.SUPABASE_URL, anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Server is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify environment variables.' }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ url, anonKey }) };
};
