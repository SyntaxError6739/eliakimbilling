/**
 * middleware/auth.js
 * Verifies the JWT sent in the Authorization: Bearer <token> header.
 */

const jwt = require('jsonwebtoken');
const { query } = require('../db');

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const csrfCookie = readCookie(req, 'somalinet_csrf');
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token is missing or invalid' });
  }
  next();
}

async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : readCookie(req, 'somalinet_admin_session');

  if (!token) return res.status(401).json({ error: 'Ma fasaxna — token maa jiro' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query('SELECT id, phone, email, name, role, suspended, is_original_admin FROM users WHERE id = $1', [req.user.userId]);
    if (!rows.length) return res.status(401).json({ error: 'Account is no longer available' });
    if (rows[0].suspended) return res.status(403).json({ error: 'Account is suspended' });
    req.user = { ...req.user, ...rows[0], userId: rows[0].id, isOriginalAdmin: rows[0].is_original_admin };
    next();
  } catch {
    return res.status(401).json({ error: 'Token been ah ama wuu dhacay' });
  }
}

// Admin-only gate (add role:'admin' to JWT payload when minting)
function adminOnly(req, res, next) {
  if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') {
    return res.status(403).json({ error: 'Xukuumad kaliya ayaa geli karta' });
  }
  next();
}

function customerOnly(req, res, next) {
  if (String(req.user?.role || '').toUpperCase() !== 'USER') {
    return res.status(403).json({ error: 'Customer access is required' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly, customerOnly, csrfProtection };
