// Writes capacitor.config.json. The app simply opens your live Netlify site, so every site update reaches the app automatically.
const fs = require('fs');
let url = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^\s/]+/.test(url)) { console.error('SITE_URL must be your https site address, e.g. https://your-shop.netlify.app'); process.exit(1); }
fs.writeFileSync('capacitor.config.json', JSON.stringify({
  appId: 'com.mjsprinting.app',
  appName: "MJ's Printing",
  webDir: 'www',
  server: { url: url + '/pages/login.html', androidScheme: 'https' }
}, null, 2));
console.log('Config written for', url);
