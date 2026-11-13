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

  P.initPush = async function () {
    if (P._pushInit) return; P._pushInit = true;
    try {
      if (!native) {
        if ('Notification' in window && Notification.permission === 'default')
          document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
        return;
      }
      const ln = plug('LocalNotifications'), pn = plug('PushNotifications');
      if (ln) {
        await ln.requestPermissions().catch(() => {});
        await ln.createChannel({ id: 'orders', name: 'Orders & alerts', description: 'New orders, payments and job updates', importance: 5, visibility: 1, vibration: true }).catch(() => {});
        ln.addListener('localNotificationActionPerformed', ev => openOrder(ev && ev.notification && ev.notification.extra && ev.notification.extra.order_id));
      }
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
        let perm = await pn.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await pn.requestPermissions();
        if (perm.receive === 'granted') await pn.register();
      }
    } catch (e) { console.warn('push init failed', e); }
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
