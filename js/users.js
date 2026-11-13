(function () {
  const P = window.PSMS;
  P.register('users', {
    title: 'User Management', icon: '🔐',
    render(el) {
      const api = (body, msg, a) => P.run(null, async () => { await P.api('admin-users', body); P.toast(msg); a.reload(); });
      P.listView(el, {
        title: 'Users', addLabel: '+ Add staff user', empty: 'No users.',
        filters: [{ label: 'Role', options: ['admin', 'cashier', 'staff', 'customer'], test: (r, v) => r.role === v }],
        load: async () => P.ck(await P.sb.from('profiles').select('*').order('created_at', { ascending: false })),
        cols: [{ label: 'Name', k: 'full_name', fmt: r => `<b>${P.esc(r.full_name || '—')}</b>` }, { label: 'Email', k: 'email' }, { label: 'Phone', k: 'phone' }, { label: 'Role', k: 'role', fmt: r => `<span class="badge">${P.esc(r.role)}</span>` }, { label: 'Status', fmt: r => r.active ? 'Active' : '<span class="badge st-cancelled">Inactive</span>' }, { label: 'Joined', fmt: r => P.date(r.created_at) },
          { label: '', fmt: r => `<button class="btn sm" data-act="role">Role</button> <button class="btn sm" data-act="toggle">${r.active ? 'Deactivate' : 'Activate'}</button> <button class="btn sm" data-act="pw">Reset password</button>` }],
        onAdd: a => P.form('Add staff user', [{ name: 'full_name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone' }, { name: 'role', label: 'Role', type: 'select', required: true, options: ['cashier', 'staff', 'admin'] }, { name: 'password', label: 'Temporary password (min. 8)', type: 'password', required: true, full: true }], {}, async (v, m) => { await P.api('admin-users', { action: 'create', ...v }); m.close(); P.toast('User created'); a.reload(); }),
        onAction: (act, r, a) => {
          if (act === 'toggle') return api({ action: 'update', user_id: r.id, active: !r.active }, 'Updated', a);
          if (act === 'role') return P.form('Change role — ' + r.full_name, [{ name: 'role', label: 'Role', type: 'select', required: true, options: ['admin', 'cashier', 'staff', 'customer'] }], r, async (v, m) => { await P.api('admin-users', { action: 'update', user_id: r.id, role: v.role }); m.close(); P.toast('Role updated'); a.reload(); });
          if (act === 'pw') return P.form('Reset password — ' + r.full_name, [{ name: 'password', label: 'New password (min. 8)', type: 'password', required: true, full: true }], {}, async (v, m) => { await P.api('admin-users', { action: 'reset_password', user_id: r.id, password: v.password }); m.close(); P.toast('Password reset'); });
        }
      });
    }
  });
  P.register('logs', {
    title: 'Activity Logs', icon: '🕘',
    render(el) {
      P.listView(el, { title: 'Activity Logs', empty: 'No activity yet.', load: async () => P.ck(await P.sb.from('activity_logs').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(1000)),
        cols: [{ label: 'When', k: 'created_at', fmt: r => P.date(r.created_at, true), sort: r => r.created_at }, { label: 'User', fmt: r => P.esc(r.profiles ? r.profiles.full_name : 'System') }, { label: 'Action', k: 'action' }, { label: 'Entity', k: 'entity' }, { label: 'Details', fmt: r => `<span class="small muted">${P.esc(r.details ? JSON.stringify(r.details) : '')}</span>` }] });
    }
  });
  P.register('account', {
    title: 'My Account', icon: '👤',
    render(el) {
      const p = P.profile;
      el.innerHTML = `<div class="card" style="max-width:520px"><h3>Profile</h3><form id="pf" class="form"><div class="fld"><label>Full name</label><input class="inp" name="full_name" value="${P.esc(p.full_name)}" required maxlength="120"></div><div class="fld"><label>Phone</label><input class="inp" name="phone" value="${P.esc(p.phone || '')}" maxlength="40"></div><button class="btn primary">Save profile</button></form></div>
      <div class="card" style="max-width:520px"><h3>Change password</h3><form id="pw" class="form"><div class="fld"><label>New password (min. 8 characters)</label><input class="inp" type="password" name="p1" minlength="8" required autocomplete="new-password"></div><div class="fld"><label>Confirm new password</label><input class="inp" type="password" name="p2" minlength="8" required autocomplete="new-password"></div><button class="btn primary">Update password</button></form></div>`;
      el.querySelector('#pf').onsubmit = e => { e.preventDefault(); P.run(e.submitter, async () => { const f = P.formData(e.target); P.ck(await P.sb.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null }).eq('id', p.id)); p.full_name = f.full_name.trim(); P.toast('Profile saved'); }); };
      el.querySelector('#pw').onsubmit = e => { e.preventDefault(); P.run(e.submitter, async () => { const f = P.formData(e.target); if (f.p1 !== f.p2) throw new Error('Passwords do not match'); const { error } = await P.sb.auth.updateUser({ password: f.p1 }); if (error) throw error; e.target.reset(); P.toast('Password updated'); }); };
    }
  });
})();
