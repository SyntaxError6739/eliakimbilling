# SomaliNet Hotspot — Backend API

Node.js + Express backend for the SomaliNet city hotspot billing system.
Handles authentication, mobile money payments (EVC Plus / Zaad / Sahal),
and automatic MikroTik session activation.

---

## Project Structure

```
somalinet-backend/
├── server.js                  ← Express app entry point
├── package.json
├── .env.example               ← Copy to .env and fill in values
│
├── db/
│   ├── index.js               ← PostgreSQL connection pool
│   ├── schema.sql             ← Tables + seed data
│   └── migrate.js             ← Run schema against DB
│
├── middleware/
│   └── auth.js                ← JWT verification, admin gate
│
├── routes/
│   ├── auth.js                ← Register / Login
│   ├── pay.js                 ← Initiate payment + webhook
│   ├── voucher.js             ← Redeem & generate vouchers
│   ├── session.js             ← Session status / logout
│   └── admin.js               ← Admin: sessions, revenue, users
│
└── services/
    ├── mikrotik.js            ← RouterOS API (create/remove users)
    ├── payment.js             ← EVC Plus, Zaad, Sahal integrations
    └── session.js             ← Activate / deactivate sessions
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your real values
```

### 3. Set up PostgreSQL

```bash
createdb somalinet
node db/migrate.js
```

### 4. Run the server

```bash
# Development
npm run dev

# Production
npm start
```

---

## API Reference

### Auth

| Method | Endpoint              | Body                          | Auth |
| ------ | --------------------- | ----------------------------- | ---- |
| POST   | /api/auth/register    | name, phone, password, email? | No   |
| POST   | /api/auth/login       | phone, password               | No   |
| POST   | /api/auth/admin-login | phone, password               | No   |

### Admin Access

The UI's **Admin access** button uses `ADMIN_PHONE` and `ADMIN_PASSWORD` from `.env`.
The default local development credentials are:

- Phone: `0612345678`
- Password: `SomaliNetAdmin2026!`

Change both values before deployment. Admin login receives a JWT with `role: admin`,
and the existing `/api/admin/*` routes still require both a valid JWT and that admin role.
The dashboard displays today's revenue, transaction count, active sessions, and registered users.

Users can use **Sign out** to close their active hotspot session when possible and clear the local login token.

### Currency Display

Plans keep their original `price_usd` values in the database and payment provider requests.
The customer-facing UI converts those values at `1 USD = 10,000 SOS`:

| Plan      | Original price | Display price |
| --------- | -------------- | ------------- |
| Degdeg    | $0.50          | SOS 5,000     |
| Caadi     | $1.00          | SOS 10,000    |
| Maalinle  | $2.00          | SOS 20,000    |
| Toddobaad | $10.00         | SOS 100,000   |

### Payment

| Method | Endpoint         | Body                        | Auth |
| ------ | ---------------- | --------------------------- | ---- |
| GET    | /api/pay/plans   | —                           | No   |
| POST   | /api/pay/evc     | planId, phone, macAddress?  | Yes  |
| POST   | /api/pay/zaad    | planId, phone, macAddress?  | Yes  |
| POST   | /api/pay/sahal   | planId, phone, macAddress?  | Yes  |
| POST   | /api/pay/webhook | (provider callback payload) | No\* |

\*Webhook is verified via HMAC signature header `x-webhook-signature`

### Vouchers

| Method | Endpoint              | Body                     | Auth  |
| ------ | --------------------- | ------------------------ | ----- |
| POST   | /api/voucher/redeem   | code, phone, macAddress? | Yes   |
| POST   | /api/voucher/generate | planId, count            | Admin |

### Session

| Method | Endpoint            | Body      | Auth |
| ------ | ------------------- | --------- | ---- |
| GET    | /api/session/status | —         | Yes  |
| POST   | /api/session/logout | sessionId | Yes  |

### Admin

| Method | Endpoint            | Query                              | Auth  |
| ------ | ------------------- | ---------------------------------- | ----- |
| GET    | /api/admin/sessions | —                                  | Admin |
| GET    | /api/admin/revenue  | period=today\|week\|month\|alltime | Admin |
| GET    | /api/admin/users    | page=1                             | Admin |

---

## MikroTik Setup

1. Enable the hotspot server in Winbox: **IP → Hotspot → Servers → Add**
2. Create hotspot profiles matching the names in your DB:
   - `1hour` — Uptime limit: 1h
   - `3hour` — Uptime limit: 3h
   - `1day` — Uptime limit: 24h
   - `7day` — Uptime limit: 168h
3. Enable the API service: **IP → Services → api** (port 8728)
4. Restrict API access to your server's IP in the firewall

---

## Payment Provider Webhooks

Register your webhook URL with each provider:

| Provider | Webhook URL                               |
| -------- | ----------------------------------------- |
| EVC Plus | `https://your-domain.com/api/pay/webhook` |
| Zaad     | `https://your-domain.com/api/pay/webhook` |
| Sahal    | `https://your-domain.com/api/pay/webhook` |

---

## Session Auto-Expiry (Cron)

Add this to `server.js` after `connectDB()` to clean up expired sessions:

```js
const { expireOldSessions } = require("./services/session");
setInterval(expireOldSessions, 60_000); // every 60 seconds
```

---

## Production Deployment

```bash
# PM2 process manager
npm install -g pm2
pm2 start server.js --name somalinet-api
pm2 save
pm2 startup
```

Use **Nginx** as a reverse proxy with SSL (Let's Encrypt) in front of port 3000.

# corepack npm run dev

# corepack npm start

#
