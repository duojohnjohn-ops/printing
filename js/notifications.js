(function () {
  const P = window.PSMS;
  P.mountBell = function (el) {
    el.innerHTML = '<button class="icon-btn" aria-label="Notifications">🔔</button><span class="cnt hidden">0</span><div class="npanel hidden"></div>';
    const cnt = el.querySelector('.cnt'), panel = el.querySelector('.npanel'); let items = [];
    async function load() {
      const { data } = await P.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
      items = data || []; const n = items.filter(i => !i.read).length;
      cnt.textContent = n > 99 ? '99+' : n; cnt.classList.toggle('hidden', !n);
      if (!panel.classList.contains('hidden')) draw();
    }
    function draw() {
      panel.innerHTML = `<div class="hd"><span>Notifications</span><a href="#" data-all class="small">Mark all read</a></div>` +
        (items.length ? items.map(i => `<div class="it ${i.read ? '' : 'unread'}" data-id="${i.id}"><b>${P.esc(i.title)}</b><span class="small">${P.esc(i.message || '')}</span><div class="muted small">${P.date(i.created_at, true)}</div></div>`).join('') : P.empty('No notifications', '🔕'));
      panel.querySelector('[data-all]').onclick = async e => { e.preventDefault(); await P.sb.from('notifications').update({ read: true }).eq('read', false); load(); };
      panel.querySelectorAll('.it').forEach(d => d.onclick = async () => {
        const n = items.find(x => x.id === d.dataset.id);
        if (!n.read) await P.sb.from('notifications').update({ read: true }).eq('id', n.id);
        panel.classList.add('hidden'); load();
        if (n.order_id && P.orderDetail) P.orderDetail(n.order_id);
      });
    }
    el.querySelector('button').onclick = e => { e.stopPropagation(); panel.classList.toggle('hidden'); if (!panel.classList.contains('hidden')) draw(); };
    document.addEventListener('click', e => { if (!el.contains(e.target)) panel.classList.add('hidden'); });
    load(); setInterval(load, 60000);
    P.refreshBell = load;
  };
})();
