// Writes capacitor.config.json. The app simply opens your live Netlify site, so every site update reaches the app automatically.
const fs = require('fs');
let url = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^\s/]+/.test(url)) { console.error('SITE_URL must be your https site address, e.g. https://your-shop.netlify.app'); process.exit(1); }
// Firebase push is only switched on in the app when the GOOGLE_SERVICES_JSON secret was provided (otherwise the app would crash).
const push = !!(process.env.GOOGLE_SERVICES_JSON || '').trim();
const cfg = {
  appId: 'com.mjsprinting.app',
  appName: "MJ's Printing",
  webDir: 'www',
  server: { url: url + '/pages/login.html', androidScheme: 'https' }
};
if (push) cfg.android = { appendUserAgent: 'MJsPushApp' };
fs.writeFileSync('capacitor.config.json', JSON.stringify(cfg, null, 2));
console.log('Phone push:', push ? 'ON' : 'OFF (no GOOGLE_SERVICES_JSON secret)');
console.log('Config written for', url);
