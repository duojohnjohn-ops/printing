(function () {
  const P = (window.PSMS = window.PSMS || { modules: {} });
  P.homeFor = role => ({ admin: '/pages/admin.html', cashier: '/pages/cashier.html', staff: '/pages/staff.html', customer: '/pages/customer.html' }[role] || '/pages/login.html');

  P.initLogin = async function () {
    const root = document.getElementById('login');
    try { await P.ready; } catch (e) { root.innerHTML = `<div class="fatal">${P.esc(e.message)}</div>`; return; }
    await P.loadSettings().catch(() => {});
    const name = P.esc(P.settings.business_name || 'Printing Shop');
    root.innerHTML = `<div class="login-wrap"><div class="login-brand"><img src="${P.esc(P.logoUrl())}" alt="" onerror="this.style.display='none'"><h1>${name}</h1><p>${P.esc(P.settings.business_address || '')}</p><p>${P.esc(P.settings.business_phone || '')}</p></div>
    <div class="login-card"><div class="box"><div class="tabs"><button data-t="in" class="on">Sign in</button><button data-t="up">Create account</button></div>
    <div id="msg"></div>
    <form id="f-in" class="form"><div class="fld"><label>Email</label><input class="inp" type="email" name="email" required autocomplete="username"></div><div class="fld"><label>Password</label><input class="inp" type="password" name="password" required autocomplete="current-password"></div><button class="btn primary block" type="submit">Sign in</button><a href="#" id="forgot" class="small">Forgot password?</a></form>
    <form id="f-up" class="form hidden"><p class="muted small">Customer accounts only. Staff accounts are created by the administrator.</p><div class="fld"><label>Full name</label><input class="inp" name="full_name" required maxlength="120"></div><div class="fld"><label>Phone</label><input class="inp" name="phone" maxlength="40"></div><div class="fld"><label>Email</label><input class="inp" type="email" name="email" required></div><div class="fld"><label>Password (min. 8 characters)</label><input class="inp" type="password" name="password" minlength="8" required autocomplete="new-password"></div><button class="btn primary block" type="submit">Create account</button></form>
    <form id="f-new" class="form hidden"><h3>Set a new password</h3><div class="fld"><input class="inp" type="password" name="password" minlength="8" required placeholder="New password" autocomplete="new-password"></div><button class="btn primary block" type="submit">Update password</button></form></div></div></div>`;
    const msg = (t, type) => { root.querySelector('#msg').innerHTML = t ? `<div class="${type === 'ok' ? 'banner ok' : 'error'}" style="margin-bottom:12px">${P.esc(t)}</div>` : ''; };
    if (new URLSearchParams(location.search).get('e') === 'inactive') msg('This account is inactive. Please contact the administrator.');
    root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
      root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); msg('');
      root.querySelector('#f-in').classList.toggle('hidden', b.dataset.t !== 'in'); root.querySelector('#f-up').classList.toggle('hidden', b.dataset.t !== 'up');
    });
    const go = async () => {
      const { data: { user } } = await P.sb.auth.getUser(); if (!user) return false;
      const { data: p } = await P.sb.from('profiles').select('role,active').eq('id', user.id).single();
      if (!p || !p.active) { await P.sb.auth.signOut(); msg('This account is inactive. Please contact the administrator.'); return false; }
      location.replace(P.homeFor(p.role)); return true;
    };
    P.sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { root.querySelectorAll('form,.tabs').forEach(x => x.classList.add('hidden')); root.querySelector('#f-new').classList.remove('hidden'); } });
    root.querySelector('#f-in').onsubmit = async e => {
      e.preventDefault(); const f = P.formData(e.target); const btn = e.target.querySelector('button'); btn.disabled = true; msg('');
      const { error } = await P.sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      if (error) { msg('Incorrect email or password.'); btn.disabled = false; return; }
      if (!(await go())) btn.disabled = false;
    };
    root.querySelector('#f-up').onsubmit = async e => {
      e.preventDefault(); const f = P.formData(e.target); const btn = e.target.querySelector('button'); btn.disabled = true; msg('');
      const { data, error } = await P.sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.full_name.trim(), phone: f.phone.trim() } } });
      btn.disabled = false;
      if (error) { msg(error.message); return; }
      if (data.session) await go(); else msg('Account created. Check your email to confirm it, then sign in.', 'ok');
    };
    root.querySelector('#forgot').onclick = async e => {
      e.preventDefault(); const email = root.querySelector('#f-in [name=email]').value.trim();
      if (!email) { msg('Type your email above first.'); return; }
      await P.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/pages/login.html' });
      msg('If that email exists, a reset link has been sent.', 'ok');
    };
    root.querySelector('#f-new').onsubmit = async e => {
      e.preventDefault(); const { error } = await P.sb.auth.updateUser({ password: P.formData(e.target).password });
      if (error) { msg(error.message); return; } await go();
    };
    const { data: { session } } = await P.sb.auth.getSession();
    if (session && !location.hash.includes('type=recovery')) go();
  };
})();
