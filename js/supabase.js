// Supabase client bootstrap. Public URL/anon key are loaded at runtime from a Netlify Function
// (which reads environment variables) so nothing sensitive is committed to the repo.
(function () {
  const P = (window.PSMS = window.PSMS || { modules: {} });
  P.ready = (async function () {
    const res = await fetch('/.netlify/functions/public-config');
    const cfg = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cfg.error || 'Could not load configuration.');
    P.sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  })();
  P.api = async function (fn, body) {
    const { data: { session } } = await P.sb.auth.getSession();
    const res = await fetch('/.netlify/functions/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') },
      body: JSON.stringify(body || {})
    });
    const out = await res.json().catch(() => ({ error: 'Unexpected server response' }));
    if (!res.ok) throw new Error(out.error || 'Request failed');
    return out;
  };
  P.settings = {};
  P.loadSettings = async function () {
    const { data } = await P.sb.from('business_settings').select('key,value');
    P.settings = {};
    (data || []).forEach(r => (P.settings[r.key] = r.value));
    return P.settings;
  };
  P.logoUrl = () => P.settings.logo_url || '/assets/images/business-logo.png';
  P.ck = r => { if (r.error) throw r.error; return r.data; };
  P.log = (action, entity, id, details) =>
    P.sb.from('activity_logs').insert({ user_id: P.user && P.user.id, action, entity, entity_id: id || null, details: details || null }).then(() => {}, () => {});
  P.catalog = async function (force) {
    if (P._cat && !force) return P._cat;
    const [s, p, d] = await Promise.all([
      P.sb.from('services').select('*').eq('active', true).order('name'),
      P.sb.from('service_pricing').select('*').eq('active', true),
      P.sb.from('quantity_discounts').select('*').eq('active', true)
    ]);
    P._cat = { services: P.ck(s), pricing: P.ck(p), discounts: P.ck(d) };
    return P._cat;
  };
})();
