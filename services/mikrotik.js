const RouterOS = require('node-routeros');

const config = {
  host: process.env.MIKROTIK_HOST,
  port: Number(process.env.MIKROTIK_PORT) || 8728,
  user: process.env.MIKROTIK_USER,
  password: process.env.MIKROTIK_PASS,
};

const HOTSPOT_SERVER = process.env.MIKROTIK_HOTSPOT_SERVER || 'hotspot1';

async function withRouter(fn) {
  const api = new RouterOS.RouterOSAPI(config);
  await api.connect();
  try {
    return await fn(api);
  } finally {
    api.close();
  }
}

async function createHotspotUser({ username, password, profile, macAddress, limitUptime }) {
  await withRouter(async (api) => {
    const params = [
      '=name=' + username,
      '=password=' + password,
      '=profile=' + profile,
      '=server=' + HOTSPOT_SERVER,
      '=limit-uptime=' + limitUptime,
    ];
    if (macAddress) params.push('=mac-address=' + macAddress);

    await api.write('/ip/hotspot/user/add', params);
    console.log(`[MikroTik] Created hotspot user: ${username}`);
  });
}

async function removeHotspotUser(username) {
  await withRouter(async (api) => {
    const results = await api.write('/ip/hotspot/user/print', ['?name=' + username]);
    if (results.length > 0) {
      const id = results[0]['.id'];
      await api.write('/ip/hotspot/user/remove', ['=.id=' + id]);
      console.log(`[MikroTik] Removed hotspot user: ${username}`);
    }
  });
}

async function getActiveSession(username) {
  return withRouter(async (api) => {
    const results = await api.write('/ip/hotspot/active/print', ['?user=' + username]);
    return results.length > 0 ? results[0] : null;
  });
}

function hoursToUptime(hours) {
  const h = String(hours).padStart(2, '0');
  return `${h}:00:00`;
}

module.exports = { createHotspotUser, removeHotspotUser, getActiveSession, hoursToUptime };
