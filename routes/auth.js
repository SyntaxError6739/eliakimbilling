const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { authMiddleware, csrfProtection } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      isOriginalAdmin: Boolean(user.isOriginalAdmin ?? user.is_original_admin),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function setAdminCookies(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.setHeader('Set-Cookie', [
    `somalinet_admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${secure}`,
    `somalinet_csrf=${csrfToken}; Path=/; SameSite=Lax; Max-Age=28800${secure}`,
  ]);
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, phone, password, email } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'name, phone, iyo password ayaa looga baahan yahay' });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Telefonka saxda ah ayaa loo baahan yahay' });
    }

    const existing = await query(
      'SELECT id FROM users WHERE phone = $1 OR email = $2',
      [normalizedPhone, email || null]
    );

    if (existing.rows.length) {
      return res.status(409).json({ error: 'Isticmaalaha ama emailka horay baa loo diiwaangeliyay' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await query(
      `INSERT INTO users (name, phone, email, password, role)
       VALUES ($1, $2, $3, $4, 'USER')
       RETURNING id, name, phone, email, created_at`,
      [name, normalizedPhone, email || null, passwordHash]
    );

    const user = rows[0];
    const token = signToken({ ...user, role: 'USER' });

    res.status(201).json({
      message: 'Isticmaalaha si guul leh ayaa la diiwaangeliyay',
      token,
      user: { ...user, role: 'user' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'phone iyo password ayaa looga baahan yahay' });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const { rows } = await query(
      'SELECT * FROM users WHERE phone = $1 AND role = \'USER\' AND suspended = FALSE',
      [normalizedPhone]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Isticmaalaha lama helin' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Passwordka waa khalad' });
    }

    const token = signToken({ ...user, role: 'user' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        created_at: user.created_at,
        role: 'USER',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin-login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await query(
    'SELECT id, name, phone, email, password, role, is_original_admin FROM users WHERE LOWER(email) = $1 AND role = $2 AND suspended = FALSE',
    [email, 'ADMIN']
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(password, user.password) : false;
  if (!valid) return res.status(401).json({ error: 'Admin email or password is incorrect' });

  const publicUser = { id: user.id, name: user.name, phone: user.phone, email: user.email, role: 'ADMIN', isOriginalAdmin: Boolean(user.is_original_admin) };
  setAdminCookies(res, signToken(publicUser));
  res.json({ user: publicUser });
});

router.post('/admin-logout', authMiddleware, csrfProtection, (_req, res) => {
  res.setHeader('Set-Cookie', [
    `somalinet_admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    `somalinet_csrf=; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ]);
  res.json({ message: 'Admin session ended' });
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, phone, email, role, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Isticmaalaha lama helin' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
