// Order entry: used by cashier/admin (POS, with payment) and by customers (online order with file upload).
(function () {
  const P = window.PSMS;
  const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };
  const MAX = 25 * 1024 * 1024;
  const COLOR = { bw: 'Black & White', color: 'Colored' }, SIDED = { single: 'Single-sided', double: 'Double-sided' };

  async function uploadFiles(orderId, files) {
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase(), type = MIME[ext];
      const path = `${orderId}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
      const { error } = await P.sb.storage.from('order-files').upload(path, f, { contentType: type, upsert: false });
      if (error) throw error;
      P.ck(await P.sb.from('order_files').insert({ order_id: orderId, storage_path: path, file_name: f.name, file_size: f.size, mime_type: type, uploaded_by: P.user.id }));
    }
  }

  async function orderForm(el, mode) {
    const pos = mode === 'pos';
    let cat; try { cat = await P.catalog(true); } catch (e) { el.innerHTML = `<div class="error">${P.esc(P.err(e))}</div>`; return; }
    if (!cat.services.length) { el.innerHTML = P.empty('No services are available yet.'); return; }
    const st = { customer: null, cart: [], files: [], calc: null, payEdited: false };
    el.innerHTML = `<div class="pos"><section>
      ${pos ? `<div class="card"><h3>Customer</h3><div class="row"><input class="inp" id="cq" placeholder="Search name, phone or customer no…"><button class="btn" id="cnew">+ New</button></div><div id="cres" class="cres"></div><div id="csel" class="csel muted">No customer selected</div></div>` : ''}
      <div class="card"><h3>Add printing item</h3><div class="grid3">
        <div class="fld"><label>Service</label><select class="inp" id="sv">${cat.services.map(s => `<option value="${s.id}">${P.esc(s.name)}</option>`).join('')}</select></div>
        <div class="fld" id="w-size"><label>Paper size</label><select class="inp" id="size"></select></div>
        <div class="fld" id="w-type"><label>Paper type</label><select class="inp" id="ptype"></select></div>
        <div class="fld" id="w-color"><label>Color</label><select class="inp" id="color"></select></div>
        <div class="fld" id="w-sided"><label>Sides</label><select class="inp" id="sided"></select></div>
        <div class="fld"><label>Pages</label><input class="inp" id="pages" type="number" min="1" value="1"></div>
        <div class="fld"><label>Copies / quantity</label><input class="inp" id="copies" type="number" min="1" value="1"></div>
        <div class="fld"><label>&nbsp;</label><label class="chk"><input type="checkbox" id="rush"> Rush order</label></div>
        <div class="fld full" style="grid-column:span 3"><label>Item notes</label><input class="inp" id="inotes" maxlength="500" placeholder="Optional"></div></div>
        <small class="muted">For per-piece items (ID photos, lamination, tarpaulin sq ft…) use 1 page and enter the quantity under Copies.</small>
        <div class="calc" id="prev">Choose options to see the price.</div><button class="btn primary" id="add" disabled>Add to order</button></div>
      <div class="card"><h3>Order items</h3><div id="cart"></div></div></section>
      <aside class="card pos-side"><h3>Order summary</h3><div id="sum"></div>
        ${pos ? `<div class="fld"><label>Extra discount (₱)</label><input class="inp" id="xd" type="number" min="0" step="0.01" value="0"></div>` : ''}
        <div class="fld"><label>Expected completion date</label><input class="inp" id="exp" type="date" min="${P.today()}"></div>
        <div class="fld"><label>Special instructions</label><textarea class="inp" id="ins" rows="2" maxlength="1000"></textarea></div>
        <div class="fld"><label>Files (PDF, DOC/DOCX, JPG, PNG, TIFF · max 25 MB each)</label><input type="file" id="files" class="inp" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff"><div id="flist" class="small muted"></div></div>
        ${pos ? `<hr><div class="fld"><label>Payment method</label><select class="inp" id="pm">${['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'].map(x => `<option>${x}</option>`).join('')}</select></div>
        <div class="fld"><label>Amount paying now (₱)</label><input class="inp" id="pay" type="number" min="0" step="0.01" value="0"></div>
        <div class="fld" id="w-tend"><label>Cash tendered (₱)</label><input class="inp" id="tend" type="number" min="0" step="0.01"></div>
        <div class="fld hidden" id="w-ref"><label>Reference no.</label><input class="inp" id="ref" maxlength="100"></div><div id="chg" class="calc"></div>` : ''}
        <button class="btn primary block" id="go">${pos ? 'Create order' : 'Submit order'}</button></aside></div>`;
    const $ = s => el.querySelector(s);
    const svc = () => cat.pricing.filter(p => p.service_id === $('#sv').value);
    const uniq = k => [...new Set(svc().map(r => r[k]).filter(Boolean))];
    const fill = (id, vals, labels) => { const w = $('#w-' + id), s = $('#' + (id === 'type' ? 'ptype' : id)); w.classList.toggle('hidden', !vals.length); s.innerHTML = vals.map(v => `<option value="${P.esc(v)}">${P.esc(labels ? labels[v] : v)}</option>`).join(''); };
    function options() {
      const rows = svc();
      fill('size', uniq('paper_size')); fill('type', uniq('paper_type'));
      fill('color', rows.some(r => r.color_mode === 'any') ? ['bw', 'color'] : [...new Set(rows.map(r => r.color_mode))], COLOR);
      fill('sided', rows.some(r => r.sided === 'any') ? ['single', 'double'] : [...new Set(rows.map(r => r.sided))], SIDED);
      preview();
    }
    const cur = () => ({ service_id: $('#sv').value, paper_size: $('#size').value || '', paper_type: $('#ptype').value || '', color_mode: $('#color').value || 'bw', sided: $('#sided').value || 'single', pages: +$('#pages').value, copies: +$('#copies').value, rush: $('#rush').checked, instructions: $('#inotes').value.trim() });
    async function calc(it) {
      const { data, error } = await P.sb.rpc('calc_line', { p_service: it.service_id, p_paper_size: it.paper_size || null, p_paper_type: it.paper_type || null, p_color: it.color_mode, p_sided: it.sided, p_pages: it.pages, p_copies: it.copies, p_rush: it.rush });
      if (error) throw error; return data;
    }
    const preview = P.debounce(async () => {
      const it = cur(); st.calc = null; $('#add').disabled = true;
      if (!(it.pages >= 1 && it.copies >= 1)) { $('#prev').textContent = 'Enter pages and copies (at least 1).'; return; }
      try {
        const c = await calc(it); st.calc = c; $('#add').disabled = false;
        $('#prev').innerHTML = `<b>${P.money(c.total)}</b> — ${P.money(c.unit_price)} × ${c.quantity}${+c.additional_charge ? ' + ' + P.money(c.additional_charge) + ' charge' : ''}${+c.discount ? ` · volume discount −${P.money(c.discount)} (${c.discount_percent}%)` : ''}${+c.rush_fee ? ` · rush fee ${P.money(c.rush_fee)}` : ''}`;
      } catch (e) { $('#prev').innerHTML = `<span style="color:var(--err)">${P.esc(P.err(e))}</span>`; }
    }, 250);
    const totals = () => {
      const t = st.cart.reduce((a, i) => ({ sub: a.sub + +i.calc.subtotal, disc: a.disc + +i.calc.discount, rush: a.rush + +i.calc.rush_fee }), { sub: 0, disc: 0, rush: 0 });
      const xd = pos ? Math.max(0, +$('#xd').value || 0) : 0; const total = Math.max(0, t.sub - t.disc + t.rush - xd); return { ...t, xd, total };
    };
    function drawCart() {
      $('#cart').innerHTML = st.cart.length ? `<table class="tbl"><tbody>${st.cart.map((i, n) => `<tr><td><b>${P.esc(i.calc.service_name)}</b>${i.rush ? ' <span class="badge st-pending">RUSH</span>' : ''}<div class="muted small">${P.esc([i.paper_size, i.paper_type, COLOR[i.color_mode], SIDED[i.sided]].filter(Boolean).join(' · '))} · ${i.pages} pg × ${i.copies}</div></td><td class="r">${P.money(i.calc.total)}</td><td class="r"><button class="btn sm" data-rm="${n}">Remove</button></td></tr>`).join('')}</tbody></table>` : P.empty('No items added yet.', '🛒');
      $('#cart').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.cart.splice(+b.dataset.rm, 1); drawCart(); });
      const t = totals();
      $('#sum').innerHTML = `<div class="totals" style="max-width:none"><div><span>Subtotal</span><span>${P.money(t.sub)}</span></div><div><span>Discounts</span><span>−${P.money(t.disc + t.xd)}</span></div><div><span>Rush fees</span><span>${P.money(t.rush)}</span></div><div class="grand"><span>Total</span><span>${P.money(t.total)}</span></div></div>`;
      if (pos && !st.payEdited) { $('#pay').value = t.total.toFixed(2); $('#tend').value = t.total.toFixed(2); }
      payInfo();
    }
    function payInfo() {
      if (!pos) return; const t = totals(), pay = +$('#pay').value || 0, cash = $('#pm').value === 'Cash', tend = +$('#tend').value || 0;
      $('#w-tend').classList.toggle('hidden', !cash); $('#w-ref').classList.toggle('hidden', cash);
      $('#chg').innerHTML = `${cash ? `Change: <b>${P.money(Math.max(tend - pay, 0))}</b><br>` : ''}Remaining balance: <b>${P.money(Math.max(t.total - pay, 0))}</b>`;
    }
    ['sv'].forEach(i => $('#' + i).onchange = options);
    ['size', 'ptype', 'color', 'sided', 'pages', 'copies', 'rush'].forEach(i => { $('#' + i).oninput = preview; $('#' + i).onchange = preview; });
    $('#add').onclick = () => { if (!st.calc) return; st.cart.push({ ...cur(), calc: st.calc }); $('#pages').value = 1; $('#copies').value = 1; $('#rush').checked = false; $('#inotes').value = ''; st.payEdited = false; drawCart(); preview(); };
    $('#files').onchange = e => {
      const ok = [];
      [...e.target.files].forEach(f => { const ext = f.name.split('.').pop().toLowerCase(); if (!MIME[ext]) P.toast(`${f.name}: file type not allowed`, 'err'); else if (f.size > MAX) P.toast(`${f.name}: larger than 25 MB`, 'err'); else ok.push(f); });
      st.files = ok; $('#flist').textContent = ok.map(f => f.name).join(', ');
    };
    if (pos) {
      $('#xd').oninput = () => { st.payEdited = false; drawCart(); };
      ['pay', 'tend'].forEach(i => $('#' + i).oninput = () => { if (i === 'pay') st.payEdited = true; payInfo(); });
      $('#pm').onchange = payInfo;
      const pick = c => { st.customer = c; $('#csel').innerHTML = `Customer: ${P.esc(c.name)} <span class="muted small">${P.esc(c.customer_no || '')} ${P.esc(c.phone || '')}</span>`; $('#csel').classList.remove('muted'); };
      const search = P.debounce(async () => {
        const q = $('#cq').value.replace(/[%,()*]/g, ' ').trim();
        let qb = P.sb.from('customers').select('id,name,customer_no,phone').order('created_at', { ascending: false }).limit(8);
        if (q) qb = qb.or(`name.ilike.%${q}%,phone.ilike.%${q}%,customer_no.ilike.%${q}%`);
        const { data } = await qb; const list = data || [];
        $('#cres').innerHTML = list.length ? list.map((c, i) => `<button data-i="${i}">${P.esc(c.name)}${c.phone ? ' · ' + P.esc(c.phone) : ''}</button>`).join('') : '<span class="muted small">No match — use “+ New”.</span>';
        $('#cres').querySelectorAll('button').forEach(b => b.onclick = () => pick(list[+b.dataset.i]));
      }, 250);
      $('#cq').oninput = search; search();
      $('#cnew').onclick = () => P.form('New customer', [{ name: 'name', label: 'Name', required: true, maxlength: 120 }, { name: 'phone', label: 'Contact number', maxlength: 40 }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', full: true }], {}, async (v, m) => {
        const c = P.ck(await P.sb.from('customers').insert({ name: v.name, phone: v.phone || null, email: v.email || null, address: v.address || null }).select().single()); pick(c); m.close(); search();
      });
    }
    $('#go').onclick = e => P.run(e.target, async () => {
      if (pos && !st.customer) throw new Error('Select or add a customer first');
      if (!st.cart.length) throw new Error('Add at least one item');
      const t = totals(), pay = pos ? +$('#pay').value || 0 : 0;
      if (pos && pay > t.total + 0.004) throw new Error('Payment is more than the order total');
      const { order } = await P.api('create-order', { customer_id: st.customer && st.customer.id, items: st.cart.map(({ calc: c, ...i }) => i), expected_date: $('#exp').value || null, instructions: $('#ins').value, extra_discount: pos ? t.xd : 0 });
      let note = '';
      try { if (st.files.length) await uploadFiles(order.id, st.files); } catch (er) { note = 'Order created, but a file upload failed: ' + P.err(er); P.toast(note, 'err'); }
      let payment = null;
      if (pos && pay > 0) { try { payment = await P.api('process-payment', { order_id: order.id, amount: pay, method: $('#pm').value, tendered: $('#pm').value === 'Cash' ? +$('#tend').value || pay : null, reference: $('#ref') ? $('#ref').value : '' }); } catch (er) { P.toast('Order created, but payment failed: ' + P.err(er), 'err'); } }
      const m = P.modal('Order created', `<div class="banner ok"><b>${P.esc(order.order_no)}</b> — total ${P.money(order.total)}. Expected ${P.date(order.expected_date)}.</div><p class="muted">${pos ? '' : 'Keep your order number to track progress under “My Orders”.'}</p><div class="actions">${payment ? '<button class="btn" data-rc>Receipt</button>' : ''}${pos ? '<button class="btn" data-jo>Job order slip</button>' : '<button class="btn" data-my>Track my order</button>'}<button class="btn primary" data-new>${pos ? 'New order' : 'Place another order'}</button></div>`);
      if (payment) m.el.querySelector('[data-rc]').onclick = () => P.receipt.show(payment.payment_id);
      if (pos) m.el.querySelector('[data-jo]').onclick = () => P.receipt.jobOrder(order.id); else m.el.querySelector('[data-my]').onclick = () => { m.close(); location.hash = '#/myorders'; };
      m.el.querySelector('[data-new]').onclick = () => { m.close(); orderForm(el, mode); };
    });
    options(); drawCart();
  }
  P.register('pos', { title: 'Point of Sale', icon: '🛒', render: el => orderForm(el, 'pos') });
  P.register('neworder', { title: 'New Order', icon: '➕', render: el => orderForm(el, 'customer') });
})();
