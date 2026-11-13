(function () {
  const P = window.PSMS;
  P.register('settings', {
    title: 'Settings', icon: '⚙️',
    async render(el) {
      await P.loadSettings(); const s = P.settings;
      const inp = (k, label, extra = '') => `<div class="fld"><label>${label}</label><input class="inp" name="${k}" value="${P.esc(s[k] || '')}" ${extra}></div>`;
      el.innerHTML = `<div class="card"><h3>Business information</h3><form id="bf" class="form grid2">${inp('business_name', 'Business name', 'required maxlength="120"')}${inp('business_phone', 'Contact number', 'maxlength="60"')}${inp('business_email', 'Email address', 'type="email"')}${inp('business_hours', 'Operating hours', 'maxlength="120"')}<div class="fld full"><label>Business address</label><input class="inp" name="business_address" value="${P.esc(s.business_address || '')}"></div>
        ${inp('order_prefix', 'Order number prefix', 'maxlength="10" pattern="[A-Za-z0-9]+"')}<div class="fld"><label>Currency</label><input class="inp" value="PHP — Philippine Peso (₱)" disabled></div><div class="fld full"><label>Receipt footer message</label><textarea class="inp" name="receipt_footer" rows="2">${P.esc(s.receipt_footer || '')}</textarea></div>
        <div class="actions full"><span class="muted small" style="margin-right:auto">Order numbers look like ${P.esc(s.order_prefix || 'ORD')}-YYMMDD-0001</span><button class="btn primary">Save settings</button></div></form></div>
        <div class="card"><h3>Business logo</h3><div class="row"><img src="${P.esc(P.logoUrl())}" alt="" style="max-height:80px;background:#f4f6fa;border-radius:8px;padding:6px" onerror="this.style.display='none'"><div style="flex:1"><input type="file" id="lf" accept=".png,.jpg,.jpeg,.webp,.svg"><p class="muted small">Upload here, or replace <code>assets/images/business-logo.png</code> in the project and redeploy. An uploaded logo takes priority.</p></div><button class="btn" id="lu">Upload logo</button><button class="btn" id="lr">Use default file</button></div></div>
        <div class="card"><h3>Pricing & users</h3><p>Prices, rush fees and quantity discounts are managed under <a href="#/pricing">Pricing</a>. Staff accounts and passwords are managed under <a href="#/users">Users</a>. Change your own password under <a href="#/account">My Account</a>.</p></div>`;
      el.querySelector('#bf').onsubmit = e => { e.preventDefault(); P.run(e.submitter, async () => { const f = P.formData(e.target); P.ck(await P.sb.from('business_settings').upsert(Object.entries(f).map(([key, value]) => ({ key, value: String(value).trim(), updated_at: new Date().toISOString() })), { onConflict: 'key' })); await P.loadSettings(); P.log('update_settings', 'settings'); P.toast('Settings saved'); }); };
      el.querySelector('#lu').onclick = e => P.run(e.target, async () => {
        const f = el.querySelector('#lf').files[0]; if (!f) throw new Error('Choose an image first'); if (f.size > 2097152) throw new Error('Logo must be under 2 MB');
        const ext = f.name.split('.').pop().toLowerCase(), path = `logo-${Date.now()}.${ext}`;
        const { error } = await P.sb.storage.from('branding').upload(path, f, { contentType: f.type }); if (error) throw error;
        const url = P.sb.storage.from('branding').getPublicUrl(path).data.publicUrl;
        P.ck(await P.sb.from('business_settings').upsert({ key: 'logo_url', value: url }, { onConflict: 'key' })); P.toast('Logo updated — reload to see it everywhere'); P.modules.settings.render(el);
      });
      el.querySelector('#lr').onclick = e => P.run(e.target, async () => { P.ck(await P.sb.from('business_settings').upsert({ key: 'logo_url', value: '' }, { onConflict: 'key' })); P.toast('Using assets/images/business-logo.png'); P.modules.settings.render(el); });
    }
  });
})();
