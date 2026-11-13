// Simple order page for customers: send the file, say what you want, copies, back-to-back -> see the price -> send.
(function () {
  const P = window.PSMS;
  const U = () => P.orderUpload; // shared upload helpers from pos.js
  const COLOR = { bw: 'Black & White', color: 'Colored' };
  // Items sold per piece (photos, IDs, tarpaulin...) have no "pages": quantity is entered as copies.
  const PER_PIECE = /photo|picture|\bid\b|tarp|lamin|banner|sticker|calling|business card|mug|shirt/i;
  const KB = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  // Best-effort page count for ordinary PDFs (user can always correct it)
  async function pdfPages(f) {
    try {
      if (!/\.pdf$/i.test(f.name) || f.size > 40 * 1048576) return 0;
      const txt = new TextDecoder('latin1').decode(await f.arrayBuffer());
      const m = txt.match(/\/Type\s*\/Page(?![A-Za-z])/g);
      return m ? m.length : 0;
    } catch (e) { return 0; }
  }

  async function render(el) {
    let cat; try { cat = await P.catalog(true); } catch (e) { el.innerHTML = `<div class="error">${P.esc(P.err(e))}</div>`; return; }
    if (!cat.services.length) { el.innerHTML = P.empty('No services are available yet.'); return; }
    const st = { files: [], calc: null, pagesEdited: false };
    el.innerHTML = `<div class="simple-order">
      <div class="card"><h3>1. Send your file</h3>
        <label class="drop"><input type="file" id="files" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tif,.tiff">
          <span class="big">📎</span><b>Tap here to choose your file</b><small>PDF, Word, JPG, PNG or TIFF · up to 25 MB each</small></label>
        <div id="flist" class="flist"></div></div>
      <div class="card"><h3>2. What do you want?</h3>
        <div class="so-grid">
          <div class="fld full"><label>What do you want to print?</label><select class="inp" id="sv">${cat.services.map(s => `<option value="${s.id}">${P.esc(s.name)}</option>`).join('')}</select></div>
          <div class="fld" id="w-size"><label>Paper size</label><select class="inp" id="size"></select></div>
          <div class="fld" id="w-type"><label>Paper type</label><select class="inp" id="ptype"></select></div>
          <div class="fld" id="w-color"><label>Color</label><select class="inp" id="color"></select></div>
          <div class="fld" id="w-pages"><label>Pages in your file</label><input class="inp" id="pages" type="number" inputmode="numeric" min="1" value="1"><small class="muted" id="phint"></small></div>
          <div class="fld"><label id="lcopies">Number of copies</label><input class="inp" id="copies" type="number" inputmode="numeric" min="1" value="1"></div>
          <div class="fld full" id="w-sided"><label class="chk big-chk"><input type="checkbox" id="b2b"> Back to back (print on both sides)</label></div>
          <div class="fld full"><label>Notes for the shop (optional)</label><textarea class="inp" id="ins" rows="2" maxlength="1000" placeholder="Example: pages 1-5 only, staple the pages…"></textarea></div>
        </div></div>
      <div class="so-total" id="tot">Choose your options to see the price.</div>
      <button class="btn primary block lg" id="go">Send order</button></div>`;
    const $ = s => el.querySelector(s);
    const svcRow = () => cat.services.find(s => s.id === $('#sv').value);
    const rows = () => cat.pricing.filter(p => p.service_id === $('#sv').value);
    const uniq = k => [...new Set(rows().map(r => r[k]).filter(Boolean))];
    const perPiece = () => PER_PIECE.test(svcRow().name + ' ' + (svcRow().category || ''));
    const fill = (id, vals, labels) => {
      const w = $('#w-' + id), s = $('#' + (id === 'type' ? 'ptype' : id));
      w.classList.toggle('hidden', vals.length < 2); // nothing to choose -> hide, the only option is used automatically
      s.innerHTML = vals.map(v => `<option value="${P.esc(v)}">${P.esc(labels ? labels[v] : v)}</option>`).join('');
    };
    function options() {
      const r = rows();
      fill('size', uniq('paper_size')); fill('type', uniq('paper_type'));
      fill('color', r.some(x => x.color_mode === 'any') ? ['bw', 'color'] : [...new Set(r.map(x => x.color_mode))], COLOR);
      const sides = r.some(x => x.sided === 'any') ? ['single', 'double'] : [...new Set(r.map(x => x.sided))];
      $('#w-sided').classList.toggle('hidden', !(sides.includes('single') && sides.includes('double')));
      $('#b2b').dataset.only = sides.length === 1 ? sides[0] : '';
      const pp = perPiece();
      $('#w-pages').classList.toggle('hidden', pp);
      if (pp) $('#pages').value = 1;
      $('#lcopies').textContent = pp ? 'Quantity' : 'Number of copies';
      preview();
    }
    const cur = () => ({
      service_id: $('#sv').value, paper_size: $('#size').value || '', paper_type: $('#ptype').value || '',
      color_mode: $('#color').value || 'bw',
      sided: $('#b2b').dataset.only || ($('#b2b').checked ? 'double' : 'single'),
      pages: Math.floor(+$('#pages').value), copies: Math.floor(+$('#copies').value), rush: false, instructions: ''
    });
    const preview = P.debounce(async () => {
      const it = cur(); st.calc = null;
      if (!(it.pages >= 1 && it.copies >= 1)) { $('#tot').textContent = 'Enter the number of pages and copies (at least 1).'; return; }
      const { data: c, error } = await P.sb.rpc('calc_line', { p_service: it.service_id, p_paper_size: it.paper_size || null, p_paper_type: it.paper_type || null, p_color: it.color_mode, p_sided: it.sided, p_pages: it.pages, p_copies: it.copies, p_rush: false });
      if (error) { $('#tot').innerHTML = `<span class="so-err">${P.esc(error.message || 'Price not available for these options. Please change your choices.')}</span>`; return; }
      st.calc = c;
      const days = +c.turnaround_days;
      $('#tot').innerHTML = `<div class="so-lab">You will pay</div><div class="so-amt">${P.money(c.total)}</div>
        <div class="so-det">${P.money(c.unit_price)} × ${c.quantity} ${perPiece() ? 'pc' : 'page' + (+c.quantity === 1 ? '' : 's')}${+c.additional_charge ? ' + ' + P.money(c.additional_charge) + ' service charge' : ''}${+c.discount ? `<br>Discount −${P.money(c.discount)} (${c.discount_percent}%)` : ''}</div>
        <div class="so-det">${days <= 0 ? 'Ready the same day' : 'Ready in about ' + days + ' day' + (days === 1 ? '' : 's')}</div>`;
    }, 250);

    $('#sv').onchange = options;
    ['size', 'ptype', 'color', 'copies', 'b2b'].forEach(i => { $('#' + i).oninput = preview; $('#' + i).onchange = preview; });
    $('#pages').oninput = () => { st.pagesEdited = true; $('#phint').textContent = ''; preview(); };

    $('#files').onchange = async e => {
      const ok = [];
      [...e.target.files].forEach(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!U().MIME[ext]) P.toast(`${f.name}: file type not allowed`, 'err');
        else if (f.size > U().MAX) P.toast(`${f.name}: larger than 25 MB`, 'err');
        else ok.push(f);
      });
      st.files = ok;
      $('#flist').innerHTML = ok.map(f => `<div class="fitem">📄 <span>${P.esc(f.name)}</span><small class="muted">${KB(f.size)}</small></div>`).join('');
      // try to count the pages of PDF files for the customer
      if (ok.length && !perPiece() && !st.pagesEdited && ok.every(f => /\.pdf$/i.test(f.name))) {
        const counts = await Promise.all(ok.map(pdfPages));
        if (counts.every(n => n > 0)) {
          const total = counts.reduce((a, b) => a + b, 0);
          $('#pages').value = total; $('#phint').textContent = `We counted ${total} page${total === 1 ? '' : 's'} in your file. Please check.`;
          preview();
        }
      }
    };

    $('#go').onclick = e => P.run(e.target, async () => {
      if (!st.files.length) throw new Error('Please choose your file first (step 1).');
      const it = cur();
      if (!st.calc) throw new Error('The price is not available for these options. Please change your choices.');
      const { order } = await P.api('create-order', { items: [it], expected_date: null, instructions: $('#ins').value.trim() });
      try { await U().uploadFiles(order.id, st.files); } catch (er) { P.toast('Order sent, but a file failed to upload: ' + P.err(er) + ' Please tell the shop.', 'err'); }
      const m = P.modal('Order sent ✅', `<div class="banner ok"><b>${P.esc(order.order_no)}</b><br>Amount to pay: <b>${P.money(order.total)}</b><br>Expected ready: ${P.date(order.expected_date)}</div><p class="muted">We will notify you when your order is approved and when it is ready.</p><div class="actions"><button class="btn" data-my>Track my order</button><button class="btn primary" data-new>Send another order</button></div>`);
      m.el.querySelector('[data-my]').onclick = () => { m.close(); location.hash = '#/myorders'; };
      m.el.querySelector('[data-new]').onclick = () => { m.close(); render(el); };
    });
    options();
  }
  P.register('neworder', { title: 'New Order', icon: '➕', render });
})();
