const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
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
      `INSERT INTO users (name, phone, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, email, created_at`,
      [name, normalizedPhone, email || null, passwordHash]
    );

    const user = rows[0];
    const token = signToken({ ...user, role: 'user' });

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
      'SELECT * FROM users WHERE phone = $1',
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
        role: 'user',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin-login', async (req, res) => {
  const { phone, password } = req.body;
  const configuredPhone = String(process.env.ADMIN_PHONE || '').replace(/\D/g, '');
  const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
  const normalizedPhone = String(phone || '').replace(/\D/g, '');

  if (!configuredPhone || !configuredPassword) {
    return res.status(503).json({ error: 'Admin access has not been configured' });
  }

  if (normalizedPhone !== configuredPhone || password !== configuredPassword) {
    return res.status(401).json({ error: 'Admin phone or password is incorrect' });
  }

  const user = {
    id: 'admin',
    name: 'SomaliNet Admin',
    phone: configuredPhone,
    role: 'admin',
  };

  res.json({ token: signToken(user), user });
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, phone, email, created_at FROM users WHERE id = $1',
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
