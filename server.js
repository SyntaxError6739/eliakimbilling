/**
 * SomaliNet Hotspot — Backend API Server
 * Node.js + Express
 *
 * Routes:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/pay/evc          — EVC Plus (Hormuud)
 *   POST /api/pay/zaad         — Zaad (Telesom)
 *   POST /api/pay/sahal        — Sahal (Golis)
 *   POST /api/pay/webhook      — Payment callback (all providers)
 *   POST /api/voucher/redeem
 *   GET  /api/session/status
 *   POST /api/session/logout
 *   GET  /api/admin/sessions   — Admin: active sessions
 *   GET  /api/admin/revenue    — Admin: revenue summary
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes    = require('./routes/auth');
const payRoutes     = require('./routes/pay');
const voucherRoutes = require('./routes/voucher');
const sessionRoutes = require('./routes/session');
const adminRoutes   = require('./routes/admin');
const { connectDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── Security & middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.PORTAL_ORIGIN || '*' }));
app.use(morgan('combined'));
app.use(express.json());

// Rate limiting — protect payment & auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Codsiyo badan — fadlan sug.' });
const payLimiter  = rateLimit({ windowMs: 60 * 1000,       max: 10, message: 'Codsiyo badan — fadlan sug.' });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/pay',     payLimiter,  payRoutes);
app.use('/api/voucher', payLimiter,  voucherRoutes);
app.use('/api/session',              sessionRoutes);
app.use('/api/admin',                adminRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server khalad' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => console.log(`SomaliNet API running on port ${PORT}`));
});
