(function () {
  const P = window.PSMS;
  const TYPES = [['sales_daily', 'Daily sales'], ['sales_weekly', 'Weekly sales'], ['sales_monthly', 'Monthly sales'], ['sales_annual', 'Annual sales'], ['orders', 'Orders'], ['customers', 'Customers'], ['inventory', 'Inventory'], ['expenses', 'Expenses'], ['profit', 'Profit'], ['unpaid', 'Unpaid balances'], ['employees', 'Employee performance']];
  const fmt = (v, t, pdf) => v == null ? '' : t === 'money' ? (pdf ? 'PHP ' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : P.money(v)) : t === 'date' ? (v ? P.date(v) : '') : String(v);
  P.register('reports', {
    title: 'Reports', icon: '📈',
    render(el) {
      const d = new Date(), first = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
      el.innerHTML = `<div class="card"><div class="grid3"><div class="fld"><label>Report</label><select class="inp" id="rt">${TYPES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div><div class="fld"><label>From</label><input class="inp" type="date" id="rf" value="${first}"></div><div class="fld"><label>To</label><input class="inp" type="date" id="rto" value="${P.today()}"></div></div><div class="actions"><button class="btn primary" id="run">Generate</button><button class="btn" id="xl" disabled>Excel</button><button class="btn" id="pdf" disabled>PDF</button><button class="btn" id="pr" disabled>Print</button></div></div><div id="out"></div>`;
      let cur = null; const q = s => el.querySelector(s);
      const matrix = (pdf) => cur.rows.map(r => cur.columns.map(c => fmt(r[c.key], c.type, pdf)));
      q('#run').onclick = e => P.run(e.target, async () => {
        P.loading(q('#out'));
        try { cur = await P.api('generate-report', { type: q('#rt').value, from: q('#rf').value, to: q('#rto').value }); } catch (er) { q('#out').innerHTML = `<div class="error">${P.esc(P.err(er))}</div>`; throw er; }
        ['xl', 'pdf', 'pr'].forEach(i => q('#' + i).disabled = false);
        q('#out').innerHTML = `<div class="card"><h3>${P.esc(cur.title)} <span class="muted small">${P.esc(cur.range)}</span></h3><div class="kv">${cur.summary.map(s => `<div><small>${P.esc(s[0])}</small><b>${P.esc(fmt(s[1], s[2]))}</b></div>`).join('')}</div></div><div id="tb"></div>`;
        P.listView(q('#tb'), { title: 'Details', empty: 'No data for this period.', load: async () => cur.rows, cols: cur.columns.map(c => ({ label: c.label, k: c.key, cls: c.type === 'money' || c.type === 'int' ? 'r' : '', fmt: r => P.esc(fmt(r[c.key], c.type)), sort: r => r[c.key] })) });
      });
      q('#xl').onclick = () => { const ws = XLSX.utils.aoa_to_sheet([cur.columns.map(c => c.label)].concat(cur.rows.map(r => cur.columns.map(c => r[c.key] == null ? '' : r[c.key])))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Report'); XLSX.writeFile(wb, cur.title.replace(/\W+/g, '-') + '.xlsx'); };
      q('#pdf').onclick = () => { const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); pdf.setFontSize(14).text(P.settings.business_name || 'Printing Shop', 14, 14); pdf.setFontSize(11).text(`${cur.title} (${cur.range})`, 14, 21); pdf.setFontSize(9).text(cur.summary.map(s => `${s[0]}: ${fmt(s[1], s[2], true)}`).join('   |   '), 14, 27); pdf.autoTable({ startY: 31, head: [cur.columns.map(c => c.label)], body: matrix(true), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 79, 156] } }); pdf.save(cur.title.replace(/\W+/g, '-') + '.pdf'); };
      q('#pr').onclick = () => P.printHtml(`<h2>${P.esc(P.settings.business_name || '')}</h2><h3>${P.esc(cur.title)} — ${P.esc(cur.range)}</h3><p>${cur.summary.map(s => P.esc(s[0] + ': ' + fmt(s[1], s[2]))).join(' &nbsp;|&nbsp; ')}</p><table><thead><tr>${cur.columns.map(c => `<th>${P.esc(c.label)}</th>`).join('')}</tr></thead><tbody>${matrix(false).map(r => `<tr>${r.map(c => `<td>${P.esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`, cur.title);
    }
  });
})();
