// Registers the service worker and shows an "Install app" button when the browser allows it.
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  const btn = document.createElement('button');
  btn.className = 'btn primary'; btn.textContent = '⬇ Install app';
  btn.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:150;display:none;box-shadow:0 10px 30px rgba(15,23,41,.3)';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.style.display = 'inline-flex'; });
  btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; btn.style.display = 'none'; };
  window.addEventListener('appinstalled', () => { btn.style.display = 'none'; });
  // iPhone/iPad Safari has no install prompt: show a one-time hint
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios && !localStorage.getItem('psms_ios_hint')) {
    document.addEventListener('DOMContentLoaded', () => {
      const h = document.createElement('div');
      h.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:150;background:#111111;color:#fff;padding:12px 14px;border-radius:14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35)';
      h.innerHTML = 'Install this app: tap <b>Share</b> then <b>Add to Home Screen</b>. <button style="float:right;background:none;border:0;color:#fff;font-size:16px" aria-label="Close">✕</button>';
      h.querySelector('button').onclick = () => { try { localStorage.setItem('psms_ios_hint', '1'); } catch (e) {} h.remove(); };
      document.body.appendChild(h);
    });
  }
})();
