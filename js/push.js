// Phone notifications.
//  - Android app: real push (works even when the app is closed) via Firebase, plus a system notification
//    while the app is open. Needs the Firebase setup in docs/SETUP-GUIDE.md (section 9).
//  - Without that setup the app still alerts you while it is open (checks every 15 seconds).
//  - Normal browser: shows a browser notification while the page is open (after you allow it).
(function () {
  const P = (window.PSMS = window.PSMS || { modules: {} });
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plug = n => (cap && cap.Plugins && cap.Plugins[n]) || null;
  const TOKEN_KEY = 'psms_push_token';
  const shown = new Set();
  const hash = s => (parseInt(String(s || '').replace(/-/g, '').slice(0, 8), 16) || Math.floor(Math.random() * 2e9)) & 0x7fffffff;

  // The APK build adds "MJsPushApp" to the browser id only when Firebase was set up for it.
  P.pushEnabled = native && /MJsPushApp/.test(navigator.userAgent);

  // Show a notification on the phone/computer (de-duplicated by notification id).
  P.notifyPhone = async function (n) {
    try {
      if (n.id) { if (shown.has(n.id)) return; shown.add(n.id); }
      const title = n.title || 'Notification', body = n.message || '';
      const ln = native && plug('LocalNotifications');
      if (ln) {
        await ln.schedule({ notifications: [{ id: hash(n.id), title, body, channelId: 'orders', extra: { order_id: n.order_id || '' } }] });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/assets/icons/mjs-192.png' });
      }
    } catch (e) { console.warn('notify failed', e); }
  };

  const openOrder = id => { if (id && P.orderDetail) P.orderDetail(id); };

  // ---- permission helpers -------------------------------------------------------------
  async function permStatus() {
    const ln = plug('LocalNotifications'), pn = P.pushEnabled && plug('PushNotifications');
    if (!ln && !pn) return 'unsupported';
    try {
      const r = pn ? (await pn.checkPermissions()).receive : (await ln.checkPermissions()).display;
      return r === 'granted' ? 'granted' : (r === 'denied' ? 'denied' : 'prompt');
    } catch (e) { return 'unsupported'; }
  }
  async function registerPush() {
    const pn = P.pushEnabled && plug('PushNotifications');
    if (pn) await pn.register().catch(e => console.warn('push register failed', e));
  }
  async function makeChannel() {
    const opts = { id: 'orders', name: 'Orders & alerts', description: 'New orders, payments and job updates', importance: 5, visibility: 1, vibration: true };
    const ln = plug('LocalNotifications'), pn = plug('PushNotifications');
    if (ln) await ln.createChannel(opts).catch(() => {});
    if (pn && pn.createChannel) await pn.createChannel(opts).catch(() => {});
  }
  async function askPermission() {
    const ln = plug('LocalNotifications'), pn = P.pushEnabled && plug('PushNotifications');
    if (ln) await ln.requestPermissions().catch(() => {});
    if (pn) await pn.requestPermissions().catch(() => {});
    return permStatus();
  }

  // Banner shown while phone notifications are still switched off
  let banner = null;
  function hideBanner() { if (banner) { banner.remove(); banner = null; } }
  async function showBanner() {
    if (banner || !native) return;
    const st = await permStatus();
    if (st === 'granted') return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:400;background:#111;color:#fff;padding:12px 14px;border-radius:14px;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center';
    banner.innerHTML = '<span style="flex:1">🔔 Phone notifications are OFF. Turn them on to get alerts.</span><button style="background:#fff;color:#111;border:0;border-radius:10px;padding:8px 14px;font-weight:700">Turn on</button><button aria-label="Close" style="background:none;border:0;color:#fff;font-size:18px">✕</button>';
    const [go, x] = banner.querySelectorAll('button');
    x.onclick = hideBanner;
    go.onclick = async () => {
      const cur = await permStatus();
      if (cur === 'unsupported') { alert('Please install the newest MJ\'s Printing app (download the latest APK from GitHub Releases), then open it again.'); return; }
      const res = await askPermission();
      if (res === 'granted') { hideBanner(); await registerPush(); P.toast && P.toast('Phone notifications are ON'); }
      else alert('Notifications are still off.\n\nOpen your phone Settings → Apps → MJ\'s Printing → Notifications → turn on "Allow notifications".\nThen come back to this app.');
    };
    document.body.appendChild(banner);
  }

  P.initPush = async function () {
    if (P._pushInit) return; P._pushInit = true;
    try {
      if (!native) {
        if ('Notification' in window && Notification.permission === 'default')
          document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
        return;
      }
      const ln = plug('LocalNotifications'), pn = plug('PushNotifications');
      // Create the channel FIRST so Android lists the app under notification settings
      await makeChannel();
      if (ln) ln.addListener('localNotificationActionPerformed', ev => openOrder(ev && ev.notification && ev.notification.extra && ev.notification.extra.order_id));
      if (P.pushEnabled && pn) {
        pn.addListener('registration', t => {
          P.sb.rpc('register_device_token', { p_token: t.value }).then(r => {
            if (r.error) console.warn('token save failed', r.error.message);
            else { try { localStorage.setItem(TOKEN_KEY, t.value); } catch (e) {} }
          });
        });
        pn.addListener('registrationError', e => console.warn('push registration error', e));
        // App is open: Android does not draw the push itself, so show it ourselves
        pn.addListener('pushNotificationReceived', n => {
          const d = n.data || {};
          P.notifyPhone({ id: d.notification_id, title: n.title, message: n.body, order_id: d.order_id });
          if (P.refreshBell) P.refreshBell();
        });
        // User tapped a push
        pn.addListener('pushNotificationActionPerformed', a => openOrder(a && a.notification && a.notification.data && a.notification.data.order_id));
      }
      let st = await permStatus();
      if (st === 'prompt') st = await askPermission();
      if (st === 'granted') await registerPush(); else showBanner();
      // Coming back from phone Settings after turning notifications on
      document.addEventListener('visibilitychange', async () => {
        if (document.hidden) return;
        if ((await permStatus()) === 'granted') { hideBanner(); registerPush(); } else showBanner();
      });
    } catch (e) { console.warn('push init failed', e); showBanner(); }
  };

  // Stop sending this phone's pushes to the previous user (called on sign out)
  P.pushLogout = async function () {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (t && P.sb) await Promise.race([P.sb.rpc('unregister_device_token', { p_token: t }), new Promise(r => setTimeout(r, 3000))]);
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  };
})();
