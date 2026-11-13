// Receipts, invoices and job-order slips share one document descriptor -> HTML (print) and PDF.
// NOTE: jsPDF's built-in fonts cannot draw the peso sign, so PDFs print amounts as "PHP 1,234.00".
(function () {
  const P = window.PSMS;
  const num = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (c, pdf) => (c && typeof c === 'object') ? (pdf ? 'PHP ' + num(c.m) : P.money(c.m)) : (c == null ? '' : String(c));
  const biz = () => ({ name: P.settings.business_name || 'Printing Shop', lines: [P.settings.business_address, P.settings.business_phone, P.settings.business_email].filter(Boolean), footer: P.settings.receipt_footer || '' });
  const M = n => ({ m: Number(n || 0) });
  const spec = i => [i.paper_size, i.paper_type, i.color_mode === 'bw' ? 'B&W' : 'Color', i.sided === 'double' ? 'Double-sided' : 'Single-sided'].filter(Boolean).join(', ');

  function docHtml(d) {
    const b = biz();
    return `<div class="doc ${d.narrow ? 'narrow' : ''}"><div class="doc-head"><img src="${P.esc(P.logoUrl())}" alt="" onerror="this.style.display='none'"><div><h2>${P.esc(b.name)}</h2>${b.lines.map(l => `<div>${P.esc(l)}</div>`).join('')}</div></div>
      <h3 class="doc-title">${P.esc(d.title)}</h3><table class="doc-meta">${d.meta.map(([k, v]) => `<tr><th>${P.esc(k)}</th><td>${P.esc(cell(v))}</td></tr>`).join('')}</table>
      ${d.head ? `<table class="doc-tbl"><thead><tr>${d.head.map(h => `<th>${P.esc(h)}</th>`).join('')}</tr></thead><tbody>${d.body.map(r => `<tr>${r.map(c => `<td class="${typeof c === 'object' ? 'r' : ''}">${P.esc(cell(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
      <table class="doc-tot">${(d.totals || []).map(([k, v]) => `<tr><th>${P.esc(k)}</th><td>${P.esc(cell(v))}</td></tr>`).join('')}</table>
      ${d.notes ? `<p class="doc-notes"><b>Instructions:</b> ${P.esc(d.notes)}</p>` : ''}<p class="doc-foot">${P.esc(d.footer != null ? d.footer : b.footer)}</p></div>`;
  }
  const logoData = () => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }); } catch (e) { res(null); } };
    img.onerror = () => res(null); img.src = P.logoUrl();
  });
  async function docPdf(d) {
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: d.narrow ? 'a5' : 'a4' });
    const W = pdf.internal.pageSize.getWidth(), b = biz(); let y = 14, x = 14;
    const logo = await logoData();
    if (logo) { const s = Math.min(28 / logo.w, 20 / logo.h); pdf.addImage(logo.data, 'PNG', 14, y - 4, logo.w * s, logo.h * s); x = 14 + logo.w * s + 4; }
    pdf.setFont('helvetica', 'bold').setFontSize(14).text(b.name, x, y + 1);
    pdf.setFont('helvetica', 'normal').setFontSize(9); b.lines.forEach((l, i) => pdf.text(l, x, y + 6 + i * 4.5));
    y = Math.max(y + 6 + b.lines.length * 4.5, y + 18) + 4;
    pdf.setFont('helvetica', 'bold').setFontSize(12).text(d.title, W / 2, y, { align: 'center' }); y += 7; pdf.setFontSize(9);
    d.meta.forEach(([k, v]) => { pdf.setFont('helvetica', 'bold').text(k + ':', 14, y); pdf.setFont('helvetica', 'normal').text(cell(v, true), 48, y); y += 4.8; });
    y += 2;
    if (d.head) { pdf.autoTable({ startY: y, head: [d.head], body: d.body.map(r => r.map(c => cell(c, true))), styles: { fontSize: 8.5 }, headStyles: { fillColor: [30, 79, 156] }, margin: { left: 14, right: 14 } }); y = pdf.lastAutoTable.finalY + 5; }
    (d.totals || []).forEach(([k, v]) => { pdf.setFont('helvetica', 'bold').text(k, W - 76, y); pdf.setFont('helvetica', 'normal').text(cell(v, true), W - 14, y, { align: 'right' }); y += 5; });
    if (d.notes) { y += 3; pdf.setFont('helvetica', 'normal').text(pdf.splitTextToSize('Instructions: ' + d.notes, W - 28), 14, y); y += 10; }
    const foot = d.footer != null ? d.footer : b.footer; if (foot) pdf.text(foot, W / 2, y + 6, { align: 'center' });
    return pdf;
  }
  async function preview(title, docPromise, filename) {
    const m = P.modal(title, '<div class="loading"><span class="spin"></span></div>', { wide: true });
    try {
      const d = await docPromise;
      m.el.innerHTML = `<div class="actions" style="margin:0 0 12px"><button class="btn" data-print>🖨 Print</button><button class="btn primary" data-pdf>⬇ Download PDF</button></div>${docHtml(d)}`;
      m.el.querySelector('[data-print]').onclick = () => P.printHtml(docHtml(d), title);
      m.el.querySelector('[data-pdf]').onclick = e => P.run(e.target, async () => { (await docPdf(d)).save((d.filename || filename) + '.pdf'); });
    } catch (e) { m.el.innerHTML = `<div class="error">${P.esc(P.err(e))}</div>`; }
  }
  const itemRows = items => items.map(i => [`${i.service_name} (${spec(i)})`, String(i.quantity).replace(/\.00$/, ''), M(i.unit_price), M(i.total)]);

  async function receiptDoc(paymentId) {
    const pay = P.ck(await P.sb.from('payments').select('*, orders(*, customers(name,customer_no), order_items(*))').eq('id', paymentId).single());
    const all = P.ck(await P.sb.from('payments').select('amount,paid_at').eq('order_id', pay.order_id)) || [];
    const paidThru = all.filter(p => new Date(p.paid_at) <= new Date(pay.paid_at)).reduce((a, p) => a + Number(p.amount), 0);
    const o = pay.orders;
    const totals = [['Subtotal', M(o.subtotal)]];
    if (+o.discount) totals.push(['Discount', M(-o.discount)]);
    if (+o.rush_fee) totals.push(['Rush fee', M(o.rush_fee)]);
    totals.push(['TOTAL AMOUNT', M(o.total)], ['Amount paid', M(pay.amount)]);
    if (pay.method === 'Cash') totals.push(['Cash tendered', M(pay.tendered)], ['Change', M(pay.change_given)]);
    totals.push(['Total paid to date', M(paidThru)], ['REMAINING BALANCE', M(Math.max(o.total - paidThru, 0))]);
    return { narrow: true, title: 'OFFICIAL RECEIPT', filename: pay.receipt_no,
      meta: [['Receipt No', pay.receipt_no], ['Order No', o.order_no], ['Customer', o.customers && o.customers.name], ['Date & time', P.date(pay.paid_at, true)], ['Payment method', pay.method + (pay.reference ? ' (' + pay.reference + ')' : '')]],
      head: ['Item', 'Qty', 'Unit', 'Total'], body: itemRows(o.order_items), totals };
  }
  async function orderFull(id) { return P.ck(await P.sb.from('orders').select('*, customers(name,customer_no,phone), profiles(full_name), order_items(*), payments(*)').eq('id', id).single()); }
  async function invoiceDoc(id) {
    const o = await orderFull(id); const totals = [['Subtotal', M(o.subtotal)]];
    if (+o.discount) totals.push(['Discount', M(-o.discount)]); if (+o.rush_fee) totals.push(['Rush fee', M(o.rush_fee)]);
    totals.push(['TOTAL', M(o.total)], ['Amount paid', M(o.amount_paid)], ['BALANCE DUE', M(o.balance)]);
    return { title: 'INVOICE', filename: 'Invoice-' + o.order_no, meta: [['Order No', o.order_no], ['Customer', o.customers.name], ['Order date', P.date(o.order_date)], ['Expected', P.date(o.expected_date)], ['Status', o.status], ['Payment status', o.payment_status]], head: ['Item', 'Qty', 'Unit', 'Total'], body: itemRows(o.order_items), totals };
  }
  async function jobDoc(id) {
    const o = await orderFull(id);
    return { title: 'JOB ORDER SLIP', filename: 'JobOrder-' + o.order_no, footer: '', notes: [o.special_instructions].concat(o.order_items.map(i => i.instructions)).filter(Boolean).join(' | '),
      meta: [['Order No', o.order_no], ['Customer', o.customers.name + (o.customers.phone ? ' / ' + o.customers.phone : '')], ['Order date', P.date(o.order_date, true)], ['Due date', P.date(o.expected_date)], ['Assigned to', o.profiles && o.profiles.full_name || 'Unassigned']],
      head: ['Service', 'Specifications', 'Pages', 'Copies', 'Rush'], body: o.order_items.map(i => [i.service_name, spec(i), String(i.pages), String(i.copies), i.rush ? 'RUSH' : '']), totals: [] };
  }
  P.receipt = {
    show: id => { const p = receiptDoc(id); preview('Receipt', p.then(d => d), 'Receipt'); },
    invoice: id => preview('Invoice', invoiceDoc(id), 'Invoice'),
    jobOrder: id => preview('Job Order Slip', jobDoc(id), 'Job-Order-Slip')
  };
})();
