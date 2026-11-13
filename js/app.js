(function () {
  const P = (window.PSMS = window.PSMS || { modules: {} });
  P.register = (id, def) => { P.modules[id] = def; };
  P.charts = [];
  const NAV = {
    admin: ['dashboard', 'pos', 'orders', 'customers', 'offers', 'pricing', 'inventory', 'payments', 'expenses', 'employees', 'reports', 'settings', 'users', 'logs', 'account'],
    cashier: ['pos', 'orders', 'customers', 'payments', 'pricelist', 'account'],
    staff: ['jobs', 'account'],
    customer: ['neworder', 'myorders', 'pricelist', 'mypayments', 'account']
  };
  P.signOut = async () => { if (P.pushLogout) await P.pushLogout(); await P.sb.auth.signOut(); location.href = '/pages/login.html'; };

  P.boot = async function (portal) {
    try { await P.ready; } catch (e) { document.body.innerHTML = `<div class="fatal">${P.esc(e.message)}</div>`; return; }
    const { data: { session } } = await P.sb.auth.getSession();
    if (!session) { location.replace('/pages/login.html'); return; }
    P.user = session.user;
    const { data: prof } = await P.sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (!prof || !prof.active) { await P.sb.auth.signOut(); location.replace('/pages/login.html?e=inactive'); return; }
    P.profile = prof;
    if (prof.role !== portal) { location.replace(P.homeFor(prof.role)); return; }
    await P.loadSettings().catch(() => {});
    P.sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('/pages/login.html'); });
    P.nav = NAV[portal].filter(id => P.modules[id]);
    document.title = (P.settings.business_name || 'PSMS') + ' — ' + portal;
    document.getElementById('app').innerHTML = `<aside class="sidebar" id="sb"><div class="brand"><img src="${P.esc(P.logoUrl())}" alt="" onerror="this.style.display='none'"><span>${P.esc(P.settings.business_name || 'Printing Shop')}</span></div><nav>${P.nav.map(id => `<a href="#/${id}" data-id="${id}"><span class="ic">${P.modules[id].icon}</span>${P.esc(P.modules[id].title)}</a>`).join('')}</nav><div class="side-foot"><button class="btn ghost block" id="so">Sign out</button></div></aside>
      <div class="main"><header class="topbar"><button class="icon-btn menu" id="mb" aria-label="Menu">☰</button><h1 id="pt"></h1><div class="top-r"><div id="bell" class="bell"></div><div class="who"><strong>${P.esc(prof.full_name || session.user.email)}</strong><small>${P.esc(prof.role)}</small></div></div></header><main id="view" class="view"></main></div>`;
    document.getElementById('so').onclick = P.signOut;
    document.getElementById('mb').onclick = () => document.getElementById('sb').classList.toggle('open');
    if (P.mountBell) P.mountBell(document.getElementById('bell'));
    window.addEventListener('hashchange', route); route();
  };

  async function route() {
    let id = (location.hash.replace(/^#\//, '') || '').split('?')[0];
    if (!P.nav.includes(id)) { location.hash = '#/' + P.nav[0]; return; }
    const m = P.modules[id], view = document.getElementById('view');
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
    document.getElementById('pt').textContent = m.title;
    document.getElementById('sb').classList.remove('open');
    P.charts.forEach(c => c.destroy()); P.charts = [];
    P.loading(view);
    try { await m.render(view); } catch (e) { console.error(e); view.innerHTML = `<div class="error">${P.esc(P.err(e))}</div>`; }
  }
})();
