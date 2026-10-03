/**
 * middleware/auth.js
 * Verifies the JWT sent in the Authorization: Bearer <token> header.
 */

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Ma fasaxna — token maa jiro' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token been ah ama wuu dhacay' });
  }
}

// Admin-only gate (add role:'admin' to JWT payload when minting)
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Xukuumad kaliya ayaa geli karta' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };
