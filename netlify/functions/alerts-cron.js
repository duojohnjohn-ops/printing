// Runs automatically every 5 minutes (schedule is set in netlify.toml).
// Creates the admin alerts (delayed orders, low stock, unpaid balances); push.sql then sends them to the phones.
const { adminClient } = require('./_lib');
exports.handler = async () => {
  try {
    const { error } = await adminClient().rpc('refresh_alerts_system');
    if (error) { console.error('alerts failed:', error.message); return { statusCode: 500, body: 'error' }; }
    return { statusCode: 200, body: 'ok' };
  } catch (e) { console.error(e.message); return { statusCode: 500, body: 'error' }; }
};
